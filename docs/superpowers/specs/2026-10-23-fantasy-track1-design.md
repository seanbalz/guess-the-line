# Fantasy Track 1 design — weekly refresh, accuracy record, game context

Owner: Sean Balsiger · Design approved in chat October 23, 2026 · Status: **written specification approved October 23, 2026 ("Approved"); recorded as D-57.** No code, migration, workflow, release or hosted change is claimed by this document.

## Decisions made in chat

- **October 22:** after the fantasy research review, Sean chose Track 1 first (refresh, accuracy record, Vegas/game context), with Guess the Points designed in parallel ([PR #191](https://github.com/seanbalz/guess-the-lines-repo/pull/191)).
- **October 22, implied team totals and hidden lines:** Fantasy shows a game's implied team totals only when that viewer's spread **and** total for that game are both already visible under D-39 (locked in, sat out, or kicked off). Otherwise it shows a lock line. nflverse matchup context is shown to everyone. Proposed as D-57 below.
- **October 22, publishing path (Option A):** a scheduled GitHub build publishes each snapshot as a release file in this repository; a new signed-in API route reads it; the committed snapshots stay as the fallback.
- **October 23:** the design as presented in chat was approved.

Out of scope for Track 1: usage/opportunity charts (Q12), superflex and TE-premium scoring, D/ST, league sync, player props, and Guess the Points. Track 1 covers queue items Q11 (refresh) and part of Q14 (sourced matchup context).

## Why

The October 22 research (333 evidence records, held locally outside the repository in `Documents\FantasyFootball_Research_20261022`) found that generic fantasy tools are free and crowded, while users repeatedly ask for current data, honest accuracy records and Sunday context such as game situation, kickoff window and weather. Track 1 makes GTL's existing Fantasy tab current and accountable using only data GTL may already use.

## Current state (measured October 22–23)

- The Fantasy tab serves one committed snapshot, 2026 Week 6 (stats through Week 5), generated October 15. As of October 23 it is past its own seven-day stale threshold.
- A dry run on October 22 built Week 7 (519 players, 368 ranked). On October 23, after Thursday Night Football, the same command fails with "Source must end immediately before the selected week": nflverse already holds 70 Week 7 player rows. The current builder cannot refresh a week once its first game is played.
- One full build uses about 1.2 s of CPU (0.94 s of it CSV parsing) on the development PC at Week 7 (stats 2.9 MB, rosters 5.7 MB, schedule 2.2 MB, injuries 0.2 MB). Supabase Edge Functions allow 2 s of CPU per request and the inputs grow every week, so the build must run outside Edge Functions.
- Parsing and validating one 0.78 MB snapshot takes about 6 ms of CPU, which a signed-in API route can afford.
- On October 23, nflverse updated `stats_player_week_2026.csv` at 04:46 UTC and `roster_weekly_2026.csv` / `injuries_2026.csv` at about 06:02 UTC. Rosters contained Week 7 rows but no Week 8 rows yet.
- Every gtl-api route already requires a signed-in, confirmed user. Collected lines are readable only through `/lines/read` and `/lines/game`, which redact each market until D-39 opens it for that viewer. Wind forecasts are readable through `/wind/read`. No GitHub workflow runs on a schedule today, and `release.yml` cannot write to the repository.

## 1. Weekly build and publish

### Schedule and what gets built

A new workflow, `.github/workflows/fantasy-refresh.yml`, runs daily at 11:00 UTC (4 AM PDT / 3 AM PST). This is after nflverse's nightly stats and its 07:00 UTC injury and roster refresh, and before the earliest possible kickoff (13:30 UTC international games), with margin for GitHub's scheduling delay. It also has a manual `workflow_dispatch` with a `dry_run` input that defaults to true.

A pure planner, `planFantasyRefresh({ schedule, stats, index, now })`, decides each run's actions:

- **Completed week S:** the largest week such that every regular-season game in weeks 1..S has stats rows for both teams.
- **Target week W = S + 1** (at most 18).
- **Freeze time F(W):** the first kickoff of week W's weekend slate (the earliest kickoff whose Pacific date is that week's Saturday or Sunday). Thursday and Friday games do not freeze the week.
- **Snapshot W:** rebuilt every run until F(W), so injury and roster changes reach the app each morning. After F(W) it is never rebuilt. If no snapshot for W was ever published, one late build is allowed until W's last kickoff and is flagged `publishedAfterFreeze: true`.
- **Review of week S:** built once week S is complete and a snapshot for S was published (from the release or the committed Week 6 file). It is rebuilt each run until F(W), so Thursday stat corrections are included, then frozen. Before freezing it is labelled PROVISIONAL; afterwards FINAL. For Week 18 the review freezes four days after its last kickoff.
- **Season:** derived from the run date (March–December is that year; January–February the previous year). A new season gets a new release tag automatically.

### Builder changes (`shared/fantasy-build.mjs`)

- Stats rows for the selected week W are allowed and ignored, so partial current-week games (Thursday, Saturday, early Sunday) no longer block a rebuild. The estimates must be identical to a build without those rows.
- The run still fails closed when stats exist for any week after W, when week W is already complete (no historical pseudo-forecasts), or when weeks before W are incomplete.
- Roster fallback: a team without week-W roster rows uses its most recent roster from week W−1 at the latest (byes keep today's rule). Each player's status already names the roster week; the snapshot also records how many teams used a fallback. An older roster fails the build.
- `method.version` becomes `1.1`. The pace formula and all scoring weights are unchanged.

### Snapshot schema version 2

Schema version 2 adds a `matchups` block. For each team and each week before W that it played: the opponent and the summed offensive stats it **allowed** to QB, RB, WR and TE (from the opponents' player rows). The block holds raw stats, not points, so the app can score them under any selected scoring, exactly as it scores players. `validateFantasySnapshot` accepts version 1 (committed files) and version 2. Snapshots still contain no lines, odds, account data or GTL picks.

### Review file

`<season>-review-week-NN` holds, for every player who had a weekly estimate in the published week-N snapshot:

- the estimate stats exactly as published;
- the actual week-N stats, or `null` when nflverse has no stats row for that player;
- the season-average baseline (mean of that player's appearances before week N, with the same two-game minimum as the estimate).

Also recorded: the graded snapshot's checksum and generation time, whether it was published before freeze, the actual-stats source time and checksum, and players who played without an estimate. Metrics are computed in the app under the selected scoring.

### Release layout

- Tag `fantasy-data-<season>`, marked as a prerelease and described as data only, not an app release.
- Every data file is **content-addressed**, for example `2026-week-08.3f9c1a2b.json`, so a published file never changes.
- `index.json` lists every snapshot and review with file name, SHA-256, size, generation time, stats-through week, PROVISIONAL/FINAL and the late-build flag. It is uploaded **last**, after all files it names exist. It is the only asset that is replaced. Old content-addressed files are kept, except that each week retains only its three newest superseded copies.
- Attribution, source URLs, retrieval and update times and checksums travel inside every file, as today.

### Workflow

- Runs only on `main`. `permissions: contents: write` (release assets only), no other secrets, `concurrency: fantasy-refresh` without cancellation.
- No `npm ci`: the builder uses only Node built-ins and repository modules.
- Steps: check out; run `node scripts/fantasy-refresh.mjs`, which fetches the nflverse sources and the current index (and any snapshot it must grade) from the public release URL, plans, builds, validates and writes files to `.local/fantasy-release/`; upload data files; upload `index.json`; read the index and new files back and compare checksums.
- Any failure leaves the previous index untouched and marks the run failed; GitHub's failed-workflow notice is the alert.
- It ships with `workflow_dispatch` only. The `schedule` trigger is added in a follow-up commit after a verified manual run (section 7).

## 2. API route `/fantasy/week`

- `POST /fantasy/week` with an optional `{ season, week }` (both or neither; any other field is a 400). The signed-in requirement comes from the existing handler. No community membership check: the data is public nflverse-derived statistics.
- It reads `https://github.com/seanbalz/guess-the-lines-repo/releases/download/fantasy-data-<season>/index.json` (10 s timeout, 64 KB cap). It then reads the requested snapshot, or the newest if none is named, and the review for the preceding week (15 s timeout, 3 MB cap each). Each file must match its index SHA-256 and its validator, and the week requested must match the week returned.
- Caching: files are cached in memory by checksum (immutable, at most six entries); the index for 10 minutes, with single-flight refresh. If the index cannot be fetched but a cached one exists, the route serves it with `stale: true`.
- Reply: `{ index, snapshot, review | null, source: { retrievedAt, stale } }`. Failures return 503 "Fantasy data is not available right now." A checksum or validation failure is never cached.
- Registered as a `fantasy` route group in `cloud/handler.mjs` with its own error class, following the `lines` and `trends` groups.

## 3. App

### Loading and status

`useFantasySnapshot` asks `/fantasy/week` first when signed in. On a network failure, 5xx or 503 it falls back to the committed snapshot for that week if one exists, else the newest committed one, and says so. It never falls back on 400, 401 or 403, mirroring `web/src/trendsLoaders.js`. Signed-out views use the committed snapshots. The week picker lists the union of published and committed weeks; a selection never briefly shows another week (existing contract).

One status line on the Fantasy screen:

- "Updated Tue 4:12 AM · stats through Week 7"
- "Stale · updated Oct 15" when older than seven days
- "Showing saved Week 6 · live refresh unavailable"

Attribution and method sit behind ⓘ.

### Player context

- **Row:** a single context pill, for example "@ DEN · Sun late", plus the implied team total when it is visible ("@ DEN · Sun late · 24.5"). Rows stay at six numbers or fewer.
- **Kickoff window** from the kickoff in Eastern time: Thu night, Fri, Sat, International (Sunday before noon), Sun early (before 4 PM), Sun late (before 7 PM), Sun night, Mon night.
- **Matchup (everyone):** "DEN allows the 3rd-most Half PPR points to WRs · last 4 games (24.1 per game)", with the season figure beside it. Ranks 1–32 run from most allowed to least, ties share a rank, and fewer than two games shows "—". It is labelled as observed, not predictive.
- **Weather (everyone, signed in):** from the existing `/wind/read` loader. It shows wind, gusts and rain chance with the Open-Meteo credit beside the values (the D-34 exception), "Indoors" for indoor venues, and "Forecast not available yet" outside the forecast window.

### Implied team totals (D-57 as proposed)

The app reads the viewer's existing `/lines/read` reply for the snapshot's week. For the player's game it computes totals only when `spread.visible` and `total.visible` are both true and both values are numbers. The spread is the signed home spread: home = total/2 − spread/2 and away = total/2 + spread/2. For example, a total of 47 with home −3 gives home 25 and away 22.

- **Detail line:** "Implied team total 24.5 · median of DraftKings, FanDuel, BetMGM · 6:15 AM", using the reply's capture time.
- **Hidden market:** "Lock your SEA–DEN spread and total guesses to see the implied team total", naming only the market or markets still hidden.
- **Other states:** a visible market with no qualifying line shows "—". A non-member reply (403) shows nothing. A 503 shows "Lines are not available right now."
- **Rules:** nothing is computed from `mine.lineAtGuess`, a draft, or any redacted field. No line ever enters a Fantasy snapshot, review, static asset or the new route.

### Accuracy card

This is one D-55 glow card on Fantasy's weekly view for the newest review.

- **Header and pill:** "Week 7 estimates: off by 4.8 points per player" in the selected scoring, with "Season average: 5.1" beside it as the honest baseline, and a PROVISIONAL or FINAL pill.
- **Tiles:** at most three: share within 5 points, players graded, and the positions where GTL beat the baseline.
- **Detail:**
  - a table by position (GTL miss, baseline miss, players graded);
  - the five biggest overs and unders, each showing estimate versus actual;
  - "Listed available, no stats row: N" and "Played without an estimate: N". Neither count is scored as zero.
- **ⓘ copy:** a report card for GTL's statistical pace estimates, not a forecast or betting claim.

### Brand

Use the D-38/D-55 rules: one lime action per screen, at most six numbers per card, "—" for missing, PROVISIONAL and FINAL written out, never color alone, fine print behind ⓘ, team abbreviations only, tabular numbers and real minus signs. Use the existing `gx-` components. This extends the approved Fantasy screen with existing patterns rather than opening a new brand category. If Sean wants visual options for the accuracy card or the context pill, five alternatives are produced before the UI is built.

## 4. Failure behavior

| Failure | Result |
| --- | --- |
| nflverse unreachable, checksum or size mismatch, incomplete coverage | Run fails; index unchanged; app keeps the last published data with its update time |
| Week W rosters missing or more than one week old | Run fails until nflverse publishes; earlier snapshot stays current |
| Upload fails mid-run | New content-addressed files may exist unreferenced; index unchanged |
| GitHub unreachable from the API | Cached index served `stale: true`, else 503 and the app falls back to the committed snapshot |
| Lines or wind routes unavailable | Those lines show their own unavailable text; rankings, matchups and accuracy still render |
| Review missing for the previous week | The card says "Not graded: no estimate was published for Week N" |

## 5. Privacy, rights and attribution

Only CC BY 4.0 nflverse data is used (player stats, weekly rosters, injuries, schedules), with the existing credit and links. No PFR-sourced snap counts, FTN/CC BY-SA data, expert rankings or third-party fantasy data enter Track 1. Release files are public, as the committed snapshots already are. Implied totals are computed only in the viewer's browser from the viewer's own D-39-gated reply.

## 6. Tests (each names its contract)

- **Planner:**
  - never builds a week whose games are all complete;
  - never rebuilds after freeze;
  - builds a missing week once after freeze, with the late flag;
  - freezes reviews at F(W) and Week 18's review four days after its last kickoff;
  - season boundaries.
- **Builder:**
  - partial selected-week stats leave every estimate byte-identical;
  - later-week stats fail;
  - a complete selected week fails;
  - roster fallback is allowed at one week, fails at two, and is counted;
  - the pace formula is unchanged against the committed Week 6 fixture.
- **Matchups:**
  - allowed stats equal the sums of the opponents' player rows;
  - byes are skipped;
  - scoring-format separation;
  - tie ranks;
  - fewer than two games gives "—".
- **Review:**
  - estimates equal the published snapshot exactly;
  - missing stats rows are excluded and counted;
  - baseline arithmetic;
  - PPR and Standard give different miss sizes from the same pairs.
- **Implied totals:**
  - the arithmetic example above;
  - a lock line whenever either market is hidden;
  - "—" for a missing value;
  - never reads `lineAtGuess`.
- **Route:**
  - unexpected body field gives 400;
  - checksum mismatch gives 503 and is not cached;
  - oversize gives 503;
  - the stale cached index is served;
  - the week returned equals the week requested.
- **Loader:** a 503 falls back with the saved-copy text; 400 and 403 do not fall back.
- **Privacy:** snapshot and review files contain no spread, total, odds, price or account keys; the existing bundle scan stays green.
- **Browser (synthetic accounts):** lock line versus visible total, accuracy card, saved-copy fallback, at 320, 390 and 1280 px in dark and light, with keyboard and axe checks.

## 7. Release and rollout

1. Merge this design. Then an implementation PR with the builder, schema v2, review, planner, script, workflow (manual trigger only), route, loader and UI, plus the tests above.
2. Run the workflow manually with `dry_run: true`, then `false`. Read back the index and files and compare checksums.
3. **API release** through `release.yml` (target `api`, Sean's approval). Read back hosted logs for signed-in 2xx responses on `/fantasy/week`, not only unauthenticated denials.
4. **Frontend release** through `release.yml` (target `frontend`), then a signed-in readback on a phone-width viewport.
5. Add the `schedule` trigger in a small follow-up commit and confirm the first scheduled run.

No migration is needed (Gate M does not apply). **Rollback:** disable the workflow, which freezes the data; redeploy the previous frontend, which returns to committed snapshots. Nothing is deleted.

Documentation updated at implementation: `docs/FANTASY_FOOTBALL.md`, `planning/PLATFORM_WORK_QUEUE.md` (Q11, Q14), `docs/COMPLETION_REGISTER.md`, `docs/DECISIONS.md` once D-57 is approved, and a release card.

## 8. D-57 — implied team totals in Fantasy follow D-39 (approved October 23, 2026)

Recorded in [DECISIONS.md](../../DECISIONS.md) with the publishing and accuracy decisions. The rule as reviewed:

> Fantasy may show a game's implied team totals, calculated from the median collected spread and total GTL already shows, only to a viewer for whom both that game's spread and total are visible under D-39 (that viewer locked in or sat out that market, or the game kicked off). Otherwise Fantasy shows a lock line naming the hidden market. Totals are calculated in the viewer's app from the viewer's own gated lines reply; no line enters a Fantasy snapshot, review, static asset or Fantasy route. Public nflverse matchup context (points allowed by position, kickoff window) and the existing weather forecast are shown without that gate. Nothing else in D-39 changes.

Numbering note: Guess the Points ([PR #191](https://github.com/seanbalz/guess-the-lines-repo/pull/191)) holds D-56.

## 9. Open items and risks

- **Roster timing:** when nflverse first publishes week-W roster rows is unmeasured. If it is later than Tuesday, the week-W snapshot appears when rosters do; record the first two weeks' timings.
- **Edge access to GitHub:** release downloads redirect to GitHub's asset host. `/trends/week` already fetches nflverse release files from Edge, but this redirect path must be checked in the first API readback.
- **Workflow upkeep:** GitHub disables scheduled workflows in repositories with no activity for 60 days, and scheduled runs can start late. The 11:00 UTC slot leaves 2.5 hours before the earliest kickoff.
- **Change in behavior:** the snapshot can show availability changes reported before 11:00 UTC each day, but not later same-day news. The status line says when it was updated.
