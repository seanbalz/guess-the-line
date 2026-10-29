-- M-35: corrected order only before any next-week pick/deadline; append-only outcomes preserve M-33 evidence.
-- Also shares a durable result-read envelope between snapshot/settle: 12h cooldown, max8 reservations x2 credits/week.
-- Pending Gate M. Requires M-33; no existing function/table is replaced. No schedules enabled or hosted action here.
-- Off switch: existing snapshot/settle schedules. Preserve these records (D-23); fix forward, never delete evidence.

create table if not exists public.gtl_epl_order_corrections (
  recheck_snapshot_id bigint primary key references public.gtl_epl_snapshots(id),
  season integer not null,
  week integer not null,
  outcome text not null check(outcome in ('applied','same_order','preserved_picks','preserved_closed')),
  previous_order text[] not null,
  candidate_order text[],
  baseline_snapshot_id bigint references public.gtl_epl_snapshots(id),
  recorded_at timestamptz not null,
  foreign key(season,week) references public.gtl_epl_weeks(season,week),
  check((outcome in ('applied','same_order') and candidate_order is not null and baseline_snapshot_id is not null)
    or (outcome in ('preserved_picks','preserved_closed') and candidate_order is null)),
  check(outcome<>'applied' or previous_order<>candidate_order),
  check(outcome<>'same_order' or previous_order=candidate_order)
);
create table if not exists public.gtl_epl_result_reads (
  run_id uuid primary key references public.gtl_epl_job_runs(id),
  season integer not null,
  week integer not null,
  reserved_at timestamptz not null,
  credits integer not null default 2 check(credits=2),
  foreign key(season,week) references public.gtl_epl_weeks(season,week)
);
create index if not exists gtl_epl_result_reads_week_idx on public.gtl_epl_result_reads(season,week,reserved_at desc);
create table if not exists public.gtl_epl_capture_intervals (
  id uuid primary key default gen_random_uuid(),
  season integer not null,
  week integer not null,
  next_week integer not null,
  next_kickoff timestamptz not null,
  verified_at timestamptz not null,
  admitted_at timestamptz not null default clock_timestamp(),
  verified_by uuid not null references auth.users(id),
  schedule_sha256 text not null check(schedule_sha256 ~ '^[a-f0-9]{64}$'),
  reference text not null check(length(reference)<=2048 and reference ~ '^https://[^/?#@]+/[^?#]*$'),
  coverage_complete boolean not null check(coverage_complete),
  source text not null default 'commissioner_verified_schedule' check(source='commissioner_verified_schedule'),
  foreign key(season,week) references public.gtl_epl_weeks(season,week),
  check(next_week=week+1),check(verified_at<next_kickoff),unique(season,week,schedule_sha256,next_kickoff)
);
alter table public.gtl_epl_order_corrections enable row level security;
alter table public.gtl_epl_result_reads enable row level security;
alter table public.gtl_epl_capture_intervals enable row level security;
revoke all on public.gtl_epl_order_corrections,public.gtl_epl_result_reads,public.gtl_epl_capture_intervals from public,anon,authenticated,service_role;
grant select,insert on public.gtl_epl_order_corrections,public.gtl_epl_result_reads,public.gtl_epl_capture_intervals to service_role;

-- Explicit operator admission only. Not exposed by gtl-api or the worker allowlist; no attestation is invented/seeded.
create or replace function public.gtl_epl_attest_capture_interval(p_by uuid,p_season integer,p_week integer,p_next_week integer,
  p_next_kickoff timestamptz,p_verified_at timestamptz,p_schedule_sha256 text,p_reference text,p_coverage_complete boolean) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  if p_by is null or public.gtl_community_admin(p_by) is distinct from true then raise exception 'GTL_EPL_FORBIDDEN' using errcode='P0001'; end if;
  if p_next_week is distinct from p_week+1 or p_coverage_complete is distinct from true or p_next_kickoff is null or p_verified_at is null
    or p_verified_at>=p_next_kickoff or p_verified_at>clock_timestamp() then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
  insert into public.gtl_epl_capture_intervals(season,week,next_week,next_kickoff,verified_at,verified_by,schedule_sha256,reference,coverage_complete)
    values(p_season,p_week,p_next_week,p_next_kickoff,p_verified_at,p_by,p_schedule_sha256,p_reference,p_coverage_complete) on conflict do nothing;
  get diagnostics n=row_count; return n>0;
