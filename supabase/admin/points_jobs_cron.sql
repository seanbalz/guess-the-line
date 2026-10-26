-- ADMIN ONLY (D-56 P-03). Run by hand from the SQL editor, only on Sean's word, and only after:
--   1. Sean's "apply P-03" has applied 20261026120000_gtl_points_jobs.sql,
--   2. exact-source CI is green and the gtl-points-jobs Edge function is deployed (verify_jwt = false; the one-run
--      capability is the credential), and
--   3. pg_cron and pg_net are enabled.
-- The Supabase CLI never runs this file. Nothing here changes a player's guess, a published slate or a FINAL week.
--
-- Supabase pg_cron evaluates schedules in UTC. Every job calls the same dispatcher; the worker's steps are idempotent and
-- safe at any time, and one run is queued per clock hour. Tuesday and Thursday noon Pacific are registered twice (PDT, PST):
-- the run that lands an hour early or late is a harmless no-op.
--   30 11 * * *   daily, after Track 1's 11:00 UTC refresh: draft the next slate, load actuals, finalize what is due
--   0 19 * * 2    Tuesday 12:00 PM PDT: publish the drafted slate (opens_at is Tuesday 12:00 PM PT)
--   0 20 * * 2    Tuesday 12:00 PM PST
--   0 19 * * 4    Thursday 12:00 PM PDT: last load and finalize
--   0 20 * * 4    Thursday 12:00 PM PST

-- 1. The schedule row, created disabled. Replace <project-ref> with the hosted project's reference.
insert into public.gtl_points_job_schedule(id,enabled,endpoint)
values('nfl-points',false,'https://<project-ref>.supabase.co/functions/v1/gtl-points-jobs')
on conflict(id) do nothing;

-- 2. Dry run: while enabled=false the dispatcher returns {"status":"disabled"} and posts nothing.
select public.gtl_dispatch_points_jobs();

-- 3. The cron jobs (also safe while disabled: each call returns disabled).
select cron.schedule('gtl-points-daily','30 11 * * *',$$select public.gtl_dispatch_points_jobs()$$);
select cron.schedule('gtl-points-tuesday-pdt','0 19 * * 2',$$select public.gtl_dispatch_points_jobs()$$);
select cron.schedule('gtl-points-tuesday-pst','0 20 * * 2',$$select public.gtl_dispatch_points_jobs()$$);
select cron.schedule('gtl-points-thursday-pdt','0 19 * * 4',$$select public.gtl_dispatch_points_jobs()$$);
select cron.schedule('gtl-points-thursday-pst','0 20 * * 4',$$select public.gtl_dispatch_points_jobs()$$);

-- 4. Enable, then verify one real run in public.gtl_points_job_runs (status succeeded or skipped).
-- update public.gtl_points_job_schedule set enabled=true where id='nfl-points';
-- select public.gtl_dispatch_points_jobs();

-- Off switch (Sean approves the hosted change): stops new runs; every run, slate, actual and FINAL week stays (D-23).
-- update public.gtl_points_job_schedule set enabled=false where id='nfl-points';
-- Remove a cron job: select cron.unschedule('gtl-points-daily');  (and the four others)
