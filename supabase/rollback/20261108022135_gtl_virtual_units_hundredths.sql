-- M-41 rollback: restore the three exact prior writer bodies.
-- Keep all saved cent stakes, audits, receipts, and settled results. Never drop data.
-- The capability stays service-only/readable and explicitly reports half units.
-- Additive helper remains service-only and unused by restored writers.

create or replace function public.gtl_save_virtual_units_pick(p_user uuid,p_league text,p_revision bigint,p_body jsonb) returns bigint
language plpgsql security invoker set search_path='' as $$
declare c jsonb; s integer; w integer; rev bigint; g jsonb; v_market text; v_game_id text; v_side text; line numeric; odds numeric; units numeric; quoted timestamptz; stamp timestamptz; old public.gtl_virtual_units_picks; value jsonb; event jsonb;
begin
  c:=public.gtl_weekly_context(p_user,p_league); s:=(c->>'season')::integer; w:=(c->>'week')::integer;
  insert into public.gtl_weekly_versions(user_id,season,week) values(p_user,s,w) on conflict do nothing;
  select revision into rev from public.gtl_weekly_versions where user_id=p_user and season=s and week=w for update;
  if p_revision is null or p_revision<>rev then raise exception 'GTL_WEEKLY_CONFLICT'; end if;
  if p_body is null or jsonb_typeof(p_body)<>'object' or exists(select 1 from jsonb_object_keys(p_body) k where k not in ('gameId','market','side','line','odds','units','source','quotedAt')) then raise exception 'GTL_VIRTUAL_INVALID'; end if;
  v_game_id:=p_body->>'gameId'; v_market:=p_body->>'market'; v_side:=p_body->>'side';
  select x into g from jsonb_array_elements(c#>'{state,games}') x where x->>'id'=v_game_id;
  if g is null or v_market not in ('spread','total') or (v_market='spread' and v_side not in ('home','away')) or (v_market='total' and v_side not in ('over','under')) then raise exception 'GTL_VIRTUAL_INVALID'; end if;
  stamp:=clock_timestamp();
  if stamp >= (g->>'kickoff')::timestamptz then raise exception 'GTL_VIRTUAL_CLOSED'; end if;
  begin line:=(p_body->>'line')::numeric; odds:=(p_body->>'odds')::numeric; units:=(p_body->>'units')::numeric; quoted:=(p_body->>'quotedAt')::timestamptz; exception when others then raise exception 'GTL_VIRTUAL_INVALID'; end;
  if not public.gtl_numeric_is_finite(line) or not public.gtl_numeric_is_finite(odds) or not public.gtl_numeric_is_finite(units) or not isfinite(quoted) or quoted is null or p_body->>'source' is null or line*2<>trunc(line*2)
    or (v_market='spread' and (line < -100 or line > 100)) or (v_market='total' and (line < 0 or line > 200))
    or odds<>trunc(odds) or abs(odds)<100 or abs(odds)>10000 or units<=0 or units*2<>trunc(units*2)
    or quoted>=((g->>'kickoff')::timestamptz) or quoted>stamp or length(btrim(p_body->>'source'))<2 or length(p_body->>'source')>120
    then raise exception 'GTL_VIRTUAL_INVALID'; end if;
  select v.* into old from public.gtl_virtual_units_picks v where v.user_id=p_user and v.season=s and v.week=w and v.game_id=v_game_id and v.market=v_market for update;
  value:=jsonb_build_object('gameId',v_game_id,'market',v_market,'side',v_side,'line',line,'odds',odds,'units',units,'source',btrim(p_body->>'source'),'quotedAt',quoted,'selectedAt',stamp,'riskDollars',units*100);
  event:=jsonb_build_object('id',gen_random_uuid(),'type',case when old.user_id is null then 'placed' else 'edited' end,'timestamp',stamp,'before',case when old.user_id is null then null else old.selection end,'after',value);
  insert into public.gtl_virtual_units_picks(user_id,season,week,game_id,market,selection,status,result,audit,created_at,updated_at)
    values(p_user,s,w,v_game_id,v_market,value,'pending',null,jsonb_build_array(event),stamp,stamp)
    on conflict(user_id,season,week,game_id,market) do update set selection=excluded.selection,status='pending',result=null,audit=public.gtl_virtual_units_picks.audit||excluded.audit,updated_at=stamp;
  update public.gtl_weekly_versions set revision=revision+1 where user_id=p_user and season=s and week=w;
  return rev+1;
end $$;

create or replace function public.gtl_save_recommended_virtual_pick(
  p_user uuid,p_season integer,p_week integer,p_revision bigint,p_body jsonb
) returns bigint language plpgsql security invoker set search_path='' as $$
declare
  s integer; w integer; sig jsonb; g jsonb; named_game jsonb; rev bigint;
  v_game text; v_market text; v_side text; v_book text; v_source text;
  v_line numeric; v_odds numeric; v_units numeric; quoted timestamptz;
  kickoff timestamptz; stamp timestamptz; q jsonb; value jsonb; event jsonb;
  snap record; snapshot_game jsonb; candidate jsonb; quote_value numeric; base_odds numeric;
  observed timestamptz; collected timestamptz; captured timestamptz; kept_capture timestamptz; kept_observed timestamptz; kept_collected timestamptz;
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  -- Match the newest published slate used by /personal and /community/read.
  select season,week,signature into s,w,sig from public.gtl_weekly_slates order by season desc,week desc limit 1;
  if p_season is null or p_week is null or s is null or p_season<>s or p_week<>w then raise exception 'GTL_BETS_WEEK'; end if;
  insert into public.gtl_weekly_versions(user_id,season,week) values(p_user,s,w) on conflict do nothing;
  select revision into rev from public.gtl_weekly_versions where user_id=p_user and season=s and week=w for update;
  if p_revision is null or p_revision<>rev then raise exception 'GTL_WEEKLY_CONFLICT'; end if;
  if p_body is null or jsonb_typeof(p_body)<>'object'
    or exists(select 1 from jsonb_object_keys(p_body) k where k not in ('gameId','market','side','line','odds','units','source','quotedAt'))
    or jsonb_typeof(p_body->'line') is distinct from 'number'
    or jsonb_typeof(p_body->'odds') is distinct from 'number'
    or jsonb_typeof(p_body->'units') is distinct from 'number'
    then raise exception 'GTL_VIRTUAL_INVALID'; end if;
  v_game:=p_body->>'gameId'; v_market:=p_body->>'market'; v_side:=p_body->>'side'; v_source:=p_body->>'source';
  if v_game is null or v_market is null or v_side is null or v_market not in ('spread','total')
    or (v_market='spread' and v_side not in ('home','away')) or (v_market='total' and v_side not in ('over','under'))
    then raise exception 'GTL_VIRTUAL_INVALID'; end if;
  select x into g from jsonb_array_elements(sig->'games') x where x->>'id'=v_game;
  if g is null then raise exception 'GTL_VIRTUAL_INVALID'; end if;
  stamp:=clock_timestamp(); kickoff:=to_timestamp((g->>'kickoff')::double precision);
  if kickoff is null or stamp>=kickoff then raise exception 'GTL_VIRTUAL_CLOSED'; end if;
  if not public.gtl_guess_locked_in(p_user,s,w,case when v_market='spread' then 'guess_spread' else 'guess_total' end,v_game)
    or not public.gtl_guess_revealed(p_user,s,w,case when v_market='spread' then 'guess_spread' else 'guess_total' end,v_game,stamp)
    then raise exception 'GTL_LINE_LOCKED'; end if;
  if exists(select 1 from public.gtl_virtual_units_picks where user_id=p_user and season=s and week=w and game_id=v_game and market=v_market)
    then raise exception 'GTL_VIRTUAL_EXISTS'; end if;
  begin
    v_line:=(p_body->>'line')::numeric; v_odds:=(p_body->>'odds')::numeric; v_units:=(p_body->>'units')::numeric;
    quoted:=(p_body->>'quotedAt')::timestamptz;
  exception when others then raise exception 'GTL_VIRTUAL_INVALID'; end;
  -- Same book map as cloud/virtual-units.mjs; this authorizes no new provider fetch.
  v_book:=case v_source when 'DraftKings' then 'draftkings' when 'FanDuel' then 'fanduel' when 'BetMGM' then 'betmgm'
    when 'BetRivers' then 'betrivers' when 'BetOnline.ag' then 'betonlineag' when 'BetUS' then 'betus'
    when 'Bovada' then 'bovada' when 'LowVig.ag' then 'lowvig' when 'MyBookie.ag' then 'mybookieag' end;
  if not public.gtl_numeric_is_finite(v_line) or not public.gtl_numeric_is_finite(v_odds) or not public.gtl_numeric_is_finite(v_units)
    or quoted is null or not isfinite(quoted) or quoted>stamp or quoted>=kickoff or v_book is null
    or v_line*2<>trunc(v_line*2) or (v_market='spread' and (v_line < -100 or v_line > 100))
    or (v_market='total' and (v_line < 0 or v_line > 200)) or v_odds<>trunc(v_odds)
    or abs(v_odds)<100 or abs(v_odds)>10000 or v_units<=0 or v_units*2<>trunc(v_units*2)
    then raise exception 'GTL_VIRTUAL_INVALID'; end if;
  -- Existing helper resolves canonical full team names from the published template.
  named_game:=public.gtl_slate_game(s,w,sig,v_game);
  -- Exactly the newest retained quote for this named book among the same bounded
  -- 20 snapshots as the existing reader. Never select an older price just because
  -- it matches the request. Collection and observation times must be well formed.
  begin
    for snap in select id,created_at,payload from public.gtl_market_snapshots
      where season=s and week=w and slate_signature=sig and created_at<=stamp
      order by created_at desc,id desc limit 20 loop
      -- The JS reader normalizes timestamps through Date (millisecond precision).
      captured:=date_trunc('milliseconds',snap.created_at);
      snapshot_game:=null;
      -- The reader takes the first exact matching game in a snapshot. Bad game
      -- or quote timestamps are skipped individually, never allowed to obscure a
      -- retained valid quote from an older collection.
      for candidate in select x from jsonb_array_elements(snap.payload->'games') x loop
        begin
          if candidate->>'gameId'=v_game and candidate->>'home'=named_game->>'home' and candidate->>'away'=named_game->>'away'
            and (candidate->>'kickoff')::timestamptz=kickoff then snapshot_game:=candidate; exit; end if;
        exception when others then continue; end;
      end loop;
      if snapshot_game is null then continue; end if;
      for candidate in select x from jsonb_array_elements(snapshot_game#>array['markets',v_market,'quotes']) x loop
        if candidate->>'provider' is distinct from 'the-odds-api' or candidate->>'book' is distinct from v_book
          or candidate->>'market' is distinct from v_market then continue; end if;
        begin
          observed:=date_trunc('milliseconds',(candidate->>'providerObservedAt')::timestamptz);
          collected:=date_trunc('milliseconds',(candidate->>'collectedAt')::timestamptz);
          quote_value:=(candidate->>'value')::numeric;
          base_odds:=(candidate#>>array['outcomes',case when v_market='spread' then 'home' else 'over' end,'odds'])::numeric;
        exception when others then continue; end;
        -- Mirror latestQuotes' point and base-price checks BEFORE choosing this
        -- book's newest quote. The chosen side is validated against the exact
        -- requested terms below; a malformed newer base quote does not erase an
        -- older valid one, but a valid one-sided update does replace that book.
        if observed is null or collected is null or not isfinite(observed) or not isfinite(collected)
          or observed>=kickoff or observed>collected or collected>captured
          or not public.gtl_numeric_is_finite(quote_value) or quote_value*2<>trunc(quote_value*2)
          or (v_market='spread' and (quote_value < -100 or quote_value > 100))
          or (v_market='total' and (quote_value < 0 or quote_value > 200))
          or not public.gtl_numeric_is_finite(base_odds) or base_odds<>trunc(base_odds) or abs(base_odds)<100 or abs(base_odds)>10000
          then continue; end if;
        -- newestPerBook compares capture, observation, collection. A full tie
        -- keeps the first seen; snapshots arrive newest-first, id descending.
        if q is null or captured>kept_capture
          or (captured=kept_capture and observed>kept_observed)
          or (captured=kept_capture and observed=kept_observed and collected>kept_collected) then
          q:=candidate; kept_capture:=captured; kept_observed:=observed; kept_collected:=collected;
        end if;
      end loop;
    end loop;
    if q is null or (q#>>array['outcomes',v_side,'line'])::numeric is distinct from v_line
      or (q#>>array['outcomes',v_side,'odds'])::numeric is distinct from v_odds
      or date_trunc('milliseconds',(q->>'providerObservedAt')::timestamptz) is distinct from quoted
      then raise exception 'GTL_VIRTUAL_QUOTE'; end if;
  exception when others then raise exception 'GTL_VIRTUAL_QUOTE'; end;
  -- Re-read time after any lock wait and quote work. No saved bet crosses kickoff.
  stamp:=clock_timestamp();
  if stamp>=kickoff then raise exception 'GTL_VIRTUAL_CLOSED'; end if;
  if exists(select 1 from public.gtl_weekly_slates where season>s or (season=s and week>w)) then raise exception 'GTL_BETS_WEEK'; end if;
  value:=jsonb_build_object('gameId',v_game,'market',v_market,'side',v_side,'line',v_line,'odds',v_odds,'units',v_units,
    'source',v_source,'quotedAt',quoted,'selectedAt',stamp,'riskDollars',v_units*100);
  event:=jsonb_build_object('id',gen_random_uuid(),'type','placed','timestamp',stamp,'before',null,'after',value);
  insert into public.gtl_virtual_units_picks(user_id,season,week,game_id,market,selection,status,result,audit,created_at,updated_at)
    values(p_user,s,w,v_game,v_market,value,'pending',null,jsonb_build_array(event),stamp,stamp);
  update public.gtl_weekly_versions set revision=revision+1 where user_id=p_user and season=s and week=w;
  return rev+1;
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

create or replace function public.gtl_virtual_unit_rules() returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('version',1,'hundredths',false)
$$;
revoke all on function public.gtl_virtual_unit_rules() from public,anon,authenticated;
grant execute on function public.gtl_virtual_unit_rules() to service_role;
