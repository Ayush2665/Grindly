// Money is always whole paise (1 rupee = 100 paise). No floats anywhere in money code.

export type Paise = number;

export class MoneyError extends Error {}

export function assertPaise(n: number, label = "amount"): Paise {
  if (!Number.isSafeInteger(n)) throw new MoneyError(`${label} must be a whole number of paise, got ${n}`);
  return n;
}

export function assertNonNegative(n: number, label = "amount"): Paise {
  assertPaise(n, label);
  if (n < 0) throw new MoneyError(`${label} must not be negative, got ${n}`);
  return n;
}

// Divide only when it comes out exact. Used for "stake / required days".
export function divExact(total: Paise, parts: number, label = "amount"): Paise {
  assertPaise(total, label);
  if (!Number.isSafeInteger(parts) || parts <= 0) throw new MoneyError(`parts must be a positive integer, got ${parts}`);
  if (total % parts !== 0) throw new MoneyError(`${label} ${total} is not divisible by ${parts}`);
  return total / parts;
}

// a * b / c rounded down, safe for big values (plain numbers could overflow the intermediate product).
export function mulDivFloor(a: Paise, b: number, c: number): Paise {
  assertNonNegative(a);
  assertNonNegative(b, "multiplier");
  if (!Number.isSafeInteger(c) || c <= 0) throw new MoneyError("divisor must be a positive integer");
  const r = (BigInt(a) * BigInt(b)) / BigInt(c);
  return Number(r);
}

export function formatInr(p: Paise): string {
  assertPaise(p);
  const sign = p < 0 ? "-" : "";
  const abs = Math.abs(p);
  const rupees = Math.floor(abs / 100);
  const rest = abs % 100;
  const r = rupees.toLocaleString("en-IN");
  return `${sign}₹${r}${rest ? "." + String(rest).padStart(2, "0") : ""}`;
}
