import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { deriveTerms, divExact, formatInr, mulDivFloor, restDaysFor, stakeForUnit } from "../src";

describe("money", () => {
  it("divides only when exact", () => {
    expect(divExact(270000, 27)).toBe(10000);
    expect(() => divExact(100, 3)).toThrow();
  });
  it("rejects fractions", () => {
    expect(() => divExact(100.5, 1)).toThrow();
  });
  it("mulDivFloor does not overflow on big values", () => {
    expect(mulDivFloor(9_000_000_000_000, 9_000_000_000_000, 9_000_000_000_000)).toBe(9_000_000_000_000);
  });
  it("formats rupees", () => {
    expect(formatInr(270000)).toBe("₹2,700");
    expect(formatInr(1260)).toBe("₹12.60");
  });
});

describe("contract terms", () => {
  it("30 days gives 3 rest days and 27 required", () => {
    const t = deriveTerms(270000, 30);
    expect(t).toMatchObject({ restDays: 3, requiredDays: 27, unit: 10000 });
  });
  it("under 10 days has no rest days", () => {
    expect(restDaysFor(9)).toBe(0);
    expect(deriveTerms(70000, 7).requiredDays).toBe(7);
  });
  it("rejects a stake that does not split evenly", () => {
    expect(() => deriveTerms(150000, 30)).toThrow();
  });
  it("rejects bad windows and zero stake", () => {
    expect(() => deriveTerms(100, 0)).toThrow();
    expect(() => deriveTerms(100, 91)).toThrow();
    expect(() => deriveTerms(0, 10)).toThrow();
  });
  it("stakeForUnit always produces a valid stake", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000 }), fc.integer({ min: 1, max: 90 }), (unit, w) => {
        const t = deriveTerms(stakeForUnit(unit, w), w);
        expect(t.unit).toBe(unit);
        expect(t.requiredDays + t.restDays).toBe(w);
      }),
    );
  });
});
