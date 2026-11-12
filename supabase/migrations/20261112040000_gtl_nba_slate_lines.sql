-- M-49 gtl_nba_slate_lines: the NBA build-out's milestone N2, "Slate and capped spread lines (server only; players see nothing)".
-- Spec: docs/superpowers/specs/2026-11-10-nba-buildout-design.md, section N2. Credit rule: docs/DECISIONS.md D-85 item 3 (Sean,
-- November 11, 2026: "Approve 31 / 100"). Worker: cloud/nba-jobs.mjs (gtl-nba-jobs). Schedule: supabase/admin/nba_jobs_cron.sql.
--
-- NOT APPLIED. Ledger M-49 (M-48 is PR #555's 20261112031000_gtl_player_props_refresh.sql). It needs Sean's own "apply M-49",
-- a fresh read-only preflight and the Gate M checks in docs/MIGRATION_APPLY_PACKET_2026_11_12_NBA_N2.md. It reads the hosted
-- shared Odds API budget row (gtl_odds_budget, schema unchanged) and, for the shadow gate only, the hosted NFL refresh and EPL
-- job run tables; it calls no other migration's function and needs no unapplied file.
--
-- What it adds (nothing existing is changed, replaced or dropped):
-- * gtl_nba_games, one row per BALLDONTLIE game: both providers' start times, the Odds API event it is linked to, the lock
--   (the earlier start time), status and scores. A final never returns to another status; a start time, the lock and the link
--   never move once they have passed; a game closed by an in-progress or final status never reopens (gtl_nba_games_guard).
-- * append-only gtl_nba_game_observations (every game each slate read saw), gtl_nba_slate_reads (each slate read's coverage and
--   counts, unmatched Odds API events included) and gtl_nba_lines (every spread line read, qualified or not, with its books).
-- * gtl_nba_line_attempts: each lines read's reservation. Its credit and lease never change once taken; it finishes once.
-- * one-row gtl_nba_budget: NBA's monthly cap (31, never above) and pause threshold (100, never below), and an NBA-only pause.
-- * gtl_nba_jobs_schedule and gtl_nba_job_runs: the M-30 one-run capability pattern (gtl_epl_jobs_schedule / gtl_epl_job_runs).
--   No schedule row is created here; the admin file creates both rows disabled.
-- * Functions, all security invoker with search_path='', service-only (the dispatcher is cron's alone):
--   gtl_dispatch_nba_jobs, gtl_nba_claim_job, gtl_nba_finish_job, gtl_nba_publish_slate, gtl_nba_lines_due,
--   gtl_nba_begin_lines_read, gtl_nba_finish_lines_read, the shadow gate N3 reads (gtl_nba_shadow_gate) and three helpers
--   (gtl_nba_lines_plan, gtl_nba_month_spent, gtl_nba_nfl_clear).
-- It also reads gtl_weekly_slates (the published NFL weeks) for the NFL hour below, and changes nothing there.
--
-- The credit rule (D-85 item 3). Every NBA paid read reserves 1 credit on the shared gtl_odds_budget row, under that row's lock
-- and lease, in the same lock order as the NFL and EPL collectors. NBA is refused, and NFL and EPL never are because of NBA:
--   cap    NBA's spend this UTC calendar month (reservations not proven free, plus any unexpected cost) + 1 > 31;
--   pause  the shared conservative remaining minus this credit would fall below 100 (so NBA never takes it under 100, far above
--          the 50-credit reserve every collector keeps);
--   busy   any other collector holds the shared lease, expired or not (NBA never clears another lane's lease).
-- Every refusal is recorded as an attempt that spent nothing.
--
-- The NFL hour (D-85 item 7, Sean, November 11, 2026: "Yes, avoid that hour"). A lines read, the first and its one retry, never
-- begins in the 60 minutes before any NFL kickoff, [K - 60 min, K), when NFL players save picks and the NFL collectors read lines
-- (Thursday Night Football is the usual case). A planned read that falls in such a window moves earlier, so that a whole
-- five-minute cron slot ends before the window opens (gtl_nba_nfl_clear). A read that has to wait in a window is refused as
-- nfl_window with nothing reserved and runs after the window, before the NBA lock; when no time before the lock is clear, the
-- refusal is recorded as the attempt (0 credits). Kickoffs come from gtl_weekly_slates, the published NFL weeks the NFL save and
-- odds paths read. A week not published yet (the Monday open, the off-season) has no window, and NFL has nothing to collect for
-- it either; a published week never changes, so a kickoff moved after publication keeps its published window. A read whose provider reports a cost above its reservation pauses
-- NBA for the rest of the month (cost_review) without touching the shared pause flag.
--
-- Rerunnable: tables and indexes are created only if missing, functions are create or replace with these exact argument lists,
-- triggers are create or replace, grants are restated and the budget row is inserted with on conflict do nothing. RLS is on for
-- every table, no policy exists, no browser role gets anything and nobody the API runs as can delete. Off switch: keep both
-- schedule rows disabled, or apply supabase/rollback/20261112040000_gtl_nba_slate_lines.sql, which revokes the service role's
-- writes and execute rights and keeps every row (D-23). No hosted action is performed by this file.

create table if not exists public.gtl_nba_jobs_schedule (
  job text primary key check(job in ('slate','lines')),
  enabled boolean not null default false,
  endpoint text check(endpoint is null or endpoint ~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/gtl-nba-jobs$'),
  authorized_by text
);
create table if not exists public.gtl_nba_job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null check(job in ('slate','lines')),
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
create index if not exists gtl_nba_job_runs_job_idx on public.gtl_nba_job_runs(job,started_at desc);

-- Sean's approved limits are the outer bounds: a reviewed SQL change may lower the cap or raise the pause, never the reverse.
create table if not exists public.gtl_nba_budget (
  id boolean primary key default true check(id),
  monthly_cap integer not null default 31 check(monthly_cap between 0 and 31),
  pause_below integer not null default 100 check(pause_below>=100),
  paused boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);
insert into public.gtl_nba_budget(id) values(true) on conflict (id) do nothing;

-- One row per BALLDONTLIE game. game_date is the Pacific date of the lock (else BALLDONTLIE's date); lock_at is the earlier of
-- the two start times; closed_at is set the first time BALLDONTLIE reports the game in progress or final.
create table if not exists public.gtl_nba_games (
  game_id text primary key check(game_id ~ '^NBA:balldontlie:[1-9][0-9]{0,11}$'),
  source_date date not null,
  game_date date not null,
  home text not null check(home=any(array['ATL','BOS','BKN','CHA','CHI','CLE','DAL','DEN','DET','GSW','HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NOP','NYK','OKC','ORL','PHI','PHX','POR','SAC','SAS','TOR','UTA','WAS'])),
  away text not null check(away=any(array['ATL','BOS','BKN','CHA','CHI','CLE','DAL','DEN','DET','GSW','HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NOP','NYK','OKC','ORL','PHI','PHX','POR','SAC','SAS','TOR','UTA','WAS'])),
  bdl_start_at timestamptz,
  odds_event_id text check(odds_event_id is null or odds_event_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  odds_commence_at timestamptz,
  lock_at timestamptz,
  status text not null check(status in ('scheduled','in_progress','final','postponed','canceled','delayed','suspended','abandoned','unknown')),
  home_score integer check(home_score between 0 and 1000),
  away_score integer check(away_score between 0 and 1000),
  closed_at timestamptz,
  first_seen_at timestamptz not null default clock_timestamp(),
  observed_at timestamptz not null,
  updated_at timestamptz not null default clock_timestamp(),
  check(home<>away),
  check((odds_event_id is null)=(odds_commence_at is null)),
  check(lock_at is not distinct from least(bdl_start_at,odds_commence_at)),
  check(closed_at is not null or status not in ('in_progress','final'))
);
create unique index if not exists gtl_nba_games_odds_event_idx on public.gtl_nba_games(odds_event_id) where odds_event_id is not null;
create index if not exists gtl_nba_games_date_idx on public.gtl_nba_games(game_date,lock_at);

-- What each slate read saw for each game, as received (append-only).
create table if not exists public.gtl_nba_game_observations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.gtl_nba_job_runs(id),
  game_id text not null references public.gtl_nba_games(game_id),
  observed_at timestamptz not null,
  status text not null,
  bdl_start_at timestamptz,
  home_score integer,
  away_score integer,
  odds_event_id text,
  odds_commence_at timestamptz,
  recorded_at timestamptz not null default clock_timestamp(),
  unique(run_id,game_id)
);
create index if not exists gtl_nba_game_observations_game_idx on public.gtl_nba_game_observations(game_id,observed_at desc);

-- One row per slate read (append-only): the dates it covered (center_date - 1 to center_date + 1), its counts and the free
-- /events read's reported quota. unmatched_events counts every Odds API event that linked no game.
create table if not exists public.gtl_nba_slate_reads (
  run_id uuid primary key references public.gtl_nba_job_runs(id),
  center_date date not null,
  observed_at timestamptz not null,
  games integer not null check(games between 0 and 100),
  linked_games integer not null check(linked_games between 0 and 100),
  events integer not null check(events between 0 and 200),
  linked_events integer not null check(linked_events between 0 and 100),
  unmatched_events integer not null check(unmatched_events between 0 and 200),
  unknown_team_events integer not null check(unknown_team_events between 0 and 200),
  events_read boolean not null,
  events_cost integer not null default 0 check(events_cost between 0 and 1000),
  quota jsonb check(quota is null or jsonb_typeof(quota)='object'),
  recorded_at timestamptz not null default clock_timestamp()
);
create index if not exists gtl_nba_slate_reads_date_idx on public.gtl_nba_slate_reads(center_date);

-- One row per lines read (attempt 1, and the single retry). A refused read reserved nothing; a running one holds the shared
-- lease for at most 30 seconds. observed_cost is the provider's own x-requests-last when it reported one.
create table if not exists public.gtl_nba_line_attempts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.gtl_nba_job_runs(id),
  game_date date not null,
  attempt smallint not null check(attempt in (1,2)),
  status text not null check(status in ('running','finished','refused')),
  refusal text check(refusal in ('nba_paused','cost_review','budget_unknown','shared_paused','cap','pause','busy','nfl_window')),
  reserved_credits smallint not null check(reserved_credits in (0,1)),
  observed_cost integer check(observed_cost between 0 and 1000),
  remaining_before integer,
  lease uuid unique,
  game_ids text[] not null default '{}' check(cardinality(game_ids)<=20),
  requested_at timestamptz not null,
  expires_at timestamptz not null,
  finished_at timestamptz,
  quota jsonb check(quota is null or jsonb_typeof(quota)='object'),
  error text check(error in ('ODDS_CONFIG','ODDS_SLATE','ODDS_BUSY','ODDS_BUDGET','ODDS_AUTH','ODDS_RATE_LIMIT','ODDS_UNAVAILABLE',
    'ODDS_TIMEOUT','ODDS_PAYLOAD','ODDS_BODY_LIMIT','invalid_result','lease_expired','unexpected_cost')),
  unique(game_date,attempt),
  check((status='refused')=(refusal is not null)),
  check((status='refused')=(reserved_credits=0)),
  check((status='refused')=(lease is null)),
  check(status='running' or finished_at is not null)
);
create index if not exists gtl_nba_line_attempts_requested_idx on public.gtl_nba_line_attempts(requested_at);

-- Every spread line read, one row per game per read (append-only). A qualified line is the median of three books within 5
-- points of it, collected before the lock; an unqualified one keeps its reason and whatever books it had.
create table if not exists public.gtl_nba_lines (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.gtl_nba_line_attempts(id),
  game_id text not null references public.gtl_nba_games(game_id),
  odds_event_id text check(odds_event_id is null or odds_event_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  market text not null default 'spread' check(market='spread'),
  qualified boolean not null,
  line numeric(5,1) check(line is null or (line between -100 and 100 and line*2=trunc(line*2))),
  reason text check(reason in ('too_few_books','books_disagree','event_missing','schedule_mismatch','ambiguous_event','kickoff_passed',
    'event_id_changed','not_returned','invalid_evidence')),
  book_count smallint not null check(book_count between 0 and 4),
  books jsonb not null default '[]' check(jsonb_typeof(books)='array' and octet_length(books::text)<=4096),
  observed_at timestamptz,
  collected_at timestamptz,
  recorded_at timestamptz not null default clock_timestamp(),
  unique(attempt_id,game_id,market),
  check(qualified=(line is not null)),
  check(qualified=(reason is null)),
  check(not qualified or (book_count=3 and observed_at is not null and collected_at is not null and observed_at<=collected_at))
);
create index if not exists gtl_nba_lines_game_idx on public.gtl_nba_lines(game_id,collected_at desc);

alter table public.gtl_nba_jobs_schedule enable row level security;
alter table public.gtl_nba_job_runs enable row level security;
alter table public.gtl_nba_budget enable row level security;
alter table public.gtl_nba_games enable row level security;
alter table public.gtl_nba_game_observations enable row level security;
alter table public.gtl_nba_slate_reads enable row level security;
alter table public.gtl_nba_line_attempts enable row level security;
alter table public.gtl_nba_lines enable row level security;
revoke all on public.gtl_nba_jobs_schedule,public.gtl_nba_job_runs,public.gtl_nba_budget,public.gtl_nba_games,public.gtl_nba_game_observations,
  public.gtl_nba_slate_reads,public.gtl_nba_line_attempts,public.gtl_nba_lines from public,anon,authenticated,service_role;
-- No delete for anyone the API runs as (D-23). The schedule and the budget are read-only to the worker; a run's job, slot and
-- capability hash are written only by the cron dispatcher.
grant select on public.gtl_nba_jobs_schedule,public.gtl_nba_budget,public.gtl_nba_job_runs to service_role;
grant update(status,reason,claim_token,claimed_at,finished_at,detail) on public.gtl_nba_job_runs to service_role;
grant select,insert,update on public.gtl_nba_games to service_role;
grant select,insert on public.gtl_nba_game_observations,public.gtl_nba_slate_reads,public.gtl_nba_lines to service_role;
grant select,insert on public.gtl_nba_line_attempts to service_role;
grant update(status,observed_cost,quota,error,finished_at) on public.gtl_nba_line_attempts to service_role;

-- ---------- row guards ----------
create or replace function public.gtl_nba_append_only() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'GTL_NBA_APPEND_ONLY' using errcode='P0001'; end $$;
create or replace trigger gtl_nba_game_observations_append_only before update or delete on public.gtl_nba_game_observations
  for each row execute function public.gtl_nba_append_only();
create or replace trigger gtl_nba_slate_reads_append_only before update or delete on public.gtl_nba_slate_reads
  for each row execute function public.gtl_nba_append_only();
create or replace trigger gtl_nba_lines_append_only before update or delete on public.gtl_nba_lines
  for each row execute function public.gtl_nba_append_only();
create or replace trigger gtl_nba_job_runs_keep before delete on public.gtl_nba_job_runs
  for each row execute function public.gtl_nba_append_only();
create or replace trigger gtl_nba_jobs_schedule_keep before delete on public.gtl_nba_jobs_schedule
  for each row execute function public.gtl_nba_append_only();
create or replace trigger gtl_nba_budget_keep before delete on public.gtl_nba_budget
  for each row execute function public.gtl_nba_append_only();

-- A game's teams never change, a final never regresses, a start time (and once the lock has passed, both start times and the
-- link) never moves after it has passed, and a closed game never reopens. lock_at and game_date are always derived here.
create or replace function public.gtl_nba_games_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz:=clock_timestamp();
begin
  if tg_op='DELETE' then raise exception 'GTL_NBA_APPEND_ONLY' using errcode='P0001'; end if;
  if tg_op='UPDATE' then
    if (new.game_id,new.home,new.away) is distinct from (old.game_id,old.home,old.away) then raise exception 'GTL_NBA_INVALID' using errcode='P0001'; end if;
    if old.status='final' and new.status<>'final' then raise exception 'GTL_NBA_FINAL' using errcode='P0001'; end if;
    if (old.bdl_start_at<=stamp and new.bdl_start_at is distinct from old.bdl_start_at)
      or (old.odds_commence_at<=stamp and new.odds_commence_at is distinct from old.odds_commence_at)
      or (old.lock_at<=stamp and (new.bdl_start_at,new.odds_commence_at,new.odds_event_id) is distinct from (old.bdl_start_at,old.odds_commence_at,old.odds_event_id))
      then raise exception 'GTL_NBA_STARTED' using errcode='P0001'; end if;
    new.closed_at:=coalesce(old.closed_at,new.closed_at);
    new.first_seen_at:=old.first_seen_at;
  end if;
  new.lock_at:=least(new.bdl_start_at,new.odds_commence_at);
  new.game_date:=coalesce((new.lock_at at time zone 'America/Los_Angeles')::date,new.source_date);
  if new.closed_at is null and new.status in ('in_progress','final') then new.closed_at:=stamp; end if;
  new.updated_at:=stamp;
  return new;
end $$;
create or replace trigger gtl_nba_games_guard before insert or update or delete on public.gtl_nba_games
  for each row execute function public.gtl_nba_games_guard();

-- A reservation is final: only a running read finishes, once, and what it reserved never changes.
create or replace function public.gtl_nba_attempts_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' or old.status<>'running' or new.status<>'finished'
    or (new.id,new.run_id,new.game_date,new.attempt,new.refusal,new.reserved_credits,new.remaining_before,new.lease,new.game_ids,new.requested_at,new.expires_at)
      is distinct from (old.id,old.run_id,old.game_date,old.attempt,old.refusal,old.reserved_credits,old.remaining_before,old.lease,old.game_ids,old.requested_at,old.expires_at)
    then raise exception 'GTL_NBA_APPEND_ONLY' using errcode='P0001'; end if;
  return new;
end $$;
create or replace trigger gtl_nba_attempts_guard before update or delete on public.gtl_nba_line_attempts
  for each row execute function public.gtl_nba_attempts_guard();

-- ---------- credit helpers ----------
-- NBA's credits in the UTC calendar month that starts at p_month_start: a refused read spent nothing, a running one its
-- reservation, a finished one what the provider reported (else its reservation); plus any cost a free slate read reported.
create or replace function public.gtl_nba_month_spent(p_month_start timestamptz) returns integer
language sql stable security invoker set search_path='' as $$
  select (coalesce((select sum(case when a.status='refused' then 0 when a.status='running' then a.reserved_credits
      else coalesce(a.observed_cost,a.reserved_credits) end) from public.gtl_nba_line_attempts a
      where a.requested_at>=p_month_start and a.requested_at<p_month_start+interval '1 month'),0)
    + coalesce((select sum(r.events_cost) from public.gtl_nba_slate_reads r
      where r.recorded_at>=p_month_start and r.recorded_at<p_month_start+interval '1 month'),0))::integer
$$;

-- The NFL hour (D-85 item 7): every published NFL kickoff K closes [K - 60 min, K) to NBA's paid read.
--   p_earlier true:  the latest time at or before p_at whose whole five-minute cron slot [x, x + 5 min) meets no window, so a
--                    planned read inside a window moves earlier and still gets one cron run before the window opens.
--   p_earlier false: p_at itself when it is in no window, else the first instant after the run of windows that contains it.
-- Kickoffs are the published NFL weeks' signatures (gtl_weekly_slates), in epoch seconds, as the NFL odds paths read them.
create or replace function public.gtl_nba_nfl_clear(p_at timestamptz,p_earlier boolean) returns timestamptz
language plpgsql stable security invoker set search_path='' as $$
declare x timestamptz:=p_at; k timestamptz; i integer:=0;
begin
  if p_at is null or p_earlier is null then return null; end if;
  loop
    i:=i+1;
    exit when i>64;
    with kickoffs as (select to_timestamp((g->>'kickoff')::double precision) t from public.gtl_weekly_slates s
        cross join lateral jsonb_array_elements(case when jsonb_typeof(s.signature->'games')='array' then s.signature->'games' else '[]'::jsonb end) g
        where jsonb_typeof(g->'kickoff')='number')
    select case when p_earlier then min(t) else max(t) end into k from kickoffs
      where t>x and (case when p_earlier then t-interval '60 minutes'<x+interval '5 minutes' else t-interval '60 minutes'<=x end);
    exit when k is null;
    x:=case when p_earlier then k-interval '65 minutes' else k end;
  end loop;
  return x;
end $$;

-- The lines read at p_stamp for the earliest Pacific game day (yesterday to tomorrow) that still has an open, linked game, or
-- null when none is due. It reads only stored rows and never calls a provider. A day's read is planned 90 minutes before its
-- first tip-off (attempt 1), or 30 minutes after a first attempt that spent no credit (attempt 2, the only retry); either moves
-- earlier out of the NFL hour (dueAt). state says what may happen now:
--   due     a read may begin;
--   wait    p_stamp is inside an NFL hour and a clear time comes before an open game's lock: nothing may begin yet (nfl_window);
--   refuse  p_stamp is inside an NFL hour and no clear time comes before any open game's lock: the attempt is recorded as
--           refused (nfl_window, 0 credits).
create or replace function public.gtl_nba_lines_plan(p_stamp timestamptz) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare today date; d date; first_tip timestamptz; a1 public.gtl_nba_line_attempts; a2 public.gtl_nba_line_attempts; v_attempt integer;
  planned timestamptz; due_at timestamptz; clear_at timestamptz; v_state text;
begin
  if p_stamp is null then return null; end if;
  today:=(p_stamp at time zone 'America/Los_Angeles')::date;
  for d in select g.game_date from public.gtl_nba_games g where g.game_date between today-1 and today+1 group by g.game_date order by g.game_date loop
    if not exists(select 1 from public.gtl_nba_games g where g.game_date=d and g.status='scheduled' and g.closed_at is null
      and g.lock_at>p_stamp and g.odds_event_id is not null) then continue; end if;
    select min(g.lock_at) into first_tip from public.gtl_nba_games g where g.game_date=d and g.status not in ('postponed','canceled');
    a1:=null; a2:=null; v_attempt:=null;
    select * into a1 from public.gtl_nba_line_attempts x where x.game_date=d and x.attempt=1;
    select * into a2 from public.gtl_nba_line_attempts x where x.game_date=d and x.attempt=2;
    if a1.id is null then
      v_attempt:=1; planned:=first_tip-interval '90 minutes'; due_at:=public.gtl_nba_nfl_clear(planned,true);
    elsif a2.id is null and a1.status<>'running'
      and (case when a1.status='refused' then 0 else coalesce(a1.observed_cost,a1.reserved_credits) end)=0 then
      v_attempt:=2; planned:=a1.requested_at+interval '30 minutes';
      due_at:=greatest(public.gtl_nba_nfl_clear(planned,true),a1.requested_at+interval '5 minutes');
    end if;
    if v_attempt is null or p_stamp<due_at then continue; end if;
    clear_at:=public.gtl_nba_nfl_clear(p_stamp,false);
    v_state:=case when clear_at<=p_stamp then 'due'
      when exists(select 1 from public.gtl_nba_games g where g.game_date=d and g.status='scheduled' and g.closed_at is null
        and g.lock_at>clear_at and g.odds_event_id is not null) then 'wait' else 'refuse' end;
    return jsonb_build_object('state',v_state,'gameDate',d,'attempt',v_attempt,'firstTipAt',first_tip,'plannedAt',planned,'dueAt',due_at,
      'nflClearAt',case when v_state='due' then null else clear_at end,
      'games',(select jsonb_agg(jsonb_build_object(
          'gameId',g.game_id,'home',g.home,'away',g.away,'oddsEventId',g.odds_event_id,'commenceTime',g.odds_commence_at,'lockAt',g.lock_at)
          order by g.lock_at,g.game_id)
        from public.gtl_nba_games g where g.game_date=d and g.status='scheduled' and g.closed_at is null and g.lock_at>p_stamp and g.odds_event_id is not null));
  end loop;
  return null;
end $$;

-- ---------- the gtl-nba-jobs run queue (cloud/nba-jobs.mjs) ----------
-- ADMIN ONLY: pg_cron calls the dispatcher (supabase/admin/nba_jobs_cron.sql) and pg_net must be enabled beforehand. A run is
-- queued only when something is due: the slate in the 9 AM and 3 PM Pacific hours (cron fires at both UTC offsets), the lines
-- read when gtl_nba_lines_plan says due (or refuse, so a day the NFL hour leaves no time for is recorded), never while it waits
-- out an NFL hour. One run per job and five-minute slot; the token authorizes just that run, for
-- five minutes, and only its hash is kept. A queued or running run older than ten minutes is timed out by the next dispatch.
create or replace function public.gtl_dispatch_nba_jobs(p_job text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg public.gtl_nba_jobs_schedule; run public.gtl_nba_job_runs; token text; stamp timestamptz; net_id bigint;
begin
  select * into cfg from public.gtl_nba_jobs_schedule where job=p_job for update;
  if not found or not cfg.enabled or cfg.endpoint is null then return jsonb_build_object('status','disabled'); end if;
  stamp:=clock_timestamp();
  update public.gtl_nba_job_runs set status='failed',reason='worker_timeout',finished_at=stamp
    where job=cfg.job and status in ('queued','running') and coalesce(claimed_at,started_at)<stamp-interval '10 minutes';
  if (cfg.job='slate' and extract(hour from stamp at time zone 'America/Los_Angeles') not in (9,15))
    or (cfg.job='lines' and coalesce(public.gtl_nba_lines_plan(stamp)->>'state','none') not in ('due','refuse')) then
    return jsonb_build_object('status','not_due');
  end if;
  token:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  insert into public.gtl_nba_job_runs(job,slot_start,capability_hash)
    values(cfg.job,date_bin(interval '5 minutes',stamp,timestamptz '2000-01-01 00:00:00+00'),encode(sha256(convert_to(token,'UTF8')),'hex'))
    on conflict(job,slot_start) do nothing returning * into run;
  if not found then return jsonb_build_object('status','already_dispatched'); end if;
  begin
    select net.http_post(url:=cfg.endpoint,body:=jsonb_build_object('runId',run.id),
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),timeout_milliseconds:=60000) into net_id;
  exception when others then
    update public.gtl_nba_job_runs set status='failed',reason='dispatch_unavailable',finished_at=clock_timestamp() where id=run.id;
    return jsonb_build_object('status','failed','reason','dispatch_unavailable');
  end;
  return jsonb_build_object('status','queued','runId',run.id);
end $$;

-- The worker claims its run with the capability it was sent; it authenticates against this exact run before even a replay.
create or replace function public.gtl_nba_claim_job(p_token text,p_run uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare run public.gtl_nba_job_runs; stamp timestamptz; v_claim uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' or p_run is null then raise exception 'GTL_SCHEDULE_AUTH' using errcode='P0001'; end if;
  select * into run from public.gtl_nba_job_runs where id=p_run for update;
  stamp:=clock_timestamp();
  if not found or encode(sha256(convert_to(p_token,'UTF8')),'hex') is distinct from run.capability_hash
    or run.started_at<stamp-interval '5 minutes' or run.started_at>stamp
    or not exists(select 1 from public.gtl_nba_jobs_schedule s where s.job=run.job and s.enabled) then
    raise exception 'GTL_SCHEDULE_AUTH' using errcode='P0001';
  end if;
  if run.status<>'queued' then return jsonb_build_object('replay',true,'runId',run.id,'job',run.job,'status',run.status,'reason',run.reason); end if;
  v_claim:=gen_random_uuid();
  update public.gtl_nba_job_runs set status='running',claim_token=v_claim,claimed_at=stamp where id=run.id;
  return jsonb_build_object('replay',false,'runId',run.id,'claim',v_claim,'job',run.job,'now',stamp);
end $$;

-- A null reason means the job did its work; the named reasons record a safe no-op (skipped) or a failure to look at. The lists
-- match cloud/nba-jobs.mjs NBA_SKIP_REASONS and NBA_FAIL_REASONS. detail holds counts only (at most 4 kB).
create or replace function public.gtl_nba_finish_job(p_run uuid,p_claim uuid,p_reason text,p_detail jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare run public.gtl_nba_job_runs; state text;
begin
  select * into run from public.gtl_nba_job_runs where id=p_run for update;
  if not found or p_claim is null or run.claim_token is distinct from p_claim then raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001'; end if;
  if run.status<>'running' then return jsonb_build_object('runId',run.id,'status',run.status,'reason',run.reason); end if;
  if run.claimed_at<clock_timestamp()-interval '10 minutes' then raise exception 'GTL_SCHEDULE_EXPIRED' using errcode='P0001'; end if;
  state:=case when p_reason is null then 'succeeded'
    when p_reason in ('not_due','nothing_due','source_busy','nba_paused','cost_review','budget_unknown','shared_paused','nba_cap','nba_pause',
      'odds_busy','nfl_window') then 'skipped'
    when p_reason in ('source_unavailable','write_failed','provider_failed','job_failed') then 'failed' end;
  if state is null or (p_detail is not null and (jsonb_typeof(p_detail)<>'object' or octet_length(p_detail::text)>4096)) then
    raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001';
  end if;
  update public.gtl_nba_job_runs set status=state,reason=p_reason,finished_at=clock_timestamp(),detail=coalesce(p_detail,'{}'::jsonb) where id=run.id;
  return jsonb_build_object('runId',run.id,'status',state,'reason',p_reason);
end $$;

-- ---------- slate ----------
-- Stores one slate read: BALLDONTLIE's games for p_date - 1 to p_date + 1 (Pacific; p_date within a day of the server's date),
-- each with the Odds API event the worker linked it to (shared/nba-slate.mjs linkNbaSlate) or none, observed at p_observed_at.
-- Inserts new games and updates known ones; it never deletes. A stored final stays final, and once a game's lock has passed its
-- start times and link stay as stored (both counted, never an error); an event missing from one read never unlinks a game;
-- a link another game holds is not taken. p_summary: the /events read's counts and reported quota.
create or replace function public.gtl_nba_publish_slate(p_run uuid,p_claim uuid,p_date date,p_observed_at timestamptz,p_games jsonb,p_summary jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz:=clock_timestamp(); today date; item jsonb; cur public.gtl_nba_games; k text; raw text; v_quota jsonb;
  v_status text; v_bdl timestamptz; v_odds_id text; v_odds_at timestamptz; v_home integer; v_away integer; seen text[]:='{}';
  inserted integer:=0; updated integer:=0; linked integer:=0; kept_final integer:=0; kept_start integer:=0; conflicts integer:=0; cost integer;
  codes text[]:=array['ATL','BOS','BKN','CHA','CHI','CLE','DAL','DEN','DET','GSW','HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NOP','NYK','OKC','ORL','PHI','PHX','POR','SAC','SAS','TOR','UTA','WAS'];
begin
  if not exists(select 1 from public.gtl_nba_job_runs where id=p_run and claim_token=p_claim and job='slate' and status='running'
    and claimed_at>=clock_timestamp()-interval '10 minutes') then raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001'; end if;
  today:=(stamp at time zone 'America/Los_Angeles')::date;
  if p_date is null or p_date not between today-1 and today+1 or p_observed_at is null or p_observed_at>stamp or p_observed_at<stamp-interval '1 hour'
    or jsonb_typeof(p_games) is distinct from 'array' or jsonb_array_length(p_games)>100 or jsonb_typeof(p_summary) is distinct from 'object'
    or jsonb_typeof(p_summary->'eventsRead') is distinct from 'boolean' or exists(select 1 from public.gtl_nba_slate_reads where run_id=p_run) then
    raise exception 'GTL_NBA_INVALID' using errcode='P0001';
  end if;
  foreach k in array array['events','linkedEvents','unmatchedEvents','unknownTeamEvents','eventsCost'] loop
    if jsonb_typeof(p_summary->k) is distinct from 'number' or (p_summary->>k) !~ '^[0-9]{1,3}$' then raise exception 'GTL_NBA_INVALID' using errcode='P0001'; end if;
  end loop;
  -- Only bounded nonnegative integer header values count; anything else is no observation.
  v_quota:=case when jsonb_typeof(p_summary->'quota')='object' then p_summary->'quota' end;
  if v_quota is not null then
    foreach k in array array['remaining','used','last'] loop
      raw:=v_quota->>k;
      if raw is not null and (jsonb_typeof(v_quota->k)<>'number' or raw !~ '^[0-9]{1,9}$') then v_quota:=null; exit; end if;
    end loop;
  end if;
  if v_quota is not null then v_quota:=jsonb_strip_nulls(jsonb_build_object('remaining',v_quota->'remaining','used',v_quota->'used','last',v_quota->'last')); end if;
  for item in select value from jsonb_array_elements(p_games) loop
    if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'gameId','') !~ '^NBA:balldontlie:[1-9][0-9]{0,11}$' or (item->>'gameId')=any(seen)
      or not coalesce((item->>'home')=any(codes),false) or not coalesce((item->>'away')=any(codes),false) or item->>'home'=item->>'away'
      or not coalesce(item->>'status' in ('scheduled','in_progress','final','postponed','canceled','delayed','suspended','abandoned','unknown'),false)
      or coalesce(item->>'sourceDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or (item->>'oddsEventId' is not null and item->>'oddsEventId' !~ '^[A-Za-z0-9_-]{1,100}$')
      or (item->>'oddsEventId' is null)<>(item->>'oddsCommenceTime' is null)
      or (item->>'homeScore' is not null and (jsonb_typeof(item->'homeScore')<>'number' or item->>'homeScore' !~ '^[0-9]{1,4}$'))
      or (item->>'awayScore' is not null and (jsonb_typeof(item->'awayScore')<>'number' or item->>'awayScore' !~ '^[0-9]{1,4}$')) then
      raise exception 'GTL_NBA_INVALID' using errcode='P0001';
    end if;
    seen:=seen||(item->>'gameId');
    v_status:=item->>'status'; v_bdl:=(item->>'startTime')::timestamptz;
    v_odds_id:=item->>'oddsEventId'; v_odds_at:=(item->>'oddsCommenceTime')::timestamptz;
    v_home:=(item->>'homeScore')::integer; v_away:=(item->>'awayScore')::integer;
    cur:=null;
    select * into cur from public.gtl_nba_games where game_id=item->>'gameId' for update;
    if cur.game_id is not null then
      if cur.home<>item->>'home' or cur.away<>item->>'away' then raise exception 'GTL_NBA_INVALID' using errcode='P0001'; end if;
      if cur.status='final' and v_status<>'final' then v_status:='final'; v_home:=cur.home_score; v_away:=cur.away_score; kept_final:=kept_final+1; end if;
      v_bdl:=coalesce(v_bdl,cur.bdl_start_at);
      if v_odds_id is null then v_odds_id:=cur.odds_event_id; v_odds_at:=cur.odds_commence_at; end if;
      if cur.lock_at<=stamp then
        if (v_bdl,v_odds_id,v_odds_at) is distinct from (cur.bdl_start_at,cur.odds_event_id,cur.odds_commence_at) then kept_start:=kept_start+1; end if;
        v_bdl:=cur.bdl_start_at; v_odds_id:=cur.odds_event_id; v_odds_at:=cur.odds_commence_at;
      end if;
    end if;
    if v_odds_id is not null and v_odds_id is distinct from cur.odds_event_id
      and exists(select 1 from public.gtl_nba_games x where x.odds_event_id=v_odds_id and x.game_id<>item->>'gameId') then
      conflicts:=conflicts+1; v_odds_id:=cur.odds_event_id; v_odds_at:=cur.odds_commence_at;
    end if;
    if cur.game_id is null then
      insert into public.gtl_nba_games(game_id,source_date,game_date,home,away,bdl_start_at,odds_event_id,odds_commence_at,status,home_score,away_score,observed_at)
        values(item->>'gameId',(item->>'sourceDate')::date,(item->>'sourceDate')::date,item->>'home',item->>'away',v_bdl,v_odds_id,v_odds_at,v_status,v_home,v_away,p_observed_at);
      inserted:=inserted+1;
    else
      update public.gtl_nba_games set source_date=case when cur.lock_at<=stamp then cur.source_date else (item->>'sourceDate')::date end,
        bdl_start_at=v_bdl,odds_event_id=v_odds_id,odds_commence_at=v_odds_at,status=v_status,home_score=v_home,away_score=v_away,
        observed_at=greatest(cur.observed_at,p_observed_at) where game_id=cur.game_id;
      updated:=updated+1;
    end if;
    if v_odds_id is not null then linked:=linked+1; end if;
    insert into public.gtl_nba_game_observations(run_id,game_id,observed_at,status,bdl_start_at,home_score,away_score,odds_event_id,odds_commence_at)
      values(p_run,item->>'gameId',p_observed_at,item->>'status',(item->>'startTime')::timestamptz,(item->>'homeScore')::integer,(item->>'awayScore')::integer,
        item->>'oddsEventId',(item->>'oddsCommenceTime')::timestamptz);
  end loop;
  cost:=greatest((p_summary->>'eventsCost')::integer,coalesce((v_quota->>'last')::integer,0));
  insert into public.gtl_nba_slate_reads(run_id,center_date,observed_at,games,linked_games,events,linked_events,unmatched_events,unknown_team_events,events_read,events_cost,quota)
    values(p_run,p_date,p_observed_at,jsonb_array_length(p_games),linked,(p_summary->>'events')::integer,(p_summary->>'linkedEvents')::integer,
      (p_summary->>'unmatchedEvents')::integer,(p_summary->>'unknownTeamEvents')::integer,(p_summary->>'eventsRead')::boolean,cost,v_quota);
  -- The free read's own x-requests-* counts: the conservative budget only ever goes down here.
  if v_quota is not null then
    update public.gtl_odds_budget set observed_remaining=coalesce((v_quota->>'remaining')::integer,observed_remaining),
      observed_used=coalesce((v_quota->>'used')::integer,observed_used),observed_last=coalesce((v_quota->>'last')::integer,observed_last),observed_at=stamp,
      conservative_remaining=case when v_quota->>'remaining' is null then conservative_remaining when conservative_remaining is null then least((v_quota->>'remaining')::integer,500)
        else least(conservative_remaining,(v_quota->>'remaining')::integer) end,updated_at=stamp
      where provider='the-odds-api';
  end if;
  return jsonb_build_object('games',jsonb_array_length(p_games),'inserted',inserted,'updated',updated,'linked',linked,
    'unlinked',jsonb_array_length(p_games)-linked,'keptFinal',kept_final,'keptStart',kept_start,'linkConflicts',conflicts,
    'unmatchedEvents',(p_summary->>'unmatchedEvents')::integer);
end $$;

-- ---------- lines ----------
-- What the lines job may read now (gtl_nba_lines_plan at the database's clock), or null: the claimed run decides nothing itself.
create or replace function public.gtl_nba_lines_due(p_run uuid,p_claim uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.gtl_nba_job_runs where id=p_run and claim_token=p_claim and job='lines' and status='running'
    and claimed_at>=clock_timestamp()-interval '10 minutes') then raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001'; end if;
  return public.gtl_nba_lines_plan(clock_timestamp());
end $$;

-- Reserves the one credit of a lines read, or records why NBA is refused (D-85 item 3; see the header). The shared budget row is
-- locked first, as every NFL and EPL collector does, so reservations from every lane (and two NBA runs) serialize on it; NBA's
-- own row is only read (the worker cannot change it). The lease (30 seconds) is the shared one NFL and research collections
-- hold. Due is decided again under the lock, at the database's clock: inside an NFL hour (D-85 item 7) nothing is reserved and
-- the shared lease is not taken; the read is refused as nfl_window, recorded as the attempt only when no clear time is left.
create or replace function public.gtl_nba_begin_lines_read(p_run uuid,p_claim uuid,p_game_date date) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare b public.gtl_odds_budget; nb public.gtl_nba_budget; stamp timestamptz; plan jsonb; v_attempt integer; spent integer; cap integer;
  pause integer; refusal text; held uuid; a public.gtl_nba_line_attempts; stale public.gtl_nba_line_attempts; month_start timestamptz;
begin
  if p_game_date is null then raise exception 'GTL_NBA_INVALID' using errcode='P0001'; end if;
  if not exists(select 1 from public.gtl_nba_job_runs where id=p_run and claim_token=p_claim and job='lines' and status='running'
    and claimed_at>=clock_timestamp()-interval '10 minutes') then raise exception 'GTL_SCHEDULE_RUN' using errcode='P0001'; end if;
  select * into b from public.gtl_odds_budget where provider='the-odds-api' for update;
  select * into nb from public.gtl_nba_budget where id;
  stamp:=clock_timestamp();
  -- An NBA read whose lease ran out finishes as lease_expired and its credit stays counted. NBA clears only its own lease.
  for stale in select * from public.gtl_nba_line_attempts where status='running' and expires_at<=stamp for update loop
    update public.gtl_nba_line_attempts set status='finished',error='lease_expired',finished_at=stamp where id=stale.id;
    if b.lease_token is not distinct from stale.lease then
      update public.gtl_odds_budget set lease_token=null,lease_until=null,updated_at=stamp where provider='the-odds-api';
      b.lease_token:=null;
    end if;
  end loop;
  plan:=public.gtl_nba_lines_plan(stamp);
  if plan is null or (plan->>'gameDate')::date<>p_game_date then return jsonb_build_object('status','not_due'); end if;
  v_attempt:=(plan->>'attempt')::integer;
  -- A run that reaches here inside an NFL hour (a late cron, a slow worker) waits it out: no attempt, credit or lease.
  if plan->>'state'='wait' then
    return jsonb_build_object('status','refused','reason','nfl_window','recorded',false,'attempt',v_attempt,'gameDate',p_game_date,'clearAt',plan->'nflClearAt');
  end if;
  month_start:=date_trunc('month',stamp at time zone 'UTC') at time zone 'UTC';
  spent:=public.gtl_nba_month_spent(month_start);
  cap:=least(coalesce(nb.monthly_cap,0),31); pause:=greatest(coalesce(nb.pause_below,100),100);
  refusal:=case
    when plan->>'state'='refuse' then 'nfl_window'
    when nb.id is null or nb.paused then 'nba_paused'
    when exists(select 1 from public.gtl_nba_line_attempts x where x.requested_at>=month_start and x.error='unexpected_cost')
      or exists(select 1 from public.gtl_nba_slate_reads r where r.recorded_at>=month_start and r.events_cost>0) then 'cost_review'
    when b.provider is null or b.conservative_remaining is null then 'budget_unknown'
    when b.paused then 'shared_paused'
    when spent+1>cap then 'cap'
    when b.conservative_remaining-1<pause or b.conservative_remaining-1<50 then 'pause'
    when b.lease_token is not null then 'busy'
  end;
  held:=case when refusal is null then gen_random_uuid() end;
  insert into public.gtl_nba_line_attempts(run_id,game_date,attempt,status,refusal,reserved_credits,remaining_before,lease,game_ids,requested_at,expires_at,finished_at)
    values(p_run,p_game_date,v_attempt,case when refusal is null then 'running' else 'refused' end,refusal,case when refusal is null then 1 else 0 end,
      b.conservative_remaining,held,coalesce((select array_agg(x->>'gameId' order by n) from jsonb_array_elements(plan->'games') with ordinality q(x,n)),'{}'),
      stamp,stamp+interval '30 seconds',case when refusal is null then null else stamp end)
    returning * into a;
  if refusal is not null then
    return jsonb_build_object('status','refused','reason',refusal,'recorded',true,'attemptId',a.id,'attempt',v_attempt,'gameDate',p_game_date,'spent',spent,'cap',cap);
  end if;
  update public.gtl_odds_budget set conservative_remaining=conservative_remaining-1,lease_token=held,lease_until=a.expires_at,updated_at=stamp
    where provider='the-odds-api';
  return jsonb_build_object('status','ready','attemptId',a.id,'lease',held,'expiresAt',a.expires_at,'attempt',v_attempt,'gameDate',p_game_date,
    'remainingCredits',b.conservative_remaining,'reserveCredits',pause,'spent',spent+1,'cap',cap,'games',plan->'games');
end $$;

-- Finishes a lines read once: records the provider's reported quota (the conservative budget only goes down; nothing is
-- refunded), releases the lease if it is still this read's, and, only when the read succeeded inside its lease, stores one
-- line per game it named. SQL re-checks every qualified line (three distinct books, half points, the median within 5 points of
-- every book, fresh and collected before the game's lock); one that fails is stored unqualified as invalid_evidence.
create or replace function public.gtl_nba_finish_lines_read(p_attempt uuid,p_lease uuid,p_quota jsonb,p_error text,p_lines jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare b public.gtl_odds_budget; a public.gtl_nba_line_attempts; g public.gtl_nba_games; stamp timestamptz; v_quota jsonb:=p_quota; k text; raw text;
  remaining integer; cost integer; err text; item jsonb; book jsonb; books jsonb; ok boolean; vals numeric[]; seen text[]; seen_books text[];
  v numeric; med numeric; obs timestamptz; t timestamptz; collected timestamptz; reason text; stored integer:=0; qualified integer:=0;
begin
  select * into b from public.gtl_odds_budget where provider='the-odds-api' for update;
  select * into a from public.gtl_nba_line_attempts where id=p_attempt for update;
  if not found or p_lease is null or a.lease is distinct from p_lease then raise exception 'GTL_NBA_INVALID' using errcode='P0001'; end if;
  if a.status<>'running' then return jsonb_build_object('status',a.status,'replay',true,'error',a.error); end if;
  stamp:=clock_timestamp();
  if p_error is not null and p_error not in ('ODDS_CONFIG','ODDS_SLATE','ODDS_BUSY','ODDS_BUDGET','ODDS_AUTH','ODDS_RATE_LIMIT','ODDS_UNAVAILABLE',
    'ODDS_TIMEOUT','ODDS_PAYLOAD','ODDS_BODY_LIMIT','ODDS_QUOTA_COST','invalid_result') then raise exception 'GTL_NBA_INVALID' using errcode='P0001'; end if;
  if jsonb_typeof(v_quota) is distinct from 'object' then v_quota:=null; end if;
  if v_quota is not null then
    foreach k in array array['remaining','used','last'] loop
      raw:=v_quota->>k;
      if raw is not null and (jsonb_typeof(v_quota->k)<>'number' or raw !~ '^[0-9]{1,9}$') then v_quota:=null; exit; end if;
    end loop;
  end if;
  if v_quota is not null then v_quota:=jsonb_strip_nulls(jsonb_build_object('remaining',v_quota->'remaining','used',v_quota->'used','last',v_quota->'last')); end if;
  remaining:=(v_quota->>'remaining')::integer;
  -- The adapter raises these before any paid request (its own configuration, schedule, busy or budget check): nothing spent.
  cost:=case when p_error in ('ODDS_CONFIG','ODDS_SLATE','ODDS_BUSY','ODDS_BUDGET') then 0 else (v_quota->>'last')::integer end;
  err:=case when p_error='ODDS_QUOTA_COST' or cost>a.reserved_credits then 'unexpected_cost' when p_error is not null then p_error
    when b.lease_token is distinct from a.lease or a.expires_at<=stamp then 'lease_expired' end;
  update public.gtl_odds_budget set observed_remaining=coalesce(remaining,observed_remaining),observed_used=coalesce((v_quota->>'used')::integer,observed_used),
    observed_last=coalesce((v_quota->>'last')::integer,observed_last),observed_at=case when v_quota is null then observed_at else stamp end,
    conservative_remaining=case when remaining is null then conservative_remaining when conservative_remaining is null then least(remaining,500)
      else least(conservative_remaining,remaining) end,
    lease_until=case when lease_token is not distinct from a.lease then null else lease_until end,
    lease_token=case when lease_token is not distinct from a.lease then null else lease_token end,updated_at=stamp
    where provider='the-odds-api';
  if err is null then
    if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)>20 or octet_length(p_lines::text)>65536 then
      raise exception 'GTL_NBA_INVALID' using errcode='P0001';
    end if;
    seen:='{}';
    for item in select value from jsonb_array_elements(p_lines) loop
      if jsonb_typeof(item) is distinct from 'object' or not coalesce((item->>'gameId')=any(a.game_ids),false) or (item->>'gameId')=any(seen)
        or jsonb_typeof(item->'qualified') is distinct from 'boolean'
        or (item->>'oddsEventId' is not null and item->>'oddsEventId' !~ '^[A-Za-z0-9_-]{1,100}$') then raise exception 'GTL_NBA_INVALID' using errcode='P0001'; end if;
      seen:=seen||(item->>'gameId');
      select * into g from public.gtl_nba_games where game_id=item->>'gameId';
      books:=case when jsonb_typeof(item->'books')='array' and jsonb_array_length(item->'books')<=4 and octet_length((item->'books')::text)<=4096
        then item->'books' else '[]'::jsonb end;
      collected:=null; reason:=null; med:=null; obs:=null;
      begin
        collected:=(item->>'collectedAt')::timestamptz;
      exception when others then collected:=null;
      end;
      if collected<a.requested_at or collected>stamp then collected:=null; end if;
      if (item->'qualified')='true'::jsonb then
        ok:=collected is not null and jsonb_array_length(books)=3 and g.lock_at is not null and collected<g.lock_at
          and item->>'oddsEventId' is not distinct from g.odds_event_id;
        vals:='{}'; seen_books:='{}';
        if ok then
          begin
            for book in select value from jsonb_array_elements(books) loop
              if jsonb_typeof(book) is distinct from 'object' or not coalesce(book->>'book' in ('draftkings','fanduel','betmgm','betrivers'),false)
                or (book->>'book')=any(seen_books) or jsonb_typeof(book->'line') is distinct from 'number'
                or jsonb_typeof(book->'homePrice') is distinct from 'number' or jsonb_typeof(book->'awayPrice') is distinct from 'number' then ok:=false; exit; end if;
              seen_books:=seen_books||(book->>'book');
              v:=(book->>'line')::numeric; t:=(book->>'observedAt')::timestamptz;
              if v*2<>trunc(v*2) or abs(v)>100 or (book->>'homePrice') !~ '^-?[0-9]{3,5}$' or (book->>'awayPrice') !~ '^-?[0-9]{3,5}$'
                or abs((book->>'homePrice')::integer) not between 100 and 10000 or abs((book->>'awayPrice')::integer) not between 100 and 10000
                or t is null or t>collected or collected-t>interval '5 minutes' then ok:=false; exit; end if;
              vals:=vals||v; obs:=least(obs,t);
            end loop;
          exception when others then ok:=false;
          end;
        end if;
        if ok then
          select x into med from unnest(vals) x order by x offset 1 limit 1;
          if jsonb_typeof(item->'line') is distinct from 'number' or (item->>'line')::numeric is distinct from med
            or exists(select 1 from unnest(vals) x where abs(x-med)>5) then ok:=false; end if;
        end if;
        if not ok then reason:='invalid_evidence'; med:=null; obs:=null; end if;
      else
        reason:=case when item->>'reason' in ('too_few_books','books_disagree','event_missing','schedule_mismatch','ambiguous_event','kickoff_passed',
          'event_id_changed','not_returned') then item->>'reason' else 'invalid_evidence' end;
      end if;
      insert into public.gtl_nba_lines(attempt_id,game_id,odds_event_id,qualified,line,reason,book_count,books,observed_at,collected_at)
        values(a.id,g.game_id,coalesce(item->>'oddsEventId',g.odds_event_id),med is not null,med,reason,jsonb_array_length(books),books,obs,collected);
      stored:=stored+1;
      if med is not null then qualified:=qualified+1; end if;
    end loop;
  end if;
  update public.gtl_nba_line_attempts set status='finished',observed_cost=cost,quota=v_quota,error=err,finished_at=stamp where id=a.id;
  return jsonb_build_object('status','finished','error',err,'cost',cost,'stored',stored,'qualified',qualified);
end $$;

-- ---------- shadow gate (N3 reads it; nothing here turns anything on) ----------
-- The N3 writer stays off until 10 consecutive game days show at least 80% of their games linked and qualified, NBA credits at
-- or under the cap, and nothing refused to NFL or EPL because of NBA. Computed when read from stored rows, walking back from
-- yesterday (Pacific): a day no slate read covered stops the count (no evidence is not a pass); a covered day without a playable
-- game is not a game day and is skipped; a game day below 80% stops it. A game counts when it is linked and has a qualified
-- line collected before its lock; postponed and canceled games are left out. An NFL refresh run that was refused
-- (collection_busy or budget_guard), or an EPL job run refused for budget_guard, while an NBA read held its reservation, counts
-- as refused because of NBA. (An NFL collection a player starts is refused with an error, not a stored run, so it cannot be
-- counted here; D-85 item 7 keeps NBA's read out of the hour before every NFL kickoff, when players save.) A day that lost its read
-- to the NFL hour is not excused: it has no qualified lines and fails like any other, and its day lists nflWindowRefusals.
create or replace function public.gtl_nba_shadow_gate() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare stamp timestamptz:=clock_timestamp(); today date; d date; i integer; n integer; good integer; streak integer:=0; days jsonb:='[]';
  first_day date; last_day date; stopped text; nb public.gtl_nba_budget; month_start timestamptz; spent integer; previous integer;
  cap integer; refusals integer; since timestamptz;
begin
  today:=(stamp at time zone 'America/Los_Angeles')::date;
  select * into nb from public.gtl_nba_budget where id;
  for i in 1..120 loop
    d:=today-i;
    if not exists(select 1 from public.gtl_nba_slate_reads r where d between r.center_date-1 and r.center_date+1) then stopped:='not_covered'; exit; end if;
    select count(*),count(*) filter (where g.odds_event_id is not null and exists(select 1 from public.gtl_nba_lines l
        where l.game_id=g.game_id and l.qualified and l.collected_at<g.lock_at))
      into n,good from public.gtl_nba_games g where g.game_date=d and g.status not in ('postponed','canceled');
    if n=0 then continue; end if;
    days:=days||jsonb_build_object('gameDate',d,'games',n,'linkedAndQualified',good,'passed',good*5>=n*4,
      'nflWindowRefusals',(select count(*) from public.gtl_nba_line_attempts x where x.game_date=d and x.refusal='nfl_window'));
    if good*5<n*4 then stopped:='below_share'; exit; end if;
    streak:=streak+1; last_day:=coalesce(last_day,d); first_day:=d;
    if streak>=10 then stopped:=null; exit; end if;
  end loop;
  month_start:=date_trunc('month',stamp at time zone 'UTC') at time zone 'UTC';
  spent:=public.gtl_nba_month_spent(month_start);
  previous:=public.gtl_nba_month_spent(month_start-interval '1 month');
  cap:=least(coalesce(nb.monthly_cap,0),31);
  since:=coalesce((first_day::timestamp at time zone 'America/Los_Angeles'),stamp-interval '30 days');
  refusals:=(select count(*) from public.gtl_odds_refresh_runs r where r.reason in ('collection_busy','budget_guard') and exists(
      select 1 from public.gtl_nba_line_attempts a where a.reserved_credits=1 and a.requested_at>=since
        and coalesce(r.claimed_at,r.created_at)<=coalesce(a.finished_at,a.expires_at) and coalesce(r.finished_at,r.claimed_at,r.created_at)>=a.requested_at))
    +(select count(*) from public.gtl_epl_job_runs e where e.reason='budget_guard' and exists(
      select 1 from public.gtl_nba_line_attempts a where a.reserved_credits=1 and a.requested_at>=since
        and coalesce(e.claimed_at,e.started_at)<=coalesce(a.finished_at,a.expires_at) and coalesce(e.finished_at,e.claimed_at,e.started_at)>=a.requested_at));
  return jsonb_build_object('open',streak>=10 and spent<=cap and previous<=cap and refusals=0,
    'consecutiveGameDays',streak,'requiredGameDays',10,'minimumShare',0.8,'firstGameDay',first_day,'lastGameDay',last_day,'stoppedBy',stopped,
    'days',days,'credits',jsonb_build_object('month',month_start,'spent',spent,'previousMonthSpent',previous,'cap',cap),
    'withinCap',spent<=cap and previous<=cap,'refusedBecauseOfNba',refusals,'evaluatedAt',stamp);
end $$;

-- The dispatcher is cron's alone: no API role may queue a run.
revoke all on function public.gtl_dispatch_nba_jobs(text) from public,anon,authenticated,service_role;

-- Every other function is service-only; create or replace keeps privileges, so each grant is restated.
revoke all on function public.gtl_nba_append_only(),public.gtl_nba_games_guard(),public.gtl_nba_attempts_guard(),
  public.gtl_nba_month_spent(timestamptz),public.gtl_nba_nfl_clear(timestamptz,boolean),public.gtl_nba_lines_plan(timestamptz),
  public.gtl_nba_claim_job(text,uuid),public.gtl_nba_finish_job(uuid,uuid,text,jsonb),
  public.gtl_nba_publish_slate(uuid,uuid,date,timestamptz,jsonb,jsonb),public.gtl_nba_lines_due(uuid,uuid),
  public.gtl_nba_begin_lines_read(uuid,uuid,date),public.gtl_nba_finish_lines_read(uuid,uuid,jsonb,text,jsonb),public.gtl_nba_shadow_gate()
  from public,anon,authenticated;
grant execute on function public.gtl_nba_append_only(),public.gtl_nba_games_guard(),public.gtl_nba_attempts_guard(),
  public.gtl_nba_month_spent(timestamptz),public.gtl_nba_nfl_clear(timestamptz,boolean),public.gtl_nba_lines_plan(timestamptz),
  public.gtl_nba_claim_job(text,uuid),public.gtl_nba_finish_job(uuid,uuid,text,jsonb),
  public.gtl_nba_publish_slate(uuid,uuid,date,timestamptz,jsonb,jsonb),public.gtl_nba_lines_due(uuid,uuid),
  public.gtl_nba_begin_lines_read(uuid,uuid,date),public.gtl_nba_finish_lines_read(uuid,uuid,jsonb,text,jsonb),public.gtl_nba_shadow_gate()
  to service_role;
