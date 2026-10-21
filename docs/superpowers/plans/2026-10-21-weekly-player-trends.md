# Weekly and player Trends Implementation Plan

> **For agentic workers:** Use subagent-driven-development sequentially with task review. The approved design is docs/superpowers/specs/2026-10-21-weekly-player-trends-design.md. User approval is already recorded; do not request duplicate approval.

**Goal:** Deliver weekly trends at week open and a Trends destination comparing matchup history, player guessing bias and realized outcomes.

**Architecture:** Reuse the pure trends engine behind an authenticated, cached weekly reader. Compute player insights from existing scoped history. A native token-based React destination shares these data sources with game sheets.

**Tech Stack:** Node 22+, React 19, Vite, Supabase Edge Functions/Deno, node:test, Vitest and Playwright.

## Global Constraints

- Work only in C:/Users/sbals/.codex/worktrees/weekly-player-trends/betting-repo, branch codex/weekly-player-trends; base origin/main 368f5d4. Preserve all other checkouts.
- Read AGENTS.md, docs/BRAND_GUIDE.md and design/tokens.json; new UI follows tokens-next. No new brand or paid feeds.
- D-39 gates apply before aggregation. Signed home spread convention; independent markets. No scoring or pick writes or migration applies.
- Existing frozen fixtures and v62 tracker stay unchanged. Explicit data age, source, sample and small-sample limitations.
- Missing is not zero. No fabricated records, market-adjustment claims or profitability claims. All player data remains authenticated.
- Authorize only reviewed named files for commits; no merge/deploy claims. Product approval covers this implementation.

## Task 1: Weekly publication and time-window evidence

Files: cloud/trends.mjs; cloud/trends-seed.mjs (generated); scripts/trends-seed.mjs; shared/trends.mjs; cloud/handler.mjs; cloud/feature-off.mjs; web/src/api.js; web/src/trendsLoaders.js; web/src/next/lines/trendsHooks.js; shared/lines-view.mjs; tests/weekly-trends.test.mjs; tests/trends-week.test.mjs; tests/trends-view.test.mjs.

Interface: POST /trends/week {season,week} authenticates with existing gtl_read_lines and requires published true. Reply is the existing week object plus availability {generatedAt,sourceAsOf,stale,reason} and optional windows on cards/rows. Generate from frozen history+registry and fetched current-season public schedule, allowPending true. Generated seed contains only public frozen assets and redacted season data. A service-provided reader and injected clock allow deterministic tests. Preserve old generateWeek default bytes by opting into windows; loader prefers hosted in cloud mode and uses labelled static fallback only for unavailable data, never on authentication/membership refusal.

- [x] Add tests for Monday prior to MNF final, independent per-game locks, missing published week, request field validation, non-member denial, single-flight/TTL, failed refresh, future field redaction and baseline fixture identity.
- [x] Implement generation and windows from the same registered side/units. Windows named last5,last10,season,years3,years5,all, each with W/L/P,n,from,to; entity rows retain both sides and do not select the winner retrospectively.
- [x] Generate and validate the importable seed with deterministic check mode. Keep client chunks free of seed/history and backend payloads free of current hidden lines.
- [x] Wire route group/service adapter and client TTL/retry/visibility refresh. Fetch only the pre-existing nflverse source with bounded reads; cache only public output, authenticate before every cache read. Update obsolete Monday-final publication copy.
- [x] Run node --test tests/weekly-trends.test.mjs tests/trends-week.test.mjs tests/trends-view.test.mjs and appropriate route/loader suites; report generation time and output size.
- [x] Review named files and commit. Write .local/trends-task-1-report.md with test output and concerns.

Test contract examples:
```js
assert.equal(publicWeek.games.length, published.games.length);
assert.equal(publicWeek.pending.some(p => p.team === 'BUF'), true);
assert.deepEqual(generateWithInjectedFutureLines(), generateWithoutFutureLines());
await assert.rejects(readAsRemovedMember(), { status: 403 });
assert.equal(fetchCallsForConcurrentSameWeekReads, 1);
```

## Task 2: Player insight and sentiment core

Files: shared/player-trends.mjs; tests/player-trends.test.mjs.

Interfaces: playerObservations(history, market) returns deduplicated authorized locked eligible observations with key,userId,season,week,game,guess,reference,points,result,market. buildPlayerTrends({observations, playerId, market, team, window, season, week}) returns metrics, windows, weekly chart series, contributing games, descriptive callouts and exclusions. buildSentiment({history,market,season,week}) returns only open game distributions with count, median and above/equal/below saved-reference counts. Export stable window options and shared labels for the UI. Do not derive sentiment from drafts, non-members or hidden games. History is already scoped; its members list is authoritative.

