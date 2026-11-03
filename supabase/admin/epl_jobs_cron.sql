-- ADMIN ONLY (EPL Pick a Team, plan 2026-10-28-epl-pick-a-team.md Task 5). Run by hand from the SQL editor, only on Sean's
-- word, and only after:
--   1. Sean's "apply M-30" has applied 20261028190000_gtl_epl_pick_a_team.sql,
--   2. exact-source CI is green and the gtl-epl-jobs Edge function is deployed (release target epl-jobs; verify_jwt = false:
--      the one-run capability is the credential), with THE_ODDS_API_KEY and the VAPID secrets set, and
--   3. pg_cron and pg_net are enabled.
-- The Supabase CLI never runs this file. Nothing here changes a pick, a queue, a bonus or a saved snapshot.
--
-- Supabase pg_cron evaluates schedules in UTC. Each job has its own schedule row and cron entry; the dispatcher queues at most
-- one run per job and five-minute slot, and every job is a safe no-op when nothing is due.
--   snapshot  every 15 minutes   free (Sleeper): before-mw<N>-kickoff in the 30 minutes before the first kickoff, after-mw<N>
--                                once the week's window has ended; otherwise daily-<YYYY-MM-DD> once a UTC day (Research ->
--                                Fantasy). Every capture is stored trimmed to rostered players.
--   fixtures  05:47 and 17:47    1 Odds API credit per run, only while the week is open and before its first kickoff (about
--                                10 credits a week). Kept clear of the NFL odds runs at 06:15 and 18:15.
--   resolve   every 5 minutes    free: resolves the draft at the first kickoff, then no-ops (already_resolved).
--   settle    09:41 and 21:41    2 credits per scores read, bought once every pending drafted match can have finished, or
--                                earlier for a finished match within 25 hours of leaving the 3-day scores feed (about
--                                4-8 credits a week). Every Odds API call keeps the shared 50-credit reserve.
--   nudge     every 5 minutes    free: one push per manager turn while the draft is open.
--   dnb-check 11:23 once a day   at most 3 credits (1 per event, at most 3 upcoming fixtures), only with at least 60 credits
--                                left: the Guess the Line draw-no-bet gate (plan 2026-10-28-epl-moneyline.md, Task 0). After
--                                the 05:47 fixtures run, clear of every other paid run.

-- 1. The five Pick a Team schedule rows, created disabled. Replace <project-ref> with the hosted project's reference.
insert into public.gtl_epl_jobs_schedule(job,enabled,endpoint) values
  ('snapshot',false,'https://<project-ref>.supabase.co/functions/v1/gtl-epl-jobs'),
  ('fixtures',false,'https://<project-ref>.supabase.co/functions/v1/gtl-epl-jobs'),
  ('resolve',false,'https://<project-ref>.supabase.co/functions/v1/gtl-epl-jobs'),
  ('settle',false,'https://<project-ref>.supabase.co/functions/v1/gtl-epl-jobs'),
  ('nudge',false,'https://<project-ref>.supabase.co/functions/v1/gtl-epl-jobs')
on conflict (job) do nothing;

-- 1b. The dnb-check row, created disabled. The M-30 schedule table accepts only the five jobs above, so this insert needs the
--     migration that widens gtl_epl_jobs_schedule's job check to 'dnb-check' (M-32, moneyline plan Task 2) applied first.
insert into public.gtl_epl_jobs_schedule(job,enabled,endpoint) values
  ('dnb-check',false,'https://<project-ref>.supabase.co/functions/v1/gtl-epl-jobs')
on conflict (job) do nothing;

-- 2. The cron jobs (also safe while disabled: each call returns {"status":"disabled"} and posts nothing).
select cron.schedule('gtl-epl-snapshot','4-59/15 * * * *',$$select public.gtl_epl_dispatch_jobs('snapshot')$$);
select cron.schedule('gtl-epl-fixtures','47 5,17 * * *',$$select public.gtl_epl_dispatch_jobs('fixtures')$$);
select cron.schedule('gtl-epl-resolve','2-59/5 * * * *',$$select public.gtl_epl_dispatch_jobs('resolve')$$);
select cron.schedule('gtl-epl-settle','41 9,21 * * *',$$select public.gtl_epl_dispatch_jobs('settle')$$);
select cron.schedule('gtl-epl-nudge','3-59/5 * * * *',$$select public.gtl_epl_dispatch_jobs('nudge')$$);
select cron.schedule('gtl-epl-dnb-check','23 11 * * *',$$select public.gtl_epl_dispatch_jobs('dnb-check')$$);

-- 3. Read back: six jobs, all disabled.
select job,enabled from public.gtl_epl_jobs_schedule order by job;
select jobname,schedule,active from cron.job where jobname like 'gtl-epl-%' order by jobname;

-- 4. Enable one job at a time, then check one real run in public.gtl_epl_job_runs (status succeeded or skipped, reason).
--    Suggested order: snapshot and resolve first (free), then nudge, then fixtures and settle (they spend Odds API credits),
--    then dnb-check (after fixtures has stored the week's fixtures).
-- update public.gtl_epl_jobs_schedule set enabled=true where job='snapshot';
-- select job,status,reason,detail from public.gtl_epl_job_runs order by started_at desc limit 5;

-- Off switch (Sean approves the hosted change): stops new runs; every run, pick, bonus and snapshot stays (D-23).
-- update public.gtl_epl_jobs_schedule set enabled=false where job in ('snapshot','fixtures','resolve','settle','nudge','dnb-check');
-- Remove a cron job: select cron.unschedule('gtl-epl-snapshot');  (and the five others)
