-- EPL delivery stage 4 (docs/EPL_FEATURES_2026_11_09.md, confirmed behavior 6): Pick a Team result announcements.
-- A matchweek is announced once every fixture is verified final (whole goals) or explicitly postponed, independently of the
-- Sleeper snapshots, the weekly-score import, settlement and the next draft. Elapsed time or a missing feed row never makes
-- a final: a scheduled fixture stays pending, and the announcement waits.
--
-- Adds (nothing existing is replaced; every function is new):
-- * gtl_epl_result_announcements: one durable row per matchweek, unique (season, week), with the winners SQL computed.
-- * gtl_epl_result_deliveries: one row per announcement and league member, written in the same transaction as the
--   announcement and before any push is sent, so a retry, a replay or an overlapping run never notifies anyone twice.
-- * gtl_epl_final_result_reads: the bounded final-match result reads (2 Odds API credits each) of the new 'results' job,
--   at most four a matchweek, each only at a fixed offset after the latest pending kickoff (150, 200, 300 and 720 minutes)
--   and at least 30 minutes after the previous one. Every read also takes the shared gtl_odds_budget reservation, so the
--   50-credit reserve holds. Typical use is one read (2 credits); the hard cap is 8 credits a matchweek. Once the stored
--   finals are verified, the existing settle and snapshot reads short-circuit without buying.
-- * gtl_epl_results_state, gtl_epl_reserve_final_result_read, gtl_epl_record_result_announcement: service-only RPCs that
--   require a live 'results' job claim.
-- * The job constraint widens to 'results'. The schedule row and cron entry are separate admin steps
--   (supabase/admin/epl_results_cron.sql); this file creates no row and enables nothing.
--
-- Apply after M-30 (20261028190000) and M-36 (20261029165947), both hosted; it reads only their tables plus the hosted
-- gtl_push_subscriptions and gtl_odds_budget. It does not need M-33, M-34 or M-35. Fix-forward: to stop collection and
-- notifications, disable the 'results' schedule row; announcements, deliveries and read records stay (D-23).
-- p_now is a trusted worker clock and test seam, never a client input.

alter table public.gtl_epl_jobs_schedule drop constraint if exists gtl_epl_jobs_schedule_job_check;
alter table public.gtl_epl_jobs_schedule add constraint gtl_epl_jobs_schedule_job_check
  check(job in ('snapshot','fixtures','resolve','settle','nudge','dnb-check','standings','moneyline','results'));

create table if not exists public.gtl_epl_result_announcements (
  season integer not null,
  week integer not null,
  announced_at timestamptz not null,
  run_id uuid references public.gtl_epl_job_runs(id),
  winners jsonb not null check(jsonb_typeof(winners)='array' and jsonb_array_length(winners)<=8),
  fixtures integer not null check(fixtures>0),
  postponed integer not null check(postponed>=0 and postponed<=fixtures),
  notify boolean not null,
  primary key(season,week),
  foreign key(season,week) references public.gtl_epl_weeks(season,week)
);
create table if not exists public.gtl_epl_result_deliveries (
  season integer not null,
  week integer not null,
  owner_id text not null references public.gtl_epl_managers(owner_id),
  run_id uuid references public.gtl_epl_job_runs(id),
  claimed_at timestamptz not null default clock_timestamp(),
  primary key(season,week,owner_id),
  foreign key(season,week) references public.gtl_epl_result_announcements(season,week)
);
create table if not exists public.gtl_epl_final_result_reads (
  run_id uuid primary key references public.gtl_epl_job_runs(id),
  season integer not null,
  week integer not null,
  attempt integer not null check(attempt between 1 and 4),
  reserved_at timestamptz not null,
  credits integer not null default 2 check(credits=2),
  unique(season,week,attempt),
  foreign key(season,week) references public.gtl_epl_weeks(season,week)
);
alter table public.gtl_epl_result_announcements enable row level security;
alter table public.gtl_epl_result_deliveries enable row level security;
alter table public.gtl_epl_final_result_reads enable row level security;
revoke all on public.gtl_epl_result_announcements,public.gtl_epl_result_deliveries,public.gtl_epl_final_result_reads
  from public,anon,authenticated,service_role;
-- Append-only for the API's role (D-23): no update or delete.
grant select,insert on public.gtl_epl_result_announcements,public.gtl_epl_result_deliveries,public.gtl_epl_final_result_reads to service_role;

