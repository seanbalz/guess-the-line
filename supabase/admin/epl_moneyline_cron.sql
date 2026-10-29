-- ADMIN ONLY. M-36 source/review/apply and compatible worker/API release, then separately authorized configuration.
-- This standalone setup MUST NOT replay epl_jobs_cron.sql or incidentally create/enable dnb-check.
-- No script executes this file automatically; no active statement enables collection.
-- Both scheduled collection and API post-save refresh require this row enabled AND an actual passing weekly DNB gate.
insert into public.gtl_epl_jobs_schedule(job,enabled,endpoint) values
  ('moneyline',false,'https://<project-ref>.supabase.co/functions/v1/gtl-epl-jobs')
on conflict(job) do nothing;
select cron.schedule('gtl-epl-moneyline','*/15 * * * *',$$select public.gtl_epl_dispatch_jobs('moneyline')$$);
select job,enabled from public.gtl_epl_jobs_schedule where job='moneyline';
-- Off switch: update public.gtl_epl_jobs_schedule set enabled=false where job='moneyline';
