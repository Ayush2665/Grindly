import { beforeEach, describe, expect, it } from "vitest";
import fc from "fast-check";
import { MemoryLedger, deriveTerms, planDaySettlement, startProgress, stakeForUnit, type LedgerTx, type Progress } from "@grindly/domain";
import { balanceOf, ledgerTotal, postTransaction } from "../src";
import { expectDbError, freshDb } from "./helpers";

type TestDb = Awaited<ReturnType<typeof freshDb>>;
let db: TestDb;
beforeEach(async () => {
  db = await freshDb();
});

const A = { kind: "wallet", owner: "alice" } as const;
const B = { kind: "wallet", owner: "bob" } as const;
const GW = { kind: "gateway_clearing", owner: "-" } as const;
const fundAlice = (key = "fund-1", amt = 5000): LedgerTx => ({ key, postings: [{ account: GW, amount: -amt }, { account: A, amount: amt }] });

describe("ledger rules in the database", () => {
  it("posts a balanced transaction and updates balances", async () => {
    expect((await postTransaction(db, fundAlice())).applied).toBe(true);
    expect(await balanceOf(db, "wallet", "alice")).toBe(5000);
    expect(await balanceOf(db, "gateway_clearing", "-")).toBe(-5000);
    expect(await ledgerTotal(db)).toBe(0);
  });

  it("rejects an unbalanced transaction at commit even if app code skips the check", async () => {
    await expectDbError(
      db.transaction(async (t) => {
        const tx = await t.query<{ id: string }>(`INSERT INTO ledger_transactions (idempotency_key) VALUES ('raw') RETURNING id`);
        const a = await t.query<{ id: string }>(`INSERT INTO ledger_accounts (kind, owner) VALUES ('gateway_clearing','-') RETURNING id`);
        const b = await t.query<{ id: string }>(`INSERT INTO ledger_accounts (kind, owner) VALUES ('wallet','x') RETURNING id`);
        await t.query(`INSERT INTO ledger_entries (transaction_id, account_id, amount_paise) VALUES ($1,$2,-100),($1,$3,90)`, [tx.rows[0]!.id, a.rows[0]!.id, b.rows[0]!.id]);
      }),
      /sums to -10, must be 0/,
    );
    expect(await ledgerTotal(db)).toBe(0);
  });

  it("rejects a single-entry transaction", async () => {
    await expectDbError(
      db.transaction(async (t) => {
        const tx = await t.query<{ id: string }>(`INSERT INTO ledger_transactions (idempotency_key) VALUES ('one') RETURNING id`);
        const a = await t.query<{ id: string }>(`INSERT INTO ledger_accounts (kind, owner) VALUES ('gateway_clearing','-') RETURNING id`);
        await t.query(`INSERT INTO ledger_entries (transaction_id, account_id, amount_paise) VALUES ($1,$2,0)`, [tx.rows[0]!.id, a.rows[0]!.id]);
      }),
      /violates check constraint|at least two/,
    );
  });

  it("applies the same key once, even when called at the same time", async () => {
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => postTransaction(db, fundAlice("same-key"))));
    expect(results.filter((r) => r.applied)).toHaveLength(1);
    expect(await balanceOf(db, "wallet", "alice")).toBe(5000);
    const n = await db.query<{ c: string }>(`SELECT COUNT(*) AS c FROM ledger_entries`);
    expect(Number(n.rows[0]!.c)).toBe(2);
  });

  it("does not let a wallet go negative, and rolls everything back", async () => {
    await postTransaction(db, fundAlice());
    const bad: LedgerTx = { key: "overdraw", postings: [{ account: A, amount: -6000 }, { account: B, amount: 6000 }] };
    await expectDbError(postTransaction(db, bad), /would go negative/);
    expect(await balanceOf(db, "wallet", "alice")).toBe(5000);
    expect(await balanceOf(db, "wallet", "bob")).toBe(0);
    // the failed key is free to use again later
    expect((await postTransaction(db, { ...bad, postings: [{ account: A, amount: -100 }, { account: B, amount: 100 }] })).applied).toBe(true);
  });

  it("lets the two outside accounts go negative", async () => {
    await postTransaction(db, fundAlice());
    expect(await balanceOf(db, "gateway_clearing", "-")).toBeLessThan(0);
  });

  it("is append only", async () => {
    await postTransaction(db, fundAlice());
    await expectDbError(db.query(`UPDATE ledger_entries SET amount_paise = 1`), /append-only/);
    await expectDbError(db.query(`DELETE FROM ledger_entries`), /append-only/);
    await expectDbError(db.query(`TRUNCATE ledger_entries`), /append-only/);
    await expectDbError(db.query(`UPDATE ledger_transactions SET description = 'x'`), /append-only/);
    await expectDbError(db.query(`DELETE FROM ledger_transactions`), /append-only/);
  });

  it("only moves balances through entries", async () => {
    await postTransaction(db, fundAlice());
    await expectDbError(db.query(`UPDATE ledger_accounts SET balance_paise = 999999 WHERE kind = 'wallet'`), /only through ledger entries/);
    await expectDbError(db.query(`UPDATE ledger_accounts SET owner = 'mallory'`), /identity is fixed|only through/);
  });

  it("allows many transactions touching the same accounts in any order", async () => {
    await postTransaction(db, fundAlice("f", 10_000));
    const moves = Array.from({ length: 10 }, (_, i) => postTransaction(db, { key: `m${i}`, postings: i % 2 ? [{ account: A, amount: -100 }, { account: B, amount: 100 }] : [{ account: B, amount: -50 }, { account: A, amount: 50 }] }));
    const r = await Promise.allSettled(moves);
    expect(r.every((x) => x.status === "fulfilled" || /negative/.test(String((x as PromiseRejectedResult).reason)))).toBe(true);
    expect(await ledgerTotal(db)).toBe(0);
  });
});

