-- M-12 / stage 42: Virtual Units weekly and season boards (D-18, D-35, D-36). Read only: no table, writer or
-- row changes. Apply after M-10 (it reuses gtl_bets_context for membership and the league roster).
-- GTL_FEATURE_OFF=bets turns off POST /bets/board and /bets/season with /bets/read.
-- Each reader returns each roster player's week totals over that week's published games. Ranking is not done
-- here: shared/bets-qual.mjs is the one board order for the API and the screens (tests/bets-board-sql.test.mjs
-- checks these totals against its arithmetic). Qualification counts every current row (a voided row keeps its
-- credit); record, net units and risk come from settled rows only, as gtl_read_virtual_units does. Side and units
-- are visible at any time (D-36) and a settled row's game has kicked off, so no line or price is read or returned.
-- Service-only security-invoker RPCs; no browser table access.

create or replace function public.gtl_bets_week_rows(p_season integer,p_week integer,p_users uuid[])
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare sig jsonb; rows jsonb;
begin
  select signature into sig from public.gtl_weekly_slates where season=p_season and week=p_week;
  select coalesce(jsonb_agg(jsonb_build_object('userId',u.id,
      'wins',coalesce(t.wins,0),'losses',coalesce(t.losses,0),'pushes',coalesce(t.pushes,0),
      'pending',coalesce(t.pending,0),'voids',coalesce(t.voids,0),'picks',coalesce(t.picks,0),
      'units',coalesce(t.units,0),'riskUnits',coalesce(t.risk,0),'netUnits',coalesce(t.net,0)) order by u.id),'[]'::jsonb)
    into rows
  from unnest(coalesce(p_users,'{}'::uuid[])) u(id)
  left join lateral (
    select count(*) filter(where v.status='win') wins,count(*) filter(where v.status='loss') losses,
      count(*) filter(where v.status='push') pushes,count(*) filter(where v.status='pending') pending,
      count(*) filter(where v.status='void') voids,count(*) picks,
      coalesce(sum((v.selection->>'units')::numeric),0) units,
      coalesce(sum((v.selection->>'units')::numeric) filter(where v.status in ('win','loss','push')),0) risk,
      coalesce(sum(case when v.status in ('win','loss','push') then coalesce((v.result->>'netUnits')::numeric,
        case when v.status='loss' then -(v.selection->>'units')::numeric else 0 end) else 0 end),0) net
    from public.gtl_virtual_units_picks v
    where v.user_id=u.id and v.season=p_season and v.week=p_week
      and sig is not null and exists(select 1 from jsonb_array_elements(sig->'games') g where g->>'id'=v.game_id)
  ) t on true;
  return rows;
end $$;

-- One week's board for the league showing (the Community roster, or a private league's).
create or replace function public.gtl_read_bets_board(
  p_user uuid,p_season integer default null,p_week integer default null,p_league text default null
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare c jsonb; s integer; w integer; users uuid[];
begin
  c:=public.gtl_bets_context(p_user,p_season,p_week,p_league);
  s:=(c->>'season')::integer; w:=(c->>'week')::integer;
  select coalesce(array_agg((r->>'userId')::uuid),'{}'::uuid[]) into users from jsonb_array_elements(c->'roster') r;
  return jsonb_build_object('season',s,'week',w,'published',c->'signature' is not null and c->'signature'<>'null'::jsonb,
    'leagueId',p_league,'roster',c->'roster','rows',public.gtl_bets_week_rows(s,w,users));
end $$;

-- A season, week by week, for the league showing. `p_who` keeps one roster player's rows (the Season sheet);
-- without it every roster player's rows come back (the season board).
create or replace function public.gtl_read_bets_season(
  p_user uuid,p_season integer default null,p_league text default null,p_who uuid default null
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare c jsonb; s integer; users uuid[]; weeks jsonb;
begin
  if p_season is not null and p_season not between 2000 and 2200 then raise exception 'GTL_BETS_INVALID'; end if;
  c:=public.gtl_bets_context(p_user,null,null,p_league);
  s:=coalesce(p_season,(c->>'season')::integer);
  select coalesce(array_agg((r->>'userId')::uuid),'{}'::uuid[]) into users from jsonb_array_elements(c->'roster') r;
  if p_who is not null then
    if not p_who=any(users) then raise exception 'GTL_BETS_INVALID'; end if;
    users:=array[p_who];
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('week',x.week,'rows',public.gtl_bets_week_rows(s,x.week,users)) order by x.week),'[]'::jsonb)
    into weeks from public.gtl_weekly_slates x where x.season=s;
  return jsonb_build_object('season',s,'leagueId',p_league,'who',p_who,'roster',c->'roster','weeks',weeks);
end $$;

revoke all on function public.gtl_bets_week_rows(integer,integer,uuid[]),
  public.gtl_read_bets_board(uuid,integer,integer,text),
  public.gtl_read_bets_season(uuid,integer,text,uuid)
  from public,anon,authenticated;
grant execute on function public.gtl_bets_week_rows(integer,integer,uuid[]),
  public.gtl_read_bets_board(uuid,integer,integer,text),
  public.gtl_read_bets_season(uuid,integer,text,uuid)
  to service_role;
