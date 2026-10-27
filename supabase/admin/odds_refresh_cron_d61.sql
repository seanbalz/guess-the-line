-- ADMIN ONLY (D-61). Run by hand from the SQL editor, only on Sean's word, right after 20261027160000_gtl_odds_slots_before_
-- points_open.sql is applied. Moves the hosted twelve-hour odds job from 08:15/20:15 UTC to 06:15/18:15 UTC so market data
-- refreshes before the Tuesday 12:00 AM PT Points open. Same dispatcher, same two runs a day, same credits.
select cron.unschedule('gtl-odds-every-12-hours');
select cron.schedule('gtl-odds-every-12-hours','15 6,18 * * *',$$select public.gtl_dispatch_odds_refresh()$$);

-- Read back: one job at '15 6,18 * * *', and the schedule reader's next run at 06:15 or 18:15 UTC.
select jobname,schedule,active from cron.job where jobname='gtl-odds-every-12-hours';
