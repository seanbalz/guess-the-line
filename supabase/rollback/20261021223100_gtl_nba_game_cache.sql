-- Disable the cache capability while preserving every cached row and provider budget.
revoke all on function public.gtl_nba_claim_games(date,boolean) from public,anon,authenticated,service_role;
revoke all on function public.gtl_nba_finish_games(date,uuid,jsonb) from public,anon,authenticated,service_role;
