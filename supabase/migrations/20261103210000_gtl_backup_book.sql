-- M-39 DRAFT (board item 40, D-74 proposal; not approved, not applied). BetRivers as a backup book.
--
-- Sean, November 3, 2026: "Draft it, don't ship". At 18:15 UTC that day the provider sent no FanDuel prices for any of
-- the 15 games, and a saved line needs three books, so no new line could be made. The provider adapter now also asks
-- for BetRivers (`betrivers`) in the same request (up to 10 named books cost one region, so still two credits) and,
-- per game and market, puts BetRivers in only for a selected book (DraftKings, FanDuel, BetMGM) it could not quote.
--
-- 1. gtl_line_from_snapshot accepts `betrivers` as one of the three distinct books. Every other check is unchanged:
--    exactly three quotes, three distinct books, observed within five minutes of the collection and of each other,
--    and all three within five points of the median. Three distinct books out of four always leave at least two of
--    the selected ones; the adapter never adds BetRivers when all three are quoted.
-- 2. gtl_book_quotes_from_snapshot names `betrivers` "BetRivers" in the book-level prices.
--
-- Lines already saved are untouched (D-16, D-23). Challenge selections, Virtual Units and the frozen spread
-- benchmark keep their three books. Each body is otherwise the current hosted definition, byte for byte.
-- Rollback: supabase/rollback/<this file>.

-- replaces public.gtl_line_from_snapshot md5 a4c48626930c05b9d0a8ec2f70be0197
-- replaces public.gtl_book_quotes_from_snapshot md5 051d3033460ea3fb7d28257c3528c657

create or replace function public.gtl_line_from_snapshot(p_payload jsonb,p_game jsonb,p_market text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare e jsonb; q jsonb; vals numeric[]:='{}'; books text[]:='{}'; v numeric; midpoint numeric;
  receipts jsonb:='[]'; captured timestamptz; observed timestamptz; quoted timestamptz; first_quote timestamptz; last_quote timestamptz;
begin
  if p_market is null or p_market not in ('spread','total') or p_payload is null or p_game is null
    or p_payload->>'provider' is distinct from 'the-odds-api' or p_payload->>'sport' is distinct from 'americanfootball_nfl'
    or jsonb_typeof(p_payload->'games') is distinct from 'array' then return null; end if;
  captured:=(p_payload->>'fetchedAt')::timestamptz;
  if captured is null or not isfinite(captured) or captured>=(p_game->>'kickoff')::timestamptz
    or (select count(*) from jsonb_array_elements(p_payload->'games') x where x->>'gameId'=p_game->>'id')<>1 then return null; end if;
  select x into e from jsonb_array_elements(p_payload->'games') x where x->>'gameId'=p_game->>'id';
  if e->>'home' is distinct from p_game->>'home' or e->>'away' is distinct from p_game->>'away'
    or (e->>'kickoff')::timestamptz is distinct from (p_game->>'kickoff')::timestamptz
    or e->>'matchStatus' is distinct from 'matched' or e->>'providerEventId' is null
    or jsonb_typeof(e#>array['markets',p_market,'quotes']) is distinct from 'array'
    or jsonb_array_length(e#>array['markets',p_market,'quotes'])<>3 then return null; end if;
  for q in select value from jsonb_array_elements(e#>array['markets',p_market,'quotes']) loop
    if q->>'book' is null or q->>'book' not in ('draftkings','fanduel','betmgm','betrivers') or q->>'book'=any(books)
      or q->>'provider' is distinct from 'the-odds-api' or q->>'providerEventId' is distinct from e->>'providerEventId'
      or q->>'market' is distinct from p_market or q->>'timeBasis' is distinct from 'provider_market_last_update'
      or jsonb_typeof(q->'value') is distinct from 'number' then return null; end if;
    v:=(q->>'value')::numeric; observed:=(q->>'providerObservedAt')::timestamptz; quoted:=(q->>'collectedAt')::timestamptz;
    if mod(v*2,1)<>0 or (p_market='spread' and v not between -100 and 100) or (p_market='total' and v not between 0 and 200)
      or observed is null or quoted is null or not isfinite(observed) or not isfinite(quoted)
      or observed>quoted or quoted<>captured or observed<captured-interval '5 minutes' then return null; end if;
    if p_market='spread' then
      if jsonb_typeof(q#>'{outcomes,home,line}') is distinct from 'number' or jsonb_typeof(q#>'{outcomes,away,line}') is distinct from 'number'
        or (q#>>'{outcomes,home,line}')::numeric<>v or (q#>>'{outcomes,away,line}')::numeric<>-v then return null; end if;
    else
      if jsonb_typeof(q#>'{outcomes,over,line}') is distinct from 'number' or jsonb_typeof(q#>'{outcomes,under,line}') is distinct from 'number'
        or (q#>>'{outcomes,over,line}')::numeric<>v or (q#>>'{outcomes,under,line}')::numeric<>v then return null; end if;
    end if;
    receipts:=receipts||jsonb_build_array(jsonb_build_object('book',q->>'book','value',v,'observedAt',observed,'collectedAt',quoted));
    vals:=array_append(vals,v); books:=array_append(books,q->>'book');
    first_quote:=least(first_quote,observed); last_quote:=greatest(last_quote,observed);
  end loop;
  select array_agg(x order by x) into vals from unnest(vals) x; midpoint:=vals[2];
  if (select count(*) from unnest(vals) x where abs(x-midpoint)<=5)<3 or last_quote-first_quote>interval '5 minutes' then return null; end if;
  return jsonb_build_object('value',midpoint,'source','The Odds API · 3-book median','sourceUrl','https://the-odds-api.com/','bookCount',3,
    'capturedAt',captured,'observedAt',first_quote,'officialVerified',false,
    'quotes',(select jsonb_agg(x order by x->>'book') from jsonb_array_elements(receipts) x));
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then return null;
end $$;

create or replace function public.gtl_book_quotes_from_snapshot(p_payload jsonb,p_game jsonb,p_market text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare line jsonb; e jsonb; r jsonb; q jsonb; sides text[]; o jsonb; prices jsonb; books jsonb:='[]';
begin
  line:=public.gtl_line_from_snapshot(p_payload,p_game,p_market);
  if line is null then return null; end if;
  -- gtl_line_from_snapshot found exactly one entry for this game, with exactly three distinct named books.
  select x into e from jsonb_array_elements(p_payload->'games') x where x->>'gameId'=p_game->>'id';
  sides:=case when p_market='spread' then array['home','away'] else array['over','under'] end;
  for r in select x from jsonb_array_elements(line->'quotes') x order by x->>'book' loop
    select x into q from jsonb_array_elements(e#>array['markets',p_market,'quotes']) x where x->>'book'=r->>'book';
    prices:='{}';
    for i in 1..2 loop
      o:=q#>array['outcomes',sides[i],'odds'];
      prices:=prices||jsonb_build_object(sides[i],case when jsonb_typeof(o)='number' and o::numeric=trunc(o::numeric)
        and abs(o::numeric) between 100 and 10000 then to_jsonb(o::numeric::integer) end);
    end loop;
    books:=books||jsonb_build_array(jsonb_build_object('book',r->>'book',
      'source',case r->>'book' when 'draftkings' then 'DraftKings' when 'fanduel' then 'FanDuel' when 'betmgm' then 'BetMGM' when 'betrivers' then 'BetRivers' end,
      'line',r->'value','prices',prices,'observedAt',r->'observedAt'));
  end loop;
  return books;
exception when invalid_text_representation or numeric_value_out_of_range then return null;
end $$;
