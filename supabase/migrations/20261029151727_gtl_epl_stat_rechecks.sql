-- M-33: D-68 Tuesday Sleeper stat rechecks. New service-only append-only evidence; no existing function is replaced.
-- Apply after M-32 through Gate M; nothing is applied by checking in this file. All original snapshots/picks/orders remain.
-- A changed score is recorded as needs_review. Applying a different next-draft order requires the separate confirmed rule.
-- Off switch: disable the existing snapshot schedule. Fix forward only: captured evidence is kept under D-23.

create table if not exists public.gtl_epl_stat_rechecks (
  season integer not null,
  week integer not null,
  original_snapshot_id bigint not null references public.gtl_epl_snapshots(id),
  recheck_snapshot_id bigint not null unique references public.gtl_epl_snapshots(id),
  checked_at timestamptz not null,
  scores_changed boolean not null,
  status text not null check(status in ('unchanged','needs_review')),
  primary key(season,week),
  foreign key(season,week) references public.gtl_epl_weeks(season,week),
  check(original_snapshot_id<>recheck_snapshot_id),
  check((scores_changed and status='needs_review') or (not scores_changed and status='unchanged'))
);
alter table public.gtl_epl_stat_rechecks enable row level security;
revoke all on public.gtl_epl_stat_rechecks from public,anon,authenticated,service_role;
grant select,insert on public.gtl_epl_stat_rechecks to service_role;

create or replace function public.gtl_epl_recheck_due_at(p_last_kickoff timestamptz,p_original_at timestamptz) returns timestamptz
language plpgsql immutable security invoker set search_path='' as $$
declare finished timestamp; due_wall timestamp; days integer;
begin
  if p_last_kickoff is null or p_original_at is null then return null; end if;
  finished:=(p_last_kickoff+interval '150 minutes') at time zone 'America/Los_Angeles';
  days:=(2-extract(isodow from finished)::integer+7)%7;
  due_wall:=date_trunc('day',finished)+days*interval '1 day'+interval '12 hours';
  if due_wall<=finished then due_wall:=due_wall+interval '7 days'; end if;
  return greatest(due_wall at time zone 'America/Los_Angeles',p_original_at+interval '1 hour');
end $$;

