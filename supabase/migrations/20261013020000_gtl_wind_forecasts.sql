-- D-34 kickoff wind forecast. Sean (product owner), October 13, 2026: "go ahead with the wind forecast too".
-- The only trend that beat chance out of sample is observed kickoff wind of 10+ mph going Under; until
-- now it could only be shown after a game. Source: the Open-Meteo forecast API (https://open-meteo.com),
-- data under CC BY 4.0 with an attribution link next to every place it is shown; the free API is for
-- non-commercial use under 10,000 calls a day. GTL caps itself at 200 calls (locations) per UTC day here.
-- Reference only: nothing here touches ballots, picks, scores, deadlines, kickoff locks or the D-23 reveal.
--
-- gtl-api reads a week's stored snapshots for any community member and, on a read, refreshes the
-- games that are due (outdoor and retractable venues, within 120 h of kickoff, TTL 1 h / 3 h / 6 h by
-- lead) through gtl_begin_wind_fetch (single flight under an advisory lock and a 20 s lease, 60 s
-- spacing, backoff, the daily cap) and gtl_finish_wind_fetch. Only stadium coordinates are sent; no
-- user id is stored with an attempt. All three tables are insert-only (no update or delete grant, not
-- even for service_role), RLS on, service-role only; all three functions are security invoker with an
-- empty search path, revoked from public, anon and authenticated, executable by service_role, and touch
-- no other table except the slate and the community membership check.
-- Depends only on 20261008182836 (gtl_weekly_slates) and 20261009120000 (gtl_community_member).

create table public.gtl_wind_fetches (
  id uuid primary key,
  season integer not null check (season between 2000 and 2200),
  week integer not null check (week between 1 and 25),
  started_at timestamptz not null,
  lease_token uuid not null unique,
  lease_until timestamptz not null,
  locations integer not null check (locations between 1 and 16),
  games jsonb not null check (jsonb_typeof(games) = 'array' and jsonb_array_length(games) between 1 and 16
    and not jsonb_path_exists(games, '$[*] ? (@.type() != "object" || !(exists(@.gameId)) || !(exists(@.venueId)) || !(exists(@.latitude)) || !(exists(@.longitude)) || !(exists(@.kickoff)))')),
  window_start timestamptz not null,
  window_end timestamptz not null,
  check (window_end > window_start and window_end - window_start <= interval '6 days'),
  check (lease_until > started_at),
  foreign key (season, week) references public.gtl_weekly_slates(season, week)
);
create index gtl_wind_fetches_started_idx on public.gtl_wind_fetches(started_at);

create table public.gtl_wind_fetch_outcomes (
  fetch_id uuid primary key references public.gtl_wind_fetches(id),
  finished_at timestamptz not null,
  status text not null check (status in ('succeeded', 'failed')),
  error_code text check (error_code is null or error_code in ('WIND_TIMEOUT', 'WIND_RATE_LIMIT_DAILY', 'WIND_RATE_LIMIT', 'WIND_HTTP',
    'WIND_UNAVAILABLE', 'WIND_BODY_LIMIT', 'WIND_PAYLOAD', 'WIND_UNITS', 'WIND_LEASE_EXPIRED')),
  http_status integer check (http_status is null or http_status between 100 and 599),
  stored integer not null default 0 check (stored between 0 and 16),
  skipped integer not null default 0 check (skipped between 0 and 16),
  check ((status = 'succeeded') = (error_code is null))
);

create table public.gtl_wind_forecasts (
  id bigint generated always as identity primary key,
  fetch_id uuid not null references public.gtl_wind_fetches(id),
  season integer not null,
  week integer not null,
  game_id text not null check (game_id ~ '^[A-Z]{2,3}-[A-Z]{2,3}$'),
  venue_id text not null check (venue_id ~ '^[A-Z]{3}[0-9]{2}$'),
  latitude numeric(6,3) not null check (latitude between -90 and 90),
  longitude numeric(7,3) not null check (longitude between -180 and 180),
  grid_latitude double precision not null check (grid_latitude between -90 and 90),
  grid_longitude double precision not null check (grid_longitude between -180 and 180),
  elevation_m real check (elevation_m is null or elevation_m between -1000 and 10000),
  kickoff timestamptz not null,
  forecast_hour timestamptz not null,
  gust_hour timestamptz not null,
  wind_mph numeric(4,1) not null check (wind_mph between 0 and 200),
  gust_mph numeric(4,1) check (gust_mph between 0 and 250),
  wind_direction_deg smallint check (wind_direction_deg between 0 and 360),
  temperature_f numeric(4,1) check (temperature_f between -60 and 140),
  precipitation_probability smallint check (precipitation_probability between 0 and 100),
  precipitation_in numeric(5,3) check (precipitation_in between 0 and 20),
  model text not null check (model = 'best_match'),
  generation_ms double precision not null check (generation_ms >= 0 and generation_ms < 'Infinity'),
  fetched_at timestamptz not null,
  source text not null check (source = 'Open-Meteo forecast API'),
  source_url text not null check (starts_with(source_url, 'https://api.open-meteo.com/v1/forecast?') and char_length(source_url) <= 2048),
  license_note text not null check (license_note = 'Weather data by Open-Meteo.com, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/); Kickoff-hour values selected by GTL; wind direction shown as compass points'),
  unique (fetch_id, game_id),
  -- The three-argument date_trunc keeps both hour rules exact whatever the session TimeZone is.
  check (forecast_hour = date_trunc('hour', kickoff + interval '30 minutes', 'UTC')),
  check (gust_hour = date_trunc('hour', kickoff, 'UTC') + interval '1 hour'),
  check (fetched_at < kickoff),
  foreign key (season, week) references public.gtl_weekly_slates(season, week)
);
create index gtl_wind_forecasts_game_idx on public.gtl_wind_forecasts(season, week, game_id, fetched_at desc);

alter table public.gtl_wind_fetches enable row level security;
alter table public.gtl_wind_fetch_outcomes enable row level security;
alter table public.gtl_wind_forecasts enable row level security;
revoke all on public.gtl_wind_fetches, public.gtl_wind_fetch_outcomes, public.gtl_wind_forecasts from public, anon, authenticated, service_role;
grant select, insert on public.gtl_wind_fetches, public.gtl_wind_fetch_outcomes, public.gtl_wind_forecasts to service_role;

-- Any community member (the same check as gtl_read_community and gtl_read_game_officials) reads a week:
-- the slate games, the newest snapshot per game for the slate's kickoff, the last attempt and today's
-- budget, and the database clock that every refresh decision uses. Never returns user ids or leases.
create function public.gtl_read_wind_forecasts(p_user uuid, p_season integer, p_week integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
  sig jsonb;
  stamp timestamptz := now();
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_season is null or p_season not between 2000 and 2200 or p_week is null or p_week not between 1 and 25 then
    raise exception 'GTL_WIND_INVALID';
  end if;
  select signature into sig from public.gtl_weekly_slates where season = p_season and week = p_week;
  if sig is null then
    return jsonb_build_object('season', p_season, 'week', p_week, 'now', stamp, 'published', false, 'games', '[]'::jsonb, 'latest', '{}'::jsonb);
  end if;
  return jsonb_build_object('season', p_season, 'week', p_week, 'now', stamp, 'published', true,
    'games', coalesce((select jsonb_agg(jsonb_build_object('id', g->>'id', 'away', g->>'away', 'home', g->>'home',
        'kickoff', (g->>'kickoff')::double precision) order by g->>'id')
      from jsonb_array_elements(coalesce(sig->'games', '[]'::jsonb)) g), '[]'::jsonb),
    'latest', coalesce((select jsonb_object_agg(x.game_id, x.snapshot) from (
      select distinct on (f.game_id) f.game_id, jsonb_build_object(
          'kickoff', f.kickoff, 'forecastHour', f.forecast_hour, 'gustHour', f.gust_hour, 'fetchedAt', f.fetched_at,
          'windMph', f.wind_mph, 'gustMph', f.gust_mph, 'directionDeg', f.wind_direction_deg, 'temperatureF', f.temperature_f,
          'precipitationProbability', f.precipitation_probability, 'precipitationIn', f.precipitation_in,
          'gridLatitude', f.grid_latitude, 'gridLongitude', f.grid_longitude, 'elevationM', f.elevation_m,
          'model', f.model, 'source', f.source, 'sourceUrl', f.source_url) snapshot
        from public.gtl_wind_forecasts f
        join jsonb_array_elements(coalesce(sig->'games', '[]'::jsonb)) g
          on g->>'id' = f.game_id and f.kickoff = to_timestamp((g->>'kickoff')::double precision)
        where f.season = p_season and f.week = p_week
        order by f.game_id, f.fetched_at desc, f.id desc) x), '{}'::jsonb),
    'lastAttempt', (select jsonb_build_object('startedAt', a.started_at,
        'status', case when o.fetch_id is not null then o.status when a.lease_until > stamp then 'running' else 'expired' end,
        'errorCode', o.error_code)
      from public.gtl_wind_fetches a left join public.gtl_wind_fetch_outcomes o on o.fetch_id = a.id
      order by a.started_at desc, a.id desc limit 1),
    'budget', jsonb_build_object('usedToday', (select coalesce(sum(a.locations), 0) from public.gtl_wind_fetches a
      where a.started_at >= date_trunc('day', stamp, 'UTC')), 'cap', 200));
end $$;

-- Starts one Open-Meteo request, or says why not. Serialized across Edge isolates by one transaction
-- advisory lock; a 20 s lease means at most one request is in flight anywhere. Every time decision uses
-- this function's own clock. Games are re-checked here: each must be on the week's published slate
-- with the identical kickoff and at most 120 h out; a game that has kicked off or whose newest snapshot
-- is younger than its TTL (1 h within 18 h, 3 h within 72 h, 6 h within 120 h) is dropped. Refusals
-- that are not errors return { started: false, reason }: busy, cooldown (60 s spacing), backoff, not_due,
-- budget. The daily cap counts locations of every attempt started since 00:00 UTC, failures included;
-- a request that would pass it is trimmed to the remaining calls, nearest kickoff first.
create function public.gtl_begin_wind_fetch(p_user uuid, p_request uuid, p_season integer, p_week integer, p_games jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  stamp timestamptz;
  sig jsonb;
  g jsonb;
  slate_kickoff double precision;
  kick timestamptz;
  newest timestamptz;
  ttl interval;
  ids text[] := '{}';
  due jsonb := '[]'::jsonb;
  keep jsonb := '[]'::jsonb;
  places text[] := '{}';
  place text;
  prior record;
  failures integer;
  hold_until timestamptz;
  used integer;
  remaining integer;
  lease uuid := pg_catalog.gen_random_uuid();
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_request is null or p_season is null or p_season not between 2000 and 2200 or p_week is null or p_week not between 1 and 25 then
    raise exception 'GTL_WIND_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('gtl_wind_fetch'));
  stamp := clock_timestamp();
  -- A request that died mid-fetch gets its outcome now: it counts against the budget and backs off 15 minutes.
  insert into public.gtl_wind_fetch_outcomes(fetch_id, finished_at, status, error_code, http_status, stored)
    select a.id, stamp, 'failed', 'WIND_LEASE_EXPIRED', null, 0 from public.gtl_wind_fetches a
    where a.lease_until <= stamp and not exists (select 1 from public.gtl_wind_fetch_outcomes o where o.fetch_id = a.id);
  if exists (select 1 from public.gtl_wind_fetches where id = p_request) then raise exception 'GTL_WIND_INVALID'; end if;
  select signature into sig from public.gtl_weekly_slates where season = p_season and week = p_week;
  if sig is null or p_games is null or jsonb_typeof(p_games) <> 'array' or jsonb_array_length(p_games) not between 1 and 16 then
    raise exception 'GTL_WIND_INVALID';
  end if;
  for g in select value from jsonb_array_elements(p_games) loop
    if jsonb_typeof(g) <> 'object'
      or (select array_agg(k collate "C" order by k collate "C") from jsonb_object_keys(g) k) <> array['gameId', 'kickoff', 'latitude', 'longitude', 'venueId'] collate "C"
      or jsonb_typeof(g->'gameId') <> 'string' or (g->>'gameId') !~ '^[A-Z]{2,3}-[A-Z]{2,3}$' or (g->>'gameId') = any(ids)
      or jsonb_typeof(g->'venueId') <> 'string' or (g->>'venueId') !~ '^[A-Z]{3}[0-9]{2}$'
      or jsonb_typeof(g->'latitude') <> 'number' or (g->>'latitude')::numeric not between -90 and 90 or (g->>'latitude')::numeric <> round((g->>'latitude')::numeric, 3)
      or jsonb_typeof(g->'longitude') <> 'number' or (g->>'longitude')::numeric not between -180 and 180 or (g->>'longitude')::numeric <> round((g->>'longitude')::numeric, 3)
      or jsonb_typeof(g->'kickoff') <> 'string' or (g->>'kickoff') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$' then
      raise exception 'GTL_WIND_INVALID';
    end if;
    ids := ids || (g->>'gameId');
    kick := (g->>'kickoff')::timestamptz;
    slate_kickoff := null;
    select (x->>'kickoff')::double precision into slate_kickoff from jsonb_array_elements(coalesce(sig->'games', '[]'::jsonb)) x where x->>'id' = g->>'gameId';
    if slate_kickoff is null or to_timestamp(slate_kickoff) <> kick or kick - stamp > interval '120 hours' then raise exception 'GTL_WIND_INVALID'; end if;
    if kick <= stamp then continue; end if;
    ttl := case when kick - stamp <= interval '18 hours' then interval '1 hour' when kick - stamp <= interval '72 hours' then interval '3 hours' else interval '6 hours' end;
    select max(f.fetched_at) into newest from public.gtl_wind_forecasts f
      where f.season = p_season and f.week = p_week and f.game_id = g->>'gameId' and f.kickoff = kick;
    if newest is not null and stamp - newest < ttl then continue; end if;
    due := due || jsonb_build_array(jsonb_build_object('gameId', g->'gameId', 'venueId', g->'venueId', 'latitude', g->'latitude', 'longitude', g->'longitude',
      'kickoff', to_char(kick at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  end loop;
  -- One venue id always means one point.
  if (select count(distinct x->>'venueId') <> count(distinct (x->>'venueId', (x->>'latitude')::numeric, (x->>'longitude')::numeric))
      from jsonb_array_elements(p_games) x) then raise exception 'GTL_WIND_INVALID'; end if;

  if exists (select 1 from public.gtl_wind_fetches a where a.lease_until > stamp
      and not exists (select 1 from public.gtl_wind_fetch_outcomes o where o.fetch_id = a.id)) then
    return jsonb_build_object('started', false, 'reason', 'busy');
  end if;
  if exists (select 1 from public.gtl_wind_fetches where started_at > stamp - interval '60 seconds') then
    return jsonb_build_object('started', false, 'reason', 'cooldown');
  end if;
  select o.status, o.error_code, o.finished_at into prior from public.gtl_wind_fetch_outcomes o join public.gtl_wind_fetches a on a.id = o.fetch_id
    order by a.started_at desc, a.id desc limit 1;
  if found and prior.status = 'failed' then
    select count(*) into failures from (select o.status, sum(case when o.status = 'succeeded' then 1 else 0 end) over (order by a.started_at desc, a.id desc) wins
      from public.gtl_wind_fetch_outcomes o join public.gtl_wind_fetches a on a.id = o.fetch_id) s where s.wins = 0;
    hold_until := prior.finished_at + interval '15 minutes';
    if prior.error_code = 'WIND_RATE_LIMIT' or failures >= 2 then hold_until := greatest(hold_until, prior.finished_at + interval '60 minutes'); end if;
    if prior.error_code = 'WIND_RATE_LIMIT_DAILY' then hold_until := greatest(hold_until, date_trunc('day', prior.finished_at, 'UTC') + interval '1 day'); end if;
    if stamp < hold_until then return jsonb_build_object('started', false, 'reason', 'backoff'); end if;
  end if;
  if jsonb_array_length(due) = 0 then return jsonb_build_object('started', false, 'reason', 'not_due'); end if;
  select coalesce(sum(a.locations), 0) into used from public.gtl_wind_fetches a where a.started_at >= date_trunc('day', stamp, 'UTC');
  remaining := least(200 - used, 16);
  if remaining <= 0 then return jsonb_build_object('started', false, 'reason', 'budget'); end if;
  for g in select x from jsonb_array_elements(due) x order by (x->>'kickoff')::timestamptz, x->>'venueId', x->>'gameId' loop
    place := round((g->>'latitude')::numeric, 3)::text || ',' || round((g->>'longitude')::numeric, 3)::text;
    if not (place = any(places)) then
      if cardinality(places) >= remaining then continue; end if;
      places := places || place;
    end if;
    keep := keep || jsonb_build_array(g);
  end loop;
  insert into public.gtl_wind_fetches(id, season, week, started_at, lease_token, lease_until, locations, games, window_start, window_end)
    select p_request, p_season, p_week, stamp, lease, stamp + interval '20 seconds', cardinality(places), keep,
      min(date_trunc('hour', (x->>'kickoff')::timestamptz, 'UTC')), max(date_trunc('hour', (x->>'kickoff')::timestamptz, 'UTC')) + interval '1 hour'
    from jsonb_array_elements(keep) x;
  return (select jsonb_build_object('started', true, 'requestId', a.id, 'lease', a.lease_token, 'leaseUntil', a.lease_until, 'games', a.games,
      'windowStart', a.window_start, 'windowEnd', a.window_end, 'locations', a.locations)
    from public.gtl_wind_fetches a where a.id = p_request);
end $$;

-- Records one attempt's outcome and, on success, one snapshot per game. Idempotent: a second finish
-- returns the stored outcome (replay) and writes nothing. Every row is checked against the attempt
-- before anything is written; model, source, license note and fetched_at are set here, never taken
-- from JS. A row whose kickoff is no longer in the future is skipped and counted.
create function public.gtl_finish_wind_fetch(p_request uuid, p_lease uuid, p_status text, p_error text, p_http integer, p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  a public.gtl_wind_fetches%rowtype;
  prior public.gtl_wind_fetch_outcomes%rowtype;
  stamp timestamptz;
  r jsonb;
  want jsonb;
  kick timestamptz;
  url text := null;
  ids text[] := '{}';
  n_stored integer := 0;
  n_skipped integer := 0;
  num text[] := array['latitude', 'longitude', 'gridLatitude', 'gridLongitude', 'windMph', 'generationMs'];
  opt text[] := array['elevationM', 'gustMph', 'directionDeg', 'temperatureF', 'precipitationProbability', 'precipitationIn'];
  k text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('gtl_wind_fetch'));
  stamp := clock_timestamp();
  select * into a from public.gtl_wind_fetches where id = p_request;
  if not found or p_lease is null or a.lease_token <> p_lease then raise exception 'GTL_WIND_LEASE'; end if;
  select * into prior from public.gtl_wind_fetch_outcomes where fetch_id = p_request;
  if found then
    return jsonb_build_object('status', prior.status, 'errorCode', prior.error_code, 'stored', prior.stored, 'replay', true);
  end if;
  if a.lease_until <= stamp then
    insert into public.gtl_wind_fetch_outcomes(fetch_id, finished_at, status, error_code, http_status, stored)
      values (p_request, stamp, 'failed', 'WIND_LEASE_EXPIRED', null, 0);
    return jsonb_build_object('status', 'failed', 'errorCode', 'WIND_LEASE_EXPIRED', 'stored', 0, 'replay', false);
  end if;
  if p_status = 'failed' then
    if p_error is null or p_error not in ('WIND_TIMEOUT', 'WIND_RATE_LIMIT_DAILY', 'WIND_RATE_LIMIT', 'WIND_HTTP', 'WIND_UNAVAILABLE',
      'WIND_BODY_LIMIT', 'WIND_PAYLOAD', 'WIND_UNITS') or p_rows is not null then raise exception 'GTL_WIND_INVALID'; end if;
    insert into public.gtl_wind_fetch_outcomes(fetch_id, finished_at, status, error_code, http_status, stored)
      values (p_request, stamp, 'failed', p_error, case when p_http in (200, 400, 429, 500, 502, 503, 504) then p_http end, 0);
    return jsonb_build_object('status', 'failed', 'errorCode', p_error, 'stored', 0, 'replay', false);
  end if;
  if p_status is distinct from 'succeeded' or p_error is not null or p_rows is null or jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) > 16 or octet_length(p_rows::text) > 65536 then raise exception 'GTL_WIND_INVALID'; end if;
  -- Check every row first; any violation raises and nothing is written.
  for r in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(r) <> 'object' or (select array_agg(x collate "C" order by x collate "C") from jsonb_object_keys(r) x) <> array['directionDeg', 'elevationM',
        'forecastHour', 'gameId', 'generationMs', 'gridLatitude', 'gridLongitude', 'gustHour', 'gustMph', 'kickoff', 'latitude', 'longitude',
        'precipitationIn', 'precipitationProbability', 'sourceUrl', 'temperatureF', 'venueId', 'windMph'] collate "C" then raise exception 'GTL_WIND_INVALID'; end if;
    foreach k in array num loop if jsonb_typeof(r->k) <> 'number' then raise exception 'GTL_WIND_INVALID'; end if; end loop;
    foreach k in array opt loop if jsonb_typeof(r->k) not in ('number', 'null') then raise exception 'GTL_WIND_INVALID'; end if; end loop;
    if jsonb_typeof(r->'gameId') <> 'string' or (r->>'gameId') = any(ids) or jsonb_typeof(r->'sourceUrl') <> 'string'
      or jsonb_typeof(r->'kickoff') <> 'string' or jsonb_typeof(r->'forecastHour') <> 'string' or jsonb_typeof(r->'gustHour') <> 'string'
      or (r->>'kickoff') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$' or (r->>'forecastHour') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:00:00(\.000)?Z$'
      or (r->>'gustHour') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:00:00(\.000)?Z$' then raise exception 'GTL_WIND_INVALID'; end if;
    ids := ids || (r->>'gameId');
    want := null;
    select x into want from jsonb_array_elements(a.games) x where x->>'gameId' = r->>'gameId';
    kick := (r->>'kickoff')::timestamptz;
    if want is null or want->>'venueId' <> r->>'venueId' or (want->>'latitude')::numeric <> (r->>'latitude')::numeric
      or (want->>'longitude')::numeric <> (r->>'longitude')::numeric or (want->>'kickoff')::timestamptz <> kick
      or abs((r->>'gridLatitude')::numeric - (r->>'latitude')::numeric) > 0.5 or abs((r->>'gridLongitude')::numeric - (r->>'longitude')::numeric) > 0.5
      or (r->>'forecastHour')::timestamptz <> date_trunc('hour', kick + interval '30 minutes', 'UTC')
      or (r->>'gustHour')::timestamptz <> date_trunc('hour', kick, 'UTC') + interval '1 hour'
      or (r->>'windMph')::numeric not between 0 and 200 or (r->>'windMph')::numeric <> round((r->>'windMph')::numeric, 1)
      or coalesce((r->>'gustMph')::numeric not between 0 and 250 or (r->>'gustMph')::numeric <> round((r->>'gustMph')::numeric, 1), false)
      or coalesce((r->>'directionDeg')::numeric not between 0 and 360 or (r->>'directionDeg')::numeric <> round((r->>'directionDeg')::numeric), false)
      or coalesce((r->>'temperatureF')::numeric not between -60 and 140 or (r->>'temperatureF')::numeric <> round((r->>'temperatureF')::numeric, 1), false)
      or coalesce((r->>'precipitationProbability')::numeric not between 0 and 100 or (r->>'precipitationProbability')::numeric <> round((r->>'precipitationProbability')::numeric), false)
      or coalesce((r->>'precipitationIn')::numeric not between 0 and 20 or (r->>'precipitationIn')::numeric <> round((r->>'precipitationIn')::numeric, 3), false)
      or coalesce((r->>'elevationM')::numeric not between -1000 and 10000, false)
      or (r->>'generationMs')::numeric < 0
      or not starts_with(r->>'sourceUrl', 'https://api.open-meteo.com/v1/forecast?') or char_length(r->>'sourceUrl') > 2048
      or (url is not null and url <> r->>'sourceUrl') then raise exception 'GTL_WIND_INVALID'; end if;
    url := r->>'sourceUrl';
  end loop;
  for r in select value from jsonb_array_elements(p_rows) loop
    kick := (r->>'kickoff')::timestamptz;
    if kick <= stamp then n_skipped := n_skipped + 1; continue; end if;
    insert into public.gtl_wind_forecasts(fetch_id, season, week, game_id, venue_id, latitude, longitude, grid_latitude, grid_longitude, elevation_m,
        kickoff, forecast_hour, gust_hour, wind_mph, gust_mph, wind_direction_deg, temperature_f, precipitation_probability, precipitation_in,
        model, generation_ms, fetched_at, source, source_url, license_note)
      values (p_request, a.season, a.week, r->>'gameId', r->>'venueId', (r->>'latitude')::numeric, (r->>'longitude')::numeric,
        (r->>'gridLatitude')::double precision, (r->>'gridLongitude')::double precision, (r->>'elevationM')::real,
        kick, (r->>'forecastHour')::timestamptz, (r->>'gustHour')::timestamptz, (r->>'windMph')::numeric, (r->>'gustMph')::numeric,
        (r->>'directionDeg')::smallint, (r->>'temperatureF')::numeric, (r->>'precipitationProbability')::smallint, (r->>'precipitationIn')::numeric,
        'best_match', (r->>'generationMs')::double precision, stamp, 'Open-Meteo forecast API', r->>'sourceUrl',
        'Weather data by Open-Meteo.com, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/); Kickoff-hour values selected by GTL; wind direction shown as compass points');
    n_stored := n_stored + 1;
  end loop;
  insert into public.gtl_wind_fetch_outcomes(fetch_id, finished_at, status, error_code, http_status, stored, skipped)
    values (p_request, stamp, 'succeeded', null, 200, n_stored, n_skipped);
  return jsonb_build_object('status', 'succeeded', 'errorCode', null, 'stored', n_stored, 'skipped', n_skipped, 'replay', false);
end $$;

revoke all on function public.gtl_read_wind_forecasts(uuid, integer, integer),
  public.gtl_begin_wind_fetch(uuid, uuid, integer, integer, jsonb),
  public.gtl_finish_wind_fetch(uuid, uuid, text, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.gtl_read_wind_forecasts(uuid, integer, integer),
  public.gtl_begin_wind_fetch(uuid, uuid, integer, integer, jsonb),
  public.gtl_finish_wind_fetch(uuid, uuid, text, text, integer, jsonb) to service_role;
