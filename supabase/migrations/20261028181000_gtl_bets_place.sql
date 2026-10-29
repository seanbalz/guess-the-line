-- M-11 / stage 41: account-level Virtual Units placement for the published community week.
-- Additive: one receipts table and three new service-only functions. No existing function,
-- row, guess rule or ballot changes. Apply after M-10 (gtl_bet_versions, the readers), with
-- the API's error mapping deployed first. GTL_FEATURE_OFF=bets (or bets-place) turns the
-- route off; rollback is that switch plus revoking gtl_place_bets. Rows stay (D-23).
--
-- One request places or edits one or more bets atomically:
-- * the week is the newest published slate, the same one /bets/read shows;
-- * each bet passes membership, kickoff, the line lock (D-36 as amended by D-39), half units
--   and the newest retained named-book quote for its book, matched to the exact terms;
-- * an edit names the terms the client read (`expected`); a row that changed since, through
--   this route or the old group /virtual-pick route, refuses the whole request with
--   GTL_BET_CHANGED ("This bet changed"). A new bet names `expected: null`;
-- * the lock is the account's gtl_bet_versions row, never gtl_weekly_versions, so a Guess
--   autosave between the read and the place causes no 409;
-- * a request id is stored with its reply. Replaying the same request returns that reply;
--   the same id with different bets is refused (GTL_BETS_REPLAY). An uncertain retry never
--   writes twice.
-- Edits stay possible until the game's kickoff, each with a full audit event.

create table if not exists public.gtl_bet_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  season integer not null,
  week integer not null,
  request jsonb not null check (jsonb_typeof(request)='array'),
  response jsonb not null check (jsonb_typeof(response)='object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id,request_id),
  foreign key (season,week) references public.gtl_weekly_slates(season,week)
);
alter table public.gtl_bet_receipts enable row level security;
revoke all on public.gtl_bet_receipts from public,anon,authenticated,service_role;
grant select,insert on public.gtl_bet_receipts to service_role;

