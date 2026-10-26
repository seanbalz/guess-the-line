# Guess The Line — current completion register

Owner: Sean Balsiger · Reconciled October 26, 2026

The current task list is [the sequential platform queue](../planning/PLATFORM_WORK_QUEUE.md).
Sean approved finishing the existing redesign and optimizations before expanding
scope. The approved direction remains Home / Play / Bets / Research, “One thing
first,” with D-55 Round 3 charts. No new design selection is required for this work.
The frozen v62 tracker is unchanged. The previous, cumulative register is retained
as a [dated archive](COMPLETION_REGISTER_ARCHIVE_2026_10_26.md).

## What the evidence establishes

GitHub main was `7d0a48f116ae5b607bab0f92b103ebf447e20188` at this audit.
There were no open pull requests or issues; that does **not** mean the product is
finished. Unfinished issue scope was carried into the repository queue when the
issues were closed October 23. CI at this main revision passed Tests, Brand QA and
Dashboard. No app runtime file changed between the latest recorded deployed
source `1efd802bea78d298b1c30ede7824b6a6213c23aa` and that main revision.

The latest recorded app release is October 23 Eastern / October 24 UTC:
API v36 and Pages `3d274d87-8b1c-470d-9ede-de1287b2ea9f`, including Points P-01/P-02
and Bets Everyone. See the [Points release evidence](RELEASE_2026_10_23_POINTS.md).
These are dated deployment records, not a new authenticated production audit.
Since then, October 26: `gtl-api` v37 and Pages `b8a31940` from `17afa76` (faster app
start: cached preflights, shared and parallel boot reads, immutable assets, no sign-in
jump; also #209); see the [release record](RELEASE_2026_10_26_PERF.md).
Current physical-iPhone acceptance and cross-machine synchronization were not
established by this repository audit.

## October 26 merge follow-through

[PR #209](https://github.com/seanbalz/guess-the-lines-repo/pull/209) merged as
`c42148747ecdc6c3190c4a1582baa921807376af` after all nine checks passed on
`ea4daae2cd7206db9316ee2c0c163ff88b37c660`. Its CI fixes preserve Join as the
single primary action when an invitation is pending and stabilize historical
Trends/Lines browser fixtures. The full Node suite passed 1,766 tests with zero
skips; all 25 Vitest files passed. The initial audit above remains dated evidence.

The refreshed main also includes [PR #210](https://github.com/seanbalz/guess-the-lines-repo/pull/210),
merged separately as `417b800e735242560c45ef7e275520c3a6e61e59`: shared/parallel
startup reads, preflight and hashed-asset caching, nonblocking fonts and sign-in
continuity. Its reported Lighthouse measurements are PR-author evidence, not a
new production or physical-phone measurement by this task. Neither merge alone
establishes deployment. This task has not deployed the app or applied SQL.

## Delivered versus remaining

| Area | Implemented and released evidence | Still open |
| --- | --- | --- |
| Four-tab design | [PR #162 release](RELEASE_FOUR_TAB_REDESIGN.md): four roots, compact summaries, retained editors and reversible detail routes. [D-55 Round 3 release](RELEASE_2026_10_22_ROUND3.md): charts, disclosures and Home/Bets styling. | Q17 missing destinations; Q19 visual/device acceptance. Classic remains the default and a recovery route. |
| Mobile layout | PR #174 toolbar/spacing fixes; PR #181 focus scroll padding released as Pages `9fb54fe4`. | October 26: Sean corrected his initial reply and reports the app does not have the scroll bug. The movement symptom is user-reported resolved. Broader Q19 device acceptance remains separate. |
| Bets | [Actual tracking](EASIER_BET_TRACKING_RELEASE.md), [recommendation handoff](RECOMMENDED_TRACKING_RELEASE.md), [Recommended filters](RELEASE_2026_10_22_TRENDS_FILTER.md), M-10 reader and PR #204 Everyone are released. | Q06 account-level placement M-11, boards M-12 and remaining dedicated Virtual Units screens. Reader delivery does not close the full Bets plan. |
| Scoring and comparisons | [Core scoring](CORE_SCORING_PRODUCTION_RELEASE.md): per-game lock, personal points and receipts. [Migrations release](RELEASE_2026_10_22_MIGRATIONS.md): D-53 comparisons/preferences applied and signed-in reads verified. | Q07/Q08 phone privacy, save/reload and account-isolation acceptance; Q18 operating evidence. |
| Trends and optimization | [Trends release](RELEASE_2026_10_22_TRENDS_FILTER.md); PR #182 CPU repair shipped as API v32. PR #207 runs the Node/Vitest suite once and shards browser CI; PR #208 restores release compatibility gates. | PR #210 startup optimizations and signed-out measurements have a [recorded October 26 release](RELEASE_2026_10_26_PERF.md). Signed-in startup and phone performance measurements remain open. On-demand invitation, creation and Members code is verified locally; lazy-loading checks are not phone performance evidence. |
| NBA | [October 22 release](RELEASE_2026_10_22_MIGRATIONS.md): daily games and private bet tracking, migrations, API v34 and Pages `7ae80e71`; archived tickets preserved. | Physical-iPhone acceptance. NBA competitions remain later scope. |
| Fantasy | [Track 1](RELEASE_2026_10_23_FANTASY_TRACK1.md) released, first data published, readback retry fixed in #202, daily schedule in #205. Scheduled runs succeeded October 24–26; [October 26 run](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40365251250). | Phone readback; richer usage/comparisons/matchup/trade tools Q12–Q15 and connected roster work follow current redesign completion. D-59 fantasy feed: the private `fantasy-feed` bucket migration `20261026220000` (in `NOT_HOSTED`) and the machine-only `gtl-fantasy-ingest` upload are in the repository but not applied or deployed; the read route, app views and exporter follow ([release card](FANTASY_FEED_RELEASE.md)). |
| Guess the Points | P-01/P-02, API v36 and frontend released; signed-in `/points/read` verified in the release record. | P-03 actuals loader/jobs merged independently in PR #219 October 26 (`9da3ce6`), with release-workflow preparation in PR #223 (`839c928`) (unapplied migration `20261026120000`, `gtl-points-jobs` worker; [release card](GUESS_THE_POINTS_P03.md)); not applied or deployed. Points reminder-worker pass (`gtl-push-reminders`) still awaits its Mac mini deploy. Automatic Points scoring is not complete until P-03 is applied, deployed and verified. |
| Social and rewards | Existing feed/comments and group membership work. | Remaining approved friend challenges, player/social detail screens and badge/streak/award/recap pipeline; each needs its real contract and implementation gate, not a completion claim based on a mockup. |
| Preservation and transition | [RETIRE-01–04 checklist](../planning/new-app-retirement.md) exists. | Q17 history/export, commissioner tools, invitations/creation and older-record destinations; Q09/Q10/Q19 device/full-week acceptance, then Q20 transition. No cutover or record deletion authorized by this audit. |

## Current implementation lane

Q17-A invitation management and Q17-B Duel/Group creation are merged in #209.
Their October 26 frontend release is recorded in [the performance release](RELEASE_2026_10_26_PERF.md); signed-in recipient/device readback remains separate. Both use existing
routes, include uncertain-write recovery and load only when opened; see the
[implementation record](REDESIGN_COMPLETION_2026_10_26.md).

Sean’s next priority is **Research and charts**, selected October 26. The current
[design batch](RESEARCH_DESIGN_2026_10_26.md) applies D-55 to Research’s information
hierarchy, tooltip spacing, narrow-screen stat/season layouts and chart gestures.
It also fixes Escape closing the underlying sheet when dismissing chart
information. PR #216 merged as `275c57fa1fedd4876cdf706e7b16a5e77bb52d66`
after all nine checks passed on `06c500a124ca5eaf8730d41f024063edb625cbd7`.
[PR #218](https://github.com/seanbalz/guess-the-lines-repo/pull/218) merged as
`657eb1946b20927cc8a668373276c3844127095e` after all nine checks passed on
`7bfbe8546bcc5370dc8e1f57555f318031386a95`; no CI fixes were needed. It adds
faithful curve geometry, visible season headings/percentages and missing-versus-zero
win rates. Neither Research merge establishes a new deployment.

PR #222 makes each season in the table selectable, synchronizes it
with dragging and the keyboard slider, and retains the selected year when
switching chart views. A check and outline identify the selection, with 44px
minimum touch targets. All 19 integrated Research/Lines/Trends browser tests,
two focused tests, nine rendered-chart tests, 20 chart/token tests, typecheck,
Brand QA, fixture build and bundle privacy scan passed. Light/Dark 320px
screenshots were inspected. [PR #222](https://github.com/seanbalz/guess-the-lines-repo/pull/222)
merged as `71bb47b46737fc309ad778a593a72d130a1c67d5` after all nine checks passed
on `8cc4042b6bdd94c65095d2bd8105e6a27a00a969`; no CI fixes were needed.
Hosted release and physical-device acceptance remain open. The queue lists each
checkpoint separately; this does not close all Research work or Q19.

PR #224 supplies [game market details](RESEARCH_MARKET_DETAILS_2026_10_26.md):
per-market current/latest consensus with source times, named-book quote comparison,
and recorded line movement with a chart and table. Local verification passed:
23 integrated browser tests, five focused market/freshness cases, 26 rendered
component tests, 37 model/API-contract/price-order/token tests, typecheck, Brand
QA, fixture build and bundle privacy scan. [PR #224](https://github.com/seanbalz/guess-the-lines-repo/pull/224)
merged as `97273e9652cf29dca77208488deb7c6c858646a4` after all nine checks passed on
`473be765f015fcf7d88853979bc8d246f878ddf1`. No CI fixes or review responses were needed.
Release and physical-device acceptance remain open.
The next source batch adds [board current quotes and gate entry](RESEARCH_BOARD_LINES_2026_10_26.md):
current/latest values with source times, one banner leading to Play, scoped
failure/retry behavior and time-based freshness without odds polling. All 28
selected browser cases passed across integrated/focused runs; 26 component,
43 model/contract/token and 19 SQL gate tests passed, plus typecheck, Brand QA,
build/privacy scan and inspected Light/Dark 320px screenshots. Board CI/merge
and release remain open.

Residual stage 33 work stays explicit: direct in-board forfeit confirmation
(the banner uses the existing Play flow) and verified live-game status beyond
kickoff/final evidence. Stage 34's competition/action destinations and device
acceptance remain open. These batches do not complete either whole stage.

Q17-C remains open. Community Members merged in
[PR #211](https://github.com/seanbalz/guess-the-lines-repo/pull/211) as
`36024875d7a04b01eaafc2bc3d46b3625538d16e` after all nine checks passed.
Manual Settlement is in [PR #214](https://github.com/seanbalz/guess-the-lines-repo/pull/214).
It does not close M-18 challenge grading or M-19 scheduled settlement/status.
Week opening is the next commissioner page after the current design focus.
The [preservation matrix](REDESIGN_PRESERVATION_2026_10_26.md) still identifies
history, export, journal, older-record and recovery gaps. Keep one implementation
lane at a time; new Fantasy integrations, simulator work and native iOS remain
later scope. The broader redesign and measured performance work are unfinished.

History and export (Q17-C, stages 72–75) is in parallel review. Stages 72–73 are on
branch `claude/redesign-history`: M-27 (`20261026230000_gtl_me_history.sql`), the
`/me/changes` and `/me/records` routes, and Me › History with Guess and Bets weeks.
M-27 is written and not applied; its routes await Sean's "apply M-27" and a
gtl-api deploy. Local PGlite, handler and browser checks are recorded in its PR;
they are not hosted or phone evidence.

## What needs Sean

- Complete the named phone, notification, second-device and live-week acceptance
  checks when their source/release prerequisites are ready.
- Reconfirm the superseded D-51 ideas in Q05 only when that lane is reached.
  They do not block the approved redesign now.
- A production release/cutover is a distinct action with its existing preservation
  and release gates. This implementation audit does not claim one occurred.

No additional palette, navigation or chart-direction answer is needed to continue.
