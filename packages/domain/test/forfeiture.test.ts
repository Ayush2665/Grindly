import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { closeDay, isComplete, mustForfeit, remainingUnits, startProgress, type Progress } from "../src";

const run = (W: number, R: number, days: boolean[]) => {
  let p: Progress = startProgress(W, R);
  const steps: ReturnType<typeof closeDay>[] = [];
  for (const d of days) {
    const o = closeDay(p, d);
    steps.push(o);
    p = o.progress;
  }
  return { p, steps };
};

describe("forfeiture formula", () => {
  it("matches the plan example numbers", () => {
    expect(mustForfeit(27, 19, 30, 22)).toBe(0);
    expect(mustForfeit(18, 7, 20, 9)).toBe(0);
    expect(mustForfeit(7, 0, 7, 1)).toBe(1); // no rest days: first miss costs a unit
  });
  it("strict mode (no rest days) forfeits on every miss", () => {
    const { steps } = run(7, 7, [true, false, true, false, true, true, true]);
    expect(steps.map((s) => s.newForfeits)).toEqual([0, 1, 0, 1, 0, 0, 0]);
  });
  it("rest days are free until the goal cannot be reached", () => {
    const { steps, p } = run(10, 9, [false, true, true, true, true, true, true, true, true, true]);
    expect(steps.every((s) => s.newForfeits === 0)).toBe(true);
    expect(isComplete(p)).toBe(true);
  });
  it("a second miss in a 10 day window costs one unit", () => {
    const { p } = run(10, 9, [false, false, true, true, true, true, true, true, true, true]);
    expect(p.forfeited).toBe(1);
    expect(isComplete(p)).toBe(false);
  });
  it("cannot close more days than the window", () => {
    const { p } = run(2, 2, [true, true]);
    expect(() => closeDay(p, true)).toThrow();
  });
});

const windows = fc.integer({ min: 1, max: 60 }).chain((W) =>
  fc.record({ W: fc.constant(W), days: fc.array(fc.boolean(), { minLength: W, maxLength: W }) }),
);

describe("forfeiture properties", () => {
  it("released + forfeited + remaining = R on every day", () => {
    fc.assert(
      fc.property(windows, ({ W, days }) => {
        const R = W - Math.floor(W / 10);
        let p = startProgress(W, R);
        for (const d of days) {
          p = closeDay(p, d).progress;
          expect(p.verified + p.forfeited + remainingUnits(p)).toBe(R);
          expect(remainingUnits(p)).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });
  it("forfeits never go down and nothing is left at the end", () => {
    fc.assert(
      fc.property(windows, ({ W, days }) => {
        const R = W - Math.floor(W / 10);
        let p = startProgress(W, R);
        let last = 0;
        for (const d of days) {
          p = closeDay(p, d).progress;
          expect(p.forfeited).toBeGreaterThanOrEqual(last);
          last = p.forfeited;
        }
        expect(remainingUnits(p)).toBe(0);
      }),
    );
  });
  it("forfeits exactly what was missed beyond the rest days, whatever the order", () => {
    fc.assert(
      fc.property(windows, ({ W, days }) => {
        const R = W - Math.floor(W / 10);
        const { p } = run(W, R, days);
        const verifiedTotal = days.filter(Boolean).length;
        expect(p.forfeited).toBe(Math.max(0, R - verifiedTotal));
        expect(isComplete(p)).toBe(verifiedTotal >= R);
      }),
    );
  });
});
