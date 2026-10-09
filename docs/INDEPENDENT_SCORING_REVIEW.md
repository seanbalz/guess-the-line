# Guess The Line — independent scoring review

Version 2 · October 8, 2026 · Owner: independent review and Git checkpoint session

Initial review scope: D-16 scoring, the fresh-submission service, per-market reveal, selected-group privacy, and integration readiness. The initial review changed no feature files, migrations, existing tests, real player records, or hosted services. Reproductions use synthetic inputs and disposable local databases. The subsequent user-authorized Git checkpoint coordinates fixes with the feature owners and reruns affected checks before committing. The original reproduction evidence below describes its recorded source versions.

User priority update after review: this is a casual game among friends. The user explicitly deprioritized strict timing safeguards and said practical windows around kickoff are acceptable. R2 is therefore nonblocking and needs no further hardening work. Focus follow-up on visible correctness: saved scores, player comparisons, and reliably displayed consensus. The user discussed fifteen-minute windows and possibly an hour; this review does not turn those examples into a new, precisely specified lock or quote-freshness policy.

## Findings and disposition

| ID | Priority / state | Affected area | Evidence | Exit condition |
| --- | --- | --- | --- | --- |
| R1 | Resolved locally | Fresh collection and consensus projection | Collector now rejects future fetch/capture timestamps before recording a successful snapshot. | Fresh-submission SQL regression and handler checks pass; hosted deployment remains separate. |
| R2 | Nonblocking / user deprioritized | Solo draft save | A wait at the weekly-version lock can carry an unsubmitted draft slightly past deadline. Submitted scoring remains protected. | No further work required for this casual-game scope. A candidate fix is retained only as optional reference. |
| R3 | Resolved locally | Existing cloud API test | Fixture includes the submission check; the race permits either revision winner and still proves incomplete drafts cannot erase a submitted ballot. | Existing API tests pass in the coordinated checkpoint. |

The user subsequently authorized cross-session coordination and committing/syncing ready changes. The sportsbook owner resolved R1 and R3. The tiny R2 edge case remains deliberately nonblocking.

### R1 — accepted snapshot can disappear from current consensus

Checkpoint resolution: the collector now rejects future `fetchedAt` and `collectedAt` values against the database timestamp. This prevents successful storage of the permanently rejected envelope without changing the reader's scoring chronology. The existing-file SQL, API and handler rerun passed 53 checks with no skips. Original reproduction follows for provenance; its old source hashes are not the fixed implementation.

`supabase/migrations/20261008232055_gtl_fresh_submission_odds.sql:295` accepts a quote capture up to five seconds ahead of the database clock. Line 303 stores the database timestamp as `created_at`. `cloud/market-view.mjs:10-12` rejects a snapshot whenever its payload `fetchedAt` is later than that stored timestamp, even after both timestamps are in the past. The source-breakdown reader also enforces this ordering.

The disposable SQL reproduction finished a valid collection with capture time `23:27:14.959Z` and stored time `23:27:12.961Z`. At simulated read time `23:27:24.959Z`, the source was available to the SQL scoring-reference helper, while `currentConsensus.status` remained `unavailable`. The collection itself reported success. This affects consensus visibility; the reproduction did not establish an incorrect awarded score.

Relevant source hashes: fresh-submission migration `8d2cfba64d825d8006a3f9f8921c38a33c9febf5510fde87340e04f281726209`; market projection `52ba271d91986226d772371a08a9b76f9419e11bf951b23bd6a462b5c6b2bffe`.

Reproduction: [clock probe](../.local/independent-scoring-review/local/review-20261008-clock.mjs), [result with hashes](../.local/independent-scoring-review/local/review-20261008-clock-result.json).

### R2 — minor late-draft edge case; user deprioritized

`supabase/migrations/20261008224444_gtl_personal_workspace.sql:131` captures `stamp` before the weekly-version insertion and lock at lines 171–172. Line 176 compares that earlier timestamp against the deadline. The fresh-submission trigger returns early for drafts at `20261008232055_gtl_fresh_submission_odds.sql:150-152`, before its current-time deadline check.

A synthetic 400ms delay at the weekly-version insertion accepted an unsubmitted draft about 253ms after deadline, advancing both revisions and creating its receipt. This simulates execution delay at the lock point; it is not a two-connection hosted concurrency test. Submitted ballots remained protected and did not reveal or score late guesses.

