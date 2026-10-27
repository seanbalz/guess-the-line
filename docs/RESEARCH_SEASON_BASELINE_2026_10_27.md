# Season baseline and proportional stems — October 27, 2026

Owner: Sean Balsiger · Approved D-55 Research/chart follow-through · Source work

Season charts previously gave every season a stem at least 2% of the plot's
height. A break-even season therefore appeared to earn units, and small gains
or losses were enlarged relative to larger seasons.

Stem lengths now retain their actual proportions. Exact zero has a hollow
marker centered on the baseline, without a positive or negative stem. The plot
has a visible “0 U · break-even” key. Missing units have no mark and are announced
as unavailable. No outcome, unit value, qualification or source record changes.
The selected season remains connected to the table and keyboard slider, including
when switching chart views. The marker and its selection outline work in forced
colors using existing GTL tokens and system colors.

Before the correction, two geometry assertions and the new rendered marker test
failed. The corrected branch passes all 49 chart/Lines/Research component tests
and 26 geometry/token/brand-mark tests, plus typecheck and Brand QA. The focused
browser case passed with fictional season values supplied through the authenticated
fixture reader. It checks zero, small gains/losses, baseline alignment, table and
keyboard selection, view switching, market privacy and accessibility in 320px
Light/Dark and both forced-color themes. All 56 integrated Research/Lines/Trends/
League-bets browser cases passed. Four final screenshots were inspected; fixture
build and bundle privacy checks passed. Source publication is pending on
`codex/season-zero-markers`.

CI/merge, hosted release/readback and physical-iPhone acceptance remain open.
This task does not deploy, apply migrations or change the frozen v62 tracker.
