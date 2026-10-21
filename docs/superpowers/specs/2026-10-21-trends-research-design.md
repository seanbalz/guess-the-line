# Guess The Line — situational trends and research leans

Owner: Sean Balsiger · Version 2 · October 21, 2026 (Pacific)

Status: approved by Sean on October 21, 2026; implementation is underway in
[the implementation plan](../plans/2026-10-21-trends-research.md). This specification
does not establish a source connection, production change, or betting-performance
validation.

## Confirmed product choices

| Topic | Sean's decision |
| --- | --- |
| Meaning of a Guess entry | A prediction of what the sportsbook will post, not the player's independent fair line. |
| Discovery | A weekly shortlist of up to three trends, with the same research accessible inside each matchup. |
| Time | Recent is the default presentation, not a hard cutoff. Useful patterns, including primetime situations, can span earlier seasons. |
| Initial evidence | Favor consistent trends. Put emerging patterns within easy reach under Explore. Do not fill the shortlist with small-sample streaks. |
| Markets | Start with NFL spreads and game totals; prepare the design for moneylines and player props later. |
| Research lean | Show a direction with supporting and conflicting evidence. Qualifying opposing groups may coexist with a lean and appear as a yellow alternative. Say “No clear lean” when consistent evidence is insufficient or neither direction has a meaningful advantage. |
| Trend references | RotoBot, ParlayScience, Fatboss, TrendsCenter and BettingPros aggregate trends that help people evaluate bets. They are research references, not five votes for a side. |
| Trent | Book It With Trent gets a separate section showing his published plays. Sean's stated interest is fading Trent. |
| Presentation | Preserve charts and “Consistent, not proven” with an explicit text label. Green marks support for the main lean; yellow identifies a credible alternative or mixed evidence. Opposition alone is not a red/bad label. |

These choices extend D-32/DASH-7. They clarify how the new research experience
uses D-48's guess-versus-market comparison: a pricing expectation gap is not a
fair-line edge. D-53's requirements for validated model-based wager ranking
remain. This feature ranks research for relevance; it does not activate ranked
expected-value bets or replace the independent model with trend hit rates.

Historical decisions, locked guesses, saved scoring references, points, tickets,
and source files remain intact. Existing runtime behavior changes only through
a separately reviewed implementation and release.

## Approach

Three approaches were considered:

1. Extend only the existing frozen registry: easiest to reproduce, but insufficient
   for discovering the recent situations Sean requested.
2. Display an external-post feed: broad coverage, but records and selection rules
   may be incomplete, inaccessible or impossible to reproduce.
3. **Proposed: use external research to discover candidates, then calculate GTL
   evidence from permitted data.** Preserve attribution and distinguish an
   author's claim from GTL's reproduced result. Only qualifying reproduced
   evidence can affect the shortlist or a research lean.

Source ingestion is independent of the analysis engine and UI. Initial delivery
supports reviewed source entries with original URLs and timestamps; unattended X
collection is not a prerequisite or an assumed connection. Do not purchase data,
bypass access controls, or redistribute material without permitted reuse.

## User experience

The Trends destination has three plainly named sections: **This week**,
**Explore**, and **Book It With Trent**. Existing matchup details open the same
trend detail and research-lean view. This is in-app research; a new email, push,
social publishing schedule or outbound package is outside this design.

This week shows zero to three distinct qualifying trends, with links to eligible
upcoming matchups. A matchup shows zero to three relevant trends and a separate
lean for each accessible market. Fewer qualifying trends means fewer cards.
An empty state links to Explore. Hidden matchup applicability cannot affect a
visible card's order, title, count or explanation.

The default **Recent** view uses the last 30 qualifying completed games, including
pushes, and prints the actual dates. It can cross seasons without a one-year cap.
Show this season's record separately on detail, including when there are no
qualifying games this season. Never describe older matches as current-season
results. Existing historical strength can qualify a trend even when current-season
volume is low.