The minimal candidate repair was verified only in the disposable database: refresh `stamp:=clock_timestamp()` immediately after acquiring the weekly-version lock. The same probe then rejected with `GTL_PREDICTION_CLOSED` and preserved the ballot, audit, receipt, and both revisions. No repository migration was changed.

Personal-workspace source hash: `a7b2b61b2493a5c3ecb8c743e27ad1cff4b959c816b817bd645c036acaaee841`.

Reproduction: [SQL audit](../.local/independent-scoring-review/sql/audit.mjs), [execution log](../.local/independent-scoring-review/sql/audit.log), [detailed SQL finding](../.local/independent-scoring-review/sql/findings.md).

### R3 — existing race assertion needs the new preflight dependency

Checkpoint resolution: the active owner applied the ready-preflight fixture and order-independent race assertion to the repository test. Its 22 API tests pass as part of the 53-check submission rerun. Original diagnostic runs follow for provenance.

The first targeted run had three failures in `tests/cloud-api.test.mjs`: the fixture omitted `odds.rpc`, so submissions correctly returned 503. Another session added the ready-preflight fixture during this review. The final existing-file rerun passed 21 of 22 tests; the remaining race assertion expected statuses `[200,409]` but received `[409,200]`. Both outcomes correctly allow only one writer for the shared revision.

A separate scratch copy adds the preflight fixture, permits either winner, retries the full submission if the draft won, and then verifies that an incomplete draft cannot erase the submitted ballot. All 22 checks pass in that copy. The scratch result does not mark the existing repository test green.

Evidence: [existing-file final log](../.local/independent-scoring-review/cloud-api-final.log), [candidate fixture copy](../.local/independent-scoring-review/cloud-api-ready-fixture.test.mjs), [candidate log](../.local/independent-scoring-review/cloud-api-ready-fixture.log).

## Verified invariants and bounded results

- Edits refresh only numerically changed guesses. No-op saves preserve all saved references; the first submission time remains intact. Later line movement does not alter anchored points.
- Spread and Total reveal gates remain independent. Hidden drafts, other players' audit/provenance, and unrelated-market quote fields stayed out of the tested API views. Export remained owner-only; an unavailable quote service did not hide saved points or leak internal error text.
- Solo and groups reuse one canonical weekly ballot. Stale revisions reject; missing or stale required references roll back the ballot, audit, receipt, and both relevant revisions.
- Saved book receipts survive eviction from recent snapshot history. The initially observed projection gap was corrected concurrently, then independently retested with invalid and extra quote fields excluded.

| Evidence | Result | Scope |
| --- | --- | --- |
| Initial targeted repository tests | 115 passed, 3 failed, 0 skipped | Nine files covering API, weekly identity, market views, personal workspace, scoring and fresh submission. Initial fixture failures described above. |
| Final fresh-submission SQL rerun | 14 passed, 0 failed, 0 skipped | Latest migration after its concurrent changes. |
| Sportsbook-source and source-UI tests | 14 passed, 0 failed, 0 skipped | Source projection and UI model behavior. |
| Independent API privacy probes | 5 passed, 0 failed, 0 skipped | Fully synthetic authenticated handler and market projection; no real state loaded. |
| Independent combined SQL audit | 13 baseline checks passed; one candidate-repair check passed | Disposable PGlite; R2 reproduced separately on unpatched source. |
| Existing cloud API final rerun | 21 passed, 1 failed, 0 skipped | R3 remains in the shared test file at the time of review. |

Logs and probes are in [the local review directory](../.local/independent-scoring-review/). That directory is ignored by Git and remains a local evidence artifact. Counts above overlap and must not be summed into a unique suite total. No full browser suite or live deployment check was performed in this review.

## Git and delivery boundary

At the initial review, after `git fetch --prune origin`, branch `codex/dashboard-games` and `origin/main` both pointed to `5ac31974578077420aa06d85a1c465d04eb2490b` (zero commits ahead or behind). That review did not commit, push, reset, stash, or deploy. The subsequent user request explicitly authorizes a coordinated commit/push checkpoint; Git history and remote branch readback provide its final identity. `git diff --check` passed.

Source hashes are retained in the local probes and `source-before.json` / `source-final.json`. The fresh-submission migration and sportsbook-source module changed during the review, so affected checks were rerun against the later source. R1 and R3 are now resolved locally. R2 is explicitly nonblocking under the user's casual-game priorities. Checkpoint logs remain in ignored `.local/git-checkpoint/` and are not included in the Git publication.

Source/date: repository code, synthetic local API probes and PGlite execution, October 8, 2026. Hosted behavior remains unverified.
