# Grindly v2 — Phase 0 Design Plan

Status: **awaiting approval** (nothing is implemented yet).
Scope: web app (laptop browser), payments in **test mode only**, Apple Watch as the only data source, users-only money model (no charity/sponsor).

---

## 1. Reality checks that shape the design

| Constraint | Consequence |
|---|---|
| A web page cannot read HealthKit. Only a native iOS app can. | We need a tiny **iOS companion app ("Grindly Sync")** that reads Watch data from the iPhone's Health store and uploads it. The web app is the product; the companion is a data pipe. |
| Cloud/Linux cannot compile iOS apps. | Swift code is written here, but **you build and install it with Xcode on your Mac**. A free Apple ID ("Personal Team") can install on your own iPhone; provisioning expires every 7 days and must be re-installed. Verify that HealthKit background delivery is allowed on the free team; if not, use the Shortcuts fallback (§5.5). |
| HealthKit offers no cryptographic proof of data origin. | We can filter by source device and "user-entered" flag, but a determined user holding an API token could post fake data. Acceptable in test mode; flagged as an open risk before any real-money launch. |
| Money is simulated (Razorpay test mode). | The ledger is still built as if real: it is the part that must be correct. Withdrawals are simulated ledger entries. |
| Phone must reach the backend. | Dev: Cloudflare Tunnel (free) exposes localhost. Then deploy to Vercel + Supabase. |

## 2. Stack (all free tier)

- **Monorepo**: pnpm workspaces + TypeScript (strict).
- `apps/web`: Next.js (App Router), Tailwind, shadcn/ui, TanStack Query, PWA manifest. Also hosts the API route handlers.
- `packages/domain`: **pure TypeScript, zero I/O**: money type, contract state machine, settlement math, pool/bonus math, step/workout verification rules. Fully unit and property tested.
- `packages/db`: Drizzle ORM + hand-written SQL migrations (constraints/triggers live in SQL).
- **Postgres** on Supabase (free) with Auth and **row-level security**. Local dev via `supabase start` (Docker).
- Payments: **Razorpay test mode**, Orders API + hosted Checkout.js, HMAC-verified webhooks.
- Scheduling: `pg_cron` + `pg_net` (Supabase) calls the settlement endpoint hourly with an HMAC secret. (Vercel Hobby cron is daily-only; settlement must be hourly because each user has their own timezone.)
- `apps/ios-sync`: SwiftUI + HealthKit.
- Tests: Vitest, fast-check (property tests), Playwright (E2E), XCTest (Swift).
- CI: GitHub Actions (typecheck, lint, tests, gitleaks, `pnpm audit`).
- Why Postgres, not Mongo: a ledger needs ACID multi-row transactions, FKs, CHECK constraints and unique idempotency keys enforced by the database itself.

## 3. Money model

### 3.1 Definitions
- Contract: `stake S` (paise), `window_days W`, goal type `STEPS_10K | GYM_WORKOUT`.
- **Rest allowance (decided)**: `slack = floor(0.10 × W)` free rest days; `required_days R = W − slack` (e.g. W=30 → 3 rest days, R=27). Slack is not user-configurable.
- Unit value `u = S / R` (S must be divisible by R; the UI enforces it).
- **Slack** = W − R free days (10% of W). For W < 10 slack is 0, so every missed day costs `u` immediately.
- A day is *verified* if the Watch data meets the rule for that local day (§5.3). At most one unit per day.

### 3.2 Ledger accounts (double-entry, integer paise, append-only)
`gateway_clearing` (test-mode inflow), `wallet:{user}`, `escrow:{contract}`, `pool:{cohort}`, `yield_source` (simulated mint), `withdrawn` (sink).
Every transaction's entries sum to **0**, enforced by a deferred constraint trigger. Entries are never updated or deleted (trigger rejects it).

### 3.3 Lifecycle of S = ₹2000, R = W = 20, u = ₹100
1. **Fund**: gateway payment captured → `gateway_clearing → escrow` (₹2000).
2. **Verified day**: `escrow → wallet:user` (+₹100). The user gets it back as spendable/withdrawable balance.
3. **Missed day** (see formula below): `escrow → pool:{cohort}` (₹100).
4. **Completion** (zero forfeits, `verified ≥ R`): at cohort close the user gets a bonus = pro-rata share of the pool + simulated interest.
5. **Withdraw**: `wallet → withdrawn` (simulated payout).

