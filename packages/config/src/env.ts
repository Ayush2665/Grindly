import { z } from "zod";

// Read once when the server starts. If anything is missing or unsafe the app refuses to boot.
const bool = z.enum(["true", "false"]).transform((v) => v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // test mode only: live keys are refused
  RAZORPAY_KEY_ID: z.string().startsWith("rzp_test_", "only Razorpay TEST keys are allowed"),
  RAZORPAY_KEY_SECRET: z.string().min(8),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(16),
  // signs the hourly settlement call from pg_cron
  SETTLEMENT_HMAC_SECRET: z.string().min(32, "use at least 32 characters"),
  ENABLE_SIMULATED_WATCH: bool.default("false"),
  INTEREST_APY_BPS: z.coerce.number().int().min(0).max(5000).default(600),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const r = schema.safeParse(source);
  if (!r.success) {
    // names only: never print values, they may be secrets
    const lines = r.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join("\n")}`);
  }
  if (r.data.NODE_ENV === "production" && r.data.ENABLE_SIMULATED_WATCH) {
    throw new Error("Invalid environment:\n  ENABLE_SIMULATED_WATCH: must be false in production");
  }
  return r.data;
}
