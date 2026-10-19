# Guess The Line — per-game scoring implementation

## Release timing policy - October 19, 2026

Sean explicitly instructed: "permanently remove the gated window". Deployments
and migration applies no longer wait for weekdays, quiet windows, kickoff
buffers, Sunday/Monday/Thursday freezes or daylight-saving date exclusions.
This supersedes older timing restrictions throughout the release documentation
and migration ledger. Migration dependencies and individual apply order remain
mandatory. Exact source/CI, fresh hosted evidence, data-preservation hashes,
permissions/privacy checks, compatibility, rollback readiness and verification
remain required. Player pick deadlines and locks are unchanged.


Owner: Codex implementation; Sean product and release approval
Date: October 15, 2026 · Status: local checks passed; ready for review, not deployed

## Scope

D-39/D-41/D-43/D-50: Spread and Total lock independently for each game. A lock
retains its guess, time and established scoring reference. Available points count
immediately for the owner; shared standings include the same started games for
every player. Pending references remain pending, not zero. A sit-out retains
previously locked guesses and their eligible points.

The implementation adds a shared per-game editor, durable scoring receipt and
weekly scoring destination with season/week, market, team and matchup filters.
The sit-out action retains locked scores and unsaved tab copies, with readback after
an uncertain response.
Filters label their subset and do not change official standings. The native
Trends page and its unanswered metric/audience decisions are a later checkpoint.

The new path requires the server capability `perGameScoring: true`, final picks
and a kickoff-based window. Existing deployments retain the current workflow.
A transient rules-read failure cannot restore legacy editing rights. Drafts and
uncertain save requests remain recoverable without claiming success prematurely.

## Implementation owners

| Area | Owner | Evidence |
| --- | --- | --- |
| Database writers, triggers, references and readers | Codex SQL lane | `20261015190710_gtl_guess_write_window.sql`, rollback and PGlite tests |
| API, feature gating, source separation and integration | Codex main lane | Live-rule/handler and boundary tests |
| Per-game entry, receipts and weekly scoring | Codex UI lane | Native and classic shared editor; scoring/filter and browser tests |
| Independent lock/privacy review and local engine | Codex review lane | Engine tests and adversarial SQL tests |

## Verification record

Local verification passed on October 15:

| Check | Result |
| --- | --- |
| `node --test --test-concurrency=3 tests/*.test.mjs` | 1,386 passed; zero failures, cancellations or skips. Includes migration apply/rollback, historical scoring, grants, competing revision/replay and privacy tests. |
| `npx vitest run` | 188 passed across 13 files. |
| `next-per-game-scoring.spec.js` | Four browser scenarios passed: independent locks/receipts/filters, lost lock success readback, classic post-Thursday full submission preserving closed drafts, and SQL-backed sit-out with lost response readback. |
| Classic Community compatibility extension | One targeted browser pass; the same gated editor works inside the classic Community at 320px. |
| Mobile and accessibility | 320/390px, dark/light, no horizontal overflow or axe violations on tested picks/score screens; captures visually inspected. |
| Typecheck and builds | `npm run typecheck`, standard build and authenticated cloud build passed. |
| Cloud bundle boundary | No private state, contacts, source files or server credentials found in the authenticated build. Dummy public configuration used for this local build. |
| Brand, SQL headers and diff | Brand/document QA passed; headers valid across 41 migrations; `git diff --check` clean. |
| Preserved source data | No changes under `data/`; snapshot check passed for three preserved snapshots, 15 games and historical 96.4/150 arithmetic. |

The browser runner used an isolated loopback port (5208) because another worktree
occupied the normal test port. Fixtures and captures are synthetic, not real new
competition entries. Local logs and screenshots are in `.local/per-game-*`.

These checks do not establish production placement, real multi-connection
PostgreSQL scheduling or physical-phone acceptance. PGlite serializes transactions.
The private prototype canvas was not accessible in this workstream; implementation
uses the approved D-38 repository tokens and components, pending Sean's review.

## Release sequence and held work

The migration is registered as **NOT_HOSTED**. No hosted writes, migration applies,
deployment, real pick submission or provider collection is part of this checkpoint.

1. Review the exact branch and checks, including hosted prerequisites and Sean’s visual acceptance. GitHub CI results remain separate from these local checks.
2. Preserve the existing M-02 gate: repair/verify fail-closed client/API behavior,
   then Sean's explicit “apply M-02” in its allowed quiet window. Week 6 edit rights
   must not be changed by a generic deployment.
3. Follow the dependency order for M-03/M-04/M-05/M-06/M-08; these remain separate
   unhosted capabilities. M-06 requires M-04. The M-07 migration also updates the
   M-06/M-08 readers, so those definitions are prerequisites, not optional extras.
4. Deploy compatible Pages/API before M-07. With M-07 still absent, confirm the
   existing full-market flow and references work. The new controls remain gated.
5. Apply M-07 alone in its approved Tuesday–Wednesday window only after explicit
   authorization, prior-body and historical-score checks, and tested rollback.
6. Verify service-only grants and exact function bodies, unchanged historical
   scores, reference resolution, next scheduled collection, permitted views and
   both app paths. Record the hosted version and release SHA.
7. Test real-device save/readback, independent markets, second-device conflicts,
   partial-week standings and phone layout. Do not create a real competition pick
   merely to obtain test evidence.

See [Gate M and Gate D](REDESIGN_BUILD_PLAN.md#4-gates). A generic database push,
merging a PR or passing local tests is not authorization to apply these changes.

## Known scope limits

The classic group dashboard still enriches current consensus and line-history data
only when the full market is revealed. Its per-game saved scoring receipts and
personal points are available. A later per-game market-reader change must filter
consensus, book quotes, source metadata and line history together; relaxing the
whole-market guard alone would expose hidden games. Peer-pick comparison remains
in the existing permitted feed/History destinations, not a new panel in this editor.

## Remaining product work

Player Trends metrics, comparison periods, sample thresholds and audience remain
in [the discovery queue](../planning/scoring-and-player-trends.md#targeted-discovery-queue).
Models, outside feeds, friend challenges and automatic settlement remain separate
items in the [completion register](COMPLETION_REGISTER.md).
