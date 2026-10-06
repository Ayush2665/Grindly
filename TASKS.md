# TASKS

## Phase 0 — Plan
- [x] PLAN.md approved, §9 decisions final

## Phase 1 — Designs
- [x] Shared mockup renderer (`design/shared/app.js`, `base.css`)
- [x] Direction A · Ember (faithful to the reference image)
- [x] Direction B · Ember Night (dark)
- [x] Direction C · Ember Paper (flat cream)
- [x] 6 screens each: home, create goal, daily status, No Risk, wallet/ledger, link Watch
- [x] TEST MODE banner on every screen
- [x] Rendered and click-checked in the browser pane (A: all nav; B, C: spot checks)
- [x] User picked B · Ember Night
- [x] Night v2: scroll-driven shoe (steps) and dumbbell (gym) scenes, parallax hero, reveal-on-scroll, count-ups, glass cards
- [ ] **STOP: user signs off on Night v2 (or asks for more changes)**

## Phase 2 — Foundations
- [x] pnpm monorepo, TypeScript strict
- [x] packages/domain: money, terms, forfeiture, state machine, pool, interest, ledger, settlement, verification (67 tests incl. property tests and spoofed samples)
- [x] packages/db: SQL schema, ledger triggers, RLS, typed schema, idempotent ledger writer (28 tests on PGlite)
- [x] packages/config: Zod env validation, test keys only (4 tests)
- [x] THREAT_MODEL.md, .env.example, CI workflow
- [ ] Multi-connection concurrency test on real Postgres
- [ ] **STOP: Phase 2 gate, user review**

## Phase 3 — Watch ingestion
- [x] packages/services: pairing codes, device tokens (hash only), revoke, link status, 24h sync gate
- [x] Ingestion: Zod per sample, idempotent by hk_uuid, 500/batch cap, per-sample accept/reject reasons (30 tests)
- [x] Per-day verification from stored raw samples (steps and gym), re-run safe, settled days never change
- [x] apps/web (Next.js): API routes, signed-cookie dev sign-in, rate limits, CSRF checks, security headers
- [x] Real pages in the Night look: Home, Link Watch, Simulated Watch panel (dev only), today's verdict
- [x] 25 API tests + 6 Playwright browser tests
- [x] Mockup screens moved into the real app: scroll scenes, Today, Create goal, Wallet and ledger, No Risk (labelled preview)
- [x] Pulled forward from later phases so the Wallet is real: contract funding into escrow, day settlement, simulated withdraw, dev "close day" button
- [ ] Still not built: Razorpay, hourly job endpoint, pool bonus and interest, friend mode, real iPhone app
- [ ] **STOP: Phase 3 gate, user review**

## Phase 4+ — not started
