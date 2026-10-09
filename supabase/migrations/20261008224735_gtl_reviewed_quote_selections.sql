-- Reviewed named-book receipts; local candidate only, no live mutation.
create or replace function public.gtl_save_weekly_selection(p_user uuid,p_league text,p_revision bigint,p_selection jsonb) returns bigint
language plpgsql security invoker set search_path='' as $$
declare c jsonb; s integer; w integer; rev bigint; g jsonb; market text; side text; v numeric; odds numeric; quote timestamptz; stamp timestamptz; value jsonb; event jsonb; receipt jsonb; snap public.gtl_market_snapshots; qgame jsonb; q jsonb; paired jsonb; observed timestamptz; collected timestamptz; book text; source_name text;
begin
  c:=public.gtl_weekly_context(p_user,p_league); s:=(c->>'season')::integer; w:=(c->>'week')::integer;
  if p_selection is null or jsonb_typeof(p_selection)<>'object' or exists(select 1 from jsonb_object_keys(p_selection) k where k not in ('gameId','market','side','line','odds','source','quotedAt','quoteReceipt')) then raise exception 'GTL_SELECTION_INVALID'; end if;
  select x into g from jsonb_array_elements(c#>'{state,games}') x where x->>'id'=p_selection->>'gameId';
  market:=p_selection->>'market'; side:=p_selection->>'side';
  if g is null or market is null or side is null or market not in ('spread','total') or (market='spread' and side not in ('home','away')) or (market='total' and side not in ('over','under')) then raise exception 'GTL_SELECTION_INVALID'; end if;
  insert into public.gtl_weekly_versions(user_id,season,week) values(p_user,s,w) on conflict do nothing;
  select revision into rev from public.gtl_weekly_versions where user_id=p_user and season=s and week=w for update;
  if p_revision is null or p_revision<>rev then raise exception 'GTL_WEEKLY_CONFLICT'; end if;
  if exists(select 1 from public.gtl_weekly_selections where user_id=p_user and season=s and week=w and game_id=g->>'id') then raise exception 'GTL_SELECTION_LOCKED'; end if;
  if not exists(select 1 from public.gtl_weekly_ballots where user_id=p_user and season=s and week=w and mode=case when market='total' then 'guess_total' else 'guess_spread' end and coalesce(ballot->>'submittedAt','')<>'') then raise exception 'GTL_MATCHING_BALLOT_REQUIRED'; end if;
  stamp:=clock_timestamp();
  if stamp >= (g->>'kickoff')::timestamptz then raise exception 'GTL_SELECTION_CLOSED'; end if;
  if jsonb_typeof(p_selection->'line') is distinct from 'number' or jsonb_typeof(p_selection->'odds') is distinct from 'number' or jsonb_typeof(p_selection->'source') is distinct from 'string' or jsonb_typeof(p_selection->'quotedAt') is distinct from 'string' then raise exception 'GTL_SELECTION_INVALID'; end if;
  v:=(p_selection->>'line')::numeric; odds:=(p_selection->>'odds')::numeric;
  if v*2<>trunc(v*2) or (market='spread' and (v < -100 or v > 100)) or (market='total' and (v < 0 or v > 200)) or odds<>trunc(odds) or abs(odds)<100 or abs(odds)>10000 or length(btrim(p_selection->>'source'))<2 or length(p_selection->>'source')>120 then raise exception 'GTL_SELECTION_INVALID'; end if;
  begin quote:=(p_selection->>'quotedAt')::timestamptz; exception when others then raise exception 'GTL_SELECTION_INVALID'; end;
  if quote > stamp or quote < stamp-interval '6 hours' or quote >= (g->>'kickoff')::timestamptz then raise exception 'GTL_QUOTE_STALE'; end if;
  -- Optional provider-assisted selection. Resolve immutable source bytes inside
  -- the same transaction that locks the user's canonical weekly entry.
  if p_selection ? 'quoteReceipt' then
    receipt:=p_selection->'quoteReceipt'; book:=receipt->>'book';
    if jsonb_typeof(receipt) is distinct from 'object' or book is null or book not in ('draftkings','fanduel','betmgm')
      or receipt->>'snapshotId' is null or receipt->>'snapshotId' !~ '^[0-9a-fA-F-]{36}$'
      then raise exception 'GTL_QUOTE_REVIEW_REQUIRED'; end if;
    select * into snap from public.gtl_market_snapshots where season=s and week=w and slate_signature=public.gtl_weekly_slate(c->'state') order by created_at desc,id desc limit 1;
    if snap.id is null or snap.id::text<>receipt->>'snapshotId' or snap.created_at>stamp then raise exception 'GTL_QUOTE_REVIEW_REQUIRED'; end if;
    if (select count(*) from jsonb_array_elements(snap.payload->'games') x where x->>'gameId'=g->>'id')<>1 then raise exception 'GTL_QUOTE_REVIEW_REQUIRED'; end if;
    select x into qgame from jsonb_array_elements(snap.payload->'games') x where x->>'gameId'=g->>'id';
    if qgame->>'home' is distinct from g->>'home' or qgame->>'away' is distinct from g->>'away'
      or (qgame->>'kickoff')::timestamptz is distinct from (g->>'kickoff')::timestamptz
      or qgame->>'matchStatus' is distinct from 'matched' then raise exception 'GTL_QUOTE_REVIEW_REQUIRED'; end if;
    if (select count(*) from jsonb_array_elements(qgame#>array['markets',market,'quotes']) x where x->>'book'=book)<>1 then raise exception 'GTL_QUOTE_REVIEW_REQUIRED'; end if;
    select x into q from jsonb_array_elements(qgame#>array['markets',market,'quotes']) x where x->>'book'=book;
    if q is null or q->>'provider' is distinct from 'the-odds-api' or q->>'market' is distinct from market
      or coalesce(qgame->>'providerEventId','')='' or q->>'providerEventId' is distinct from qgame->>'providerEventId'
      or q->>'providerEventId' is distinct from receipt->>'providerEventId' then raise exception 'GTL_QUOTE_REVIEW_REQUIRED'; end if;
    begin observed:=(q->>'providerObservedAt')::timestamptz; collected:=(q->>'collectedAt')::timestamptz;
      exception when others then raise exception 'GTL_QUOTE_REVIEW_REQUIRED'; end;
    if observed is null or collected is null or observed>collected or collected>snap.created_at or observed<stamp-interval '5 minutes'
      or collected>stamp or observed>stamp or quote<>observed or observed>=(g->>'kickoff')::timestamptz
      then raise exception 'GTL_QUOTE_REVIEW_REQUIRED'; end if;
    for paired in select q#>array['outcomes',case when market='spread' then 'home' else 'over' end]
      union all select q#>array['outcomes',case when market='spread' then 'away' else 'under' end] loop
      if paired is null or jsonb_typeof(paired->'line') is distinct from 'number' or jsonb_typeof(paired->'odds') is distinct from 'number'
        then raise exception 'GTL_QUOTE_REVIEW_REQUIRED'; end if;
      if (paired->>'line')::numeric*2<>trunc((paired->>'line')::numeric*2)
        or (market='spread' and abs((paired->>'line')::numeric)>100)
        or (market='total' and ((paired->>'line')::numeric<0 or (paired->>'line')::numeric>200))
        or (paired->>'odds')::numeric<>trunc((paired->>'odds')::numeric) or abs((paired->>'odds')::numeric)<100 or abs((paired->>'odds')::numeric)>10000
        then raise exception 'GTL_QUOTE_REVIEW_REQUIRED'; end if;
    end loop;
    if (market='spread' and ((q#>>'{outcomes,home,line}')::numeric<>-(q#>>'{outcomes,away,line}')::numeric or (q#>'{outcomes,home,line}') is distinct from q->'value'))
      or (market='total' and ((q#>'{outcomes,over,line}') is distinct from q#>'{outcomes,under,line}' or (q#>'{outcomes,over,line}') is distinct from q->'value'))
      then raise exception 'GTL_QUOTE_REVIEW_REQUIRED'; end if;
    source_name:=case book when 'draftkings' then 'DraftKings' when 'fanduel' then 'FanDuel' else 'BetMGM' end;
    if (q#>array['outcomes',side,'line']) is distinct from p_selection->'line' or (q#>array['outcomes',side,'odds']) is distinct from p_selection->'odds'
      or p_selection->>'source' is distinct from source_name or receipt->>'gameId' is distinct from g->>'id'
      or receipt->>'market' is distinct from market or receipt->>'side' is distinct from side
      or receipt->'line' is distinct from p_selection->'line' or receipt->'odds' is distinct from p_selection->'odds'
      then raise exception 'GTL_QUOTE_REVIEW_REQUIRED'; end if;
    -- Store only rebuilt evidence; discard client metadata, selectedAt and flags.
    receipt:=jsonb_build_object('snapshotId',snap.id,'provider','the-odds-api','providerEventId',q->>'providerEventId','gameId',g->>'id',
      'book',book,'source',source_name,'market',market,'side',side,'line',v,'odds',odds,'quotedAt',observed,'collectedAt',collected,
      'snapshotCapturedAt',snap.created_at,'timeBasis','provider_market_last_update','tradability','not_confirmed');
  end if;
  value:=(p_selection-'quoteReceipt')||jsonb_build_object('id',gen_random_uuid(),'source',btrim(p_selection->>'source'),'quotedAt',quote,'selectedAt',stamp,'enteredAt',stamp,'verification',case when receipt is null then 'Manually entered; not independently verified' else 'Recorded provider quote; tradability not confirmed' end);
  if receipt is not null then value:=value||jsonb_build_object('quoteReceipt',receipt); end if;
  event:=jsonb_build_object('id',gen_random_uuid(),'player',c->>'playerId','mode','betting_challenge','type','selection_recorded','timestamp',stamp,'after',value);
  insert into public.gtl_weekly_selections(user_id,season,week,game_id,selection,audit,origin_practice,provenance)
    values(p_user,s,w,g->>'id',value,jsonb_build_array(event),(c->>'practice')::boolean or (select origin_practice from public.gtl_weekly_ballots where user_id=p_user and season=s and week=w and mode=case when market='total' then 'guess_total' else 'guess_spread' end),jsonb_build_array(jsonb_build_object('leagueId',p_league,'playerId',c->>'playerId')));
  update public.gtl_weekly_versions set revision=revision+1 where user_id=p_user and season=s and week=w;
  return rev+1;
end $$;

revoke all on function public.gtl_save_weekly_selection(uuid,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.gtl_save_weekly_selection(uuid,text,bigint,jsonb) to service_role;
