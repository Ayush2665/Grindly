# Threat model

Grindly moves (test) money based on health data, so both the money and the data are worth attacking. This file lists what could go wrong, what stops it, and whether that protection exists yet.

Status: **Done** = built and tested. **Planned** = depends on a later phase (the API, payments or iPhone app are not built yet).

## What we protect
1. The ledger (who owns which paise).
2. The verdict on each day (did you pass or not).
3. User accounts and device tokens.

## Threats

| # | Threat | How it could happen | What stops it | Status |
|---|---|---|---|---|
| 1 | Fake Watch data | User types steps into Health, uses the iPhone instead of the Watch, or posts made-up samples with a stolen token | Only samples with `productType` starting `Watch` and `wasUserEntered = false` count. 100k+ steps, overlapping workouts, very late uploads and new device models are flagged. Tests in `packages/domain/test/verification.test.ts` include spoofed samples | Rules **Done**. HealthKit cannot prove where data came from, so a determined cheater with a token can still fake data. This is the main open risk before real money |
| 2 | Client says "I passed" | A modified app or a direct API call claims a day is verified | The API only accepts raw samples. The verdict is computed on the server from the domain rules | Rules **Done**, API **Planned** |
| 3 | Device token theft or replay | Token copied from the phone or intercepted | Only a hash is stored, tokens are revocable, rate limits per token and per IP, use from many IPs is flagged, link and revoke are written to the audit log | Table and audit log **Done**, rest **Planned** |
| 4 | Same day settled twice | Job runs twice, retries, or two servers run it at once | Every ledger transaction has an idempotency key built from contract and day. The database has a unique constraint on it. Tests replay everything and fire the same key five times in parallel | **Done** (tested on PGlite, see "Not covered" below) |
| 5 | Ledger drift or tampering | A bug or a person edits or deletes entries, or posts one-sided entries | Entries per transaction must sum to zero (checked at commit by a trigger). Entries and transactions cannot be updated, deleted or truncated. Balances only change through entries. Tests try each of these | **Done** |
| 6 | Negative balances / overdraw | Withdraw or forfeit more than exists | A commit-time trigger rejects any non-source account below zero and rolls the whole transaction back | **Done** |
| 7 | Webhook forgery | Attacker posts a fake "payment captured" | Verify the HMAC signature in constant time, then re-fetch the payment from Razorpay and compare the amount | **Planned** (Phase 5) |
| 8 | Webhook replay | The same real event is sent again | `webhook_events.event_id` is the primary key, so a replay hits a unique violation. The ledger key also stops double credit | Table **Done**, handler **Planned** |
| 9 | Checkout tampering | User changes the amount in the browser | Amount is set server side when the order is created and compared when the payment returns. Razorpay hosted checkout, no card data touches our servers | **Planned** |
| 10 | Reading or changing other people's data | Calling the database or API with another user's id | Row level security on every table. Browser users can only read their own rows and cannot write money tables. Tests sign in as different users | **Done** |
| 11 | Friend collusion in No Risk | Two accounts, one person, passing money to themselves | Both must stake equally and the Watch decides every day. Accounts cannot be told apart if they are one person, so this only moves their own money | Accepted for test mode. Revisit before real money |
| 12 | Timezone gaming | Change timezone mid-contract to stretch a day | Timezone is copied onto the contract at creation and changes are refused. DST days (23 and 25 hours) are tested | Rules **Done**, enforcement in the API **Planned** |
| 13 | Race on concurrent settlement | Two workers close the same day | Idempotency key plus row locks on accounts (each entry updates its account row). Fixed account ordering avoids deadlocks | **Done** in the code. Needs a multi-connection test on real Postgres, **Planned** |
| 14 | Settlement endpoint abuse | Someone calls the hourly job URL | HMAC-signed requests with a timestamp, secret of 32+ characters validated at boot | Secret check **Done**, endpoint **Planned** |
| 15 | Live money by accident | A live Razorpay key is put in the config | The app refuses to start unless the key starts with `rzp_test_`. A TEST MODE banner shows on every screen | Check **Done**, banner in designs |
| 16 | Secrets in git or logs | Keys committed, or tokens printed in error messages | Only `.env.example` is committed, `.gitignore` blocks `.env*`, env errors print variable names never values, gitleaks runs in CI | **Done** |
| 17 | Simulated Watch left on | The test panel is reachable in production | `ENABLE_SIMULATED_WATCH=true` makes the app refuse to boot in production | **Done** |
| 18 | Web attacks (XSS, CSRF, clickjacking) | Script injection or forged requests | Strict CSP, secure HttpOnly SameSite cookies, CSRF tokens on cookie routes, Zod on every input | **Planned** (Phase 7) |

## Not covered yet
- The database tests run on PGlite (Postgres compiled to WebAssembly) in a single connection. The "same key five times at once" test proves the logic but not real lock contention. A test with several real connections against Postgres is still to do.
- Nothing here has been run against Supabase itself. The RLS file assumes Supabase's `auth.uid()`, and the tests use a stand-in for it.
- No penetration test, no ASVS review yet. That is Phase 7.
