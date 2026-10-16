-- D-47 kickoff weather refresh schedule. Sean (product owner), October 15, 2026, answering "The new Lines board reads the
-- weather forecast every time it shows a week; with the 200/day cap Weeks 14, 17 and 18 run out on Sundays. What should
-- we do?": "Just need a weather update every 24 hours and then 2 hours and 12 hours before kickoff".
--
-- The change, in gtl_begin_wind_fetch's due re-check only. D-34's lead tiers (a 1 h TTL within 18 h of kickoff, 3 h
-- within 72 h, 6 h within 120 h) give way to Sean's schedule. A fetched game (open air or retractable roof, still inside
-- the 120 h forecast window) is due when
--   * it has no snapshot for this kickoff, or
--   * its newest snapshot is at least 24 hours old, or
--   * kickoff minus 12 h has been reached and the newest snapshot was taken before kickoff minus 12 h, or
--   * kickoff minus 2 h has been reached and the newest snapshot was taken before kickoff minus 2 h.
-- Never at or after kickoff: the final pre-kickoff forecast stays. With a reader every minute each game is fetched about
-- seven times in its last 120 h (entering the window, every 24 h, then 12 h and 2 h out), at most three times on one UTC
-- day; docs/TRENDS.md "Cap math (D-47)" has each 2026 week's busiest day, all well under the cap.
--
-- What does not change: refreshes still happen only when a member reads (no cron); the advisory lock, the 20 s lease
-- (busy), the 60 s spacing (cooldown), the 15 min, 60 min and until-midnight backoff, the 200 calls per UTC day cap
-- (budget, trimming nearest kickoff first), the strict game checks (GTL_WIND_INVALID), the 120 h window, the reply
-- shape, the refusal reasons and the grants. gtl_read_wind_forecasts and gtl_finish_wind_fetch are untouched. No table,
-- column, constraint, index, row or stored snapshot changes; every snapshot stays (D-23).
--
-- Mirrors: cloud/wind.mjs (WIND_SCHEDULE, windDue: the gtl-api planner), shared/trends-view.mjs (windNextDue: when a
-- snapshot shows as current and when an open screen asks again). tests/wind-sql.test.mjs checks this body against
-- cloud/wind.mjs windDue on PGlite.
--
-- Order. Safe with either gtl-api build: this function re-checks every game it is sent, so an old planner asking for a
-- game this schedule calls not due gets not_due (or the game is dropped from the request) and its reader is served what
-- is stored; a new planner never asks for more than this function allows. Apply it before or with the gtl-api deploy
-- that carries the D-47 planner, after the Pages deploy whose display rules expect it (docs/TRENDS.md, Release).
--
-- Rollback: supabase/rollback/<this file> restores the D-34 body (the tiers). Every stored row stays.
--
-- replaces public.gtl_begin_wind_fetch md5 027f2797275a447f49d080dfac787b2b

create or replace function public.gtl_begin_wind_fetch(p_user uuid, p_request uuid, p_season integer, p_week integer, p_games jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  stamp timestamptz;
  sig jsonb;
  g jsonb;
  slate_kickoff double precision;
  kick timestamptz;
  newest timestamptz;
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
    select max(f.fetched_at) into newest from public.gtl_wind_forecasts f
      where f.season = p_season and f.week = p_week and f.game_id = g->>'gameId' and f.kickoff = kick;
    -- D-47: due with no snapshot for this kickoff, a newest snapshot 24 h old, or a checkpoint (12 h, then 2 h before
    -- kickoff) reached since the newest snapshot was taken. Never at or after kickoff (above).
    if newest is not null and stamp - newest < interval '24 hours'
      and not (stamp >= kick - interval '12 hours' and newest < kick - interval '12 hours')
      and not (stamp >= kick - interval '2 hours' and newest < kick - interval '2 hours') then continue; end if;
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
