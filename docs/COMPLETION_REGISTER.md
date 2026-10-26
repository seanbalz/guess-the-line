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

## Delivered versus remaining

| Area | Implemented and released evidence | Still open |
| --- | --- | --- |
| Four-tab design | [PR #162 release](RELEASE_FOUR_TAB_REDESIGN.md): four roots, compact summaries, retained editors and reversible detail routes. [D-55 Round 3 release](RELEASE_2026_10_22_ROUND3.md): charts, disclosures and Home/Bets styling. | Q17 missing destinations; Q19 visual/device acceptance. Classic remains the default and a recovery route. |
| Mobile layout | PR #174 toolbar/spacing fixes; PR #181 focus scroll padding released as Pages `9fb54fe4`. | October 26: Sean corrected his initial reply and reports the app does not have the scroll bug. The movement symptom is user-reported resolved. Broader Q19 device acceptance remains separate. |
| Bets | [Actual tracking](EASIER_BET_TRACKING_RELEASE.md), [recommendation handoff](RECOMMENDED_TRACKING_RELEASE.md), [Recommended filters](RELEASE_2026_10_22_TRENDS_FILTER.md), M-10 reader and PR #204 Everyone are released. | Q06 account-level placement M-11, boards M-12 and remaining dedicated Virtual Units screens. Reader delivery does not close the full Bets plan. |
| Scoring and comparisons | [Core scoring](CORE_SCORING_PRODUCTION_RELEASE.md): per-game lock, personal points and receipts. [Migrations release](RELEASE_2026_10_22_MIGRATIONS.md): D-53 comparisons/preferences applied and signed-in reads verified. | Q07/Q08 phone privacy, save/reload and account-isolation acceptance; Q18 operating evidence. |
| Trends and optimization | [Trends release](RELEASE_2026_10_22_TRENDS_FILTER.md); PR #182 CPU repair shipped as API v32. PR #207 runs the Node/Vitest suite once and shards browser CI; PR #208 restores release compatibility gates. | Establish a current reproducible frontend performance baseline and fix measured bottlenecks. Historic local lazy-loading tests are not present-day phone performance evidence. |
| NBA | [October 22 release](RELEASE_2026_10_22_MIGRATIONS.md): daily games and private bet tracking, migrations, API v34 and Pages `7ae80e71`; archived tickets preserved. | Physical-iPhone acceptance. NBA competitions remain later scope. |
| Fantasy | [Track 1](RELEASE_2026_10_23_FANTASY_TRACK1.md) released, first data published, readback retry fixed in #202, daily schedule in #205. Scheduled runs succeeded October 24–26; [October 26 run](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40365251250). | Phone readback; richer usage/comparisons/matchup/trade tools Q12–Q15 and connected roster work follow current redesign completion. |
| Guess the Points | P-01/P-02, API v36 and frontend released; signed-in `/points/read` verified in the release record. | P-03 actuals loader/jobs and Points reminder-worker pass. Automatic Points scoring is not complete. |
| Social and rewards | Existing feed/comments and group membership work. | Remaining approved friend challenges, player/social detail screens and badge/streak/award/recap pipeline; each needs its real contract and implementation gate, not a completion claim based on a mockup. |
| Preservation and transition | [RETIRE-01–04 checklist](../planning/new-app-retirement.md) exists. | Q17 history/export, commissioner tools, invitations/creation and older-record destinations; Q09/Q10/Q19 device/full-week acceptance, then Q20 transition. No cutover or record deletion authorized by this audit. |

## Current implementation lane

Q17-A and Q17-B are implemented and checked locally October 26. Q17-A brings host invitation management into the new app using the existing
`/invites` and `/invite/revoke` routes. It includes explicit link creation, copying,
status, revocation and uncertain-write recovery. It sends no email and requires
no migration. Q17-B adds Duel/Group creation, a draft kept per account in the tab, and explicit recovery of an uncertain creation using the same request ID. Both screens load only when opened. See the [implementation record](REDESIGN_COMPLETION_2026_10_26.md) for checks and publication/release boundaries.

After this lane: the remaining preservation destinations,
then measured performance fixes and remaining approved feature dependencies.
Keep one implementation lane at a time; device-only acceptance can remain
explicitly open while independent source work proceeds. New Fantasy integrations,
simulator work and native iOS do not take priority over this completion work.

## What needs Sean

- Complete the named phone, notification, second-device and live-week acceptance
  checks when their source/release prerequisites are ready.
- Reconfirm the superseded D-51 ideas in Q05 only when that lane is reached.
  They do not block the approved redesign now.
- A production release/cutover is a distinct action with its existing preservation
  and release gates. This implementation audit does not claim one occurred.

No additional palette, navigation or chart-direction answer is needed to continue.
