-- M-32 epl_moneyline (EPL design, Plan 3; spec 2026-10-28-epl-fantasy-and-moneyline-design.md section 7): EPL Guess the
-- Line. Each linked FEPL manager guesses, per Premier League match, the favorite and its 2-way (draw no bet) American
-- price; a locked guess is scored by its distance from the real price at lock-in. The pure rules live in
-- shared/epl-moneyline.mjs; this file is the durable, serialised store and its service RPCs.
--
-- What it adds:
-- * The M-30 schedule's job constraint also accepts dnb-check. This does not create a schedule row, enable a job or
--   dispatch a request. The admin script creates that row disabled after the migration and worker are released.
-- * gtl_epl_guesses: one row per manager per match (primary key (event_id, owner_id)): the club and price, draft or
--   locked (D-37/D-39: a locked guess is final, an unlocked one stays a draft), the reference price with its observation
--   time and source ('at-lock' or 'first-after'), and the distance once a reference exists.
-- * gtl_epl_guess_history: append-only, one row per accepted save (draft or lock), D-23.
-- * gtl_epl_moneyline_distance(guess, real): the distance on the line where -100 and +100 are the same point
--   (x(p) = p >= 100 ? p - 100 : p + 100; distance = |x(guess) - x(real)|), the same math as shared/epl-moneyline.mjs.
-- * gtl_epl_save_guess(p_user, p_event_id, p_club, p_price, p_lock, p_now): the one writer of a guess. It locks the
--   fixture row, so saves for one match serialise (a double-tapped Lock in gets one final guess, the second call
--   GTL_EPL_GUESS_LOCKED). Errors: GTL_EPL_FORBIDDEN (not a linked manager; the commissioner is not a manager),
--   GTL_EPL_GUESS_INVALID (an unknown match, a club not in it, a price that is not a whole American price with
--   |price| >= 100), GTL_EPL_GUESS_LOCKED (already locked), GTL_EPL_GUESS_CLOSED (at or after kickoff, or the match is
--   not scheduled; the stored draft is kept as it is). On Lock in the reference is the stored draw_no_bet price (the
--   three-book median the collector writes into gtl_epl_prices) for that club observed at or before p_now, whatever its
--   age; with none the guess saves as pending and is never refused (D-27, docs/RULES.md "Line at the guess").
-- * gtl_epl_resolve_pending_references(p_event_id): a pending locked guess takes the qualifying price observed after its
--   lock-in and before that match's kickoff ('first-after'); a collection made before the lock-in or after kickoff is
--   never used, and a set reference never moves. gtl_epl_prices keeps one row per event, club and market, so the
--   collector runs this after every draw_no_bet collection (plan Task 4) and the row it reads is the first one after.
-- * gtl_epl_guess_board(p_user, p_season, p_week): the week's fixtures, the caller's own guesses, and other managers'
--   locked guesses only for a match the caller has locked or that has kicked off (D-31). Drafts are never shown to
--   anyone else. Every signed-in account may read it (M-31); the caller's ownerId is null when not a manager.
-- * gtl_epl_guess_leaderboard(p_season): per manager over locked guesses of matches that have kicked off: average
--   distance, matches guessed (scored) and unscored (no price before kickoff: left out of the average, counted and
--   labelled). Ranked by average ascending, then guessed descending, then ownerId; a manager with only unscored guesses
--   ranks last.
-- A guess's state: 'draft', 'scored' (locked with a reference), 'pending' (locked, no reference, before kickoff) or
-- 'unscored' (locked, no reference, at or after kickoff: "No line before kickoff").
--
-- Apply order is the M-ledger in docs/REDESIGN_BUILD_PLAN.md section 6: M-32 after M-31 (it reads only M-30's tables
-- and functions). p_now on gtl_epl_save_guess is a service-side clock for gtl-api and the tests only: it must never come
-- from a client (no browser role can call any of these functions). Rerunnable: tables and indexes are created only if
-- missing, every function is create or replace with this exact argument list, and every grant is restated. Every table
-- and function is service-role only; no browser role gets anything, and no policy exists. No stored data is deleted or
-- truncated. Fix-forward only: the existing job constraint is widened, so an older worker can keep handling its five jobs
-- while dnb-check stays disabled; preserve all run evidence and guesses. No rollback file restores a narrower constraint
-- over a future dnb-check row (Gate M step 9). No hosted action is performed by this file.

