-- replaces public.gtl_epl_save_guess md5 6313572abc96d5cc228927cafb3c3256
-- replaces public.gtl_epl_guess_board md5 fb066860e7f8ae1d62cbf8ae57519ec6
-- replaces public.gtl_epl_resolve_pending_references md5 a17965fe1bf51ae572297a96a4b7be5a
-- replaces public.gtl_epl_finish_moneyline_read md5 df13d404443822fe91252f0e673fd20a

-- EPL three-way moneyline (docs/EPL_FEATURES_2026_11_09.md, confirmed behavior 1-3, delivery stages 1 and 2).
-- Builds on hosted M-30/M-31/M-32/M-36 only; it reads none of pending M-33/M-34/M-35. Written, not applied: no hosted
-- action is performed by this file, and it creates, enables or dispatches no schedule row.
--
-- Each manager keeps ONE guess per match (primary key (event_id, owner_id) is unchanged), in either market:
--   draw_no_bet  the M-32 two-way guess: a club (home or away) and its draw-no-bet American price. Every existing row.
--   three_way    one outcome of home / draw / away and its three-way (h2h) American price.
-- Market, outcome and price become final together at lock-in (the one writer locks the fixture row, and a locked row is
-- never updated by any writer). Drafts change freely, including between markets. Existing drafts, guesses, history,
-- references, kickoff locks and reveal permissions are kept: every existing row reads as draw_no_bet, with its club.
--
-- What it adds or changes:
-- * gtl_epl_guesses / gtl_epl_guess_history gain market (default draw_no_bet) and outcome (three_way only); club becomes
--   nullable only for a three-way draw. Constraints keep each row coherent. No row is rewritten, deleted or truncated.
-- * gtl_epl_moneyline_attempts gains three_way (a second reserved credit for the same single-event read).
-- * gtl_epl_three_way_collections: append-only private evidence of a verified complete three-way market (all three
--   outcomes from at least two of DraftKings, FanDuel and BetMGM, the stored fixture's exact identity), with medians.
-- * gtl_epl_write_guess: the one market-aware writer. gtl_epl_save_guess (M-32, the legacy two-way entry the applied
--   gtl_epl_save_guess_current calls) now delegates to it with market draw_no_bet, so old API builds keep saving two-way
--   guesses and a legacy save over a three-way draft leaves a coherent two-way draft (never a mixed row).
-- * gtl_epl_save_market_guess(_current): the new writer entry (fresh clock after the fixture lock, as M-36).
-- * gtl_epl_guess_board (legacy) now returns only draw_no_bet rows, so an old client never sees a row it cannot render
--   or would misread as two-way. Its reveal rule is unchanged: another manager's locked guess shows once the caller
--   locked that match in either market, or it kicked off. gtl_epl_guess_board_markets is the market-aware reader.
-- * gtl_epl_resolve_pending_references and gtl_epl_finish_moneyline_read (M-36) resolve draw-no-bet prices for
--   draw_no_bet guesses only. Three-way pending references resolve from gtl_epl_three_way_collections under the same
--   rule: the first qualifying observation after lock-in and before kickoff. A set reference never moves.
-- * gtl_epl_begin_moneyline_markets / gtl_epl_finish_moneyline_markets wrap M-36's lease: one extra conservative credit
--   is reserved (still never below the shared 50-credit reserve) before a three-way market is requested in the same
--   event read. Without that credit the read stays two-way.
-- * gtl_epl_three_way_ready(): the effect-free schema capability. New writers offer three-way entry only when it answers
--   exactly true; PostgREST's PGRST202 (absent) keeps them on the legacy two-way path. Off switch (fix-forward): replace
--   its body with `select false`; reads stay market-aware and two-way entry continues.
-- * gtl_epl_bet_recommendations(p_user, p_season, p_week): account-scoped EPL Bets candidates (stage 2) from the
--   caller's OWN locked guesses on matches not yet kicked off versus the latest stored same-market collection. It reads
--   stored evidence only and can buy nothing. Candidates are ordered by favorable gap alone.
-- gtl_epl_guess_leaderboard is unchanged: it already averages every locked, kicked-off guess's integer distance, so both
-- markets feed the one leaderboard with -100 and +100 the same point (gtl_epl_moneyline_distance).
--
-- Every new table and function is service-role only; no browser role gets anything and no policy exists. p_now is a
-- trusted service clock or test seam, never browser input. Fix-forward only (tests/migrations.mjs FIX_FORWARD): once a
-- three-way row exists, restoring the old bodies would misprice it with draw-no-bet references, so the off switch above
-- is the rollback.

-- One guess per match per manager in either market. Existing rows are draw_no_bet with a club and no outcome.
alter table public.gtl_epl_guesses add column if not exists market text not null default 'draw_no_bet';
alter table public.gtl_epl_guesses add column if not exists outcome text;
alter table public.gtl_epl_guesses alter column club drop not null;
alter table public.gtl_epl_guesses drop constraint if exists gtl_epl_guesses_market_shape;
alter table public.gtl_epl_guesses add constraint gtl_epl_guesses_market_shape check(
  (market='draw_no_bet' and outcome is null and club is not null)
  or (market='three_way' and outcome in ('home','draw','away') and (club is null)=(outcome='draw')));
alter table public.gtl_epl_guess_history add column if not exists market text not null default 'draw_no_bet';
alter table public.gtl_epl_guess_history add column if not exists outcome text;
alter table public.gtl_epl_guess_history alter column club drop not null;
alter table public.gtl_epl_guess_history drop constraint if exists gtl_epl_guess_history_market_shape;
alter table public.gtl_epl_guess_history add constraint gtl_epl_guess_history_market_shape check(
  (market='draw_no_bet' and outcome is null and club is not null)
  or (market='three_way' and outcome in ('home','draw','away') and (club is null)=(outcome='draw')));

-- A lease that reserved the second credit may request the three-way market in the same single-event read.
alter table public.gtl_epl_moneyline_attempts add column if not exists three_way boolean not null default false;

-- Append-only private evidence: a complete three-way market (home, draw and away from each counted book) for the
-- stored fixture's exact identity, and its per-outcome medians on the American line.
create table if not exists public.gtl_epl_three_way_collections (
  id uuid primary key references public.gtl_epl_moneyline_attempts(id),
  event_id text not null references public.gtl_epl_fixtures(event_id),
  observed_at timestamptz not null,
  home text not null,
  away text not null,
  home_price integer not null check(abs(home_price) between 100 and 100000),
  draw_price integer not null check(abs(draw_price) between 100 and 100000),
  away_price integer not null check(abs(away_price) between 100 and 100000),
  book_count integer not null check(book_count between 2 and 3),
  unscorable_count integer not null default 0 check(unscorable_count>=0),
  evidence jsonb not null check(jsonb_typeof(evidence)='object' and octet_length(evidence::text)<=16384),
  unique(event_id,observed_at)
);
create index if not exists gtl_epl_three_way_collections_event_idx on public.gtl_epl_three_way_collections(event_id,observed_at desc);
alter table public.gtl_epl_three_way_collections enable row level security;
revoke all on public.gtl_epl_three_way_collections from public,anon,authenticated,service_role;
grant select,insert on public.gtl_epl_three_way_collections to service_role;

-- Effect-free capability. Exactly true: three-way entry may be offered. Absent: legacy two-way only.
create or replace function public.gtl_epl_three_way_ready() returns boolean
language sql stable security invoker set search_path='' as $$ select true; $$;

-- An American price as a point on the line where -100 and +100 are the same point, in bigint so no distance overflows.
create or replace function public.gtl_epl_moneyline_line(p_price integer) returns bigint
language sql immutable security invoker set search_path='' as $$
  select case when p_price>=100 then p_price::bigint-100 else p_price::bigint+100 end;
$$;

-- A guess as the market-aware readers return it: M-32's fields plus market and outcome (a two-way club's side).
create or replace function public.gtl_epl_guess_market_json(p_g public.gtl_epl_guesses,p_fx public.gtl_epl_fixtures,p_at timestamptz) returns jsonb
language sql stable security invoker set search_path='' as $$
  select public.gtl_epl_guess_json(p_g,p_fx.commence_time,p_at)||jsonb_build_object('market',p_g.market,'outcome',
    coalesce(p_g.outcome,case when p_g.club=p_fx.home then 'home' when p_g.club=p_fx.away then 'away' end));
