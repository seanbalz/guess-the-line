# Fantasy Track 1 release — October 23, 2026 (D-57)

Released October 23, 2026 at 22:07 UTC (3:07 PM PT) on Sean's approval of the
[release card](FANTASY_TRACK1_RELEASE.md) in
[PR #200](https://github.com/seanbalz/guess-the-lines-repo/pull/200): API then frontend
from `main` at `0bd4f1a588f20da90fea9d5931ce7bc0d20cad6d` (the merge of
[PR #198](https://github.com/seanbalz/guess-the-lines-repo/pull/198)). No migration was
applied.

| Gate | Run | Result |
| --- | --- | --- |
| Main CI on the exact SHA | [Tests](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40025300650), [Dashboard checks](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40025300646), [Brand QA](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40025300571) | All passed on the `push` runs |
| Check-only | [40030329389](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40030329389) | Exact source and main CI verified |
| Readiness | [40030382826](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40030382826) | Passed at 21:58 UTC |
| Deploy, first attempt | [40031013541](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40031013541) | Stopped in the read-only hosted preflight at 22:04:21 UTC ("The operation was aborted due to timeout") before any deploy step. `gtl-api` stayed v34; the database answered with 51 migrations at 22:04:58 UTC |
| Deploy, retry | [40031274160](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40031274160) | API then frontend deployed; the workflow's verify step passed at 22:07:25 UTC |

Both deploy runs were dispatched with the same inputs: target `api-and-frontend`, the
release card PR #200, digest `bd9da17a…` and `compatibility_reviewed`. Each production
gate was approved for Sean's approved release only after the run's title matched the
approved SHA and target.

## What is live

- **API:** `gtl-api` **v35**, ACTIVE, JWT verification on, bundle SHA-256
  `7a57effad67f05b29ceab813dba3284a6140a46009434762895cb79acc8114f8`. All 66 deployed
  source files, retrieved from the hosted function, are byte-identical to `0bd4f1a`.
  Exactly eight differ from v34 (`d65268e`): `cloud/handler.mjs`,
  `cloud/feature-off.mjs`, `cloud/fantasy.mjs` (new), `shared/fantasy-rankings.mjs`,
  `shared/fantasy-build.mjs`, `shared/fantasy-review.mjs` (new),
  `shared/fantasy-index.mjs` (new) and `shared/fantasy-refresh.mjs` (new). The other
  four functions kept their versions: `gtl-odds-refresh` v6, `gtl-week-open` v5,
  `gtl-push-reminders` v4 and `gtl-results-refresh` v3.
- **Frontend:** Pages **`78909363-8e4c-4980-a9d7-9ee5f839367d`**, 98 assets verified at
  both URLs, frontend SHA-256
  `909461ef52adb506c9346dae97e08f37fdc8411e171012b6c5ee8de4e2670bd4` (matches the
  readiness build).
- **Migrations:** 51 hosted, digest
  `bd9da17ade5d3f6a98924270c88174b0ced7d4740102bd4e62c762f8e22d3b17`, unchanged before and
  after. Pending repository migration `20261023180000` (P-01, D-56) is not applied.
- **Boundaries:** 284 of 284 signed-out probes denied after the deploy. Signed-out
  `POST fantasy/week` now answers 401; readiness had listed it as awaiting this deploy.

## Signed-in readback

- Hosted edge log, 22:09:18 UTC: a signed-in `POST /functions/v1/gtl-api/fantasy/week`
  on v35 returned **404 in 608 ms** after a 204 preflight. That is the expected answer
  before the first data publish ("No Fantasy data has been published for this season"):
  the route returns it only after the sign-in check, and signed-out calls get 401.
- Function logs from 22:06 to 22:10 UTC show no "CPU Time exceeded". The `shutdown`
  lines are routine idle-worker exits, with the same pattern at 21:41 and 21:59 UTC
  before the deploy.
- In Sean's signed-in Chrome, Research → Fantasy loaded the new bundle and showed
  "Showing saved Week 6 · live refresh unavailable" with the stale-snapshot notice: the
  committed fallback the release card describes.
- A signed-in 2xx is not possible until the refresh workflow publishes the
  `fantasy-data-2026` release.

## Not done

- The refresh workflow has not run. Next, with Sean's OK: a dry run of
  `fantasy-refresh.yml`, then the first real run, then a readback of the
  `fantasy-data-2026` release and its `index.json` and a signed-in 2xx.
- The phone-width check, the lock line and the implied-totals checks in the release
  card's readback checklist.
- The daily schedule is a separate later change after a verified manual run.

## Rollback

- API: redeploy `gtl-api` from `d65268e` (v34, bundle `b853a6fb…9d44`), or set
  `GTL_FEATURE_OFF=fantasy` (a hosted secret change that needs Sean's OK).
- Frontend: restore Pages `21b65352-a177-4569-9b03-4d5c6c080bfd` (source `06a6fcb`).
- Nothing was written to the database, and no data needs restoring.
