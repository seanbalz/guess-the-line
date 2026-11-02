# Research acceptance — November 2, 2026

Owner: Sean Balsiger · Version 1 · Preparation; current-build acceptance pending

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
| Current source dependencies | **Open readiness blocker: stale** at 22:30:28 UTC / 2:30:28 PM Pacific | Completed and schedule dependency hashes must both match live public source, with no missing finals |
| Populated authenticated current build | Unverified; deliberately waits for stable #408 release | Current published week, statistics/evidence, assessments, freshness and reveal states in Light/Dark |
| Physical iPhone | Pending; sole device owner retains operation | Record actual device/build/launch mode and the bounded accepted flows |

No deployment, manual refresh, provider-credit request, player write, account
credential transfer or phone input was performed by these preparation checks.

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
build and publish/verify steps, and a downloaded receipt matching the current index.
The workflow's UTC cron is `23 */4 * * *`. Actual observed delivery is irregular;
the last run's creation time does not establish the next delivery time.

## Current bytes, source dates and independent readiness

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

## Final acceptance checklist

After the #408 owner confirms its stable served build, record its actual
frontend source/Pages identity and current API version before evaluating:

1. A real signed-in account's current published season/week, independent of an
   older selected private-league week; no synthetic sign-in or borrowed tokens.
2. Populated observed scoring statistics, accessible historical evidence and
   honest play-statistics/recommendation locks under that account's real gates.
3. Separate source observation, snapshot-build, current fetch and retained quote
   times. A stale/missing quote may correctly produce gray; no green model,
   proprietary charting, automatic X extraction or prop-price coverage is implied.
4. Filters, detail/back navigation, read-only refresh/retry and account/week
   invalidation, with no unrevealed market values or private submissions leaked.
5. Light/Dark readability, populated phone-width layout and navigation clearance,
   explicitly separate from actual physical-iPhone acceptance.

Observe the next existing automatic publication and repeat exact index/file/
receipt/dependency checks. If matching fresh data has not arrived after #408 is
stable, coordinate one normal manual refresh with the sole release captain;
do not start parallel publications or bypass stale gates. No such manual run
has been dispatched by this preparation.

Detailed downloaded receipts, public source bytes and readback reports remain
ignored under `.local/research-acceptance/`. No private account data or screenshots
are published. The frozen v62 tracker is unchanged.
