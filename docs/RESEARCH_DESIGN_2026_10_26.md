# Research and chart design follow-through — October 26, 2026

Owner: Sean Balsiger · Approved D-55 direction · Source work, not a release

Sean redirected the next completion batch to player-facing design and selected
Research and charts. This takes priority over the next commissioner page. The
four-tab navigation, glow/soft-card direction and existing data rules remain.

## Changes

Research keeps its history state visible and moves snapshot dates, the period
anchor, source credit/license and filter explanations into “About research data”.
The shared explanations are also in Menu → Guidance and sources. Stale-history
warnings, Not proven/Emerging states, missing values, market locks and evidence
remain available under their existing rules.

Chart tooltips participate in layout instead of reserving a fixed-height space,
so wrapped dates cannot overlap the plot. At 320px, the three stat tiles use two
columns with the third spanning the row; the season table uses compact,
nonwrapping numbers. The original chart values, zero baseline, source periods,
qualification and break-even line do not change.

Line and season plots capture a drag and clamp it at both ends. Previously a
season drag left of the plot could select an invalid array index. The keyboard
slider still selects the same values, and vertical touch scrolling remains
allowed. The information dialog handles its own Escape/Tab events so they do
not also reach the underlying sheet; closing it returns focus to its opener.

## Verification and remaining work

Focused checks cover the compact header, exact provenance behind the information
button, keyboard focus/closing, tooltip/plot separation, edge dragging, slider
parity and single-line season/stat numbers. Browser fixtures use synthetic
research or the existing committed historical dataset with a disposable database;
no live player data or hosted writes are used. Light/Dark 320px screenshots are
reviewed alongside accessibility and preserved market-gate checks.

All 38 integrated Research, Lines, Trends and shell browser checks passed. The
three final focused checks also passed, including preserved credit/license links
and the added stale-history case. Five rendered-chart tests, 19 chart/token Node
tests, typecheck, Brand QA, the authenticated fixture build and bundle-only
privacy scan passed. Screenshots were inspected in Light and Dark at 320px;
existing Lines coverage also checks 390px and 1440px. PR #216 subsequently passed
all nine CI checks and merged as recorded below. Release and actual iPhone
Safari/Home Screen acceptance remain separate. These refinements do not close
all Research work or Q19. New data sources, stronger prediction claims and
Fantasy expansion remain outside this design batch.

