# EPL Guess the Line (2-way moneyline) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The 8 FEPL managers guess, per EPL match, the favorite and its 2-way (draw no bet) moneyline price; each guess is scored by distance from the real price at lock-in; a leaderboard ranks lowest average distance per match guessed.

**Architecture:** Pure rules in `shared/epl-moneyline.mjs`; migration M-31 (guess, reference and history tables + RPCs, service-only); `cloud/epl.mjs` routes `epl/guess/*`; Plan 1 `gtl-epl-jobs` `fixtures` job also collects `draw_no_bet` per event and resolves pending references; UI under `web/src/next/epl/guess/`.

**Tech Stack:** as Plan 1.

**Spec:** `docs/superpowers/specs/2026-10-28-epl-fantasy-and-moneyline-design.md` section 7. Depends on Plan 1 (fixtures, prices, member check, EplApp).

## Global Constraints

- Only the 8 FEPL managers (Plan 1 `gtl_epl_member` returns an owner_id; the commissioner without an FEPL row cannot guess).
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

### Task 0 (gate): live draw-no-bet check — stop if it fails

**Files:** Create `scripts/epl-dnb-check.mjs` (reads `THE_ODDS_API_KEY` from env, lists `soccer_epl` events, fetches `/v4/sports/soccer_epl/events/<id>/odds?regions=us&markets=draw_no_bet&bookmakers=draftkings,fanduel,betmgm&oddsFormat=american` for at most 3 events, prints per event the books present, both prices, and `x-requests-remaining`; refuses to run if remaining < 60); record the output in `docs/ODDS_PROVIDER_EVALUATION.md` (dated row).
- [ ] Run on the Mac mini (where the key lives): `THE_ODDS_API_KEY=… node scripts/epl-dnb-check.mjs`.
- [ ] **Exit criteria:** ≥ 2 of 3 events return `draw_no_bet` from ≥ 2 of the 3 books with two prices each. If not met: stop this plan and bring the output to Sean (spec section 9). If the market key differs (e.g. only via `h2h_lay`/alternate), stop and bring it to Sean.
- [ ] Commit `docs(epl): live draw-no-bet check result`.

### Task 1: Moneyline rules (`shared/epl-moneyline.mjs`)

**Files:** Create `shared/epl-moneyline.mjs`; Test `tests/epl-moneyline.test.mjs`
**Interfaces:** Produces `toLine(price: number) -> number`, `distance(guess: number, real: number) -> number`, `validPrice(p) -> boolean`, `median(prices: number[]) -> number|null` (on the `toLine` scale, converted back; even count → mean of middle two on the line scale, rounded to integer American), `leaderboard(rows: {ownerId, distance: number|null}[]) -> {ownerId, average: number, guessed: number, unscored: number}[]` (sorted average asc, then guessed desc, then ownerId).
- [ ] Step 1: failing tests: `distance(-110, 120) === 30`; `distance(-150, -120) === 30`; `distance(100, -100) === 0`; `distance(-105, 105) === 10`; `validPrice(99) === false`, `validPrice(-100) === true`; `median([-110, 120])` → `105` (line −10 and 20 → 5 → +105); `leaderboard` average ties broken by guessed.
- [ ] Step 2 FAIL → Step 3 implement → Step 4 PASS → Step 5 commit `feat(epl): moneyline distance and leaderboard rules`.

### Task 2: Migration M-31 (guesses)