### 3.4 Single forfeiture formula
At each local-day close `d` (1-indexed), with `v` verified days so far:
```
unmet          = R - v
days_left      = W - d
must_forfeit   = max(0, unmet - days_left)   // cumulative units lost for good
new_forfeits   = must_forfeit - already_forfeited
```
Forfeit `new_forfeits × u` from escrow. This makes strict mode forfeit immediately, flex mode forfeit only once the goal becomes mathematically unreachable, and handles window end with no special case.
Invariant: `released + forfeited + remaining = R` units.

### 3.5 Bonus and pool
- **Cohort** = calendar month in which the contract window ends, per goal type. Pool = Σ forfeits in the cohort.
- At cohort close (month end + grace), **completers split the pool pro-rata by stake**. No completers → pool rolls into the next cohort (never kept by the platform).
- **Simulated interest**: daily accrual on remaining escrow at a configurable APY (default 6%), tracked as a virtual accrual and **realized only for completers**, funded from `yield_source`. Real interest requires a regulated holding instrument and is out of scope.
- Platform fee: 0% (configurable).

### 3.6 "No Risk" friend mode
- Two linked contracts, equal stake and rules; both sides must **accept** before either activates (invite expires in 48h → full refund).
- Same forfeiture formula, but the destination of `new_forfeits × u` is **the friend's wallet** instead of the pool.
- No cancellation after activation. Disputes: none in MVP, because the Watch data is the sole arbiter.
- Completers in this mode get no pool bonus (the money already moved peer-to-peer); interest still applies.

### 3.7 Contract state machine
`DRAFT → AWAITING_PAYMENT → ACTIVE → SETTLED` (plus `CANCELLED`, and for friend mode `PENDING_FRIEND` before `AWAITING_PAYMENT`).
Illegal transitions throw. Transitions are driven only by server code (webhook, settlement job, accept endpoint).

