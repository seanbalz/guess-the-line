# Research assessments, stage one

Owner: Sean Balsiger · October 30, 2026 · Source implementation; not deployed

Sean approved this stage after the research/alignment discussion. It adds betting
research and recommendations alongside Guess the Line. It does not change guess
entry, locking, reveal rules, scoring references, points or competition settlement.
The existing gap-based list remains at `#bets/recommended`, labelled **Your guess
vs. market**. The independent list is **Research recommendations** at
`#bets/research`, also reachable from an eligible matchup's research.

## Reviewed references and what can be reproduced

The links below are source-reported observations reviewed for this request. They
are not verified live sportsbook offers or GTL model results. The original graphic
assets and private inputs are not redistributed in the public repository.

| Reference | Observations | Implication for GTL |
| --- | --- | --- |
| [4thDown VIP](https://x.com/4thdownvip/status/2115875805469319444) | Panthers at Packers: scheme/coverage rates, QB efficiency against coverage, receiver routes/targets/first reads/yards per route, run concepts and injuries. The graphic compares GB -3.5 / total 46.5 with the author's GB -0.8 / total 45.6. Methodology and weights are undisclosed; charting is attributed to RotoBot. | Store metric definitions, denominators, samples, injury assumptions and attribution. A market difference alone is not GTL's estimated edge. RotoBot and this author can share the same underlying dataset. |
| [RotoBot thread](https://x.com/rotobot_ai/status/2115825619766587580) | Reports 10,000 simulations: GB win 60%, cover -3.5 48%, over 47.5 51%, Kraft under 46.5 receiving yards 59%, Waller over 19.5 receiving yards 56%. Its context mentions total 46.5, while the simulation result uses 47.5. Starter/usage assumptions include Jacobs' role, Golden playing and Reed out. | These remain attributed external estimates. Match the exact player, metric, side and threshold. Never transfer over-47.5 probability to 46.5. Yards per throw and yards per dropback are different denominators. Simulation count does not establish predictive accuracy or calibration. |
| [Action Network](https://x.com/actionnetworkhq/status/2115899436798980451) | Public sides with at least 51% of bets were 5–16 ATS in the stated night-game sample; 0–6 in the last two weeks is a subset. GB: 53% bets, 47% money, -3.5 at -111; CAR: 47% bets, 53% money, +3.5 at -108. | Preserve the sample/window and source definition. The six-percentage-point money/bets difference does not establish sharp action. A small historical record is not an estimated next-game win probability. No public-split production feed or reuse integration has been established. |

A 51% over probability is not enough to beat a -110 price (52.38% break-even).
This arithmetic can check a claim's interpretation; it does not validate the
source's probability. Own score/player simulations, calibration and independent
holdout evaluation are later stages. There is no qualified model in this stage.

Free nflverse schedules support completed-game scoring averages and existing
historical trend calculations. Private, hash-checked play-by-play inputs can
produce observed pass/run success (40%/60%/100% of yards needed by down), passing
yards per attempt, rushing yards per carry and observed sacks. The output records
sample exclusions, dates and definitions. Missing values remain missing; a real
zero stays zero. These descriptive statistics are not a projection.

Free FTN/nflverse coverage is partial: some charting fields are available, but no
complete free weekly route/coverage/pressure/first-read production pipeline was
verified. The detailed proprietary scheme graphics cannot currently be reproduced
in full. No injury, starter, roster or charting source is claimed connected merely
because an adapter or field exists.

## Assessment contract

| Color | Meaning in this stage |
| --- | --- |
| Green | Reserved for a tested projection indicating value at an available price. This stage cannot emit it. Later credible opposition must remain prominent rather than automatically removing green. |
| Yellow | A qualifying qualitative research lean and a current verified quote at the exact terms. It may oppose a player's locked guess. A documented public trend can qualify by itself; it is not a calculated edge. |
| Red | Qualifying evidence against the assessed selection, with a current exact quote and no qualifying supporting claim. |
| Gray | Insufficient usable evidence, a missing/stale quote, unresolved checks or pregame closure. |

All assessed selections are visible in one list with color and market filters.
Order is schedule/name order, not a fabricated confidence ranking. Supporting and
opposing findings are both shown; yellow with opposition has an explicit callout.
Dataset grouping prevents multiple posts using RotoBot charting from being counted
as independent confirmations. Book It With Trent is a separately identified feed;
its content does not vote in the research assessment.

Claims need an identified original source, publication/observation/data dates,
conditions, metric units/denominators, a positive sample and permitted use. A
computed claim additionally needs a reproduced result and input hash. External
claims can qualify without GTL reproducing their calculation, but are explicitly
labelled source-reported and not independently reproduced. External data older
than seven days stays pending. Simulations must include exact betting terms;
ambiguous or mismatched terms never contribute a vote. These automated checks
validate completeness and consistency, not the truth of every external statistic.

NFL spreads, totals, two-team moneylines, documented player props and supported
alternate lines retain distinct identities. Player props require a unique stable
player ID in the current game's supplied roster receipt. Quotes retain book,
provider, event, observation/capture times and exact terms. A newer same-book
capture supersedes an older offer; the best current price is chosen across books.
Game quotes expire at six hours, props at one hour, and all close at kickoff.
They are recorded offers, not a guarantee a sportsbook will still accept a bet.
Moneyline tracking is not added to the existing tracked-ticket form in this stage.

## Partial source access and submitted links

The selected accounts are RotoBot, 4thDown VIP, Action Network, ParlayScience,
Fatboss, TrendsCenter, BettingPros and the separate Book It With Trent feed.
The official X API charges for reads. No free permitted automatic feed for all
eight accounts was verified or configured during this work.

The operator discovery adapter accepts explicitly verified free publisher feeds
with an allowed origin and a permission receipt. It discovers canonical selected
account post links and reports missing access honestly. It is not an enabled
scheduler. A feed being accessible does not verify claims found in that feed.

Signed-in users can submit selected-account post URLs to a private, append-only,
idempotent queue and read their own last 50 submissions. Tracking parameters are
removed. Links remain **pending**. This stage does not automatically transcribe
arbitrary X images, resolve a thread or extract inaccessible post content. A
private operator must obtain accessible permitted content, identify its conditions
and enter structured evidence before the automated checks and publication can
make it an assessment. No live pending-to-processed workflow is claimed complete.

## Data and operating boundaries

All public responses pass through the authoritative existing per-game reveal
board. Every declared dependency must be open, and the claim's own market must be
open. Props and moneylines require both spread and total access conservatively.
Closed selections cannot affect returned titles, IDs, evidence, filters or counts.
User identity and time come from the server, never request-body overrides.
Account/week/access changes invalidate frontend data, and monotonic expiry plus
focus/online refresh prevents a suspended phone from retaining a qualifying quote.
No private inputs are put into the browser bundle.

The additive migration
`supabase/migrations/20261030204548_gtl_research_assessments.sql` creates three
private tables and seven service-only invoker functions with an empty search
path. Browser roles have no direct grants. It does not replace any scoring,
ballot or settlement function. Its matching rollback revokes only the new service
entry points and preserves the intake, snapshots and provider captures.

Assessment page reads reuse stored quotes and research; they spend no provider
credits. Optional operator quote collection uses the existing Odds API budget
row/lease, a recent successful preflight and the existing 50-credit reserve. It
reserves conservatively before a request, never refunds uncertain attempts,
handles quota headers conservatively and pauses on unexpectedly high cost. There
is no new allowance, subscription or implicit all-slate sweep. Maximums are four
explicit requests per intake job and eight distinct markets per request, using
the existing three books. No paid/provider requests were made during validation.

## Operator intake

Use ignored `.local` files; credentials and raw inputs must never be committed.
The CLI validates without publishing or collecting odds by default:

```sh
node scripts/research-intake.mjs --input .local/research/input.json --output .local/research/result.json
```

The JSON envelope has `snapshot` (version 1, season, week, generatedAt, sources,
candidates, quotes), optional `discovery` configurations, optional `playByPlay`
receipts and optional `quoteRequests`. `tests/fixtures/research-assessments.mjs`
is a synthetic schema example, not production betting content. Each candidate
contains its selection, kickoff, complete dependencies and structured evidence.
Source-authored `snapshot.quotes` are context only: the API ignores them and reads
retained provider captures instead.

`--collect-quotes` additionally requires `GTL_RESEARCH_ODDS_API_KEY` and explicit
jobs containing a stable request ID, game/event mapping, selected markets and a
roster receipt for prop markets. `--publish` appends a private snapshot using a
stable `publicationId` for safe retry. Both operations require
`GTL_RESEARCH_SUPABASE_URL` and `GTL_RESEARCH_SERVICE_ROLE_KEY` in the operator's
secure environment. Reuse IDs after uncertain replies. Job logs expose only
counts and an input hash. Output stays ignored, with restrictive file permissions.
No production credentials or schedule were configured by this PR.

## Release state

Source, hosted schema, API/frontend release, source-feed configuration and actual
phone acceptance are separate milestones. The migration is **not applied** and
the feature is **not deployed**. On an older API/schema the new screen handles an
unavailable response; source access is never fabricated.

Before release: successful exact-source CI; approved compatible API release with
the new error mappings (keep `research-assessments` off during staging); the named
migration approval and fresh migration/dependency/preservation review; apply only
this migration through the existing operator process; approved frontend release
and feature enablement after readback; fresh hosted
privacy/permissions and signed-in readback; phone acceptance. The
[shared deployment rules](SHARED_DEPLOYMENT.md) require Sean's production
environment approval separately. Applying schema is not automated by that workflow.
The offline trend scanner [PR #363](https://github.com/seanbalz/guess-the-line/pull/363)
is separate work and was not merged or duplicated here.

## Local verification — October 30, 2026

The worktree's full Node run passed 2,607 tests with zero failures/skips; the
component run passed 614 tests across 48 files. Focused final research, boundary,
intake, SQL and shell checks passed 149 tests; the separately registered feature
off switch and Lines checks passed nine. The migration's preservation rollback
was exercised against the existing hosted-migration test world.

The combined browser run passed the new research flow and all 18 existing
recommendation flows. The new screen passed Axe at 320/390px in Light/Dark and
was visually inspected with fallback fonts. A subsequent title-wrap fix has its
own browser assertion. Mobile browser emulation is not physical-phone acceptance.
Typecheck, production/authenticated builds, bundle privacy scan, brand QA and
whitespace review passed locally. Screenshots/logs remain in ignored `.local`.
Exact committed-source CI is reported on the review PR separately.

Two pre-existing test fixtures failed on untouched `main` after their fixed
October 30 clock assumptions aged. The disposable EPL fixture now places its
logical clock ahead of setup; the kickoff-comment fixture places its disposable
posts ahead of the database clock. The targeted 21-test rerun passed. No EPL or
kickoff product/competition behavior was changed to make those tests pass.
