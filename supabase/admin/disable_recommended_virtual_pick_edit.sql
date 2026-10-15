-- Recommendation edits off switch: preserve every saved pick and audit.
-- The recommendations feature-off flag disables the new edit route as well.
revoke execute on function public.gtl_edit_recommended_virtual_pick(uuid,integer,integer,bigint,jsonb) from public,anon,authenticated,service_role;
