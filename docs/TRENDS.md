# Situational trends

Owner: Sean Balsiger · Version 1 · Updated 2026-10-14 · Ruling of October 12, 2026, D-32 in [DECISIONS.md](DECISIONS.md)

Trend cards show how NFL games in a given situation went against the line in the past. They sit next to each game on the Community Picks tab, on the group ballot and in the dashboard's game detail. **They are reference only: they never change GTL scoring, and they are not betting recommendations.**

## What Sean asked for

On October 12, 2026 Sean chose option A, "Preset trend cards from the free data on Picks and the dashboard. Referee trends use a referee you pick from a dropdown for each game once assignments come out". He listed families that must be covered: referee, home vs away, divisional games, totals, night and primetime games, AFC vs NFC, one team traveling, coming off a bye, coming off a short week. He then asked for quality: "that is a shortsided trend list. you may be missing trends with the most statistical impact to the outcome. we need quality trends".

The panel answers both:

- **Quality first.** Every trend is a frozen preset (at most two filters) from a registry tested on 1,722 hypotheses. Each preset has an out-of-sample quality score, and the panel shows tiers in score order, never sorted by ROI, win rate, streak or last 10.
- **Sean's families are always there,** as clearly labelled context with "No proven edge".
- **Honest evidence.** Only one trend beat chance out of sample (2018–2025): strong wind at kickoff (10+ mph) went Under. Its record uses observed kickoff wind. Since D-34, signed-in community members see an Open-Meteo kickoff forecast above the card, and since D-45 every game has a weather row; using the record with a forecast has **not been backtested**, and the panel says so. Without a current forecast the card stays a collapsed note: "Applies only if kickoff wind is 10+ mph; no current forecast for this game". See [Kickoff wind forecast](#kickoff-wind-forecast-d-34).

## Where it shows

| Screen | How | Notes |
|---|---|---|
| Community → Picks | **Show trends** button beside the Spread/Total buttons (off by default, remembered on this device in `gtl.trends.show`), then a **Trends** button as the last item of each game card | Off by default so each game keeps one Tab stop per chip row (power persona budget). Bands are marked with the player's own saved line for a submitted market |
| Group ballot (`PredictionEntry`) | **Show trends** in the toolbar; a **Trends** button under the team records; the panel opens in its own full-width row under the game | Bands are marked with the player's saved scoring reference once this mode is revealed |
| Dashboard | A **Trends** button inside each matchup's drilldown; a standalone **Game trends** panel when the ballot is not yet submitted or "Matchup differences" is hidden | New dashboard section "Situational trends" (on by default) in Customize dashboard |
| Dashboard → Data connections | "Situational trends · nflverse (CC BY 4.0)" source card | Credit, license and line source |
| Community → Feed (commissioner only) | **Game referees (commissioner)** panel under "Preview / publish early" | One dropdown per published game; see [Referees](#referees) |
| New app → Lines (redesign stage 13, behind "Try the new app") | At most three trend lines on the board, else a D-45 weather word on a card; each game sheet's top three trends, the weather and referee rows, and **All trends** | The simplified trends of DASH-7; see [New app: simplified trends](#new-app-simplified-trends-dash-7) |

Every **Trends** button is a disclosure (`aria-expanded`, `aria-controls`) named for its game ("Trends for SEA at DEN"); focus stays on it. The panel code and the week file load only when a player opens one.

## Panel contents, in order

1. **Intro**: "Past results against nflverse lines. Reference only…" and the one-line evidence summary.
2. **Strongest historical evidence**: the game's weather row (D-34, D-45): the kickoff forecast card for open-air and retractable-roof games, "Indoors" for domes and SoFi Stadium, or "no current forecast"; then the Tier 1 wind card, collapsed behind its condition. Indoors games add "Strong wind trends do not apply indoors".
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

- **Per game and market** (D-39, redesign stage 17; `gameAccess` in `shared/trends-view.mjs`, the gate M-01's `gtl_guess_revealed` applies in SQL): a game's market unlocks when the player's own guess for that game and market is locked in (`guessLockedIn`: a pick in a submitted ballot, or from M-02 a pick the ballot's `lockedAt` names, the reading of `gtl_guess_locked_in`), the player sat out that market (D-23), or that game kicks off. Under today's rules (`rules.revealAt` is 'deadline' until M-01 is applied) the week's deadline also unlocks every game; from M-01 it does not, and the locked panel says the game opens "once this game kicks off".
- **Community Picks** reads the `/personal` view (`communityAccess`); the **group ballot and dashboard** read the `/state` view (`groupAccess`: the market's `marketAccess`, its submitted status, a sit-out, this mode's reveal, or for this mode a game the view's `lockedAt` names). Stage 13 (the new app's Lines) reuses `gameAccess`.
- A Total submission never unlocks a spread-gated record, and the reverse; "both" needs both markets.
- After a market unlocks, the rows that fit this game are marked "This game" (text and `aria-current`, not color alone) using **only the player's own saved line** for that market (the saved scoring reference on Picks and the group ballot, the saved reference on the dashboard). Without a held line the tables stay unmarked.

## New app: simplified trends (DASH-7)

Sean, October 14, 2026, asked "Trends page: what should we do with it?", chose "Build the simplified Trends now": "Per game: the top 3 trends in plain words, each with its record and sample size, plus wind, weather and referee rows and an All trends sheet. It follows the per-game gate and is visible only in the new app until first look." It is built in redesign stage 13 (`web/src/next/lines/`), with the All trends sheet pulled forward from stage 34. The old app's panels above are unchanged.

- **Short cards** (`shortCard` in `shared/trends-view.mjs`): a title, one plain sentence, the record and the sample size ("Teams in the Texans’ spot covered 444 times and missed 364 since 2002." · 444–364–22 · 830 games), and the tier in words. A card's record is its registered side over every game since its first year (the file's `record`); a row is shown both ways ("Home teams covered … and road teams …", the file's `split`), never as a side with a record. Every number is read from the week file; nothing is computed that the file does not hold.
- **The top three per game** (`gameTrends`): the Tier 2 and watch-list cards the engine fires on this game, strongest first as the engine defines it (the tier, then the quality score; never ROI or win rate). A line card joins only once its market is open and the viewer's own saved line shows that it fits. The Tier 1 wind card and the other weather cards need observed kickoff weather, so they sit in the weather row and the All trends sheet, never in the top three; cards that wait for an earlier final are listed there too.
- **Board trend lines** (`boardTrends`): at most three on the whole board, one per card at most: each game's strongest card that needs no line, from the Consistent-not-proven tier or stronger, ordered by tier, then the most games in its record, then kickoff (prototype C23). Week 6: NO @ NYG, WAS @ SF and HOU @ JAX.
- **Line trends lock with their market.** A trend needs a market open when the engine gates it (`gate` on the card or row) or, for a card, when its side is the favorite or the underdog (the prototype's review R9). While that market is closed for this game (`gameAccess`: the viewer's own lock-in, a sit-out or the game's kickoff, under the live rules the server reports), the card shows only "Line-based trend" and how it opens; it carries no title, record, sample size or percent.
- **All trends** (`allTrends`): five groups (team, situational, line, weather, referee), each opening in place, every trend with its record and sample size, strongest first. It opens as its own sheet over the game sheet, so Back closes it.
- **Until trends can show, each sheet says what is true** (`gameSheet`'s `trends.notice`, from the sheet's own read of the week file): "Loading trends…" while it loads (also the first moment an All trends sheet opens, before the shared cache answers), "Trends didn’t load…" when it fails, "Trends for Week N publish after Monday night’s final." only when the week has no file, and "No trends for this game in this week’s file." when the file is out but does not hold the game. In the line group a record that does not fit at the viewer's own saved line says "Doesn’t fit this game at your line".
- **Weather and referee rows** (`shared/lines-view.mjs` `sheetWeatherRow`, on `shared/weather-view.mjs` `weatherRow`): every game has a weather row (D-45). A current kickoff forecast is closed by default with no digits ("Kickoff forecast", plus "Roof may close" for a retractable roof); open, it gives the stadium, the values, the times in Pacific time, the honesty note and the Open-Meteo credit. A dome or SoFi Stadium says "Indoors" and the stadium, with nothing to open. Otherwise the row says "No current forecast" (and "Roof may close"), and when it is more than 5 days out or stale, opening it says so; a 404 from `/wind/read`, a failed read and a signed-out viewer read the same. The referee row shows only when a referee is known (the commissioner's assignment, else the week file's); a 404 hides it.
- **Board weather chip** (`boardWeatherChip`, on `weatherChip`): a card's one chip is its board trend line when it has one, else the weather word ("Windy", "Rain likely" or "Snow likely"; no digits, no link). A game that kicked off keeps its chip from the final pre-kickoff forecast. The board reads `/wind/read` when it shows a week and again only at the D-47 due points (24 h after a snapshot was taken, 12 h and 2 h before kickoff), at kickoff and when the tab shows again; the game sheet reuses that read through the shared 5-minute cache and, while open, re-reads at the same points, as the old panel does. Reads that land within a minute of each other share one request.

## Lines reader (M-06)

Redesign build plan stage 23. The new app's Lines tab, game sheet and Edge board read current lines only through two `gtl-api` routes, gated per game and market in SQL. Sean's D-39 (October 14, 2026): "once you make a pick that game is revealed. you can change bets up until game start but you cannot guess the spread or total again once youve locked in that games guess". A game's line for a market opens for a player when that player locks in that game's guess for that market, when they sit out that market for the week (from M-03 also a skip or "See picks now", D-36), or at that game's kickoff for everyone (D-31). The other market and the other games stay locked.

**Database.** Migration `20261015010000_gtl_lines_read.sql` (M-06) adds four service-only, security-invoker functions and changes nothing else (no table, row, trigger or existing function):

| Function | What it answers |
|---|---|
| `gtl_read_lines(viewer, season, week, now)` | Every game of a published week (the newest when no week is named), in kickoff order: teams, kickoff, `started`, the final (the D-26 settlement or a commissioner-reported final, as History shows it), and per market `{ visible }` with, when open, the newest qualifying line stored by `now` (`value`, `capturedAt`, `observedAt`, `bookCount`, `source`). The viewer's own row per market (`mine`): the guess (a draft too), `lockedIn`, `satOut`, the Late marker, the line at the guess only once that market is open, and points from kickoff for a submitted eligible ballot. An unknown week answers `published: false`. |
| `gtl_read_game_lines(viewer, season, week, game, now)` | One game. Per open market: the newest qualifying line, its three named books with both American prices (from the same collection), movement (every qualifying line stored by `now`, the newest 48, oldest first) and, from kickoff, the kickoff line. |
| `gtl_book_quotes_from_snapshot(payload, game, market)` | The three named books of one stored collection, each with its line, both prices (a whole number from 100 to 10000 either way, else null) and observation time, only when that game and market's line qualifies there. |
| `gtl_kickoff_line(season, week, game, market)` | The newest qualifying line captured in the 12 hours before kickoff (inclusive), from collections already stored; else null. It never starts a collection. |

Every line comes from `gtl_line_from_snapshot`, the D-16/D-27 three-book validator, unchanged: a collection with two books, or captured at or after kickoff, is skipped. The gate is M-01's `gtl_markets_visible` / `gtl_guess_revealed`, which ask `gtl_guess_locked_in`, so when M-02 records per-game lock-ins it opens exactly the game locked in with no change here. A closed cell is `{ visible: false }` with no other key, and nothing about it is computed. No reply carries a raw payload, a provider or provider event id, or a snapshot id.

**Routes.** `POST /lines/read` (`{}` or `{ season, week }`) and `POST /lines/game` (`{ gameId }`, optionally with `season` and `week`), signed in, identity from sign-in only. `cloud/lines.mjs` rebuilds each reply from a fixed list of keys and turns any market whose `visible` is not exactly `true` into `{ visible: false }`, so a key SQL sent under a closed market never leaves the server; the viewer's own guess always comes back, its line and points only under an open market. Refusals: `GTL_LINES_INVALID` (400, "Check the week and game, then try again."), `GTL_COMMUNITY_MEMBER` (403), and 503 "Lines are not available right now." while M-06 is not applied (PostgREST's function-not-found) or when the off switch is on. The web wrapper is `linesApi('read' | 'game')` in `web/src/api.js`; no screen calls it until stages 32 to 34.

**For the stages that read it.** `/lines/read` without a week reads the newest published week only. From Monday 12:00 AM PT, when the next week is published, last week's Monday night game can still be picked until its kickoff (D-39, from M-07) and M-05 keeps collecting its line under its own week, but the default board no longer lists it: a screen that shows that game (stage 33's board on a Monday, the game sheet) asks for its season and week explicitly. Two fields of `mine` still read the ballot as a whole: `points` need a submitted ballot, and `late` is the ballot's Late marker on every game. Under D-39's per-game lock-in, M-07 (stage 24) revisits both (build plan section 5, rule 9).

**Release.** Merge, then the `gtl-api` deploy that maps the codes (until the apply both routes answer 503), then "apply M-06" on a Tuesday or Wednesday, after M-01, M-02 and M-04 are applied and stages 20 and 21 are live (build plan, sections 5 and 6). Before M-02 a guess in a submitted ballot can still change until the deadline (D-16), so opening its line on a send would let a player match the line. M-06's file (`20261015010000`) sorts before M-02's (`20261015030000_gtl_sent_picks_final.sql`), so here filename order is not apply order: apply M-02 first all the same. There is no rollback file, because nothing is replaced: the off switch is the `gtl-api` secret `GTL_FEATURE_OFF=lines` (both routes refuse and read nothing); a database-side stop, with Sean's OK, is revoking the service role's execute grant on the two readers. Until the apply the four functions and the two routes are in `awaitingDeploy` (`scripts/boundary/lines.mjs`), the file is in `NOT_HOSTED`, and the leak scan runs `/lines/*` on `ALL` only (`READER_MIGRATIONS` in `tests/helpers/leak-scan.mjs`); the apply record removes all three.

**Tests.** `tests/lines-sql.test.mjs` (PGlite, `ALL`): no value key before a lock-in; Spread open while Total stays locked; a sit-out opens that market and a draft opens nothing; one kickoff opens one game; the newest qualifying collection, a two-book one skipped; following a per-game `gtl_guess_locked_in`; the kickoff-line window, books and prices, movement over time and its cap of 48; finals; refusals (malformed, unknown game, non-member, removed member, `anon` and `authenticated`); no raw keys; the leak scan across `/lines/*` and every other reader at three moments; `/lines/*` answering 503 on `HOSTED`. `tests/lines-cloud.test.mjs`: the projection against forged replies, request validation, error mapping, the off switch and the adapter.

## Referees

No free, licensed feed publishes referee assignments before games; the schedule file fills `referee` only after a game is played. So a person enters them.

- **Commissioner dropdown (shared).** Community → Feed → **Game referees (commissioner)**: one labelled select per published game ("Referee for SEA at DEN"), listing "Not assigned yet" and every referee seen in the last three seasons of the schedule file (18 names for 2026, from the week file's `refereeOptions`). **Save** writes each changed game through gtl-api for every member.
- **Precedence** in every panel: the commissioner's saved assignment (a cleared one included), then the week file's static map, then "Referee not assigned yet".
- **Look up a referee.** Any member can pick another referee in the panel to see that referee's records. It is labelled "Viewing …, not the assignment", stays on that screen and is never saved.
- **Records shown**: career over/under and home vs road ATS, plus primetime (19:00 ET or later) or divisional rows when the game is one, and the total band after the Total ballot.
- **Static fallback** (works with a Pages deploy only): `node scripts/trends.mjs --season 2026 --week N --reuse-season-file --referees refs.json` with `{ "SEA-DEN": "Shawn Hochuli", … }`; names must be in `refereeOptions`.

### Hosted pieces (migration applied October 13; `gtl-api` deploy pending)

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

## Kickoff wind forecast (D-34)

Sean, October 13, 2026: "go ahead with the wind forecast too" ([D-34](DECISIONS.md#d-34--kickoff-wind-forecast-from-open-meteo-october-13-2026)). October 14, 2026: "Full weather on every game (Recommended)" ([D-45](DECISIONS.md#d-45--weather-on-every-game-and-a-weather-chip-on-the-board-october-14-2026)). October 15, 2026: "Just need a weather update every 24 hours and then 2 hours and 12 hours before kickoff" ([D-47](DECISIONS.md#d-47--weather-every-24-hours-then-12-hours-and-2-hours-before-kickoff-october-15-2026)).

**Where it shows.** Everywhere the trends panel mounts (Community Picks, the group ballot and the dashboard game detail), at the top of "Strongest historical evidence". Every game has one weather row (D-45): the forecast card, "Kickoff weather: Indoors" with the stadium for a dome or SoFi Stadium, or "Kickoff weather: no current forecast for this game." A retractable roof adds "Roof may close" with or without a forecast. It loads only when a signed-in community member opens a game's trends, so reads (and refreshes) happen only on use. Open-air and retractable-roof stadiums are fetched; domes and SoFi Stadium's canopy (a fixed roof over the field, which nflverse and the trend records count as a dome) never are. Treating SoFi as Indoors is the builder's reading of D-45 (see [Cap math](#kickoff-wind-forecast-d-34) below). `shared/weather-view.mjs` (`weatherRow`) decides the row from the same freshness rules as the card.

**States.**

| State | When | Shows |
|---|---|---|
| Forecast | A snapshot made before kickoff that is current (D-47): until one hour past the time it falls due on the refresh schedule (24 h after it was taken, or the 12 h or 2 h checkpoint before kickoff, whichever comes first) | Stadium, sustained wind at kickoff with compass direction, gusts in the kickoff hour, temperature, precipitation chance, the time line (forecast hour, kickoff, age, how far ahead it was made, a confidence label), the band sentence, notes, the honesty note, the model line and the credit |
| Final | After kickoff, the last snapshot if it was still current at kickoff: one taken 2 h or less before kickoff, at or after the 2 h checkpoint (the same window as under D-34) | The same, titled "Final pre-kickoff forecast (fetched N min before kickoff)"; never called observed |
| Not yet | More than 120 h before kickoff | "Kickoff weather: no current forecast for this game. The kickoff forecast appears 5 days before kickoff." No numbers, no credit |
| Fallback | No snapshot, a stale one (more than an hour past its due time), or no access (signed out, local mode, not a member, or not deployed) | "Kickoff weather: no current forecast for this game.", plus "The last forecast is out of date." for a stale one, and the Tier 1 note "Applies only if kickoff wind is 10+ mph; no current forecast for this game" |
| Retractable | A retractable roof | The forecast, "Roof may close" (D-45) and "Retractable roof: the wind matters only if the roof is open, which is decided on game day." Without a forecast, the Not yet or Fallback row with "Roof may close." after "no current forecast for this game." |
| Indoor | A dome, SoFi Stadium's canopy, or a retractable roof the trends file records as closed (only played games carry it) | "Kickoff weather: Indoors · " and the stadium (D-45), then "Strong wind trends do not apply indoors (dome or closed roof)." No numbers or credit. Domes and SoFi are never requested; a closed retractable roof's stadium still is, because the planner fetches every retractable stadium |
| Loading | The first read is in flight | "Kickoff weather: Loading kickoff forecast…" |

**Refresh schedule (D-47).** A fetched game inside the 120 h window is due when it has no snapshot for this kickoff, when its newest snapshot is 24 h old, or when kickoff minus 12 h (then kickoff minus 2 h) has been reached and its newest snapshot was taken before that checkpoint; never at or after kickoff, so the final pre-kickoff forecast stays. With a reader every minute a game is fetched about seven times: when it enters the window 120 h out, every 24 h after that, and 12 h and 2 h before kickoff. Refreshes still happen only when a member reads (no cron). `gtl_begin_wind_fetch` (migration `20261015120000`) is the authority; `cloud/wind.mjs` (`WIND_SCHEDULE`, `windDue`) plans the same games, and `shared/trends-view.mjs` (`windNextDue`, `windCurrent`) mirrors the schedule for the screens. Tests keep the three equal; `tests/wind-sql.test.mjs` checks the SQL against `windDue`. D-34's lead tiers (a 1 h TTL within 18 h, 3 h within 72 h, 6 h within 120 h) are gone.

**When a forecast shows as current (D-47, the builder's rule).** Until one hour past the time it falls due. A refresh happens only when someone reads, so a snapshot that has just fallen due is shown while the read that refreshes it is on its way: an open screen asks again at the due time (a minute later if the single flight or the 60 s spacing turned it away), and the first reader after a quiet spell gets the refreshed snapshot in the same answer. An hour covers that, a device clock a little behind, and the 15-minute backoff after one Open-Meteo failure, so a forecast that is only waiting for the next read never shows as out of date. It is shorter than the 10 h between the checkpoints and than the last 2 h, so a missed checkpoint stops showing as current an hour later: a 12 h-old forecast is never called current in the last hour before kickoff, and after kickoff only a snapshot taken 2 h or less before it is the final pre-kickoff forecast.

**Confidence labels.** By how far ahead a snapshot was made: within 18 h "Short range: high-resolution model updated hourly" at a U.S. stadium and "Short range (within 18 h of kickoff)" anywhere else, within 48 h "Next-day guidance", within 72 h "Trend indicator only (2 to 3 days out)", within 120 h "Early outlook, low confidence (3 to 5 days out)". An open screen (the old trends panel, the new app's Lines board and its game sheet) re-renders every minute from the server's `asOf` plus the time since the answer arrived (never the device's own date), so a stale forecast never stays on screen as fresh. It asks the server again only at the next due point, at kickoff, when a game enters the 120 h window and when the tab becomes visible (`nextWindRefresh`, `web/src/windTimer.js`). A game still due after an answer (no snapshot, or one past its due time, because the server turned the read away or held off) is asked again a minute later after `busy`, `cooldown` or a fetch, and 15 minutes later after `backoff`, `budget`, a failed fetch or anything else (the shortest backoff). A wait longer than 6 h is re-armed without a read, and a device that slept past a due point reads on its next one-minute tick.

**Why the short-range label depends on the venue.** Open-Meteo's best match uses NOAA HRRR (3 km, a new run every hour) only inside HRRR's CONUS grid. Every U.S. stadium in `shared/wind-venues.mjs` is inside it and every stadium abroad is outside (`tests/wind-venues.test.mjs` projects each one onto the grid). Abroad best match picks other models: ICON-D2, updated every 3 h, at Saint-Denis (Week 7) and Munich (Week 10); ICON-EU, IFS and GFS at Madrid (Week 9); the global GFS, ICON and IFS mix at Mexico City (Week 11), about 585 km south of the grid. So outside the U.S. the label names only the lead and makes no model or update-rate claim, and the model line reads "European and global models".

**Which hour.** Sustained wind, direction and temperature come from the model hour nearest kickoff (kickoffs fall on :00 to :30, so at most 30 minutes away; a :30 kickoff takes the later hour). Gusts, precipitation and precipitation chance come from the hour after kickoff's clock hour, because Open-Meteo reports those over the preceding hour. The trend's input, nflverse `wind`, is a single kickoff reading, so GTL does not interpolate: the stored number is an exact Open-Meteo value, and the band test uses it unrounded (10.0 and 15.0 mph).

**Bands.** "10–14 mph band: if this holds, the Strong wind (10+ mph) Under card would fit this game; the Very strong wind (15+ mph) card would not." "15+ mph band: if this holds, both wind cards would fit." "Below 10 mph: neither wind card would fit if this holds." Within 3 mph of 10 or 15: "Within 3 mph of a threshold. Forecasts this far out often miss by more than that." The cards keep their Tier 1 and Tier 2 places; a forecast never relabels them as firing.

**Attribution.** "Weather data by Open-Meteo.com" (<https://open-meteo.com/>) · CC BY 4.0 (<https://creativecommons.org/licenses/by/4.0/>) · "Kickoff-hour values selected by GTL; wind direction shown as compass points", on the wind card and in the trends footer whenever forecast data is shown. Collapsed summaries say only "see the kickoff wind forecast above" and never carry values or links (a link inside `<summary>` fails axe's nested-interactive rule and cannot sit next to data that is collapsed).

**Not backtested.** The 10+ mph Under record was measured with observed kickoff wind. The honesty note, shown with every forecast, cites the file's own record label (Results 2018-2025 (period used to select this card): 282-196-5), the full history (898-730-22) and this season, says using it with a forecast has not been backtested, and that open-ground grid wind can differ from what reaches the field. Plan: from an environment with egress, compare Open-Meteo Previous Runs forecasts (T-24 h and T-48 h, archived since January 2024) with 2024–2025 observed wind and re-run the walk-forward split on forecast-qualified games.

**Budget and single flight.** One multi-location GET per refresh (at most 16 locations; a shared stadium is sent once; Week 6 is 12 locations), one Open-Meteo call per location. `gtl_begin_wind_fetch` serializes every start under one advisory lock, refuses while a 20 s lease is live (`busy`), spaces starts 60 s apart (`cooldown`), backs off 15 minutes after a failure, 60 minutes after two in a row or an hourly rate limit, and until 00:00 UTC after the daily limit (`backoff`), re-checks which games are still due (`not_due`) and caps the UTC day at 200 calls (`budget`, trimming a request to what is left, nearest kickoff first). Readers who are refused are served what is stored, with its age. A request that dies mid-fetch costs its calls and backs off 15 minutes.

**Cap math (D-47).** The worst case is a reader every minute, with every game refreshed the moment the schedule calls it due. Any open screen re-reads at every due point (`nextWindRefresh`), so one member with the Lines board open through a Sunday is this case. `tests/wind-cloud.test.mjs` recomputes the table from `shared/trends/season-2026.csv` with the real planner; each week is read alone, as `/wind/read` plans only the requested week.

| Week | Busiest UTC day | Fetched games | Calls, a reader every minute | Upper bound, any reader timing | With the 200 cap |
|---|---|---|---|---|---|
| 6 | Sun Oct 18 | 12 | 22 | 31 | Every forecast stays current |
| 7 | Sun Oct 25 | 11 | 20 | 28 | Every forecast stays current |
| 8 | Sun Nov 1 | 12 | 22 | 31 | Every forecast stays current |
| 9 | Sun Nov 8 | 12 | 23 | 33 | Every forecast stays current |
| 10 | Sun Nov 15 | 12 | 22 | 31 | Every forecast stays current |
| 11 | Sun Nov 22 | 11 | 20 | 28 | Every forecast stays current |
| 12 | Sun Nov 29 | 12 | 17 | 25 | Every forecast stays current |
| 13 | Sun Dec 6 | 11 | 22 | 31 | Every forecast stays current |
| 14 | Sun Dec 13 | 13 | 24 | 34 | Every forecast stays current |
| 15 | Sun Dec 20 | 12 | 19 | 29 | Every forecast stays current |
| 16 | Sun Dec 27 | 12 | 17 | 24 | Every forecast stays current |
| 17 | Sun Jan 3 | 15 | 28 | 40 | Every forecast stays current |
| 18 | Sun Jan 10 | 13 | 26 | 39 | Every forecast stays current. The season file lists all sixteen Week 18 games at 1:00 PM ET, a placeholder until the NFL sets the times |

"Upper bound" counts, for each fetched game, every refresh the schedule allows from 00:00 UTC, starting with no snapshot. A refresh resets a game's 24 h, so on one UTC day a game is refreshed at most once outside the checkpoints, plus once at each checkpoint that falls on that day before kickoff (at most three calls); no reader timing can need more. "With the 200 cap" runs the same reader with the SQL cap (trim the request that would pass 200, nearest kickoff first, refuse the rest of the UTC day): the cap never binds, and no game of any week is ever without a current forecast. The cap counts every week's calls together; with every week's readers the season's busiest UTC day is still Sunday, January 3, 2027 at 28 calls (14% of the cap), and Week 7's Thursday game entering its window adds one call to Week 6's Sunday (23). Under D-34's tiers the busiest days of Weeks 14, 17 and 18 needed 210, 245 and 234 calls; now they need 24, 28 and 26. The cap stays 200 (Sean did not ask to change it). Fetching SoFi Stadium would now add at most three calls on any day; D-45 keeps it Indoors.

**Board chip (D-45).** The new app's Lines board shows at most one word chip per game, from `weatherChip` in `shared/weather-view.mjs`, and only for a current forecast: "Rain likely" or "Snow likely" when the kickoff-hour precipitation chance is 50% or more (precipitation wins), else "Windy" when the kickoff-hour sustained wind is 15 mph or more. Snow means a kickoff-hour temperature of 32 °F or colder, because the stored fields have no weather code or snowfall; with no temperature there is no precipitation chip. A chip has no digits and no link; the values and the credit are in the game sheet's full card. "Indoors" and "no current forecast" rows never get one, so a dome and SoFi Stadium never do. After kickoff the chip follows the final pre-kickoff forecast (made within 2 h of kickoff) for as long as the board shows the game, with no end time, like the card. The board and the sheet are built in redesign stage 13 (see [New app: simplified trends](#new-app-simplified-trends-dash-7)); a card with a board trend line keeps that line as its one chip.

**Superseded copy.** The frozen registry note and the week file's `windConditional`, `wind15Conditional`, `weatherConditional` and `evidence` strings still say "no forecast source". `shared/trends-view.mjs` (`WIND_COPY`, `WIND_CARD_NOTES`) supersedes them on screen only, so the registry sha256 and the week file are unchanged; the next registry carries the new note.

**Hosted pieces (migration applied October 13; `gtl-api` and Pages deploys pending).**

- Route `POST /wind/read { season, week }` in `cloud/wind.mjs`, with the Open-Meteo adapter in `cloud/open-meteo.mjs` and the stadium mirror in `shared/wind-venues.mjs`.
- D-47 migration `supabase/migrations/20261015120000_gtl_wind_refresh_schedule.sql`: replaces `gtl_begin_wind_fetch` with the same body except its due re-check (the 24 h / 12 h / 2 h schedule instead of the tiers); no table, row, grant or other function changes. Written and **not applied**; rollback `supabase/rollback/20261015120000_gtl_wind_refresh_schedule.sql` restores the D-34 body. Release order: [D-47](DECISIONS.md#d-47--weather-every-24-hours-then-12-hours-and-2-hours-before-kickoff-october-15-2026).
- Migration `supabase/migrations/20261013060000_gtl_wind_forecasts.sql`: tables `gtl_wind_fetches` (attempts, leases and the budget log; no member id), `gtl_wind_fetch_outcomes` and `gtl_wind_forecasts`, all insert-only and service-role only behind RLS; RPCs `gtl_read_wind_forecasts`, `gtl_begin_wind_fetch` and `gtl_finish_wind_fetch`, security invoker with an empty search path, executable by service_role only.

## Data and attribution

- Source: the nflverse-data schedules release, <https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv>, licensed CC BY 4.0 (<https://creativecommons.org/licenses/by/4.0/>).
- Credit shown on every panel and in Data connections: "Data: nflverse; schedules maintained by Lee Sharpe (CC BY 4.0), modified".
- Modified: column subset, values trimmed, corrections in `shared/trends-corrections.json`, aggregated into trend records.
- Caveat: NFL data belongs to its respective owners. The CC BY license does not extend to upstream rights such as the odds columns, whose book is not documented.
- Line source label: "nflverse schedule file: last recorded line (book not documented)". ROI from the file's odds is computed but not shown until Sean approves records derived from odds with an undocumented book.
- Only public game facts and derived aggregates ship in static assets. No player or user data enters the generator or the week files.
- Kickoff wind forecast (D-34): "Weather data by Open-Meteo.com" (<https://open-meteo.com/>), API data under CC BY 4.0, with an attribution link next to every place it is shown. Changes: "Kickoff-hour values selected by GTL; wind direction shown as compass points". The free API is for non-commercial use under 10,000 calls a day, 5,000 an hour and 600 a minute; GTL caps itself at 200 a day. Forecasts are fetched by the hosted service only and never enter static assets.

## Weekly operator step

1. Tuesday morning, after the Monday-night final appears in the release file: `node scripts/trends.mjs --season 2026 --week N`. It writes `shared/trends/season-2026.csv` (unplayed games redacted), `shared/trends/2026-week-NN.json` and `web/src/trendWeeks.generated.js`. Use `--allow-pending` for an early run before a final is in (pending teams show "Updates after the final").
2. Optional mid-week referee rerun while the hosted referee pieces are not deployed: add `--reuse-season-file --referees refs.json`, so the season file and every other game stay byte-identical.
3. Run `npm test` and `npm run build`. Commit on a branch, open a PR and merge when CI is green.
4. Deploy Pages from `main` with the existing command. The week files are same-origin lazy chunks, so no CSP change is needed.

At season end: `node scripts/trends-history.mjs --through 2026` freezes the finished season, and `node scripts/trends-registry.mjs --study .local/trends-study/results_all.json` re-freezes the registry. Promotions happen only then. The study outputs stay in `.local/` and are never committed.

## Deployed state

- **Not deployed.** The engine, week file, UI and referee route are on `main` (PR #60, merged October 13); the referee migration is applied hosted, and the `gtl-api` and Pages deploys are pending.
- Shipping the panels needs a Pages deploy only. The referee pieces do not fail the deploy chain's `npm run check:cloud` before they exist: `scripts/boundary/lines.mjs` (joined by `scripts/check-cloud-boundary.mjs`) lists the two referee RPCs and the two `/officials` routes in `awaitingDeploy` and reports them as "awaiting deploy, not verified". It accepts only the exact not-found answer (PostgREST `PGRST202` for a missing function, gtl-api's own `Not found.` for a missing route); any other answer must still be a denial, and every other probe still runs. Nothing else is in `awaitingDeploy`: the Community history and D-27 line-at-guess probes still fail the check until their migrations are applied hosted (see [SOCIAL_COMMUNITY.md](SOCIAL_COMMUNITY.md#deployed-state)).
- Shared commissioner referees also need:
  - the migration `20261012234500_gtl_game_officials.sql`, applied to the hosted project on October 13 as `20261013050416` (both functions byte-identical to `main`),
  - a `gtl-api` deploy.
- The frontend falls back cleanly, so the two can ship in either order.
- After both are live, run `node scripts/check-cloud-boundary.mjs --strict` (every probe must deny, none awaiting deploy), then remove the four `awaitingDeploy` entries from `scripts/boundary/lines.mjs` in the change that records the hosted migration version.
- **Kickoff wind forecast (D-34): not deployed.** Migration `20261013060000_gtl_wind_forecasts.sql` is applied to the hosted project on October 13 as `20261013072206` (all three functions byte-identical to `main`); it still needs a `gtl-api` deploy and a Pages deploy, in either order. Until then `check:cloud` lists the three wind RPCs and `/wind/read` as awaiting deploy for the same reason as the referee pieces (both builds fall back cleanly); after both, run `--strict`, remove the four wind entries, add the three wind tables to the table probes, and run the hosted reachability check in [SOCIAL_COMMUNITY.md](SOCIAL_COMMUNITY.md#deployed-state).
- **Lines reader (M-06, redesign stage 23): not deployed, not applied.** `scripts/boundary/lines.mjs` also lists its four functions and the two `/lines` routes in `awaitingDeploy`; the order is the `gtl-api` deploy, then Sean's "apply M-06" ([Lines reader](#lines-reader-m-06), Release).

## Limits

- Forecast weather only at the kickoff hour, for open-air and retractable-roof venues; temperature, precipitation and other weather trends still need observed data; using the wind record with a forecast is not backtested.
- A forecast is refreshed only on the D-47 schedule and only when a member reads: a current card can be up to a day old (up to 10 h between the 12 h and 2 h checkpoints), plus the hour of grace, and its age line says so.
- Snow is read from the kickoff-hour temperature (32 °F or colder) because no weather code or snowfall is stored; freezing rain reads as snow and wet snow just above freezing as rain.
- No opening lines or line movement in the trend records (the lines reader gives the game sheet each game's movement and kickoff line, [above](#lines-reader-m-06)).
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
- Simplified trends (redesign stage 13): `tests/trends-view.test.mjs` (per-game access, line gates, short cards, the top three, Week 6 board trends, All trends, locked cards with no number, the copy guard), `tests/trends-week.test.mjs` (the week file holds no current line), `tests/lines-view.test.mjs`, `tests/next-lines-ui.test.jsx`, `tests/wind-ui.test.jsx` (the new app's weather row) and `tests/cloud-browser/next-lines.spec.js`.
- `tests/officials-cloud.test.mjs`: the route with an in-memory store, including the non-commissioner refusal before any write.
- `tests/officials-sql.test.mjs`: the migration on PGlite (grants, RLS, invoker functions, refusals, revisions, history, audit, member reads).
- Kickoff wind forecast (D-34):
  - `tests/open-meteo.test.mjs`: the recorded fixtures and the schema-exact builder (`tests/fixtures/open-meteo/`), strict validation and unit traps, every error code, transport limits, the exact request URL and fetch options, and kickoff-hour selection for every Week 6 kickoff, Melbourne, both DST changes and three process time zones.
  - `tests/wind-venues.test.mjs`: the stadium mirror against the venue table, the 2026 season file and every week file.
  - `tests/wind-cloud.test.mjs`: the route through the handler (the D-47 planner at every boundary, one request for concurrent reads, failures as 200s with stored data, Monday night after the next week opens, refusals, no private keys, the adapter's headers), and (D-47) the cap table above from the 2026 season file, with and without the SQL cap.
  - `tests/wind-sql.test.mjs`: the D-34 and D-47 migrations on PGlite (grants, RLS, insert-only, single flight, spacing, backoff, the daily cap with trimming, the schedule checked against `windDue`, row checks, replay, time zones, isolation from scoring tables, the route end to end, and the rollback to D-34's tiers).
  - `tests/trends-view.test.mjs`, `tests/weather-view.test.mjs`, `tests/lines-view.test.mjs` and `tests/wind-ui.test.jsx`: when a snapshot is current (an hour past its due time, the final forecast), the re-read points and retries, and an open screen's timer (one read per due point, the 6 h re-arm, a device that slept); `tests/cloud-browser/next-lines.spec.js`: the Lines board reads again at the due point and not before.
  - `tests/wind-ui.test.jsx`: every state, the credit next to every value, the honesty note from the file, fake timers moving an open panel from forecast to out of date and to final, and (D-45) one weather row on every Week 6 panel, "Indoors" for the dome and SoFi, "Roof may close" with and without a forecast, an open-air card with no wind card that fits, and board chips that are words only.
  - `tests/weather-view.test.mjs` (D-45): `weatherRow` for every roof type, closed roofs, unknown venues, missing, stale and final snapshots, and "Roof may close" on every retractable row; `weatherChip` at 14.9/15.0 mph, 49/50% and 32 °F, precipitation over Windy, never on a dome or SoFi, no digits, purity.
  - `tests/cloud-browser/wind.spec.js`: a member's panel with one Open-Meteo stand-in request for every panel and member, axe, a dome and a retractable roof, a failed request, and (D-45) the Las Vegas dome and SoFi as Indoors and Atlanta's "Roof may close" at 320, 390 and 1440 px in Light and Dark, with one request for Atlanta only. Run locally through a Playwright wrapper on ports 5398 (cloud) and 8990 (local), with its own output directories.
- `tests/cloud-browser/trends.spec.js`:
  - the toggle and expander,
  - axe on the open panel,
  - the 403 for a player,
  - the commissioner dropdown saving for everyone,
  - the assignment showing for another member.
