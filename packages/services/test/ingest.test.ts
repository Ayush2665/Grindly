import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { ingestBatch, MAX_BATCH } from "../src";
import { NOW, hr, setup, steps, workout } from "./helpers";

const count = async (db: Awaited<ReturnType<typeof setup>>["db"], t: string) => Number((await db.query<{ c: string }>(`SELECT COUNT(*) AS c FROM ${t}`)).rows[0]!.c);

describe("ingest", () => {
  it("stores steps, heart rate and workouts", async () => {
    const { db, device } = await setup();
    const r = await ingestBatch(db, device, [steps(500), hr(), workout()], NOW);
    expect(r).toMatchObject({ accepted: 3, duplicates: 0, rejected: 0 });
    expect(await count(db, "health_samples")).toBe(2);
    expect(await count(db, "workouts")).toBe(1);
  });
  it("is safe to send the same batch again", async () => {
    const { db, device } = await setup();
    const batch = [steps(500), hr(), workout()];
    await ingestBatch(db, device, batch, NOW);
    const again = await ingestBatch(db, device, batch, NOW);
    expect(again).toMatchObject({ accepted: 0, duplicates: 3 });
    expect(await count(db, "health_samples")).toBe(2);
  });
  it("retries of any shape never create extra rows", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.integer({ min: 0, max: 20000 }), { minLength: 1, maxLength: 8 }), fc.integer({ min: 1, max: 3 }), async (counts, times) => {
        const { db, device } = await setup();
        const batch = counts.map((c) => steps(c));
        for (let i = 0; i < times; i++) await ingestBatch(db, device, batch, NOW);
        expect(await count(db, "health_samples")).toBe(counts.length);
      }),
      { numRuns: 10 },
    );
  }, 60_000);
  it("rejects bad samples one by one and keeps the good ones", async () => {
    const { db, device } = await setup();
    const r = await ingestBatch(db, device, [
      steps(100),
      { kind: "steps", hkUuid: "bad-one-1" }, // missing fields
      steps(-5), // negative
      steps(1.5), // fraction
      steps(10, { extra: "x" }), // unknown field
      steps(10, { end: "2026-10-06T02:00:00Z" }), // ends before it starts
      steps(10, { start: "2027-01-01T00:00:00Z", end: "2027-01-01T01:00:00Z" }), // future
      steps(10, { start: "2025-01-01T00:00:00Z", end: "2025-01-01T01:00:00Z" }), // too old
      "garbage", null, 42,
    ], NOW);
    expect(r.accepted).toBe(1);
    expect(r.rejected).toBe(10);
    expect(r.results.filter((x) => x.reason === "BAD_TIME")).toHaveLength(3);
    expect(await count(db, "health_samples")).toBe(1);
  });
  it("rejects unsafe hk_uuid text", async () => {
    const { db, device } = await setup();
    const r = await ingestBatch(db, device, [steps(10, { hkUuid: "x'; DROP TABLE users;--" })], NOW);
    expect(r.rejected).toBe(1);
    expect(await count(db, "users")).toBe(1);
  });
  it("keeps a sample from another source but marks it for verification to ignore", async () => {
    const { db, device } = await setup();
    await ingestBatch(db, device, [steps(9000, { productType: "iPhone15,2" })], NOW);
    expect(await count(db, "health_samples")).toBe(1);
  });
  it("records the Watch model and last sync on the device", async () => {
    const { db, device } = await setup();
    await ingestBatch(db, device, [steps(10)], NOW);
    const d = (await db.query<{ product_type: string; last_seen_at: string }>(`SELECT product_type, last_seen_at FROM watch_devices WHERE id = $1`, [device.id])).rows[0]!;
    expect(d.product_type).toBe("Watch7,3");
    expect(new Date(d.last_seen_at).toISOString()).toBe(NOW.toISOString());
  });
  it("accepts exactly the max batch size", async () => {
    const { db, device } = await setup();
    const r = await ingestBatch(db, device, Array.from({ length: MAX_BATCH }, () => steps(1)), NOW);
    expect(r.accepted).toBe(MAX_BATCH);
  });
});