Explore provides Last 25, Last 30, This season, Previous season, Past 12 months,
and Full available history. “All-time” must show the actual dataset start date.
Filters cover Spread/Total, team, home/away, favorite/underdog, primetime and its
TNF/SNF/MNF windows, other verified kickoff windows, division/conference, rest,
travel, weather and referee where data supports the condition. Unsupported or
unknown conditions stay unavailable. Primetime is an explicit schedule category,
not an inference from a viewer's local clock. Emerging and Consistent are visible
Explore choices; users need not search through an advanced menu for Emerging.

A collapsed card contains the plain-language situation, W-L-P record, sample,
period, evidence label, compact chart, and why it matters to an accessible game.
Keep the brand guide's six-number limit; move secondary metrics into detail.
Detail shows conditions, game-by-game evidence, dates, recent/season/history
comparisons, source, coverage, registration date and limitations.

Use a cumulative historical units chart with a zero baseline and an accessible
results table. Label standardized returns **Illustrative units at -110**;
do not call these actual achieved profit or silently mix them with priced returns.
If every selected result has a verified historical price, a separate actual-price
view may be offered. Missing quotes never become assumed actual prices. Chart,
record and table use identical filters and denominators. Pushes count as games,
return zero units, and are excluded from win-rate denominators. Incomplete or
unknown results are excluded with visible coverage information.

## Proposed evidence policy

The following numerical rules are proposed product heuristics for descriptive
consistency. They are not calibrated win probabilities or proof of future value.
Freeze and version them before evaluating candidates; do not tune them to make
favorite examples qualify or to fill three cards.

### Canonical conditions and reproducibility

Store a stable trend/version ID, registered side, market, exact conditions,
discovery source/date, known-from time, dataset version and matched game IDs.
V1 shortlist candidates use at most two pregame conditions, matching the existing
registry restraint. More complex sourced claims can appear under Explore as
attributed research, without affecting a lean. Eligibility cannot depend on facts
only known after kickoff. Correctly distinguish observed wind from a forecast.

Every newly discovered pattern starts as retrospective research. Preserve all
evaluated candidates, including failures, and keep the existing frozen study and
multiplicity family. Do not call a historical selection period a new holdout.
Results after registration are shown separately; a later change to the side,
conditions or selection rule creates a new version and a new prospective start.

### Two routes into the consistent shortlist

- **Established historical consistency:** retain the existing registered Tier 1
  and Tier 2 eligibility checks and evidence labels. Require its latest available
  30 qualifying games to have at least 20 decisive results and positive
  standardized -110 returns. Existing retrospective scores are not probabilities.
- **Recent consistency, not proven:** require 30 qualifying games with a fixed
  side and conditions. Split them chronologically into three non-overlapping
  blocks of 10. Each block needs at least eight decisive results and positive
  standardized -110 returns. The available earlier history, when it contains at
  least 30 decisive results, must also have positive standardized returns.
  Print the date range even when the 30 games span multiple seasons. Sparse earlier
  history is disclosed. This creates a descriptive recent-consistency label; it
  does not promote the pattern into the frozen study's Tier 1 or Tier 2.

A favorable short run that fails either route stays in Explore as Emerging or
Mixed history, with the failed condition explained. An externally claimed record
that cannot be reproduced is labelled **Source-reported · not verified**. It
cannot earn a consistency badge or contribute to a lean.

The existing Tier 2 study admitted roughly as many patterns on shuffled outcomes
as on actual data. Retain that limitation in detail. The new descriptive rule must
likewise be checked on shuffled and historical replay data; report its false
discovery behavior before release. Neither historical replays nor internal
consistency checks establish forward betting performance.

Selecting Last 25 or a custom Explore period changes the chart and record, not
the canonical qualification test. Labels explain their qualification period.
Do not automatically hunt for the best-looking start date or reverse a trend's
registered side after a losing run.

### Ordering and duplicate evidence

