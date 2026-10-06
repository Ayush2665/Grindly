import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { balanceOf, ledgerTotal } from "@grindly/db";
import { addDays } from "@grindly/domain";
import { createContractSimulatedPayment, ingestBatch, settleDueDays, settleNextDay, walletSummary, withdrawSimulated, WithdrawError } from "../src";
import { NOW, setup, steps } from "./helpers";

async function contract(unit = 5000, W = 10) {
  const s = await setup();
  await ingestBatch(s.db, s.device, [steps(10)], NOW);
  const c = await createContractSimulatedPayment(s.db, { userId: s.userId, goal: "STEPS_10K", windowDays: W, unitPaise: unit, now: NOW });
  return { ...s, id: c.id, start: c.startDate };
}

// give a passing day on a given local date (uploaded the same afternoon)
async function passDay(s: Awaited<ReturnType<typeof contract>>, date: string) {
  const up = new Date(`${date}T05:00:00Z`);
  await ingestBatch(s.db, s.device, [steps(10500, { start: `${date}T03:00:00Z`, end: `${date}T04:00:00Z` })], up);
}

describe("funding", () => {
  it("moves the stake from the gateway into escrow", async () => {
    const s = await contract();
    expect(await balanceOf(s.db, "escrow", s.id)).toBe(45000); // 9 required days x 5000
    expect(await balanceOf(s.db, "gateway_clearing", "-")).toBe(-45000);
    expect(await ledgerTotal(s.db)).toBe(0);
  });
});

describe("settling days", () => {
  it("does not settle before the grace time, does after", async () => {
    const s = await contract();
    await passDay(s, s.start);
    expect(await settleNextDay(s.db, s.id, { now: new Date("2026-10-07T00:00:00Z") })).toBeNull(); // 05:30 local: too early
    const r = await settleNextDay(s.db, s.id, { now: new Date("2026-10-07T01:00:00Z") }); // 06:30 local
    expect(r).toMatchObject({ dayIndex: 1, verified: true, releasedPaise: 5000, forfeitedPaise: 0 });
    expect(await balanceOf(s.db, "wallet", s.userId)).toBe(5000);
    expect(await balanceOf(s.db, "escrow", s.id)).toBe(40000);
  });
  it("a missed day inside the rest allowance costs nothing and pays nothing", async () => {
    const s = await contract();
    const r = await settleNextDay(s.db, s.id, { force: true });
    expect(r).toMatchObject({ verified: false, releasedPaise: 0, forfeitedPaise: 0 });
    expect(await balanceOf(s.db, "escrow", s.id)).toBe(45000);
  });
  it("closes the same day only once, even when asked at the same time", async () => {
    const s = await contract();
    await passDay(s, s.start);
    const r = await Promise.all([1, 2, 3, 4, 5].map(() => settleNextDay(s.db, s.id, { force: true })));
    const done = r.filter(Boolean);
    expect(done.length).toBeGreaterThanOrEqual(1);
    const c = (await s.db.query<{ days_closed: number; verified_units: number }>(`SELECT days_closed, verified_units FROM contracts WHERE id = $1`, [s.id])).rows[0]!;
    // each call that got the lock closes the next day, so days_closed equals how many succeeded
    expect(c.days_closed).toBe(done.length);
    expect(await ledgerTotal(s.db)).toBe(0);
  });
  it("never settles a day twice for the same date", async () => {
    const s = await contract();
    await passDay(s, s.start);
    await settleNextDay(s.db, s.id, { force: true });
    const rows = await s.db.query<{ c: string }>(`SELECT COUNT(*) AS c FROM ledger_transactions WHERE idempotency_key LIKE $1`, [`contract:${s.id}:day:1:%`]);
    expect(Number(rows.rows[0]!.c)).toBe(1);
  });
  it("settleDueDays catches up on every day that is due and then does nothing", async () => {
    const s = await contract();
    const later = new Date("2026-10-10T12:00:00Z");
    const first = await settleDueDays(s.db, later);
    expect(first.map((d) => d.dayIndex)).toEqual([1, 2, 3, 4]);
    expect(await settleDueDays(s.db, later)).toEqual([]);
  });
});

describe("a whole contract", () => {
  it("any pattern of days leaves the books balanced, the contract settled and escrow empty", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.boolean(), { minLength: 10, maxLength: 10 }), async (days) => {
        const s = await contract(5000, 10);
        for (let i = 0; i < 10; i++) if (days[i]) await passDay(s, addDays(s.start, i));
        const out = await settleDueDays(s.db, new Date("2026-12-01T00:00:00Z"));
        expect(out).toHaveLength(10);
        const verified = days.filter(Boolean).length;
        const paid = Math.min(verified, 9);
        expect(await balanceOf(s.db, "wallet", s.userId)).toBe(paid * 5000);
        expect(await balanceOf(s.db, "pool", `${s.start.slice(0, 7)}:STEPS_10K`)).toBe((9 - paid) * 5000);
        expect(await balanceOf(s.db, "escrow", s.id)).toBe(0);
        expect(await ledgerTotal(s.db)).toBe(0);
        const c = (await s.db.query<{ state: string; days_closed: number }>(`SELECT state, days_closed FROM contracts WHERE id = $1`, [s.id])).rows[0]!;
        expect(c).toEqual({ state: "SETTLED", days_closed: 10 });
      }),
      { numRuns: 6 },
    );
  }, 120_000);
});

describe("wallet", () => {
  async function paid() {
    const s = await contract();
    await passDay(s, s.start);
    await settleNextDay(s.db, s.id, { force: true });
    return s;
  }
  it("shows balance, escrow and a readable history", async () => {
    const s = await paid();
    const w = await walletSummary(s.db, s.userId);
    expect(w).toMatchObject({ balancePaise: 5000, escrowPaise: 40000 });
    expect(w.entries.map((e) => [e.title, e.amountPaise])).toEqual([["Verified day 1", 5000], ["Funded contract (test payment)", -45000]]);
  });
  it("withdraws, once per key, and not more than the balance", async () => {
    const s = await paid();
    await expect(withdrawSimulated(s.db, s.userId, 5001, "k1")).rejects.toThrow(WithdrawError);
    await expect(withdrawSimulated(s.db, s.userId, 0, "k1")).rejects.toThrow(WithdrawError);
    await expect(withdrawSimulated(s.db, s.userId, 10.5, "k1")).rejects.toThrow(WithdrawError);
    expect((await withdrawSimulated(s.db, s.userId, 3000, "k2")).applied).toBe(true);
    expect((await withdrawSimulated(s.db, s.userId, 3000, "k2")).applied).toBe(false);
    expect((await walletSummary(s.db, s.userId)).balancePaise).toBe(2000);
    const audit = await s.db.query<{ action: string }>(`SELECT action FROM audit_log WHERE action = 'money.withdraw'`);
    expect(audit.rows).toHaveLength(1);
  });
  it("two withdrawals of the whole balance at once: only one goes through", async () => {
    const s = await paid();
    const r = await Promise.allSettled([withdrawSimulated(s.db, s.userId, 5000, "a"), withdrawSimulated(s.db, s.userId, 5000, "b")]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await walletSummary(s.db, s.userId)).balancePaise).toBe(0);
    expect(await ledgerTotal(s.db)).toBe(0);
  });
});
