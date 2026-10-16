-- Optional D-48 disable, only with explicit approval for the hosted action.
-- The normal application rollback is GTL_FEATURE_OFF=recommendations (or the
-- prior API/Pages). This additive function has no previous body to restore.
-- Preserve every placed pick and its history; revoke only the new writer.
revoke execute on function public.gtl_save_recommended_virtual_pick(uuid,integer,integer,bigint,jsonb) from public,anon,authenticated,service_role;
