import { assertNonNegative, mulDivFloor, type Paise } from "./money";

// Simulated interest: each day earns balance * apr / 365, rounded down to a paise.
// apyBps is basis points (600 = 6%). It is only paid out to people who finish.
export function dailyInterest(balance: Paise, apyBps: number): Paise {
  assertNonNegative(balance, "balance");
  return mulDivFloor(balance, apyBps, 10_000 * 365);
}

export function totalInterest(dailyBalances: Paise[], apyBps: number): Paise {
  return dailyBalances.reduce((sum, b) => sum + dailyInterest(b, apyBps), 0);
}

export const DEFAULT_APY_BPS = 600;
