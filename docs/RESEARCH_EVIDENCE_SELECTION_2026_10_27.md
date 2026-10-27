# Research evidence selection — October 27, 2026

Owner: Sean Balsiger · Approved D-55 Research/chart follow-through · Source work

Research's historical table and cumulative chart previously required manual
comparison. The date in each period row now selects its cumulative endpoint;
keyboard or pointer chart selection marks the corresponding row with a check
and tint (an outline in forced colors). The initial zero baseline has no period
row. Period W-L-P, sample counts and cumulative unit values stay unchanged.

The same behavior works when a chart is first loaded through View evidence.
Hiding and reopening the table retains chart selection; changed chart evidence
resets to the latest point. A separately refreshed table only gets controls when
its charted values, labels and dates match the visible chart. Otherwise it stays
a readable table without a misleading selection. No backend reads or writes are
added by selecting a row or chart point. Focus stays on the control used.

The sample description sits outside the table's horizontal scrolling region so
it remains readable at 320px; the native caption stays available to assistive
technology. Dates keep 44px touch targets and existing GTL tokens.

The missing-control browser regression failed before implementation. Two focused
browser cases passed after it, including shared selection, period changes,
separately loaded charts and mismatched replies. All 51 chart/Lines/Research
component tests, 26 geometry/token/brand-mark tests and typecheck passed.
All 59 integrated Research/Lines/Trends/League-bets browser cases passed. The
12 Research cases passed again after the final caption and accessible-name
refinements. Same-day periods have distinct control names; chart/table selection
adds no detail requests. Brand QA and fixture build/privacy checks passed.
Four final 320px Light/Dark and forced-color screenshots were inspected using
synthetic fixture data.
Source is in [PR #263](https://github.com/seanbalz/guess-the-lines-repo/pull/263)
on `codex/research-evidence-selection`.

CI/merge, hosted release/readback and physical-iPhone acceptance remain open.
No deployment, migration apply or frozen v62 tracker changes are included.
