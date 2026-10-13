-- D-28: opt-in web push, one reminder. A player whose Spread or Total ballot for
-- the open week is neither submitted nor sat out (D-23) gets one push two hours
-- before that week's deadline (TNF kickoff, D-24). No email, no line movement.
--
-- Everything here is service-only: RLS is on and no browser role has a grant.
-- Hosted dispatch follows the D-24 week-open pattern: an administrator deploys
-- the gtl-push-reminders Edge function, sets the VAPID secrets, registers the
-- pg_cron job and enables the schedule row separately (see
-- supabase/admin/web_push_reminders_cron.sql and docs/WEB_PUSH_SETUP.md). This
-- migration creates no cron job, secret, key, Vault row or extension.

-- One row per browser push subscription. The endpoint is the device's address at
-- its push service; p256dh/auth are the browser's public encryption key and auth
-- secret (base64url, unpadded). A subscription is a device setting, not a pick or
-- other player entry, so turning reminders off deletes it (D-28).
create table public.gtl_push_subscriptions (
  endpoint text primary key check(char_length(endpoint) between 24 and 1024
    and endpoint ~ '^https://(fcm\.googleapis\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.services\.mozilla\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com|web\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.apple\.com)/'),
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null check(p256dh ~ '^B[A-Za-z0-9_-]{86}$'),
  auth text not null check(auth ~ '^[A-Za-z0-9_-]{22}$'),
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count integer not null default 0 check(failure_count>=0),
  disabled_at timestamptz
);
create index gtl_push_subscriptions_user_idx on public.gtl_push_subscriptions(user_id);

-- At most one reminder per player, week, mode and kind: the row is written before
-- the push is sent, so a retry or an overlapping run can never send it twice.
create table public.gtl_push_reminders_sent (
  user_id uuid not null references auth.users(id) on delete cascade,
  season integer not null, week integer not null,
  mode text not null check(mode in ('guess_spread','guess_total')),
  kind text not null check(kind in ('deadline_2h')),
  run_id uuid,
  sent_at timestamptz not null default clock_timestamp(),
  primary key(user_id,season,week,mode,kind)
);

