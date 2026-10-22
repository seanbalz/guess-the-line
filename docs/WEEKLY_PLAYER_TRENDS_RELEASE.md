# Weekly and player Trends release record

Owner: Sean Balsiger · October 22, 2026 · Released October 22 at 04:56 UTC as API v31 and Pages `af617cd2`; see the [release record](RELEASE_2026_10_22_TRENDS_FILTER.md). Real-phone acceptance remains open.

## Approved change

Sean approved the [weekly and player Trends design](superpowers/specs/2026-10-21-weekly-player-trends-design.md). Trends become available with the published guess week, including Monday while the preceding week's Monday game remains pending. A new Trends destination offers This Week, Teams and Players. Game details put weather immediately before the highlights.

Recent samples and longer history remain separate: last 5 and 10 qualifying games, the current season, three and five seasons, and all available history. Historical situational highlights keep their frozen quality ranking. A selected streak does not change that ranking.

Player evidence compares each locked guess with its own saved scoring reference. Market accuracy, signed bias, hypothetical market covers, covers at the guessed line and outright results are distinct. A current permitted guess can accompany the player's historical team record. Exact samples, date ranges and source times support the callout; hidden guesses never enter it. This analysis does not change scores, standings, references or recorded wagers.

## Data and privacy

The weekly reader uses existing public nflverse data and the frozen registry. An authenticated `POST /trends/week` read authorizes membership and a published slate before consulting its bounded public-output cache. It does not collect sportsbook quotes. Current/future lines and outcomes are excluded from the shared historical evidence. Unavailable public refreshes carry a dated stale fallback.

The public seed is generated for the server from the existing frozen files; it must not enter the frontend dependency graph. Default historical generation and committed weekly fixtures remain unchanged. The current seed supports the 2026 season only; later seasons fail explicitly until the historical seed is rebuilt to include intervening seasons. The server seed fallback source date is October 12, 2026; a client snapshot retains its own date.

Players and sentiment consume authorized history, then reapply the viewer/game/market gate before aggregation. Community uses its history reader. Private leagues use the roster-scoped comparison reader and show unavailable if it is absent; they never substitute Community records. Charts, counts and drilldowns obey the same gate. Community sentiment describes permitted GTL guesses against each person's own saved reference, not simultaneous sportsbook money or ticket shares.

## Release dependencies

- No new migration is introduced. Core lock/scoring migrations are already applied and must not be replayed.
- Private-league player history needs the existing D-53 comparison migration (`20261016010000`) through its separate dependency-aware release process.
- Ship reviewed frontend and `gtl-api` source through [Shared deployment](SHARED_DEPLOYMENT.md), after exact-source CI, fresh hosted evidence, privacy and rollback checks. There is no calendar release window.
- Preserve public source attribution and free-only collection limits. Do not create new picks or force an odds collection to demonstrate this feature.
- The API `trends` feature switch can stop dynamic generation. Older API deployments require an explicitly dated frontend fallback or an unavailable state; a fallback must never bypass an authentication or membership refusal.

The anonymous boundary inventory includes /trends/week with valid read-shaped input, signed out and with an invalid token. Before release, only the exact missing-route response is reported as awaiting deployment; strict mode refuses it. Remove its awaiting-deploy entry after authorized hosted route verification. A gateway authentication denial by itself does not prove that this route is deployed.

## Verification and completion

Backend and player-engine checkpoints are independently reviewed:

- Weekly publication commit `97bf1bfef890da69afd327e5de3829a85a96206c`: 107 focused route, engine, loader and view tests passed. Default frozen weekly generation stayed byte-identical.
- Player engine commit `a85df13159645c9feacf27ec7d81f883417193fb`: 22 tests passed, including home/away sign normalization, separate cover outcomes, authorization before aggregation, duplicate conflicts, windows and current-guess direction.
- Additional integration regressions: 62 boundary tests and two loader refusal/account-epoch tests passed, without skips.
- Server seed: 1,917,050 bytes; SHA-256 `511754202e9f1c2c4b554299305c59463af35fa56d94a3a4d16010be0ad56844`. The deterministic seed check passed independently.
- Representative local generation took 0.97-1.39 seconds. The full week reply was 1,013,533 bytes (113,138 gzip). Target Edge runtime and hosted readback remain release checks.

