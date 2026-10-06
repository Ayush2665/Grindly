import { postTransactionIn, type Db } from "@grindly/db";
import { addDays, planDaySettlement, settleAt, startProgress, type Mode } from "@grindly/domain";
import { verifyContractDay } from "./verifyDay";

export interface SettledDay {
  contractId: string;
  dayIndex: number;
  localDate: string;
  verified: boolean;
  releasedPaise: number;
  forfeitedPaise: number;
  contractSettled: boolean; // that was the last day
}

interface Row {
  id: string; user_id: string; mode: Mode; state: string; unit_paise: string; cohort_id: string | null;
  window_days: number; required_days: number; verified_units: number; forfeited_units: number; days_closed: number;
  start_date: string; timezone: string;
}

const load = (db: { query: Db["query"] }, id: string, lock = false) =>
  db.query<Row>(
    `SELECT id, user_id, mode, state, unit_paise, cohort_id, window_days, required_days, verified_units, forfeited_units, days_closed,
            to_char(start_date,'YYYY-MM-DD') AS start_date, timezone
     FROM contracts WHERE id = $1 ${lock ? "FOR UPDATE" : ""}`, [id]);

// Close the next unsettled day of a contract and move the money. Returns null when there is nothing to do.
// `force` skips the wait for 06:00 the next morning (used by the dev "fast-forward" button).
// Safe to call twice or at the same time: the contract row is locked and every money move has a fixed key.
export async function settleNextDay(db: Db, contractId: string, opts: { now?: Date; force?: boolean } = {}): Promise<SettledDay | null> {
  const now = opts.now ?? new Date();
  const first = (await load(db, contractId)).rows[0];
  if (!first || first.state !== "ACTIVE" || first.days_closed >= first.window_days) return null;
  const date = addDays(first.start_date, first.days_closed);
  if (!opts.force && now.getTime() < settleAt(date, first.timezone)) return null;
  const verdict = await verifyContractDay(db, contractId, date);

  return db.transaction(async (t) => {
    const c = (await load(t, contractId, true)).rows[0]!;
    if (c.state !== "ACTIVE" || c.days_closed !== first.days_closed) return null; // someone else got there first
    if (c.mode !== "STAKE") throw new Error("friend mode settlement is not built yet");
    const unit = Number(c.unit_paise);
    const plan = planDaySettlement({
      contractId, mode: c.mode, userId: c.user_id, unit, cohortId: c.cohort_id ?? "none",
      progress: { ...startProgress(c.window_days, c.required_days), daysClosed: c.days_closed, verified: c.verified_units, forfeited: c.forfeited_units },
      dayIndex: c.days_closed + 1, dayVerified: verdict.verified,
    });
    for (const tx of plan.txs) await postTransactionIn(t, tx);
    const p = plan.progress;
    await t.query(`UPDATE contracts SET verified_units = $2, forfeited_units = $3, days_closed = $4 WHERE id = $1`, [contractId, p.verified, p.forfeited, p.daysClosed]);
    const released = p.verified - c.verified_units, forfeited = p.forfeited - c.forfeited_units;
    await t.query(
      `UPDATE contract_days SET settled_at = $3, evidence = evidence || $4::jsonb WHERE contract_id = $1 AND local_date = $2`,
      [contractId, date, now.toISOString(), JSON.stringify({ releasedUnits: released, forfeitedUnits: forfeited })]);
    const last = p.daysClosed === c.window_days;
    if (last) await t.query(`UPDATE contracts SET state = 'SETTLED' WHERE id = $1`, [contractId]);
    await t.query(`INSERT INTO audit_log (actor, action, subject, details) VALUES ('system','money.settle',$1,$2)`,
      [contractId, JSON.stringify({ day: p.daysClosed, releasedUnits: released, forfeitedUnits: forfeited })]);
    return { contractId, dayIndex: p.daysClosed, localDate: date, verified: verdict.verified, releasedPaise: released * unit, forfeitedPaise: forfeited * unit, contractSettled: last };
  });
}

// What the hourly job will call: settle every day whose 06:00 grace time has passed.
export async function settleDueDays(db: Db, now = new Date()): Promise<SettledDay[]> {
  const out: SettledDay[] = [];
  const ids = await db.query<{ id: string }>(`SELECT id FROM contracts WHERE state = 'ACTIVE' ORDER BY created_at`);
  for (const { id } of ids.rows) {
    for (let guard = 0; guard < 120; guard++) {
      const r = await settleNextDay(db, id, { now });
      if (!r) break;
      out.push(r);
    }
  }
  return out;
}