$$;

-- The one market-aware writer. The fixture row lock serialises every save for this match (as M-32), so market, outcome
-- and price are taken together and a double-tapped Lock in gets one final guess. Errors are M-32's: GTL_EPL_FORBIDDEN,
-- GTL_EPL_GUESS_INVALID (unknown match or market, draw in draw_no_bet, an outcome the match does not have, a price that
-- is not a whole American price with |price| >= 100), GTL_EPL_GUESS_LOCKED and GTL_EPL_GUESS_CLOSED (the stored draft is
-- kept). On Lock in the reference is the newest stored same-market price for that outcome observed at or before p_now
-- (draw_no_bet: gtl_epl_prices; three_way: gtl_epl_three_way_collections); with none the guess saves as pending (D-27).
create or replace function public.gtl_epl_write_guess(p_user uuid,p_event_id text,p_market text,p_outcome text,p_price integer,p_lock boolean,p_now timestamptz,p_club text default null) returns public.gtl_epl_guesses
language plpgsql security invoker set search_path='' as $$
declare now_at timestamptz:=coalesce(p_now,clock_timestamp()); v_owner text:=public.gtl_epl_member(p_user);
  v_lock boolean:=coalesce(p_lock,false); fx public.gtl_epl_fixtures; g public.gtl_epl_guesses; v_club text; ref_price integer; ref_at timestamptz;
