-- ADMIN ONLY (i62, D-61). Run by hand from the SQL editor, only on Sean's word. The Supabase CLI never runs this file.
-- Adds three Guess the Points runs so Sunday's and Monday night's results score the same night, not at the next daily
-- 11:30 UTC run (Sunday slots scored Monday 3:30 AM PST). It needs nothing new: the same dispatcher, gtl-points-jobs worker
-- and schedule row as supabase/admin/points_jobs_cron.sql (while that row is disabled, each call returns disabled).
-- Nothing here changes a player's guess, a published slate or a FINAL week.
--
-- Supabase pg_cron evaluates schedules in UTC, and the dispatcher queues one run per clock hour, so each new job is in a
-- clock hour no installed Points job uses. Installed (points_jobs_cron.sql, points_jobs_cron_d61.sql): every day 11;
-- Tuesday 07, 08, 09-10 and 12-23; Thursday 19 and 20.
-- Each run's actuals step loads the newest two published weeks that have kicked off and are not FINAL, keyed on the nflverse
-- stats file's SHA-256: the same file replays (no write) and a newer file is loaded. A run before nflverse's update is a
-- harmless no-op; the next run loads it.
--   30 2 * * 1   Monday 02:30 UTC: Sunday 6:30 PM PST (7:30 PM PDT), after the late-afternoon games
--   30 6 * * 1   Monday 06:30 UTC: Sunday 10:30 PM PST (11:30 PM PDT), after Sunday Night Football
--   30 6 * * 2   Tuesday 06:30 UTC: Monday 10:30 PM PST (11:30 PM PDT), after Monday Night Football and nflverse's
--                Monday-night stats run (about 05:33 UTC). It comes before the 07:00/08:00 UTC open, so its slate step can
--                only store a draft; the 07:00 or 08:00 run publishes it once opens_at arrives.

-- 1. The jobs. Each name is new: cron.schedule with an installed job's name would replace that job.
select cron.schedule('gtl-points-sunday-results','30 2 * * 1',$$select public.gtl_dispatch_points_jobs()$$);
select cron.schedule('gtl-points-sunday-night-results','30 6 * * 1',$$select public.gtl_dispatch_points_jobs()$$);
select cron.schedule('gtl-points-monday-night-results','30 6 * * 2',$$select public.gtl_dispatch_points_jobs()$$);

-- 2. Read back. Expect these three plus the six installed jobs: gtl-points-daily, gtl-points-tuesday-open-pdt,
--    gtl-points-tuesday-open-pst, gtl-points-tuesday-catchup, gtl-points-thursday-pdt and gtl-points-thursday-pst.
select jobname,schedule,active from cron.job where jobname like 'gtl-points-%' order by jobname;

-- 3. After the next Sunday and Monday night: a run in each new clock hour (succeeded, or skipped with nothing_due before
--    nflverse's update), and a saved load from one of them.
-- select slot_start,status,reason from public.gtl_points_job_runs where slot_start>now()-interval '3 days' order by slot_start;
-- select season,week,status,rows_saved,created_at from public.gtl_points_actual_loads where created_at>now()-interval '3 days' order by created_at;

-- Rollback: removes only these three jobs; every run, load, slate and FINAL week stays (D-23).
-- select cron.unschedule('gtl-points-sunday-results');
-- select cron.unschedule('gtl-points-sunday-night-results');
-- select cron.unschedule('gtl-points-monday-night-results');
