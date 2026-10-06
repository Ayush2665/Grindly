// Dev-only fake Watch. Builds the same raw samples the iPhone app would upload,
// including deliberately fake ones so the verification rules can be tried by hand.
import { randomUUID } from "node:crypto";
import { zonedToUtc } from "@grindly/domain";

export interface Ctx {
  date: string; // local day, YYYY-MM-DD
  tz: string;
  now: Date;
}
type Raw = Record<string, unknown>;

export interface Preset {
  id: string;
  label: string;
  group: "real" | "fake";
  hint: string;
  build(c: Ctx): Raw[];
}

const iso = (ms: number) => new Date(ms).toISOString();
const id = (p: string) => `${p}-${randomUUID()}`;

function stepChunks(c: Ctx, total: number, extra: Raw = {}): Raw[] {
  const dayStart = zonedToUtc(c.date, 0, 0, c.tz);
  const n = 3;
  const seg = 20 * 60_000;
  const per = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => ({
    kind: "steps", hkUuid: id("sim-steps"), start: iso(dayStart + i * seg), end: iso(dayStart + (i + 1) * seg),
    value: i === n - 1 ? total - per * (n - 1) : per, productType: "Watch7,3", wasUserEntered: false, ...extra,
  }));
}

function heartRate(c: Ctx): Raw[] {
  const dayStart = zonedToUtc(c.date, 0, 0, c.tz);
  return [0, 1, 2].map((i) => ({
    kind: "heart_rate", hkUuid: id("sim-hr"), start: iso(dayStart + i * 120_000), end: iso(dayStart + i * 120_000 + 60_000),
    value: 96 + i * 8, productType: "Watch7,3", wasUserEntered: false,
  }));
}

// each preset gets its own time slot so two workouts never overlap by accident
function workout(c: Ctx, minutes: number, slot = 0, extra: Raw = {}): Raw[] {
  const dayStart = zonedToUtc(c.date, 0, 0, c.tz) + 60_000 + slot * 60 * 60_000;
  return [{
    kind: "workout", hkUuid: id("sim-wk"), activityType: "traditionalStrengthTraining", start: iso(dayStart), end: iso(dayStart + minutes * 60_000),
    avgHeartRate: 118, productType: "Watch7,3", wasUserEntered: false, ...extra,
  }];
}

export const PRESETS: Preset[] = [
  { id: "steps_5000", label: "+5,000 steps", group: "real", hint: "Real Watch steps", build: (c) => stepChunks(c, 5000) },
  { id: "steps_10500", label: "10,500 steps", group: "real", hint: "Enough to pass the day", build: (c) => stepChunks(c, 10500) },
  { id: "heart_rate", label: "Heart rate", group: "real", hint: "Watch heart-rate samples", build: heartRate },
  { id: "workout_45", label: "45 min workout", group: "real", hint: "Strength training, HR 118", build: (c) => workout(c, 45) },
  { id: "workout_20", label: "20 min workout", group: "fake", hint: "Too short, should be rejected", build: (c) => workout(c, 20, 1) },
  { id: "workout_no_hr", label: "Workout, no heart rate", group: "fake", hint: "Should be rejected", build: (c) => workout(c, 45, 2, { avgHeartRate: null }) },
  { id: "spoof_phone_steps", label: "iPhone steps 12,000", group: "fake", hint: "Phone, not Watch: ignored", build: (c) => stepChunks(c, 12000, { productType: "iPhone15,2" }) },
  { id: "spoof_typed_steps", label: "Typed-in steps 12,000", group: "fake", hint: "Entered by hand: ignored", build: (c) => stepChunks(c, 12000, { wasUserEntered: true }) },
  { id: "spoof_typed_workout", label: "Typed-in workout", group: "fake", hint: "Entered by hand: ignored", build: (c) => workout(c, 45, 4, { wasUserEntered: true }) },
  { id: "spoof_120k", label: "120,000 steps", group: "fake", hint: "Implausible: blocks the day", build: (c) => stepChunks(c, 120000) },
];

export const presetById = (pid: string) => PRESETS.find((p) => p.id === pid);
