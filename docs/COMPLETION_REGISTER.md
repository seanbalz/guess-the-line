# Guess The Line — current completion register

Owner: Sean Balsiger · Reconciled October 28, 2026

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
| Four-tab design | [PR #162 release](RELEASE_FOUR_TAB_REDESIGN.md): four roots, compact summaries, retained editors and reversible detail routes. [D-55 Round 3 release](RELEASE_2026_10_22_ROUND3.md): charts, disclosures and Home/Bets styling. | Q17 missing destinations; Q19 visual/device acceptance. Since the [October 27 release](RELEASE_2026_10_27_API_FRONTEND.md) (`gtl-api` v38, Pages `4a03e6cd`) every signed-in member opens the new app (D-60 step 1); classic stays at `?app=classic` as a recovery route. |
| Mobile layout | PR #174 toolbar/spacing fixes; PR #181 focus scroll padding released as Pages `9fb54fe4`. | October 26: Sean corrected his initial reply and reports the app does not have the scroll bug. The movement symptom is user-reported resolved. Broader Q19 device acceptance remains separate. |
| Bets | [Actual tracking](EASIER_BET_TRACKING_RELEASE.md), [recommendation handoff](RECOMMENDED_TRACKING_RELEASE.md), [Recommended filters](RELEASE_2026_10_22_TRENDS_FILTER.md), M-10 reader and PR #204 Everyone are released. | Q06 account-level placement M-11 and the remaining dedicated Virtual Units screens. Boards M-12 [applied October 27](RELEASE_2026_10_27_FEED_MIGRATIONS.md) with `/bets/board` and `/bets/season` in `gtl-api` v38; no screen reads them yet. Reader delivery does not close the full Bets plan. |
| Scoring and comparisons | [Core scoring](CORE_SCORING_PRODUCTION_RELEASE.md): per-game lock, personal points and receipts. [Migrations release](RELEASE_2026_10_22_MIGRATIONS.md): D-53 comparisons/preferences applied and signed-in reads verified. | Q07/Q08 phone privacy, save/reload and account-isolation acceptance; Q18 operating evidence. |
| Trends and optimization | [Trends release](RELEASE_2026_10_22_TRENDS_FILTER.md); PR #182 CPU repair shipped as API v32. PR #207 runs the Node/Vitest suite once and shards browser CI; PR #208 restores release compatibility gates. | PR #210 startup optimizations and signed-out measurements have a [recorded October 26 release](RELEASE_2026_10_26_PERF.md). Signed-in startup and phone performance measurements remain open. On-demand invitation, creation and Members code is verified locally; lazy-loading checks are not phone performance evidence. |
| NBA | [October 22 release](RELEASE_2026_10_22_MIGRATIONS.md): daily games and private bet tracking, migrations, API v34 and Pages `7ae80e71`; archived tickets preserved. | Physical-iPhone acceptance. NBA competitions remain later scope. |
| Fantasy | [Track 1](RELEASE_2026_10_23_FANTASY_TRACK1.md) released, first data published, readback retry fixed in #202, daily schedule in #205. Scheduled runs succeeded October 24–26; [October 26 run](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40365251250). | Phone readback; richer usage/comparisons/matchup/trade tools Q12–Q15 and connected roster work follow current redesign completion. D-59 fantasy feed: the private `fantasy-feed` bucket migration `20261026220000` is applied (hosted as `20261028131021`, October 28, [card](RELEASE_2026_10_28_D59_TRENDS.md)); the machine-only `gtl-fantasy-ingest` upload is deployed (v1, October 28, through the `fantasy-ingest` release target) and answers 503 until Sean sets its upload secret; the read route, app views and exporter follow ([release card](FANTASY_FEED_RELEASE.md)). |
| Guess the Points | P-01/P-02, API v36 and frontend released; signed-in `/points/read` verified in the release record. | P-03 actuals loader/jobs (PR #219) and the worker release targets (PR #223) merged October 26 (`9da3ce6`). [October 26 release](RELEASE_2026_10_26_POINTS_JOBS.md): P-03 applied (hosted `20261026213106`, 54 migrations, digest `bd53dcf4…`), `gtl-points-jobs` v1 and `gtl-push-reminders` v5 deployed, cron jobs registered with the schedule row disabled. Open: [release card](GUESS_THE_POINTS_P03.md) step 5 (enable and one verified run) and step 6 (first actuals readback); until then no slate is drafted or published automatically and automatic Points scoring is not verified. Commissioner "Publish now" on Play › Points (preview a drafted week, confirm, publish through the existing `POST /points/slate`; no server change) merged in PR #277 (`671e3ec`) and live in Pages `48a36ee4-a4f9-48c8-a64b-b030a7d2d29a` from `9460635` (October 28, release card PR #279); signed-in commissioner acceptance on a phone is still open. |
| Social and rewards | Existing feed/comments and group membership work. League feed (stages 61–63) and badges, awards and streaks (stage 69): routes in `gtl-api` v38 and M-13, M-21, M-22, M-23, M-25, M-26 [applied October 27](RELEASE_2026_10_27_FEED_MIGRATIONS.md); signed-in feed and features reads answer 200 in hosted logs. Badges worker `gtl-league-features` v1 and its weekly schedule (Tuesday 12:00 UTC, on Sean's "once a week") are live since October 27 ([release record](RELEASE_2026_10_27_LEAGUE_FEATURES.md)); the first scheduled run recorded 58 badges, 18 awards and 10 streaks and posted the Week 7 recap. Open: phone checks. | Remaining approved friend challenges, player/social detail screens and badge/streak/award/recap pipeline; each needs its real contract and implementation gate, not a completion claim based on a mockup. |
| Preservation and transition | [RETIRE-01–04 checklist](../planning/new-app-retirement.md) exists. Me › History (older records included) and Export my data: routes in `gtl-api` v38, M-27 and M-28 [applied October 27](RELEASE_2026_10_27_FEED_MIGRATIONS.md); no signed-in use yet. | Q17 history/export, commissioner tools, invitations/creation and older-record destinations; Q09/Q10/Q19 device/full-week acceptance, then Q20 transition. No cutover or record deletion authorized by this audit. |

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
Frontend release is recorded through #289 in the current release checkpoint; signed-in readback and device acceptance remain open. The queue lists each
checkpoint separately; this does not close all Research work or Q19.

PR #224 supplies [game market details](RESEARCH_MARKET_DETAILS_2026_10_26.md):
per-market current/latest consensus with source times, named-book quote comparison,
and recorded line movement with a chart and table. Local verification passed:
23 integrated browser tests, five focused market/freshness cases, 26 rendered
component tests, 37 model/API-contract/price-order/token tests, typecheck, Brand
QA, fixture build and bundle privacy scan. [PR #224](https://github.com/seanbalz/guess-the-lines-repo/pull/224)
merged as `97273e9652cf29dca77208488deb7c6c858646a4` after all nine checks passed on
`473be765f015fcf7d88853979bc8d246f878ddf1`. No CI fixes or review responses were needed.
Frontend release is recorded through #289 in the current release checkpoint; signed-in readback and device acceptance remain open.
PR #225 adds [board current quotes and gate entry](RESEARCH_BOARD_LINES_2026_10_26.md):
current/latest values with source times, one banner leading to Play, scoped
failure/retry behavior and time-based freshness without odds polling. All 28
selected browser cases passed across integrated/focused runs; 26 component,
43 model/contract/token and 19 SQL gate tests passed, plus typecheck, Brand QA,
build/privacy scan and inspected Light/Dark 320px screenshots. [PR #225](https://github.com/seanbalz/guess-the-lines-repo/pull/225)
merged as `733e95d586e005427350ba156d7ad1a05c139094` after all nine checks passed on
`cf9ebe16c88975fefcc0d0a2168cc069741152c3`; no CI fixes or review responses were needed.
Frontend release is recorded through #289 in the current release checkpoint; signed-in readback and device acceptance remain open.

Stage 33’s direct in-board confirmation is supplied by the Research reveal
batch recorded below. Verified live-game status beyond kickoff/final evidence
remains open. PR #230 adds [Community guesses in the game
sheet](RESEARCH_GAME_GUESSES_2026_10_26.md), implementing stage 34’s per-game list:
independent markets, private drafts, reader-provided scores/ranks, on-demand
reads and scoped retry handling. All 33 integrated browser cases, five focused
reruns, 28 component and 38 model/API-contract/SQL/token tests passed, along with
typecheck, Brand QA, build/privacy scan and inspected 320px Light/Dark screenshots.
[PR #230](https://github.com/seanbalz/guess-the-lines-repo/pull/230) merged as
`f8997f66b3f70512cf988ea905664bb7e828f62e` on October 26; verified October 27:
all nine checks passed on `60d66647f5a4c4cccc749106c63cea204687a710`, with no
review findings or CI fixes. The October 27 frontend release card includes it;
this session has not independently verified hosted deployment or device acceptance.

PR #242 adds the [game action bar](RESEARCH_GAME_ACTIONS_2026_10_27.md):
Spread and Total slots open the explicit week and focus the selected matchup in
Play. Existing drafts, receipts and lock-in confirmations remain in the full
ballot. [PR #242](https://github.com/seanbalz/guess-the-lines-repo/pull/242) merged
October 27 as `ec5c0358c70aee273edcfea70c6b39799a14f443` after all nine checks passed on
`b163ceaaf1ebe41802b36f79e6f3301d3d22f852`. No CI fixes or review findings. Frontend release is recorded through #289 in the current release checkpoint; signed-in readback and device acceptance remain open.

PR #243 supplies stage 31's [Your pick sheet](RESEARCH_YOUR_PICK_2026_10_27.md):
per-market saved references, explicit pending/first-after/commissioner labels,
recorded Late, account/week guards and fixed-market Community guesses. Its
validation and publication checkpoints are recorded separately. It merged October 27
as `f5a9551bd2c7d5e9a1d617dee54445c3da499f11` after all nine checks passed on
`4dfb665a259ba98220d2ad6be48a708b468507b2`. No CI fixes or review findings.

[PR #245](https://github.com/seanbalz/guess-the-lines-repo/pull/245) adds [per-game League bets](RESEARCH_GAME_BETS_2026_10_27.md) from
the Bets action slot, using the existing M-10 reader and shared Everyone rows.
43 integrated browser cases plus four final focused cases, 24 component and
42 model/shell/token tests passed,
along with typecheck, Brand QA, build/privacy scan and inspected 320px screenshots.
It merged October 27 as `1db1c44062e2b63b7b945c6b0478a1ca6d72c8b6` after all nine checks
passed on `58f4d14240308e999cbede1aec1de13dd65d4362`, with no CI fixes or review findings.
Frontend release is recorded through #289 in the current release checkpoint; signed-in readback and device acceptance remain open.

[PR #246](https://github.com/seanbalz/guess-the-lines-repo/pull/246) supplies [direct Research reveal confirmation](RESEARCH_REVEAL_2026_10_27.md)
from the board and closed game guesses. It uses the existing whole-week M-03
forfeit contract, with fresh eligibility, an explicit warning, preserved locked
scores/drafts and recovery by checking an uncertain write. All 49 integrated
browser cases plus five final focused cases, 24 component, 47 model/contract/shell/token and 23 database tests
passed, along with typecheck, Brand QA, build/privacy scan and inspected 320px
Light/Dark screenshots. PR #246 merged October 27 as
`6494a629e567d54aa05520ac339472322ee062bb` after all nine checks passed on
`c191ec8a8e56a71f4023002a1e2df18296331096`; no CI fixes or review findings.
Frontend release is recorded through #289 in the current release checkpoint; signed-in readback and device acceptance remain open.

The [Research chart correction](RESEARCH_DESIGN_2026_10_26.md#cumulative-chart-records--october-27)
pairs cumulative units with a cumulative record in tooltips and keyboard
announcements. The evidence table keeps each period’s own record with explicit
column labels. Source is in [PR #248](https://github.com/seanbalz/guess-the-lines-repo/pull/248)
on `codex/research-chart-records`; all 50 integrated
browser tests, 25 component and 72 model/handler tests passed, as did typecheck,
Brand QA and build/privacy validation. Light/Dark 320px screenshots were inspected.
PR #248 merged October 27 as `bc5a06cb74252c8da7af6c87a4531878b7ea67fe`
after all nine checks passed on `459e24f3680a3ee0fb0792ba5905dfe7d7d397ee`;
no CI fixes or review findings. Frontend release is recorded through #289 in the current release checkpoint; signed-in readback and device acceptance remain open.

The [chart interaction correction](RESEARCH_DESIGN_2026_10_26.md#retained-line-selection--october-27)
retains the cumulative-line point while comparing the season view. Line and
season selections remain independent; changed evidence and reopened details
start at the latest line point. Source is in [PR #249](https://github.com/seanbalz/guess-the-lines-repo/pull/249)
on `codex/chart-selection`: all 50
integrated browser tests plus two final focused checks, 27 component and 20
chart/token tests passed, along with typecheck, Brand QA and build/privacy checks.
Light/Dark 320px screenshots were inspected. PR #249 merged October 27 as
`b1bc64b493e6a6723ba7ee58582fdbd2569d448c` after all nine checks passed on
`0c1918d992eaba0b595ab029877e87857a068daf`, with no CI fixes or review findings.
Frontend release is recorded through #289 in the current release checkpoint; signed-in readback and device acceptance remain open.

The [chart frontend release card](RELEASE_2026_10_28_CHARTS.md), merged in
PR #296, records Pages `b57d894a-34b8-4df7-8125-a46d4438475d` from
`b4413bf6504d9e8286ca0f7ae1a3b3b7db0e5f6b`, verified by the release lane at
15:42:36 UTC October 28. It includes the Research/chart work through #293,
superseding #292's `58bd9959` checkpoint. API v39 and the 65-row migration
history are unchanged; 380 signed-out probes denied access. This task read the
committed release evidence and did not repeat that hosted audit. Signed-in
readback and phone acceptance remain open. The on-demand team-detail and Trends
batches have no release recorded here. D-63's trend-builder product decisions
remain proposed; its separately recorded deployment does not settle them.

The [high-contrast chart correction](RESEARCH_DESIGN_2026_10_26.md#high-contrast-chart-fallback--october-27)
restores marks that disappeared under forced colors: season stems, win-rate bars
and Last 10 blocks. It also preserves selected-season boundaries and uses system
foregrounds for line and movement plots. Source is in [PR #250](https://github.com/seanbalz/guess-the-lines-repo/pull/250)
on `codex/chart-high-contrast`;
all 51 integrated browser tests, 30 component and 23 model/token tests passed,
along with typecheck, Brand QA and build/privacy checks. Before/after screenshots
were inspected. PR #250 merged October 27 as
`fddcaf3d1ae6211324a80a9d3fef3f65d87ca003` after all nine checks passed on
`a8b0571f32577ee05517db59dacadc1faa2935bf`, with no CI fixes or review findings. Frontend release is recorded through #289 in the current release checkpoint; signed-in readback and device acceptance remain open.

The [kickoff-marker batch](RESEARCH_DESIGN_2026_10_26.md#kickoff-marker-in-market-movement--october-27)
adds a dashed, timestamped landmark within recorded movement history, preserving
quote selection, gaps and market gates. Source is in [PR #252](https://github.com/seanbalz/guess-the-lines-repo/pull/252)
on `codex/movement-kickoff`;
all 52 integrated browser tests, the focused browser test, 24 model/token tests
and 31 component tests passed, along with typecheck, Brand QA and build/privacy
checks. Four 320px ordinary/forced-color screenshots were inspected. PR #252 merged October 27 as
`c54cc42045af534da0b1b474e45282858768f0ed` after all nine checks passed on
`0d143f95e68215ce9b153dbbdcb3757908923868`, with no CI fixes or review findings.
Frontend release is recorded through #289 in the current release checkpoint; signed-in readback and device acceptance remain open.

The [Research source-time batch](RESEARCH_DESIGN_2026_10_26.md#pacific-source-times-in-research--october-27)
uses readable Pacific times for quotes, source posts and provenance, retaining
exact source timestamps and historical calendar dates. Missing or unzoned times
stay unavailable. Source is in [PR #253](https://github.com/seanbalz/guess-the-lines-repo/pull/253)
on `codex/research-source-times`: nine Research and
52 integrated browser cases passed, followed by kickoff/source-time checks on
the combined branch, 33 component and 27 format/token tests. Typecheck, Brand QA
and build/privacy checks passed; six 320px Light/Dark screenshots inspected.
PR #253 merged October 27 as
`a887fd162560e3aa6e6eb29fe3cdd3686fcfb137` after all nine checks passed on
`d58d94addcf63f20aef980fc772b371bcb843903`, with no CI fixes or review findings. Frontend release is recorded through #289 in the current release checkpoint; signed-in readback and device acceptance remain open.

The [player comparison chart batch](RESEARCH_DESIGN_2026_10_26.md#labelled-player-comparison-charts--october-27)
labels each observation and value directly, preserves shared scales and the
evidence table, and distinguishes real zero from a missing sample. A forced-color
avatar fallback accompanies it. Source is in [PR #258](https://github.com/seanbalz/guess-the-lines-repo/pull/258)
on `codex/research-chart-values`;
54 integrated browser cases and five final Trends cases passed, along with 52
component and 24 model/token tests, typecheck, Brand QA and build/privacy checks.
Six 320px screenshots were inspected; narrow evidence tables keep whole headings
inside their scroll container. PR #258 merged October 27 as `e4c0c07ecf3d75bb68f87789cd7c1ea4e8bb1484` after all nine checks passed on repaired head `b0874306f81477f79dae38240d8238d929fe2406`. The CI brand-mark failure was fixed with an explicit initials-avatar class; no review findings remained.
Hosted release and device acceptance remain open.

The [recent-result tile batch](RESEARCH_RECENT_RECORDS_2026_10_27.md)
shows actual sample sizes and all three W–L–P counts, with pushes distinct from
losses and an explicit grouped-count label. Source is in [PR #259](https://github.com/seanbalz/guess-the-lines-repo/pull/259)
on `codex/research-recent-records`; 55 integrated browser cases on current main plus
repaired #258, two focused combined-chart
cases, 48 component and 20 model/token tests passed. Four 320px Light/Dark and
forced-color screenshots were inspected. Typecheck, Brand QA and build/privacy
checks passed. PR #259 merged October 27 as `ba9c043e156229e10b97b4edf0851a7fa5833408` after all nine checks passed on `80aa7f1eb4835aee593548fdfa5223e21ad62952`, with no CI fixes or review findings.
Hosted release and device acceptance remain open.

The [season-baseline batch](RESEARCH_SEASON_BASELINE_2026_10_27.md)
removes the minimum positive stub for zero and small values, uses a hollow
break-even marker and keeps missing units unplotted. Source is in [PR #261](https://github.com/seanbalz/guess-the-lines-repo/pull/261)
on `codex/season-zero-markers`; all 56 integrated browser cases, focused browser,
49 component and 26 geometry/token/brand-mark tests passed, along with typecheck,
Brand QA and build/privacy checks. Four 320px ordinary/forced-color screenshots
were inspected. PR #261 merged October 27 as `95eaa18b027c5ccdafffa571ee1083540f0591e6` after all nine checks passed on `1a9add3b3024b274ef12b515a0d528868d0eb32f`, with no CI fixes or review findings.
Release/readback and device acceptance remain open.

The [steady-tooltip batch](RESEARCH_STABLE_TOOLTIP_2026_10_27.md)
keeps line and season plots in place when tooltip labels wrap during scrubbing.
The browser regression reproduced an 18px shift and passed after the fix;
49 component and 26 geometry/token/brand-mark tests passed. All 57 browser cases
are covered by the integrated run and corrected season-fixture rerun. Eight
320px ordinary/forced-color screenshots inspected; typecheck, Brand QA and
fixture build/privacy checks passed. Source is in [PR #262](https://github.com/seanbalz/guess-the-lines-repo/pull/262)
on `codex/chart-stable-tooltip`. PR #262 merged October 27 as `6799e78e90a73805f9a337953a92d90f9fb0991e` after all nine checks passed on `d77e0ecca6300dd8d5ba48a5c089677e664160e0`, with no CI fixes or review findings.
Release/readback and device acceptance remain open.

The [Research evidence-selection batch](RESEARCH_EVIDENCE_SELECTION_2026_10_27.md)
links historical date rows and cumulative chart points, retaining period records,
focus and market gates while refusing controls for mismatched snapshots.
All 59 integrated browser cases and 12 final Research cases, 51 component and
26 geometry/token/brand-mark tests passed, along with typecheck, Brand QA and
fixture build/privacy checks. Four final 320px ordinary/forced-color screenshots
inspected. Source is in [PR #263](https://github.com/seanbalz/guess-the-lines-repo/pull/263)
on `codex/research-evidence-selection`. PR #263 merged October 27 as `6f427fb8ba00e1dc7b751a9aacb730ea4bc0f0e2` after all nine checks passed on `25b0dc5824a4050d6bea142262aabc2b2f70ebaf`, with no CI fixes or review findings.
Release/readback and device acceptance remain open.

The [recorded-movement selection batch](RESEARCH_MOVEMENT_SELECTION_2026_10_27.md)
links game-sheet timestamps to their chart observations, preserving missing
rows, duplicate times, keyboard focus and the locked-market boundary. The
focused browser regression, 57 component checks, 30 geometry/token/brand checks,
typecheck and fixture build/privacy checks passed locally. The first integrated
run exposed a Research-to-Play focus race; a deterministic regression failed
before and passed after the shell was repaired to preserve the requested game’s
focus. All 85 final integrated browser cases passed, including shell/navigation
and per-game scoring. Four 320px ordinary/forced-color screenshots were inspected.
Source is in [PR #265](https://github.com/seanbalz/guess-the-lines-repo/pull/265)
on `codex/market-movement-selection`. PR #265 merged October 27 as `63dbdaa3b5ebc39b89841f153f1f82682fc11689` after all nine checks passed on `0c0f2cd5fc3e7d36c1fe02a7767421c14693ece3`, with no CI code fixes or review findings.
Release/readback and physical-device acceptance remain open.

The [visible unit-scale batch](RESEARCH_CHART_SCALES_2026_10_27.md)
adds the plotted unit bounds to line and season charts. Zero and missing evidence
stay distinct; each image references its own accessible scale. All 59 component,
31 geometry/token/brand tests and typecheck passed. Browser coverage includes
59 passing integrated cases and all 12 Research cases after correcting a scale
expectation to match the plotted fixture value. Eight 320px Light/Dark and
forced-color screenshots were inspected; Brand QA and fixture build/privacy
checks passed. PR #267 merged October 27 as `21f9799064cf5f853279de7378449ff98307b475` after all nine checks passed on `03462dedaac1d8d4850a4cfb3a763eb8a98ae4b8`, with no CI fixes or review findings.
Source is in [PR #267](https://github.com/seanbalz/guess-the-lines-repo/pull/267).
Release/readback and phone acceptance remain open.

The [recorded market-range batch](RESEARCH_MOVEMENT_SCALE_2026_10_27.md),
`codex/market-movement-scale`, makes movement-chart bounds visible as well as
accessible. Spread signs and total points stay distinct from cumulative units;
single observations, flat series and missing evidence retain explicit states.
After integrating main with #266 and #267, all 65 browser cases passed, including
gesture coverage. The combined branch passed 112 component and 41
geometry/gesture/token/brand tests, typecheck, Brand QA and fixture build/privacy checks. Four 320px ordinary
and forced-color screenshots were inspected. PR #270 merged October 27 as `d98fb81ff0e84f392cf00ae235d7f09bd12b0e8b` after all nine checks passed on `edaab840546c379a781778e999fa3399b0314158`, with no CI fixes or review findings.
Source is in [PR #270](https://github.com/seanbalz/guess-the-lines-repo/pull/270).
Release is recorded in the current checkpoint; signed-in readback and physical-iPhone acceptance remain open.

The [Research-loading batch](RESEARCH_LOADING_2026_10_27.md),
`codex/research-loading-states`, extends the approved static skeletons to the
Research sheet, on-demand evidence and lazy historical table. Stale data still
hides before replacement reads; failures restore the existing explanation and
retry. All 66 integrated browser cases, two focused cases, 86 component tests,
19 token/brand tests and typecheck passed. Brand QA and fixture build/privacy
checks passed; six 320px ordinary/forced-color screenshots were inspected.
PR #272 merged as `e85e7859ae3714e3ec4e699d2bc4a33c7380a462` after all nine
checks passed on `41b8cf9132b8e9ac6520664c8953c1be6f611b65`. Initial browser CI
failed two Play haptic checks; integrating main’s PR #271 fix resolved them
without relaxing the lock-in assertions. All 21 local Play/Research cases and
all 110 cases in the repaired CI shard passed. No review findings remained.
Release is recorded in the current checkpoint; signed-in readback and phone acceptance remain open.

The [historical-table recovery batch](RESEARCH_TABLE_RECOVERY_2026_10_27.md),
`codex/research-table-recovery`, contains failed table downloads inside the
evidence section. The chart, selection, summary and sheet remain usable; retry
loads only the table and retains keyboard focus. Its browser regression failed
before the fix and passed afterward. All 14 Research browser cases, 86 component
and 19 token/brand tests and typecheck passed; four 320px ordinary/forced-color
screenshots were inspected. All 53 integrated Lines/Trends/Bets Everyone/gesture
cases also passed (67 browser cases total), along with Brand QA and fixture
build/privacy checks. After integrating the PR #272 CI repair from main’s
PR #271, all 22 combined Play-moment and Research browser cases passed again.
PR #275 merged October 27 as `a14852ec92aecb14a3c530fea7396e0a3aeb56c3`;
all nine checks passed on `65d2e03ed137a16420694b495740f644a4aca27a`, with no
review findings or further CI fixes. Verified October 28. Its release is now
recorded in the current checkpoint above; signed-in/device acceptance remains open.

The [team-chart selection follow-up](RESEARCH_TEAM_SELECTION_2026_10_28.md)
restores the full team sheet by removing its collision with the 32px team-mark
class, and connects completed season results to the margin chart with keyboard/focus
preservation, missing-score guards and readable narrow rows. Source branch:
`codex/team-chart-selection`. All 60 integrated Lines/Research/gesture browser
cases, 59 team/Research/chart component tests, 19 token/brand tests and typecheck
passed. Eight 320px Light/Dark and forced-color chart/result screenshots were
inspected; Brand QA and fixture bundle privacy checks passed. PR #289 merged
October 28 as `13c1b35198e8028205059088afa5f25043ad9e8e` after all nine
checks passed on `1582b786c4386433199e7874820bfba57700102f`, with no review
findings or CI fixes. Release is recorded in the current checkpoint; signed-in
readback and device acceptance remain open.

The [player comparison scale batch](RESEARCH_PLAYER_SCALES_2026_10_28.md)
adds visible point/percentage bounds to the existing comparison bars, derived
from their actual plotting range. Signed bias, absolute error, fixed 0–100%
rates and unavailable samples stay distinct. Source branch:
`codex/player-comparison-scales`. All 25 integrated Trends/Research/gesture
browser cases and the final focused case passed, as did 62 component and
19 token/brand tests, typecheck, Brand QA and fixture bundle privacy checks.
Eight 320px Light/Dark and forced-color signed/percentage screenshots were
inspected. PR #291 merged October 28 as `437766277102ef6488696fc623107937138dba1f`
after all nine checks passed on `e0d0f71ae471bf7d81d61ec41342d35a741cb4ca`, with no
review findings or CI fixes. Frontend release is recorded in #296; signed-in readback and device acceptance
remain open.

The [steady team-chart readout batch](RESEARCH_TEAM_READOUT_2026_10_28.md)
reserves the tallest supplied game label so enlarged text does not move the
plot or slider when selection changes. Source branch: `codex/team-chart-readout`.
The regression failed before and passed after the fix; all 67 integrated
Lines/Research/Trends/gesture browser cases passed before the final main
integration; both affected team browser cases and 84 component tests passed
on the final source. 19 token/brand tests, typecheck, Brand QA and fixture bundle
privacy checks passed. Four 320px
enlarged-text ordinary/forced-color screenshots were inspected. PR #293 merged
October 28 as `1d9b38c891753af7a32686db2dd3e2fbd8c404e2` after all nine checks passed
on `754a38d28b354f552a07abff2ad7aa902c95a264`, with no review findings or CI fixes.
Frontend release is recorded in #296; signed-in readback and device acceptance
remain open.

The [on-demand team-detail batch](RESEARCH_TEAM_LOADING_2026_10_28.md) defers
team view/chart code and styles until the sheet opens. Its frame remains usable
while loading or retrying, and retry does not repeat the cached record read.
The local static dependency graph is 9,604 bytes smaller (2,193 estimated gzip),
with a 1,815-byte estimated gzip overhead once the optional view is opened.
The original 68 integrated browser cases and all four final team cases (including
repeated stylesheet-failure recovery), 84 component tests,
19 token/brand tests, typecheck, Brand QA and fixture bundle privacy checks passed.
Eight 320px Light/Dark and forced-color loading/error screenshots were inspected.
Source branch: `codex/lazy-team-sheet`. CI/merge, release/readback, signed-in
performance and device acceptance remain open.

The [on-demand Trends page](RESEARCH_TRENDS_LOADING_2026_10_28.md) is the next
source batch on `codex/lazy-research-trends`: the optional screen and chart styles
load on a visit, with scoped loading/retry and navigation retained. Home's saved
summary remains independent. Local asset measurements reduce the initial static
graph by 50,418 raw bytes (13,655 estimated gzip), with a 2,708-byte estimated
gzip overhead after opening Trends. All 71 integrated browser cases, both final
focused cases, 84
component and 19 token/brand tests, typecheck, Brand QA and fixture privacy checks
passed; eight 320px loading/error screenshots were inspected. CI/merge,
release/readback, signed-in performance and phone acceptance remain open.

Verified live-game status, stage 34’s Bet/Challenge action slots, the remaining
Play skip flow and device acceptance stay open. The board currently derives
Started from kickoff/server time; its model does not carry verified live/final
status. The queue now records source/time, missing/stale and privacy exit
criteria for that remaining stage 33 work. These batches do not complete the
whole stages.

Q17-C remains open. Community Members merged in
[PR #211](https://github.com/seanbalz/guess-the-lines-repo/pull/211) as
`36024875d7a04b01eaafc2bc3d46b3625538d16e` after all nine checks passed.
Manual Settlement is in [PR #214](https://github.com/seanbalz/guess-the-lines-repo/pull/214).
It does not close M-18 challenge grading or M-19 scheduled settlement/status.
M-19's shared-ticket part (D-64, proposed): automatic settlement of pending Bet Tracker tickets after the game's
Pacific day, called by the existing results worker, plus a one-time backfill for Week 7 and earlier, is written in
`20261028120000_gtl_social_auto_settle.sql` (not applied; see the [release card](RELEASE_2026_10_28_AUTO_SETTLE.md)).
Challenge settlement (M-18) and a status reader remain open.
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
they are not hosted or phone evidence. Stages 72–73 are [PR #232](https://github.com/seanbalz/guess-the-lines-repo/pull/232).
Stage 74 (History › Older records, read-only, no migration of its own) is
[PR #235](https://github.com/seanbalz/guess-the-lines-repo/pull/235), on branch `claude/redesign-history-older`.
Stage 75 (Export my data) is on branch `claude/redesign-export`: M-28
(`20261026231000_gtl_me_export.sql`, apply after M-27), `/me/export` and Menu ›
Export my data, written and not applied.

## Trend builder (proposed D-63, October 28)

Draft PR on `claude/trend-builder`: Trends › Build, honest result card, this week's matches and per-device saved
trends with a Home indicator ([TRENDS.md](TRENDS.md#trend-builder-and-saved-trend-matches--proposed-d-63-october-28-2026)).
Frontend only (Pages deploy); no API deploy or migration. Not merged, not deployed; D-63 awaits Sean.

## What needs Sean

- Complete the named phone, notification, second-device and live-week acceptance
  checks when their source/release prerequisites are ready.
- Reconfirm the superseded D-51 ideas in Q05 only when that lane is reached.
  They do not block the approved redesign now.
- A production release/cutover is a distinct action with its existing preservation
  and release gates. This implementation audit does not claim one occurred.

No additional palette, navigation or chart-direction answer is needed to continue.