-- p_now is the worker's clock (as with M-30 save_pick), never a browser input. Filter due candidates before LIMIT so a
-- newer, not-yet-due round does not hide an older due recheck.
create or replace function public.gtl_epl_recheck_state(p_run uuid,p_claim uuid,p_now timestamptz default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if not exists(select 1 from public.gtl_epl_job_runs where id=p_run and claim_token=p_claim and status='running' and job='snapshot') then
    raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001';
  end if;
  select jsonb_build_object('season',w.season,'week',w.week,'lastKickoff',f.last_kickoff,'originalCapturedAt',s.captured_at)
    into result
    from public.gtl_epl_weeks w
    cross join lateral (select coalesce(max(commence_time) filter(where status<>'postponed'),w.window_start) as last_kickoff
      from public.gtl_epl_fixtures where season=w.season and week=w.week) f
    cross join lateral (select id,captured_at from public.gtl_epl_snapshots where label in ('after-mw'||w.week,'after-mw'||lpad(w.week::text,2,'0'))
      order by captured_at desc,id desc limit 1) s
    where w.status in ('resolved','needs_review','settled') and w.week<38 and f.last_kickoff is not null
      and not exists(select 1 from public.gtl_epl_stat_rechecks r where r.season=w.season and r.week=w.week)
      and public.gtl_epl_recheck_due_at(f.last_kickoff,s.captured_at)<=coalesce(p_now,clock_timestamp())
    order by w.season desc,w.week desc limit 1;
  return result;
end $$;

create or replace function public.gtl_epl_record_recheck(p_run uuid,p_claim uuid,p_season integer,p_week integer,
  p_captured_at timestamptz,p_sha256 jsonb,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare w public.gtl_epl_weeks; original public.gtl_epl_snapshots; existing public.gtl_epl_stat_rechecks;
  capture_id bigint; before_scores jsonb; after_scores jsonb; changed boolean; recheck_label text; last_kickoff timestamptz;
begin
  if not exists(select 1 from public.gtl_epl_job_runs where id=p_run and claim_token=p_claim and status='running' and job='snapshot') then
    raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001';
  end if;
  select * into w from public.gtl_epl_weeks where season=p_season and week=p_week for update;
  if not found or w.status='open' or w.week>=38 then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
  select * into existing from public.gtl_epl_stat_rechecks where season=p_season and week=p_week;
  if found then return jsonb_build_object('scoresChanged',existing.scores_changed,'status',existing.status,'recorded',false); end if;
  select * into original from public.gtl_epl_snapshots where label in ('after-mw'||p_week,'after-mw'||lpad(p_week::text,2,'0'))
    order by captured_at desc,id desc limit 1;
  if not found then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
  select coalesce(max(commence_time) filter(where status<>'postponed'),w.window_start) into last_kickoff
    from public.gtl_epl_fixtures where season=p_season and week=p_week;
  if p_captured_at is null or p_captured_at<=original.captured_at or jsonb_typeof(p_payload->'rosters') is distinct from 'array'
    or p_captured_at<public.gtl_epl_recheck_due_at(last_kickoff,original.captured_at)
    or jsonb_typeof(p_payload->'state'->'week') is distinct from 'number'
    or (p_payload->'state'->>'week')::numeric<>p_week+1
    or (p_payload->'state'->>'season')::integer is distinct from p_season then
    raise exception 'GTL_EPL_INVALID' using errcode='P0001';
  end if;
  if jsonb_typeof(original.payload->'rosters') is distinct from 'array' then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
  -- The two actual season totals must exist as numbers. Optional decimal fields follow seasonPoints/seasonAgainst's
  -- missing/null = 0 rule; a present nonnumeric field is unavailable evidence, never a manufactured zero/correction.
  if exists(select 1 from (
      select value as r from jsonb_array_elements(p_payload->'rosters')
      union all select value as r from jsonb_array_elements(original.payload->'rosters')
    ) rows where jsonb_typeof(r->'settings'->'fpts') is distinct from 'number'
      or jsonb_typeof(r->'settings'->'fpts_against') is distinct from 'number'
      or coalesce(jsonb_typeof(r->'settings'->'fpts_decimal'),'null') not in ('number','null')
      or coalesce(jsonb_typeof(r->'settings'->'fpts_against_decimal'),'null') not in ('number','null')) then
    raise exception 'GTL_EPL_INVALID' using errcode='P0001';
  end if;
  -- Compare only totals used by weeklyScores, not mutable names/lineups. Missing/duplicate/unexpected owners fail closed.
  if (select count(*) from jsonb_array_elements(p_payload->'rosters'))<>cardinality(w.pick_order)
    or (select count(distinct r->>'owner_id') from jsonb_array_elements(p_payload->'rosters') r where r->>'owner_id'=any(w.pick_order))<>cardinality(w.pick_order)
    or (select count(*) from jsonb_array_elements(original.payload->'rosters'))<>cardinality(w.pick_order)
    or (select count(distinct r->>'owner_id') from jsonb_array_elements(original.payload->'rosters') r where r->>'owner_id'=any(w.pick_order))<>cardinality(w.pick_order) then
    raise exception 'GTL_EPL_INVALID' using errcode='P0001';
  end if;
  select jsonb_object_agg(r->>'owner_id',jsonb_build_array(
    floor(((r->'settings'->>'fpts')::numeric+coalesce((r->'settings'->>'fpts_decimal')::numeric,0)/100)*100+0.5)/100,
    floor(((r->'settings'->>'fpts_against')::numeric+coalesce((r->'settings'->>'fpts_against_decimal')::numeric,0)/100)*100+0.5)/100))
    into before_scores from jsonb_array_elements(original.payload->'rosters') r;
  select jsonb_object_agg(r->>'owner_id',jsonb_build_array(
    floor(((r->'settings'->>'fpts')::numeric+coalesce((r->'settings'->>'fpts_decimal')::numeric,0)/100)*100+0.5)/100,
    floor(((r->'settings'->>'fpts_against')::numeric+coalesce((r->'settings'->>'fpts_against_decimal')::numeric,0)/100)*100+0.5)/100))
    into after_scores from jsonb_array_elements(p_payload->'rosters') r;
  changed:=before_scores is distinct from after_scores;
  recheck_label:='after-mw'||p_week||'-recheck';
  insert into public.gtl_epl_snapshots(captured_at,label,week,sha256,payload)
    values(p_captured_at,recheck_label,p_week,p_sha256,p_payload) returning id into capture_id;
  insert into public.gtl_epl_stat_rechecks(season,week,original_snapshot_id,recheck_snapshot_id,checked_at,scores_changed,status)
    values(p_season,p_week,original.id,capture_id,p_captured_at,changed,case when changed then 'needs_review' else 'unchanged' end);
  return jsonb_build_object('scoresChanged',changed,'status',case when changed then 'needs_review' else 'unchanged' end,'recorded',true);
end $$;

revoke all on function public.gtl_epl_recheck_due_at(timestamptz,timestamptz),public.gtl_epl_recheck_state(uuid,uuid,timestamptz),public.gtl_epl_record_recheck(uuid,uuid,integer,integer,timestamptz,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.gtl_epl_recheck_due_at(timestamptz,timestamptz),public.gtl_epl_recheck_state(uuid,uuid,timestamptz),public.gtl_epl_record_recheck(uuid,uuid,integer,integer,timestamptz,jsonb,jsonb) to service_role;
