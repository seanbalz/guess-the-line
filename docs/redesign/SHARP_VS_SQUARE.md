# Sharp vs square: sources, rights and options

Owner: Sean Balsiger · Version 1 · October 15, 2026
Status: research record for Sean's October 15 request (below). Nothing in this file is built, applied or deployed. This research created no account, accepted no terms, fetched nothing behind a login, scraped no page, contacted no provider and spent no money. Free data only ([AGENTS.md](../../AGENTS.md)). The repository was read at `main` `8a1bee7`.

---

## Sean's request, as relayed

The Mac mini session relayed this to the coordinating cloud session on October 15, 2026. It is the relay's wording, not a transcript of Sean's words:

> (A) a NEW FEATURE, "Sharp vs square" per game, for spreads and totals: percent of bets vs percent of money on each side, the sharp side in green and the square side in red, as a creative chart; edges observed, line movement, and possible reasons (injury reports, etc.); and (B) a Fantasy Football section on the back burner (backlog, not scheduled).

The relay asked that the first step be this source and rights research, with free and paid options for Sean. That is all this file does.

## What was read today, and what could not be

- **Reachable from this session on October 15, 2026:** `github.com` only. The session's egress proxy refused a tunnel to every other host tried: `the-odds-api.com`, `actionnetwork.com`, `data.vsin.com`, `vsin.com`, `covers.com`, `dknetwork.draftkings.com`, `sports.betmgm.com`, `espn.com`, `sportsinsights.com`, `oddsjam.com`, `pregame.com`, `nfl.com`, `docs.sleeper.com`, `api.sleeper.app`, `sportsdata.io`, `developer.sportradar.com`, `docs.sharpapi.io`, `oddsshark.com`, `scoresandodds.com`, `bettingpros.com`, `unabated.com`, `sportsbookreview.com`, `thelines.com` and `nflreadr.nflverse.com`. The proxy's own guidance is not to route around a refusal, so none of those pages were read today.
- **Earlier dated reads reused:** [ODDS_PROVIDER_EVALUATION.md](../ODDS_PROVIDER_EVALUATION.md) (version 6, "Sources accessed 2026-10-08") and [FRESH_SUBMISSION_AND_SOURCES.md](../FRESH_SUBMISSION_AND_SOURCES.md). Where this file quotes a terms clause through them, it says "per the October 8 read" and gives that file's summary, not a fresh verbatim quote.
- **Search snippets:** where a row says "search snippet", a web search returned text about the page; the page itself was not opened. A snippet is not a read of the terms.
- Every row in section 2 names which of the three it rests on. **No clause in section 2 was read verbatim today.** If Sean picks a source, its terms must be opened and quoted, with the date, before any build.

## 1. What the feature needs, per game and market

Per game, for Spread and for Total:

