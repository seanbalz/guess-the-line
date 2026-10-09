# Submission-time scoring — D-16

Owner: Sean Balsiger. Decision recorded October 8, 2026. Local implementation and verification complete. Not deployed.

Source: the available realtime transcript and current repository evidence. The
user described feedback from Troy, Luke and Steven; their iMessage conversations
were not accessed, and this record does not claim to reproduce those messages.

## Confirmed behavior

- Guess the Spread and Guess the Total score each player's submitted guesses against that player's consensus saved at submission. The formula remains `max(0, 10 - 2 * absolute error)`.
- Editing a submitted guess before the existing deadline saves a new reference for that changed guess. Unchanged guesses keep their original references. A no-op save cannot refresh the reference. Full-ballot submission still opens only that market's analysis.
- Current consensus appears separately. Later quote collection changes that reference display, not already anchored points. Player comparisons disclose which saved reference each player is scored against and its timestamp.
- Shared weekly ballots, group privacy, separate modes, eligibility provenance, the configured deadline and immutable Betting Challenge selections continue.

## Evidence and migration boundaries

The server chooses the source; client-supplied consensus cannot establish a scoring reference. Save the source, snapshot identity, collection time, observation time and server save time. A qualifying observation must exist at save time and meet the existing five-minute freshness window. Under the subsequent D-17 decision, new submissions and changed submitted guesses require eligible fresh references or the entire save fails without changing the ballot or reveal state. Historical guesses with missing evidence remain unscored with a reason. A captured reference does not become invalid simply because time subsequently passes.

Initial submission captures the complete ballot's references. Revisions preserve original submission time and record before/after guesses and references. Existing submitted guesses without a saved submission-time reference remain explicitly unavailable under this policy. Historical source files, archived scores, eligibility rulings and frozen benchmarks are preserved; no later quote is substituted for missing historical evidence. An explicit changed guess can establish a new reference before the deadline.

Closest-pick records compare each player's absolute error against their own saved reference. Records require the relevant submitted comparison entries and available references; missing values are not losses or zeros. UI copy must make the individual-reference basis clear.

The twelve-hour collector remains unchanged. D-17 adds a shared refresh when a submission needs fresh evidence, subject to the existing free quota, daily cap and cooldown. Missing, partial or stale results reject the save and keep the entered draft available for retry. This still cannot guarantee a quote inside the five-minute window at every submission. See [fresh submissions and sportsbook sources](FRESH_SUBMISSION_AND_SOURCES.md) for the new migration, source display, operating limits and delivery state.

## Verification and delivery

The local implementation includes the server engine, atomic weekly-ballot SQL
capture, scoring/market projections, saved-reference entry and comparison screens,
and per-player reference charts. The CLI-created migration is
`supabase/migrations/20261008225401_gtl_submission_time_scoring.sql`. It has not
been applied to the hosted database.

Verified locally:

- 232 backend/database checks passed with zero skipped checks in
  `.local/d16-verified-unit-test.log`. The database checks execute SQL in local
  PGlite and do not establish hosted deployment.
- 15 local browser checks passed, including four new scoring scenarios. The
  cases cover edits, fixed scores after market movement, legacy missing-reference
  behavior, deadlines and 320/390/1440px layouts. Keyboard, reduced-motion and
  actual Light/Dark states were checked. Root review of the mobile Light image
  confirmed readable saved references and a separate current-consensus box.
- Nine existing Python historical-snapshot tests passed. Historical prediction
  and snapshot files have no new content changes from this task.
- All 57 cloud-style browser cases passed across the 54-case passing full run
  and a 3/3 targeted recheck after correcting obsolete comparison-button and
  disabled-input expectations. These tests use mocked Supabase traffic, not real
  player accounts. Logs are `.local/d16-cloud-browser.log` and
  `.local/d16-cloud-browser-recheck.log`. The adjacent results component was
  present for the successful final build/recheck.
- The latest cloud-style build passed. Existing Vite chunk-size warnings remain
  outside this scoring change. Its compiled frontend passed the private-data
  scan; `git diff --check` passed.

The source validation review also corrected future-dated persisted scoring
references and rejected malformed provider/event/paired-outcome evidence in the
current-consensus display. Missing evidence never becomes a fabricated zero.
Hosted migration, deployment and authenticated production readback remain
outstanding. D-17 adds a local submission refresh and rejection path; the source
coverage and free quota limits remain operational constraints.

Release checks must include anonymous/authenticated denial of the new
`gtl_submission_reference(jsonb,jsonb,text,timestamptz)` helper as well as the
weekly read/write RPCs. Local SQL privilege checks passed; hosted checks must
follow the hosted migration and must not be inferred from these local tests.

The root unit log ending 228/229 (`.local/d16-final-unit-test.log`) is an earlier
intermediate run with an incomplete quote fixture. The corrected aggregate result
is 232/232 in `.local/d16-verified-unit-test.log`. Other simultaneous feature work
may add later checks; do not describe this bounded pass as proof of every later
change in the shared checkout. No test servers from this scoring task remain on
port 5198 after the final recheck.

Git was fetched and updated with `git pull --ff-only --prune origin main`; the existing branch was already at the remote commit `5ac3197`. Existing working-tree changes were preserved. This does not mean the uncommitted application work has been published to GitHub.
