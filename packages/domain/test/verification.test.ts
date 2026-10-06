import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { addDays, isValidTimezone, localDate, settleAt, verifyStepsDay, verifyWorkoutDay, zonedToUtc, type StepSample, type WorkoutSample } from "../src";

const TZ = "Asia/Kolkata";
const DAY = "2026-10-06";

const step = (o: Partial<StepSample> = {}): StepSample => ({
  hkUuid: "s" + Math.random().toString(36).slice(2),
  start: "2026-10-06T04:00:00Z", end: "2026-10-06T05:00:00Z",
  count: 5000, productType: "Watch7,3", wasUserEntered: false,
  receivedAt: "2026-10-06T06:00:00Z", ...o,
});
const workout = (o: Partial<WorkoutSample> = {}): WorkoutSample => ({
  hkUuid: "w" + Math.random().toString(36).slice(2),
  activityType: "traditionalStrengthTraining",
  start: "2026-10-06T02:00:00Z", end: "2026-10-06T02:45:00Z",
  avgHeartRate: 120, productType: "Watch7,3", wasUserEntered: false,
  receivedAt: "2026-10-06T03:00:00Z", ...o,
});

describe("steps day", () => {
  it("counts Watch steps up to the goal", () => {
    const v = verifyStepsDay([step({ count: 6000 }), step({ count: 4000 })], DAY, TZ);
    expect(v).toMatchObject({ verified: true, total: 10000, counted: 2 });
  });
  it("9,999 is not enough", () => {
    expect(verifyStepsDay([step({ count: 9999 })], DAY, TZ).verified).toBe(false);
  });

  describe("spoofed or wrong-source samples", () => {
    it("ignores iPhone steps", () => {
      const v = verifyStepsDay([step({ count: 12000, productType: "iPhone15,2" })], DAY, TZ);
      expect(v.verified).toBe(false);
      expect(v.rejected[0]?.reason).toBe("NOT_WATCH");
    });
    it("ignores typed-in steps even from a Watch product type", () => {
      const v = verifyStepsDay([step({ count: 12000, wasUserEntered: true })], DAY, TZ);
      expect(v.verified).toBe(false);
      expect(v.rejected[0]?.reason).toBe("USER_ENTERED");
    });
    it("ignores a third-party app writing as a phone", () => {
      expect(verifyStepsDay([step({ count: 20000, productType: "iPad13,1" })], DAY, TZ).total).toBe(0);
    });
    it("counts a repeated upload once", () => {
      const s = step({ hkUuid: "same", count: 6000 });
      const v = verifyStepsDay([s, { ...s }], DAY, TZ);
      expect(v.total).toBe(6000);
      expect(v.rejected.map((r) => r.reason)).toEqual(["DUPLICATE"]);
    });
    it("blocks an absurd day over 100,000 steps", () => {
      const v = verifyStepsDay([step({ count: 120000 })], DAY, TZ);
      expect(v.verified).toBe(false);
      expect(v.flags.some((f) => f.code === "OVER_100K_STEPS" && f.blocking)).toBe(true);
    });
    it("rejects samples uploaded more than 36 hours after they ended", () => {
      const v = verifyStepsDay([step({ count: 10000, receivedAt: "2026-10-08T00:00:00Z" })], DAY, TZ);
      expect(v.verified).toBe(false);
      expect(v.rejected[0]?.reason).toBe("TOO_LATE");
    });
    it("rejects negative, fractional and NaN counts", () => {
      for (const count of [-5, 1.5, NaN, Infinity]) expect(verifyStepsDay([step({ count })], DAY, TZ).rejected[0]?.reason).toBe("BAD_VALUE");
    });
    it("blocks high steps with no heart rate when heart rate is known to be missing", () => {
      expect(verifyStepsDay([step({ count: 12000 })], DAY, TZ, { hasHeartRateData: false }).verified).toBe(false);
      expect(verifyStepsDay([step({ count: 12000 })], DAY, TZ, { hasHeartRateData: true }).verified).toBe(true);
    });
    it("flags a new device model but still counts it", () => {
      const v = verifyStepsDay([step({ count: 10000, productType: "Watch8,1" })], DAY, TZ, { knownProductTypes: new Set(["Watch7,3"]) });
      expect(v.verified).toBe(true);
      expect(v.flags.map((f) => f.code)).toContain("NEW_PRODUCT_TYPE");
    });
  });

  it("assigns by the user's local day, not UTC", () => {
    // 20:00 UTC on the 5th is 01:30 on the 6th in Kolkata
    const s = step({ start: "2026-10-05T20:00:00Z", end: "2026-10-05T20:30:00Z", count: 10000, receivedAt: "2026-10-05T21:00:00Z" });
    expect(verifyStepsDay([s], "2026-10-06", TZ).verified).toBe(true);
    expect(verifyStepsDay([s], "2026-10-05", TZ).verified).toBe(false);
  });
  it("never counts more than the sum of Watch samples", () => {
    fc.assert(
      fc.property(fc.array(fc.record({ count: fc.integer({ min: 0, max: 5000 }), watch: fc.boolean(), typed: fc.boolean() }), { maxLength: 30 }), (rows) => {
        const samples = rows.map((r, i) => step({ hkUuid: `u${i}`, count: r.count, productType: r.watch ? "Watch7,3" : "iPhone15,2", wasUserEntered: r.typed }));
        const expected = rows.filter((r) => r.watch && !r.typed).reduce((s, r) => s + r.count, 0);
        expect(verifyStepsDay(samples, DAY, TZ).total).toBe(expected);
      }),
    );
  });
});

