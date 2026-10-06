import { openPglite, type PgliteDb } from "@grindly/db";
import { createPairingCode, redeemPairingCode, authenticateDevice, ensureUser, type AuthedDevice } from "../src";

export const NOW = new Date("2026-10-06T08:00:00Z"); // 13:30 in Kolkata

export async function setup(): Promise<{ db: PgliteDb; userId: string; device: AuthedDevice; token: string }> {
  const db = await openPglite();
  const userId = await ensureUser(db, "ayush@example.com", "Ayush");
  const { code } = await createPairingCode(db, userId, NOW);
  const paired = (await redeemPairingCode(db, code, NOW))!;
  const device = (await authenticateDevice(db, paired.token))!;
  return { db, userId, device, token: paired.token };
}

let n = 0;
export const steps = (count: number, o: Record<string, unknown> = {}) => ({
  kind: "steps", hkUuid: `step-${++n}-${Math.random().toString(16).slice(2, 10)}`,
  start: "2026-10-06T03:00:00Z", end: "2026-10-06T04:00:00Z", value: count, productType: "Watch7,3", wasUserEntered: false, ...o,
});
export const hr = (o: Record<string, unknown> = {}) => ({
  kind: "heart_rate", hkUuid: `hr-${++n}-${Math.random().toString(16).slice(2, 10)}`,
  start: "2026-10-06T03:00:00Z", end: "2026-10-06T03:01:00Z", value: 110, productType: "Watch7,3", wasUserEntered: false, ...o,
});
export const workout = (o: Record<string, unknown> = {}) => ({
  kind: "workout", hkUuid: `wk-${++n}-${Math.random().toString(16).slice(2, 10)}`, activityType: "traditionalStrengthTraining",
  start: "2026-10-06T01:00:00Z", end: "2026-10-06T01:45:00Z", avgHeartRate: 118, productType: "Watch7,3", wasUserEntered: false, ...o,
});
