# Recorded market range — October 27, 2026

Owner: Sean Balsiger · Approved D-55 Research/chart follow-through · Source work

The movement plot scales each market to its own recorded minimum and maximum.
Previously only its accessible name exposed that range, so equal-height moves
could represent very different point changes. A visible range now sits above
the plot and also supplies the chart's accessible description.

Spread bounds retain the home team and sign, including Pick'em. Totals name
points, keeping market values separate from cumulative unit results. The range
uses the plotted observations only: a line without a valid collected time does
not enlarge it, and missing observations remain readable table rows and gaps.
One valid observation says Recorded line; multiple equal values say no recorded
change. No valid observations retain the unavailable state without a range.
The range stays fixed during selection and updates with refreshed evidence.

The component uses the existing reader, geometry and brand tokens. No provider
calls, migrations, storage, collection frequency or reveal rules change.

Local validation: the combined branch with #267 passed two focused browser
cases. After integrating main with #266 and #267, 112 component and 41
geometry/gesture/token/brand-mark tests and typecheck passed.
The movement case verifies accessible descriptions, unchanged ranges during
keyboard/table selection,
updated bounds after refresh and locked-market protection. Four 320px Light/Dark
and forced-color screenshots were inspected. All 65 final integrated Research, Lines,
Trends, Bets Everyone and gesture browser cases passed on that combined source. Brand QA and the fixture build's
bundle/privacy check also passed.

Source is in [PR #270](https://github.com/seanbalz/guess-the-lines-repo/pull/270),
`codex/market-movement-scale`. PR #270 merged October 27 as `d98fb81ff0e84f392cf00ae235d7f09bd12b0e8b` after all nine checks passed on `edaab840546c379a781778e999fa3399b0314158`, with no CI fixes or review findings.
Hosted release/readback and physical-iPhone acceptance remain open. Stage 33's verified
live-game status and stage 34's dependent Bet/Challenge actions remain open.
The frozen v62 tracker is unchanged.
