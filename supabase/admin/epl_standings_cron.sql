-- ADMIN ONLY. Separate optional collection, after M-34 apply, exact-source worker release and explicit enablement.
-- No script/CLI runs this automatically. The migration creates no row; this file creates it disabled.
-- Wikimedia community data, CC BY-SA 4.0. One free bounded read/day; no Odds API credit use or budget changes.
-- Verify source/license provenance and full 20-club freshness before enabling. Existing jobs are not changed.
insert into public.gtl_epl_jobs_schedule(job,enabled,endpoint) values
  ('standings',false,'https://<project-ref>.supabase.co/functions/v1/gtl-epl-jobs')
on conflict(job) do nothing;
select cron.schedule('gtl-epl-standings','11 5 * * *',$$select public.gtl_epl_dispatch_jobs('standings')$$);
select job,enabled from public.gtl_epl_jobs_schedule where job='standings';
-- Separate authorized enablement only; no enabling statement is active here.
-- update public.gtl_epl_jobs_schedule set enabled=true where job='standings';
-- Off switch: update public.gtl_epl_jobs_schedule set enabled=false where job='standings';
