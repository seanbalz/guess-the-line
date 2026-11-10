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

## Not yet applied

Migrations M-33–M-35 and M-41–M-47 remain unapplied hosted; the features that
need them stay capability-gated off. Apply them per
[the migration packet](MIGRATION_APPLY_PACKET_2026_11_10.md) once the Supabase
connector reaches the Guess The Line project.
