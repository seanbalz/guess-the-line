-- D-53 comparison scope. Additive reader; requires M-07 and its predecessors.
-- Uses the existing per-game history gate and scoring references. No scoring writes.
-- API error mappings first, then Gate M. GTL_FEATURE_OFF=comparisons stops reads.
create function public.gtl_read_score_comparison(p_user uuid,p_season integer default null,p_league text default null,p_now timestamptz default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare history jsonb; roster jsonb; weeks jsonb;
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_season is not null and p_season not between 2000 and 2200 then raise exception 'GTL_COMPARISON_INVALID'; end if;
  if p_league is not null and not exists(select 1 from public.gtl_memberships where league_id=p_league and user_id=p_user and active)
    then raise exception 'GTL_COMPARISON_MEMBER'; end if;
  -- The reader must not silently use the old edit-until-deadline scoring contract.
  if not coalesce((public.gtl_live_rules()->>'perGameScoring')::boolean,false) then raise exception 'GTL_FEATURE_OFF'; end if;
  history:=public.gtl_read_community_history(p_user,p_season,p_now);
  roster:=coalesce((select jsonb_agg(m order by m->>'displayName',m->>'id') from jsonb_array_elements(history->'members') m
    where p_league is null or exists(select 1 from public.gtl_memberships x where x.league_id=p_league and x.user_id::text=m->>'id')),'[]');
  -- Inactive members remain in the historical roster (D-23); an inactive viewer cannot read the league.
  weeks:=coalesce((select jsonb_agg(w||jsonb_build_object('entries',coalesce((select jsonb_agg(e) from jsonb_array_elements(w->'entries') e
    where exists(select 1 from jsonb_array_elements(roster) m where m->>'id'=e->>'userId')),'[]')) order by (w->>'week')::integer desc)
    from jsonb_array_elements(history->'weeks') w),'[]');
  return history||jsonb_build_object('members',roster,'weeks',weeks,'leagueId',p_league);
end $$;
revoke all on function public.gtl_read_score_comparison(uuid,integer,text,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_read_score_comparison(uuid,integer,text,timestamptz) to service_role;
