-- P-01 Guess the Points core (D-56; spec docs/superpowers/specs/2026-10-22-guess-the-points-design.md).
-- Local implementation only: applying it to the hosted project is Sean's "apply P-01" (Gate M).
--
-- Additive. New tables and service-only, security-invoker functions; no existing table, column, trigger, grant or
-- function changes, so there is no "-- replaces" header and no supabase/rollback/ file. The off switch is the gtl-api
-- secret GTL_FEATURE_OFF=points (cloud/feature-off.mjs): writers refuse; every stored row stays (D-23).
--
-- Layout of this file: (1) tables, (2) guard trigger, (3) table grants, (4) publish / save / reveal-gate functions,
-- (5) function grants. The actuals, results, finalize and read functions follow in the second half (Task 5).

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
-- ever deleted (D-23), and no guess is written for a slot whose kickoff has passed by the real clock.
create function public.gtl_points_guess_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare kickoff timestamptz;
begin
  if tg_op = 'DELETE' then raise exception 'GTL_POINTS_DELETE'; end if;
  if tg_op = 'UPDATE' and old.locked_at is not null then raise exception 'GTL_POINTS_LOCKED'; end if;
  select (s->>'kickoff')::timestamptz into kickoff
    from public.gtl_points_slates p, jsonb_array_elements(p.slots) s
    where p.season = new.season and p.week = new.week and s->>'slot' = new.slot;
  if kickoff is null or clock_timestamp() >= kickoff then raise exception 'GTL_POINTS_CLOSED'; end if;
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
