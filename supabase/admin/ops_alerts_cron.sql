-- ADMIN ONLY (item 22, M-38, docs/OPS_ALERTS.md). Run by hand in the Supabase SQL editor, only on Sean's word, and only after:
--   1. Sean's "apply M-38" has applied 20261103190000_gtl_ops_alerts.sql (Gate M),
--   2. the `ops-alerts` release target has deployed gtl-ops-alerts (verify_jwt = false; the one-run capability is the
--      credential; it reads the reminder worker's three VAPID secrets, so no new secret), and
--   3. pg_cron and pg_net are enabled (they are, on the hosted project).
-- The Supabase CLI never runs this file. Nothing here changes a player's guess, a published slate, a run or an incident.
--
-- GO-LIVE ORDER. The first enabled dispatch alerts on everything that is wrong at that moment, history included (for example
-- Points Week 9 not open). So the row goes in DISABLED (step 1), step 3 shows exactly what would push, and step 4 enables it
-- only after Sean has read that list. Expect one push to his phone per row step 3 returns, on the first tick after step 4.
-- Run steps 1 to 3, read the rows, then run step 4 as its own statement.
--
-- Supabase pg_cron evaluates schedules in UTC. 7-59/15 runs at minutes 7, 22, 37 and 52 of every hour: clear of the busy :00,
-- :05 and :15 slots that the other jobs use. The dispatcher's runs are 15-minute slots (:00, :15, :30, :45), so a run queued at
-- :07 has until :15 to be claimed, and the worker claims within seconds.

-- 1. The schedule row, created DISABLED (and its endpoint corrected on a rerun, never its enabled flag).
insert into public.gtl_ops_alert_schedule(id,enabled,endpoint)
values('ops',false,'https://onmrgvcehkflfaizvedl.supabase.co/functions/v1/gtl-ops-alerts')
on conflict(id) do update set endpoint=excluded.endpoint;

-- 2. The cron job. The name is new (no other admin script uses it); cron.schedule with an installed job's name would replace
--    that job. While the row is disabled each call returns {"status":"disabled"} and does nothing.
select cron.schedule('gtl-ops-alerts','7-59/15 * * * *',$$select public.gtl_dispatch_ops_alerts()$$);

-- 3. Read back both, then what the first enabled tick would push. One push per row of the last query.
select id,enabled,endpoint from public.gtl_ops_alert_schedule;
select jobname,schedule,active,command from cron.job where jobname='gtl-ops-alerts';
select * from public.gtl_ops_findings(now());

-- 4. ENABLE, only when Sean has read step 3 and says so. Commented on purpose, so that running this file again can never enable it.
-- update public.gtl_ops_alert_schedule set enabled=true where id='ops';
-- After it, the next tick (minute 7, 22, 37 or 52) opens one incident per row of step 3 and pushes it. Check:
-- select key,kind,opened_at,notified_at,cleared_at from public.gtl_ops_incidents order by id;
-- select slot_start,status,reason,sent,failed from public.gtl_ops_alert_runs order by slot_start desc limit 10;

-- Off switch (Sean approves the hosted change). Stops new runs. Every run and incident stays (D-23); the row is never deleted.
-- select cron.unschedule('gtl-ops-alerts');
-- update public.gtl_ops_alert_schedule set enabled=false where id='ops';
