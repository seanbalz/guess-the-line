# NBA Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Owner: Sean Balsiger · Version 1 · October 21, 2026

**Goal:** Add an authenticated daily NBA game board and private ticket tracker,
including existing archived tickets, without mixing NBA and NFL records or totals.

**Architecture:** Reuse the existing app's sign-in, theme and presentation kit;
mount NBA before NFL lobby/group eligibility. Use a separate NBA route module,
owner-scoped database operations and a shared schedule cache. The original NBA
archive remains the ticket source of truth; no copy/import is needed.

**Tech Stack:** React 19, existing Vite/cloud API, PostgreSQL/Supabase, Node test,
Vitest, PGlite and Playwright. Use existing dependencies.

## Global Constraints

- NBA tickets and summaries remain private; neither NFL feeds nor NFL/Virtual Units totals include them.
- Keep `nba_private.bets` as the authoritative ticket store.
- Original source payloads and administrative import receipts are not exposed to the browser.
- Preserve the existing four-decimal stored price and eight-decimal accounting precision.
- First-release bet outcomes are owner-confirmed: Pending, Win, Loss, Push or Void.
- A parlay requires its quoted combined odds; do not multiply leg prices to invent a price.
- No generic database push, unrelated migrations, synthetic production bets or paid provider calls.
- Use existing `gx-` components/tokens, Light/Dark/System, 16px tappable labels and 44px minimum targets.
- Do not deploy an incomplete source connection. Fixture success is not hosted acceptance.

## Delivery and file boundaries

1. Private ticket contract, additive owner operations and authenticated routes.
2. Free schedule/results adapter, shared cache and rate control.
3. NBA sport navigation, daily board, entry, history and correction flow.
4. Cross-layer privacy, browser verification, reviewed release evidence and sync.

Each task gets a focused red/green cycle, named commit and independent review.
This plan is authorized for execution; there is no further planning approval gate.
The existing isolated `codex/nba-section-design` branch and draft PR #167 carry
the build. Baseline: 17 archive/router tests passed without skips on October 21.

## Source qualification

