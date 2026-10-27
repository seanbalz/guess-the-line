# Visible chart unit scales — October 27, 2026

Owner: Sean Balsiger · Approved D-55 Research/chart follow-through · Source work

Cumulative lines and season stems each scale their own data to the available
plot area. A small gain can therefore appear as tall as a large one in another
chart. Both views now show their plotted unit range, including the zero baseline,
so the visible magnitude can be compared without scrubbing every point.

The range comes from the same geometry that draws the chart. Signs and small
nonzero bounds remain visible; labels use up to four significant digits. Real
all-zero evidence says break-even, while absent unit evidence says unavailable.
Each chart image references its scale as an accessible description. Selection,
curve shape, season proportions, records and market gates stay unchanged.
Scales update when the evidence period changes, not when a point is selected.

Local validation: 59 component tests and 31 geometry/token/brand tests passed,
as did typecheck and Brand QA. The focused season browser case passed; the
Research case initially expected the rounded headline instead of the plotted
fixture endpoint. Its expected scale is corrected to +9.18 U (and +4.64 U for
the shorter period). The integrated run passed 59 cases; all 12 Research cases
then passed with the corrected assertion, covering all 60 integrated cases.
Eight final 320px Light/Dark and forced-color screenshots (lines and seasons)
were inspected. Fixture build and bundle/privacy checks also passed.

Source is on `codex/chart-unit-scales`. CI/merge, hosted release/readback and
physical-iPhone acceptance are separate open checkpoints. This work does not
complete stage 33's verified live status or stage 34's dependent Bet/Challenge
actions. No deployment, migration apply or frozen v62 tracker change is included.
