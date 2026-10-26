# Guess the Points P-03 release card (D-56): the scheduled jobs

Prepared October 26, 2026 on Sean's instruction: "Build P-03 here: the Points open, actuals and finalize jobs on
main's P-01, as a PR. No deploy or migration apply without my word." **Nothing here is applied or deployed.** Each
step below needs Sean's own words. Design: `docs/superpowers/specs/2026-10-22-guess-the-points-design.md` (3.1, 3.5,
3.6, 4.2, 4.4, 7); P-01 and P-02 are hosted (`20261024000059`, `20261024000315`).

## What P-03 adds

- **Migration P-03** `supabase/migrations/20261026120000_gtl_points_jobs.sql` (additive, `NOT_HOSTED`): the job
  schedule (`gtl_points_job_schedule`, disabled by default), the run queue with a one-run capability
  (`gtl_points_job_runs`, `gtl_dispatch_points_jobs`, `gtl_claim_points_jobs`, `gtl_complete_points_jobs`) and a
  service-only `gtl_points_jobs_state`. No existing object changes.
- **Edge function** `gtl-points-jobs` (`supabase/functions/gtl-points-jobs/index.ts`, `cloud/points-jobs.mjs`,
  `verify_jwt = false`, the `gtl-week-open` pattern). Each run, all steps idempotent:
  1. **Slate.** Builds the coming week's draft from the Track 1 snapshot (`fantasy-data-<season>`), with the
     nflverse game ids, House estimates and provenance, so the commissioner can still preview and swap. It
     publishes the draft at Tuesday 12:00 PM PT. Before this, no code built a slate at all.
  2. **Actuals.** Loads nflverse weekly stats for every started week that isn't FINAL, scored Full PPR with 4-point
     passing TDs. A slate player with no stats row is marked inactive (roster INA), reserve, postponed (the schedule
     moved the game to another week), played with 0 (snaps), or unknown (pending). So a postponed or inactive slot
     now voids instead of holding FINAL forever. A fetch failure is recorded as a failed load and changes nothing.
  3. **Finalize.** Freezes each week once its Thursday 12:00 PM PT FINAL time has passed and every slot is resolved.
- **Cron file** `supabase/admin/points_jobs_cron.sql` (hand-run only): daily at 11:30 UTC; Tuesday catch-up runs at
  :30 past 12:00–18:00 and 21:00–23:00 UTC; Tuesday and Thursday 12:00 PM PT (two UTC jobs each for PDT/PST). Track 1's
  11:00 UTC refresh has actually landed 3–6 hours late (scheduled runs started 14:11, 14:42 and 17:04 UTC, October
  24–26). The Tuesday catch-up runs draft the slate as soon as its snapshot is published, so the commissioner can still
  preview and swap before the open.

## Release steps (in order; each needs Sean's word)

1. **Merge** this PR after CI passes.
2. **"apply P-03"** (Gate M steps 4–7) through the Supabase SQL editor in Sean's signed-in Chrome, the route used for
   P-01 and P-02. Pre-check that no `gtl_points_job*` object exists. Verify each function's md5, grants service-only
   (dispatch granted to no one), and the score and preservation hashes unchanged.
3. **Mac mini (Sean):** deploy `gtl-points-jobs` and `gtl-push-reminders` from the merged SHA. The second is P-02's
   Points reminder pass, still undeployed (hosted v4). This PC has no Supabase CLI login of Sean's.
4. **Schedule:** run `supabase/admin/points_jobs_cron.sql` steps 1–2: the schedule row stays disabled, and the cron
   jobs are registered.
5. **One verified run:** enable the row and dispatch once. Do it outside an hour that has a cron run, because a manual
   dispatch uses up its clock hour; for example, not in the 11:00 UTC hour. Then:
   - read `gtl_points_job_runs` (status, reason, summary);
   - read the hosted logs: `function_edge_logs` 2xx, and `function_logs` with no "CPU Time exceeded";
   - confirm a signed-in `/points/read` shows the drafted or published slate.

   This run won't exercise the CPU-heavy actuals step until a published slate has kicked off.
