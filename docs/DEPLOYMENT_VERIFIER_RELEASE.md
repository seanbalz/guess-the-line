# Guess The Line — shared deployment verifier

Owner: Sean Balsiger · October 20, 2026 · Version 1

Status: canonical-path fix tested locally; review, CI and protected release verification pending.

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
