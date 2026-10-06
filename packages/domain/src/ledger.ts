import { assertPaise, type Paise } from "./money";

export type AccountKind = "gateway_clearing" | "wallet" | "escrow" | "pool" | "yield_source" | "withdrawn";

// Only the two "money comes from outside" accounts may go below zero.
export const canGoNegative = (kind: AccountKind) => kind === "gateway_clearing" || kind === "yield_source";

export interface AccountRef {
  kind: AccountKind;
  owner: string; // user id, contract id, cohort id, or "-" for singletons
}

export const accountKey = (a: AccountRef) => `${a.kind}:${a.owner}`;

export interface Posting {
  account: AccountRef;
  amount: Paise; // + adds to the account, - takes from it
}

export interface LedgerTx {
  key: string; // idempotency key; the same key is never applied twice
  description?: string; // shown in the wallet history
  postings: Posting[];
}

export class LedgerError extends Error {}

export function assertBalanced(tx: LedgerTx): void {
  if (tx.postings.length < 2) throw new LedgerError("a transaction needs at least two postings");
  let sum = 0;
  for (const p of tx.postings) {
    assertPaise(p.amount);
    if (p.amount === 0) throw new LedgerError("zero postings are not allowed");
    sum += p.amount;
  }
  if (sum !== 0) throw new LedgerError(`postings sum to ${sum}, must be 0`);
}

// In-memory ledger with the same rules the database enforces. Used by tests and by planning code.
export class MemoryLedger {
  private balances = new Map<string, number>();
  private seen = new Set<string>();
  readonly entries: Array<{ key: string; account: string; amount: Paise }> = [];

  balance(a: AccountRef): Paise {
    return this.balances.get(accountKey(a)) ?? 0;
  }

  total(): Paise {
    let s = 0;
    for (const v of this.balances.values()) s += v;
    return s;
  }

  // returns false when the key was already applied (nothing changes)
  apply(tx: LedgerTx): boolean {
    assertBalanced(tx);
    if (this.seen.has(tx.key)) return false;
    const next = new Map(this.balances);
    for (const p of tx.postings) {
      const k = accountKey(p.account);
      const v = (next.get(k) ?? 0) + p.amount;
      if (v < 0 && !canGoNegative(p.account.kind)) throw new LedgerError(`${k} would go negative (${v})`);
      next.set(k, v);
    }
    this.balances = next;
    this.seen.add(tx.key);
    for (const p of tx.postings) this.entries.push({ key: tx.key, account: accountKey(p.account), amount: p.amount });
    return true;
  }
}
