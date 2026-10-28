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
--   gtl_epl_queues (a manager's private ranked list of clubs), gtl_epl_bonus, and the scheduled-job pair
--   gtl_epl_jobs_schedule / gtl_epl_job_runs (same shape as 20261009150000's week-open schedule; the schedule row
--   defaults to disabled and this file registers no cron job).
-- * gtl_epl_member, gtl_epl_save_pick (the one writer of a manager's pick: it locks the week row, so concurrent picks
--   serialise, and re-checks the deadline, the turn and the club in SQL), gtl_epl_save_queue, gtl_epl_week_state
--   (the public state; queues are private and never included), and the jobs worker's writers: gtl_epl_upsert_fixtures,
--   gtl_epl_upsert_prices, gtl_epl_resolve_week, gtl_epl_settle_week, gtl_epl_save_snapshot, gtl_epl_link_manager,
--   gtl_epl_seed_week, gtl_epl_set_week_window.
--
-- Apply after M-29 (20261027..., the newest file on main). Rerunnable: tables and indexes are created only if missing,
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
  status text not null default 'open' check(status in ('open','resolved','settled')),
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

-- Scheduled jobs (the EPL sync and settle worker). Disabled until an administrator enables it.
create table if not exists public.gtl_epl_jobs_schedule (
  job text primary key,
  enabled boolean not null default false,
  endpoint text,
  authorized_by text
);
create table if not exists public.gtl_epl_job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  capability_hash text,
  status text not null default 'queued' check(status in ('queued','running','succeeded','skipped','failed')),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  detail jsonb not null default '{}' check(jsonb_typeof(detail)='object')
);
create index if not exists gtl_epl_job_runs_job_idx on public.gtl_epl_job_runs(job,started_at desc);

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
revoke all on public.gtl_epl_managers,public.gtl_epl_snapshots,public.gtl_epl_weeks,public.gtl_epl_fixtures,public.gtl_epl_prices,
  public.gtl_epl_picks,public.gtl_epl_pick_history,public.gtl_epl_queues,public.gtl_epl_bonus,public.gtl_epl_jobs_schedule,
  public.gtl_epl_job_runs from public,anon,authenticated,service_role;
-- No delete for anyone the API runs as (D-23); the history is append-only.
grant select,insert,update on public.gtl_epl_managers,public.gtl_epl_weeks,public.gtl_epl_fixtures,public.gtl_epl_prices,
  public.gtl_epl_picks,public.gtl_epl_queues,public.gtl_epl_bonus,public.gtl_epl_job_runs to service_role;
grant select,insert on public.gtl_epl_snapshots,public.gtl_epl_pick_history to service_role;
grant select on public.gtl_epl_jobs_schedule to service_role;

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
  cur_idx integer; last_idx integer; idx integer; act text; prior text;
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
      select k.club into prior from public.gtl_epl_picks k where k.season=p_season and k.week=p_week and k.owner_id=v_owner;
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

-- After the first kickoff: p_rows [{ owner_id, club|null, source }] fills in managers who did not pick (queue, auto or none),
-- every pick becomes final and the week is resolved. A manager who already picked keeps their pick; rerunning adds nothing.
create or replace function public.gtl_epl_resolve_week(p_season integer,p_week integer,p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare w public.gtl_epl_weeks; r record; added integer:=0; stamp timestamptz:=clock_timestamp();
begin
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
  select * into w from public.gtl_epl_weeks where season=p_season and week=p_week for update;
  if not found then raise exception 'GTL_EPL_NO_WEEK' using errcode='P0001'; end if;
  for r in select x.owner_id,x.club,x.source from jsonb_to_recordset(p_rows) as x(owner_id text,club text,source text) loop
    if r.owner_id is null or not (r.owner_id=any(w.pick_order)) or r.source is null or r.source not in ('queue','auto','none') then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
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

-- p_awards [{ owner_id, points, margin, club }] for the resolved week; p_next { week, window_start, window_end, first_kickoff, pick_order }
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

-- Every function is service-only; create or replace keeps privileges, so each grant is restated.
revoke all on function public.gtl_epl_member(uuid),public.gtl_epl_week_state(integer,integer),
  public.gtl_epl_save_pick(uuid,integer,integer,text,timestamptz),public.gtl_epl_save_queue(uuid,integer,integer,text[]),
  public.gtl_epl_upsert_fixtures(jsonb),public.gtl_epl_upsert_prices(jsonb),public.gtl_epl_resolve_week(integer,integer,jsonb),
  public.gtl_epl_settle_week(integer,integer,jsonb,jsonb),public.gtl_epl_save_snapshot(text,timestamptz,integer,jsonb,jsonb),
  public.gtl_epl_link_manager(text,uuid,uuid),
  public.gtl_epl_seed_week(integer,integer,timestamptz,timestamptz,timestamptz,text[],jsonb),
  public.gtl_epl_set_week_window(integer,integer,timestamptz,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_epl_member(uuid),public.gtl_epl_week_state(integer,integer),
  public.gtl_epl_save_pick(uuid,integer,integer,text,timestamptz),public.gtl_epl_save_queue(uuid,integer,integer,text[]),
  public.gtl_epl_upsert_fixtures(jsonb),public.gtl_epl_upsert_prices(jsonb),public.gtl_epl_resolve_week(integer,integer,jsonb),
  public.gtl_epl_settle_week(integer,integer,jsonb,jsonb),public.gtl_epl_save_snapshot(text,timestamptz,integer,jsonb,jsonb),
  public.gtl_epl_link_manager(text,uuid,uuid),
  public.gtl_epl_seed_week(integer,integer,timestamptz,timestamptz,timestamptz,text[],jsonb),
  public.gtl_epl_set_week_window(integer,integer,timestamptz,timestamptz,timestamptz) to service_role;
