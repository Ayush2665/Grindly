import { describe, expect, it } from "vitest";
import { parseEnv } from "../src";

const good = {
  NODE_ENV: "development",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgres://localhost/grindly",
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  RAZORPAY_KEY_ID: "rzp_test_abc123",
  RAZORPAY_KEY_SECRET: "secret-secret",
  RAZORPAY_WEBHOOK_SECRET: "webhook-secret-123456",
  SETTLEMENT_HMAC_SECRET: "x".repeat(32),
};

describe("env", () => {
  it("accepts a good config and applies defaults", () => {
    const e = parseEnv(good);
    expect(e.ENABLE_SIMULATED_WATCH).toBe(false);
    expect(e.INTEREST_APY_BPS).toBe(600);
  });
  it("refuses live Razorpay keys", () => {
    expect(() => parseEnv({ ...good, RAZORPAY_KEY_ID: "rzp_live_abc123" })).toThrow(/TEST keys/);
  });
  it("refuses missing values and names them without printing secrets", () => {
    const { DATABASE_URL: _drop, ...rest } = good;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
    try {
      parseEnv({ ...good, SETTLEMENT_HMAC_SECRET: "short-secret-value" });
    } catch (e) {
      expect((e as Error).message).not.toContain("short-secret-value");
    }
  });
  it("turns the simulated watch on in development but never in production", () => {
    expect(parseEnv({ ...good, ENABLE_SIMULATED_WATCH: "true" }).ENABLE_SIMULATED_WATCH).toBe(true);
    expect(() => parseEnv({ ...good, NODE_ENV: "production", ENABLE_SIMULATED_WATCH: "true" })).toThrow(/production/);
  });
});
