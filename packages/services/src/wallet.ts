import { postTransaction, type Db, type Queryable } from "@grindly/db";

export interface WalletEntry {
  at: string;
  title: string;
  amountPaise: number; // + money to you, - money from you
}

export interface WalletSummary {
  balancePaise: number;
  escrowPaise: number;
  entries: WalletEntry[];
}

export async function walletSummary(db: Queryable, userId: string): Promise<WalletSummary> {
  const bal = await db.query<{ b: string | null }>(`SELECT balance_paise AS b FROM ledger_accounts WHERE kind = 'wallet' AND owner = $1::text`, [userId]);
  const esc = await db.query<{ s: string | null }>(
    `SELECT COALESCE(SUM(a.balance_paise), 0) AS s FROM ledger_accounts a JOIN contracts c ON a.kind = 'escrow' AND a.owner = c.id::text WHERE c.user_id = $1::uuid`, [userId]);
  const rows = await db.query<{ tx_id: string; created_at: string; description: string; kind: string; amount_paise: string }>(
    `SELECT t.id AS tx_id, t.created_at, t.description, a.kind, e.amount_paise
     FROM ledger_entries e
     JOIN ledger_transactions t ON t.id = e.transaction_id
     JOIN ledger_accounts a ON a.id = e.account_id
     WHERE (a.kind = 'wallet' AND a.owner = $1::text)
        OR (a.kind = 'escrow' AND a.owner IN (SELECT id::text FROM contracts WHERE user_id = $1::uuid))
     ORDER BY e.id DESC LIMIT 100`, [userId]);
  // one row per transaction: wallet movement if there is one, otherwise what left or arrived in escrow
  const byTx = new Map<string, { at: string; title: string; wallet: number | null; escrow: number }>();
  for (const r of rows.rows) {
    const x = byTx.get(r.tx_id) ?? { at: r.created_at, title: r.description, wallet: null, escrow: 0 };
    const amt = Number(r.amount_paise);
    if (r.kind === "wallet") x.wallet = (x.wallet ?? 0) + amt; else x.escrow += amt;
    byTx.set(r.tx_id, x);
  }
  const entries = [...byTx.values()].map((x) => ({
    at: new Date(x.at).toISOString(), title: x.title || "Ledger entry",
    amountPaise: x.wallet !== null ? x.wallet : x.escrow > 0 ? -x.escrow : x.escrow,
  })).slice(0, 30);
  return { balancePaise: Number(bal.rows[0]?.b ?? 0), escrowPaise: Number(esc.rows[0]!.s), entries };
}

export class WithdrawError extends Error {}

// Simulated payout: wallet -> withdrawn. The same key never pays twice.
export async function withdrawSimulated(db: Db, userId: string, amountPaise: number, idempotencyKey: string): Promise<{ applied: boolean }> {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new WithdrawError("amount must be a positive whole number of paise");
  // a retry with the same key is a repeat of an earlier request, not a new one
  const done = await db.query(`SELECT 1 FROM ledger_transactions WHERE idempotency_key = $1`, [`withdraw:${userId}:${idempotencyKey}`]);
  if (done.rows.length > 0) return { applied: false };
  const bal = (await walletSummary(db, userId)).balancePaise;
  if (amountPaise > bal) throw new WithdrawError("not enough balance");
  const r = await postTransaction(db, {
    key: `withdraw:${userId}:${idempotencyKey}`,
    description: "Withdrawal (simulated)",
    postings: [
      { account: { kind: "wallet", owner: userId }, amount: -amountPaise },
      { account: { kind: "withdrawn", owner: "-" }, amount: amountPaise },
    ],
  }).catch((e: Error) => {
    if (/would go negative/.test(e.message)) throw new WithdrawError("not enough balance"); // two withdrawals raced
    throw e;
  });
  if (r.applied) await db.query(`INSERT INTO audit_log (actor, action, subject, details) VALUES ($1,'money.withdraw',$1,$2)`, [userId, JSON.stringify({ amountPaise })]);
  return r;
}