describe("database ledger matches the in-memory ledger", () => {
  const scenario = fc
    .record({ unit: fc.integer({ min: 1, max: 5000 }), W: fc.integer({ min: 1, max: 14 }) })
    .chain(({ unit, W }) => fc.record({ unit: fc.constant(unit), W: fc.constant(W), days: fc.array(fc.boolean(), { minLength: W, maxLength: W }) }));

  it("same balances after a whole contract, and replaying everything adds nothing", async () => {
    await fc.assert(
      fc.asyncProperty(scenario, async ({ unit, W, days }) => {
        const pg = await freshDb();
        const mem = new MemoryLedger();
        const stake = stakeForUnit(unit, W);
        const t = deriveTerms(stake, W);
        const fund: LedgerTx = { key: "fund", postings: [{ account: GW, amount: -stake }, { account: { kind: "escrow", owner: "c1" }, amount: stake }] };
        mem.apply(fund);
        await postTransaction(pg, fund);
        const all: LedgerTx[] = [];
        let p: Progress = startProgress(W, t.requiredDays);
        days.forEach((dv, i) => {
          const r = planDaySettlement({ contractId: "c1", mode: "STAKE", userId: "me", unit: t.unit, cohortId: "pool1", progress: p, dayIndex: i + 1, dayVerified: dv });
          all.push(...r.txs);
          p = r.progress;
        });
        for (const tx of all) {
          mem.apply(tx);
          await postTransaction(pg, tx);
        }
        for (const tx of all) expect((await postTransaction(pg, tx)).applied).toBe(false);
        for (const [kind, owner] of [["wallet", "me"], ["pool", "pool1"], ["escrow", "c1"]] as const) {
          expect(await balanceOf(pg, kind, owner)).toBe(mem.balance({ kind, owner }));
        }
        expect(await ledgerTotal(pg)).toBe(0);
      }),
      { numRuns: 15 },
    );
  }, 60_000);
});
