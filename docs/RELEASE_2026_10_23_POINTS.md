# Guess the Points release — October 23, 2026 (D-56)

Released October 24, 2026 at 01:09 UTC (October 23, 6:09 PM PT) on Sean's instruction
("release and deploy and merge any open item", then "expedite deploys and merges. do not
delay"), with the [release card](GUESS_THE_POINTS_RELEASE.md) in
[PR #206](https://github.com/seanbalz/guess-the-lines-repo/pull/206): both Points
migrations first, then API then frontend from `main` at
`1efd802bea78d298b1c30ede7824b6a6213c23aa` (the merge of
[PR #204](https://github.com/seanbalz/guess-the-lines-repo/pull/204); it includes
[#199](https://github.com/seanbalz/guess-the-lines-repo/pull/199) and
[#203](https://github.com/seanbalz/guess-the-lines-repo/pull/203)).

## Migrations

| Order | Repository file | Hosted version | Applied (UTC) |
| --- | --- | --- | --- |
| 1 | `20261023180000_gtl_points_core.sql` (P-01) | `20261024000059` | 00:00:59 |
| 2 | `20261023190000_gtl_points_feed_push.sql` (P-02) | `20261024000315` | 00:03:15 |

Applied through the Supabase SQL editor in Sean's signed-in Chrome (role `postgres`), each
file fetched from GitHub at `4a8d250` and checked against its SHA-256 before running, with
its history row in the same run. Hosted history went from 51 migrations (digest
`bd9da17a…`) to **53, digest
`300257804ccaa7c09d7ab3895ddb7221a5bacb2a44ce2ab6b6516bcc83cd4a2e`**. Score hash
`dbf6b85f7c5d1a5e47edba8797160762` (25 ballots) and every preservation hash were identical
before P-01, after P-01 and after P-02. The full Gate M evidence is in the card.

## Gates

| Gate | Run | Result |
| --- | --- | --- |
| Main CI on the exact SHA | [Tests](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40045090231), [Dashboard checks](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40045090207), [Brand QA](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40045090241) | All passed on the `push` runs |
| Hosted readiness | [40045245964](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40045245964) (on `eda1da2`, dispatched by the release-lane session) | 53 migrations, the digest above; 302 of 306 probes denied, the 4 Points routes awaiting this deploy |
| Deploy | [40048239489](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40048239489) | Source and CI re-verified; API then frontend deployed; verify passed at 01:09:13 UTC |

Separate check-only and readiness runs on `1efd802` were skipped to expedite, as Sean
asked: the deploy run repeats the exact-source and CI check, builds and scans the source,
and runs the same read-only hosted preflight (digest match) before deploying. Dispatched
with target `api-and-frontend`, the release card PR #206, the digest above and
`compatibility_reviewed`. The production gate was approved through the GitHub API as
Sean's account, per his instruction, after the run title matched the SHA and target.

## What is live

- **API:** `gtl-api` **v36**, ACTIVE, JWT verification on, bundle SHA-256
  `002508c73f4bd8b0ba65f680cc5121c4ed297b4f21598388d56a0f955851a9cf`. All 69 deployed
  files match `1efd802` (SHA-256 after LF normalization); 5 differ from v35:
  `cloud/points.mjs` (new), `cloud/handler.mjs`, `cloud/community.mjs`,
  `cloud/feature-off.mjs`, `shared/points-slate.mjs`.
- **Frontend:** Pages **`3d274d87-8b1c-470d-9ede-de1287b2ea9f`**
  (<https://guess-the-line.pages.dev>); the workflow verified every served asset.
- **Unchanged:** `gtl-odds-refresh` v6, `gtl-week-open` v5, `gtl-push-reminders` v4
  (`a83ae63f…`), `gtl-results-refresh` v3.
- **Boundary:** 306 of 306 signed-out probes denied; nothing awaiting.

## Signed-in readback (hosted logs, Sean's account in Chrome)

- `POST /points/read` 200 at 01:09:22 UTC (857 ms); Play shows the Guess the Points row
  with the next opening time (no slate is published yet).
- `POST /bets/read` 200 at 01:10:13 UTC (1.5 s); Bets › Virtual › Everyone rendered.
- `POST /community/read` 200 (1.4 s). No "CPU Time exceeded", worker-limit or uncaught
  errors in `function_logs` after the deploy; "shutdown" lines are old isolates ending.

## Not done

- **`gtl-push-reminders`** still runs v4, without the P-02 Points reminder pass. The
  workflow does not deploy it and this PC has no Supabase CLI login of Sean's; deploy it
  from the Mac mini from `1efd802` or later (Gate D). Until then Points game days queue
  reminder runs that the old worker completes without sending; Spread and Total reminders
  are unchanged.
- **P-03** (Points actuals loader and scheduled jobs) is not built: slates can be
  published and guessed, but nothing scores until actuals are loaded.
- Phone-width and real-device checks of the Points screens and Bets › Everyone.

## Rollback

API: redeploy `gtl-api` from `0bd4f1a` (v35); `GTL_FEATURE_OFF=points` stops the Points
writers without a redeploy (a hosted secret change; Sean's OK). Frontend: restore Pages
`78909363-8e4c-4980-a9d7-9ee5f839367d`. Database: P-01 replaces nothing; P-02's rollback
file restores the previous dispatcher. Nothing is dropped.