- [x] Test Panthers home and away: -7/-3.5 with a five-point win yields market cover and guessed-line loss; seven-point win yields guessed push. Test +7/+3.5 against the opponent gives identical team meaning. Test total 47 versus 43.5 and realized 45.
- [x] Test hidden sentinels do not affect any metric/label/chart/count, own unlocked drafts and null lines are excluded, same-game double entries are deduplicated, scored zero counts, original weeks survive Monday and multiple seasons.
- [x] Implement fixed orientation and separate outcome types, window filtering, denominator/interval rules, samples, chronological charts, all-team and team-specific recurring evidence, symmetric against-direction record and exact drilldowns.
- [x] Run node --test tests/player-trends.test.mjs and review/commit. Write .local/trends-task-2-report.md.

Executable metric expectations:
```js
assert.equal(referenceHome - guessHome, 3.5); // CAR home -7 vs -3.5
assert.equal(Math.sign(5 + -3.5), 1);
assert.equal(Math.sign(5 + -7), -1);
assert.equal(Math.sign(7 + -7), 0);
assert.equal(Math.sign(45 - 43.5), 1); // Over at market
assert.equal(Math.sign(45 - 47), -1); // Over at guessed total
```

## Task 3: Trends destination and per-game presentation

Files: web/src/next/trends/index.js; TrendsScreen.jsx; trends.css; useTrendsHistory.js; charts.jsx; web/src/next/shell/{state.js,tabs.js,Frame.jsx,registry.jsx,shell.css}; web/src/next/home/Home.jsx; web/src/next/lines/{GameSheet.jsx,parts.jsx}; tests/next-trends-ui.test.jsx; tests/cloud-browser/next-trends.spec.js; affected shell/router expectations.

Interfaces: consume existing useLinesData/useTrendWeek/useWind for published slate and weather; consume Task 1 week windows, Task 2 pure functions. Read scoped history with useLeagueRead and account+league+season key. Load all available requested seasons with abort support; never fall back across scopes. Keep shell.state.views.trends for filters, ensuring no private values enter URL.

- [x] Add This Week / Teams / Players, Spread / Total, player/team and window controls. Weekly view highlights at most three quality-sorted records and lists each game with accessible detail; Teams offers window comparisons; Players offers accuracy, signed team strength or total bias, result records and contributing games. Community sentiment uses only gated observations and is labelled as GTL guesses.
- [x] Add accessible SVG or meter charts with visible date/sample captions, explicit zero baseline and equivalent data tables. Null samples never render as zero; both themes and reduced motion use existing tokens.
- [x] Put weather before highlights in the game sheet and ensure trends remain present when forecast is unavailable. Add Trends navigation entry and Home exploration link. Seven tabs use an accessible contained horizontal rail with 44px minimum targets; selected tab scrolls into view without page overflow.
- [x] Add tests for navigation/reload/back, empty/loading/error/retry, market locks, scope changes and vanished data, current-week default, filters/drilldowns and keyboard labels. Browser tests at 320/390px light/dark include source network mocks and axe.
- [x] Run node shell/router/token checks, Vitest UI and targeted cloud-browser tests. Review/commit and write .local/trends-task-3-report.md.

## Task 4: Integration verification and published handoff

- [x] Run npm run check, relevant cloud-browser suite, brand QA and bundle privacy check. Fix failures and re-run covering checks, not unrelated broad repetitions.
- [x] Review complete branch diff independently for source rights, sign errors, lookahead, gated aggregates, cross-scope races, data failures, browser/API compatibility, theme/navigation and missing requirements.
- [x] Update docs/TRENDS.md, docs/COMPLETION_REGISTER.md and planning/PLATFORM_WORK_QUEUE.md with approval, actual source/tests, known hosted dependency and explicit no-deployment state. Preserve historical documents and records.
- [x] Commit reviewed named files; push branch; open/attach PR; npm run sync:check (integrated source 7094557, clean and equal to its remote).
- [ ] Final exact-commit CI and handoff receipt: record in PR #166 after the final test-only compatibility changes.
- [ ] Report branch, full commit, PR, verification, ahead/behind and unpublished work. Do not merge/apply/deploy without the separate release process.
