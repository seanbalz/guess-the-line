# My bets spacing, searchable entry and Monday answers — November 2, 2026

Status: source merged; exact-main browser recovery and protected release pending.

Sean's phone screenshots showed adjacent ticket borders touching after the Roomy
cards release. The legacy `.gx .gx-bets .gx-ticket-tracker .social-feed` rule
overrode both the new feed gap and its ungrouped frame. The legacy rule now
excludes the owner feed. The owner feed uses a sufficiently specific selector
and the existing 32px spacing token; tapping a preview still expands the full
ticket in place. Tests measure the distance between three populated cards in
Light and Dark at 320px and 390px, collapsed and expanded, and after reload.

The existing ticket editor now searches matchups by team/name and offers 33
named manual tracking sources, including exchanges and pick'em apps, with a
search field and the existing custom/unknown choices. Enter in search keeps the
draft open; saving remains an explicit action. Names support recording
current or historical tickets; they establish no quote connection or regional
availability. Player entry suggests matching names/team/position from the
existing public Fantasy snapshot for the exact ticket season/week and selected
matchup. Missing snapshots retain free-text entry. Changing matchup or market
clears draft prop fields, and only the existing five leg fields are serialized.

Monday personal accuracy answers continue to follow D-27/D-50: use the saved
qualifying reference immediately, or the first genuine qualifying line after
lock-in when none existed. Pending receipts now explain this wait and label
their existing read action **Check for answers**. Refresh retains unsaved
guesses and never exposes an unlocked game's answer. No scoring reference,
collection quota, lock, standings gate or save rule changes.

Read-only hosted checks confirmed D-61's Tuesday midnight Pacific Points jobs
are enabled. The next scheduled opening is November 3, 2026 at 08:00 UTC,
subject to the existing fresh-snapshot requirement. The current published week
and locked guesses are retained; no reset was performed.

Authorized profile maintenance used the existing audited compare-and-swap
social writer. Private evidence records the complete intended state and exact
readback. Unrelated ticket entries, other social weeks, all Guess ballots and
Points guesses/slates matched their pre-write fingerprints. Private selections,
account identifiers and reconciliation payloads remain outside the repository.

Local validation passed: typecheck, 31 focused Node checks, all 621 component
checks, all 27 browser scenarios across Bets and per-game Play, the cloud build,
private-bundle scan and brand-document QA. The browser scenarios include measured
multi-card spacing, actual source/matchup search and player selection, exact
milestone serialization, unconfirmed-save recovery, and Monday answer refresh
without changing drafts or revealing an unlocked game. The phone layout and Axe
checks in those suites passed. Production evidence is still pending.

The release target is frontend only. Backend source, schema, existing provider
connections and schedules stay compatible. Rollback is a protected frontend
release from the prior production source
`46097802899472cdfb1bdb00c7c50248e2f24dab`; it does not roll back profile activity.
Physical-phone and actual signed-in production acceptance remain separate.


## Coordinated finish — November 2, 2026

Sean requested #408 first, then Research and iPhone acceptance. This chat is the
sole release/phone lane; UI support independently reviewed the final published
head with no actionable finding. All twelve PR checks passed on
`b107aea83047a23dfbcc40d5bd0f2e4663349b42`. PR #408 was already merged by another
session at the captain's final reread; actual merge/source is
`e02fed3b2e3cd9acf5bc63b4ecda1d0c3bcf5356`. No duplicate merge occurred.

Exact-main Tests 41537656678 and Brand QA 41537656635 passed. Dashboard
41537656726 passed Persona, dashboard and browser shard 4; another session's
unrelated #409 merge cancelled browser shards 1–3 despite a visible hold.
Following the requested #408-first order, the coordinator explicitly serialized
reversible CI scheduling: newer Dashboard 41538786993 was deferred, and only the
three cancelled e02 jobs were retried in attempt 2. Another actor then restarted
the deferred newer run (attempt 2), cancelling the e02 retry again. Further CI
changes paused pending operator reconciliation; the captain did not restart that
newer run or silently substitute its source. No test/assertion/source or
release gate was bypassed. The deferred #409 check must be restored once e02's
source pin is secured; #409's merged source is outside this named frontend release.

Fresh signed-in production baseline reproduces 0px gaps across 27 existing Week 8
tickets, entry `index-DWufmrF4.js`. The actual current published Week 9 has no
tracked tickets in this account. No ticket was saved or changed. Read-only
aggregate preservation fingerprints were captured before release. Backend,
shared code, schema, release scripts and locked dependencies match prior
frontend source 460978 byte for byte. Real-account screenshots and raw receipts
remain ignored/private.

Approximate completion: **75–85%**, a judgment rather than a task-count metric.
Source/review/PR CI/merge are complete; conflicting CI control must be reconciled
before exact-main recovery, protected source/
readiness/deploy, served readback, fresh signed-in acceptance and physical
Safari/applicable Home Screen checks remain. Protected production reviewer
approval is required under SHARED_DEPLOYMENT: a relayed request does not confer
the own-session exception for captain API approvals. No readiness or deploy run
has been dispatched yet. Research population/refresh acceptance follows a stable
#408 release; #388 stays open until fresh physical Fantasy/Trends acceptance.
