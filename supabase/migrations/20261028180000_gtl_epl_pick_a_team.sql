-- M-30 epl_pick_a_team (EPL design, Plan 1): the Premier League "Pick a Team" weekly club draft. Eight managers (the
-- Sleeper FEPL league) pick one club each per matchweek in a snake-style order; a club can be picked by one manager a
-- week; the managers' picks, the fixtures and prices behind them, the weekly bonus and the Sleeper snapshots are stored
-- here. The pure rules live in shared/epl-*.mjs; this file is only the durable, serialised store and its service RPCs.
--
-- What it adds (nothing existing is changed or replaced):
-- * gtl_epl_managers (the eight owners, optionally linked to an account), gtl_epl_snapshots (saved Sleeper season-total
--   snapshots, unique by label), gtl_epl_weeks (a week's window, first kickoff, pick order and status), gtl_epl_fixtures,
--   gtl_epl_prices, gtl_epl_picks (one row per manager per week; unique (season, week, club) so a club cannot be taken
--   twice, whatever the caller does), gtl_epl_pick_history (append-only: every pick and change is kept, D-23),
--   gtl_epl_queues (a manager's private ranked list of clubs), gtl_epl_bonus, the scheduled-job pair
--   gtl_epl_jobs_schedule / gtl_epl_job_runs (same shape as 20261009150000's week-open schedule; every schedule row
--   defaults to disabled and this file registers no cron job) and gtl_epl_nudges (one turn push per manager turn).
-- * The gtl-epl-jobs run queue (plan Task 5): gtl_epl_dispatch_jobs (cron only, never granted), gtl_epl_claim_job,
--   gtl_epl_complete_job, the worker's reads gtl_epl_jobs_state and gtl_epl_read_snapshots, gtl_epl_reserve_credits and
--   gtl_epl_record_quota on the Odds API budget NFL already keeps (gtl_odds_budget; never below the 50-credit reserve), and
--   gtl_epl_mark_nudge. They read gtl_odds_budget and gtl_push_subscriptions, which earlier migrations created.
-- * gtl_epl_member, gtl_epl_save_pick (the one writer of a manager's pick: it locks the week row, so concurrent picks
--   serialise, and re-checks the deadline, the turn and the club in SQL), gtl_epl_save_queue, gtl_epl_week_state
--   (the public state; queues are private and never included), and the jobs worker's writers: gtl_epl_upsert_fixtures,
--   gtl_epl_upsert_prices, gtl_epl_resolve_week, gtl_epl_settle_week, gtl_epl_save_snapshot, gtl_epl_link_manager,
--   gtl_epl_seed_week, gtl_epl_set_week_window, gtl_epl_flag_week_review (a resolved week whose drafted result can no
--   longer be read becomes needs_review instead of settling) and gtl_epl_set_fixture_status (the commissioner postpones or
--   restores a match; a fixture never becomes postponed only because a feed stopped listing it).
--
-- Apply order is the M-ledger in docs/REDESIGN_BUILD_PLAN.md section 6 (M-30 after M-29), not the file name or timestamp.
-- p_now on gtl_epl_save_pick is a service-side clock for gtl-api and the tests only: it must never come from a client
-- (cloud/epl.mjs passes its own clock; no browser role can call any of these functions). Rerunnable: tables and indexes are created only if missing,
-- every function is create or replace with this exact argument list, every grant is restated, and the manager seed rows
-- are inserted with on conflict do nothing. Every table and function is service-role only; no browser role gets
-- anything, and no policy exists. Nothing is dropped, deleted or truncated. Off switch: the schedule row stays
-- enabled=false (no job runs) and the API route is simply not called; no rollback file is needed because this file
-- replaces no existing function (Gate M step 9). No hosted action is performed by this file.

create table if not exists public.gtl_epl_managers (
  owner_id text primary key check(owner_id ~ '^[0-9]{1,30}$'),
  sleeper_name text not null,
  name text not null,
  user_id uuid references auth.users(id),
  linked_by uuid,
  linked_at timestamptz
);
create unique index if not exists gtl_epl_managers_user_idx on public.gtl_epl_managers(user_id) where user_id is not null;

create table if not exists public.gtl_epl_snapshots (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null,
  label text not null,
  week integer,
  sha256 jsonb,
  payload jsonb not null,
  unique(label)
);

create table if not exists public.gtl_epl_weeks (
  season integer not null check(season between 2000 and 2200),
  week integer not null check(week between 1 and 38),
  window_start timestamptz not null,
  window_end timestamptz not null,
  first_kickoff timestamptz not null,
  pick_order text[] not null check(cardinality(pick_order)>=1),
  status text not null default 'open' check(status in ('open','resolved','needs_review','settled')),
  seeded boolean not null default false,
  primary key(season,week)
);

create table if not exists public.gtl_epl_fixtures (
  event_id text primary key,
  season integer not null check(season between 2000 and 2200),
  week integer not null check(week between 1 and 38),
  home text not null,
  away text not null,
  commence_time timestamptz not null,
  status text not null default 'scheduled' check(status in ('scheduled','final','postponed')),
  home_goals integer check(home_goals is null or home_goals>=0),
  away_goals integer check(away_goals is null or away_goals>=0),
  updated_at timestamptz not null default clock_timestamp()
);
create index if not exists gtl_epl_fixtures_week_idx on public.gtl_epl_fixtures(season,week);

create table if not exists public.gtl_epl_prices (
  event_id text not null,
  club text not null,
  market text not null check(market in ('h2h','draw_no_bet')),
  price numeric not null,
  observed_at timestamptz not null,
  primary key(event_id,club,market)
);

-- club is null for a manager who made no pick ('none'). unique (season, week, club) is the rule that a club is taken once.
create table if not exists public.gtl_epl_picks (
  season integer not null,
  week integer not null,
  owner_id text not null,
  club text,
  source text not null default 'pick' check(source in ('pick','queue','auto','none','seeded')),
  picked_at timestamptz not null default clock_timestamp(),
  final boolean not null default false,
  primary key(season,week,owner_id),
  unique (season, week, club),
  foreign key(season,week) references public.gtl_epl_weeks(season,week)
);

create table if not exists public.gtl_epl_pick_history (
  id bigint generated always as identity primary key,
  season integer not null,
  week integer not null,
  owner_id text not null,
  club text,
  action text not null,
  at timestamptz not null default clock_timestamp()
);
create index if not exists gtl_epl_pick_history_week_idx on public.gtl_epl_pick_history(season,week,id);

create table if not exists public.gtl_epl_queues (
  season integer not null,
  week integer not null,
  owner_id text not null,
  clubs text[] not null default '{}' check(cardinality(clubs)<=20),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(season,week,owner_id)
);

create table if not exists public.gtl_epl_bonus (
  season integer not null,
  week integer not null,
  owner_id text not null,
  points integer not null,
  margin integer,
  club text,
  primary key(season,week,owner_id)
);

-- Scheduled jobs (the gtl-epl-jobs worker, cloud/epl-jobs.mjs): one schedule row per job, each disabled until an
-- administrator enables it (supabase/admin/epl_jobs_cron.sql). A run is queued per job and five-minute slot with a one-run
-- capability (only its hash is kept), the 20261009150000 week-open pattern.
create table if not exists public.gtl_epl_jobs_schedule (
  job text primary key check(job in ('snapshot','fixtures','resolve','settle','nudge')),
  enabled boolean not null default false,
  endpoint text check(endpoint is null or endpoint ~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/gtl-epl-jobs$'),
  authorized_by text
);
create table if not exists public.gtl_epl_job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  slot_start timestamptz not null,
  capability_hash text not null check(capability_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'queued' check(status in ('queued','running','succeeded','skipped','failed')),
  reason text,
  claim_token uuid,
  claimed_at timestamptz,
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  detail jsonb not null default '{}' check(jsonb_typeof(detail)='object'),
  unique(job,slot_start)
);
create index if not exists gtl_epl_job_runs_job_idx on public.gtl_epl_job_runs(job,started_at desc);

-- One turn notification per manager turn: the key is season-week-ownerId-pickCount, written before the push is sent so a
-- retry or an overlapping run never sends it twice.
create table if not exists public.gtl_epl_nudges (
  key text primary key check(key ~ '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,30}-[0-9]{1,2}$'),
  season integer not null,
  week integer not null,
  owner_id text not null,
  run_id uuid,
  sent_at timestamptz not null default clock_timestamp()
);

alter table public.gtl_epl_managers enable row level security;
alter table public.gtl_epl_snapshots enable row level security;
alter table public.gtl_epl_weeks enable row level security;
alter table public.gtl_epl_fixtures enable row level security;
alter table public.gtl_epl_prices enable row level security;
alter table public.gtl_epl_picks enable row level security;
alter table public.gtl_epl_pick_history enable row level security;
alter table public.gtl_epl_queues enable row level security;
alter table public.gtl_epl_bonus enable row level security;
alter table public.gtl_epl_jobs_schedule enable row level security;
alter table public.gtl_epl_job_runs enable row level security;
alter table public.gtl_epl_nudges enable row level security;
revoke all on public.gtl_epl_managers,public.gtl_epl_snapshots,public.gtl_epl_weeks,public.gtl_epl_fixtures,public.gtl_epl_prices,
  public.gtl_epl_picks,public.gtl_epl_pick_history,public.gtl_epl_queues,public.gtl_epl_bonus,public.gtl_epl_jobs_schedule,
  public.gtl_epl_job_runs,public.gtl_epl_nudges from public,anon,authenticated,service_role;
-- No delete for anyone the API runs as (D-23); the history is append-only.
grant select,insert,update on public.gtl_epl_managers,public.gtl_epl_weeks,public.gtl_epl_fixtures,public.gtl_epl_prices,
  public.gtl_epl_picks,public.gtl_epl_queues,public.gtl_epl_bonus to service_role;
grant select,insert on public.gtl_epl_snapshots,public.gtl_epl_pick_history,public.gtl_epl_nudges to service_role;
grant select on public.gtl_epl_jobs_schedule to service_role;
-- A run's job, slot and capability hash are written only by the cron dispatcher; the service role may move its state.
grant select on public.gtl_epl_job_runs to service_role;
grant update(status,reason,claim_token,claimed_at,finished_at,detail) on public.gtl_epl_job_runs to service_role;

-- The eight Sleeper FEPL managers (Sleeper user_id, Sleeper display name, first name).
insert into public.gtl_epl_managers(owner_id,sleeper_name,name) values
  ('719658248843632640','NLGooner','Evan'),
  ('473955676301815808','seanbalz','Sean'),
  ('702644837370929152','sthomas111','Steven'),
  ('1259267898757611520','steezyc9','Cullen'),
  ('1395236217460633600','Freudian','Darin'),
  ('1257180071064510465','LFCRed','Mark'),
  ('865667912365666304','nemoheye','Nemo'),
  ('719745569895018496','aharrison2','Adam')
on conflict (owner_id) do nothing;

-- The caller's EPL identity: the linked manager's owner_id, else 'commissioner' for the league commissioner, else null.
create or replace function public.gtl_epl_member(p_user uuid) returns text
language plpgsql stable security invoker set search_path='' as $$
declare owner text;
begin
  if p_user is null then return null; end if;
  select m.owner_id into owner from public.gtl_epl_managers m where m.user_id=p_user;
  if found then return owner; end if;
  if exists(select 1 from public.gtl_memberships where user_id=p_user and league_id='sean-troy-luke' and role='commissioner' and active) then return 'commissioner'; end if;
  return null;
end $$;

-- The pick state of a week as everyone sees it (queues are private and never included).
create or replace function public.gtl_epl_week_state(p_season integer,p_week integer) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare w public.gtl_epl_weeks;
begin
  select * into w from public.gtl_epl_weeks where season=p_season and week=p_week;
  if not found then return null; end if;
  return jsonb_build_object('season',p_season,'week',p_week,
    'weekRow',jsonb_build_object('windowStart',w.window_start,'windowEnd',w.window_end,'firstKickoff',w.first_kickoff,
      'pickOrder',to_jsonb(w.pick_order),'status',w.status,'seeded',w.seeded),
    'picks',coalesce((select jsonb_agg(jsonb_build_object('ownerId',k.owner_id,'club',k.club,'source',k.source,'pickedAt',k.picked_at,'final',k.final)
        order by coalesce(array_position(w.pick_order,k.owner_id),99),k.owner_id)
      from public.gtl_epl_picks k where k.season=p_season and k.week=p_week),'[]'::jsonb),
    'fixtures',coalesce((select jsonb_agg(jsonb_build_object('eventId',f.event_id,'home',f.home,'away',f.away,'commenceTime',f.commence_time,
        'status',f.status,'homeGoals',f.home_goals,'awayGoals',f.away_goals) order by f.commence_time,f.event_id)
      from public.gtl_epl_fixtures f where f.season=p_season and f.week=p_week),'[]'::jsonb),
    'bonus',coalesce((select jsonb_agg(jsonb_build_object('ownerId',b.owner_id,'points',b.points,'margin',b.margin,'club',b.club) order by b.owner_id)
      from public.gtl_epl_bonus b where b.season=p_season and b.week=p_week-1),'[]'::jsonb));
end $$;

-- A manager's pick, or the most recent picker's change while the next manager has not picked. Everything is re-checked
-- here under a row lock on the week, so concurrent picks serialise and the browser's view is never trusted.
create or replace function public.gtl_epl_save_pick(p_user uuid,p_season integer,p_week integer,p_club text,p_now timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare now_at timestamptz:=coalesce(p_now,clock_timestamp()); w public.gtl_epl_weeks; v_owner text; v_club text:=btrim(p_club);
  cur_idx integer; last_idx integer; idx integer; act text; prior text; prior_final boolean;
begin
  select * into w from public.gtl_epl_weeks where season=p_season and week=p_week for update;
  if not found then raise exception 'GTL_EPL_NO_WEEK' using errcode='P0001'; end if;
  if w.status<>'open' or now_at>=w.first_kickoff then raise exception 'GTL_EPL_DRAFT_CLOSED' using errcode='P0001'; end if;
  v_owner:=public.gtl_epl_member(p_user);
  idx:=case when v_owner is null or v_owner='commissioner' then null else array_position(w.pick_order,v_owner) end;
  if idx is null then raise exception 'GTL_EPL_NOT_YOUR_TURN' using errcode='P0001'; end if;
  -- The current picker is the first manager in the order without a pick; the most recent picker is the one before them.
  select min(i) into cur_idx from generate_subscripts(w.pick_order,1) as i
    where not exists(select 1 from public.gtl_epl_picks k where k.season=p_season and k.week=p_week and k.owner_id=w.pick_order[i]);
  last_idx:=case when cur_idx is null then cardinality(w.pick_order) else cur_idx-1 end;
  if cur_idx is not null and idx=cur_idx then act:='pick';
  elsif last_idx>=1 and idx=last_idx then act:='change';
  else raise exception 'GTL_EPL_NOT_YOUR_TURN' using errcode='P0001'; end if;
  if v_club is null or v_club='' or not exists(select 1 from public.gtl_epl_fixtures f where f.season=p_season and f.week=p_week
      and f.status<>'postponed' and (f.home=v_club or f.away=v_club)) then raise exception 'GTL_EPL_CLUB_NOT_PLAYING' using errcode='P0001'; end if;
  begin
    if act='pick' then
      insert into public.gtl_epl_picks(season,week,owner_id,club,source,picked_at,final) values(p_season,p_week,v_owner,v_club,'pick',now_at,false);
      -- The previous manager's pick can no longer change once the next manager has picked.
      if idx>1 then update public.gtl_epl_picks set final=true where season=p_season and week=p_week and owner_id=w.pick_order[idx-1]; end if;
    else
      select k.club,k.final into prior,prior_final from public.gtl_epl_picks k where k.season=p_season and k.week=p_week and k.owner_id=v_owner;
      -- A final pick never changes (a seeded week can hold the latest picker's pick as final).
      if prior_final then raise exception 'GTL_EPL_NOT_YOUR_TURN' using errcode='P0001'; end if;
      if prior is distinct from v_club then
        update public.gtl_epl_picks set club=v_club,picked_at=now_at,source='pick' where season=p_season and week=p_week and owner_id=v_owner;
      else act:='unchanged'; end if;
    end if;
  exception when unique_violation then raise exception 'GTL_EPL_CLUB_TAKEN' using errcode='P0001';
  end;
  if act<>'unchanged' then
    insert into public.gtl_epl_pick_history(season,week,owner_id,club,action,at) values(p_season,p_week,v_owner,v_club,act,now_at);
  end if;
  return jsonb_build_object('season',p_season,'week',p_week,'ownerId',v_owner,'club',v_club,'action',act,
    'picks',(public.gtl_epl_week_state(p_season,p_week))->'picks');
end $$;

-- A manager's private ranked list of clubs for a week (kept in the order sent, at most 20 distinct).
create or replace function public.gtl_epl_save_queue(p_user uuid,p_season integer,p_week integer,p_clubs text[]) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare owner text:=public.gtl_epl_member(p_user); list text[];
begin
  if owner is null or owner='commissioner' then raise exception 'GTL_EPL_NOT_MEMBER' using errcode='P0001'; end if;
  if not exists(select 1 from public.gtl_epl_weeks where season=p_season and week=p_week) then raise exception 'GTL_EPL_NO_WEEK' using errcode='P0001'; end if;
  select coalesce(array_agg(c order by first_pos),'{}') into list from (
    select btrim(x) as c,min(n) as first_pos from unnest(coalesce(p_clubs,'{}')) with ordinality as t(x,n) where btrim(x)<>'' group by btrim(x)) q;
  if cardinality(list)>20 then raise exception 'GTL_EPL_QUEUE_INVALID' using errcode='P0001'; end if;
  insert into public.gtl_epl_queues(season,week,owner_id,clubs,updated_at) values(p_season,p_week,owner,list,clock_timestamp())
    on conflict(season,week,owner_id) do update set clubs=excluded.clubs,updated_at=excluded.updated_at;
  return jsonb_build_object('season',p_season,'week',p_week,'ownerId',owner,'clubs',to_jsonb(list));
end $$;

-- Jobs-worker writers. p_rows: [{ event_id, season, week, home, away, commence_time, status, home_goals, away_goals }].
create or replace function public.gtl_epl_upsert_fixtures(p_rows jsonb) returns integer
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
  insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time,status,home_goals,away_goals,updated_at)
    select r.event_id,r.season,r.week,r.home,r.away,r.commence_time,coalesce(r.status,'scheduled'),r.home_goals,r.away_goals,clock_timestamp()
    from jsonb_to_recordset(p_rows) as r(event_id text,season integer,week integer,home text,away text,commence_time timestamptz,status text,home_goals integer,away_goals integer)
    on conflict(event_id) do update set season=excluded.season,week=excluded.week,home=excluded.home,away=excluded.away,
      commence_time=excluded.commence_time,status=excluded.status,home_goals=excluded.home_goals,away_goals=excluded.away_goals,updated_at=excluded.updated_at;
  get diagnostics n=row_count;
  return n;
end $$;

-- p_rows: [{ event_id, club, market, price, observed_at }].
create or replace function public.gtl_epl_upsert_prices(p_rows jsonb) returns integer
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
  insert into public.gtl_epl_prices(event_id,club,market,price,observed_at)
    select r.event_id,r.club,r.market,r.price,r.observed_at
    from jsonb_to_recordset(p_rows) as r(event_id text,club text,market text,price numeric,observed_at timestamptz)
    on conflict(event_id,club,market) do update set price=excluded.price,observed_at=excluded.observed_at;
  get diagnostics n=row_count;
  return n;
end $$;

-- After the first kickoff (the database clock, never a caller's): p_rows [{ owner_id, club|null, source }] fills in managers
-- who did not pick (queue or auto with a club playing that week, none without a club), every pick becomes final and the week
-- is resolved. A manager who already picked keeps their pick; rerunning adds nothing. Every row is checked before any write.
create or replace function public.gtl_epl_resolve_week(p_season integer,p_week integer,p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare w public.gtl_epl_weeks; r record; added integer:=0; stamp timestamptz:=clock_timestamp();
begin
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
  select * into w from public.gtl_epl_weeks where season=p_season and week=p_week for update;
  if not found then raise exception 'GTL_EPL_NO_WEEK' using errcode='P0001'; end if;
  if stamp<w.first_kickoff then raise exception 'GTL_EPL_NOT_DUE' using errcode='P0001'; end if;
  for r in select x.owner_id,x.club,x.source from jsonb_to_recordset(p_rows) as x(owner_id text,club text,source text) loop
    if r.owner_id is null or not (r.owner_id=any(w.pick_order)) or r.source is null or r.source not in ('queue','auto','none')
      or (r.source='none') <> (r.club is null) then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
    if r.club is not null and not exists(select 1 from public.gtl_epl_fixtures f where f.season=p_season and f.week=p_week
        and f.status<>'postponed' and (f.home=r.club or f.away=r.club)) then raise exception 'GTL_EPL_CLUB_NOT_PLAYING' using errcode='P0001'; end if;
  end loop;
  for r in select x.owner_id,x.club,x.source from jsonb_to_recordset(p_rows) as x(owner_id text,club text,source text) loop
    continue when exists(select 1 from public.gtl_epl_picks k where k.season=p_season and k.week=p_week and k.owner_id=r.owner_id);
    begin
      insert into public.gtl_epl_picks(season,week,owner_id,club,source,picked_at,final) values(p_season,p_week,r.owner_id,r.club,r.source,stamp,true);
    exception when unique_violation then raise exception 'GTL_EPL_CLUB_TAKEN' using errcode='P0001';
    end;
    insert into public.gtl_epl_pick_history(season,week,owner_id,club,action,at) values(p_season,p_week,r.owner_id,r.club,'resolve:'||r.source,stamp);
    added:=added+1;
  end loop;
  update public.gtl_epl_picks set final=true where season=p_season and week=p_week and not final;
  if w.status='open' then update public.gtl_epl_weeks set status='resolved' where season=p_season and week=p_week; end if;
  return jsonb_build_object('season',p_season,'week',p_week,'added',added,'status',case when w.status='open' then 'resolved' else w.status end);
end $$;

-- p_awards [{ owner_id, points, margin, club }] for the resolved (or needs_review) week; p_next { week, window_start, window_end, first_kickoff, pick_order }
-- opens the following week. Both are on conflict do nothing, so a rerun changes nothing.
create or replace function public.gtl_epl_settle_week(p_season integer,p_week integer,p_awards jsonb,p_next jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare w public.gtl_epl_weeks; awarded integer; opened integer:=0;
begin
  if p_awards is null or jsonb_typeof(p_awards)<>'array' or (p_next is not null and jsonb_typeof(p_next) not in ('object','null')) then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
  select * into w from public.gtl_epl_weeks where season=p_season and week=p_week for update;
  if not found then raise exception 'GTL_EPL_NO_WEEK' using errcode='P0001'; end if;
  if w.status='open' then raise exception 'GTL_EPL_NOT_RESOLVED' using errcode='P0001'; end if;
  insert into public.gtl_epl_bonus(season,week,owner_id,points,margin,club)
    select p_season,p_week,r.owner_id,r.points,r.margin,r.club
    from jsonb_to_recordset(p_awards) as r(owner_id text,points integer,margin integer,club text)
    on conflict(season,week,owner_id) do nothing;
  get diagnostics awarded=row_count;
  update public.gtl_epl_weeks set status='settled' where season=p_season and week=p_week;
  if p_next is not null and jsonb_typeof(p_next)='object' then
    insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order,status)
      values(p_season,(p_next->>'week')::integer,(p_next->>'window_start')::timestamptz,(p_next->>'window_end')::timestamptz,
        (p_next->>'first_kickoff')::timestamptz,(select array_agg(x order by n) from jsonb_array_elements_text(p_next->'pick_order') with ordinality as t(x,n)),'open')
      on conflict(season,week) do nothing;
    get diagnostics opened=row_count;
  end if;
  return jsonb_build_object('season',p_season,'week',p_week,'awarded',awarded,'nextOpened',opened>0);
end $$;

-- One Sleeper snapshot per label; a repeat is ignored. Returns true when it was saved.
create or replace function public.gtl_epl_save_snapshot(p_label text,p_captured_at timestamptz,p_week integer,p_sha256 jsonb,p_payload jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  if p_label is null or btrim(p_label)='' or p_captured_at is null or p_payload is null then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
  insert into public.gtl_epl_snapshots(captured_at,label,week,sha256,payload) values(p_captured_at,p_label,p_week,p_sha256,p_payload)
    on conflict(label) do nothing;
  get diagnostics n=row_count;
  return n>0;
end $$;

-- The commissioner links an account to a manager, or unlinks the manager with p_user null (p_by is checked here too, so a
-- caller cannot link on their own say-so). Unlinking keeps the manager row and every pick; it only clears the account.
create or replace function public.gtl_epl_link_manager(p_owner_id text,p_user uuid,p_by uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
  if p_by is null or not exists(select 1 from public.gtl_memberships where user_id=p_by and league_id='sean-troy-luke' and role='commissioner' and active) then raise exception 'GTL_EPL_FORBIDDEN' using errcode='P0001'; end if;
  begin
    update public.gtl_epl_managers set user_id=p_user,linked_by=p_by,linked_at=clock_timestamp() where owner_id=p_owner_id;
  exception when unique_violation then raise exception 'GTL_EPL_ALREADY_LINKED' using errcode='P0001';
  end;
  if not found then raise exception 'GTL_EPL_UNKNOWN_MANAGER' using errcode='P0001'; end if;
  return jsonb_build_object('ownerId',p_owner_id,'userId',p_user);
end $$;

-- Opens a week that began before the app did (the first live week), with the picks already made elsewhere. Allowed only
-- while no real in-app pick exists for the week; seeded picks have source 'seeded' and are final except the latest one.
-- p_picks [{ owner_id, club, picked_at }].
create or replace function public.gtl_epl_seed_week(p_season integer,p_week integer,p_window_start timestamptz,p_window_end timestamptz,
  p_first_kickoff timestamptz,p_order text[],p_picks jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r record; total integer; n integer:=0; stamp timestamptz:=clock_timestamp();
begin
  if p_order is null or cardinality(p_order)<1 or p_picks is null or jsonb_typeof(p_picks)<>'array' then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('gtl_epl_seed_week'));
  if exists(select 1 from public.gtl_epl_picks k where k.season=p_season and k.week=p_week and k.source<>'seeded') then raise exception 'GTL_EPL_SEED_REFUSED' using errcode='P0001'; end if;
  if exists(select 1 from public.gtl_epl_weeks where season=p_season and week=p_week and not seeded) then raise exception 'GTL_EPL_SEED_REFUSED' using errcode='P0001'; end if;
  insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order,status,seeded)
    values(p_season,p_week,p_window_start,p_window_end,p_first_kickoff,p_order,'open',true)
    on conflict(season,week) do update set window_start=excluded.window_start,window_end=excluded.window_end,first_kickoff=excluded.first_kickoff,pick_order=excluded.pick_order;
  total:=jsonb_array_length(p_picks);
  for r in select x.owner_id,x.club,x.picked_at,x.ord from rows from (jsonb_to_recordset(p_picks) as (owner_id text,club text,picked_at timestamptz)) with ordinality as x(owner_id,club,picked_at,ord) order by x.ord loop
    if r.owner_id is null or not (r.owner_id=any(p_order)) or r.club is null then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
    begin
      insert into public.gtl_epl_picks(season,week,owner_id,club,source,picked_at,final)
        values(p_season,p_week,r.owner_id,r.club,'seeded',coalesce(r.picked_at,stamp),r.ord<total)
        on conflict(season,week,owner_id) do update set club=excluded.club,picked_at=excluded.picked_at,final=excluded.final;
    exception when unique_violation then raise exception 'GTL_EPL_CLUB_TAKEN' using errcode='P0001';
    end;
    insert into public.gtl_epl_pick_history(season,week,owner_id,club,action,at) values(p_season,p_week,r.owner_id,r.club,'seed',stamp);
    n:=n+1;
  end loop;
  return jsonb_build_object('season',p_season,'week',p_week,'seeded',n);
end $$;

-- The commissioner corrects a week's fixture window (the jobs worker takes the events with commence_time in
-- [window_start, window_end)) and, when given, its first kickoff, for any week still open, seeded or not, whatever picks
-- it has. The order and the picks are never touched here (gtl_epl_seed_week is the only writer of those).
create or replace function public.gtl_epl_set_week_window(p_season integer,p_week integer,p_window_start timestamptz,p_window_end timestamptz,
  p_first_kickoff timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare w public.gtl_epl_weeks;
begin
  if p_window_start is null or p_window_end is null or p_window_end<=p_window_start then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
  select * into w from public.gtl_epl_weeks where season=p_season and week=p_week for update;
  if not found then raise exception 'GTL_EPL_NO_WEEK' using errcode='P0001'; end if;
  if w.status<>'open' then raise exception 'GTL_EPL_DRAFT_CLOSED' using errcode='P0001'; end if;
  update public.gtl_epl_weeks set window_start=p_window_start,window_end=p_window_end,first_kickoff=coalesce(p_first_kickoff,w.first_kickoff)
    where season=p_season and week=p_week returning * into w;
  return jsonb_build_object('season',p_season,'week',p_week,'windowStart',w.window_start,'windowEnd',w.window_end,'firstKickoff',w.first_kickoff);
end $$;

-- The jobs worker flags a resolved week whose drafted match is still unresolved once the scores feed can no longer report it:
-- the fixture stays scheduled and the week waits for the commissioner (gtl_epl_set_fixture_status) instead of settling with
-- a guessed postponement. Any other status is returned unchanged.
create or replace function public.gtl_epl_flag_week_review(p_season integer,p_week integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare w public.gtl_epl_weeks;
begin
  select * into w from public.gtl_epl_weeks where season=p_season and week=p_week for update;
  if not found then raise exception 'GTL_EPL_NO_WEEK' using errcode='P0001'; end if;
  if w.status='resolved' then
    update public.gtl_epl_weeks set status='needs_review' where season=p_season and week=p_week returning * into w;
  end if;
  return jsonb_build_object('season',p_season,'week',p_week,'status',w.status);
end $$;

-- The commissioner marks a match postponed (a club whose match is postponed scores 0, spec 6.4) or scheduled again. p_by is
-- checked here, like gtl_epl_link_manager. A final result and any match of a settled week are never changed.
create or replace function public.gtl_epl_set_fixture_status(p_event_id text,p_status text,p_by uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare f public.gtl_epl_fixtures; v_week text;
begin
  if p_by is null or not exists(select 1 from public.gtl_memberships where user_id=p_by and league_id='sean-troy-luke' and role='commissioner' and active) then raise exception 'GTL_EPL_FORBIDDEN' using errcode='P0001'; end if;
  if p_status is null or p_status not in ('postponed','scheduled') then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
  select * into f from public.gtl_epl_fixtures where event_id=p_event_id for update;
  if not found then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
  select w.status into v_week from public.gtl_epl_weeks w where w.season=f.season and w.week=f.week for update;
  if f.status='final' or v_week='settled' then raise exception 'GTL_EPL_FIXTURE_LOCKED' using errcode='P0001'; end if;
  update public.gtl_epl_fixtures set status=p_status,updated_at=clock_timestamp() where event_id=p_event_id returning * into f;
  return jsonb_build_object('eventId',f.event_id,'season',f.season,'week',f.week,'status',f.status);
end $$;

-- The gtl-epl-jobs run queue (cloud/epl-jobs.mjs). ADMIN ONLY: pg_cron calls the dispatcher (supabase/admin/epl_jobs_cron.sql),
-- and pg_net must be enabled beforehand. One run per job and five-minute slot; the token authorizes just that run, for five
-- minutes, and only its hash is kept. A queued or running run older than ten minutes is timed out by the next dispatch.
create or replace function public.gtl_epl_dispatch_jobs(p_job text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg public.gtl_epl_jobs_schedule; run public.gtl_epl_job_runs; token text; stamp timestamptz; net_id bigint;
begin
  select * into cfg from public.gtl_epl_jobs_schedule where job=p_job for update;
  if not found or not cfg.enabled or cfg.endpoint is null then return jsonb_build_object('status','disabled'); end if;
  stamp:=clock_timestamp();
  update public.gtl_epl_job_runs set status='failed',reason='worker_timeout',finished_at=stamp
    where job=cfg.job and status in ('queued','running') and coalesce(claimed_at,started_at)<stamp-interval '10 minutes';
  token:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  insert into public.gtl_epl_job_runs(job,slot_start,capability_hash)
    values(cfg.job,date_bin(interval '5 minutes',stamp,timestamptz '2000-01-01 00:00:00+00'),encode(sha256(convert_to(token,'UTF8')),'hex'))
    on conflict(job,slot_start) do nothing returning * into run;
  if not found then return jsonb_build_object('status','already_dispatched'); end if;
  begin
    select net.http_post(url:=cfg.endpoint,body:=jsonb_build_object('runId',run.id),
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),timeout_milliseconds:=60000) into net_id;
  exception when others then
    update public.gtl_epl_job_runs set status='failed',reason='dispatch_unavailable',finished_at=clock_timestamp() where id=run.id;
    return jsonb_build_object('status','failed','reason','dispatch_unavailable');
  end;
  return jsonb_build_object('status','queued','runId',run.id);
end $$;

-- The worker claims its run with the capability it was sent. Authenticates against this exact run before even a replay.
create or replace function public.gtl_epl_claim_job(p_token text,p_run uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare run public.gtl_epl_job_runs; stamp timestamptz; v_claim uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' or p_run is null then raise exception 'GTL_SCHEDULE_AUTH' using errcode='P0001'; end if;
  select * into run from public.gtl_epl_job_runs where id=p_run for update;
  stamp:=clock_timestamp();
  if not found or encode(sha256(convert_to(p_token,'UTF8')),'hex') is distinct from run.capability_hash
    or run.started_at<stamp-interval '5 minutes' or run.started_at>stamp
    or not exists(select 1 from public.gtl_epl_jobs_schedule s where s.job=run.job and s.enabled) then
    raise exception 'GTL_SCHEDULE_AUTH' using errcode='P0001';
  end if;
  if run.status<>'queued' then return jsonb_build_object('replay',true,'runId',run.id,'job',run.job,'status',run.status,'reason',run.reason); end if;
  v_claim:=gen_random_uuid();
  update public.gtl_epl_job_runs set status='running',claim_token=v_claim,claimed_at=stamp where id=run.id;
  return jsonb_build_object('replay',false,'runId',run.id,'claim',v_claim,'job',run.job,'now',stamp);
end $$;

-- A null reason means the job did its work; the named reasons record a safe no-op (skipped) or a failure to look at. The
-- lists match cloud/epl-jobs.mjs EPL_SKIP_REASONS and EPL_FAIL_REASONS. detail holds counts only (at most 4 kB).
create or replace function public.gtl_epl_complete_job(p_run uuid,p_claim uuid,p_reason text,p_detail jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare run public.gtl_epl_job_runs; state text;
begin
  select * into run from public.gtl_epl_job_runs where id=p_run for update;
  if not found or p_claim is null or run.claim_token is distinct from p_claim then raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001'; end if;
  if run.status<>'running' then return jsonb_build_object('runId',run.id,'status',run.status,'reason',run.reason); end if;
  if run.claimed_at<clock_timestamp()-interval '10 minutes' then raise exception 'GTL_SCHEDULE_EXPIRED' using errcode='P0001'; end if;
  state:=case when p_reason is null then 'succeeded'
    when p_reason in ('no_week','not_open','not_due','no_fixtures','already_resolved','not_resolved','nothing_due','budget_guard',
      'budget_unknown','results_pending','snapshot_pending','no_subscription','already_nudged','needs_review') then 'skipped'
    when p_reason in ('source_unavailable','write_failed','snapshot_missing','scores_incomplete','vapid_unavailable','send_failed','job_failed') then 'failed' end;
  if state is null or (p_detail is not null and (jsonb_typeof(p_detail)<>'object' or octet_length(p_detail::text)>4096)) then
    raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001';
  end if;
  update public.gtl_epl_job_runs set status=state,reason=p_reason,finished_at=clock_timestamp(),detail=coalesce(p_detail,'{}'::jsonb) where id=run.id;
  return jsonb_build_object('runId',run.id,'status',state,'reason',p_reason);
end $$;

-- Everything a claimed run decides from: the latest week, its picks, private queues, fixtures and prices, the saved
-- snapshot labels, season bonus totals, which managers can be pushed (never an endpoint here), and the shared Odds API budget.
create or replace function public.gtl_epl_jobs_state(p_run uuid,p_claim uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare w public.gtl_epl_weeks; v_remaining integer; v_paused boolean;
begin
  if not exists(select 1 from public.gtl_epl_job_runs where id=p_run and claim_token=p_claim and status='running') then raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001'; end if;
  select * into w from public.gtl_epl_weeks order by season desc,week desc limit 1;
  select b.conservative_remaining,b.paused into v_remaining,v_paused from public.gtl_odds_budget b where b.provider='the-odds-api';
  return jsonb_build_object(
    'week',case when w.season is null then null else jsonb_build_object('season',w.season,'week',w.week,'windowStart',w.window_start,
      'windowEnd',w.window_end,'firstKickoff',w.first_kickoff,'pickOrder',to_jsonb(w.pick_order),'status',w.status) end,
    'picks',coalesce((select jsonb_agg(jsonb_build_object('ownerId',k.owner_id,'club',k.club,'source',k.source,'final',k.final)
        order by coalesce(array_position(w.pick_order,k.owner_id),99),k.owner_id)
      from public.gtl_epl_picks k where k.season=w.season and k.week=w.week),'[]'::jsonb),
    'queues',coalesce((select jsonb_object_agg(q.owner_id,to_jsonb(q.clubs)) from public.gtl_epl_queues q where q.season=w.season and q.week=w.week),'{}'::jsonb),
    'fixtures',coalesce((select jsonb_agg(jsonb_build_object('eventId',f.event_id,'home',f.home,'away',f.away,'commenceTime',f.commence_time,
        'status',f.status,'homeGoals',f.home_goals,'awayGoals',f.away_goals) order by f.commence_time,f.event_id)
      from public.gtl_epl_fixtures f where f.season=w.season and f.week=w.week),'[]'::jsonb),
    'prices',coalesce((select jsonb_agg(jsonb_build_object('eventId',p.event_id,'club',p.club,'market',p.market,'price',p.price) order by p.event_id,p.club,p.market)
      from public.gtl_epl_prices p join public.gtl_epl_fixtures f on f.event_id=p.event_id where f.season=w.season and f.week=w.week),'[]'::jsonb),
    'snapshots',coalesce((select jsonb_agg(s.label order by s.label) from public.gtl_epl_snapshots s),'[]'::jsonb),
    'bonusTotals',coalesce((select jsonb_object_agg(t.owner_id,t.total) from (select b.owner_id,sum(b.points) as total
      from public.gtl_epl_bonus b where b.season=w.season group by b.owner_id) t),'{}'::jsonb),
    'managers',coalesce((select jsonb_agg(jsonb_build_object('ownerId',m.owner_id,'name',m.name,'subscribed',m.user_id is not null and exists(
        select 1 from public.gtl_push_subscriptions x where x.user_id=m.user_id and x.disabled_at is null)) order by m.owner_id)
      from public.gtl_epl_managers m),'[]'::jsonb),
    'budget',jsonb_build_object('remaining',v_remaining,'paused',coalesce(v_paused,false)));
end $$;

-- The users and rosters of up to four saved snapshots (settle's weekly scores); the stats and projections stay in the table.
create or replace function public.gtl_epl_read_snapshots(p_run uuid,p_claim uuid,p_labels text[]) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.gtl_epl_job_runs where id=p_run and claim_token=p_claim and status='running') then raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001'; end if;
  if p_labels is null or cardinality(p_labels)>4 then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
  return coalesce((select jsonb_object_agg(s.label,jsonb_build_object('capturedAt',s.captured_at,'week',s.week,'users',s.payload->'users','rosters',s.payload->'rosters'))
    from public.gtl_epl_snapshots s where s.label=any(p_labels)),'{}'::jsonb);
end $$;

-- The Odds API's 500 monthly credits are shared with NFL (gtl_odds_budget). A reservation is taken before a call, even if its
-- result is never known, and is refused when it would leave fewer than the 50-credit reserve or the budget is paused or unknown.
create or replace function public.gtl_epl_reserve_credits(p_run uuid,p_claim uuid,p_cost integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_remaining integer; v_paused boolean;
begin
  if not exists(select 1 from public.gtl_epl_job_runs where id=p_run and claim_token=p_claim and status='running') then raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001'; end if;
  if p_cost is null or p_cost<1 or p_cost>10 then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
  select b.conservative_remaining,b.paused into v_remaining,v_paused from public.gtl_odds_budget b where b.provider='the-odds-api' for update;
  if v_remaining is null or coalesce(v_paused,true) or v_remaining-p_cost<50 then return jsonb_build_object('ok',false,'remaining',v_remaining); end if;
  update public.gtl_odds_budget set conservative_remaining=v_remaining-p_cost,updated_at=clock_timestamp() where provider='the-odds-api';
  return jsonb_build_object('ok',true,'remaining',v_remaining-p_cost);
end $$;

-- The provider's own x-requests-* counts after a call. The conservative budget only ever goes down here.
create or replace function public.gtl_epl_record_quota(p_run uuid,p_claim uuid,p_remaining integer,p_used integer,p_last integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_remaining integer;
begin
  if not exists(select 1 from public.gtl_epl_job_runs where id=p_run and claim_token=p_claim and status='running') then raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001'; end if;
  if coalesce(p_remaining,0)<0 or coalesce(p_used,0)<0 or coalesce(p_last,0)<0 then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
  update public.gtl_odds_budget set observed_remaining=coalesce(p_remaining,observed_remaining),observed_used=coalesce(p_used,observed_used),
    observed_last=coalesce(p_last,observed_last),observed_at=clock_timestamp(),
    conservative_remaining=case when p_remaining is null then conservative_remaining when conservative_remaining is null then least(p_remaining,500)
      else least(conservative_remaining,p_remaining) end,updated_at=clock_timestamp()
    where provider='the-odds-api' returning conservative_remaining into v_remaining;
  return jsonb_build_object('remaining',v_remaining);
end $$;

-- Marks one turn notification before it is sent. Returns the linked account's active push subscriptions only when this call
-- recorded the turn, so a retry, an overlapping run or an unlinked manager sends nothing.
create or replace function public.gtl_epl_mark_nudge(p_run uuid,p_claim uuid,p_season integer,p_week integer,p_owner text,p_key text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_user uuid; n integer;
begin
  if not exists(select 1 from public.gtl_epl_job_runs where id=p_run and claim_token=p_claim and status='running') then raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001'; end if;
  if p_key is null or p_key !~ '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,30}-[0-9]{1,2}$' or p_key not like p_season||'-'||p_week||'-'||p_owner||'-%' then
    raise exception 'GTL_EPL_INVALID' using errcode='P0001';
  end if;
  select m.user_id into v_user from public.gtl_epl_managers m where m.owner_id=p_owner;
  if v_user is null then return jsonb_build_object('recorded',false,'subscriptions','[]'::jsonb); end if;
  insert into public.gtl_epl_nudges(key,season,week,owner_id,run_id) values(p_key,p_season,p_week,p_owner,p_run) on conflict(key) do nothing;
  get diagnostics n=row_count;
  if n=0 then return jsonb_build_object('recorded',false,'subscriptions','[]'::jsonb); end if;
  return jsonb_build_object('recorded',true,'subscriptions',coalesce((select jsonb_agg(jsonb_build_object('endpoint',x.endpoint,'p256dh',x.p256dh,'auth',x.auth)
    order by x.created_at,x.endpoint) from public.gtl_push_subscriptions x where x.user_id=v_user and x.disabled_at is null),'[]'::jsonb));
end $$;

-- The dispatcher is cron's alone: no API role may queue a run.
revoke all on function public.gtl_epl_dispatch_jobs(text) from public,anon,authenticated,service_role;

-- Every function is service-only; create or replace keeps privileges, so each grant is restated.
revoke all on function public.gtl_epl_member(uuid),public.gtl_epl_week_state(integer,integer),
  public.gtl_epl_save_pick(uuid,integer,integer,text,timestamptz),public.gtl_epl_save_queue(uuid,integer,integer,text[]),
  public.gtl_epl_upsert_fixtures(jsonb),public.gtl_epl_upsert_prices(jsonb),public.gtl_epl_resolve_week(integer,integer,jsonb),
  public.gtl_epl_settle_week(integer,integer,jsonb,jsonb),public.gtl_epl_save_snapshot(text,timestamptz,integer,jsonb,jsonb),
  public.gtl_epl_link_manager(text,uuid,uuid),
  public.gtl_epl_seed_week(integer,integer,timestamptz,timestamptz,timestamptz,text[],jsonb),
  public.gtl_epl_set_week_window(integer,integer,timestamptz,timestamptz,timestamptz),
  public.gtl_epl_flag_week_review(integer,integer),public.gtl_epl_set_fixture_status(text,text,uuid),
  public.gtl_epl_claim_job(text,uuid),public.gtl_epl_complete_job(uuid,uuid,text,jsonb),public.gtl_epl_jobs_state(uuid,uuid),
  public.gtl_epl_read_snapshots(uuid,uuid,text[]),public.gtl_epl_reserve_credits(uuid,uuid,integer),
  public.gtl_epl_record_quota(uuid,uuid,integer,integer,integer),public.gtl_epl_mark_nudge(uuid,uuid,integer,integer,text,text)
  from public,anon,authenticated;
grant execute on function public.gtl_epl_member(uuid),public.gtl_epl_week_state(integer,integer),
  public.gtl_epl_save_pick(uuid,integer,integer,text,timestamptz),public.gtl_epl_save_queue(uuid,integer,integer,text[]),
  public.gtl_epl_upsert_fixtures(jsonb),public.gtl_epl_upsert_prices(jsonb),public.gtl_epl_resolve_week(integer,integer,jsonb),
  public.gtl_epl_settle_week(integer,integer,jsonb,jsonb),public.gtl_epl_save_snapshot(text,timestamptz,integer,jsonb,jsonb),
  public.gtl_epl_link_manager(text,uuid,uuid),
  public.gtl_epl_seed_week(integer,integer,timestamptz,timestamptz,timestamptz,text[],jsonb),
  public.gtl_epl_set_week_window(integer,integer,timestamptz,timestamptz,timestamptz),
  public.gtl_epl_flag_week_review(integer,integer),public.gtl_epl_set_fixture_status(text,text,uuid),
  public.gtl_epl_claim_job(text,uuid),public.gtl_epl_complete_job(uuid,uuid,text,jsonb),public.gtl_epl_jobs_state(uuid,uuid),
  public.gtl_epl_read_snapshots(uuid,uuid,text[]),public.gtl_epl_reserve_credits(uuid,uuid,integer),
  public.gtl_epl_record_quota(uuid,uuid,integer,integer,integer),public.gtl_epl_mark_nudge(uuid,uuid,integer,integer,text,text)
  to service_role;
