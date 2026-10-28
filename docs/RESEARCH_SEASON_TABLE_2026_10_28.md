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
selection. Twenty-four final start/end captures were inspected. The test selects
the saved Light/Dark preference and asserts the resolved theme before capturing;
direct dataset changes could be reset by the color-scheme listener. All 469
Vitest tests, 27 chart/token/brand tests, typecheck, Brand QA and final fixture
privacy checks pass. The first expanded run passed 110/111; its style-recovery
test navigated away before sign-in finished. That helper is being repaired in
#310. Main’s #308 URL correction and #305 new-app-only transition are being
integrated; final browser verification will use their current entry flow.

## Source and remaining checkpoints

Branch: `codex/research-season-table`. PR #310's CI/merge is pending. This batch
needs its own CI/merge, release/readback and physical-iPhone/assistive-technology
acceptance. Remaining live-status and dependent Bet/Challenge destinations stay
open. No deployment, migration apply, collection-budget change or frozen v62
tracker edit.