Shortlist ordering is deterministic: a qualifying existing Tier 1 pattern first;
then established and recent descriptive consistency share the same priority.
Within a priority use the latest qualifying game date, then prospective decisive
sample, then canonical ID. Do not automatically bury recent-consistency candidates
below every long-history Tier 2 card. Preserve the old frozen score in detail;
this new shortlist ordering replaces the old display order only in this feature.
Do not sort the default shortlist by the highest hit rate, profit, streak, social
engagement or the user's guess gap. Limit the weekly shortlist to one displayed
representative of each overlapping same-market evidence group.

Canonical duplicates and reposts are one pattern. Also group same-market patterns
when they share an existing deduplication group, the same condition family, or at
least half the smaller canonical evaluation sample's game IDs. Use connected
components so overlap chains cannot manufacture extra votes. Show overlap counts
in detail; do not call the remaining groups statistically independent.

## Proposed research-lean rule

Compute a lean separately for each game and market, using the full permitted
candidate set before the top-three display limit or user display filters. A
hidden fourth opposing trend must not disappear from the decision.

1. The viewer's market is open under the existing per-game rules. The game has
   not started and the required pregame conditions are verified.
2. The existing line reader provides an available qualifying reference. For this
   new lean only, propose a 12-hour maximum age from the verified observation
   timestamp, evaluated against server time. Missing/invalid times, future times,
   older references or unavailable current game data produce **Research
   unavailable** with the reason. Retained lines remain visible with source and
   age. This does not introduce a quote expiry into D-18's existing save path or
   start an extra odds refresh. A valid read does not establish an executable
   sportsbook offer.
3. At least **two separate qualifying evidence groups** must support the main
   lean. Qualifying opposing groups do not veto it. For a deterministic first
   version, propose a strict advantage in the number of directionally agreeing
   groups after deduplication. A group with qualifying patterns on both sides is
   mixed: show both, but do not count it toward either side's minimum or advantage.
   Do not choose a count-leading side when the alternative has a qualifying
   existing Tier 1 pattern and that side has none; show **No clear lean — stronger
   historical evidence conflicts** in that case. These comparison rules remain
   proposed heuristics, not a measured confidence score.
4. Show **No clear lean** when neither side has two agreeing groups, the agreeing
   group counts tie, or the stronger-historical-evidence condition above applies.
   State the reason. Otherwise keep the main lean and show any qualifying opposing
   side immediately beside or below it as **Alternative — qualifying opposing
   evidence**, in yellow, with its evidence and limits available on tap. Do not
   require opening Explore to discover that the main lean has qualified opposition.
5. Emerging or source-reported contrary research remains visible as context,
   but does not vote for or against a lean. Explain its lower evidence status.
6. Trent's selections, repost counts and the player's guessed line do not vote.

Show **Research lean: [team] against the spread**, **Over**, or **Under**, then
the supporting groups, opposing evidence, date/sample limits and any overlap.
This is a descriptive research direction. Do not attach an implied probability,
EV percentage, stake size or an unsupported target fair line.

Color describes the research role, not certainty or a guaranteed betting outcome:

- **Green — Supports the lean:** qualifying evidence for the selected direction.
- **Yellow — Alternative / mixed evidence:** a credible opposing direction,
  uncertainty or No clear lean. A consistent opposing trend keeps its consistency
  label even though its relationship to the main lean is yellow.
- **Red:** keep established negative-result uses such as historical losses; do
  not mark an alternative red merely because it opposes the main lean.

The evidence label and the support/alternative label are separate fields. Every
color has visible text and an accessible equivalent. Two agreeing groups against
one opposing group can therefore produce a green main lean and a yellow
alternative, subject to the stronger-historical-evidence check. Two against two
produces a yellow No clear lean state. Counts explain breadth of support; they
are not odds, probabilities, or proof that grouped signals are independent.