Use BALLDONTLIE's free NBA Games endpoint, not paid box-score or odds endpoints.
The [NBA documentation](https://nba.balldontlie.io/) lists Games on the free tier
at five requests per minute and documents game lifecycle, timestamps, scores
and pagination. The [terms](https://www.balldontlie.io/terms), dated October 20,
permit data display/cache in downstream apps; do not offer a substitute data API
or claim league endorsement. Preserve attribution and observation times in UI.

The server-only `BALLDONTLIE_API_KEY` must be configured and a real authenticated
Games response verified before launch. The user has been asked to configure it
securely in Supabase; no secret belongs in chat, Git or Vite variables. Build and
test with synthetic provider fixtures while that connection is pending.

### Task 1: Private NBA ticket operations

**Files:** Create `shared/nba-bets.mjs`, `cloud/nba.mjs`,
`supabase/migrations/20261021223000_gtl_nba_app_bets.sql` and matching rollback;
`tests/nba-bets.test.mjs`, `tests/nba-app-sql.test.mjs`, `tests/nba-cloud.test.mjs`.
Modify `cloud/handler.mjs`, `tests/migrations.mjs` and any named boundary/route
inventory tests required by the existing conventions.

**Interfaces:**

```js
// Shared pure input normalization; no source payloads or real tickets.
normalizeNbaTicket(input); // throws validation error; returns canonical ticket
probabilityToAmerican(percent); // number rounded to 4 decimal places
// API: POST /nba/read and POST /nba/save. Identity comes from verified user.
// read request: { filters: { status, market, from, to }, cursor?, ticketId? }
// read response: { tickets, nextCursor, summary }
// save request: { operationId, ticket, expectedRevision, reason? }
// save response: { ticket }
// Ticket fields: id, revision, season, eventDate, kind, label, legs, odds,
// stakeUnits, outcome, netUnits, priceInput, updatedAt, audit (safe corrections).
// Leg fields: gameId, matchup, market, team?, side?, line?; market is
// moneyline/spread/total. PriceInput: { format: 'american'|'probability', value }.
```

- [ ] Write tests for conversion, required terms, independent parlay legs,
  pending/push/void accounting, exact retries, conflict revisions, cross-owner
  denials and archive preservation. Representative assertions:

```js
assert.equal(probabilityToAmerican(57), -132.5581);
assert.equal(probabilityToAmerican(49), 104.0816);
assert.equal(probabilityToAmerican(50), 100);
assert.throws(() => probabilityToAmerican(100));
assert.equal((await readAs(otherAccount)).tickets.length, 0);
assert.deepEqual(await originalImportPayload(), beforeImportPayload);
```

- [ ] Run `node --test tests/nba-bets.test.mjs tests/nba-app-sql.test.mjs tests/nba-cloud.test.mjs`; confirm meaningful failures before implementation.
- [ ] Implement the shared contract and SQL operations. Add revisions and update
  timestamps without rewriting imported terms. Store append-only change receipts
  with operation IDs and canonical payloads; lock ticket rows for revision checks.
  Same operation/payload retries return its original receipt; conflicting reuse
  fails. Keep original imports/source records immutable and admin-only.
- [ ] Implement service-only, fixed-search-path RPCs `gtl_nba_read_bets` and
  `gtl_nba_save_bet`. Explicitly scope every query/update by verified owner ID,
  with no broad table grants. Only the authenticated API supplies `p_user_id`;
  client-supplied identity is rejected. Read returns a safe projection, not raw
  JSON provenance. Page at 100 tickets using date/ID cursors; filtered summaries
  cover the entire matching set. Include a single-ticket read for save recovery.
- [ ] Route the two endpoints immediately after Auth verification and before NFL
  eligibility. No NBA route calls NFL membership or writes NFL objects. Map
  validation/conflict/missing-feature errors without returning provider details.
  Follow existing service RPC and route inventory patterns; rollback revokes
  added capabilities and preserves every NBA row and audit.
- [ ] Run focused tests, archive regression, migration registry, function headers,
  rollback conventions and route-module tests. Review/stage named files and commit.

### Task 2: Daily board with a bounded free provider

**Files:** Create `shared/nba-games.mjs`, `cloud/nba-games.mjs`,
`supabase/migrations/20261021223100_gtl_nba_game_cache.sql` and matching rollback;
`tests/nba-games.test.mjs`, `tests/nba-game-cache.test.mjs`.
Modify `cloud/nba.mjs`, `cloud/handler.mjs`,
`supabase/functions/gtl-api/index.ts`, `tests/migrations.mjs`.

**Interfaces:**

```js
normalizeNbaGames(payload, observedAt); // validated canonical games, no fake scores
gamesForLocalDate(games, date, timeZone); // ISO date + validated IANA zone
createNbaGamesService({ apiKey, fetchImpl, cache, clock }); // .read({date,timeZone})
// POST /nba/games { date:'YYYY-MM-DD', timeZone:'America/Los_Angeles' }
// => { date, timeZone, games, observedAt, stale, unavailable, source }
// Game: id, startTime, sourceDate, home:{id,name,abbreviation}, away:{...},
// status, statusText, homeScore, awayScore, observedAt.
```

- [ ] Write provider fixtures covering scheduled/live/final, postponed/canceled/
  unknown, missing scores, midnight/timezone/DST, pagination, timeouts, 401/429,
  malformed replies and stale-cache retention. Scheduled zero scores become null;
  a valid in-progress zero stays zero. Status is never inferred solely from score.

```js
assert.equal(normalizeNbaGames(scheduledFixture, observedAt)[0].homeScore, null);
assert.equal(gamesForLocalDate([lateGame], '2026-10-21', 'America/Los_Angeles').length, 1);
assert.equal((await offlineService.read(request)).stale, true);
assert.equal((await missingKeyService.read(request)).unavailable, true);
```

- [ ] Confirm red with `node --test tests/nba-games.test.mjs tests/nba-game-cache.test.mjs`.
- [ ] Implement validated provider GET `/v1/games`, `per_page=100`, requesting
  the selected ISO date plus adjacent dates to cover timezone boundaries. Do not
  publish a partial page: if a cursor remains, retain old data and report
  unavailable refresh. Only HTTPS provider origin is allowed, redirect errors,
  timeout bounded to 10 seconds, no secret/error-body logging.
- [ ] Add NBA-only database cache with a global provider lease/cooldown. Allow
  at most one provider call per 20 seconds across all instances and a five-minute
  refresh TTL per date range. Only the lease holder publishes a complete result;
  stale/failed workers cannot replace newer data. Release failures retain cache.
  Client reloads do not bypass TTL, cooldown or claims. Cache/read functions are
  narrow service RPCs with no client writes; rollback preserves cached rows.
- [ ] Wire `BALLDONTLIE_API_KEY` only in the Edge Function. Reads serve cache and
  refresh on demand within those limits; while a screen is open the browser asks
  no more frequently than once per five minutes. No new background cron is needed
  for this release. Missing configuration returns an honest unavailable state,
  never an empty successful slate.
- [ ] Run focused tests and Task 1 regressions; register migration/boundaries,
  review named changes and commit. Document real-source validation as pending
  until the configured provider has actually answered successfully.

### Task 3: NBA section and private ticket workflows

**Files:** Create `web/src/next/nba/{NbaApp.jsx,Games.jsx,Bets.jsx,BetEditor.jsx,api.js,route.js,useNbaData.js,nba.css}`;
modify `web/src/next/NextApp.jsx`, `web/src/next/shell/Frame.jsx`,
`web/src/next/shell/Shell.jsx`, `web/src/main.jsx` and the minimal classic
`web/src/GameHub.jsx` entry needed to expose NBA without NFL lobby reads. Keep
`DEFAULT_APP` unchanged and retain the classic escape hatch. Create `tests/nba-ui.test.jsx`,
`tests/nba-route.test.mjs`, `tests/cloud-browser/nba.spec.js`.

**Interfaces:**

```js
// NBA is mounted before AppDataProvider/AppGate; NFL keeps its current subtree.
<NbaApp session={session} onSignOut={onSignOut} onSportChange={showNfl} />
nbaApi('read', body, { signal }); // cloudApi('nba/read', body, options)
nbaApi('save', body, { signal }); // save:true for uncertain response handling
nbaApi('games', body, { signal });
// NBA hash namespace: #nba/games?date=YYYY-MM-DD, #nba/bets, #nba/history.
// Query parameters also retain status/market/date-range filters. Existing NFL
// hashes continue to work unchanged. Guards own draft confirmation on navigation.
```

- [ ] Write routing and component/fixture tests: direct NBA entry bypasses NFL
  week/membership; sport switch/back restores routes; account change cancels and
  clears reads/drafts; selected date resists rollover; state errors stay distinct.
  Test the real save-to-list-to-reload path using a disposable service fixture.
- [ ] Implement an accessible NFL/NBA selector separate from league controls.
  Reuse existing root styles/theme hooks and shared primitives. NBA gets Games,
  My Bets, History and reachable account/theme/sign-out controls. NFL entry and
  legacy links remain intact; no NBA data passes through the NFL social reader.
- [ ] Implement Games date navigation and grouped source-labelled rows. Preserve
  cached age on refresh failures, show postponed/canceled/unknown explicitly and
  support Track bet with only matchup identity prefilled.
- [ ] Implement paged My Bets and History with server-matching filters/subtotals.
  My Bets starts pending across all dates; History starts settled with All dates.
  Expand ticket legs and safe audit details; archive rows remain editable through
  the same audited operations. Store no private ticket list in public assets.
- [ ] Implement single/parlay editor, odds-format toggle, units, review summary,
  owner-confirmed results and reasoned corrections. Use immutable operation IDs
  per submitted payload. An uncertain save reads its ticket/receipt before any
  retry; never generate a fresh ticket ID on retry. Concurrency conflicts retain
  draft and require refresh/reconciliation. No automatic result grading.
- [ ] Run `npx vitest run tests/nba-ui.test.jsx`, Node routing/contract tests and
  targeted Playwright NBA fixture tests. Inspect screenshots at 320px/390px and
  desktop in both themes; run token/markup/accessibility checks. Review/commit.

### Task 4: Integrated verification and release readiness

**Files:** Create `docs/NBA_SECTION_RELEASE.md`; update this plan,
`docs/COMPLETION_REGISTER.md`, `docs/PRIVATE_NBA_STORAGE.md` and relevant boundary
inventories only with actual evidence. Preserve frozen trackers and other tasks.

- [ ] Exercise two accounts and anonymous/forged-ID requests through the whole
  cloud handler plus disposable PostgreSQL; read archive fixtures without a
  duplicate import and verify unchanged NFL sentinels. Run full required checks
  once after integration; fix failures with focused regressions.
- [ ] Independent whole-branch review covers privacy, idempotency, game cache
  concurrency, navigation/account races and unchanged NFL behavior. Resolve
  blocking findings and record explicit acceptance limits.
- [ ] Record exact source, migration order/dependencies and preservation queries,
  safe rollback and required `BALLDONTLIE_API_KEY` in the release card. Update
  PR #167 around the final implementation and CI; keep deployment blocked until
  actual permitted free-source readback succeeds.
- [ ] After review/CI and complete preflight, merge and release compatible
  migrations/API/Pages through the existing workflow. Verify actual hosted
  grants, owner reads, asset versions and preserved ticket/accounting hashes.
  If a required external connection is missing, preserve the tested branch and
  report the precise blocker without claiming release.
- [ ] Push reviewed evidence and run `npm run sync:check`; after merge synchronize
  clean Windows main, Mini shared-sync and Neo main using `npm run sync:pull` and
  `npm run sync:check`. Report exact commits and any remaining unpublished work.
