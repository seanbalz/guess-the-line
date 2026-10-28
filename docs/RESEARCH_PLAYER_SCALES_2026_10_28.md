# Player comparison chart scales — October 28, 2026

Owner: Codex · Approved D-55 Research/chart follow-through

Point comparison charts scale their bars to their own observations. Equal-width
bars in different charts can therefore represent different point gaps. The
visible legend now names each plotting range: signed bias has negative and
positive bounds, absolute error starts at zero, and cover rates retain their
fixed 0–100% frame. Labels use up to four significant digits. The scale uses
the same maximum, including the existing one-point minimum, as the bar geometry.

The figure references its scale for assistive technology. Missing/non-finite
observations keep their No sample state; with no finite observations, the scale
says unavailable. Real zero retains its zero marker. Plot sizes, values, samples, exact-value tables,
filters, market gates and requests are unchanged. The scale shares the existing
zero-baseline meta line, using existing typography and colors.

## Verification

Four component regressions failed before the change and passed afterward:
signed bounds, the unsigned minimum range, fixed percentages and missing
observations. The browser fixture checks all three player-comparison ranges
alongside the existing exact-value, zero/missing, privacy and layout assertions.
All 25 integrated Trends/Research/gesture browser cases, 62 component tests,
19 token/brand tests and typecheck passed. Brand QA and fixture bundle privacy
checks passed. A final focused browser rerun passed, and eight 320px Light/Dark
and forced-color signed/percentage screenshots were inspected.

## Remaining checkpoints

Branch: `codex/player-comparison-scales`. CI/merge, hosted release/readback and
physical-iPhone acceptance remain open. PR #289's merge is recorded separately
in the completion register and queue. This batch makes no deployment, migration,
source collection or frozen v62 tracker change. Verified live-game status,
dependent Bet/Challenge destinations and broader device acceptance remain open.


## Merge verified October 28, 2026

[PR #291](https://github.com/seanbalz/guess-the-lines-repo/pull/291) merged as
`437766277102ef6488696fc623107937138dba1f` after all nine checks passed on
`e0d0f71ae471bf7d81d61ec41342d35a741cb4ca`. Reviews and review threads were empty;
no CI repair was needed. Release/readback and physical-iPhone acceptance remain
open. The next source batch keeps enlarged team-chart readouts from moving
the plot and slider.

## Release recorded October 28, 2026

[PR #296](https://github.com/seanbalz/guess-the-lines-repo/pull/296) records the
[frontend release](RELEASE_2026_10_28_CHARTS.md) from
`b4413bf6504d9e8286ca0f7ae1a3b3b7db0e5f6b`, including this batch. The release
lane verified Pages `b57d894a-34b8-4df7-8125-a46d4438475d` at 15:42:36 UTC.
This supersedes the pending-release wording above; signed-in readback and
physical-iPhone acceptance remain open. This task inspected the committed
evidence and did not repeat deployment or hosted verification.
