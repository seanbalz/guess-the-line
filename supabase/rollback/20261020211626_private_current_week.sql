create or replace function public.gtl_weekly_context(p_user uuid,p_league text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare l public.gtl_leagues; m public.gtl_memberships; sig jsonb;
begin
  -- Do not read private league state until membership is established.
  if not exists(select 1 from public.gtl_memberships where user_id=p_user and league_id=p_league and active) then raise exception 'GTL_FORBIDDEN'; end if;
  select * into l from public.gtl_leagues where id=p_league for share;
  select * into m from public.gtl_memberships where user_id=p_user and league_id=p_league and active for share;
  if m.user_id is null or l.id is null or not exists(select 1 from jsonb_array_elements(l.state#>'{league,roster}') r where r->>'id'=m.player_id) then raise exception 'GTL_FORBIDDEN'; end if;
  sig := public.gtl_weekly_slate(l.state);
  if not exists(select 1 from public.gtl_weekly_slates where season=(sig->>'season')::integer and week=(sig->>'week')::integer and signature=sig) then raise exception 'GTL_SLATE_CONFLICT'; end if;
  return jsonb_build_object('state',l.state,'leagueRevision',l.revision,'playerId',m.player_id,'practice',l.practice,'season',sig->'season','week',sig->'week');
end $$;

