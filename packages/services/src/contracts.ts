import type { Db, Queryable } from "@grindly/db";
import { deriveTerms, localDate, stakeForUnit, transition, type GoalType, type Mode } from "@grindly/domain";
import { assertWatchReady } from "./devices";

export interface NewContract {
  userId: string;
  goal: GoalType;
  windowDays: number;
  unitPaise: number;
  now?: Date;
}

// DEV ONLY until Phase 5: creates the contract and marks it paid without a payment.
// Real flow: DRAFT -> AWAITING_PAYMENT -> (Razorpay webhook) -> ACTIVE.
export async function createContractSimulatedPayment(db: Db, c: NewContract): Promise<{ id: string; startDate: string }> {
  const now = c.now ?? new Date();
  await assertWatchReady(db, c.userId, now);
  const user = (await db.query<{ timezone: string }>(`SELECT timezone FROM users WHERE id = $1`, [c.userId])).rows[0];
  if (!user) throw new Error("user not found");
  const t = deriveTerms(stakeForUnit(c.unitPaise, c.windowDays), c.windowDays);
  const startDate = localDate(now.getTime(), user.timezone);
  const cohort = `${startDate.slice(0, 7)}:${c.goal}`;
  return db.transaction(async (tx) => {
    const r = await tx.query<{ id: string }>(
      `INSERT INTO contracts (user_id, goal_type, mode, window_days, required_days, stake_paise, unit_paise, timezone, start_date, cohort_id)
       VALUES ($1,$2,'STAKE',$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [c.userId, c.goal, t.windowDays, t.requiredDays, t.stake, t.unit, user.timezone, startDate, cohort],
    );
    const id = r.rows[0]!.id;
    await tx.query(`UPDATE contracts SET state = $2 WHERE id = $1`, [id, transition("DRAFT", "SUBMIT")]);
    await tx.query(`UPDATE contracts SET state = $2 WHERE id = $1`, [id, transition("AWAITING_PAYMENT", "PAYMENT_CAPTURED")]);
    return { id, startDate };
  });
}

export async function listContracts(db: Queryable, userId: string) {
  const r = await db.query<{ id: string; goal_type: string; state: string; window_days: number; required_days: number; stake_paise: string; unit_paise: string; start_date: string; verified_units: number; days_closed: number }>(
    `SELECT id, goal_type, state, window_days, required_days, stake_paise, unit_paise, to_char(start_date,'YYYY-MM-DD') AS start_date, verified_units, days_closed
     FROM contracts WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
  return r.rows.map((x) => ({ ...x, stake_paise: Number(x.stake_paise), unit_paise: Number(x.unit_paise) }));
}

export async function ensureUser(db: Queryable, email: string, displayName: string, timezone = "Asia/Kolkata"): Promise<string> {
  const r = await db.query<{ id: string }>(
    `INSERT INTO users (email, display_name, timezone) VALUES ($1,$2,$3) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`,
    [email.toLowerCase(), displayName, timezone]);
  return r.rows[0]!.id;
}