describe("workout day", () => {
  it("accepts a 45 minute Watch strength workout with heart rate", () => {
    const v = verifyWorkoutDay([workout()], DAY, TZ);
    expect(v.verified).toBe(true);
    expect(v.workoutId).not.toBeNull();
  });
  it("accepts exactly 30 minutes, rejects 29", () => {
    expect(verifyWorkoutDay([workout({ end: "2026-10-06T02:30:00Z" })], DAY, TZ).verified).toBe(true);
    expect(verifyWorkoutDay([workout({ end: "2026-10-06T02:29:00Z" })], DAY, TZ).rejected[0]?.reason).toBe("TOO_SHORT");
  });

  describe("spoofed or wrong workouts", () => {
    it("rejects a manually entered workout", () => {
      expect(verifyWorkoutDay([workout({ wasUserEntered: true })], DAY, TZ).rejected[0]?.reason).toBe("USER_ENTERED");
    });
    it("rejects an iPhone-sourced workout", () => {
      expect(verifyWorkoutDay([workout({ productType: "iPhone15,2" })], DAY, TZ).rejected[0]?.reason).toBe("NOT_WATCH");
    });
    it("rejects a workout with no heart rate", () => {
      expect(verifyWorkoutDay([workout({ avgHeartRate: null })], DAY, TZ).rejected[0]?.reason).toBe("NO_HEART_RATE");
    });
    it("rejects a workout with heart rate below 90", () => {
      expect(verifyWorkoutDay([workout({ avgHeartRate: 72 })], DAY, TZ).rejected[0]?.reason).toBe("HEART_RATE_TOO_LOW");
    });
    it("rejects a type that is not on the list", () => {
      expect(verifyWorkoutDay([workout({ activityType: "yoga" })], DAY, TZ).rejected[0]?.reason).toBe("TYPE_NOT_ALLOWED");
    });
    it("blocks the day when two workouts overlap", () => {
      const a = workout({ hkUuid: "a" });
      const b = workout({ hkUuid: "b", start: "2026-10-06T02:20:00Z", end: "2026-10-06T03:20:00Z" });
      const v = verifyWorkoutDay([a, b], DAY, TZ);
      expect(v.verified).toBe(false);
      expect(v.flags.some((f) => f.code === "OVERLAPPING_WORKOUTS")).toBe(true);
    });
    it("counts only one workout per day", () => {
      const a = workout({ hkUuid: "a" });
      const b = workout({ hkUuid: "b", start: "2026-10-06T05:00:00Z", end: "2026-10-06T06:00:00Z" });
      const v = verifyWorkoutDay([b, a], DAY, TZ);
      expect(v.verified).toBe(true);
      expect(v.workoutId).toBe("a");
    });
  });
});

describe("timezones and DST", () => {
  it("validates timezone names", () => {
    expect(isValidTimezone("Asia/Kolkata")).toBe(true);
    expect(isValidTimezone("Mars/Base")).toBe(false);
  });
  it("US spring forward: the local day is 23 hours long", () => {
    const tz = "America/New_York";
    const start = zonedToUtc("2026-03-08", 0, 0, tz);
    const end = zonedToUtc("2026-03-09", 0, 0, tz);
    expect((end - start) / 3_600_000).toBe(23);
    expect(localDate(end - 1, tz)).toBe("2026-03-08");
    expect(localDate(end, tz)).toBe("2026-03-09");
  });
  it("US fall back: the local day is 25 hours long", () => {
    const tz = "America/New_York";
    const hrs = (zonedToUtc("2026-11-02", 0, 0, tz) - zonedToUtc("2026-11-01", 0, 0, tz)) / 3_600_000;
    expect(hrs).toBe(25);
  });
  it("settles at 06:00 local the next morning", () => {
    expect(new Date(settleAt("2026-10-06", "Asia/Kolkata")).toISOString()).toBe("2026-10-07T00:30:00.000Z");
    // spring-forward night in New York: 06:00 EDT is 10:00 UTC
    expect(new Date(settleAt("2026-03-07", "America/New_York")).toISOString()).toBe("2026-03-08T10:00:00.000Z");
  });
  it("steps either side of a DST change land on the right days", () => {
    const tz = "America/New_York";
    const late = step({ start: "2026-03-08T04:30:00Z", end: "2026-03-08T05:00:00Z", count: 10000, receivedAt: "2026-03-08T06:00:00Z" });
    expect(localDate(late.start, tz)).toBe("2026-03-07"); // 11:30pm EST on the 7th
    expect(verifyStepsDay([late], "2026-03-07", tz).verified).toBe(true);
  });
  it("addDays crosses months and leap days", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
