# Guess The Line — weekly Trends and Recommended filter release

Owner: Sean Balsiger · October 22, 2026 · Deployed and verified (API then frontend)

Sean asked Claude Code to "close as many items as you can". This protected release
ships the merged work since API v30 and Pages `46fb8ae6`:

- **Weekly and player Trends** ([PR #166](https://github.com/seanbalz/guess-the-lines-repo/pull/166)):
  Trends published at week open through the new `trends/week` route, Research →
  Trends with This Week, Teams and Players, and game highlights below weather.
  See the [weekly and player Trends record](WEEKLY_PLAYER_TRENDS_RELEASE.md).
- **Recommended market filter** ([PR #175](https://github.com/seanbalz/guess-the-lines-repo/pull/175)):
  All / Spreads / Totals, applied before the top-three limit (BETS-NEXT-01, queue Q04).
- **Reviewed quote kept when units change** ([PR #173](https://github.com/seanbalz/guess-the-lines-repo/pull/173)).
- **Phone formatting fixes** ([PR #174](https://github.com/seanbalz/guess-the-lines-repo/pull/174), Sean's).
- Test and documentation changes: #171, #172, #176.

No migration is part of this release. M-10 and both D-53 migrations remain
pending for a separate Gate M apply.

## Gates and identifiers

Source: `main` at `7e9a8a1bd31e2a6ffa2414c2ed0acc754e492665`. All three required
push workflows passed on that SHA:
[Tests](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39719782794),
[Dashboard checks](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39719782795)
(including Persona) and
[Brand QA](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39719782814).
The release card is in PR #166.

| Gate | Run | Result |
| --- | --- | --- |
| Source | [39724710931](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39724710931) | Exact source and main CI verified |
| Readiness | [39724761986](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39724761986) | Hosted state checked; API v30 and Pages `46fb8ae6` baseline |
| API then frontend | [39724976560](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39724976560) | Deployed and verified at 04:56:37 UTC |

- **API:** `gtl-api` **v31**, ACTIVE, JWT verification on, bundle SHA-256
  `c1716c4d31ef2d0b0358651f796ea41c2fde58bec420e8a64da4b73246c801e5`. Odds v5,
  week-open v4, push v3 and results v2 kept their versions and bundle hashes.
- **Frontend:** Pages **`af617cd2-e6bd-4623-a961-7eb7015e70f6`**. All 98 served
  assets matched the manifest at [the immutable URL](https://af617cd2.guess-the-line.pages.dev)
  and [production](https://guess-the-line.pages.dev); frontend SHA-256
  `3c64aa6b07649604e827bf5ae015a1f208d88afc15e0ae8885b53859532f5896`.
- **Migrations:** 46 hosted, digest
  `c571cd2de3d53ae0239a98d792cd0a1b542c2cbdda08190d2fa98ca4b126910f`, unchanged.
- **Boundaries:** 272 signed-out probes. Before the deploy, 265 denials and seven
  awaiting (six pending-migration RPCs and `POST trends/week`). After it, 266
  denials and the same six pending-migration RPCs; `trends/week` now refuses
  signed-out requests.

The workflow reports `apiSourceVerified: false`. Independently, all **56 retrieved
v31 API source files** matched `7e9a8a1` exactly after normalizing CRLF to LF, and
every relative import resolves inside that set. Compared with the v30 source,
`cloud/handler.mjs`, `cloud/feature-off.mjs` and `shared/trends.mjs` changed and
`cloud/trends.mjs` and `cloud/trends-seed.mjs` are new; `handler.mjs` keeps the
research loader (`publicResearchHistory`) beside the new Trends service. This
verifies the retrieved source files, not a rebuild of the provider's bundle.

## Preservation

Read-only hosted snapshots at 04:54:08 UTC (before) and 04:57:05 UTC (after)
matched in count and ordered whole-row MD5 for 17 public tables, both
`nba_private` tables and all 126 `gtl_*` function definitions with their
configuration and grants (`d65491d0b2810fd7bce18b1815218cd1`). The read-only
connection cannot execute `gtl_ballot_pick_scores`; finished scores are covered by
the unchanged ballots hash and function definitions.

| Data | Rows | MD5 |
| --- | ---: | --- |
| Weekly ballots | 23 | `a45bf0bf9c59e4543407f544e86d6987` |
| Social commits | 101 | `ea8de1440cc94cda79f188eb3433ca7b` |
| Social weeks | 3 | `e2f2585903d04376035be78773b399fe` |
| Leagues | 5 | `a1f06fa4c7aadced4df70a33d57437fb` |
| Memberships | 9 | `04975f153218ad4228399f5929927c76` |
| Virtual Units picks | 7 | `7d4859aeb58ce26d13cd6a00274e6bb8` |
| Personal events / receipts / versions | 17 / 17 / 6 | `962ad7b0…` / `5410ce89…` / `c2b0a74e…` |
| Private NBA imports / bets | 3 / 10 | `8e0fecd9…` / `4851d47b…` |

## Rollback and open checks

Rollback: restore Pages `46fb8ae6-0df8-478c-8762-9607c2c6fdec` and redeploy the API
from `f22ee67` (v30 source). `GTL_FEATURE_OFF` can switch off `trends` or
`research` without a deploy. No data or migration rollback is needed.

Still open: signed-in confirmation of the Trends tab and Recommended filter on a
real phone, and confirmation that Week 8 trends publish when the week opens
Monday, October 26.

## October 22 follow-up: Trends outage fixed (API v32)

**What went wrong in v31.** The protected release checks only probe signed-out
access, so they did not catch that every signed-in `POST /trends/week` returned
HTTP 546. Each request rebuilt the full trend history and hit the Edge
Function CPU limit; the function log reported "CPU Time exceeded" at the same
instant. The app fell back to the frozen Week 7 file ("Stale evidence · Refresh
unavailable"). Sean also saw the game sheet replace the Round 3 trend charts
with "No qualifying research in this view" one to two seconds after opening:
the sheet treated the trend cards as a placeholder until the matchup research
read returned.

**Fixes.**
- [PR #182](https://github.com/seanbalz/guess-the-lines-repo/pull/182) ships the
  prepared Trends history in the server seed. Local cold CPU fell from about
  1.05 s to about 0.16 s under Deno, with byte-identical responses.
- [PR #180](https://github.com/seanbalz/guess-the-lines-repo/pull/180) keeps the
  weekly trend cards in the game sheet and adds matchup research below them only
  when it has candidates for that game.

**Release.** Source `main` at `8dccc5c9e0c4bfe66f2ed093ac3d2ec9bad0b100`. It also
carries #181 (Q03 scroll padding) and the Round 3 docs record #179. All three push
workflows passed:
[Tests](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39814675496),
[Dashboard checks](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39814675596),
[Brand QA](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39814675506).
The release card is in PR #182.

| Gate | Run | Result |
| --- | --- | --- |
| Source | [39820215519](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39820215519) | Exact source and main CI verified |
| Readiness | [39820267779](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39820267779) | Failed only at its source step: GitHub's filtered run search briefly returned no runs |
| Readiness retry | [39821030893](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39821030893) | Passed; baseline API v31 and Pages `f092e744` (Round 3) |
| API then frontend | [39821362374](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39821362374) | Deployed and verified at 17:20:11 UTC |

- **API:** `gtl-api` **v32**, ACTIVE, JWT verification on, bundle SHA-256
  `92ad9bbd4b358a8651d3e0a810f2c36e687bb90f228928de91099a74f34ea93e`. All 56
  deployed source files match `8dccc5c`; only `cloud/trends.mjs`,
  `cloud/trends-seed.mjs` and `shared/trends.mjs` differ from v31, and the seed
  carries `preparedHistory` with no history CSV. The other four workers kept
  their versions and hashes.
- **Frontend:** Pages **`9fb54fe4-d7f0-41ea-a925-a0d86dbf277e`**, 98 assets
  verified at both URLs, frontend SHA-256
  `6d486dd8edbf12c0f54e69f350333fdcda010c2df87144bd16cb7e52fd872d62`.
- **Migrations and boundaries:** 46 hosted, digest `c571cd2d…`, unchanged;
  266 of 272 signed-out probes denied plus the six pending-migration RPCs.
- **Preservation:** read-only snapshots at 17:17:31 and 17:20:44 UTC matched for
  every table checked, both private NBA tables and all 126 `gtl_*` functions.
  Social commits were 102 and social weeks hash `8cd0950c…` in both, reflecting
  normal player activity since the previous release.

**Signed-in acceptance (the check v31 lacked).** Hosted logs show signed-in
`POST /trends/week` returning 200 at 18:21:50, 18:24:55 and 18:31:07 UTC, with no
"CPU Time exceeded" after the deploy. In Sean's signed-in Chrome, the DAL @ PHI
game sheet shows "Historical evidence ready · Oct 22, 2026 · 0 min old" and keeps
the Round 3 chart card after research loads. Real-phone acceptance and Week 8
publication on Monday remain to be confirmed.

Rollback: restore Pages `f092e744-ef2e-427a-9328-dac3006a45ea` and redeploy the
API from `7e9a8a1` (v31 source); `GTL_FEATURE_OFF` can switch `trends` off.