create table public.gtl_push_reminder_schedule (
  id text primary key check(id='deadline-2h'), enabled boolean not null default false,
  endpoint text not null check(endpoint ~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/gtl-push-reminders$'),
  created_at timestamptz not null default now()
);
create table public.gtl_push_reminder_runs (
  id uuid primary key default gen_random_uuid(), schedule_id text not null references public.gtl_push_reminder_schedule(id),
  slot_start timestamptz not null, created_at timestamptz not null default clock_timestamp(),
  capability_hash text not null check(capability_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'queued' check(status in ('queued','running','succeeded','skipped','failed')),
  reason text check(reason in ('no_week','not_open','closed','not_due_yet','nothing_due','vapid_unavailable','send_failed','worker_timeout','dispatch_unavailable')),
  claim_token uuid, claimed_at timestamptz, finished_at timestamptz,
  sent integer not null default 0 check(sent>=0), failed integer not null default 0 check(failed>=0),
  unique(schedule_id,slot_start)
);

-- Subscribe or move this device's subscription to the signed-in player. A removed
-- member (D-23) cannot subscribe; at most ten devices per player.
create function public.gtl_push_subscribe(p_user uuid,p_endpoint text,p_p256dh text,p_auth text) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_endpoint is null or p_p256dh is null or p_auth is null or char_length(p_endpoint)>1024 then raise exception 'GTL_PUSH_INVALID'; end if;
  if (select count(*) from public.gtl_push_subscriptions where user_id=p_user and endpoint<>p_endpoint)>=10 then raise exception 'GTL_PUSH_LIMIT'; end if;
  begin
    insert into public.gtl_push_subscriptions(endpoint,user_id,p256dh,auth) values(p_endpoint,p_user,p_p256dh,p_auth)
      on conflict(endpoint) do update set user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,
        failure_count=0,disabled_at=null,
        created_at=case when public.gtl_push_subscriptions.user_id=excluded.user_id then public.gtl_push_subscriptions.created_at else excluded.created_at end;
  exception when check_violation then raise exception 'GTL_PUSH_INVALID';
  end;
  return jsonb_build_object('subscribed',true,'devices',(select count(*) from public.gtl_push_subscriptions where user_id=p_user and disabled_at is null));
end $$;

-- Turning reminders off on a device deletes its row. Allowed for removed members too.
create function public.gtl_push_unsubscribe(p_user uuid,p_endpoint text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare removed integer;
begin
  if p_user is null or p_endpoint is null then raise exception 'GTL_PUSH_INVALID'; end if;
  delete from public.gtl_push_subscriptions where user_id=p_user and endpoint=p_endpoint;
  get diagnostics removed=row_count;
  return jsonb_build_object('subscribed',false,'removed',removed>0,'devices',(select count(*) from public.gtl_push_subscriptions where user_id=p_user and disabled_at is null));
end $$;

create function public.gtl_push_status(p_user uuid,p_endpoint text) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'subscribed',p_endpoint is not null and exists(select 1 from public.gtl_push_subscriptions where user_id=p_user and endpoint=p_endpoint and disabled_at is null),
    'devices',(select count(*) from public.gtl_push_subscriptions where user_id=p_user and disabled_at is null))
$$;

-- ADMIN ONLY: run by pg_cron as postgres every 15 minutes. Outside the two hours
-- before the latest published week's deadline it returns without writing a run or
-- calling the network, so nearly every tick is free. Inside, it queues one run per
-- 15-minute slot with a one-run capability (only its hash is stored).
create function public.gtl_dispatch_push_reminders() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg public.gtl_push_reminder_schedule; run public.gtl_push_reminder_runs; token text; stamp timestamptz:=clock_timestamp(); deadline timestamptz; net_id bigint;
begin
  select * into cfg from public.gtl_push_reminder_schedule where id='deadline-2h' for update;
  stamp:=clock_timestamp();
  if not found or not cfg.enabled then return jsonb_build_object('status','disabled'); end if;
  update public.gtl_push_reminder_runs set status='failed',reason='worker_timeout',finished_at=stamp
    where schedule_id=cfg.id and status in ('queued','running') and coalesce(claimed_at,created_at)<stamp-interval '10 minutes';
  select to_timestamp((signature->>'deadline')::double precision) into deadline from public.gtl_weekly_slates order by season desc,week desc limit 1;
  if deadline is null or stamp<deadline-interval '2 hours' or stamp>=deadline then return jsonb_build_object('status','not_due'); end if;
  token:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  insert into public.gtl_push_reminder_runs(schedule_id,slot_start,capability_hash)
    values(cfg.id,date_bin(interval '15 minutes',stamp,timestamptz '2000-01-01 00:00:00+00'),encode(sha256(convert_to(token,'UTF8')),'hex'))
    on conflict(schedule_id,slot_start) do nothing returning * into run;
  if not found then return jsonb_build_object('status','already_dispatched'); end if;
  begin
    select net.http_post(url:=cfg.endpoint,body:=jsonb_build_object('runId',run.id),
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),timeout_milliseconds:=60000) into net_id;
  exception when others then
    update public.gtl_push_reminder_runs set status='failed',reason='dispatch_unavailable',finished_at=clock_timestamp() where id=run.id;
    return jsonb_build_object('status','failed','reason','dispatch_unavailable');
  end;
  return jsonb_build_object('status','queued','runId',run.id);
end $$;

-- Service-role only. Verifies the one-run capability, then returns the facts the
-- worker needs: the latest published week and, only inside its two-hour window,
-- each subscribed community member's submitted, sat-out and already-reminded modes
-- with their active subscriptions. Never picks, lines or anyone else's data.
create function public.gtl_claim_push_reminders(p_token text,p_run uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg public.gtl_push_reminder_schedule; run public.gtl_push_reminder_runs; stamp timestamptz:=clock_timestamp(); claim uuid;
  s integer; w integer; sig jsonb; deadline timestamptz; players jsonb:='[]'::jsonb;
begin
  select * into cfg from public.gtl_push_reminder_schedule where id='deadline-2h';
  if not found or not cfg.enabled or p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'GTL_SCHEDULE_AUTH'; end if;
  select * into run from public.gtl_push_reminder_runs where id=p_run and schedule_id=cfg.id for update;
  stamp:=clock_timestamp();
  if not found or encode(sha256(convert_to(p_token,'UTF8')),'hex') is distinct from run.capability_hash
    or run.slot_start<>date_bin(interval '15 minutes',stamp,timestamptz '2000-01-01 00:00:00+00')
    or run.created_at<stamp-interval '5 minutes' or run.created_at>stamp then raise exception 'GTL_SCHEDULE_AUTH'; end if;
  if run.status<>'queued' then return jsonb_build_object('replay',true,'runId',run.id,'status',run.status,'reason',run.reason,'sent',run.sent,'failed',run.failed); end if;
  claim:=gen_random_uuid();
  update public.gtl_push_reminder_runs set status='running',claim_token=claim,claimed_at=stamp where id=run.id;
  select season,week,signature into s,w,sig from public.gtl_weekly_slates order by season desc,week desc limit 1;
  deadline:=to_timestamp((sig->>'deadline')::double precision);
  if s is not null and stamp>=deadline-interval '2 hours' and stamp<deadline then
    select coalesce(jsonb_agg(jsonb_build_object('userId',u.user_id,
        'submitted',(select coalesce(jsonb_agg(b.mode order by b.mode),'[]') from public.gtl_weekly_ballots b
          where b.user_id=u.user_id and b.season=s and b.week=w and coalesce(b.ballot->>'submittedAt','')<>''),
        'satOut',(select coalesce(jsonb_agg(o.mode order by o.mode),'[]') from public.gtl_weekly_optouts o where o.user_id=u.user_id and o.season=s and o.week=w),
        'reminded',(select coalesce(jsonb_agg(r.mode order by r.mode),'[]') from public.gtl_push_reminders_sent r
          where r.user_id=u.user_id and r.season=s and r.week=w and r.kind='deadline_2h'),
        'subscriptions',(select jsonb_agg(jsonb_build_object('endpoint',x.endpoint,'p256dh',x.p256dh,'auth',x.auth) order by x.created_at,x.endpoint)
          from public.gtl_push_subscriptions x where x.user_id=u.user_id and x.disabled_at is null)) order by u.user_id),'[]')
      into players
      from (select distinct user_id from public.gtl_push_subscriptions where disabled_at is null) u
      where public.gtl_community_member(u.user_id);
  end if;
  return jsonb_build_object('replay',false,'runId',run.id,'claim',claim,'now',stamp,
    'week',case when s is null then null else jsonb_build_object('season',s,'week',w,'deadline',deadline,'openAt',public.gtl_week_open_at(s,w)) end,
    'players',players);
end $$;

-- Records the reminder before it is sent. Returns only the modes newly recorded,
-- so a mode reminded by an earlier or overlapping run is never sent again.
create function public.gtl_mark_push_reminder(p_run uuid,p_claim uuid,p_user uuid,p_season integer,p_week integer,p_modes text[]) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare run public.gtl_push_reminder_runs; recorded jsonb;
begin
  select * into run from public.gtl_push_reminder_runs where id=p_run;
  if not found or p_claim is null or run.claim_token is distinct from p_claim or run.status<>'running' or run.claimed_at<clock_timestamp()-interval '10 minutes' then raise exception 'GTL_SCHEDULE_RUN'; end if;
  if p_user is null or p_season is null or p_week is null or p_modes is null or cardinality(p_modes) not between 1 and 2
    or exists(select 1 from unnest(p_modes) m where m is null or m not in ('guess_spread','guess_total')) then raise exception 'GTL_SCHEDULE_RUN'; end if;
  with inserted as (
    insert into public.gtl_push_reminders_sent(user_id,season,week,mode,kind,run_id)
      select p_user,p_season,p_week,m,'deadline_2h',p_run from (select distinct unnest(p_modes) m) q
      on conflict do nothing returning mode)
  select coalesce(jsonb_agg(mode order by mode),'[]') into recorded from inserted;
  return jsonb_build_object('modes',recorded);
end $$;

-- One delivery outcome per endpoint: ok resets the failure count; gone (the push
-- service answered 404/410) deletes the subscription; failed counts, and five
-- failures in a row disable it without deleting it.
create function public.gtl_record_push_delivery(p_run uuid,p_claim uuid,p_endpoint text,p_outcome text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare run public.gtl_push_reminder_runs;
begin
  select * into run from public.gtl_push_reminder_runs where id=p_run;
  if not found or p_claim is null or run.claim_token is distinct from p_claim or run.status<>'running' or run.claimed_at<clock_timestamp()-interval '10 minutes' then raise exception 'GTL_SCHEDULE_RUN'; end if;
  if p_outcome='ok' then
    update public.gtl_push_subscriptions set last_success_at=clock_timestamp(),failure_count=0 where endpoint=p_endpoint;
  elsif p_outcome='gone' then
    delete from public.gtl_push_subscriptions where endpoint=p_endpoint;
  elsif p_outcome='failed' then
    update public.gtl_push_subscriptions set failure_count=failure_count+1,
      disabled_at=case when failure_count+1>=5 then coalesce(disabled_at,clock_timestamp()) else disabled_at end where endpoint=p_endpoint;
  else raise exception 'GTL_SCHEDULE_RUN';
  end if;
  return jsonb_build_object('outcome',p_outcome);
end $$;

-- A null reason means the run finished its sends (counts recorded); the named
-- reasons record a safe no-op (skipped) or a failure to look at.
create function public.gtl_complete_push_reminders(p_run uuid,p_claim uuid,p_reason text,p_sent integer,p_failed integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare run public.gtl_push_reminder_runs; state text;
begin
  select * into run from public.gtl_push_reminder_runs where id=p_run for update;
  if not found or p_claim is null or run.claim_token is distinct from p_claim then raise exception 'GTL_SCHEDULE_RUN'; end if;
  if run.status<>'running' then return jsonb_build_object('runId',run.id,'status',run.status,'reason',run.reason,'sent',run.sent,'failed',run.failed); end if;
  if run.claimed_at<clock_timestamp()-interval '10 minutes' then raise exception 'GTL_SCHEDULE_EXPIRED'; end if;
  if p_sent is null or p_failed is null or p_sent<0 or p_failed<0 then raise exception 'GTL_SCHEDULE_RUN'; end if;
  state:=case when p_reason is null then 'succeeded'
    when p_reason in ('no_week','not_open','closed','not_due_yet','nothing_due') then 'skipped'
    when p_reason in ('vapid_unavailable','send_failed') then 'failed' end;
  if state is null then raise exception 'GTL_SCHEDULE_RUN'; end if;
  update public.gtl_push_reminder_runs set status=state,reason=p_reason,sent=p_sent,failed=p_failed,finished_at=clock_timestamp() where id=run.id;
  return jsonb_build_object('runId',run.id,'status',state,'reason',p_reason,'sent',p_sent,'failed',p_failed);
end $$;

alter table public.gtl_push_subscriptions enable row level security;
alter table public.gtl_push_reminders_sent enable row level security;
alter table public.gtl_push_reminder_schedule enable row level security;
alter table public.gtl_push_reminder_runs enable row level security;
revoke all on public.gtl_push_subscriptions,public.gtl_push_reminders_sent,public.gtl_push_reminder_schedule,public.gtl_push_reminder_runs
  from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.gtl_push_subscriptions to service_role;
-- The sent log is append-only: no update or delete.
grant select,insert on public.gtl_push_reminders_sent to service_role;
grant select on public.gtl_push_reminder_schedule,public.gtl_push_reminder_runs to service_role;
grant update(status,reason,claim_token,claimed_at,finished_at,sent,failed) on public.gtl_push_reminder_runs to service_role;
revoke all on function public.gtl_push_subscribe(uuid,text,text,text),public.gtl_push_unsubscribe(uuid,text),public.gtl_push_status(uuid,text),
  public.gtl_dispatch_push_reminders(),public.gtl_claim_push_reminders(text,uuid),public.gtl_mark_push_reminder(uuid,uuid,uuid,integer,integer,text[]),
  public.gtl_record_push_delivery(uuid,uuid,text,text),public.gtl_complete_push_reminders(uuid,uuid,text,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.gtl_push_subscribe(uuid,text,text,text),public.gtl_push_unsubscribe(uuid,text),public.gtl_push_status(uuid,text),
  public.gtl_claim_push_reminders(text,uuid),public.gtl_mark_push_reminder(uuid,uuid,uuid,integer,integer,text[]),
  public.gtl_record_push_delivery(uuid,uuid,text,text),public.gtl_complete_push_reminders(uuid,uuid,text,integer,integer) to service_role;
