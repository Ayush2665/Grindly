import { assertNonNegative, divExact, MoneyError, type Paise } from "./money";

export type GoalType = "STEPS_10K" | "GYM_WORKOUT";
export type Mode = "STAKE" | "NO_RISK";

export interface ContractTerms {
  stake: Paise;
  windowDays: number;
  restDays: number;
  requiredDays: number;
  unit: Paise;
}

export const MIN_WINDOW_DAYS = 1;
export const MAX_WINDOW_DAYS = 90;

// 10% of the window can be rest days, rounded down. Done with integers on purpose.
export function restDaysFor(windowDays: number): number {
  return Math.floor(windowDays / 10);
}

export function deriveTerms(stake: Paise, windowDays: number): ContractTerms {
  assertNonNegative(stake, "stake");
  if (stake === 0) throw new MoneyError("stake must be more than zero");
  if (!Number.isInteger(windowDays) || windowDays < MIN_WINDOW_DAYS || windowDays > MAX_WINDOW_DAYS) {
    throw new MoneyError(`window must be ${MIN_WINDOW_DAYS}-${MAX_WINDOW_DAYS} days`);
  }
  const restDays = restDaysFor(windowDays);
  const requiredDays = windowDays - restDays;
  const unit = divExact(stake, requiredDays, "stake");
  return { stake, windowDays, restDays, requiredDays, unit };
}

// The stake that works for a chosen value per day (what the create-goal screen does).
export function stakeForUnit(unit: Paise, windowDays: number): Paise {
  const required = windowDays - restDaysFor(windowDays);
  return unit * required;
}
