-- D-24: each NFL week's pick window opens automatically at 12:00 AM
-- America/Los_Angeles on the Monday of game week and closes at that week's
-- Thursday kickoff (the existing deadline). Nobody can save a ballot before the
-- open. The commissioner's manual Publish Week stays as a preview/fallback.
--
-- Hosted dispatch follows the twelve-hour odds collector: an administrator
-- registers the pg_cron job and enables the schedule row separately after the
-- gtl-week-open Edge function is deployed. This migration creates no cron job,
-- credential, Vault row or extension, and nothing here needs pg_cron/pg_net to
-- install. The only pg_net call is inside gtl_dispatch_week_open(), which cron runs.

-- The open instant for a published week: Monday 00:00 Pacific of the deadline's
-- ISO week (date_trunc('week') starts on Monday). Converting the Pacific
-- wall-clock Monday back to timestamptz honors PDT/PST automatically, so the
-- same deadline yields 07:00 UTC during PDT and 08:00 UTC during PST.
-- shared/nfl-schedule.mjs weekOpenAt() computes the identical value.
create function public.gtl_week_open_at(p_season integer,p_week integer) returns timestamptz
language sql stable security invoker set search_path='' as $$
  select (date_trunc('week',to_timestamp((signature->>'deadline')::double precision) at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles')
  from public.gtl_weekly_slates where season=p_season and week=p_week
$$;

-- Window enforcement for every ballot write path (personal /personal/ballot,
-- group /ballot through gtl_save_weekly_ballot, and any future writer). The
-- trigger name sorts before gtl_fresh_submission_guard so a too-early save is
-- reported as not open rather than as a missing odds reference. A week with no
-- published slate yields null and is untouched; the deadline checks are unchanged.
create function public.gtl_ballot_window_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if clock_timestamp()<public.gtl_week_open_at(new.season,new.week) then raise exception 'GTL_PREDICTION_NOT_OPEN'; end if;
  return new;
end $$;
create trigger gtl_ballot_window before insert or update on public.gtl_weekly_ballots for each row execute function public.gtl_ballot_window_guard();

create table public.gtl_week_open_schedule (
  id text primary key check(id='nfl-weekly'), enabled boolean not null default false,
  endpoint text not null check(endpoint ~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/gtl-week-open$'),
  authorized_by uuid not null references auth.users(id),
  season integer not null check(season between 2000 and 2200),
  created_at timestamptz not null default now()
);
create index gtl_week_open_schedule_actor_idx on public.gtl_week_open_schedule(authorized_by);
create table public.gtl_week_open_runs (
  id uuid primary key default gen_random_uuid(), schedule_id text not null references public.gtl_week_open_schedule(id),
  slot_start timestamptz not null, created_at timestamptz not null default clock_timestamp(),
  capability_hash text not null check(capability_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'queued' check(status in ('queued','running','succeeded','skipped','failed')),
  reason text check(reason in ('already_published','not_open_yet','no_upcoming_week','schedule_unavailable','slate_conflict','commissioner_unavailable','publish_failed','worker_timeout','dispatch_unavailable')),
  claim_token uuid, claimed_at timestamptz, finished_at timestamptz,
  unique(schedule_id,slot_start)
);

-- ADMIN ONLY: pg_net must be enabled beforehand. The queued token authorizes
-- just this existing run, for five minutes; it is never a reusable credential.
-- One run per clock hour: the PDT and PST cron registrations (see the doc block
-- at the end) fall in different hours, and the worker itself no-ops when the
-- target week is already published or not yet open.
create function public.gtl_dispatch_week_open() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg public.gtl_week_open_schedule; run public.gtl_week_open_runs; token text; stamp timestamptz:=clock_timestamp(); net_id bigint;
begin
  select * into cfg from public.gtl_week_open_schedule where id='nfl-weekly' for update;
  stamp:=clock_timestamp();
  if not found or not cfg.enabled then return jsonb_build_object('status','disabled'); end if;
  update public.gtl_week_open_runs set status='failed',reason='worker_timeout',finished_at=stamp
    where schedule_id=cfg.id and status in ('queued','running') and coalesce(claimed_at,created_at)<stamp-interval '10 minutes';
  token:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  insert into public.gtl_week_open_runs(schedule_id,slot_start,capability_hash)
    values(cfg.id,date_bin(interval '1 hour',stamp,timestamptz '2000-01-01 00:00:00+00'),encode(sha256(convert_to(token,'UTF8')),'hex'))
    on conflict(schedule_id,slot_start) do nothing returning * into run;
  if not found then return jsonb_build_object('status','already_dispatched'); end if;
  begin
    select net.http_post(url:=cfg.endpoint,body:=jsonb_build_object('runId',run.id),
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),timeout_milliseconds:=60000) into net_id;
  exception when others then
    update public.gtl_week_open_runs set status='failed',reason='dispatch_unavailable',finished_at=clock_timestamp() where id=run.id;
    return jsonb_build_object('status','failed','reason','dispatch_unavailable');
  end;
  return jsonb_build_object('status','queued','runId',run.id);
end $$;

create function public.gtl_claim_week_open(p_token text,p_run uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg public.gtl_week_open_schedule; run public.gtl_week_open_runs; stamp timestamptz:=clock_timestamp(); claim uuid;
begin
  select * into cfg from public.gtl_week_open_schedule where id='nfl-weekly';
  if not found or not cfg.enabled or p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'GTL_SCHEDULE_AUTH'; end if;
  select * into run from public.gtl_week_open_runs where id=p_run and schedule_id=cfg.id for update;
  stamp:=clock_timestamp();
  -- Authenticate against this exact private run BEFORE returning even a replay.
  if not found or encode(sha256(convert_to(p_token,'UTF8')),'hex') is distinct from run.capability_hash
    or run.slot_start<>date_bin(interval '1 hour',stamp,timestamptz '2000-01-01 00:00:00+00')
    or run.created_at<stamp-interval '5 minutes' or run.created_at>stamp then raise exception 'GTL_SCHEDULE_AUTH'; end if;
  if run.status<>'queued' then return jsonb_build_object('replay',true,'runId',run.id,'status',run.status,'reason',run.reason); end if;
  if not public.gtl_community_admin(cfg.authorized_by) then
    update public.gtl_week_open_runs set status='skipped',reason='commissioner_unavailable',finished_at=stamp where id=run.id;
    return jsonb_build_object('replay',true,'runId',run.id,'status','skipped','reason','commissioner_unavailable');
  end if;
  claim:=gen_random_uuid();
  update public.gtl_week_open_runs set status='running',claim_token=claim,claimed_at=stamp where id=run.id;
  return jsonb_build_object('replay',false,'runId',run.id,'claim',claim,'actorId',cfg.authorized_by,'season',cfg.season,'now',stamp);
end $$;

-- A null reason means the worker published the week; the named reasons record
-- a safe no-op (skipped) or a failure the administrator should look at.
create function public.gtl_complete_week_open(p_run uuid,p_claim uuid,p_reason text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare run public.gtl_week_open_runs; state text;
begin
  select * into run from public.gtl_week_open_runs where id=p_run for update;
  if not found or p_claim is null or run.claim_token is distinct from p_claim then raise exception 'GTL_SCHEDULE_RUN'; end if;
  if run.status<>'running' then return jsonb_build_object('runId',run.id,'status',run.status,'reason',run.reason); end if;
  if run.claimed_at<clock_timestamp()-interval '10 minutes' then raise exception 'GTL_SCHEDULE_EXPIRED'; end if;
  state:=case when p_reason is null then 'succeeded'
    when p_reason in ('already_published','not_open_yet','no_upcoming_week','commissioner_unavailable') then 'skipped'
    when p_reason in ('schedule_unavailable','slate_conflict','publish_failed') then 'failed' end;
  if state is null then raise exception 'GTL_SCHEDULE_RUN'; end if;
  update public.gtl_week_open_runs set status=state,reason=p_reason,finished_at=clock_timestamp() where id=run.id;
  return jsonb_build_object('runId',run.id,'status',state,'reason',p_reason);
end $$;

-- Commissioner-only status for the Publish panel. Never exposes a token or hash.
create function public.gtl_read_week_open_schedule(p_user uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare cfg public.gtl_week_open_schedule; run public.gtl_week_open_runs; s integer; w integer; sig jsonb;
begin
  if not public.gtl_community_admin(p_user) then raise exception 'GTL_COMMUNITY_FORBIDDEN'; end if;
  select * into cfg from public.gtl_week_open_schedule where id='nfl-weekly';
  select * into run from public.gtl_week_open_runs where schedule_id='nfl-weekly' order by slot_start desc limit 1;
  if run.status in ('queued','running') and coalesce(run.claimed_at,run.created_at)<clock_timestamp()-interval '10 minutes' then run.status:='failed'; run.reason:='worker_timeout'; end if;
  select season,week,signature into s,w,sig from public.gtl_weekly_slates order by season desc,week desc limit 1;
  return jsonb_build_object('configured',cfg.id is not null,'enabled',coalesce(cfg.enabled,false) and public.gtl_community_admin(cfg.authorized_by),
    'season',cfg.season,'timeZone','America/Los_Angeles','localTime','00:00','weekday','Monday','utcCrons',jsonb_build_array('0 7 * * 1','0 8 * * 1'),
    'lastRunAt',run.created_at,'lastFinishedAt',run.finished_at,'lastStatus',run.status,'lastReason',run.reason,
    'currentWeek',case when s is null then null else jsonb_build_object('season',s,'week',w,'openAt',public.gtl_week_open_at(s,w),'deadline',to_timestamp((sig->>'deadline')::double precision)) end,
    'referenceOnly',true);
end $$;

alter table public.gtl_week_open_schedule enable row level security;
alter table public.gtl_week_open_runs enable row level security;
revoke all on public.gtl_week_open_schedule,public.gtl_week_open_runs from public,anon,authenticated,service_role;
grant select on public.gtl_week_open_schedule,public.gtl_week_open_runs to service_role;
grant update(status,reason,claim_token,claimed_at,finished_at) on public.gtl_week_open_runs to service_role;
revoke all on function public.gtl_week_open_at(integer,integer),public.gtl_ballot_window_guard(),public.gtl_dispatch_week_open(),
  public.gtl_claim_week_open(text,uuid),public.gtl_complete_week_open(uuid,uuid,text),public.gtl_read_week_open_schedule(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.gtl_week_open_at(integer,integer),public.gtl_claim_week_open(text,uuid),public.gtl_complete_week_open(uuid,uuid,text),
  public.gtl_read_week_open_schedule(uuid) to service_role;

-- ADMIN ONLY — run by hand from the SQL editor after deploying gtl-week-open.
-- Not executed by this migration; copied in docs/SOCIAL_COMMUNITY.md.
-- Supabase pg_cron evaluates schedules in UTC, so Monday 00:00 Pacific is
-- registered twice: 07:00 UTC covers PDT (March–November) and 08:00 UTC covers
-- PST. During PDT the 08:00 UTC job runs at 1:00 AM PT and is a no-op
-- (already_published); during PST the 07:00 UTC job runs at Sunday 11:00 PM PT
-- and the worker skips it (not_open_yet). No week ever opens early or is missed.
--   select cron.schedule('gtl-week-open-monday-pdt','0 7 * * 1',$$select public.gtl_dispatch_week_open()$$);
--   select cron.schedule('gtl-week-open-monday-pst','0 8 * * 1',$$select public.gtl_dispatch_week_open()$$);
--   insert into public.gtl_week_open_schedule(id,enabled,endpoint,authorized_by,season)
--     values('nfl-weekly',false,'https://<project-ref>.supabase.co/functions/v1/gtl-week-open','<commissioner auth.users id>',2026);
--   select public.gtl_dispatch_week_open();            -- dry run while enabled=false returns {"status":"disabled"}
--   update public.gtl_week_open_schedule set enabled=true where id='nfl-weekly';
--   select public.gtl_dispatch_week_open();            -- one verified run; off-slot it ends skipped/already_published
