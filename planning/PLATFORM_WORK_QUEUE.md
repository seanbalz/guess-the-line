# Guess The Line — sequential platform work

Owner: Sean Balsiger · Reconciled October 19, 2026 (Pacific)

Sean requested one item at a time, completing and verifying each before the next.
This is the current execution queue, not a claim that every feature is authorized
for production or that a planned integration is connected. Existing release
authorization remains valid. No calendar or game-window release restriction applies.
Source/CI, migration dependencies, preservation, privacy and rollback checks remain.

The October 20 20:15 UTC scheduled collector, collection and Week 7 snapshot
were verified successful. Core scoring is active; its PR and original three-machine
sync are complete. See the [release record](../docs/CORE_SCORING_PRODUCTION_RELEASE.md).

## Ordered items

October 20 priority update: after the deployed private-week/results repair, Sean
selected Q16, easier actual-bet tracking, with Virtual Units in a separate view.
Finish its implementation, verification, deployment and three-machine sync before
returning to the remaining queue. See the [release card](../docs/EASIER_BET_TRACKING_RELEASE.md).
The private-week/results evidence PR #154 merged as
`eb1fa9330d715140f8e343a24daf51908ace5ba6`; all three clean integration checkouts
were verified at that merge with zero ahead, behind or changed files.

