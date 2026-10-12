# Submission-time scoring — D-16

Owner: Sean Balsiger. Decision recorded October 8, 2026. Deployed in Pages
`2106725d` / API v14 with JWT verification enabled. See the
[October 8 release record](RELEASE_2026_10_08.md). The feature's earlier local
verification evidence is preserved below.

## October 12, 2026 ruling — the line at your guess (D-27)

Sean, October 12, 2026: "they can submit their guesses whenever. The spread when
they guessed is the spread that their points total will be compared against", and
"all historical guesses for all individuals should be saved in their accounts".
Implemented by migration `20261012230000_gtl_submit_with_line_at_guess.sql` and the
API/UI changes listed in [DECISIONS.md](DECISIONS.md) (D-27):

- A submission or edit before the deadline is never refused because of
  market-refresh limits (cooldown, daily cap, budget guard, busy lease, provider
  failure). When the newest stored line is more than five minutes old, the save
  still tries one shared refresh inside the free limits first.
- Each changed guess saves, as its reference, the newest qualifying stored line for
  that game and market at the save instant (`basis: line_at_guess`), with
  `observedAt` and `ageSeconds` (save time minus the earliest book observation).
  The five-minute rule no longer decides whether a reference is scored; the age is
  shown ("Line at your guess: −3.5 at 2:11 PM PT · observed 14 min before your
  guess").
- With no qualifying stored line yet (for example right after the Monday open),
  the guess saves with a `pending` reference and is unscored until the first
  qualifying line collected after it, with every book observation at or after the
  save, which becomes its reference (`basis: first_line_after_submission`, "First
  line after submission"; `ageSeconds` is then zero or negative). A line observed
  before the save is never used for a pending guess, also when its collection was
  stored after the save. The collection that stores the qualifying line resolves
  every pending guess of the week in the same database transaction
  (`gtl_resolve_pending_references`, called from both finish RPCs), so the
  community leaderboard, group screens and Solo read one saved value; only the
  pending reference changes and a `reference_resolved` audit event is appended.
  A line must be collected before that game's kickoff; a guess on the first game
  (whose kickoff is the deadline) stays pending if no line arrives before it.
- Every guess stays in the player's account: no stored row is rewritten or
  deleted, and every save and resolution appends to the ballot's audit. Community
  Picks shows each of the player's submitted guesses with its saved line, time and
  age, or its pending state. The all-players history view is separate work (branch
  `claude/community-history`).
- Unchanged: deadline, kickoff locks, the full-ballot rule, the D-23 reveal gate and
  D-18 Virtual Units. Every reference stored before this ruling stays exactly as
  stored: `stale` and `unavailable` references keep no value and stay unscored;
  nothing is rescored or rewritten.

Source: the available realtime transcript and current repository evidence. The
user described feedback from Troy, Luke and Steven; their iMessage conversations
were not accessed, and this record does not claim to reproduce those messages.

## Confirmed behavior

- Guess the Spread and Guess the Total score each player's submitted guesses against that player's consensus saved at submission. The formula remains `max(0, 10 - 2 * absolute error)`.
- Editing a submitted guess before the existing deadline saves a new reference for that changed guess. Unchanged guesses keep their original references. A no-op save cannot refresh the reference. Full-ballot submission still opens only that market's analysis.
- Current consensus appears separately. Later quote collection changes that reference display, not already anchored points. Player comparisons disclose which saved reference each player is scored against and its timestamp.
- Shared weekly ballots, group privacy, separate modes, eligibility provenance, the configured deadline and immutable Betting Challenge selections continue.

## Evidence and migration boundaries

The server chooses the source; client-supplied consensus cannot establish a scoring reference. Save the source, snapshot identity, collection time, observation time and server save time. Until October 12, 2026 a qualifying observation had to exist at save time and meet the five-minute freshness window, and under D-17 the entire save failed otherwise. D-27 (above) replaces both: the newest stored line at the save is used whatever its age, or a pending reference resolved by the first line collected and observed after the save. Historical guesses with missing evidence remain unscored with a reason. A captured reference does not become invalid simply because time subsequently passes.

Initial submission captures the complete ballot's references. Revisions preserve original submission time and record before/after guesses and references. Existing submitted guesses without a saved submission-time reference remain explicitly unavailable under this policy. Historical source files, archived scores, eligibility rulings and frozen benchmarks are preserved; no later quote is substituted for missing historical evidence. An explicit changed guess can establish a new reference before the deadline.

Closest-pick records compare each player's absolute error against their own saved reference. Records require the relevant submitted comparison entries and available references; missing values are not losses or zeros. UI copy must make the individual-reference basis clear.

The twelve-hour collector remains unchanged. D-17 adds a shared refresh when a submission would benefit from a newer line, subject to the existing free quota, daily cap and cooldown. Since D-27 a missing, partial or refused refresh never rejects the save. See [fresh submissions and sportsbook sources](FRESH_SUBMISSION_AND_SOURCES.md) for the new migration, source display, operating limits and delivery state.

## Verification and delivery

The deployed implementation includes the server engine, atomic weekly-ballot SQL
capture, scoring/market projections, saved-reference entry and comparison screens,
and per-player reference charts. The CLI-created migration is
`supabase/migrations/20261008225401_gtl_submission_time_scoring.sql`. It was
applied to the hosted database in the six-migration October 8 release.

Earlier feature verification, performed locally before deployment:

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
The subsequent release applied the hosted migration and deployed the API and
frontend. D-17's shared submission refresh and rejection path is included. Source
coverage and free quota limits remain operational constraints; successful real
submission, physical-phone and second-device acceptance must not be inferred
from deployment or synthetic browser tests.

The release boundary includes anonymous/authenticated denial of the
`gtl_submission_reference(jsonb,jsonb,text,timestamptz)` helper as well as the
weekly read/write RPCs. Local SQL privilege checks passed; the subsequent release
also passed 130 live access-denial checks. The release record separately records
368 Node, 29 local browser and 79 cloud-style browser checks; do not add earlier
feature runs to those totals or treat denial checks as a real scoring submission.

The root unit log ending 228/229 (`.local/d16-final-unit-test.log`) is an earlier
intermediate run with an incomplete quote fixture. The corrected aggregate result
is 232/232 in `.local/d16-verified-unit-test.log`. Other simultaneous feature work
may add later checks; do not describe this bounded pass as proof of every later
change in the shared checkout. No test servers from this scoring task remain on
port 5198 after the final recheck.

Git was fetched and updated with `git pull --ff-only --prune origin main`; the existing branch was already at the remote commit `5ac3197`. Existing working-tree changes were preserved. This does not mean the uncommitted application work has been published to GitHub.
