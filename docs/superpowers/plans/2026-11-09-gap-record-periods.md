# Gap record periods implementation plan

> **For agentic workers:** Execute inline with executing-plans; obtain an independent code review before merge.

**Goal:** Add the approved historical-period filters without changing D-77 grading.

**Architecture:** Select published weeks and combine authenticated weekly lines
boards in a focused model/loader. A small hook and period form feed the existing
GapRecord presentation. The recommendation week and writes remain independent.

**Tech Stack:** React 19, existing linesApi, Node test runner, Vitest, Playwright CLI.

## Global constraints

- Use `docs/superpowers/specs/2026-11-09-gap-record-periods-design.md` as approved scope.
- Existing `gapRecord` remains the only grading function; no SQL/API/provider changes.
- No partial aggregates, account leakage or persisted private browser data.
- Preserve Prism tokens, full week provenance and existing per-game drilldown/Back.

## Task 1 — period model and bounded authenticated reads

Files: create `web/src/next/bets/gapPeriods.js`; create `tests/next-gap-periods.test.mjs`.

- [x] Test first: select weeks for Week/season/all/custom, reject reversed or unknown
  bounds, combine duplicate matchup IDs without collisions and calculate weighted
  win rate with pushes using real D-77 fixtures. Example: 1–0 plus 1–3 => 2/5 = 40%.
- [x] Run `node --test tests/next-gap-periods.test.mjs`; observe missing-feature failure.
- [x] Implement `periodWeeks(slates, {period, season, week, from, to})`,
  `combineGapBoards(boards)` and `loadGapBoards(weeks, {board, read, signal})`.
  Loader reuses matching board, validates each returned scope, bounds concurrency
  to three and rejects failures instead of returning partial totals.
- [x] Run model tests plus `tests/next-gap-record-view.test.mjs` and
  `tests/recommended-bets.test.mjs`; require zero failures. Commit named files.

## Task 2 — approved controls and current component integration

Files: create `web/src/next/bets/useGapPeriod.js` and `GapPeriodControl.jsx`;
modify `GapRecord.jsx`, `gapRecordView.js`, `gapRecord.css`,
`web/src/VirtualUnits.jsx`; create `tests/next-gap-periods-ui.test.jsx`.

- [x] Test labelled controls, selected period summary, no stale numbers during
  loading/error, Retry, range Apply and row season/week provenance before code.
- [x] Run focused Vitest to observe the expected missing UI failure.
- [x] Wire `season`, `week`, `slates`, `market`, account identity and sign-in retry
  from VirtualUnits into GapRecord. Retain Week default and existing recommendation
  selection. Hook reads only on applied scope changes, aborts superseded reads and
  recomputes market/tier from the complete combined board.
- [x] Render approved Record period, Custom From/To/Apply and coverage copy with
  native selects. Error/empty/loading states are local to the record. Detail and
  list use actual row season/week, not the recommendation's displayed week.
- [x] Verify focused tests, typecheck, Brand QA and build. Commit named files.

## Task 3 — browser verification, review and release

- [x] Use an isolated CLI browser and controlled signed-in fixture, both themes
  at 320/390/768px. Exercise All time, This season, cross-week Custom, error/retry,
  market/tier, detail/Back and end clearance; inspect captures. No new browser spec.
- [x] Run `npm test`, `npm run typecheck`, `python scripts/check-brand-docs.py`,
  `npm run build`, and `git diff --check`; record actual counts and limitations.
- [x] Update completion register with evidence, create reviewed source PR, push and
  run sync:check. Obtain code-review approval and exact-head required CI.
- [x] Merge normally, verify exact-main CI and tree, sync the owned clean integration
  checkout. Follow SHARED_DEPLOYMENT frontend-only source/readiness/deploy gates.
- [ ] Record verified production asset/API/migration evidence in a documentation
  followup PR, review/merge/sync. Do not redeploy for documentation/test-only changes.

Release evidence preparation: PR #505 merged as `9a34f9e4` with an identical
reviewed tree; all twelve PR/main checks passed. Frontend-only deploy 42665392227
verified all 132 production assets at 2026-11-09T17:35:54.506Z. The final unchecked
publication item reflects this preparation stage; its PR merge/sync receipt is
recorded through GitHub and the final handoff, not an additional app release.

PR #507's initial Cloud 2 check failed a test setup assumption before the badge
click: visibility gave 72px scroll rather than the asserted greater than 100px.
The followup explicitly centers the badge and preserves every existing product
assertion. See the release record for the retained failed run and correction;
this does not change the deployed app or require another frontend release.
