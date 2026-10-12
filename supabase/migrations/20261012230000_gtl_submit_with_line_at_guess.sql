-- October 12, 2026 ruling (Sean, product owner): "they can submit their guesses whenever. The spread when they
-- guessed is the spread that their points total will be compared against", and "all historical guesses for all
-- individuals should be saved in their accounts". Recorded as D-27 in docs/DECISIONS.md.
--
-- What changes, for new saves only:
-- * No submission or edit before the deadline is refused because of quote-refresh limits. The submission path
--   still tries one fresh collection inside the free limits (cooldown, daily cap, budget guard, lease, provider),
--   but the save no longer depends on it: cloud/submission-odds.mjs commits whatever happened.
-- * Each changed guess saves, as its scoring reference, the newest qualifying stored line for that game and market
--   at the save instant (server-selected from gtl_market_snapshots), with its observedAt and ageSeconds
--   (savedAt - observedAt). The five-minute freshness rule no longer decides whether a reference is scored.
-- * When no qualifying line is stored yet (for example right after the Monday open), the guess saves with a
--   'pending' reference. The first qualifying line collected after the save becomes its reference, labelled
--   basis 'first_line_after_submission': stored after the save, collected after it, every book observation at
--   or after it, and collected before that game's kickoff. A line observed before the save is never used for a
--   pending guess. That resolution runs inside gtl_finish_odds_collection and
--   gtl_finish_submission_odds_collection, in the transaction that stores the line, so every reader (community
--   leaderboard SQL, group engine, Solo, journal context) sees one saved value.
-- * The fresh-submission trigger still verifies every changed reference against its stored snapshot, still
--   enforces the deadline, the full ballot and (now explicitly) kickoff locks, and accepts exactly one other
--   kind of change: a pending reference replaced by its server-computed first line.
--
-- What does not change: the deadline, kickoff locks, the full-ballot rule, D-23 and D-18. Existing rows are never
-- rewritten: stored 'stale' and 'unavailable' references keep value null and stay unscored, and stored
-- 'available' references keep their bytes. The collection constants of 20261012213000 are unchanged.
--
-- Also folded in from the PR #51 review: gtl_claim_odds_refresh and gtl_read_odds_schedule now share one slate
-- resolver (gtl_odds_schedule_slate), so a schedule row that lags the newest published week reads as
-- slate_changed in both places instead of 'active' in one and skipped in the other.
--
-- Function-only, create or replace, idempotent. No table, row, grant on a table or hosted setting is changed.

-- The three-book line one stored snapshot holds for one game and market, validated exactly as the D-16/D-17
-- reference validator did (provider, event, kickoff, three distinct books, paired outcomes, provider observations
-- at most five minutes before collection and within five minutes of each other, values within five points of the
-- median, collected before kickoff). It knows nothing about a save instant. Null when the line does not qualify.
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
    if q->>'book' is null or q->>'book' not in ('draftkings','fanduel','betmgm') or q->>'book'=any(books)
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

-- Same signature and callers as before (saves, preflight, trigger). A stored line collected at or before the save
-- is the line at the guess whatever its age: no 'stale' status and no null value for age any more. ageSeconds is
-- savedAt minus the earliest book observation. Null only when the line does not qualify, was collected after the
-- save, or the game has kicked off.
create or replace function public.gtl_submission_reference(p_payload jsonb,p_game jsonb,p_market text,p_saved timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare line jsonb;
begin
  if p_saved is null or not isfinite(p_saved) then return null; end if;
  line:=public.gtl_line_from_snapshot(p_payload,p_game,p_market);
  if line is null or (line->>'capturedAt')::timestamptz>p_saved or p_saved>=(p_game->>'kickoff')::timestamptz then return null; end if;
  return line||jsonb_build_object('status','available','basis','line_at_guess','savedAt',p_saved,
    'ageSeconds',floor(extract(epoch from p_saved-(line->>'observedAt')::timestamptz))::bigint,'reason',null);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then return null;
end $$;

-- The one shape a guess saved before any qualifying line is stored. Unscored (value null) until resolved.
create or replace function public.gtl_pending_reference(p_saved timestamptz)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('status','pending','basis','first_line_after_submission','value',null,'savedAt',p_saved,
    'source',null,'sourceUrl',null,'snapshotId',null,'capturedAt',null,'observedAt',null,'ageSeconds',null,'officialVerified',false,
    'reason','No line was stored yet when this guess was saved. The first line collected after it becomes its reference.')
$$;

-- The reference a changed guess saves: the newest qualifying stored line for this game and market at p_saved,
-- with its snapshotId, else the pending reference. Null only at or after this game's kickoff (callers raise
-- GTL_PREDICTION_CLOSED first). The scan has no row limit: it stops at the first qualifying snapshot.
create or replace function public.gtl_reference_at_save(p_season integer,p_week integer,p_signature jsonb,p_game jsonb,p_market text,p_saved timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare snap record; ref jsonb;
begin
  if p_saved is null or not isfinite(p_saved) or p_game is null or p_saved>=(p_game->>'kickoff')::timestamptz then return null; end if;
  for snap in select id,payload from public.gtl_market_snapshots where season=p_season and week=p_week and slate_signature=p_signature
      and created_at<=p_saved order by created_at desc,id desc loop
    ref:=public.gtl_submission_reference(snap.payload,p_game,p_market,p_saved);
    if ref is not null then return ref||jsonb_build_object('snapshotId',snap.id); end if;
  end loop;
  return public.gtl_pending_reference(p_saved);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return null;
end $$;

-- The resolved value of one pending reference, or null while no qualifying line exists yet. Deterministic for a
-- given set of stored snapshots (they are insert-only), so the trigger can recompute it exactly. The reference is
-- the first qualifying line, in storage order, that was stored after the save, collected after it and observed
-- (every book) at or after it, and collected before this game's kickoff (gtl_line_from_snapshot). A line observed
-- before the save is never used, also when it was stored after it (a collection that committed late) or collected
-- after it (a book quote older than the save). ageSeconds is savedAt minus observedAt, so zero or negative.
create or replace function public.gtl_resolve_pending_reference(p_season integer,p_week integer,p_mode text,p_game_id text,p_pending jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare sig jsonb; g jsonb; game jsonb; market text; saved timestamptz; line jsonb; snap record;
begin
  if p_mode is null or p_mode not in ('guess_spread','guess_total') or jsonb_typeof(p_pending) is distinct from 'object'
    or p_pending->>'status' is distinct from 'pending' or p_pending->'value' is distinct from 'null'::jsonb then return null; end if;
  saved:=(p_pending->>'savedAt')::timestamptz;
  if saved is null or not isfinite(saved) then return null; end if;
  market:=case when p_mode='guess_total' then 'total' else 'spread' end;
  select signature into sig from public.gtl_weekly_slates where season=p_season and week=p_week;
  select x into g from jsonb_array_elements(sig->'games') x where x->>'id'=p_game_id;
  if g is null then return null; end if;
  select x into game from public.gtl_schedule_templates t cross join lateral jsonb_array_elements(t.games) x
    where t.season=p_season and t.week=p_week and x->>'id'=p_game_id and x->>'homeCode'=g->>'home' and x->>'awayCode'=g->>'away'
      and extract(epoch from (x->>'kickoff')::timestamptz)=(g->>'kickoff')::numeric order by t.created_at desc,t.id limit 1;
  if game is null or saved>=(game->>'kickoff')::timestamptz then return null; end if;
  for snap in select id,payload from public.gtl_market_snapshots where season=p_season and week=p_week and slate_signature=sig
      and created_at>saved order by created_at,id loop
    line:=public.gtl_line_from_snapshot(snap.payload,game,market);
    continue when line is null or (line->>'capturedAt')::timestamptz<=saved or (line->>'observedAt')::timestamptz<saved;
    return line||jsonb_build_object('status','available','basis','first_line_after_submission','savedAt',saved,
      'ageSeconds',floor(extract(epoch from saved-(line->>'observedAt')::timestamptz))::bigint,'reason',null,'snapshotId',snap.id);
  end loop;
  return null;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return null;
end $$;

-- Called by both finish RPCs right after a snapshot is stored, inside their transaction (they hold the shared
-- budget lock, so no other snapshot can commit meanwhile). Replaces each resolvable pending reference of the week
-- and appends one 'reference_resolved' audit event per ballot. Picks, submittedAt, updatedAt, the weekly revision
-- and every other reference stay as stored. A row that cannot be updated stays pending and is retried by the next
-- collection with the same deterministic rule; an operator may also call this function directly (idempotent).
-- Lock order: budget, then ballot rows. Saves take weekly_versions, then their own ballot row, never the budget.
create or replace function public.gtl_resolve_pending_references(p_season integer,p_week integer) returns integer
language plpgsql security invoker set search_path='' as $$
declare b public.gtl_weekly_ballots; r record; refs jsonb; resolved jsonb; changed jsonb; n integer:=0; stamp timestamptz;
begin
  for b in select * from public.gtl_weekly_ballots x where x.season=p_season and x.week=p_week
      and coalesce(x.ballot->>'submittedAt','')<>'' and jsonb_typeof(x.ballot->'scoringReferences')='object'
      and exists(select 1 from jsonb_each(x.ballot->'scoringReferences') e where e.value->>'status'='pending')
      order by x.user_id,x.mode for update loop
    refs:=b.ballot->'scoringReferences'; changed:='[]';
    for r in select key,value from jsonb_each(b.ballot->'scoringReferences') where value->>'status'='pending' order by key loop
      resolved:=public.gtl_resolve_pending_reference(b.season,b.week,b.mode,r.key,r.value);
      if resolved is not null then refs:=refs||jsonb_build_object(r.key,resolved); changed:=changed||to_jsonb(r.key); end if;
    end loop;
    continue when jsonb_array_length(changed)=0;
    stamp:=clock_timestamp();
    begin
      update public.gtl_weekly_ballots set ballot=jsonb_set(ballot,'{scoringReferences}',refs),
        audit=audit||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'player','u_'||replace(b.user_id::text,'-',''),'mode',b.mode,
          'type','reference_resolved','timestamp',stamp,'changedGameIds',changed,
          'beforeScoringReferences',b.ballot->'scoringReferences','afterScoringReferences',refs))
        where user_id=b.user_id and season=b.season and week=b.week and mode=b.mode;
      n:=n+jsonb_array_length(changed);
    exception when others then null;
    end;
  end loop;
  return n;