begin
  if v_owner is null or v_owner='commissioner' then raise exception 'GTL_EPL_FORBIDDEN' using errcode='P0001'; end if;
  select * into fx from public.gtl_epl_fixtures where event_id=p_event_id for update;
  if not found or p_market is null or p_market not in ('draw_no_bet','three_way') or p_outcome is null or p_outcome not in ('home','draw','away')
    or (p_market='draw_no_bet' and p_outcome='draw') or p_price is null or abs(p_price)<100 then
    raise exception 'GTL_EPL_GUESS_INVALID' using errcode='P0001';
  end if;
  v_club:=case p_outcome when 'home' then fx.home when 'away' then fx.away end;
  if p_club is not null and v_club is distinct from p_club then raise exception 'GTL_EPL_GUESS_INVALID' using errcode='P0001'; end if;
  select * into g from public.gtl_epl_guesses where event_id=p_event_id and owner_id=v_owner;
  if found and g.status='locked' then raise exception 'GTL_EPL_GUESS_LOCKED' using errcode='P0001'; end if;
  if fx.status<>'scheduled' or now_at>=fx.commence_time then raise exception 'GTL_EPL_GUESS_CLOSED' using errcode='P0001'; end if;
  if v_lock and p_market='draw_no_bet' then
    select p.price::integer,p.observed_at into ref_price,ref_at from public.gtl_epl_prices p
      where p.event_id=p_event_id and p.club=v_club and p.market='draw_no_bet' and p.price=trunc(p.price) and abs(p.price)>=100
        and p.observed_at<=now_at
      order by p.observed_at desc limit 1;
  elsif v_lock then
    select case p_outcome when 'home' then c.home_price when 'draw' then c.draw_price else c.away_price end,c.observed_at into ref_price,ref_at
      from public.gtl_epl_three_way_collections c
      where c.event_id=p_event_id and c.home=fx.home and c.away=fx.away and c.observed_at<=now_at
      order by c.observed_at desc limit 1;
  end if;
  insert into public.gtl_epl_guesses as x(season,week,event_id,owner_id,market,outcome,club,price,status,saved_at,locked_at,
      reference_price,reference_observed_at,reference_source,distance)
    values(fx.season,fx.week,p_event_id,v_owner,p_market,case when p_market='three_way' then p_outcome end,v_club,p_price,
      case when v_lock then 'locked' else 'draft' end,now_at,case when v_lock then now_at end,ref_price,ref_at,
      case when ref_price is not null then 'at-lock' end,case when ref_price is not null then public.gtl_epl_moneyline_distance(p_price,ref_price) end)
    on conflict(event_id,owner_id) do update set season=excluded.season,week=excluded.week,market=excluded.market,outcome=excluded.outcome,
      club=excluded.club,price=excluded.price,status=excluded.status,saved_at=excluded.saved_at,locked_at=excluded.locked_at,
      reference_price=excluded.reference_price,reference_observed_at=excluded.reference_observed_at,reference_source=excluded.reference_source,
      distance=excluded.distance
    where x.status='draft'
    returning * into g;
  insert into public.gtl_epl_guess_history(season,week,event_id,owner_id,market,outcome,club,price,action,at)
    values(fx.season,fx.week,p_event_id,v_owner,p_market,case when p_market='three_way' then p_outcome end,v_club,p_price,
      case when v_lock then 'lock' else 'draft' end,now_at);
  return g;
end $$;

-- M-32's legacy two-way entry (the applied gtl_epl_save_guess_current calls it): same arguments, reply and errors.
create or replace function public.gtl_epl_save_guess(p_user uuid,p_event_id text,p_club text,p_price integer,p_lock boolean,p_now timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare now_at timestamptz:=coalesce(p_now,clock_timestamp()); v_club text:=btrim(p_club); fx public.gtl_epl_fixtures; g public.gtl_epl_guesses;
begin
  select * into fx from public.gtl_epl_fixtures where event_id=p_event_id;
  g:=public.gtl_epl_write_guess(p_user,p_event_id,'draw_no_bet',
    case when v_club is null then null when v_club=fx.home then 'home' when v_club=fx.away then 'away' end,p_price,p_lock,now_at,coalesce(v_club,''));
  select * into fx from public.gtl_epl_fixtures where event_id=p_event_id;
  return public.gtl_epl_guess_json(g,fx.commence_time,now_at);
end $$;

-- The market-aware entry. A three-way save also needs the capability to answer true (the off switch refuses it).
create or replace function public.gtl_epl_save_market_guess(p_user uuid,p_event_id text,p_market text,p_outcome text,p_price integer,p_lock boolean,p_now timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare now_at timestamptz:=coalesce(p_now,clock_timestamp()); fx public.gtl_epl_fixtures; g public.gtl_epl_guesses;
begin
  if p_market='three_way' and public.gtl_epl_three_way_ready() is not true then raise exception 'GTL_EPL_MARKET_OFF' using errcode='P0001'; end if;
  g:=public.gtl_epl_write_guess(p_user,p_event_id,p_market,p_outcome,p_price,p_lock,now_at);
  select * into fx from public.gtl_epl_fixtures where event_id=p_event_id;
  return public.gtl_epl_guess_market_json(g,fx,now_at);
end $$;

-- Fresh clock AFTER the fixture lock, as M-36's gtl_epl_save_guess_current: a stamp sampled before waiting never backdates.
create or replace function public.gtl_epl_save_market_guess_current(p_user uuid,p_event_id text,p_market text,p_outcome text,p_price integer,p_lock boolean,p_now timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz;
begin
  perform 1 from public.gtl_epl_fixtures where event_id=p_event_id for update;
  stamp:=clock_timestamp();
  stamp:=greatest(stamp,coalesce(p_now,stamp));
  return public.gtl_epl_save_market_guess(p_user,p_event_id,p_market,p_outcome,p_price,p_lock,stamp);
end $$;

-- M-32's legacy board for old API builds: unchanged except that it returns draw_no_bet rows only.
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
      where f.season=p_season and f.week=p_week and g.market='draw_no_bet'
        and (g.owner_id=v_owner
          or (g.status='locked' and (now_at>=f.commence_time
            or exists(select 1 from public.gtl_epl_guesses m where m.event_id=g.event_id and m.owner_id=v_owner and m.status='locked'))))),'[]'::jsonb));