-- The matchweek whose result is due: the latest week once its draft is no longer open, else the week before an open latest
-- week (same season). Its fixtures, picks, any announcement, the final reads used and the shared budget. No endpoint,
-- queue or account id is returned.
create or replace function public.gtl_epl_results_state(p_run uuid,p_claim uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare w public.gtl_epl_weeks; v_remaining integer; v_paused boolean;
begin
  if not exists(select 1 from public.gtl_epl_job_runs where id=p_run and claim_token=p_claim and status='running' and job='results') then
    raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001'; end if;
  select * into w from public.gtl_epl_weeks order by season desc,week desc limit 1;
  if found and w.status='open' then
    select * into w from public.gtl_epl_weeks where season=w.season and week=w.week-1 and status<>'open';
  end if;
  if w.season is null then return jsonb_build_object('week',null); end if;
  select b.conservative_remaining,b.paused into v_remaining,v_paused from public.gtl_odds_budget b where b.provider='the-odds-api';
  return jsonb_build_object(
    'week',jsonb_build_object('season',w.season,'week',w.week,'windowStart',w.window_start,'windowEnd',w.window_end,
      'firstKickoff',w.first_kickoff,'status',w.status),
    'picks',coalesce((select jsonb_agg(jsonb_build_object('ownerId',k.owner_id,'club',k.club) order by k.owner_id)
      from public.gtl_epl_picks k where k.season=w.season and k.week=w.week),'[]'::jsonb),
    'fixtures',coalesce((select jsonb_agg(jsonb_build_object('eventId',f.event_id,'home',f.home,'away',f.away,'commenceTime',f.commence_time,
        'status',f.status,'homeGoals',f.home_goals,'awayGoals',f.away_goals) order by f.commence_time,f.event_id)
      from public.gtl_epl_fixtures f where f.season=w.season and f.week=w.week),'[]'::jsonb),
    'announcement',(select jsonb_build_object('announcedAt',a.announced_at,'notify',a.notify) from public.gtl_epl_result_announcements a
      where a.season=w.season and a.week=w.week),
    'reads',coalesce((select jsonb_agg(jsonb_build_object('attempt',r.attempt,'reservedAt',r.reserved_at) order by r.attempt)
      from public.gtl_epl_final_result_reads r where r.season=w.season and r.week=w.week),'[]'::jsonb),
    'budget',jsonb_build_object('remaining',v_remaining,'paused',coalesce(v_paused,false)));
end $$;

-- One bounded final-match scores read. Serialised on the week row; refused (no credit taken) once announced, with no
-- scheduled fixture left, before the attempt's offset after the latest scheduled kickoff, within 30 minutes of the last
-- read, after four reads, or when the shared budget would fall below its 50-credit reserve.
create or replace function public.gtl_epl_reserve_final_result_read(p_run uuid,p_claim uuid,p_season integer,p_week integer,p_now timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz:=coalesce(p_now,clock_timestamp()); offsets integer[]:=array[150,200,300,720];
  anchor timestamptz; used integer; last_read timestamptz; reservation jsonb;
begin
  if not exists(select 1 from public.gtl_epl_job_runs where id=p_run and claim_token=p_claim and status='running' and job='results') then
    raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001'; end if;
  perform 1 from public.gtl_epl_weeks where season=p_season and week=p_week and status<>'open' for update;
  if not found then raise exception 'GTL_EPL_NO_WEEK' using errcode='P0001'; end if;
  if exists(select 1 from public.gtl_epl_final_result_reads where run_id=p_run) then return jsonb_build_object('ok',false,'reason','already_reserved'); end if;
  if exists(select 1 from public.gtl_epl_result_announcements where season=p_season and week=p_week) then return jsonb_build_object('ok',false,'reason','announced'); end if;
  select max(commence_time) into anchor from public.gtl_epl_fixtures where season=p_season and week=p_week and status='scheduled';
  if anchor is null then return jsonb_build_object('ok',false,'reason','nothing_due'); end if;
  select count(*),max(reserved_at) into used,last_read from public.gtl_epl_final_result_reads where season=p_season and week=p_week;
  if used>=cardinality(offsets) then return jsonb_build_object('ok',false,'reason','limit'); end if;
  if stamp<anchor+make_interval(mins=>offsets[used+1]) then
    return jsonb_build_object('ok',false,'reason','not_due','dueAt',anchor+make_interval(mins=>offsets[used+1])); end if;
  if last_read is not null and stamp<last_read+interval '30 minutes' then return jsonb_build_object('ok',false,'reason','spacing'); end if;
  reservation:=public.gtl_epl_reserve_credits(p_run,p_claim,2);
  if reservation->'ok' is distinct from 'true'::jsonb then
    return jsonb_build_object('ok',false,'reason',case when reservation->>'remaining' is null then 'budget_unknown' else 'budget_guard' end);
  end if;
  insert into public.gtl_epl_final_result_reads(run_id,season,week,attempt,reserved_at) values(p_run,p_season,p_week,used+1,stamp);
  return jsonb_build_object('ok',true,'attempt',used+1,'remaining',reservation->'remaining');
end $$;

-- Records the matchweek's announcement once, from the stored rows alone: every fixture final with whole goals or
-- postponed, and every drafted club with a first match. The winners are computed here with the settleBonus rules (first
-- match per club; widest winning margin, then more goals scored, then fewer conceded; every tied manager wins; a draw,
-- loss or postponement wins nothing). In the same transaction it claims one delivery per linked league member with an
-- active push subscription, and returns those subscriptions only to the call that recorded the announcement. A
-- notification is offered only within three days of the week's last kickoff, so an older week is announced on screen
-- without a late push.
create or replace function public.gtl_epl_record_result_announcement(p_run uuid,p_claim uuid,p_season integer,p_week integer,p_now timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz:=coalesce(p_now,clock_timestamp()); v_total integer; v_postponed integer; v_ready integer; v_last timestamptz;
  v_winners jsonb; v_notify boolean; n integer;
begin
  if not exists(select 1 from public.gtl_epl_job_runs where id=p_run and claim_token=p_claim and status='running' and job='results') then
    raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001'; end if;
  perform 1 from public.gtl_epl_weeks where season=p_season and week=p_week and status<>'open' for update;
  if not found then raise exception 'GTL_EPL_NO_WEEK' using errcode='P0001'; end if;
  if exists(select 1 from public.gtl_epl_result_announcements where season=p_season and week=p_week) then
    return jsonb_build_object('recorded',false,'reason','announced','subscriptions','[]'::jsonb); end if;
  select count(*),count(*) filter(where status='postponed'),
      count(*) filter(where status='postponed' or (status='final' and home_goals is not null and away_goals is not null)),
      coalesce(max(commence_time) filter(where status<>'postponed'),max(commence_time))
    into v_total,v_postponed,v_ready,v_last from public.gtl_epl_fixtures where season=p_season and week=p_week;
  if v_total=0 or v_ready<v_total then return jsonb_build_object('recorded',false,'reason','pending','subscriptions','[]'::jsonb); end if;
  with sides as (
    select f.home club,f.event_id,f.commence_time,f.status,f.home_goals gf,f.away_goals ga,f.away opponent,true home
      from public.gtl_epl_fixtures f where f.season=p_season and f.week=p_week
    union all
    select f.away,f.event_id,f.commence_time,f.status,f.away_goals,f.home_goals,f.home,false
      from public.gtl_epl_fixtures f where f.season=p_season and f.week=p_week),
  firsts as (select distinct on (s.club) s.* from sides s order by s.club,s.commence_time,s.event_id collate "C"),
  drafted as (select k.owner_id,k.club,c.status,c.gf,c.ga,c.opponent,c.home from public.gtl_epl_picks k
    left join firsts c on c.club=k.club where k.season=p_season and k.week=p_week and k.club is not null)
  select case when exists(select 1 from drafted where status is null) then null else coalesce((
    select jsonb_agg(jsonb_build_object('ownerId',d.owner_id,'club',d.club,'opponent',d.opponent,'home',d.home,'goalsFor',d.gf,
      'goalsAgainst',d.ga,'margin',d.gf-d.ga,'bonus',(d.gf-d.ga)*5) order by d.owner_id)
    from drafted d where d.status='final' and d.gf>d.ga and (d.gf-d.ga,d.gf,-d.ga)=(
      select x.gf-x.ga,x.gf,-x.ga from drafted x where x.status='final' and x.gf>x.ga
        order by x.gf-x.ga desc,x.gf desc,x.ga asc limit 1)),'[]'::jsonb) end into v_winners;
  if v_winners is null then return jsonb_build_object('recorded',false,'reason','pending','subscriptions','[]'::jsonb); end if;
  v_notify:=stamp<=v_last+interval '3 days';
  insert into public.gtl_epl_result_announcements(season,week,announced_at,run_id,winners,fixtures,postponed,notify)
    values(p_season,p_week,stamp,p_run,v_winners,v_total,v_postponed,v_notify) on conflict(season,week) do nothing;
  get diagnostics n=row_count;
  if n=0 then return jsonb_build_object('recorded',false,'reason','announced','subscriptions','[]'::jsonb); end if;
  if not v_notify then return jsonb_build_object('recorded',true,'notify',false,'winners',v_winners,'members',0,'subscriptions','[]'::jsonb); end if;
  with claimed as (
    insert into public.gtl_epl_result_deliveries(season,week,owner_id,run_id,claimed_at)
      select p_season,p_week,m.owner_id,p_run,stamp from public.gtl_epl_managers m
        where m.user_id is not null and exists(select 1 from public.gtl_push_subscriptions x where x.user_id=m.user_id and x.disabled_at is null)
      on conflict do nothing returning owner_id)
  select jsonb_build_object('recorded',true,'notify',true,'winners',v_winners,'members',(select count(*) from claimed),
    'subscriptions',coalesce((select jsonb_agg(jsonb_build_object('endpoint',x.endpoint,'p256dh',x.p256dh,'auth',x.auth) order by c.owner_id,x.created_at,x.endpoint)
      from claimed c join public.gtl_epl_managers m on m.owner_id=c.owner_id
      join public.gtl_push_subscriptions x on x.user_id=m.user_id and x.disabled_at is null),'[]'::jsonb)) into v_winners;
  return v_winners;
end $$;

revoke all on function public.gtl_epl_results_state(uuid,uuid),
  public.gtl_epl_reserve_final_result_read(uuid,uuid,integer,integer,timestamptz),
  public.gtl_epl_record_result_announcement(uuid,uuid,integer,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_epl_results_state(uuid,uuid),
  public.gtl_epl_reserve_final_result_read(uuid,uuid,integer,integer,timestamptz),
  public.gtl_epl_record_result_announcement(uuid,uuid,integer,integer,timestamptz) to service_role;
