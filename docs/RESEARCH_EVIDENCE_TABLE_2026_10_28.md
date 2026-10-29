# Readable Research evidence — October 28, 2026

Owner: Codex · DESIGN-01 · Approved D-55 Research/chart follow-through

Research's historical evidence table used 13px for records, game counts and
cumulative units. These primary values now use the existing 16px numeric type
with tabular figures; column headers retain the 13px meta style. Date controls,
records, sample counts and raw unit values remain the same. Excess width stays
inside the existing keyboard-focusable scroll region, with its shared focus ring
and the sample description outside the horizontal scroll area.

The region and period-button accessible names include the visible candidate
title. Identical dates in different research situations now identify which
chart they control. Native captions retain the selected sample and the
period-record versus cumulative-unit distinction. Untitled callers retain the
generic fallback name. No new chart state, data read, calculation or provider.

D-55 still opens one detail per Research list. The browser test scrolls the
current table, then switches candidates to verify the next table's own name and
chart linkage. It does not introduce simultaneous open details or carry a
closed chart's selection into a different candidate.

## Verification checkpoint

After following the existing one-open-detail flow, the new regression failed
against the old implementation: the record computed to 13px instead of 16px.
It covers 320px and 390px Light/Dark and forced colors, plus simulated 200%
table-text enlargement at 320px; theme selection uses the saved preference and
asserts the resolved theme. Keyboard scrolling must expose the final units
column without changing selection, adding reads or overflowing the page.
Period controls retain focus, their pressed state and matching chart endpoint.
Switching candidates checks an independent default selection and chart link.
Synthetic evidence is layout/test data, not historical or hosted results.

A component test checks candidate-specific table/control names, native captions,
chart IDs and the untitled fallback. All 470 Vitest tests, 27 chart/token/brand
checks and typecheck passed. Both focused browser cases passed on an isolated
fixture preview, followed by all 17 Research/style-recovery cases. Twenty-four
start/end screenshots were captured; six representative 320/390px, Light/Dark,
forced-color and enlarged-text captures were visually inspected. Brand QA and
the final fixture bundle privacy scan passed. Five nearby Lines cases also
passed, covering season readability/selection, weekly-trend coexistence, market
details and stylesheet recovery (22 targeted browser cases in total).

The first integrated attempt could not start because the preview from an
interrupted run was still listening. That exact owned process was identified
and stopped before the isolated rerun. An earlier focused run timed out at the
initial app-ready state after five seconds; the setup now waits up to 30 seconds
for authenticated Main navigation and the Lines heading, without changing
product behavior or evidence assertions. The existing Opposition-candidate
selector now includes its own title after the accessible-name change.

## Source and remaining checkpoints

Branch: `codex/research-evidence-table`, [PR #321](https://github.com/seanbalz/guess-the-line/pull/321)
(open; own CI and merge pending). PR #313 merged as
`9eadb74370ff819496ba5457059f5b643a99e9da` after all nine checks passed on
`81c9286825151e1a725d367ea4b60cb0a5a0c288`; reviews and threads were empty. This batch
needs its own CI/merge, release/readback and physical-iPhone/assistive-technology
acceptance. The frozen v62 tracker is preserved. Remaining live-status and
Bet/Challenge destinations remain open. No deployment, migration apply,
collection-budget change or product-rule change.

Main was integrated through `bdbd04a` (#319). Incoming changes were release,
readback and preservation documents only; the tested application/test tree did
not change. The completion register and queue carry the committed #312 release
and #319 desktop readback as release-lane evidence, not a new hosted audit here.