Q01 is complete (PR #152). Sean prioritized private-week rollover and automatic
final results before Q02–Q20; see the [weekly results release](../docs/WEEKLY_RESULTS_RELEASE.md).
That repair is active in production and its source is merged/synced on all three machines;
its closeout PR records the hosted evidence and final evidence synchronization. An item is finished when its
applicable review, tests, merge, hosted verification and clean three-machine sync
are evidenced. A blocked item stays blocked; do not silently skip it or start
several implementation lanes. Physical-phone or product acceptance must be named
explicitly when it cannot be established by automated tests.

| ID | Item | Existing work and completion boundary |
| --- | --- | --- |
| Q01 | Backlog and branch reconciliation | Current register, this queue and the branch audit distinguish delivered, pending and unpublished work. PR #152 merged as 97c08b9 and all three integration checkouts were verified clean; preserve all other worktrees. |
| Q02 | Deployment verification | Reconcile the Pages canonical-redirect verifier fix in PR #150 with current main; test expected versus unexpected redirects and record actual protected-workflow results. Earlier successful upload is not a successful verifier run. |
| Q03 | Mobile navigation and scrolling | Reconcile PR #144's UX-NEXT-01 and unpublished shell changes before implementing. Verify content and controls clear navigation/save bars at phone widths and safe areas in both themes. |
| Q04 | Bets filters | PR #144's BETS-NEXT-01: All / Spreads / Totals filtering before limiting results, with clear week and empty states. |
| Q05 | Recommendation refinements | Reconcile PR #140 against current main: actual-offer ranking, quote-preserving edits, private forecasts and weekly summaries. Its additive writer remains separate from the applied scoring chain. Exact-head tests and release/readback required. |
| Q06 | Account-level Bets access | M-10 reader remains unhosted. Reconcile PR #148's release notes; verify dependencies, grants, gated reads and scope. This does not finish account-level placement or all native Bets screens. |
| Q07 | Guess score comparisons | D-53 comparison migration remains unhosted. Verify common-game eligibility, independent markets and private-roster boundaries; never mutate scoring references or official rank. |
| Q08 | Account preferences | D-53 preferences migration remains unhosted. Verify saved settings, reload, revisions and account isolation. |
| Q09 | Onboarding and cross-device acceptance | Verify supported signup/sign-in, recovery, invitations and existing-account continuity on a second device. Old setup notes are not current live evidence. |
| Q10 | Phone notification acceptance | Verify actual iPhone Home Screen opt-in, due delivery, tap destination, opt-out and deduplication. Existing sender deployment alone is insufficient. |
| Q11 | Fantasy refresh | Existing rankings use a fixed Week 6 snapshot. Establish permitted refresh, source/time coverage, week alignment, stale and partial-failure behavior. Reconcile PR #147's usage-analysis requirements. |
| Q12 | Fantasy profiles and usage | Extend existing details with available usage, actuals, recent/season comparisons and samples. Preserve distinction between observed production and statistical pace estimates. |
| Q13 | NFL player comparisons | Side-by-side player analysis with common scoring format and period; distinct from Q07's Guess-player score comparisons. |
| Q14 | Fantasy matchup tools | Extend basic opponent information with useful sourced matchup context. No unvalidated predictive advantage claims. |
| Q15 | Trade-value charts | New requested scope: establish permitted free sources, league formats, attribution and timestamps. Different provider scales must not be silently combined. No source is connected by this task. |
| Q16 | Easier bet entry/tracking | Reconcile unpublished button-entry work before building. Clear entry/confirmation and pending/settled/history views; preserve corrections and separate tracked real bets from Virtual Units. |
| Q17 | Remaining native destinations | Reconcile PR #144's preservation/recovery checklist and the inventory: League/Bets screens, history, exports, commissioner tools and old records must retain working homes. |
| Q18 | Operations | Reconcile private/community slate handling, settlement, corrections/voids, scheduled jobs and failure monitoring. Clearly label manual operations until automation is verified. |
| Q19 | Device and full-week acceptance | Actual iPhone use, both market gates, real entries/results, history/privacy and relevant jobs over a full live week. Sean's visual acceptance is separate from fixture tests. |
| Q20 | New-app-only transition | Follow D-52 direction in PR #144 after preservation, destinations, access and operator recovery are verified. Remove only unused screens/code; never player records. |

## Separate later scope

- Simulated NFL games: input/model validation, held-out evaluation, serving and acceptance remain; the historical aggregate baseline does not validate a player simulator.
- Native iPhone application: separate deliverable and scope/budget decision, not fulfilled by the mobile website.
- Additional notifications and outside feeds: reconcile requested channels, free-only permissions and actual delivery requirements.
- Private Fantasy league/roster integrations and expert projections from PR #147 need source/access decisions; existing static rankings do not provide them.
- Other user suggestions need their actual request recorded before entering this queue.

## Branch and local-work audit

Read-only audit of GitHub and local Git state on October 19. No branch was reset,
stashed, deleted or silently merged. Open PRs are source evidence, not hosted proof.

| Existing PR | Disposition |
| --- | --- |
| [Scoring release approval #142](https://github.com/seanbalz/guess-the-lines-repo/pull/142) | Superseded by applied/verified release #145 and permanent timing policy #151. Historical evidence retained in GitHub; no implementation merge needed. |
| [Mobile/retirement audit #144](https://github.com/seanbalz/guess-the-lines-repo/pull/144) | Retain requirements; consume/reconcile in Q03, Q04, Q17 and Q20. Its old release snapshot is historical. |
| [Fantasy usage requirements #147](https://github.com/seanbalz/guess-the-lines-repo/pull/147) | Retain requirements for Q11–Q14 and later private league context. Documentation only; not an integration. |
| [Merged weather/Bets release #148](https://github.com/seanbalz/guess-the-lines-repo/pull/148) | Retain for Q06. Weather is already applied; access and scoring blockers are obsolete. M-10 still needs release. Do not replay weather/scoring migrations. |
| [Home/Fantasy release verification #150](https://github.com/seanbalz/guess-the-lines-repo/pull/150) | Retain the verifier fix for Q02. Pages/API and weather claims must be reconciled against later evidence; avoid reintroducing old registry entries. |
| [Recommendation refinements #140](https://github.com/seanbalz/guess-the-lines-repo/pull/140) | Retain implementation for Q05. Earlier green checks are not checks of a future integration head. Old timing restrictions are superseded. |

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
  browser checks and a specification. Inspect and reconcile in Q16; no test/merge/live
  claim is made for these edits.

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

Issues #1–#9 are broad historical scopes, not nine wholly unbuilt features.
Backend/scoring (#3) and independent Total (#7) are delivered at their core;
review residual original criteria before closure. Dashboard (#4) maps to Q03/Q17/Q19;
ingestion (#2) to collector/Q11/Q18; operations (#6) to Q02/Q09/Q10/Q18/Q19;
accounts (#8) to Q09 and verified provider setup; odds rights (#9) remain source-specific.
Starter audit (#1), native iOS (#5), visual acceptance (#126) and simulator (#128)
retain their distinct acceptance or future scope. No issue is closed merely from its title.
