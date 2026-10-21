# Weekly and player Trends release record

Owner: Sean Balsiger · October 21, 2026 · Implemented and checked locally; final branch review/CI pending. No hosted release claimed.

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

Current main advanced to `fb86a3ea55bd91db1b1937dcd40ee70063d37716` during this task. Integration preserves the separately reviewed research API and weekly/matchup sheets, Recommended percentage ranking and trend context, and private NBA storage work. Both research and weekly Trends remain registered in authentication probes and rollback feature switches. Weather stays before matchup research, with dated historical highlights as its unavailable fallback. No independent migration or deployment is replayed by this integration. The independent integration review approved the combined code with no further findings. A fresh npm run check passed: 1,552 Node tests, 235 Vitest tests, zero skips, typechecking and the production build. Integrated browser and exact-branch CI checks are in progress; their final receipt will be recorded in PR #166. Merge, deployment, hosted readback, real-phone acceptance and three-machine integration sync remain separate outcomes.