- Source transport integration: four redirect/stream regressions passed after reproducing the blocked download. The reader follows at most three HTTPS redirects within github.com and release-assets.githubusercontent.com, shares one ten-second timeout and sends no credentials. A live public read at 2026-10-21 20:53 UTC returned 2,186,336 bytes and 272 current-season schedule rows with valid kickoff fields. Local Week 7 generation against the seed-derived slate returned 14 games, no pending prior finals and stale=false in 1.45 seconds. This used public data and a local slate, not hosted player or release verification.

UI commit `d4f86d1151962ee4bab44384c1752081307b3d4f` adds the seventh tab, scoped history and accessible charts. Both apps share the named useTrendWeek refresh hook and pure source-availability formatting; their screen and shell boundaries stay enforced. Local verification: 37 focused UI tests and 79 focused Node checks passed. The combined Trends/Lines/shell browser run passed 25 tests; after final source-copy changes, the affected Trends/Lines run passed 9 tests and the screenshot recapture passed. Eight 320/390px light/dark view combinations passed accessibility, target-size, document-overflow and selected-tab checks. Screenshots use fictional fixtures; visual review covered weekly highlights, charts and the current Panthers guess/reference comparison.

The full check passed typechecking and ran 1,488 Node tests without skips; one architecture-inventory assertion required registering the approved shared helpers. The inventory correction `fb14d9d70b7a3a0e0beed8a5b8897a87f7ce2f9e` and its new negative regression passed all 13 focused architecture checks; no production code changed for this correction. All 212 Vitest tests passed. Standard and cloud production builds passed with the existing large-chunk warning. Brand/document QA, the deterministic seed check and three frozen snapshot checks passed. Cloud bundle privacy passed; 25 JavaScript chunks contained no server seed payload markers. The existing weekly fixture retains its public history filename as provenance.

