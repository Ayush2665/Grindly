import { z } from "zod";
import type { Db } from "@grindly/db";
import { isWatch } from "@grindly/domain";
import type { AuthedDevice } from "./devices";

export const MAX_BATCH = 500;
const MAX_AGE_MS = 60 * 24 * 3_600_000;
const MAX_FUTURE_MS = 10 * 60_000;

const time = z.string().datetime({ offset: true });
const base = {
  hkUuid: z.string().min(8).max(64).regex(/^[A-Za-z0-9-]+$/),
  start: time,
  end: time,
  productType: z.string().min(1).max(40),
  wasUserEntered: z.boolean(),
};

export const sampleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("steps"), ...base, value: z.number().int().min(0).max(1_000_000) }).strict(),
  z.object({ kind: z.literal("heart_rate"), ...base, value: z.number().min(20).max(260) }).strict(),
  z.object({ kind: z.literal("workout"), ...base, activityType: z.string().min(1).max(60), avgHeartRate: z.number().min(20).max(260).nullable() }).strict(),
]);
export type Sample = z.infer<typeof sampleSchema>;

export const batchSchema = z.object({ samples: z.array(z.unknown()).max(MAX_BATCH) }).strict();

export type SampleResult = { hkUuid: string | null; status: "accepted" | "duplicate" | "rejected"; reason?: "INVALID" | "BAD_TIME" };

export interface IngestResult {
  results: SampleResult[];
  accepted: number;
  duplicates: number;
  rejected: number;
}

const bad = (s: Sample, now: Date) => {
  const a = Date.parse(s.start);
  const b = Date.parse(s.end);
  return b < a || (s.kind === "workout" && b === a) || b > now.getTime() + MAX_FUTURE_MS || a < now.getTime() - MAX_AGE_MS;
};

// Store raw samples. Nothing here decides whether a day counts; that is verifyDay's job.
export async function ingestBatch(db: Db, device: AuthedDevice, input: unknown[], now = new Date()): Promise<IngestResult> {
  const results: SampleResult[] = [];
  await db.transaction(async (t) => {
    let sawWatch: string | null = null;
    for (const raw of input) {
      const p = sampleSchema.safeParse(raw);
      if (!p.success) {
        const id = (raw as { hkUuid?: unknown } | null)?.hkUuid;
        results.push({ hkUuid: typeof id === "string" ? id : null, status: "rejected", reason: "INVALID" });
        continue;
      }
      const s = p.data;
      if (bad(s, now)) {
        results.push({ hkUuid: s.hkUuid, status: "rejected", reason: "BAD_TIME" });
        continue;
      }
      const r =
        s.kind === "workout"
          ? await t.query(
              `INSERT INTO workouts (hk_uuid, device_id, user_id, activity_type, start_at, end_at, avg_heart_rate, product_type, was_user_entered, received_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (hk_uuid) DO NOTHING RETURNING id`,
              [s.hkUuid, device.id, device.userId, s.activityType, s.start, s.end, s.avgHeartRate, s.productType, s.wasUserEntered, now.toISOString()],
            )
          : await t.query(
              `INSERT INTO health_samples (hk_uuid, device_id, user_id, kind, start_at, end_at, value, product_type, was_user_entered, received_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (hk_uuid) DO NOTHING RETURNING id`,
              [s.hkUuid, device.id, device.userId, s.kind, s.start, s.end, s.value, s.productType, s.wasUserEntered, now.toISOString()],
            );
      if (r.rows.length === 0) {
        results.push({ hkUuid: s.hkUuid, status: "duplicate" });
        continue;
      }
      results.push({ hkUuid: s.hkUuid, status: "accepted" });
      if (isWatch(s.productType) && !s.wasUserEntered && !sawWatch) sawWatch = s.productType;
    }
    await t.query(
      `UPDATE watch_devices SET last_seen_at = $2,
         product_type = COALESCE(product_type, $3),
         first_seen_at = CASE WHEN $3::text IS NOT NULL THEN COALESCE(first_seen_at, $2) ELSE first_seen_at END
       WHERE id = $1`,
      [device.id, now.toISOString(), sawWatch],
    );
  });
  const count = (k: SampleResult["status"]) => results.filter((r) => r.status === k).length;
  return { results, accepted: count("accepted"), duplicates: count("duplicate"), rejected: count("rejected") };
}
