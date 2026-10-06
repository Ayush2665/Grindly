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

## Phase 3+ — not started