Display the player's locked guess, saved scoring reference and accessible current
market reference as distinct values. Label the guess gap **Difference from your
expected market line**. Explain its relationship to the lean without treating
the guess as an outcome forecast. A line change re-evaluates current applicability
and the lean; it never reanchors a guess or rewrites a saved ticket.

Any existing Track this bet handoff still opens explicit review of the exact
book offer, line and price. A historical cover rate is not a probability at that
offer. Consistent research alone cannot activate D-53's validated-model ranking.

## Book It With Trent

Provide a dedicated original-play list: event, selection, market, posted line,
price if stated, post time, capture time and original URL. Missing terms remain
unknown. Keep the original pick distinct from Sean's fade interest. V1 does not
invent a reverse parlay, automatically create an opposing bet, count Trent as
evidence, or claim that fading him is profitable.

Keep revisions and source corrections; a deleted or inaccessible post has a
visible source-status change rather than a fabricated replacement. Distinguish
“No plays verified for this period” from “Source unavailable”. Initial ingestion
is reviewed entry from an accessible primary post or permitted feed, not an
unverified mirror or an assumed live X connection.

For NFL games, posted terms and source previews that could reveal a locked market
follow that market's existing gate. Suppress the title/preview as needed; only an
open market can show numeric terms. A parlay preview requires all included NFL
markets to be open. Trent can have clearly labelled plays in other bet types;
that does not activate GTL trend analytics for those markets.

## Implementation boundaries

| Unit | Responsibility and interface |
| --- | --- |
| Source registry and reviewed ingestion | Account identity, original URL, timestamps, permitted reuse, claim/version and accessibility state; no arbitrary provider payload reaches the UI. |
| Historical data adapter | Permitted game results, dated lines, pregame attributes and dataset coverage; reuse the existing nflverse pipeline and provenance. |
| Candidate registry | Immutable conditions, side, market, discovery date, version and prospective start; preserves the evaluated family. |
| Evidence evaluator | Given a candidate, versioned history and as-of time, returns period records, chart points, matched IDs, exclusions and qualification reasons. No future-game leakage. |
| Applicability and research reader | Reuses the server's market gates and accessible current line; normalizes sides, groups overlaps and computes lean/reasons. |
| UI projections | One shared result powers weekly, matchup and Explore views so counts and labels reconcile. Charts are lazy-loaded with detail. |
| Trent reader | A separate source-attributed original-play feed with its own availability and reveal checks; never feeds the lean calculator. |

Market identifiers and outcome/price evaluators are explicit so moneyline and
player-prop adapters can be added later. V1 registers only NFL spread and game
total analytics. No empty prop tabs, default -110 assumptions for moneylines,
multi-sport expansion, new odds subscription, or automated wagering follows.

Current history/week files are not assumed fresh merely because they exist.
Implementation must refresh and verify permitted inputs through the latest
completed games, preserving original datasets and hashes. Use existing approved
collection budgets; refresh failure retains dated evidence with a stale state
and disables current leans dependent on missing updates. Final-result updates
recompute affected evidence deterministically; opening a panel does not trigger
unlimited provider requests. No new cron or external notification is created by
this design. Disable new readers/lean generation reversibly on failure.

Do not put unrevealed player guesses, current lines, gated applicability, or
line-revealing external text into public static bundles. Own drafts stay private.
The data contract distinguishes hidden, missing, stale, pending, conflicting and
no-qualifying-result states. An inaccessible source does not become a losing
trend, and an unknown condition does not count as false.

## Brand, verification and acceptance

Follow [BRAND_GUIDE](../../BRAND_GUIDE.md), [existing tokens](../../../design/tokens.json)
and the new app's [tokens](../../../design/tokens-next.json). The consistency
indicator uses the semantic green for support or pending/yellow for an alternative,
with an icon and explicit “not proven” text; the chart uses the data color.
Historical loss marks retain their semantic loss color. No new brand identity, third-party artwork or
color-only meaning. Respect 320/390px layouts, safe areas, keyboard/touch access,
Light/Dark/System and reduced motion. Provide chart summaries and an accessible
game table. A mockup or screenshot review remains distinct from source tests.

