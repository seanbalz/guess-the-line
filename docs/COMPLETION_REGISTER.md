# Guess The Line — current completion register

Owner: Sean Balsiger · Evidence reconciled October 19, 2026 (Pacific)

The [sequential platform queue](../planning/PLATFORM_WORK_QUEUE.md) is the current
itemized backlog. Work proceeds one item at a time. Q01 reconciles source, open PRs
and local work; Q02 is next after Q01 review/merge/sync. The earlier register is
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

| Work | Current state | Next action |
| --- | --- | --- |
| Q01 backlog reconciliation | Source audit complete; this PR records its results | Review, merge and sync this documentation change. Preserve the two dirty Mini worktrees identified in the queue. |
| Scheduled collector | Verification pending after activation | Existing October 20 01:15 Pacific run; actual collection/snapshot success, not just cron dispatch. Existing follow-up stays active. |
| Q02 deployment verifier | Existing fix on open PR #150 | Reconcile canonical redirects and current release records; verify protected workflow. |
| Q03–Q05 mobile/Bets/recommendations | Requirements and an implementation branch exist | Sequential navigation, filters, then recommendation refinement tasks. |
| Q06–Q08 Bets/comparisons/preferences | Merged readers/settings code; three migrations remain unhosted | Separate dependency-aware release/readback; no generic database push. |
| Q09–Q10 account/notification acceptance | Live components exist; real-world checks remain | Verify actual supported account/device flows and iPhone notification delivery. |
| Q11–Q15 Fantasy | Static rankings/basic details exist; refresh and richer analysis remain | Refresh, profiles/usage, comparisons, matchups and newly requested sourced trade values. |
| Q16–Q20 platform completion | Partial; see per-item exit criteria | Bet entry, remaining destinations, operations, full-week/device acceptance and new-only transition. |
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

Private-group week rollover and automatic final results supersede the next queue item at Sean's request. Implementation and release evidence: [weekly results release](WEEKLY_RESULTS_RELEASE.md). Local implementation underway; no production activation claimed yet.
