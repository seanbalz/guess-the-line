-- P-01 Guess the Points core (D-56; spec docs/superpowers/specs/2026-10-22-guess-the-points-design.md).
-- Local implementation only: applying it to the hosted project is Sean's "apply P-01" (Gate M).
--
-- Additive. New tables and service-only, security-invoker functions; no existing table, column, trigger, grant or
-- function changes, so there is no "-- replaces" header and no supabase/rollback/ file. The off switch is the gtl-api
-- secret GTL_FEATURE_OFF=points (cloud/feature-off.mjs): writers refuse; every stored row stays (D-23).
--
-- Layout of this file. Part 1: (1) tables, (2) guard trigger, (3) table grants, (4) publish / save / reveal-gate
-- functions, (5) function grants. Part 2: (6) actuals, rulings, re-grade and FINAL tables with their grants, (7) the
-- slate guard trigger, (8) results (the scoring contract), schedule, load, rule, finalize, jobs-state, admin and read
-- functions, (9) function grants.

-- (1) Tables -----------------------------------------------------------------------------------------------------
create table public.gtl_points_slates (
  season integer not null check (season between 2000 and 2200),
  week integer not null check (week between 1 and 18),
  opens_at timestamptz not null,
  finalize_at timestamptz not null,
  rules jsonb not null check (rules = '{"format":"ppr","passingTds":4,"version":"points-1"}'::jsonb),
  slots jsonb not null check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) = 5),
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object'),
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default clock_timestamp(),
  audit jsonb not null default '[]' check (jsonb_typeof(audit) = 'array'),
  primary key (season, week),
  check (finalize_at > opens_at)
);
create table public.gtl_points_guesses (
  user_id uuid not null references auth.users(id),
  season integer not null, week integer not null,
  slot text not null check (slot in ('QB','RB','WR','TE','FLEX')),
  guess integer not null check (guess between 0 and 60),
  locked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, season, week, slot),
  foreign key (season, week) references public.gtl_points_slates(season, week)
);
create table public.gtl_points_guess_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id),
  season integer not null, week integer not null, slot text not null,
  kind text not null check (kind in ('draft','lock')),
  guess integer not null, request_id uuid not null,
  created_at timestamptz not null default clock_timestamp()
);
create table public.gtl_points_receipts (
  user_id uuid not null references auth.users(id), request_id uuid not null,
  action text not null, payload jsonb not null, result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id, request_id)
);

-- (2) Guard trigger: defense in depth under the functions' p_now checks. A locked guess never changes, nothing is
-- ever deleted (D-23), and no guess is written for a void slot or a slot whose kickoff has passed by the real clock.
create function public.gtl_points_guess_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare kickoff timestamptz; is_void boolean;
begin
  if tg_op = 'DELETE' then raise exception 'GTL_POINTS_DELETE'; end if;
  if tg_op = 'UPDATE' and old.locked_at is not null then raise exception 'GTL_POINTS_LOCKED'; end if;
  select (s->>'kickoff')::timestamptz, s->>'void' is not null into kickoff, is_void
    from public.gtl_points_slates p, jsonb_array_elements(p.slots) s
    where p.season = new.season and p.week = new.week and s->>'slot' = new.slot;
  if kickoff is null or is_void or clock_timestamp() >= kickoff then raise exception 'GTL_POINTS_CLOSED'; end if;
  return new;
end $$;
create trigger gtl_points_guess_guard before insert or update or delete on public.gtl_points_guesses
  for each row execute function public.gtl_points_guess_guard();

-- (3) Table grants: service_role only.
alter table public.gtl_points_slates enable row level security;
alter table public.gtl_points_guesses enable row level security;
alter table public.gtl_points_guess_events enable row level security;
alter table public.gtl_points_receipts enable row level security;
revoke all on public.gtl_points_slates, public.gtl_points_guesses, public.gtl_points_guess_events, public.gtl_points_receipts from public, anon, authenticated, service_role;
revoke all on sequence public.gtl_points_guess_events_id_seq from public, anon, authenticated, service_role;
grant select, insert, update(slots, audit) on public.gtl_points_slates to service_role;
grant select, insert, update(guess, locked_at, updated_at) on public.gtl_points_guesses to service_role;
grant select, insert on public.gtl_points_guess_events, public.gtl_points_receipts to service_role;
grant usage on sequence public.gtl_points_guess_events_id_seq to service_role;
revoke all on function public.gtl_points_guess_guard() from public, anon, authenticated;

