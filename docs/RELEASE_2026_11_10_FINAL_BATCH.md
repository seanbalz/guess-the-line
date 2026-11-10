# Final batch release — November 10, 2026 UTC

**Deployed and verified** from `1ba752821bddacedb725c0ebef2f9929827481d2`.
Sean approved both production gates.

| Evidence | Verified result |
| --- | --- |
| API and frontend deploy | [42765795305](https://github.com/seanbalz/guess-the-line/actions/runs/42765795305), success; finished 2026-11-10T14:28:07Z |
| Production | https://guess-the-line.pages.dev |
| Served bytes | All 144 production assets checked against the clean build |
| API | `gtl-api` v54; deployment metadata verified |
| EPL jobs worker deploy | [42834904659](https://github.com/seanbalz/guess-the-line/actions/runs/42834904659), success; finished 2026-11-10T14:35:40Z; deployment metadata verified |
| Migration history | Digest `d40fdad9eb144738cdbd032e3c95ba433b4cb1606f3de3ab8079f0df1b8108f1` unchanged |

Included: Monday recap on Home ([#521](https://github.com/seanbalz/guess-the-line/pull/521)),
custom Virtual Units in hundredths ([#497](https://github.com/seanbalz/guess-the-line/pull/497)),
Player Props finish and `/props/shared` ([#519](https://github.com/seanbalz/guess-the-line/pull/519),
[#522](https://github.com/seanbalz/guess-the-line/pull/522)), and the EPL jobs worker
([#513](https://github.com/seanbalz/guess-the-line/pull/513),
[#515](https://github.com/seanbalz/guess-the-line/pull/515)).

Superseded drafts [#491](https://github.com/seanbalz/guess-the-line/pull/491) and
[#489](https://github.com/seanbalz/guess-the-line/pull/489) were closed.

## Migrations after this release

When this record was written, M-33–M-35 and M-41–M-47 were not applied, and the
features that need them stayed off behind their capability checks.

**Update, November 10, 21:24 UTC:** M-41 to M-47 are now **applied and verified** as
hosted `20261110203637` to `20261110204307`. The history has 83 rows. See the
[apply record](RELEASE_2026_11_10_MIGRATIONS_M41_M47.md). Custom stakes in hundredths,
EPL three-way entry, the screenshot import and the result-announcement storage are live.
Player Props stays dark, and the EPL `results` job row is disabled. M-33, M-34 and M-35
are still not applied; see [the migration packet](MIGRATION_APPLY_PACKET_2026_11_10.md).
