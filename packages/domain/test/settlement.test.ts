import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { MemoryLedger, LedgerError, assertBalanced, deriveTerms, planDaySettlement, remainingUnits, startProgress, stakeForUnit, type Progress, type Mode } from "../src";

function fund(l: MemoryLedger, contractId: string, stake: number) {
  l.apply({
    key: `fund:${contractId}`,
    postings: [
      { account: { kind: "gateway_clearing", owner: "-" }, amount: -stake },
      { account: { kind: "escrow", owner: contractId }, amount: stake },
    ],
  });
}

function play(mode: Mode, unit: number, W: number, days: boolean[], applyTwice = false) {
  const stake = stakeForUnit(unit, W);
  const t = deriveTerms(stake, W);
  const l = new MemoryLedger();
  fund(l, "c1", stake);
  let p: Progress = startProgress(W, t.requiredDays);
  days.forEach((dv, idx) => {
    const r = planDaySettlement({
      contractId: "c1", mode, userId: "me", unit: t.unit, cohortId: "2026-10:steps",
      ...(mode === "NO_RISK" ? { friendUserId: "friend" } : {}),
      progress: p, dayIndex: idx + 1, dayVerified: dv,
    });
    for (const tx of r.txs) {
      expect(l.apply(tx)).toBe(true);
      if (applyTwice) expect(l.apply(tx)).toBe(false);
    }
    p = r.progress;
  });
  return { l, p, t };
}

const scenario = fc
  .record({ unit: fc.integer({ min: 1, max: 50_000 }), W: fc.integer({ min: 1, max: 45 }) })
  .chain(({ unit, W }) => fc.record({ unit: fc.constant(unit), W: fc.constant(W), days: fc.array(fc.boolean(), { minLength: W, maxLength: W }) }));

describe("settlement against the ledger", () => {
  it("ledger always sums to zero and escrow ends empty", () => {
    fc.assert(
      fc.property(scenario, fc.constantFrom<Mode>("STAKE", "NO_RISK"), ({ unit, W, days }, mode) => {
        const { l, p } = play(mode, unit, W, days);
        expect(l.total()).toBe(0);
        expect(l.balance({ kind: "escrow", owner: "c1" })).toBe(remainingUnits(p) * unit);
        expect(l.balance({ kind: "escrow", owner: "c1" })).toBe(0);
      }),
    );
  });
  it("released + forfeited = stake, split exactly by units", () => {
    fc.assert(
      fc.property(scenario, ({ unit, W, days }) => {
        const { l, p, t } = play("STAKE", unit, W, days);
        expect(l.balance({ kind: "wallet", owner: "me" })).toBe(p.verified * unit);
        expect(l.balance({ kind: "pool", owner: "2026-10:steps" })).toBe(p.forfeited * unit);
        expect(p.verified + p.forfeited).toBe(t.requiredDays);
      }),
    );
  });
  it("no risk sends forfeits to the friend, not a pool", () => {
    const { l, p } = play("NO_RISK", 100, 10, [false, false, true, true, true, true, true, true, true, true]);
    expect(p.forfeited).toBe(1);
    expect(l.balance({ kind: "wallet", owner: "friend" })).toBe(100);
    expect(l.balance({ kind: "pool", owner: "2026-10:steps" })).toBe(0);
  });
  it("running every transaction twice changes nothing", () => {
    fc.assert(
      fc.property(scenario, ({ unit, W, days }) => {
        const once = play("STAKE", unit, W, days, false);
        const twice = play("STAKE", unit, W, days, true);
        expect(twice.l.balance({ kind: "wallet", owner: "me" })).toBe(once.l.balance({ kind: "wallet", owner: "me" }));
        expect(twice.l.entries.length).toBe(once.l.entries.length);
      }),
    );
  });
  it("closing an already closed day plans nothing", () => {
    const t = deriveTerms(900, 10);
    const p = { ...startProgress(10, t.requiredDays), daysClosed: 5 };
    const r = planDaySettlement({ contractId: "c", mode: "STAKE", userId: "u", unit: t.unit, cohortId: "x", progress: p, dayIndex: 3, dayVerified: true });
    expect(r.txs).toEqual([]);
    expect(r.progress).toBe(p);
  });
  it("refuses to skip a day", () => {
    const t = deriveTerms(900, 10);
    expect(() => planDaySettlement({ contractId: "c", mode: "STAKE", userId: "u", unit: t.unit, cohortId: "x", progress: startProgress(10, 9), dayIndex: 4, dayVerified: true })).toThrow();
  });
});

describe("in-memory ledger rules", () => {
  it("rejects unbalanced and one-sided transactions", () => {
    const w = { kind: "wallet", owner: "a" } as const;
    expect(() => assertBalanced({ key: "k", postings: [{ account: w, amount: 5 }] })).toThrow(LedgerError);
    expect(() => assertBalanced({ key: "k", postings: [{ account: w, amount: 5 }, { account: { kind: "escrow", owner: "e" }, amount: -4 }] })).toThrow(LedgerError);
  });
  it("blocks a wallet going negative and leaves balances untouched", () => {
    const l = new MemoryLedger();
    const tx = { key: "bad", postings: [{ account: { kind: "wallet", owner: "a" } as const, amount: -10 }, { account: { kind: "withdrawn", owner: "-" } as const, amount: 10 }] };
    expect(() => l.apply(tx)).toThrow(LedgerError);
    expect(l.total()).toBe(0);
    expect(l.entries).toHaveLength(0);
  });
  it("random transfers never leave a negative balance or a non-zero total", () => {
    const names = ["a", "b", "c"];
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.constantFrom(...names), fc.constantFrom(...names), fc.integer({ min: 1, max: 1000 })), { maxLength: 60 }), (moves) => {
        const l = new MemoryLedger();
        l.apply({ key: "seed", postings: [{ account: { kind: "gateway_clearing", owner: "-" }, amount: -3000 }, { account: { kind: "wallet", owner: "a" }, amount: 3000 }] });
        moves.forEach(([from, to, amt], i) => {
          if (from === to) return;
          try {
            l.apply({ key: `m${i}`, postings: [{ account: { kind: "wallet", owner: from }, amount: -amt }, { account: { kind: "wallet", owner: to }, amount: amt }] });
          } catch (e) {
            expect(e).toBeInstanceOf(LedgerError);
          }
        });
        expect(l.total()).toBe(0);
        for (const n of names) expect(l.balance({ kind: "wallet", owner: n })).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});
