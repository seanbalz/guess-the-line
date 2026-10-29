# EPL Guess the Line (2-way moneyline) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The 8 FEPL managers guess, per EPL match, the favorite and its 2-way (draw no bet) moneyline price; each guess is scored by distance from the real price at lock-in; a leaderboard ranks lowest average distance per match guessed.

**Architecture:** Pure rules in `shared/epl-moneyline.mjs`; migration M-32 (guess, reference and history tables + RPCs, service-only); `cloud/epl.mjs` routes `epl/guess/*`; Plan 1 `gtl-epl-jobs` `fixtures` job also collects `draw_no_bet` per event and resolves pending references; UI under `web/src/next/epl/guess/`.

**Tech Stack:** as Plan 1.

**Spec:** `docs/superpowers/specs/2026-10-28-epl-fantasy-and-moneyline-design.md` section 7. Depends on Plan 1 (fixtures, prices, member check, EplApp).

**Current evidence, October 29:** Tasks 0–5 now have source and combined local acceptance; see [the integration record](../../EPL_MONEYLINE_ACCEPTANCE_2026_10_29.md). M-32 is [applied and verified](../../RELEASE_2026_10_29_M32.md) as hosted version `20261029162422`; the deployed, enabled check's first MW9 live verdict passed ([PR #375 record](../../RELEASE_2026_10_29_DNB.md)). [Task 3's API follow-on](../../EPL_MONEYLINE_API_2026_10_29.md) is source work with guarded save/readback and shared numeric limits, pending combined M-36/UI release and hosted acceptance. M-36 adds the safe save wrapper and separately gated collector; applying schema alone does not enable collection. Historical steps below remain provenance, not live acceptance.

## Global Constraints

- Only linked FEPL managers can guess (`gtl_epl_member` returns an owner_id). Since M-31 (Oct 29, D-68 addendum) every signed-in account can read EPL, so the leaderboard and the guesses others may see (per the visibility rule) are readable by everyone; writes stay member-only.
- Market: 2-way draw-no-bet. Real price = median of DraftKings, FanDuel, BetMGM for the chosen club.
- Guess = `{eventId, club, price}`; `club` is home or away of that event; `price` is an integer American price with |price| ≥ 100 (−100 and +100 both allowed and equal).
- Distance: map American odds to a line where −100 ≡ +100: `x(p) = p >= 100 ? p - 100 : p + 100` (so +120 → 20, −110 → −10); distance = `|x(guess) − x(real)|`. −110 vs +120 = 30; −150 vs −120 = 30; +100 vs −100 = 0.
- Reference: newest qualifying stored price at lock-in; with none, the guess saves as pending and the first qualifying price collected after it and before kickoff becomes its reference; never refused for refresh limits (D-27 as in docs/RULES.md "Line at the guess").
- Locks: each match at its own kickoff; a locked guess is final; unlocked guesses are drafts (D-37/D-39).
- Visibility: others' guesses for a match hidden until you lock that match or it kicks off (D-31).
- Leaderboard: lowest average distance per match guessed; ties → more matches guessed; shows matches guessed. Unscored (pending at kickoff with no price) → excluded, labelled.
- Credits: `draw_no_bet` is an event-level market (~1 credit per event per region); never drop remaining below 50; at most 2 collections per event (open of week, 3 h before kickoff) plus one at each lock-in refresh attempt, shared and quota-limited.

## Review Focus

1. Guess saved with no price, and no price ever arrives before kickoff → unscored, excluded from average, shown "No line before kickoff" (Task 1/3 tests).
2. A price of exactly ±100 in guess or reference → distance math correct (Task 1 test).
3. Two lock-ins for the same event by the same player (double tap) → one final guess, second returns `GTL_EPL_GUESS_LOCKED` (Task 3 test).
4. Kickoff passes between opening the screen and tapping Lock in → `GTL_EPL_GUESS_CLOSED`, draft kept (Task 3 test).
5. Book returns a 3-way price under the draw-no-bet key or a price with |p| < 100 → rejected by collector, not stored (Task 4 test).

---

### Task 0 (gate, server-side): draw-no-bet check inside gtl-epl-jobs

**Controller ruling (Oct 29):** Sean asked for everything to run without him, and the odds key exists only in the hosted function secrets. So the gate check runs inside the deployed worker, not by hand. It replaces the manual `scripts/epl-dnb-check.mjs`.

