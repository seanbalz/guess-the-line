-- Recommendation refinement: explicit edits to an existing current-week virtual pick.
-- Additive service-only RPC; the original placement and group writers stay unchanged.
-- Units-only edits preserve saved quote terms. A quote/side update must be explicit
-- and match the latest retained named-book quote under the shared revision lock.
create or replace function public.gtl_edit_recommended_virtual_pick(
  p_user uuid,p_season integer,p_week integer,p_revision bigint,p_body jsonb
) returns bigint language plpgsql security invoker set search_path='' as $$
declare
  s integer; w integer; sig jsonb; g jsonb; named_game jsonb; rev bigint;
  v_game text; v_market text; v_side text; v_book text; v_source text;
  v_line numeric; v_odds numeric; v_units numeric; quoted timestamptz;
  kickoff timestamptz; stamp timestamptz; q jsonb; value jsonb; event jsonb;
  snap record; snapshot_game jsonb; candidate jsonb; quote_value numeric; base_odds numeric;
  observed timestamptz; collected timestamptz; captured timestamptz; kept_capture timestamptz; kept_observed timestamptz; kept_collected timestamptz;
  previous public.gtl_virtual_units_picks%rowtype; update_quote boolean;
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  select season,week,signature into s,w,sig from public.gtl_weekly_slates order by season desc,week desc limit 1;
  if p_season is null or p_week is null or s is null or p_season<>s or p_week<>w then raise exception 'GTL_BETS_WEEK'; end if;
  insert into public.gtl_weekly_versions(user_id,season,week) values(p_user,s,w) on conflict do nothing;
  select revision into rev from public.gtl_weekly_versions where user_id=p_user and season=s and week=w for update;
  if p_revision is null or p_revision<>rev then raise exception 'GTL_WEEKLY_CONFLICT'; end if;
  if p_body is null or jsonb_typeof(p_body)<>'object' or jsonb_typeof(p_body->'units') is distinct from 'number'
    or (p_body ? 'updateQuote' and jsonb_typeof(p_body->'updateQuote') is distinct from 'boolean')
    then raise exception 'GTL_VIRTUAL_INVALID'; end if;
  update_quote:=coalesce((p_body->>'updateQuote')::boolean,false);
  if exists(select 1 from jsonb_object_keys(p_body) k where
    (update_quote and k not in ('gameId','market','units','updateQuote','side','line','odds','source','quotedAt'))
    or (not update_quote and k not in ('gameId','market','units','updateQuote')))
    then raise exception 'GTL_VIRTUAL_INVALID'; end if;
  v_game:=p_body->>'gameId'; v_market:=p_body->>'market';
  if v_game is null or v_market is null or v_market not in ('spread','total') then raise exception 'GTL_VIRTUAL_INVALID'; end if;
  select x into g from jsonb_array_elements(sig->'games') x where x->>'id'=v_game;
  if g is null then raise exception 'GTL_VIRTUAL_INVALID'; end if;
  stamp:=clock_timestamp(); kickoff:=to_timestamp((g->>'kickoff')::double precision);
  if kickoff is null or stamp>=kickoff then raise exception 'GTL_VIRTUAL_CLOSED'; end if;
  if not public.gtl_guess_locked_in(p_user,s,w,case when v_market='spread' then 'guess_spread' else 'guess_total' end,v_game)
    or not public.gtl_guess_revealed(p_user,s,w,case when v_market='spread' then 'guess_spread' else 'guess_total' end,v_game,stamp)
    then raise exception 'GTL_LINE_LOCKED'; end if;
  select * into previous from public.gtl_virtual_units_picks
    where user_id=p_user and season=s and week=w and game_id=v_game and market=v_market for update;
  if not found then raise exception 'GTL_VIRTUAL_MISSING'; end if;
  -- The settlement writer holds this same pick row while grading. A concurrent
  -- settlement finishes before this guard, or grades the committed edit afterward.
  -- A retained cancellation/postponement also closes an older writer's re-saved row.
  if previous.status<>'pending' or previous.result is not null
    or exists(select 1 from public.gtl_virtual_units_settlements where season=s and week=w and game_id=v_game)
    then raise exception 'GTL_VIRTUAL_SETTLED'; end if;
  v_units:=(p_body->>'units')::numeric;
  if not public.gtl_numeric_is_finite(v_units) or v_units<=0 or v_units*2<>trunc(v_units*2) then raise exception 'GTL_VIRTUAL_INVALID'; end if;
  if update_quote then
    if jsonb_typeof(p_body->'line') is distinct from 'number' or jsonb_typeof(p_body->'odds') is distinct from 'number'
      then raise exception 'GTL_VIRTUAL_INVALID'; end if;
    v_side:=p_body->>'side'; v_source:=p_body->>'source';
    if v_side is null or (v_market='spread' and v_side not in ('home','away')) or (v_market='total' and v_side not in ('over','under'))
      then raise exception 'GTL_VIRTUAL_INVALID'; end if;
    begin
      v_line:=(p_body->>'line')::numeric; v_odds:=(p_body->>'odds')::numeric; quoted:=(p_body->>'quotedAt')::timestamptz;
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
  end if;
  -- Repeat time/week checks after lock waits and optional quote work.
  stamp:=clock_timestamp();
  if stamp>=kickoff then raise exception 'GTL_VIRTUAL_CLOSED'; end if;
  if exists(select 1 from public.gtl_weekly_slates where season>s or (season=s and week>w)) then raise exception 'GTL_BETS_WEEK'; end if;
  value:=previous.selection || jsonb_build_object('units',v_units,'riskDollars',v_units*100);
  if update_quote then
    value:=value || jsonb_build_object('side',v_side,'line',v_line,'odds',v_odds,'source',v_source,'quotedAt',quoted);
  end if;
  event:=jsonb_build_object('id',gen_random_uuid(),'type','edited','timestamp',stamp,'before',previous.selection,'after',value,'quoteUpdated',update_quote);
  update public.gtl_virtual_units_picks set selection=value,audit=previous.audit||jsonb_build_array(event),updated_at=stamp
    where user_id=p_user and season=s and week=w and game_id=v_game and market=v_market;
  update public.gtl_weekly_versions set revision=revision+1 where user_id=p_user and season=s and week=w;
  return rev+1;
end $$;
revoke all on function public.gtl_edit_recommended_virtual_pick(uuid,integer,integer,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.gtl_edit_recommended_virtual_pick(uuid,integer,integer,bigint,jsonb) to service_role;
