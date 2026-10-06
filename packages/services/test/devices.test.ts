import { describe, expect, it } from "vitest";
import { assertWatchReady, authenticateDevice, createPairingCode, hashToken, ingestBatch, linkStatus, redeemPairingCode, revokeDevice, WatchRequiredError, ensureUser, PAIRING_TTL_MS } from "../src";
import { NOW, setup, steps } from "./helpers";
import { openPglite } from "@grindly/db";

describe("pairing and device tokens", () => {
  it("makes a 6 digit code that works once", async () => {
    const db = await openPglite();
    const u = await ensureUser(db, "a@x.com", "A");
    const { code } = await createPairingCode(db, u, NOW);
    expect(code).toMatch(/^\d{6}$/);
    const first = await redeemPairingCode(db, code, NOW);
    expect(first?.userId).toBe(u);
    expect(await redeemPairingCode(db, code, NOW)).toBeNull();
  });
  it("expires after 5 minutes", async () => {
    const db = await openPglite();
    const u = await ensureUser(db, "a@x.com", "A");
    const { code } = await createPairingCode(db, u, NOW);
    expect(await redeemPairingCode(db, code, new Date(NOW.getTime() + PAIRING_TTL_MS + 1))).toBeNull();
  });
  it("a new code cancels the old one", async () => {
    const db = await openPglite();
    const u = await ensureUser(db, "a@x.com", "A");
    const a = await createPairingCode(db, u, NOW);
    const b = await createPairingCode(db, u, NOW);
    expect(await redeemPairingCode(db, a.code, NOW)).toBeNull();
    expect(await redeemPairingCode(db, b.code, NOW)).not.toBeNull();
  });
  it("two people redeeming the same code at once: only one wins", async () => {
    const db = await openPglite();
    const u = await ensureUser(db, "a@x.com", "A");
    const { code } = await createPairingCode(db, u, NOW);
    const r = await Promise.all([1, 2, 3].map(() => redeemPairingCode(db, code, NOW)));
    expect(r.filter(Boolean)).toHaveLength(1);
  });
  it("stores only a hash of the token", async () => {
    const { db, token } = await setup();
    const rows = await db.query<{ token_hash: string }>(`SELECT token_hash FROM watch_devices`);
    expect(rows.rows[0]!.token_hash).toBe(hashToken(token));
    expect(rows.rows[0]!.token_hash).not.toContain(token);
    expect(JSON.stringify((await db.query(`SELECT * FROM audit_log`)).rows)).not.toContain(token);
  });
  it("rejects wrong, malformed and revoked tokens", async () => {
    const { db, userId, device, token } = await setup();
    expect(await authenticateDevice(db, "0".repeat(64))).toBeNull();
    expect(await authenticateDevice(db, "not-a-token")).toBeNull();
    expect(await authenticateDevice(db, token)).not.toBeNull();
    expect(await revokeDevice(db, userId, device.id, NOW)).toBe(true);
    expect(await authenticateDevice(db, token)).toBeNull();
    expect(await revokeDevice(db, userId, device.id, NOW)).toBe(false);
  });
  it("another user cannot revoke your device", async () => {
    const { db, device } = await setup();
    const other = await ensureUser(db, "evil@x.com", "E");
    expect(await revokeDevice(db, other, device.id, NOW)).toBe(false);
  });
  it("writes link and revoke to the audit log", async () => {
    const { db, userId, device } = await setup();
    await revokeDevice(db, userId, device.id, NOW);
    const a = await db.query<{ action: string }>(`SELECT action FROM audit_log ORDER BY id`);
    expect(a.rows.map((r) => r.action)).toEqual(["device.link", "device.revoke"]);
  });
});

describe("link status", () => {
  it("is not linked until a Watch sample arrives", async () => {
    const { db, userId, device } = await setup();
    expect(await linkStatus(db, userId, NOW)).toMatchObject({ linked: false, waitingForFirstSample: true });
    await ingestBatch(db, device, [steps(100, { productType: "iPhone15,2" })], NOW);
    expect((await linkStatus(db, userId, NOW)).linked).toBe(false); // phone steps do not link a Watch
    await ingestBatch(db, device, [steps(100, { wasUserEntered: true })], NOW);
    expect((await linkStatus(db, userId, NOW)).linked).toBe(false); // typed steps do not either
    await ingestBatch(db, device, [steps(100)], NOW);
    const s = await linkStatus(db, userId, NOW);
    expect(s).toMatchObject({ linked: true, fresh: true, productType: "Watch7,3" });
  });
  it("needs a sync in the last 24 hours to start a contract", async () => {
    const { db, userId, device } = await setup();
    await expect(assertWatchReady(db, userId, NOW)).rejects.toThrow(WatchRequiredError);
    await ingestBatch(db, device, [steps(100)], NOW);
    await assertWatchReady(db, userId, NOW);
    await expect(assertWatchReady(db, userId, new Date(NOW.getTime() + 25 * 3_600_000))).rejects.toThrow(/24 hours/);
  });
});
