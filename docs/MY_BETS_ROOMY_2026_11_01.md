# My bets — Roomy cards with inline ticket details

Owner: Sean Balsiger · November 1, 2026 · Deployed; signed-in phone acceptance pending

Sean selected **01 — Roomy cards** from the
[five preview studies](../design/my-bets-previews-2026-11-01/README.md):
“1 is the best.” He then confirmed **“Expand in place, as shown.”**
This follows the deployed selection-grid release and supersedes showing every
parlay leg before the ticket is opened. The full grid remains available on tap.

## Selected behavior

My bets starts with compact previews. Each card has 20px padding and 24px between
tickets, using existing GTL spacing, type, colors and radii. A preview shows its
source, status, selection or parlay title, recorded matchup marks, risk and total
return. Single-player milestones retain their exact pick and stat. A common
anytime-touchdown parlay has one short subtitle. Arbitrary custom text stays
literal. Unknown amounts stay unknown.

Tapping the preview replaces it in place with the full ticket. Every parlay leg
appears in the existing two-column selection grid, with more space between tiles.
The full ticket retains exact selections, odds, unit precision, timestamps,
record flags and access to notes, corrections, reporting and history. The upward
chevron collapses it; Ticket details opens the existing details/history content.
No nested preview button wraps those controls.

Native buttons support pointer, Enter and Space. Expansion moves focus to the
collapse control; collapse restores focus to that ticket's preview without a
forced scroll. Buttons expose their expanded state and controlled region. Full
ticket contents stay mounted while hidden, preserving their existing detail
state. A reload starts with previews again; expansion is local display state.
No API request, mutation, storage write or bet action is triggered by opening/closing.
No layout animation is added.

Preview marks represent up to three distinct **recorded matchups**, using both
teams. A remaining count refers to additional matchups. No player's current team
is inferred from a manually entered name. Full matchup names and all selections
remain in the expanded ticket. Excluded and recorded-after-kickoff flags remain
visible in the preview as well as the full ticket.

Risk uses cash only when the account already has an explicit unit conversion;
otherwise it uses the recorded units. Pending previews label potential **total
return**, including stake; settled previews show **net units**. The full ticket
retains its existing provenance labels and four-decimal unit display. The unit
helper, persisted values and manual-entry behavior are unchanged.

## Scope and validation

Only `TrackedBetRow.jsx`, its stylesheet, affected tests and selection/status
documents change. Existing account ownership, filters, reveal restrictions,
save/correct/report routes, uncertain-save recovery, guided props and sportsbook
choices retain their existing behavior. Shared feeds and Virtual Units use their
existing views. No API, schema, collector, budget, guess, scoring rule or hosted
record is modified. Server/shared code, Supabase files, scripts and the lockfile
match deployed source `43768a44b3cbbef2bc104b5e16f1512ab526eaaf` byte for byte.

Local checks passed 18 focused Node checks, all 620 component tests, and all 30
tracked/recommendation browser flows. The parlay flow checks closed previews,
keyboard expansion/collapse, focus restoration, all six exact saved selections,
320/390px Light/Dark geometry, accessibility, reload and no additional API read
or write from expansion. The milestone correction flow retains 70+ and 0.0747U.
Both full phone-sweep tests passed, including enlarged fallback fonts and
320/390px Light/Dark layouts. Typecheck, the local cloud build, private-data
bundle scan and Brand/D-18 document QA passed. The local build uses fixture public
configuration; it is not a production deployment artifact.
Local screenshots and detailed receipts remain ignored under `.local`.

Design PR #404 merged as `d13f4142974924679db81cbc21ab9625ee861f3f` after all
twelve checks passed. Implementation PR #405 merged as
`46097802899472cdfb1bdb00c7c50248e2f24dab` after all twelve PR checks passed.
All twelve exact-main checks and the protected frontend release succeeded.
[The production record](RELEASE_2026_11_01_MY_BETS_ROOMY.md) verifies Pages
`90a7bf99-10b2-4390-abf2-4140c7b95d80`, all 127 served files and preserved
saved tickets, units and historical scoring records. Actual signed-in production
and physical-phone acceptance remain separate.
The frozen v62 tracker and private account records are unchanged.
