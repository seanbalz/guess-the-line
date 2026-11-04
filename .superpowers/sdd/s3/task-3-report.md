# Task 3 report
Status: DONE. Commit bc9ed7e629538e8f64f91b588b5fbbea6eb7b347.
Red run: `node --test tests/next-board-rows.test.mjs` -> "Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../web/src/next/lines/boardRows.js'" (fail 1). UI red: 3 board tests failed in next-lines-ui (picture rows, D-62 records, skeleton rows).
Green: board-rows 5/5; full vitest 80 files / 846 tests; tokens+loading node tests 22 pass, skipped 0; typecheck clean; build ok.
Changes beyond the brief: (1) the "after SEA @ DEN kicked off" leak-rule test read the card's Total cell; rewritten to read rows (Spread lock count, Total said in the row name) - same contract. (2) tests/cloud-browser/next-phone-layout.spec.js 320px/200% contract rewritten for picture rows (same file, same commit; checks row stays on screen, text inside row, no clipping, name block not running into Spread block). (3) .gx-l-wait given display:flex (it lost gx-vstack). Kept .gx-l-observation (RecordedResult.jsx uses it). No edits to ui/ or shell/.
Browser specs referencing removed card classes (.gx-l-card, .gx-l-team, -tname, -tag1/2, -val, -cfoot, -trend, data-chip) - Task 9 must update: next-lines.spec.js (many: lines 56, 669-696, 912-955, 1350-1413, 1526-1540, 1593-1607, 2461-2468), next-game-notes.spec.js:17, next-gestures.spec.js:27, next-research.spec.js:288, research-style-recovery.spec.js:14. Others mentioning Lines: next-data, next-home, next-shell, next-trends, next-feed, next-bets-*, comparisons-home (grep hits, likely title "Lines" / tab names).
Concerns: browser specs above are stale until Task 9; sheet (sh.game) still reads args.boardOrder, so pager from the rows depends on Task 2/layer wiring reading rememberedBoard(); removed trendsOnly/sh.allTrends board mode (no caller passed it). Skeleton row height 64px unmeasured.

## Fix wave 1

1. AUD-01: the row title is now nicknames ("Seahawks @ Broncos") built in web/src/next/lines/boardRows.js (falls back to the code matchup if a nick is missing); shared/lines-view.mjs untouched; the spoken name already used nicknames.
2. Mid-word breaks: ported the "a word that fits its line is never split" canvas check to `.gx-prow-title` / `.gx-prow-meta` in the 320 px / 200% Research spec. pictureRow.css: `overflow-wrap: anywhere` -> `break-word`. With full names the grid squeezed the name column to a sliver at 200% (letters stacked), so the row is now a wrapping flex row: main `flex: 1 1 10ch`, the Spread block drops beneath it when the name cannot keep 10ch. The spec's "name runs into the Spread" check now tests real overlap (horizontal and vertical). Note: the new word check passed even with `anywhere` once the layout wraps, so it is a guard, not a discriminating failure.
3. Dropped `min-height: 44px` from `.gx-l-lock` / `.gx-l-wait`.
4. ⓘ wording: "Each game lists its source, books and times." / "Each game lists its books and times."
5. tests/next-lines-ui.test.jsx: a Total open with no quote is spoken "Total —. Unavailable", never "Total line hidden", and the row carries exactly one lock (the Spread's).
6. boardRows.js: unknown labels map to `null` (test added in tests/next-board-rows.test.mjs).

Verification (executed): next-board-rows + next-tokens node tests 21 pass; next-lines-ui 22 pass; full vitest 850 pass / 80 files; typecheck and build clean; Playwright "Research" test passes (1 passed).
