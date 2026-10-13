# Situational trends

Owner: Sean Balsiger · Version 1 · Updated 2026-10-13 · Ruling of October 12, 2026 (see [DECISIONS.md](DECISIONS.md); the decision number is assigned at merge)

Trend cards show how NFL games in a given situation went against the line in the past. They sit next to each game on the Community Picks tab, on the group ballot and in the dashboard's game detail. **They are reference only: they never change GTL scoring, and they are not betting recommendations.**

## What Sean asked for

On October 12, 2026 Sean chose option A, "Preset trend cards from the free data on Picks and the dashboard. Referee trends use a referee you pick from a dropdown for each game once assignments come out". He listed families that must be covered: referee, home vs away, divisional games, totals, night and primetime games, AFC vs NFC, one team traveling, coming off a bye, coming off a short week. He then asked for quality: "that is a shortsided trend list. you may be missing trends with the most statistical impact to the outcome. we need quality trends".

The panel answers both:

- **Quality first.** Every trend is a frozen preset (at most two filters) from a registry tested on 1,722 hypotheses. Each preset has an out-of-sample quality score, and the panel shows tiers in score order, never sorted by ROI, win rate, streak or last 10.
- **Sean's families are always there,** as clearly labelled context with "No proven edge".
- **Honest evidence.** Only one trend beat chance out of sample (2018–2025): strong wind at kickoff (10+ mph) went Under. It needs observed wind, and no free forecast source is approved, so on an upcoming game it appears only as a collapsed note: "Applies only if kickoff wind is 10+ mph; no forecast source".

## Where it shows

