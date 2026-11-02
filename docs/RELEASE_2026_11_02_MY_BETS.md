# My bets spacing, searchable entry and Monday answers — November 2, 2026

Status: implemented and verified locally; release not yet dispatched.

Sean's phone screenshots showed adjacent ticket borders touching after the Roomy
cards release. The legacy `.gx .gx-bets .gx-ticket-tracker .social-feed` rule
overrode both the new feed gap and its ungrouped frame. The legacy rule now
excludes the owner feed. The owner feed uses a sufficiently specific selector
and the existing 32px spacing token; tapping a preview still expands the full
ticket in place. Tests measure the distance between three populated cards in
Light and Dark at 320px and 390px, collapsed and expanded, and after reload.

The existing ticket editor now searches matchups by team/name and offers 33
named manual tracking sources, including exchanges and pick'em apps, with a
search field and the existing custom/unknown choices. Names support recording
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

Local validation passed: typecheck, 17 focused Node checks, all 621 component
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
