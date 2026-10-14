-- M-02 sent_picks_final: a locked-in Guess pick is final, in every writer (redesign build plan, stage 18; D-37 as amended
-- by D-39; D-16, D-23, D-25, D-27).
--
-- replaces public.gtl_guess_locked_in md5 b2b907f908774776eaf8ba94d1ab505e
-- replaces public.gtl_live_rules md5 b66a28a3e35043c9acf77e2b52afd25f
-- replaces public.gtl_save_weekly_ballot md5 295a9f9981a282fd71a2272bf00ff17b
-- replaces public.gtl_mutate_personal md5 c89e708eef680533db3d2219575c9c86
-- replaces public.gtl_guard_fresh_submission md5 b31ecfa094acf6859e428332e4fd8387
--
-- Sean, October 14, 2026 (D-39): "once you make a pick that game is revealed. you can change bets up until game start but you
-- cannot guess the spread or total again once youve locked in that games guess". Each game's Spread guess and Total guess is
-- locked in on its own and is final once locked in. There is no market-level send in the new app; unlocked guesses are drafts.
--
-- How lock-in is defined and recorded (the stage 18 decision):
-- * A guess (one game, one market) is locked in when its pick is a number and either its ballot is submitted (submittedAt:
--   the old app's whole-market Submit locks in every pick at once, and so does every ballot stored before this file) or the
--   ballot's lockedAt names that game. gtl_ballot_locked_in(ballot, game) is that one reading; gtl_guess_locked_in (M-01's
--   readers ask it), the writers and the trigger all use it, and web/src/sentFinal.js lockedIn() reads the same way.
-- * ballot.lockedAt is { gameId: lock-in time }, written only here, with the save's own time. Every lock-in from this apply
--   on is recorded there: a send records every guess it locks in, and a draft save records the games it names in the new
--   optional lockIn list of /personal/ballot (gtl_mutate_personal 'personal/ballot'). A ballot sent before this apply has no
--   lockedAt and is not given one: its submittedAt already says when its guesses were locked in (D-16: nothing is invented).
-- * A lock-in saves that guess's line at this instant (the newest stored qualifying line, any age, or the D-27 pending
--   reference), exactly as a submitted guess does today. A guess locked in earlier keeps its line.
-- * A draft save that leaves every game of the week locked in is the send: it sets submittedAt, so the full-ballot rule, the
--   standings, the scoring path, the feed post (gtl_feed_on_ballot) and every reader treat that market as they treat a sent
--   one today. Until then a draft with some games locked in counts nothing (as a draft today) but opens those games for its
--   owner (M-01's gate reads gtl_guess_locked_in). Picks still close at the week's deadline (lateWindow 'deadline'); M-07
--   (stage 24) moves each game to its own kickoff.
--
-- What is refused, with GTL_BALLOT_LOCKED (409, "Sent picks are final.", mapped in cloud/weekly.mjs, cloud/personal.mjs and the
-- handler's SAFE_VALIDATION_ERRORS before this apply): any change to a locked-in guess, or a save that leaves it out, through
-- gtl_save_weekly_ballot (group ballots), gtl_mutate_personal (Community Picks, Solo and the new app) or a direct update (the
-- gtl_fresh_submission_guard trigger, which also refuses removing or moving a lockedAt time, a forged one, or a change to a
-- locked-in guess's saved line). A locked-in guess cannot be unlocked.
--
-- What is still allowed: drafts change freely until the deadline (an unlocked guess in a ballot with other games locked in
-- too); a pick added for a game a sent ballot has no pick for (it is locked in as it is saved); a re-save that changes
-- nothing; D-27 pending-line resolution on a sent ballot (gtl_resolve_pending_references, unchanged); the D-25 commissioner
-- ruled import (gtl_import_ruled_ballot keeps its bypass, unchanged).
--
-- What does not change: every stored row (old submittedAt, old ballot_edited events and their edit-time references stay,
-- D-16, D-23); gtl_ballot_pick_scores and every reader, so every finished week scores exactly as before (Week 5: Sean 95.8,
-- Steven 91.4, Ben 37.6); the deadline, kickoff locks, the full-ballot rule for a send, receipts, request-id replay and
-- revisions; every other action of gtl_mutate_personal (M-29's favorite/set included), byte for byte. Tables, rows, grants
-- on tables and the other three ballot triggers are unchanged: gtl_feed_on_ballot (posts on the first submittedAt, also
-- when the last lock-in sets it), gtl_optout_ballot_guard (a sit-out still refuses every later write) and gtl_ballot_window
-- (no write before the Monday open).
--
-- gtl_live_rules() now says sentFinal: true and keeps lateWindow 'deadline'. revealAt stays M-01's 'kickoff' once M-01 is
-- applied (its gtl_guess_revealed exists), else 'deadline' (build plan section 3.4), so this file works in either order.
-- Apply M-01 first all the same (Gate M step 1, filename order): M-01 applied after this file would put back its own
-- gtl_guess_locked_in and gtl_live_rules bodies; rerun this file then.
--
-- Function-only and rerunnable: every definition is create or replace with an unchanged argument list, and the grants are
-- restated. Rollback: supabase/rollback/20261015030000_gtl_sent_picks_final.sql (the five previous bodies; the new helper stays,
-- unused). Roll back in reverse apply order (this file's rollback before M-01's).

-- Whether one ballot's guess for one game is locked in: a number pick in a submitted ballot, or one its lockedAt names.
-- Reads only the ballot it is given; the ballot JSON is written only by the server (the writers take picks, a submit flag
-- and lockIn, never lockedAt), and the trigger refuses a forged lockedAt.
create or replace function public.gtl_ballot_locked_in(p_ballot jsonb,p_game text) returns boolean
language sql immutable security invoker set search_path='' as $$
  select coalesce(p_game is not null and jsonb_typeof(p_ballot#>array['picks',p_game])='number'
    and (coalesce(p_ballot->>'submittedAt','')<>'' or jsonb_typeof(p_ballot#>array['lockedAt',p_game])='string'),false)
$$;

-- Body of 20261014223000 (M-01) reading lock-in per game: a pick in a submitted ballot, or a game its lockedAt names.
create or replace function public.gtl_guess_locked_in(p_user uuid,p_season integer,p_week integer,p_mode text,p_game text) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.gtl_weekly_ballots b where b.user_id=p_user and b.season=p_season and b.week=p_week and b.mode=p_mode
    and public.gtl_ballot_locked_in(b.ballot,p_game))
$$;

-- Body of 20261014223000 (M-01) with sentFinal true. lateWindow stays 'deadline' until M-07. revealAt is M-01's field: 'kickoff'
-- once M-01's per-game gate exists, else today's 'deadline'.
create or replace function public.gtl_live_rules() returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('sentFinal',true,'lateWindow','deadline',
    'revealAt',case when to_regprocedure('public.gtl_guess_revealed(uuid,integer,integer,text,text,timestamptz)') is null then 'deadline' else 'kickoff' end)
$$;

-- Body of 20261012230000 with M-02: a locked-in guess is never changed or left out (GTL_BALLOT_LOCKED); a send locks in each
-- guess not locked in yet, saving its line at this save and its lockedAt time; a guess locked in earlier keeps both.
create or replace function public.gtl_save_weekly_ballot(p_user uuid,p_league text,p_mode text,p_revision bigint,p_picks jsonb,p_submit boolean) returns bigint
language plpgsql security invoker set search_path='' as $$
declare c jsonb; s integer; w integer; rev bigint; b public.gtl_weekly_ballots; entry record; v numeric; stamp timestamptz;
  next_ballot jsonb; event jsonb; was_submitted boolean; is_submitted boolean; refs jsonb; ref jsonb; g jsonb;
  changed jsonb:='[]'; market text; signature jsonb; locks jsonb; newly jsonb;
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
    if not public.gtl_ballot_locked_in(b.ballot,entry.key) and (not was_submitted or b.ballot#>array['picks',entry.key] is distinct from entry.value) then changed:=changed||jsonb_build_array(entry.key); end if;
  end loop;
  -- M-02 (D-37, D-39): a locked-in guess is final. This save may neither change it nor leave it out.
  if exists(select 1 from jsonb_object_keys(case when jsonb_typeof(b.ballot->'picks')='object' then b.ballot->'picks' else '{}'::jsonb end) k
      where public.gtl_ballot_locked_in(b.ballot,k) and p_picks->k is distinct from b.ballot#>array['picks',k]) then raise exception 'GTL_BALLOT_LOCKED'; end if;
  if is_submitted and (select count(*) from jsonb_object_keys(p_picks))<>jsonb_array_length(c#>'{state,games}') then raise exception 'GTL_BALLOT_INCOMPLETE'; end if;
  refs:=coalesce(b.ballot->'scoringReferences','{}');
  market:=case when p_mode='guess_total' then 'total' else 'spread' end;
  signature:=public.gtl_weekly_slate(c->'state');
  -- A send locks in every guess not locked in yet, each at this save with the line at this save; a draft locks in none.
  newly:=case when is_submitted then changed else '[]'::jsonb end;
  locks:=case when jsonb_typeof(b.ballot->'lockedAt')='object' then b.ballot->'lockedAt' else '{}'::jsonb end
    ||coalesce((select jsonb_object_agg(x,to_jsonb(stamp)) from jsonb_array_elements_text(newly) x),'{}'::jsonb);
  if is_submitted then
    for g in select game from jsonb_array_elements(c#>'{state,games}') game where newly ? (game->>'id') loop
      if stamp>=(g->>'kickoff')::timestamptz then raise exception 'GTL_PREDICTION_CLOSED'; end if;
      ref:=public.gtl_reference_at_save(s,w,signature,g,market,stamp);
      if ref is null then raise exception 'GTL_PREDICTION_CLOSED'; end if;
      refs:=refs||jsonb_build_object(g->>'id',ref);
    end loop;
  end if;
  -- Preserve original provenance and first submission timestamp on edit.
  next_ballot:=coalesce(b.ballot,'{}')||jsonb_build_object('picks',p_picks,
    'submittedAt',case when was_submitted then b.ballot->'submittedAt' when p_submit then to_jsonb(stamp) else 'null'::jsonb end,
    'updatedAt',stamp,'scoringPolicy','submission-time','scoringReferences',refs)
    ||case when locks<>'{}'::jsonb then jsonb_build_object('lockedAt',locks) else '{}'::jsonb end;
  event:=jsonb_build_object('id',gen_random_uuid(),'player',c->>'playerId','mode',p_mode,
    'type',case when was_submitted then 'ballot_edited' when p_submit then 'ballot_submitted' else 'ballot_saved' end,
    'timestamp',stamp,'before',coalesce(b.ballot->'picks','{}'),'after',p_picks,'changedGameIds',changed,'lockedGameIds',newly,
    'beforeScoringReferences',coalesce(b.ballot->'scoringReferences','{}'),'afterScoringReferences',refs);
  insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot,audit,origin_practice,provenance)
    values(p_user,s,w,p_mode,next_ballot,jsonb_build_array(event),(c->>'practice')::boolean,jsonb_build_array(jsonb_build_object('leagueId',p_league,'playerId',c->>'playerId')))
    on conflict(user_id,season,week,mode) do update set ballot=excluded.ballot,audit=public.gtl_weekly_ballots.audit||excluded.audit,
      origin_practice=public.gtl_weekly_ballots.origin_practice or excluded.origin_practice,provenance=public.gtl_weekly_ballots.provenance||excluded.provenance;
  update public.gtl_weekly_versions set revision=revision+1 where user_id=p_user and season=s and week=w;
  return rev+1;
end $$;

-- Body of 20261014233000 (M-29) except the personal/ballot branch: a locked-in guess is never changed or left out
-- (GTL_BALLOT_LOCKED); the optional lockIn list locks in single games on a draft save; a send locks in each guess not locked in
-- yet; a draft save that leaves every game locked in is the send. Every other action is unchanged.
create or replace function public.gtl_mutate_personal(p_user uuid,p_action text,p_body jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare rev bigint; request uuid; receipt public.gtl_personal_receipts; sig jsonb; s integer; w integer; g jsonb;
  stamp timestamptz; before_value jsonb; after_value jsonb; target text; result jsonb; entry_id uuid;
  old_entry public.gtl_journal_entries; allowed text[]; val numeric; odds numeric; v_market text; quote_time timestamptz; placed_time timestamptz;
  b public.gtl_weekly_ballots; week_rev bigint; pick record; next_ballot jsonb; event jsonb;
  was_submitted boolean; is_submitted boolean; refs jsonb; scoring_ref jsonb; changed jsonb:='[]'; named_game jsonb; snap record;
  lock_in jsonb; locks jsonb; newly jsonb; completes boolean:=false;
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
  -- M-02: personal/ballot also takes an optional lockIn, the games this save locks in (the new app's per-game lock-in, D-39).
  if allowed is null or exists(select 1 from jsonb_object_keys(p_body) k where not(k=any(allowed||array['requestId','revision']||case when p_action='personal/ballot' then array['lockIn'] else array[]::text[] end)))
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
      -- D-40: "Save to Favorites" keeps a stored note. A save that takes the game from not saved (or no row) to saved
      -- and sends an empty note keeps the note already stored, exactly as stored. Every other save writes what it sends.
      if (after_value->>'saved')::boolean and after_value->>'notes'='' and not coalesce((before_value->>'saved')::boolean,false) then
        after_value:=after_value||jsonb_build_object('notes',coalesce(before_value->>'notes',''));
      end if;
      insert into public.gtl_favorites(user_id,season,week,game_id,saved,notes,updated_at) values(p_user,s,w,g->>'id',(after_value->>'saved')::boolean,after_value->>'notes',stamp)
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
        if not public.gtl_ballot_locked_in(b.ballot,pick.key) and (not was_submitted or b.ballot#>array['picks',pick.key] is distinct from pick.value) then changed:=changed||jsonb_build_array(pick.key); end if;
      end loop;
      -- M-02: lockIn names distinct games, each with a guess in this save.
      lock_in:=coalesce(p_body->'lockIn','[]'::jsonb);
      if jsonb_typeof(lock_in) is distinct from 'array' then raise exception 'GTL_PERSONAL_INVALID'; end if;
      if jsonb_array_length(lock_in)>jsonb_array_length(sig->'games')
        or exists(select 1 from jsonb_array_elements(lock_in) x where jsonb_typeof(x) is distinct from 'string' or jsonb_typeof(p_body->'picks'->(x#>>'{}')) is distinct from 'number')
        or (select count(distinct x) from jsonb_array_elements(lock_in) x)<>jsonb_array_length(lock_in) then raise exception 'GTL_PERSONAL_INVALID'; end if;
      -- M-02 (D-37, D-39): a locked-in guess is final. This save may neither change it nor leave it out.
      if exists(select 1 from jsonb_object_keys(case when jsonb_typeof(b.ballot->'picks')='object' then b.ballot->'picks' else '{}'::jsonb end) k
          where public.gtl_ballot_locked_in(b.ballot,k) and p_body->'picks'->k is distinct from b.ballot#>array['picks',k]) then raise exception 'GTL_BALLOT_LOCKED'; end if;
      if is_submitted and (select count(*) from jsonb_object_keys(p_body->'picks'))<>jsonb_array_length(sig->'games') then raise exception 'GTL_BALLOT_INCOMPLETE'; end if;
      -- What this save locks in: on a send, every guess not locked in yet; on a draft save, the lockIn games not locked in yet.
      -- A draft save that leaves every game of the week locked in is the send (D-39: there is no other send step).
      newly:=case when is_submitted then changed else coalesce((select jsonb_agg(x order by x) from jsonb_array_elements_text(lock_in) x
        where not public.gtl_ballot_locked_in(b.ballot,x)),'[]'::jsonb) end;
      if not is_submitted and jsonb_array_length(newly)>0 and not exists(select 1 from jsonb_array_elements(sig->'games') x
          where not (newly ? (x->>'id') or public.gtl_ballot_locked_in(b.ballot,x->>'id'))) then completes:=true; is_submitted:=true; end if;
      locks:=case when jsonb_typeof(b.ballot->'lockedAt')='object' then b.ballot->'lockedAt' else '{}'::jsonb end
        ||coalesce((select jsonb_object_agg(x,to_jsonb(stamp)) from jsonb_array_elements_text(newly) x),'{}'::jsonb);
      -- October 12, 2026: each changed guess saves the newest stored line at this instant, whatever its age, or the
      -- pending reference that the first line collected after it resolves. Kickoff locks are explicit (unchanged rule).
      -- M-02: that is each guess this save locks in; a guess locked in earlier keeps its reference.
      refs:=coalesce(b.ballot->'scoringReferences','{}');
      if jsonb_array_length(newly)>0 then
        for g in select x from jsonb_array_elements(sig->'games') x where newly ? (x->>'id') loop
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
        'submittedAt',case when was_submitted then b.ballot->'submittedAt' when (p_body->>'submit')::boolean or completes then to_jsonb(stamp) else 'null'::jsonb end,
        'updatedAt',stamp,'scoringPolicy','submission-time','scoringReferences',refs)
        ||case when locks<>'{}'::jsonb then jsonb_build_object('lockedAt',locks) else '{}'::jsonb end;
      event:=jsonb_build_object('id',gen_random_uuid(),'player','u_'||replace(p_user::text,'-',''),'mode',p_body->>'mode',
        'type',case when was_submitted then 'ballot_edited' when (p_body->>'submit')::boolean or completes then 'ballot_submitted'
          when jsonb_array_length(newly)>0 then 'guess_locked_in' else 'ballot_saved' end,
        'timestamp',stamp,'before',coalesce(b.ballot->'picks','{}'),'after',p_body->'picks','changedGameIds',changed,'lockedGameIds',newly,
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

-- Body of 20261012230000 (the gtl_fresh_submission_guard trigger) with M-02: before anything else, a locked-in guess keeps its
-- value, its lockedAt time and its saved line, and a lock-in this write adds carries this write's time and a guess; a draft
-- that locks in games has those games checked as a sent guess is (line at this save, before the deadline and kickoff); a send
-- checks every guess it locks in. The D-25 bypass, the D-27 resolution branch and every other check are unchanged.
create or replace function public.gtl_guard_fresh_submission() returns trigger
language plpgsql security invoker set search_path='' as $$
declare prior public.gtl_weekly_ballots; sig jsonb; game jsonb; g jsonb; pick record; ref jsonb;
  expected jsonb; snap public.gtl_market_snapshots; stamp timestamptz; submitted boolean; snapshot_id uuid; ctx text; market text;
  sending boolean; prior_locks jsonb; locks jsonb; added jsonb;
begin
  -- D-25: only gtl_import_ruled_ballot, and only while it is on the stack.
  if current_setting('gtl.ruled_ballot_import',true)='commissioner' then
    get diagnostics ctx=pg_context;
    if ctx like '%function public.gtl_import_ruled_ballot(%' then return new; end if;
  end if;
  select * into prior from public.gtl_weekly_ballots where user_id=new.user_id and season=new.season and week=new.week and mode=new.mode;
  submitted:=coalesce(prior.ballot->>'submittedAt','')<>''; sending:=coalesce(new.ballot->>'submittedAt','')<>'';
  -- M-02 (D-37 as amended by D-39): a locked-in guess is final. Its value and its lock-in time never change and never go,
  -- whichever writer or direct update tries.
  prior_locks:=case when jsonb_typeof(prior.ballot->'lockedAt')='object' then prior.ballot->'lockedAt' else '{}'::jsonb end;
  locks:=case when jsonb_typeof(new.ballot->'lockedAt')='object' then new.ballot->'lockedAt' when new.ballot ? 'lockedAt' then null else '{}'::jsonb end;
  if locks is null then raise exception 'GTL_BALLOT_INVALID'; end if;
  if exists(select 1 from jsonb_object_keys(case when jsonb_typeof(prior.ballot->'picks')='object' then prior.ballot->'picks' else '{}'::jsonb end) k
      where public.gtl_ballot_locked_in(prior.ballot,k) and new.ballot#>array['picks',k] is distinct from prior.ballot#>array['picks',k])
    or exists(select 1 from jsonb_each(prior_locks) e where locks->e.key is distinct from e.value) then raise exception 'GTL_BALLOT_LOCKED'; end if;
  -- A lock-in this write adds carries this write's time and names a guess the write holds.
  select coalesce(jsonb_agg(e.key order by e.key),'[]'::jsonb) into added from jsonb_each(locks) e where not prior_locks ? e.key;
  if exists(select 1 from jsonb_array_elements_text(added) k where locks->k is distinct from new.ballot->'updatedAt'
      or jsonb_typeof(new.ballot#>array['picks',k]) is distinct from 'number') then raise exception 'GTL_BALLOT_INVALID'; end if;
  if not sending then
    if submitted then raise exception 'GTL_BALLOT_INCOMPLETE'; end if;
    -- A draft is checked only when it locks in a game (the new app's per-game lock-in) or touches the reference of a game
    -- locked in earlier; every other draft write passes as before M-02.
    if jsonb_array_length(added)=0 and not exists(select 1 from jsonb_each(prior_locks) e
        where new.ballot#>array['scoringReferences',e.key] is distinct from prior.ballot#>array['scoringReferences',e.key]) then return new; end if;
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
    or sending and (select count(*) from jsonb_object_keys(new.ballot->'picks'))<>jsonb_array_length(sig->'games') then raise exception 'GTL_BALLOT_INCOMPLETE'; end if;
  for pick in select * from jsonb_each(new.ballot->'picks') loop
    ref:=new.ballot#>array['scoringReferences',pick.key];
    -- A guess locked in before this write (every guess of a sent ballot) kept its value above, and keeps its reference.
    if public.gtl_ballot_locked_in(prior.ballot,pick.key) then
      if ref is distinct from prior.ballot#>array['scoringReferences',pick.key] then raise exception 'GTL_SUBMISSION_ODDS_REQUIRED'; end if;
      continue;
    end if;
    -- A send checks every guess it locks in; a draft only the games it locks in.
    continue when not sending and not added ? pick.key;
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

-- create or replace keeps existing privileges; every grant is restated, and the new helper is service-only.
revoke all on function public.gtl_ballot_locked_in(jsonb,text),public.gtl_guess_locked_in(uuid,integer,integer,text,text),public.gtl_live_rules(),
  public.gtl_save_weekly_ballot(uuid,text,text,bigint,jsonb,boolean),public.gtl_mutate_personal(uuid,text,jsonb),public.gtl_guard_fresh_submission()
  from public,anon,authenticated;
grant execute on function public.gtl_ballot_locked_in(jsonb,text),public.gtl_guess_locked_in(uuid,integer,integer,text,text),public.gtl_live_rules(),
  public.gtl_save_weekly_ballot(uuid,text,text,bigint,jsonb,boolean),public.gtl_mutate_personal(uuid,text,jsonb),public.gtl_guard_fresh_submission()
  to service_role;