**Files:** Modify `cloud/epl-sources.mjs` (`fetchEplDrawNoBet`, the same as Task 4's signature) and `cloud/epl-jobs.mjs`. Add a job `dnb-check` that:
- runs at most once a day, on the existing schedule table (a new row the cron file adds, created disabled, and added to `supabase/admin/epl_jobs_cron.sql`);
- checks at most 3 upcoming events, and refuses to run if remaining credits are under 60;
- records per event the books present and both prices in the run's `detail`;
- sets a `dnbAvailable` flag, stored as the newest `dnb-check` run.

Test: `tests/epl-dnb.test.mjs` (fake fetch).

**Exit rule, in code:** Guess the Line is offered for a week once a `dnb-check` of that week succeeded with at least 2 of 3 events priced by at least 2 of the 3 books, and then stays open for the rest of that week: `dnbGateOpen` reads the week's succeeded checks, so a later skip never closes it, and the job skips as `not_due` (no credits, no verdict) when fewer than 2 fixtures are still ahead (round 1 review fix). Otherwise the Play → Guess the Line tab says "Moneyline guessing isn't available this week." and nothing else of plan 3 is visible. No human check is needed. Record the first live result in `docs/ODDS_PROVIDER_EVALUATION.md` in a follow-up once it runs.
- [x] Source and fake-provider tests implemented; disabled schedule SQL is compatible with M-32. The check is deployed/enabled and its first MW9 live gate passed; see the current evidence above.

### Task 1: Moneyline rules (`shared/epl-moneyline.mjs`)

**Files:** Create `shared/epl-moneyline.mjs`; Test `tests/epl-moneyline.test.mjs`
**Interfaces:** Produces `toLine(price: number) -> number`, `distance(guess: number, real: number) -> number`, `validPrice(p) -> boolean`, `median(prices: number[]) -> number|null` (on the `toLine` scale, converted back; even count → mean of middle two on the line scale, rounded to integer American), `leaderboard(rows: {ownerId, distance: number|null}[]) -> {ownerId, average: number, guessed: number, unscored: number}[]` (sorted average asc, then guessed desc, then ownerId).
- [x] Pure rules and tests implemented: distance across even odds, validation, normalized book median and leaderboard ties. Tested locally; this is not hosted evidence.

### Task 2: Migration M-32 (guesses)

**Files:** Create `supabase/migrations/20261029150000_gtl_epl_moneyline.sql` (after M-31 `20261029060000`; check open PRs for the same version first); Modify `tests/migrations.mjs` (`NOT_HOSTED`), `docs/REDESIGN_BUILD_PLAN.md` §6 (M-32 row, apply after M-31); Test `tests/epl-moneyline-sql.test.mjs` (PGlite, like Plan 1's `tests/epl-migration-sql.test.mjs`)
**Interfaces:** Tables `gtl_epl_guesses(season, week, event_id, owner_id, club, price int, status text check in ('draft','locked'), locked_at, reference_price int null, reference_observed_at, reference_source text check in ('at-lock','first-after'), distance int null, primary key(event_id, owner_id))`, `gtl_epl_guess_history` (every save); prices from Plan 1 `gtl_epl_prices` with `market='draw_no_bet'`. RPCs (service-only, invoker): `gtl_epl_save_guess(p_user, p_event_id, p_club, p_price, p_lock boolean, p_now)` (errors `GTL_EPL_GUESS_LOCKED`, `GTL_EPL_GUESS_CLOSED`, `GTL_EPL_GUESS_INVALID`, `GTL_EPL_FORBIDDEN`; on lock sets reference from newest stored DNB median for that club at or before `p_now`, else pending), `gtl_epl_resolve_pending_references(p_event_id)` (first price observed after `locked_at` and before kickoff), `gtl_epl_guess_board(p_user, p_season, p_week)` (own guesses + others' only where locked-by-viewer or kicked off), `gtl_epl_guess_leaderboard(p_season)`.
- [x] M-32 source and executed PGlite tests implemented for Review Focus 1, 3, 4, privacy and the disabled check job. Moved to `APPLIED` after the verified October 29 hosted apply; see the linked M-32 release record. The schedule constraint widening is fix-forward: disable `dnb-check` and preserve stored evidence rather than narrowing the constraint over its row.

### Task 3: Routes

Current source: `cloud/epl-guess.mjs` owns fixed-field reads, open-account visibility, member-only writes, exact-week gate/readiness, bounded server weeks, shared safe-price validation, structured refusals and uncertain-save readback. The additive M-36 wrapper checks time after its fixture lock; no fallback to M-32's older cached-time writer. See the linked API record for request/response/error and launch prerequisites. Do not check off a historical expected-failure step or hosted acceptance from these source checks.

**Files:** Modify `cloud/epl.mjs` (`'/epl/guess/read'`, `'/epl/guess/save'` `{eventId, club, price, lock}`, `'/epl/guess/leaderboard'`); Test `tests/epl-guess-routes.test.mjs`
- [x] Source and SQL/HTTP acceptance implemented; combined CI and release remain pending. Original acceptance: invalid price → 400 `GTL_EPL_GUESS_INVALID`; locked → 409; closed → 409 with the draft echoed back; save with `lock:true` triggers one shared quota-limited refresh attempt (fake) and never fails because of it; FAIL → implement → PASS → commit `feat(epl): moneyline guess routes`.

### Task 4: Collector

Current source: [M-36 collector follow-on](../../EPL_MONEYLINE_COLLECTOR_2026_10_29.md), published at latest reviewed source `88897f0d586edba2e6fdbf657ae1d97dd4d0435c`, adds durable shared event leases, bounded budget admission, both-club provenance and atomic pending-reference resolution; safe post-lock save wrapper and pure readiness reader protect Task 3. Source tests pass; **M-36 is not applied, moneyline collection remains absent/disabled pending explicit authorized setup, and live acceptance remains open.** Root owns release/global task status.

**Files:** Modify `cloud/epl-sources.mjs` (`fetchEplDrawNoBet({apiKey, fetchImpl, eventIds})`), `cloud/epl-jobs.mjs` (`fixtures` job schedules DNB collection at week open and 3 h before each kickoff; `resolve-references` after each collection); Test `tests/epl-dnb.test.mjs`
- [x] Source and actual SQL/collector acceptance implemented; M-36 apply/activation and release remain pending. Original acceptance: Review Focus 5; credit floor 50; collection only for events not yet kicked off; FAIL → implement → PASS → commit `feat(epl): draw-no-bet collection and pending reference resolution`.

### Task 5: Play → Guess the Line and Leaderboard screens

**Files:** Create `web/src/next/epl/guess/GuessList.jsx`, `GuessCard.jsx`, `PriceStepper.jsx`, `GuessLeaderboard.jsx`, `DistanceLine.jsx`, `guess.css`; Modify `web/src/next/epl/EplApp.jsx` (Play sub-tabs Guess the Line and Leaderboard replace Plan 1 placeholders), `web/src/next/epl/EplHome.jsx` (button "Guess this weekend's moneylines · N of M"); Test `tests/epl-guess.test.jsx`
Match mockup v3 "Play · Guess the Line": progress dots (locked = win color), hero card for the next unlocked match with both crests, favorite toggle, price stepper (steps of 5 on the `toLine` scale, so −105 → +100 → +105 and +100 is shown as "+100 / −100 (even)"; typing any valid price allowed), Lock in button, note "Final once locked · measured vs the real price at lock-in"; later matches list; result card with guess vs real bubbles and the distance line; leaderboard bars by average with "N guessed".
- [x] Source, shared-shell wiring and real-service phone-width/accessibility acceptance implemented; production release remains pending. Original acceptance: stepper from −105 up → +100, then +105; Lock in posts `{lock:true}`; closed error keeps draft and shows "This match has kicked off. Your draft wasn't locked."; leaderboard renders average with 1 decimal; FAIL → implement (tokens only) → PASS → commit `feat(epl): Guess the Line moneyline screens`.

### Task 6: Docs

**Files:** `docs/DECISIONS.md` (D-68 addendum: distance math, leaderboard by average), `docs/RULES.md` (EPL moneyline row), `docs/COMPLETION_REGISTER.md`, `planning/PLATFORM_WORK_QUEUE.md`.
- [ ] Write; `python3 scripts/check-brand-docs.py`; `npm test`; commit `docs(epl): moneyline records`.
