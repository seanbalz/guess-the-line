-- ADMIN ONLY (NBA build-out N2, docs/superpowers/specs/2026-11-10-nba-buildout-design.md). Run by hand from the SQL editor, only
-- on Sean's word, and only after:
--   1. Sean's "apply M-49" has applied 20261112040000_gtl_nba_slate_lines.sql (docs/MIGRATION_APPLY_PACKET_2026_11_12_NBA_N2.md),
--   2. exact-source CI is green and the gtl-nba-jobs Edge function is deployed (verify_jwt = false: the one-run capability is the
--      credential), with THE_ODDS_API_KEY and BALLDONTLIE_API_KEY set as its secrets, and
--   3. pg_cron and pg_net are enabled (they are, for the NFL and EPL jobs).
-- The Supabase CLI never runs this file. Nothing here changes a pick, a ticket, a line or a game; players see nothing.
--
-- Supabase pg_cron evaluates schedules in UTC. The dispatcher (gtl_dispatch_nba_jobs) queues a run only when its job is due, so
-- a cron entry that fires when nothing is due posts nothing and adds no run row.
--   slate  16:00, 17:00, 22:00 and 23:00 UTC   free. 9:00 AM and 3:00 PM Pacific in both daylight (16:00, 22:00) and standard
--                                             time (17:00, 23:00); the dispatcher answers not_due in the other offset's hour.
--                                             One BALLDONTLIE request (or the fresh cached range) and one free Odds API /events.
--   lines  every 5 minutes at :04, :09, ...    1 Odds API credit per read: once per Pacific game day, 90 minutes before its
--                                             first tip-off, plus one retry 30 minutes later only if the first read spent no
--                                             credit. At most 31 credits a calendar month (UTC); refused while the shared
--                                             conservative remaining would fall below 100, or while any other collector holds
--                                             the shared lease. Kept off the minutes of the NFL refresh (06:15, 18:15) and the
--                                             EPL paid runs (:47, :41, :23). Never in the 60 minutes before an NFL kickoff
--                                             (D-85 item 7): the dispatcher moves the read earlier or waits the hour out.

-- 1. The two schedule rows, created disabled. Replace <project-ref> with the hosted project's reference.
insert into public.gtl_nba_jobs_schedule(job,enabled,endpoint) values
  ('slate',false,'https://<project-ref>.supabase.co/functions/v1/gtl-nba-jobs'),
  ('lines',false,'https://<project-ref>.supabase.co/functions/v1/gtl-nba-jobs')
on conflict (job) do nothing;

-- 2. The cron jobs (also safe while disabled: each call returns {"status":"disabled"} and posts nothing).
select cron.schedule('gtl-nba-slate','0 16,17,22,23 * * *',$$select public.gtl_dispatch_nba_jobs('slate')$$);
select cron.schedule('gtl-nba-lines','4-59/5 * * * *',$$select public.gtl_dispatch_nba_jobs('lines')$$);

-- 3. Read back: two jobs, both disabled.
select job,enabled from public.gtl_nba_jobs_schedule order by job;
select jobname,schedule,active from cron.job where jobname like 'gtl-nba-%' order by jobname;

-- 4. Enable one job at a time, each on its own word from Sean, then check one real run in public.gtl_nba_job_runs.
--    Order: slate first (free), and only after a slate run has stored a game day, lines (it spends credits).
-- update public.gtl_nba_jobs_schedule set enabled=true where job='slate';
-- select job,status,reason,detail from public.gtl_nba_job_runs order by started_at desc limit 5;
-- select public.gtl_nba_shadow_gate();   -- N3's writer stays off until this answers "open": true

-- Off switch (Sean approves the hosted change): stops new runs; every run, game, observation, attempt and line stays (D-23).
-- update public.gtl_nba_jobs_schedule set enabled=false where job in ('slate','lines');
-- NBA-only pause that leaves the schedule on (the lines read is then refused as nba_paused and spends nothing):
-- update public.gtl_nba_budget set paused=true,updated_at=clock_timestamp();
-- Remove a cron job: select cron.unschedule('gtl-nba-slate');  select cron.unschedule('gtl-nba-lines');
