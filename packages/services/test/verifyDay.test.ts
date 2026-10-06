import { describe, expect, it } from "vitest";
import { createContractSimulatedPayment, ingestBatch, verifyContractDay, ensureUser, createPairingCode, redeemPairingCode, authenticateDevice } from "../src";
import { NOW, hr, setup, steps, workout } from "./helpers";

async function withContract(goal: "STEPS_10K" | "GYM_WORKOUT") {
  const s = await setup();
  await ingestBatch(s.db, s.device, [steps(10)], NOW); // proves the Watch is linked
  const c = await createContractSimulatedPayment(s.db, { userId: s.userId, goal, windowDays: 30, unitPaise: 10000, now: NOW });
  return { ...s, contractId: c.id };
}
const DAY = "2026-10-06";

describe("steps contract, end to end from raw samples", () => {
  it("counts 10,000 Watch steps", async () => {
    const s = await withContract("STEPS_10K");
    await ingestBatch(s.db, s.device, [steps(6000), steps(4000)], NOW);
    const d = await verifyContractDay(s.db, s.contractId, DAY);
    expect(d).toMatchObject({ verified: true, stepsTotal: 10010 });
  });
  it("ignores iPhone and typed-in steps, whatever the total", async () => {
    const s = await withContract("STEPS_10K");
    await ingestBatch(s.db, s.device, [steps(9000), steps(50000, { productType: "iPhone15,2" }), steps(50000, { wasUserEntered: true })], NOW);
    const d = await verifyContractDay(s.db, s.contractId, DAY);
    expect(d.verified).toBe(false);
    expect(d.stepsTotal).toBe(9010);
    expect(d.rejected.map((r) => r.reason).sort()).toEqual(["NOT_WATCH", "USER_ENTERED"]);
  });
  it("blocks a day with 120,000 steps", async () => {
    const s = await withContract("STEPS_10K");
    await ingestBatch(s.db, s.device, [steps(120000)], NOW);
    const d = await verifyContractDay(s.db, s.contractId, DAY);
    expect(d.verified).toBe(false);
    expect(d.flags.map((f) => f.code)).toContain("OVER_100K_STEPS");
  });
  it("blocks high steps on a day with no heart rate when this Watch normally records it", async () => {
    const s = await withContract("STEPS_10K");
    // heart rate was recorded earlier in the week, none today
    await ingestBatch(s.db, s.device, [hr({ start: "2026-10-04T03:00:00Z", end: "2026-10-04T03:01:00Z" }), steps(12000)], NOW);
    const d = await verifyContractDay(s.db, s.contractId, DAY);
    expect(d.verified).toBe(false);
    expect(d.flags.map((f) => f.code)).toContain("STEPS_WITHOUT_HEART_RATE");
  });
  it("uses the user's local day, not UTC", async () => {
    const s = await withContract("STEPS_10K");
    // 20:00 UTC on the 5th is 01:30 on the 6th in Kolkata
    await ingestBatch(s.db, s.device, [steps(10000, { start: "2026-10-05T20:00:00Z", end: "2026-10-05T20:30:00Z" })], NOW);
    expect((await verifyContractDay(s.db, s.contractId, "2026-10-06")).verified).toBe(true);
    expect((await verifyContractDay(s.db, s.contractId, "2026-10-05")).verified).toBe(false);
  });
  it("re-checking changes nothing, and picks up newly synced samples", async () => {
    const s = await withContract("STEPS_10K");
    await ingestBatch(s.db, s.device, [steps(5000)], NOW);
    expect((await verifyContractDay(s.db, s.contractId, DAY)).verified).toBe(false);
    expect((await verifyContractDay(s.db, s.contractId, DAY)).verified).toBe(false);
    await ingestBatch(s.db, s.device, [steps(5000)], NOW);
    expect((await verifyContractDay(s.db, s.contractId, DAY)).verified).toBe(true);
    const n = await s.db.query<{ c: string }>(`SELECT COUNT(*) AS c FROM contract_days`);
    expect(Number(n.rows[0]!.c)).toBe(1);
  });
  it("never changes a day that is already settled", async () => {
    const s = await withContract("STEPS_10K");
    await ingestBatch(s.db, s.device, [steps(5000)], NOW);
    await verifyContractDay(s.db, s.contractId, DAY);
    await s.db.query(`UPDATE contract_days SET settled_at = now()`);
    await ingestBatch(s.db, s.device, [steps(9000)], NOW);
    const d = await verifyContractDay(s.db, s.contractId, DAY);
    expect(d).toMatchObject({ settled: true, verified: false, stepsTotal: 5010 });
  });
  it("does not count another user's samples", async () => {
    const s = await withContract("STEPS_10K");
    const other = await ensureUser(s.db, "friend@x.com", "F");
    const { code } = await createPairingCode(s.db, other, NOW);
    const dev = (await authenticateDevice(s.db, (await redeemPairingCode(s.db, code, NOW))!.token))!;
    await ingestBatch(s.db, dev, [steps(50000)], NOW);
    expect((await verifyContractDay(s.db, s.contractId, DAY)).stepsTotal).toBe(10);
  });
});

describe("gym contract, end to end from raw samples", () => {
  it("counts a 45 minute Watch workout with heart rate", async () => {
    const s = await withContract("GYM_WORKOUT");
    await ingestBatch(s.db, s.device, [workout()], NOW);
    const d = await verifyContractDay(s.db, s.contractId, DAY);
    expect(d.verified).toBe(true);
    expect(d.workoutId).not.toBeNull();
  });
  it("rejects typed-in, short, no heart rate, wrong type and phone workouts", async () => {
    const s = await withContract("GYM_WORKOUT");
    await ingestBatch(s.db, s.device, [
      workout({ wasUserEntered: true }),
      workout({ end: "2026-10-06T01:20:00Z" }),
      workout({ avgHeartRate: null, start: "2026-10-06T04:00:00Z", end: "2026-10-06T05:00:00Z" }),
      workout({ activityType: "yoga", start: "2026-10-06T06:00:00Z", end: "2026-10-06T07:00:00Z" }),
      workout({ productType: "iPhone15,2", start: "2026-10-06T07:00:00Z", end: "2026-10-06T07:50:00Z" }),
    ], NOW);
    const d = await verifyContractDay(s.db, s.contractId, DAY);
    expect(d.verified).toBe(false);
    expect(d.rejected.map((r) => r.reason).sort()).toEqual(["NOT_WATCH", "NO_HEART_RATE", "TOO_SHORT", "TYPE_NOT_ALLOWED", "USER_ENTERED"]);
  });
});

describe("contract creation needs a linked Watch", () => {
  it("refuses without one", async () => {
    const s = await setup();
    await expect(createContractSimulatedPayment(s.db, { userId: s.userId, goal: "STEPS_10K", windowDays: 30, unitPaise: 10000, now: NOW })).rejects.toThrow(/Link an Apple Watch/);
  });
  it("creates an ACTIVE contract with a stake that splits into whole units", async () => {
    const s = await withContract("STEPS_10K");
    const c = (await s.db.query<{ state: string; stake_paise: string; required_days: number }>(`SELECT state, stake_paise, required_days FROM contracts WHERE id = $1`, [s.contractId])).rows[0]!;
    expect(c).toMatchObject({ state: "ACTIVE", required_days: 27 });
    expect(Number(c.stake_paise)).toBe(270000);
  });
});
