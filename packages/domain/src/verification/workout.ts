import { localDate } from "./time";
import { isWatch, type DayVerdict, type Flag, type Rejection, type WorkoutSample } from "./types";

export const ALLOWED_WORKOUTS: ReadonlySet<string> = new Set([
  "traditionalStrengthTraining",
  "functionalStrengthTraining",
  "highIntensityIntervalTraining",
  "crossTraining",
  "elliptical",
  "rowing",
  "mixedCardio",
  "coreTraining",
]);

export const MIN_WORKOUT_MINUTES = 30;
export const MIN_AVG_HEART_RATE = 90;

export interface WorkoutOptions {
  minMinutes?: number;
  hrFloor?: number;
  allowed?: ReadonlySet<string>;
}

export interface WorkoutVerdict extends DayVerdict {
  workoutId: string | null; // the one workout that counted
}

const minutes = (w: WorkoutSample) => (Date.parse(w.end) - Date.parse(w.start)) / 60_000;

export function verifyWorkoutDay(workouts: WorkoutSample[], date: string, tz: string, opt: WorkoutOptions = {}): WorkoutVerdict {
  const minMin = opt.minMinutes ?? MIN_WORKOUT_MINUTES;
  const hrFloor = opt.hrFloor ?? MIN_AVG_HEART_RATE;
  const allowed = opt.allowed ?? ALLOWED_WORKOUTS;
  const rejected: Rejection[] = [];
  const flags: Flag[] = [];
  const seen = new Set<string>();
  const passing: WorkoutSample[] = [];
  const onDay: WorkoutSample[] = [];

  for (const w of workouts) {
    if (seen.has(w.hkUuid)) {
      rejected.push({ hkUuid: w.hkUuid, reason: "DUPLICATE" });
      continue;
    }
    seen.add(w.hkUuid);
    if (localDate(w.start, tz) !== date) {
      rejected.push({ hkUuid: w.hkUuid, reason: "OUTSIDE_DAY" });
      continue;
    }
    if (w.wasUserEntered) {
      rejected.push({ hkUuid: w.hkUuid, reason: "USER_ENTERED" });
      continue;
    }
    if (!isWatch(w.productType)) {
      rejected.push({ hkUuid: w.hkUuid, reason: "NOT_WATCH" });
      continue;
    }
    onDay.push(w);
    if (!allowed.has(w.activityType)) {
      rejected.push({ hkUuid: w.hkUuid, reason: "TYPE_NOT_ALLOWED" });
      continue;
    }
    const mins = minutes(w);
    if (!(mins >= minMin)) {
      rejected.push({ hkUuid: w.hkUuid, reason: "TOO_SHORT" });
      continue;
    }
    if (w.avgHeartRate === null || !Number.isFinite(w.avgHeartRate)) {
      rejected.push({ hkUuid: w.hkUuid, reason: "NO_HEART_RATE" });
      continue;
    }
    if (w.avgHeartRate < hrFloor) {
      rejected.push({ hkUuid: w.hkUuid, reason: "HEART_RATE_TOO_LOW" });
      continue;
    }
    passing.push(w);
  }

  // two workouts at the same time on one watch is not possible
  const sorted = [...onDay].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  let overlap = false;
  for (let i = 1; i < sorted.length; i++) {
    if (Date.parse(sorted[i]!.start) < Date.parse(sorted[i - 1]!.end)) overlap = true;
  }
  if (overlap) flags.push({ code: "OVERLAPPING_WORKOUTS", blocking: true });

  const chosen = passing.length > 0 && !overlap ? [...passing].sort((a, b) => a.hkUuid.localeCompare(b.hkUuid))[0]! : null;
  return { verified: chosen !== null, workoutId: chosen?.hkUuid ?? null, rejected, flags };
}
