-- M-10 / stage 40: account-level Virtual Units reads for the published community week.
-- No existing writer or row changes. Apply after M-01 and M-04, with the API's
-- error mapping deployed first. GTL_FEATURE_OFF=bets disables both readers.
-- Other players' bets are visible immediately (D-36); their saved terms and
-- history remain closed for each game/market until this viewer's M-01 gate opens.
-- Service-only security-invoker RPCs; no browser table access.

create table if not exists public.gtl_bet_versions (
  user_id uuid not null references auth.users(id) on delete cascade,
  season integer not null,
  week integer not null,
  revision bigint not null default 0 check (revision between 0 and 9007199254740990),
  primary key (user_id,season,week),
  foreign key (season,week) references public.gtl_weekly_slates(season,week)
);
alter table public.gtl_bet_versions enable row level security;
revoke all on public.gtl_bet_versions from public,anon,authenticated,service_role;
grant select,insert,update on public.gtl_bet_versions to service_role;

-- The group changes only the roster filter. The week, bets and version belong
-- to the account/community, so switching groups never copies or moves a pick.
create or replace function public.gtl_bets_context(
  p_user uuid,p_season integer default null,p_week integer default null,p_league text default null
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s integer; w integer; sig jsonb; roster jsonb;
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if (p_season is null)<>(p_week is null) or (p_season is not null and
    (p_season not between 2000 and 2200 or p_week not between 1 and 25))
    then raise exception 'GTL_BETS_INVALID'; end if;
  if p_league is not null and not exists(select 1 from public.gtl_leagues where id=p_league)
    then raise exception 'GTL_BETS_INVALID'; end if;
  if p_season is null then
    select season,week,signature into s,w,sig from public.gtl_weekly_slates order by season desc,week desc limit 1;
  else
    s:=p_season; w:=p_week;
    select signature into sig from public.gtl_weekly_slates where season=s and week=w;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('userId',p.user_id,'displayName',p.display_name)
    order by p.display_name,p.user_id),'[]'::jsonb) into roster
  from public.gtl_profiles p
  where public.gtl_community_member(p.user_id)
    and (p_league is null or exists(select 1 from public.gtl_memberships m
      where m.league_id=p_league and m.user_id=p.user_id and m.active));
  return jsonb_build_object('season',s,'week',w,'signature',sig,
    'leagueId',p_league,'roster',roster,
    'revision',coalesce((select v.revision from public.gtl_bet_versions v
      where v.user_id=p_user and v.season=s and v.week=w),0));
end $$;

