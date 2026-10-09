-- Local candidate: authenticated original-commissioner review of ordinary finals.
-- No polling, external calls, official benchmark freeze, wager, void or automatic ruling.
create table public.gtl_result_review_lock(singleton boolean primary key default true check(singleton));
insert into public.gtl_result_review_lock values(true);
create table public.gtl_reviewed_result_events(
  season integer not null, week integer not null, game_id text not null, version bigint not null check(version between 1 and 9007199254740990),
  actor_id uuid not null references auth.users(id), request_id uuid not null,
  payload jsonb not null, result jsonb not null, previous_result jsonb,
  reviewed_at timestamptz not null default clock_timestamp(),
  primary key(season,week,game_id,version), unique(actor_id,request_id),
  foreign key(season,week) references public.gtl_weekly_slates
);

create function public.gtl_review_final_result(p_user uuid,p_body jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; s integer; w integer; g jsonb; request uuid; old public.gtl_reviewed_result_events;
  prior public.gtl_reviewed_result_events; stamp timestamptz; observed timestamptz; expected bigint; result jsonb;
  fields text[]:=array['requestId','season','week','gameId','home','away','source','sourceURL','observedAt','expectedVersion','reason'];
begin
  c:=public.gtl_odds_commissioner(p_user);
  if p_body is null or jsonb_typeof(p_body)<>'object' or not(p_body ?& fields)
    or exists(select 1 from jsonb_object_keys(p_body) k where not(k=any(fields)))
    or jsonb_typeof(p_body->'season') is distinct from 'number' or jsonb_typeof(p_body->'week') is distinct from 'number'
    or (p_body->>'season') !~ '^[0-9]{4}$' or (p_body->>'week') !~ '^[0-9]{1,2}$'
    or jsonb_typeof(p_body->'home') is distinct from 'number' or jsonb_typeof(p_body->'away') is distinct from 'number'
    or (p_body->>'home') !~ '^[0-9]{1,3}$' or (p_body->>'away') !~ '^[0-9]{1,3}$'
    or (p_body->>'home')::numeric>200 or (p_body->>'away')::numeric>200
    or jsonb_typeof(p_body->'expectedVersion') is distinct from 'number' or (p_body->>'expectedVersion') !~ '^[0-9]+$'
    or (p_body->>'expectedVersion')::numeric>=9007199254740990
    or jsonb_typeof(p_body->'source') is distinct from 'string' or length(btrim(p_body->>'source'))<2 or length(p_body->>'source')>120
    or jsonb_typeof(p_body->'sourceURL') is distinct from 'string' or p_body->>'sourceURL' !~ '^https://[^[:space:]@]+$' or length(p_body->>'sourceURL')>2048
    or jsonb_typeof(p_body->'reason') is distinct from 'string' or length(btrim(p_body->>'reason'))<5 or length(p_body->>'reason')>500
    then raise exception 'GTL_RESULT_INPUT'; end if;
  s:=(p_body->>'season')::integer; w:=(p_body->>'week')::integer; expected:=(p_body->>'expectedVersion')::bigint;
  if s<>(c->>'season')::integer or w<>(c->>'week')::integer then raise exception 'GTL_SLATE_CONFLICT'; end if;
  select x into g from jsonb_array_elements(c->'games') x where x->>'id'=p_body->>'gameId';
  if g is null then raise exception 'GTL_RESULT_INPUT'; end if;
  begin request:=(p_body->>'requestId')::uuid; observed:=(p_body->>'observedAt')::timestamptz;
    exception when others then raise exception 'GTL_RESULT_INPUT'; end;
  if request is null or observed is null or not isfinite(observed) then raise exception 'GTL_RESULT_INPUT'; end if;
  -- One small result-review writer lock serializes retries/corrections across games.
  perform singleton from public.gtl_result_review_lock where singleton for update;
  select * into old from public.gtl_reviewed_result_events where actor_id=p_user and request_id=request;
  if old.request_id is not null then
    if old.payload<>p_body then raise exception 'GTL_RESULT_REQUEST_CONFLICT'; end if;
    return jsonb_build_object('season',old.season,'week',old.week,'gameId',old.game_id,'version',old.version,'reviewedAt',old.reviewed_at,'status','final','replayed',true,'verification','Commissioner-reported final; not independently verified');
  end if;
  stamp:=clock_timestamp();
  if observed>stamp or observed<=(g->>'kickoff')::timestamptz or stamp<=(g->>'kickoff')::timestamptz then raise exception 'GTL_RESULT_INPUT'; end if;
  select * into prior from public.gtl_reviewed_result_events where season=s and week=w and game_id=g->>'id' order by version desc limit 1;
  if coalesce(prior.version,0)<>expected then raise exception 'GTL_RESULT_CONFLICT'; end if;
  result:=jsonb_build_object('status','final','home',(p_body->>'home')::integer,'away',(p_body->>'away')::integer,
    'homeTeam',g->>'home','awayTeam',g->>'away','scheduledKickoff',g->>'kickoff','version',expected+1,
    'source',btrim(p_body->>'source'),'sourceURL',p_body->>'sourceURL','observedAt',observed,'reviewedAt',stamp,
    'reviewType','commissioner_reported','verification','Commissioner-reported final; not independently verified');
  insert into public.gtl_reviewed_result_events(season,week,game_id,version,actor_id,request_id,payload,result,previous_result,reviewed_at)
    values(s,w,g->>'id',expected+1,p_user,request,p_body,result,prior.result,stamp);
  return jsonb_build_object('season',s,'week',w,'gameId',g->>'id','version',expected+1,'reviewedAt',stamp,'status','final','replayed',false,'verification','Commissioner-reported final; not independently verified');
end $$;

create function public.gtl_read_reviewed_results(p_user uuid,p_league text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare c jsonb;
begin
  c:=public.gtl_weekly_context(p_user,p_league);
  return jsonb_build_object('season',c->'season','week',c->'week','games',coalesce((
    select jsonb_object_agg(game_id,result) from (select distinct on (e.game_id) e.game_id,e.result
    from public.gtl_reviewed_result_events e where e.season=(c->>'season')::integer and e.week=(c->>'week')::integer
    and exists(select 1 from jsonb_array_elements(c#>'{state,games}') g where g->>'id'=e.game_id)
    order by e.game_id,e.version desc) latest),'{}'));
end $$;

alter table public.gtl_result_review_lock enable row level security;
alter table public.gtl_reviewed_result_events enable row level security;
revoke all on public.gtl_result_review_lock,public.gtl_reviewed_result_events from public,anon,authenticated,service_role;
grant select,update on public.gtl_result_review_lock to service_role;
grant select,insert on public.gtl_reviewed_result_events to service_role;
revoke all on function public.gtl_review_final_result(uuid,jsonb),public.gtl_read_reviewed_results(uuid,text) from public,anon,authenticated;
grant execute on function public.gtl_review_final_result(uuid,jsonb),public.gtl_read_reviewed_results(uuid,text) to service_role;