| Screen | How | Notes |
|---|---|---|
| Community → Picks | **Show trends** button beside the Spread/Total buttons (off by default, remembered on this device in `gtl.trends.show`), then a **Trends** button as the last item of each game card | Off by default so each game keeps one Tab stop per chip row (power persona budget). Bands are marked with the player's own saved line for a submitted market |
| Group ballot (`PredictionEntry`) | **Show trends** in the toolbar; a **Trends** button under the team records; the panel opens in its own full-width row under the game | Bands are marked with the player's saved scoring reference once this mode is revealed |
| Dashboard | A **Trends** button inside each matchup's drilldown; a standalone **Game trends** panel when the ballot is not yet submitted or "Matchup differences" is hidden | New dashboard section "Situational trends" (on by default) in Customize dashboard |
| Dashboard → Data connections | "Situational trends · nflverse (CC BY 4.0)" source card | Credit, license and line source |
| Community → Feed (commissioner only) | **Game referees (commissioner)** panel under "Preview / publish early" | One dropdown per published game; see [Referees](#referees) |

Every **Trends** button is a disclosure (`aria-expanded`, `aria-controls`) named for its game ("Trends for SEA at DEN"); focus stays on it. The panel code and the week file load only when a player opens one.

## Panel contents, in order

1. **Intro**: "Past results against nflverse lines. Reference only…" and the one-line evidence summary.
2. **Strongest historical evidence**: the Tier 1 wind card, collapsed behind its condition on outdoor, open-roof or unknown-roof games; "Strong wind trends do not apply indoors" for domes.
3. **Consistent, not proven** (Tier 2): up to three cards that fit this game, de-duplicated, with conflicts flagged ("Conflicting trends") and same-side overlaps noted ("not independent confirmations"). The calibration note says the Tier 2 gate passes about as many trends on shuffled outcomes (13.3) as on real data (12).
4. **Updates after the final**: when a team's previous game has no final yet (Week 6: BUF and LAR until the 2026_05_BUF_LA final).
5. **Watch list** cards that fit.
6. **Referee**: the assignment (or "Referee not assigned yet") and that referee's records.
7. **Context (no proven edge)**, collapsed: Sean's families in his order (home vs road, divisional, totals, kickoff window and night games, AFC vs NFC, travel and site, off a bye, short week, other rest, previous game, road and home streaks, season timing, roof and surface, spread bands, head coach, starting quarterback, head to head, observed weather). Each family shows its lead ATS and over/under records and a "More in this family" table.
8. **Teams, coaches, quarterbacks and head to head**, collapsed: each team in this game's home or road role, head coaches and the expected starting quarterbacks (provisional), and the last meetings within four years.
9. **Line-dependent records**: "Unlocks after your Spread ballot", "Unlocks after your Total ballot" and "Unlocks after both ballots" (see [Reveal gating](#reveal-gating)).
10. **Notes** (international site, retractable roof unknown, pending games) and the **source footer**.

### The card (Tier 1, Tier 2, watch list)

Laid out like Sean's TrendsCenter card: title, market ("NFL · ATS · Back HOU ATS"), tier label, score out of 100, then **Record W-L-P, Win rate (with the 95% range), ROI (−110), Units, Streak, Last 10, Games, Years**, the cumulative units line (inline SVG with a zero baseline; the final value is also in the Units cell and in the line's text description) and the plain-language filters. Underneath, kept separate:

- **Record**: the registered side over every game since 2002 (in-sample).
- **Results 2018–2025 (period used to select this card)**, seasons positive, points per game against the line, and BH q to three digits. The wind card also shows its stored permutation statistic (best score in each of 100 shuffled runs, p = 0.0099), because q = 0.103 alone would not pass the Tier 1 gate.
- **Since registered Oct 12, 2026**: the only prospective record.
- "How this score is built": E, M, R, C, P, Rc, K, penalties and cap.

### Compact records (Tier 3, entities, referees)

These are never shown as a side with a record, because a side chosen from the same history always looks like a winner. Instead:

- **Since 2002, both ways (in-sample)**: e.g. "Over 3212 · Under 3270 · Pushes 95". A team-market row says whose record it counts, from the row itself: "DEN covered" only for Denver's own home, road, favorite or underdog record; a trait row says "Team with the trait covered" (every team with that trait since 2002), a coach row "Coach’s team covered" (every team the coach led) and a quarterback row "QB’s team covered" (every team he started for), even when the panel shows it for one team in this game.
- **Walk-forward** card fields (record, win rate, ROI, units, streak, last 10): each season's side is chosen from earlier seasons only.
- Walk-forward 2018–2025, this season's side, this season and since registered.
- Straight-up records are descriptive: no units or ROI, because GTL scores spread and total only.

## Reveal gating

The week file never carries this week's line, odds, weather or referee: unplayed games are redacted before anything is computed. Line-dependent records (favorite and underdog splits, spread and total bands, key numbers, implied team totals, the last meeting against this total) stay behind the matching ballot:

- **Community Picks**: a market unlocks when that ballot is submitted, the player sat out that market (D-23), or the deadline has passed.
- **Group ballot and dashboard**: the market's `marketAccess`, a sit-out, the deadline, or this mode's reveal.
- A Total submission never unlocks a spread-gated record, and the reverse; "both" needs both markets.
- After a market unlocks, the rows that fit this game are marked "This game" (text and `aria-current`, not color alone) using **only the player's own saved line** for that market (the saved scoring reference on Picks and the group ballot, the saved reference on the dashboard). Without a held line the tables stay unmarked.

## Referees

No free, licensed feed publishes referee assignments before games; the schedule file fills `referee` only after a game is played. So a person enters them.

- **Commissioner dropdown (shared).** Community → Feed → **Game referees (commissioner)**: one labelled select per published game ("Referee for SEA at DEN"), listing "Not assigned yet" and every referee seen in the last three seasons of the schedule file (18 names for 2026, from the week file's `refereeOptions`). **Save** writes each changed game through gtl-api for every member.
- **Precedence** in every panel: the commissioner's saved assignment (a cleared one included), then the week file's static map, then "Referee not assigned yet".
- **Look up a referee.** Any member can pick another referee in the panel to see that referee's records. It is labelled "Viewing …, not the assignment", stays on that screen and is never saved.
- **Records shown**: career over/under and home vs road ATS, plus primetime (19:00 ET or later) or divisional rows when the game is one, and the total band after the Total ballot.
- **Static fallback** (works with a Pages deploy only): `node scripts/trends.mjs --season 2026 --week N --reuse-season-file --referees refs.json` with `{ "SEA-DEN": "Shawn Hochuli", … }`; names must be in `refereeOptions`.

### Hosted pieces (written, not applied or deployed)

- Migration `supabase/migrations/20261012234500_gtl_game_officials.sql`:
  - `gtl_game_officials`, keyed by season, week and game id, holding the referee name, who set it (`set_by`), when, and a revision number. It references the published slate.
  - `gtl_game_official_history`, append-only: every change is a new revision with the previous referee. Clearing is a revision with referee null. Changes are also written to `gtl_access_audit` as `game_official:season:week:game:revision`.
  - RLS on both tables, all privileges revoked from public, anon, authenticated and service_role, then service_role gets select/insert (and update of the four current-assignment columns). There is no delete grant.
  - `gtl_set_game_official(p_user, p_season, p_week, p_game, p_referee)`: refuses non-commissioners (`GTL_OFFICIALS_FORBIDDEN`), games not on that week's published slate (`GTL_OFFICIALS_UNKNOWN_GAME`) and malformed names (`GTL_OFFICIALS_INVALID`). Saving the same referee again writes nothing.
  - `gtl_read_game_officials(p_user, p_season, p_week)`: community members only.
  - Both functions are security invoker with an empty search path, revoked from public, anon and authenticated, and executable by service_role only.
- Routes in `cloud/officials.mjs` (gtl-api, POST, signed in and email-confirmed):
  - `/officials/read { season, week }` → `{ season, week, assignments: { [gameId]: { referee, setAt, revision } } }`
  - `/officials/set { season, week, gameId, referee | null }` → `{ …, changed }`. Commissioner only: the handler checks `gtl_community_admin` before the write, then the RPC checks again. Names are canonicalized through the referee alias table (`shared/referees.mjs`, kept equal to `shared/trends-corrections.json`), so "Ronald Torbert" is stored as "Ron Torbert".
- Until the migration is applied and gtl-api is deployed, the routes answer 404. The commissioner panel then says that saving needs the next deploy, and panels fall back to the week file.

## Data and attribution

- Source: the nflverse-data schedules release, <https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv>, licensed CC BY 4.0 (<https://creativecommons.org/licenses/by/4.0/>).
- Credit shown on every panel and in Data connections: "Data: nflverse; schedules maintained by Lee Sharpe (CC BY 4.0), modified".
- Modified: column subset, values trimmed, corrections in `shared/trends-corrections.json`, aggregated into trend records.
- Caveat: NFL data belongs to its respective owners. The CC BY license does not extend to upstream rights such as the odds columns, whose book is not documented.
- Line source label: "nflverse schedule file: last recorded line (book not documented)". ROI from the file's odds is computed but not shown until Sean approves records derived from odds with an undocumented book.
- Only public game facts and derived aggregates ship in static assets. No player or user data enters the generator or the week files.

## Weekly operator step

1. Tuesday morning, after the Monday-night final appears in the release file: `node scripts/trends.mjs --season 2026 --week N`. It writes `shared/trends/season-2026.csv` (unplayed games redacted), `shared/trends/2026-week-NN.json` and `web/src/trendWeeks.generated.js`. Use `--allow-pending` for an early run before a final is in (pending teams show "Updates after the final").
2. Optional mid-week referee rerun while the hosted referee pieces are not deployed: add `--reuse-season-file --referees refs.json`, so the season file and every other game stay byte-identical.
3. Run `npm test` and `npm run build`. Commit on a branch, open a PR and merge when CI is green.
4. Deploy Pages from `main` with the existing command. The week files are same-origin lazy chunks, so no CSP change is needed.

At season end: `node scripts/trends-history.mjs --through 2026` freezes the finished season, and `node scripts/trends-registry.mjs --study .local/trends-study/results_all.json` re-freezes the registry. Promotions happen only then. The study outputs stay in `.local/` and are never committed.

## Deployed state

- **Not deployed.** The engine, week file, UI and referee route are on branch `claude/trends-engine`.
- Shipping the panels needs a Pages deploy only. The referee pieces do not fail the deploy chain's `npm run check:cloud` before they exist: `scripts/check-cloud-boundary.mjs` lists the two referee RPCs and the two `/officials` routes in `awaitingDeploy` and reports them as "awaiting deploy, not verified". It accepts only the exact not-found answer (PostgREST `PGRST202` for a missing function, gtl-api's own `Not found.` for a missing route); any other answer must still be a denial, and every other probe still runs. Nothing else is in `awaitingDeploy`: the Community history and D-27 line-at-guess probes still fail the check until their migrations are applied hosted (see [SOCIAL_COMMUNITY.md](SOCIAL_COMMUNITY.md#deployed-state)).
- Shared commissioner referees also need:
  - the migration `20261012234500_gtl_game_officials.sql` applied to the hosted project (record the hosted version; never `db push`),
  - a `gtl-api` deploy.
- The frontend falls back cleanly, so the two can ship in either order.
- After both are live, run `node scripts/check-cloud-boundary.mjs --strict` (every probe must deny, none awaiting deploy), then remove the four `awaitingDeploy` entries in the change that records the hosted migration version.

## Limits

- No forecast weather: observed-weather trends apply to played games only.
- No opening lines or line movement.
- Tier 2 is "not proven" as a group.
- Starting quarterbacks for upcoming games are nflverse's expected starters (provisional).
- Retractable roofs are unknown until game day.
- Not in v1:
  - the TNF road team (short week plus travel),
  - Week 17–18 elimination and rest spots,
  - lookahead and letdown spots,
  - opening lines.

## Tests

- `tests/trends-*.test.mjs` (engine: parity with the study, golden Novak case, leakage, hidden lines, determinism).
- `tests/trends-view.test.mjs`:
  - band rules match the engine on every played game since 2002,
  - the reveal-gating matrix,
  - referee precedence,
  - every referenced item resolves to a titled record,
  - formatting, purity and the copy guard.
- `tests/trends-ui.test.jsx` (vitest render):
  - the card layout,
  - two-sided compact rows,
  - panel order and gating,
  - saved-line marks,
  - referee precedence,
  - the empty state,
  - the expander,
  - the copy guard across all 14 games.
- `tests/officials-cloud.test.mjs`: the route with an in-memory store, including the non-commissioner refusal before any write.
- `tests/officials-sql.test.mjs`: the migration on PGlite (grants, RLS, invoker functions, refusals, revisions, history, audit, member reads).
- `tests/cloud-browser/trends.spec.js`:
  - the toggle and expander,
  - axe on the open panel,
  - the 403 for a player,
  - the commissioner dropdown saving for everyone,
  - the assignment showing for another member.
