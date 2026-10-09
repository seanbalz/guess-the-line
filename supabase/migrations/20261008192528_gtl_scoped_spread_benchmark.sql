-- D-09 only. Installation does NOT activate a policy. An administrator must
-- separately record the explicitly authorized ruling; service/browser cannot.
create table public.gtl_benchmark_policies (
  id text primary key check(id='d09-2026-w05-sean-steven-spread'),
  league_id text not null references public.gtl_leagues(id) check(league_id='g_a697831088e94d5eba8ca0fd51054076'),
  season integer not null check(season=2026), week integer not null check(week=5),
  mode text not null check(mode='guess_spread'),
  books text[] not null default array['draftkings','fanduel','betmgm'] check(books=array['draftkings','fanduel','betmgm']),
  action_crosscheck_waived boolean not null default true check(action_crosscheck_waived),
  max_quote_age_seconds integer not null default 300 check(max_quote_age_seconds=300),
  agreement_fraction numeric not null default 0.85 check(agreement_fraction=0.85),
  agreement_band numeric not null default 5 check(agreement_band=5),
  slate_signature jsonb not null,
  created_by uuid not null references auth.users(id),
  decision_text text not null check(length(decision_text) between 1 and 2000),
  created_at timestamptz not null default now(),
  unique(league_id,season,week,mode),
  foreign key(season,week) references public.gtl_weekly_slates
);
create index gtl_benchmark_policies_actor_idx on public.gtl_benchmark_policies(created_by);
create index gtl_benchmark_policies_slate_idx on public.gtl_benchmark_policies(season,week);
create table public.gtl_frozen_benchmarks (
  policy_id text primary key references public.gtl_benchmark_policies(id),
  request_id uuid not null unique, snapshot_id uuid not null references public.gtl_market_snapshots(id),
  actor_id uuid not null references auth.users(id),
  actual_kickoff timestamptz not null,
  source_url text not null check(length(source_url) between 9 and 2048 and source_url ~ '^https://[^/@?#[:space:]]+([/?][^#[:space:]]*)?$'),
  benchmark jsonb not null check(jsonb_typeof(benchmark)='object'),
  frozen_at timestamptz not null default clock_timestamp()
);
create index gtl_frozen_benchmarks_snapshot_idx on public.gtl_frozen_benchmarks(snapshot_id);
create index gtl_frozen_benchmarks_actor_idx on public.gtl_frozen_benchmarks(actor_id);

create function public.gtl_benchmark_immutable() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'GTL_BENCHMARK_IMMUTABLE'; end $$;
create trigger gtl_benchmark_policy_immutable before update or delete on public.gtl_benchmark_policies
for each row execute function public.gtl_benchmark_immutable();
create trigger gtl_frozen_benchmark_immutable before update or delete on public.gtl_frozen_benchmarks
for each row execute function public.gtl_benchmark_immutable();

