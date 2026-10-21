# Guess The Line — recommended tickets and tracked list

Owner: Sean Balsiger · October 21, 2026

Status: implementation reviewed and local browser checks passed; exact-source
CI, merge, production deployment and three-machine synchronization are pending.

Recommended previously saved Virtual Units while My bets intentionally displayed
actual tracked tickets. The new **Track this bet** action opens the existing
ticket editor with the recommendation's exact selection, price, book, quote time
and week. The player confirms they placed the bet elsewhere before saving.
Stake and placement time remain unknown until entered. **Play with Virtual Units**
remains a separate action; existing virtual picks are not converted into tickets.

The owner list now uses grouped disclosure rows, following Sean's supplied visual
references: selection and matchup on the left, labelled status and units on the
right. Opening a row retains the original correction, result and history controls.
View selection is compact; result filters remain visible and market filters sit
in the existing filter disclosure. Summary metrics follow the ticket list.
The existing GTL theme tokens, shared audience and player-reported results remain.

## Release and rollback

Sean requested this repair and layout update within the authorized tested,
merged, deployed and three-machine-synchronized milestone. Target **frontend**
only through the protected shared workflow. Record the full merged source SHA,
exact-source push CI, readiness digest and release run before deployment.
No API, database migration, provider collection or production test ticket is needed.

Baseline production is Pages `ad10f1c1-6bc9-4bb9-ac11-e65fcdd07c9b`, source
`2d81436dc0f3bcbfd9c91b69c9049755eb8b4601`, with API v27 ACTIVE and JWT verification
enabled, bundle SHA-256
`8fe54bce2eed82a973674fc31188bba548d21ad758bdefe8689bd811af91e656`.
The existing API/social writer accepts the unchanged ticket request shape and
retains its idempotent request/receipt recovery. The account-bound handoff keeps
the chosen week even when the published week advances during review.

The October 21 preliminary hosted read found 45 migrations; M-10 and the two
D-53 migrations remain unhosted and outside this release. Recheck their history
digest in protected readiness. Immediately before/after deployment compare
social state/receipt, ballot, historical-score, private-group and Virtual Units
original-term hashes, social function bodies/grants and other worker versions.
Do not treat the preliminary snapshot as deployment preservation evidence.

Rollback restores Pages `ad10f1c1-6bc9-4bb9-ac11-e65fcdd07c9b` with API v27 retained.
Saved tickets remain compatible with that frontend. Never delete or convert
ticket, virtual-pick, correction or audit records to roll back this UI change.

## Local verification

- The new handoff regression failed before implementation and then passed. All
  20 Recommended/new-app Bets browser scenarios pass with a local PGlite database,
  covering reviewed save/reload, cancellation without writes, week rollover,
  lost-reply recovery without duplication, existing Virtual Units, ownership,
  filter races and sign-in recovery.
- Independent review found quote-time minute truncation in the shared editor.
  An exact-timestamp assertion reproduced it; the editor now preserves the
  original timestamp until the quote time is explicitly edited. Review of the
  final diff found no remaining actionable issues.
- Grouped lists were inspected at 320/390/1280 widths in light/dark; phone
  overflow, keyboard disclosure and Axe checks passed. Captures use synthetic
  fixtures, not private production ticket data.
- 41 focused Node checks, typecheck, UTF-8 Brand QA, production cloud build and
  bundle privacy scan passed. All five classic-browser regressions passed after
  building their required local assets. The full test suite is still running;
  final results will be recorded before merge.

Signed-in workflows are verified with local fixtures. Hosted asset, boundary and
permitted read checks follow deployment. Physical-phone and human visual
acceptance remain separate from automated browser evidence.
