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
existing Lines coverage also checks 390px and 1440px. CI, merge, release and actual
iPhone Safari/Home Screen acceptance remain separate. These refinements do not close
all Research work or Q19. New data sources, stronger prediction claims and
Fantasy expansion remain outside this design batch.

Community Members is merged in PR #211. Manual Settlement remains in
[PR #214](https://github.com/seanbalz/guess-the-lines-repo/pull/214), separate from
this design change. Week opening and other commissioner destinations stay in
Q17; M-18 challenge grading and M-19 scheduled settlement/status remain open.
The frozen v62 tracker is unchanged.