create or replace function public.gtl_read_bets(
  p_user uuid,p_season integer default null,p_week integer default null,
  p_league text default null,p_now timestamptz default null
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare c jsonb; s integer; w integer; sig jsonb; gate jsonb; now_at timestamptz:=coalesce(p_now,clock_timestamp());
  entries jsonb; faces jsonb; summaries jsonb; markets jsonb;
begin
  c:=public.gtl_bets_context(p_user,p_season,p_week,p_league);
  s:=(c->>'season')::integer; w:=(c->>'week')::integer; sig:=c->'signature';
  if sig is null or sig='null'::jsonb then
    return jsonb_build_object('season',s,'week',w,'published',false,'now',now_at,
      'leagueId',p_league,'roster',c->'roster','revision',c->'revision',
      'games','[]'::jsonb,'bets','[]'::jsonb,'faces','{}'::jsonb,
      'markets','{}'::jsonb,'qualification','[]'::jsonb);
  end if;
  gate:=public.gtl_markets_visible(p_user,s,w,now_at);
  -- Only published-game rows belonging to active community members in this
  -- roster. A closed opponent row carries neither saved terms nor audit.
  select coalesce(jsonb_agg(jsonb_build_object(
      'userId',v.user_id,'gameId',v.game_id,'market',v.market,
      'selection',case when v.user_id=p_user or
        coalesce((gate->v.game_id->>v.market)::boolean,false) then v.selection
        else jsonb_build_object('side',v.selection->'side','units',v.selection->'units') end,
      'status',case when v.user_id=p_user or
        coalesce((gate->v.game_id->>v.market)::boolean,false) then v.status end,
      'result',case when v.user_id=p_user or
        coalesce((gate->v.game_id->>v.market)::boolean,false) then v.result end,
      'audit',case when v.user_id=p_user then v.audit end,
      'createdAt',case when v.user_id=p_user or
        coalesce((gate->v.game_id->>v.market)::boolean,false) then v.created_at end,
      'updatedAt',case when v.user_id=p_user or
        coalesce((gate->v.game_id->>v.market)::boolean,false) then v.updated_at end)
      order by v.game_id,v.market,v.user_id),'[]'::jsonb) into entries
  from public.gtl_virtual_units_picks v
  where v.season=s and v.week=w
    and exists(select 1 from jsonb_array_elements(sig->'games') g where g->>'id'=v.game_id)
    and exists(select 1 from jsonb_array_elements(c->'roster') r where r->>'userId'=v.user_id::text);
  select coalesce(jsonb_object_agg(q.game_id,q.players),'{}'::jsonb) into faces
  from (select v.game_id,jsonb_agg(distinct v.user_id order by v.user_id) players
    from public.gtl_virtual_units_picks v
    where v.season=s and v.week=w
      and exists(select 1 from jsonb_array_elements(sig->'games') g where g->>'id'=v.game_id)
      and exists(select 1 from jsonb_array_elements(c->'roster') r where r->>'userId'=v.user_id::text)
    group by v.game_id) q;
  select coalesce(jsonb_agg(jsonb_build_object(
      'userId',p.user_id,
      'picks',coalesce(q.picks,0),'units',coalesce(q.units,0),
      'qualified',coalesce(q.picks,0)>=3 or coalesce(q.units,0)>=3)
      order by p.display_name,p.user_id),'[]'::jsonb) into summaries
  from public.gtl_profiles p
  left join lateral (
    select count(*) picks,coalesce(sum((v.selection->>'units')::numeric),0) units
    from public.gtl_virtual_units_picks v
    where v.user_id=p.user_id and v.season=s and v.week=w
      and exists(select 1 from jsonb_array_elements(sig->'games') g where g->>'id'=v.game_id)
  ) q on true
  where exists(select 1 from jsonb_array_elements(c->'roster') r where r->>'userId'=p.user_id::text);
  select coalesce(jsonb_object_agg(g->>'id',jsonb_build_object(
    'spread',public.gtl_read_bets_market(p_user,g->>'id','spread',s,w,now_at),
    'total',public.gtl_read_bets_market(p_user,g->>'id','total',s,w,now_at))),'{}'::jsonb)
    into markets from jsonb_array_elements(sig->'games') g;
  return jsonb_build_object('season',s,'week',w,'published',true,'now',now_at,
    'leagueId',p_league,'roster',c->'roster','revision',c->'revision',
    'games',sig->'games','gate',gate,'bets',entries,'faces',faces,'markets',markets,'qualification',summaries);
end $$;

-- One game's selectable market quotes. SQL checks the same reveal gate before
-- reading any snapshot. Return validated retained candidates only; the API
-- chooses the best point line and price from the newest quote per named book.
create or replace function public.gtl_read_bets_market(
  p_user uuid,p_game text,p_market text,p_season integer default null,
  p_week integer default null,p_now timestamptz default null
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare c jsonb; s integer; w integer; sig jsonb; now_at timestamptz:=coalesce(p_now,clock_timestamp());
  g jsonb; named jsonb; kickoff timestamptz; snap record; row_game jsonb; q jsonb;
  observed timestamptz; collected timestamptz; base_line numeric; base_odds numeric;
  side text; side_line numeric; side_odds numeric; candidates jsonb:='[]'::jsonb;
begin
  c:=public.gtl_bets_context(p_user,p_season,p_week,null);
  s:=(c->>'season')::integer; w:=(c->>'week')::integer; sig:=c->'signature';
  if sig is null or sig='null'::jsonb or p_market is null or p_market not in ('spread','total') or p_game is null
    then raise exception 'GTL_BETS_INVALID'; end if;
  select x into g from jsonb_array_elements(sig->'games') x where x->>'id'=p_game;
  if g is null then raise exception 'GTL_BETS_INVALID'; end if;
  if not public.gtl_guess_revealed(p_user,s,w,
      case when p_market='spread' then 'guess_spread' else 'guess_total' end,p_game,now_at)
    then return jsonb_build_object('season',s,'week',w,'gameId',p_game,'market',p_market,'visible',false); end if;
  named:=public.gtl_slate_game(s,w,sig,p_game);
  kickoff:=to_timestamp((g->>'kickoff')::double precision);
  for snap in select created_at,payload from public.gtl_market_snapshots
    where season=s and week=w and slate_signature=sig and created_at<=now_at
    order by created_at desc,id desc limit 20 loop
    row_game:=null;
    for q in select x from jsonb_array_elements(snap.payload->'games') x loop
      begin
        if q->>'gameId'=p_game and q->>'home'=named->>'home' and q->>'away'=named->>'away'
          and (q->>'kickoff')::timestamptz=kickoff then row_game:=q; exit; end if;
      exception when invalid_text_representation or invalid_datetime_format then continue;
      end;
    end loop;
    if row_game is null then continue; end if;
    for q in select x from jsonb_array_elements(row_game#>array['markets',p_market,'quotes']) x loop
      if q->>'provider'<>'the-odds-api' or q->>'market'<>p_market
        or q->>'book' not in ('draftkings','fanduel','betmgm','betrivers','betonlineag','betus','bovada','lowvig','mybookieag')
        then continue; end if;
      begin
        observed:=(q->>'providerObservedAt')::timestamptz;
        collected:=(q->>'collectedAt')::timestamptz;
        base_line:=(q->>'value')::numeric;
        base_odds:=(q#>>array['outcomes',case when p_market='spread' then 'home' else 'over' end,'odds'])::numeric;
        if observed is null or collected is null or not isfinite(observed) or not isfinite(collected)
          or observed>collected or collected>snap.created_at or observed>=kickoff
          or not coalesce(public.gtl_numeric_is_finite(base_line),false) or base_line*2<>trunc(base_line*2)
          or (p_market='spread' and abs(base_line)>100)
          or (p_market='total' and base_line not between 0 and 200)
          or not coalesce(public.gtl_numeric_is_finite(base_odds),false) or base_odds<>trunc(base_odds)
          or abs(base_odds) not between 100 and 10000 then continue; end if;
        foreach side in array case when p_market='spread' then array['home','away'] else array['over','under'] end loop
          begin
            side_line:=(q#>>array['outcomes',side,'line'])::numeric;
            side_odds:=(q#>>array['outcomes',side,'odds'])::numeric;
          exception when invalid_text_representation or numeric_value_out_of_range then side_line:=null; side_odds:=null;
          end;
          if not coalesce(public.gtl_numeric_is_finite(side_line),false) or side_line*2<>trunc(side_line*2)
            or (p_market='spread' and abs(side_line)>100)
            or (p_market='total' and side_line not between 0 and 200)
            or not coalesce(public.gtl_numeric_is_finite(side_odds),false) or side_odds<>trunc(side_odds)
            or abs(side_odds) not between 100 and 10000 then side_line:=null; side_odds:=null; end if;
          candidates:=candidates||jsonb_build_array(jsonb_build_object(
            'book',q->>'book','side',side,'line',side_line,'odds',side_odds,
            'observedAt',observed,'collectedAt',collected,'capturedAt',snap.created_at));
        end loop;
      exception when invalid_text_representation or invalid_datetime_format or numeric_value_out_of_range then continue;
      end;
    end loop;
  end loop;
  return jsonb_build_object('season',s,'week',w,'gameId',p_game,'market',p_market,'visible',true,'quotes',candidates);
end $$;

revoke all on function public.gtl_bets_context(uuid,integer,integer,text),
  public.gtl_read_bets(uuid,integer,integer,text,timestamptz),
  public.gtl_read_bets_market(uuid,text,text,integer,integer,timestamptz)
  from public,anon,authenticated;
grant execute on function public.gtl_bets_context(uuid,integer,integer,text),
  public.gtl_read_bets(uuid,integer,integer,text,timestamptz),
  public.gtl_read_bets_market(uuid,text,text,integer,integer,timestamptz)
  to service_role;
