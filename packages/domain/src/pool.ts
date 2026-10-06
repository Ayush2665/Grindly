import { assertNonNegative, type Paise } from "./money";

export interface Completer {
  id: string;
  stake: Paise;
}

export interface PoolSplit {
  shares: Map<string, Paise>;
  rollover: Paise; // nobody finished, so the pool carries into the next cohort
}

// Split the pool pro-rata by stake. Whole paise only, using largest remainder so
// the shares add up to the pool exactly. Ties are broken by id so the result never changes between runs.
export function distributePool(pool: Paise, completers: Completer[]): PoolSplit {
  assertNonNegative(pool, "pool");
  const shares = new Map<string, Paise>();
  const totalStake = completers.reduce((s, c) => s + assertNonNegative(c.stake, "stake"), 0);
  if (new Set(completers.map((c) => c.id)).size !== completers.length) throw new Error("duplicate completer id");
  if (completers.length === 0 || totalStake === 0) return { shares, rollover: pool };

  const P = BigInt(pool);
  const T = BigInt(totalStake);
  const rows = completers.map((c) => {
    const num = P * BigInt(c.stake);
    return { id: c.id, base: num / T, rem: num % T };
  });
  let left = pool - rows.reduce((s, r) => s + Number(r.base), 0);
  const order = [...rows].sort((a, b) => (a.rem === b.rem ? (a.id < b.id ? -1 : 1) : a.rem > b.rem ? -1 : 1));
  for (const r of order) {
    const extra = left > 0 && r.rem > 0n ? 1 : 0;
    if (extra) left -= 1;
    shares.set(r.id, Number(r.base) + extra);
  }
  // rows with a zero remainder never get an extra paise; if some are left (cannot happen) fail loudly
  if (left !== 0) throw new Error("pool did not split exactly");
  return { shares, rollover: 0 };
}
