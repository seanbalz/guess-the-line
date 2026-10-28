# EPL foundation + Pick a Team Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The 8 FEPL managers run the weekly Premier League club draft (Pick a Team) in the app, with automatic order from Sleeper scores plus bonus, queues, deadline auto-picks and widest-margin bonus, behind a new EPL option on the sport switch.

**Architecture:** Pure rules in `shared/epl-*.mjs` (tested with `node:test`), server routes in `cloud/epl.mjs` registered in `gtl-api`, a scheduled worker `gtl-epl-jobs` for Sleeper snapshots, fixtures/results and deadline resolution, one migration (service-only tables + `gtl_epl_*` RPCs), and a `#epl/...` mini-app in `web/src/next/epl/` mounted like NBA's `SportEntry`, drawn with the four-tab bar and D-38 kit.

**Tech Stack:** React (web/src/next), Supabase Postgres + Edge Functions (Deno wrappers over `cloud/*.mjs`), node:test + vitest, The Odds API (free plan), Sleeper public API.

**Spec:** `docs/superpowers/specs/2026-10-28-epl-fantasy-and-moneyline-design.md` (sections 3, 4, 6, 8). Plan 2 (Research → Fantasy EPL) and Plan 3 (EPL moneyline) follow as separate plans.

## Global Constraints

