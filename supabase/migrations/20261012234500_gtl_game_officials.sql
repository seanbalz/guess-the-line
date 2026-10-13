-- Game referees for situational trends (Sean's October 12, 2026 trends ruling, option A:
-- "Referee trends use a referee you pick from a dropdown for each game once assignments come out").
-- The community commissioner records each published game's referee once the NFL announces crews;
-- every community member reads the assignment, and the trend panel shows that referee's records
-- ("Referee not assigned yet" otherwise). Public game facts only: no picks, lines or odds.
--
-- The current assignment is keyed by season, week and game id and names who set it. Every change
-- is also appended to gtl_game_official_history and gtl_access_audit, and there is no delete
-- grant, so nothing entered is deleted, moved or hidden (D-23); clearing a referee is a new
-- revision with referee null. Tables are service-role only behind RLS; both functions are
-- security invoker, revoked from public, anon and authenticated, and executable by service_role.
create table public.gtl_game_officials (
  season integer not null check (season between 2000 and 2200),
  week integer not null check (week between 1 and 25),
  game_id text not null check (game_id ~ '^[A-Z]{2,3}-[A-Z]{2,3}$'),
  referee text check (referee is null or (char_length(referee) between 3 and 60
    and referee ~ '^[A-Za-z][A-Za-z .''-]*[A-Za-z.]$' and position('  ' in referee) = 0)),
  set_by uuid not null references auth.users(id),
  set_at timestamptz not null default now(),
  revision integer not null default 1 check (revision >= 1),
  primary key (season, week, game_id),
  foreign key (season, week) references public.gtl_weekly_slates(season, week)
);
create table public.gtl_game_official_history (
  id bigint generated always as identity primary key,
  season integer not null,
  week integer not null,
  game_id text not null,
  revision integer not null check (revision >= 1),
  referee text,
  previous_referee text,
  set_by uuid not null references auth.users(id),
  set_at timestamptz not null,
  unique (season, week, game_id, revision),
  foreign key (season, week, game_id) references public.gtl_game_officials(season, week, game_id)
);
alter table public.gtl_game_officials enable row level security;
alter table public.gtl_game_official_history enable row level security;
revoke all on public.gtl_game_officials, public.gtl_game_official_history from public, anon, authenticated, service_role;
grant select, insert, update(referee, set_by, set_at, revision) on public.gtl_game_officials to service_role;
grant select, insert on public.gtl_game_official_history to service_role;

-- Commissioner only. The game must be on that week's published slate. Saving the same referee
-- again (or clearing a game that was never assigned) changes nothing and reports changed=false.
create function public.gtl_set_game_official(p_user uuid, p_season integer, p_week integer, p_game text, p_referee text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  sig jsonb;
  cur public.gtl_game_officials%rowtype;
  had boolean;
  name text;
  next_revision integer;
  at timestamptz := clock_timestamp();
begin
  if not public.gtl_community_admin(p_user) then raise exception 'GTL_OFFICIALS_FORBIDDEN'; end if;
  if p_season is null or p_season not between 2000 and 2200 or p_week is null or p_week not between 1 and 25
    or p_game is null or p_game !~ '^[A-Z]{2,3}-[A-Z]{2,3}$' then raise exception 'GTL_OFFICIALS_INVALID'; end if;
  name := nullif(btrim(regexp_replace(coalesce(p_referee, ''), '\s+', ' ', 'g')), '');
  if p_referee is not null and (name is null or char_length(name) not between 3 and 60
    or name !~ '^[A-Za-z][A-Za-z .''-]*[A-Za-z.]$') then raise exception 'GTL_OFFICIALS_INVALID'; end if;
  select signature into sig from public.gtl_weekly_slates where season = p_season and week = p_week;
  if sig is null or not exists(select 1 from jsonb_array_elements(coalesce(sig->'games', '[]'::jsonb)) g where g->>'id' = p_game) then
    raise exception 'GTL_OFFICIALS_UNKNOWN_GAME';
  end if;
  select * into cur from public.gtl_game_officials where season = p_season and week = p_week and game_id = p_game for update;
  had := found;
  if (had and cur.referee is not distinct from name) or (not had and name is null) then
    return jsonb_build_object('season', p_season, 'week', p_week, 'gameId', p_game, 'referee', case when had then cur.referee end,
      'setAt', case when had then cur.set_at end, 'revision', case when had then cur.revision else 0 end, 'changed', false);
  end if;
  next_revision := case when had then cur.revision + 1 else 1 end;
  if had then
    update public.gtl_game_officials set referee = name, set_by = p_user, set_at = at, revision = next_revision
      where season = p_season and week = p_week and game_id = p_game;
  else
    insert into public.gtl_game_officials(season, week, game_id, referee, set_by, set_at, revision)
      values (p_season, p_week, p_game, name, p_user, at, next_revision);
  end if;
  insert into public.gtl_game_official_history(season, week, game_id, revision, referee, previous_referee, set_by, set_at)
    values (p_season, p_week, p_game, next_revision, name, case when had then cur.referee end, p_user, at);
  insert into public.gtl_access_audit(actor_id, event)
    values (p_user, format('game_official:%s:%s:%s:%s', p_season, p_week, p_game, next_revision));
  return jsonb_build_object('season', p_season, 'week', p_week, 'gameId', p_game, 'referee', name, 'setAt', at,
    'revision', next_revision, 'changed', true);
end $$;

-- Any community member (the same check as gtl_read_community) reads one week's assignments.
create function public.gtl_read_game_officials(p_user uuid, p_season integer, p_week integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_season is null or p_season not between 2000 and 2200 or p_week is null or p_week not between 1 and 25 then
    raise exception 'GTL_OFFICIALS_INVALID';
  end if;
  return jsonb_build_object('season', p_season, 'week', p_week, 'assignments', coalesce((
    select jsonb_object_agg(o.game_id, jsonb_build_object('referee', o.referee, 'setAt', o.set_at, 'setBy', o.set_by, 'revision', o.revision))
    from public.gtl_game_officials o where o.season = p_season and o.week = p_week), '{}'::jsonb));
end $$;

revoke all on function public.gtl_set_game_official(uuid, integer, integer, text, text), public.gtl_read_game_officials(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.gtl_set_game_official(uuid, integer, integer, text, text), public.gtl_read_game_officials(uuid, integer, integer)
  to service_role;