| Element | What it is | Where it can come from today | Gate |
|---|---|---|---|
| Bets % per side | Share of counted wagers on each side, in the named book's or aggregate's sample | **Nothing connected.** Section 2 | Per game and market, with the line (below) |
| Money % per side | Share of dollars (handle) on each side, same sample | **Nothing connected.** Section 2 | Same |
| The sharp and square call | The requested SHARP/SQUARE labels remain a proposal, with no validated classifier. Money share minus bets share is an observed percentage-point gap, not evidence of bettor skill. DATA-08 requires a permitted provider classification with its methodology or a separately documented, validated inference, clearly labelled as inferred ([ODDS_PROVIDER_EVALUATION.md](../ODDS_PROVIDER_EVALUATION.md), "Research field definitions and integrity"; tracker DATA-08's rule "do not classify professional action from a price change or ticket/handle disagreement alone") | No classification established; licensed splits alone do not satisfy DATA-08 | Same |
| Line movement over time | The three-book line at each stored collection, from the week's first collection to kickoff, with each book's line and prices | **GTL's own snapshots**, already stored. Section 3 | The line lock: hidden until the player locks in that game's guess for that market, sits the market out, or the game kicks off (D-36, D-39, D-31; `RULES.md` "Current consensus") |
| Edges observed | Three honest observations, each with a timestamp: (1) the split gap (money % minus bets % on a side); (2) net movement since the week's first collection and since the newest split; (3) "line moved toward the money side" or "toward the bets side", only when a split and a snapshot can be ordered in time. "Reverse line movement" means movement against the side receiving the majority of tickets, not toward it ([definition](https://www.actionnetwork.com/education/reverse-line-movement/)); it is a description, not a verdict, and never a +EV claim (D-11: "neither agreement nor a point gap is established EV") | (1) needs section 2; (2) and (3) need section 3, and (3) needs both | Same |
| Possible reasons | Timestamped facts placed on the movement strip, so a reader can see what was public before a move: injury and practice reports (section 4), the kickoff weather (D-45, already on every game), the referee (D-32, when assigned), a kickoff change (BET-07-Q19). GTL never says a fact caused a move; the chart shows what was public and when | Injuries: section 4. Weather and referee: live today | Reasons reveal no line or pick, so they are not gated (D-45's rule for weather); they appear on the gated strip only once the strip is open |

**Where it lives.** The new app's game sheet (build plan stage 34, "movement (DP-26)", [REDESIGN_BUILD_PLAN.md](../REDESIGN_BUILD_PLAN.md)) and, if Sean wants a board view, the Edge board (stage 32). The Edge board's existing word "Edge" means the player's gap against the line (D-36); the new "edges observed" must not reuse that name unqualified.

**The chart, as a sketch (nothing is drawn).** One card per market with two bars per side, bets % over money %, the two sides mirrored like a tug-of-war so the longer money bar is read against the longer bets bar. The requested SHARP/SQUARE words and win/loss colors remain proposed until DATA-08's classification requirements are met; they must not be assigned from the percentage gap alone. The proposed tokens are: new app `--gx-win` `#34D399` dark / `#067247` light, `--gx-loss` `#FC7C8E` dark / `#B32643` light (`web/src/next/styles/tokens.css`; D-38 table in [BRAND_GUIDE.md](../BRAND_GUIDE.md)); old app `win` `#34D399` / `#067247`, `loss` `#FB7185` / `#B32643` (`design/tokens.json`). Under each pair, the movement strip: one dot per stored collection, the three-book line, the player's own line at the guess (D-27) as a marker, the kickoff line (M-06) once there is one, and the reason markers. Rules that bind it: the brand guide's "Never use red/green alone" and the new app's rule 7 ("Never color alone: every state has a word or an icon"), rule 8 ("a value, '—' for missing (never 0)"), PROVISIONAL written out, tabular numbers, reduced motion, and a source line under every card naming the sample ("DraftKings Sportsbook bettors, 2:05 PM PT", never "the market"), the collection times and the credit each licence asks for.

**Definitions this feature inherits** (from [ODDS_PROVIDER_EVALUATION.md](../ODDS_PROVIDER_EVALUATION.md), confirmed by D-04): a ticket percentage is a share of counted wagers within the named source's sample; a handle percentage is a share of money in that sample and reveals neither dollars nor the number of bets; an absolute ticket count is shown only when a source reports one, never derived from a percentage; a money/ticket gap or a reverse move is a possible signal, not proof; GTL's own players' guesses are never presented as market splits.

## 2. Candidate sources for bets % and money %

Reachability today is in the section above. Columns: what it provides · update cadence · cost · licence or terms (clause, URL, date read) · attribution · may GTL store and show it.

| Source | Provides | Cadence | Cost | Licence / terms | Attribution | Store and show in GTL? |
|---|---|---|---|---|---|---|
| **Action Network, public betting** (`actionnetwork.com/nfl/public-betting`) | Bets % (tickets) per side on the free page; money % and tracked bet counts behind PRO, per its help page | Not read. The page shows a time per game (October 8 read) | Free rows; PRO price not read | Terms §§1–2, read October 8, 2026 per [ODDS_PROVIDER_EVALUATION.md](../ODDS_PROVIDER_EVALUATION.md): "personal access does not permit republication, display or derivative use in GTL without written permission. Free preview rows or manual copying do not clear that gate." [FRESH_SUBMISSION_AND_SOURCES.md](../FRESH_SUBMISSION_AND_SOURCES.md) adds: "Action Network requires permitted access and written redistribution/display permission for its consensus content." URL: `https://www.actionnetwork.com/terms`. Not re-read today (host refused) | Not applicable without permission | **No**, without written permission. Option D asks for it |
| **VSiN betting splits** (`data.vsin.com/betting-splits/?source=DK&sport=NFL`) | Bets % and handle % per side for spread, total and moneyline, selectable DraftKings or Circa; one preview matchup free, the full board behind VSiN Pro (October 8 read) | "Five-minute updates" (October 8 read); a search snippet today says the same and that the figures "come directly from DraftKings and Circa Sports" | Free preview; VSiN Pro price not read today (a search snippet shows an older "$199 for a year" promotion, unconfirmed) | **Terms not read**, on October 8 or today (`vsin.com` refused). The October 8 read recorded "Reference only; free full-feed/display rights unverified" | Not applicable until read | **Not established.** A VSiN Pro subscription is a personal reading licence, not a redistribution grant, unless its terms say otherwise |
| **DraftKings Network and DraftKings Sportsbook** | DraftKings' own bets % and handle % (the figures VSiN and CBS Sports republish; a search snippet quotes CBS: "All the bet percentages come from DraftKings Sportsbook") | Weekly articles; the in-app figures' cadence not read | Free to read | **Not read** (`dknetwork.draftkings.com` refused; no DK Network splits page surfaced in search today). DraftKings' terms of use not read | Not applicable until read | **Not established.** DraftKings is the only source that could grant its own figures; see Option D |
| **BetMGM** | Occasionally publishes its public betting percentages in blog posts (not verified today) | Not read | Free to read | **Not read** (`sports.betmgm.com` refused) | Not applicable | **Not established** |
| **ESPN BET** | Search snippets (ingame.com, casinobeats.com, igamingexpert.com, read as snippets today): Penn ended the ESPN partnership and rebranded the app to **theScore Bet on December 1, 2025**. So "ESPN BET" no longer exists as a book under that name; ESPN's editorial "betting splits" pieces are ESPN content | — | — | **Not read** (`espn.com` refused). ESPN's terms not read | Not applicable | **Not established**; also not a current sportsbook under that name |
| **Sports Insights** (Action Network's sister site) | Betting trends pages (not verified today) | Not read | Not read | **Not read** (`sportsinsights.com` refused). Likely the Action Network terms; unverified | Not applicable | **Not established** |
| **OddsJam** | Not verified today | Not read | Not read | **Not read** (`oddsjam.com` refused) | Not applicable | **Not established** |
| **Pregame** | Not verified today | Not read | Not read | **Not read** (`pregame.com` refused) | Not applicable | **Not established** |
| **Covers, consensus picks** (`covers.com/sports/nfl/consensus-picks`) | Commonly a tally of Covers users' picks, not sportsbook bets or money. **Not verified today** | Not read | Free to read | **Not read** (`covers.com` refused) | Not applicable | **Not established**, and even if permitted it would not be bets % or money % |
| **The Odds API add-ons** (`the-odds-api.com`, GTL's connected odds source) | The October 8 read of its V4 guide found "No splits, ticket counts or outside model projections". A search today for a splits or public-betting add-on found none | — | Free plan 500 credits/month (connected) | Terms read October 8, 2026 per [ODDS_PROVIDER_EVALUATION.md](../ODDS_PROVIDER_EVALUATION.md) (terms updated 2026-08-31): "Current terms permit app display, derived analytics, indefinite storage and model training; standalone raw-data redistribution is prohibited." Not re-read today (host refused) | Source and time on every line (already done) | **Not a splits source.** Its odds remain the basis of section 3 |
| **Owls Insight API** (`owlsinsight.com/docs`) | Documented per-book splits (October 8 read) | Not read | Paid: "Rookie tier required. Free accounts cannot create keys or call its API" (October 8) | **Terms not read** beyond the docs page; "Not a free production source" (October 8) | Not read | **Paid only**; rights to display in GTL not read |
| **Sportradar Betting Splits** (`developer.sportradar.com/insights/...`) | Search snippet today: "aggregates bet percentage and money percentage from over 150 bookmakers", NFL covered; "the ticket percentage and stake percentage can be exposed, but the number of bets cannot"; "feeds don't represent a single book, but rather an aggregation of books" | Not read | Enterprise: "contact sales for trial access"; no price in the snippet | **Not read** (host refused). The snippet's exposure rule suggests a display licence exists, but its terms were not opened | Not read | **Paid, terms unread.** The most documented API of the three paid candidates |
| **SharpAPI** (`docs.sharpapi.io/api-reference/splits`) | Search snippet today: "handle % and bet % splits from DraftKings and Circa Sports, refreshed every 5 minutes" | "Every 5 minutes" (snippet) | Snippet: one docs version lists splits "available to all tiers", another "gates it behind a Pro tier at $229/mo"; unresolved | **Not read** (host refused). Whether SharpAPI holds DraftKings' or Circa's permission to resell their figures is not shown anywhere read | Not read | **Paid, terms unread, rights chain unknown.** A vendor without the books' permission cannot pass GTL a right it lacks |
| **SportsDataIO** | A search today surfaced no SportsDataIO splits documentation; nothing verified | — | — | **Not read** (host refused) | — | **Not established** |
| **Scrapers** (Apify listings for Action Network and VegasInsider appeared in search) | Scraped splits | — | Paid | Scraping is out of bounds for this project (the relay's authority, [AGENTS.md](../../AGENTS.md)) and would not change the publishers' terms | — | **No** |

**Summary.** No source read today or on October 8 permits GTL to store and show bets % and money % for free. The free pages that show the metric (Action Network, VSiN's preview, the DraftKings figures republished by VSiN and CBS Sports) are published under terms that, where read, forbid republication without written permission, or that could not be read at all. The documented APIs that carry both metrics (Sportradar, SharpAPI, Owls Insight) are paid, and none of their terms was readable from this session. Tracker items DATA-07 and DATA-08 (blocked on October 8 for exactly this) stay blocked. A GTL build of the sharp and square call therefore waits on permitted data through Option C or D in section 5 and a classification methodology that satisfies DATA-08.

## 3. Line movement from GTL's own snapshots

This part needs no new source. Everything below is read from the repository at `8a1bee7`.

### 3.1 What `gtl_market_snapshots` holds

Created by `supabase/migrations/20261008185738_gtl_manual_odds_collection.sql`:

| Column | Meaning |
|---|---|
| `id` | The collection's id: one snapshot per `gtl_odds_collections` row that stored lines (`reserved_credits` 2 for a provider collection; 0 for an M-05 carry-over snapshot) |
| `season`, `week`, `slate_signature` | The published week the snapshot belongs to and the slate it was collected against |
| `payload` | The adapter's normalized reply (below) |
| `created_at` | When the row was written |
| `official_verified` | Always `false` (checked); no snapshot is an official benchmark |

The payload (`cloud/odds-provider.mjs`, `normalize` and the collector's return) carries: `provider` (`the-odds-api`), `sport` (`americanfootball_nfl`), `fetchedAt`, `selectedBooks`, `status`, `quota`, `officialVerified: false`, `verification: { status: 'not_verified' }`, `model: null`, `expectedValue: null`, and `games[]`, each with `gameId`, `home`, `away`, `kickoff`, `providerEventId`, `matchStatus`, and `markets.spread` and `markets.total`, each `{ status, quotes[], unavailable[] }`. A quote is one book's price for one market: `book` (`draftkings`, `fanduel` or `betmgm`), `value` (the signed home spread, or the combined-points total), `outcomes` (`home`/`away` or `over`/`under`, each with its `line` and American `odds`), `providerObservedAt` (the provider's `last_update` for that market, `timeBasis: 'provider_market_last_update'`), `bookmakerUpdatedAt`, `collectedAt`, and `tradability: 'not_confirmed'`. So every snapshot holds, per game and market, **three books' lines and both prices with an observation time**, not only a consensus number.

### 3.2 When snapshots are taken

- The hosted schedule `nfl-12h` runs at **08:15 and 20:15 UTC** (`20261008200926_gtl_twelve_hour_odds_refresh.sql`: twelve-hour bins anchored at 08:15 UTC), currently 1:15 AM and 1:15 PM Pacific; the wall-clock time shifts with daylight saving ([FRESH_SUBMISSION_AND_SOURCES.md](../FRESH_SUBMISSION_AND_SOURCES.md)).
- Submission-triggered collections add to those when a player's save finds the newest stored line missing or older than five minutes (D-27). All collections share **six per UTC day**, a **five-minute cooldown**, **two credits each** and a **50-credit reserve** on the free plan's **500 credits a month** (`20261012213000_gtl_submission_odds_window.sql`, D-27; worst case 372 credits a month).
- A week opens Monday 12:00 AM PT (D-24), so a new week's **first stored point is the Monday 08:15 UTC run**, about 75 minutes after the open, unless a save triggers one sooner. Collection continues on a closed week until its last kickoff. The Monday-night carry-over (M-05, `20261014221500_gtl_odds_open_weeks.sql`) is **built and not applied** (release record, October 14 and 15).
- Per week that is at most 14 scheduled points plus up to 28 submission-triggered ones. A Thursday game gets eight scheduled points from the open (Monday 08:15 UTC through Thursday 20:15 UTC); a 10 AM PT Sunday game gets thirteen.

### 3.3 What counts as a line

`gtl_line_from_snapshot` (`20261012230000_gtl_submit_with_line_at_guess.sql`), the D-16/D-27 validator, accepts a game and market in a snapshot only when: the payload is the provider's NFL reply, captured before that game's kickoff; the game appears exactly once with matching home, away and kickoff and `matchStatus` `matched`; there are **exactly three quotes from the three distinct books**; each value is a half-point number in range, its outcomes are paired (home line equals the value, away equals its negative; over equals under), and its observation time is **no more than five minutes before the capture**; and the three pass the within-five-points consistency rule, the middle value being the line ([FRESH_SUBMISSION_AND_SOURCES.md](../FRESH_SUBMISSION_AND_SOURCES.md), "Dashboard"). A two-book collection, or one captured at or after kickoff, is skipped, not approximated.

### 3.4 Readers that already exist

M-06, `supabase/migrations/20261015010000_gtl_lines_read.sql` (redesign stage 23, merged in PR #90; **not applied** per the release record of October 14 and 15), adds `gtl_read_game_lines(viewer, season, week, game, now)`: per open market, the newest qualifying line, its three named books with both prices from the same collection, **`movement`: every qualifying line stored by `now`, the newest 48, oldest first, each `{ value, capturedAt }`**, and from kickoff `kickoffLine`, the newest qualifying line captured in the 12 hours before kickoff (`gtl_kickoff_line`). Both are gated per game and market by M-01's `gtl_markets_visible` (applied October 14); a closed market is `{ visible: false }` and nothing about it is computed. Route `POST /lines/game` (`cloud/lines.mjs`) answers 503 until the apply. See [TRENDS.md](../TRENDS.md#lines-reader-m-06). D-27's line at the guess (`gtl_submit_with_line_at_guess`, applied) gives the player's own marker.

### 3.5 What a movement chart can honestly show today, without any new source

1. The three-book line at each stored collection from the week's first collection to kickoff: a sampled series, two points a day plus any submission-triggered ones, with each point's capture time and the newest point's provider observation time.
2. Each book's line and both prices at each point, so a **price move with the line unchanged** (−110 to −118 on one side) is visible. Books often shade the price before they move the number; GTL can show that it happened, with times.
3. Net movement: from the first stored point to now, and to the kickoff line once there is one; direction and size in half points.
4. The player's own line at the guess as a marker (D-27), and from kickoff the kickoff line (M-06). Other players' markers only under D-23 and D-31's reveal rules.
5. Annotations at 1.5 and 3 points of net movement, the thresholds `RULES.md` already names for movement alerts (the alerts themselves are not built).
6. Reason markers from sources GTL already holds (weather, referee, a commissioner kickoff change) and, with section 4, injury and practice reports, each placed at its own timestamp.

### 3.6 What it cannot honestly show

- **The opening line.** Books post look-ahead lines days before the week opens; GTL's first point is Monday 08:15 UTC. The chart must say "since Mon 1:15 AM PT", never "opened at".
- **Moves between collections.** Up to twelve hours apart on a quiet day. A "steam" move and its reversal inside one gap are invisible; the chart cannot time a move or say which book moved first.
- **Who moved the line.** Movement is not sharp action (DATA-08's rule). A permitted, timestamped split can establish which side held the majority of tickets for a reverse-movement observation. It cannot by itself identify sharp or square bettors; those labels still require DATA-08's classification evidence.
- **Books other than DraftKings, FanDuel and BetMGM**, Caesars included (paid on the provider); moneylines; live in-game lines; any point where a collection failed, was refused by the cap or returned a stale market.
- **Executable prices.** Every value is a collected reference, `tradability: 'not_confirmed'`.

### 3.7 Denser sampling and the free plan

At two credits a collection, 500 credits buy at most 250 collections a month, about eight a day, before the 50-credit reserve. Hourly sampling would cost 1,488 credits a month (three times the plan). Every four hours would use the whole six-a-day cap on scheduled runs, so D-27's submission-triggered collection would always be refused and "the line at your guess" would be up to four hours old; D-27 says a refused collection never refuses a save, but the scoring reference is the core product and the chart is not. Any change to the cadence is a migration and a revisit of D-27, and only Sean can make it.

## 4. Free reason-source candidates and reuse checks

### 4.1 nflverse injuries (candidate pending upstream rights verification)

| Item | Finding | Read |
|---|---|---|
| What it is | `nflreadr::load_injuries()`: "Load Injury Reports", "Data collected from an API for weekly injury report data", seasons "available since 2009". Files at `https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_{season}.{csv,parquet,rds,qs}` | `github.com/nflverse/nflreadr/blob/main/R/load_injuries.R`, October 15, 2026 |
| Licence | The nflverse-data repository's `LICENSE.md` is **Creative Commons Attribution 4.0 International (CC BY 4.0)**. Duties when sharing, including in modified form: keep the creator's identification and copyright notice, reference the licence, indicate modifications, link to the licence where practicable. The licence page also says "Use of the licensed material may still be restricted for other reasons, including because others have copyright or other rights in the material", and the October 8 read of nflverse's package terms recorded that upstream data remain governed by their owners' terms. The underlying API is reached through the `nflapi` package (below); the NFL's own terms for that data were not read (`nfl.com` refused today). GTL already credits the nflverse schedules release on every trends panel ("Data: nflverse; schedules maintained by Lee Sharpe (CC BY 4.0), modified", [TRENDS.md](../TRENDS.md)), so the attribution pattern exists | `github.com/nflverse/nflverse-data/blob/main/LICENSE.md`, October 15, 2026; [ODDS_PROVIDER_EVALUATION.md](../ODDS_PROVIDER_EVALUATION.md), October 8, 2026 |
| Fields (16) | `season`, `season_type` (REG or POST), `team`, `week`, `gsis_id`, `position`, `full_name`, `first_name`, `last_name`, `report_primary_injury` ("Primary injury listed on official injury report"), `report_secondary_injury`, `report_status` ("Player's status for game on official injury report"), `practice_primary_injury`, `practice_secondary_injury`, `practice_status` ("Player's participation in practice"), `date_modified` ("Date and time that injury information was updated") | `github.com/nflverse/nflreadr`, `data-raw/dictionary_injuries.csv`, October 15, 2026 |
| Cadence | The pipeline is `nflverse/nflverse-rosters`, workflow `update-injuries`: cron `7 7 * 1,2,9,10,11,12 *` (07:07 UTC daily, September through February) plus manual dispatch, running `exec/update-injuries.R`, which calls `nflapi::nflapi_injuries(season)` for the most recent season and saves `injuries_<season>` to the `injuries` release. nflreadr's schedule article: injuries "updates every day at 7AM UTC throughout the season" | `github.com/nflverse/nflverse-rosters`, `.github/workflows/update_injuries.yaml` and `exec/update-injuries.R`; `github.com/nflverse/nflreadr`, `vignettes/articles/nflverse_data_schedule.Rmd`; October 15, 2026 |
| Current assets | `injuries_2026.csv` 159 KB, `.csv.gz` 28.7 KB, `.parquet` 39.9 KB, `.rds` 28.5 KB, all updated **2026-10-14T12:50:23Z**; `timestamp.json` 2026-10-14T12:50:24Z; `injuries_2025.*` updated 2026-09-07. The 12:50 UTC time differs from the 07:07 cron; only the release page was read, not the run that wrote it | `github.com/nflverse/nflverse-data/releases/expanded_assets/injuries`, October 15, 2026 |
| Cost | Free download of a public GitHub release asset; no key, no account, no provider credit | — |

**What it gives the chart.** Per team, week and player: the game status on the official report (`report_status`), practice participation (`practice_status`), the injury named on each, and `date_modified`. A reason marker reads, for example, "Wed report: QB — Questionable (knee)" at its `date_modified`, beside the movement strip, with the credit "Injury reports: nflverse (CC BY 4.0)" and a link.

**What it does not cover, honestly.** A daily 07:07 UTC refresh means a report published on a given afternoon Eastern appears the next morning UTC: a Thursday-game team's Wednesday final designations appear Thursday 07:07 UTC (12:07 AM PT), in time for the 5:15 PM PT deadline; Friday's designations for Sunday games appear Saturday. **Sunday inactives (announced 90 minutes before kickoff) and in-game injuries are never on this feed.** The 12:50 UTC timestamp above shows the actual run time can differ from the cron; GTL should show the file's timestamp, not the cron. Rows are reports, not diagnoses, and a status change after a line move proves nothing about the move.

**What a build would need** (not authorized by this file): verification of the upstream conditions for GTL's intended storage and display, then one daily fetch of `injuries_<season>.csv.gz` or `.parquet` from the release (a `gtl-api` job or Edge Function, with a size and row cap and the release's `timestamp.json` checked first), one table keyed by season, week, team, `gsis_id` and `date_modified` with the four status and injury fields, no deletes (D-23), the licence credit beside every row shown, and a reader gated with the strip it decorates. No migration is written.

### 4.2 Other free reason sources

| Source | Status |
|---|---|
| Kickoff weather, Open-Meteo (CC BY 4.0) | **Live** on every game under D-34 and D-45; the board chip and the game sheet's full card. Reuse as a marker; nothing new to license |
| Referee assignment | **Live** under D-32: the commissioner's entry in `gtl_game_officials` or the week file's; shows only when known |
| Kickoff changes | A commissioner revision from an official notice (BET-07-Q19 in the tracker) would place a marker; the automatic schedule feed is not connected (DATA-02) |
| nflverse rosters and depth charts | Same release family and licence as injuries; nflreadr's schedule article says roster data "also refreshes daily at 7 AM UTC" (read October 15, 2026). Depth charts not verified today. A starter change is a plausible marker; not needed for a first build |
| Sleeper API (`api.sleeper.app/v1/players/nfl`) | Search snippets today (third-party listings only) say the API is public, unauthenticated and includes an `injury_status` field. **Its terms were not read** (`docs.sleeper.com` and the API host refused). Unverified; not a candidate until read |
| NFL.com injury reports | The official source. **Terms not read** (`nfl.com` refused). nflverse reaches the same reports through its pipeline, but its repository licence does not establish that every upstream condition is cleared. Reuse through nflverse and direct NFL.com access both remain subject to verification |
| ESPN | "Unverified. Do not assume automated reuse from a visible page or undocumented endpoint" (October 8 read). Unchanged |

## 5. Options for Sean

Costs are what was read; "not read" means the price could not be opened from this session. Effort is relative: S under a day of agent work, M a few days, L a week or more plus Sean's gates.

### Option A — Line movement now, from GTL's own data (free)

- **What ships:** the movement strip of section 3.5 in the game sheet, with each book's line and prices, the player's own line at the guess, the kickoff line, the weather and referee markers, and, only after upstream rights verification, the nflverse injury markers of section 4.1. **No bets %, no money %, no sharp or square call.** The card is named "Line movement", not "Sharp vs square".
- **Cost:** $0. No new provider credit: the strip reads stored snapshots; the injury file is a free GitHub download.
- **Rights:** the October 8 read of The Odds API terms supports app display and indefinite storage of the existing snapshots. Injury markers remain pending: nflverse's repository carries CC BY 4.0, but the upstream NFL conditions for GTL's intended storage and display were not verified (section 4.1). The movement strip can be scoped without injury markers. Nothing in section 2 is touched.
- **Data honesty:** everything in 3.5; nothing in 3.6. The chart must say "since Mon 1:15 AM PT" and "sampled twice a day".
- **Effort:** M. The SQL reader exists (M-06, not applied; it is already in the apply queue after M-01 and M-02). New work: the chart component, the injury fetch job, one table and migration, the gating test and the leak scan for the new route.
- **Risks:** a sparse strip on quiet weeks (two points a day); readers may still read a move as "sharp" on their own, so the honesty note matters; M-06's apply order (after M-02) sets the earliest date.

### Option B — Option A with denser movement, still on the free plan

- **What changes:** the schedule moves from two runs a day toward the six-a-day cap in the hours before Thursday and Sunday kickoffs, so the strip has points two to four hours apart when lines move most.
- **Cost:** $0 in money, but the 500-credit plan is the limit (section 3.7): six a day is 372 credits a month worst case; the reserve shrinks and the submission-triggered collection is crowded out.
- **Rights:** as A.
- **Data honesty:** better timing, still sampled; 3.6 still applies.
- **Effort:** S on top of A (a schedule and cap migration), but it reopens D-27's cadence constants, which are Sean's.
- **Risks:** a month that runs out of credits stops the line at the guess, which is scoring, for the sake of a chart. Not recommended on the free plan.

### Option C — A licensed splits feed, and the chart Sean asked for (paid)

- **What ships:** Option A plus bets % and money % per side from a named sample, the three edge observations of section 1, and the proposed SHARP/SQUARE labels only if DATA-08's separate classification requirements are met.
- **Candidates, in the order of how much documentation was found:** Sportradar Betting Splits (aggregate of 150+ books per the snippet; the sample is "the aggregation", never one book; bet counts not exposable; sales contact and trial; price not read); SharpAPI (DraftKings and Circa, every five minutes; one docs version prices Pro at $229 a month; its right to resell the books' figures is unverified); Owls Insight (per-book splits, Rookie tier, price not read). A VSiN Pro or Action PRO subscription is **not** this option: those are personal reading licences unless their terms say otherwise.
- **Cost:** unknown until read; at least $229 a month on the one figure found, and likely far more for Sportradar. AGENTS.md's free-only rule means this is Sean's budget decision, not an agent's.
- **Rights:** the licence must cover, in writing: display to signed-in community members, storage of the history, the derived SHARP and SQUARE labels, the sample's name on screen and the attribution the vendor asks for. Where the vendor resells a book's figures, the chain back to the book matters.
- **Data honesty:** the chart can show the named sample's bets % and money % with its timestamp and the gap; the gap describes the sample's money share, not bettor skill. The proposed SHARP/SQUARE labels remain unvalidated until DATA-08 is satisfied. Aggregate feeds cannot be presented as one book, and single-book feeds cannot be presented as the market.
- **Effort:** L. Ingest job, table, migration, per-game-and-market gate (splits are analysis revealed by the lock-in, D-01, D-02, D-39), leak scan, the chart, the attribution, and a cancellation path that keeps the stored history readable (D-23).
- **Risks:** money; a vendor's rights chain; terms that change; the honesty of a green and red verdict on a sample of one book's customers.

### Option D — Ask a publisher for a free written grant (free, uncertain)

- **What it is:** Sean sends one short request to the owner of the figures, asking for written permission to show its bets % and money % to a private community of named players, with its name and a link on every card, stored for the season. The two owners to ask first: **DraftKings** (its own figures, republished weekly by VSiN and CBS Sports) and **Action Network** (whose terms, per the October 8 read, make written permission the gate). An agent can draft the request; only Sean sends it ([ODDS_PROVIDER_EVALUATION.md](../ODDS_PROVIDER_EVALUATION.md): "No provider has been contacted", and a permission request "must cover the exact fields, access method, private multiplayer display, attribution, derived summaries and durable retention").
- **Cost:** $0.
- **Rights:** exactly what the grant says; nothing before it arrives.
- **Data honesty:** as Option C for whatever is granted.
- **Effort:** S to draft; the wait is unknown; the build is Option C's minus the invoice.
- **Risks:** no answer, or a no; a grant that covers a page but not an API, which would mean a manual weekly import screen enforcing the same rights.

### Recommendation: Option A now; Sean decides between C and D for the splits

Recommend the movement strip from GTL's own snapshots, named "Line movement", under the existing odds permission. Keep injury markers outside that initial scope until the upstream reuse conditions are verified; their free download and repository licence alone do not complete that check. Keep the proposed SHARP/SQUARE classifications off every screen until both permitted data and DATA-08's methodology requirements are met. In parallel, Sean chooses whether to fund Option C (the first step is opening and quoting Sportradar's and SharpAPI's terms, which this session could not reach) or to send Option D's request; both can run while A is built. Option B is not recommended on the free plan.

## 6. Draft D-entry for Sean's approval

Not added to [DECISIONS.md](../DECISIONS.md). D-47, D-48 and D-49 are pending in other pull requests; the number is assigned when the entry is added. Blanks in square brackets are Sean's.

> ## D-[50] — Sharp vs square per game, and the Fantasy Football back burner (October 15, 2026)
>
> Sean asked, through the Mac mini session, as relayed to the coordinating cloud session: "(A) a NEW FEATURE, "Sharp vs square" per game, for spreads and totals: percent of bets vs percent of money on each side, the sharp side in green and the square side in red, as a creative chart; edges observed, line movement, and possible reasons (injury reports, etc.); and (B) a Fantasy Football section on the back burner (backlog, not scheduled)."
>
> - **Research first.** The source and rights record is `docs/redesign/SHARP_VS_SQUARE.md`. No free source with written display rights for bets % and money % was found; GTL's own stored snapshots can show line movement honestly; nflverse's injury repository carries CC BY 4.0, while upstream reuse conditions for GTL remain unverified.
> - **Sean's choice:** [Option A / B / C / D of section 5]. [If C: the vendor and the monthly budget. If D: who Sean writes to first.]
> - **What is built under A:** a "Line movement" card in the new app's game sheet (stage 34): the three-book line at every stored collection since the week's first, each book's line and prices, the player's own line at the guess, the kickoff line, and timestamped markers for weather (D-45), the referee (D-32) and, only after upstream reuse verification, nflverse injury and practice reports with the credit "nflverse (CC BY 4.0)". It opens with the line lock (D-36, D-39, D-31), per game and market. It says "since Mon [time] PT" and "sampled twice a day", never "opened at", and it never calls a move sharp.
> - **Words and colors.** The requested SHARP/SQUARE labels remain proposed and unvalidated. A licensed split alone does not authorize classifying either side: DATA-08 requires a provider classification with supporting source/methodology or a separately documented, validated inference labelled as inferred. If that requirement is met, the proposed win/loss colors must accompany words, the sample's name and its time (brand rule 7; "Never use red/green alone").
> - **Cadence unchanged.** Two scheduled collections a day and D-27's limits stay; no credit is spent on the chart.
> - **Fantasy Football.** A backlog item only (tracker PLAY-05 in the research file): not scheduled, no scope, no source, no design. Sean names what the section is for when he schedules it.
> - Nothing is applied or deployed by this entry.

## 7. Open questions for Sean

1. **Which option?** A now, or straight to C or D? If C: is there a monthly budget for a splits feed, and up to how much? (AGENTS.md is free-only until Sean revises it.)
2. **If D:** may an agent draft the permission request, and does Sean want to write to DraftKings first, or Action Network?
3. **Naming:** is "Line movement" acceptable as the card's name until a licensed split exists, with the proposed "Sharp vs square" classification reserved until permitted data and DATA-08's methodology requirements are met?
4. **Gating:** the strip reveals the line, so it should open with the line lock (per game and market), like the rest of the line card. Confirm.
5. **Injury markers:** after upstream reuse conditions are verified, approve the daily nflverse fetch (one GitHub release file a day, no key) and the credit "Injury reports: nflverse (CC BY 4.0)" beside the markers? Where should the full report list live: the game sheet only, or a row on the Lines board like weather?
6. **Cadence:** keep two scheduled collections a day (recommended), or accept Option B's trade against the line at the guess?
7. **Tracker:** `planning/project-tracker.json` says it is frozen at v62 by Sean's October 12 decision ("Do not edit this file for new work"; the Status Board is the live tracker). The two tracker entries below were therefore **not** written into the JSON. Should they go on the Status Board, or does Sean unfreeze the JSON?
8. **Fantasy Football:** when it is scheduled, one question then: what should the section hold (a league hub with links, GTL's own game, a Sleeper-style import)? Nothing is assumed now.

## 8. Tracker entries (not written into the frozen JSON)

The two items below follow the tracker's item schema exactly (`id`, `area`, `title`, `status`, `priority`, `state`, `evidence`, `exit`, `owner`, `dependency`, `reviewed`, `targetDate`, `workstream`, `execution`, `nextAction`), with ids after the highest existing ones (DATA-13, PLAY-04) and its own status and execution vocabularies (the tracker has no "research" status; "Open" with execution "Waiting" is its term for work waiting on a decision). They are ready to paste into the JSON's `items` array if Sean unfreezes it, or to carry onto the Status Board.

```json
{
  "id": "DATA-14",
  "area": "Market data",
  "title": "Sharp vs square per game: public bets % and money %, line movement and reasons",
  "status": "Open",
  "priority": "P2",
  "state": "Research. Sean asked on October 15, 2026 (through the Mac mini session) for a per-game Sharp vs square chart for spreads and totals: bets % vs money % per side, the sharp side green and the square side red, with edges observed, line movement and possible reasons such as injury reports. docs/redesign/SHARP_VS_SQUARE.md records every candidate source with cost and rights, what gtl_market_snapshots already supports, nflverse injuries as a free candidate with upstream reuse conditions still unverified, and four options. No free source with written display rights for bets % and money % was found; the terms of the paid APIs could not be read from the research session. Waiting on Sean's option choice.",
  "evidence": [
    "docs/redesign/SHARP_VS_SQUARE.md",
    "docs/ODDS_PROVIDER_EVALUATION.md",
    "supabase/migrations/20261015010000_gtl_lines_read.sql"
  ],
  "exit": "Sean picks an option; a D-entry records it; a movement card from stored snapshots with timestamped reason markers ships under Option A; injury markers wait for upstream reuse verification; and the proposed sharp/square labels appear only once permitted data and DATA-08 classification evidence are established, with the source, methodology, sample and time shown.",
  "owner": "Coordinating cloud session (research); build owner assigned when Sean rules",
  "dependency": [
    "DATA-07",
    "DATA-08",
    "Sean's option choice (docs/redesign/SHARP_VS_SQUARE.md, section 5)"
  ],
  "reviewed": "2026-10-15",
  "targetDate": "Not committed",
  "workstream": "data",
  "execution": "Waiting",
  "nextAction": "Sean answers section 7 of docs/redesign/SHARP_VS_SQUARE.md; then the D-entry and a build stage."
}
```

```json
{
  "id": "PLAY-05",
  "area": "Play modes",
  "title": "Fantasy Football section (back burner)",
  "status": "Deferred",
  "priority": "P2",
  "state": "Backlog only. Sean asked on October 15, 2026 (through the Mac mini session) for a Fantasy Football section on the back burner: not scheduled, no scope, no source, no design. Nothing is built or planned beyond this entry.",
  "evidence": [
    "docs/redesign/SHARP_VS_SQUARE.md"
  ],
  "exit": "Sean schedules it and says what the section is for; then a scope note and a build-plan stage.",
  "owner": "Unassigned until Sean schedules it",
  "dependency": [
    "Sean's go"
  ],
  "reviewed": "2026-10-15",
  "targetDate": "Not committed",
  "workstream": "play",
  "execution": "Deferred",
  "nextAction": "None until Sean schedules it; then one question: what the section should hold."
}
```

## Sources read

Follow-up review: [Action Network's reverse-line-movement definition](https://www.actionnetwork.com/education/reverse-line-movement/) was checked on October 15, 2026 in the Mac mini review session. This adds a terminology correction; the original research session's access limits below remain as recorded.

Read on October 15, 2026, from this session (GitHub only):

- `https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md` (CC BY 4.0)
- `https://github.com/nflverse/nflverse-data/releases/expanded_assets/injuries` (asset list and times)
- `https://github.com/nflverse/nflverse-data/blob/main/README.md`
- `https://github.com/nflverse/nflreadr/blob/main/R/load_injuries.R`
- `https://raw.githubusercontent.com/nflverse/nflreadr/main/data-raw/dictionary_injuries.csv`
- `https://github.com/nflverse/nflreadr/blob/main/vignettes/articles/nflverse_data_schedule.Rmd`
- `https://github.com/nflverse/nflverse-rosters` (README), `.github/workflows/update_injuries.yaml`, `exec/update-injuries.R`

Earlier dated reads reused, from this repository: [ODDS_PROVIDER_EVALUATION.md](../ODDS_PROVIDER_EVALUATION.md) (sources accessed October 8, 2026: The Odds API plans, V4 guide and terms; Action Network public betting, help page and terms §§1–2; VSiN betting splits board; Owls Insight docs; nflverse licence and package terms; TheRundown terms) and [FRESH_SUBMISSION_AND_SOURCES.md](../FRESH_SUBMISSION_AND_SOURCES.md).

Search snippets only (pages not opened): VSiN articles on its DraftKings and Circa splits; CBS Sports and Rotowire on DraftKings-sourced splits; ingame.com, casinobeats.com and igamingexpert.com on the ESPN BET to theScore Bet change; Sportradar Betting Splits documentation summaries; SharpAPI splits documentation summaries; third-party listings describing the Sleeper API; Apify scraper listings.

Repository files read at `8a1bee7`: `AGENTS.md`, `docs/DECISIONS.md` (D-44 to D-46 and the D-04 and D-11 lines), `docs/RULES.md`, `docs/TRENDS.md`, `docs/REDESIGN_BUILD_PLAN.md`, `docs/BRAND_GUIDE.md`, `docs/RELEASE_2026_10_09.md`, `design/tokens.json`, `web/src/next/styles/tokens.css`, `cloud/odds-provider.mjs`, `supabase/migrations/20261008185738_gtl_manual_odds_collection.sql`, `20261008200926_gtl_twelve_hour_odds_refresh.sql`, `20261012213000_gtl_submission_odds_window.sql`, `20261012230000_gtl_submit_with_line_at_guess.sql`, `20261012234500_gtl_game_officials.sql`, `20261014221500_gtl_odds_open_weeks.sql`, `20261015010000_gtl_lines_read.sql`, and `planning/project-tracker.json` (v62, frozen).
