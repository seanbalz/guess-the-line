# Recommendations and tracked tickets

Owner: Sean Balsiger · October 21, 2026 · Implementation design

## Requested outcome

A player recording a recommendation must find that ticket in Tracked bets.
Sean previously selected actual bets first with Virtual Units separate. Preserve
that distinction. His supplied Photos 1 and 5 guide a rounded, grouped list with
quiet dividers, clear selection text and aligned amounts. The existing GTL
identity, theme tokens and touch targets continue to apply.

## Save flow

Recommended currently writes only Virtual Units picks. Add a separate **Track
this bet** action that opens the existing actual-ticket editor in Tracked bets.
Carry the recommendation's account, season/week, game, side, market, exact book
line, price, source and quote time into an editable review. Leave units risked
and time placed unknown. Require confirmation that the reviewed terms describe
a bet placed elsewhere. Opening or cancelling a review creates no record.

Use the existing social/create writer, request idempotency, failure recovery,
account scoping and week revision checks. Keep the selected week explicit across
rollover. After save, the owner sees the same ticket in Tracked bets and after
reload. Do not infer past actual tickets from existing Virtual Units picks.
Keep an explicitly labelled Play with Virtual Units action and its saved card.

## Presentation

The owner's Tracked bets view uses one grouped list. Each summary row presents a
selection, matchup/book context, status word and stake (pending) or net units
(settled). Unknown values remain unknown; no currency conversion. A keyboard
accessible disclosure opens the existing ticket details, corrections, reported
results and audit. Shared feed and classic application retain their existing
detail cards. Keep week/result/market filtering accessible, with secondary
record settings and performance details disclosed on demand.

Use GTL surfaces, radii, elevation, typography and state colors in both themes.
No copied logos, new fonts, invented chart data or glass behind reading text.
The mobile column remains bounded by the current layout contract.

## Verification and delivery

Local PGlite fixtures cover review before write, exact saved selection, unknown
stake, cancellation, one ticket after an uncertain response/retry, reload and
separation from Virtual Units. Check existing recommendation locks and Virtual
Units saves. Inspect list and expanded details at 320/390px, both themes, with
keyboard, no overflow and automated accessibility checks.

Review named changes, pass required CI, merge, release the exact tested frontend
through the protected workflow, verify served assets and unchanged hosted API,
schema/data, and sync the three clean integration checkouts. No migration or
provider collection is needed.