Independent complete-branch review approved `93f052a4178070834bb817795a90e74ff31c2ba3` with no blocking issues. Its minor matchup-filter rollover finding was fixed in `a8f147b332e4cb3736eb55259972cdc270fa0404`; four red/green regressions and all 17 focused UI tests passed. [PR #166](https://github.com/seanbalz/guess-the-lines-repo/pull/166) is published as a draft while integration checks finish.

Current main advanced to `fb86a3ea55bd91db1b1937dcd40ee70063d37716` during this task. Integration preserves the separately reviewed research API and weekly/matchup sheets, Recommended percentage ranking and trend context, and private NBA storage work. Both research and weekly Trends remain registered in authentication probes and rollback feature switches. Weather stays before matchup research, with dated historical highlights as its unavailable fallback. No independent migration or deployment is replayed by this integration. The independent integration review approved the combined code with no further findings. A fresh npm run check passed: 1,552 Node tests, 235 Vitest tests, zero skips, typechecking and the production build. At integrated source `7094557bac14d7b91b8c6d984599707fa043f4ed`, all 43 Trends, Lines, shell, research and recommendation browser checks passed. The final cloud build and privacy boundary passed, with no server seed payload markers in its 27 JavaScript chunks. Brand QA and deterministic seed verification passed after integration. The task checkout passed sync:check at 22:02 UTC with zero ahead, behind or changed files. This covers only this branch and checkout; ignored reports/screenshots remain local. The final exact-commit CI and synchronization receipt will be recorded in PR #166. Merge, deployment, hosted readback, real-phone acceptance and three-machine integration sync remain separate outcomes.


The final test-only compatibility commit `952eb4811629a5a3df6d2b1621107cd230492aab` updates the older Home/data phone checks for the contained seven-tab rail and the authenticated weekly read. Both targeted browser files passed all 12 tests; intrinsic text clipping, minimum touch targets, document overflow, and selected/focused tab visibility remain enforced. No production code changed after integrated source 7094557.


The first published CI run at d5d73ae passed Brand QA, Windows portability, typecheck/test and the persona suite. Its dashboard job passed 273 cloud browser cases and failed two older app-switch phone assertions that treated intentionally scrollable tabs as clipped. Test-only correction bac7a399c4d8141318c45b940ec67221b6124a69 applies the same bounded rail checks already reviewed for Home; all eight app-switch browser cases passed locally. Separate local performance checks passed 4/4 and accessibility checks passed 7/7. Production code remains unchanged after integrated source 7094557. A fresh exact-head CI run is required; these local results do not establish its outcome.


Main advanced again to c6afb02e71b6c88d09212dfc525fe0fe59da64f9 with the approved four-tab redesign (PR #162) and the Recommended percentage release record (PR #168). That introduced merge conflicts before CI could start for 5562ffcf. The integration preserves Home / Play / Bets / Research and routes Research > Trends to the complete weekly/team/player destination. It preserves the newer landing and route behavior, weather highlights, scoped evidence and source attribution. The obsolete seventh-tab rail is no longer needed. Integration review and verification are pending; earlier test totals describe their recorded source checkpoints.


October 21 takeover by Claude Code: Codex stopped on a usage limit partway through the four-tab merge. Claude Code continued on task branch `claude/trends-takeover`, starting from Codex's resolved working files for the c6afb02 merge, then merged current main `33f02cc979ff13a3b74b9e56a9032481b544ad1c` into PR head `5562ffcf` (merge base `fb86a3ea`). The one new conflict, `cloud/handler.mjs`, keeps both PR #169's `publicResearchHistory` loader for research validation and this PR's `/trends/week` service. Completion register entries from both sides are kept. One integration defect was fixed: the four-tab address now restores the Players filters after a reload, which had also handed a previous account's player, team, matchup and window to a different account signing in on the same page. The next account now starts from its own defaults; a same-account reload still restores them. A browser locator was updated for the Research landing's Trends row. Local verification of the merge tree: npm run check passed (typechecking, 1,560 Node tests with zero skips, 235 Vitest tests and the production build); the full cloud browser suite passed 282/282, with the account-switch case failing before the fix and passing after it; brand QA, the deterministic seed check, the snapshot check and the cloud bundle scan passed, with no server seed payload markers in its 27 JavaScript chunks; npm run check:cloud passed with 265 live denials and 7 awaiting-deploy probes, including /trends/week. Exact-head CI, an independent review of the merge resolution, merge, deployment, hosted readback and real-phone acceptance remain pending. No migration, configuration change or release was run.

October 21 review fixes (Claude Code): two blocking findings on the shared Trends loader are fixed. First, the cache now clears only when the signed-in account changes (`watchTrendAccount`). Before, every auth event cleared it, including TOKEN_REFRESHED and the same-user SIGNED_IN that auth-js 2.117.3 sends when a hidden tab becomes visible. That refused the fresh read a reopened phone had just started, with "Account changed". Second, a failed hosted refresh for a reason other than 400, 401 or 403 keeps the last loaded week, marked stale with its source age carried forward. Before, Week 8 onward (no static file) was replaced by null for five minutes and shown as not yet available. A result from a failed read is reused for one minute, not five. The shared week hook also keeps a ready week when an interval or visibility refresh finds nothing or fails; an account or membership refusal still replaces it. Three new regression tests in `tests/weekly-trends.test.mjs` failed against the previous source and pass now. Local verification: npm run check passed (typechecking, 1,563 Node tests with zero skips, 235 Vitest tests and the production build); the Trends, Lines, data, shell and wind cloud browser specs passed 45/45; brand QA passed. Exact-head CI, merge, deployment and real-phone acceptance remain pending.

## October 22 — hosted CPU outage and prepared-history fix (Claude Code)

**Outage.** Since API v31 (October 22, 04:56 UTC), every signed-in `POST /functions/v1/gtl-api/trends/week` returned HTTP 546. At the same instant the function log reported "CPU Time exceeded". Supabase caps Edge CPU at 2 seconds per request; waiting on fetch does not count. The app fell back to the frozen static Week 7 file ("Stale evidence · Refresh unavailable"). Week 8 opens Monday, October 26, and has no static file, so weekly Trends would have been empty. This evidence comes from the hosted logs reported for this task; this change does not re-query them.

**Cause.** Each cold request rebuilt the full history. It parsed the 1.7 MB history CSV from the seed, built features for 7,276 games, then evaluated about 900 presets over 6,499 historical games for that week's teams, coaches, quarterbacks and referees. Local profiling put about 715 ms in `betUnits` and `atomValue`, about 270 ms in `buildFeatures` and about 70 ms in CSV parsing. The per-worker cache never filled because every cold request was stopped first.

**Fix.** Historical work now moves into the generated server seed, as the research route did with its prepared snapshot. `prepareHistory` in `shared/trends.mjs` records two things for 2026:

- the rolling feature state after 2025
- each preset's historical record: per-season aggregates, walk-forward prefix, streak and last-ten tail, window counts, the registered series, venue split and card overlaps

Floating sums are stored as accumulated, then continued in the same order. A request inflates this once per worker and processes only the 2026 rows (`generateWeek({ history })`, `resumePreset`, `resultWindows`). The full-history path, `scripts/trends.mjs` and the committed week files are unchanged. A missing preset fails explicitly unless its entity never appeared in the prepared games. Authorization still precedes the cache. No current lines enter the shared cache, membership checks are unchanged and hidden markets stay hidden.

The seed drops the history CSV, which the server no longer reads. It shrinks from 1,917,050 to 1,227,839 bytes (SHA-256 `270691dbb5c0ab8a80a40d6428061c292f04fd7a7d3a72a2affa27708f0b59ff`). The prepared history is 3,146,233 bytes of JSON for 2,394 presets (SHA-256 `3dff1bb6adc6a574ee15273f07e1f0261a2551a1346bfe779832ceafb658abac`), stored inside the seed as raw-deflate base64. Raw deflate avoids gzip's platform byte. `node scripts/trends-seed.mjs --check` inflates the stored history and compares it with a fresh preparation.

**Measurements.** These came from a local harness that runs the real `handleTrends` and `createTrendsService` path with a published-slate RPC. It used the public nflverse release saved at 14:57 UTC (2,186,337 bytes, SHA-256 `3c9cae07…`). Each figure is the median of five cold processes, with the maximum in parentheses. Main-thread CPU is the closest local proxy for the per-request Edge CPU; process CPU adds GC and helper threads. Module import is excluded (0–47 ms).

| Request | Runtime | Main-thread CPU before | Main-thread CPU after | Process CPU before | Process CPU after | Wall before | Wall after |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Week 7 (live source) | Node 24.11.0 | 1,079 (1,172) ms | 187 (189) ms | 1,640 (1,829) ms | 359 (374) ms | 1,089 ms | 200 ms |
| Week 8 (synthetic: 13 fictional Week 7 finals, Monday pending) | Node 24.11.0 | 1,062 (1,079) ms | 188 (203) ms | 1,829 (2,093) ms | 313 (391) ms | 1,079 ms | 202 ms |
| Week 7 (live source) | Deno 2.9.6 | 1,031 (1,094) ms | 156 (172) ms | 1,500 (1,547) ms | 282 (375) ms | 1,052 ms | 168 ms |
| Week 8 (synthetic) | Deno 2.9.6 | 1,078 (1,156) ms | 172 (172) ms | 1,672 (1,828) ms | 266 (360) ms | 1,101 ms | 171 ms |

Responses before and after were byte-identical: 974,040 bytes for Week 7 and 1,009,343 bytes for Week 8, in both runtimes. A warm cache hit stays at timer resolution (16 ms or less). Process RSS after the response fell from about 395 MB to 250 MB in Node and from about 345 MB to 190 MB in Deno. Remaining cold work, in local wall time:

- about 60 ms inflating and parsing the prepared history (once per worker)
- about 40 ms parsing the 2 MB public source
- about 60 ms generating the week

Hosted Edge CPU cannot be measured locally. Hosted readback after a reviewed API release remains the acceptance evidence.

**Verification (local, Windows).**

- **New contract tests.** `tests/weekly-trends-prepared.test.mjs` adds eight tests:
  - Output is byte-identical to full generation for Week 6, a synthetic Week 8 with a pending Monday final, and a Week 1 without current finals.
  - The committed Week 7 file is reproduced without the history CSV.
  - All 2,394 prepared presets resume to the full evaluation, including streaks that continue, are interrupted or carry across the season boundary.
  - History rows and mismatched preparation are refused.
  - The shipped seed holds the current prepared history and no CSV, with a size budget.
  - The hosted service returns full-generation evidence from the shipped seed.

  Four deliberate defects each failed these tests: streak merge, robustness aggregate, restored meetings and the window start date.
- **Full check.** `npm run check` passed typechecking, 1,583 Node tests with zero skips, 245 Vitest tests and the production build. The SQL fixtures used CI-pinned PGlite 0.5.8.
- **Seed and frozen weeks.** `node scripts/trends-seed.mjs --check` passed. The Week 6 and Week 7 `scripts/trends.mjs --check` runs passed.
- **Cloud boundary and bundle.** `npm run build:cloud` and `npm run check:cloud` passed: 266 live denials, with 6 probes awaiting the three pending migrations. No seed payload markers appeared in the 27 cloud JavaScript chunks.
- **Cloud browser.** On a private port, the next-trends and trends specs passed 6/6. The Lines, data and shell specs, which also read `/trends/week`, passed 35/35.

Not run: deployment, configuration or secret changes, SQL, merge, hosted readback and real-phone acceptance.
