# Steady team-chart readouts — October 28, 2026

Owner: Codex · Approved D-62 team page / D-55 chart follow-through

Enlarging the team margin-chart text exposed a 40px vertical jump in the plot
and slider when switching between differently wrapped game labels. The readout
now reserves the tallest supplied label in a shared grid cell, matching the
existing trend-chart sizing pattern. Only the chosen label is visible; nothing
is truncated, and chart bars, scale and slider retain their positions while
selection changes. The hidden sizing copies remain outside the accessibility
tree, alongside the existing decorative readout. The chart's complete game
words and selected slider value remain its accessible descriptions.

The existing game/season selection, score values, range and data reads are
unchanged. Responsive sizing uses CSS; there is no layout measurement effect,
fixed maximum label height or added network request. A refreshed result set
naturally supplies its own sizing labels.

## Verification

The browser regression failed before the fix with plot/slider offsets differing
by 40px, then passed afterward. It doubles the readout font/leading while keeping
the layout at 390/320px, tests both keyboard endpoints in Light/Dark and forced
colors, checks focus and overflow, and captures four enlarged-text views.
The existing linked result/chart case also passed. After integrating #291, all
67 Lines/Research/Trends/gesture browser cases passed. After integrating main's
team-guidance and settlement changes, both focused team browser cases and
84 team/Research/Trends/chart component tests passed on the final source.
19 token/brand tests and typecheck also passed. Four
enlarged-text 320px screenshots were inspected. Brand QA, fixture bundle privacy
and whitespace checks passed. These are local fixture/emulation results;
physical-device acceptance remains separate.

## Remaining checkpoints

Branch: `codex/team-chart-readout`. CI/merge, release/readback and physical-iPhone
acceptance remain open. Verified live-game status and dependent Bet/Challenge
destinations are separate open work. This task makes no deployment, migration,
source collection or frozen v62 tracker change.
