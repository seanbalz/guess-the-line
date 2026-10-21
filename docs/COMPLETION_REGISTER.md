# Guess The Line — current completion register

Owner: Sean Balsiger · Evidence reconciled October 19, 2026 (Pacific)

The [sequential platform queue](../planning/PLATFORM_WORK_QUEUE.md) is the current
itemized backlog. Work proceeds one item at a time. Q01 reconciles source, open PRs
and local work; Q01 merged as PR #152; the authorized weekly-results repair takes priority before Q02. The earlier register is
preserved as an [archived snapshot](COMPLETION_REGISTER_ARCHIVE_2026_10_19.md),
not a current deployment ledger. The frozen v62 tracker is unchanged.

## Verified delivery

- Core per-game locking, immediate personal points, receipts and weekly score
  navigation were activated October 19. M-02, M-03, M-04, M-08, M-05, M-06 and M-07
  were applied individually and verified. Historical scores and all 23 ballots
  were preserved. See the [production release record](CORE_SCORING_PRODUCTION_RELEASE.md).
- Compatible Home/Fantasy Pages and API were retained: Pages `0933a030`, API v25,
  source `8942725746f199270d79fce562ac37cf92d64d69`; collector v4. D-47 weather
  scheduling was already applied. This is not a new frontend deployment claim.
- The scoring release PR #145 merged as `eb4e5e1a7f14a2a863e98ceed9e4744c11603393`
  after all five checks passed on `4736b4f2f6f521bf31c9d068792c5b5ec8a7e4d4`.
  Windows main, Mini shared-sync and Neo main were each verified clean at that
  merge with zero ahead/behind/changed files. This reconciliation will receive
  its own merge and sync evidence.
- PR #151 permanently removed release timing restrictions. Player deadlines,
  migration order, source/CI, fresh evidence, preservation and privacy remain.

## Current work and remaining boundaries

October 21 design review: Sean selected a simpler four-tab application,
**Home / Play / Bets / Research**, with League inside Play and Fantasy inside
Research, and equal emphasis on guessing/competition and actual-bet tracking.
He chose the third visual option, **One thing first**. The
[four-tab design specification](superpowers/specs/2026-10-21-four-tab-simplification-design.md)
records the selected direction, feature destinations and local preview evidence.
Sean approved the specification and explicitly authorized the build. PR #162,
branch `codex/four-tab-design`, implements the four roots, compact summaries,
retained editors and reversible detail routes. League is inside Play and Fantasy
inside Research; account/settings and old-app recovery remain accessible.
The [implementation plan](superpowers/plans/2026-10-21-four-tab-simplification.md)
records the work and verification. Read-only reconciliation of PR #144 and the
Mini's unpublished shell found its Fantasy navigation changes already represented
on main; no Mini files were changed.

Local verification on October 21: `npm run check` passed (1,456 Node tests with
zero skips, 198 Vitest tests, typecheck and production build). The legacy browser
suite passed 41/41, performance 4/4, and critical-path accessibility 7/7. Brand QA
and authenticated cloud-build boundary inspection passed. Focused browser coverage
checks four roots at 320/390 in both themes, exactly one primary root action,
fixed bottom navigation, nested/reloaded Back, restored scroll/focus, historical
week scope, draft cancellation, exact recommendation ticket terms and explicit
saves. The final corrected feature rerun passed 38/38; shell/router/token checks passed
45/45, with 19 shell browser checks plus four focused follow-up checks passing.
The plan records the earlier failures, corrections and verification scope; PR
#162 and the conversation handoff record exact-head CI and branch sync.

Sean subsequently authorized CI fixes, merge and deployment. The
[four-tab release record](RELEASE_FOUR_TAB_REDESIGN.md) tracks that frontend-only
release; its preparation checkpoint does not yet establish merge or deployment.
No migrations, live account edits or new data integrations are included.
Physical-iPhone/Home Screen acceptance and the separate native iOS
deliverable remain open. This entry does not close Q03/Q04/Q17 wholesale; the
existing sequential queue and preservation of unpublished Mini work still apply.