6. **First actuals readback:** check the first run after Week 8's first kickoff (Friday October 30, 11:30 UTC):
   - `gtl_points_actual_loads` has a `saved` row with coverage;
   - that run in `gtl_points_job_runs` succeeded;
   - `function_logs` show no CPU or memory limit hit;
   - a signed-in `/points/read` shows scored and void slots.

   Signed-out probes alone are not evidence: release API v31 hit the CPU limit unseen.
7. **Boundary (Gate M step 8):** move P-03 to `APPLIED`, remove its `awaitingDeploy` RPC probes, and add the two new
   tables and the `gtl-points-jobs` worker probe. They're left out now because the checker can't yet hold table or
   worker probes as awaiting deploy.

**Timing.** Week 8's Track 1 snapshot is expected Tuesday October 27, usually between 14:00 and 17:00 UTC. If steps
2–5 are done before then, the next Tuesday catch-up run drafts Week 8 and the 12:00 PM PT run publishes it. If
they're done later the same Tuesday, a catch-up run after the open drafts and publishes in one run. Otherwise the
commissioner can draft and publish by hand while the week's first kickoff is still ahead.

## Rollback and off switch

Disable the schedule row (`update public.gtl_points_job_schedule set enabled=false`). Runs, loads and slates stay
(D-23). That row is the scheduler's only off switch: `GTL_FEATURE_OFF=points` pauses the member and commissioner
routes in `gtl-api`, not the jobs. P-03 adds no objects other code depends on, so leaving it applied is safe.

## Known limits (not built here)

- A kickoff moved within the week doesn't move the stored slot kickoff, because published slates are immutable in
  P-01.
- The worker is tested in Node. Deno and the hosted Edge runtime are checked by step 5's verified run.
- The Points board shows nothing scored until the first actuals load after a week's first game.
- **How a moved game is detected.** When nflverse moves a game to another week it gives it a new game id. A slot is
  marked postponed when its id is gone and the same away and home teams play in another week. A game with no match at
  all (cancelled) stays pending. **No commissioner ruling path exists on `main` yet**, so such a slot, or one with no
  stats, an ACT roster row and no snap row, keeps its week from going FINAL. Today's only remedy is an admin SQL
  session: a hand-built `gtl_points_load_actuals` row for that player, then `gtl_points_finalize`, in the same session.
  The worker's next load with a new stats checksum would otherwise overwrite the hand-set row. A ruling path, which
  the worker must then respect, is later scope.
- **Loads key on the stats file only.** A roster or snap change made after the week's last stats change waits for the
  next stats change, so a Thursday-noon FINAL can slip to Friday's run.
- **A commissioner draft can still be replaced in a short race.** The scheduler re-reads the state just before it
  drafts. P-01's draft is an upsert, though, so a commissioner draft saved in that one round trip would be replaced.
  Closing it fully needs P-01's scheduler draft to refuse when a slate already exists.
- **A missed week raises no alarm.** A draft never published before its first kickoff finishes the run as
  `skipped/nothing_due`. Treating that as a failure is a separate decision.

## Deviations from the spec and plan (for Sean's review)

- **One job kind, `run`.** Each run drafts, publishes when due, loads actuals and finalizes. P-01 still enforces
  `opens_at` and the first kickoff on publish, and `finalize_at` on finalize.
- **No `POST /points/actuals` route** (spec 4.2). The separate scheduled worker calls the loader directly, following
  the week-open pattern; no browser-reachable writer is added.
- **Track 1's review-file checksum cross-check is not built** (spec 4.4). The spec flags a load when the review file
  names a different stats checksum. The two jobs fetch the file hours apart and nflverse updates it nightly, so the
  hold would often block valid loads. Recommended: drop it, or rebuild it as an informational note.
- **Postponed games are detected by team pair**, because nflverse gives a moved game a new id; see Known limits.
- **A snaps-only player scores 0 only once his game appears in the stats file.** Before that he stays pending.
- **Off-position slate rows** (FB/CB/blank in the stats file) are scored with the slot's position; offense weights
  are the same.
- **Roster status outranks snaps.** INA/RES voids a slot even if a snap row exists without a stats row. Spec 3.6 voids
  only on "no snap". The conflict is rare, and the rule is the same for every member.
- **Roster fetch cap is 24 MiB** (design said 8 MB). The real file was 5.74 MB through Week 7 and is about 16.5 MiB at
  season's end.
- **Boundary table and worker probes are added at apply time** (step 7), not now.
