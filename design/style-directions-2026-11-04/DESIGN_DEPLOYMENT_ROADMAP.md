# Design update to production — November 7, 2026

**After settling the current scorecard, five workstreams remain.** This is a
planning grouping, not five small fixes or a verified exhaustive issue count.
The larger remaining effort is implementation: selected styling is mainly in
review assets, not the native production token/component system. This is not
the historical 81-stage redesign backlog or a request to restart approvals.

| Workstream | Required result and evidence |
|---|---|
| 1. Production design implementation | Reconcile freshly fetched main in an owned task worktree; integrate the approved themes, typography, glass, icons, circles and context-aware scorecard/labels into reusable native components across the app. Update native tokens and `design/tokens-next.json` together. Preserve prior scoped approvals; review changed placements with phone-readable visuals. Do not ship fixture payloads, iframe viewers or DOM preview adapters. |
| 2. Actual data and interaction integration | Connect the approved presentations to real charts, history, controllers and persistence. Verify unit quick minimum 0.5U, Custom including smaller positive units and 0.1U taps against server limits; sportsbook manual catalog; shareable app invite; typed team identity and mode-specific scorecards. Preserve saved inputs, locks, reveal/privacy gates, permissions, fresh source provenance and free-only limits. Do not infer a source connection from a catalog label or invent data to fill cards. |
| 3. Regression and CI reconciliation | Check both themes, responsive layout, accessibility, focus/touch, reduced motion and performance. Run change-appropriate native tests, token parity, Brand QA and required CI on exact integrated source; investigate and resolve failures. Retain existing rules/data/source tests. |
| 4. Release-candidate phone acceptance | Review the actual integrated candidate in both themes on Sean's phone/Home Screen app with real account access. Preserve navigation acceptance unless an issue is reported; focus checks on changed rendering, data and save/recovery behavior. Mockup screenshots do not establish physical-device or actual-account acceptance. |
| 5. Approved release and hosted verification | Review/merge the implementation, verify successful main-push CI on the exact release SHA, prepare release card/compatibility/rollback evidence and protected fresh hosted readiness. Use the manual release workflow and production environment approval. Verify the deployed SHA, hosted behavior, source/privacy and preserved data; record release evidence. |

Steps may overlap where independent; release follows completed source, testing
and acceptance evidence. No date estimate or automatic deployment authorization
is inferred from a design approval. New avatars/profile pictures and awards
remain held; NBA is parked. They are not prerequisites for this design release.

## Current evidence and limitations

- The [selected-design handoff](SELECTED_DESIGN_HANDOFF.md) records approved
  recipes; the [scorecard](PICK_SCORECARD_REVIEW.md) is the current visual review.
- `web/src/next/styles/tokens.css` still uses Big Shoulders Display, Barlow
  Condensed and Figtree; the selected system stack has not been ported there.
  Production integration and real-account acceptance remain unestablished.
- At this audit, main was `7604cee25f4182d7c5262217c05f20d84b2994e3` and its
  latest two Tests runs were successful:
  [42267042337](https://github.com/seanbalz/guess-the-line/actions/runs/42267042337)
  and [42087783954](https://github.com/seanbalz/guess-the-line/actions/runs/42087783954).
- Draft PR #488 at `f9feb83c4c305e910ccf260c7a768cebd9bcdabc` had five failing
  EPL timing/order tests across `tests/epl-migration-sql.test.mjs` and
  `tests/epl-order-corrections-sql.test.mjs`, in two failed test shards. Other
  recorded checks included successful Brand QA, Windows portability, four
  browser shards and personas. Root cause is not established; neither a design
  regression nor an upstream failure is inferred. This snapshot is not a
  claim about later commits. Exact integrated/release source must pass.
- The branch contained main with 119 additional commits at the start of this
  scorecard turn. It was not behind main. A large mockup branch is not a
  production implementation or deployment record.

## Release authority

[Repository synchronization](../../docs/REPOSITORY_SYNC.md) requires separate
owned task work, reviewed named commits, push, PR and post-push sync evidence.
[Shared deployment](../../docs/SHARED_DEPLOYMENT.md) and
[the release workflow](../../.github/workflows/release.yml) require exact main
source/CI, production approval, fresh readiness, migration-history digest,
compatibility and rollback evidence. Select frontend-only unless reviewed
implementation requires a compatible API release. Migration application is
separate and never automatic; do not reapply previously applied migrations.
Preservation hashes and permission/privacy checks still apply. The October 19
removal of timing windows remains in force; old weekday/quiet-window freezes
must not be reintroduced. Player deadlines and locks are unchanged.