Community Members is merged in PR #211. Manual Settlement remains in
[PR #214](https://github.com/seanbalz/guess-the-lines-repo/pull/214), separate from
this design change. Week opening and other commissioner destinations stay in
Q17; M-18 challenge grading and M-19 scheduled settlement/status remain open.
The frozen v62 tracker is unchanged.


## PR #216 merge and next chart batch

[PR #216](https://github.com/seanbalz/guess-the-lines-repo/pull/216) merged October 26
as `275c57fa1fedd4876cdf706e7b16a5e77bb52d66`. Its exact head
`06c500a124ca5eaf8730d41f024063edb625cbd7` passed all nine checks: Brand QA,
Typecheck/test, Windows, dashboard, personas and four browser shards. No review
requests or CI failures needed correction. This merge is source delivery, not a
new production release.

The next bounded batch fixes a chart accuracy defect and improves season reading:

- The old curve for `[0, 10, 10, 0]` rose above its equal high points. The new
  shape-preserving cubic interpolates every reported point while staying between
  adjacent endpoints. The regression failed before the repair and passes after
  it; positive/negative plateaus, uneven changes, reversals and flat lines are
  covered. Both full charts and compact sparklines use this geometry.
- Season tables show their column headings and win-rate percentages alongside
  their existing bars. Percentages count decided games, excluding pushes.
- A period with no decided games shows an em dash and no meter; trend stat tiles
  explain “No decided games.” A genuine 0% retains its zero-width meter. The
  missing season rate has the same explanation for screen readers.

No source values, qualification, scoring, market visibility or collection rules
change. D-58's final brand selection (PR #215) is reflected by the existing tokens;
this batch uses those fonts and colors.

The follow-up batch passed all 14 integrated Research/Lines browser tests and a
final focused rerun after the heading typography adjustment. Seven rendered-chart
tests, 20 chart/token Node tests, typecheck, Brand QA, the authenticated fixture
build and bundle-only privacy scan passed. Browser coverage includes 320/390/1440px
and Light/Dark accessibility; final 320px season-table screenshots were inspected.
The fixtures use synthetic/disposable data, not a live account or physical phone.
[PR #218](https://github.com/seanbalz/guess-the-lines-repo/pull/218) merged October 26
as `657eb1946b20927cc8a668373276c3844127095e`, after all nine checks passed on
`7bfbe8546bcc5370dc8e1f57555f318031386a95`. No CI fixes or review requests were
needed. Hosted release and actual-device acceptance remain open. After the
season-selection source batch below, DESIGN-01 still needs release verification
and Research/chart acceptance on iPhone Safari and
Home Screen in both themes, including long labels, drag/keyboard selection and
missing/stale evidence. Sean's corrected no-scroll-bug report is retained; this
batch does not reopen that symptom or close broader Q19.


## Season selection follow-through

The next approved D-55 interaction connects the season table to the stem chart.
Each year is a named button with a touch target of at least 44 × 44px and a 16px
number. The selected year has a check, outline and pressed state; the selection
is not conveyed by color alone. Table activation, dragging and the keyboard
slider all update the same season. Switching to the cumulative line and back
retains the chosen year. Selection stays keyed to the year rather than a row
position; if that year is unavailable, the latest supplied season is shown.

Table activation keeps focus on its button and does not force a scroll to the
chart. An accessible controls relationship identifies the connected chart. A
zero-unit season is described as “at break-even,” not “above break-even.” The
existing records, units, data gates and seasonal summaries remain unchanged.

Nine rendered-chart tests, 20 chart/token tests, typecheck, Brand QA, the
fixture build and bundle privacy scan passed. Two focused browser checks passed
for selection, view switching, dragging, keyboard control, 44px targets, 320px
layout and accessibility. Light/Dark selected-row screenshots were inspected.
All 19 integrated Research/Lines/Trends browser tests also passed.
[PR #222](https://github.com/seanbalz/guess-the-lines-repo/pull/222) merged as
`71bb47b46737fc309ad778a593a72d130a1c67d5` after all nine checks passed on
`8cc4042b6bdd94c65095d2bd8105e6a27a00a969`. No CI fixes or review requests
were needed. Deployment and physical-iPhone acceptance remain open.

PR #224 delivers [per-game market details](RESEARCH_MARKET_DETAILS_2026_10_26.md).
The remaining board-wide lines and full game-sheet destinations are explicit in
the queue; these chart refinements do not complete stages 33–34.


## Board current quotes and gate entry

PR #225 supplies [the Lines board](RESEARCH_BOARD_LINES_2026_10_26.md).
It uses the displayed week’s existing reader for current/latest quotes, while
the game sheet preserves saved scoring references. The banner leads to Play’s
existing lock-in/sit-out flow. The queue retains direct in-board confirmation,
verified live status and remaining full-sheet destinations as unfinished.

[PR #224](https://github.com/seanbalz/guess-the-lines-repo/pull/224) merged as
`97273e9652cf29dca77208488deb7c6c858646a4` after all nine checks passed on
`473be765f015fcf7d88853979bc8d246f878ddf1`. No CI fixes or review responses were
needed. The board batch follows on a separate branch; neither merge nor local
verification establishes a hosted release or phone acceptance.


## Community guesses in the game sheet

The next source batch adds [Everyone’s guesses](RESEARCH_GAME_GUESSES_2026_10_26.md)
to each game sheet. It reads only on expansion and distinguishes Community scope,
private drafts, locked guesses, score availability and kickoff ranks. The current
queue retains the direct reveal flow, full game-sheet actions, League bets,
release verification and device acceptance as unfinished.

[PR #225](https://github.com/seanbalz/guess-the-lines-repo/pull/225) merged as
`733e95d586e005427350ba156d7ad1a05c139094` after all nine checks passed on
`cf9ebe16c88975fefcc0d0a2168cc069741152c3`. No CI fixes or review responses were needed.
Community guesses follow on a separate branch; release and phone acceptance
remain open for the source batches.

## Cumulative chart records — October 27

The D-55 Research line now pairs cumulative units with a cumulative win/loss/push
record in its tooltip and keyboard announcement. Previously each plotted point
used the cumulative units supplied by the reader but only that date bin's record.
For example, a first bin of 2–1–1 followed by a 0–2 bin showed 0–2 next to the
running −1.18 units; the tooltip now correctly shows 2–3–1 through that date.
The plotted units remain the reader's values, with no recalculation.

The evidence table retains its exact per-period records and games, with explicit
“Period W-L-P” and “Total units” headings and a caption explaining the distinction.
The correction applies to shortlist charts and charts loaded through an evidence
expansion. It uses the existing tokens and compact tooltip; no data eligibility,
qualification, market visibility or collection behavior changes.

A regression failed against the old tooltip and passed after the repair. All 25
Research/chart component tests and 72 chart/token/Research model and handler tests
passed with zero skips. The focused browser case checks multiple bins, pushes,
keyboard selection, a changed display period, retained market locks, 320px layout
and Light/Dark accessibility. Both themes' chart and table screenshots were
inspected. Typecheck, Brand QA, the fixture build and bundle privacy scan passed.
All 50 integrated Research, Lines, Trends and League-bets browser tests also
passed. CI/merge, hosted release and physical-iPhone acceptance remain separate.
