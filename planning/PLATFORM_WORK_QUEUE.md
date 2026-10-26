# Guess The Line — sequential platform work

Owner: Sean Balsiger · Current reconciliation October 26, 2026

Sean approved completing the existing redesign and optimizations first, updating
this queue against source and release evidence, then proceeding with the work.
The [current completion register](../docs/COMPLETION_REGISTER.md) separates code,
deployment and acceptance. Closed GitHub issues are not proof of completion.
The frozen v62 tracker is preserved.

## Active order and exit criteria

Sean selected **Research and charts** as the next player-facing design batch on
October 26, ahead of the next commissioner page. Continue one implementation lane at a time. The approved four-tab “One thing first”
direction and D-55 charts stay in place. Sean corrected the October 26 phone report: the app does not have the scroll
bug. Q03 records that user acceptance; broader device checks stay separate. No new design vote is needed.
This request authorizes implementation and task reconciliation, not a production
cutover, external invitations or deletion of existing player records.

| Step | Owner | Status and next action | Exit evidence |
| --- | --- | --- | --- |
| DESIGN-01: Research and charts | Codex | Current priority: [D-55 design follow-through](../docs/RESEARCH_DESIGN_2026_10_26.md). PRs #216 and #218 are merged, each after nine passing checks. The next source batch connects season-table buttons, chart dragging and the keyboard slider, retaining selection between chart views. Local tests and both-theme screenshots passed. | Source checkpoints below; then separately recorded hosted release and physical-iPhone acceptance. |
| Q17-A: invitations | Codex | Merged in PR #209 October 26 after all nine CI checks passed: new-app host create/copy/list/revoke, account-scoped state and uncertain-write recovery. October 26 release recorded in [the performance release](../docs/RELEASE_2026_10_26_PERF.md); recipient/phone acceptance remains; see the [implementation record](../docs/REDESIGN_COMPLETION_2026_10_26.md). | Real-handler browser tests, accessibility/phone-width checks, review/CI and merge; separately recorded hosted/recipient readback. No real invitation sent by tests. |
| Q17-B: league creation | Codex | Merged in PR #209 October 26: Duel/Group creation opens invitations in the new app. Account-scoped draft and stable request ID recover uncertain creation without duplicates. No practice switch, per stage 59. Included in the separately recorded October 26 release; signed-in/device acceptance remains. No deployment performed by this task. | New-app create flow, duplicate/lost-response handling, roster access tests and release readback. |
| Q17-C: retained records and tools | Codex | In progress: [source destination matrix](../docs/REDESIGN_PRESERVATION_2026_10_26.md) identifies the retained-record gaps. Community Members merged in PR #211 with all nine checks passing. Manual Settlement is in PR #214; release/readback stays open. M-18 challenge grading and M-19 scheduled settlement/status remain open. Week opening follows the current Research/chart design focus. Keep classic reachable until all destinations and recovery paths work. | Record-by-record destination matrix, permission/preservation checks, source and hosted verification. |
| OPT-01: measured frontend performance | Codex | Partial: PR #210 startup/cache/sign-in optimizations merged separately October 26. API v37 / Pages b8a31940 and signed-out production Lighthouse runs are recorded in [the October 26 release](../docs/RELEASE_2026_10_26_PERF.md). Signed-in startup and phone measurements remain open; this task has not repeated that production audit. Invitations, league creation and Members load on demand, verified locally. Existing Trends CPU and CI repairs are delivered. | Before/after measurements with route, device/emulation, cache and data conditions; functional/privacy regression checks. Do not count old fixture scores as a current baseline. |
| Q06 and approved remaining screens | Codex | Partial: reader/Everyone delivered; M-11 placement, M-12 boards, remaining Virtual Units screens, friend challenges and reward/social details remain. Follow the [build plan](../docs/REDESIGN_BUILD_PLAN.md), stages 35–56 (Bets/challenges) and 61–71 (social/rewards), with current decisions overriding old navigation/timing, sequentially. | Each destination has implementation, focused checks, CI, approved release and signed-in acceptance. Mockups alone cannot close these items. |
| Q07–Q10/Q19: actual-device acceptance | Sean with Codex | Open: verify settings, comparisons/privacy, onboarding, push and a live full week. Q03 navigation movement is no longer reported by Sean. | Actual iPhone Safari/Home Screen and second-device evidence, named account/launch mode without public private data. |
| Q20: transition | Sean with Codex | Blocked by preservation/destinations and acceptance above. | RETIRE-01–04 fulfilled, operator recovery verified, explicit cutover and release evidence. |

### Research/chart checkpoints

