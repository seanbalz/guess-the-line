-- ADMIN ONLY (EPL delivery stage 4: Pick a Team result announcements). Run by hand from the SQL editor, only on Sean's word,
-- and only after 20261110120000_gtl_epl_result_announcements.sql is applied and the gtl-epl-jobs Edge function is deployed
-- from exact-source green CI (THE_ODDS_API_KEY and the VAPID secrets already set for the existing jobs).
-- The Supabase CLI never runs this file. The migration creates no schedule row; this file creates it disabled.
--
--   results   every 15 minutes   free unless a read is due: records the announcement once every fixture of the latest
--                                resolved matchweek is verified final or postponed, and pushes opted-in league members
--                                once each. Until then, at most four 2-credit scores reads a matchweek, at 150, 200, 300
--                                and 720 minutes after the latest pending kickoff (typically one read). Every read keeps
--                                the shared 50-credit reserve; the existing settle/snapshot reads then find the finals
--                                stored and buy nothing. No GitHub workflow schedule is involved.
insert into public.gtl_epl_jobs_schedule(job,enabled,endpoint) values
  ('results',false,'https://<project-ref>.supabase.co/functions/v1/gtl-epl-jobs')
on conflict(job) do nothing;
select cron.schedule('gtl-epl-results','9-59/15 * * * *',$$select public.gtl_epl_dispatch_jobs('results')$$);
select job,enabled from public.gtl_epl_jobs_schedule where job='results';
-- Separate authorized enablement only; no enabling statement is active here. Check one real run afterwards:
-- update public.gtl_epl_jobs_schedule set enabled=true where job='results';
-- select job,status,reason,detail from public.gtl_epl_job_runs where job='results' order by started_at desc limit 5;
-- Off switch (announcements, deliveries and read records stay, D-23):
-- update public.gtl_epl_jobs_schedule set enabled=false where job='results';
