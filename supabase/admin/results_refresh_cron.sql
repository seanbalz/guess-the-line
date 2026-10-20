-- Run only after exact-source CI, worker deployment, and live dry-run validation.
-- User authorized enablement October 20, 2026. This script preserves existing run history.
insert into public.gtl_results_refresh_schedule(id,enabled,endpoint,authorized_by,season)
select 'nfl-results',false,replace(endpoint,'gtl-week-open','gtl-results-refresh'),authorized_by,season
from public.gtl_week_open_schedule where id='nfl-weekly'
on conflict(id) do nothing;
-- Disabled dispatcher must return disabled; then enable and verify a real run.
select public.gtl_dispatch_results_refresh();
-- update public.gtl_results_refresh_schedule set enabled=true where id='nfl-results';
-- select public.gtl_dispatch_results_refresh();
-- select cron.schedule('gtl-results-every-30-minutes','*/30 * * * *',$$select public.gtl_dispatch_results_refresh()$$);
-- Rollback: set enabled=false; retain every final, pick, audit and run.
