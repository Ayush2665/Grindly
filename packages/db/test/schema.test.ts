import { getTableConfig } from "drizzle-orm/pg-core";
import { beforeAll, describe, expect, it } from "vitest";
import { schema } from "../src";
import { expectDbError, freshDb } from "./helpers";

type TestDb = Awaited<ReturnType<typeof freshDb>>;
let db: TestDb;
beforeAll(async () => {
  db = await freshDb();
});

const uid = async (email: string) =>
  (await db.query<{ id: string }>(`INSERT INTO users (email, display_name) VALUES ($1, 'x') RETURNING id`, [email])).rows[0]!.id;

const newContract = async (userId: string, over: Record<string, unknown> = {}) => {
  const c = { goal_type: "STEPS_10K", mode: "STAKE", window_days: 30, required_days: 27, stake_paise: 270000, unit_paise: 10000, timezone: "Asia/Kolkata", ...over };
  return (
    await db.query<{ id: string }>(
      `INSERT INTO contracts (user_id, goal_type, mode, window_days, required_days, stake_paise, unit_paise, timezone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [userId, c.goal_type, c.mode, c.window_days, c.required_days, c.stake_paise, c.unit_paise, c.timezone],
    )
  ).rows[0]!.id;
};

describe("drizzle schema matches the SQL", () => {
  it("has the same tables and columns", async () => {
    const r = await db.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
    );
    const sql = new Map<string, Set<string>>();
    for (const row of r.rows) (sql.get(row.table_name) ?? sql.set(row.table_name, new Set()).get(row.table_name)!).add(row.column_name);
    const ts = Object.values(schema).map((t) => getTableConfig(t));
    expect(ts.map((t) => t.name).sort()).toEqual([...sql.keys()].sort());
    for (const t of ts) {
      const cols = t.columns.map((c) => c.name).sort();
      const want = [...sql.get(t.name)!].filter((c) => !(t.name === "ledger_accounts" && c === "allow_negative")).sort();
      expect(cols, t.name).toEqual(want);
    }
  });
});

describe("contract constraints", () => {
  it("accepts a valid contract", async () => {
    await newContract(await uid("a@x.com"));
  });
  it("rejects wrong required days (rest days are 10% of the window)", async () => {
    await expectDbError(newContract(await uid("b@x.com"), { required_days: 28, stake_paise: 280000 }), /required_matches_window/);
  });
  it("rejects a stake that is not whole units", async () => {
    await expectDbError(newContract(await uid("c@x.com"), { stake_paise: 270001 }), /stake_is_whole_units/);
  });
  it("rejects a zero stake and a 0 day window", async () => {
    await expectDbError(newContract(await uid("d@x.com"), { stake_paise: 0 }), /violates check/);
    await expectDbError(newContract(await uid("e@x.com"), { window_days: 0, required_days: 0 }), /violates check/);
  });
  it("only allows legal state changes", async () => {
    const id = await newContract(await uid("f@x.com"));
    await expectDbError(db.query(`UPDATE contracts SET state = 'ACTIVE' WHERE id = $1`, [id]), /illegal contract transition DRAFT -> ACTIVE/);
    await db.query(`UPDATE contracts SET state = 'AWAITING_PAYMENT' WHERE id = $1`, [id]);
    await db.query(`UPDATE contracts SET state = 'ACTIVE' WHERE id = $1`, [id]);
    await expectDbError(db.query(`UPDATE contracts SET state = 'CANCELLED' WHERE id = $1`, [id]), /illegal contract transition ACTIVE -> CANCELLED/);
    await db.query(`UPDATE contracts SET state = 'SETTLED' WHERE id = $1`, [id]);
    await expectDbError(db.query(`UPDATE contracts SET state = 'ACTIVE' WHERE id = $1`, [id]), /illegal contract transition/);
  });
  it("progress cannot go backwards or past the required days", async () => {
    const id = await newContract(await uid("g@x.com"));
    await db.query(`UPDATE contracts SET verified_units = 5, days_closed = 5 WHERE id = $1`, [id]);
    await expectDbError(db.query(`UPDATE contracts SET verified_units = 4 WHERE id = $1`, [id]), /go backwards/);
    await expectDbError(db.query(`UPDATE contracts SET verified_units = 28 WHERE id = $1`, [id]), /units_add_up/);
  });
});

describe("dedupe keys", () => {
  it("one health sample per hk_uuid", async () => {
    const u = await uid("h@x.com");
    const dev = (await db.query<{ id: string }>(`INSERT INTO watch_devices (user_id, token_hash) VALUES ($1, 'hash-h') RETURNING id`, [u])).rows[0]!.id;
    const ins = () =>
      db.query(`INSERT INTO health_samples (hk_uuid, device_id, user_id, kind, start_at, end_at, value, product_type, was_user_entered)
                VALUES ('hk-1', $1, $2, 'steps', now(), now(), 100, 'Watch7,3', false)`, [dev, u]);
    await ins();
    await expectDbError(ins(), /duplicate key|unique/);
  });
  it("one webhook event per event id", async () => {
    await db.query(`INSERT INTO webhook_events (event_id, event_type, payload) VALUES ('evt_1','payment.captured','{}')`);
    await expectDbError(db.query(`INSERT INTO webhook_events (event_id, event_type, payload) VALUES ('evt_1','payment.captured','{}')`), /duplicate key|unique/);
  });
  it("one payment per Razorpay order and a bad pairing code is refused", async () => {
    const u = await uid("i@x.com");
    const c = await newContract(u);
    const pay = () => db.query(`INSERT INTO payments (user_id, contract_id, razorpay_order_id, amount_paise) VALUES ($1,$2,'order_1',270000)`, [u, c]);
    await pay();
    await expectDbError(pay(), /duplicate key|unique/);
    await expectDbError(db.query(`INSERT INTO pairing_codes (code, user_id, expires_at) VALUES ('12ab56', $1, now())`, [u]), /violates check/);
  });
});

describe("audit log", () => {
  it("cannot be edited", async () => {
    await db.query(`INSERT INTO audit_log (actor, action, subject) VALUES ('system','money.move','c1')`);
    await expectDbError(db.query(`UPDATE audit_log SET actor = 'x'`), /append-only/);
    await expectDbError(db.query(`DELETE FROM audit_log`), /append-only/);
  });
});

describe("row level security", () => {
  let alice: string, bob: string, aliceContract: string, bobContract: string;
  const asUser = async <T>(id: string | null, fn: () => Promise<T>) => {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [id ?? ""]);
    await db.exec(`SET ROLE authenticated`);
    try {
      return await fn();
    } finally {
      await db.exec(`RESET ROLE`);
    }
  };
  beforeAll(async () => {
    alice = await uid("alice-rls@x.com");
    bob = await uid("bob-rls@x.com");
    aliceContract = await newContract(alice);
    bobContract = await newContract(bob);
    await db.query(`INSERT INTO ledger_accounts (kind, owner) VALUES ('wallet', $1), ('wallet', $2), ('escrow', $3), ('pool', 'p1')`, [alice, bob, bobContract]);
  });

  it("a user sees only their own contract", async () => {
    const rows = await asUser(alice, () => db.query<{ id: string }>(`SELECT id FROM contracts`));
    expect(rows.rows.map((r) => r.id)).toEqual([aliceContract]);
  });
  it("a friend can see the other half of a No Risk pair, and nothing else of theirs", async () => {
    const carol = await uid("carol-rls@x.com");
    const carolContract = await newContract(carol);
    await db.query(`UPDATE contracts SET friend_contract_id = $1 WHERE id = $2`, [aliceContract, carolContract]);
    const rows = await asUser(alice, () => db.query<{ id: string }>(`SELECT id FROM contracts ORDER BY id`));
    expect(rows.rows.map((r) => r.id).sort()).toEqual([aliceContract, carolContract].sort());
    const bobSees = await asUser(bob, () => db.query<{ id: string }>(`SELECT id FROM contracts`));
    expect(bobSees.rows.map((r) => r.id)).toEqual([bobContract]);
    await db.query(`UPDATE contracts SET friend_contract_id = NULL WHERE id = $1`, [carolContract]);
  });
  it("a user sees only their own profile", async () => {
    const rows = await asUser(bob, () => db.query<{ id: string }>(`SELECT id FROM users`));
    expect(rows.rows.map((r) => r.id)).toEqual([bob]);
  });
  it("sees own wallet and escrow but not other wallets or the pool", async () => {
    const rows = await asUser(bob, () => db.query<{ kind: string; owner: string }>(`SELECT kind, owner FROM ledger_accounts ORDER BY kind`));
    expect(rows.rows).toEqual([{ kind: "escrow", owner: bobContract }, { kind: "wallet", owner: bob }]);
  });
  it("someone not signed in sees nothing", async () => {
    const rows = await asUser(null, () => db.query(`SELECT * FROM contracts`));
    expect(rows.rows).toHaveLength(0);
  });
  it("browser users cannot write any money or contract table", async () => {
    await expectDbError(asUser(alice, () => db.query(`UPDATE contracts SET verified_units = 1`)), /permission denied/);
    await expectDbError(asUser(alice, () => db.query(`INSERT INTO ledger_transactions (idempotency_key) VALUES ('hack')`)), /permission denied/);
    await expectDbError(asUser(alice, () => db.query(`UPDATE ledger_accounts SET balance_paise = 1`)), /permission denied/);
    await expectDbError(asUser(alice, () => db.query(`DELETE FROM ledger_entries`)), /permission denied/);
  });
  it("browser users cannot read webhooks, pairing codes, audit log or ledger transactions", async () => {
    for (const t of ["webhook_events", "pairing_codes", "audit_log", "ledger_transactions"]) {
      await expectDbError(asUser(alice, () => db.query(`SELECT * FROM ${t}`)), /permission denied/);
    }
  });
});
