# Team season and margin-chart selection — October 28, 2026

Owner: Codex · Approved D-62 team page / D-55 chart follow-through

The team view previously reused the team-mark class (`gx-team`), inheriting
its 32px height and hidden overflow. A separate view class restores the full
record, chart and season list. A browser assertion now checks the content
height and visible result controls.

Completed games with known scores now have a week button in the team sheet's
season list. Choosing one selects its corresponding margin bar and readout;
mouse/touch scrubbing or the chart's range input selects the matching row.
The row carries a check and tint, with a real outline in forced colors.
Keyboard focus remains on the control used; selection never scrolls the sheet
or fetches data. Upcoming games and finals with unavailable scores remain
plain rows, and ties select their existing zero-margin marker.

Selection belongs to the team, season and actual charted evidence. Equivalent
reads retain it; changed evidence resets to the latest plotted game. Season
rows and chart points share a week/game identifier, so an unplotted final
cannot offset later selection. Existing market gates and the team reader stay
unchanged. Results sit beneath matchup marks/codes so neither is crowded at
320px. The existing tokens and shared controls provide the styles.

## Verification

The browser regression failed before implementation on the missing selection
control, then passed after the change. Focused coverage includes linked
keyboard/mouse selection, a tie, an unavailable final, an upcoming game,
unchanged request counts while selecting, phone layout and accessibility.
59 team/Research/chart component tests, 19 token/brand tests and typecheck
passed. All 60 integrated Lines, Research and gesture browser cases passed
on the final source. Eight 320px Light/Dark and forced-color screenshots were
inspected (chart and season rows). Brand QA and fixture bundle privacy checks
passed. The desktop accessibility matrix now resets each board audit to its
heading after changing viewport width, avoiding inherited partial scroll under
the fixed bar while retaining the original accessibility assertions.

## Remaining checkpoints

Branch: `codex/team-chart-selection`. CI/merge, release/readback and real-iPhone
acceptance remain open. The queue records #275's verified merge and the newer
release through #283 separately. This batch makes no deployment, migration,
source acquisition or change to the frozen v62 tracker. Verified live-game
status and dependent Bet/Challenge destinations remain open. D-63's proposed
trend-builder decisions are separate from this approved chart work.


## Merge verified October 28, 2026

[PR #289](https://github.com/seanbalz/guess-the-lines-repo/pull/289) merged as
`13c1b35198e8028205059088afa5f25043ad9e8e` after all nine checks passed on
`1582b786c4386433199e7874820bfba57700102f`. Reviews and review threads were
empty; no CI repair was needed. Release/readback and physical-iPhone acceptance
remain open. The next source batch makes player-comparison chart ranges visible.
