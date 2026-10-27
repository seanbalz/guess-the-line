-- ADMIN ONLY (D-61). Run by hand from the SQL editor, only on Sean's word, after the gtl-points-jobs Edge function from
-- the D-61 commit is deployed (a worker still on the noon rule would draft new slates with a Tuesday 12:00 PM open).
-- Moves the installed Points schedule from Tuesday 12:00 PM PT to Tuesday 12:00 AM PT. Nothing here changes a player's
-- guess, a published slate or a FINAL week; a draft already stored keeps its opens_at (see step 3).
--
-- 1. Remove the noon Tuesday jobs (each call errors if that job is not installed; skip the ones that are already gone).
select cron.unschedule('gtl-points-tuesday-pdt');
select cron.unschedule('gtl-points-tuesday-pst');
select cron.unschedule('gtl-points-tuesday-catchup');

-- 2. The D-61 Tuesday jobs (supabase/admin/points_jobs_cron.sql explains each time).
select cron.schedule('gtl-points-tuesday-open-pdt','0 7 * * 2',$$select public.gtl_dispatch_points_jobs()$$);
select cron.schedule('gtl-points-tuesday-open-pst','0 8 * * 2',$$select public.gtl_dispatch_points_jobs()$$);
select cron.schedule('gtl-points-tuesday-catchup','30 9-10,12-23 * * 2',$$select public.gtl_dispatch_points_jobs()$$);

-- 3. Read back. Expect the daily, two Thursday and three Tuesday jobs above, and no unpublished draft still carrying a noon open
--    (a draft stored before the worker deploy keeps it; the commissioner's "Publish early" opens it at once).
select jobname,schedule,active from cron.job where jobname like 'gtl-points-%' order by jobname;
select season,week,status,opens_at from public.gtl_points_slates where status='draft' order by season,week;
