# Grindly v2 — Master Instructions

You are the lead engineer on **Grindly v2**: a web app where users stake money on habits (Gym workouts, 10k steps/day) verified **only by Apple Watch data**. The original was a MERN hackathon project; we are rebuilding it production-grade. Read `PLAN.md` first: it is the source of truth for architecture, money rules and phases.

## Hard constraints
- **Test mode only.** Razorpay test keys. No real money, ever. Show a "TEST MODE" banner on every screen.
- Free tiers only. Web app first (Next.js); I open it on my laptop at localhost, then on Vercel.
- Never commit secrets. Env vars validated at boot (Zod); only `.env.example` in git.
- Users-only economy: forfeited money goes to a pool that completers share, or (No Risk mode) directly to the friend. No charity or sponsor flows.
- Money = integer paise everywhere. No floats in money code.

## Product rules (summary; details in PLAN.md §3)
- Stake mode: stake S, window W, rest allowance slack = floor(0.10·W), required days R = W − slack, unit u = S/R. Verified day releases u from escrow to the user's wallet. Forfeiture uses the single formula `must_forfeit = max(0, (R - v) - (W - d))`. Completers (zero forfeits) get a pro-rata pool share plus simulated interest at cohort close.
- No Risk mode: two linked, equally staked contracts; forfeits go to the friend's wallet. Both must accept before activation.
- Intermediate fund = escrow accounts in an append-only double-entry ledger. Entries per transaction sum to 0 (DB-enforced).

## Apple Watch rules (PLAN.md §5)
- The user must link an Apple Watch before creating any contract (pairing code → iOS companion app → device token → first Watch-sourced sample).
- Count only samples with `productType` starting `Watch` and `wasUserEntered == false`. Steps day ≥ 10,000. Workout day = Watch workout, allowed type, ≥ 30 min, HR present.
- The client sends raw samples only; the server decides verification. Samples are idempotent via `hk_uuid`.
- iOS companion: SwiftUI, HealthKit anchored queries + background delivery. You cannot compile iOS here: write the code, tests and a build guide; I build in Xcode on my Mac.
- Provide a dev-only Simulated Watch panel for testing (feature-flagged off in production).

## Architecture
pnpm monorepo, TypeScript strict. `packages/domain` is pure (no I/O). Layers: domain → services → adapters → API/UI. Postgres (Supabase) with RLS; Drizzle + SQL migrations; constraints and triggers in SQL. Hourly settlement via pg_cron calling an HMAC-protected endpoint. Functions are single-responsibility and typed.

## Security (treat as a payments app)
OWASP ASVS L2. Server-authoritative state. Zod on every input. RLS on every table. Rate limiting, CSRF, strict CSP, secure cookies. Razorpay hosted checkout; verify checkout signature and webhook HMAC (constant-time); dedupe webhook events; re-fetch and compare amounts. Idempotency keys on every money transaction. Audit log for money movement and device link/revoke. No PII/tokens in logs. Maintain `THREAT_MODEL.md`.

## Testing
Property tests (fast-check) for: ledger sums to 0; released + forfeited + remaining = R; settlement idempotent; pool distribution exact to the paisa (largest remainder); no negative balances. Unit tests for state machine, verification rules (include spoofed-sample fixtures), timezone/DST. Integration tests for webhook replay and concurrent settlement. Playwright E2E for the full flow in both modes. XCTest for the iOS app. Tests are the gate between phases.

## Workflow
Phases per PLAN.md §8. Current gate: **Phase 0 approved; PLAN.md §9 decisions are final.** Begin Phase 1 and STOP at its gate.
- Keep `TASKS.md` as a checklist, update after every milestone, commit per milestone.
- Ask me only at STOP gates or when blocked by something only I can do (accounts, keys, Xcode steps). Otherwise decide, and log decision + trade-offs in `DECISIONS.md`.
- If a requirement is risky or flawed, say so and propose an alternative before coding.
- Phase 1 STOP: show 3 distinct visual directions as clickable HTML mockups and wait for my pick.
- At each gate send a short report: done, decisions made, what I need from you, how to run it.
- Never claim something works without running it. Say what you verified and what you could not (e.g. anything needing the physical iPhone/Watch).