**Files:** Create `supabase/migrations/<stamp>_gtl_epl_moneyline.sql` (stamp after M-30); Modify `tests/migrations.mjs` (`NOT_HOSTED`), `docs/REDESIGN_BUILD_PLAN.md` §6 (M-31 row, apply after M-30); Test `tests/epl-moneyline-sql.test.mjs` (PGlite, like Plan 1's `tests/epl-migration-sql.test.mjs`)
**Interfaces:** Tables `gtl_epl_guesses(season, week, event_id, owner_id, club, price int, status text check in ('draft','locked'), locked_at, reference_price int null, reference_observed_at, reference_source text check in ('at-lock','first-after'), distance int null, primary key(event_id, owner_id))`, `gtl_epl_guess_history` (every save); prices from Plan 1 `gtl_epl_prices` with `market='draw_no_bet'`. RPCs (service-only, invoker): `gtl_epl_save_guess(p_user, p_event_id, p_club, p_price, p_lock boolean, p_now)` (errors `GTL_EPL_GUESS_LOCKED`, `GTL_EPL_GUESS_CLOSED`, `GTL_EPL_GUESS_INVALID`, `GTL_EPL_FORBIDDEN`; on lock sets reference from newest stored DNB median for that club at or before `p_now`, else pending), `gtl_epl_resolve_pending_references(p_event_id)` (first price observed after `locked_at` and before kickoff), `gtl_epl_guess_board(p_user, p_season, p_week)` (own guesses + others' only where locked-by-viewer or kicked off), `gtl_epl_guess_leaderboard(p_season)`.
- [ ] Failing SQL tests for Review Focus 1, 3, 4; FAIL → write migration → PASS → commit `feat(epl): M-31 moneyline guesses (not applied)`.

### Task 3: Routes

**Files:** Modify `cloud/epl.mjs` (`'/epl/guess/read'`, `'/epl/guess/save'` `{eventId, club, price, lock}`, `'/epl/guess/leaderboard'`); Test `tests/epl-guess-routes.test.mjs`
- [ ] Failing tests: invalid price → 400 `GTL_EPL_GUESS_INVALID`; locked → 409; closed → 409 with the draft echoed back; save with `lock:true` triggers one shared quota-limited refresh attempt (fake) and never fails because of it; FAIL → implement → PASS → commit `feat(epl): moneyline guess routes`.

### Task 4: Collector

**Files:** Modify `cloud/epl-sources.mjs` (`fetchEplDrawNoBet({apiKey, fetchImpl, eventIds})`), `cloud/epl-jobs.mjs` (`fixtures` job schedules DNB collection at week open and 3 h before each kickoff; `resolve-references` after each collection); Test `tests/epl-dnb.test.mjs`
- [ ] Failing tests: Review Focus 5; credit floor 50; collection only for events not yet kicked off; FAIL → implement → PASS → commit `feat(epl): draw-no-bet collection and pending reference resolution`.

### Task 5: Play → Guess the Line and Leaderboard screens

**Files:** Create `web/src/next/epl/guess/GuessList.jsx`, `GuessCard.jsx`, `PriceStepper.jsx`, `GuessLeaderboard.jsx`, `DistanceLine.jsx`, `guess.css`; Modify `web/src/next/epl/EplApp.jsx` (Play sub-tabs Guess the Line and Leaderboard replace Plan 1 placeholders), `web/src/next/epl/EplHome.jsx` (button "Guess this weekend's moneylines · N of M"); Test `tests/epl-guess.test.jsx`
Match mockup v3 "Play · Guess the Line": progress dots (locked = win color), hero card for the next unlocked match with both crests, favorite toggle, price stepper (steps of 5 on the `toLine` scale, so −105 → +100 → +105 and +100 is shown as "+100 / −100 (even)"; typing any valid price allowed), Lock in button, note "Final once locked · measured vs the real price at lock-in"; later matches list; result card with guess vs real bubbles and the distance line; leaderboard bars by average with "N guessed".
- [ ] Failing tests: stepper from −105 up → +100, then +105; Lock in posts `{lock:true}`; closed error keeps draft and shows "This match has kicked off. Your draft wasn't locked."; leaderboard renders average with 1 decimal; FAIL → implement (tokens only) → PASS → commit `feat(epl): Guess the Line moneyline screens`.

### Task 6: Docs

**Files:** `docs/DECISIONS.md` (D-66 addendum: distance math, leaderboard by average), `docs/RULES.md` (EPL moneyline row), `docs/COMPLETION_REGISTER.md`, `planning/PLATFORM_WORK_QUEUE.md`.
- [ ] Write; `python3 scripts/check-brand-docs.py`; `npm test`; commit `docs(epl): moneyline records`.
