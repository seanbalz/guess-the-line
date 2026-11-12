-- Rollback for 20261112040000_gtl_nba_slate_lines.sql (M-49, NBA N2). The migration replaces no function, so this is its
-- permission off switch. Disable both schedule rows first (supabase/admin/nba_jobs_cron.sql, "Off switch").
-- It revokes the service role's execute rights on every NBA N2 function and its writes to the N2 tables; the dispatcher already
-- has no grant. Every game, observation, slate read, attempt, line, run and the budget row stay (D-23), readable by the
-- service role. Restore by regranting the migration's grants.
revoke execute on function public.gtl_nba_claim_job(text,uuid),public.gtl_nba_finish_job(uuid,uuid,text,jsonb),
  public.gtl_nba_publish_slate(uuid,uuid,date,timestamptz,jsonb,jsonb),public.gtl_nba_lines_due(uuid,uuid),
  public.gtl_nba_begin_lines_read(uuid,uuid,date),public.gtl_nba_finish_lines_read(uuid,uuid,jsonb,text,jsonb),
  public.gtl_nba_shadow_gate(),public.gtl_nba_lines_plan(timestamptz),public.gtl_nba_month_spent(timestamptz) from service_role;
revoke insert,update on public.gtl_nba_games,public.gtl_nba_game_observations,public.gtl_nba_slate_reads,public.gtl_nba_line_attempts,
  public.gtl_nba_lines,public.gtl_nba_job_runs from service_role;
