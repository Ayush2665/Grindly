# Grindly

Stake money on habits (gym workouts, 10k steps a day). **Apple Watch data is the only judge.**
Everything runs in **TEST MODE**: no real money, ever.

> Status: **Phase 1 (design) done.** Backend, database, payments and the iPhone app are planned, not built yet. See [PLAN.md](PLAN.md).

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
| **Domain (rules)** | The brain | Pure maths and rules: rest days, forfeits, pool share, step and workout checks. No internet, no database. | `packages/domain` (planned) | Planned (Phase 2) |
| **Database + Ledger** | The money book | Postgres. Every rupee move is two matching entries that sum to zero and can never be edited. | `packages/db` (planned) | Planned (Phase 2) |
| **Payments** | Test money in | Razorpay test checkout, signature and webhook checks. | backend (planned) | Planned (Phase 5) |
| **iPhone app** | The data pipe | Reads steps and workouts from the Watch via HealthKit and uploads them. | `apps/ios-sync` (planned) | Planned (Phase 4) |

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
- [CLAUDE.md](CLAUDE.md): working rules for the AI engineer
- [TASKS.md](TASKS.md): checklist
- [DECISIONS.md](DECISIONS.md): why things were decided
