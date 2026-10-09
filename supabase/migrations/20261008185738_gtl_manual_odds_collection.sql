-- Manual, commissioner-only collection. No cron, polling, official freeze, or score writes.
create table public.gtl_odds_budget (
  provider text primary key check(provider='the-odds-api'),
  conservative_remaining integer check(conservative_remaining>=0),
  observed_remaining integer check(observed_remaining>=0), observed_used integer check(observed_used>=0), observed_last integer check(observed_last>=0),
  observed_at timestamptz, last_successful_preflight_at timestamptz, paused boolean not null default false, lease_token uuid, lease_until timestamptz,
  last_collection_at timestamptz, last_preflight_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.gtl_odds_budget(provider) values('the-odds-api');
create table public.gtl_odds_collections (
  id uuid primary key, actor_id uuid not null references auth.users(id),
  operation text not null check(operation in ('preflight','collect')),
  status text not null check(status in ('running','succeeded','failed')),
  lease_token uuid not null unique, started_at timestamptz not null, expires_at timestamptz not null, finished_at timestamptz,
  reserved_credits integer not null check(reserved_credits in (0,2)),
  season integer not null, week integer not null, slate_signature jsonb not null,
  diagnostics jsonb, error_code text,
  foreign key(season,week) references public.gtl_weekly_slates
);
create index gtl_odds_collections_daily_idx on public.gtl_odds_collections(operation,started_at);
create index gtl_odds_collections_actor_idx on public.gtl_odds_collections(actor_id);
create index gtl_odds_collections_slate_idx on public.gtl_odds_collections(season,week);
create table public.gtl_market_snapshots (
  id uuid primary key references public.gtl_odds_collections(id),
  season integer not null, week integer not null, slate_signature jsonb not null,
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  created_at timestamptz not null default now(),
  official_verified boolean not null default false check(official_verified=false),
  foreign key(season,week) references public.gtl_weekly_slates
);
create index gtl_market_snapshots_latest_idx on public.gtl_market_snapshots(season,week,created_at desc);

create function public.gtl_odds_commissioner(p_user uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb;
begin
  if not exists(select 1 from public.gtl_memberships where user_id=p_user and league_id='sean-troy-luke' and player_id='sean' and role='commissioner' and active) then raise exception 'GTL_ODDS_FORBIDDEN'; end if;
  c:=public.gtl_weekly_context(p_user,'sean-troy-luke');
  return jsonb_build_object('season',c->'season','week',c->'week',
    'signature',public.gtl_weekly_slate(c->'state'),
    'games',(select jsonb_agg(jsonb_build_object('id',g->'id','home',g->'home','away',g->'away','kickoff',g->'kickoff') order by n)
      from jsonb_array_elements(c#>'{state,games}') with ordinality q(g,n)));
end $$;

create function public.gtl_begin_odds_collection(p_user uuid,p_request uuid,p_operation text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; b public.gtl_odds_budget; job public.gtl_odds_collections; stamp timestamptz; lease uuid;
begin
  c:=public.gtl_odds_commissioner(p_user);
  if p_request is null or p_operation is null or p_operation not in ('preflight','collect') then raise exception 'GTL_ODDS_REQUEST'; end if;
  select * into b from public.gtl_odds_budget where provider='the-odds-api' for update;
  if b.provider is null then raise exception 'GTL_ODDS_BUDGET'; end if;
  stamp:=clock_timestamp();
  -- Lease expiration does not refund uncertain network spending.
  if b.lease_token is not null and b.lease_until<=stamp then
    update public.gtl_odds_collections set status='failed',finished_at=stamp,error_code='ODDS_LEASE_EXPIRED',
      diagnostics=jsonb_build_object('status','failed','errorCode','ODDS_LEASE_EXPIRED') where lease_token=b.lease_token and status='running';
    update public.gtl_odds_budget set lease_token=null,lease_until=null,updated_at=stamp where provider=b.provider;
    b.lease_token:=null;
  end if;
  select * into job from public.gtl_odds_collections where id=p_request;
  if found then
    if job.actor_id<>p_user or job.operation<>p_operation then raise exception 'GTL_ODDS_REQUEST_CONFLICT'; end if;
    return jsonb_build_object('replay',true,'requestId',job.id,'operation',job.operation,'status',job.status,'diagnostics',job.diagnostics);
  end if;
  if b.lease_token is not null then raise exception 'GTL_ODDS_BUSY'; end if;
  if p_operation='preflight' then
    if b.last_preflight_at>stamp-interval '1 minute' then raise exception 'GTL_ODDS_COOLDOWN'; end if;
  else
    if b.last_successful_preflight_at is null or b.last_successful_preflight_at<stamp-interval '24 hours' or b.conservative_remaining is null then raise exception 'GTL_ODDS_PREFLIGHT_REQUIRED'; end if;
    if b.paused or b.conservative_remaining<52 then raise exception 'GTL_ODDS_BUDGET'; end if;
    if b.last_collection_at>stamp-interval '15 minutes' then raise exception 'GTL_ODDS_COOLDOWN'; end if;
    if (select count(*) from public.gtl_odds_collections where operation='collect' and started_at >= (date_trunc('day',stamp at time zone 'UTC') at time zone 'UTC'))>=4 then raise exception 'GTL_ODDS_DAILY_LIMIT'; end if;
  end if;
  lease:=gen_random_uuid();
  insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature)
    values(p_request,p_user,p_operation,'running',lease,stamp,stamp+interval '90 seconds',case when p_operation='collect' then 2 else 0 end,(c->>'season')::integer,(c->>'week')::integer,c->'signature');
  update public.gtl_odds_budget set lease_token=lease,lease_until=stamp+interval '90 seconds',
    conservative_remaining=case when p_operation='collect' then conservative_remaining-2 else conservative_remaining end,
    last_collection_at=case when p_operation='collect' then stamp else last_collection_at end,
    last_preflight_at=case when p_operation='preflight' then stamp else last_preflight_at end,updated_at=stamp where provider=b.provider;
  return jsonb_build_object('replay',false,'requestId',p_request,'lease',lease,'operation',p_operation,'games',c->'games',
    'remainingCredits',b.conservative_remaining,'reserveCredits',50,'season',c->'season','week',c->'week');
end $$;

create function public.gtl_finish_odds_collection(p_user uuid,p_request uuid,p_lease uuid,p_payload jsonb,p_quota jsonb,p_error text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; b public.gtl_odds_budget; job public.gtl_odds_collections; stamp timestamptz; q record;
  remaining integer; used integer; lastcost integer; matched integer:=0; quotes integer:=0; item jsonb; market record; quote jsonb; schedule jsonb; captured timestamptz; observed timestamptz; summary jsonb; snapshot uuid;
begin
  c:=public.gtl_odds_commissioner(p_user);
  select * into b from public.gtl_odds_budget where provider='the-odds-api' for update;
  select * into job from public.gtl_odds_collections where id=p_request for update;
  if job.id is null or job.actor_id<>p_user or job.lease_token is distinct from p_lease then raise exception 'GTL_ODDS_REQUEST'; end if;
  if job.status<>'running' then return job.diagnostics; end if;
  stamp:=clock_timestamp();
  if b.lease_token is distinct from p_lease or job.expires_at<=stamp then raise exception 'GTL_ODDS_LEASE'; end if;
  if c->'signature'<>job.slate_signature then raise exception 'GTL_SLATE_CONFLICT'; end if;
  if p_error is not null and p_error not in ('ODDS_CONFIG','ODDS_SLATE','ODDS_BUSY','ODDS_BUDGET','ODDS_AUTH','ODDS_RATE_LIMIT','ODDS_UNAVAILABLE','ODDS_TIMEOUT','ODDS_PAYLOAD','ODDS_BODY_LIMIT','ODDS_QUOTA_COST') then raise exception 'GTL_ODDS_REQUEST'; end if;
  if p_quota is null or jsonb_typeof(p_quota)<>'object' then raise exception 'GTL_ODDS_REQUEST'; end if;
  for q in select * from jsonb_each(p_quota) loop
    if q.key not in ('remaining','used','last') or (q.value<>'null'::jsonb and (jsonb_typeof(q.value)<>'number' or q.value::text !~ '^[0-9]{1,9}$')) then raise exception 'GTL_ODDS_REQUEST'; end if;
  end loop;
  remaining:=(p_quota->>'remaining')::integer; used:=(p_quota->>'used')::integer; lastcost:=(p_quota->>'last')::integer;
  if lastcost > (case when job.operation='preflight' then 0 else 2 end) then p_error:='ODDS_QUOTA_COST'; end if;
  if p_error is null and (p_payload is null or jsonb_typeof(p_payload)<>'object' or jsonb_typeof(p_payload->'games') is distinct from 'array' or jsonb_array_length(p_payload->'games')<>jsonb_array_length(c->'games') or octet_length(p_payload::text)>524288) then raise exception 'GTL_ODDS_PAYLOAD'; end if;
  if p_error is null then
    if p_payload->>'provider' is distinct from 'the-odds-api' or p_payload->>'sport' is distinct from 'americanfootball_nfl' or p_payload->'officialVerified' is distinct from 'false'::jsonb then raise exception 'GTL_ODDS_PAYLOAD'; end if;
    if (select count(*)<>count(distinct g->>'gameId') from jsonb_array_elements(p_payload->'games') g) then raise exception 'GTL_ODDS_PAYLOAD'; end if;
    for item in select value from jsonb_array_elements(p_payload->'games') loop
      select g into schedule from jsonb_array_elements(c->'games') g where g->>'id'=item->>'gameId';
      if schedule is null or item->>'home' is distinct from schedule->>'home' or item->>'away' is distinct from schedule->>'away' or (item->>'kickoff')::timestamptz is distinct from (schedule->>'kickoff')::timestamptz then raise exception 'GTL_ODDS_PAYLOAD'; end if;
      if item->>'matchStatus'='matched' then matched:=matched+1; end if;
      if job.operation='collect' then
        if jsonb_typeof(item->'markets') is distinct from 'object' then raise exception 'GTL_ODDS_PAYLOAD'; end if;
        for market in select * from jsonb_each(item->'markets') loop
          if market.key not in ('spread','total') or jsonb_typeof(market.value->'quotes') is distinct from 'array' then raise exception 'GTL_ODDS_PAYLOAD'; end if;
          for quote in select value from jsonb_array_elements(market.value->'quotes') loop
            captured:=(quote->>'collectedAt')::timestamptz; observed:=(quote->>'providerObservedAt')::timestamptz;
            if item->>'matchStatus' is distinct from 'matched' or quote->>'provider' is distinct from 'the-odds-api' or quote->>'market' is distinct from market.key or quote->>'providerEventId' is distinct from item->>'providerEventId' or captured is null or observed is null or observed>captured or observed<captured-interval '5 minutes' or captured<job.started_at-interval '5 seconds' or captured>(stamp+interval '5 seconds') or captured>=(schedule->>'kickoff')::timestamptz or jsonb_typeof(quote->'value') is distinct from 'number' then raise exception 'GTL_ODDS_PAYLOAD'; end if;
            quotes:=quotes+1;
          end loop;
        end loop;
      end if;
    end loop;
    if job.operation='collect' and quotes>0 then
      snapshot:=job.id;
      insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values(snapshot,job.season,job.week,job.slate_signature,p_payload,stamp);
    end if;
  end if;
  -- Never infer a quota reset or refund an attempted request from a higher header.
  -- Bootstrap starts only from a measured free response, capped to the 500-credit free plan.
  update public.gtl_odds_budget set observed_remaining=coalesce(remaining,observed_remaining),observed_used=coalesce(used,observed_used),observed_last=coalesce(lastcost,observed_last),
    observed_at=case when remaining is not null then stamp else observed_at end,
    conservative_remaining=case when remaining is null then conservative_remaining when conservative_remaining is null then least(remaining,500) else least(conservative_remaining,remaining) end,
    last_successful_preflight_at=case when job.operation='preflight' and p_error is null and remaining is not null then stamp else last_successful_preflight_at end,
    paused=paused or coalesce(p_error='ODDS_QUOTA_COST',false),
    lease_token=null,lease_until=null,updated_at=stamp where provider=b.provider;
  summary:=jsonb_build_object('requestId',job.id,'operation',job.operation,'status',case when p_error is null then 'succeeded' else 'failed' end,
    'snapshotId',snapshot,'matchedEvents',matched,'availableQuotes',quotes,'quota',jsonb_build_object('remaining',remaining,'used',used,'last',lastcost),'officialVerified',false,'errorCode',p_error);
  update public.gtl_odds_collections set status=case when p_error is null then 'succeeded' else 'failed' end,finished_at=stamp,error_code=p_error,diagnostics=summary where id=job.id;
  return summary;
end $$;

create function public.gtl_read_market_snapshot(p_user uuid,p_league text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; result jsonb;
begin
  c:=public.gtl_weekly_context(p_user,p_league);
  -- One statement snapshot keeps latest payload and its bounded history coherent.
  with recent as materialized (
    select id,created_at,payload from public.gtl_market_snapshots
    where season=(c->>'season')::integer and week=(c->>'week')::integer and slate_signature=public.gtl_weekly_slate(c->'state')
    order by created_at desc,id desc limit 20
  ), latest as (select * from recent order by created_at desc,id desc limit 1)
  select jsonb_build_object('id',latest.id,'createdAt',latest.created_at,'officialVerified',false,'payload',latest.payload,
    'history',(select jsonb_agg(jsonb_build_object('id',h.id,'createdAt',h.created_at,'payload',h.payload) order by h.created_at,h.id) from recent h))
    into result from latest;
  return result;
end $$;

alter table public.gtl_odds_budget enable row level security;
alter table public.gtl_odds_collections enable row level security;
alter table public.gtl_market_snapshots enable row level security;
revoke all on public.gtl_odds_budget,public.gtl_odds_collections,public.gtl_market_snapshots from public,anon,authenticated,service_role;
grant select,update on public.gtl_odds_budget to service_role;
grant select,insert,update on public.gtl_odds_collections to service_role;
grant select,insert on public.gtl_market_snapshots to service_role;
revoke all on function public.gtl_odds_commissioner(uuid),public.gtl_begin_odds_collection(uuid,uuid,text),public.gtl_finish_odds_collection(uuid,uuid,uuid,jsonb,jsonb,text),public.gtl_read_market_snapshot(uuid,text) from public,anon,authenticated;
grant execute on function public.gtl_odds_commissioner(uuid),public.gtl_begin_odds_collection(uuid,uuid,text),public.gtl_finish_odds_collection(uuid,uuid,uuid,jsonb,jsonb,text),public.gtl_read_market_snapshot(uuid,text) to service_role;
