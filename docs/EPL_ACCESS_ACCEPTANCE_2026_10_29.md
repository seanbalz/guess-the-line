# EPL access and Fantasy acceptance — October 29, 2026

Owner: EPL access acceptance agent. Source baseline: `76329b7f2c57bdb2a2710ab5a90817c3318f75da`.
Branch: `codex/epl-access-acceptance`. Rules: D-68 including October 29 open-access addendum, items 17–22.

This record covers source and disposable-fixture acceptance. It does not establish a production release or physical-iPhone acceptance. The coordinating task owns the current completion register and platform queue.

## Results and fixes

| Item | Evidence | State / remaining work |
| --- | --- | --- |
| Open draft and Fantasy reads | Real AuthGate, cloud handler and EPL route browser flow; an unlinked fixture account reads the board and standings, with no personal matchup, pick controls or queue button | Passed locally; hosted account acceptance remains separate |
| Automatic linking and aliases | M-31 PGlite cases cover first names, Sleeper usernames, approved aliases, ambiguity and already-linked accounts; browser links Fistathon to Sean and reloads without a second audit | Passed locally; no real account was linked by this work |
| Claim conflicts | Browser holds a stale claim card while another fixture account claims Adam through the SQL function; losing click receives the conflict, refreshes away Adam and remains read-only; one claim audit | Passed locally; real PostgreSQL concurrent-session acceptance remains separate from PGlite's serialized execution |
| Commissioner unlink | Existing SQL tests verify append-only audits and that neither auto-link nor claim restores the unlinked pair | Passed locally; no membership was changed on the hosted project |
| Private queues | Browser claims Adam, saves Arsenal, and verifies Adam's queue and Evan's pre-existing Liverpool queue separately in SQL; each draft reply carries only its viewer's queue | Passed locally; nonmember write refusals and route field filtering also pass the existing route tests |
| Account switching | Browser holds Sean's Fantasy reply, switches AuthGate accounts through a retained NBA address, then reads Evan's view; releasing the old reply never paints Sean's personal view | Passed locally after fixing the missing EPL option described below |
| Fantasy sections and missing data | Matchup, Standings, Rosters and Insights exercised at 320, 390 and 1440 CSS pixels in dark and light themes; absent starter projection says “No projection”; absent detail stays an em dash; unknown opponent explains the full-repeat requirement | Passed locally; a complete scored schedule repeat is still required before a real opponent/win chance can appear |
| Narrow-phone section labels | Visual inspection found labels split mid-word at 320px. Fantasy now arranges its four existing choices in two rows below 480px, retaining 44px targets and approved tokens | Fixed in source; browser checks require one text line per label |
| Bottom Play tab | Returning from Research supplied a tab without a section, showing an empty coming-next panel although the address selected Pick a Team. Normalize the in-memory route through the same parser as the address | The identical fix also appears in #364 and is credited there; it is included here so this PR's regression runs independently. The browser returns through the bottom Play tab and requires the draft card |
| EPL entry after account change on an NBA address | SportEntry previously primed the lobby only for EPL, so the new account on a saved NBA address never learned EPL availability. NBA now primes the same account-scoped lobby cache once when access is unknown | Fixed in source; no server access rule changed. Compatible with hiding NBA from navigation while retaining saved NBA links |
| EPL-DATA-01: Unknown player rows | Coordinator's October 29 hosted aggregate read found 150 rostered IDs, 134 covered by any saved player directory, leaving 16 unmapped. Source confirms six snapshot endpoints and metadata derived only from embedded stat/projection player objects; `buildFantasyView` already merges all saved directories | Open data-quality work: verify a free rostered-ID lookup, enrich future snapshots with bounded minimal metadata and source hashes, and test directory completeness/fallbacks. Never invent a missing name or backfill a historical scoring position from a current directory |

“Just watching” hides the claim card across reloads for the browser session, as D-68 specifies. It does not grant a manager link. No new product decision was needed.

## Reproducible checks

The new browser cases are in `tests/cloud-browser/epl.spec.js`. They use M-30/M-31 from `ALL` in a fresh PGlite database, synthetic Auth accounts, synthetic player/projection data, actual EPL RPCs and route handlers. The fixture advertises EPL availability in its lobby response; stored snapshot/queue adapter reads are fixture-backed. No hosted data, provider API, claim, pick, queue, migration or job schedule is touched.

Commands run:

```sh
node --test tests/epl-open-access-sql.test.mjs tests/epl-routes.test.mjs tests/epl-fantasy-view.test.mjs
# 71 passed
node --test tests/next-tokens.test.mjs tests/epl-route.test.mjs tests/nba-route.test.mjs
# 27 passed
node --test tests/epl-fantasy.test.mjs tests/epl-sleeper.test.mjs
# 26 passed
node node_modules/vitest/vitest.mjs run tests/epl-app.test.jsx tests/epl-pick.test.jsx tests/epl-fantasy.test.jsx
# 50 passed
npm run test:cloud-browser -- tests/cloud-browser/epl.spec.js
# 3 passed; 26 axe analyses, no violations
npm run test:cloud-browser -- tests/cloud-browser/nba.spec.js --grep 'cold NBA entry'
# 1 passed; existing SQL ticket lifecycle and receipts retained
python3 scripts/check-brand-docs.py
npm run typecheck
```

Browser commands used a local ignored copy of `playwright.cloud.config.js`, port 5204 and a separate output directory to avoid other agents' preview servers. The commands above are the equivalent normal configuration. Browser builds completed; Vite reported the existing large-chunk advisory. The PGlite cases require the documented local SQL-check dependency; browser tests explicitly skip when it is absent.

Twenty-four Fantasy screenshots were generated under ignored `.local/previews/epl-access/`. Representative 320px light Matchup, 390px dark Rosters and desktop light Insights screenshots were inspected. Phone-width Chrome emulation is not physical Safari/Home Screen acceptance.

## Release and acceptance boundary

The three fixes (including the identical Play-tab correction also present in #364) need CI/review, merge and normal exact-source release verification. This agent did not merge or deploy. Hosted permissions, current linking counts, migration hashes and job operation evidence belong to the coordinating task's separate read-only audit. No real-user claim/link/pick acceptance was attempted because an unlinked `draft/read` can automatically mutate membership.

Remaining work: EPL-DATA-01 roster metadata coverage, physical iPhone Safari/Home Screen, representative signed-in hosted reads under the account owner's approval, and real stored-data opponent display once the required repeat exists. None of those should be marked complete from these fixtures.
