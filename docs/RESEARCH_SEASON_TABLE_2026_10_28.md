# Readable season tables — October 28, 2026

Owner: Codex · DESIGN-01 · Approved D-55 Research/chart follow-through

The By season evidence table reduced every cell to 13px below 360px and hid
horizontal overflow. Season records, percentages and units now retain their
normal 16px reading size. Headers remain 13px meta text and the narrow layout
keeps its compact cell padding. Values stay on one line without shrinking or
truncation; any excess width scrolls inside the table instead of the page.

The native table and caption remain. Its wrapper is a keyboard-focusable region
named Season results plus the visible trend title, with the shared focus ring.
This lets keyboard users scroll to every column and distinguishes multiple
season tables. Year controls keep their 44px targets, pressed/check treatment,
chart relationship and focus. Scrolling reads no new data and changes no chart
selection. Selecting a year retains the existing chart/table synchronization.

This uses the approved typography, theme tokens and chart system. It adds no
provider, endpoint, scoring rule, trend calculation or product setting. The
shared change covers season tables wherever TrendDetail renders them, including
game and All trends sheets and Research's Trends view.

## Verification

A new real-handler browser regression failed against the prior implementation:
the 320px season record computed to 13px instead of 16px. Synthetic wide season
records exercise layout only; they are not historical or hosted results. The
focused test checks 320px and 390px Light/Dark and forced colors, plus simulated
200% table-text enlargement at 320px. Ordinary records can fit without scrolling;
enlarged records must allow keyboard scrolling to the last Units column. It
also checks native semantics, retained focus/selection, no page overflow, no new
weekly read or writes, and axe.

The phone-layout helper now recognizes the intentional named table scrollport;
cell text must still fit its own cell and the scrollport must fit the page.
A component regression checks distinct region names and native captions.
Both focused cases pass, including existing line/season switching and retained
selection. Twenty-four table start/end captures were inspected; the current-entry
build was spot-checked again. The test selects the saved Light/Dark preference and asserts the resolved theme before capturing;
direct dataset changes could be reset by the color-scheme listener. All 469
Vitest tests, 27 chart/token/brand tests, typecheck, Brand QA and final fixture
privacy checks pass. The first expanded run passed 110/111; its style-recovery
test navigated away before sign-in finished. PR #310 includes the authentication-
readiness repair and current-main integration in `6f5e324d2cd69772b47ae9fb88d39d125522c334`.
Main’s #308 URL correction passed nine focused browser cases and 21 Fantasy
API/publish checks. After #305 (D-65), five current-entry-flow smoke cases,
all 469 Vitest cases, 37 app-view/shell-state/router checks and typecheck pass.
Four Research/Trends/gesture/style-recovery helpers now wait for authenticated
Main navigation. All 109 final current-app integration cases pass; the earlier
111-case set included two classic Fantasy cases retired by #305. This task
integrates that existing decision; it does not perform its production cutover.

## Source and remaining checkpoints

Branch: `codex/research-season-table`. PR [#310](https://github.com/seanbalz/guess-the-line/pull/310) merged as
`06a4de7e4513e04fd2555b734045d09756bc2518` after all nine checks passed on
`6f5e324d2cd69772b47ae9fb88d39d125522c334`. Reviews and threads were empty.
The merge added no changes to the tested application/test tree.
PR [#313](https://github.com/seanbalz/guess-the-line/pull/313) subsequently merged
October 28 as `9eadb74370ff819496ba5457059f5b643a99e9da`. All nine checks
passed on `81c9286825151e1a725d367ea4b60cb0a5a0c288`; reviews and threads
were empty, with no failed checks requiring repair. The merged state was read
back from GitHub in this follow-through. Release/readback and physical-iPhone/
assistive-technology acceptance remain open. Remaining live-status and dependent
Bet/Challenge destinations stay open. No deployment, migration apply, collection-budget change or frozen v62
tracker edit.
