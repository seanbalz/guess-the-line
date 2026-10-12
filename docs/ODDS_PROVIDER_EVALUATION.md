# GTL — Free data and research provider evaluation

Owner: Sean Balsiger · Version 6 · Sources accessed 2026-10-08.
Budget: free-only. Provider research alone does not prove an integration;
verified operation is recorded separately here. The first manual collection
returned 15 games and 90 spread/total quotes for 2 credits, leaving 498.
The hosted dispatcher subsequently succeeded at **2026-10-08 20:21:45 UTC**
with another 15-game, 90-quote collection for 2 credits: **4 used, 496 remaining,
two provider snapshots**. The twelve-hour schedule is active; a run triggered
by an actual clock boundary has not yet been observed.

## Current recommendation

D-11 confirms **build our own GTL model plus permitted outside sources**. A
licensed historical prototype and held-out evaluation are complete; neither
margin nor total regression beats its rolling-score baseline. The source ends
February 2021, so no current-week forecast is ready. See
[model validation and source manifest](MODEL_VALIDATION.md). This replaces the
earlier pending model-direction choice; current data and outside-display rights
remain unresolved.

**Use the connected The Odds API at `the-odds-api.com` for spreads and totals.**
The free plan advertises 500 credits/month, all sports and markets, most books,
and no historical-odds API. Current terms permit app display, derived analytics,
indefinite storage and model training; standalone raw-data redistribution is
prohibited. An authenticated NFL response matched all 15 saved events and returned both markets
from DraftKings, FanDuel and BetMGM. Official benchmark checks remain separate.
[Plans](https://the-odds-api.com/),
[terms, updated 2026-08-31](https://the-odds-api.com/terms-and-conditions.html).

**TheRundown Free is not cleared for multiplayer display.** Current terms limit
Free and Starter to internal business or personal use; end-user display requires
Pro or a separate written agreement. General retention is limited to 24 hours
unless extended. Model development, training or validation requires written
consent. Shared display and durable scoring snapshots therefore need a written
free exception, which is not present in project evidence. This supersedes the
earlier provisional recommendation.
[Terms §3, updated 2026-09-08](https://therundown.io/terms-and-privacy).

## Provider findings

| Provider | Documented availability | GTL status / remaining gate |
|---|---|---|
| [The Odds API — `the-odds-api.com`](https://the-odds-api.com/) | Free spread/total markets; display/storage permissions above. | **Connected; manual and hosted dispatcher collections verified.** Twelve-hour schedule active; first clock-triggered run still unobserved. Latest collection: 90 quotes, 2 credits; 496 remaining. No splits, ticket counts or outside model projections found in the reviewed [V4 guide](https://the-odds-api.com/liveapi/guides/v4/). |
| [TheRundown](https://therundown.io/pricing/api) | Free pre-match odds from BetMGM, DraftKings and FanDuel; five-minute delay; 20,000 data points/day, 200,000/month. | **Required free display/retention license absent.** Free API access does not resolve the terms restriction above. |
| [`theoddsapi.com`](https://theoddsapi.com/) | Different service/domain: free 25 requests/day, NFL/NBA/MLB moneylines only; spreads/totals paid. | **Not the hyphenated provider above.** Do not apply this site's market restriction to `the-odds-api.com`. |
| [Action Network public betting](https://www.actionnetwork.com/nfl/public-betting) | Ticket percentages; selected free rows show money percentages and tracked bet counts. Its [help page](https://actionnetworkhq.zendesk.com/hc/en-us/articles/360037460212-Public-Betting-Money-Percentages) describes the full dataset as PRO. | **Written reuse permission required.** The full [terms §§1–2](https://www.actionnetwork.com/terms) were now inspected: personal access does not permit republication, display or derivative use in GTL without written permission. Free preview rows or manual copying do not clear that gate. No free API/reuse agreement verified. |
| [VSiN NFL splits](https://data.vsin.com/betting-splits/?source=DK&sport=NFL) | DraftKings/Circa choices; ticket/handle percentages for spread, total and moneyline; five-minute updates. One preview matchup was visible, with full board labeled VSiN Pro. | **Reference only; free full-feed/display rights unverified.** Inspected columns provide percentages, not absolute counts. Preserve named-book sample scope. |
| [Owls Insight API](https://owlsinsight.com/docs) | Documented per-book splits; Rookie tier required. Free accounts cannot create keys or call its API. | **Not a free production source.** A short trial is not permanent free access. No trial started. |
| [nfelo](https://www.nfeloapp.com/about/) | Published spread/win-probability model; public [output repository](https://github.com/greerreNFL/nfelo). | **Model candidate; permissions incomplete.** No explicit redistribution license found in inspected repository/README. Uses market information: external model does not mean statistically independent of the benchmark. No separate total model verified. |
| [The Prediction Tracker](https://www.thepredictiontracker.com/) | Public index links NFL margin and total forecasts from multiple systems. | **Discovery/reference candidate.** Automated-feed and underlying forecast redistribution rights unverified. Public visibility is not an output license. |
| [nflverse-data](https://github.com/nflverse/nflverse-data) | Statistical releases with a [CC-BY-4.0 data repository license](https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md); not a turnkey forecast or splits feed. | **Candidate input for a separately built/tested GTL model.** Package MIT licensing is not data permission. Exact upstream conditions still matter; the explicitly authorized FTN subset and verified 2026 asset availability are detailed below. This subset is not yet ingested; the separately licensed historical prototype is measured in MODEL_VALIDATION.md. |
| ESPN public odds | No new permission evidence obtained in this review. | **Unverified.** Do not assume automated reuse from a visible page or undocumented endpoint. |

## What would unlock each analysis card

These are integration paths, not newly connected sources. No reviewed source
currently provides all five cards with verified free multiplayer-display rights.

| Card | Practical free path | Current limit |
|---|---|---|
| Outside model projection | Obtain explicit free permission for a publisher's timestamped spread/total outputs, then import its permitted API or file. nfelo is a candidate to ask, not an approved feed. | Public code/output visibility does not establish a redistribution license. A separately developed **GTL model** is another option, but must be named as our own model rather than an outside forecast. |
| Public betting ticket % | A sportsbook/publisher must grant a free API/export and GTL display/retention permission. Preserve book/sample, market and observation time. | Action and VSiN demonstrate the metric; their reviewed access does not supply a cleared free GTL feed. Odds prices do not reveal wager shares. |
| Public money/handle % | The same permission and ingestion route, with a distinct handle field. | Cannot calculate handle share from ticket share or lines. A preview/subscription is not a redistribution agreement. |
| Absolute ticket count | Import an explicitly reported count with its sample, market and time, under permission. | Action shows selected reported counts; inspected VSiN columns are percentages. Do not substitute GTL picks, infer counts from percentages, or label a sample as the whole market. |
| Sharp action | A freely licensed provider classification would need its source/methodology. Existing licensed odds already support factual **line movement**; a later inference must be labeled and validated separately. | No cleared free sharp-action feed was established. Twelve-hour observations cannot establish fast steam moves or identify who placed bets. A line change alone is not proof of professional action or positive EV. |

Action's [terms](https://www.actionnetwork.com/terms) make written permission the
next dependency for its content; [VSiN's board](https://data.vsin.com/betting-splits/?source=DK&sport=NFL)
shows limited previews and a paid full board. [Owls Insight's documented splits
API](https://owlsinsight.com/docs) is technically suitable but requires a paid
tier; a free account cannot call it. This review does not recommend a paid
upgrade, a trial as a permanent solution, or bypassing restricted access.

A permission request, if later authorized, must cover the exact fields, access
method, private multiplayer display, attribution, derived summaries and durable
retention. No provider has been contacted. An import screen would enforce those
same rights; it would not turn an unlicensed website copy into an approved feed.

## Free statistical inputs for a possible GTL model

There is a concrete, narrow input candidate: FTN explicitly provides a charting
subset through nflverse under **CC-BY-SA 4.0**, with attribution to FTN Data via
nflverse. The reference describes availability from 2022 and charting within
48 hours of games. This is owner-authorized statistical data, not published
spread/total predictions. Preserve the license and attribution and meet its
share-alike conditions for redistributed adapted material.
[FTN subset documentation](https://nflreadr.nflverse.com/reference/load_ftn_charting.html).

Read-only GitHub release metadata confirmed `ftn_charting_2026.csv` and its
Parquet companion, updated **2026-10-08 11:01:55 / 11:01:54 UTC**. The 2026
play-by-play CSV/Parquet assets also exist, updated **16:29:16 / 16:29:15 UTC**.
Only release metadata was fetched, not the datasets: existence/update time does
not verify every game, row, outcome field or Week 4 completeness.
[FTN release](https://github.com/nflverse/nflverse-data/releases/tag/ftn_charting),
[play-by-play release](https://github.com/nflverse/nflverse-data/releases/tag/pbp).

The data repository's [CC-BY-4.0 license](https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md)
permits reuse/adaptation with attribution, but nflverse's [package terms](https://nflverse.nflverse.com/index.html)
also say upstream data remain governed by their owners' terms. Do not treat the
software's MIT license or the repository label as blanket permission for every
joined dataset. The FTN subset has the clearest inspected dataset-specific grant;
the full feature/outcome manifest still needs a source-by-source check.

If the user chooses an in-house model, the next work is to select permitted
features and outcomes, verify coverage and event IDs, pin release hashes and
attribution, then backtest separately for margin and total using only information
available before each game. Evaluate against simple baselines and publish model
version, forecast time and limitations. Keep sportsbook inputs out of a model
advertised as independent of the market; declare them if used. A calibrated
probability model and offered prices would be additional requirements for EV.
No model has been trained, validated or connected by this research. The user's
choice between a validated GTL model and seeking an outside publisher's free
display permission remains unanswered; model development has not begun.

## Free odds quota and activation checks

The hyphenated provider's [V4 guide](https://the-odds-api.com/liveapi/guides/v4/)
charges odds requests by markets × regions; up to ten selected bookmakers count
as one region. Centrally collecting NFL spreads and totals four times daily
would use **248 credits in a 31-day month** (`2 × 4 × 31`), before extra requests.
This is a planning calculation, not measured usage or a sufficient cadence for
precise movement alerts/kickoff capture.

1. Obtain the free key and confirm the exact plan without a paid upgrade.
2. Verify three independent books return both markets for the real slate, with
   correct game IDs, home/away signs, quote timestamps and stale/missing states.
3. Keep credentials on the server; share cached collection across games rather
   than spending credits on every player's refresh. Monitor usage headers and
   reserve credits for errors, results and approved kickoff capture.
4. Preserve provenance and immutable snapshots. Do not export raw vendor data;
   review the export contract before adding feeds.
5. Keep the approved benchmark policy scoped to its game/week/mode. D-09 waives
   Action only for the Sean–Steven Duel's 2026 Week 5 spread competition and uses
   the approved three-book median. That exception does not license Action data
   or change other competitions, totals or Challenge. Missing required gates
   remain unavailable outside the explicit exception.

Current implementation uses a zero-credit NFL event check and one shared
collector for manual requests and the active hosted schedule. Together they are
limited to **six collections per UTC day**, **at least 5 minutes apart** (the
submission freshness window), at most two credits each, with a **50-credit
reserve** and a shared database lease. Those two constants come from migration
`20261012213000_gtl_submission_odds_window.sql`; Sean confirmed them on October 12
(D-27 in [DECISIONS.md](DECISIONS.md)). They apply to the hosted project once that
migration is applied; until then the hosted limits are four collections and
fifteen minutes. Under D-27 they bound spending only: a refused or failed
collection never refuses a submission, which saves the newest stored line.
It requests DraftKings, FanDuel
and BetMGM spreads/totals. Exact home/away names and kickoff must match; missing
or rescheduled events are unavailable, never remapped by array position.
Current V4 documentation requires each market's `last_update`; bookmaker-level
timestamps are deprecated and are not a substitute. Observations older than
five minutes are stale for current analysis. Provider-observed time is not proof
that a bookmaker will still accept a price.

The hosted schedule is active at fixed **08:15 and 20:15 UTC**, currently
**1:15 AM and 1:15 PM Pacific**; Pacific wall-clock times shift with daylight
saving time. At this verification, the next scheduled run is **October 9,
08:15 UTC**. An administrator invoked the same dispatcher used by cron and its
worker completed successfully at the timestamp above. This proves the hosted
dispatch/collection path, not yet a naturally clock-triggered run. Only upcoming
games in the validated 2026 Week 5 slate refresh; started games retain their
saved references. Future-week setup is not automatic. Operational release
evidence is maintained in [CLOUD_SETUP.md](CLOUD_SETUP.md).

At two two-credit collections daily, the planned baseline is 124 credits in a
31-day month, before manual/error requests. This is a budget estimate, not usage
already incurred. Collection does not automatically freeze or adjudicate the
benchmark.

## Research field definitions and integrity

- **Ticket percentage:** share of counted wagers on a side within the named
  source's sample, not all bettors everywhere.
- **Handle percentage:** share of money in that sampled market. It does not
  reveal total dollars or the number of bets.
- **Total bets:** show an absolute count only when explicitly supplied, with
  market, sample coverage and time. Never derive counts from percentages. D-04
  confirms both absolute reported counts and Over/Under ticket percentages,
  shown as separate metrics.
- **Sharp action:** provider classification and our inference are different.
  Money/ticket gaps or reverse movement are possible signals, not proof of
  professional action or positive EV. Missing inputs stay unavailable.
- **Personal/model edge:** same-market point disagreement needs a sourced,
  permitted benchmark and timestamp. Keep competition guesses, optional personal
  fair forecasts and outside projections separate. EV needs calibrated
  probability plus an offered price; point difference alone is insufficient.

These descriptions follow
[Action's sample/count definitions](https://www.actionnetwork.com/nfl/public-betting)
and [VSiN's book-specific explanation](https://vsin.com/how-to-bet/burke-lets-talk-about-betting-splits/).
No free source with verified multiplayer rights for the complete requested
splits/counts/sharp/model package was established in this bounded review.

Research must be filtered by submitted mode on the server. Spread submission
must not expose Total benchmarks, model totals, splits or derived hints, and
vice versa. A projected home/away score pair reveals both margin and total, so
requires both modes unlocked. Exports, metadata, summaries and cached responses
must respect the same rule. External reference pages may show other markets;
links are neither spoiler filters nor a substitute for licensed ingestion.

Use unavailable/stale labels, never fabricated values or zeros. No account,
key, paid plan, scraping job, provider email or live import was created by this
research. Original picks and snapshots are unchanged.