| Item | Owner | Current evidence / next step |
| --- | --- | --- |
| Information hierarchy, tooltip spacing, mobile layout and drag endpoints | Codex | PR #216 merged after nine passing checks. |
| Faithful curves, visible season percentages and missing-rate states | Codex | PR #218 merged as `657eb1946b20927cc8a668373276c3844127095e` after nine passing checks; no CI repairs needed. |
| Direct season selection and retained chart/table state | Codex | `codex/research-season-selection`: 19 integrated browser tests, two focused tests, nine rendered-chart tests, 20 chart/token tests, typecheck, Brand QA, fixture build and privacy scan passed. CI/merge pending. |
| Hosted Research/chart verification | Codex | Open: release the approved source through the manual release workflow, then verify the served source and signed-in Research, Lines and Trends. Local fixture checks do not establish this. |
| Physical iPhone acceptance (Q19) | Sean with Codex | Open after release: Safari and Home Screen, Light/Dark, narrow table readability, season taps/dragging and preserved selection, long labels, missing/stale evidence and market locks. Retain Sean's corrected no-scroll-bug report. |

Q18's missing Points actuals/reminder automation remains visible below; delivered
Points screens must not imply automatic scoring. Q05 needs reconfirmation only
when revisited. New Fantasy integrations, simulator and native iOS follow this
approved completion work.

## Existing task identifiers — current status