-- The newest retained, well-formed quote from one named book for one game and market, as
-- gtl_save_recommended_virtual_pick and the JS reader choose it (newestPerBook): newest
-- capture, then observation, then collection; a full tie keeps the first seen. Null if none.
create or replace function public.gtl_bets_newest_quote(
  p_season integer,p_week integer,p_sig jsonb,p_game text,p_market text,p_book text,p_now timestamptz
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare g jsonb; named jsonb; kickoff timestamptz; snap record; snapshot_game jsonb; candidate jsonb; q jsonb;
  observed timestamptz; collected timestamptz; captured timestamptz; quote_value numeric; base_odds numeric;
  kept_capture timestamptz; kept_observed timestamptz; kept_collected timestamptz;
begin
  select x into g from jsonb_array_elements(p_sig->'games') x where x->>'id'=p_game;
  if g is null then return null; end if;
  kickoff:=to_timestamp((g->>'kickoff')::double precision);
  named:=public.gtl_slate_game(p_season,p_week,p_sig,p_game);
  for snap in select id,created_at,payload from public.gtl_market_snapshots
    where season=p_season and week=p_week and slate_signature=p_sig and created_at<=p_now
    order by created_at desc,id desc limit 20 loop
    captured:=date_trunc('milliseconds',snap.created_at);
    snapshot_game:=null;
    for candidate in select x from jsonb_array_elements(snap.payload->'games') x loop
      begin
        if candidate->>'gameId'=p_game and candidate->>'home'=named->>'home' and candidate->>'away'=named->>'away'
          and (candidate->>'kickoff')::timestamptz=kickoff then snapshot_game:=candidate; exit; end if;
      exception when others then continue; end;
    end loop;
    if snapshot_game is null then continue; end if;
    for candidate in select x from jsonb_array_elements(snapshot_game#>array['markets',p_market,'quotes']) x loop
      if candidate->>'provider' is distinct from 'the-odds-api' or candidate->>'book' is distinct from p_book
        or candidate->>'market' is distinct from p_market then continue; end if;
      begin
        observed:=date_trunc('milliseconds',(candidate->>'providerObservedAt')::timestamptz);
        collected:=date_trunc('milliseconds',(candidate->>'collectedAt')::timestamptz);
        quote_value:=(candidate->>'value')::numeric;
        base_odds:=(candidate#>>array['outcomes',case when p_market='spread' then 'home' else 'over' end,'odds'])::numeric;
      exception when others then continue; end;
      if observed is null or collected is null or not isfinite(observed) or not isfinite(collected)
        or observed>=kickoff or observed>collected or collected>captured
        or not coalesce(public.gtl_numeric_is_finite(quote_value),false) or quote_value*2<>trunc(quote_value*2)
        or (p_market='spread' and (quote_value < -100 or quote_value > 100))
        or (p_market='total' and (quote_value < 0 or quote_value > 200))
        or not coalesce(public.gtl_numeric_is_finite(base_odds),false) or base_odds<>trunc(base_odds)
        or abs(base_odds)<100 or abs(base_odds)>10000 then continue; end if;
      if q is null or captured>kept_capture
        or (captured=kept_capture and observed>kept_observed)
        or (captured=kept_capture and observed=kept_observed and collected>kept_collected) then
        q:=candidate; kept_capture:=captured; kept_observed:=observed; kept_collected:=collected;
      end if;
    end loop;
  end loop;
  return q;
end $$;

-- The terms a client compares before editing: side, line, odds, units, book and quote time.
create or replace function public.gtl_bets_terms(p_selection jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if p_selection is null or jsonb_typeof(p_selection)<>'object' then return null; end if;
  return jsonb_build_object('side',p_selection->>'side','line',(p_selection->>'line')::numeric,
    'odds',(p_selection->>'odds')::numeric,'units',(p_selection->>'units')::numeric,'source',p_selection->>'source',
    'quotedAt',date_trunc('milliseconds',(p_selection->>'quotedAt')::timestamptz));
exception when others then return jsonb_build_object('invalid',true);
end $$;

create or replace function public.gtl_place_bets(
  p_user uuid,p_season integer,p_week integer,p_request uuid,p_bets jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  sig jsonb; ns integer; nw integer; rev bigint; receipt public.gtl_bet_receipts; bet jsonb; g jsonb;
  v_game text; v_market text; v_side text; v_source text; v_book text; v_line numeric; v_odds numeric; v_units numeric;
  quoted timestamptz; kickoff timestamptz; stamp timestamptz; q jsonb; old public.gtl_virtual_units_picks;
  mode text; value jsonb; event jsonb; placed jsonb:='[]'::jsonb; response jsonb;
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_request is null or p_season is null or p_week is null then raise exception 'GTL_VIRTUAL_INVALID'; end if;
  select signature into sig from public.gtl_weekly_slates where season=p_season and week=p_week;
  if sig is null then raise exception 'GTL_BETS_WEEK'; end if;
  -- One place at a time per account and week. A Guess save never takes this lock.
  insert into public.gtl_bet_versions(user_id,season,week) values(p_user,p_season,p_week) on conflict do nothing;
  select revision into rev from public.gtl_bet_versions where user_id=p_user and season=p_season and week=p_week for update;
  -- A replay answers before any week or kickoff check: the original request already ran them.
  select * into receipt from public.gtl_bet_receipts where user_id=p_user and request_id=p_request;
  if receipt.user_id is not null then
    if receipt.season<>p_season or receipt.week<>p_week or receipt.request is distinct from p_bets
      then raise exception 'GTL_BETS_REPLAY'; end if;
    return receipt.response||jsonb_build_object('replayed',true);
  end if;
  select season,week into ns,nw from public.gtl_weekly_slates order by season desc,week desc limit 1;
  if ns<>p_season or nw<>p_week then raise exception 'GTL_BETS_WEEK'; end if;
  if p_bets is null or jsonb_typeof(p_bets)<>'array' or jsonb_array_length(p_bets) not between 1 and 64
    or exists(select 1 from jsonb_array_elements(p_bets) x where jsonb_typeof(x)<>'object'
      or exists(select 1 from jsonb_object_keys(x) k
        where k not in ('gameId','market','side','line','odds','units','source','quotedAt','expected')))
    or (select count(*) from jsonb_array_elements(p_bets))
      <>(select count(distinct (x->>'gameId',x->>'market')) from jsonb_array_elements(p_bets) x)
    then raise exception 'GTL_VIRTUAL_INVALID'; end if;
  for bet in select x from jsonb_array_elements(p_bets) x loop
    v_game:=bet->>'gameId'; v_market:=bet->>'market'; v_side:=bet->>'side'; v_source:=bet->>'source';
    if v_game is null or v_market is null or v_side is null or v_market not in ('spread','total')
      or (v_market='spread' and v_side not in ('home','away')) or (v_market='total' and v_side not in ('over','under'))
      or jsonb_typeof(bet->'line') is distinct from 'number' or jsonb_typeof(bet->'odds') is distinct from 'number'
      or jsonb_typeof(bet->'units') is distinct from 'number'
      or (bet ? 'expected' and jsonb_typeof(bet->'expected') not in ('null','object'))
      then raise exception 'GTL_VIRTUAL_INVALID'; end if;
    g:=null;
    select x into g from jsonb_array_elements(sig->'games') x where x->>'id'=v_game;
    if g is null then raise exception 'GTL_VIRTUAL_INVALID'; end if;
    kickoff:=to_timestamp((g->>'kickoff')::double precision);
    stamp:=clock_timestamp();
    if kickoff is null or stamp>=kickoff then raise exception 'GTL_VIRTUAL_CLOSED'; end if;
    mode:=case when v_market='spread' then 'guess_spread' else 'guess_total' end;
    if not public.gtl_guess_locked_in(p_user,p_season,p_week,mode,v_game)
      or not public.gtl_guess_revealed(p_user,p_season,p_week,mode,v_game,stamp)
      then raise exception 'GTL_LINE_LOCKED'; end if;
    begin
      v_line:=(bet->>'line')::numeric; v_odds:=(bet->>'odds')::numeric; v_units:=(bet->>'units')::numeric;
      quoted:=date_trunc('milliseconds',(bet->>'quotedAt')::timestamptz);
    exception when others then raise exception 'GTL_VIRTUAL_INVALID'; end;
    v_book:=case v_source when 'DraftKings' then 'draftkings' when 'FanDuel' then 'fanduel' when 'BetMGM' then 'betmgm'
      when 'BetRivers' then 'betrivers' when 'BetOnline.ag' then 'betonlineag' when 'BetUS' then 'betus'
      when 'Bovada' then 'bovada' when 'LowVig.ag' then 'lowvig' when 'MyBookie.ag' then 'mybookieag' end;
    if not public.gtl_numeric_is_finite(v_line) or not public.gtl_numeric_is_finite(v_odds) or not public.gtl_numeric_is_finite(v_units)
      or quoted is null or not isfinite(quoted) or quoted>stamp or quoted>=kickoff or v_book is null
      or v_line*2<>trunc(v_line*2) or (v_market='spread' and (v_line < -100 or v_line > 100))
      or (v_market='total' and (v_line < 0 or v_line > 200)) or v_odds<>trunc(v_odds)
      or abs(v_odds)<100 or abs(v_odds)>10000 or v_units<=0 or v_units*2<>trunc(v_units*2)
      then raise exception 'GTL_VIRTUAL_INVALID'; end if;
    -- Exact terms of this book's newest retained quote; an older price is never chosen to match.
    q:=public.gtl_bets_newest_quote(p_season,p_week,sig,v_game,v_market,v_book,stamp);
    begin
      if q is null or (q#>>array['outcomes',v_side,'line'])::numeric is distinct from v_line
        or (q#>>array['outcomes',v_side,'odds'])::numeric is distinct from v_odds
        or date_trunc('milliseconds',(q->>'providerObservedAt')::timestamptz) is distinct from quoted
        then raise exception 'GTL_VIRTUAL_QUOTE'; end if;
    exception when others then raise exception 'GTL_VIRTUAL_QUOTE'; end;
    old:=null;
    select v.* into old from public.gtl_virtual_units_picks v where v.user_id=p_user and v.season=p_season
      and v.week=p_week and v.game_id=v_game and v.market=v_market for update;
    -- The client's read must still be the stored row: nothing for a new bet, the same terms for an edit.
    if (old.user_id is null)<>(bet->'expected' is null or bet->'expected'='null'::jsonb)
      or (old.user_id is not null and public.gtl_bets_terms(old.selection) is distinct from public.gtl_bets_terms(bet->'expected'))
      then raise exception 'GTL_BET_CHANGED'; end if;
    if old.user_id is not null and old.status<>'pending' then raise exception 'GTL_VIRTUAL_CLOSED'; end if;
    -- Re-read time after the row lock wait. No saved bet crosses kickoff.
    stamp:=clock_timestamp();
    if stamp>=kickoff then raise exception 'GTL_VIRTUAL_CLOSED'; end if;
    value:=jsonb_build_object('gameId',v_game,'market',v_market,'side',v_side,'line',v_line,'odds',v_odds,'units',v_units,
      'source',v_source,'quotedAt',quoted,'selectedAt',stamp,'riskDollars',v_units*100);
    event:=jsonb_build_object('id',gen_random_uuid(),'type',case when old.user_id is null then 'placed' else 'edited' end,
      'timestamp',stamp,'requestId',p_request,'before',case when old.user_id is null then null else old.selection end,'after',value);
    insert into public.gtl_virtual_units_picks(user_id,season,week,game_id,market,selection,status,result,audit,created_at,updated_at)
      values(p_user,p_season,p_week,v_game,v_market,value,'pending',null,jsonb_build_array(event),stamp,stamp)
      on conflict(user_id,season,week,game_id,market) do update set selection=excluded.selection,
        audit=public.gtl_virtual_units_picks.audit||excluded.audit,updated_at=stamp;
    placed:=placed||jsonb_build_array(value||jsonb_build_object('edited',old.user_id is not null));
  end loop;
  update public.gtl_bet_versions set revision=revision+1 where user_id=p_user and season=p_season and week=p_week;
  response:=jsonb_build_object('season',p_season,'week',p_week,'requestId',p_request,'revision',rev+1,'bets',placed);
  insert into public.gtl_bet_receipts(user_id,request_id,season,week,request,response)
    values(p_user,p_request,p_season,p_week,p_bets,response);
  return response;
end $$;

revoke all on function public.gtl_bets_newest_quote(integer,integer,jsonb,text,text,text,timestamptz),
  public.gtl_bets_terms(jsonb),
  public.gtl_place_bets(uuid,integer,integer,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.gtl_bets_newest_quote(integer,integer,jsonb,text,text,text,timestamptz),
  public.gtl_bets_terms(jsonb),
  public.gtl_place_bets(uuid,integer,integer,uuid,jsonb)
  to service_role;
