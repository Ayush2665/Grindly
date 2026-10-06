import { z } from "zod";
import { localDate } from "@grindly/domain";
import {
  createContractSimulatedPayment, createPairingCode, ensureUser, ingestBatch, linkStatus, listContracts, listDays,
  redeemPairingCode, refreshAfterIngest, revokeDevice, verifyContractDay, WatchRequiredError, type AuthedDevice,
} from "@grindly/services";
import { requireDevice, requireUser } from "./auth";
import { clientIp, fail, json, rateLimited, readJson } from "./http";
import { devToolsEnabled, getDb } from "./runtime";
import { clearSessionCookie, makeSessionCookie } from "./session";
import { PRESETS, presetById } from "./simulatedWatch";

const MAX_INGEST_BYTES = 1_000_000; // 500 samples fit comfortably
const MAX_SMALL_BYTES = 8_000;

// ---------- website auth (dev sign-in only; Supabase Auth replaces it later) ----------
const loginBody = z.object({ email: z.string().email().max(120), name: z.string().min(1).max(60) }).strict();

export async function devLogin(req: Request): Promise<Response> {
  if (!devToolsEnabled()) return fail(404, "not found");
  if (rateLimited(`login:${clientIp(req)}`, 20, 60_000)) return fail(429, "slow down");
  const b = await readJson(req, MAX_SMALL_BYTES);
  if (!b.ok) return b.res;
  const p = loginBody.safeParse(b.body);
  if (!p.success) return fail(400, "email and name are required");
  const userId = await ensureUser(await getDb(), p.data.email, p.data.name);
  return json({ ok: true }, 200, { "set-cookie": makeSessionCookie(userId) });
}

export async function logout(_req: Request): Promise<Response> {
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
}

// ---------- what the website shows ----------
export async function me(req: Request): Promise<Response> {
  const a = requireUser(req, { mutating: false });
  if (a instanceof Response) return a;
  const db = await getDb();
  const u = (await db.query<{ id: string; email: string; display_name: string; timezone: string }>(`SELECT id, email, display_name, timezone FROM users WHERE id = $1`, [a.userId])).rows[0];
  if (!u) return fail(401, "sign in first");
  const [link, contracts] = await Promise.all([linkStatus(db, a.userId), listContracts(db, a.userId)]);
  const active = contracts.find((c) => c.state === "ACTIVE");
  let today = null;
  if (active) {
    const date = localDate(Date.now(), u.timezone);
    today = { goal: active.goal_type, ...(await verifyContractDay(db, active.id, date)) };
  }
  return json({
    user: { id: u.id, email: u.email, name: u.display_name, timezone: u.timezone },
    link, contracts, today, devTools: devToolsEnabled(),
    presets: devToolsEnabled() ? PRESETS.map(({ id, label, group, hint }) => ({ id, label, group, hint })) : [],
  });
}

export async function contractDays(req: Request, contractId: string): Promise<Response> {
  const a = requireUser(req, { mutating: false });
  if (a instanceof Response) return a;
  if (!/^[0-9a-f-]{36}$/.test(contractId)) return fail(400, "bad contract id");
  return json({ days: await listDays(await getDb(), a.userId, contractId) });
}

// ---------- linking a Watch ----------
export async function pairingCode(req: Request): Promise<Response> {
  const a = requireUser(req, { mutating: true });
  if (a instanceof Response) return a;
  if (rateLimited(`code:${a.userId}`, 10, 60_000)) return fail(429, "slow down");
  const { code, expiresAt } = await createPairingCode(await getDb(), a.userId);
  return json({ code, expiresAt: expiresAt.toISOString() });
}

const pairBody = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();

// Called by the iPhone app. No cookie. Guessing 6 digits is slowed by a tight per-IP limit.
export async function pairDevice(req: Request): Promise<Response> {
  if (rateLimited(`pair:${clientIp(req)}`, 10, 60_000)) return fail(429, "too many attempts");
  const b = await readJson(req, MAX_SMALL_BYTES);
  if (!b.ok) return b.res;
  const p = pairBody.safeParse(b.body);
  if (!p.success) return fail(400, "code must be 6 digits");
  const r = await redeemPairingCode(await getDb(), p.data.code);
  if (!r) return fail(400, "code is wrong, used or expired");
  return json({ deviceId: r.deviceId, token: r.token });
}

