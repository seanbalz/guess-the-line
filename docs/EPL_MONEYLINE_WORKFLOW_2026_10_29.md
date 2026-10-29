# EPL moneyline workflow evidence — October 29, 2026

Scope: carry the unpublished moneyline source into an isolated task branch, reconcile it with current main, repair the
check-job compatibility gap and verify the safe implementation. This record distinguishes source work from the live
draw-no-bet gate. It does not authorize or record a hosted migration, deployment, enabled schedule or provider request.

| Item | Verified state | Remaining exit criterion |
| --- | --- | --- |
| Plan 3 Task 0, server-side DNB check | Source implemented and tested with fake provider responses. Checks at most three upcoming fixtures; requires at least 60 remaining credits, reserves the request cost through M-30 and preserves the shared 50-credit reserve. Counts distinct events only, rejects mismatched clubs/kickoffs, three-way and invalid prices. | Release the exact green worker source, apply M-32 through the normal migration process, separately create the disabled schedule and authorize its enablement; record a real check result. |
| Task 0, live market verdict | **No verdict found**, not a market failure. Coordinator's fresh hosted readback at `2026-10-29T15:12:19.435092Z` found no `dnb-check` run in the preceding seven days and only the five existing enabled EPL jobs. Hosted schedule constraint still excludes `dnb-check`. | At least two distinct events in that season/week each have two qualifying books among DraftKings, FanDuel and BetMGM in a succeeded check. A later skipped check does not close a week already opened by valid evidence. |
| Task 1, pure moneyline rules | Implemented and locally tested: even odds, normalized distance, symmetric median and average-distance ranking with match-count ties. | No separate hosted effect; use these rules in the remaining collector/API/UI work after the gate. |
| Task 2, M-32 schema and RPCs | Source implemented, executed on PGlite, listed in `NOT_HOSTED`. Private draft/final guesses, append-only history, stored/first-after references, gated board and leaderboard. | Exact-source CI/review, migration preflight/apply and hosted preservation/grant/function readback. |
| Task 2, job compatibility repair | M-32 now widens the existing schedule job check to admit `dnb-check`. Executed SQL test proves no row is created by migration, disabled dispatch posts nothing and the existing private claim/completion path supports the new job. | Same M-32 apply/readback. No schedule is enabled by this source. |
| Task 3, API routes and lock refresh | Not implemented. | Passing live gate, service-only routing, trusted server clock, draft-preserving errors and shared quota-limited refresh. |
| Task 4, regular DNB collector | Not implemented; the gate reader is available as a source adapter. | Passing live gate, collection limits, qualifying book median storage and atomic first-after resolution so a later price cannot replace the first eligible reference. |
| Task 5, Play/leaderboard UI | Not implemented; existing placeholder stays. | Passing live gate, API/collector delivery, token-based screens and meaningful browser/device acceptance. Until eligible, show “Moneyline guessing isn't available this week.” |
| Task 6, product/release docs | Plan implementation checkboxes reconciled here; full release/rules evidence remains open. | Document actual deployed behavior and first live gate result rather than marking source as live. |

The same coordinator readback reported 14 EPL tables with RLS and browser access denied, all 26 existing M-30/M-31
function hashes matching main, no failed EPL runs in the preceding seven days and an unpaused budget of 407 credits.
M-32's guess tables/functions are absent from that hosted schema. These are coordinator read-only observations, not
observations from this lane's local tests. This lane made no provider request and spent no credits.
An additional coordinator readback at `2026-10-29T15:13:11Z` confirmed zero `dnb-check` runs across all recorded history,
with only the five original job names admitted by the hosted schedule constraint.

## Local verification

- `node --test tests/epl-*.test.mjs tests/migrations.test.mjs tests/rollback.test.mjs`: 260 passed, zero skipped.
- `node --test tests/epl-dnb.test.mjs tests/epl-moneyline.test.mjs tests/epl-moneyline-sql.test.mjs tests/migrations.test.mjs`
  after the kickoff-match guard: 47 passed, zero skipped.
- `npm run typecheck` and `python3 scripts/check-brand-docs.py`: passed.
- `npm run build:cloud` and `npm run check:cloud -- --bundle-only`: passed; server sources, private state and credentials
  are absent from the public bundle. Vite's existing large-chunk warning remains.
- Full live `check:cloud` was not completed: this isolated checkout has no `.env.cloud`. Hosted checks remain the separate
  coordinator/release process; no credentials were copied from another checkout.

## Integration and preservation

Branch `codex/epl-moneyline-workflow` starts from the preserved moneyline source at
`b591502215e39fb49d6179acf17dd686dec3a9b3` and merges main at `76329b7f2c57bdb2a2710ab5a90817c3318f75da`.
The migration ledger keeps M-31 applied and M-32 pending. M-32 is fix-forward because it widens a job constraint:
disable the new schedule and stop calling its routes if needed; preserve run evidence, guesses and history. No narrower
constraint is restored over a saved `dnb-check` row. The existing worker can continue handling its five original jobs.

The other owner's moneyline checkout and untracked `data/epl/` were left untouched. Global completion and queue
registers are coordinated separately; this record provides the evidence and dependencies for their update.

## Combined operations source

Integrated PR #366's source so the rollover validation and operational preflight can coexist with pending M-32.
The operational generator defaults to `HOSTED` from the canonical migration ledger: missing moneyline functions are
not treated as deployed-source drift while M-32 is pending. `node scripts/epl-operations-preflight.mjs --all-source`
explicitly prints a readiness query that includes pending source and labels its result `all-source`. Tests execute both
scopes against a database built from `HOSTED`, proving that the missing moneyline function is reported only by readiness.
This changes source expectations only; neither mode executes SQL or connects to a provider.
Combined verification: 264 EPL/migration/rollback tests passed with zero skips; the focused rollover/DNB/preflight
suite passed 55 tests, and typecheck, Brand QA and diff checks passed.

## Hosted apply addendum — October 29, 16:24 UTC

This supersedes the pending M-32 and worker-release statuses in the preparation evidence above. The
[frontend/worker release](RELEASE_2026_10_29_NBA_EPL.md) is verified, including `gtl-epl-jobs` v2. Sean then
explicitly approved “Apply M-32”; the [apply record](RELEASE_2026_10_29_M32.md) verifies hosted version
`20261029162422`, six exact private functions, two empty private tables, all prior EPL bodies and protected
record/scoring hashes preserved. The canonical migration ledger now marks M-32 applied. Strict live boundary
verification denied all 393 probes. No DNB schedule, cron, provider run or market verdict was created.
Tasks 3–5 and the separate DNB enablement gate remain open.
