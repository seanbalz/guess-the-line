-- M-06 lines_read: the lines readers (redesign build plan, stage 23; D-39, D-36, D-31, D-23, D-27).
--
-- Sean, October 14, 2026 (D-39): "once you make a pick that game is revealed. you can change bets up until game start but you
-- cannot guess the spread or total again once youve locked in that games guess". Locking in a game's Spread or Total guess
-- opens, for that player, that game's line for that market; the game's other market and the other games stay hidden. A game's
-- kickoff opens it for everyone (D-31). A sit-out (D-23), and from M-03 a skip or "See picks now" (D-36, which write the same
-- gtl_weekly_optouts rows), opens the rest of the week for that market.
--
-- These are the only readers of current lines for the new app. Every cell is gated per game and market by M-01's
-- gtl_markets_visible / gtl_guess_revealed, which ask gtl_guess_locked_in: when M-02 (stage 18) records per-game lock-ins and
-- replaces that one body, a lock-in opens exactly that game and market here, with no change to this file. A closed cell is
-- { visible: false } and carries no other key: no value, time, book, price, movement or kickoff line, and nothing about it is
-- computed. Lines come only from gtl_line_from_snapshot (the D-16/D-27 three-book validator, unchanged); a reply never carries
-- a raw payload, a provider id, a provider event id or a snapshot id.
--
-- What this file adds (four service-only, security-invoker functions):
-- * gtl_book_quotes_from_snapshot(payload, game, market): the three named books of one stored snapshot, each with its line, its
--   two American prices and its observation time, for a game and market whose line qualifies in that snapshot
--   (gtl_line_from_snapshot), else null. Prices are read from the books that validator accepted, and only when each is a whole
--   number from 100 to 10000 either way; anything else is null.
-- * gtl_kickoff_line(season, week, game, market): the newest qualifying line captured in the 12 hours before that game's
--   kickoff, from the snapshots already stored, else null. It never starts a collection.
-- * gtl_read_lines(viewer, season, week, now): every game of a published week (the newest when season and week are null), in
--   kickoff order, with teams, kickoff, started and final (the D-26 settlement or a commissioner-reported final, as History
--   shows it), and per market the gate and, when open, the newest qualifying line stored by now (value, capturedAt, observedAt,
--   bookCount, source). The viewer's own row for each game and market (mine): the guess (a draft too), whether it is locked
--   in, a sit-out, the Late marker, the line at the guess only once that game and market is open to the viewer (as History,
--   M-01), and points from kickoff for a submitted eligible ballot (gtl_ballot_pick_scores, the one scoring path).
-- * gtl_read_game_lines(viewer, season, week, game, now): one game; per open market the newest qualifying line, its named books
--   with prices (from the same snapshot), movement (every qualifying line stored by now, the newest 48, oldest first) and, from
--   kickoff, the kickoff line.
--
-- Both readers refuse a viewer who is not a community member (GTL_COMMUNITY_MEMBER) and a malformed request
-- (GTL_LINES_INVALID: season without week, an unknown week or game for the game reader). cloud/lines.mjs maps both codes and
-- is deployed before this file is applied (Gate D), and it drops every key under a closed market even if SQL sent one.
--
-- What does not change: every table, row, trigger, grant on a table and existing function, so every score, reference, reveal
-- and old-app reply is exactly as before (Week 5: Sean 95.8, Steven 91.4, Ben 37.6). Function-only and rerunnable: create or
-- replace with new names and the grants restated. No rollback file: nothing is replaced (supabase/rollback/README.md). The off
-- switch is gtl-api's GTL_FEATURE_OFF=lines (cloud/feature-off.mjs): both routes refuse and nothing is read; a database-side
-- stop, with Sean's OK, is revoking the service role's execute grant on the two readers.
--
-- Apply (Gate M; build plan sections 5 and 6): after M-01 and M-02 are applied and stage 20 is live, and after the gtl-api
-- deploy that maps this file's codes. Before M-02, a guess in a submitted ballot can still be edited until the deadline (D-16),
-- so opening its line on a send would let a player match the line.