Sean selected easier actual-bet tracking (Q16) next on October 20, with Virtual
Units separate. Q16 is now deployed: API v27 and Pages `9ef3f651`, from reviewed
source `fd97d07273c5f586772006acea5cbf548ef50aa7`. PR #155 passed all five checks
and merged as `2d81436dc0f3bcbfd9c91b69c9049755eb8b4601`; all three integration
checkouts passed clean sync at that merge. See the
[easier bet tracking release card](EASIER_BET_TRACKING_RELEASE.md) for live asset,
privacy, preservation and acceptance limits. Its evidence PR carries the final
documentation merge/sync result. PR #156 merged as
`fd1facc7af1d1673b99dee0bd2f0228d6f63a0e6`; all three checkouts then synced cleanly.
Q02's fix merged in PR #157 and protected frontend release 39521335125 passed;
that release deployed Pages `ad10f1c1`, retaining API v27. It is superseded by
the October 21 deployment below. See the
[verifier repair record](DEPLOYMENT_VERIFIER_RELEASE.md); its evidence PR records
final merge/sync. Sean reported the Recommended-to-tracked-bets gap on October 21
and supplied a grouped-list design direction. This Q16 follow-up takes priority
before Q03; see the [recommendation tracking release card](RECOMMENDED_TRACKING_RELEASE.md).
PR #159 merged as `368f5d46cd036d74f9dc5c32cf572dd702d320b2` and protected frontend
release 39652280151 verified Pages `dcfb977b`, with API v27 and all data hashes
unchanged. All three integration checkouts passed clean sync at that runtime
commit. Closeout CI/merge and the final documentation sync are pending at this
evidence-submission checkpoint; the closeout PR body will record their results;
Q03 remains the next queued item.
The weekly-results evidence PR #154 passed all five checks, merged as
`eb1fa9330d715140f8e343a24daf51908ace5ba6`, and was verified clean/synced on Windows,
Mini shared-sync and Neo main. Other unpublished Mini worktrees were preserved.

| Work | Current state | Next action |
| --- | --- | --- |
| Q01 backlog reconciliation | PR #152 merged as 97c08b987a26918b74db23138cf0793f70eba6d8; three clean integration checkouts verified at that commit | Complete. Preserve the two dirty Mini worktrees identified in the queue. |
| Scheduled collector | October 20 20:15 UTC cron, worker, collection and Week 7 snapshot succeeded | Verified; see the core scoring release record. No forced provider collection. |
| Q02 deployment verifier | PR #157 merged; protected source, readiness and frontend deploy/verification passed; 95 assets checked at both URLs | Evidence PR merge/sync recorded in its body; physical-phone acceptance remains separate. |
| Q03–Q05 mobile/Bets/recommendations | Requirements and an implementation branch exist | Sequential navigation, filters, then recommendation refinement tasks. |
| Q06–Q08 Bets/comparisons/preferences | Merged readers/settings code; three migrations remain unhosted | Separate dependency-aware release/readback; no generic database push. |
| Q09–Q10 account/notification acceptance | Live components exist; real-world checks remain | Verify actual supported account/device flows and iPhone notification delivery. |
| Q11–Q15 Fantasy | Static rankings/basic details exist; refresh and richer analysis remain | Refresh, profiles/usage, comparisons, matchups and newly requested sourced trade values. |
| Q16 easier actual-bet tracking | PRs #155/#156 merged and three integration checkouts synced; API v27 retained, same source rebuilt as Pages ad10f1c1 by Q02 | October 21 follow-up merged in #159 and deployed as Pages dcfb977b; closeout CI/merge and final documentation sync pending; results will be recorded in its PR body. Physical-phone acceptance remains separate. |
| Q17–Q20 platform completion | Partial; see per-item exit criteria | Remaining destinations, operations, full-week/device acceptance and new-only transition. |
| Simulator/native iOS/other feeds | Separate later scope or decisions | No model validation, native-client or external-connection claim follows from existing planning. |

The current migration registry lists only M-10 Bets reading and D-53 comparisons
and account preferences as unhosted. The recommendation edit writer is on an
open branch, so it is an additional future release, not an omission from main's registry.

## Evidence and limits

The queue records all six open PR dispositions, old issue triage and local-work
findings. Superseded scoring approval does not require another implementation
merge. Useful pending code and requirements remain preserved in their branches.
The audit inspected GitHub and Git worktrees on Windows, Mini and Neo; it did not
inspect every cloud sandbox, ignored file, credential or private Status Board.
Two Mini worktrees contain unpublished changes; clean integration checkouts do
not imply that all task work is published.

Sean's phone/visual acceptance and a full live week remain distinct from CI and
read-only production checks. No real test pick, extra provider collection,
production mutation or old-app retirement is performed by this reconciliation.

## Active priority — October 20, 2026

Private-group week rollover and automatic final results supersede the next queue item at Sean's request. Implementation and release evidence: [weekly results release](WEEKLY_RESULTS_RELEASE.md). PR #153 merged; API v26, three ordered migrations and results worker v1 activated. All five groups resolve to Week 7; the first scheduled run recorded 29 finals and settled two existing bets. Historical ballots, Guess scores and saved terms are unchanged. Windows main, Mini shared-sync and Neo main were verified clean at the release merge f9b89664dd15261bec454fa2378fc7f55ff4fcbd. This closeout records hosted evidence; its PR carries the subsequent evidence-merge and sync outcome.