## 4. Data model (core tables)
`users`, `watch_devices` (token hash, model, first/last seen, revoked_at), `contracts`, `contract_days` (contract, local_date, verified, steps_total, workout_id, evidence jsonb, settled_at), `health_samples` (hk_uuid UNIQUE, device, type, start/end, value, source_product_type, metadata), `workouts`, `ledger_accounts`, `ledger_transactions` (idempotency_key UNIQUE), `ledger_entries`, `payments` (razorpay_order_id UNIQUE, status), `webhook_events` (event_id UNIQUE), `friend_links`, `audit_log`.
RLS: users read only their own rows (and their friend contract's shared fields). Writes to money tables only via server role.

## 5. Apple Watch integration

### 5.1 Linking flow (required before creating any contract)
1. Web: "Link Apple Watch" shows a 6-digit pairing code (5-min TTL, single use).
2. iPhone companion: user signs in or enters the code → server issues a **device token** (random 256-bit, stored hashed, revocable). The app requests HealthKit read permission for steps, workouts, heart rate and the workout route flag.
3. Server records watch model from the first samples (`productType` like `Watch6,2`). Linking is **complete** only when ≥1 Watch-sourced sample has arrived. The web UI shows "Linked: Apple Watch Series X, last sync 12 min ago".
4. Contracts can only start if the last sync is < 24h old. Sync gaps are visible to the user.

### 5.2 Companion app (SwiftUI, iPhone only; no watchOS target needed)
- `HKAnchoredObjectQuery` with a persisted anchor for deltas; `HKObserverQuery` + `enableBackgroundDelivery(.hourly)` for steps, `.immediate` for workouts; `BGAppRefreshTask` as backup.
- Uploads batches over HTTPS with the device token; batches are idempotent via `hk_uuid`.
- Reads only: step count, workouts (type, start/end, duration, active energy), heart-rate summary during workouts.

### 5.3 Verification rules (server-side, in `packages/domain`)
- **Steps day**: sum of step samples where `sourceRevision.productType` starts with `Watch` **and** `wasUserEntered == false`, within the user's local calendar day, ≥ 10,000. iPhone-sourced and third-party-app steps are ignored (avoids double counting too).
- **Workout day**: ≥ 1 Watch-sourced workout in the allowed type list (strength training, functional training, HIIT, cross training, elliptical, rowing, etc.) with duration ≥ 30 min, not user-entered, and average heart rate present and above a floor (default 90 bpm; configurable). Only one workout per day counts.
- **Plausibility flags** (stored in `evidence`, can block verification): > 100k steps/day, steps while HR is absent, workouts overlapping each other, samples arriving > 36h after `endDate`, device token used from many IPs, a sudden jump to a new `productType`.
- **Timezone**: day boundaries use the user's stored IANA timezone at contract creation (changes mid-contract are rejected).
- **Late sync grace**: a day settles at local 06:00 the next day, so overnight syncs still count.

### 5.4 Ingestion API
`POST /api/v1/ingest/batch` (device token auth, Zod-validated, max 500 samples, body size capped, rate limited). Returns per-sample accept/reject reasons. Unique `hk_uuid` makes retries safe.

### 5.5 Fallback if free-team HealthKit background delivery is unavailable
Apple Shortcuts automation: "Find Health Samples" → "Get Contents of URL" POSTing to the same ingestion endpoint with the device token. Less reliable (runs when triggered, may prompt), but zero native code. Same server contract.

## 6. Security (payments-grade, test mode)
OWASP ASVS L2 as target.
- Server-authoritative: the client never sends "I completed today"; only raw samples, which the server evaluates.
- Razorpay: **hosted Checkout**, so no card data touches our servers. Verify checkout signature **and** webhook HMAC (constant-time compare); webhook events deduped by `event_id`; payment amounts re-fetched from the gateway and compared to the order.
- Idempotency keys on every money-moving transaction. Settlement job is idempotent: re-running yields zero new entries.
- Zod validation on every input; RLS on every table; secrets only in validated env vars; `.env.example` only in git.
- Rate limiting (per IP and per token), CSRF protection for cookie-auth routes, strict CSP, secure/HttpOnly/SameSite cookies, security headers.
- Audit log for every money movement and device link/revoke. No PII or tokens in logs.
- Daily **reconciliation** job: ledger totals vs gateway records; any mismatch raises a visible alert.
- Threat model (`THREAT_MODEL.md`, Phase 2): fake data injection, token theft/replay, double-spend on settlement, webhook forgery, race on concurrent settlement (row-level locks / advisory locks), friend collusion, timezone gaming.

## 7. Test strategy
- **Property tests** (fast-check): ledger always sums to 0; `released + forfeited + remaining = R`; settlement is idempotent; pool distribution never exceeds the pool and distributes exactly (largest-remainder rounding to the paisa); no negative balances.
- **Unit**: state machine transitions, verification rules (fixtures of real HealthKit-shaped samples incl. spoofed ones), timezone and DST edge cases, forfeiture formula.
- **Integration**: webhook replays, concurrent settlement, partial failures mid-transaction.
- **E2E (Playwright)**: link watch (simulated device) → fund in Razorpay test mode → daily verification → settlement → bonus → withdraw. Both goal types and friend mode.
- **Swift**: XCTest for anchor persistence and batch building.
- Dev-only **Simulated Watch panel** in the web UI (feature-flagged off in prod) injects Watch-shaped samples, so everything is testable without waiting 20 days.

## 8. Phases and gates
0. **This plan** → approval. *(you are here)*
1. **Designs**: 3 distinct clickable HTML directions (home, create goal, daily status, No Risk, wallet/ledger, watch linking) → you pick one.
2. Foundations: monorepo, CI, schema, ledger, state machine, domain package with full tests, threat model.
3. Watch ingestion (server + simulated device) + step and workout verification, E2E.
4. iOS companion app (Swift) + pairing flow; you build/install via Xcode.
5. Razorpay test-mode funding, webhooks, reconciliation, wallet and withdraw (simulated).
6. Stake mode end to end (pool + bonus + interest), then No Risk mode.
7. Security pass, deploy to Vercel + Supabase, README + runbook.

Each phase ends with green tests and a short report.

## 9. Decisions (confirmed by Ayush, 2026-10-06)
1. Window allows 10% rest days (§3.1). Interpretation to confirm: you choose the window length, and R is derived from it, rather than choosing R and W separately.
2. One monthly pool, per goal type.
3. Workout rules as listed (≥ 30 min, avg HR floor 90 bpm); simulated interest 6% APY, completers only.
4. No Risk: both friends must stake equal amounts.
5. Dev setup: Mac with Xcode, iPhone, paired Apple Watch available.