Implementation acceptance must establish:

- The same selected games reconcile across W-L-P, sample, chart, table and periods;
  Last 30 spans seasons correctly; pushes, missing prices and partial history
  cannot inflate hit rates or imply real profit.
- Both qualification routes meet their exact rules; one hot block cannot pass
  the recent route; mixed earlier history sends a candidate to Explore; source
  claims remain distinct from reproduced results.
- Reposts, nested subsets, mirrored team perspectives, overlap chains and custom
  date choices cannot multiply evidence or create a false lean. Both game sides
  are normalized before grouping; one physical game has one ID.
- An opposing fourth candidate remains in the comparison and is disclosed even
  when outside the three displayed cards; its presence alone does not erase a
  supported lean. Verify two agreeing groups versus one opposing group, ties,
  mixed groups, and higher-tier opposition. A single agreeing group or empty
  evidence cannot produce a direction. Emerging evidence remains accessible.
- Green support and yellow alternatives have separate evidence-quality labels;
  qualified opposition is not marked red/bad. No clear lean explains insufficient
  or balanced evidence. Historical win/loss colors retain their existing meaning.
- Privacy checks cover response data, bundles, titles, card counts, applicability,
  charts, source previews, caches and both market gates before/after lock-in.
- Bad/stale/missing lines, unknown pregame inputs, source outages, week rollover,
  kickoff, changed lines and corrected results show the right state without
  changing saved guesses, references, scores or tickets.
- Candidate families and as-of replays are preserved; shuffled-outcome checks
  report selection behavior. No forward-performance claim is inferred.
- Trent's source terms, corrections, unsupported bets, locks and unavailable posts
  are represented honestly and never influence the statistical lean.
- Brand QA, applicable engine/service tests, browser/privacy checks and real
  phone/chart acceptance have separate recorded results before release.

## Evidence and delivery status

Repository inspected at `2e3e8fa567d9f5d6ec8fc65fe42f4a6dc43315a3` after fetching
origin/main. Existing engine and presentation references:
[TRENDS](../../TRENDS.md), [recommended bets](../../RECOMMENDED_BETS.md),
[D-53](../../DECISIONS.md#d-53--home-scored-comparisons-and-research-readiness-october-16-2026),
`shared/trends.mjs`, `shared/trends-view.mjs`, and `web/src/next/lines/`.
The recorded hosted migration chain is authoritative over older not-applied prose;
this design requests no reapplication.

Public reference pages reviewed October 21, 2026:
[TrendsCenter](https://trendscenterapp.com/faq/),
[BettingPros Systems](https://support.bettingpros.com/hc/en-us/articles/26798357800219-What-is-the-BettingPros-Betting-Systems-tool),
[RotoBot](https://rotobot.ai/), and [ParlayScience](https://www.parlayscience.com/).
These establish advertised research features, not audited profitability or
permission to redistribute their data. X feeds were not reliably accessible;
Fatboss's original material and a complete Trent play history were not verified.

Sean's account references:
[RotoBot](https://x.com/rotobot_ai), [ParlayScience](https://x.com/parlayscience),
[Fatboss](https://x.com/fatbosspicks), [TrendsCenter](https://x.com/trendscenterapp),
[BettingPros](https://x.com/bettingpros), [Book It With Trent](https://x.com/bookitwithtrent).

Next: Sean reviews the proposed qualification and lean rules, then an isolated
implementation plan reconciles overlapping recommendation work. Preserve the
sequential queue and other sessions' worktrees. Follow
[repository sync](../../REPOSITORY_SYNC.md) and the separate
[release workflow](../../SHARED_DEPLOYMENT.md). This document does not approve
new paid sources, activate integrations, apply migrations, or establish deployment.
