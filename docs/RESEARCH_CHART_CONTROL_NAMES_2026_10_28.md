# Trend-specific chart control names — October 28, 2026

Owner: Codex · Approved D-55 Research/chart follow-through

Opened trends previously exposed generic Move along the line and Move across
the seasons slider names, and a generic Chart view group. Different trend
controls could therefore sound the same while navigating forms or controls.
Each opened trend now adds its existing visible title to those accessible
names. Equal values and dates still retain distinct names for different titles.
The value announcement remains the exact current units/record/date; it is not
replaced by the title.

TrendDetail supplies this context to both chart views and the view-switch group.
Standalone line/season components retain their existing generic names when no
context is supplied. This changes no visible labels, layout, styles, tokens,
plot values, selection keys, table links, keyboard actions, pointer behavior,
market gates or requests.

## Verification checkpoint

The browser regression failed against the generic name and now passes exact
trend-specific line, season and view-group names alongside keyboard movement,
season-row selection, retained focus and view switching. Two new unit
regressions failed before implementation; they distinguish equal-valued charts
and identical season records by their trend names while preserving value
announcements. All 468 Vitest tests, 27 chart-geometry/token/brand tests and
typecheck passed. All 98 expanded shell/Research/Lines/Trends/gesture browser
cases passed, along with final fixture privacy and Brand QA checks.
This is local browser/markup evidence, not a physical screen-reader or iPhone
acceptance claim.

## Remaining checkpoints

Source branch: `codex/research-chart-control-names`. PR #303’s CI/merge is pending.
This batch needs its own CI/merge, release/readback and device/assistive-technology
acceptance. Live/postponed/cancelled status and dependent Bet/Challenge slots
stay open. No deployment, migration apply, provider, collection-budget, scoring
rule or frozen v62 tracker change.
