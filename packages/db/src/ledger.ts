import { accountKey, assertBalanced, type LedgerTx } from "@grindly/domain";
import type { Db, Queryable } from "./client";

export interface PostResult {
  applied: boolean; // false means this key was already used and nothing changed
}

async function accountId(t: Queryable, kind: string, owner: string): Promise<string> {
  // the no-op update makes RETURNING work on a conflict
  const r = await t.query<{ id: string }>(
    `INSERT INTO ledger_accounts (kind, owner) VALUES ($1, $2)
     ON CONFLICT (kind, owner) DO UPDATE SET kind = EXCLUDED.kind RETURNING id`,
    [kind, owner],
  );
  return r.rows[0]!.id;
}

// Write one ledger transaction. Safe to call twice with the same key, including at the same time.
export async function postTransaction(db: Db, tx: LedgerTx, description = ""): Promise<PostResult> {
  assertBalanced(tx);
  return db.transaction(async (t) => {
    const ins = await t.query<{ id: string }>(
      `INSERT INTO ledger_transactions (idempotency_key, description) VALUES ($1, $2)
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
      [tx.key, description],
    );
    const txId = ins.rows[0]?.id;
    if (!txId) return { applied: false };
    // fixed order so two transactions touching the same accounts cannot deadlock
    const ordered = [...tx.postings].sort((a, b) => (accountKey(a.account) < accountKey(b.account) ? -1 : 1));
    for (const p of ordered) {
      const id = await accountId(t, p.account.kind, p.account.owner);
      await t.query(`INSERT INTO ledger_entries (transaction_id, account_id, amount_paise) VALUES ($1, $2, $3)`, [txId, id, p.amount]);
    }
    return { applied: true };
  });
}

export async function balanceOf(db: Queryable, kind: string, owner: string): Promise<number> {
  const r = await db.query<{ balance_paise: string }>(`SELECT balance_paise FROM ledger_accounts WHERE kind = $1 AND owner = $2`, [kind, owner]);
  return r.rows[0] ? Number(r.rows[0].balance_paise) : 0;
}

export async function ledgerTotal(db: Queryable): Promise<number> {
  const r = await db.query<{ s: string | null }>(`SELECT COALESCE(SUM(amount_paise), 0) AS s FROM ledger_entries`);
  return Number(r.rows[0]!.s);
}
