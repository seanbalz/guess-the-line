-- M-26 features_schedule (redesign build plan stage 70). A disabled schedule for the features job (M-25): every 15 minutes a
-- dispatcher queues one run with a single-use capability and calls the gtl-league-features Edge function, which claims the run,
-- runs the same code as the commissioner's POST /league/features/run (cloud/features.mjs runFeatures, trigger 'schedule') and
-- completes it. The pattern is the results refresh schedule's (20261020211656) and gtl-week-open's.
--
-- * gtl_features_schedule: one row, 'league-features', enabled false. Nothing in this file inserts it; Sean's admin script
--   supabase/admin/league_features_cron.sql adds it disabled, and he enables it and registers the cron only after a live dry run.
-- * gtl_features_schedule_runs: one row per 15-minute slot; the token is stored only as its sha256 and works for that run, for
--   five minutes. A run left queued or running for 10 minutes is failed by the next dispatch (worker_timeout).
-- * gtl_dispatch_league_features(): cron only (no grant to any API role). gtl_claim_league_features and
--   gtl_complete_league_features: service role only, for the worker.
-- The worker records nothing itself: gtl_record_feature_results (M-25) is the one writer, keyed by this run's id, so a retried
-- run replays. Apply after M-25. Rerunnable: tables and indexes only if missing, create or replace with these exact argument
-- lists, every grant restated. Rollback: set enabled false (the admin script's last line); every run row stays. No hosted
-- action is performed by this file.

create table if not exists public.gtl_features_schedule (
  id text primary key check(id='league-features'),
  enabled boolean not null default false,
  endpoint text not null check(endpoint ~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/gtl-league-features$'),
  authorized_by uuid not null references auth.users(id),
  season integer not null check(season between 2000 and 2200),
  created_at timestamptz not null default now()
);
create index if not exists gtl_features_schedule_actor_idx on public.gtl_features_schedule(authorized_by);
create table if not exists public.gtl_features_schedule_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id text not null references public.gtl_features_schedule(id),
  slot_start timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  capability_hash text not null check(capability_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'queued' check(status in ('queued','running','succeeded','skipped','failed')),
  reason text check(reason in ('no_season','commissioner_unavailable','features_failed','worker_timeout','dispatch_unavailable')),
  claim_token uuid, claimed_at timestamptz, finished_at timestamptz,
  unique(schedule_id,slot_start)
);

-- ADMIN ONLY (pg_cron): pg_net must be enabled beforehand. One dispatch per 15-minute slot.
create or replace function public.gtl_dispatch_league_features() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg public.gtl_features_schedule; run public.gtl_features_schedule_runs; token text; stamp timestamptz; net_id bigint;
begin
  select * into cfg from public.gtl_features_schedule where id='league-features' for update;
  stamp:=clock_timestamp();
  if not found or not cfg.enabled then return jsonb_build_object('status','disabled'); end if;
  update public.gtl_features_schedule_runs set status='failed',reason='worker_timeout',finished_at=stamp
    where schedule_id=cfg.id and status in ('queued','running') and coalesce(claimed_at,created_at)<stamp-interval '10 minutes';
  token:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  insert into public.gtl_features_schedule_runs(schedule_id,slot_start,capability_hash)
    values(cfg.id,date_bin(interval '15 minutes',stamp,timestamptz '2000-01-01 00:00:00+00'),encode(sha256(convert_to(token,'UTF8')),'hex'))
    on conflict(schedule_id,slot_start) do nothing returning * into run;
  if not found then return jsonb_build_object('status','already_dispatched'); end if;
  begin
    select net.http_post(url:=cfg.endpoint,body:=jsonb_build_object('runId',run.id),
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),timeout_milliseconds:=60000) into net_id;
  exception when others then
    update public.gtl_features_schedule_runs set status='failed',reason='dispatch_unavailable',finished_at=clock_timestamp() where id=run.id;
    return jsonb_build_object('status','failed','reason','dispatch_unavailable');
  end;
  return jsonb_build_object('status','queued','runId',run.id);
end $$;

create or replace function public.gtl_claim_league_features(p_token text,p_run uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg public.gtl_features_schedule; run public.gtl_features_schedule_runs; stamp timestamptz; claim uuid;
begin
  select * into cfg from public.gtl_features_schedule where id='league-features';
  if not found or not cfg.enabled or p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'GTL_SCHEDULE_AUTH'; end if;
  select * into run from public.gtl_features_schedule_runs where id=p_run and schedule_id=cfg.id for update;
  stamp:=clock_timestamp();
  -- Authenticate against this exact run before returning even a replay.
  if not found or encode(sha256(convert_to(p_token,'UTF8')),'hex') is distinct from run.capability_hash
    or run.slot_start<>date_bin(interval '15 minutes',stamp,timestamptz '2000-01-01 00:00:00+00')
    or run.created_at<stamp-interval '5 minutes' or run.created_at>stamp then raise exception 'GTL_SCHEDULE_AUTH'; end if;
  if run.status<>'queued' then return jsonb_build_object('replay',true,'runId',run.id,'status',run.status,'reason',run.reason); end if;
  if not public.gtl_community_admin(cfg.authorized_by) then
    update public.gtl_features_schedule_runs set status='skipped',reason='commissioner_unavailable',finished_at=stamp where id=run.id;
    return jsonb_build_object('replay',true,'runId',run.id,'status','skipped','reason','commissioner_unavailable');
  end if;
  claim:=gen_random_uuid();
  update public.gtl_features_schedule_runs set status='running',claim_token=claim,claimed_at=stamp where id=run.id;
  return jsonb_build_object('replay',false,'runId',run.id,'claim',claim,'actorId',cfg.authorized_by,'season',cfg.season,'now',stamp);
end $$;

-- A null reason: the run recorded the season's features (or found nothing new). 'no_season' is a safe no-op; the rest fail.
create or replace function public.gtl_complete_league_features(p_run uuid,p_claim uuid,p_reason text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare run public.gtl_features_schedule_runs; state text;
begin
  select * into run from public.gtl_features_schedule_runs where id=p_run for update;
  if not found or p_claim is null or run.claim_token is distinct from p_claim then raise exception 'GTL_SCHEDULE_RUN'; end if;
  if run.status<>'running' then return jsonb_build_object('runId',run.id,'status',run.status,'reason',run.reason); end if;
  if run.claimed_at<clock_timestamp()-interval '10 minutes' then raise exception 'GTL_SCHEDULE_EXPIRED'; end if;
  state:=case when p_reason is null then 'succeeded' when p_reason='no_season' then 'skipped' when p_reason='features_failed' then 'failed' end;
  if state is null then raise exception 'GTL_SCHEDULE_RUN'; end if;
  update public.gtl_features_schedule_runs set status=state,reason=p_reason,finished_at=clock_timestamp() where id=run.id;
  return jsonb_build_object('runId',run.id,'status',state,'reason',p_reason);
end $$;

alter table public.gtl_features_schedule enable row level security;
alter table public.gtl_features_schedule_runs enable row level security;
revoke all on public.gtl_features_schedule,public.gtl_features_schedule_runs from public,anon,authenticated,service_role;
grant select on public.gtl_features_schedule,public.gtl_features_schedule_runs to service_role;
grant update(status,reason,claim_token,claimed_at,finished_at) on public.gtl_features_schedule_runs to service_role;
revoke all on function public.gtl_dispatch_league_features(),public.gtl_claim_league_features(text,uuid),public.gtl_complete_league_features(uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.gtl_claim_league_features(text,uuid),public.gtl_complete_league_features(uuid,uuid,text) to service_role;
