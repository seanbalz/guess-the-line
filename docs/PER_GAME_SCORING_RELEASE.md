# Guess The Line — per-game scoring implementation

Owner: Codex implementation; Sean product and release approval
Date: October 15, 2026 · Status: merged; release authorized; not deployed

## Approval and synchronization checkpoint

Sean approved the completed work on October 15: **“Full approvals granted, do not
fail to sync everything.”** This authorizes the merge, compatible frontend/API
release and required scoring migrations. Approval is recorded here and does not
need to be requested again. The existing Week 6 editing commitment and release
windows remain a separate timing decision; a one-time exception was asked but
has not been received at this checkpoint.

[PR #141](https://github.com/seanbalz/guess-the-lines-repo/pull/141) merged at
20:31:56 UTC as `bb4f20a095de61ac283b62cfee819d533470fa39`, after all five checks
passed on head `3de13a4eb38a5fe14c001df28528d48c1f451bf2`. Evidence:
[Tests](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38798802353),
[Dashboard and personas](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38798802389),
[Brand QA](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38798802354).
The task branch was fast-forwarded to the merge and pushed; `sync:check` reported
matching local/remote SHAs, zero ahead/behind and no changed files. Merged-main
push CI must also pass before release. Other active checkouts and ignored private
data are not covered by this branch's sync result.

A fresh hosted SELECT at 20:30:51 UTC confirmed 14 Week 6 games and Thursday's
5:15 PM Pacific kickoff. All seven M-02/03/04/05/06/08/07 migrations are absent;
live rules remain `{sentFinal:false, lateWindow:"deadline", revealAt:"kickoff"}`.
The shared release guard rejects the active Thursday window. Its six-hour game
buffer also rejects 6:16 PM Pacific; 11:16 PM passes against this snapshot only,
subject to a new live check. M-02 additionally retains its Friday–Saturday window;
M-05/M-06/M-07 retain Tuesday–Wednesday. No automatic future execution was created.

The project's scoped Cloudflare login was verified against the correct account
with Pages write permission; the global login is a different scope. Supabase's
pinned CLI can perform the required read-only queries. GitHub's production
environment still has no deployment secrets, so the shared Actions deployment
path is not credential-ready. Existing local logins must not be copied into
GitHub secrets. No deployment or migration apply occurred in this checkpoint.

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
| Full cloud-browser suite | 250 passed, zero failures or skips. The historical stage-18 selector then passed its targeted rerun; migration-registry checks passed 6/6. |
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

1. Use the exact integrated source and its successful merged-main checks, including hosted prerequisites. Product/phone acceptance remains separate from release authorization.
2. Preserve the existing M-02 gate: repair/verify fail-closed client/API behavior,
   then apply under the approval above in its allowed quiet window. Week 6 edit
   rights must not be changed without the explicit timing exception.
3. Apply individually in dependency order: **M-02 → M-03 → M-04 → M-08 → M-05 →
   M-06 → M-07**. These remain unhosted capabilities. M-06 requires M-04;
   M-07 replaces the M-06/M-08 readers and also requires M-03. Capture and verify
   function/grant and historical-score evidence around every apply.
4. Deploy compatible Pages, then API before activating M-07. Deploy the compatible
   collector adapter before M-05. With M-07 still absent, confirm the
   existing full-market flow and references work. The new controls remain gated.
5. Apply M-07 alone in its approved Tuesday–Wednesday window under the recorded
   authorization, after prior-body and historical-score checks and tested rollback.
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
