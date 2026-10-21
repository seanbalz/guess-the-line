# Guess The Line — shared deployment verifier

Owner: Sean Balsiger · October 20, 2026 · Version 1

Status: fix merged; protected source, readiness and production verification passed.
This evidence closeout receives its own PR, checks, merge and three-machine sync.

Sean requested: "Move on to the next item if this is complete. Make sure everything
is deployed in sync both locally and on the cloud. Make sure all merges are committed."
Q16 is complete: PRs #155/#156 merged, API v27 and Pages `9ef3f651` verified, and
the three integration checkouts synced cleanly to
`fd1facc7af1d1673b99dee0bd2f0228d6f63a0e6`. Q02 follows it.

## Reconciled defect

The October 16 [frontend workflow](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38973163044)
uploaded Pages but failed in verification. Current production reproduces the
cause: index.html redirects to /, privacy.html to /privacy, and terms.html to
/terms. The verifier used `redirect: 'error'` against the noncanonical paths.

The implementation/test hunks from PR #150 are reconciled with current main;
its stale migration registry, superseded API/scoring plans and old completion
claims are not imported. Canonical URLs are requested directly. Unexpected
redirects, changed bytes, wrong source, dirty builds and unrelated service or
migration changes still fail. The regression first failed at /index.html; all
11 preflight tests then passed, including both origins, nested index paths,
non-HTML assets, excluded configuration files, corrupt bytes and redirects.

## Protected release card

The target is frontend only, from exact existing main source
`2d81436dc0f3bcbfd9c91b69c9049755eb8b4601`. Its runtime tree is identical to the
already verified fd97d07 bet-tracking release. The repaired control script will
run from the newly merged workflow checkout. Require successful main-push CI on
the target source and required CI on the control fix before dispatch.

Use the existing production environment and dedicated credentials. Secret names
were confirmed present; values were not read or copied. The October 16
[readiness run](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38971438272)
and [API deployment](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38976955897)
succeeded; neither is fresh readiness for this release.

Run check-only, then protected readiness, review its fresh schedule/migration
digest, and deploy frontend only. The currently reviewed migration history is 45
entries, SHA-256 `37992acba8e8b546b34f57305e9a434525260da26d28e15c39952622acfebb5d`;
re-read and compare before deployment. M-10 and both D-53 migrations stay unhosted.
No SQL apply, API deploy, collector dispatch, budget change or app-default flip is
part of this item. API v27 is compatible with this exact frontend source.

Rollback is the verified Pages deployment
`9ef3f651-d82e-4805-bcb3-3b91e318cb29`; no player records are reverted or deleted.
Compare preserved ticket/ballot/score hashes, function permissions, unchanged
service versions, signed-out boundaries and permitted aggregate reads before and
after. Accept success only when the workflow's verifier passes all served assets
at both URLs. Record the actual run, Pages ID, digests and limits after completion,
then merge the evidence and sync the three clean integration checkouts.

Human signed-in and physical-phone acceptance remain separate. A failed historic
workflow is not relabeled successful because a later fix passes.

## Verified October 21, 2026 UTC (October 20 Pacific)

PR #157 passed all five required checks on
`4f317d0fab8a0efc8e27512607454c55b700572b` and merged at 00:23:28 UTC as
`85c5063b40864053ba9010a56fe599d95fc31868`, with an identical tree. Independent
review found no actionable findings. All 11 local preflight regressions passed.

- [Check-only 39521037481](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39521037481): passed.
- [Protected readiness 39521105364](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39521105364): passed; fresh evidence at 00:25:14 UTC.
- [Protected frontend release 39521335125](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39521335125): passed, including post-deploy verification at 00:28:26 UTC.

All three runs used control source `85c5063` and exact runtime source
`2d81436dc0f3bcbfd9c91b69c9049755eb8b4601`. Required production environment
reviews were approved under Sean's existing release authorization; protections
and credential values were not changed. The release verified 95 assets at both
[the deployment URL](https://ad10f1c1.guess-the-line.pages.dev) and
[production](https://guess-the-line.pages.dev). Pages ID:
`ad10f1c1-6bc9-4bb9-ac11-e65fcdd07c9b`.

Source digest remains
`45c5dfe86a9bbf099aa7b0a188c2a1238fe45864a85ae9c2de99b8d285a2e564`.
The clean Linux build used Node v22.23.3 and produced frontend digest
`c5c4ec5b11676c1e74a33bf687c1e690999a673bbbcc8cb17b67b4f81d027043`.
This is a newly built artifact, not the earlier Mac artifact: the shared workflow
uses the source's default enabled new-app offer, while the Mac build explicitly
set it to 1. Both leave the offer enabled; no default-app transition occurred.
The actual new artifact bytes, rather than the old digest, were verified live.

API v27 remains ACTIVE with JWT verification enabled and bundle digest
`8fe54bce2eed82a973674fc31188bba548d21ad758bdefe8689bd811af91e656`.
All five function versions and bundle hashes were identical before and after;
the earlier API source verification is in the bet-tracking record. This workflow
verified unchanged API metadata, not a new independent API source comparison.
Migration history remains 45 entries with the reviewed digest above. M-10 and
both D-53 migrations remain unhosted. Boundary checks covered 268 cases: 262
denied, with only the six documented pending-migration allowances.

Fresh SQL evidence at 00:24:54 and 00:28:42 UTC matched exactly apart from the
observation time: 38 social commits, 23 ballots, 135 Week 5 and 168 Week 6 score
rows, five groups, two Virtual Units original terms, and social function bodies,
grants and configuration. All nine permitted profile-read probes returned the
correct current week, single-week response, complete history and reveal gates.
These aggregate probes do not establish human signed-in or real-phone acceptance.
No migrations, API deployment, forced collection or test tickets were performed.

The old PR #150 verifier hunk is now superseded by #157; its other historical
claims were not merged. Final evidence PR merge and clean Windows/Mini/Neo sync
are recorded in this closeout PR's body after verification.