- Free sources only. The Odds API free plan: 500 credits/month shared with NFL; never let EPL drop remaining credits below the existing `reserveCredits=50`.
- League: Sleeper `1395122699423993856`, sport `clubsoccer:epl`, season `2026`.
- Manager map (Sleeper display name → name): nemoheye=Nemo, steezyc9=Cullen, aharrison2=Adam, seanbalz=Sean, NLGooner=Evan, LFCRed=Mark, sthomas111=Steven, Freudian=Darin.
- Bonus: only the widest winning margin among drafted clubs scores `margin × 5`; tiebreak more goals for, then fewer goals against; still tied → every tied manager gets full points; no drafted winner → nobody scores; postponed → 0.
- Order: ascending (last matchweek score + that matchweek's bonus); tie → lower season total first.
- Pick changeable until the next manager picks; last pick final at deadline; deadline = matchweek's first kickoff; one club per manager; a club taken once.
- Deadline: manager on the clock → queue pick or nothing; each later unpicked manager → queue pick, else shortest available 2-way price, falling back to shortest 3-way win price, then higher league position.
- MW9 seeded by hand: order Nemo, Cullen, Adam, Sean, Evan, Mark, Steven, Darin; picks Man City, Aston Villa, Liverpool, Tottenham, Arsenal, Brentford, Newcastle; Darin to pick.
- Never write to Sleeper. Bonus lives in GTL only.
- EPL visible only to accounts linked to an FEPL manager and the commissioner; tables reachable only via service role (no RLS policies), RPCs `security invoker set search_path=''`, service-only grants.
- Migration rules (docs/REDESIGN_BUILD_PLAN.md §4.2): idempotent; filename `supabase/migrations/<YYYYMMDDHHMMSS>_gtl_epl_pick_a_team.sql`; add to `NOT_HOSTED` in `tests/migrations.mjs`; ship `GTL_FEATURE_OFF`-style off switch (schedule row `enabled=false`), never a drop; ledger row M-30; not applied until Sean says "apply M-30". Never `npx supabase db push`.
- UI: tokens only (`tests/next-tokens.test.mjs` gate), D-38 kit `web/src/next/ui/`, 16px reading text, 44px targets, reduced motion honored.
- Crests: self-hosted 128 px under `web/public/team-logos/epl/`, D-46 provenance, notice "Premier League and club names, crests and marks are trademarks of their owners; used here only to identify the clubs. No endorsement."
- Repo is public: no unrevealed picks in static assets. Draft picks are league-visible once made (not secret), but only to linked FEPL members.

## Review Focus

1. Two managers submit picks at the same moment for the same club → exactly one succeeds; the other gets `GTL_EPL_CLUB_TAKEN` (Task 3 test).
2. A manager tries to pick out of turn, or after the deadline → `GTL_EPL_NOT_YOUR_TURN` / `GTL_EPL_DRAFT_CLOSED` (Task 3 test).
3. Deadline resolver runs twice (cron retry) → idempotent, same final picks (Task 5 test).
4. A queued club is taken by an earlier auto-pick in the same resolution pass → falls to the next queued club (Task 1 test).
5. Results arrive for only some matches when settlement runs → bonus not settled until every drafted club's match is final or postponed (Task 1 test `settleBonus` returns `{ready:false}`).

---

### Task 1: Pure draft rules (`shared/epl-draft.mjs`)

**Files:**
- Create: `shared/epl-draft.mjs`
- Test: `tests/epl-draft.test.mjs`

**Interfaces:**
- Produces:
  - `pickOrder(managers: {id, weekScore: number, weekBonus: number, seasonTotal: number}[]) -> string[]` (ids, first pick first)
  - `onTheClock(order: string[], picks: {managerId, club}[]) -> string|null`
  - `canPick({order, picks, managerId, club, clubs: string[], now: Date, deadline: Date}) -> {ok: true} | {ok: false, code: 'GTL_EPL_NOT_YOUR_TURN'|'GTL_EPL_CLUB_TAKEN'|'GTL_EPL_DRAFT_CLOSED'|'GTL_EPL_CLUB_NOT_PLAYING'}` — "your turn" includes changing your own pick while you are the latest picker.
  - `resolveDeadline({order, picks, queues: Record<managerId, string[]>, clubs: string[], favorability: Record<club, {twoWay?: number, threeWay?: number, position: number}>}) -> {managerId, club, source: 'pick'|'queue'|'auto'|'none'}[]`
  - `marginRank(result: {club, goalsFor, goalsAgainst, status: 'final'|'postponed'|'pending'})` helper, and `settleBonus(picks: {managerId, club}[], results: Record<club, result>) -> {ready: boolean, awards: Record<managerId, number>, winners: string[]}`
  - `priceStrength(americanOdds: number) -> number` (shorter price = larger number; implied probability).

- [ ] **Step 1: Write the failing tests** in `tests/epl-draft.test.mjs` (`node:test`, `assert/strict`), including:
  - `pickOrder`: `[{id:'a',weekScore:90,weekBonus:0,seasonTotal:800},{id:'b',weekScore:80,weekBonus:15,seasonTotal:700},{id:'c',weekScore:95,weekBonus:0,seasonTotal:650}]` → `['a','c','b']` (a=90 first; b and c tie at 95, c has the lower season total).
  - `onTheClock(['n','c','d'], [{managerId:'n',club:'MNC'}])` → `'c'`; all picked → `null`.
  - `canPick` change rule: order `['n','c']`, picks `[{n,MNC}]`, n repicks `'ARS'` → ok; after c picks, n repick → `GTL_EPL_NOT_YOUR_TURN`; c picks `'MNC'` → `GTL_EPL_CLUB_TAKEN`; `now >= deadline` → `GTL_EPL_DRAFT_CLOSED`; club not in `clubs` → `GTL_EPL_CLUB_NOT_PLAYING`.
  - `resolveDeadline`: order `[n,c,a,s]`, picks `[{n,MNC}]`, c on the clock with no queue → `{c, club:null, source:'none'}`; a queue `['MNC','ARS']` → `ARS` (`queue`); s no queue, favorability `LIV twoWay -200`, `CHE twoWay -150` → `LIV` (`auto`); queued club taken by an earlier auto in the same pass falls to the next queued club.
  - `resolveDeadline` fallback: no `twoWay` for any club → uses `threeWay`; none → lower `position` (1 = top of table) wins.
  - `settleBonus`: picks ARS(3-0), MNC(2-0) → `{ready:true, awards:{ARS-manager:15}, winners:[..]}`; ARS 3-1 vs TOT 2-0 (both +2, ARS 3 goals for) → ARS only, 10; ARS 2-0 vs TOT 2-0 → both 10; no drafted winner → `awards:{}`; a `pending` drafted match → `ready:false`; postponed club → 0 and doesn't block.
  - `priceStrength(-200) > priceStrength(-150) > priceStrength(+120)`.

- [ ] **Step 2: Run to verify failure:** `node --test tests/epl-draft.test.mjs` → FAIL (module not found).
- [ ] **Step 3: Implement** the exports above in `shared/epl-draft.mjs`. Pure, no imports. `priceStrength` = implied probability (`-x → x/(x+100)`, `+x → 100/(x+100)`).
- [ ] **Step 4: Run to verify pass:** `node --test tests/epl-draft.test.mjs` → PASS.
- [ ] **Step 5: Commit:** `git add shared/epl-draft.mjs tests/epl-draft.test.mjs && git commit -m "feat(epl): pure Pick a Team rules"`

### Task 2: Sleeper snapshot math (`shared/epl-sleeper.mjs`)

**Files:**
- Create: `shared/epl-sleeper.mjs`
- Test: `tests/epl-sleeper.test.mjs`
- Fixture: `tests/fixtures/epl-sleeper-after-mw08.json` (trimmed copy of `data/epl/sleeper-snapshots/2026-10-28-after-mw08.json`: `users`, `rosters` with only `owner_id`, `roster_id`, `settings`, `starters`; no stats/projections)

**Interfaces:**
- Produces:
  - `MANAGER_NAMES` frozen map (Global Constraints).
  - `seasonPoints(settings) -> number` (`fpts + fpts_decimal/100`), `seasonAgainst(settings) -> number`.
  - `managersFromSnapshot(snapshot) -> {ownerId, rosterId, sleeperName, name, seasonTotal, seasonAgainst, wins, losses}[]`
  - `weeklyScores(prev, next) -> Record<ownerId, {for: number, against: number}>` (rounded to 2 dp)
  - `pairMatchups(weekly) -> {pairs: [ownerId, ownerId][], unpaired: ownerId[]}` — pair A,B where `A.against === B.for` and `B.against === A.for`; ambiguous (more than one candidate) → unpaired.

- [ ] **Step 1: Failing tests:** fixture gives 8 managers; `seasonPoints({fpts:918,fpts_decimal:75})` → `918.75`; `managersFromSnapshot(fixture)` finds `NLGooner` → name `Evan`, seasonTotal `918.75`; synthetic prev/next pair: A for+100 against+90, B for+90 against+100 → one pair; equal scores for C and D with two candidates → `unpaired`.
- [ ] **Step 2:** `node --test tests/epl-sleeper.test.mjs` → FAIL.
- [ ] **Step 3: Implement** in `shared/epl-sleeper.mjs`.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(epl): Sleeper snapshot math`.

### Task 3: Migration M-30 and service RPCs

**Files:**
- Create: `supabase/migrations/20261028180000_gtl_epl_pick_a_team.sql`
- Modify: `tests/migrations.mjs` (add version to `NOT_HOSTED`)
- Modify: `docs/REDESIGN_BUILD_PLAN.md` §6 (ledger row M-30: "EPL Pick a Team tables + RPCs", risk low/additive, apply after M-29)
- Test: `tests/epl-migration.test.mjs` (static SQL checks, like other migration tests)

**Interfaces:**
- Produces tables (all `enable row level security`, `revoke all … from public,anon,authenticated`, grants to `service_role` only):
  - `gtl_epl_managers(owner_id text pk, sleeper_name text, name text, user_id uuid null references auth.users, linked_by uuid, linked_at timestamptz)`
  - `gtl_epl_snapshots(id bigserial pk, captured_at timestamptz, label text, week int, sha256 jsonb, payload jsonb, unique(label))`
  - `gtl_epl_weeks(season int, week int, window_start timestamptz, window_end timestamptz, first_kickoff timestamptz, pick_order text[], status text check in ('open','resolved','settled'), seeded boolean default false, primary key(season, week))`
  - `gtl_epl_fixtures(event_id text pk, season int, week int, home text, away text, commence_time timestamptz, status text check in ('scheduled','final','postponed'), home_goals int, away_goals int, updated_at timestamptz)`
  - `gtl_epl_prices(event_id text, club text, market text check in ('h2h','draw_no_bet'), price numeric, observed_at timestamptz, primary key(event_id, club, market))`
  - `gtl_epl_picks(season int, week int, owner_id text, club text, source text check in ('pick','queue','auto','none','seeded'), picked_at timestamptz, final boolean default false, primary key(season, week, owner_id), unique(season, week, club))` — the `unique(season,week,club)` enforces Review Focus 1.
  - `gtl_epl_pick_history(id bigserial, season, week, owner_id, club, action text, at timestamptz)` — every pick/change kept (D-23: nothing deleted).
  - `gtl_epl_queues(season int, week int, owner_id text, clubs text[], updated_at timestamptz, primary key(season, week, owner_id))`
  - `gtl_epl_bonus(season int, week int, owner_id text, points int, margin int, club text, primary key(season, week, owner_id))`
  - `gtl_epl_jobs_schedule(job text pk, enabled boolean default false, endpoint text, authorized_by text)` and `gtl_epl_job_runs(id uuid pk, job text, capability_hash text, status text, started_at, finished_at, detail jsonb)` — same pattern as `20261009150000_gtl_auto_open_week.sql:36-92`.
- Produces RPCs (`language plpgsql security invoker set search_path=''`, service-only): `gtl_epl_member(p_user uuid) -> text|null` (owner_id or `'commissioner'` via `gtl_memberships.role='commissioner'`), `gtl_epl_save_pick(p_user uuid, p_season int, p_week int, p_club text, p_now timestamptz) -> jsonb` (row-locks the week, re-checks turn/deadline/club in SQL, writes pick + history, marks the previous picker's pick `final`), `gtl_epl_save_queue(...)`, `gtl_epl_week_state(p_season, p_week) -> jsonb`.

- [ ] **Step 1: Failing test** `tests/epl-migration.test.mjs`: file exists; contains `unique (season, week, club)`; every `create table` has `enable row level security`; no `security definer`; every function has `revoke all on function` + `grant execute … to service_role`; every `create` is `if not exists`/`or replace`; version listed in `NOT_HOSTED`.
- [ ] **Step 2:** `node --test tests/epl-migration.test.mjs tests/migrations.test.mjs` → FAIL.
- [ ] **Step 3: Write the migration** (and ledger row). `gtl_epl_save_pick` uses `select … for update` on the `gtl_epl_weeks` row so concurrent picks serialize; unique violation → raise `GTL_EPL_CLUB_TAKEN`.
- [ ] **Step 4:** tests → PASS; `npm test` still green.
- [ ] **Step 5: Commit** `feat(epl): M-30 Pick a Team tables and RPCs (not applied)`.

### Task 4: `cloud/epl.mjs` routes in gtl-api

**Files:**
- Create: `cloud/epl.mjs`
- Modify: `cloud/handler.mjs` (`ROUTE_GROUPS` ~83-93, `ROUTE_MODULES` ~97-101: add `{ service: 'epl', methods: EPL_METHODS, handle: handleEpl, Error: EplError }`)
- Modify: `supabase/functions/gtl-api/index.ts` (pass an `epl` service built by `createEplService({ rpc })`)
- Test: `tests/epl-routes.test.mjs`; `tests/route-modules.test.mjs` must stay green.

**Interfaces:**
- Consumes: Task 1 `canPick`, `onTheClock`; Task 3 RPC names.
- Produces `EPL_METHODS = {'/epl/draft/read':['POST'], '/epl/draft/pick':['POST'], '/epl/queue/save':['POST'], '/epl/admin/link':['POST'], '/epl/admin/week':['POST'], '/epl/admin/snapshot':['POST']}` (`admin/snapshot {label, capturedAt, sha256, payload}` → insert into `gtl_epl_snapshots`, unique by label, commissioner only) and `handleEpl({route, body, user, service})`:
  - `draft/read {season?, week?}` → `{week, deadline, order:[{ownerId,name}], picks, onTheClock, clubs:[{code,name,opponent,kickoff}], myQueue, bonusLastWeek}`; 403 `GTL_EPL_FORBIDDEN` if `gtl_epl_member` is null.
  - `draft/pick {club}` → calls `gtl_epl_save_pick`; maps codes to 409.
  - `queue/save {clubs: string[]}` (≤ 20, unique, playing this week).
  - `admin/link {ownerId, userId|null}` and `admin/week {season, week, windowStart, windowEnd, order?, picks?}` (commissioner only; `order`/`picks` only accepted while `seeded=true` or before the first pick — used for MW9).

- [ ] **Step 1: Failing tests** with a fake `service.rpc`: non-member → 403 `GTL_EPL_FORBIDDEN`; member `draft/read` shape; `draft/pick` maps RPC error `GTL_EPL_CLUB_TAKEN` → 409; `admin/link` by non-commissioner → 403; `queue/save` rejects duplicates and > 20.
- [ ] **Step 2:** `node --test tests/epl-routes.test.mjs tests/route-modules.test.mjs` → FAIL.
- [ ] **Step 3: Implement** and register.
- [ ] **Step 4:** → PASS; `npm test` green.
- [ ] **Step 5: Commit** `feat(epl): gtl-api routes for Pick a Team`.

### Task 5: `gtl-epl-jobs` worker (snapshots, fixtures/results, prices, deadline, settle, turn nudge)

**Files:**
- Create: `cloud/epl-jobs.mjs`, `cloud/epl-sources.mjs`, `supabase/functions/gtl-epl-jobs/index.ts`, `supabase/admin/epl_jobs_cron.sql` (hand-registered, like `odds_refresh_cron_d61.sql`)
- Test: `tests/epl-jobs.test.mjs`, `tests/epl-sources.test.mjs`

**Interfaces:**
- Consumes: Task 1 `resolveDeadline`, `settleBonus`, `pickOrder`; Task 2 `weeklyScores`, `managersFromSnapshot`; `cloud/web-push.mjs` `sendWebPush`; `cloud/odds-provider.mjs` `readQuota`.
- Produces in `cloud/epl-sources.mjs`:
  - `fetchSleeperSnapshot({fetchImpl, label, statsWeek, projectionsWeek}) -> {capturedAt, label, sha256, payload}` (same endpoints and shape as `/Users/seanbalsiger/gtl-epl-snapshots/snapshot.py`).
  - `fetchEplOdds({apiKey, fetchImpl}) -> {events: [{eventId, home, away, commenceTime, h2h: Record<club, price>}], quota}` — `GET /v4/sports/soccer_epl/odds?regions=us&markets=h2h&bookmakers=draftkings,fanduel,betmgm&oddsFormat=american` (1 credit), median per club across books.
  - `fetchEplScores({apiKey, fetchImpl, daysFrom: 3}) -> {scores: [{eventId, completed, home, away, homeGoals, awayGoals}], unmapped: [eventId]}` (2 credits; pre-T8 fix wave: unmapped events are reported apart).
  - `ESPN_ABBR` map from Odds API team names → crest codes (20 clubs, Task 6 list).
- Produces in `cloud/epl-jobs.mjs` `createEplJobsHandler({service, sources, push, clock})` with jobs: `snapshot` (Sleeper, stored by label `after-mw<N>` / `before-mw<N>-kickoff`), `fixtures` (odds + events for the open week's window; refuses if remaining credits − cost < 50), `resolve` (at/after `first_kickoff`, idempotent: only rows not `final`), `settle` (when `settleBonus().ready`, writes `gtl_epl_bonus`, then creates the next week with `pickOrder` from `weeklyScores(after-mw<N-1>, after-mw<N>)` + bonus, `window_start = previous window_end`, `window_end = +7 days`), `nudge` (push the on-the-clock manager once per turn; skips without a `gtl_push_subscriptions` row).
- Plan decision: a matchweek's fixtures are the Odds API EPL events with `commence_time` in `[window_start, window_end)`; the commissioner can correct the window with `admin/week`. MW9 window: `2026-10-30T00:00Z`–`2026-11-04T00:00Z`. Final review amendment: a gap of more than 36 hours between kickoffs ends the round, and the window then ends 24 hours after the round's last kickoff (`roundEnd` in `cloud/epl-jobs.mjs`), so a midweek round never merges with the weekend round; `after-mw<N>` is saved only while Sleeper's state is on week N+1.

- [ ] **Step 1: Failing tests** with fake fetch and fake service: `fixtures` skips when `x-requests-remaining` would drop below 50; `resolve` twice → same rows, second run writes nothing (Review Focus 3); `settle` with a pending drafted match → no write (Review Focus 5); `settle` complete → bonus rows + next week order; `nudge` sends once per turn (dedupe key `season-week-ownerId-pickCount`); Odds API name `Tottenham Hotspur` → `TOT`.
- [ ] **Step 2:** `node --test tests/epl-jobs.test.mjs tests/epl-sources.test.mjs` → FAIL.
- [ ] **Step 3: Implement**; Deno wrapper reads `THE_ODDS_API_KEY`, VAPID vars as `gtl-push-reminders/index.ts` does, and verifies the run token like `gtl-week-open`.
- [ ] **Step 4:** → PASS; `npm test` green.
- [ ] **Step 5: Commit** `feat(epl): jobs worker for snapshots, fixtures, deadline and bonus`.

### Task 6: EPL crests

**Files:**
- Create: `scripts/fetch-epl-crests.py` (one-time; Pillow LANCZOS to 128 px, records sha256 before/after), `web/public/team-logos/epl/<CODE>.png` × 20, `web/public/team-logos/epl/sources.json` (same entry shape as `web/public/team-logos/sources.json` `assets.ARI`, `rightsBasis:"trademark-identification"`, `licensed:false`)
- Modify: `web/src/teamLogoRegistry.js` (add `resolveClubCrest(code)` + `EPL_TRADEMARK_NOTICE`), `web/public/terms.html` (~line 64: add the EPL notice), `docs/TEAM_LOGO_SOURCES.md` (EPL section)
- Test: `tests/epl-crests.test.mjs`

**Interfaces:**
- Produces `EPL_CLUBS` (in `shared/epl-clubs.mjs`): `[{code, name, espnId}]` for BOU 349, ARS 359, AVL 362, BRE 337, BHA 331, CHE 363, COV 388, CRY 384, EVE 368, FUL 370, HUL 306, IPS 373, LEE 357, LIV 364, MNC 382, MUN 360 (ESPN abbr `MAN`), NEW 361, NFO 393, SUN 366, TOT 367. Source URL `https://a.espncdn.com/i/teamlogos/soccer/500/<espnId>.png`.
- `resolveClubCrest(code) -> {src, alt} | null`.

- [ ] **Step 1: Failing test:** 20 files exist, each 128 px on its long side, sha256 matches `sources.json`, every `EPL_CLUBS` code has an entry, `terms.html` contains the exact notice.
- [ ] **Step 2:** `node --test tests/epl-crests.test.mjs` → FAIL.
- [ ] **Step 3:** run `python3 scripts/fetch-epl-crests.py` (from the Mac with network), add registry function and notice.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(epl): self-hosted club crests with provenance`.

### Task 7: EPL mini-app shell and sport switch

**Files:**
- Create: `web/src/next/epl/route.js`, `web/src/next/epl/EplApp.jsx`, `web/src/next/epl/api.js`, `web/src/next/epl/epl.css`
- Modify: `web/src/next/nba/NbaApp.jsx` (`SportEntry` ~61-90 also routes `#epl/...`; Segmented options add `{value:'epl',label:'EPL'}` only when `useEplAccess()` is true), `web/src/next/shell/Frame.jsx:41-42` (same option), `web/src/next/nba/route.js` (`navigateSport` accepts `#epl/...`)
- Test: `tests/epl-route.test.mjs`, `tests/epl-app.test.jsx` (vitest)

**Interfaces:**
- Produces `eplRoute(hash) -> {tab: 'home'|'play'|'bets'|'research', section?: 'pick'|'guess'|'leaderboard'|'fantasy'} | null` matching `/^#epl\/(home|play|bets|research)(?:\/(\w+))?/`; `eplHash(route) -> string`; `eplApi(action, body, options)` → `cloudApi('epl/'+action, …)`; `useEplAccess() -> boolean` (calls `epl/draft/read` once, true unless 403).
- `EplApp` renders the four-tab bar (Home / Play / Bets / Research) with the D-38 kit; Bets shows an empty state "Bets aren't available for the Premier League."; Play has sub-tabs Guess the Line (placeholder "Coming next" card until Plan 3), Pick a Team, Leaderboard (placeholder until Plan 3); Research shows Fantasy (placeholder until Plan 2).

- [ ] **Step 1: Failing tests:** `eplRoute('#epl/play/pick')` → `{tab:'play',section:'pick'}`; `eplRoute('#nba/games')` → `null`; vitest: Segmented shows EPL only when access true; Bets empty-state text exact.
- [ ] **Step 2:** `npm test` → FAIL on new tests.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm test` → PASS (including `tests/next-tokens.test.mjs`).
- [ ] **Step 5: Commit** `feat(epl): EPL sport option and four-tab mini-app shell`.

### Task 8: Pick a Team screen and EPL Home

**Files:**
- Create: `web/src/next/epl/PickATeam.jsx`, `web/src/next/epl/DraftBoard.jsx`, `web/src/next/epl/QueueSheet.jsx`, `web/src/next/epl/EplHome.jsx`, `web/src/next/epl/MarginChart.jsx`
- Test: `tests/epl-pick.test.jsx`

**Interfaces:**
- Consumes: Task 4 `draft/read`, `draft/pick`, `queue/save`; Task 6 `resolveClubCrest`; Task 1 `onTheClock` (client hint only; server decides).
- Matches mockup v3 screens "Home" and "Play · Pick a Team": hero card with 4×2 glass bubble nodes (number badge, crest, manager name; on-the-clock node lime glow with "?"), primary button "<Name> is on the clock" / "Pick <Club>" when it's you, available-club crest grid (taken clubs not shown), "Set my backup ranking (queue)" opening a sheet with reorderable list, last week's margin bars with the winner's `+N pts`, deadline line "Locks <day> <time> PT · widest win = margin × 5". Home: countdown to first kickoff, "<Name> picks next · X of 8 in", tiles for your club and standing.

- [ ] **Step 1: Failing tests** (mock `eplApi`): renders 8 nodes in order with names; on-the-clock node has `aria-current="step"`; when it's the viewer's turn, tapping a crest then "Pick Chelsea" calls `draft/pick {club:'CHE'}`; 409 `GTL_EPL_CLUB_TAKEN` shows toast "Someone just took that club. Pick another." and refreshes; after deadline buttons are disabled with "Draft locked".
- [ ] **Step 2:** `npx vitest run tests/epl-pick.test.jsx` → FAIL.
- [ ] **Step 3: Implement** with `web/src/next/ui/` components and `charts/` geometry; tokens only.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(epl): Pick a Team draft board and EPL Home`.

### Task 9: MW9 seed, snapshot import and docs

**Files:**
- Create: `scripts/epl-seed-mw09.mjs` (calls `admin/week` and `admin/link` against a target URL with the commissioner's session token from env; dry-run by default, `--apply` to write), `scripts/epl-import-snapshots.mjs` (reads `/Users/seanbalsiger/gtl-epl-snapshots/*.json` and posts each to `admin/snapshot` with its label and stored `sources.*.sha256`; the hashes are of the original responses and are recorded, not re-checked)
- Modify: `docs/DECISIONS.md` (new `## D-67 — Premier League: Sleeper FEPL, Pick a Team and EPL moneyline (October 28, 2026)` summarizing the spec's rules; approved by Sean October 28), `docs/COMPLETION_REGISTER.md` (row "EPL Pick a Team": implemented locally, not deployed; open: M-30 apply, crons, MW10 run), `planning/PLATFORM_WORK_QUEUE.md` (step row)
- Test: `tests/epl-seed.test.mjs` (seed script builds exactly the MW9 order and 7 picks from Global Constraints, source `seeded`, dry-run makes no request)

- [ ] **Step 1: Failing test** for the seed payload.
- [ ] **Step 2:** `node --test tests/epl-seed.test.mjs` → FAIL.
- [ ] **Step 3: Implement** scripts and docs.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(epl): MW9 seed, snapshot import and D-67 records`; push branch, open draft PR, run `npm run sync:check`, report branch, commit, PR and that M-30 is not applied.

### Task 10: Release target `epl-jobs` for the new Edge Function

**Files:**
- Modify: `.github/workflows/release.yml` (add `epl-jobs` to the `target` options and description; add a deploy step `if: inputs.mode == 'deploy' && inputs.target == 'epl-jobs'` running `./node_modules/.bin/supabase functions deploy gtl-epl-jobs --project-ref "$SUPABASE_PROJECT_REF" --use-api`, mirroring the `fantasy-ingest` step exactly), `scripts/release-preflight.mjs` (`EPL_JOBS = 'gtl-epl-jobs'`; `'epl-jobs': Object.freeze({ edgeFunction: EPL_JOBS, pages: false, createsOnFirstDeploy: true })`; the TARGETS usage string; source check requires `supabase/functions/gtl-epl-jobs/index.ts` and the config line), `supabase/config.toml` (`[functions.gtl-epl-jobs]` with `verify_jwt = false`, like `gtl-fantasy-ingest`), `docs/SHARED_DEPLOYMENT.md` (target table row + a dated paragraph like the `fantasy-ingest` one, October 28, 2026)
- Test: the existing release-preflight tests (`tests/release-preflight*.test.mjs` or wherever `TARGETS` is asserted) extended for `epl-jobs`

**Interfaces:** Consumes Task 5's `supabase/functions/gtl-epl-jobs/index.ts` (if Task 5 has not landed yet in this checkout, the source check still names the path; do not create the function here).

- [ ] **Step 1: Failing test:** `TARGETS` includes `epl-jobs`; its config has `edgeFunction: 'gtl-epl-jobs'`, `createsOnFirstDeploy: true`; `release.yml` has exactly one deploy step whose `if` names `epl-jobs`, and no other step's condition selects it; `supabase/config.toml` has `[functions.gtl-epl-jobs]` + `verify_jwt = false`.
- [ ] **Step 2:** run the test → FAIL.
- [ ] **Step 3:** make the four edits.
- [ ] **Step 4:** → PASS; `npm test` green; `python3 scripts/check-brand-docs.py` passes.
- [ ] **Step 5: Commit** `feat(release): epl-jobs deploy target for gtl-epl-jobs`.

## Release (not part of the build; needs Sean)

M-30 apply ("apply M-30"), `gtl-api` + `gtl-epl-jobs` deploy and the cron registration follow docs/SHARED_DEPLOYMENT.md from the Mac mini. Then run the MW9 seed (`--apply`) and snapshot import before Darin's MW9 pick if possible, otherwise after; MW10 order is produced by `settle` once MW9 results and the Tuesday snapshot are in.
