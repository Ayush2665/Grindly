// FRONTEND helpers: small wrappers around fetch for the pages.
export interface Me {
  user: { id: string; email: string; name: string; timezone: string };
  link: { linked: boolean; fresh: boolean; deviceId: string | null; productType: string | null; lastSyncAt: string | null; waitingForFirstSample: boolean };
  contracts: Array<{ id: string; goal_type: string; state: string; window_days: number; required_days: number; stake_paise: number; unit_paise: number; start_date: string; verified_units: number; days_closed: number }>;
  today: null | { contractId: string; goal: string; localDate: string; verified: boolean; stepsTotal: number | null; workoutId: string | null; rejected: Array<{ hkUuid: string; reason: string }>; flags: Array<{ code: string; blocking: boolean }> };
  devTools: boolean;
  presets: Array<{ id: string; label: string; group: "real" | "fake"; hint: string }>;
}

export async function api<T = unknown>(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

export const inr = (paise: number) => "₹" + Math.floor(paise / 100).toLocaleString("en-IN") + (paise % 100 ? "." + String(paise % 100).padStart(2, "0") : "");

export const REASONS: Record<string, string> = {
  NOT_WATCH: "Not from a Watch", USER_ENTERED: "Typed in by hand", DUPLICATE: "Duplicate", OUTSIDE_DAY: "Different day", TOO_LATE: "Uploaded too late",
  BAD_VALUE: "Bad number", TYPE_NOT_ALLOWED: "Workout type not allowed", TOO_SHORT: "Under 30 min", NO_HEART_RATE: "No heart rate", HEART_RATE_TOO_LOW: "Heart rate too low",
};
export const FLAGS: Record<string, string> = {
  OVER_100K_STEPS: "Over 100,000 steps", OVERLAPPING_WORKOUTS: "Workouts overlap", LATE_SAMPLE: "Late upload", NEW_PRODUCT_TYPE: "New device model", STEPS_WITHOUT_HEART_RATE: "Steps but no heart rate",
};
