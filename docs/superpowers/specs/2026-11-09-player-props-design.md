# Guess the Line Player Props — design proposal

Status: design and both mockup boards approved for planning and data-readiness work.
Owner: Sean Balsiger. Date: November 9, 2026.
This is a separate feature from the deployed D-80 period filters in PR #505.
No Player Props guessing implementation, migration apply or deployment is claimed.

## Review summary

- Add **Player Props** alongside Spread and Total inside Your guesses.
- Guess the **sportsbook market line**, rather than the athlete's final result.
- Choose an athlete and stat from verified available lines. Participation is
  optional, with any number of props and no additional weekly picks obligation.
- Use separate accuracy results for each stat type: average absolute miss in
  native units, lower is better. Do not combine yards and receptions, convert
  them to a percentage, or introduce a score out of 100.
- Add Player Props, athlete and stat-type filters to Your guess vs. market / Gap.
  Reuse Week, This season, All time and inclusive Custom range.
- Hide the market number **only on the guess-entry screen** before lock-in.
  Existing Research and other users' prop-bet visibility retain their rules.
- Use the selected Prism Glass system in both themes, including the existing
  floating bottom navigation and separate circles for team/league marks.

These choices were each confirmed directly in the conversation. After both
dark/light mockup boards were shown again, Sean approved them on November 9:
"Looks good as long as it's aligned with the rest of the apps designs."

That condition is mandatory: implement these layouts with the existing shared
Prism components, tokens, system typography, selected G, circular team/league
marks and Home's shared floating bottom navigation. The image previews do not
authorize replacement fonts, icons, colors, header framing or navigation. Reuse
the destination's approved frame and measured bottom clearance. Verify both
themes against the surrounding app; a new composition still needs its own
mockup approval before deployment.

## Supported first-release catalog

Offer these full-game quantitative prop types when eligible source data exists:

| Family | Stat types | Accuracy unit |
| --- | --- | --- |
| Passing | Yards; completions; attempts; touchdowns; interceptions | Yards, completions, attempts, touchdowns or interceptions, separately |
| Rushing | Yards; attempts; touchdowns | Yards, attempts or touchdowns, separately |
| Receiving | Yards; receptions; touchdowns | Yards, receptions or touchdowns, separately |

QB/RB/WR/TE and athlete search help discovery; position does not incorrectly
exclude a valid stat, such as receiving yards for a running back or rushing
yards for a quarterback. Each stat keeps a canonical key and unit. Alternate
lines, partial-game periods, binary anytime/first/last touchdown prices and
unidentified custom selections are outside this numeric-line guessing catalog.
This does not guarantee coverage for every athlete, stat or game.

## Entry and final lock-in

The entry mockup adds a Player Props mode choice, position/search controls,
athlete identity and stat choices, a hidden market number, a direct numeric
editor with half-point plus/minus controls, and one final lock-in per prop.
Counts validate as nonnegative; stat-appropriate signed yards must not be
mistaken for invalid counts. Server and client validation must agree.

Use the verified scheduled event, stable player ID and canonical stat key as
the selection identity, with season/week provenance. Player names alone cannot
join quotes or results. One user's final guess for that exact selection is
reused across their existing competitions; changing the group cannot create a
second guess. A different stat for the same athlete remains independent.

Drafts remain owner-only and editable before the event's actual kickoff. Preserve
saved drafts and change audits under D-23. At lock-in, the server checks identity,
membership, exact scheduled event, source eligibility, kickoff, version/replay and
existing lock. A successful lock is final; subsequent line moves do not rewrite
the guess, its saved reference or its accuracy. A repeated request is idempotent.
An unavailable qualifying reference leaves the draft intact with a clear retry
state, never a fabricated reference, zero score or silently successful lock.

Reuse the project's qualified, timestamped three-book median/provenance policy.
A shared refresh may be attempted only within the existing free quota, cooldown,
reservation and lease protections. Source age must remain visible in the receipt;
do not label a retained older line freshly collected. Never substitute fantasy
projections, an unmatched market, a different player's line or an after-the-fact
quote to repair the original accuracy reference. Existing Spread/Total pending
reference behavior is not changed by this new optional selection catalog.

## Accuracy, current gaps and paper results

Calculate an eligible prop's accuracy immediately from the saved lock-in
reference: `abs(guess - savedMarketLine)`. A stat-type score is the sum of those
absolute misses divided by its eligible guess count. Preserve original values
and counts; round only for display. Being high and low cannot cancel out.
Show the native unit, count and lower-is-better label. No guesses means an
unavailable score, not zero. Zero with a nonzero count means exact accuracy.

Period, athlete and stat filters apply to these personal accuracy results.
Each stat gets its own chart and scale, with tappable evidence/receipt. Show
cards for categories with records instead of a grid of empty stat tiles.
Existing Spread/Total points, standings, qualification and Fantasy scoring remain
separate. This design does not add a new prop leaderboard or awards policy.

Current market gaps may change as recorded lines move. Show their quote time and
identity separately from the saved accuracy reference. Do not rescore a final
guess using a current or closing line. A prop's detail must identify its own
athlete, stat, event and season/week, even in an all-time list.

