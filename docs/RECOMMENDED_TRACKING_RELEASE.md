# Guess The Line — recommended tickets and tracked list

Owner: Sean Balsiger · October 21, 2026

Status: released and verified October 21, 2026; implementation merged in PR #159.
This evidence closeout has its own PR, which records final merge and three-machine sync.

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
  building their required local assets. The final full local run passed all
  1,452 Node tests and 198 component/engine tests, with zero skips. Its first run
  caught the app import-boundary guard: the shared tracker now receives its optional row
  component from Bets instead of importing the new app. All 12 architecture
  checks pass, with no exception added to the guard.

Signed-in workflows are verified with local fixtures. Hosted asset, boundary and
permitted read checks passed; their evidence is recorded below. Physical-phone and human visual
acceptance remain separate from automated browser evidence.


## Reviewed source

[PR #159](https://github.com/seanbalz/guess-the-lines-repo/pull/159) merged at
2026-10-21 17:47:41 UTC as `368f5d46cd036d74f9dc5c32cf572dd702d320b2`.
Its tree `6dcc8d3c2fee191531308deba946e2598eef836f` exactly matches reviewed head
`db3610b3f36b582e9f3f1fa23f49fe152a8c63d0`. All five PR checks passed:
[Tests](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39642640009),
[Dashboard checks](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39642639997)
(27m10s and Persona suite), and
[Brand QA](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39642639999).
The final 20-scenario local browser rerun also passed after the dependency fix.

The API, migration and shared server directories are unchanged from deployed
source `2d81436dc0f3bcbfd9c91b69c9049755eb8b4601`. Exact merged-source main-push CI
and protected release results are recorded below.


## October 21 production evidence

Main-push [Tests](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39646955461),
[Dashboard checks](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39646955517)
(31m56s plus Persona suite) and
[Brand QA](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39646955512)
all passed for the exact merged source above. The protected workflow used that
same source for its control and runtime checkouts:

- [Source check 39651822353](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39651822353): passed.
- [Readiness 39651915646](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39651915646): passed, with fresh hosted evidence at 18:22:03 UTC.
- [Frontend release 39652280151](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39652280151): passed, with live verification at 2026-10-21T18:25:33.417Z.

The production environment reviews used Sean's existing release authorization;
protections and credential values were unchanged. Readiness confirmed the
expected prior Pages source and all component versions before deployment.

| Artifact | Verified value |
| --- | --- |
| Pages ID | `dcfb977b-c388-4706-b728-d0c11e356228` |
| Exact source | `368f5d46cd036d74f9dc5c32cf572dd702d320b2` |
| Source manifest SHA-256 | `0692d5b1d89b24fcda4761df795af4f07855f5501eb54303003f8549ac0d9d66` |
| Frontend manifest SHA-256 | `1bed48f07ad6df75f61d76dd7e3fa41ac0ff55809c8e476a04f1bde7e008b569` |
| Build runtime | Node v22.23.3, clean Linux checkout |
| Retained API | v27 ACTIVE, JWT verification true |
| Retained API bundle SHA-256 | `8fe54bce2eed82a973674fc31188bba548d21ad758bdefe8689bd811af91e656` |

All 95 served assets matched their hashes at both
[the immutable deployment](https://dcfb977b.guess-the-line.pages.dev) and
[production](https://guess-the-line.pages.dev). Configuration files are not counted
as served assets. This includes canonical HTML paths and rejects unexpected redirects.
The API and all other workers retained identical versions/configuration/hashes:
odds v4, week-open v3, push v2 and results v1. The workflow did not independently
match API source bytes again; prior v27 source verification remains in the
[easier bet tracking release](EASIER_BET_TRACKING_RELEASE.md).

Migration history remains 45 entries with SHA-256
`37992acba8e8b546b34f57305e9a434525260da26d28e15c39952622acfebb5d`.
M-10 and both D-53 migrations remain unhosted. Published Week 7 schedule evidence
validated with time restrictions disabled. Before/after boundary runs each checked
268 probes: 262 denials and only the six existing pending-migration allowances.
No allowance was added or removed.

Fresh SQL snapshots at 2026-10-21 18:23:00.078756+00 and 2026-10-21 18:25:29.938801+00 matched exactly
apart from observation time:

| Preserved data | Count | Unchanged ordered-row MD5 |
| --- | --- | --- |
| Social week state, including ticket history | 2 | `de052fa229d4fce027f3bb6bd480c0c3` |
| Social commit receipts | 39 | `20c1f111d2a258cdf1dc570f350d0bc3` |
| Ballots | 23 | `a45bf0bf9c59e4543407f544e86d6987` |
| Week 5 Guess score rows | 135 | `f641f11becc1748f7daf321fac8b5d38` |
| Week 6 Guess score rows | 168 | `c2a4fc18a2d80c204e6b086f7b23987a` |
| Private groups | 5 | `a1f06fa4c7aadced4df70a33d57437fb` |
| Virtual Units original terms/timestamps | 7 | `42449e40a990a59ac9c3f538a5584f61` |

Social read/commit/follow function bodies, configuration and service-only grants
were unchanged: security invoker, empty search path, postgres/service-role execute
only. Aggregate permitted reads for all nine profiles returned the correct current
week, one current-week response, complete published-week history and gate metadata.
These aggregate SQL probes are not human signed-in or physical-phone acceptance.
No synthetic production ticket, pick, forced provider collection, migration or
API deployment was performed. Existing Virtual Units picks were not converted.

## Evidence closeout and synchronization

Windows `C:/Users/sbals/betting-repo`, Mini
`/Users/seanbalsiger/.codex/worktrees/shared-sync/betting-repo`, and Neo
`/Users/seanbalsiger/betting-repo` each passed sync:pull and sync:check at
`368f5d46cd036d74f9dc5c32cf572dd702d320b2`, with zero ahead/behind/changed files.
The integration checkouts therefore match the deployed runtime source.

This record, the completion register and queue are reviewed together in a fresh
branch from merged main. At this evidence-submission checkpoint, closeout CI/merge and final documentation
sync are pending. The evidence PR body will record those results after verification
on Windows main, Mini shared-sync and Neo main.
Other worktrees, including the two documented unpublished Mini checkouts, are
preserved. Documentation-only closeout changes do not alter the deployed runtime
and do not require another frontend deployment.
