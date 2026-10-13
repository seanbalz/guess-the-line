-- D-28 web push reminders: ADMIN ONLY, run by hand in the Supabase SQL editor.
-- NOT a migration: the Supabase CLI never runs files in supabase/admin. Run it
-- only after (1) migration 20261012230000_gtl_web_push_reminders.sql is applied,
-- (2) the three VAPID secrets are set and (3) gtl-push-reminders is deployed.
-- Full steps and the iPhone test: docs/WEB_PUSH_SETUP.md.
--
-- pg_cron and pg_net are already enabled on the hosted project (the odds and
-- week-open schedulers use them). The dispatcher writes no run and makes no
-- network call outside the two hours before the latest published week's
-- deadline, so a 15-minute tick costs nothing for the rest of the week.

-- 1. The schedule row, disabled. Replace <project-ref> with the project ref.
insert into public.gtl_push_reminder_schedule(id,enabled,endpoint)
  values('deadline-2h',false,'https://<project-ref>.supabase.co/functions/v1/gtl-push-reminders');

-- 2. The cron job (UTC; every 15 minutes).
select cron.schedule('gtl-push-reminders-15m','*/15 * * * *',$$select public.gtl_dispatch_push_reminders()$$);

-- 3. Dry run while disabled: must return {"status":"disabled"}.
select public.gtl_dispatch_push_reminders();

-- 4. Turn it on (only when Sean decides to):
--   update public.gtl_push_reminder_schedule set enabled=true where id='deadline-2h';
--   select public.gtl_dispatch_push_reminders();   -- outside the window: {"status":"not_due"}

-- Check recent runs (counts only; never tokens or endpoints):
--   select slot_start,status,reason,sent,failed from public.gtl_push_reminder_runs order by slot_start desc limit 10;

-- Turn it off / roll back:
--   update public.gtl_push_reminder_schedule set enabled=false where id='deadline-2h';
--   select cron.unschedule('gtl-push-reminders-15m');