-- Pure, fail-closed validation. Exact canonical names/IDs/kickoffs; one complete
-- snapshot, not a composite of quotes picked from different collection times.
-- Provider observation time is not asserted to be the sportsbook-issued time.
create function public.gtl_benchmark_candidate(p_payload jsonb,p_games jsonb,p_actual timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare g jsonb; e jsonb; q jsonb; result jsonb:='{}'; vals numeric[]; books text[];
  observed timestamptz; captured timestamptz; quoted timestamptz; first_quote timestamptz; last_quote timestamptz;
  global_first timestamptz; v numeric; median_value numeric; within_band integer;
begin
  if p_payload->>'provider' is distinct from 'the-odds-api' or p_payload->>'sport' is distinct from 'americanfootball_nfl'
    or jsonb_typeof(p_payload->'games') is distinct from 'array' or jsonb_typeof(p_games) is distinct from 'array'
    or jsonb_array_length(p_payload->'games')<>15 or jsonb_array_length(p_games)<>15 then return null; end if;
  captured:=(p_payload->>'fetchedAt')::timestamptz;
  if captured is null or not isfinite(captured) or captured>clock_timestamp()
    or (p_actual is not null and captured>=p_actual) then return null; end if;
  if (select count(distinct x->>'gameId') from jsonb_array_elements(p_payload->'games') x)<>15
    or (select count(distinct x->>'id') from jsonb_array_elements(p_games) x)<>15 then return null; end if;
  for g in select value from jsonb_array_elements(p_games) loop
    select x into e from jsonb_array_elements(p_payload->'games') x where x->>'gameId'=g->>'id';
    if e is null or e->>'home' is distinct from g->>'home' or e->>'away' is distinct from g->>'away'
      or (e->>'kickoff')::timestamptz is distinct from (g->>'kickoff')::timestamptz
      or captured>=(g->>'kickoff')::timestamptz or e->>'matchStatus' is distinct from 'matched'
      or e->>'providerEventId' is null or jsonb_typeof(e#>'{markets,spread,quotes}') is distinct from 'array'
      or jsonb_array_length(e#>'{markets,spread,quotes}')<>3 then return null; end if;
    vals:='{}'; books:='{}'; first_quote:=null; last_quote:=null;
    for q in select value from jsonb_array_elements(e#>'{markets,spread,quotes}') loop
      if q->>'book' is null or q->>'book' not in ('draftkings','fanduel','betmgm') or q->>'book'=any(books)
        or q->>'provider' is distinct from 'the-odds-api' or q->>'providerEventId' is distinct from e->>'providerEventId'
        or q->>'market' is distinct from 'spread' or q->>'timeBasis' is distinct from 'provider_market_last_update'
        or jsonb_typeof(q->'value') is distinct from 'number' then return null; end if;
      v:=(q->>'value')::numeric; observed:=(q->>'providerObservedAt')::timestamptz; quoted:=(q->>'collectedAt')::timestamptz;
      if v not between -100 and 100 or mod(v*2,1)<>0 or observed is null or quoted is null
        or not isfinite(observed) or not isfinite(quoted) or observed>quoted or quoted<>captured
        or observed<captured-interval '5 minutes'
        or (p_actual is not null and (observed>=p_actual or quoted>=p_actual or observed<p_actual-interval '5 minutes'))
        or jsonb_typeof(q#>'{outcomes,home,line}') is distinct from 'number' or jsonb_typeof(q#>'{outcomes,away,line}') is distinct from 'number'
        or (q#>>'{outcomes,home,line}')::numeric<>v or (q#>>'{outcomes,away,line}')::numeric<>-v then return null; end if;
      vals:=array_append(vals,v); books:=array_append(books,q->>'book');
      first_quote:=least(first_quote,observed); last_quote:=greatest(last_quote,observed);
    end loop;
    select array_agg(x order by x) into vals from unnest(vals) x;
    median_value:=vals[2];
    select count(*) into within_band from unnest(vals) x where abs(x-median_value)<=5;
    if within_band::numeric/3<0.85 or last_quote-first_quote>interval '5 minutes' then return null; end if;
    global_first:=least(global_first,first_quote);
    result:=result||jsonb_build_object(g->>'id',jsonb_build_object('value',median_value,'oldestObservedAt',first_quote,'newestObservedAt',last_quote));
  end loop;
  return jsonb_build_object('games',result,'capturedAt',captured,'quotedAt',global_first,
    'actualKickoff',p_actual,'stale',global_first<clock_timestamp()-interval '5 minutes');
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then return null;
end $$;

create function public.gtl_read_scoring_benchmark(p_user uuid,p_league text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; policy public.gtl_benchmark_policies; frozen public.gtl_frozen_benchmarks;
  snap public.gtl_market_snapshots; candidate jsonb; metadata jsonb;
begin
  c:=public.gtl_weekly_context(p_user,p_league);
  select * into policy from public.gtl_benchmark_policies where league_id=p_league and season=(c->>'season')::integer and week=(c->>'week')::integer and mode='guess_spread';
  if not found then return null; end if;
  if policy.slate_signature is distinct from public.gtl_weekly_slate(c->'state') then raise exception 'GTL_SLATE_CONFLICT'; end if;
  metadata:=jsonb_build_object('policyId',policy.id,'leagueId',policy.league_id,'season',policy.season,'week',policy.week,'mode',policy.mode,
    'source','The Odds API · DraftKings / FanDuel / BetMGM median','sourceUrl',null);
  select * into frozen from public.gtl_frozen_benchmarks where policy_id=policy.id;
  if found then return metadata||frozen.benchmark||jsonb_build_object('status','frozen','sourceUrl',frozen.source_url,'stale',false); end if;
  for snap in select * from public.gtl_market_snapshots where season=policy.season and week=policy.week and slate_signature=policy.slate_signature order by (payload->>'fetchedAt')::timestamptz desc,created_at desc,id desc loop
    candidate:=public.gtl_benchmark_candidate(snap.payload,c#>'{state,games}',null);
    if candidate is not null then return metadata||candidate||jsonb_build_object('status','provisional'); end if;
  end loop;
  return metadata||jsonb_build_object('status','unavailable','games','{}'::jsonb,'capturedAt',null,'quotedAt',null,'actualKickoff',null,'stale',false);
end $$;

create function public.gtl_freeze_benchmark(p_user uuid,p_league text,p_request uuid,p_actual timestamptz,p_source text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; policy public.gtl_benchmark_policies; frozen public.gtl_frozen_benchmarks;
  snap public.gtl_market_snapshots; candidate jsonb; first_scheduled timestamptz; replayed boolean:=false;
begin
  perform public.gtl_odds_commissioner(p_user);
  if p_league is distinct from 'g_a697831088e94d5eba8ca0fd51054076' then raise exception 'GTL_BENCHMARK_SCOPE'; end if;
  -- Lock before weekly_context takes its shared lock. All freezes use this same
  -- existing writable row; immutable policy rows need no UPDATE privilege.
  perform 1 from public.gtl_leagues where id=p_league for update;
  c:=public.gtl_weekly_context(p_user,p_league);
  select * into policy from public.gtl_benchmark_policies where league_id=p_league and season=(c->>'season')::integer and week=(c->>'week')::integer and mode='guess_spread';
  if not found then raise exception 'GTL_BENCHMARK_SCOPE'; end if;
  if policy.slate_signature is distinct from public.gtl_weekly_slate(c->'state') then raise exception 'GTL_SLATE_CONFLICT'; end if;
  select min((g->>'kickoff')::timestamptz) into first_scheduled from jsonb_array_elements(c#>'{state,games}') g;
  if p_request is null or p_actual is null or not isfinite(p_actual) or p_actual>clock_timestamp() or p_actual<first_scheduled-interval '30 minutes'
    or (p_actual at time zone 'America/Los_Angeles')::date<>(first_scheduled at time zone 'America/Los_Angeles')::date
    or p_source is null or length(p_source) not between 9 and 2048 or p_source !~ '^https://[^/@?#[:space:]]+([/?][^#[:space:]]*)?$'
    then raise exception 'GTL_BENCHMARK_INPUT'; end if;
  select * into frozen from public.gtl_frozen_benchmarks where policy_id=policy.id;
  if found then
    if frozen.request_id<>p_request or frozen.actor_id<>p_user or frozen.actual_kickoff<>p_actual or frozen.source_url<>p_source then raise exception 'GTL_BENCHMARK_FROZEN'; end if;
    replayed:=true;
  else
    for snap in select * from public.gtl_market_snapshots where season=policy.season and week=policy.week and slate_signature=policy.slate_signature order by (payload->>'fetchedAt')::timestamptz desc,created_at desc,id desc loop
      candidate:=public.gtl_benchmark_candidate(snap.payload,c#>'{state,games}',p_actual);
      if candidate is not null then exit; end if;
    end loop;
    if candidate is null then raise exception 'GTL_BENCHMARK_MISSING'; end if;
    insert into public.gtl_frozen_benchmarks(policy_id,request_id,snapshot_id,actor_id,actual_kickoff,source_url,benchmark)
      values(policy.id,p_request,snap.id,p_user,p_actual,p_source,candidate) returning * into frozen;
  end if;
  return jsonb_build_object('status','frozen','policyId',policy.id,'requestId',frozen.request_id,'actualKickoff',frozen.actual_kickoff,
    'sourceURL',frozen.source_url,'gameCount',15,'replayed',replayed);
end $$;

alter table public.gtl_benchmark_policies enable row level security;
alter table public.gtl_frozen_benchmarks enable row level security;
revoke all on public.gtl_benchmark_policies,public.gtl_frozen_benchmarks from public,anon,authenticated,service_role;
grant select on public.gtl_benchmark_policies to service_role;
grant select,insert on public.gtl_frozen_benchmarks to service_role;
revoke all on function public.gtl_benchmark_immutable(),public.gtl_benchmark_candidate(jsonb,jsonb,timestamptz),public.gtl_read_scoring_benchmark(uuid,text),public.gtl_freeze_benchmark(uuid,text,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.gtl_benchmark_immutable(),public.gtl_benchmark_candidate(jsonb,jsonb,timestamptz),public.gtl_read_scoring_benchmark(uuid,text),public.gtl_freeze_benchmark(uuid,text,uuid,timestamptz,text) to service_role;
