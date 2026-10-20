-- Authorized automatic NFL finals refresh. Disabled until worker and dry run verified.
-- Uses the existing D-26 versioned ledger; does not activate unbuilt friend challenges.
create table public.gtl_results_refresh_schedule (
  id text primary key check(id='nfl-results'), enabled boolean not null default false,
  endpoint text not null check(endpoint ~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/gtl-results-refresh$'),
  authorized_by uuid not null references auth.users(id),
  season integer not null check(season between 2000 and 2200),
  created_at timestamptz not null default now()
);
create index gtl_results_refresh_schedule_actor_idx on public.gtl_results_refresh_schedule(authorized_by);
create table public.gtl_results_refresh_runs (
  id uuid primary key default gen_random_uuid(), schedule_id text not null references public.gtl_results_refresh_schedule(id),
  slot_start timestamptz not null, created_at timestamptz not null default clock_timestamp(),
  capability_hash text not null check(capability_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'queued' check(status in ('queued','running','succeeded','skipped','failed')),
  reason text check(reason in ('already_published','not_open_yet','no_upcoming_week','schedule_unavailable','invalid_results','commissioner_unavailable','settlement_failed','worker_timeout','dispatch_unavailable')),
  claim_token uuid, claimed_at timestamptz, finished_at timestamptz,
  unique(schedule_id,slot_start)
);

-- ADMIN ONLY: pg_net must be enabled beforehand. The queued token authorizes
-- just this existing run, for five minutes; it is never a reusable credential.
-- One dispatch per half-hour slot, with a five-minute single-run capability.
create function public.gtl_dispatch_results_refresh() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg public.gtl_results_refresh_schedule; run public.gtl_results_refresh_runs; token text; stamp timestamptz:=clock_timestamp(); net_id bigint;
begin
  select * into cfg from public.gtl_results_refresh_schedule where id='nfl-results' for update;
  stamp:=clock_timestamp();
  if not found or not cfg.enabled then return jsonb_build_object('status','disabled'); end if;
  update public.gtl_results_refresh_runs set status='failed',reason='worker_timeout',finished_at=stamp
    where schedule_id=cfg.id and status in ('queued','running') and coalesce(claimed_at,created_at)<stamp-interval '10 minutes';
  token:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  insert into public.gtl_results_refresh_runs(schedule_id,slot_start,capability_hash)
    values(cfg.id,date_bin(interval '30 minutes',stamp,timestamptz '2000-01-01 00:00:00+00'),encode(sha256(convert_to(token,'UTF8')),'hex'))
    on conflict(schedule_id,slot_start) do nothing returning * into run;
  if not found then return jsonb_build_object('status','already_dispatched'); end if;
  begin
    select net.http_post(url:=cfg.endpoint,body:=jsonb_build_object('runId',run.id),
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),timeout_milliseconds:=60000) into net_id;
  exception when others then
    update public.gtl_results_refresh_runs set status='failed',reason='dispatch_unavailable',finished_at=clock_timestamp() where id=run.id;
    return jsonb_build_object('status','failed','reason','dispatch_unavailable');
  end;
  return jsonb_build_object('status','queued','runId',run.id);
end $$;

create function public.gtl_claim_results_refresh(p_token text,p_run uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg public.gtl_results_refresh_schedule; run public.gtl_results_refresh_runs; stamp timestamptz:=clock_timestamp(); claim uuid;
begin
  select * into cfg from public.gtl_results_refresh_schedule where id='nfl-results';
  if not found or not cfg.enabled or p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'GTL_SCHEDULE_AUTH'; end if;
  select * into run from public.gtl_results_refresh_runs where id=p_run and schedule_id=cfg.id for update;
  stamp:=clock_timestamp();
  -- Authenticate against this exact private run BEFORE returning even a replay.
  if not found or encode(sha256(convert_to(p_token,'UTF8')),'hex') is distinct from run.capability_hash
    or run.slot_start<>date_bin(interval '30 minutes',stamp,timestamptz '2000-01-01 00:00:00+00')
    or run.created_at<stamp-interval '5 minutes' or run.created_at>stamp then raise exception 'GTL_SCHEDULE_AUTH'; end if;
  if run.status<>'queued' then return jsonb_build_object('replay',true,'runId',run.id,'status',run.status,'reason',run.reason); end if;
  if not public.gtl_community_admin(cfg.authorized_by) then
    update public.gtl_results_refresh_runs set status='skipped',reason='commissioner_unavailable',finished_at=stamp where id=run.id;
    return jsonb_build_object('replay',true,'runId',run.id,'status','skipped','reason','commissioner_unavailable');
  end if;
  claim:=gen_random_uuid();
  update public.gtl_results_refresh_runs set status='running',claim_token=claim,claimed_at=stamp where id=run.id;
  return jsonb_build_object('replay',false,'runId',run.id,'claim',claim,'actorId',cfg.authorized_by,'season',cfg.season,'now',stamp,'scopes',(select coalesce(jsonb_agg(jsonb_build_object('season',s.season,'week',s.week) order by s.week),'[]') from public.gtl_weekly_slates s where s.season=cfg.season and exists(select 1 from jsonb_array_elements(s.signature->'games') g where to_timestamp((g->>'kickoff')::double precision)<stamp)));
end $$;

-- A null reason means the worker finished checking and settling all published weeks; reasons record
-- a safe no-op (skipped) or a failure the administrator should look at.
create function public.gtl_complete_results_refresh(p_run uuid,p_claim uuid,p_reason text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare run public.gtl_results_refresh_runs; state text;
begin
  select * into run from public.gtl_results_refresh_runs where id=p_run for update;
  if not found or p_claim is null or run.claim_token is distinct from p_claim then raise exception 'GTL_SCHEDULE_RUN'; end if;
  if run.status<>'running' then return jsonb_build_object('runId',run.id,'status',run.status,'reason',run.reason); end if;
  if run.claimed_at<clock_timestamp()-interval '10 minutes' then raise exception 'GTL_SCHEDULE_EXPIRED'; end if;
  state:=case when p_reason is null then 'succeeded'
    when p_reason in ('already_published','not_open_yet','no_upcoming_week','commissioner_unavailable') then 'skipped'
    when p_reason in ('schedule_unavailable','invalid_results','settlement_failed') then 'failed' end;
  if state is null then raise exception 'GTL_SCHEDULE_RUN'; end if;
  update public.gtl_results_refresh_runs set status=state,reason=p_reason,finished_at=clock_timestamp() where id=run.id;
  return jsonb_build_object('runId',run.id,'status',state,'reason',p_reason);
end $$;


alter table public.gtl_results_refresh_schedule enable row level security;
alter table public.gtl_results_refresh_runs enable row level security;
revoke all on public.gtl_results_refresh_schedule,public.gtl_results_refresh_runs from public,anon,authenticated,service_role;
grant select on public.gtl_results_refresh_schedule,public.gtl_results_refresh_runs to service_role;
grant update(status,reason,claim_token,claimed_at,finished_at) on public.gtl_results_refresh_runs to service_role;
revoke all on function public.gtl_dispatch_results_refresh(),public.gtl_claim_results_refresh(text,uuid),public.gtl_complete_results_refresh(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.gtl_claim_results_refresh(text,uuid),public.gtl_complete_results_refresh(uuid,uuid,text) to service_role;
