import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openPglite } from "@grindly/db";
import { contractDays, devContract, devLogin, devSettle, devWatchSend, ingest, me, pairDevice, pairingCode, revoke, wallet, withdraw } from "../src/server/handlers";
import { resetRateLimits } from "../src/server/http";
import { setDbForTests } from "../src/server/runtime";
import { makeSessionCookie } from "../src/server/session";

const BASE = "http://localhost";
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(BASE + path, { method: "POST", headers: { "content-type": "application/json", origin: BASE, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const get = (path: string, headers: Record<string, string> = {}) => new Request(BASE + path, { headers });
const cookieOf = (r: Response) => r.headers.get("set-cookie")!.split(";")[0]!;
const j = async (r: Response) => (await r.json()) as Record<string, any>;

async function signIn(email = "ayush@example.com") {
  const r = await devLogin(post("/api/dev/login", { email, name: "Ayush" }));
  expect(r.status).toBe(200);
  return cookieOf(r);
}

// link a Watch the real way: website makes a code, the "phone" redeems it, then uploads
async function linkWatch(cookie: string) {
  const code = (await j(await pairingCode(post("/api/v1/devices/pairing-code", {}, { cookie })))).code;
  const paired = await j(await pairDevice(post("/api/v1/devices/pair", { code })));
  return { token: paired.token as string, deviceId: paired.deviceId as string };
}
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
let n = 0;
const watchSteps = (value: number, o: Record<string, unknown> = {}) => {
  const d = new Date();
  const start = new Date(d.getTime() - 3 * 3600_000);
  return { kind: "steps", hkUuid: `t-${++n}-${Math.random().toString(16).slice(2, 10)}`, start: start.toISOString(), end: new Date(start.getTime() + 600_000).toISOString(), value, productType: "Watch7,3", wasUserEntered: false, ...o };
};

beforeEach(async () => {
  // fix the clock at 13:30 in Kolkata so tests never depend on the time of day they run
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T08:00:00Z"));
  setDbForTests(await openPglite());
  resetRateLimits();
});
afterEach(() => {
  vi.useRealTimers();
  setDbForTests(null);
  vi.unstubAllEnvs();
});

describe("sessions and cookies", () => {
  it("needs sign in", async () => {
    expect((await me(get("/api/v1/me"))).status).toBe(401);
  });
  it("accepts the cookie it issued", async () => {
    const c = await signIn();
    const r = await me(get("/api/v1/me", { cookie: c }));
    expect(r.status).toBe(200);
    expect((await j(r)).user.email).toBe("ayush@example.com");
  });
  it("rejects a tampered or expired cookie", async () => {
    const c = await signIn();
    const [name, value] = c.split("=");
    expect((await me(get("/api/v1/me", { cookie: `${name}=${value!.slice(0, -2)}xx` }))).status).toBe(401);
    expect((await me(get("/api/v1/me", { cookie: `${name}=garbage` }))).status).toBe(401);
    const old = makeSessionCookie("00000000-0000-0000-0000-000000000000", Date.now() - 8 * 24 * 3600_000).split(";")[0]!;
    expect((await me(get("/api/v1/me", { cookie: old }))).status).toBe(401);
  });
  it("sets a safe cookie", async () => {
    const r = await devLogin(post("/api/dev/login", { email: "a@b.co", name: "A" }));
    const sc = r.headers.get("set-cookie")!;
    expect(sc).toMatch(/HttpOnly/);
    expect(sc).toMatch(/SameSite=Lax/);
  });
  it("refuses cross-site posts that use the cookie", async () => {
    const c = await signIn();
    const r = await pairingCode(post("/api/v1/devices/pairing-code", {}, { cookie: c, origin: "https://evil.example" }));
    expect(r.status).toBe(403);
  });
  it("refuses non-JSON bodies and bad logins", async () => {
    expect((await devLogin(post("/api/dev/login", "email=a", { "content-type": "text/plain" }))).status).toBe(415);
    expect((await devLogin(post("/api/dev/login", { email: "nope", name: "A" }))).status).toBe(400);
    expect((await devLogin(post("/api/dev/login", { email: "a@b.co", name: "A", admin: true }))).status).toBe(400);
  });
});

describe("linking a Watch", () => {
  it("pairing code gives a device token that can upload", async () => {
    const c = await signIn();
    const { token } = await linkWatch(c);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const r = await ingest(post("/api/v1/ingest/batch", { samples: [watchSteps(100)] }, bearer(token)));
    expect(await j(r)).toMatchObject({ accepted: 1 });
    const link = (await j(await me(get("/api/v1/me", { cookie: c })))).link;
    expect(link).toMatchObject({ linked: true, productType: "Watch7,3" });
  });
  it("a code works once and wrong codes fail", async () => {
    const c = await signIn();
    const code = (await j(await pairingCode(post("/api/v1/devices/pairing-code", {}, { cookie: c })))).code;
    expect((await pairDevice(post("/api/v1/devices/pair", { code }))).status).toBe(200);
    expect((await pairDevice(post("/api/v1/devices/pair", { code }))).status).toBe(400);
    expect((await pairDevice(post("/api/v1/devices/pair", { code: "12345" }))).status).toBe(400);
    expect((await pairDevice(post("/api/v1/devices/pair", { code: "abcdef" }))).status).toBe(400);
  });
  it("slows down code guessing", async () => {
    const codes = [];
    for (let i = 0; i < 12; i++) codes.push((await pairDevice(post("/api/v1/devices/pair", { code: "000000" }))).status);
    expect(codes.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
  });
  it("revoking a device stops its uploads", async () => {
    const c = await signIn();
    const { token, deviceId } = await linkWatch(c);
    expect((await revoke(post("/api/v1/devices/revoke", { deviceId }, { cookie: c }))).status).toBe(200);
    expect((await ingest(post("/api/v1/ingest/batch", { samples: [] }, bearer(token)))).status).toBe(401);
  });
  it("someone else cannot revoke it", async () => {
    const c = await signIn();
    const { deviceId } = await linkWatch(c);
    const other = await signIn("other@example.com");
    expect((await revoke(post("/api/v1/devices/revoke", { deviceId }, { cookie: other }))).status).toBe(404);
  });
});

describe("ingest endpoint", () => {
  it("needs a valid device token", async () => {
    expect((await ingest(post("/api/v1/ingest/batch", { samples: [] }))).status).toBe(401);
    expect((await ingest(post("/api/v1/ingest/batch", { samples: [] }, bearer("0".repeat(64))))).status).toBe(401);
    expect((await ingest(post("/api/v1/ingest/batch", { samples: [] }, { authorization: "Bearer nope" }))).status).toBe(401);
  });
  it("a website cookie is not a device token", async () => {
    const c = await signIn();
    expect((await ingest(post("/api/v1/ingest/batch", { samples: [] }, { cookie: c }))).status).toBe(401);
  });
  it("caps batch size and body size", async () => {
    const c = await signIn();
    const { token } = await linkWatch(c);
    expect((await ingest(post("/api/v1/ingest/batch", { samples: Array.from({ length: 501 }, () => 1) }, bearer(token)))).status).toBe(400);
    expect((await ingest(post("/api/v1/ingest/batch", { samples: ["x".repeat(1_100_000)] }, bearer(token)))).status).toBe(413);
    expect((await ingest(post("/api/v1/ingest/batch", "{not json", bearer(token)))).status).toBe(400);
    expect((await ingest(post("/api/v1/ingest/batch", { samples: [], extra: 1 }, bearer(token)))).status).toBe(400);
  });
  it("is rate limited per device", async () => {
    const c = await signIn();
    const { token } = await linkWatch(c);
    const out: number[] = [];
    for (let i = 0; i < 122; i++) out.push((await ingest(post("/api/v1/ingest/batch", { samples: [] }, { ...bearer(token), "x-forwarded-for": `10.0.${i % 250}.1` }))).status);
    expect(out.slice(0, 120).every((s) => s === 200)).toBe(true);
    expect(out[121]).toBe(429);
  }, 30_000);
  it("retrying the same upload is harmless", async () => {
    const c = await signIn();
    const { token } = await linkWatch(c);
    const body = { samples: [watchSteps(100), watchSteps(200)] };
    expect(await j(await ingest(post("/api/v1/ingest/batch", body, bearer(token))))).toMatchObject({ accepted: 2 });
    expect(await j(await ingest(post("/api/v1/ingest/batch", body, bearer(token))))).toMatchObject({ accepted: 0, duplicates: 2 });
  });
});

describe("whole flow: link, contract, upload, verdict", () => {
  async function ready() {
    const c = await signIn();
    const dev = await linkWatch(c);
    await ingest(post("/api/v1/ingest/batch", { samples: [watchSteps(10)] }, bearer(dev.token)));
    const k = await devContract(post("/api/dev/contract", { goal: "STEPS_10K", windowDays: 30, unitPaise: 10000 }, { cookie: c }));
    expect(k.status).toBe(200);
    return { c, dev, contractId: (await j(k)).id as string };
  }
  it("cannot start a contract without a linked Watch", async () => {
    const c = await signIn();
    const r = await devContract(post("/api/dev/contract", { goal: "STEPS_10K", windowDays: 30, unitPaise: 10000 }, { cookie: c }));
    expect(r.status).toBe(409);
  });
  it("10,000 real Watch steps verify today; the day updates as samples arrive", async () => {
    const { c, dev } = await ready();
    await ingest(post("/api/v1/ingest/batch", { samples: [watchSteps(4000)] }, bearer(dev.token)));
    let today = (await j(await me(get("/api/v1/me", { cookie: c })))).today;
    expect(today).toMatchObject({ verified: false, stepsTotal: 4010 });
    await ingest(post("/api/v1/ingest/batch", { samples: [watchSteps(6000)] }, bearer(dev.token)));
    today = (await j(await me(get("/api/v1/me", { cookie: c })))).today;
    expect(today).toMatchObject({ verified: true, stepsTotal: 10010 });
  });
  it("fake samples never verify the day", async () => {
    const { c, dev } = await ready();
    await ingest(post("/api/v1/ingest/batch", { samples: [watchSteps(50000, { productType: "iPhone15,2" }), watchSteps(50000, { wasUserEntered: true })] }, bearer(dev.token)));
    const today = (await j(await me(get("/api/v1/me", { cookie: c })))).today;
    expect(today.verified).toBe(false);
    expect(today.rejected.map((r: any) => r.reason).sort()).toEqual(["NOT_WATCH", "USER_ENTERED"]);
  });
  it("a client cannot claim a verdict", async () => {
    const { c, dev } = await ready();
    const r = await ingest(post("/api/v1/ingest/batch", { samples: [{ ...watchSteps(1), verified: true }, { kind: "day", verified: true }] }, bearer(dev.token)));
    expect(await j(r)).toMatchObject({ accepted: 0, rejected: 2 });
    expect((await j(await me(get("/api/v1/me", { cookie: c })))).today.verified).toBe(false);
  });
  it("lists days only for the owner", async () => {
    const { c, contractId } = await ready();
    await me(get("/api/v1/me", { cookie: c })); // the dashboard check creates today's row
    expect((await j(await contractDays(get(`/api/v1/contracts/${contractId}/days`, { cookie: c }), contractId))).days.length).toBeGreaterThan(0);
    const other = await signIn("other@example.com");
    expect((await j(await contractDays(get(`/api/v1/contracts/${contractId}/days`, { cookie: other }), contractId))).days).toEqual([]);
    expect((await contractDays(get("/api/v1/contracts/x/days", { cookie: c }), "x")).status).toBe(400);
  });
});

describe("simulated Watch panel", () => {
  async function linkedUser() {
    const c = await signIn();
    expect((await devWatchSend(post("/api/dev/watch", { preset: "heart_rate" }, { cookie: c }))).status).toBe(200);
    expect((await devWatchSend(post("/api/dev/watch", { preset: "steps_5000" }, { cookie: c }))).status).toBe(200);
    return c;
  }
  it("real presets pass and fake presets do not", async () => {
    const c = await linkedUser();
    await devContract(post("/api/dev/contract", { goal: "STEPS_10K", windowDays: 30, unitPaise: 10000 }, { cookie: c }));
    for (const p of ["spoof_phone_steps", "spoof_typed_steps"]) await devWatchSend(post("/api/dev/watch", { preset: p }, { cookie: c }));
    expect((await j(await me(get("/api/v1/me", { cookie: c })))).today.verified).toBe(false);
    await devWatchSend(post("/api/dev/watch", { preset: "steps_10500" }, { cookie: c }));
    expect((await j(await me(get("/api/v1/me", { cookie: c })))).today.verified).toBe(true);
  });
  it("gym presets", async () => {
    const c = await linkedUser();
    await devContract(post("/api/dev/contract", { goal: "GYM_WORKOUT", windowDays: 30, unitPaise: 10000 }, { cookie: c }));
    for (const p of ["workout_20", "workout_no_hr", "spoof_typed_workout"]) await devWatchSend(post("/api/dev/watch", { preset: p }, { cookie: c }));
    expect((await j(await me(get("/api/v1/me", { cookie: c })))).today.verified).toBe(false);
    await devWatchSend(post("/api/dev/watch", { preset: "workout_45" }, { cookie: c }));
    expect((await j(await me(get("/api/v1/me", { cookie: c })))).today.verified).toBe(true);
  });
  it("rejects unknown presets", async () => {
    const c = await signIn();
    expect((await devWatchSend(post("/api/dev/watch", { preset: "nope" }, { cookie: c }))).status).toBe(400);
  });
  it("does not exist in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "s".repeat(40));
    expect((await devLogin(post("/api/dev/login", { email: "a@b.co", name: "A" }))).status).toBe(404);
    const cookie = makeSessionCookie("11111111-1111-1111-1111-111111111111").split(";")[0]!;
    expect((await devWatchSend(post("/api/dev/watch", { preset: "steps_5000" }, { cookie }))).status).toBe(404);
    expect((await devContract(post("/api/dev/contract", { goal: "STEPS_10K", windowDays: 30, unitPaise: 10000 }, { cookie }))).status).toBe(404);
  });
});

describe("wallet and settlement", () => {
  async function paidDay() {
    const c = await signIn();
    const dev = await linkWatch(c);
    await ingest(post("/api/v1/ingest/batch", { samples: [watchSteps(10)] }, bearer(dev.token)));
    const k = await j(await devContract(post("/api/dev/contract", { goal: "STEPS_10K", windowDays: 30, unitPaise: 10000 }, { cookie: c })));
    await ingest(post("/api/v1/ingest/batch", { samples: [watchSteps(10500)] }, bearer(dev.token)));
    const s = await j(await devSettle(post("/api/dev/settle", { contractId: k.id }, { cookie: c })));
    return { c, contractId: k.id as string, settled: s.settled };
  }
  it("shows the funded stake in escrow before any day is paid", async () => {
    const c = await signIn();
    const dev = await linkWatch(c);
    await ingest(post("/api/v1/ingest/batch", { samples: [watchSteps(10)] }, bearer(dev.token)));
    await devContract(post("/api/dev/contract", { goal: "STEPS_10K", windowDays: 30, unitPaise: 10000 }, { cookie: c }));
    const w = await j(await wallet(get("/api/v1/wallet", { cookie: c })));
    expect(w).toMatchObject({ balancePaise: 0, escrowPaise: 270000 });
    expect(w.entries[0]).toMatchObject({ title: "Funded contract (test payment)", amountPaise: -270000 });
  });
  it("a verified day releases one unit to the wallet", async () => {
    const { c, settled } = await paidDay();
    expect(settled).toMatchObject({ dayIndex: 1, verified: true, releasedPaise: 10000 });
    const w = await j(await wallet(get("/api/v1/wallet", { cookie: c })));
    expect(w).toMatchObject({ balancePaise: 10000, escrowPaise: 260000 });
  });
  it("needs sign in, and one user cannot settle another user's contract", async () => {
    expect((await wallet(get("/api/v1/wallet"))).status).toBe(401);
    const { contractId } = await paidDay();
    const other = await signIn("other@example.com");
    expect((await devSettle(post("/api/dev/settle", { contractId }, { cookie: other }))).status).toBe(404);
    expect((await devSettle(post("/api/dev/settle", { contractId: "nope" }, { cookie: other }))).status).toBe(400);
  });
  it("withdraws once per key and refuses more than the balance", async () => {
    const { c } = await paidDay();
    const w1 = (amountPaise: number, idempotencyKey: string) => withdraw(post("/api/v1/wallet/withdraw", { amountPaise, idempotencyKey }, { cookie: c }));
    expect((await w1(10001, "key-aaaaaaaa")).status).toBe(409);
    expect((await w1(-5, "key-aaaaaaaa")).status).toBe(400);
    expect((await w1(1.5, "key-aaaaaaaa")).status).toBe(400);
    expect(await j(await w1(4000, "key-bbbbbbbb"))).toMatchObject({ ok: true, repeated: false });
    expect(await j(await w1(4000, "key-bbbbbbbb"))).toMatchObject({ ok: true, repeated: true });
    expect((await j(await wallet(get("/api/v1/wallet", { cookie: c })))).balancePaise).toBe(6000);
  });
  it("refuses cross-site withdrawals", async () => {
    const { c } = await paidDay();
    const r = await withdraw(post("/api/v1/wallet/withdraw", { amountPaise: 100, idempotencyKey: "key-cccccccc" }, { cookie: c, origin: "https://evil.example" }));
    expect(r.status).toBe(403);
  });
  it("the fast-forward button does not exist in production", async () => {
    const { c, contractId } = await paidDay();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "s".repeat(40));
    expect((await devSettle(post("/api/dev/settle", { contractId }, { cookie: c }))).status).toBe(404);
  });
});