end $$;

-- The market-aware board: M-32's fixtures and reveal rule over both markets. Drafts are never shown to anyone else; another
-- manager's locked guess shows only once the caller locked that match (in either market) or it kicked off (D-31).
create or replace function public.gtl_epl_guess_board_markets(p_user uuid,p_season integer,p_week integer) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare now_at timestamptz:=clock_timestamp(); v_owner text:=public.gtl_epl_member(p_user);
begin
  if v_owner='commissioner' then v_owner:=null; end if;
  return jsonb_build_object('season',p_season,'week',p_week,'ownerId',v_owner,'threeWayEntry',public.gtl_epl_three_way_ready() is true,
    'fixtures',coalesce((select jsonb_agg(jsonb_build_object('eventId',f.event_id,'home',f.home,'away',f.away,'commenceTime',f.commence_time,
        'status',f.status,'kickedOff',now_at>=f.commence_time) order by f.commence_time,f.event_id)
      from public.gtl_epl_fixtures f where f.season=p_season and f.week=p_week),'[]'::jsonb),
    'guesses',coalesce((select jsonb_agg(public.gtl_epl_guess_market_json(g,f,now_at) order by f.commence_time,g.event_id,g.owner_id)
      from public.gtl_epl_guesses g join public.gtl_epl_fixtures f on f.event_id=g.event_id
      where f.season=p_season and f.week=p_week
        and (g.owner_id=v_owner
          or (g.status='locked' and (now_at>=f.commence_time
            or exists(select 1 from public.gtl_epl_guesses m where m.event_id=g.event_id and m.owner_id=v_owner and m.status='locked'))))),'[]'::jsonb));
end $$;

