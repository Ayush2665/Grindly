import type { Queryable } from "@grindly/db";
import {
  addDays, verifyStepsDay, verifyWorkoutDay, zonedToUtc,
  type StepSample, type WorkoutSample, type Flag, type Rejection,
} from "@grindly/domain";

export interface DayRecord {
  contractId: string;
  localDate: string;
  verified: boolean;
  stepsTotal: number | null;
  workoutId: string | null;
  rejected: Rejection[];
  flags: Flag[];
  settled: boolean;
}

interface ContractRow {
  user_id: string;
  goal_type: string;
  timezone: string;
}

// Work out whether one local day counts, from the raw samples, and store the verdict.
// Safe to run many times. A day that is already settled is never changed.
export async function verifyContractDay(db: Queryable, contractId: string, localDate: string): Promise<DayRecord> {
  const c = (await db.query<ContractRow>(`SELECT user_id, goal_type, timezone FROM contracts WHERE id = $1`, [contractId])).rows[0];
  if (!c) throw new Error("contract not found");
  const tz = c.timezone;
  const from = new Date(zonedToUtc(localDate, 0, 0, tz)).toISOString();
  const to = new Date(zonedToUtc(addDays(localDate, 1), 0, 0, tz)).toISOString();

  const types = await db.query<{ product_type: string }>(`SELECT DISTINCT product_type FROM watch_devices WHERE user_id = $1 AND product_type IS NOT NULL`, [c.user_id]);
  const known = new Set(types.rows.map((r) => r.product_type));

  let verified: boolean, stepsTotal: number | null = null, workoutId: string | null = null;
  let rejected: Rejection[], flags: Flag[], extra: Record<string, unknown> = {};

  if (c.goal_type === "STEPS_10K") {
    const rows = await db.query<{ hk_uuid: string; start_at: string; end_at: string; value: number; product_type: string; was_user_entered: boolean; received_at: string }>(
      `SELECT hk_uuid, start_at, end_at, value, product_type, was_user_entered, received_at FROM health_samples
       WHERE user_id = $1 AND kind = 'steps' AND start_at >= $2 AND start_at < $3 ORDER BY start_at, hk_uuid`,
      [c.user_id, from, to],
    );
    const samples: StepSample[] = rows.rows.map((r) => ({
      hkUuid: r.hk_uuid, start: new Date(r.start_at).toISOString(), end: new Date(r.end_at).toISOString(), count: Number(r.value),
      productType: r.product_type, wasUserEntered: r.was_user_entered, receivedAt: new Date(r.received_at).toISOString(),
    }));
    // only judge "steps without heart rate" for people whose Watch normally records it
    const hr = await db.query<{ today: string; recent: string }>(
      `SELECT COUNT(*) FILTER (WHERE start_at >= $2 AND start_at < $3) AS today, COUNT(*) AS recent
       FROM health_samples WHERE user_id = $1 AND kind = 'heart_rate' AND product_type LIKE 'Watch%' AND NOT was_user_entered AND start_at >= $4`,
      [c.user_id, from, to, new Date(Date.parse(from) - 7 * 86_400_000).toISOString()],
    );
    const knownHr = Number(hr.rows[0]!.recent) > 0;
    const v = verifyStepsDay(samples, localDate, tz, {
      knownProductTypes: known,
      ...(knownHr ? { hasHeartRateData: Number(hr.rows[0]!.today) > 0 } : {}),
    });
    verified = v.verified; stepsTotal = v.total; rejected = v.rejected; flags = v.flags;
    extra = { counted: v.counted };
  } else {
    const rows = await db.query<{ hk_uuid: string; activity_type: string; start_at: string; end_at: string; avg_heart_rate: number | null; product_type: string; was_user_entered: boolean; received_at: string }>(
      `SELECT hk_uuid, activity_type, start_at, end_at, avg_heart_rate, product_type, was_user_entered, received_at FROM workouts
       WHERE user_id = $1 AND start_at >= $2 AND start_at < $3 ORDER BY start_at, hk_uuid`,
      [c.user_id, from, to],
    );
    const ws: WorkoutSample[] = rows.rows.map((r) => ({
      hkUuid: r.hk_uuid, activityType: r.activity_type, start: new Date(r.start_at).toISOString(), end: new Date(r.end_at).toISOString(),
      avgHeartRate: r.avg_heart_rate === null ? null : Number(r.avg_heart_rate), productType: r.product_type,
      wasUserEntered: r.was_user_entered, receivedAt: new Date(r.received_at).toISOString(),
    }));
    const v = verifyWorkoutDay(ws, localDate, tz);
    verified = v.verified; workoutId = v.workoutId; rejected = v.rejected; flags = v.flags;
  }

  const evidence = { rejected, flags, ...extra };
  const up = await db.query<{ settled_at: string | null }>(
    `INSERT INTO contract_days (contract_id, local_date, verified, steps_total, workout_id, evidence)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (contract_id, local_date) DO UPDATE
       SET verified = EXCLUDED.verified, steps_total = EXCLUDED.steps_total, workout_id = EXCLUDED.workout_id, evidence = EXCLUDED.evidence
       WHERE contract_days.settled_at IS NULL
     RETURNING settled_at`,
    [contractId, localDate, verified, stepsTotal, workoutId, JSON.stringify(evidence)],
  );
  if (up.rows.length === 0) {
    // already settled: report what is stored
    const s = (await db.query<{ verified: boolean; steps_total: number | null; workout_id: string | null; evidence: { rejected?: Rejection[]; flags?: Flag[] } }>(
      `SELECT verified, steps_total, workout_id, evidence FROM contract_days WHERE contract_id = $1 AND local_date = $2`, [contractId, localDate])).rows[0]!;
    return { contractId, localDate, verified: s.verified, stepsTotal: s.steps_total, workoutId: s.workout_id, rejected: s.evidence.rejected ?? [], flags: s.evidence.flags ?? [], settled: true };
  }
  return { contractId, localDate, verified, stepsTotal, workoutId, rejected, flags, settled: false };
}
