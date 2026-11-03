-- Research-first stage. Additive, service-only, append-only. No Guess/scoring writers.
-- Apply after deploying the Lines error mappings. Disable with research-assessments.
create table public.gtl_research_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.gtl_profiles(user_id),
  request_id uuid not null,
  source_url text not null check(length(source_url) <= 300),
  created_at timestamptz not null default clock_timestamp(),
  unique(user_id,request_id)
);
create index gtl_research_submissions_owner on public.gtl_research_submissions(user_id,created_at desc,id);
create table public.gtl_research_snapshots (
  id uuid primary key,
  season integer not null check(season between 2000 and 2100),
  week integer not null check(week between 1 and 25),
  payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=2000000),
  created_at timestamptz not null default clock_timestamp()
);
create index gtl_research_snapshots_week on public.gtl_research_snapshots(season,week,created_at desc,id desc);
alter table public.gtl_research_submissions enable row level security;
alter table public.gtl_research_snapshots enable row level security;
revoke all on public.gtl_research_submissions,public.gtl_research_snapshots from public,anon,authenticated,service_role;
grant select,insert on public.gtl_research_submissions,public.gtl_research_snapshots to service_role;

create function public.gtl_submit_research_link(p_user uuid,p_request uuid,p_url text)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare previous public.gtl_research_submissions; saved public.gtl_research_submissions;
begin
  if not exists(select 1 from public.gtl_profiles where user_id=p_user)
    or exists(select 1 from public.gtl_community_removals where user_id=p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_request is null or p_url is null or p_url !~ '^https://x\.com/(rotobot_ai|parlayscience|fatbosspicks|trendscenterapp|bettingpros|bookitwithtrent|4thdownvip|actionnetworkhq)/status/[0-9]{1,25}$'
    then raise exception 'GTL_RESEARCH_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('research-submission:'||p_user::text,0));
  select * into previous from public.gtl_research_submissions where user_id=p_user and request_id=p_request;
  if found then
    if previous.source_url<>p_url then raise exception 'GTL_RESEARCH_REPLAY'; end if;
    return jsonb_build_object('id',previous.id,'url',previous.source_url,'createdAt',previous.created_at,'status','pending');
  end if;
  if (select count(*) from public.gtl_research_submissions where user_id=p_user and created_at>=clock_timestamp()-interval '1 day')>=20
    then raise exception 'GTL_RESEARCH_LIMIT'; end if;
  insert into public.gtl_research_submissions(user_id,request_id,source_url) values(p_user,p_request,p_url) returning * into saved;
  return jsonb_build_object('id',saved.id,'url',saved.source_url,'createdAt',saved.created_at,'status','pending');
end $$;
create function public.gtl_read_research_submissions(p_user uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.gtl_profiles where user_id=p_user)
    or exists(select 1 from public.gtl_community_removals where user_id=p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'url',x.source_url,'createdAt',x.created_at,'status','pending') order by x.created_at desc,x.id)
    from (select id,source_url,created_at from public.gtl_research_submissions where user_id=p_user order by created_at desc,id limit 50) x),'[]'::jsonb);
end $$;
create function public.gtl_publish_research_snapshot(p_id uuid,p_payload jsonb)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare previous jsonb;
begin
  if p_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>2000000
    or p_payload->>'version' is distinct from '1' or (p_payload->>'season')::integer not between 2000 and 2100
    or (p_payload->>'week')::integer not between 1 and 25 or (p_payload->>'generatedAt')::timestamptz>clock_timestamp()
    or jsonb_typeof(p_payload->'candidates') is distinct from 'array' or jsonb_typeof(p_payload->'quotes') is distinct from 'array'
    or jsonb_typeof(p_payload->'sources') is distinct from 'array' then raise exception 'GTL_RESEARCH_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('research-publish:'||p_id::text,0));
  select payload into previous from public.gtl_research_snapshots where id=p_id;
  if found then
    if previous<>p_payload then raise exception 'GTL_RESEARCH_REPLAY'; end if;
  else
    insert into public.gtl_research_snapshots(id,season,week,payload) values(p_id,(p_payload->>'season')::integer,(p_payload->>'week')::integer,p_payload);
  end if;
  return jsonb_build_object('id',p_id,'status','stored');
end $$;
create function public.gtl_read_research_snapshot(p_season integer,p_week integer)
returns jsonb language sql stable security invoker set search_path='' as $$
  select payload from public.gtl_research_snapshots where season=p_season and week=p_week and created_at<=clock_timestamp()
    order by created_at desc,id desc limit 1;
$$;
revoke all on function public.gtl_submit_research_link(uuid,uuid,text),public.gtl_read_research_submissions(uuid),
  public.gtl_publish_research_snapshot(uuid,jsonb),public.gtl_read_research_snapshot(integer,integer) from public,anon,authenticated;
grant execute on function public.gtl_submit_research_link(uuid,uuid,text),public.gtl_read_research_submissions(uuid),
  public.gtl_publish_research_snapshot(uuid,jsonb),public.gtl_read_research_snapshot(integer,integer) to service_role;

