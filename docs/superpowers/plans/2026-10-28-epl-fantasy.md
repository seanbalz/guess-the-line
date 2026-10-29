# EPL Research → Fantasy (Sleeper FEPL) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Research → Fantasy in the EPL app shows the FEPL league from Sleeper (Matchup, Standings, Rosters, Insights) with projections, weekly scores, season highs and top scorers, in the D-38 hero/glass/chart style.

**Architecture:** Pure scoring/insight math in `shared/epl-fantasy.mjs`; the Plan 1 `gtl-epl-jobs` `snapshot` job is extended to store a trimmed player directory and runs daily; a member-only `epl/fantasy/read` route assembles the view from stored snapshots (no live Sleeper call per request); UI under `web/src/next/epl/fantasy/`.

**Tech Stack:** as Plan 1.

**Spec:** `docs/superpowers/specs/2026-10-28-epl-fantasy-and-moneyline-design.md` section 5 and 8. Depends on Plan 1 (`docs/superpowers/plans/2026-10-28-epl-pick-a-team.md`): `gtl_epl_snapshots`, `gtl_epl_bonus`, `shared/epl-sleeper.mjs`, `shared/epl-clubs.mjs`, `cloud/epl.mjs`, `cloud/epl-jobs.mjs`, `EplApp`.

## Global Constraints

