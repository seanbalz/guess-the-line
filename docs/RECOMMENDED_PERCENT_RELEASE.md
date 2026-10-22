# Guess The Line — percentage-ranked recommendations release

Owner: Sean Balsiger · October 21, 2026

Status: frontend released and verified at 2026-10-21 21:57:33 UTC. Signed-in
and physical-phone acceptance remain separate from the automated release.

Sean approved percentage ranking and compact, expandable Bets recommendations,
then asked to get the merged change deployed. A 5-point gap against a 50-point
Total and a 1-point gap against a 10-point Spread both rank at 10%. Pick'em and
small spreads use a labeled 3-point minimum denominator. Expanded rows retain
source times, book terms, both-side guidance, actions and same-market historical
context. The bundled Week 7 trend data is redacted and sourced from nflverse.

## Reviewed source and scope

[PR #164](https://github.com/seanbalz/guess-the-lines-repo/pull/164) merged as
`8ca21017c8e9ff84db26d17dc29eb39734799796` from reviewed head
`2d25c6767aa0bd01af0e7df14f672772505ffe0e`. Its five PR checks passed:
Tests, Windows portability, Dashboard, Persona and Brand QA. Local validation
passed 1,457 Node and 202 React tests, 12 focused browser cases, typecheck,
builds, Week 7 reproducibility and brand QA. The task branch passed
`npm run sync:check` at the reviewed head with zero ahead, behind or changed
files. The frozen v62 tracker was preserved.

Release target: **frontend only**. PR #164 changes no API, SQL writer,
request/reply shape or migration. The
merged main source also includes independent PR #163's private NBA storage
migration, which was applied separately at hosted version `20261021205118`.
M-10 and two D-53 migrations remain outside this release. No
migration, provider collection or test player bet is part of this release.
Main later advanced to `fb86a3ea55bd91db1b1937dcd40ee70063d37716`
with the independent trends-research work. This frontend release is pinned to
the earlier merged `8ca21017` source and does not deploy that later API/UI.

## Release gates and rollback

The release card is in PR #164. The manual [shared production
workflow](SHARED_DEPLOYMENT.md) ran on the exact merged SHA: main-push CI,
check-only, protected readiness, digest review, protected frontend deploy, then
hosted asset and boundary verification. The previous verified Pages deployment is
`dcfb977b-c388-4706-b728-d0c11e356228`; restore that frontend if rollback is
needed, preserving the currently hosted API and all stored data. This UI-only release has no
database rollback.

Read-only hosted snapshots at 2026-10-21 21:55:10 UTC, just before deployment,
and 21:58:13 UTC, just after, matched exactly in count and ordered whole-row
MD5. These checks cover the tables below, not every private or future row.

| Data | Rows | MD5 |
| --- | ---: | --- |
| Weekly ballots | 23 | `512d489fcca0601ec55cbb2740c9bf73` |
| Social commits | 101 | `deab4c7fa4d311a83bf57c9b7a7dbadd` |
| Social weeks | 3 | `6632b7a7f16e5e557b24dcfc7a8d0616` |
| Leagues | 5 | `f0829d86e791279107b5586edcc1d0a2` |
| Memberships | 9 | `2675220cf79be2e8b96b3af54ccce541` |
| Virtual Units picks | 7 | `714dbe7fc8a5dde70fc0af9d402efef1` |

## October 21 production evidence

All three required main-push workflows passed on the exact merge SHA:
[Tests](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39674582856),
[Dashboard checks](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39674582821)
(including Persona) and
[Brand QA](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39674582838).
The Windows private-recovery subtest hit its 15-second PowerShell timeout in
the first Tests attempt; it passed on the failed-job retry, while the main test
job had already passed. The exact test also passed locally in 6.3 seconds.

- [Source check 39682171831](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39682171831) passed for `8ca21017`.
- [Protected readiness 39682242975](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39682242975) passed with hosted evidence at 21:53:38 UTC.
- [Protected frontend release 39682597127](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39682597127) passed with live verification at 21:57:33 UTC.

Readiness and deploy both found 46 hosted migrations with SHA-256
`c571cd2de3d53ae0239a98d792cd0a1b542c2cbdda08190d2fa98ca4b126910f`.
The repository's pending-version list includes M-10, both D-53 files and the
private NBA file version `20261021201054`; the separately applied NBA migration
has hosted version `20261021205118`. No migration was applied here. The
published Week 7 schedule passed with timing restrictions disabled. Before and
after boundary checks each covered 268 signed-out probes: 262 denials and the
same six documented pending-migration allowances.

Pages deployment `1e349227-b5dc-4561-aeb6-04d6cd57da50` serves the exact
frontend source at [the immutable URL](https://1e349227.guess-the-line.pages.dev)
and [production](https://guess-the-line.pages.dev). All 96 served assets at
each URL matched the manifest; frontend SHA-256 was
`ebfb171fd798f6d360275f8683ee7e7fd28ecb3a018bd674f747428d8647be31`.
Hosted `gtl-api` remained v28 ACTIVE with JWT verification and bundle SHA-256
`8fe54bce2eed82a973674fc31188bba548d21ad758bdefe8689bd811af91e656`.
Its byte-for-byte source was not independently verified by this frontend run
(`apiSourceVerified: false`); no API deployment was requested. Other Edge
worker versions and configuration stayed unchanged according to the protected
verification. No synthetic production bet or pick was written.

The browser suite used synthetic signed-in fixtures. A human signed-in check
of the production recommendation rows and physical-phone acceptance remain
open; asset verification and signed-out probes do not establish those flows.