-- Optional selective game/prop collection shares the existing budget row AND lease.
-- Existing collectors and research cannot reserve the same credits concurrently.
create table public.gtl_research_quote_fetches (
  request_id uuid primary key, lease uuid not null, season integer not null, week integer not null, game_id text not null,
  markets text[] not null, reserved_credits integer not null check(reserved_credits between 1 and 8),
  status text not null check(status in ('running','finished')), started_at timestamptz not null, expires_at timestamptz not null,
  quota jsonb, error text, quote_payload jsonb not null default '[]' check(jsonb_typeof(quote_payload)='array' and octet_length(quote_payload::text)<=2000000)
);
alter table public.gtl_research_quote_fetches enable row level security;
revoke all on public.gtl_research_quote_fetches from public,anon,authenticated,service_role;
grant select,insert,update(status,quota,error,quote_payload) on public.gtl_research_quote_fetches to service_role;
create function public.gtl_begin_research_quotes(p_request uuid,p_season integer,p_week integer,p_game text,p_markets text[])
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare b public.gtl_odds_budget; j public.gtl_research_quote_fetches; stamp timestamptz:=clock_timestamp();
  cost integer; held uuid:=gen_random_uuid(); game jsonb;
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
  insert into public.gtl_research_quote_fetches(request_id,lease,season,week,game_id,markets,reserved_credits,status,started_at,expires_at,quota,error) values(p_request,held,p_season,p_week,p_game,p_markets,cost,'running',stamp,stamp+interval '90 seconds',null,null);
  update public.gtl_odds_budget set conservative_remaining=conservative_remaining-cost,lease_token=held,lease_until=stamp+interval '90 seconds',updated_at=stamp where provider=b.provider;
  return jsonb_build_object('replay',false,'lease',held,'expiresAt',stamp+interval '90 seconds');
end $$;
create function public.gtl_finish_research_quotes(p_request uuid,p_lease uuid,p_quota jsonb,p_error text,p_quotes jsonb default '[]')
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare b public.gtl_odds_budget; j public.gtl_research_quote_fetches; remaining integer; lastcost integer;
begin
  select * into b from public.gtl_odds_budget where provider='the-odds-api' for update;
  select * into j from public.gtl_research_quote_fetches where request_id=p_request for update;
  if not found or j.lease is distinct from p_lease then raise exception 'GTL_RESEARCH_INVALID'; end if;
  if j.status='finished' then return jsonb_build_object('status','finished'); end if;
  if b.lease_token is distinct from p_lease or j.expires_at<clock_timestamp() then raise exception 'GTL_ODDS_LEASE'; end if;
  if jsonb_typeof(p_quota) is distinct from 'object' or exists(select 1 from jsonb_each(p_quota) q where q.key not in ('remaining','used','last')
    or (q.value<>'null'::jsonb and (jsonb_typeof(q.value)<>'number' or q.value::text !~ '^[0-9]{1,9}$'))) then raise exception 'GTL_RESEARCH_INVALID'; end if;
  if p_quotes is null or jsonb_typeof(p_quotes)<>'array' or octet_length(p_quotes::text)>2000000 or exists(select 1 from jsonb_array_elements(p_quotes) q where q->>'gameId' is distinct from j.game_id or q->>'provider' is distinct from 'the-odds-api' or not ((q#>>'{selection,key}')=any(j.markets))) then raise exception 'GTL_RESEARCH_INVALID'; end if;
  remaining:=(p_quota->>'remaining')::integer; lastcost:=(p_quota->>'last')::integer;
  update public.gtl_research_quote_fetches set status='finished',quota=p_quota,quote_payload=case when p_error is null and coalesce(lastcost<=j.reserved_credits,true) then p_quotes else '[]'::jsonb end,error=case when lastcost>j.reserved_credits then 'unexpected_cost' else p_error end where request_id=p_request;
  update public.gtl_odds_budget set conservative_remaining=case when remaining is null then conservative_remaining else least(conservative_remaining,remaining) end,
    observed_remaining=coalesce(remaining,observed_remaining),observed_used=coalesce((p_quota->>'used')::integer,observed_used),observed_last=coalesce(lastcost,observed_last),
    paused=paused or coalesce(lastcost>j.reserved_credits,false),lease_token=null,lease_until=null,updated_at=clock_timestamp() where provider=b.provider;
  return jsonb_build_object('status','finished');
end $$;
revoke all on function public.gtl_begin_research_quotes(uuid,integer,integer,text,text[]),public.gtl_finish_research_quotes(uuid,uuid,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.gtl_begin_research_quotes(uuid,integer,integer,text,text[]),public.gtl_finish_research_quotes(uuid,uuid,jsonb,text,jsonb) to service_role;

-- Feed authors cannot supply executable quotes. Only durable provider captures
-- are read here; a later empty successful market response invalidates old offers.
create index gtl_research_quote_fetches_scope on public.gtl_research_quote_fetches(season,week,started_at desc);
create function public.gtl_read_research_quotes(p_season integer,p_week integer,p_selections jsonb default '[]')
returns jsonb language sql stable security invoker set search_path='' as $$
  with expanded as (
    select f.request_id,f.game_id,f.started_at,f.quote_payload,unnest(f.markets) market
    from public.gtl_research_quote_fetches f where f.season=p_season and f.week=p_week and f.status='finished' and f.error is null
  ), latest as (
    select distinct on(game_id,market) * from expanded order by game_id,market,started_at desc,request_id desc
  ) select coalesce(jsonb_agg(q),'[]'::jsonb) from latest l cross join lateral jsonb_array_elements(l.quote_payload) q
    where q#>>'{selection,key}'=l.market and jsonb_typeof(p_selections)='array' and jsonb_array_length(p_selections)<=500
      and exists(select 1 from jsonb_array_elements(p_selections) s where s->>'gameId'=l.game_id and ((s->'selection')-'playerName')=((q->'selection')-'playerName'));
$$;
revoke all on function public.gtl_read_research_quotes(integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.gtl_read_research_quotes(integer,integer,jsonb) to service_role;