-- (4) Functions --------------------------------------------------------------------------------------------------
-- Publish the week's five-slot slate. Commissioner only; one slate per week; every kickoff still ahead of p_now.
create function public.gtl_points_publish_slate(p_actor uuid, p_season integer, p_week integer, p_slate jsonb,
  p_finalize_at timestamptz, p_now timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  slot_names constant text[] := array['QB','RB','WR','TE','FLEX'];
  s jsonb; n integer; kick timestamptz; last_kick timestamptz; kicks timestamptz[] := '{}';
  stored jsonb := '[]'; prov jsonb; version text;
begin
  if not public.gtl_community_admin(p_actor) then raise exception 'GTL_POINTS_FORBIDDEN'; end if;
  if p_season is null or p_week is null or p_season not between 2000 and 2200 or p_week not between 1 and 18 then raise exception 'GTL_POINTS_INVALID'; end if;
  if exists(select 1 from public.gtl_points_slates where season = p_season and week = p_week) then raise exception 'GTL_POINTS_PUBLISHED'; end if;
  if p_now is null or p_finalize_at is null or p_slate is null
    or jsonb_typeof(p_slate) <> 'object' or jsonb_typeof(p_slate->'slots') is distinct from 'array'
    or jsonb_array_length(p_slate->'slots') <> 5 then raise exception 'GTL_POINTS_INVALID'; end if;
  for n in 1..5 loop
    s := p_slate->'slots'->(n - 1);
    if jsonb_typeof(s) <> 'object' or s->>'slot' is distinct from slot_names[n]
      or jsonb_typeof(s->'position') is distinct from 'string'
      or not (case when slot_names[n] = 'FLEX' then s->>'position' in ('RB','WR','TE') else s->>'position' = slot_names[n] end)
      or jsonb_typeof(s->'playerId') is distinct from 'string' or s->>'playerId' !~ '^00-[0-9]{7}$'
      or jsonb_typeof(s->'gameId') is distinct from 'string' or s->>'gameId' !~ '^[A-Z]{2,4}-[A-Z]{2,4}$'
      or jsonb_typeof(coalesce(s->'pfrId', 'null'::jsonb)) not in ('string','null')
      or jsonb_typeof(coalesce(s->'house', 'null'::jsonb)) not in ('number','null')
      or jsonb_typeof(s->'name') is distinct from 'string' or coalesce(s->>'name', '') = ''
      or jsonb_typeof(s->'team') is distinct from 'string' or coalesce(s->>'team', '') = ''
      or s->>'team' <> all(string_to_array(s->>'gameId', '-'))
      or jsonb_typeof(s->'window') is distinct from 'string' or coalesce(s->>'window', '') = ''
      or jsonb_typeof(s->'kickoff') is distinct from 'string'
      or s->>'kickoff' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$' then raise exception 'GTL_POINTS_INVALID'; end if;
    begin kick := (s->>'kickoff')::timestamptz; exception when others then raise exception 'GTL_POINTS_INVALID'; end;
    if not isfinite(kick) or kick <= p_now then raise exception 'GTL_POINTS_INVALID'; end if;
    kicks := kicks || kick;
    stored := stored || jsonb_build_array(jsonb_build_object('slot', s->>'slot', 'playerId', s->>'playerId',
      'pfrId', coalesce(s->'pfrId', 'null'::jsonb), 'name', s->>'name', 'team', s->>'team', 'position', s->>'position',
      'gameId', s->>'gameId', 'kickoff', to_jsonb(kick), 'window', s->>'window', 'house', coalesce(s->'house', 'null'::jsonb), 'void', null));
  end loop;
  if (select count(distinct x->>'gameId') from jsonb_array_elements(stored) x) <> 5
    or (select count(distinct x->>'playerId') from jsonb_array_elements(stored) x) <> 5
    or (select count(distinct x->>'window') from jsonb_array_elements(stored) x) < 2 then raise exception 'GTL_POINTS_INVALID'; end if;
  select max(k) into last_kick from unnest(kicks) k;
  if p_finalize_at <= last_kick then raise exception 'GTL_POINTS_INVALID'; end if;
  version := coalesce(p_slate->'provenance'->>'selectionVersion', p_slate->>'selectionVersion');
  if jsonb_typeof(p_slate->'provenance') is distinct from 'object'
    or jsonb_typeof(p_slate->'provenance'->'file') is distinct from 'string' or coalesce(p_slate->'provenance'->>'file', '') = ''
    or jsonb_typeof(p_slate->'provenance'->'sha256') is distinct from 'string' or p_slate->'provenance'->>'sha256' !~ '^[0-9a-f]{64}$'
    or coalesce(version, '') = '' then raise exception 'GTL_POINTS_INVALID'; end if;
  prov := (p_slate->'provenance') || jsonb_build_object('selectionVersion', version);
  begin
    insert into public.gtl_points_slates(season, week, opens_at, finalize_at, rules, slots, provenance, published_by, audit)
      values(p_season, p_week, p_now, p_finalize_at, '{"format":"ppr","passingTds":4,"version":"points-1"}'::jsonb, stored, prov, p_actor,
        jsonb_build_array(jsonb_build_object('at', p_now, 'by', p_actor, 'action', 'published')));
  exception when unique_violation then raise exception 'GTL_POINTS_PUBLISHED';
  end;
  return jsonb_build_object('season', p_season, 'week', p_week, 'opensAt', p_now);
end $$;

-- Save a draft or lock in one slot. A lock is final (D-37 as amended by D-39); a retried request id replays.
create function public.gtl_points_save(p_user uuid, p_season integer, p_week integer, p_slot text, p_guess integer,
  p_lock boolean, p_request uuid, p_now timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  payload jsonb; receipt record; slate record; slot_row jsonb; saved record; result jsonb;
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_POINTS_MEMBER'; end if;
  if p_season is null or p_week is null or p_slot is null or p_slot not in ('QB','RB','WR','TE','FLEX')
    or p_guess is null or p_guess < 0 or p_guess > 60 or p_request is null or p_lock is null or p_now is null then raise exception 'GTL_POINTS_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('gtl_points:' || p_user::text, 0));
  payload := jsonb_build_object('season', p_season, 'week', p_week, 'slot', p_slot, 'guess', p_guess, 'lock', p_lock);
  select * into receipt from public.gtl_points_receipts where user_id = p_user and request_id = p_request;
  if found then
    if receipt.action = 'points/save' and receipt.payload = payload then return receipt.result; end if;
    raise exception 'GTL_POINTS_RETRY_CONFLICT';
  end if;
  select * into slate from public.gtl_points_slates where season = p_season and week = p_week;
  if not found then raise exception 'GTL_POINTS_NO_SLATE'; end if;
  if slate.opens_at > p_now then raise exception 'GTL_POINTS_NOT_OPEN'; end if;
  select x into slot_row from jsonb_array_elements(slate.slots) x where x->>'slot' = p_slot;
  if jsonb_typeof(slot_row->'void') <> 'null' or p_now >= (slot_row->>'kickoff')::timestamptz then raise exception 'GTL_POINTS_CLOSED'; end if;
  insert into public.gtl_points_guesses as g(user_id, season, week, slot, guess, locked_at, created_at, updated_at)
    values(p_user, p_season, p_week, p_slot, p_guess, case when p_lock then p_now end, p_now, p_now)
    on conflict (user_id, season, week, slot) do update
      set guess = excluded.guess, locked_at = excluded.locked_at, updated_at = excluded.updated_at
      where g.locked_at is null
    returning g.guess, g.locked_at into saved;
  if not found then raise exception 'GTL_POINTS_LOCKED'; end if;
  insert into public.gtl_points_guess_events(user_id, season, week, slot, kind, guess, request_id)
    values(p_user, p_season, p_week, p_slot, case when p_lock then 'lock' else 'draft' end, p_guess, p_request);
  result := jsonb_build_object('season', p_season, 'week', p_week, 'slot', p_slot, 'guess', saved.guess, 'lockedAt', saved.locked_at);
  insert into public.gtl_points_receipts(user_id, request_id, action, payload, result) values(p_user, p_request, 'points/save', payload, result);
  return result;
end $$;

-- Reveal gate: others' guesses on a slot show once the viewer has locked that slot, or from its kickoff.
create function public.gtl_points_revealed(p_viewer uuid, p_season integer, p_week integer, p_slot text, p_now timestamptz) returns boolean
language sql stable security invoker set search_path='' as $$
  select coalesce((select p_now >= (s->>'kickoff')::timestamptz
      from public.gtl_points_slates p, jsonb_array_elements(p.slots) s
      where p.season = p_season and p.week = p_week and s->>'slot' = p_slot), false)
    or exists(select 1 from public.gtl_points_guesses
      where user_id = p_viewer and season = p_season and week = p_week and slot = p_slot and locked_at is not null);
$$;

-- (5) Function grants: service_role only.
revoke all on function public.gtl_points_publish_slate(uuid,integer,integer,jsonb,timestamptz,timestamptz),
  public.gtl_points_save(uuid,integer,integer,text,integer,boolean,uuid,timestamptz),
  public.gtl_points_revealed(uuid,integer,integer,text,timestamptz) from public, anon, authenticated;
grant execute on function public.gtl_points_publish_slate(uuid,integer,integer,jsonb,timestamptz,timestamptz),
  public.gtl_points_save(uuid,integer,integer,text,integer,boolean,uuid,timestamptz),
  public.gtl_points_revealed(uuid,integer,integer,text,timestamptz) to service_role;

-- =================================================================================================================
-- Part 2: actuals loads, slot results, schedule updates, commissioner rulings, the FINAL freeze and the gated read.

-- (6) Tables: append-only records (D-23). A load is one nflverse retrieval with its checksums; its rows are that
-- week's players; a ruling settles a slot the data cannot; a re-grade records a result a load changed; a FINAL row
-- freezes a week's per-slot results and member and House totals.
create table public.gtl_points_actual_loads (
  id uuid primary key default gen_random_uuid(),
  season integer not null, week integer not null,
  stats_sha256 text not null check (stats_sha256 ~ '^[0-9a-f]{64}$'),
  snaps_sha256 text check (snaps_sha256 is null or snaps_sha256 ~ '^[0-9a-f]{64}$'),
  roster_sha256 text check (roster_sha256 is null or roster_sha256 ~ '^[0-9a-f]{64}$'),
  sources jsonb not null check (jsonb_typeof(sources) = 'object'),
  review jsonb not null check (jsonb_typeof(review) = 'object'),
  played jsonb not null check (jsonb_typeof(played) = 'object'),
  status text not null check (status in ('saved','flagged','after_final')),
  row_count integer not null check (row_count between 0 and 5000),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (season, week) references public.gtl_points_slates(season, week)
);
create unique index gtl_points_actual_loads_once on public.gtl_points_actual_loads
  (season, week, stats_sha256, coalesce(snaps_sha256, ''), coalesce(roster_sha256, ''));
create table public.gtl_points_actuals (
  load_id uuid not null references public.gtl_points_actual_loads(id),
  player_id text not null check (player_id ~ '^00-[0-9]{7}$'),
  name text not null, team text not null, position text not null check (position in ('QB','RB','WR','TE','K')),
  game_id text not null check (game_id ~ '^[A-Z]{2,4}-[A-Z]{2,4}$'),
  stats jsonb not null check (jsonb_typeof(stats) = 'object'),
  points numeric(6,1),
  primary key (load_id, player_id)
);
create table public.gtl_points_rulings (
  id bigserial primary key, season integer not null, week integer not null,
  slot text not null check (slot in ('QB','RB','WR','TE','FLEX')),
  ruling text not null check (ruling in ('void','played')),
  reason text not null check (length(reason) between 1 and 200),
  ruled_by uuid not null references auth.users(id),
  ruled_at timestamptz not null default clock_timestamp()
);
create table public.gtl_points_regrades (
  id bigserial primary key, load_id uuid not null references public.gtl_points_actual_loads(id),
  season integer not null, week integer not null, slot text not null,
  before jsonb not null, after jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create table public.gtl_points_week_final (
  season integer not null, week integer not null, load_id uuid references public.gtl_points_actual_loads(id),
  finalized_at timestamptz not null, results jsonb not null check (jsonb_typeof(results) = 'object'),
  primary key (season, week),
  foreign key (season, week) references public.gtl_points_slates(season, week)
);
-- Table grants: select and insert for service_role only; no browser role and no update or delete for anyone.
alter table public.gtl_points_actual_loads enable row level security;
alter table public.gtl_points_actuals enable row level security;
alter table public.gtl_points_rulings enable row level security;
alter table public.gtl_points_regrades enable row level security;
alter table public.gtl_points_week_final enable row level security;
revoke all on public.gtl_points_actual_loads, public.gtl_points_actuals, public.gtl_points_rulings, public.gtl_points_regrades,
  public.gtl_points_week_final from public, anon, authenticated, service_role;
revoke all on sequence public.gtl_points_rulings_id_seq, public.gtl_points_regrades_id_seq from public, anon, authenticated, service_role;
grant select, insert on public.gtl_points_actual_loads, public.gtl_points_actuals, public.gtl_points_rulings, public.gtl_points_regrades,
  public.gtl_points_week_final to service_role;
grant usage on sequence public.gtl_points_rulings_id_seq, public.gtl_points_regrades_id_seq to service_role;

-- (7) Slate guard: after publish, gtl_points_update_schedule is the only writer of a slate. It may change a slot's
-- kickoff and void and append to the audit; the slot order, every other slot field and every other column stay as
-- published (the column grant update(slots, audit) cannot express this on its own).
create function public.gtl_points_slate_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare n integer; was jsonb; changed jsonb; kick timestamptz;
begin
  if (new.season, new.week, new.opens_at, new.finalize_at, new.rules, new.provenance, new.published_by, new.published_at)
    is distinct from (old.season, old.week, old.opens_at, old.finalize_at, old.rules, old.provenance, old.published_by, old.published_at) then
    raise exception 'GTL_POINTS_INVALID'; end if;
  if jsonb_typeof(new.audit) is distinct from 'array' or jsonb_array_length(new.audit) < jsonb_array_length(old.audit) then
    raise exception 'GTL_POINTS_INVALID'; end if;
  if (select coalesce(jsonb_agg(a.entry order by a.pos), '[]'::jsonb) from jsonb_array_elements(new.audit) with ordinality a(entry, pos)
      where a.pos <= jsonb_array_length(old.audit)) <> old.audit then raise exception 'GTL_POINTS_INVALID'; end if;
  if jsonb_typeof(new.slots) is distinct from 'array' or jsonb_array_length(new.slots) <> jsonb_array_length(old.slots) then
    raise exception 'GTL_POINTS_INVALID'; end if;
  for n in 0..jsonb_array_length(old.slots) - 1 loop
    was := old.slots->n; changed := new.slots->n;
    if jsonb_typeof(changed) is distinct from 'object' then raise exception 'GTL_POINTS_INVALID'; end if;
    if (changed - 'kickoff' - 'void') is distinct from (was - 'kickoff' - 'void')
      or jsonb_typeof(changed->'kickoff') is distinct from 'string'
      or coalesce(jsonb_typeof(changed->'void'), 'missing') not in ('null', 'string') then raise exception 'GTL_POINTS_INVALID'; end if;
    begin kick := (changed->>'kickoff')::timestamptz; exception when others then raise exception 'GTL_POINTS_INVALID'; end;
    if not isfinite(kick) then raise exception 'GTL_POINTS_INVALID'; end if;
  end loop;
  return new;
end $$;
create trigger gtl_points_slate_guard before update on public.gtl_points_slates
  for each row execute function public.gtl_points_slate_guard();

-- (8) Functions -------------------------------------------------------------------------------------------------
-- Slot results: the scoring contract. A FINAL week reads its frozen results. Otherwise the newest saved load decides:
-- a slot is void (slate void, a ruling, a team change, a game change, or no snap), scored (a stats row with points, or
-- played with no row: 0), or pending. A played row with points null (a missing stat) is pending, never 0.
create function public.gtl_points_slot_results(p_season integer, p_week integer)
returns table(slot text, player_id text, kickoff timestamptz, status text, actual numeric, void_reason text, house numeric)
language plpgsql stable security invoker set search_path='' as $$
declare frozen jsonb; current_load public.gtl_points_actual_loads;
begin
  select f.results into frozen from public.gtl_points_week_final f where f.season = p_season and f.week = p_week;
  if found then
    return query select r->>'slot', r->>'playerId', (r->>'kickoff')::timestamptz, r->>'status', (r->>'actual')::numeric, r->>'voidReason', (r->>'house')::numeric
      from jsonb_array_elements(frozen->'slots') r;
    return;
  end if;
  select * into current_load from public.gtl_points_actual_loads l
    where l.season = p_season and l.week = p_week and l.status = 'saved' order by l.created_at desc, l.id desc limit 1;
  return query
  with slots as (select v from public.gtl_points_slates s, jsonb_array_elements(s.slots) v where s.season = p_season and s.week = p_week),
  ruled as (select distinct on (r.slot) r.slot, r.ruling from public.gtl_points_rulings r
            where r.season = p_season and r.week = p_week order by r.slot, r.ruled_at desc, r.id desc),
  joined as (
    select v, ruled.ruling, a.team a_team, a.game_id a_game, a.points a_points, (a.player_id is not null) has_row,
           case when current_load.id is null then null else (current_load.played->>(v->>'playerId'))::boolean end played
    from slots
    left join ruled on ruled.slot = v->>'slot'
    left join public.gtl_points_actuals a on a.load_id = current_load.id and a.player_id = v->>'playerId'),
  resolved as (
    select v, ruling, has_row, a_points, played,
      coalesce(v->>'void',
        case when ruling = 'void' then 'ruled' end,
        case when has_row and a_team <> v->>'team' then 'team_change' end,
        case when has_row and a_game <> v->>'gameId' then 'postponed' end,
        case when not has_row and played is false and ruling is distinct from 'played' then 'inactive' end) void_reason
    from joined)
  -- resolved.void_reason is qualified: unqualified, it is ambiguous with this function's void_reason output column.
  select v->>'slot', v->>'playerId', (v->>'kickoff')::timestamptz,
    case when resolved.void_reason is not null then 'void'
         when has_row and a_points is not null then 'scored'
         when not has_row and (played is true or ruling = 'played') then 'scored'
         else 'pending' end,
    case when resolved.void_reason is not null then null
         when has_row then a_points
         when played is true or ruling = 'played' then 0.0 end,
    resolved.void_reason, (v->>'house')::numeric
  from resolved;
end $$;

create function public.gtl_points_member_points(p_season integer, p_week integer)
returns table(user_id uuid, slot text, guess integer, points numeric)
language sql stable security invoker set search_path='' as $$
  select g.user_id, g.slot, g.guess, case when r.status = 'scored' then greatest(0, 10 - abs(g.guess - r.actual)) end
  from public.gtl_points_guesses g join public.gtl_points_slot_results(p_season, p_week) r on r.slot = g.slot
  where g.season = p_season and g.week = p_week and g.locked_at is not null
$$;

-- Apply the NFL schedule to a week's slots. p_games maps a game key to { week, kickoff }; a missing key is a cancelled
-- game. A game cancelled or moved out of the week voids its slot ('postponed'); a kickoff that moved while both times
-- are still ahead of p_now moves that slot's lock time with it. Every change is appended to the audit. Player, team,
-- game and House never change, and a FINAL week never changes at all.
create function public.gtl_points_update_schedule(p_season integer, p_week integer, p_games jsonb, p_now timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_slate public.gtl_points_slates; v_slot jsonb; v_game jsonb; n integer; v_was timestamptz; v_moved timestamptz;
  v_slots jsonb := '[]'; v_entries jsonb := '[]'; v_changed text[] := '{}';
begin
  if p_season is null or p_week is null or p_now is null or jsonb_typeof(p_games) is distinct from 'object' then raise exception 'GTL_POINTS_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('gtl_points_week:' || p_season || ':' || p_week, 0));
  select * into v_slate from public.gtl_points_slates s where s.season = p_season and s.week = p_week for update;
  if not found then raise exception 'GTL_POINTS_NO_SLATE'; end if;
  if exists(select 1 from public.gtl_points_week_final f where f.season = p_season and f.week = p_week) then
    return jsonb_build_object('changed', '[]'::jsonb);
  end if;
  for n in 0..jsonb_array_length(v_slate.slots) - 1 loop
    v_slot := v_slate.slots->n; v_game := p_games->(v_slot->>'gameId');
    if v_slot->>'void' is null then
      if v_game is not null then
        if jsonb_typeof(v_game) <> 'object' or jsonb_typeof(v_game->'week') is distinct from 'number' then raise exception 'GTL_POINTS_INVALID'; end if;
        if (v_game->>'week')::numeric <> trunc((v_game->>'week')::numeric) then raise exception 'GTL_POINTS_INVALID'; end if;
      end if;
      if v_game is null or (v_game->>'week')::numeric <> p_week then
        v_entries := v_entries || jsonb_build_array(jsonb_build_object('at', p_now, 'action', 'schedule', 'slot', v_slot->>'slot',
          'before', jsonb_build_object('void', null), 'after', jsonb_build_object('void', 'postponed')));
        v_slot := jsonb_set(v_slot, '{void}', '"postponed"'); v_changed := v_changed || (v_slot->>'slot');
      else
        if jsonb_typeof(v_game->'kickoff') is distinct from 'string'
          or v_game->>'kickoff' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$' then raise exception 'GTL_POINTS_INVALID'; end if;
        begin v_moved := (v_game->>'kickoff')::timestamptz; exception when others then raise exception 'GTL_POINTS_INVALID'; end;
        if not isfinite(v_moved) then raise exception 'GTL_POINTS_INVALID'; end if;
        v_was := (v_slot->>'kickoff')::timestamptz;
        if v_moved <> v_was and v_was > p_now and v_moved > p_now then
          v_entries := v_entries || jsonb_build_array(jsonb_build_object('at', p_now, 'action', 'schedule', 'slot', v_slot->>'slot',
            'before', jsonb_build_object('kickoff', v_slot->'kickoff'), 'after', jsonb_build_object('kickoff', to_jsonb(v_moved))));
          v_slot := jsonb_set(v_slot, '{kickoff}', to_jsonb(v_moved)); v_changed := v_changed || (v_slot->>'slot');
        end if;
      end if;
    end if;
    v_slots := v_slots || jsonb_build_array(v_slot);
  end loop;
  if cardinality(v_changed) > 0 then
    update public.gtl_points_slates s set slots = v_slots, audit = s.audit || v_entries where s.season = p_season and s.week = p_week;
  end if;
  return jsonb_build_object('changed', to_jsonb(v_changed));
end $$;

-- Store one nflverse load (the actualsPayload shape, shared/points-actuals.mjs) and re-grade the week. The same
-- checksums replay. A load after FINAL is recorded and changes nothing; a load the review disagrees with is flagged
-- and results keep the previous saved load; a saved load records one re-grade row per slot result it changed.
create function public.gtl_points_load_actuals(p_season integer, p_week integer, p_payload jsonb, p_now timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_hex constant text := '^[0-9a-f]{64}$';
  v_sources jsonb; v_stats text; v_snaps text; v_roster text; v_status text; v_load uuid;
  v_before jsonb; v_after jsonb; v_regraded text[] := '{}';
begin
  if p_season is null or p_week is null or p_now is null or jsonb_typeof(p_payload) is distinct from 'object'
    or p_payload->'season' is distinct from to_jsonb(p_season) or p_payload->'week' is distinct from to_jsonb(p_week)
    or p_payload->'rulesVersion' is distinct from '"points-1"'::jsonb then raise exception 'GTL_POINTS_INVALID'; end if;
  v_sources := p_payload->'sources';
  if jsonb_typeof(v_sources) is distinct from 'object' or jsonb_typeof(v_sources->'stats') is distinct from 'object'
    or jsonb_typeof(v_sources->'stats'->'sha256') is distinct from 'string' or v_sources->'stats'->>'sha256' !~ v_hex then raise exception 'GTL_POINTS_INVALID'; end if;
  v_stats := v_sources->'stats'->>'sha256';
  if coalesce(jsonb_typeof(v_sources->'snaps'), 'null') <> 'null' then
    if jsonb_typeof(v_sources->'snaps'->'sha256') is distinct from 'string' or v_sources->'snaps'->>'sha256' !~ v_hex then raise exception 'GTL_POINTS_INVALID'; end if;
    v_snaps := v_sources->'snaps'->>'sha256';
  end if;
  if coalesce(jsonb_typeof(v_sources->'roster'), 'null') <> 'null' then
    if jsonb_typeof(v_sources->'roster'->'sha256') is distinct from 'string' or v_sources->'roster'->>'sha256' !~ v_hex then raise exception 'GTL_POINTS_INVALID'; end if;
    v_roster := v_sources->'roster'->>'sha256';
  end if;
  if jsonb_typeof(p_payload->'review') is distinct from 'object' or jsonb_typeof(p_payload->'review'->'checked') is distinct from 'boolean'
    or coalesce(jsonb_typeof(p_payload->'review'->'agrees'), 'missing') not in ('boolean', 'null') then raise exception 'GTL_POINTS_INVALID'; end if;
  if jsonb_typeof(p_payload->'played') is distinct from 'object' then raise exception 'GTL_POINTS_INVALID'; end if;
  if exists(select 1 from jsonb_each(p_payload->'played') e where e.key !~ '^00-[0-9]{7}$' or jsonb_typeof(e.value) not in ('boolean', 'null')) then
    raise exception 'GTL_POINTS_INVALID'; end if;
  if jsonb_typeof(p_payload->'players') is distinct from 'array' or jsonb_array_length(p_payload->'players') > 5000 then raise exception 'GTL_POINTS_INVALID'; end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'players') p where not coalesce(jsonb_typeof(p) = 'object'
      and jsonb_typeof(p->'playerId') = 'string' and p->>'playerId' ~ '^00-[0-9]{7}$'
      and jsonb_typeof(p->'name') = 'string' and p->>'name' <> ''
      and jsonb_typeof(p->'team') = 'string' and p->>'team' ~ '^[A-Z]{2,4}$'
      and jsonb_typeof(p->'position') = 'string' and p->>'position' in ('QB','RB','WR','TE','K')
      and jsonb_typeof(p->'gameId') = 'string' and p->>'gameId' ~ '^[A-Z]{2,4}-[A-Z]{2,4}$'
      and jsonb_typeof(p->'stats') = 'object'
      and case jsonb_typeof(p->'points') when 'null' then true
        when 'number' then abs((p->>'points')::numeric) < 10000 and (p->>'points')::numeric = round((p->>'points')::numeric, 1)
        else false end, false))
    or (select count(distinct p->>'playerId') from jsonb_array_elements(p_payload->'players') p) <> jsonb_array_length(p_payload->'players') then
    raise exception 'GTL_POINTS_INVALID'; end if;
  if not exists(select 1 from public.gtl_points_slates s where s.season = p_season and s.week = p_week) then raise exception 'GTL_POINTS_NO_SLATE'; end if;
  perform pg_advisory_xact_lock(hashtextextended('gtl_points_week:' || p_season || ':' || p_week, 0));
  select l.id into v_load from public.gtl_points_actual_loads l where l.season = p_season and l.week = p_week and l.stats_sha256 = v_stats
    and coalesce(l.snaps_sha256, '') = coalesce(v_snaps, '') and coalesce(l.roster_sha256, '') = coalesce(v_roster, '');
  if found then return jsonb_build_object('status', 'replay', 'loadId', v_load, 'regraded', '[]'::jsonb); end if;
  select coalesce(jsonb_object_agg(r.slot, to_jsonb(r)), '{}'::jsonb) into v_before from public.gtl_points_slot_results(p_season, p_week) r;
  v_status := case
    when exists(select 1 from public.gtl_points_week_final f where f.season = p_season and f.week = p_week) then 'after_final'
    when p_payload->'review'->'checked' = 'true'::jsonb and p_payload->'review'->'agrees' = 'false'::jsonb then 'flagged'
    else 'saved' end;
  insert into public.gtl_points_actual_loads(season, week, stats_sha256, snaps_sha256, roster_sha256, sources, review, played, status, row_count)
    values(p_season, p_week, v_stats, v_snaps, v_roster, v_sources, p_payload->'review', p_payload->'played', v_status, jsonb_array_length(p_payload->'players'))
    returning id into v_load;
  insert into public.gtl_points_actuals(load_id, player_id, name, team, position, game_id, stats, points)
    select v_load, p->>'playerId', p->>'name', p->>'team', p->>'position', p->>'gameId', p->'stats', (p->>'points')::numeric
    from jsonb_array_elements(p_payload->'players') p;
  if v_status = 'saved' then
    select coalesce(jsonb_object_agg(r.slot, to_jsonb(r)), '{}'::jsonb) into v_after from public.gtl_points_slot_results(p_season, p_week) r;
    select coalesce(array_agg(a.key order by array_position(array['QB','RB','WR','TE','FLEX'], a.key)), '{}') into v_regraded
      from jsonb_each(v_after) a where a.value is distinct from v_before->a.key;
    insert into public.gtl_points_regrades(load_id, season, week, slot, before, after)
      select v_load, p_season, p_week, k, v_before->k, v_after->k from unnest(v_regraded) k;
  end if;
  return jsonb_build_object('status', v_status, 'loadId', v_load, 'regraded', to_jsonb(v_regraded));
end $$;

-- Commissioner ruling on a slot the data cannot settle ('void' or 'played'), from its kickoff until FINAL. The newest
-- ruling for a slot counts; every ruling stays. Returns that slot's new result.
create function public.gtl_points_rule_slot(p_actor uuid, p_season integer, p_week integer, p_slot text, p_ruling text, p_reason text,
  p_now timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_kickoff timestamptz; v_result jsonb;
begin
  if not public.gtl_community_admin(p_actor) then raise exception 'GTL_POINTS_FORBIDDEN'; end if;
  if p_season is null or p_week is null or p_now is null or p_slot is null or p_slot not in ('QB','RB','WR','TE','FLEX')
    or p_ruling is null or p_ruling not in ('void','played') or p_reason is null or length(btrim(p_reason)) not between 1 and 200
    or p_reason ~ '[[:cntrl:]]' then raise exception 'GTL_POINTS_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('gtl_points_week:' || p_season || ':' || p_week, 0));
  if exists(select 1 from public.gtl_points_week_final f where f.season = p_season and f.week = p_week) then raise exception 'GTL_POINTS_FINAL'; end if;
  select (x->>'kickoff')::timestamptz into v_kickoff from public.gtl_points_slates s, jsonb_array_elements(s.slots) x
    where s.season = p_season and s.week = p_week and x->>'slot' = p_slot;
  if not found then raise exception 'GTL_POINTS_NO_SLATE'; end if;
  if v_kickoff > p_now then raise exception 'GTL_POINTS_INVALID'; end if;
  insert into public.gtl_points_rulings(season, week, slot, ruling, reason, ruled_by) values(p_season, p_week, p_slot, p_ruling, btrim(p_reason), p_actor);
  select jsonb_build_object('slot', r.slot, 'playerId', r.player_id, 'kickoff', r.kickoff, 'status', r.status, 'actual', r.actual,
      'voidReason', r.void_reason, 'house', r.house) into v_result
    from public.gtl_points_slot_results(p_season, p_week) r where r.slot = p_slot;
  return v_result;
end $$;

-- FINAL: from finalize_at, once no slot is pending, freeze the week's per-slot results, every member's locked-guess
-- points and the House total. One row per week; a re-run replays.
create function public.gtl_points_finalize(p_season integer, p_week integer, p_now timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_slate public.gtl_points_slates; v_load uuid; v_results jsonb;
begin
  if p_season is null or p_week is null or p_now is null then raise exception 'GTL_POINTS_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('gtl_points_week:' || p_season || ':' || p_week, 0));
  select * into v_slate from public.gtl_points_slates s where s.season = p_season and s.week = p_week;
  if not found then return jsonb_build_object('status', 'no_slate'); end if;
  if exists(select 1 from public.gtl_points_week_final f where f.season = p_season and f.week = p_week) then return jsonb_build_object('status', 'replay'); end if;
  if p_now < v_slate.finalize_at then return jsonb_build_object('status', 'not_due'); end if;
  if exists(select 1 from public.gtl_points_slot_results(p_season, p_week) r where r.status = 'pending') then
    return jsonb_build_object('status', 'waiting_on_stats'); end if;
  select l.id into v_load from public.gtl_points_actual_loads l
    where l.season = p_season and l.week = p_week and l.status = 'saved' order by l.created_at desc, l.id desc limit 1;
  with r as (select * from public.gtl_points_slot_results(p_season, p_week)),
  m as (select mp.user_id, mp.slot, mp.points from public.gtl_points_member_points(p_season, p_week) mp)
  select jsonb_build_object(
    'slots', (select jsonb_agg(jsonb_build_object('slot', r.slot, 'playerId', r.player_id, 'kickoff', r.kickoff, 'status', r.status,
        'actual', r.actual, 'voidReason', r.void_reason, 'house', r.house) order by array_position(array['QB','RB','WR','TE','FLEX'], r.slot)) from r),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('userId', u.user_id, 'points', u.points, 'slots', u.slots) order by u.user_id), '[]'::jsonb)
      from (select m.user_id, coalesce(sum(m.points), 0) points, jsonb_build_object(
          'QB', max(m.points) filter (where m.slot = 'QB'), 'RB', max(m.points) filter (where m.slot = 'RB'),
          'WR', max(m.points) filter (where m.slot = 'WR'), 'TE', max(m.points) filter (where m.slot = 'TE'),
          'FLEX', max(m.points) filter (where m.slot = 'FLEX')) slots
        from m group by m.user_id) u),
    'house', (select case when bool_or(r.status <> 'void' and r.house is null) then null
        else coalesce(sum(greatest(0, 10 - abs(round(r.house, 1) - r.actual))) filter (where r.status = 'scored'), 0) end from r),
    'max', (select 50 - 10 * count(*) from r where r.status = 'void'))
  into v_results;
  insert into public.gtl_points_week_final(season, week, load_id, finalized_at, results) values(p_season, p_week, v_load, p_now, v_results)
    on conflict (season, week) do nothing;
  if not found then return jsonb_build_object('status', 'replay'); end if;
  return jsonb_build_object('status', 'final');
end $$;

-- The scheduled worker's view of a season (P-03, Task 7): published weeks and, for weeks not yet FINAL, when they
-- finalize and when their first slot kicks off.
create function public.gtl_points_jobs_state(p_season integer, p_now timestamptz) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'published', coalesce((select jsonb_agg(s.week order by s.week) from public.gtl_points_slates s where s.season = p_season), '[]'::jsonb),
    'unfinal', coalesce((select jsonb_agg(jsonb_build_object('week', s.week, 'finalizeAt', s.finalize_at,
        'firstKickoff', (select min((x->>'kickoff')::timestamptz) from jsonb_array_elements(s.slots) x)) order by s.week)
      from public.gtl_points_slates s where s.season = p_season
        and not exists(select 1 from public.gtl_points_week_final f where f.season = s.season and f.week = s.week)), '[]'::jsonb))
$$;

-- The commissioner check the slate route makes before any fetch.
create function public.gtl_points_is_admin(p_user uuid) returns boolean
language sql stable security invoker set search_path='' as $$ select public.gtl_community_admin(p_user) $$;

-- The Points read for one viewer: the week's slots with results, the viewer's own guesses (drafts included), who has
-- locked in (faces, no numbers), and the gated part. Another member's guess and points and the House value show on a
-- slot only once the viewer has locked in that slot or from its kickoff (gtl_points_revealed); the week and season
-- boards count another member's or the House's points only on slots revealed to the viewer, so nothing derived from a
-- hidden guess is shown. p_league scopes members, lock-ins, others and both boards to that league's active roster.
create function public.gtl_points_read(p_user uuid, p_season integer, p_week integer, p_league text, p_now timestamptz) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare
  v_slate public.gtl_points_slates; v_found boolean; v_scope uuid[]; v_members jsonb; v_admin boolean; v_opted boolean;
  v_status text; v_reply jsonb;
begin
  if p_user is null or p_now is null or (p_season is null) <> (p_week is null) then raise exception 'GTL_POINTS_INVALID'; end if;
  if not public.gtl_community_member(p_user) then raise exception 'GTL_POINTS_MEMBER'; end if;
  if p_league is not null and not exists(select 1 from public.gtl_memberships m where m.user_id = p_user and m.league_id = p_league and m.active) then
    raise exception 'GTL_POINTS_MEMBER'; end if;
  if p_league is null then
    select coalesce(array_agg(p.user_id), '{}') into v_scope from public.gtl_profiles p
      where not exists(select 1 from public.gtl_community_removals r where r.user_id = p.user_id);
  else
    select coalesce(array_agg(m.user_id), '{}') into v_scope from public.gtl_memberships m where m.league_id = p_league and m.active;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'displayName', p.display_name) order by lower(p.display_name), u.id), '[]'::jsonb)
    into v_members from unnest(v_scope) u(id) left join public.gtl_profiles p on p.user_id = u.id;
  v_admin := public.gtl_community_admin(p_user);
  if p_season is null then
    select * into v_slate from public.gtl_points_slates s where s.opens_at <= p_now order by s.season desc, s.week desc limit 1;
  else
    select * into v_slate from public.gtl_points_slates s where s.season = p_season and s.week = p_week and s.opens_at <= p_now;
  end if;
  v_found := found;
  v_opted := exists(select 1 from public.gtl_points_guesses g
    where g.user_id = p_user and g.season = coalesce(v_slate.season, p_season) and g.locked_at is not null);
  if not v_found then
    return jsonb_build_object('status', 'none', 'viewer', p_user, 'admin', v_admin, 'leagueId', p_league, 'optedIn', v_opted, 'members', v_members);
  end if;
  -- A week is closed once every slot has kicked off or is void (nothing is left to enter).
  v_status := case
    when exists(select 1 from public.gtl_points_week_final f where f.season = v_slate.season and f.week = v_slate.week) then 'final'
    when not exists(select 1 from jsonb_array_elements(v_slate.slots) x where x->>'void' is null and (x->>'kickoff')::timestamptz > p_now) then 'closed'
    else 'open' end;
  with weeks as (
    select s.season, s.week from public.gtl_points_slates s where s.season = v_slate.season and s.opens_at <= p_now),
  res as (
    select w.week, r.slot, r.status, r.actual, r.void_reason, r.house,
      public.gtl_points_revealed(p_user, w.season, w.week, r.slot, p_now) revealed,
      case when r.status = 'scored' and r.house is not null then greatest(0, 10 - abs(round(r.house, 1) - r.actual)) end house_points
    from weeks w cross join lateral public.gtl_points_slot_results(w.season, w.week) r),
  pts as (
    select w.week, mp.user_id, mp.slot, mp.guess, case when mp.user_id = p_user or res.revealed then mp.points end points
    from weeks w cross join lateral public.gtl_points_member_points(w.season, w.week) mp
    join res on res.week = w.week and res.slot = mp.slot
    where mp.user_id = any(v_scope)),
  member_week as (
    select pts.week, pts.user_id, coalesce(sum(pts.points), 0) points, count(pts.points) scored from pts group by pts.week, pts.user_id),
  house_week as (
    select res.week, case when bool_or(res.status <> 'void' and res.house is null) then null
      else coalesce(sum(res.house_points) filter (where res.revealed), 0) end points
    from res group by res.week),
  opted as (
    select distinct g.user_id from public.gtl_points_guesses g
    where g.season = v_slate.season and g.locked_at is not null and g.user_id = any(v_scope))
  select jsonb_build_object(
    'status', v_status, 'season', v_slate.season, 'week', v_slate.week, 'opensAt', v_slate.opens_at, 'finalizeAt', v_slate.finalize_at,
    'rules', v_slate.rules, 'viewer', p_user, 'admin', v_admin, 'leagueId', p_league, 'optedIn', v_opted, 'members', v_members,
    'slots', (select jsonb_agg(jsonb_build_object(
        'slot', t.x->>'slot', 'playerId', t.x->>'playerId', 'name', t.x->>'name', 'team', t.x->>'team', 'position', t.x->>'position',
        'gameId', t.x->>'gameId', 'kickoff', t.x->'kickoff', 'window', t.x->>'window', 'void', res.void_reason,
        'result', jsonb_build_object('status', res.status, 'actual', res.actual),
        'mine', (select jsonb_build_object('guess', g.guess, 'lockedAt', g.locked_at, 'points',
            (select pts.points from pts where pts.week = res.week and pts.slot = res.slot and pts.user_id = p_user))
          from public.gtl_points_guesses g where g.user_id = p_user and g.season = v_slate.season and g.week = res.week and g.slot = res.slot),
        'lockedBy', (select coalesce(jsonb_agg(g.user_id order by g.locked_at, g.user_id), '[]'::jsonb) from public.gtl_points_guesses g
          where g.season = v_slate.season and g.week = res.week and g.slot = res.slot and g.locked_at is not null and g.user_id = any(v_scope)),
        'revealed', res.revealed,
        'others', case when res.revealed then (select coalesce(jsonb_agg(jsonb_build_object('userId', pts.user_id, 'guess', pts.guess, 'points', pts.points)
            order by pts.user_id), '[]'::jsonb) from pts where pts.week = res.week and pts.slot = res.slot and pts.user_id <> p_user) end,
        'house', case when res.revealed then jsonb_build_object('visible', true, 'value', res.house, 'points', res.house_points)
          else jsonb_build_object('visible', false) end) order by t.n)
      from jsonb_array_elements(v_slate.slots) with ordinality t(x, n) join res on res.week = v_slate.week and res.slot = t.x->>'slot'),
    'weekBoard', jsonb_build_object(
      'max', 50 - 10 * (select count(*) from res where res.week = v_slate.week and res.status = 'void'),
      'mine', (select mw.points from member_week mw where mw.week = v_slate.week and mw.user_id = p_user),
      'house', (select hw.points from house_week hw where hw.week = v_slate.week),
      'standings', (select coalesce(jsonb_agg(jsonb_build_object('userId', o.user_id, 'points', mw.points, 'slotsScored', coalesce(mw.scored, 0))
          order by mw.points desc nulls last, o.user_id), '[]'::jsonb)
        from opted o left join member_week mw on mw.user_id = o.user_id and mw.week = v_slate.week)),
    'seasonBoard', jsonb_build_object(
      'standings', (select coalesce(jsonb_agg(jsonb_build_object('userId', b.user_id, 'points', b.points, 'weeksPlayed', b.played, 'beatHouse', b.beat)
          order by b.points desc nulls last, b.user_id), '[]'::jsonb)
        from (select o.user_id, sum(mw.points) points, count(mw.week) played,
                count(*) filter (where hw.points is not null and mw.points > hw.points) beat
              from opted o left join member_week mw on mw.user_id = o.user_id left join house_week hw on hw.week = mw.week
              group by o.user_id) b),
      'house', (select sum(hw.points) from house_week hw)))
  into v_reply;
  return v_reply;
