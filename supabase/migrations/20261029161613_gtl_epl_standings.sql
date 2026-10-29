-- M-34 EPL community standings: private, append-only dated tables and immutable deadline usage.
-- Apply after M-33 in the ledger; no hosted action, schedule row or enablement is performed here.
-- Fix-forward: the job constraint widens. Disable standings to stop collection; keep all evidence and usage rows.
-- Retain the reserved moneyline job too: independent M-36 may be applied first. No row or RPC is required here.
-- Existing five/six jobs and the original resolve writer remain unchanged. All new RPCs are service-only invokers.
-- p_now is a trusted worker clock/test seam, never a client input. Every writer requires a live job claim.

alter table public.gtl_epl_jobs_schedule drop constraint if exists gtl_epl_jobs_schedule_job_check;
alter table public.gtl_epl_jobs_schedule add constraint gtl_epl_jobs_schedule_job_check
  check(job in ('snapshot','fixtures','resolve','settle','nudge','dnb-check','standings','moneyline'));

create table if not exists public.gtl_epl_standings (
  id uuid primary key default gen_random_uuid(),
  season integer not null check(season between 2000 and 2200),
  completed_round integer not null check(completed_round between 1 and 38),
  captured_at timestamptz not null,
  data_as_of date not null,
  source_revision bigint not null check(source_revision>0),
  record jsonb not null check(jsonb_typeof(record)='object' and octet_length(record::text)<=16384),
  created_at timestamptz not null default clock_timestamp(),
  unique(season,completed_round,source_revision,captured_at)
);
create index if not exists gtl_epl_standings_lookup_idx on public.gtl_epl_standings(season,completed_round,captured_at desc,id);
create table if not exists public.gtl_epl_standings_usage (
  season integer not null,
  week integer not null,
  standings_id uuid not null references public.gtl_epl_standings(id),
  run_id uuid not null references public.gtl_epl_job_runs(id),
  used_at timestamptz not null,
  primary key(season,week),
  foreign key(season,week) references public.gtl_epl_weeks(season,week)
);
alter table public.gtl_epl_standings enable row level security;
alter table public.gtl_epl_standings_usage enable row level security;
revoke all on public.gtl_epl_standings,public.gtl_epl_standings_usage from public,anon,authenticated,service_role;
grant select,insert on public.gtl_epl_standings,public.gtl_epl_standings_usage to service_role;

create or replace function public.gtl_epl_standings_valid(p_record jsonb,p_season integer,p_round integer,p_now timestamptz) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare s jsonb:=p_record->'source'; l jsonb:=p_record->'license'; r jsonb; k text; club text; pos integer;
  captured timestamptz; revised timestamptz; dated date; expected_url text; seen text[]:='{}'; ranks integer[]:='{}';
  known text[]:=array['BOU','ARS','AVL','BRE','BHA','CHE','COV','CRY','EVE','FUL','HUL','IPS','LEE','LIV','MNC','MUN','NEW','NFO','SUN','TOT'];
  gf integer:=0; ga integer:=0; wins integer:=0; losses integer:=0; draws integer:=0;