The paper record is a third distinct measure. Grade the side the guess favored
against the last qualifying retained pre-kickoff line using a verified final
player stat for that exact event. Extend D-77's 1U at standard minus 110
convention, explicit paper labelling, W–L–P, win-rate denominator and 10%+ gap
filter; do not record an actual placed bet. Prop percentage gap uses the
absolute reference-line magnitude; a zero reference has no 10%+ classification.
The gap-size filter narrows this paper record, not the saved-reference accuracy
score. Period/athlete/stat filters narrow both.

Wins and losses require both eligible closing evidence and confirmed final stat
evidence. A missing stat row is not proof of zero or nonparticipation. Missing
evidence, an unverified identity, DNP, cancellation or unresolved correction
stays explicitly ungraded with its reason rather than becoming a loss. Confirmed
zero stats can grade only when participation/final evidence establishes them.
Pushes remain outside wins/(wins+losses), as in D-77. All-time and custom-range
totals must load their complete scope or show Retry instead of a partial result.

## Visibility and existing app integration

Sean explicitly selected **hide only on guess-entry screen**. Do not introduce
new quote locks in Research or other users' tracked prop bets. Preserve their
existing permissions and the owner's access to saved terms. This is distinct
from unrevealed Guess values: new prop drafts and opponent guesses still need
the existing owner/exact-selection lock-in/kickoff reveal protections.

Use existing approved receipt, History and permitted shared-picks row patterns
with the prop's athlete/stat/unit and saved source times. Preserve private group
rosters and the shared weekly identity. If implementation needs a new composition
beyond the approved patterns, obtain its mockup approval before deployment.
No user-entered data is deleted, moved or silently hidden by a filter default.

## Architecture and data-readiness requirements

Use a dedicated typed prop domain and additive server-authoritative storage for
drafts, final guesses, reference receipts and audits. Do not encode a player prop
as a game Total or use the game's combined score to settle it. Add guarded
authenticated readers/writers behind a compatible feature-availability check;
old clients and an unapplied schema must continue handling Spread/Total normally.
Never place unrevealed guesses or service credentials in public frontend assets.

Before implementation planning enables live lock-in, perform a permitted
read-only coverage audit: source/redistribution rights, actual available books
and prop types, stable roster/event mapping, quota capacity, recorded player-stat
coverage and current schema/API capabilities. Existing research quote support
and raw statistical inputs are starting points, not proof of connected complete
prop coverage. Preserve the current free-only budget. Page views must not become
unreserved provider collection loops. Report a coverage limitation directly
rather than inventing lines or purchasing data.

Primary documentation checked during design:

- [The Odds API event/market documentation](https://the-odds-api.com/liveapi/guides/v4/)
  and [NFL prop keys](https://the-odds-api.com/sports-odds-data/betting-markets.html).
  Prop requests are per event and consume quota; paid historical endpoints are
  not an authorized source for free historical backfills.
- [nflreadr player-level statistics](https://nflreadr.nflverse.com/reference/load_player_stats.html)
  documents weekly player/game identities and raw statistics. Actual source
  coverage, rights, finality, participation and correction handling still need
  verification. Existing fantasy-point conversions are not market references.

Do not expose the mode until the required data, schema, API and frontend are
ready together. A new migration requires its own reviewed artifact, fresh hosted
preflight, preservation/privacy/grant checks and Sean's named apply instruction.
Determine unique migration versions and dependencies from fresh main/open PRs;
do not repurpose M-41 or apply pending unrelated EPL migrations. API/worker/
frontend deployment scopes and compatibility order require their normal gates.
No release window restriction is reinstated.

## Validation and mockup provenance

Verify native-unit absolute error/counts, exact zero versus missing score,
independent stat identities, aliases/trades, replay/concurrent locks, immutable
references, stale/missing sources, quota exhaustion, ungraded/DNP/zero-stat cases,
complete multiweek reads and existing quote access. Check the new Guess-value
privacy boundary separately from the entry-only market-line presentation.
Use both themes, phone/narrow/short/enlarged text, keyboard/focus, detail/Back and
floating-bar end clearance. Synthetic fixtures do not establish live acceptance.

The entry board shows an illustrative user guess of 72.5, not a bookmaker quote.
Its [CeeDee Lamb roster reference](https://www.dallascowboys.com/team/players-roster/ceedee-lamb/)
supplies the example athlete identity. The accuracy/Gap board uses explicitly
illustrative errors/counts: receiving misses 6/5/2/3/4 average 4.0 yards;
reception misses 1/0.5/0.5/0/1 average 0.6 receptions; paper 5–2–1 gives 71.4%.
These are layout fixtures, not account statistics, market lines or live odds.
Both boards were rendered inline for phone review; raster previews are not
production assets. Their approved SHA-256 fingerprints are:

| Board | SHA-256 |
| --- | --- |
| Entry, Dark and Light | `7f8df26aec6f5a7669e5765290eefff9ac726f7007d02ebd2ebda1cc8a0ea5df` |
| Accuracy/Gap, Dark and Light | `f720c31a6484d722e3d53fd1f7ac5450c57d546e57d4f693fc537de4d6bde779` |

Next: write the implementation plan and perform the permitted read-only data
audit. Design approval does not authorize a migration apply or production
deployment. Required source reviews, CI, live-data checks and separately named
apply/deploy instructions remain.
