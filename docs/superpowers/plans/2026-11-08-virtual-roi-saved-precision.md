# Saved-precision Virtual Units ROI implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Use saved four-decimal Virtual Units results for uniform week/season ROI and board ranking, as Sean confirmed by “Move forward with rec” on November 8, 2026.

**Architecture:** Correct the existing shared Virtual Units accounting model used by API and native views. Preserve four decimal places through amount normalization and week/season aggregation, then round the ROI percentage only at its existing two-place presentation boundary. The existing SQL readers, Recommended and awards paths already preserve saved precision; verify parity instead of changing those controllers.

**Tech Stack:** JavaScript modules, Node tests, React/Vitest, local PGlite, existing protected GitHub release workflow.

## Global constraints

- Preserve every saved selection, odds, result, settlement function, audit, receipt, score and timestamp; no data rewrite or migration in this ROI correction.
- Qualification remains three placed picks OR 3U; pending/void credit and settled-only ROI semantics remain unchanged.
- Board order remains ROI, then net units, then wins, with shared equal ranks. Historical ties may split because saved results now distinguish them; assess that impact explicitly.
- Preserve existing approved visual layouts, amount/percentage formatting, locks, reveal/privacy, roster, auth and controller behavior. Tracked real bets and award policy stay separate.
- Custom Virtual entry remains separate PR #497 / M-41. Do not merge/apply/enable that migration under this ROI-only approval. FEPL framing awaits the separately queued question.
- Work from fetched origin/main e746658cfbd6334d2087bff8c13e8298cd1c828b on codex/virtual-roi-saved-precision-2026-11-08; named files only. Preserve other worktrees and frozen design/tracker files.

### Task 1: Shared precision correction and impact evidence

**Files:** shared/bets-qual.mjs; tests/bets-qual.test.mjs; tests/bets-board-sql.test.mjs; focused existing native/API tests if needed; docs/RULES.md; docs/DECISIONS.md; docs/COMPLETION_REGISTER.md; docs/VIRTUAL_ROI_SAVED_PRECISION_2026_11_08.md.

- [ ] Inspect the model and the existing SQL/API/native consumers; record exact scope.
- [ ] Add meaningful failing tests for .01U/+ .0091U =91% and .5U/+ .4545U =90.9%; weekly and season aggregation, fractional net tie-breaks/shared ties, floating-sum stability, qualification below 3U, null ROI, pending/void/loss/push behavior and read-only input preservation.
- [ ] Reproduce failures on unchanged product source, then minimally preserve four-place saved amounts in the shared calculation. Do not round each week to cents before season totals.
- [ ] Extend the real PGlite/API parity test with saved fractional results and qualified players, preserving private roster filtering and no-term projections. Include existing >100U legacy read coverage; no new write maximum or precision rule.
- [ ] Run focused Node/SQL and native component consumers; typecheck and Brand QA. No default skips due to missing dependencies; install the lockfile with npm ci if required.
- [ ] Document owner confirmation, exact behavior, representative historical tie impact, scope of local/hosted assessment, compatible API/frontend release and rollback. Keep release status local until deployed. Amend current rules/decision log without rewriting historical source decisions.
- [ ] Commit named files and report red/green commands, results, warnings and exact commit to .local/roi-task-report.md.

### Task 2: Controller review, publication and release

- [ ] Task review with staged/committed full diff and task brief; resolve findings and do broad final review before merge.
- [ ] Obtain privacy-safe aggregate hosted before evidence if access is available; report any limits rather than infer actual rank changes from synthetic examples.
- [ ] Push reviewed named source, open PR, run sync:check, require exact CI before normal merge.
- [ ] Fresh protected readiness and release for compatible API/frontend from exact successful main source; preserve migration history and existing data. No SQL apply.
- [ ] Verify deployed source/assets/API metadata and approved native reading behavior to the available evidence scope, publish release evidence and report branch/full commit/PR/checks/unpublished work.
