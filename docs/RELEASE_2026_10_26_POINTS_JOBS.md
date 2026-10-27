# Guess the Points jobs release — October 26, 2026

Recorded October 27, 2026 from the release workflow's evidence and a read-only hosted readback. The release itself ran
October 26 between 21:31 and 21:55 UTC from the session that merged P-03, on Sean's instruction there: "deploy
everything and merge it as soon as its in. do not delay". That session's plan for the instruction was: apply P-03, deploy
both workers and the frontend, register the schedule, then one verified run. Its last two steps were not done (see
[Not done](#not-done)). Nothing in this record was deployed or changed by the session that wrote it.

The source is `main` at `9da3ce67bed36a5ae47cdecb5ada2e7cf59a4d2f` (#219 P-03 and #223 the worker release targets, both
merged without waiting for their PR checks per that instruction; main CI on the exact SHA passed before each deploy). The
release card is [GUESS_THE_POINTS_P03.md](GUESS_THE_POINTS_P03.md).

## What changed

| Piece | Before | After |
| --- | --- | --- |
| Migration P-03 `20261026120000_gtl_points_jobs.sql` | not applied | hosted as **`20261026213106`** `gtl_points_jobs` |
| Migration history | 53 rows, `300257804ccaa7c09d7ab3895ddb7221a5bacb2a44ce2ab6b6516bcc83cd4a2e` | 54 rows, **`bd53dcf4993d89a1378147bb5a14d34827a1687a312e4cc3a66964adb2f1f11a`** |
| `gtl-points-jobs` | absent | **v1** (created), `verify_jwt` false, bundle `3c0cb3a6f8714cbe778dd62cc57aa38b99cc18386b9145c125d510691d8ee379` |
| `gtl-push-reminders` | v4 | **v5**, `verify_jwt` false, bundle `e2ec94691efd040fa1a7fcfe2aae014dfead0952998002a38655135a0d6db8ee` (P-02's Points reminder pass) |
| Frontend | Pages `b8a31940-a235-434d-9de7-e6f5eb15b04b` (`17afa76`) | Pages **`b216c36b-7100-4fdb-a6a8-340df2494def`** (`9da3ce6`), 103 assets checked at both URLs, frontend SHA-256 `38f8e489…21db` |
| Points schedule | none | six cron jobs registered; the `nfl-points` schedule row exists and is **disabled** |
| `gtl-api` | v37, bundle `0703f975…f8d2c8d` | unchanged |

The frontend adds, since `17afa76`: Research chart polish and integrity (#216, #218), Research season selection (#222),
the NBA scheduled-game label (#217) and Community members (#211). The D-59 fantasy feed bucket (#220) is in the
source but its migration `20261026220000` is not applied and `gtl-fantasy-ingest` is not deployed.

## Gates

| Gate | Run | Result |
| --- | --- | --- |
| Apply P-03 | SQL editor in Sean's signed-in Chrome (history row `created_by` sbalsiger2@gmail.com) | Before-score hash 28 ballots `84ad9393…` (read by the applying session; no after-hash is in its evidence). P-03 changes no existing object. |
| Deploy `points-jobs` | [40407462310](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40407462310) | Source and CI verified; `gtl-points-jobs` created at v1; verify passed 21:50:18 UTC |
| Deploy `push-reminders` | [40407823407](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40407823407) | `gtl-push-reminders` v4 to v5; verify passed 21:52:55 UTC |
| Deploy `frontend` | [40408090160](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40408090160) | Pages `b216c36b`; verify passed 21:55:28 UTC |

Each run's pre-deploy report already showed 54 rows and digest `bd53dcf4…`, and each verify left history, `gtl-api` v37
and every other function unchanged. Each verify ran 310 signed-out probes: 310 denied, none awaiting. The worker reports
set `pointsJobsSourceVerified` and `pushRemindersSourceVerified` to false: as for `gtl-api`, the bundle hash is recorded
but not matched byte for byte to the checkout.

## Gate M readback (October 27, 2026, read-only)

- **History row:** `20261026213106` holds one statement, 9,765 characters, md5 `24224076b587f91cf0f1e0f45e410db0`,
  identical to the repo file at `9da3ce6` (and at `8ada72b`).
- **Function bodies:** md5 of each hosted `prosrc` matches `scripts/migration-functions.mjs --latest`:
  `gtl_dispatch_points_jobs` `04f44c23…6b`, `gtl_claim_points_jobs` `0128a261…cb`, `gtl_complete_points_jobs`
  `6a085143…7d`, `gtl_points_jobs_state` `9cdff085…5c`. All four are security invoker.
- **Grants:** claim, complete and state are executable by `service_role` only; dispatch by no one (owner only). Both
  tables have row security on, with `service_role` read only.
- **Schedule:** `nfl-points` points at `/functions/v1/gtl-points-jobs` and is disabled. Cron jobs active:
  `gtl-points-daily` (`30 11 * * *`), `gtl-points-tuesday-catchup` (`30 12-18,21-23 * * 2`), `gtl-points-tuesday-pdt`
  and `-pst` (`0 19` and `0 20 * * 2`), `gtl-points-thursday-pdt` and `-pst` (`0 19` and `0 20 * * 4`).
- **Runs:** `gtl_points_job_runs` is empty, and `gtl_points_slates` holds no slate.
- **Worker:** answers 401 signed out and with an invalid capability (13:26 UTC; boots in 20–35 ms per `function_logs`).
- **Boundary:** with this record's probe changes, 367 signed-out probes: 326 denied, 41 awaiting, all of them later
  migrations and the next `gtl-api` deploy. Two earlier attempts aborted on the checker's 15-second request limit before
  reaching the new worker probe; three timed reruns passed with no request over 5 seconds. The slow request was not
  identified.

## Gate M step 8 (this record's PR)

- `tests/migrations.mjs`: `20261026120000` moves from `NOT_HOSTED` to `APPLIED`.
- `scripts/boundary/guess.mjs`: P-03's four `awaitingDeploy` entries are removed; its two tables join the table probes and
  `gtl-points-jobs` joins `workerChecks` (release card step 7).

## Not done

- **Release card step 5, the verified run.** The schedule row is still disabled, so the cron jobs dispatch nothing: no
  slate is drafted or published automatically and no actuals load runs. Enabling it and one verified dispatch need
  Sean's word.
- **Step 6, the first actuals readback**, after Week 8's first kickoff.
- Signed-in `/points/read` on the new frontend, and phone checks.
- Byte equivalence of the two worker bundles to the source.

## Rollback

Disable the schedule row (already disabled). Frontend: restore Pages `b8a31940-a235-434d-9de7-e6f5eb15b04b` (`17afa76`).
`gtl-push-reminders`: redeploy the v4 source with the `push-reminders` target. P-03's objects stay (D-23); nothing reads
them except the worker.