const revokeBody = z.object({ deviceId: z.string().uuid() }).strict();

export async function revoke(req: Request): Promise<Response> {
  const a = requireUser(req, { mutating: true });
  if (a instanceof Response) return a;
  const b = await readJson(req, MAX_SMALL_BYTES);
  if (!b.ok) return b.res;
  const p = revokeBody.safeParse(b.body);
  if (!p.success) return fail(400, "bad device id");
  return (await revokeDevice(await getDb(), a.userId, p.data.deviceId)) ? json({ ok: true }) : fail(404, "device not found");
}

// ---------- the iPhone app uploads raw samples ----------
export async function ingest(req: Request): Promise<Response> {
  const db = await getDb();
  const dev = await requireDevice(db, req);
  if (dev instanceof Response) return dev;
  if (rateLimited(`ingest:${dev.id}`, 120, 60_000) || rateLimited(`ingest-ip:${clientIp(req)}`, 300, 60_000)) return fail(429, "too many uploads, retry later");
  const b = await readJson(req, MAX_INGEST_BYTES);
  if (!b.ok) return b.res;
  const env = z.object({ samples: z.array(z.unknown()).max(500) }).strict().safeParse(b.body);
  if (!env.success) return fail(400, "send { samples: [...] } with at most 500 samples");
  return json(await runIngest(dev, env.data.samples));
}

async function runIngest(dev: AuthedDevice, samples: unknown[]) {
  const db = await getDb();
  const result = await ingestBatch(db, dev, samples);
  const starts = samples.flatMap((s, i) => (result.results[i]?.status === "accepted" && typeof (s as { start?: unknown })?.start === "string" ? [(s as { start: string }).start] : []));
  await refreshAfterIngest(db, dev.userId, starts);
  return result;
}

// ---------- dev tools: simulated Watch and test contract ----------
async function simulatedDevice(userId: string): Promise<AuthedDevice> {
  const db = await getDb();
  // a token hash that is not 64 hex characters can never be used to sign in as this device
  const r = await db.query<{ id: string }>(
    `INSERT INTO watch_devices (user_id, token_hash) VALUES ($1, $2) ON CONFLICT (token_hash) DO UPDATE SET revoked_at = NULL RETURNING id`,
    [userId, `simulated:${userId}`]);
  return { id: r.rows[0]!.id, userId };
}

const sendBody = z.object({ preset: z.string().max(40) }).strict();

export async function devWatchSend(req: Request): Promise<Response> {
  if (!devToolsEnabled()) return fail(404, "not found");
  const a = requireUser(req, { mutating: true });
  if (a instanceof Response) return a;
  const b = await readJson(req, MAX_SMALL_BYTES);
  if (!b.ok) return b.res;
  const p = sendBody.safeParse(b.body);
  const preset = p.success ? presetById(p.data.preset) : undefined;
  if (!preset) return fail(400, "unknown preset");
  const db = await getDb();
  const tz = (await db.query<{ timezone: string }>(`SELECT timezone FROM users WHERE id = $1`, [a.userId])).rows[0]!.timezone;
  const now = new Date();
  const samples = preset.build({ date: localDate(now.getTime(), tz), tz, now });
  return json({ preset: preset.id, ...(await runIngest(await simulatedDevice(a.userId), samples)) });
}

const contractBody = z.object({
  goal: z.enum(["STEPS_10K", "GYM_WORKOUT"]),
  windowDays: z.number().int().min(1).max(90),
  unitPaise: z.number().int().min(100).max(10_000_000),
}).strict();

export async function devContract(req: Request): Promise<Response> {
  if (!devToolsEnabled()) return fail(404, "not found");
  const a = requireUser(req, { mutating: true });
  if (a instanceof Response) return a;
  const b = await readJson(req, MAX_SMALL_BYTES);
  if (!b.ok) return b.res;
  const p = contractBody.safeParse(b.body);
  if (!p.success) return fail(400, "bad contract");
  try {
    return json(await createContractSimulatedPayment(await getDb(), { userId: a.userId, ...p.data }));
  } catch (e) {
    if (e instanceof WatchRequiredError) return fail(409, e.message);
    throw e;
  }
}
