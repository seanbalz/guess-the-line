-- M-48 Player Props: bounded on-demand refresh for a verified offer in the latest NFL slate.
-- NOT APPLIED. Requires the hosted research reservation schema and M-45 Player Props storage.
-- Gate M checks the prior reserve body, retained rows and service-only privileges before the named apply.
-- replaces public.gtl_begin_research_quotes md5 151eb638e13f5819138da76e8a9f7b3d

create or replace function public.gtl_begin_research_quotes(p_request uuid,p_season integer,p_week integer,p_game text,p_markets text[])
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare b public.gtl_odds_budget; j public.gtl_research_quote_fetches; stamp timestamptz:=clock_timestamp();
  cost integer; prop_cost integer; held uuid:=gen_random_uuid(); game jsonb;
begin
  cost:=cardinality(p_markets);
  if p_request is null or cost is null or cost not between 1 and 8 or exists(select 1 from unnest(p_markets) m where m is null or (m !~ '^player_[a-z0-9_]{1,80}$' and m not in ('h2h','spreads','totals','alternate_spreads','alternate_totals')))
    or (select count(distinct m) from unnest(p_markets) m)<>cost then raise exception 'GTL_RESEARCH_INVALID'; end if;
  select * into b from public.gtl_odds_budget where provider='the-odds-api' for update;
  select * into j from public.gtl_research_quote_fetches where request_id=p_request;
  if found then
    if j.season<>p_season or j.week<>p_week or j.game_id<>p_game or j.markets<>p_markets then raise exception 'GTL_RESEARCH_REPLAY'; end if;
    return jsonb_build_object('replay',true,'status',j.status);
  end if;
  select x into game from public.gtl_weekly_slates s cross join lateral jsonb_array_elements(s.signature->'games') x
    where s.season=p_season and s.week=p_week and x->>'id'=p_game;
  if game is null or to_timestamp((game->>'kickoff')::double precision)<=stamp then raise exception 'GTL_RESEARCH_INVALID'; end if;
  if b.lease_token is not null and b.lease_until>stamp then raise exception 'GTL_ODDS_BUSY'; end if;
  if b.last_successful_preflight_at is null or b.last_successful_preflight_at<stamp-interval '24 hours' or b.conservative_remaining is null then raise exception 'GTL_ODDS_PREFLIGHT_REQUIRED'; end if;
  if b.paused or b.conservative_remaining<50+cost then raise exception 'GTL_ODDS_BUDGET'; end if;
  -- One region costs one credit per market. Count all reservations, including
  -- failed, empty and unfinished requests, within this NFL season and week.
  select count(*) into prop_cost from unnest(p_markets) m where starts_with(m,'player_');
  if prop_cost>0 and prop_cost + (
    select count(*) from public.gtl_research_quote_fetches f
    cross join lateral unnest(f.markets) m
    where f.season=p_season and f.week=p_week and starts_with(m,'player_')
  )>12 then raise exception 'GTL_PROPS_WEEKLY_BUDGET'; end if;
  insert into public.gtl_research_quote_fetches(request_id,lease,season,week,game_id,markets,reserved_credits,status,started_at,expires_at,quota,error) values(p_request,held,p_season,p_week,p_game,p_markets,cost,'running',stamp,stamp+interval '90 seconds',null,null);
  update public.gtl_odds_budget set conservative_remaining=conservative_remaining-cost,lease_token=held,lease_until=stamp+interval '90 seconds',updated_at=stamp where provider=b.provider;
  return jsonb_build_object('replay',false,'lease',held,'expiresAt',stamp+interval '90 seconds');
end $$;

-- On-demand refresh is service-only. Cooldown and reserve run under the same
-- budget row lock so a request cannot slip between the two decisions.
create or replace function public.gtl_props_begin_refresh(p_request uuid,p_season integer,p_week integer,p_event_id text,p_player_id text,p_stat text)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
  offer public.gtl_prop_offers;
  slate public.gtl_weekly_slates;
  target_game text;
  kickoff timestamptz;
  stamp timestamptz;
begin
  if p_request is null or p_stat is null or p_stat not in ('player_pass_yds','player_rush_yds','player_reception_yds') then
    raise exception 'GTL_PROPS_INVALID';
  end if;
  perform 1 from public.gtl_odds_budget where provider='the-odds-api' for update;
  if not found then raise exception 'GTL_ODDS_PREFLIGHT_REQUIRED'; end if;
  stamp:=clock_timestamp();
  if not public.gtl_props_ready() then raise exception 'GTL_PROPS_OFF'; end if;
  select * into offer from public.gtl_prop_offers o
    where o.season=p_season and o.week=p_week and o.event_id=p_event_id and o.player_id=p_player_id and o.stat=p_stat;
  if not found then raise exception 'GTL_PROPS_INVALID'; end if;
  target_game:=offer.away||'-'||offer.home;

  -- A replay can only read the status of the same game/stat reservation. It
  -- acquires no new lease, including after the slate advances or the game starts.
  if exists (select 1 from public.gtl_research_quote_fetches f where f.request_id=p_request) then
    return public.gtl_begin_research_quotes(p_request,p_season,p_week,target_game,array[p_stat]);
  end if;
  select * into slate from public.gtl_weekly_slates order by season desc,week desc limit 1;
  if slate.season is distinct from p_season or slate.week is distinct from p_week then raise exception 'GTL_PROPS_INVALID'; end if;
  select to_timestamp((g->>'kickoff')::double precision) into kickoff
    from jsonb_array_elements(slate.signature->'games') g
    where g->>'id'=target_game and g->>'away'=offer.away and g->>'home'=offer.home;
  if kickoff is null then raise exception 'GTL_PROPS_INVALID'; end if;
  if stamp>=kickoff or stamp>=offer.kickoff then raise exception 'GTL_PROPS_CLOSED'; end if;
  if kickoff is distinct from offer.kickoff then raise exception 'GTL_PROPS_INVALID'; end if;

  -- The six-hour window is measured from the oldest bookmaker observation,
  -- as in the existing lock-in writer, for the requested selection only.
  if exists (select 1 from public.gtl_prop_references r
    where r.event_id=p_event_id and r.player_id=p_player_id and r.stat=p_stat
      and r.observed_to<offer.kickoff and r.observed_to<=stamp and r.observed_from>=stamp-interval '6 hours')
    then raise exception 'GTL_PROPS_REFERENCE_FRESH'; end if;
  if exists (select 1 from public.gtl_research_quote_fetches f
    where f.season=p_season and f.week=p_week and f.game_id=target_game
      and p_stat=any(f.markets) and f.started_at>stamp-interval '5 minutes')
    then raise exception 'GTL_PROPS_REFRESH_COOLDOWN'; end if;

  return public.gtl_begin_research_quotes(p_request,p_season,p_week,target_game,array[p_stat]);
end $$;

revoke all on function public.gtl_props_begin_refresh(uuid,integer,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.gtl_props_begin_refresh(uuid,integer,integer,text,text,text) to service_role;
