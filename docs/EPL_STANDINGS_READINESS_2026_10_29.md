# EPL standings source readiness — October 29, 2026

Status: a bounded Wikimedia community-data adapter and dated record are ready for review. **No provider connection,
scheduled collection, database persistence, worker fallback wiring or deployment is enabled.** The standings-source
task remains open until those steps have their own exact-source review/release and hosted acceptance evidence.

## Verified source and normalization

The public [MediaWiki revisions API](https://www.mediawiki.org/wiki/API:Revisions) returned article revision
`1382589055`, revised `2026-10-29T10:59:04Z`, from the
[2026–27 Premier League article](https://en.wikipedia.org/w/index.php?title=2026%E2%80%9327%20Premier%20League&oldid=1382589055).
The revision response was HTTP 200 at `2026-10-29T15:38:59Z`; response SHA-256:
`39d80f16dfc35931c1883ea5221912faefe30a46c58e84cd1ae597d45b02c8b0`.

The supported table declares automatic standings with points, goal difference and goals scored as its ranking criteria,
and a data update of **October 25, 2026**. Its 380 directed fixture entries contain 80 completed results, with eight played
matches for each of 20 known clubs. Normalized positions are unique integers 1–20; all names map to existing GTL codes.
The derived record retains only the bounded table and provenance, not the article or fixture matrix.

A separate rendered-table response for that same revision was HTTP 200 at `2026-10-29T15:35:10Z`, SHA-256
`ae268dd78d3cf5c30226fe5d70389fb5b7959650cc7de18fec341618a32125a4`.
Every normalized position, W-D-L, played count, goals, goal difference and points value matched all 20 rendered rows.
The original parse/wikitext read was HTTP 200 at `2026-10-29T15:34:39Z`, SHA-256
`e717855a98b5e5534129cf0b185ce854b08fd421f72114a02cb9206434ede1eb`.

This verifies the provider's dated content and deterministic transformation. It is **not independent official league
verification**: the article links the official table, but that page rendered only a shell during this review. The adapter
and record explicitly identify Wikimedia community data and set `official:false`.

## Eligibility and remaining integration

`cloud/epl-standings.mjs` supports one bounded, anonymous MediaWiki revision request: 256 KiB maximum, ten-second
timeout, no redirects and no retries. It sends an identifying user agent and requests no editor identities. The pure
normalizer requires the known club set, full fixture matrix, requested season/completed round, compatible source format,
and consistent round arithmetic. Unsupported score markup, points adjustments or unresolved ranking ties are unavailable.

`shared/epl-standings.mjs` validates the normalized record before returning `{status:'ready',positions:{club:rank}}`.
It rejects missing/duplicate/unmapped clubs or ranks, invalid W-D-L/points/goals, inconsistent ordering, future timestamps,
wrong season/round, missing provenance, captures older than 24 hours and data dates older than seven days. A later capture
does not reset the source's data date. These are readiness limits, not evidence of production collection.

The committed snapshot expires under those rules. A consumer must provide a trusted current season/completed round and
clock; validation is not authentication of arbitrary client-provided provenance. Postponed or partly completed rounds and
points deductions are deliberately unsupported in this version. They remain unavailable rather than manufacturing ranks.

Future integration must persist a service-collected record with provenance, revalidate it when read, and supply positions
to M-33's strict `favorability[club].position` path only when ready. Missing/stale/incomplete data must preserve the existing
`needs_review` behavior. Do not add a table input supplied by a browser, silently use this fixture as current, bypass a
quota guard, or re-order entered picks. No migration or production import is part of this change.

## Reuse and attribution

The [Wikimedia terms, section 7](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use#7._Licensing_of_Content)
permit properly licensed reuse and allow page/history links for contributor attribution. The derived data record retains
Wikipedia contributor credit and a revision link, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en)
notice/link, and a change notice describing extraction, calculation and club-code normalization. Sharing adapted licensed
material requires the applicable ShareAlike license and no additional restrictions on those rights. The data is separated
from independently written code; no new license is applied to application code or private player data. Images and logos
are excluded. The record does not imply endorsement.

The [Wikimedia API policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines)
requires correct user-agent identification, respecting throttling/backoff and content licenses, and avoiding disruptive
traffic or attempts to evade limits. A future collector must cache, back off and preserve provider identity; this change
does not run a collector or guarantee API availability.

## Alternatives checked directly

| Source | Actual observation | Assessment |
| --- | --- | --- |
| [OpenLigaDB PL 2026 fixtures](https://api.openligadb.de/getmatchdata/pl/2026) and [table](https://api.openligadb.de/getbltable/pl/2026) | HTTP 200 at `2026-10-29T15:32:47Z`: 380 fixtures, 60 marked finished in rounds 1–6; all ten fixtures in each of rounds 7 and 8 have past kickoff dates but remain unfinished. Latest finished kickoff is October 12. The 20-club table gives every club only six played matches. | Does not establish a current round-8/9 table. Fixture SHA-256 `5bc7f2def9f9725461afae05ae8cc04038122291b3e6991bb7c678a0963bac9d`; table SHA-256 `8b1bd77a30bd75ac1ae54eaf6ae8722275873b11847f3508a365aaaa78d59996`. |
| [football-data.org](https://www.football-data.org/pricing) | Advertises free EPL league tables; actual unauthenticated `/v4/competitions/PL/standings` returned HTTP 403 at `2026-10-29T15:33:25Z`. | Candidate requiring an authorized API key and real freshness/completeness readback, not a verified connection. No signup performed. |
| [TheSportsDB API](https://api.thesportsdb.com/documentation) | Its documented public free key returned HTTP 200 at `2026-10-29T15:34:39Z` for EPL 2026–2027, updated October 29, but only ranks 1–5, matching its documented five-row free limit. SHA-256 `ed8871518171b2e9e1c25bef53a10927aee69870b319f53e6ab8a0e29e428546`. | Incomplete for a 20-club fallback. No attempt to evade the free limit. |

OpenLigaDB's [primary Swagger](https://api.openligadb.de/swagger/v1/swagger.json) identifies its data as ODbL 1.0,
keyless and free, with a 60-request/minute/IP limit and sparse, change-aware polling requested. The dedicated terms/license
HTML pages returned cookie shells during this review; the homepage and API specification both link ODbL.

If reconsidered after freshness improves, [ODbL 1.0 sections 4.2–4.7](https://opendatacommons.org/licenses/odbl/1-0/)
require retained notices/license links when conveying the database, source/license notice for public produced works,
and ShareAlike for publicly used derivative databases. Public use of a work made from a derivative database also requires
offering the derivative database or alteration file/algorithm, including added contents, in machine-readable form, free
online. Independent collective databases are distinguished from derivatives; internal use is treated differently. Additional
restrictions must not remove licensed rights. This is not permission for linked logos or other separately protected assets.
No OpenLigaDB database is incorporated by this change.

The [football-data.org terms](https://www.football-data.org/about) require registration, a key for one application/domain,
confidential credentials and visible provider attribution, and restrict continued use after cancellation. Documentation
does not prove that this account has access. [TheSportsDB terms](https://api.thesportsdb.com/docs_terms_of_use.php)
separately limit free use to development and require paid access for app-store publication; they do not clear third-party
artwork. Neither alternative is activated.

## Validation

Nineteen targeted standings/draft tests passed with zero skips. Typecheck, Brand QA, cloud build, bundle-only privacy
scan and diff checks passed. The build retains its existing large-chunk warning. The independent local replay of the
captured source matched all 20 rendered positions and every W-D-L/goals/points field. No CI result is claimed for this
separate readiness branch; the release coordinator asked to defer opening its PR while the first release batch runs.

The tests cover deterministic normalization, replay of the licensed real snapshot, club/rank completeness, source
format/round rejection, timestamp boundaries, arithmetic and provenance tampering, bounded/erroring responses, no retries,
and no fallback data on failure. The named source commit is reported with the branch handoff. No Odds
API request, signup, private roster copy, hosted write, job enablement or deployment was performed.