alter table public.gtl_epl_jobs_schedule drop constraint if exists gtl_epl_jobs_schedule_job_check;
alter table public.gtl_epl_jobs_schedule add constraint gtl_epl_jobs_schedule_job_check
  check(job in ('snapshot','fixtures','resolve','settle','nudge','dnb-check'));

create table if not exists public.gtl_epl_guesses (
  season integer not null check(season between 2000 and 2200),
  week integer not null check(week between 1 and 38),
  event_id text not null references public.gtl_epl_fixtures(event_id),
  owner_id text not null references public.gtl_epl_managers(owner_id),
  club text not null,
  price integer not null check(abs(price)>=100),
  status text not null default 'draft' check(status in ('draft','locked')),
  saved_at timestamptz not null,
  locked_at timestamptz,
  reference_price integer check(reference_price is null or abs(reference_price)>=100),
  reference_observed_at timestamptz,
  reference_source text check(reference_source in ('at-lock','first-after')),
  distance integer check(distance is null or distance>=0),
  primary key(event_id,owner_id),
  check((status='locked')=(locked_at is not null)),
  check(reference_price is null or status='locked'),
  check((reference_price is null)=(reference_observed_at is null) and (reference_price is null)=(reference_source is null)
    and (reference_price is null)=(distance is null))
);
create index if not exists gtl_epl_guesses_week_idx on public.gtl_epl_guesses(season,week);

create table if not exists public.gtl_epl_guess_history (
  id bigint generated always as identity primary key,
  season integer not null,
  week integer not null,
  event_id text not null,
  owner_id text not null,
  club text not null,
  price integer not null,
  action text not null check(action in ('draft','lock')),
  at timestamptz not null
);
create index if not exists gtl_epl_guess_history_event_idx on public.gtl_epl_guess_history(event_id,owner_id,id);

alter table public.gtl_epl_guesses enable row level security;
alter table public.gtl_epl_guess_history enable row level security;
revoke all on public.gtl_epl_guesses,public.gtl_epl_guess_history from public,anon,authenticated,service_role;
-- No delete for anyone the API runs as (D-23); the history is append-only.
grant select,insert,update on public.gtl_epl_guesses to service_role;
grant select,insert on public.gtl_epl_guess_history to service_role;

-- Distance on the line where -100 and +100 are the same point.
create or replace function public.gtl_epl_moneyline_distance(p_guess integer,p_real integer) returns integer
language sql immutable security invoker set search_path='' as $$
  select abs((case when p_guess>=100 then p_guess-100 else p_guess+100 end)-(case when p_real>=100 then p_real-100 else p_real+100 end));
$$;

-- One guess as the API returns it; p_at is the clock that decides pending against unscored.
create or replace function public.gtl_epl_guess_json(p_g public.gtl_epl_guesses,p_kickoff timestamptz,p_at timestamptz) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('eventId',p_g.event_id,'ownerId',p_g.owner_id,'club',p_g.club,'price',p_g.price,'status',p_g.status,
    'savedAt',p_g.saved_at,'lockedAt',p_g.locked_at,'referencePrice',p_g.reference_price,'referenceObservedAt',p_g.reference_observed_at,
    'referenceSource',p_g.reference_source,'distance',p_g.distance,
    'state',case when p_g.status='draft' then 'draft' when p_g.distance is not null then 'scored'
      when p_at>=p_kickoff then 'unscored' else 'pending' end);
$$;