| ID | Item | Existing work and completion boundary |
| --- | --- | --- |
| Q01 | Backlog and branch reconciliation | October 26 register/queue reconciliation distinguishes shipped code, unresolved acceptance and future work; the dated register archive preserves old claims. PR #152 merged as 97c08b9 and all three integration checkouts were verified clean; preserve all other worktrees. |
| Q02 | Deployment verification | PR #157 merged; check-only 39521037481, readiness 39521105364 and frontend release 39521335125 passed. Pages ad10f1c1 verified 95 assets at both URLs, with API/data/migrations unchanged. Evidence PR carries final merge/sync. |
| Q03 | Mobile navigation and scrolling | Requirements: UX-NEXT-01 in [mobile-bets-followups](mobile-bets-followups.md) (carried from closed PR #144; the four-tab shell from #162 covers part of it). Verify content and controls clear navigation/save bars at phone widths and safe areas in both themes. October 22: `next-scroll-navigation.spec.js` checks bar geometry through scrolling and window-height changes, containing blocks, sideways scroll, end-of-page reach and keyboard focus. The only failure found was Tab focus landing under the bars, fixed with `scroll-padding` in PR #181 and released in Pages `9fb54fe4` (protected release 39821362374, from `8dccc5c`). October 26: Sean explicitly corrected his initial reply and confirmed the app does not have the scroll bug. Record the movement symptom as user-reported resolved, not reproduced independently. This does not close Q19’s wider device/full-week checks. |
| Q04 | Bets filters | Done. Q16 delivered visible result/market filters, owner-scoped weeks and empty states for actual tickets. Recommended All / Spreads / Totals (BETS-NEXT-01) merged in PR #175 and was released in Pages `af617cd2` on October 22; see the [release record](../docs/RELEASE_2026_10_22_TRENDS_FILTER.md). Native/Virtual Units reader delivery remains Q06. |
| Q05 | Recommendation refinements | PR #140 (D-51) closed October 21: D-54 replaced its ranking and #159 moved Recommended to actual-ticket tracking. Its reviewed-quote fix for stake changes merged separately as PR #173 (`2b3d12c`) and shipped in Pages `af617cd2`. Sean to reconfirm before any rebuild: private forecasts as a comparison basis, editing pending Virtual Units picks, weekly summaries, actionable-first order. Its additive writer remains separate from the applied scoring chain. Exact-head tests and release/readback required. |
| Q06 | Account-level Bets access | M-10 reader applied October 22 (hosted `20261022185535`) after the read-only preflight ([preflight](../docs/M10_PREFLIGHT_2026_10_22.md), [Gate M record](../docs/RELEASE_2026_10_22_MIGRATIONS.md)). Signed-in `/bets/read` returned 200 (Week 7, 14 games, 9-player roster). October 23: Bets › Virtual › Everyone (`#bets/everyone`) reads it. It shows everyone's picks per game, with friends' terms behind the viewer's gate and the weekly qualification list. Merged as PR #204 and deployed in the October 23 Points release (API v36 / Pages `3d274d87`); signed-in `/bets/read` returned 200. This does not finish account-level placement (M-11) or the native Bets screens. |
| Q07 | Guess score comparisons | D-53 comparison migration applied October 22 (hosted `20261022185719`) on Sean's approval in the release-lane session ([Gate M record](../docs/RELEASE_2026_10_22_MIGRATIONS.md)). Play → Compare players reads `/league/comparison` signed-in (200; Week 6 shows 14 common scored games). Verify common-game eligibility, independent markets and private-roster boundaries on a phone; never mutate scoring references or official rank. |
| Q08 | Account preferences | D-53 preferences migration applied October 22 (hosted `20261022185832`), same approval and record. The four-tab app reads `/me/preferences` on load (503 before the apply, 200 after). Verify a save, reload, revisions and account isolation on a real device. |
| Q09 | Onboarding and cross-device acceptance | Verify supported signup/sign-in, recovery, invitations and existing-account continuity on a second device. Old setup notes are not current live evidence. |
| Q10 | Phone notification acceptance | Verify actual iPhone Home Screen opt-in, due delivery, tap destination, opt-out and deduplication. Existing sender deployment alone is insufficient. |
| Q11 | Fantasy refresh | Track 1 now publishes refreshed release-file data. Preserve source/time coverage, week alignment, stale and partial-failure behavior. Usage-analysis requirements from closed PR #147 are in [FANTASY_FOOTBALL.md](../docs/FANTASY_FOOTBALL.md#usage-tracker-requirements-queue-q11q14). Track 1 (D-57) merged in PR #198 and released October 23 as API v35 / Pages `78909363` ([release record](../docs/RELEASE_2026_10_23_FANTASY_TRACK1.md)); first data publish October 23 (Week 7, signed-in 200); daily schedule (11:00 UTC) added in PR #205; runs succeeded October 24–26 after the #202 readback fix. Phone readback remains. |
| Q12 | Fantasy profiles and usage | Extend existing details with available usage, actuals, recent/season comparisons and samples. Preserve distinction between observed production and statistical pace estimates. |
| Q13 | NFL player comparisons | Side-by-side player analysis with common scoring format and period; distinct from Q07's Guess-player score comparisons. |
| Q14 | Fantasy matchup tools | Extend basic opponent information with useful sourced matchup context. No unvalidated predictive advantage claims. Track 1 (D-57) merged in PR #198 and released October 23 as API v35 / Pages `78909363` ([release record](../docs/RELEASE_2026_10_23_FANTASY_TRACK1.md)); first data publish October 23 (Week 7, signed-in 200); daily schedule (11:00 UTC) added in PR #205; runs succeeded October 24–26 after the #202 readback fix. Phone readback remains. |
| Q15 | Trade-value charts | New requested scope: establish permitted free sources, league formats, attribution and timestamps. Different provider scales must not be silently combined. No source is connected by this task. |
| Q16 | Easier bet entry/tracking | Released and verified October 20: actual bets first, separate Virtual Units, button entry, explicit unknown terms, pending/settled and market filters. PR #155 merged, API v27 / Pages 9ef3f651 verified, all three integration checkouts clean/synced. October 21 follow-up connects reviewed recommendations to actual tickets and adds a grouped owner list; #159 merged, Pages dcfb977b verified with preserved data/API. Closeout PR #160 merged as 2e3e8fa and all three checkouts synced. Phone acceptance remains separate. |
| Q17 | Remaining native destinations | Use RETIRE-01's preservation/recovery checklist in [new-app retirement](new-app-retirement.md) (carried from closed PR #144) and the inventory: League/Bets screens, history, exports, commissioner tools and old records must retain working homes. |
| Q18 | Operations | Reconcile private/community slate handling, settlement, corrections/voids, scheduled jobs and failure monitoring. Clearly label manual operations until automation is verified. Points P-03 actuals loader/jobs and the Points reminder-worker pass remain open despite P-01/P-02 and the UI being released. |
| Q19 | Device and full-week acceptance | Actual iPhone use, both market gates, real entries/results, history/privacy and relevant jobs over a full live week. Sean's visual acceptance is separate from fixture tests. Includes Sean's phone review of the mobile formatting and visual-depth criteria from closed issue #126 (Photo 1 baseline; implemented in PR #127, Pages `fc7f3cd2`). |
| Q20 | New-app-only transition | Follow D-52 ([decision log](../docs/DECISIONS.md), [RETIRE-01–04](new-app-retirement.md)) after preservation, destinations, access and operator recovery are verified. Remove only unused screens/code; never player records. |

## Separate later scope

- Simulated NFL games: research foundation #131; input/model validation, held-out
  evaluation, serving and acceptance are unbuilt. A historical aggregate baseline
  does not validate a player simulator.
- Native iPhone application: separate deliverable; the mobile website does not
  fulfill it.
- Private Fantasy league/roster integrations, expert projections and trade tools:
  source/access decisions and actual integrations remain. Track 1 does not
  establish these connections.
- Additional notifications/outside feeds require actual approved scope. Current
  notification direction is web push only; no email or SMS service is implied.

## Historical branch and local-work audit — October 19

Read-only audit of GitHub and local Git state on October 19. No branch was reset,
stashed, deleted or silently merged. Open PRs are source evidence, not hosted proof.

| Existing PR | Disposition |
| --- | --- |
| [Scoring release approval #142](https://github.com/seanbalz/guess-the-lines-repo/pull/142) | Superseded by applied/verified release #145 and permanent timing policy #151. Historical evidence retained in GitHub; no implementation merge needed. |
| [Mobile/retirement audit #144](https://github.com/seanbalz/guess-the-lines-repo/pull/144) | Closed October 21. D-52, RETIRE-01–04, UX-NEXT-01 and BETS-NEXT-01 and the dated audit were carried to main for Q03, Q04, Q17 and Q20. Its five-tab README/register notes were not carried. |
| [Fantasy usage requirements #147](https://github.com/seanbalz/guess-the-lines-repo/pull/147) | Closed October 21. Requirements carried to FANTASY_FOOTBALL.md for Q11–Q14. Documentation only; not an integration. |
| [Merged weather/Bets release #148](https://github.com/seanbalz/guess-the-lines-repo/pull/148) | Closed October 21 as obsolete. Weather is applied and core scoring is live. This was the October 19 disposition; M-10 was subsequently applied October 22 (see current Q06). Branch kept. |
| [Home/Fantasy release verification #150](https://github.com/seanbalz/guess-the-lines-repo/pull/150) | Closed October 21 as superseded by #157. Branch kept for its October 16 Pages `0933a030` and D-47 apply evidence. |
| [Recommendation refinements #140](https://github.com/seanbalz/guess-the-lines-repo/pull/140) | Closed October 21. D-54 and #159 replaced its ranking and Recommended flow; the reviewed-quote fix for stake changes moved to its own PR. Remaining D-51 ideas are listed under Q05 for Sean to reconfirm. Its migration `20261015190955` was never applied. Branch kept. |

Windows main and Neo main were clean at `eb4e5e1a7f14a2a863e98ceed9e4744c11603393`;
Mini shared-sync was clean at the same commit. The two existing Windows release
worktrees are merged task histories, not new work. The reconciliation uses its own worktree.

The Mini has 26 registered worktrees: 25 accessible and one stale missing scratch
checkout. All accessible HEAD commits were reachable from a remote ref. Two
accessible worktrees have unpublished changes:

- Original `claude/release-record-oct14-m01`: 37 status entries, including shell/navigation,
  Fantasy and planning files against an old base. Some content is already represented
  in main or open PRs. Do not count all entries as new features or overwrite them.
  Compare the changed content when Q03/Q11/Q17 begins.
- `codex/button-bet-entry`: eight status entries including bet-entry controls, styling,
  browser checks and a specification. Q16 reconciled the relevant source into PR #155
  and deployed it with new tests. The original dirty checkout remains preserved;
  its older standalone contents are not themselves a clean release checkout.

These counts exclude ignored files and do not establish synchronization of private
data, credentials, unrelated repositories, cloud task sandboxes or the private Status
Board. The stale scratch registration and clean older worktrees are preserved;
cleanup is not a prerequisite and is not authorized by this reconciliation.

Two other remote branches have commits outside main and no open PR:
`claude/codex-wip-reconcile` (partial recovery/optional-screen work explicitly
marked superseded in its latest commit) and `claude/release-record-oct14-m01`
(older release/persona merge history). Preserve both as historical sources.
Do not merge them wholesale into current code; use a content-level comparison
only if later recovery or release work needs them. Commit ancestry alone does
not establish whether their changes were delivered through another branch.

## Older issue triage

Issues #1–#9 were closed October 23 with residual work carried into this queue. They are broad historical scopes, not nine wholly unbuilt features.
Backend/scoring (#3) and independent Total (#7) are delivered at their core;
review residual original criteria before closure. Dashboard (#4) maps to Q03/Q17/Q19;
ingestion (#2) to collector/Q11/Q18; operations (#6) to Q02/Q09/Q10/Q18/Q19;
accounts (#8) to Q09 and verified provider setup; odds rights (#9) remain source-specific.
Starter audit (#1), native iOS (#5), visual acceptance (#126) and simulator (#128)
retain their distinct acceptance or future scope. No issue is closed merely from its title.