begin
  if p_now is null or p_season is null or p_round is null or p_season not between 2000 and 2200 or p_round not between 1 and 38
    or jsonb_typeof(p_record) is distinct from 'object' or octet_length(p_record::text)>16384
    or jsonb_typeof(p_record->'rows') is distinct from 'array' or jsonb_array_length(p_record->'rows')<>20
    or jsonb_typeof(p_record->'season') is distinct from 'number' or (p_record->>'season')::integer<>p_season
    or jsonb_typeof(p_record->'completedRound') is distinct from 'number' or (p_record->>'completedRound')::integer<>p_round
    or jsonb_typeof(p_record->'matches') is distinct from 'number' or (p_record->>'matches')::integer<>10*p_round then return false; end if;
  if coalesce(p_record->>'capturedAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$'
    or coalesce(p_record->>'dataAsOf','') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(s->>'revisionAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$' then return false; end if;
  captured:=(p_record->>'capturedAt')::timestamptz; revised:=(s->>'revisionAt')::timestamptz; dated:=(p_record->>'dataAsOf')::date;
  if captured>p_now or revised>captured or (dated::timestamp at time zone 'UTC')>captured or captured<p_now-interval '24 hours'
    or (dated::timestamp at time zone 'UTC')<p_now-interval '7 days' or dated<make_date(p_season,7,1) or dated>=make_date(p_season+1,7,1) then return false; end if;
  expected_url:='https://en.wikipedia.org/w/index.php?title='||p_season||'%E2%80%93'||right((p_season+1)::text,2)||'%20Premier%20League&oldid='||(s->>'revision');
  if coalesce(s->>'kind','')<>'wikimedia-community' or s->'official' is distinct from 'false'::jsonb
    or coalesce(s->>'title','')<>p_season||'–'||right((p_season+1)::text,2)||' Premier League'
    or jsonb_typeof(s->'revision') is distinct from 'number' or coalesce(s->>'revision','') !~ '^[1-9][0-9]{0,15}$'
    or (s->>'revision')::numeric>9007199254740991 or s->>'url' is distinct from expected_url
    or coalesce(s->>'responseSha256','') !~ '^[a-f0-9]{64}$' or coalesce(s->>'normalizer','')<>'gtl-epl-wikimedia-v1'
    or coalesce(l->>'id','')<>'CC-BY-SA-4.0' or coalesce(l->>'url','')<>'https://creativecommons.org/licenses/by-sa/4.0/'
    or position('Wikipedia contributors' in coalesce(l->>'attribution',''))=0 or length(coalesce(l->>'changes','')) not between 1 and 1000 then return false; end if;
  for r in select value from jsonb_array_elements(p_record->'rows') loop
    club:=r->>'club';
    if club is null or not (club=any(known)) or club=any(seen) then return false; end if;
    foreach k in array array['position','played','won','drawn','lost','goalsFor','goalsAgainst','points','goalDifference'] loop
      if jsonb_typeof(r->k) is distinct from 'number' or coalesce(r->>k,'') !~ '^-?[0-9]+$' then return false; end if;
    end loop;
    pos:=(r->>'position')::integer;
    if pos not between 1 and 20 or pos=any(ranks) or (r->>'played')::integer<>p_round
      or (r->>'won')::integer not between 0 and 38 or (r->>'drawn')::integer not between 0 and 38 or (r->>'lost')::integer not between 0 and 38
      or (r->>'won')::integer+(r->>'drawn')::integer+(r->>'lost')::integer<>p_round
      or (r->>'points')::integer<>3*(r->>'won')::integer+(r->>'drawn')::integer
      or (r->>'goalsFor')::integer not between 0 and 1000 or (r->>'goalsAgainst')::integer not between 0 and 1000
      or (r->>'goalDifference')::integer<>(r->>'goalsFor')::integer-(r->>'goalsAgainst')::integer then return false; end if;
    seen:=array_append(seen,club); ranks:=array_append(ranks,pos);
    gf:=gf+(r->>'goalsFor')::integer; ga:=ga+(r->>'goalsAgainst')::integer;
    wins:=wins+(r->>'won')::integer; losses:=losses+(r->>'lost')::integer; draws:=draws+(r->>'drawn')::integer;
  end loop;
  if gf<>ga or wins<>losses or draws%2<>0 then return false; end if;
  if exists(with ordered as (select (v->>'position')::integer pos,(v->>'points')::integer pts,(v->>'goalDifference')::integer gd,(v->>'goalsFor')::integer gf
      from jsonb_array_elements(p_record->'rows') v)
    select 1 from ordered a join ordered b on b.pos=a.pos+1 where (b.pts,b.gd,b.gf)>=(a.pts,a.gd,a.gf)) then return false; end if;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format or invalid_parameter_value then return false;
end $$;

-- One optional entry point for both collection (enabled/cache state) and resolution (eligible pre-deadline snapshot).
create or replace function public.gtl_epl_standings_state(p_run uuid,p_claim uuid,p_season integer,p_week integer,p_now timestamptz default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare stamp timestamptz:=coalesce(p_now,clock_timestamp()); w public.gtl_epl_weeks; snap public.gtl_epl_standings;
begin
  if not exists(select 1 from public.gtl_epl_job_runs where id=p_run and claim_token=p_claim and status='running' and job in ('standings','resolve')
    and claimed_at>=clock_timestamp()-interval '10 minutes') then raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001'; end if;
  select * into w from public.gtl_epl_weeks where season=p_season and week=p_week;
  if not found then raise exception 'GTL_EPL_NO_WEEK' using errcode='P0001'; end if;
  select * into snap from public.gtl_epl_standings s where s.season=p_season and s.completed_round=p_week-1
    and s.captured_at<w.first_kickoff and public.gtl_epl_standings_valid(s.record,p_season,p_week-1,stamp)
    order by s.captured_at desc,s.created_at desc,s.id limit 1;
  return jsonb_build_object('enabled',coalesce((select enabled from public.gtl_epl_jobs_schedule where job='standings'),false),
    'snapshot',case when snap.id is null then null else jsonb_build_object('id',snap.id,'record',snap.record) end);
end $$;

create or replace function public.gtl_epl_save_standings(p_run uuid,p_claim uuid,p_season integer,p_week integer,p_record jsonb,p_now timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz:=coalesce(p_now,clock_timestamp()); w public.gtl_epl_weeks; snap public.gtl_epl_standings;
begin
  if not exists(select 1 from public.gtl_epl_job_runs r join public.gtl_epl_jobs_schedule s on s.job=r.job where r.id=p_run and r.claim_token=p_claim
    and r.status='running' and r.job='standings' and s.enabled and r.claimed_at>=clock_timestamp()-interval '10 minutes') then raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001'; end if;
  select * into w from public.gtl_epl_weeks where season=p_season and week=p_week for update;
  if not found then raise exception 'GTL_EPL_NO_WEEK' using errcode='P0001'; end if;
  if w.status<>'open' or stamp>=w.first_kickoff then raise exception 'GTL_EPL_DRAFT_CLOSED' using errcode='P0001'; end if;
  if not public.gtl_epl_standings_valid(p_record,p_season,p_week-1,stamp) then raise exception 'GTL_EPL_STANDINGS_INVALID' using errcode='P0001'; end if;
  insert into public.gtl_epl_standings(season,completed_round,captured_at,data_as_of,source_revision,record)
    values(p_season,p_week-1,(p_record->>'capturedAt')::timestamptz,(p_record->>'dataAsOf')::date,(p_record->'source'->>'revision')::bigint,p_record)
    on conflict(season,completed_round,source_revision,captured_at) do nothing returning * into snap;
  if snap.id is null then
    select * into snap from public.gtl_epl_standings where season=p_season and completed_round=p_week-1
      and captured_at=(p_record->>'capturedAt')::timestamptz and source_revision=(p_record->'source'->>'revision')::bigint;
    if snap.record is distinct from p_record then raise exception 'GTL_EPL_STANDINGS_CONFLICT' using errcode='P0001'; end if;
    return jsonb_build_object('id',snap.id,'saved',false);
  end if;
  return jsonb_build_object('id',snap.id,'saved',true);
end $$;

-- Validate the same dated reference again at use, then resolve and preserve its immutable link in one transaction.
create or replace function public.gtl_epl_resolve_with_standings(p_run uuid,p_claim uuid,p_season integer,p_week integer,p_rows jsonb,p_standings uuid,p_now timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz:=coalesce(p_now,clock_timestamp()); w public.gtl_epl_weeks; snap public.gtl_epl_standings; used public.gtl_epl_standings_usage; result jsonb;
begin
  if not exists(select 1 from public.gtl_epl_job_runs where id=p_run and claim_token=p_claim and status='running' and job='resolve'
    and claimed_at>=clock_timestamp()-interval '10 minutes') then raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001'; end if;
  select * into w from public.gtl_epl_weeks where season=p_season and week=p_week for update;
  if not found then raise exception 'GTL_EPL_NO_WEEK' using errcode='P0001'; end if;
  select * into used from public.gtl_epl_standings_usage where season=p_season and week=p_week;
  if found then
    if used.standings_id is distinct from p_standings then raise exception 'GTL_EPL_STANDINGS_CONFLICT' using errcode='P0001'; end if;
    return jsonb_build_object('season',p_season,'week',p_week,'added',0,'status',w.status,'standingsId',used.standings_id);
  end if;
  if w.status<>'open' or stamp<w.first_kickoff then raise exception 'GTL_EPL_DRAFT_CLOSED' using errcode='P0001'; end if;
  select * into snap from public.gtl_epl_standings s where s.season=p_season and s.completed_round=p_week-1
    and s.captured_at<w.first_kickoff and public.gtl_epl_standings_valid(s.record,p_season,p_week-1,stamp)
    order by s.captured_at desc,s.created_at desc,s.id limit 1;
  if not found then raise exception 'GTL_EPL_STANDINGS_INVALID' using errcode='P0001'; end if;
  if snap.id is distinct from p_standings then raise exception 'GTL_EPL_STANDINGS_CONFLICT' using errcode='P0001'; end if;
  result:=public.gtl_epl_resolve_week(p_season,p_week,p_rows);
  insert into public.gtl_epl_standings_usage(season,week,standings_id,run_id,used_at) values(p_season,p_week,snap.id,p_run,stamp);
  return result||jsonb_build_object('standingsId',snap.id);
end $$;

-- Public-facing attribution only, reached through the authenticated API; no full table, run token or private pick data.
create or replace function public.gtl_epl_standings_provenance(p_season integer,p_week integer) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('kind','wikimedia-community','official',false,'dataAsOf',s.record->>'dataAsOf','capturedAt',s.record->>'capturedAt',
    'source',s.record->'source','license',s.record->'license')
  from public.gtl_epl_standings_usage u join public.gtl_epl_standings s on s.id=u.standings_id where u.season=p_season and u.week=p_week
    and public.gtl_epl_standings_valid(s.record,s.season,s.completed_round,s.captured_at);
$$;

revoke all on function public.gtl_epl_standings_valid(jsonb,integer,integer,timestamptz),public.gtl_epl_standings_state(uuid,uuid,integer,integer,timestamptz),
  public.gtl_epl_save_standings(uuid,uuid,integer,integer,jsonb,timestamptz),public.gtl_epl_resolve_with_standings(uuid,uuid,integer,integer,jsonb,uuid,timestamptz),
  public.gtl_epl_standings_provenance(integer,integer) from public,anon,authenticated;
grant execute on function public.gtl_epl_standings_valid(jsonb,integer,integer,timestamptz),public.gtl_epl_standings_state(uuid,uuid,integer,integer,timestamptz),
  public.gtl_epl_save_standings(uuid,uuid,integer,integer,jsonb,timestamptz),public.gtl_epl_resolve_with_standings(uuid,uuid,integer,integer,jsonb,uuid,timestamptz),
  public.gtl_epl_standings_provenance(integer,integer) to service_role;
