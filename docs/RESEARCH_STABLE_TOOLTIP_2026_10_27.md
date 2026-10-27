# Steady chart tooltips — October 27, 2026

Owner: Sean Balsiger · Approved D-55 Research/chart follow-through · Source work

Moving between short and wrapped tooltip labels shifted the Research plot and
its range control by 18 pixels in the 320px browser regression. The same tooltip
layout was used by season charts. This is chart layout movement, not the earlier
navigation symptom Sean corrected as absent.

Line and season charts now share a tooltip that reserves space for the tallest
readout in the current dataset. CSS lays out invisible sizing copies in one grid
cell; only the current readout is visible. The sizing copies remain inside the
aria-hidden tooltip, while the range control announces the current value and
record. Readouts and sizing elements are memoized across selection changes.
No text is truncated, source values changed, extra requests made or market
permissions altered. A new dataset supplies new sizing content.

The browser regression failed before the fix and the focused corrected case
passed. All 49 chart/Lines/Research component tests and 26 geometry/token/brand-mark
tests passed, as did typecheck, Brand QA and fixture build/privacy checks.
The integrated Research/Lines/Trends/League-bets run passed 56 cases; the season
case failed because an oversized synthetic record widened its evidence table.
After restoring its original fixture counts, that case passed on the focused
rerun, covering all 57 cases. The Research regression retains short and wrapped
labels, keyboard/pointer selection, period changes, closed-market checks and axe.
Season selection also checks stable plot placement. Eight 320px Light/Dark and
forced-color screenshots were inspected using synthetic fixture data.
Source publication is pending on `codex/chart-stable-tooltip`.

CI/merge, hosted release/readback and physical-iPhone acceptance remain open.
This task does not deploy, apply migrations or change the frozen v62 tracker.
