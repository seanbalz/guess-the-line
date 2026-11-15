# Parlay Lab fixes: integration QA — November 15, 2026

Status: integrated locally, not deployed. Base: `c014d7bda97044cf3ea785cbfdc0db9f0b487486`.

Integrated offer pipeline (`7dfed029`, `6806fa9d`), direct Research navigation
(`2da3a811`) and price-first tabbed UI (`cac436ef`) without conflicts.

## Product contract verified with synthetic captures

The integration test exercises retained captures → sourced appearance baseline →
reveal-gated assessments → same-book multi-game idea → rendered ticket. Different
best-price books do not erase the shared-book ticket. Both leg prices, supporting
rationale, risks and shortlist control render. Combined odds/probability remain
absent, not invented. Locked and stale captures cannot produce tickets. Advancing
time removes expired alternate-book offers as well as the best quote.

These fixtures are synthetic, not evidence that live books currently have offers.
Historical appearance means remain explicitly descriptive, not calibrated edges.

## Privacy, cost and scope review

The authenticated assessment route obtains the caller's reveal board before
reading retained quotes. Only both-revealed future games are queried. Latest empty
captures withdraw older quotes. Invalid/stale quotes are filtered; row and candidate
bounds fail closed or report truncated coverage. This read path makes no paid
provider request. No migration, account credential, API flag, collector schedule,
live data or deployment was changed.

## Remaining acceptance gates

- Verify fresh retained bookmaker captures on production, including collector
  configuration and allowed free quota. Otherwise UI will correctly be empty.
- Refresh research after deployment to include exact baseline training periods.
- Run signed-in mobile acceptance with current lines and a complete ticket.
  Local Chromium launch fails `socket() failed: Operation not permitted` even
  on the approved elevated attempt. No screenshot/axe pass is claimed.
- Exact committed source still requires hosted CI and protected release workflow.

Focused local checks: 153 research/parlay Node tests passed, 2 skipped; 23
component tests passed plus 3 new integrated contract tests passed. Typecheck,
Brand document QA and whitespace checks passed. Initial unbounded aggregate test
and concurrent build were resource-killed; bounded rerun is tracked separately.

Aggregate follow-up: all 107 Vitest files / 1,046 tests passed at maxWorkers=2;
production cloud build passed in 6.64 seconds. The independent cloud-boundary
check is blocked by absent `.env.cloud` in this clean worktree; credentials were
not copied. Full Node/optional SQL aggregate completed: 3,385 passed, four failed. Failures
were unchanged points-jobs SQL and social-auto-settle test processes, plus two
rollback aggregate tests (including M48); nested output includes SIGKILL. This
is not a full aggregate pass and requires hosted CI/resource-sufficient rerun.

## Independent review fixes

Follow-up `7f45d39e` (integrated as `22dacabc`) closes two reproduced blockers:
imported opposing evidence cannot disappear behind a generated duplicate, and a
global 90-offer cutoff can no longer starve the second game needed for a ticket.
Evidence consolidation occurs only after reveal gating; hidden dependencies do
not leak. Compatibility search is grouped by book and pruned by game diversity.

Post-review checks: 159 relevant Node tests passed; 107 Vitest files / 1,046 tests
passed; typecheck passed. No new live operations performed.