-- The three named books of one stored snapshot for a game and market whose line qualifies there, each with its two prices.
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
      'source',case r->>'book' when 'draftkings' then 'DraftKings' when 'fanduel' then 'FanDuel' when 'betmgm' then 'BetMGM' end,
      'line',r->'value','prices',prices,'observedAt',r->'observedAt'));
  end loop;
  return books;
exception when invalid_text_representation or numeric_value_out_of_range then return null;
end $$;

-- The newest qualifying line captured in the 12 hours before a game's kickoff, from stored snapshots only; null when none.
create or replace function public.gtl_kickoff_line(p_season integer,p_week integer,p_game text,p_market text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare sig jsonb; game jsonb; kickoff timestamptz; snap record; line jsonb;
begin
  if p_market is null or p_market not in ('spread','total') or p_game is null then return null; end if;
  select signature into sig from public.gtl_weekly_slates where season=p_season and week=p_week;
  game:=public.gtl_slate_game(p_season,p_week,sig,p_game);
  if game is null then return null; end if;
  kickoff:=(game->>'kickoff')::timestamptz;
  -- A snapshot is stored after it is captured, so one captured inside the window was stored inside it or later.
  for snap in select id,payload from public.gtl_market_snapshots where season=p_season and week=p_week and slate_signature=sig
      and created_at>=kickoff-interval '12 hours' order by created_at desc,id desc loop
    line:=public.gtl_line_from_snapshot(snap.payload,game,p_market);
    continue when line is null or (line->>'capturedAt')::timestamptz<kickoff-interval '12 hours';
    return jsonb_build_object('value',line->'value','capturedAt',line->'capturedAt','observedAt',line->'observedAt',
      'bookCount',line->'bookCount','source',line->'source','sourceUrl',line->'sourceUrl','snapshotId',snap.id);
  end loop;
  return null;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return null;
end $$;

-- Every game of a published week with its gated lines, the final, and the viewer's own rows.
create or replace function public.gtl_read_lines(p_user uuid,p_season integer default null,p_week integer default null,p_now timestamptz default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s integer; w integer; sig jsonb; now_at timestamptz:=coalesce(p_now,clock_timestamp()); gate jsonb; results jsonb;
  g jsonb; game jsonb; kickoff timestamptz; market text; want_mode text; shown boolean; snap record; line jsonb; cells jsonb; mine jsonb;
  own jsonb:='{}'; b record; ps record; submitted boolean; eligible boolean; ref jsonb; games jsonb:='[]';
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if (p_season is null)<>(p_week is null) then raise exception 'GTL_LINES_INVALID'; end if;
  if p_season is null then select z.season,z.week into s,w from public.gtl_weekly_slates z order by z.season desc,z.week desc limit 1;
  else s:=p_season; w:=p_week; end if;
  select signature into sig from public.gtl_weekly_slates where season=s and week=w;
  if sig is null then
    return jsonb_build_object('viewer',p_user,'season',s,'week',w,'now',now_at,'published',false,'deadline',null,'games','[]'::jsonb);
  end if;
  -- D-39: this viewer's gate for every game and market of the week (kickoff, own lock-in, own sit-out).
  gate:=public.gtl_markets_visible(p_user,s,w,now_at);
  -- Finals, as History shows them: the latest D-26 settlement version per game; a commissioner-reported final fills a game
  -- the settlement ledger has not recorded. Each is labelled.
  results:=coalesce((select jsonb_object_agg(q.game_id,q.r) from (
    select distinct on (v.game_id) v.game_id,jsonb_build_object('status',v.status,'home',v.home,'away',v.away,'source',v.source,'sourceUrl',v.source_url,
      'observedAt',v.observed_at,'origin','settlement') r
    from public.gtl_virtual_units_settlements v where v.season=s and v.week=w order by v.game_id,v.version desc) q),'{}');
  results:=coalesce((select jsonb_object_agg(q.game_id,jsonb_build_object('status',q.result->>'status','home',q.result->'home','away',q.result->'away',
      'source',q.result->'source','sourceUrl',q.result->'sourceURL','observedAt',q.result->'observedAt','origin','commissioner_reported'))
    from (select distinct on (e.game_id) e.game_id,e.result from public.gtl_reviewed_result_events e where e.season=s and e.week=w order by e.game_id,e.version desc) q
    where not results ? q.game_id and q.result->>'status'='final'),'{}')||results;
  -- The viewer's own rows (D-23: never redacted from their owner): every guess, a draft too, from the one scoring path.
  for b in select x.* from public.gtl_weekly_ballots x where x.user_id=p_user and x.season=s and x.week=w and x.mode in ('guess_spread','guess_total') loop
    market:=case when b.mode='guess_spread' then 'spread' else 'total' end;
    submitted:=coalesce(b.ballot->>'submittedAt','')<>'';
    eligible:=public.gtl_ballot_eligible(b.user_id,b.season,b.week,b.mode,b.origin_practice);
    for ps in select * from public.gtl_ballot_pick_scores(b.season,b.week,b.mode,b.ballot,b.audit) loop
      own:=own||jsonb_build_object(market||':'||ps.game_id,jsonb_build_object('guess',ps.guess,'reference',ps.reference,
        'points',case when eligible and submitted and ps.kickoff<=now_at then ps.points end,'late',public.gtl_ballot_late(b.ballot)));
    end loop;
  end loop;
  for g in select x from jsonb_array_elements(sig->'games') x order by (x->>'kickoff')::numeric,x->>'id' loop
    game:=public.gtl_slate_game(s,w,sig,g->>'id');
    kickoff:=to_timestamp((g->>'kickoff')::numeric);
    cells:='{}'; mine:=jsonb_build_object('userId',p_user);
    foreach market in array array['spread','total'] loop
      want_mode:=case when market='spread' then 'guess_spread' else 'guess_total' end;
      shown:=coalesce((gate->(g->>'id')->>market)::boolean,false);
      if shown then
        -- The newest stored snapshot (by now) whose line for this game and market qualifies; a snapshot that does not is skipped.
        line:=null;
        if game is not null then
          for snap in select payload from public.gtl_market_snapshots where season=s and week=w and slate_signature=sig and created_at<=now_at
              order by created_at desc,id desc loop
            line:=public.gtl_line_from_snapshot(snap.payload,game,market);
            exit when line is not null;
          end loop;
        end if;
        cells:=cells||jsonb_build_object(market,jsonb_build_object('visible',true,'value',line->'value','capturedAt',line->'capturedAt',
          'observedAt',line->'observedAt','bookCount',line->'bookCount','source',line->'source','sourceUrl',line->'sourceUrl'));
      else
        cells:=cells||jsonb_build_object(market,jsonb_build_object('visible',false));
      end if;
      ref:=own->(market||':'||(g->>'id'))->'reference';
      mine:=mine||jsonb_build_object(market,jsonb_build_object(
        'guess',own->(market||':'||(g->>'id'))->'guess',
        'lockedIn',public.gtl_guess_locked_in(p_user,s,w,want_mode,g->>'id'),
        'satOut',exists(select 1 from public.gtl_weekly_optouts o where o.user_id=p_user and o.season=s and o.week=w and o.mode=want_mode),
        'late',own->(market||':'||(g->>'id'))->'late',
        'points',own->(market||':'||(g->>'id'))->'points',
        -- The line at the guess only once this game and market is open to the viewer (an unlocked draft's line stays hidden).
        'lineAtGuess',case when shown and jsonb_typeof(ref)='object' then jsonb_build_object('value',ref->'value','status',ref->'status',
          'basis',ref->'basis','label',ref->'label','capturedAt',ref->'capturedAt','observedAt',ref->'observedAt') end));
    end loop;
    games:=games||jsonb_build_array(jsonb_build_object('id',g->>'id','awayCode',g->>'away','homeCode',g->>'home',
      'away',coalesce(game->>'away',g->>'away'),'home',coalesce(game->>'home',g->>'home'),'kickoff',kickoff,'started',now_at>=kickoff,
      'final',results->(g->>'id'),'spread',cells->'spread','total',cells->'total','mine',mine));
  end loop;
  return jsonb_build_object('viewer',p_user,'season',s,'week',w,'now',now_at,'published',true,
    'deadline',to_timestamp((sig->>'deadline')::double precision),'games',games);
end $$;

-- One game's lines in full, per open market: the newest qualifying line, its named books with prices, movement, the kickoff line.
create or replace function public.gtl_read_game_lines(p_user uuid,p_season integer default null,p_week integer default null,p_game text default null,p_now timestamptz default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s integer; w integer; sig jsonb; now_at timestamptz:=coalesce(p_now,clock_timestamp()); g jsonb; game jsonb; kickoff timestamptz;
  market text; snap record; line jsonb; cur_line jsonb; books jsonb; movement jsonb; n integer; ko jsonb; result jsonb;
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if (p_season is null)<>(p_week is null) or p_game is null then raise exception 'GTL_LINES_INVALID'; end if;
  if p_season is null then select z.season,z.week into s,w from public.gtl_weekly_slates z order by z.season desc,z.week desc limit 1;
  else s:=p_season; w:=p_week; end if;
  select signature into sig from public.gtl_weekly_slates where season=s and week=w;
  select x into g from jsonb_array_elements(sig->'games') x where x->>'id'=p_game;
  if g is null then raise exception 'GTL_LINES_INVALID'; end if;
  game:=public.gtl_slate_game(s,w,sig,p_game);
  kickoff:=to_timestamp((g->>'kickoff')::numeric);
  result:=jsonb_build_object('viewer',p_user,'season',s,'week',w,'now',now_at,
    'game',jsonb_build_object('id',p_game,'awayCode',g->>'away','homeCode',g->>'home','away',coalesce(game->>'away',g->>'away'),
      'home',coalesce(game->>'home',g->>'home'),'kickoff',kickoff,'started',now_at>=kickoff));
  foreach market in array array['spread','total'] loop
    -- D-39: the gate for this game and market (kickoff, the viewer's own lock-in, the viewer's sit-out). Closed: nothing else.
    if not public.gtl_guess_revealed(p_user,s,w,case when market='spread' then 'guess_spread' else 'guess_total' end,p_game,now_at) then
      result:=result||jsonb_build_object(market,jsonb_build_object('visible',false));
      continue;
    end if;
    cur_line:=null; books:=null; movement:='[]'; n:=0;
    if game is not null then
      for snap in select payload from public.gtl_market_snapshots where season=s and week=w and slate_signature=sig and created_at<=now_at
          order by created_at desc,id desc loop
        line:=public.gtl_line_from_snapshot(snap.payload,game,market);
        continue when line is null;
        if cur_line is null then
          cur_line:=jsonb_build_object('value',line->'value','capturedAt',line->'capturedAt','observedAt',line->'observedAt',
            'bookCount',line->'bookCount','source',line->'source','sourceUrl',line->'sourceUrl');
          books:=public.gtl_book_quotes_from_snapshot(snap.payload,game,market);
        end if;
        movement:=jsonb_build_array(jsonb_build_object('value',line->'value','capturedAt',line->'capturedAt'))||movement;
        n:=n+1;
        exit when n>=48;
      end loop;
    end if;
    ko:=case when now_at>=kickoff then public.gtl_kickoff_line(s,w,p_game,market) end;
    result:=result||jsonb_build_object(market,jsonb_build_object('visible',true,'line',cur_line,'books',coalesce(books,'[]'::jsonb),
      'movement',movement,'kickoffLine',case when ko is not null then ko-'snapshotId' end));
  end loop;
  return result;
end $$;

-- Service-only, like every gtl_ RPC: gtl-api calls them with the signed-in viewer.
revoke all on function public.gtl_book_quotes_from_snapshot(jsonb,jsonb,text),public.gtl_kickoff_line(integer,integer,text,text),
  public.gtl_read_lines(uuid,integer,integer,timestamptz),public.gtl_read_game_lines(uuid,integer,integer,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.gtl_book_quotes_from_snapshot(jsonb,jsonb,text),public.gtl_kickoff_line(integer,integer,text,text),
  public.gtl_read_lines(uuid,integer,integer,timestamptz),public.gtl_read_game_lines(uuid,integer,integer,text,timestamptz)
  to service_role;
