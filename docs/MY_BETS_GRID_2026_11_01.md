# My bets — selected grid and manual player entry

Owner: Sean Balsiger · November 1, 2026 · Deployed; signed-in phone acceptance pending

Later the same day, Sean selected [Roomy cards with inline expansion](MY_BETS_ROOMY_2026_11_01.md).
That follow-up starts with a compact preview and reveals this full grid on tap;
its implementation and protected release are tracked separately. The behavior
below describes the earlier deployed grid release.

Sean selected **04 — Selection grid** from the
[six visual mockups](../design/my-bets-2026-11-01/README.md): “I like the 4th one.”
The subsequent status check found only mockups in draft PR #400, with no app
implementation. That design PR is now merged. This follow-up implements the
selected layout, easier manual player bets and additional tracking book choices.

## Visible behavior

My bets uses two columns of leg tiles for parlays. Every leg is visible without
opening a disclosure. Straight tickets lead with the player/selection and exact
pick. Book, status and odds remain visible; risk and potential total return share
a short footer. Total return includes the stake. Exact four-decimal unit stakes
are preserved in display. Unknown values remain unknown.

The ticket menu opens notes, timing, corrections, reported results and the audit
without repeating the ticket's selections and amount blocks. Comparison/week
controls and the record/performance summary remain available inside Filters.
The page retains the existing sport navigation, hidden-line enforcement, shared
feed, older history and separate Virtual Units modes.

Tiles show the recorded matchup's two team marks. A manually entered player's
team is not inferred without a verified roster association. Custom selections
retain their original text. Known “70+” milestones stay “70+”; they are never
rewritten as “over 70.” There is no new result feed or automatic prop grading.

## Manual entry and books

Guided entry asks for the player once, a common stat, direction/milestone and
threshold. Anytime touchdowns create an explicit 1+ selection without asking
for a yardage threshold. Each parlay leg uses the same fields. Other/custom
props and old arbitrary descriptions remain editable without a silent rewrite.
`trackedBetTerms.js` is a shared plain-JavaScript helper without React or CSS.
The form serializes the existing five leg fields only; draft-only guided fields
never reach the API. Existing ownership, revision, audit and retry behavior stays
in force. This stage uses guided entry; paste-to-review is not implemented.

The six prominent tracking book choices remain. More sportsbooks adds Fanatics,
Hard Rock Bet, bet365, Circa Sports, Pinnacle, Sporttrade, BetOnline and Bovada.
Unknown and custom sources remain possible. These are manual source names only:
no book is newly connected, no offer is assumed and no collection budget changes.
Collected-book recommendation preferences are separate and unchanged.

## Cash and units

Units remain the authoritative saved stake. Cash entry requires an explicit cash
value for one unit and shows its conversion. The result must fit the existing
four-decimal unit limit while preserving the entered cash amount to the cent;
otherwise saving is refused. Cash mode appends the entered cash and conversion
to the existing ticket note so the audit retains their provenance.

The account's display conversion is remembered on the current device. It can
also start from consistent, explicit unit-value notes on that account's unlocked
tickets. Another player's notes never set it. Accounts without a known value
see units until they enter a conversion. Changing the display conversion never
rewrites saved bets or historical units. It is not a synchronized profile field
or proof of an external sportsbook cash balance. No universal $100 conversion
is assumed for other players.

## Verification and delivery

Focused checks cover milestone semantics, exact cash conversion, ownership-scoped
unit hints, arbitrary text preservation and all six tiles in server-rendered
markup. Browser fixtures exercise real existing save/correct routes, reload,
six-player parlays, a four-decimal milestone stake, themes, narrow widths,
accessibility, ownership, uncertain retries and recommendation review.

PR #401 merged as `43768a44b3cbbef2bc104b5e16f1512ab526eaaf` after all twelve
PR checks passed. All twelve exact-main checks and the protected frontend release
passed. [The production release record](RELEASE_2026_11_01_MY_BETS.md) verifies
Pages `83caec6d-2da5-4f20-a53a-902a5cd7512a`, all 127 served files and preserved
saved-ticket/scoring records. No API, migration, collector, player guess or
production record was changed by this frontend release. Actual signed-in
production and physical-phone acceptance remain pending. The frozen v62 tracker
is unchanged.
