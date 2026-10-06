// Typed table definitions for queries. The SQL files in migrations/ are the source of truth;
// a test checks these names and columns still match them.
import { bigint, boolean, date, doublePrecision, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const watchDevices = pgTable("watch_devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  productType: text("product_type"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pairingCodes = pgTable("pairing_codes", {
  code: text("code").primaryKey(),
  userId: uuid("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const contracts = pgTable("contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  goalType: text("goal_type").notNull(),
  mode: text("mode").notNull(),
  state: text("state").notNull().default("DRAFT"),
  windowDays: integer("window_days").notNull(),
  requiredDays: integer("required_days").notNull(),
  stakePaise: bigint("stake_paise", { mode: "number" }).notNull(),
  unitPaise: bigint("unit_paise", { mode: "number" }).notNull(),
  timezone: text("timezone").notNull(),
  startDate: date("start_date"),
  cohortId: text("cohort_id"),
  friendContractId: uuid("friend_contract_id"),
  verifiedUnits: integer("verified_units").notNull().default(0),
  forfeitedUnits: integer("forfeited_units").notNull().default(0),
  daysClosed: integer("days_closed").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contractDays = pgTable("contract_days", {
  contractId: uuid("contract_id").notNull(),
  localDate: date("local_date").notNull(),
  verified: boolean("verified").notNull().default(false),
  stepsTotal: integer("steps_total"),
  workoutId: text("workout_id"),
  evidence: jsonb("evidence").notNull().default({}),
  settledAt: timestamp("settled_at", { withTimezone: true }),
});

export const healthSamples = pgTable("health_samples", {
  id: uuid("id").primaryKey().defaultRandom(),
  hkUuid: text("hk_uuid").notNull().unique(),
  deviceId: uuid("device_id").notNull(),
  userId: uuid("user_id").notNull(),
  kind: text("kind").notNull(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  value: doublePrecision("value").notNull(),
  productType: text("product_type").notNull(),
  wasUserEntered: boolean("was_user_entered").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workouts = pgTable("workouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  hkUuid: text("hk_uuid").notNull().unique(),
  deviceId: uuid("device_id").notNull(),
  userId: uuid("user_id").notNull(),
  activityType: text("activity_type").notNull(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  avgHeartRate: doublePrecision("avg_heart_rate"),
  productType: text("product_type").notNull(),
  wasUserEntered: boolean("was_user_entered").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ledgerAccounts = pgTable("ledger_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  owner: text("owner").notNull(),
  balancePaise: bigint("balance_paise", { mode: "number" }).notNull().default(0),
});

export const ledgerTransactions = pgTable("ledger_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ledgerEntries = pgTable("ledger_entries", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  transactionId: uuid("transaction_id").notNull(),
  accountId: uuid("account_id").notNull(),
  amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  contractId: uuid("contract_id").notNull(),
  razorpayOrderId: text("razorpay_order_id").notNull().unique(),
  razorpayPaymentId: text("razorpay_payment_id").unique(),
  amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
  status: text("status").notNull().default("CREATED"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookEvents = pgTable("webhook_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  payload: jsonb("payload").notNull(),
});

export const friendLinks = pgTable("friend_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  inviterId: uuid("inviter_id").notNull(),
  inviteeId: uuid("invitee_id"),
  inviteeEmail: text("invitee_email").notNull(),
  status: text("status").notNull().default("PENDING"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  subject: text("subject").notNull(),
  details: jsonb("details").notNull().default({}),
});
