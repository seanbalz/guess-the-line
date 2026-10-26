-- ADMIN ONLY (redesign build plan stage 70, M-26). Run in the SQL editor only after: exact-source CI on the merged SHA, M-25 and
-- M-26 applied on Sean's "apply", the gtl-league-features Edge function deployed from that SHA (verify_jwt = false: the one-run
-- capability is checked in SQL), and a live dry run of the commissioner's POST /league/features/run (the same code).
-- It registers the features schedule DISABLED, with the endpoint host and the authorizing commissioner of the week-open
-- schedule. It never enables anything: the enable and the cron below stay commented until Sean says so.
insert into public.gtl_features_schedule(id,enabled,endpoint,authorized_by,season)
select 'league-features',false,replace(endpoint,'gtl-week-open','gtl-league-features'),authorized_by,season
from public.gtl_week_open_schedule where id='nfl-weekly'
on conflict(id) do nothing;
-- The disabled dispatcher must answer {"status":"disabled"} and call nothing.
select public.gtl_dispatch_league_features();
-- After Sean enables it: one run, then check gtl_features_schedule_runs (succeeded) and gtl_feature_runs (trigger 'schedule').
-- update public.gtl_features_schedule set enabled=true where id='league-features';
-- select public.gtl_dispatch_league_features();
-- select cron.schedule('gtl-league-features-every-15-minutes','*/15 * * * *',$$select public.gtl_dispatch_league_features()$$);
-- A new season: update public.gtl_features_schedule set season=<year> where id='league-features';
-- Rollback: update public.gtl_features_schedule set enabled=false where id='league-features'; every run, badge and award stays.
