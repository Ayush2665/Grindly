import { HOUR_MS, localDate } from "./time";
import { isWatch, type DayVerdict, type Flag, type Rejection, type StepSample } from "./types";

export const STEP_GOAL = 10_000;
export const IMPLAUSIBLE_STEPS = 100_000;
export const MAX_SAMPLE_LAG_HOURS = 36;

export interface StepsOptions {
  goal?: number;
  hasHeartRateData?: boolean; // if known and false while steps are high, flag it
  knownProductTypes?: ReadonlySet<string>; // device models seen before for this user
}

export interface StepsVerdict extends DayVerdict {
  total: number;
  counted: number; // samples that were added up
}

export function verifyStepsDay(samples: StepSample[], date: string, tz: string, opt: StepsOptions = {}): StepsVerdict {
  const goal = opt.goal ?? STEP_GOAL;
  const rejected: Rejection[] = [];
  const flags: Flag[] = [];
  const seen = new Set<string>();
  let total = 0;
  let counted = 0;

  for (const s of samples) {
    if (seen.has(s.hkUuid)) {
      rejected.push({ hkUuid: s.hkUuid, reason: "DUPLICATE" });
      continue;
    }
    seen.add(s.hkUuid);
    if (!Number.isFinite(s.count) || s.count < 0 || !Number.isInteger(s.count)) {
      rejected.push({ hkUuid: s.hkUuid, reason: "BAD_VALUE" });
      continue;
    }
    if (localDate(s.start, tz) !== date) {
      rejected.push({ hkUuid: s.hkUuid, reason: "OUTSIDE_DAY" });
      continue;
    }
    if (s.wasUserEntered) {
      rejected.push({ hkUuid: s.hkUuid, reason: "USER_ENTERED" });
      continue;
    }
    if (!isWatch(s.productType)) {
      rejected.push({ hkUuid: s.hkUuid, reason: "NOT_WATCH" });
      continue;
    }
    const lag = Date.parse(s.receivedAt) - Date.parse(s.end);
    if (lag > MAX_SAMPLE_LAG_HOURS * HOUR_MS) {
      rejected.push({ hkUuid: s.hkUuid, reason: "TOO_LATE" });
      flags.push({ code: "LATE_SAMPLE", blocking: false, detail: s.hkUuid });
      continue;
    }
    if (opt.knownProductTypes && opt.knownProductTypes.size > 0 && !opt.knownProductTypes.has(s.productType)) {
      flags.push({ code: "NEW_PRODUCT_TYPE", blocking: false, detail: s.productType });
    }
    total += s.count;
    counted += 1;
  }

  let blocked = false;
  if (total > IMPLAUSIBLE_STEPS) {
    flags.push({ code: "OVER_100K_STEPS", blocking: true, detail: String(total) });
    blocked = true;
  }
  if (opt.hasHeartRateData === false && total >= goal) {
    flags.push({ code: "STEPS_WITHOUT_HEART_RATE", blocking: true });
    blocked = true;
  }
  return { verified: total >= goal && !blocked, total, counted, rejected, flags };
}

