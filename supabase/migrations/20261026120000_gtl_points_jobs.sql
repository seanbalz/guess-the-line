-- D-56 P-03: the scheduled jobs for Guess the Points (slate draft and publish, actuals load, finalize), on main's P-01
-- (20261023180000_gtl_points_core.sql). NOT APPLIED: written, merged only as a file, and it waits for Sean's "apply P-03".
-- Additive only: new tables and functions; no existing object changes, so there is no rollback file.
--
-- Dispatch follows the D-24 week-open job (20261009150000_gtl_auto_open_week.sql): pg_cron runs gtl_dispatch_points_jobs(),
-- which queues one run per clock hour and posts its id plus a one-run capability (five minutes, this run only) to the
-- gtl-points-jobs Edge function through pg_net. The worker claims the run, does its steps through the existing P-01 writers
-- (gtl_points_publish_slate, gtl_points_load_actuals, gtl_points_finalize) and completes the run. This migration creates no
-- cron job, credential, Vault row or extension; the only pg_net call is inside the dispatcher, which cron runs.
--
-- Off switch: update public.gtl_points_job_schedule set enabled=false  (a hosted change Sean approves). Runs stay (D-23).

create table public.gtl_points_job_schedule (
  id text primary key check(id='nfl-points'), enabled boolean not null default false,
  endpoint text not null check(endpoint ~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/gtl-points-jobs$'),
  created_at timestamptz not null default now()
);
create table public.gtl_points_job_runs (
  id uuid primary key default gen_random_uuid(), schedule_id text not null references public.gtl_points_job_schedule(id),
  slot_start timestamptz not null, created_at timestamptz not null default clock_timestamp(),
  capability_hash text not null check(capability_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'queued' check(status in ('queued','running','succeeded','skipped','failed')),
  reason text check(reason in ('nothing_due','source_unavailable','load_failed','worker_error','worker_timeout','dispatch_unavailable')),
  summary jsonb check(summary is null or jsonb_typeof(summary)='object'),
  claim_token uuid, claimed_at timestamptz, finished_at timestamptz,
  unique(schedule_id,slot_start)
);

-- ADMIN ONLY: pg_net must be enabled beforehand. The queued token authorizes just this existing run, for five minutes; it is
-- never a reusable credential. One run per clock hour: the several cron registrations (supabase/admin/points_jobs_cron.sql)
-- fall in different hours, and every step in the worker is idempotent and safe at any time.
create function public.gtl_dispatch_points_jobs() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg public.gtl_points_job_schedule; run public.gtl_points_job_runs; token text; stamp timestamptz:=clock_timestamp(); net_id bigint;
begin
  select * into cfg from public.gtl_points_job_schedule where id='nfl-points' for update;
  stamp:=clock_timestamp();
  if not found or not cfg.enabled then return jsonb_build_object('status','disabled'); end if;
  update public.gtl_points_job_runs set status='failed',reason='worker_timeout',finished_at=stamp
    where schedule_id=cfg.id and status in ('queued','running') and coalesce(claimed_at,created_at)<stamp-interval '10 minutes';
  token:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  insert into public.gtl_points_job_runs(schedule_id,slot_start,capability_hash)
    values(cfg.id,date_bin(interval '1 hour',stamp,timestamptz '2000-01-01 00:00:00+00'),encode(sha256(convert_to(token,'UTF8')),'hex'))
    on conflict(schedule_id,slot_start) do nothing returning * into run;
  if not found then return jsonb_build_object('status','already_dispatched'); end if;
  begin
    select net.http_post(url:=cfg.endpoint,body:=jsonb_build_object('runId',run.id),
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),timeout_milliseconds:=60000) into net_id;
  exception when others then
    update public.gtl_points_job_runs set status='failed',reason='dispatch_unavailable',finished_at=clock_timestamp() where id=run.id;
    return jsonb_build_object('status','failed','reason','dispatch_unavailable');
  end;
  return jsonb_build_object('status','queued','runId',run.id);
end $$;

create function public.gtl_claim_points_jobs(p_token text,p_run uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg public.gtl_points_job_schedule; run public.gtl_points_job_runs; stamp timestamptz:=clock_timestamp(); claim uuid;
begin
  select * into cfg from public.gtl_points_job_schedule where id='nfl-points';
  if not found or not cfg.enabled or p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'GTL_SCHEDULE_AUTH'; end if;
  select * into run from public.gtl_points_job_runs where id=p_run and schedule_id=cfg.id for update;
  stamp:=clock_timestamp();
  -- Authenticate against this exact private run BEFORE returning even a replay.
  if not found or encode(sha256(convert_to(p_token,'UTF8')),'hex') is distinct from run.capability_hash
    or run.slot_start<>date_bin(interval '1 hour',stamp,timestamptz '2000-01-01 00:00:00+00')
    or run.created_at<stamp-interval '5 minutes' or run.created_at>stamp then raise exception 'GTL_SCHEDULE_AUTH'; end if;
  if run.status<>'queued' then return jsonb_build_object('replay',true,'runId',run.id,'status',run.status,'reason',run.reason); end if;
  claim:=gen_random_uuid();
  update public.gtl_points_job_runs set status='running',claim_token=claim,claimed_at=stamp where id=run.id;
  return jsonb_build_object('replay',false,'runId',run.id,'claim',claim,'now',stamp);
end $$;

-- A null reason means the worker did its steps; nothing_due is a safe no-op (skipped); the other named reasons are failures
-- the administrator should look at. The summary is an object of counts and step outcomes (at most 4 KB), never player data.
create function public.gtl_complete_points_jobs(p_run uuid,p_claim uuid,p_reason text,p_summary jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare run public.gtl_points_job_runs; state text;
begin
  select * into run from public.gtl_points_job_runs where id=p_run for update;
  if not found or p_claim is null or run.claim_token is distinct from p_claim then raise exception 'GTL_SCHEDULE_RUN'; end if;
  if run.status<>'running' then return jsonb_build_object('runId',run.id,'status',run.status,'reason',run.reason); end if;
  if run.claimed_at<clock_timestamp()-interval '10 minutes' then raise exception 'GTL_SCHEDULE_EXPIRED'; end if;
  state:=case when p_reason is null then 'succeeded'
    when p_reason='nothing_due' then 'skipped'
    when p_reason in ('source_unavailable','load_failed','worker_error','worker_timeout','dispatch_unavailable') then 'failed' end;
  if state is null then raise exception 'GTL_SCHEDULE_RUN'; end if;
  if p_summary is not null and (jsonb_typeof(p_summary)<>'object' or char_length(p_summary::text)>4096) then raise exception 'GTL_SCHEDULE_RUN'; end if;
  update public.gtl_points_job_runs set status=state,reason=p_reason,summary=p_summary,finished_at=clock_timestamp() where id=run.id;
  return jsonb_build_object('runId',run.id,'status',state,'reason',p_reason);
end $$;

-- Service-only read for the worker: what is stored for each slate of a season, so it knows what to draft, publish, load and
-- finalize. Slots are the public slate shape. It never returns guesses, members, House values, provenance or audit.
create function public.gtl_points_jobs_state(p_season integer) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if p_season is null or p_season not between 2000 and 2200 then raise exception 'GTL_POINTS_INVALID'; end if;
  return jsonb_build_object('season',p_season,'slates',coalesce((
    select jsonb_agg(jsonb_build_object('week',s.week,'status',s.status,'opensAt',s.opens_at,'finalizeAt',s.finalize_at,
      'final',exists(select 1 from public.gtl_points_week_final f where f.season=s.season and f.week=s.week),
      'firstKickoff',(select min((x->>'kickoff')::timestamptz) from jsonb_array_elements(s.slots) x),
      'rulesVersion',s.scoring_rules->>'version',
      'slots',(select jsonb_agg(jsonb_build_object('slot',x->>'slot','playerId',x->>'playerId','name',x->>'name','team',x->>'team',
        'position',x->>'position','gameKey',x->>'gameKey','kickoff',x->>'kickoff') order by o) from jsonb_array_elements(s.slots) with ordinality t(x,o))) order by s.week)
    from public.gtl_points_slates s where s.season=p_season),'[]'::jsonb));
end $$;

alter table public.gtl_points_job_schedule enable row level security;
alter table public.gtl_points_job_runs enable row level security;
revoke all on public.gtl_points_job_schedule,public.gtl_points_job_runs from public,anon,authenticated,service_role;
grant select on public.gtl_points_job_schedule,public.gtl_points_job_runs to service_role;
grant update(status,reason,summary,claim_token,claimed_at,finished_at) on public.gtl_points_job_runs to service_role;
revoke all on function public.gtl_dispatch_points_jobs(),public.gtl_claim_points_jobs(text,uuid),
  public.gtl_complete_points_jobs(uuid,uuid,text,jsonb),public.gtl_points_jobs_state(integer) from public,anon,authenticated,service_role;
grant execute on function public.gtl_claim_points_jobs(text,uuid),public.gtl_complete_points_jobs(uuid,uuid,text,jsonb),
  public.gtl_points_jobs_state(integer) to service_role;
