-- M-38 ops alerts (item 22, docs/OPS_ALERTS.md): the Supabase half. A pg_cron row says `succeeded` when the dispatcher SQL
-- ran, not when the work happened, so this reads each job family's own run table and the weekly outcomes themselves, keeps
-- every problem as an incident, and pushes one alert per change to the sean-troy-luke commissioner's phone.
--
-- * gtl_ops_findings(p_now): the current problems as rows, read as of p_now (failed and quiet look only at runs finished or
--   slotted by then). Cron and SQL editor only.
--   - failed:<family>: an enabled family's latest finished run is `failed` (`partial` and `skipped` are not failures). A
--     disabled family is never checked: it cannot run again to clear the alert.
--   - quiet:<family>: an enabled family's newest run row is at least its limit old (results 2 h; EPL moneyline, snapshot,
--     resolve and nudge 1 h; Points and odds 26 h). Push reminders, week open, features and the other EPL jobs run only when
--     something is due, so their silence is normal and never checked. A family with no run row yet names no time: no finding.
--   - points-open:<season>-<week>: the latest published Points slate's next week is not published 2 h after its expected
--     open: the Tuesday 00:00 PT a week after that slate's SCHEDULED Tuesday, found from the Pacific ISO week its opens_at
--     falls in (Monday through Sunday), not from opens_at itself. A manual early publish stores opens_at = publish time
--     (least(opens_at, now)), which would otherwise expect the next week early. A PDT open expects a PST one at 08:00 UTC.
--   - points-final:<season>-<week>: a published slate whose finalize_at passed an hour ago has no gtl_points_week_final row.
--   - week-open:<season>-<week>: the same rule for the weekly Spread and Total week. Its proof of opening is the
--     gtl_weekly_slates row and its open instant gtl_week_open_at() (20261009150000): gtl_publish_week inserts that row when
--     the gtl-week-open worker or the commissioner's manual Publish Week opens a week, and the ballot window guard reads the
--     same instant. gtl_week_open_runs is not proof (a run that finds the week already published is `skipped`, and a manual
--     publish has no run), and gtl_social_weeks rows appear only when someone posts a bet.
--   - Weeks after Week 18 are never expected. Nothing here reads a pick, guess, ballot, selection, score or name: only run
--     status and times, slate weeks and times, and whether a FINAL row exists.
-- * gtl_ops_incidents: one open incident per key (partial unique index). Never deleted (D-23).
-- * gtl_dispatch_ops_alerts(): cron every 15 minutes (supabase/admin/ops_alerts_cron.sql). Opens an incident for each new
--   finding, clears each open one that is no longer found (a `test` incident clears once its alert was pushed), and only when
--   a push is owed and the commissioner has an active subscription queues one run with a single-use capability and calls
--   gtl-ops-alerts, as the league features dispatcher (20261026235000) does. A quiet slot costs no function call. An incident
--   cleared before its alert was pushed owes nothing.
-- * gtl_claim_ops_alerts, gtl_mark_ops_notification, gtl_record_ops_delivery, gtl_complete_ops_alerts: the worker's, service
--   role only, with the push reminder worker's capability, claim and replay rules (20261013030000). A push that fails stays
--   owed and is retried on the next run. gtl_ops_test_alert(): service role only, opens one `test` incident.
-- Apply after M-37 or on its own: it reads only hosted tables. Rerunnable: tables and indexes only if missing, create or
-- replace with these exact argument lists, every grant restated. Nothing here inserts the schedule row or registers cron;
-- the admin script does both, disabled first. Rollback: supabase/rollback/20261103190000_gtl_ops_alerts.sql (revokes the
-- worker's functions; every row stays). No hosted action is performed by this file.

create table if not exists public.gtl_ops_alert_schedule (
  id text primary key check(id='ops'),
  enabled boolean not null default false,
  endpoint text not null check(endpoint ~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/gtl-ops-alerts$'),
  created_at timestamptz not null default now()
);
create table if not exists public.gtl_ops_alert_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id text not null references public.gtl_ops_alert_schedule(id),
  slot_start timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  capability_hash text not null check(capability_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'queued' check(status in ('queued','running','succeeded','skipped','failed')),
  reason text check(reason in ('nothing_owed','no_subscriptions','vapid_unavailable','send_failed','worker_timeout','dispatch_unavailable')),
  claim_token uuid, claimed_at timestamptz, finished_at timestamptz,
  sent integer not null default 0 check(sent>=0), failed integer not null default 0 check(failed>=0),
  unique(schedule_id,slot_start)
);
-- `at` is the time the alert names (the failure, the last run, the due time). The two notified times are set only after a
-- push reached at least one of the commissioner's devices.
create table if not exists public.gtl_ops_incidents (
  id bigint generated always as identity primary key,
  key text not null check(char_length(key) between 6 and 80),
  kind text not null check(kind in ('failed','quiet','points-open','points-final','week-open','test')),
  family text check(family is null or family ~ '^(results|odds|points|push|week_open|features|epl:[a-z-]{1,20})$'),
  season integer check(season is null or season between 2000 and 2200),
  week integer check(week is null or week between 1 and 18),
  at timestamptz not null,
  opened_at timestamptz not null default clock_timestamp(),
  notified_at timestamptz,
  cleared_at timestamptz,
  cleared_notified_at timestamptz,
  check(starts_with(key,kind||':')),
  check(cleared_notified_at is null or (cleared_at is not null and notified_at is not null))
);
create unique index if not exists gtl_ops_incidents_open_key on public.gtl_ops_incidents(key) where cleared_at is null;

-- CRON AND SQL EDITOR ONLY (no grant to any API role). Read-only.
create or replace function public.gtl_ops_findings(p_now timestamptz)
returns table(key text,kind text,family text,season integer,week integer,at timestamptz)
language sql stable security invoker set search_path='' as $$
  with runs as (
    select 'results'::text family,r.status,r.slot_start,r.finished_at from public.gtl_results_refresh_runs r
    union all select 'odds',r.status,r.slot_start,r.finished_at from public.gtl_odds_refresh_runs r
    union all select 'points',r.status,r.slot_start,r.finished_at from public.gtl_points_job_runs r
    union all select 'push',r.status,r.slot_start,r.finished_at from public.gtl_push_reminder_runs r
    union all select 'week_open',r.status,r.slot_start,r.finished_at from public.gtl_week_open_runs r
    union all select 'features',r.status,r.slot_start,r.finished_at from public.gtl_features_schedule_runs r
    union all select 'epl:'||r.job,r.status,r.slot_start,r.finished_at from public.gtl_epl_job_runs r),
  -- The families whose schedule row exists and is enabled, with a quiet limit where silence is abnormal. A disabled family
  -- is never checked: it cannot run again to clear a failure, and silence is expected.
  active(family,quiet) as (
    select 'results'::text,interval '2 hours' from public.gtl_results_refresh_schedule s where s.id='nfl-results' and s.enabled
    union all select 'odds',interval '26 hours' from public.gtl_odds_schedule s where s.id='nfl-12h' and s.enabled
    union all select 'points',interval '26 hours' from public.gtl_points_job_schedule s where s.id='nfl-points' and s.enabled
    union all select 'push',null::interval from public.gtl_push_reminder_schedule s where s.id='deadline-2h' and s.enabled
    union all select 'week_open',null from public.gtl_week_open_schedule s where s.id='nfl-weekly' and s.enabled
    union all select 'features',null from public.gtl_features_schedule s where s.id='league-features' and s.enabled
    union all select 'epl:'||s.job,case when s.job in ('moneyline','snapshot','resolve','nudge') then interval '1 hour' end
      from public.gtl_epl_jobs_schedule s where s.enabled),
  points_last as (select s.season,s.week,((date_trunc('week',s.opens_at at time zone 'America/Los_Angeles')+interval '8 days') at time zone 'America/Los_Angeles') due
    from public.gtl_points_slates s where s.status='published' order by s.season desc,s.week desc limit 1),
  weekly_last as (select w.season,w.week,((public.gtl_week_open_at(w.season,w.week) at time zone 'America/Los_Angeles')+interval '7 days') at time zone 'America/Los_Angeles' due
    from public.gtl_weekly_slates w order by w.season desc,w.week desc limit 1)
  select 'failed:'||f.family,'failed',f.family,null::integer,null::integer,f.finished_at
    from (select distinct on (r.family) r.family,r.status,r.finished_at from runs r where r.finished_at<=p_now
      order by r.family,r.finished_at desc,r.slot_start desc) f
    where f.status='failed' and f.family in (select a.family from active a)
  union all
  select 'quiet:'||l.family,'quiet',l.family,null,null,n.newest
    from active l cross join lateral (select max(r.slot_start) newest from runs r where r.family=l.family and r.slot_start<=p_now) n
    where l.quiet is not null and n.newest<=p_now-l.quiet
  union all
  select format('points-open:%s-%s',p.season,p.week+1),'points-open',null,p.season,p.week+1,p.due
    from points_last p
    where p.week+1<=18 and p_now>=p.due+interval '2 hours'
      and not exists(select 1 from public.gtl_points_slates s where s.season=p.season and s.week=p.week+1 and s.status='published')
  union all
  select format('points-final:%s-%s',s.season,s.week),'points-final',null,s.season,s.week,s.finalize_at
    from public.gtl_points_slates s
    where s.status='published' and s.finalize_at<=p_now-interval '1 hour'
      and not exists(select 1 from public.gtl_points_week_final f where f.season=s.season and f.week=s.week)
  union all
  select format('week-open:%s-%s',w.season,w.week+1),'week-open',null,w.season,w.week+1,w.due
    from weekly_last w
    where w.week+1<=18 and p_now>=w.due+interval '2 hours'
      and not exists(select 1 from public.gtl_weekly_slates s where s.season=w.season and s.week=w.week+1)
$$;

-- ADMIN ONLY (pg_cron, every 15 minutes): pg_net must be enabled beforehand. Owed: an open incident not yet pushed, or a
-- cleared one whose alert was pushed and whose recovery was not. At most one queued or running run; one per 15-minute slot.
create or replace function public.gtl_dispatch_ops_alerts() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg public.gtl_ops_alert_schedule; run public.gtl_ops_alert_runs; token text; stamp timestamptz; net_id bigint;
  opened integer; cleared integer; owed integer;
begin
  select * into cfg from public.gtl_ops_alert_schedule where id='ops' for update;
  stamp:=clock_timestamp();
  if not found or not cfg.enabled then return jsonb_build_object('status','disabled'); end if;
  update public.gtl_ops_alert_runs set status='failed',reason='worker_timeout',finished_at=stamp
    where schedule_id=cfg.id and status in ('queued','running') and coalesce(claimed_at,created_at)<stamp-interval '10 minutes';
  with hits as materialized (select * from public.gtl_ops_findings(stamp)),
  added as (insert into public.gtl_ops_incidents(key,kind,family,season,week,at,opened_at)
      select h.key,h.kind,h.family,h.season,h.week,h.at,stamp from hits h
      on conflict(key) where cleared_at is null do nothing returning id),
  gone as (update public.gtl_ops_incidents i set cleared_at=stamp where i.cleared_at is null
      and case when i.kind='test' then i.notified_at is not null else not exists(select 1 from hits h where h.key=i.key) end returning id)
  select (select count(*) from added),(select count(*) from gone) into opened,cleared;
  select count(*) into owed from public.gtl_ops_incidents i
    where (i.cleared_at is null and i.notified_at is null) or (i.cleared_at is not null and i.notified_at is not null and i.cleared_notified_at is null);
  if owed=0 then return jsonb_build_object('status','nothing_owed','opened',opened,'cleared',cleared,'owed',0); end if;
  if not exists(select 1 from public.gtl_push_subscriptions x join public.gtl_memberships m on m.user_id=x.user_id
      where m.league_id='sean-troy-luke' and m.player_id='sean' and m.role='commissioner' and m.active and x.disabled_at is null) then
    return jsonb_build_object('status','no_subscriptions','opened',opened,'cleared',cleared,'owed',owed);
  end if;
  if exists(select 1 from public.gtl_ops_alert_runs where schedule_id=cfg.id and status in ('queued','running')) then
    return jsonb_build_object('status','run_active','opened',opened,'cleared',cleared,'owed',owed);
  end if;
  token:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  insert into public.gtl_ops_alert_runs(schedule_id,slot_start,capability_hash)
    values(cfg.id,date_bin(interval '15 minutes',stamp,timestamptz '2000-01-01 00:00:00+00'),encode(sha256(convert_to(token,'UTF8')),'hex'))
    on conflict(schedule_id,slot_start) do nothing returning * into run;
  if not found then return jsonb_build_object('status','already_dispatched','opened',opened,'cleared',cleared,'owed',owed); end if;
  begin
    select net.http_post(url:=cfg.endpoint,body:=jsonb_build_object('runId',run.id),
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),timeout_milliseconds:=60000) into net_id;
  exception when others then
    update public.gtl_ops_alert_runs set status='failed',reason='dispatch_unavailable',finished_at=clock_timestamp() where id=run.id;
    return jsonb_build_object('status','failed','reason','dispatch_unavailable','opened',opened,'cleared',cleared,'owed',owed);
  end;
  return jsonb_build_object('status','queued','runId',run.id,'opened',opened,'cleared',cleared,'owed',owed);
end $$;

-- Service role only. Authenticates the one-run capability, then returns the owed alerts (oldest first, at most 20) and the
-- commissioner's active subscriptions. Nothing owed or nowhere to send it: the run is skipped here, as a replay.
create or replace function public.gtl_claim_ops_alerts(p_token text,p_run uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg public.gtl_ops_alert_schedule; run public.gtl_ops_alert_runs; stamp timestamptz; claim uuid; notes jsonb; subs jsonb; skip text;
begin
  select * into cfg from public.gtl_ops_alert_schedule where id='ops';
  if not found or not cfg.enabled or p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'GTL_SCHEDULE_AUTH'; end if;
  select * into run from public.gtl_ops_alert_runs where id=p_run and schedule_id=cfg.id for update;
  stamp:=clock_timestamp();
  -- Authenticate against this exact run before returning even a replay.
  if not found or encode(sha256(convert_to(p_token,'UTF8')),'hex') is distinct from run.capability_hash
    or run.slot_start<>date_bin(interval '15 minutes',stamp,timestamptz '2000-01-01 00:00:00+00')
    or run.created_at<stamp-interval '5 minutes' or run.created_at>stamp then raise exception 'GTL_SCHEDULE_AUTH'; end if;
  if run.status<>'queued' then return jsonb_build_object('replay',true,'runId',run.id,'status',run.status,'reason',run.reason,'sent',run.sent,'failed',run.failed); end if;
  select coalesce(jsonb_agg(jsonb_build_object('incidentId',n.id,'key',n.key,'phase',n.phase,'kind',n.kind,'family',n.family,
      'season',n.season,'week',n.week,'at',n.at) order by n.due,n.id),'[]') into notes
    from (select i.id,i.key,i.kind,i.family,i.season,i.week,i.at,case when i.cleared_at is null then 'opened' else 'cleared' end phase,
        coalesce(i.cleared_at,i.opened_at) due
      from public.gtl_ops_incidents i
      where (i.cleared_at is null and i.notified_at is null) or (i.cleared_at is not null and i.notified_at is not null and i.cleared_notified_at is null)
      order by coalesce(i.cleared_at,i.opened_at),i.id limit 20) n;
  select coalesce(jsonb_agg(jsonb_build_object('endpoint',x.endpoint,'p256dh',x.p256dh,'auth',x.auth) order by x.created_at,x.endpoint),'[]') into subs
    from public.gtl_push_subscriptions x join public.gtl_memberships m on m.user_id=x.user_id
    where m.league_id='sean-troy-luke' and m.player_id='sean' and m.role='commissioner' and m.active and x.disabled_at is null;
  skip:=case when jsonb_array_length(notes)=0 then 'nothing_owed' when jsonb_array_length(subs)=0 then 'no_subscriptions' end;
  if skip is not null then
    update public.gtl_ops_alert_runs set status='skipped',reason=skip,finished_at=stamp where id=run.id;
    return jsonb_build_object('replay',true,'runId',run.id,'status','skipped','reason',skip,'sent',0,'failed',0);
  end if;
  claim:=gen_random_uuid();
  update public.gtl_ops_alert_runs set status='running',claim_token=claim,claimed_at=stamp where id=run.id;
  return jsonb_build_object('replay',false,'runId',run.id,'claim',claim,'status','running','now',stamp,'notifications',notes,'subscriptions',subs);
end $$;

-- Records one alert as pushed, once. The worker calls it only after a device accepted the push. An opened alert is recorded
-- even if the incident cleared while it was in flight: the phone has it, so its recovery is now owed.
create or replace function public.gtl_mark_ops_notification(p_run uuid,p_claim uuid,p_incident bigint,p_phase text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare run public.gtl_ops_alert_runs; marked integer;
begin
  select * into run from public.gtl_ops_alert_runs where id=p_run;
  if not found or p_claim is null or run.claim_token is distinct from p_claim or run.status<>'running' or run.claimed_at<clock_timestamp()-interval '10 minutes' then raise exception 'GTL_SCHEDULE_RUN'; end if;
  if p_incident is null or p_phase is null or p_phase not in ('opened','cleared') then raise exception 'GTL_SCHEDULE_RUN'; end if;
  if p_phase='opened' then
    update public.gtl_ops_incidents set notified_at=clock_timestamp() where id=p_incident and notified_at is null;
  else
    update public.gtl_ops_incidents set cleared_notified_at=clock_timestamp()
      where id=p_incident and cleared_at is not null and notified_at is not null and cleared_notified_at is null;
  end if;
  get diagnostics marked=row_count;
  return jsonb_build_object('recorded',marked>0);
end $$;

-- One delivery outcome per endpoint. Only the commissioner's endpoints. ok resets the failure count (it can only heal); gone
-- (404/410) deletes the subscription (a device setting, D-28), exactly as gtl_record_push_delivery. failed changes nothing:
-- one run carries up to 20 alerts, so counting each failure would disable the commissioner's phone within one bad run, and
-- with it his deadline reminders. A failed push stays owed and the run records it (failed count, send_failed).
create or replace function public.gtl_record_ops_delivery(p_run uuid,p_claim uuid,p_endpoint text,p_outcome text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare run public.gtl_ops_alert_runs; commissioner uuid;
begin
  select * into run from public.gtl_ops_alert_runs where id=p_run;
  if not found or p_claim is null or run.claim_token is distinct from p_claim or run.status<>'running' or run.claimed_at<clock_timestamp()-interval '10 minutes' then raise exception 'GTL_SCHEDULE_RUN'; end if;
  select m.user_id into commissioner from public.gtl_memberships m
    where m.league_id='sean-troy-luke' and m.player_id='sean' and m.role='commissioner' and m.active;
  if p_outcome='ok' then
    update public.gtl_push_subscriptions set last_success_at=clock_timestamp(),failure_count=0 where endpoint=p_endpoint and user_id=commissioner;
  elsif p_outcome='gone' then
    delete from public.gtl_push_subscriptions where endpoint=p_endpoint and user_id=commissioner;
  elsif p_outcome<>'failed' or p_outcome is null then raise exception 'GTL_SCHEDULE_RUN';
  end if;
  return jsonb_build_object('outcome',p_outcome);
end $$;

-- A null reason: the run pushed what it could (counts recorded; an alert no device accepted stays owed). The named reasons
-- record a safe no-op (skipped) or a failure to look at.
create or replace function public.gtl_complete_ops_alerts(p_run uuid,p_claim uuid,p_reason text,p_sent integer,p_failed integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare run public.gtl_ops_alert_runs; state text;
begin
  select * into run from public.gtl_ops_alert_runs where id=p_run for update;
  if not found or p_claim is null or run.claim_token is distinct from p_claim then raise exception 'GTL_SCHEDULE_RUN'; end if;
  if run.status<>'running' then return jsonb_build_object('runId',run.id,'status',run.status,'reason',run.reason,'sent',run.sent,'failed',run.failed); end if;
  if run.claimed_at<clock_timestamp()-interval '10 minutes' then raise exception 'GTL_SCHEDULE_EXPIRED'; end if;
  if p_sent is null or p_failed is null or p_sent<0 or p_failed<0 then raise exception 'GTL_SCHEDULE_RUN'; end if;
  state:=case when p_reason is null then 'succeeded'
    when p_reason in ('nothing_owed','no_subscriptions') then 'skipped'
    when p_reason in ('vapid_unavailable','send_failed') then 'failed' end;
  if state is null then raise exception 'GTL_SCHEDULE_RUN'; end if;
  update public.gtl_ops_alert_runs set status=state,reason=p_reason,sent=p_sent,failed=p_failed,finished_at=clock_timestamp() where id=run.id;
  return jsonb_build_object('runId',run.id,'status',state,'reason',p_reason,'sent',p_sent,'failed',p_failed);
end $$;

-- Service role only (supabase/admin/ops_alerts_test.sql): one synthetic incident. The next dispatch pushes it, and the one after
-- its push was recorded clears it, so the phone shows one alert and then its recovery. A second call in the same second
-- returns the same open incident.
create or replace function public.gtl_ops_test_alert() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz:=clock_timestamp(); k text; incident public.gtl_ops_incidents;
begin
  k:='test:'||floor(extract(epoch from stamp))::bigint;
  insert into public.gtl_ops_incidents(key,kind,at) values(k,'test',stamp)
    on conflict(key) where cleared_at is null do nothing returning * into incident;
  if not found then select * into incident from public.gtl_ops_incidents where key=k and cleared_at is null; end if;
  return jsonb_build_object('incidentId',incident.id,'key',incident.key,'at',incident.at);
end $$;

alter table public.gtl_ops_alert_schedule enable row level security;
alter table public.gtl_ops_alert_runs enable row level security;
alter table public.gtl_ops_incidents enable row level security;
revoke all on public.gtl_ops_alert_schedule,public.gtl_ops_alert_runs,public.gtl_ops_incidents from public,anon,authenticated,service_role;
grant select on public.gtl_ops_alert_schedule,public.gtl_ops_alert_runs,public.gtl_ops_incidents to service_role;
grant update(status,reason,claim_token,claimed_at,finished_at,sent,failed) on public.gtl_ops_alert_runs to service_role;
-- The worker records pushes; the test alert opens an incident. Nothing deletes one (D-23).
grant insert(key,kind,at) on public.gtl_ops_incidents to service_role;
grant update(notified_at,cleared_notified_at) on public.gtl_ops_incidents to service_role;
revoke all on function public.gtl_ops_findings(timestamptz),public.gtl_dispatch_ops_alerts(),public.gtl_claim_ops_alerts(text,uuid),
  public.gtl_mark_ops_notification(uuid,uuid,bigint,text),public.gtl_record_ops_delivery(uuid,uuid,text,text),
  public.gtl_complete_ops_alerts(uuid,uuid,text,integer,integer),public.gtl_ops_test_alert()
  from public,anon,authenticated,service_role;
grant execute on function public.gtl_claim_ops_alerts(text,uuid),public.gtl_mark_ops_notification(uuid,uuid,bigint,text),
  public.gtl_record_ops_delivery(uuid,uuid,text,text),public.gtl_complete_ops_alerts(uuid,uuid,text,integer,integer),
  public.gtl_ops_test_alert() to service_role;