- Plan 1 Global Constraints apply (free sources, never write to Sleeper, member-only visibility, tokens-only UI, public repo).
- Player points = Σ stat × FEPL `scoring_settings["pos_<pos>_<stat>"]`, where `<pos>` ∈ `gk|d|m|f` from the player's position at the time (first entry of `fantasy_positions`, lowercased: `GK→gk, D→d, M→m, F→f`). Projections use the same formula over projected stats (not `pts_std`).
- Weekly team score = `weeklyScores(prev, next)` (Plan 1), the authoritative number; per-player detail is shown only for matchweeks with a stored before-kickoff starters snapshot, and labelled "from saved lineup".
- Standings = Sleeper season points + Σ GTL Pick a Team bonus (`gtl_epl_bonus`), raw Sleeper total shown on tap.
- Sleeper club ids map to crest codes via `team_abbr` (`MCI→MNC`, other abbreviations equal the Plan 1 codes); unknown → no crest, abbreviation text.
- Matchups unavailable (ambiguous pairing) show "Matchup unavailable this week".
- Missing data shows an em dash with a stale note, never 0 (brand guide).
- Win chance = normal approximation: `P = Φ((projA − projB) / (σ·√2))`, σ = 18 points (my call, documented in the screen's info sheet as an estimate).

## Review Focus

1. A starter with no projection row (injured, not in Sleeper's list) → contributes 0 and is marked "No projection", never NaN (Task 1 test).
2. A player whose position changes mid-season → uses the position stored in that week's snapshot (Task 1 test).
3. Snapshot missing for a week → that week shows "—" in charts, not 0, and the line chart breaks the line (Task 3 test).
4. Linked member opens Fantasy before any after-MW snapshot exists for the current season → totals and records from the newest snapshot, "Weekly detail starts MW9" note (Task 2 test).
5. A manager renames their Sleeper display name → still matched by owner_id (Task 2 test).

---

### Task 1: Fantasy math (`shared/epl-fantasy.mjs`)

**Files:** Create `shared/epl-fantasy.mjs`; Test `tests/epl-fantasy.test.mjs`; Fixture `tests/fixtures/epl-fantasy-mw.json` (3 players' stats/projections + the league `scoring_settings` subset they need; no personal data)

**Interfaces:**
- Produces:
  - `playerPoints(stats: Record<string, number>, pos: 'gk'|'d'|'m'|'f', scoring: Record<string, number>) -> number` (2 dp)
  - `positionOf(player: {fantasy_positions?: string[]}) -> 'gk'|'d'|'m'|'f'|null`
  - `teamProjection(starters: string[], projections: Record<playerId, stats>, players: Record<playerId, {fantasy_positions}>, scoring) -> {total: number, rows: [{playerId, points: number|null}]}` (`null` = no projection)
  - `winChance(projA: number, projB: number, sigma = 18) -> number` (0–1, 3 dp)
  - `seasonHigh(weeks: {week, ownerId, points}[]) -> {week, ownerId, points}|null`
  - `topScorers(rows: {ownerId, playerId, points}[]) -> Record<ownerId, {playerId, points}>`
  - `beatProjection(actual: number, projected: number) -> number` (actual − projected, 2 dp)
- [ ] Step 1: failing tests: `playerPoints({g:1, sot:2, min:90}, 'f', {pos_f_g:9, pos_f_sot:2, pos_f_min:0})` → `13`; unknown stat keys ignored; `positionOf({fantasy_positions:['F','M']})` → `'f'`; `teamProjection` with one starter lacking projection → row `points:null`, total excludes it; `winChance(104.2, 98.6)` → `0.587` (σ 18); `winChance(x,x)` → `0.5`; `seasonHigh([])` → `null`.
- [ ] Step 2: `node --test tests/epl-fantasy.test.mjs` → FAIL.
- [ ] Step 3: implement (Φ via Abramowitz–Stegun erf approximation, no imports).
- [ ] Step 4: → PASS.
- [ ] Step 5: commit `feat(epl): fantasy scoring and insight math`.

### Task 2: Snapshot players + `epl/fantasy/read` route

**Files:** Modify `cloud/epl-sources.mjs` (`fetchSleeperSnapshot` also stores `players`: only rostered player ids → `{name, pos: fantasy_positions, team, team_abbr, injury_status}`), `cloud/epl-jobs.mjs` (`snapshot` job: label `daily-<YYYY-MM-DD>` once per day plus the existing before-kickoff/after-week labels), `cloud/epl.mjs` (add `'/epl/fantasy/read':['POST']`), `shared/epl-clubs.mjs` (add `clubFromSleeperAbbr(abbr)`); Create `cloud/epl-fantasy-view.mjs`; Test `tests/epl-fantasy-view.test.mjs`

**Interfaces:**
- Consumes: Task 1; Plan 1 `managersFromSnapshot`, `weeklyScores`, `pairMatchups`, `gtl_epl_bonus`, `gtl_epl_snapshots` (service reads via a new read RPC if Plan 1 has none: `gtl_epl_snapshots_read(p_labels text[])`, added as migration M-31 only if needed, following Plan 1 Gate M rules).
- Produces `buildFantasyView({snapshots, bonus, viewerOwnerId}) -> {week, matchup: {me, opp, myProj, oppProj, winChance, starters: [{playerId, name, pos, club, proj}]}|{unavailable: true}, standings: [{ownerId, name, wins, losses, sleeperTotal, bonus, total}], rosters: [{ownerId, name, starters: [...], bench: [...]}], insights: {seasonHigh, topScorerPerTeam, beatProjection: [{ownerId, week, diff}], weekly: [{week, ownerId, points|null}]}, capturedAt}`; route `epl/fantasy/read {}` → that view for the caller; 403 for non-members.
- [ ] Step 1: failing tests for Review Focus 4 and 5, matchup unavailable, standings total = sleeper + bonus, weekly gap → `null`.
- [ ] Step 2: → FAIL. Step 3: implement. Step 4: → PASS (`npm test`). Step 5: commit `feat(epl): fantasy view route from stored Sleeper snapshots`.

### Task 3: Research → Fantasy (EPL) screens

**Files:** Create `web/src/next/epl/fantasy/EplFantasy.jsx`, `Matchup.jsx`, `Standings.jsx`, `Rosters.jsx`, `Insights.jsx`, `WeeklyLine.jsx`, `fantasy.css`; Modify `web/src/next/epl/EplApp.jsx` (Research tab: replace the Plan 1 placeholder with `EplFantasy`); Test `tests/epl-fantasy.test.jsx`

**Interfaces:** Consumes Task 2 view via `eplApi('fantasy/read')`; Plan 1 `resolveClubCrest`.

Match mockup v3 "Research · Fantasy" and v2 "League" charts: sub-tabs Matchup · Standings · Rosters · Insights; hero matchup card with two glass bubbles (projected totals), gradient win-chance bar and "Win chance N%"; starters list with position tag, crest, name, projection bar and value ("No projection" text when null); projected-vs-actual paired bars for the last 4 weeks; standings as horizontal bars (viewer's bar lime), W–L line; rosters per manager (starters then bench, crests); insights tiles (season high, your top scorer, vs projection) + top scorer per team list + weekly points line (you vs league average, gaps for missing weeks, lime dot on your high). Footer: "From Sleeper · saved <time>".
- [ ] Step 1: failing tests (mock `eplApi`): win chance text `Win chance 59%` for `0.587`; null projection shows `No projection`; missing week renders a gap (two `<polyline>` segments); unavailable matchup text exact; viewer row has `aria-current="true"`.
- [ ] Step 2: → FAIL. Step 3: implement (tokens only). Step 4: `npm test` → PASS incl. `tests/next-tokens.test.mjs`. Step 5: commit `feat(epl): Research Fantasy screens for FEPL`.

### Task 4: Docs

**Files:** Modify `docs/DECISIONS.md` (D-68 addendum: win-chance σ 18 estimate, daily snapshot), `docs/COMPLETION_REGISTER.md` (EPL Fantasy row), `planning/PLATFORM_WORK_QUEUE.md`.
- [ ] Step 1: write; Step 2: `python3 scripts/check-brand-docs.py` and `npm test` pass; Step 3: commit `docs(epl): fantasy records`.
