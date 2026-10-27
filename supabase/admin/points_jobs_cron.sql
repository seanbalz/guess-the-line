-- ADMIN ONLY (D-56 P-03). Run by hand from the SQL editor, only on Sean's word, and only after:
--   1. Sean's "apply P-03" has applied 20261026120000_gtl_points_jobs.sql,
--   2. exact-source CI is green and the gtl-points-jobs Edge function is deployed (verify_jwt = false; the one-run
--      capability is the credential), and
--   3. pg_cron and pg_net are enabled.
-- The Supabase CLI never runs this file. Nothing here changes a player's guess, a published slate or a FINAL week.
--
-- Supabase pg_cron evaluates schedules in UTC. Every job calls the same dispatcher; the worker's steps are idempotent and
-- safe at any time, and one run is queued per clock hour. Tuesday 12:00 AM and Thursday noon Pacific are registered twice
-- (PDT, PST): the run that lands an hour early or late is a harmless no-op.
--   30 11 * * *   daily: draft the next slate, load actuals, finalize what is due
--   0 7 * * 2     Tuesday 12:00 AM PDT (D-61): draft and publish the slate (opens_at is Tuesday 12:00 AM PT). Monday night's
--                 nflverse stats land at about 05:33 UTC and the Fantasy refresh's Tuesday runs (06:17, 06:47 and 07:17 UTC,
--                 .github/workflows/fantasy-refresh.yml) build the week's snapshot from them before the open.
--   0 8 * * 2     Tuesday 12:00 AM PST (in daylight time, the first catch-up)
--   30 9-10,12-23 * * 2   Tuesday catch-up: GitHub has started scheduled Fantasy refreshes 3-6 hours late (October 24-26), so
--                 a run each hour after the open drafts and publishes in one run as soon as the snapshot is published. Each
--                 run is in its own clock hour (11:00 UTC belongs to the daily run).
--   0 19 * * 4    Thursday 12:00 PM PDT: last load and finalize
--   0 20 * * 4    Thursday 12:00 PM PST
-- Moving an installed schedule to D-61: supabase/admin/points_jobs_cron_d61.sql.

-- 1. The schedule row, created disabled. Replace <project-ref> with the hosted project's reference.
insert into public.gtl_points_job_schedule(id,enabled,endpoint)
values('nfl-points',false,'https://<project-ref>.supabase.co/functions/v1/gtl-points-jobs')
on conflict(id) do nothing;

-- 2. The cron jobs (also safe while disabled: each call returns disabled).
select cron.schedule('gtl-points-daily','30 11 * * *',$$select public.gtl_dispatch_points_jobs()$$);
select cron.schedule('gtl-points-tuesday-open-pdt','0 7 * * 2',$$select public.gtl_dispatch_points_jobs()$$);
select cron.schedule('gtl-points-tuesday-open-pst','0 8 * * 2',$$select public.gtl_dispatch_points_jobs()$$);
select cron.schedule('gtl-points-tuesday-catchup','30 9-10,12-23 * * 2',$$select public.gtl_dispatch_points_jobs()$$);
select cron.schedule('gtl-points-thursday-pdt','0 19 * * 4',$$select public.gtl_dispatch_points_jobs()$$);
select cron.schedule('gtl-points-thursday-pst','0 20 * * 4',$$select public.gtl_dispatch_points_jobs()$$);

-- 3. Optional dry run, ONLY while enabled=false (the dispatcher then returns {"status":"disabled"} and posts nothing). It is
--    commented out on purpose: once the schedule is enabled, the same call queues and posts a REAL run, so re-running this file
--    after enabling can never reach it.
-- select public.gtl_dispatch_points_jobs();

-- 4. Enable, then verify one real run in public.gtl_points_job_runs (status succeeded or skipped). A manual dispatch uses up its
--    clock hour (one run per hour), so do it outside an hour that has a cron run, e.g. not in the 11:00 UTC hour.
-- update public.gtl_points_job_schedule set enabled=true where id='nfl-points';
-- select public.gtl_dispatch_points_jobs();

-- Off switch (Sean approves the hosted change): stops new runs; every run, slate, actual and FINAL week stays (D-23).
-- update public.gtl_points_job_schedule set enabled=false where id='nfl-points';
-- Remove a cron job: select cron.unschedule('gtl-points-daily');  (and the five others)
