import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { dailyInterest, distributePool, totalInterest } from "../src";

const completers = fc
  .uniqueArray(fc.integer({ min: 0, max: 9999 }), { minLength: 1, maxLength: 25 })
  .chain((ids) => fc.tuple(...ids.map((id) => fc.integer({ min: 1, max: 5_000_000 }).map((stake) => ({ id: "u" + id, stake })))));

describe("pool split (largest remainder)", () => {
  it("adds up to the pool to the paisa", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2_000_000_000 }), completers, (pool, cs) => {
        const r = distributePool(pool, cs);
        const sum = [...r.shares.values()].reduce((a, b) => a + b, 0);
        expect(sum).toBe(pool);
        expect(r.rollover).toBe(0);
        for (const v of r.shares.values()) expect(v).toBeGreaterThanOrEqual(0);
      }),
    );
  });
  it("is within one paisa of the exact pro-rata share", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), completers, (pool, cs) => {
        const total = cs.reduce((s, c) => s + c.stake, 0);
        const r = distributePool(pool, cs);
        for (const c of cs) {
          const exact = (pool * c.stake) / total;
          expect(Math.abs(r.shares.get(c.id)! - exact)).toBeLessThan(1);
        }
      }),
    );
  });
  it("gives the same answer whatever order people are listed in", () => {
    const cs = [{ id: "a", stake: 100 }, { id: "b", stake: 100 }, { id: "c", stake: 100 }];
    const x = distributePool(100, cs);
    const y = distributePool(100, [...cs].reverse());
    expect([...x.shares.entries()].sort()).toEqual([...y.shares.entries()].sort());
    expect([...x.shares.values()].sort()).toEqual([33, 33, 34]);
  });
  it("rolls over when nobody finished", () => {
    expect(distributePool(500, [])).toEqual({ shares: new Map(), rollover: 500 });
  });
  it("does not overflow with large numbers", () => {
    const r = distributePool(9_000_000_000_000, [{ id: "a", stake: 9_000_000_000_000 }, { id: "b", stake: 1 }]);
    expect([...r.shares.values()].reduce((a, b) => a + b, 0)).toBe(9_000_000_000_000);
  });
});

describe("simulated interest", () => {
  it("6% on 1,00,000 paise for a day is 16 paise", () => {
    expect(dailyInterest(100_000, 600)).toBe(16);
  });
  it("is zero for zero and never negative or fractional", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e12 }), fc.integer({ min: 0, max: 5000 }), (b, bps) => {
        const i = dailyInterest(b, bps);
        expect(Number.isInteger(i)).toBe(true);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThanOrEqual(b);
      }),
    );
    expect(totalInterest([0, 0], 600)).toBe(0);
  });
  it("more money earns at least as much", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e9 }), fc.integer({ min: 0, max: 1e9 }), (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(dailyInterest(lo, 600)).toBeLessThanOrEqual(dailyInterest(hi, 600));
      }),
    );
  });
});
