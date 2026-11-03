-- ADMIN ONLY (item 22, M-38). Run by hand in the Supabase SQL editor, only on Sean's word, and only after ops_alerts_cron.sql has
-- been run and the schedule row ENABLED. Proves the whole path to Sean's phone with a synthetic alert. The Supabase CLI never
-- runs this file. It reads no pick, guess, ballot, score or name.
--
-- WHAT SEAN SHOULD SEE ON HIS PHONE, in this order:
--   1. About 0 to 15 minutes after step 1 (the next tick at minute 7, 22, 37 or 52): ONE push, title "GTL ops alert", body
--      "Test alert: this phone gets GTL ops alerts."
--   2. About 15 to 30 minutes after step 1 (the tick after that): ONE push, title "GTL ops alert cleared", body
--      "Test alert cleared." It replaces the first on the lock screen.
--   Nothing else. If a real alert is owed at the same time it arrives as its own push; the test never hides one.
-- Tapping either opens Picks (a known limit: the service worker routes every non-Points tag there).

-- 1. Open the test incident. Calling it twice in the same second returns the same incident.
select public.gtl_ops_test_alert();

-- 2. The open test incident: notified_at stays null until the next tick pushes it.
select id,key,kind,opened_at,notified_at,cleared_at,cleared_notified_at from public.gtl_ops_incidents where kind='test' order by id desc limit 3;

-- 3. After the next tick, the run that pushed it: status succeeded, sent 1 (or more, one per device). A run that says
--    failed/send_failed means no device accepted the push; the alert stays owed and the next tick retries it.
select slot_start,status,reason,sent,failed from public.gtl_ops_alert_runs order by slot_start desc limit 5;
--    and the incident now has notified_at set.
select id,key,notified_at,cleared_at,cleared_notified_at from public.gtl_ops_incidents where kind='test' order by id desc limit 3;

-- 4. After the tick after that: the test incident is cleared (cleared_at) and its cleared push recorded (cleared_notified_at).
select id,key,notified_at,cleared_at,cleared_notified_at from public.gtl_ops_incidents where kind='test' order by id desc limit 3;

-- No cleanup: the incident and its runs stay as a record (D-23).