end $$;

-- (9) Function grants: service_role only (the slate guard is a trigger and is granted to no one).
revoke all on function public.gtl_points_slate_guard() from public, anon, authenticated;
revoke all on function public.gtl_points_slot_results(integer,integer), public.gtl_points_member_points(integer,integer),
  public.gtl_points_update_schedule(integer,integer,jsonb,timestamptz), public.gtl_points_load_actuals(integer,integer,jsonb,timestamptz),
  public.gtl_points_rule_slot(uuid,integer,integer,text,text,text,timestamptz), public.gtl_points_finalize(integer,integer,timestamptz),
  public.gtl_points_jobs_state(integer,timestamptz), public.gtl_points_is_admin(uuid),
  public.gtl_points_read(uuid,integer,integer,text,timestamptz) from public, anon, authenticated;
grant execute on function public.gtl_points_slot_results(integer,integer), public.gtl_points_member_points(integer,integer),
  public.gtl_points_update_schedule(integer,integer,jsonb,timestamptz), public.gtl_points_load_actuals(integer,integer,jsonb,timestamptz),
  public.gtl_points_rule_slot(uuid,integer,integer,text,text,text,timestamptz), public.gtl_points_finalize(integer,integer,timestamptz),
  public.gtl_points_jobs_state(integer,timestamptz), public.gtl_points_is_admin(uuid),
  public.gtl_points_read(uuid,integer,integer,text,timestamptz) to service_role;
