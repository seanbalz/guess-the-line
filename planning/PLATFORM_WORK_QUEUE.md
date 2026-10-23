# Guess The Line — sequential platform work

Owner: Sean Balsiger · Reconciled October 19, 2026 (Pacific) · Q05 and Q16 status
rechecked October 22 at `523dd63`

Sean requested one item at a time, completing and verifying each before the next.
This is the current execution queue, not a claim that every feature is authorized
for production or that a planned integration is connected. Existing release
authorization remains valid. No calendar or game-window release restriction applies.
Source/CI, migration dependencies, preservation, privacy and rollback checks remain.

The October 20 20:15 UTC scheduled collector, collection and Week 7 snapshot
were verified successful. Core scoring is active; its PR and original three-machine
sync are complete. See the [release record](../docs/CORE_SCORING_PRODUCTION_RELEASE.md).

## Active priority — October 21: weekly and player Trends

Sean approved a new Trends tab, highlights below weather, weekly availability at guess opening, recent/history windows and player guess-versus-market outcome analysis. This takes priority before the remaining ordered items. Work is isolated on `codex/weekly-player-trends` from freshly fetched `origin/main` at `368f5d4`. The [design](../docs/superpowers/specs/2026-10-21-weekly-player-trends-design.md) and [release record](../docs/WEEKLY_PLAYER_TRENDS_RELEASE.md) contain the accepted scope and actual verification state. This task does not reopen core scoring or apply migrations. Private-league player views retain the separate D-53 comparison-reader dependency. The initial implementation, independent review and local verification are in [PR #166](https://github.com/seanbalz/guess-the-lines-repo/pull/166). Integrated with the four-tab redesign, merged and released October 22 as API v31 and Pages `af617cd2` ([release record](../docs/RELEASE_2026_10_22_TRENDS_FILTER.md)). The round 3 chart redesign followed as Pages `f092e744` ([release record](../docs/RELEASE_2026_10_22_ROUND3.md)). Real-phone acceptance remains open.

## Ordered items

October 20 priority update: after the deployed private-week/results repair, Sean
selected Q16, easier actual-bet tracking, with Virtual Units in a separate view.
Q16 implementation passed all five CI checks, merged in PR #155 as
`2d81436dc0f3bcbfd9c91b69c9049755eb8b4601`, deployed as API v27 / Pages `9ef3f651`,
and synced cleanly across the three integration checkouts. Its release evidence
closeout PR #156 merged as `fd1facc7af1d1673b99dee0bd2f0228d6f63a0e6`; all three
checkouts were synced cleanly. Q02's fix is merged and its protected release passed;
the evidence PR records final merge/sync. October 21: Sean prioritized the
Recommended-to-tracked-bets handoff and a grouped ticket list before Q03. That
follow-up merged in PR #159 and was verified in protected release 39652280151
as Pages dcfb977b; all three integration checkouts synced cleanly to runtime
commit 368f5d46cd036d74f9dc5c32cf572dd702d320b2. Closeout PR #160 passed all five
checks and merged October 21 as `2e3e8fa`; all three checkouts then synced cleanly;
see the [release card](../docs/RECOMMENDED_TRACKING_RELEASE.md). See the
[bet-tracking release card](../docs/EASIER_BET_TRACKING_RELEASE.md) and
[verifier record](../docs/DEPLOYMENT_VERIFIER_RELEASE.md).
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
| Q02 | Deployment verification | PR #157 merged; check-only 39521037481, readiness 39521105364 and frontend release 39521335125 passed. Pages ad10f1c1 verified 95 assets at both URLs, with API/data/migrations unchanged. Evidence PR carries final merge/sync. |
| Q03 | Mobile navigation and scrolling | Requirements: UX-NEXT-01 in [mobile-bets-followups](mobile-bets-followups.md) (carried from closed PR #144; the four-tab shell from #162 covers part of it). Verify content and controls clear navigation/save bars at phone widths and safe areas in both themes. October 22: `next-scroll-navigation.spec.js` checks bar geometry through scrolling and window-height changes, containing blocks, sideways scroll, end-of-page reach and keyboard focus. The only failure found was Tab focus landing under the bars, fixed with `scroll-padding` in PR #181 and released in Pages `9fb54fe4` (protected release 39821362374, from `8dccc5c`). A real-iPhone reproduction and acceptance remain open. |
| Q04 | Bets filters | Done. Q16 delivered visible result/market filters, owner-scoped weeks and empty states for actual tickets. Recommended All / Spreads / Totals (BETS-NEXT-01) merged in PR #175 and was released in Pages `af617cd2` on October 22; see the [release record](../docs/RELEASE_2026_10_22_TRENDS_FILTER.md). Native/Virtual Units reader delivery remains Q06. |
| Q05 | Recommendation refinements | PR #140 (D-51) closed October 21: D-54 replaced its ranking and #159 moved Recommended to actual-ticket tracking. Its reviewed-quote fix for stake changes merged separately as PR #173 (`2b3d12c`) and shipped in Pages `af617cd2`. Sean to reconfirm before any rebuild: private forecasts as a comparison basis, editing pending Virtual Units picks, weekly summaries, actionable-first order. Its additive writer remains separate from the applied scoring chain. Exact-head tests and release/readback required. |
| Q06 | Account-level Bets access | M-10 reader applied October 22 (hosted `20261022185535`) after the read-only preflight ([preflight](../docs/M10_PREFLIGHT_2026_10_22.md), [Gate M record](../docs/RELEASE_2026_10_22_MIGRATIONS.md)). Signed-in `/bets/read` returned 200 (Week 7, 14 games, 9-player roster). No screen reads it yet. This does not finish account-level placement (M-11) or the native Bets screens. |
| Q07 | Guess score comparisons | D-53 comparison migration applied October 22 (hosted `20261022185719`) on Sean's approval in the release-lane session ([Gate M record](../docs/RELEASE_2026_10_22_MIGRATIONS.md)). Play → Compare players reads `/league/comparison` signed-in (200; Week 6 shows 14 common scored games). Verify common-game eligibility, independent markets and private-roster boundaries on a phone; never mutate scoring references or official rank. |
| Q08 | Account preferences | D-53 preferences migration applied October 22 (hosted `20261022185832`), same approval and record. The four-tab app reads `/me/preferences` on load (503 before the apply, 200 after). Verify a save, reload, revisions and account isolation on a real device. |
| Q09 | Onboarding and cross-device acceptance | Verify supported signup/sign-in, recovery, invitations and existing-account continuity on a second device. Old setup notes are not current live evidence. |
| Q10 | Phone notification acceptance | Verify actual iPhone Home Screen opt-in, due delivery, tap destination, opt-out and deduplication. Existing sender deployment alone is insufficient. |
| Q11 | Fantasy refresh | Existing rankings use a fixed Week 6 snapshot. Establish permitted refresh, source/time coverage, week alignment, stale and partial-failure behavior. Usage-analysis requirements from closed PR #147 are in [FANTASY_FOOTBALL.md](../docs/FANTASY_FOOTBALL.md#usage-tracker-requirements-queue-q11q14). Track 1 (D-57) merged in PR #198 and released October 23 as API v35 / Pages `78909363` ([release record](../docs/RELEASE_2026_10_23_FANTASY_TRACK1.md)); awaiting the first data refresh run. |
| Q12 | Fantasy profiles and usage | Extend existing details with available usage, actuals, recent/season comparisons and samples. Preserve distinction between observed production and statistical pace estimates. |
| Q13 | NFL player comparisons | Side-by-side player analysis with common scoring format and period; distinct from Q07's Guess-player score comparisons. |
| Q14 | Fantasy matchup tools | Extend basic opponent information with useful sourced matchup context. No unvalidated predictive advantage claims. Track 1 (D-57) merged in PR #198 and released October 23 as API v35 / Pages `78909363` ([release record](../docs/RELEASE_2026_10_23_FANTASY_TRACK1.md)); awaiting the first data refresh run. |
| Q15 | Trade-value charts | New requested scope: establish permitted free sources, league formats, attribution and timestamps. Different provider scales must not be silently combined. No source is connected by this task. |
| Q16 | Easier bet entry/tracking | Released and verified October 20: actual bets first, separate Virtual Units, button entry, explicit unknown terms, pending/settled and market filters. PR #155 merged, API v27 / Pages 9ef3f651 verified, all three integration checkouts clean/synced. October 21 follow-up connects reviewed recommendations to actual tickets and adds a grouped owner list; #159 merged, Pages dcfb977b verified with preserved data/API. Closeout PR #160 merged as 2e3e8fa and all three checkouts synced. Phone acceptance remains separate. |
| Q17 | Remaining native destinations | Use RETIRE-01's preservation/recovery checklist in [new-app retirement](new-app-retirement.md) (carried from closed PR #144) and the inventory: League/Bets screens, history, exports, commissioner tools and old records must retain working homes. |
| Q18 | Operations | Reconcile private/community slate handling, settlement, corrections/voids, scheduled jobs and failure monitoring. Clearly label manual operations until automation is verified. |
| Q19 | Device and full-week acceptance | Actual iPhone use, both market gates, real entries/results, history/privacy and relevant jobs over a full live week. Sean's visual acceptance is separate from fixture tests. |
| Q20 | New-app-only transition | Follow D-52 ([decision log](../docs/DECISIONS.md), [RETIRE-01–04](new-app-retirement.md)) after preservation, destinations, access and operator recovery are verified. Remove only unused screens/code; never player records. |

## Separate later scope

- Simulated NFL games: input/model validation, held-out evaluation, serving and acceptance remain; the historical aggregate baseline does not validate a player simulator.
- Native iPhone application: separate deliverable and scope/budget decision, not fulfilled by the mobile website.
- Additional notifications and outside feeds: reconcile requested channels, free-only permissions and actual delivery requirements.
- Private Fantasy league/roster integrations and expert projections (requirements in [FANTASY_FOOTBALL.md](../docs/FANTASY_FOOTBALL.md#usage-tracker-requirements-queue-q11q14)) need source/access decisions; existing static rankings do not provide them.
- Other user suggestions need their actual request recorded before entering this queue.

## Branch and local-work audit

Read-only audit of GitHub and local Git state on October 19. No branch was reset,
stashed, deleted or silently merged. Open PRs are source evidence, not hosted proof.

| Existing PR | Disposition |
| --- | --- |
| [Scoring release approval #142](https://github.com/seanbalz/guess-the-lines-repo/pull/142) | Superseded by applied/verified release #145 and permanent timing policy #151. Historical evidence retained in GitHub; no implementation merge needed. |
| [Mobile/retirement audit #144](https://github.com/seanbalz/guess-the-lines-repo/pull/144) | Closed October 21. D-52, RETIRE-01–04, UX-NEXT-01 and BETS-NEXT-01 and the dated audit were carried to main for Q03, Q04, Q17 and Q20. Its five-tab README/register notes were not carried. |
| [Fantasy usage requirements #147](https://github.com/seanbalz/guess-the-lines-repo/pull/147) | Closed October 21. Requirements carried to FANTASY_FOOTBALL.md for Q11–Q14. Documentation only; not an integration. |
| [Merged weather/Bets release #148](https://github.com/seanbalz/guess-the-lines-repo/pull/148) | Closed October 21 as obsolete. Weather is applied and core scoring is live. M-10 stays Q06 and needs a fresh preflight. Branch kept. |
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

Issues #1–#9 are broad historical scopes, not nine wholly unbuilt features.
Backend/scoring (#3) and independent Total (#7) are delivered at their core;
review residual original criteria before closure. Dashboard (#4) maps to Q03/Q17/Q19;
ingestion (#2) to collector/Q11/Q18; operations (#6) to Q02/Q09/Q10/Q18/Q19;
accounts (#8) to Q09 and verified provider setup; odds rights (#9) remain source-specific.
Starter audit (#1), native iOS (#5), visual acceptance (#126) and simulator (#128)
retain their distinct acceptance or future scope. No issue is closed merely from its title.
