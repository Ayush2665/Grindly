# Grindly

Stake money on habits (gym workouts, 10k steps a day). **Apple Watch data is the only judge.**
Everything runs in **TEST MODE**: no real money, ever.

> Status: **Phase 2 done** (rules, ledger and database are built and tested). The API, payments and iPhone app are not built yet. See [PLAN.md](PLAN.md).

## The app in one picture

```
 Apple Watch ──► iPhone app ("Grindly Sync") ──► BACKEND (API) ──► DATABASE (ledger)
                                                      │                  ▲
 YOU (browser) ──► FRONTEND (what you see) ───────────┘                  │
                                                      └──► PAYMENTS (Razorpay test mode)
```

## What each part does (plain English)

| Part | What it is | What it does | Where | Status |
|---|---|---|---|---|
| **Frontend** | The screens you tap | Shows contracts, streaks, wallet, Watch status. Never decides if you passed a day. | [`design/`](design/) now, `apps/web` later | Mockups built |
| **Backend (API)** | The server | Receives Watch data, decides if each day counts, moves money, runs the hourly settlement job. | `apps/web/api` (planned) | Planned (Phase 3+) |
| **Domain (rules)** | The brain | Pure maths and rules: rest days, forfeits, pool share, step and workout checks. No internet, no database. | [`packages/domain`](packages/domain/) | **Built, 67 tests** |
| **Database + Ledger** | The money book | Postgres. Every rupee move is two matching entries that sum to zero and can never be edited. | [`packages/db`](packages/db/) | **Built, 28 tests** |
| **Payments** | Test money in | Razorpay test checkout, signature and webhook checks. | backend (planned) | Planned (Phase 5) |
| **iPhone app** | The data pipe | Reads steps and workouts from the Watch via HealthKit and uploads them. | `apps/ios-sync` (planned) | Planned (Phase 4) |

## Where the code is

| Folder | Plain English | Key files |
|---|---|---|
| `packages/domain` | **The brain.** Pure TypeScript, no internet, no database. Same input always gives the same answer. | `forfeiture.ts` (the one forfeit rule), `contract.ts` (rest days, unit value), `pool.ts` (sharing forfeits to the paisa), `interest.ts`, `ledger.ts` (in-memory money book), `settlement.ts` (turns a day into money moves), `stateMachine.ts` (legal contract steps), `verification/` (does this day count: steps, workouts, timezones) |
| `packages/db` | **The money book.** SQL files that make bad data impossible, plus a small helper to write ledger entries safely. | `migrations/0001_init.sql` (tables, ledger triggers), `migrations/0002_rls.sql` (who can read what), `src/ledger.ts` (post a transaction once), `src/schema.ts` (typed table list) |
| `packages/config` | **The safety check at startup.** Refuses to start with a missing secret or a live Razorpay key. | `src/env.ts` |
| `design/` | **What you see** (mockups for now) | see the next section |
| `.github/workflows/ci.yml` | Runs type checks and tests on every push, and scans for leaked secrets | |
| `THREAT_MODEL.md` | What could go wrong and what stops it | |

Run the tests:
```bash
pnpm install
pnpm test        # domain, db and config
pnpm typecheck
```

## The rules in 5 lines
1. Pick a goal, a window of W days and a value per verified day. You get 10% rest days.
2. Your stake sits in **escrow**. Each verified day releases that day's share to your wallet.
3. Miss more days than you are allowed and that day's share is forfeited.
4. **Stake mode:** forfeits go to a pool that people who finished share. **No Risk mode:** forfeits go to your friend.
5. Only samples from a real Apple Watch count. Typed-in or iPhone data is ignored.

## What exists today: `design/`

Open the designs (needs a tiny local server):
```bash
cd design && python3 -m http.server 4173
# then open http://localhost:4173
```
| File | What it does |
|---|---|
| `design/index.html` | Picker page linking the three looks |
| `design/shared/app.js` | **FRONTEND logic:** draws the 6 screens, bottom nav, the create-goal calculator |
| `design/shared/base.css` | **FRONTEND look:** layout, cards, dot grid, buttons (shared by all looks) |
| `design/b-night/` | **Chosen look: Ember Night.** `theme.css` colours and glow, `fx.js` scroll animations |
| `design/a-ember/`, `design/c-paper/` | The two looks not chosen (kept for reference) |

Everything in `design/` uses made-up sample numbers. No server, no real data.

## Other documents
- [PLAN.md](PLAN.md): architecture, money rules, phases (source of truth)
- [TASKS.md](TASKS.md): checklist
- [DECISIONS.md](DECISIONS.md): why things were decided