create or replace function public.gtl_epl_save_guess(p_user uuid,p_event_id text,p_club text,p_price integer,p_lock boolean,p_now timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare now_at timestamptz:=coalesce(p_now,clock_timestamp()); v_owner text:=public.gtl_epl_member(p_user); v_club text:=btrim(p_club);
  v_lock boolean:=coalesce(p_lock,false); fx public.gtl_epl_fixtures; g public.gtl_epl_guesses; ref_price integer; ref_at timestamptz;
begin
  if v_owner is null or v_owner='commissioner' then raise exception 'GTL_EPL_FORBIDDEN' using errcode='P0001'; end if;
  -- The fixture row lock serialises every save for this match, so a double-tapped Lock in sees the first one.
  select * into fx from public.gtl_epl_fixtures where event_id=p_event_id for update;
  if not found or v_club is null or v_club not in (fx.home,fx.away) or p_price is null or abs(p_price)<100 then
    raise exception 'GTL_EPL_GUESS_INVALID' using errcode='P0001';
  end if;
  select * into g from public.gtl_epl_guesses where event_id=p_event_id and owner_id=v_owner;
  if found and g.status='locked' then raise exception 'GTL_EPL_GUESS_LOCKED' using errcode='P0001'; end if;
  if fx.status<>'scheduled' or now_at>=fx.commence_time then raise exception 'GTL_EPL_GUESS_CLOSED' using errcode='P0001'; end if;
  if v_lock then
    -- The newest qualifying stored price at or before the lock-in, whatever its age; none leaves the guess pending (D-27).
    select p.price::integer,p.observed_at into ref_price,ref_at from public.gtl_epl_prices p
      where p.event_id=p_event_id and p.club=v_club and p.market='draw_no_bet' and p.price=trunc(p.price) and abs(p.price)>=100
        and p.observed_at<=now_at
      order by p.observed_at desc limit 1;
  end if;
  insert into public.gtl_epl_guesses as x(season,week,event_id,owner_id,club,price,status,saved_at,locked_at,
      reference_price,reference_observed_at,reference_source,distance)
    values(fx.season,fx.week,p_event_id,v_owner,v_club,p_price,case when v_lock then 'locked' else 'draft' end,now_at,
      case when v_lock then now_at end,ref_price,ref_at,case when ref_price is not null then 'at-lock' end,
      case when ref_price is not null then public.gtl_epl_moneyline_distance(p_price,ref_price) end)
    on conflict(event_id,owner_id) do update set season=excluded.season,week=excluded.week,club=excluded.club,price=excluded.price,
      status=excluded.status,saved_at=excluded.saved_at,locked_at=excluded.locked_at,reference_price=excluded.reference_price,
      reference_observed_at=excluded.reference_observed_at,reference_source=excluded.reference_source,distance=excluded.distance
    where x.status='draft'
    returning * into g;
  insert into public.gtl_epl_guess_history(season,week,event_id,owner_id,club,price,action,at)
    values(fx.season,fx.week,p_event_id,v_owner,v_club,p_price,case when v_lock then 'lock' else 'draft' end,now_at);
  return public.gtl_epl_guess_json(g,fx.commence_time,now_at);
end $$;

create or replace function public.gtl_epl_resolve_pending_references(p_event_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare fx public.gtl_epl_fixtures; n integer;
begin
  if p_event_id is null then raise exception 'GTL_EPL_GUESS_INVALID' using errcode='P0001'; end if;
  select * into fx from public.gtl_epl_fixtures where event_id=p_event_id for update;
  if not found then raise exception 'GTL_EPL_GUESS_INVALID' using errcode='P0001'; end if;
  update public.gtl_epl_guesses g set reference_price=p.price::integer,reference_observed_at=p.observed_at,reference_source='first-after',
      distance=public.gtl_epl_moneyline_distance(g.price,p.price::integer)
    from public.gtl_epl_prices p
    where g.event_id=p_event_id and g.status='locked' and g.reference_price is null
      and p.event_id=g.event_id and p.club=g.club and p.market='draw_no_bet' and p.price=trunc(p.price) and abs(p.price)>=100
      and p.observed_at>g.locked_at and p.observed_at<fx.commence_time;
  get diagnostics n=row_count;
  return jsonb_build_object('eventId',p_event_id,'resolved',n);
end $$;

create or replace function public.gtl_epl_guess_board(p_user uuid,p_season integer,p_week integer) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare now_at timestamptz:=clock_timestamp(); v_owner text:=public.gtl_epl_member(p_user);
begin
  if v_owner='commissioner' then v_owner:=null; end if;
  return jsonb_build_object('season',p_season,'week',p_week,'ownerId',v_owner,
    'fixtures',coalesce((select jsonb_agg(jsonb_build_object('eventId',f.event_id,'home',f.home,'away',f.away,'commenceTime',f.commence_time,
        'status',f.status,'kickedOff',now_at>=f.commence_time) order by f.commence_time,f.event_id)
      from public.gtl_epl_fixtures f where f.season=p_season and f.week=p_week),'[]'::jsonb),
    'guesses',coalesce((select jsonb_agg(public.gtl_epl_guess_json(g,f.commence_time,now_at) order by f.commence_time,g.event_id,g.owner_id)
      from public.gtl_epl_guesses g join public.gtl_epl_fixtures f on f.event_id=g.event_id
      -- The fixture's week, not the guess's copy: a rescheduled match moves with its guesses.
      where f.season=p_season and f.week=p_week
        and (g.owner_id=v_owner
          or (g.status='locked' and (now_at>=f.commence_time
            or exists(select 1 from public.gtl_epl_guesses m where m.event_id=g.event_id and m.owner_id=v_owner and m.status='locked'))))),'[]'::jsonb));
end $$;

create or replace function public.gtl_epl_guess_leaderboard(p_season integer) returns jsonb
language sql stable security invoker set search_path='' as $$
  with counted as (
    select g.owner_id,g.distance from public.gtl_epl_guesses g join public.gtl_epl_fixtures f on f.event_id=g.event_id
    where f.season=p_season and g.status='locked' and f.commence_time<=clock_timestamp()
  ), ranked as (
    select c.owner_id,m.name,sum(c.distance) as total,count(c.distance)::integer as guessed,
      (count(*)-count(c.distance))::integer as unscored,
      case when count(c.distance)>0 then sum(c.distance)::numeric/count(c.distance) end as average
    from counted c join public.gtl_epl_managers m on m.owner_id=c.owner_id group by c.owner_id,m.name
  )
  select jsonb_build_object('season',p_season,'rows',coalesce((select jsonb_agg(jsonb_build_object('ownerId',r.owner_id,'name',r.name,
      'average',r.average,'total',r.total,'guessed',r.guessed,'unscored',r.unscored)
    order by r.average asc nulls last,r.guessed desc,r.owner_id) from ranked r),'[]'::jsonb));
$$;

-- Every function is service-only; create or replace keeps privileges, so each grant is restated.
revoke all on function public.gtl_epl_moneyline_distance(integer,integer),
  public.gtl_epl_guess_json(public.gtl_epl_guesses,timestamptz,timestamptz),
  public.gtl_epl_save_guess(uuid,text,text,integer,boolean,timestamptz),public.gtl_epl_resolve_pending_references(text),
  public.gtl_epl_guess_board(uuid,integer,integer),public.gtl_epl_guess_leaderboard(integer)
  from public,anon,authenticated;
grant execute on function public.gtl_epl_moneyline_distance(integer,integer),
  public.gtl_epl_guess_json(public.gtl_epl_guesses,timestamptz,timestamptz),
  public.gtl_epl_save_guess(uuid,text,text,integer,boolean,timestamptz),public.gtl_epl_resolve_pending_references(text),
  public.gtl_epl_guess_board(uuid,integer,integer),public.gtl_epl_guess_leaderboard(integer)
  to service_role;
