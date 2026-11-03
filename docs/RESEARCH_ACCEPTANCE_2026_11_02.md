# Research acceptance — November 2, 2026

Owner: Sean Balsiger · Version 2 · Data freshness and authenticated browser acceptance verified; phone pending

Sean authorized GTL coordination in this order: finish #408, then Research and
iPhone acceptance. This record advances only verified Research criteria in
[release card #398](https://github.com/seanbalz/guess-the-line/issues/398).
The [November 1 release](RELEASE_2026_11_01_RESEARCH_DATA.md) remains dated evidence,
not a fresh authenticated acceptance result. The separate offline discovery PR
#363 is not a prerequisite to accepting the deployed #397 repair.

## Stage and completion boundaries

The overall **85–95%** is a judgment estimate for the bounded Research data
workstream, unchanged by scheduled success alone. It is not an overall project
percentage or a mathematical average of the rows below.

| Criterion | Verified status | Remaining exit |
| --- | --- | --- |
| Source and November 1 app/data release | Complete in the linked release record | Preserve its source and API-bundle attestation limits |
| First automatic publication | Verified, 100% of this subcriterion | Retain failed-run and delivery-delay history |
| Current public publication | Six of six compressed assets passed size, checksum and shared schema/redaction validation | Recheck the index after the next publication |
| Current source dependencies | Resolved at 23:21:08 UTC / 3:21:08 PM Pacific after one authorized normal refresh | Freshness remains time-bounded and must fail closed on later drift |
| Populated authenticated current build | Verified on stable #408 frontend with an existing authenticated Community account | Physical device remains separate; no cross-account isolation pass inferred |
| Physical iPhone | Pending; sole device owner retains operation | Record actual device/build/launch mode and the bounded accepted flows |

Initial preparation performed no publication. The later coordinated normal data
refresh and browser checks below made no API/frontend deployment, provider-credit
request, player write, credential transfer or phone input.

## Actual scheduled publication

The first successful scheduled run present in the inspected history is
[41347742026](https://github.com/seanbalz/guess-the-line/actions/runs/41347742026),
created November 1 at 20:36:40 UTC, source
`c2fc5cae62e9a50c508afb7b60862b66027b0d11`. Both build and publish/verify steps
passed. Its log records six published files and `readback: true`.
The earlier [41320419043](https://github.com/seanbalz/guess-the-line/actions/runs/41320419043)
failed with `Free research source unavailable` before publication and produced no
receipt. It remains a failure; later success does not rewrite that history.

Two later scheduled runs also succeeded:
[41399796775](https://github.com/seanbalz/guess-the-line/actions/runs/41399796775)
and [41501407645](https://github.com/seanbalz/guess-the-line/actions/runs/41501407645).
The latest has source `1f392fe14559d7d9767e2be0b2462582aab881e6`, successful
build and publish/verify steps, and a downloaded receipt that matched the
then-current index at the 22:28 UTC readback.
The workflow's UTC cron is `23 */4 * * *`. Actual observed delivery is irregular;
the last run's creation time does not establish the next delivery time.

## Initial bytes and stale readiness — historical as of 22:30 UTC

At **22:28:49.599 UTC / 2:28:49 PM Pacific**, independent public readback fetched
the [current index](https://github.com/seanbalz/guess-the-line/releases/download/research-data-2026/index.json)
and all six files. The actual shared validators checked file identity, schema,
size bounds, timestamp agreement and redacted upcoming targets.

- Index SHA-256: `34157fc3d2b517ae2266cfaf1ac63c9715bc54c856516d244c78e97e0b9f8373`.
- Publication/data-build time: `2026-11-02T18:31:47.446Z`, distinct from readback time.
- Completed source observations extend through **November 1**; the receipt has
  120 completed games and 120 play-by-play games, 750 registered candidates,
  eight historically qualified trends and 272 matchup-statistics entries.
- Raw build schedule SHA-256: `7bf3e1d9bcf0805fd0fdd1b95a5f016798a3705beebfea9240689c14a0270f8c`.
- Play-by-play SHA-256: `780a9b5fca995c2e86ab1949d6fb8c4c180f708a8ea291bad3378ff5990a7330`.

| Period | Compressed bytes | Verified SHA-256 |
| --- | ---: | --- |
| recent30 | 500425 | `8d35c4d29ea2af5fb9d9c7d2d3ea06b821020b6216423b2cebac3e8df9320a96` |
| recent25 | 477681 | `defbc004fdbe56845043aef73680ba826d29b8ab1cddf4d09c6ae03da0a2ec73` |
| season | 408019 | `8be6e9cd878316305bd4178175c5762de07902e661ae23e5d3072575e33a3d36` |
| previousSeason | 535661 | `f74c7ec4b78229b743830c58bf0c884a58b2939f363b0340b52d2f7763a35d41` |
| rolling12 | 530404 | `37a205cdc93ccb4c04b9433b3c396d73575af3f6507d966c164a39df1bcaff8f` |
| all | 693558 | `9d0e6b948ce765df273e7648d6a5bc809c6fac8db498f3e5ba0a3f9e6df921c8` |

Each decoded period contains 750 candidates, 152 redacted upcoming targets and
272 play-statistics entries. These are public publication counts, not counts of
recommendations available to a particular signed-in account or current week.

At **22:30:28.474 UTC / 2:30:28 PM Pacific**, a new free-source download was
compared using the same `completedSourceText`, `scheduleSourceText` and
`finalAvailableAt` helpers as the server. The season exists and missing finals
count is zero. The completed dependency matches, but the schedule dependency
does not:

| Dependency | Published | Live source at check |
| --- | --- | --- |
| Completed | `fd486080d1eebe66078ec49b36c40f08e613750d2c9527a1da7dcf60519bb630` | Same |
| Schedule | `4bd45474922543ccd086f448448a1774c59c38d3ae89b83616ad45ca3813a50f` | `7dc3c93b56aa3afb82f6112fbee055ff38f332dcc090dfe087bba8947f5d03a9` |

Live raw CSV SHA-256 is
`4e692d901e2eeae284d95c9bd3d80b4774e5d2b350fd593e2b750fab2ea142a0`.
Therefore `dependencyFresh` is false. Fresh server material should yield stale
historical research with `schedule_source_changed`; this is a source/code
readiness result, **not an observed deployed-client response**. Publication
checksums alone cannot certify freshness against a subsequently changed source.
The five-minute public-material cache can delay when a client sees the change.
No freshness rule was relaxed.

## Read-only backend preparation

November 2 metadata readback confirms `gtl-api` ACTIVE at v45, JWT verification
enabled, bundle SHA-256
`7640627cfd1a457729382b90f09a3b094095c63da76c62a5559038e1190c675b`.
This does not independently attest every deployed bundle byte.

At `22:36:51.510129Z`, catalog-only SQL verified all three Research tables
(`gtl_research_submissions`, `gtl_research_snapshots`, `gtl_research_quote_fetches`)
have RLS, no anon/authenticated CRUD privileges and no service-role delete grant.
All seven Research functions are security invokers with empty search paths,
anon/authenticated execution denied and service-role execution granted. No table
contents, account credentials, links, submitted predictions or quotes were read.
These metadata checks do not replace actual authenticated route, account-isolation
or per-market reveal acceptance, and are not a new claim of the older 16 HTTP probes.

## Resolved freshness after one coordinated publication

After the sole release captain confirmed stable #408 deployment, a fresh check at
23:17 UTC still found schedule drift and no active Research publication. Exactly
one authorized normal `research-refresh.yml` run with `dry_run=false` was dispatched:
[41544353761](https://github.com/seanbalz/guess-the-line/actions/runs/41544353761).
It succeeded from `b66d3c042a7dd51045cec6a596a1a2c5fc2cca8e`, building at
`2026-11-02T23:18:21.125Z`. Its six-file publication and readback succeeded.
This is a data publication source, distinct from the frontend source below.

Independent readback at **23:21:08.168 UTC / 3:21:08 PM Pacific** verified the
receipt, index and all six compressed assets using the actual shared schema,
size, SHA-256 and redacted-target validators. Index SHA-256 is
`0220846ceb769838879194694b7eeb9d1b218caffb94eb45319ac9aa1eb63411`.
The receipt contains 120 completed/PBP games through November 1, 750 candidates,
eight historical qualifiers and 272 matchup-statistics entries. Each period
contains 750 candidates, 152 redacted upcoming targets and 272 play-statistics entries.

| Period | Compressed bytes | Verified SHA-256 |
| --- | ---: | --- |
| recent30 | 500441 | `f2f562108e43be04d02b76582f0eeddf91fe8390a211968f6b3be7c7c4712558` |
| recent25 | 477697 | `9257a9b0c624ebaa3bd501a3047b9987b29c6285804e0c43ba8a2ed0da8565c2` |
| season | 408044 | `7f7fa8f5ac375b41f6c83ac6bd9f6c5eb0d830c8ea5dcc19b02e233f552fa155` |
| previousSeason | 535684 | `3fa3fb13deb0a1343dd5bfb0581298272e50b3a85984f785f2210ea708af8218` |
| rolling12 | 529607 | `72832d0c4105490bb70909f46ed2d994ed68bcec99bd2089eb7e12113f904a5d` |
| all | 693572 | `441f951e071cf3b9bb5946941e5883f94026ba79298b465552662f5a3a4d9d33` |

Raw build source SHA-256: `d07f8d8c7ff8b816d5eefe8f02d3124b656addb0b370a0c4a95b8d016f4a5c83`.
PBP SHA-256: `bce5875c230e33625cd372cb1f79814fc183014777773389f9b16b964b78251c`.
Live raw CSV SHA-256: `c0a148e69b5ca39212adb32f107c3788c12706e3a476c06599ce2c7ff81e454a`.
The normalized completed dependency matches `fd486080d1eebe66078ec49b36c40f08e613750d2c9527a1da7dcf60519bb630`;
the normalized schedule dependency matches `7dc3c93b56aa3afb82f6112fbee055ff38f332dcc090dfe087bba8947f5d03a9`.
Missing finals: **zero**. `dependencyFresh`: **true**. Raw CSV bytes differ,
but both normalized dependencies match; the earlier stale blocker is resolved
without weakening its gate. No second manual refresh was dispatched.

## Current-build authenticated browser acceptance

The sole release captain cleared frontend source
`e7a38c6e9017a9c49cdf2a526482c05f8219f29f`, Pages
`6c458d6d-a845-45a9-a213-e1db661feb64`, successful deployment run
[41542487945](https://github.com/seanbalz/guess-the-line/actions/runs/41542487945).
This lane independently observed the served entry asset `index-B1JMAPIH.js`
and tested an existing authenticated Community account in its own Chrome tab.
The captain's 127-asset and preservation checks are separately owned evidence.
API remains v45; no API/schema deployment was performed here.

- The real current view selects **2026 Week 9**, with **15 game-statistics links**.
  Scoring averages, completed-game samples, recent game dates/results and
  nflverse attribution are populated. Unadjusted averages are labelled honestly.
- After one Show more action, **40 visible assessments** comprise seven Research
  leans, five Evidence against and 28 Insufficient evidence; two leans explicitly
  carry opposing evidence. No Estimated value model is presented.
- Lean detail exposes historical samples, dates, push handling and attribution,
  explicitly descriptive rather than a calculated betting edge. Two supporting
  findings correctly count as one underlying evidence group. Gray detail can
  have a valid retained quote but no qualifying supporting evidence.
- Research build time **3:18 PM Pacific** and latest completed game **November 1**
  remain distinct from the retained quote's own time. Current history and current
  retained-quote availability are shown. Closed play statistics explain that both
  game markets must be open; no submission or reveal state was changed.
- Totals gives an honest empty assessment list while retaining 15 statistics links;
  Estimated value gives an honest no-matching-assessments state. Detail/back,
  All games research, filters and Show more work. Filters were restored to All.
- All eight external feeds report automatic access unavailable; no reviewed
  external snapshot is claimed. No link, tracked bet or player entry was saved.
- Read-only Refresh research preserves **current history**, the populated list,
  build/source dates, retained-quote state and closed play-statistics explanation.
  Its disclosure says it reads stored research/prices without requesting quotes.
- Light and Dark screenshots at **320×844 and 390×844** show readable populated
  layouts with no horizontal overflow. Market and Assessment selects measure
  **44 px** tall. At maximum scroll in 390×844, the last disclosure ends at y731
  and fixed navigation starts at y780, leaving **49 px clearance**. No captured
  console errors were reported. These are browser viewport checks, not a phone pass.
- Original Light appearance and default **1920×873** viewport were restored.

This is one real account's observed read-only UI acceptance. It does not establish
cross-account isolation, an unlocked play-statistics pass, account/week invalidation,
all markets/providers, renewed strict HTTP probes or actual physical-device behavior.
Public source validation and earlier catalog/HTTP evidence remain distinct.

## Remaining acceptance and ownership

Keep #398 **open** and the bounded workstream estimate **85–95%** until the sole
phone operator records actual iPhone device/build/launch mode and accepted flows.
No phone input was performed here; the captain retains the existing readiness
request. Current publication, automatic publication, fresh dependencies and this
signed-in desktop/browser-width acceptance are verified subcriteria, not 100%
physical acceptance. Automatic X extraction, proprietary charting, fresh props,
a validated green model and separate #363 discovery scope remain outside this pass.

Detailed receipts, public downloads and screenshots stay ignored under
`.local/research-acceptance/`; no account identity, private prediction or live
quote detail is published. The frozen v62 tracker is unchanged. The release
captain owns consolidation of these three evidence files into the combined
acceptance PR; this lane makes no separate runtime or evidence PR.
