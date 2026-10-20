-- replaces public.gtl_weekly_context md5 092802e9d56f5a05e7a364e5f076a89f
-- Private groups follow opened community weeks without rewriting history.
create or replace function public.gtl_weekly_context(p_user uuid,p_league text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare l public.gtl_leagues; m public.gtl_memberships; sig jsonb; template public.gtl_schedule_templates;
begin
  -- Do not read private league state until membership is established.
  if not exists(select 1 from public.gtl_memberships where user_id=p_user and league_id=p_league and active) then raise exception 'GTL_FORBIDDEN'; end if;
  select * into l from public.gtl_leagues where id=p_league for share;
  select * into m from public.gtl_memberships where user_id=p_user and league_id=p_league and active for share;
  if m.user_id is null or l.id is null or not exists(select 1 from jsonb_array_elements(l.state#>'{league,roster}') r where r->>'id'=m.player_id) then raise exception 'GTL_FORBIDDEN'; end if;
  -- Current-week projection only: all stored league snapshots and weekly entries stay intact.
  select t.* into template from public.gtl_schedule_templates t
    join public.gtl_weekly_slates s on s.season=t.season and s.week=t.week
    where public.gtl_week_open_at(t.season,t.week)<=statement_timestamp()
      and (t.season,t.week)>((l.state#>>'{league,season}')::integer,(l.state#>>'{league,week}')::integer)
    order by t.season desc,t.week desc limit 1;
  if found then
    l.state:=l.state || jsonb_build_object('league',l.state->'league' || jsonb_build_object(
      'season',template.season,'week',template.week,'deadline',template.deadline,
      'actualKickoff',null,'scheduleSource',template.schedule_source),
      'games',template.games,'results','{}'::jsonb,'frozen','{}'::jsonb,
      'ballots','{}'::jsonb,'bets','{}'::jsonb,'audit','[]'::jsonb);
  end if;
  sig := public.gtl_weekly_slate(l.state);
  if not exists(select 1 from public.gtl_weekly_slates where season=(sig->>'season')::integer and week=(sig->>'week')::integer and signature=sig) then raise exception 'GTL_SLATE_CONFLICT'; end if;
  return jsonb_build_object('state',l.state,'leagueRevision',l.revision,'playerId',m.player_id,'practice',l.practice,'season',sig->'season','week',sig->'week');
end $$;