-- A pending locked guess takes the first qualifying same-market observation after its lock-in and before kickoff
-- ('first-after'). draw_no_bet reads gtl_epl_prices exactly as M-32 did; three_way reads its collections. A set
-- reference never moves, and a distance that would not fit the integer column is left unscored instead of failing
-- every other manager's resolution.
create or replace function public.gtl_epl_resolve_pending_references(p_event_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare fx public.gtl_epl_fixtures; n integer; m integer;
begin
  if p_event_id is null then raise exception 'GTL_EPL_GUESS_INVALID' using errcode='P0001'; end if;
  select * into fx from public.gtl_epl_fixtures where event_id=p_event_id for update;
  if not found then raise exception 'GTL_EPL_GUESS_INVALID' using errcode='P0001'; end if;
  update public.gtl_epl_guesses g set reference_price=p.price::integer,reference_observed_at=p.observed_at,reference_source='first-after',
      distance=public.gtl_epl_moneyline_distance(g.price,p.price::integer)
    from public.gtl_epl_prices p
    where g.event_id=p_event_id and g.status='locked' and g.reference_price is null and g.market='draw_no_bet'
      and p.event_id=g.event_id and p.club=g.club and p.market='draw_no_bet' and p.price=trunc(p.price) and abs(p.price)>=100
      and p.observed_at>g.locked_at and p.observed_at<fx.commence_time;
  get diagnostics n=row_count;
  with refs as (
    select g.owner_id,x.price,x.observed_at,abs(public.gtl_epl_moneyline_line(g.price)-public.gtl_epl_moneyline_line(x.price)) dist
    from public.gtl_epl_guesses g cross join lateral (
      select case g.outcome when 'home' then c.home_price when 'draw' then c.draw_price else c.away_price end price,c.observed_at
      from public.gtl_epl_three_way_collections c
      where c.event_id=g.event_id and c.home=fx.home and c.away=fx.away and c.observed_at>g.locked_at and c.observed_at<fx.commence_time
      order by c.observed_at,c.id limit 1) x
    where g.event_id=p_event_id and g.status='locked' and g.reference_price is null and g.market='three_way')
  update public.gtl_epl_guesses g set reference_price=r.price,reference_observed_at=r.observed_at,reference_source='first-after',distance=r.dist::integer
    from refs r where g.event_id=p_event_id and g.owner_id=r.owner_id and g.reference_price is null and r.dist<=2147483647;
  get diagnostics m=row_count;
  return jsonb_build_object('eventId',p_event_id,'resolved',n+m);
end $$;

-- Stage 2: EPL Bets candidates for the caller's OWN locked guesses on matches that have not kicked off, against the
-- latest stored same-market collection (draw_no_bet: gtl_epl_moneyline_collections; three_way:
-- gtl_epl_three_way_collections). gap = line(latest) - line(guess): positive means the latest book median pays more
-- than the price the manager guessed. Only a positive gap is a candidate, ordered by gap descending alone (ties by
-- kickoff, then event). Trend context (the first stored observation and the count) is returned to explain, never to
-- reorder or exclude. Reads stored evidence only; it never reserves a credit or requests a provider.
create or replace function public.gtl_epl_bet_recommendations(p_user uuid,p_season integer,p_week integer) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare now_at timestamptz:=clock_timestamp(); v_owner text:=public.gtl_epl_member(p_user);
begin
  if v_owner='commissioner' then v_owner:=null; end if;
  if v_owner is null then
    return jsonb_build_object('season',p_season,'week',p_week,'ownerId',null,'asOf',now_at,'locked',0,'unpriced',0,'withoutGap',0,'items','[]'::jsonb);
  end if;
  return (with mine as (
      select g.event_id,g.market,coalesce(g.outcome,case when g.club=f.home then 'home' when g.club=f.away then 'away' end) outcome,
        g.club,g.price,g.locked_at,g.reference_price,g.reference_observed_at,f.home,f.away,f.commence_time
      from public.gtl_epl_guesses g join public.gtl_epl_fixtures f on f.event_id=g.event_id
      where f.season=p_season and f.week=p_week and g.owner_id=v_owner and g.status='locked'
        and f.status='scheduled' and f.commence_time>now_at
    ), obs as (
      select m.event_id,case when m.club=c.home then c.home_price else c.away_price end price,c.observed_at,
        (select count(*)::integer from jsonb_each(case when jsonb_typeof(c.evidence->'books')='object' then c.evidence->'books' else '{}'::jsonb end)) books
      from mine m join public.gtl_epl_moneyline_collections c on c.event_id=m.event_id
      where m.market='draw_no_bet' and c.home=m.home and c.away=m.away and m.club in (c.home,c.away) and c.observed_at<=now_at
      union all
      select m.event_id,case m.outcome when 'home' then t.home_price when 'draw' then t.draw_price else t.away_price end,t.observed_at,t.book_count
      from mine m join public.gtl_epl_three_way_collections t on t.event_id=m.event_id
      where m.market='three_way' and t.home=m.home and t.away=m.away and t.observed_at<=now_at
    ), latest as (
      select distinct on (o.event_id) o.event_id,o.price,o.observed_at,o.books from obs o order by o.event_id,o.observed_at desc
    ), trend as (
      select o.event_id,(array_agg(o.price order by o.observed_at))[1] first_price,min(o.observed_at) first_at,count(*)::integer observations
      from obs o group by o.event_id
    ), priced as (
      select m.*,l.price latest_price,l.observed_at latest_at,l.books,t.first_price,t.first_at,t.observations,
        public.gtl_epl_moneyline_line(l.price)-public.gtl_epl_moneyline_line(m.price) gap
      from mine m left join latest l on l.event_id=m.event_id left join trend t on t.event_id=m.event_id
    )
    select jsonb_build_object('season',p_season,'week',p_week,'ownerId',v_owner,'asOf',now_at,
      'locked',(select count(*)::integer from mine),
      'unpriced',(select count(*)::integer from priced where latest_price is null),
      'withoutGap',(select count(*)::integer from priced where gap<=0),
      'items',coalesce((select jsonb_agg(jsonb_build_object('eventId',p.event_id,'home',p.home,'away',p.away,'commenceTime',p.commence_time,
          'market',p.market,'outcome',p.outcome,'club',p.club,'price',p.price,'lockedAt',p.locked_at,
          'referencePrice',p.reference_price,'referenceObservedAt',p.reference_observed_at,
          'latestPrice',p.latest_price,'latestObservedAt',p.latest_at,'books',p.books,'gap',p.gap,
          'firstPrice',p.first_price,'firstObservedAt',p.first_at,'observations',p.observations)
        order by p.gap desc,p.commence_time,p.event_id) from priced p where p.gap>0),'[]'::jsonb)));
end $$;

-- M-36's finish, unchanged except that its draw-no-bet references resolve draw_no_bet guesses only.
create or replace function public.gtl_epl_finish_moneyline_read(p_lease uuid,p_token uuid,p_event jsonb default null,p_quota jsonb default null,p_error text default null,p_now timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz; a public.gtl_epl_moneyline_attempts; fx public.gtl_epl_fixtures;
  observed timestamptz; book_at timestamptz; b text; v_club text; prices integer[]; hp integer; ap integer; n integer:=0; p integer;
  unscorable integer:=0; valid boolean:=true; v integer; q jsonb; raw text;
begin
  -- Read only to find the fixture, then take locks in the same order as Begin and the M-32 save writer.
  select * into a from public.gtl_epl_moneyline_attempts where id=p_lease and token=p_token;
  if not found then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
  select * into fx from public.gtl_epl_fixtures where event_id=a.event_id for update;
  stamp:=greatest(clock_timestamp(),coalesce(p_now,clock_timestamp()));
  select * into a from public.gtl_epl_moneyline_attempts where id=p_lease and token=p_token for update;
  if a.status<>'running' then return jsonb_build_object('status',case when a.status='refreshed' then 'refreshed' else 'unavailable' end); end if;
  -- Trust only bounded nonnegative integer header values. Missing/invalid headers cannot increase the shared budget.
  if jsonb_typeof(p_quota)='object' then
    foreach b in array array['remaining','used','last'] loop
      raw:=p_quota->>b;
      if raw is not null and (raw !~ '^[0-9]{1,9}$' or jsonb_typeof(p_quota->b)<>'number') then p_quota:=null; exit; end if;
    end loop;
    if p_quota is not null then
      update public.gtl_odds_budget set observed_remaining=coalesce((p_quota->>'remaining')::integer,observed_remaining),
        observed_used=coalesce((p_quota->>'used')::integer,observed_used),observed_last=coalesce((p_quota->>'last')::integer,observed_last),observed_at=clock_timestamp(),
        conservative_remaining=case when p_quota->>'remaining' is null then conservative_remaining when conservative_remaining is null then least((p_quota->>'remaining')::integer,500)
          else least(conservative_remaining,(p_quota->>'remaining')::integer) end,updated_at=clock_timestamp() where provider='the-odds-api';
    end if;
  end if;
  if p_error in ('auth','rate_limit') then
    update public.gtl_epl_moneyline_attempts set status=p_error,finished_at=stamp where id=a.id;
    return jsonb_build_object('status','unavailable');
  end if;
  if p_error is not null or stamp>a.expires_at or stamp<a.requested_at or fx.status<>'scheduled' or stamp>=fx.commence_time
    or a.kickoff_at<>fx.commence_time or not public.gtl_epl_moneyline_gate(fx.season,fx.week) or not coalesce((select enabled from public.gtl_epl_jobs_schedule where job='moneyline'),false)
    or jsonb_typeof(p_event) is distinct from 'object' or octet_length(p_event::text)>16384 then valid:=false; end if;
  if valid then
    begin
      observed:=(p_event->>'observedAt')::timestamptz;
      if observed is null or observed<a.requested_at or observed>stamp or observed>=fx.commence_time
        or p_event->>'eventId' is distinct from fx.event_id or p_event->>'home' is distinct from fx.home or p_event->>'away' is distinct from fx.away
        or (p_event->>'commenceTime')::timestamptz is distinct from fx.commence_time
        or coalesce(p_event->>'responseSha256','') !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_event->'books') is distinct from 'object'
        or jsonb_typeof(p_event->'bookObservedAt') is distinct from 'object' then valid:=false; end if;
      if valid then
        foreach b in array array['draftkings','fanduel','betmgm'] loop
          q:=p_event->'books'->b;
          if q is null then continue; end if;
          if jsonb_typeof(q) is distinct from 'object' then valid:=false; exit; end if;
          if (select count(*) from jsonb_each(q))<>2 then valid:=false; exit; end if;
          book_at:=(p_event->'bookObservedAt'->>b)::timestamptz;
          if book_at is null or book_at>observed or book_at<observed-interval '5 minutes' then valid:=false; exit; end if;
          foreach v_club in array array[fx.home,fx.away] loop
            raw:=q->>v_club;
            if jsonb_typeof(q->v_club) is distinct from 'number' or raw !~ '^-?[0-9]{1,6}$' or abs(raw::integer) not between 100 and 100000 then valid:=false; exit; end if;
          end loop;
          if not valid then exit; end if;
          n:=n+1;
        end loop;
        if n<2 or (select count(*) from jsonb_each(p_event->'books'))<>n or (select count(*) from jsonb_each(p_event->'bookObservedAt'))<>n then valid:=false; end if;
      end if;
    exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format or invalid_parameter_value then valid:=false;
    end;
  end if;
  if not valid then
    update public.gtl_epl_moneyline_attempts set status='unavailable',finished_at=stamp where id=a.id;
    return jsonb_build_object('status','unavailable');
  end if;
  foreach v_club in array array[fx.home,fx.away] loop
    select array_agg(case when z.value::text::integer>=100 then z.value::text::integer-100 else z.value::text::integer+100 end order by
      case when z.value::text::integer>=100 then z.value::text::integer-100 else z.value::text::integer+100 end) into prices
      from jsonb_each(p_event->'books') x cross join lateral (select x.value->v_club as value) z;
    v:=case when n=3 then prices[2] else round((prices[1]+prices[2])::numeric/2)::integer end;
    p:=case when v>=0 then v+100 else v-100 end;
    if v_club=fx.home then hp:=p; else ap:=p; end if;
  end loop;
  -- Applied M-32 stores int distances. An extreme old pending guess must not roll back every other manager's reference.
  select count(*)::integer into unscorable from public.gtl_epl_guesses g where g.event_id=fx.event_id and g.status='locked' and g.reference_price is null and g.market='draw_no_bet'
    and observed>g.locked_at and observed<fx.commence_time
    and abs((case when g.price>=100 then g.price::bigint-100 else g.price::bigint+100 end)
      -(case when g.club=fx.home then case when hp>=100 then hp-100 else hp+100 end else case when ap>=100 then ap-100 else ap+100 end end))>2147483647;
  insert into public.gtl_epl_moneyline_collections(id,event_id,observed_at,home,away,home_price,away_price,unscorable_count,evidence)
    values(a.id,fx.event_id,observed,fx.home,fx.away,hp,ap,unscorable,p_event);
  insert into public.gtl_epl_prices as current(event_id,club,market,price,observed_at) values
    (fx.event_id,fx.home,'draw_no_bet',hp,observed),(fx.event_id,fx.away,'draw_no_bet',ap,observed)
    on conflict(event_id,club,market) do update set price=excluded.price,observed_at=excluded.observed_at where excluded.observed_at>current.observed_at;
  -- Use THIS captured observation, never a later latest-price row. No established reference can move.
  with refs as (select g.owner_id,case when g.club=fx.home then hp else ap end price,
      abs((case when g.price>=100 then g.price::bigint-100 else g.price::bigint+100 end)
        -(case when g.club=fx.home then case when hp>=100 then hp-100 else hp+100 end else case when ap>=100 then ap-100 else ap+100 end end)) dist
    from public.gtl_epl_guesses g where g.event_id=fx.event_id and g.status='locked' and g.reference_price is null and g.market='draw_no_bet'
      and observed>g.locked_at and observed<fx.commence_time)
  update public.gtl_epl_guesses g set reference_price=r.price,reference_observed_at=observed,reference_source='first-after',distance=r.dist::integer
    from refs r where g.event_id=fx.event_id and g.owner_id=r.owner_id and r.dist<=2147483647;
  update public.gtl_epl_moneyline_attempts set status='refreshed',finished_at=stamp where id=a.id;
  return jsonb_build_object('status','refreshed');
end $$;

-- M-36's admission, plus one more conservative credit for the three-way market of the same single-event read. The
-- shared budget row is locked again in the same transaction; without the credit (paused, unknown, or the 50-credit
-- reserve) the lease stays two-way. Every other condition is M-36's begin, unchanged.
create or replace function public.gtl_epl_begin_moneyline_markets(p_event_id text,p_user uuid default null,p_run uuid default null,p_claim uuid default null,p_now timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r jsonb; remain integer; paused boolean; three boolean:=false;
begin
  r:=public.gtl_epl_begin_moneyline_read(p_event_id,p_user,p_run,p_claim,p_now);
  if r->>'status' is distinct from 'ready' then return r; end if;
  if public.gtl_epl_three_way_ready() is true then
    select b.conservative_remaining,b.paused into remain,paused from public.gtl_odds_budget b where b.provider='the-odds-api' for update;
    if remain is not null and not coalesce(paused,true) and remain-1>=50 then
      update public.gtl_odds_budget set conservative_remaining=remain-1,updated_at=clock_timestamp() where provider='the-odds-api';
      update public.gtl_epl_moneyline_attempts set three_way=true where id=(r->>'leaseId')::uuid;
      three:=true;
    end if;
  end if;
  return r||jsonb_build_object('threeWay',three);
end $$;

-- Finish a lease with its draw-no-bet evidence (M-36's finish, unchanged rules) and, when the lease reserved it, a
-- complete three-way market from the same read: exactly home, draw and away from each of at least two allowed books,
-- each book observed within five minutes before the read, for the stored fixture's exact event, clubs and kickoff.
-- Medians, collection and three-way pending references commit together under the fixture lock. Three-way evidence
-- that fails any check is not stored; the draw-no-bet result stands on its own.
create or replace function public.gtl_epl_finish_moneyline_markets(p_lease uuid,p_token uuid,p_event jsonb default null,p_three_way jsonb default null,p_quota jsonb default null,p_error text default null,p_now timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a public.gtl_epl_moneyline_attempts; fx public.gtl_epl_fixtures; stamp timestamptz; valid boolean; observed timestamptz; book_at timestamptz;
  b text; o text; q jsonb; raw text; n integer:=0; lines bigint[]; v bigint; hp integer; dp integer; ap integer; result jsonb; unscorable integer:=0;
begin
  select * into a from public.gtl_epl_moneyline_attempts where id=p_lease and token=p_token;
  if not found then raise exception 'GTL_EPL_INVALID' using errcode='P0001'; end if;
  select * into fx from public.gtl_epl_fixtures where event_id=a.event_id for update;
  stamp:=greatest(clock_timestamp(),coalesce(p_now,clock_timestamp()));
  select * into a from public.gtl_epl_moneyline_attempts where id=p_lease and token=p_token for update;
  valid:=coalesce(a.status='running' and a.three_way and p_error is null and stamp<=a.expires_at and stamp>=a.requested_at
    and fx.status='scheduled' and stamp<fx.commence_time and a.kickoff_at=fx.commence_time
    and public.gtl_epl_three_way_ready() is true and public.gtl_epl_moneyline_gate(fx.season,fx.week)
    and coalesce((select enabled from public.gtl_epl_jobs_schedule where job='moneyline'),false)
    and jsonb_typeof(p_three_way)='object' and octet_length(p_three_way::text)<=16384,false);
  if valid then
    begin
      observed:=(p_three_way->>'observedAt')::timestamptz;
      if observed is null or observed<a.requested_at or observed>stamp or observed>=fx.commence_time
        or p_three_way->>'eventId' is distinct from fx.event_id or p_three_way->>'home' is distinct from fx.home or p_three_way->>'away' is distinct from fx.away
        or (p_three_way->>'commenceTime')::timestamptz is distinct from fx.commence_time
        or coalesce(p_three_way->>'responseSha256','') !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_three_way->'books') is distinct from 'object'
        or jsonb_typeof(p_three_way->'bookObservedAt') is distinct from 'object' then valid:=false; end if;
      if valid then
        foreach b in array array['draftkings','fanduel','betmgm'] loop
          q:=p_three_way->'books'->b;
          if q is null then continue; end if;
          if jsonb_typeof(q) is distinct from 'object' or (select count(*) from jsonb_each(q))<>3 then valid:=false; exit; end if;
          book_at:=(p_three_way->'bookObservedAt'->>b)::timestamptz;
          if book_at is null or book_at>observed or book_at<observed-interval '5 minutes' then valid:=false; exit; end if;
          foreach o in array array['home','draw','away'] loop
            raw:=q->>o;
            if jsonb_typeof(q->o) is distinct from 'number' or raw !~ '^-?[0-9]{1,6}$' or abs(raw::integer) not between 100 and 100000 then valid:=false; exit; end if;
          end loop;
          if not valid then exit; end if;
          n:=n+1;
        end loop;
        if valid and (n<2 or (select count(*) from jsonb_each(p_three_way->'books'))<>n
          or (select count(*) from jsonb_each(p_three_way->'bookObservedAt'))<>n) then valid:=false; end if;
      end if;
    exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format or invalid_parameter_value then valid:=false;
    end;
  end if;
  if valid then
    foreach o in array array['home','draw','away'] loop
      select array_agg(public.gtl_epl_moneyline_line((x.value->>o)::integer) order by public.gtl_epl_moneyline_line((x.value->>o)::integer)) into lines
        from jsonb_each(p_three_way->'books') x;
      v:=case when n=3 then lines[2] else round((lines[1]+lines[2])::numeric/2)::bigint end;
      if o='home' then hp:=case when v>=0 then v+100 else v-100 end;
      elsif o='draw' then dp:=case when v>=0 then v+100 else v-100 end;
      else ap:=case when v>=0 then v+100 else v-100 end; end if;
    end loop;
  end if;
  -- The draw-no-bet half keeps M-36's exact rules (and reconciles the quota once for the whole read).
  result:=public.gtl_epl_finish_moneyline_read(p_lease,p_token,p_event,p_quota,p_error,p_now);
  if not valid then return jsonb_build_object('status',coalesce(result->>'status','unavailable'),'threeWay',false); end if;
  select count(*)::integer into unscorable from public.gtl_epl_guesses g where g.event_id=fx.event_id and g.status='locked'
    and g.reference_price is null and g.market='three_way' and observed>g.locked_at and observed<fx.commence_time
    and abs(public.gtl_epl_moneyline_line(g.price)-public.gtl_epl_moneyline_line(case g.outcome when 'home' then hp when 'draw' then dp else ap end))>2147483647;
  insert into public.gtl_epl_three_way_collections(id,event_id,observed_at,home,away,home_price,draw_price,away_price,book_count,unscorable_count,evidence)
    values(a.id,fx.event_id,observed,fx.home,fx.away,hp,dp,ap,n,unscorable,p_three_way);
  -- Use THIS captured observation, never a later one. No established reference can move.
  with refs as (select g.owner_id,case g.outcome when 'home' then hp when 'draw' then dp else ap end price,
      abs(public.gtl_epl_moneyline_line(g.price)-public.gtl_epl_moneyline_line(case g.outcome when 'home' then hp when 'draw' then dp else ap end)) dist
    from public.gtl_epl_guesses g where g.event_id=fx.event_id and g.status='locked' and g.reference_price is null and g.market='three_way'
      and observed>g.locked_at and observed<fx.commence_time)
  update public.gtl_epl_guesses g set reference_price=r.price,reference_observed_at=observed,reference_source='first-after',distance=r.dist::integer
    from refs r where g.event_id=fx.event_id and g.owner_id=r.owner_id and r.dist<=2147483647;
  update public.gtl_epl_moneyline_attempts set status='refreshed',finished_at=coalesce(finished_at,stamp) where id=a.id and status in ('running','unavailable');
  return jsonb_build_object('status','refreshed','threeWay',true);
end $$;

-- Every function is service-only; create or replace keeps privileges, so each grant is restated (replaced ones too).
revoke all on function public.gtl_epl_three_way_ready(),public.gtl_epl_moneyline_line(integer),
  public.gtl_epl_guess_market_json(public.gtl_epl_guesses,public.gtl_epl_fixtures,timestamptz),
  public.gtl_epl_write_guess(uuid,text,text,text,integer,boolean,timestamptz,text),
  public.gtl_epl_save_guess(uuid,text,text,integer,boolean,timestamptz),
  public.gtl_epl_save_market_guess(uuid,text,text,text,integer,boolean,timestamptz),
  public.gtl_epl_save_market_guess_current(uuid,text,text,text,integer,boolean,timestamptz),
  public.gtl_epl_guess_board(uuid,integer,integer),public.gtl_epl_guess_board_markets(uuid,integer,integer),
  public.gtl_epl_resolve_pending_references(text),public.gtl_epl_bet_recommendations(uuid,integer,integer),
  public.gtl_epl_finish_moneyline_read(uuid,uuid,jsonb,jsonb,text,timestamptz),
  public.gtl_epl_begin_moneyline_markets(text,uuid,uuid,uuid,timestamptz),
  public.gtl_epl_finish_moneyline_markets(uuid,uuid,jsonb,jsonb,jsonb,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.gtl_epl_three_way_ready(),public.gtl_epl_moneyline_line(integer),
  public.gtl_epl_guess_market_json(public.gtl_epl_guesses,public.gtl_epl_fixtures,timestamptz),
  public.gtl_epl_write_guess(uuid,text,text,text,integer,boolean,timestamptz,text),
  public.gtl_epl_save_guess(uuid,text,text,integer,boolean,timestamptz),
  public.gtl_epl_save_market_guess(uuid,text,text,text,integer,boolean,timestamptz),
  public.gtl_epl_save_market_guess_current(uuid,text,text,text,integer,boolean,timestamptz),
  public.gtl_epl_guess_board(uuid,integer,integer),public.gtl_epl_guess_board_markets(uuid,integer,integer),
  public.gtl_epl_resolve_pending_references(text),public.gtl_epl_bet_recommendations(uuid,integer,integer),
  public.gtl_epl_finish_moneyline_read(uuid,uuid,jsonb,jsonb,text,timestamptz),
  public.gtl_epl_begin_moneyline_markets(text,uuid,uuid,uuid,timestamptz),
  public.gtl_epl_finish_moneyline_markets(uuid,uuid,jsonb,jsonb,jsonb,text,timestamptz)
  to service_role;
