# Release card: D-71 lock-in refresh, `gtl-api` — November 3, 2026

Sean, November 3, 2026: "Refresh on lock-in" ([D-71](DECISIONS.md)). Board item 40. A per-game lock-in now gets the
D-17 refresh first, as a send does. `gtl-api` only: no migration, no frontend change.

## Why

The line saved with each guess (read-only, aggregated; no player detail):

| Week | Lines saved | Median age | 90th percentile |
| --- | --- | --- | --- |
| 7 | 43 | 68 s | 2.3 h |
| 8 | 142 (10 pending) | 6.9 h | 8.5 h |
| 9 so far | 30 | 7.8 h | 7.8 h |

The last save-triggered collection was October 19, 21:05 UTC (`gtl_submission_odds_intents`). `cloud/personal.mjs` skipped
the refresh for any save carrying `lockIn` (redesign stage 18, October 14), and the new app saves by lock-in. Its comment
said the refresh intent "has no lockIn", but `gtl_submission_intent_context` has accepted `lockIn` and counted newly
locked games as changed guesses since M-07 (October 15).

## The change

- `cloud/personal.mjs`: every `/personal/ballot` save goes through `submitBallot` (the D-17 orchestration), lock-ins
  included.
- `cloud/handler.mjs`: the refresh intent carries `lockIn` when the save has one, so the preflight and the begin RPC
  see the same games the commit locks.
- The hosted SQL is unchanged and already matches the repo. These md5s were checked read-only on November 3:
  - `gtl_submission_intent_context` `04fba133…`
  - `gtl_preflight_submission` `88521dc4…`
  - `gtl_begin_submission_odds_collection` `80a5c444…`
  - `gtl_finish_submission_odds_collection` `77349f91…`
  - `gtl_prepare_guess_ballot` `0e44cabc…`
  - `gtl_mutate_personal` `426abc0c…`

Limits are unchanged: six collection attempts a UTC day shared with the two scheduled runs, a 5-minute cooldown, the
50-credit reserve and two credits per collection. A refused or failed refresh never refuses the save (D-27). The worst
case is four extra collections a day, 8 credits. November has 469 of 500 left.

What players notice: a lock-in whose line is over five minutes old waits for one provider round trip before it saves
(usually about a second; the adapter's requests time out at 10 s each), as a send already does. The saved line is
fresh. Nothing on screen changes, so there are no mockups.

## Release

- **Target:** `api` in the [shared release workflow](SHARED_DEPLOYMENT.md), from the merge commit on `main`, with Sean's
  approval in the GitHub UI. The same deploy ships #434's `providerSchedule` detail for submission collections.
  `gtl-odds-refresh` (scheduled runs) still needs its own Mac mini deploy for that detail.
- **Order:** none needed. The SQL already accepts the new intent; the old API keeps working until the deploy.
- **Rollback:** redeploy `gtl-api` from the previous main commit. Saved references stay as saved (D-23).
- **After the deploy (read-only):**
  - the next lock-in with a stale line writes a `gtl_submission_odds_intents` row and a two-credit collection;
  - lines saved afterwards have a median age under five minutes while the cap allows.

## Deployed

- **Run:** [release run 41696516851](https://github.com/seanbalz/guess-the-line/actions/runs/41696516851), `deploy` · `api`
  from `ff7b27f5b7e727db6012dd5198dec8bc8b37e970` (#439's merge commit), card
  [#442](https://github.com/seanbalz/guess-the-line/issues/442). Both jobs succeeded at 18:47 UTC on November 3.
- **Hosted:** `gtl-api` v46, bundle `de7d9ca5ddec66164f530825e81cad5b83e27f5bb25ab4e471302e5b6550e050`, JWT verification on.
  Migration history unchanged at deploy (73 rows, `e3f8d255…`).
- **Readback (read-only):** no collection ran between 18:16 UTC and the deploy. The 18:15 run's reply had no FanDuel
  prices, which [the November 3 addendum](RELEASE_2026_11_03_BOOK_OUTAGE.md) answers.

## Evidence (local, executed)

- `tests/odds-open-weeks-sql.test.mjs`, D-71. This runs on PGlite with the deployed `gtl-api` handler, provider adapter
  and every migration (skipped 0):
  - The first lock-in with no stored line preflights with `lockIn` in the intent (`requiresReferences` true, `ready`
    false). It makes one provider odds request and saves that collection's line, available and under 300 s old.
  - A second lock-in moments later reuses the stored line with no provider request.
  - A draft save that locks nothing starts no collection.
- `tests/guess-write-rules-sql.test.mjs`: a lock-in reaches the refresh path with its games. The lock-in off switch and
  input checks are unchanged.
- Mutation checks:
  - Restoring the `payload.lockIn === undefined` condition fails both tests.
  - Dropping `lockIn` from the intent fails the D-71 test.
- The guess-write, odds-open-weeks, submission and odds-refresh suites pass (168 of 168).
