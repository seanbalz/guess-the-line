-- Capability off switch: preserve every ticket, original source, revision and receipt.
revoke all on function public.gtl_nba_read_bets(uuid,jsonb,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.gtl_nba_save_bet(uuid,uuid,jsonb,integer,text) from public,anon,authenticated,service_role;
