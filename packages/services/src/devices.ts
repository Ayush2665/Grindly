import { createHash, randomBytes, randomInt } from "node:crypto";
import type { Db, Queryable } from "@grindly/db";

export const PAIRING_TTL_MS = 5 * 60_000;
export const SYNC_FRESH_MS = 24 * 3_600_000;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function audit(t: Queryable, actor: string, action: string, subject: string, details: Record<string, unknown> = {}) {
  await t.query(`INSERT INTO audit_log (actor, action, subject, details) VALUES ($1,$2,$3,$4)`, [actor, action, subject, JSON.stringify(details)]);
}

// Step 1 of linking: the website shows a 6 digit code for 5 minutes.
export async function createPairingCode(db: Db, userId: string, now = new Date()): Promise<{ code: string; expiresAt: Date }> {
  const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS);
  for (let i = 0; i < 5; i++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    // an old unused code for the same user stops working when a new one is made
    const ok = await db.transaction(async (t) => {
      await t.query(`UPDATE pairing_codes SET used_at = $2 WHERE user_id = $1 AND used_at IS NULL`, [userId, now.toISOString()]);
      const r = await t.query(`INSERT INTO pairing_codes (code, user_id, expires_at) VALUES ($1,$2,$3) ON CONFLICT (code) DO NOTHING RETURNING code`, [code, userId, expiresAt.toISOString()]);
      return r.rows.length === 1;
    });
    if (ok) return { code, expiresAt };
  }
  throw new Error("could not make a pairing code");
}

export interface PairedDevice {
  deviceId: string;
  userId: string;
  token: string; // shown once to the phone app; only its hash is stored
}

// Step 2: the iPhone app sends the code and gets a device token back. A code works once.
export async function redeemPairingCode(db: Db, code: string, now = new Date()): Promise<PairedDevice | null> {
  return db.transaction(async (t) => {
    const r = await t.query<{ user_id: string }>(
      `UPDATE pairing_codes SET used_at = $2 WHERE code = $1 AND used_at IS NULL AND expires_at > $2 RETURNING user_id`,
      [code, now.toISOString()],
    );
    const userId = r.rows[0]?.user_id;
    if (!userId) return null;
    const token = randomBytes(32).toString("hex");
    const d = await t.query<{ id: string }>(`INSERT INTO watch_devices (user_id, token_hash) VALUES ($1,$2) RETURNING id`, [userId, hashToken(token)]);
    const deviceId = d.rows[0]!.id;
    await audit(t, userId, "device.link", deviceId);
    return { deviceId, userId, token };
  });
}

export interface AuthedDevice {
  id: string;
  userId: string;
}

export async function authenticateDevice(db: Queryable, token: string): Promise<AuthedDevice | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const r = await db.query<{ id: string; user_id: string }>(`SELECT id, user_id FROM watch_devices WHERE token_hash = $1 AND revoked_at IS NULL`, [hashToken(token)]);
  const row = r.rows[0];
  return row ? { id: row.id, userId: row.user_id } : null;
}

export async function revokeDevice(db: Db, userId: string, deviceId: string, now = new Date()): Promise<boolean> {
  return db.transaction(async (t) => {
    const r = await t.query(`UPDATE watch_devices SET revoked_at = $3 WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id`, [deviceId, userId, now.toISOString()]);
    if (r.rows.length === 0) return false;
    await audit(t, userId, "device.revoke", deviceId);
    return true;
  });
}

export interface LinkStatus {
  linked: boolean; // a Watch-sourced sample has arrived
  fresh: boolean; // last sync under 24 hours ago
  deviceId: string | null;
  productType: string | null;
  lastSyncAt: string | null;
  waitingForFirstSample: boolean; // paired, but nothing from a Watch yet
}

export async function linkStatus(db: Queryable, userId: string, now = new Date()): Promise<LinkStatus> {
  const r = await db.query<{ id: string; product_type: string | null; last_seen_at: string | null; watch_samples: string }>(
    `SELECT d.id, d.product_type, d.last_seen_at,
       (SELECT COUNT(*) FROM health_samples s WHERE s.device_id = d.id AND s.product_type LIKE 'Watch%' AND NOT s.was_user_entered) AS watch_samples
     FROM watch_devices d WHERE d.user_id = $1 AND d.revoked_at IS NULL ORDER BY d.last_seen_at DESC NULLS LAST, d.created_at DESC`,
    [userId],
  );
  const linkedRow = r.rows.find((x) => Number(x.watch_samples) > 0);
  const row = linkedRow ?? r.rows[0];
  if (!row) return { linked: false, fresh: false, deviceId: null, productType: null, lastSyncAt: null, waitingForFirstSample: false };
  const last = row.last_seen_at ? new Date(row.last_seen_at) : null;
  return {
    linked: Boolean(linkedRow),
    fresh: Boolean(linkedRow && last && now.getTime() - last.getTime() < SYNC_FRESH_MS),
    deviceId: row.id,
    productType: row.product_type,
    lastSyncAt: last ? last.toISOString() : null,
    waitingForFirstSample: !linkedRow,
  };
}

export class WatchRequiredError extends Error {}

// A contract needs a linked Watch that has synced in the last 24 hours.
export async function assertWatchReady(db: Queryable, userId: string, now = new Date()): Promise<void> {
  const s = await linkStatus(db, userId, now);
  if (!s.linked) throw new WatchRequiredError("Link an Apple Watch first");
  if (!s.fresh) throw new WatchRequiredError("Your Watch has not synced in the last 24 hours");
}