end $$;

-- Advisory since this ruling: ready:true means every changed guess already has a line observed in the last five
-- minutes, so no refresh is worth spending on. It never decides whether the save happens.
-- gtl_begin_submission_odds_collection keeps using it (GTL_ODDS_NOT_REQUIRED) to avoid duplicate spending.
create or replace function public.gtl_preflight_submission(p_user uuid,p_intent jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; stamp timestamptz; g jsonb; ref jsonb;
begin
  c:=public.gtl_submission_intent_context(p_user,p_intent);
  if not (c->>'requiresReferences')::boolean then return jsonb_build_object('requiresReferences',false,'ready',true); end if;
  stamp:=clock_timestamp();
  for g in select x from jsonb_array_elements(c->'games') x where (c->'changedGameIds') ? (x->>'id') loop
    ref:=public.gtl_reference_at_save((c->>'season')::integer,(c->>'week')::integer,c->'signature',g,c->>'market',stamp);
    if ref is null or ref->>'status' is distinct from 'available' or (ref->>'observedAt')::timestamptz<stamp-interval '5 minutes' then
      return jsonb_build_object('requiresReferences',true,'ready',false);
    end if;
  end loop;
  return jsonb_build_object('requiresReferences',true,'ready',true);
end $$;

-- Body of 20261009160000 (D-25 bypass first, unchanged) with three changes: a changed guess's reference must be
-- exactly the stored line it names (any age) or the canonical pending reference; kickoff locks are checked
-- explicitly (the old freshness check enforced them implicitly); and a resolution update (only pending references
-- replaced by their server-computed line, nothing else changed) is accepted at any time, also after the deadline.
create or replace function public.gtl_guard_fresh_submission() returns trigger
language plpgsql security invoker set search_path='' as $$
declare prior public.gtl_weekly_ballots; sig jsonb; game jsonb; g jsonb; pick record; ref jsonb;
  expected jsonb; snap public.gtl_market_snapshots; stamp timestamptz; submitted boolean; snapshot_id uuid; ctx text; market text;
begin
  -- D-25: only gtl_import_ruled_ballot, and only while it is on the stack.
  if current_setting('gtl.ruled_ballot_import',true)='commissioner' then
    get diagnostics ctx=pg_context;
    if ctx like '%function public.gtl_import_ruled_ballot(%' then return new; end if;
  end if;
  select * into prior from public.gtl_weekly_ballots where user_id=new.user_id and season=new.season and week=new.week and mode=new.mode;
  submitted:=coalesce(prior.ballot->>'submittedAt','')<>'';
  if coalesce(new.ballot->>'submittedAt','')='' then
    if submitted then raise exception 'GTL_BALLOT_INCOMPLETE'; end if;
    return new;
  end if;
  if submitted and new.ballot->'submittedAt' is distinct from prior.ballot->'submittedAt' then raise exception 'GTL_SUBMISSION_ODDS_REQUIRED'; end if;
  market:=case when new.mode='guess_spread' then 'spread' else 'total' end;
  -- October 12, 2026: pending reference resolution by gtl_resolve_pending_references.
  if submitted and (new.ballot-'scoringReferences') is not distinct from (prior.ballot-'scoringReferences')
    and jsonb_typeof(new.ballot->'scoringReferences')='object' and jsonb_typeof(prior.ballot->'scoringReferences')='object'
    and new.ballot->'scoringReferences' is distinct from prior.ballot->'scoringReferences' then
    if (select array_agg(k order by k) from jsonb_object_keys(new.ballot->'scoringReferences') k)
      is distinct from (select array_agg(k order by k) from jsonb_object_keys(prior.ballot->'scoringReferences') k) then raise exception 'GTL_SUBMISSION_ODDS_REQUIRED'; end if;
    for pick in select * from jsonb_each(new.ballot->'scoringReferences') loop
      ref:=prior.ballot#>array['scoringReferences',pick.key];
      continue when pick.value is not distinct from ref;
      expected:=case when ref->>'status'='pending' then public.gtl_resolve_pending_reference(new.season,new.week,new.mode,pick.key,ref) end;
      if expected is null or pick.value is distinct from expected then raise exception 'GTL_SUBMISSION_ODDS_REQUIRED'; end if;
    end loop;
    return new;
  end if;
  select signature into sig from public.gtl_weekly_slates where season=new.season and week=new.week;
  stamp:=(new.ballot->>'updatedAt')::timestamptz;
  if sig is null or stamp is null or not isfinite(stamp) or stamp>clock_timestamp()
    or clock_timestamp()>=to_timestamp((sig->>'deadline')::numeric) then raise exception 'GTL_PREDICTION_CLOSED'; end if;
  if jsonb_typeof(new.ballot->'picks') is distinct from 'object'
    or (select count(*) from jsonb_object_keys(new.ballot->'picks'))<>jsonb_array_length(sig->'games') then raise exception 'GTL_BALLOT_INCOMPLETE'; end if;
  for pick in select * from jsonb_each(new.ballot->'picks') loop
    ref:=new.ballot#>array['scoringReferences',pick.key];
    if submitted and prior.ballot#>array['picks',pick.key] is not distinct from pick.value then
      if ref is distinct from prior.ballot#>array['scoringReferences',pick.key] then raise exception 'GTL_SUBMISSION_ODDS_REQUIRED'; end if;
      continue;
    end if;
    select x into g from jsonb_array_elements(sig->'games') x where x->>'id'=pick.key;
    if g is null then raise exception 'GTL_BALLOT_INVALID'; end if;
    if stamp>=to_timestamp((g->>'kickoff')::numeric) then raise exception 'GTL_PREDICTION_CLOSED'; end if;
    if ref is null or (ref->>'savedAt')::timestamptz is distinct from stamp then raise exception 'GTL_SUBMISSION_ODDS_REQUIRED'; end if;
    if ref->>'status'='pending' then
      if ref is distinct from public.gtl_pending_reference(stamp) then raise exception 'GTL_SUBMISSION_ODDS_REQUIRED'; end if;
      continue;
    end if;
    if ref->>'status' is distinct from 'available' or jsonb_typeof(ref->'value') is distinct from 'number' then raise exception 'GTL_SUBMISSION_ODDS_REQUIRED'; end if;
    select x into game from public.gtl_schedule_templates t cross join lateral jsonb_array_elements(t.games) x
      where t.season=new.season and t.week=new.week and x->>'id'=pick.key and x->>'homeCode'=g->>'home' and x->>'awayCode'=g->>'away'
        and extract(epoch from (x->>'kickoff')::timestamptz)=(g->>'kickoff')::numeric order by t.created_at desc,t.id limit 1;
    if game is null then raise exception 'GTL_SUBMISSION_ODDS_REQUIRED'; end if;
    snapshot_id:=(ref->>'snapshotId')::uuid;
    select * into snap from public.gtl_market_snapshots where id=snapshot_id and season=new.season and week=new.week and slate_signature=sig and created_at<=stamp;
    if snap.id is null then raise exception 'GTL_SUBMISSION_ODDS_REQUIRED'; end if;
    expected:=public.gtl_submission_reference(snap.payload,game,market,stamp);
    if expected is null or ref is distinct from (expected||jsonb_build_object('snapshotId',snap.id)) then raise exception 'GTL_SUBMISSION_ODDS_REQUIRED'; end if;
  end loop;
  return new;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception 'GTL_SUBMISSION_ODDS_REQUIRED';
end $$;

-- Body of 20261008225401 except: the canonical row is locked (a pending reference resolved by a concurrent
-- collection is never written back as pending), kickoff locks are explicit, and each changed guess saves
-- gtl_reference_at_save (the newest stored line, any age, or pending) instead of an 'unavailable' or 'stale' one.
create or replace function public.gtl_save_weekly_ballot(p_user uuid,p_league text,p_mode text,p_revision bigint,p_picks jsonb,p_submit boolean) returns bigint
language plpgsql security invoker set search_path='' as $$
declare c jsonb; s integer; w integer; rev bigint; b public.gtl_weekly_ballots; entry record; v numeric; stamp timestamptz;
  next_ballot jsonb; event jsonb; was_submitted boolean; is_submitted boolean; refs jsonb; ref jsonb; g jsonb;
  changed jsonb:='[]'; market text; signature jsonb;
begin
  c:=public.gtl_weekly_context(p_user,p_league); s:=(c->>'season')::integer; w:=(c->>'week')::integer;
  if p_mode is null or p_mode not in ('guess_spread','guess_total') or p_picks is null or jsonb_typeof(p_picks)<>'object' or p_submit is null then raise exception 'GTL_BALLOT_INVALID'; end if;
  insert into public.gtl_weekly_versions(user_id,season,week) values(p_user,s,w) on conflict do nothing;
  select revision into rev from public.gtl_weekly_versions where user_id=p_user and season=s and week=w for update;
  if p_revision is null or p_revision<>rev then raise exception 'GTL_WEEKLY_CONFLICT'; end if;
  select * into b from public.gtl_weekly_ballots where user_id=p_user and season=s and week=w and mode=p_mode for update;
  was_submitted:=coalesce(b.ballot->>'submittedAt','')<>''; is_submitted:=p_submit or was_submitted;
  stamp:=clock_timestamp();
  if stamp >= (c#>>'{state,league,deadline}')::timestamptz then raise exception 'GTL_PREDICTION_CLOSED'; end if;
  for entry in select * from jsonb_each(p_picks) loop
    if not exists(select 1 from jsonb_array_elements(c#>'{state,games}') game where game->>'id'=entry.key) or jsonb_typeof(entry.value)<>'number' then raise exception 'GTL_BALLOT_INVALID'; end if;
    v:=entry.value::numeric;
    if v*2<>trunc(v*2) or (p_mode='guess_spread' and (v < -100 or v > 100)) or (p_mode='guess_total' and (v < 0 or v > 200)) then raise exception 'GTL_BALLOT_INVALID'; end if;
    if not was_submitted or b.ballot#>array['picks',entry.key] is distinct from entry.value then changed:=changed||jsonb_build_array(entry.key); end if;
  end loop;
  if is_submitted and (select count(*) from jsonb_object_keys(p_picks))<>jsonb_array_length(c#>'{state,games}') then raise exception 'GTL_BALLOT_INCOMPLETE'; end if;
  refs:=coalesce(b.ballot->'scoringReferences','{}');
  market:=case when p_mode='guess_total' then 'total' else 'spread' end;
  signature:=public.gtl_weekly_slate(c->'state');
  if is_submitted then
    for g in select game from jsonb_array_elements(c#>'{state,games}') game where changed ? (game->>'id') loop
      if stamp>=(g->>'kickoff')::timestamptz then raise exception 'GTL_PREDICTION_CLOSED'; end if;
      ref:=public.gtl_reference_at_save(s,w,signature,g,market,stamp);
      if ref is null then raise exception 'GTL_PREDICTION_CLOSED'; end if;
      refs:=refs||jsonb_build_object(g->>'id',ref);
    end loop;
  end if;
  -- Preserve original provenance and first submission timestamp on edit.
  next_ballot:=coalesce(b.ballot,'{}')||jsonb_build_object('picks',p_picks,
    'submittedAt',case when was_submitted then b.ballot->'submittedAt' when p_submit then to_jsonb(stamp) else 'null'::jsonb end,
    'updatedAt',stamp,'scoringPolicy','submission-time','scoringReferences',refs);
  event:=jsonb_build_object('id',gen_random_uuid(),'player',c->>'playerId','mode',p_mode,
    'type',case when was_submitted then 'ballot_edited' when p_submit then 'ballot_submitted' else 'ballot_saved' end,
    'timestamp',stamp,'before',coalesce(b.ballot->'picks','{}'),'after',p_picks,'changedGameIds',changed,
    'beforeScoringReferences',coalesce(b.ballot->'scoringReferences','{}'),'afterScoringReferences',refs);
  insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot,audit,origin_practice,provenance)
    values(p_user,s,w,p_mode,next_ballot,jsonb_build_array(event),(c->>'practice')::boolean,jsonb_build_array(jsonb_build_object('leagueId',p_league,'playerId',c->>'playerId')))
    on conflict(user_id,season,week,mode) do update set ballot=excluded.ballot,audit=public.gtl_weekly_ballots.audit||excluded.audit,
      origin_practice=public.gtl_weekly_ballots.origin_practice or excluded.origin_practice,provenance=public.gtl_weekly_ballots.provenance||excluded.provenance;
  update public.gtl_weekly_versions set revision=revision+1 where user_id=p_user and season=s and week=w;
  return rev+1;
end $$;

-- Body of 20261008224444 except the personal/ballot branch: the canonical row is locked, kickoff locks are
-- explicit, and each changed guess saves gtl_reference_at_save (the newest stored line, any age, or pending).
create or replace function public.gtl_mutate_personal(p_user uuid,p_action text,p_body jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare rev bigint; request uuid; receipt public.gtl_personal_receipts; sig jsonb; s integer; w integer; g jsonb;
  stamp timestamptz; before_value jsonb; after_value jsonb; target text; result jsonb; entry_id uuid;
  old_entry public.gtl_journal_entries; allowed text[]; val numeric; odds numeric; v_market text; quote_time timestamptz; placed_time timestamptz;
  b public.gtl_weekly_ballots; week_rev bigint; pick record; next_ballot jsonb; event jsonb;
  was_submitted boolean; is_submitted boolean; refs jsonb; scoring_ref jsonb; changed jsonb:='[]'; named_game jsonb; snap record;
begin
  if p_user is null or not exists(select 1 from public.gtl_profiles where user_id=p_user) then raise exception 'GTL_PERSONAL_PROFILE'; end if;
  if p_body is null or jsonb_typeof(p_body)<>'object' or p_action is null then raise exception 'GTL_PERSONAL_INVALID'; end if;
  allowed:=case p_action
    when 'favorite/set' then array['season','week','gameId','saved','notes']
    when 'personal/forecast' then array['season','week','gameId','market','value']
    when 'personal/ballot' then array['season','week','mode','weeklyRevision','picks','submit']
    when 'journal/create' then array['season','week','gameId','kind','market','side','line','odds','source','quotedAt','placedAt','notes','outcome','currency','stakeMinor','returnedMinor']
    when 'journal/correct' then array['entryId','reason','season','week','gameId','kind','market','side','line','odds','source','quotedAt','placedAt','notes','outcome','currency','stakeMinor','returnedMinor']
    when 'journal/archive' then array['entryId','reason','archived'] end;
  if allowed is null or exists(select 1 from jsonb_object_keys(p_body) k where not(k=any(allowed||array['requestId','revision'])))
    or not(p_body ?& (allowed||array['requestId','revision'])) or jsonb_typeof(p_body->'revision') is distinct from 'number'
    or (p_body->>'revision') !~ '^[0-9]+$' then raise exception 'GTL_PERSONAL_INVALID'; end if;
  begin request:=(p_body->>'requestId')::uuid; exception when others then raise exception 'GTL_PERSONAL_INVALID'; end;
  if request is null then raise exception 'GTL_PERSONAL_INVALID'; end if;
  insert into public.gtl_personal_versions(user_id) values(p_user) on conflict do nothing;
  select revision into rev from public.gtl_personal_versions where user_id=p_user for update;
  select * into receipt from public.gtl_personal_receipts where user_id=p_user and request_id=request;
  if found then
    if receipt.action<>p_action or receipt.payload<>p_body then raise exception 'GTL_PERSONAL_RETRY_CONFLICT'; end if;
    return receipt.result;
  end if;
  if (p_body->>'revision')::numeric<>rev then raise exception 'GTL_PERSONAL_CONFLICT'; end if;
  stamp:=clock_timestamp();
  if p_action in ('journal/correct','journal/archive') then
    begin entry_id:=(p_body->>'entryId')::uuid; exception when others then raise exception 'GTL_PERSONAL_INVALID'; end;
    select * into old_entry from public.gtl_journal_entries where user_id=p_user and id=entry_id for update;
    if not found then raise exception 'GTL_PERSONAL_NOT_FOUND'; end if;
    if jsonb_typeof(p_body->'reason') is distinct from 'string' or length(btrim(p_body->>'reason'))<3 or length(p_body->>'reason')>300 then raise exception 'GTL_PERSONAL_INVALID'; end if;
    before_value:=old_entry.entry||jsonb_build_object('archived',old_entry.archived,'revision',old_entry.revision);
  end if;
  if p_action='journal/archive' then
    if jsonb_typeof(p_body->'archived') is distinct from 'boolean' then raise exception 'GTL_PERSONAL_INVALID'; end if;
    update public.gtl_journal_entries set archived=(p_body->>'archived')::boolean,revision=revision+1,updated_at=stamp where id=entry_id and user_id=p_user;
    after_value:=old_entry.entry||jsonb_build_object('archived',(p_body->>'archived')::boolean,'revision',old_entry.revision+1); target:=entry_id::text;
  else
    if jsonb_typeof(p_body->'season') is distinct from 'number' or jsonb_typeof(p_body->'week') is distinct from 'number'
      or (p_body->>'season') !~ '^[0-9]{4}$' or (p_body->>'week') !~ '^[0-9]{1,2}$' then raise exception 'GTL_PERSONAL_INVALID'; end if;
    s:=(p_body->>'season')::integer; w:=(p_body->>'week')::integer;
    sig:=public.gtl_personal_context(p_user,s,w);
    if p_action<>'personal/ballot' then
      select x into g from jsonb_array_elements(sig->'games') x where x->>'id'=p_body->>'gameId';
      if g is null then raise exception 'GTL_PERSONAL_INVALID'; end if;
      target:=s||'/'||w||'/'||(g->>'id');
    end if;
    if p_action='favorite/set' then
      if jsonb_typeof(p_body->'saved') is distinct from 'boolean' or jsonb_typeof(p_body->'notes') is distinct from 'string' or length(p_body->>'notes')>2000 then raise exception 'GTL_PERSONAL_INVALID'; end if;
      select jsonb_build_object('saved',saved,'notes',notes) into before_value from public.gtl_favorites where user_id=p_user and season=s and week=w and game_id=g->>'id';
      after_value:=jsonb_build_object('saved',(p_body->>'saved')::boolean,'notes',btrim(p_body->>'notes'));
      insert into public.gtl_favorites(user_id,season,week,game_id,saved,notes,updated_at) values(p_user,s,w,g->>'id',(p_body->>'saved')::boolean,btrim(p_body->>'notes'),stamp)
        on conflict(user_id,season,week,game_id) do update set saved=excluded.saved,notes=excluded.notes,updated_at=excluded.updated_at;
    elsif p_action='personal/forecast' then
      v_market:=p_body->>'market';
      if v_market is null or v_market not in ('spread','total') or jsonb_typeof(p_body->'value') is distinct from 'number' then raise exception 'GTL_PERSONAL_INVALID'; end if;
      val:=(p_body->>'value')::numeric;
      if val*2<>trunc(val*2) or (v_market='spread' and (val < -100 or val > 100)) or (v_market='total' and (val < 0 or val > 200)) then raise exception 'GTL_PERSONAL_INVALID'; end if;
      target:=target||'/'||v_market;
      select jsonb_build_object('value',value,'savedAt',saved_at,'revision',revision) into before_value from public.gtl_personal_forecasts where user_id=p_user and season=s and week=w and game_id=g->>'id' and gtl_personal_forecasts.market=v_market;
      insert into public.gtl_personal_forecasts(user_id,season,week,game_id,market,value,saved_at) values(p_user,s,w,g->>'id',v_market,val,stamp)
        on conflict(user_id,season,week,game_id,market) do update set value=excluded.value,saved_at=excluded.saved_at,revision=public.gtl_personal_forecasts.revision+1;
      after_value:=jsonb_build_object('value',val,'savedAt',stamp);
    elsif p_action='personal/ballot' then
      if p_body->>'mode' is null or p_body->>'mode' not in ('guess_spread','guess_total') or jsonb_typeof(p_body->'picks') is distinct from 'object' or jsonb_typeof(p_body->'submit') is distinct from 'boolean' or jsonb_typeof(p_body->'weeklyRevision') is distinct from 'number' or (p_body->>'weeklyRevision') !~ '^[0-9]+$' then raise exception 'GTL_PERSONAL_INVALID'; end if;
      insert into public.gtl_weekly_versions(user_id,season,week) values(p_user,s,w) on conflict do nothing;
      select revision into week_rev from public.gtl_weekly_versions where user_id=p_user and season=s and week=w for update;
      if (p_body->>'weeklyRevision')::numeric<>week_rev then raise exception 'GTL_WEEKLY_CONFLICT'; end if;
      select * into b from public.gtl_weekly_ballots where user_id=p_user and season=s and week=w and mode=p_body->>'mode' for update;
      was_submitted:=coalesce(b.ballot->>'submittedAt','')<>''; is_submitted:=(p_body->>'submit')::boolean or was_submitted;
      if stamp>=to_timestamp((sig->>'deadline')::numeric) then raise exception 'GTL_PREDICTION_CLOSED'; end if;
      for pick in select * from jsonb_each(p_body->'picks') loop
        if not exists(select 1 from jsonb_array_elements(sig->'games') x where x->>'id'=pick.key) or jsonb_typeof(pick.value)<>'number' then raise exception 'GTL_PERSONAL_INVALID'; end if;
        val:=pick.value::numeric;
        if val*2<>trunc(val*2) or (p_body->>'mode'='guess_spread' and (val < -100 or val > 100)) or (p_body->>'mode'='guess_total' and (val < 0 or val > 200)) then raise exception 'GTL_PERSONAL_INVALID'; end if;
        if not was_submitted or b.ballot#>array['picks',pick.key] is distinct from pick.value then changed:=changed||jsonb_build_array(pick.key); end if;
      end loop;
      if is_submitted and (select count(*) from jsonb_object_keys(p_body->'picks'))<>jsonb_array_length(sig->'games') then raise exception 'GTL_BALLOT_INCOMPLETE'; end if;
      -- October 12, 2026: each changed guess saves the newest stored line at this instant, whatever its age, or the
      -- pending reference that the first line collected after it resolves. Kickoff locks are explicit (unchanged rule).
      refs:=coalesce(b.ballot->'scoringReferences','{}');
      if is_submitted then
        for g in select x from jsonb_array_elements(sig->'games') x where changed ? (x->>'id') loop
          if stamp>=to_timestamp((g->>'kickoff')::numeric) then raise exception 'GTL_PREDICTION_CLOSED'; end if;
          named_game:=null;
          select x into named_game from public.gtl_schedule_templates t cross join lateral jsonb_array_elements(t.games) x
            where t.season=s and t.week=w and x->>'id'=g->>'id' and x->>'homeCode'=g->>'home' and x->>'awayCode'=g->>'away'
              and extract(epoch from (x->>'kickoff')::timestamptz)=(g->>'kickoff')::numeric order by t.created_at desc,t.id limit 1;
          if named_game is null then raise exception 'GTL_PERSONAL_SLATE'; end if;
          scoring_ref:=public.gtl_reference_at_save(s,w,sig,named_game,case when p_body->>'mode'='guess_spread' then 'spread' else 'total' end,stamp);
          if scoring_ref is null then raise exception 'GTL_PREDICTION_CLOSED'; end if;
          refs:=refs||jsonb_build_object(g->>'id',scoring_ref);
        end loop;
      end if;
      next_ballot:=coalesce(b.ballot,'{}')||jsonb_build_object('picks',p_body->'picks',
        'submittedAt',case when was_submitted then b.ballot->'submittedAt' when (p_body->>'submit')::boolean then to_jsonb(stamp) else 'null'::jsonb end,
        'updatedAt',stamp,'scoringPolicy','submission-time','scoringReferences',refs);
      event:=jsonb_build_object('id',gen_random_uuid(),'player','u_'||replace(p_user::text,'-',''),'mode',p_body->>'mode',
        'type',case when was_submitted then 'ballot_edited' when (p_body->>'submit')::boolean then 'ballot_submitted' else 'ballot_saved' end,
        'timestamp',stamp,'before',coalesce(b.ballot->'picks','{}'),'after',p_body->'picks','changedGameIds',changed,
        'beforeScoringReferences',coalesce(b.ballot->'scoringReferences','{}'),'afterScoringReferences',refs);
      insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot,audit,origin_practice,provenance)
        values(p_user,s,w,p_body->>'mode',next_ballot,jsonb_build_array(event),false,jsonb_build_array(jsonb_build_object('scope','solo')))
        on conflict(user_id,season,week,mode) do update set ballot=excluded.ballot,audit=public.gtl_weekly_ballots.audit||excluded.audit,provenance=public.gtl_weekly_ballots.provenance||excluded.provenance;
      update public.gtl_weekly_versions set revision=revision+1 where user_id=p_user and season=s and week=w;
      before_value:=b.ballot; after_value:=next_ballot; target:=s||'/'||w||'/'||(p_body->>'mode');
    else
      v_market:=p_body->>'market';
      if v_market is null or v_market not in ('spread','total') or p_body->>'kind' is null or p_body->>'kind' not in ('research_note','user_reported_placed_bet') or p_body->>'side' is null
        or (v_market='spread' and p_body->>'side' not in ('home','away')) or (v_market='total' and p_body->>'side' not in ('over','under'))
        or jsonb_typeof(p_body->'line') is distinct from 'number' or jsonb_typeof(p_body->'odds') is distinct from 'number'
        or jsonb_typeof(p_body->'source') is distinct from 'string' or length(btrim(p_body->>'source'))<2 or length(p_body->>'source')>120
        or jsonb_typeof(p_body->'notes') is distinct from 'string' or length(p_body->>'notes')>2000 then raise exception 'GTL_PERSONAL_INVALID'; end if;
      if p_body->>'outcome' is null or p_body->>'outcome' not in ('pending','win','loss','push','void')
        or (jsonb_typeof(p_body->'stakeMinor') not in ('null','number')) or (jsonb_typeof(p_body->'returnedMinor') not in ('null','number'))
        or (p_body->'stakeMinor'<>'null'::jsonb and ((p_body->>'stakeMinor') !~ '^[0-9]+$' or (p_body->>'stakeMinor')::numeric not between 1 and 1000000000))
        or (p_body->'returnedMinor'<>'null'::jsonb and ((p_body->>'returnedMinor') !~ '^[0-9]+$' or (p_body->>'returnedMinor')::numeric not between 0 and 1000000000))
        or (p_body->'stakeMinor'='null'::jsonb and (p_body->'currency'<>'null'::jsonb or p_body->'returnedMinor'<>'null'::jsonb))
        or (p_body->'stakeMinor'<>'null'::jsonb and (p_body->>'currency' is null or p_body->>'currency' not in ('USD','CAD','EUR','GBP','AUD')))
        or (p_body->>'outcome'='pending' and p_body->'returnedMinor'<>'null'::jsonb)
        or (p_body->>'kind'='research_note' and (p_body->'stakeMinor'<>'null'::jsonb or p_body->'currency'<>'null'::jsonb or p_body->'returnedMinor'<>'null'::jsonb)) then raise exception 'GTL_PERSONAL_INVALID'; end if;
      if not exists(select 1 from public.gtl_weekly_ballots where user_id=p_user and season=s and week=w and mode=case when v_market='spread' then 'guess_spread' else 'guess_total' end and coalesce(ballot->>'submittedAt','')<>'') then raise exception 'GTL_MATCHING_BALLOT_REQUIRED'; end if;
      val:=(p_body->>'line')::numeric; odds:=(p_body->>'odds')::numeric;
      if val*2<>trunc(val*2) or (v_market='spread' and (val < -100 or val > 100)) or (v_market='total' and (val < 0 or val > 200)) or odds<>trunc(odds) or abs(odds)<100 or abs(odds)>10000 then raise exception 'GTL_PERSONAL_INVALID'; end if;
      begin quote_time:=(p_body->>'quotedAt')::timestamptz; placed_time:=(p_body->>'placedAt')::timestamptz; exception when others then raise exception 'GTL_PERSONAL_INVALID'; end;
      if quote_time is null or not isfinite(quote_time) or quote_time>stamp or (placed_time is not null and (not isfinite(placed_time) or placed_time>stamp)) or ((p_body->>'kind'='user_reported_placed_bet')<>(placed_time is not null)) then raise exception 'GTL_PERSONAL_INVALID'; end if;
      if p_action='journal/correct' and (old_entry.season<>s or old_entry.week<>w or old_entry.game_id<>g->>'id' or old_entry.entry->>'market'<>v_market) then raise exception 'GTL_PERSONAL_INVALID'; end if;
      after_value:=(p_body-array['requestId','revision','entryId','reason'])||jsonb_build_object('source',btrim(p_body->>'source'),'notes',btrim(p_body->>'notes'),'quotedAt',quote_time,'placedAt',placed_time,'verification','User-reported; not independently verified','retrospective',case when p_action='journal/correct' then (old_entry.entry->>'retrospective')::boolean else stamp>=to_timestamp((g->>'kickoff')::numeric) end);
      if p_action='journal/correct' then
        after_value:=after_value||jsonb_build_object('context',old_entry.entry->'context');
      else
        -- Pin information known to this account when recorded, never retrospectively claim placement-time knowledge.
        after_value:=after_value||jsonb_build_object('context',jsonb_build_object('recordedAt',stamp,
          'sportsbookGuess',(select jsonb_build_object('value',ballot#>array['picks',g->>'id'],'submittedAt',ballot->'submittedAt','scoringReference',ballot#>array['scoringReferences',g->>'id']) from public.gtl_weekly_ballots where user_id=p_user and season=s and week=w and mode=case when v_market='spread' then 'guess_spread' else 'guess_total' end),
          'personalForecast',(select jsonb_build_object('value',value,'savedAt',saved_at,'revision',revision) from public.gtl_personal_forecasts where user_id=p_user and season=s and week=w and game_id=g->>'id' and market=v_market),
          'quote',jsonb_build_object('line',val,'side',p_body->>'side','odds',odds,'source',btrim(p_body->>'source'),'observedAt',quote_time),
          'model',null));
      end if;
      if p_action='journal/create' then
        if (select count(*)>=2000 from public.gtl_journal_entries where user_id=p_user and season=s and week=w) then raise exception 'GTL_PERSONAL_LIMIT'; end if;
        insert into public.gtl_journal_entries(user_id,season,week,game_id,entry,created_at,updated_at) values(p_user,s,w,g->>'id',after_value,stamp,stamp) returning id into entry_id;
      else update public.gtl_journal_entries set entry=after_value,revision=revision+1,updated_at=stamp where id=entry_id and user_id=p_user; end if;
      target:=entry_id::text;
    end if;
  end if;
  insert into public.gtl_personal_events(user_id,revision,action,target,before_value,after_value,reason,created_at) values(p_user,rev+1,p_action,target,before_value,after_value,p_body->>'reason',stamp);
  update public.gtl_personal_versions set revision=rev+1 where user_id=p_user;
  result:=jsonb_build_object('revision',rev+1,'entryId',entry_id,'saved',true);
  insert into public.gtl_personal_receipts(user_id,request_id,action,payload,result,created_at) values(p_user,request,p_action,p_body,result,stamp);
  return result;
end $$;

-- Body of 20261012213000 plus the pending-reference resolution after the snapshot insert.
create or replace function public.gtl_finish_odds_collection(p_user uuid,p_request uuid,p_lease uuid,p_payload jsonb,p_quota jsonb,p_error text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; b public.gtl_odds_budget; job public.gtl_odds_collections; stamp timestamptz; q record;
  remaining integer; used integer; lastcost integer; matched integer:=0; quotes integer:=0; item jsonb; market record; quote jsonb; schedule jsonb; captured timestamptz; observed timestamptz; summary jsonb; snapshot uuid;
begin
  c:=public.gtl_odds_collection_slate(p_user);
  select * into b from public.gtl_odds_budget where provider='the-odds-api' for update;
  select * into job from public.gtl_odds_collections where id=p_request for update;
  if job.id is null or job.actor_id<>p_user or job.lease_token is distinct from p_lease then raise exception 'GTL_ODDS_REQUEST'; end if;
  if job.status<>'running' then return job.diagnostics; end if;
  stamp:=clock_timestamp();
  if b.lease_token is distinct from p_lease or job.expires_at<=stamp then raise exception 'GTL_ODDS_LEASE'; end if;
  if c->'signature'<>job.slate_signature then raise exception 'GTL_SLATE_CONFLICT'; end if;
  if p_error is not null and p_error not in ('ODDS_CONFIG','ODDS_SLATE','ODDS_BUSY','ODDS_BUDGET','ODDS_AUTH','ODDS_RATE_LIMIT','ODDS_UNAVAILABLE','ODDS_TIMEOUT','ODDS_PAYLOAD','ODDS_BODY_LIMIT','ODDS_QUOTA_COST') then raise exception 'GTL_ODDS_REQUEST'; end if;
  if p_quota is null or jsonb_typeof(p_quota)<>'object' then raise exception 'GTL_ODDS_REQUEST'; end if;
  for q in select * from jsonb_each(p_quota) loop
    if q.key not in ('remaining','used','last') or (q.value<>'null'::jsonb and (jsonb_typeof(q.value)<>'number' or q.value::text !~ '^[0-9]{1,9}$')) then raise exception 'GTL_ODDS_REQUEST'; end if;
  end loop;
  remaining:=(p_quota->>'remaining')::integer; used:=(p_quota->>'used')::integer; lastcost:=(p_quota->>'last')::integer;
  if lastcost > (case when job.operation='preflight' then 0 else 2 end) then p_error:='ODDS_QUOTA_COST'; end if;
  if p_error is null and (p_payload is null or jsonb_typeof(p_payload)<>'object' or jsonb_typeof(p_payload->'games') is distinct from 'array' or jsonb_array_length(p_payload->'games')<>jsonb_array_length(c->'games') or octet_length(p_payload::text)>524288) then raise exception 'GTL_ODDS_PAYLOAD'; end if;
  if p_error is null then
    if p_payload->>'provider' is distinct from 'the-odds-api' or p_payload->>'sport' is distinct from 'americanfootball_nfl' or p_payload->'officialVerified' is distinct from 'false'::jsonb then raise exception 'GTL_ODDS_PAYLOAD'; end if;
    if (select count(*)<>count(distinct g->>'gameId') from jsonb_array_elements(p_payload->'games') g) then raise exception 'GTL_ODDS_PAYLOAD'; end if;
    for item in select value from jsonb_array_elements(p_payload->'games') loop
      select g into schedule from jsonb_array_elements(c->'games') g where g->>'id'=item->>'gameId';
      if schedule is null or item->>'home' is distinct from schedule->>'home' or item->>'away' is distinct from schedule->>'away' or (item->>'kickoff')::timestamptz is distinct from (schedule->>'kickoff')::timestamptz then raise exception 'GTL_ODDS_PAYLOAD'; end if;
      if item->>'matchStatus'='matched' then matched:=matched+1; end if;
      if job.operation='collect' then
        if jsonb_typeof(item->'markets') is distinct from 'object' then raise exception 'GTL_ODDS_PAYLOAD'; end if;
        for market in select * from jsonb_each(item->'markets') loop
          if market.key not in ('spread','total') or jsonb_typeof(market.value->'quotes') is distinct from 'array' then raise exception 'GTL_ODDS_PAYLOAD'; end if;
          for quote in select value from jsonb_array_elements(market.value->'quotes') loop
            captured:=(quote->>'collectedAt')::timestamptz; observed:=(quote->>'providerObservedAt')::timestamptz;
            if item->>'matchStatus' is distinct from 'matched' or quote->>'provider' is distinct from 'the-odds-api' or quote->>'market' is distinct from market.key or quote->>'providerEventId' is distinct from item->>'providerEventId' or captured is null or observed is null or observed>captured or observed<captured-interval '5 minutes' or captured<job.started_at-interval '5 seconds' or captured>(stamp+interval '5 seconds') or captured>=(schedule->>'kickoff')::timestamptz or jsonb_typeof(quote->'value') is distinct from 'number' then raise exception 'GTL_ODDS_PAYLOAD'; end if;
            quotes:=quotes+1;
          end loop;
        end loop;
      end if;
    end loop;
    if job.operation='collect' and quotes>0 then
      snapshot:=job.id;
      insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values(snapshot,job.season,job.week,job.slate_signature,p_payload,stamp);
      -- October 12, 2026: guesses saved before any line was stored take the first qualifying line collected after them.
      -- A fault leaves them pending for the next collection and never loses this snapshot.
      begin perform public.gtl_resolve_pending_references(job.season,job.week);
      exception when others then null; end;
    end if;
  end if;
  -- Never infer a quota reset or refund an attempted request from a higher header.
  -- Bootstrap starts only from a measured free response, capped to the 500-credit free plan.
  update public.gtl_odds_budget set observed_remaining=coalesce(remaining,observed_remaining),observed_used=coalesce(used,observed_used),observed_last=coalesce(lastcost,observed_last),
    observed_at=case when remaining is not null then stamp else observed_at end,
    conservative_remaining=case when remaining is null then conservative_remaining when conservative_remaining is null then least(remaining,500) else least(conservative_remaining,remaining) end,
    last_successful_preflight_at=case when job.operation='preflight' and p_error is null and remaining is not null then stamp else last_successful_preflight_at end,
    paused=paused or coalesce(p_error='ODDS_QUOTA_COST',false),
    lease_token=null,lease_until=null,updated_at=stamp where provider=b.provider;
  summary:=jsonb_build_object('requestId',job.id,'operation',job.operation,'status',case when p_error is null then 'succeeded' else 'failed' end,
    'snapshotId',snapshot,'matchedEvents',matched,'availableQuotes',quotes,'quota',jsonb_build_object('remaining',remaining,'used',used,'last',lastcost),'officialVerified',false,'errorCode',p_error);
  update public.gtl_odds_collections set status=case when p_error is null then 'succeeded' else 'failed' end,finished_at=stamp,error_code=p_error,diagnostics=summary where id=job.id;
  return summary;
end $$;

-- Body of 20261008232055 plus the pending-reference resolution after the snapshot insert.
create or replace function public.gtl_finish_submission_odds_collection(p_user uuid,p_request uuid,p_lease uuid,p_payload jsonb,p_quota jsonb,p_error text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; binding public.gtl_submission_odds_intents; b public.gtl_odds_budget; job public.gtl_odds_collections; stamp timestamptz; q record;
  remaining integer; used integer; lastcost integer; matched integer:=0; quotes integer:=0; item jsonb; market record; quote jsonb; schedule jsonb; fetched timestamptz; captured timestamptz; observed timestamptz; summary jsonb; snapshot uuid;
begin
  select * into binding from public.gtl_submission_odds_intents where request_id=p_request;
  select * into job from public.gtl_odds_collections where id=p_request;
  if binding.request_id is null or binding.actor_id is distinct from p_user or job.actor_id is distinct from p_user
    or job.lease_token is distinct from p_lease then raise exception 'GTL_ODDS_REQUEST'; end if;
  if job.status<>'running' then return job.diagnostics; end if;
  -- Changed membership, slate, revision or deadline after a fetch cannot turn into
  -- a ballot write. Release accounting safely; no snapshot is saved for that intent.
  begin
    c:=public.gtl_submission_intent_context(p_user,binding.intent);
    if coalesce((c->>'replay')::boolean,false) or c->'signature' is distinct from job.slate_signature then p_error:='ODDS_SUBMISSION_CHANGED'; end if;
  exception when raise_exception then p_error:='ODDS_SUBMISSION_CHANGED'; end;
  select * into b from public.gtl_odds_budget where provider='the-odds-api' for update;
  select * into job from public.gtl_odds_collections where id=p_request for update;
  if job.id is null or job.actor_id<>p_user or job.lease_token is distinct from p_lease then raise exception 'GTL_ODDS_REQUEST'; end if;
  if job.status<>'running' then return job.diagnostics; end if;
  stamp:=clock_timestamp();
  if b.lease_token is distinct from p_lease or job.expires_at<=stamp then raise exception 'GTL_ODDS_LEASE'; end if;
  if p_error is not null and p_error not in ('ODDS_CONFIG','ODDS_SLATE','ODDS_BUSY','ODDS_BUDGET','ODDS_AUTH','ODDS_RATE_LIMIT','ODDS_UNAVAILABLE','ODDS_TIMEOUT','ODDS_PAYLOAD','ODDS_BODY_LIMIT','ODDS_QUOTA_COST','ODDS_SUBMISSION_CHANGED') then raise exception 'GTL_ODDS_REQUEST'; end if;
  if p_quota is null or jsonb_typeof(p_quota)<>'object' then raise exception 'GTL_ODDS_REQUEST'; end if;
  for q in select * from jsonb_each(p_quota) loop
    if q.key not in ('remaining','used','last') or (q.value<>'null'::jsonb and (jsonb_typeof(q.value)<>'number' or q.value::text !~ '^[0-9]{1,9}$')) then raise exception 'GTL_ODDS_REQUEST'; end if;
  end loop;
  remaining:=(p_quota->>'remaining')::integer; used:=(p_quota->>'used')::integer; lastcost:=(p_quota->>'last')::integer;
  if lastcost > (case when job.operation='preflight' then 0 else 2 end) then p_error:='ODDS_QUOTA_COST'; end if;
  if p_error is null and (p_payload is null or jsonb_typeof(p_payload)<>'object' or jsonb_typeof(p_payload->'games') is distinct from 'array' or jsonb_array_length(p_payload->'games')<>jsonb_array_length(c->'games') or octet_length(p_payload::text)>524288) then raise exception 'GTL_ODDS_PAYLOAD'; end if;
  if p_error is null then
    if p_payload->>'provider' is distinct from 'the-odds-api' or p_payload->>'sport' is distinct from 'americanfootball_nfl' or p_payload->'officialVerified' is distinct from 'false'::jsonb then raise exception 'GTL_ODDS_PAYLOAD'; end if;
    -- Snapshot creation and all receipt/projection checks use database time.
    -- Reject future source clocks instead of saving permanently unusable data.
    fetched:=(p_payload->>'fetchedAt')::timestamptz;
    if fetched is null or not isfinite(fetched) or fetched>stamp then raise exception 'GTL_ODDS_PAYLOAD'; end if;
    if (select count(*)<>count(distinct g->>'gameId') from jsonb_array_elements(p_payload->'games') g) then raise exception 'GTL_ODDS_PAYLOAD'; end if;
    for item in select value from jsonb_array_elements(p_payload->'games') loop
      select g into schedule from jsonb_array_elements(c->'games') g where g->>'id'=item->>'gameId';
      if schedule is null or item->>'home' is distinct from schedule->>'home' or item->>'away' is distinct from schedule->>'away' or (item->>'kickoff')::timestamptz is distinct from (schedule->>'kickoff')::timestamptz then raise exception 'GTL_ODDS_PAYLOAD'; end if;
      if item->>'matchStatus'='matched' then matched:=matched+1; end if;
      if job.operation='collect' then
        if jsonb_typeof(item->'markets') is distinct from 'object' then raise exception 'GTL_ODDS_PAYLOAD'; end if;
        for market in select * from jsonb_each(item->'markets') loop
          if market.key not in ('spread','total') or jsonb_typeof(market.value->'quotes') is distinct from 'array' then raise exception 'GTL_ODDS_PAYLOAD'; end if;
          for quote in select value from jsonb_array_elements(market.value->'quotes') loop
            captured:=(quote->>'collectedAt')::timestamptz; observed:=(quote->>'providerObservedAt')::timestamptz;
            if item->>'matchStatus' is distinct from 'matched' or quote->>'provider' is distinct from 'the-odds-api' or quote->>'market' is distinct from market.key or quote->>'providerEventId' is distinct from item->>'providerEventId' or captured is null or observed is null or not isfinite(captured) or not isfinite(observed) or observed>captured or observed<captured-interval '5 minutes' or captured<job.started_at-interval '5 seconds' or captured>stamp or captured>=(schedule->>'kickoff')::timestamptz or jsonb_typeof(quote->'value') is distinct from 'number' then raise exception 'GTL_ODDS_PAYLOAD'; end if;
            quotes:=quotes+1;
          end loop;
        end loop;
      end if;
    end loop;
    if job.operation='collect' and quotes>0 then
      snapshot:=job.id;
      insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values(snapshot,job.season,job.week,job.slate_signature,p_payload,stamp);
      -- October 12, 2026: guesses saved before any line was stored take the first qualifying line collected after them.
      -- A fault leaves them pending for the next collection and never loses this snapshot.
      begin perform public.gtl_resolve_pending_references(job.season,job.week);
      exception when others then null; end;
    end if;
  end if;
  -- Never infer a quota reset or refund an attempted request from a higher header.
  -- Bootstrap starts only from a measured free response, capped to the 500-credit free plan.
  update public.gtl_odds_budget set observed_remaining=coalesce(remaining,observed_remaining),observed_used=coalesce(used,observed_used),observed_last=coalesce(lastcost,observed_last),
    observed_at=case when remaining is not null then stamp else observed_at end,
    conservative_remaining=case when remaining is null then conservative_remaining when conservative_remaining is null then least(remaining,500) else least(conservative_remaining,remaining) end,
    last_successful_preflight_at=case when job.operation='preflight' and p_error is null and remaining is not null then stamp else last_successful_preflight_at end,
    paused=paused or coalesce(p_error='ODDS_QUOTA_COST',false),
    lease_token=null,lease_until=null,updated_at=stamp where provider=b.provider;
  summary:=jsonb_build_object('requestId',job.id,'operation',job.operation,'status',case when p_error is null then 'succeeded' else 'failed' end,
    'snapshotId',snapshot,'matchedEvents',matched,'availableQuotes',quotes,'quota',jsonb_build_object('remaining',remaining,'used',used,'last',lastcost),'officialVerified',false,'errorCode',p_error);
  update public.gtl_odds_collections set status=case when p_error is null then 'succeeded' else 'failed' end,finished_at=stamp,error_code=p_error,diagnostics=summary where id=job.id;
  return summary;
end $$;

-- One resolver for the scheduled collector's claim and the schedule status read (PR #51 review): the configured
-- published week, only while it is also the newest published week (the week gtl_odds_collection_slate and both
-- begin RPCs collect) and its signature matches the schedule row. Null otherwise, which both callers report as
-- slate_changed.
create or replace function public.gtl_odds_schedule_slate(p_season integer,p_week integer,p_signature jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare s integer; w integer; slate jsonb;
begin
  if p_season is null or p_week is null or p_signature is null then return null; end if;
  select season,week into s,w from public.gtl_weekly_slates order by season desc,week desc limit 1;
  if s is distinct from p_season or w is distinct from p_week then return null; end if;
  slate:=public.gtl_published_slate(p_season,p_week);
  if slate is null or slate->'signature' is distinct from p_signature then return null; end if;
  return slate;
end $$;

-- Body of 20261012213000 except the slate check also requires gtl_odds_schedule_slate.
create or replace function public.gtl_claim_odds_refresh(p_token text,p_run uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg public.gtl_odds_schedule; run public.gtl_odds_refresh_runs; c jsonb; failure text;
  stamp timestamptz:=clock_timestamp(); upcoming integer; claim uuid; budget public.gtl_odds_budget;
begin
  select * into cfg from public.gtl_odds_schedule where id='nfl-12h';
  if not found or not cfg.enabled or p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'GTL_SCHEDULE_AUTH'; end if;
  select * into run from public.gtl_odds_refresh_runs where id=p_run and schedule_id=cfg.id for update;
  stamp:=clock_timestamp();
  -- Authenticate against this exact private run BEFORE returning even a replay.
  -- A leaked/redirected queue token cannot choose actor, slate, budget or another
  -- run, and expires regardless of whether the original worker ever claimed it.
  if not found or encode(sha256(convert_to(p_token,'UTF8')),'hex') is distinct from run.capability_hash
    or run.slot_start<>date_bin(interval '12 hours',stamp,timestamptz '2000-01-01 08:15:00+00')
    or run.created_at<stamp-interval '5 minutes' or run.created_at>stamp then raise exception 'GTL_SCHEDULE_AUTH'; end if;
  if run.status<>'queued' then return jsonb_build_object('replay',true,'runId',run.id,'status',run.status,'reason',run.reason); end if;
  begin c:=public.gtl_odds_collection_slate(cfg.authorized_by);
  exception when others then failure:=case when sqlerrm='GTL_ODDS_FORBIDDEN' then 'commissioner_unavailable' else 'slate_unavailable' end; end;
  if failure is null then
    if public.gtl_odds_schedule_slate(cfg.season,cfg.week,cfg.slate_signature) is null
      or c->'signature' is distinct from cfg.slate_signature or (c->>'season')::integer<>cfg.season or (c->>'week')::integer<>cfg.week then failure:='slate_changed';
    elsif jsonb_typeof(c->'games') is distinct from 'array' or jsonb_array_length(c->'games')<1
      or jsonb_array_length(c->'games')<>jsonb_array_length(cfg.slate_signature->'games') then failure:='slate_unavailable';
    else
      select count(*) into upcoming from jsonb_array_elements(c->'games') g where (g->>'kickoff')::timestamptz>stamp;
      if upcoming=0 then failure:='all_games_started'; end if;
    end if;
  end if;
  if failure is not null then
    update public.gtl_odds_refresh_runs set status='skipped',reason=failure,finished_at=stamp where id=run.id;
    return jsonb_build_object('replay',true,'runId',run.id,'status','skipped','reason',failure);
  end if;
  claim:=gen_random_uuid();
  update public.gtl_odds_refresh_runs set status='running',claim_token=claim,claimed_at=stamp where id=run.id;
  select * into budget from public.gtl_odds_budget where provider='the-odds-api';
  return jsonb_build_object('replay',false,'runId',run.id,'claim',claim,'actorId',cfg.authorized_by,
    'preflightRequestId',run.preflight_request_id,'collectionRequestId',run.collection_request_id,
    'needsPreflight',budget.last_successful_preflight_at is null or budget.last_successful_preflight_at<stamp-interval '24 hours' or budget.conservative_remaining is null);
end $$;

-- Body of 20261012213000 except the slate comes from gtl_odds_schedule_slate.
create or replace function public.gtl_read_odds_schedule(p_user uuid,p_league text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; cfg public.gtl_odds_schedule; run public.gtl_odds_refresh_runs; slate text:='unavailable'; upcoming integer; n integer;
  budget public.gtl_odds_budget; pause_reason text; effective boolean;
begin
  perform public.gtl_weekly_context(p_user,p_league);
  select * into cfg from public.gtl_odds_schedule where id='nfl-12h';
  if found then c:=public.gtl_odds_schedule_slate(cfg.season,cfg.week,cfg.slate_signature); end if;
  if c is not null then
    n:=jsonb_array_length(c->'games');
    select count(*) into upcoming from jsonb_array_elements(c->'games') g where (g->>'kickoff')::timestamptz>clock_timestamp();
    slate:=case when upcoming=0 then 'complete' when upcoming<n then 'partial' else 'eligible' end;
  end if;
  select * into budget from public.gtl_odds_budget where provider='the-odds-api';
  if cfg.enabled then
    if slate='unavailable' then pause_reason:='slate_changed';
    elsif slate='complete' then pause_reason:='all_games_started';
    elsif not exists(select 1 from public.gtl_memberships where user_id=cfg.authorized_by and league_id='sean-troy-luke' and player_id='sean' and role='commissioner' and active) then pause_reason:='commissioner_unavailable';
    elsif budget.paused then pause_reason:='budget_paused';
    elsif budget.conservative_remaining<52 then pause_reason:='budget_guard'; end if;
  end if;
  effective:=coalesce(cfg.enabled,false) and pause_reason is null;
  select * into run from public.gtl_odds_refresh_runs where schedule_id=cfg.id order by slot_start desc limit 1;
  if run.status in ('queued','running') and coalesce(run.claimed_at,run.created_at)<clock_timestamp()-interval '10 minutes' then run.status:='failed'; run.reason:='worker_timeout'; end if;
  return jsonb_build_object('configured',coalesce(cfg.enabled,false),'enabled',effective,'operationalStatus',case when effective then 'active' when cfg.enabled then 'blocked' else 'disabled' end,
    'pauseReason',pause_reason,'cadenceHours',12,'timeZone','UTC','utcTimes',jsonb_build_array('08:15','20:15'),
    'season',cfg.season,'week',cfg.week,
    'nextRunAt',case when effective then date_bin(interval '12 hours',clock_timestamp(),timestamptz '2000-01-01 08:15:00+00')+interval '12 hours' else null end,
    'lastRunAt',run.created_at,'lastStatus',run.status,'lastReason',run.reason,'slateStatus',slate,'referenceOnly',true);
end $$;

-- create or replace keeps existing privileges; each function's original revoke/grant is restated, and the new
-- helpers follow the same service-only rule. gtl_guard_fresh_submission returns trigger and keeps its grant.
revoke all on function public.gtl_line_from_snapshot(jsonb,jsonb,text),public.gtl_submission_reference(jsonb,jsonb,text,timestamptz),
  public.gtl_pending_reference(timestamptz),public.gtl_reference_at_save(integer,integer,jsonb,jsonb,text,timestamptz),
  public.gtl_resolve_pending_reference(integer,integer,text,text,jsonb),public.gtl_resolve_pending_references(integer,integer),
  public.gtl_preflight_submission(uuid,jsonb),public.gtl_guard_fresh_submission(),
  public.gtl_save_weekly_ballot(uuid,text,text,bigint,jsonb,boolean),public.gtl_mutate_personal(uuid,text,jsonb),
  public.gtl_finish_odds_collection(uuid,uuid,uuid,jsonb,jsonb,text),public.gtl_finish_submission_odds_collection(uuid,uuid,uuid,jsonb,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.gtl_line_from_snapshot(jsonb,jsonb,text),public.gtl_submission_reference(jsonb,jsonb,text,timestamptz),
  public.gtl_pending_reference(timestamptz),public.gtl_reference_at_save(integer,integer,jsonb,jsonb,text,timestamptz),
  public.gtl_resolve_pending_reference(integer,integer,text,text,jsonb),public.gtl_resolve_pending_references(integer,integer),
  public.gtl_preflight_submission(uuid,jsonb),public.gtl_guard_fresh_submission(),
  public.gtl_save_weekly_ballot(uuid,text,text,bigint,jsonb,boolean),public.gtl_mutate_personal(uuid,text,jsonb),
  public.gtl_finish_odds_collection(uuid,uuid,uuid,jsonb,jsonb,text),public.gtl_finish_submission_odds_collection(uuid,uuid,uuid,jsonb,jsonb,text)
  to service_role;
revoke all on function public.gtl_odds_schedule_slate(integer,integer,jsonb),public.gtl_claim_odds_refresh(text,uuid),public.gtl_read_odds_schedule(uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.gtl_odds_schedule_slate(integer,integer,jsonb),public.gtl_claim_odds_refresh(text,uuid),public.gtl_read_odds_schedule(uuid,text)
  to service_role;
