// Raw shapes the iPhone app uploads. The server decides what counts; the client never says "I passed".

export interface StepSample {
  hkUuid: string;
  start: string; // ISO time
  end: string;
  count: number;
  productType: string; // e.g. "Watch7,3" or "iPhone15,2"
  wasUserEntered: boolean;
  receivedAt: string; // when our server got it
}

export interface WorkoutSample {
  hkUuid: string;
  activityType: string; // e.g. "traditionalStrengthTraining"
  start: string;
  end: string;
  avgHeartRate: number | null;
  productType: string;
  wasUserEntered: boolean;
  receivedAt: string;
}

export type FlagCode = "OVER_100K_STEPS" | "OVERLAPPING_WORKOUTS" | "LATE_SAMPLE" | "NEW_PRODUCT_TYPE" | "STEPS_WITHOUT_HEART_RATE";

export interface Flag {
  code: FlagCode;
  blocking: boolean; // blocking flags stop the day from counting
  detail?: string;
}

export type RejectReason = "NOT_WATCH" | "USER_ENTERED" | "DUPLICATE" | "OUTSIDE_DAY" | "TOO_LATE" | "BAD_VALUE" | "TYPE_NOT_ALLOWED" | "TOO_SHORT" | "NO_HEART_RATE" | "HEART_RATE_TOO_LOW";

export interface Rejection {
  hkUuid: string;
  reason: RejectReason;
}

export interface DayVerdict {
  verified: boolean;
  rejected: Rejection[];
  flags: Flag[];
}

export const isWatch = (productType: string) => productType.startsWith("Watch");