end $$;

create or replace function public.gtl_epl_capture_interval(p_run uuid,p_claim uuid,p_season integer,p_week integer) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if not exists(select 1 from public.gtl_epl_job_runs where id=p_run and claim_token=p_claim and status='running' and job='snapshot') then
    raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001'; end if;
  -- The earliest attested bound is conservative; a later record never silently extends the capture interval.
  select jsonb_build_object('nextKickoff',next_kickoff,'verifiedAt',verified_at,'scheduleSha256',schedule_sha256,'source',source)
    into result from public.gtl_epl_capture_intervals where season=p_season and week=p_week and coverage_complete
      and next_week=p_week+1 order by next_kickoff,verified_at limit 1;
  return result;
end $$;

create or replace function public.gtl_epl_reserve_result_read(p_run uuid,p_claim uuid,p_season integer,p_week integer,p_now timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz:=coalesce(p_now,clock_timestamp()); last_read timestamptz; used integer; reservation jsonb;
begin
  if not exists(select 1 from public.gtl_epl_job_runs where id=p_run and claim_token=p_claim and status='running' and job in ('snapshot','settle')) then
    raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001';
  end if;
  -- Same week lock serializes both jobs before consulting the shared cooldown/cap and the provider budget.
  perform 1 from public.gtl_epl_weeks where season=p_season and week=p_week for update;
  if not found then raise exception 'GTL_EPL_NO_WEEK' using errcode='P0001'; end if;
  if exists(select 1 from public.gtl_epl_result_reads where run_id=p_run) then return jsonb_build_object('ok',false,'reason','already_reserved'); end if;
  select count(*),max(reserved_at) into used,last_read from public.gtl_epl_result_reads where season=p_season and week=p_week;
  if used>=8 then return jsonb_build_object('ok',false,'reason','limit'); end if;
  if last_read is not null and stamp<last_read+interval '12 hours' then return jsonb_build_object('ok',false,'reason','cooldown'); end if;
  reservation:=public.gtl_epl_reserve_credits(p_run,p_claim,2);
  if reservation->'ok' is distinct from 'true'::jsonb then
    return jsonb_build_object('ok',false,'reason',case when reservation->>'remaining' is null then 'budget_unknown' else 'budget_guard' end);
  end if;
  insert into public.gtl_epl_result_reads(run_id,season,week,reserved_at) values(p_run,p_season,p_week,stamp);
  return jsonb_build_object('ok',true,'remaining',reservation->'remaining','reservations',used+1);
end $$;

create or replace function public.gtl_epl_apply_recheck_orders(p_run uuid,p_claim uuid,p_now timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item record; w public.gtl_epl_weeks; nxt public.gtl_epl_weeks; corrected public.gtl_epl_snapshots; baseline public.gtl_epl_snapshots;
  stamp timestamptz:=coalesce(p_now,clock_timestamp()); before_points jsonb; after_points jsonb; wanted text[]; cutoff timestamptz;
  applied integer:=0; same_count integer:=0; preserved integer:=0; pending integer:=0; outcome text;
begin
  if not exists(select 1 from public.gtl_epl_job_runs where id=p_run and claim_token=p_claim and status='running' and job='snapshot') then
    raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001';
  end if;
  for item in select r.* from public.gtl_epl_stat_rechecks r where r.scores_changed and r.status='needs_review'
      and not exists(select 1 from public.gtl_epl_order_corrections a where a.recheck_snapshot_id=r.recheck_snapshot_id)
      order by r.season,r.week limit 38 loop
    select * into w from public.gtl_epl_weeks where season=item.season and week=item.week for update;
    if exists(select 1 from public.gtl_epl_order_corrections where recheck_snapshot_id=item.recheck_snapshot_id) then continue; end if;
    if w.status<>'settled' then pending:=pending+1; continue; end if; -- bonus is not yet verified/final
    select * into nxt from public.gtl_epl_weeks where season=item.season and week=item.week+1 for update;
    if not found then pending:=pending+1; continue; end if;
    select min(next_kickoff) into cutoff from public.gtl_epl_capture_intervals where season=item.season and week=item.week and next_week=item.week+1 and coverage_complete;
    -- save_pick locks this exact row too: either its pick wins first, or it observes the corrected order afterwards.
    outcome:=null;
    if exists(select 1 from public.gtl_epl_picks where season=nxt.season and week=nxt.week) then outcome:='preserved_picks';
    elsif nxt.status<>'open' or stamp>=nxt.first_kickoff or stamp>=cutoff then outcome:='preserved_closed'; end if;
    if outcome is not null then
      insert into public.gtl_epl_order_corrections(recheck_snapshot_id,season,week,outcome,previous_order,recorded_at)
        values(item.recheck_snapshot_id,item.season,item.week,outcome,nxt.pick_order,stamp) on conflict do nothing;
      preserved:=preserved+1; continue;
    end if;
    select * into corrected from public.gtl_epl_snapshots where id=item.recheck_snapshot_id;
    if cutoff is null or corrected.captured_at>=cutoff then pending:=pending+1; continue; end if;
    select * into baseline from public.gtl_epl_snapshots where payload->'state'->>'season'=w.season::text and label in ('after-mw'||(w.week-1),'after-mw'||lpad((w.week-1)::text,2,'0'),'after-mw'||(w.week-1)||'-recheck')
      order by (label like '%-recheck') desc,captured_at desc,id desc limit 1;
    if not found or baseline.captured_at>=corrected.captured_at
      or baseline.payload->'state'->>'season' is distinct from w.season::text
      or corrected.payload->'state'->>'season' is distinct from w.season::text
      or jsonb_typeof(baseline.payload->'state'->'week') is distinct from 'number'
      or jsonb_typeof(corrected.payload->'state'->'week') is distinct from 'number'
      or (baseline.payload->'state'->>'week')::numeric<>w.week
      or (corrected.payload->'state'->>'week')::numeric<>w.week+1
      or jsonb_typeof(baseline.payload->'rosters') is distinct from 'array'
      or jsonb_typeof(corrected.payload->'rosters') is distinct from 'array'
      or cardinality(nxt.pick_order)<>cardinality(w.pick_order)
      or (select count(distinct owner) from unnest(nxt.pick_order) as owners(owner))<>cardinality(w.pick_order)
      or exists(select unnest(nxt.pick_order) except select unnest(w.pick_order)) then
      pending:=pending+1; continue;
    end if;
    if exists(select 1 from (select baseline.payload as payload union all select corrected.payload) s
      where jsonb_array_length(s.payload->'rosters')<>cardinality(w.pick_order)
        or (select count(distinct r->>'owner_id') from jsonb_array_elements(s.payload->'rosters') r where r->>'owner_id'=any(w.pick_order))<>cardinality(w.pick_order))
      or exists(select 1 from (select value as r from jsonb_array_elements(baseline.payload->'rosters')
        union all select value from jsonb_array_elements(corrected.payload->'rosters')) records
        where jsonb_typeof(r->'settings'->'fpts') is distinct from 'number' or jsonb_typeof(r->'settings'->'fpts_against') is distinct from 'number'
          or coalesce(jsonb_typeof(r->'settings'->'fpts_decimal'),'null') not in ('number','null')
          or coalesce(jsonb_typeof(r->'settings'->'fpts_against_decimal'),'null') not in ('number','null')) then
      pending:=pending+1; continue;
    end if;
    select jsonb_object_agg(r->>'owner_id',floor(((r->'settings'->>'fpts')::numeric+coalesce((r->'settings'->>'fpts_decimal')::numeric,0)/100)*100+0.5)/100)
      into before_points from jsonb_array_elements(baseline.payload->'rosters') r;
    select jsonb_object_agg(r->>'owner_id',floor(((r->'settings'->>'fpts')::numeric+coalesce((r->'settings'->>'fpts_decimal')::numeric,0)/100)*100+0.5)/100)
      into after_points from jsonb_array_elements(corrected.payload->'rosters') r;
    -- Match the JS engine's whole-cent safe-number domain; corrupt extremes remain pending instead of ordering Infinity.
    if exists(select 1 from unnest(w.pick_order) as owners(owner) where
      abs(((after_points->>owner)::numeric-(before_points->>owner)::numeric)*100
        +coalesce((select b.points from public.gtl_epl_bonus b where b.season=w.season and b.week=w.week and b.owner_id=owner),0)*100)>9007199254740991
      or abs((after_points->>owner)::numeric*100+coalesce((select sum(b.points) from public.gtl_epl_bonus b where b.season=w.season and b.week<=w.week and b.owner_id=owner),0)*100)>9007199254740991) then
      pending:=pending+1; continue;
    end if;
    select array_agg(owner order by ((after_points->>owner)::numeric-(before_points->>owner)::numeric)*100
        +coalesce((select b.points from public.gtl_epl_bonus b where b.season=w.season and b.week=w.week and b.owner_id=owner),0)*100,
      (after_points->>owner)::numeric*100+coalesce((select sum(b.points) from public.gtl_epl_bonus b where b.season=w.season and b.week<=w.week and b.owner_id=owner),0)*100,
      owner collate "C") into wanted from unnest(w.pick_order) as owners(owner);
    outcome:=case when wanted is distinct from nxt.pick_order then 'applied' else 'same_order' end;
    insert into public.gtl_epl_order_corrections(recheck_snapshot_id,season,week,outcome,previous_order,candidate_order,baseline_snapshot_id,recorded_at)
      values(item.recheck_snapshot_id,item.season,item.week,outcome,nxt.pick_order,wanted,baseline.id,stamp);
    if outcome='applied' then
      update public.gtl_epl_weeks set pick_order=wanted where season=nxt.season and week=nxt.week;
      applied:=applied+1;
    else same_count:=same_count+1; end if;
  end loop;
  return jsonb_build_object('applied',applied,'sameOrder',same_count,'preserved',preserved,'pending',pending);
end $$;

create or replace function public.gtl_epl_order_correction_state(p_season integer) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('week',week,'outcome',outcome) order by week),'[]'::jsonb)
    from public.gtl_epl_order_corrections where season=p_season;
$$;
revoke all on function public.gtl_epl_reserve_result_read(uuid,uuid,integer,integer,timestamptz),public.gtl_epl_apply_recheck_orders(uuid,uuid,timestamptz),public.gtl_epl_order_correction_state(integer),
  public.gtl_epl_capture_interval(uuid,uuid,integer,integer),public.gtl_epl_attest_capture_interval(uuid,integer,integer,integer,timestamptz,timestamptz,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.gtl_epl_reserve_result_read(uuid,uuid,integer,integer,timestamptz),public.gtl_epl_apply_recheck_orders(uuid,uuid,timestamptz),public.gtl_epl_order_correction_state(integer),
  public.gtl_epl_capture_interval(uuid,uuid,integer,integer),public.gtl_epl_attest_capture_interval(uuid,integer,integer,integer,timestamptz,timestamptz,text,text,boolean) to service_role;
