-- replaces public.gtl_ballot_locked_in md5 56eff0ef4c7c04f6a42281b56b2beaba
-- replaces public.gtl_live_rules md5 9e387dceae571d5d4ed9ecdc5028f75a
-- replaces public.gtl_guard_fresh_submission md5 c2ccf3417111d058d5f78895e57893a2
-- replaces public.gtl_guard_optout_ballot md5 0eb4dab5e068a37ded51f7613b3257de
-- replaces public.gtl_feed_on_ballot md5 8a02d0347426ca747c4a68112148cf29
-- replaces public.gtl_save_weekly_ballot md5 b55abd454dfcf34961a872a7be622dfe
-- replaces public.gtl_mutate_personal md5 db98bbf421caca41635e3d8275e93ffb
-- replaces public.gtl_ballot_pick_scores md5 2f1d62458da459bfbe88ad6f6c492e94
-- replaces public.gtl_resolve_pending_references md5 02160f4de8ea1c6b148e8db4b9028b7d
-- replaces public.gtl_submission_intent_context md5 4ed003ff2fb44635da043c7ad80c3d34
-- replaces public.gtl_sit_out_week md5 535cf93c7a91aef6c67ef9e2e88c693a
-- replaces public.gtl_forfeit_guess_week md5 324d12ecff7e9eea23a000c504399654
-- replaces public.gtl_read_community md5 5c942f911c8c303cc195f81b0fbcca9a
-- replaces public.gtl_read_community_history md5 65d1213f3c05273e70e6bee33170d393
-- replaces public.gtl_read_lines md5 cfa0b5581ec11daeaa7c0d64a0ad6a57
-- replaces public.gtl_read_guess_picks md5 95998022dbbfd7811860b557828889e1

-- M-07 / D-39, D-41, D-43, D-50: independent immutable locks, own points immediately,
-- shared standings at kickoff. Function-only; no historical row is rewritten.
-- Apply only after M-01, M-02, M-03, M-05, M-06 and M-08, with compatible clients.
-- Apply alone in an approved Tue-Wed window. No hosted action is performed by this file.
-- Rollback restores prior functions; added helpers remain service-only and unused.

create or replace function public.gtl_ballot_locked_in(p_ballot jsonb,p_game text) returns boolean
language sql immutable security invoker set search_path='' as $$
  select coalesce(p_game is not null and jsonb_typeof(p_ballot#>array['picks',p_game])='number'
    and not coalesce(p_ballot->'closedAtKickoff' ? p_game,false)
    and (coalesce(p_ballot->>'submittedAt','')<>'' or jsonb_typeof(p_ballot#>array['lockedAt',p_game])='string'),false)
$$;

create or replace function public.gtl_ballot_has_locked(p_ballot jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
  select exists(select 1 from jsonb_object_keys(case when jsonb_typeof(p_ballot->'picks')='object' then p_ballot->'picks' else '{}'::jsonb end) k
    where public.gtl_ballot_locked_in(p_ballot,k))
$$;

create or replace function public.gtl_guess_game_open(p_season integer,p_week integer,p_game text,p_now timestamptz) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.gtl_weekly_slates s cross join lateral jsonb_array_elements(s.signature->'games') g
    where s.season=p_season and s.week=p_week and g->>'id'=p_game
      and coalesce(p_now,clock_timestamp())>=public.gtl_week_open_at(p_season,p_week)
      and coalesce(p_now,clock_timestamp())<to_timestamp((g->>'kickoff')::numeric))
$$;

create or replace function public.gtl_live_rules() returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('sentFinal',true,'lateWindow','kickoff','revealAt','kickoff','perGameScoring',true)
$$;

create or replace function public.gtl_guess_late(p_ballot jsonb,p_game text) returns jsonb
language sql immutable security invoker set search_path='' as $$
  select case when public.gtl_ballot_locked_in(p_ballot,p_game) then
    case when p_ballot->>'guessRule'='per-game-v1' and p_ballot->'lockedAt' ? p_game then p_ballot#>array['lockedLate',p_game] else public.gtl_ballot_late(p_ballot) end end
$$;

-- One preparation path used by BOTH writers and independently recomputed by the trigger.
-- Client JSON never supplies timestamps, scoring references, late markers or the closed-game list.
create or replace function public.gtl_prepare_guess_ballot(p_season integer,p_week integer,p_mode text,p_prior jsonb,p_picks jsonb,p_submit boolean,p_lock_in jsonb,p_stamp timestamptz) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare sig jsonb; g jsonb; named_game jsonb; e record; gid text; value numeric; picks jsonb:=p_picks;
  locks jsonb:=coalesce(p_prior->'lockedAt','{}'); refs jsonb:=coalesce(p_prior->'scoringReferences','{}');
  newly jsonb:='[]'; changed jsonb:='[]'; closed jsonb:=coalesce(p_prior->'closedAtKickoff','[]');
  late_locks jsonb:=coalesce(p_prior->'lockedLate','{}'); late jsonb; deadline timestamptz;
  was_submitted boolean:=coalesce(p_prior->>'submittedAt','')<>''; completes boolean; ref jsonb; result jsonb;
begin
  select signature into sig from public.gtl_weekly_slates where season=p_season and week=p_week;
  if sig is null or p_mode not in ('guess_spread','guess_total') or p_mode is null or p_submit is null
    or jsonb_typeof(picks) is distinct from 'object' or jsonb_typeof(p_lock_in) is distinct from 'array'
    or p_stamp is null or not isfinite(p_stamp) then raise exception 'GTL_BALLOT_INVALID'; end if;
  if p_stamp<public.gtl_week_open_at(p_season,p_week) then raise exception 'GTL_PREDICTION_NOT_OPEN'; end if;
  if exists(select 1 from jsonb_array_elements(p_lock_in) x where jsonb_typeof(x)<>'string' or jsonb_typeof(picks->(x#>>'{}')) is distinct from 'number')
    or (select count(distinct x) from jsonb_array_elements(p_lock_in) x)<>jsonb_array_length(p_lock_in) then raise exception 'GTL_BALLOT_INVALID'; end if;
  for e in select * from jsonb_each(picks) loop
    if jsonb_typeof(e.value)<>'number' or not exists(select 1 from jsonb_array_elements(sig->'games') x where x->>'id'=e.key) then raise exception 'GTL_BALLOT_INVALID'; end if;
    value:=e.value::numeric;
    if value*2<>trunc(value*2) or (p_mode='guess_spread' and value not between -100 and 100) or (p_mode='guess_total' and value not between 0 and 200) then raise exception 'GTL_BALLOT_INVALID'; end if;
  end loop;
  deadline:=to_timestamp((sig->>'deadline')::numeric);
  late:=case when p_stamp>=deadline then jsonb_build_object('deadline',deadline,'minutes',floor(extract(epoch from p_stamp-deadline)/60)::integer) end;
  for g in select x from jsonb_array_elements(sig->'games') x loop
    gid:=g->>'id';
    if public.gtl_ballot_locked_in(p_prior,gid) then
      if picks->gid is distinct from p_prior#>array['picks',gid] then raise exception 'GTL_BALLOT_LOCKED'; end if;
      continue;
    end if;
    if not public.gtl_guess_game_open(p_season,p_week,gid,p_stamp) then
      if (picks ? gid and picks->gid is distinct from p_prior#>array['picks',gid]) or p_lock_in ? gid then raise exception 'GTL_GAME_CLOSED'; end if;
      -- An omitted started draft is retained, but never becomes a locked pick through submittedAt.
      if p_prior->'picks' ? gid then picks:=picks||jsonb_build_object(gid,p_prior#>array['picks',gid]); end if;
      if not closed ? gid then closed:=closed||to_jsonb(gid); end if;
      continue;
    end if;
    if p_submit and jsonb_typeof(picks->gid) is distinct from 'number' then raise exception 'GTL_BALLOT_INCOMPLETE'; end if;
    if picks->gid is distinct from p_prior#>array['picks',gid] then changed:=changed||to_jsonb(gid); end if;
    if jsonb_typeof(picks->gid)='number' and (p_submit or p_lock_in ? gid) then
      named_game:=public.gtl_slate_game(p_season,p_week,sig,gid);
      if named_game is null then raise exception 'GTL_PERSONAL_SLATE'; end if;
      ref:=public.gtl_reference_at_save(p_season,p_week,sig,named_game,case when p_mode='guess_spread' then 'spread' else 'total' end,p_stamp);
      if ref is null then raise exception 'GTL_GAME_CLOSED'; end if;
      newly:=newly||to_jsonb(gid); locks:=locks||jsonb_build_object(gid,p_stamp); refs:=refs||jsonb_build_object(gid,ref);
      if late is not null then late_locks:=late_locks||jsonb_build_object(gid,late); end if;
    end if;
  end loop;
  completes:=jsonb_array_length(newly)>0 and not exists(select 1 from jsonb_array_elements(sig->'games') x
    where not (newly ? (x->>'id') or public.gtl_ballot_locked_in(p_prior,x->>'id')));
  result:=coalesce(p_prior,'{}')||jsonb_build_object('picks',picks,'updatedAt',p_stamp,
    'submittedAt',case when was_submitted then p_prior->'submittedAt' when p_submit or completes then to_jsonb(p_stamp) else 'null'::jsonb end,
    'scoringPolicy','submission-time','scoringReferences',refs,'lockedAt',locks,'closedAtKickoff',closed,'lockedLate',late_locks,'guessRule','per-game-v1');
  if jsonb_array_length(newly)>0 and late is not null then result:=result||jsonb_build_object('late',coalesce(p_prior->'late',late)); end if;
  return jsonb_build_object('ballot',result,'changed',changed,'newly',newly);
end $$;

create or replace function public.gtl_resolution_before_kickoff(p_season integer,p_week integer,p_game text,p_ref jsonb) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.gtl_weekly_slates s cross join lateral jsonb_array_elements(s.signature->'games') g
    where s.season=p_season and s.week=p_week and g->>'id'=p_game
      and (p_ref->>'capturedAt')::timestamptz<to_timestamp((g->>'kickoff')::numeric)
      and (p_ref->>'observedAt')::timestamptz<to_timestamp((g->>'kickoff')::numeric))
$$;

-- A resolution update changes only existing locked pending references to their deterministic answer.
-- Both the freshness trigger and the opt-out trigger use the same proof; a setting cannot bypass either.
create or replace function public.gtl_valid_pending_resolution(p_season integer,p_week integer,p_mode text,p_before jsonb,p_after jsonb) returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare e record; prior jsonb; expected jsonb;
begin
  if p_before is null or (p_before-'scoringReferences') is distinct from (p_after-'scoringReferences')
    or p_before->'scoringReferences' is not distinct from p_after->'scoringReferences'
    or jsonb_typeof(p_before->'scoringReferences') is distinct from 'object' or jsonb_typeof(p_after->'scoringReferences') is distinct from 'object'
    or (select array_agg(k order by k) from jsonb_object_keys(p_before->'scoringReferences') k) is distinct from
       (select array_agg(k order by k) from jsonb_object_keys(p_after->'scoringReferences') k) then return false; end if;
  for e in select * from jsonb_each(p_after->'scoringReferences') loop
    prior:=p_before#>array['scoringReferences',e.key]; continue when e.value is not distinct from prior;
    if not public.gtl_ballot_locked_in(p_before,e.key) or prior->>'status' is distinct from 'pending' then return false; end if;
    expected:=public.gtl_resolve_pending_reference(p_season,p_week,p_mode,e.key,prior);
    if expected is null or expected is distinct from e.value then return false; end if;
    if p_before->>'guessRule'='per-game-v1' and not public.gtl_resolution_before_kickoff(p_season,p_week,e.key,expected) then return false; end if;
  end loop;
  return true;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return false;
end $$;

create or replace function public.gtl_guard_fresh_submission() returns trigger
language plpgsql security invoker set search_path='' as $$
declare prior public.gtl_weekly_ballots; stamp timestamptz; locks jsonb; added jsonb; expected jsonb; ctx text; k text;
begin
  if tg_op='UPDATE' and (new.user_id,new.season,new.week,new.mode) is distinct from (old.user_id,old.season,old.week,old.mode) then raise exception 'GTL_BALLOT_LOCKED'; end if;
  if current_setting('gtl.ruled_ballot_import',true)='commissioner' then
    get diagnostics ctx=pg_context;
    if ctx like '%function public.gtl_import_ruled_ballot(%' then return new; end if;
  end if;
  select * into prior from public.gtl_weekly_ballots where user_id=new.user_id and season=new.season and week=new.week and mode=new.mode;
  if new.ballot is not distinct from prior.ballot then return new; end if;
  if public.gtl_valid_pending_resolution(new.season,new.week,new.mode,prior.ballot,new.ballot) then return new; end if;
  if exists(select 1 from jsonb_object_keys(coalesce(prior.ballot->'picks','{}')) key
    where public.gtl_ballot_locked_in(prior.ballot,key) and (new.ballot#>array['picks',key] is distinct from prior.ballot#>array['picks',key]
      or not public.gtl_ballot_locked_in(new.ballot,key))) then raise exception 'GTL_BALLOT_LOCKED'; end if;
  if exists(select 1 from jsonb_each(coalesce(prior.ballot->'lockedAt','{}')) e where new.ballot#>array['lockedAt',e.key] is distinct from e.value) then raise exception 'GTL_BALLOT_LOCKED'; end if;
  if exists(select 1 from jsonb_each(coalesce(new.ballot->'picks','{}')) e
    where not public.gtl_ballot_locked_in(prior.ballot,e.key)
      and (e.value is distinct from prior.ballot#>array['picks',e.key] or public.gtl_ballot_locked_in(new.ballot,e.key))
      and not public.gtl_guess_game_open(new.season,new.week,e.key,clock_timestamp())) then raise exception 'GTL_GAME_CLOSED'; end if;
  stamp:=(new.ballot->>'updatedAt')::timestamptz;
  -- Do not accept a guessedAt/lock timestamp forged into the past or future, even by a direct service-role write.
  if stamp is null or not isfinite(stamp) or stamp<statement_timestamp() or stamp>clock_timestamp() then raise exception 'GTL_SUBMISSION_ODDS_REQUIRED'; end if;
  locks:=new.ballot->'lockedAt';
  if jsonb_typeof(locks) is distinct from 'object' then raise exception 'GTL_BALLOT_INVALID'; end if;
  select coalesce(jsonb_agg(e.key),'[]') into added from jsonb_each(locks) e where not coalesce(prior.ballot->'lockedAt','{}') ? e.key;
  if exists(select 1 from jsonb_array_elements_text(added) gid where not public.gtl_guess_game_open(new.season,new.week,gid,clock_timestamp())) then raise exception 'GTL_GAME_CLOSED'; end if;
  expected:=public.gtl_prepare_guess_ballot(new.season,new.week,new.mode,prior.ballot,new.ballot->'picks',
    coalesce(new.ballot->>'submittedAt','')<>'' and coalesce(prior.ballot->>'submittedAt','')='',added,stamp)->'ballot';
  foreach k in array array['picks','submittedAt','updatedAt','lockedAt','scoringReferences','scoringPolicy','closedAtKickoff','lockedLate','late','guessRule'] loop
    if new.ballot->k is distinct from expected->k then raise exception 'GTL_SUBMISSION_ODDS_REQUIRED'; end if;
  end loop;
  return new;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception 'GTL_SUBMISSION_ODDS_REQUIRED';
end $$;

create or replace function public.gtl_guard_optout_ballot() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from public.gtl_weekly_optouts o where o.user_id=new.user_id and o.season=new.season and o.week=new.week and o.mode=new.mode)
    and not (tg_op='UPDATE' and public.gtl_valid_pending_resolution(new.season,new.week,new.mode,old.ballot,new.ballot)) then raise exception 'GTL_COMMUNITY_SAT_OUT'; end if;
  return new;
end $$;

create or replace function public.gtl_feed_on_ballot() returns trigger
language plpgsql security invoker set search_path='' as $$
declare first_lock timestamptz;
begin
  if public.gtl_ballot_has_locked(new.ballot) and not new.origin_practice
    and (tg_op='INSERT' or not public.gtl_ballot_has_locked(old.ballot)) then
    select min(value::timestamptz) into first_lock from jsonb_each_text(coalesce(new.ballot->'lockedAt','{}'));
    first_lock:=coalesce(first_lock,(new.ballot->>'submittedAt')::timestamptz);
    insert into public.gtl_feed_posts(actor_id,kind,season,week,mode,payload,dedupe_key,created_at)
      values(new.user_id,'ballot_submitted',new.season,new.week,new.mode,jsonb_build_object('late',new.ballot->'late'),
        format('ballot:%s:%s:%s:%s',new.user_id,new.season,new.week,new.mode),first_lock) on conflict do nothing;
  end if;
  return new;
end $$;

-- This private receipt is derived from the single scoring path, never from latest consensus.
create or replace function public.gtl_guess_score_receipt(p_user uuid,p_season integer,p_week integer,p_mode text,p_now timestamptz) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare b public.gtl_weekly_ballots; eligible boolean; result jsonb; now_at timestamptz:=coalesce(p_now,clock_timestamp());
begin
  if p_user is null or not exists(select 1 from public.gtl_profiles where user_id=p_user) or p_mode not in ('guess_spread','guess_total') then raise exception 'GTL_PERSONAL_PROFILE'; end if;
  select * into b from public.gtl_weekly_ballots where user_id=p_user and season=p_season and week=p_week and mode=p_mode;
  eligible:=public.gtl_ballot_eligible(p_user,p_season,p_week,p_mode,coalesce(b.origin_practice,false));
  select jsonb_build_object('season',p_season,'week',p_week,'mode',p_mode,'scoreTiming','immediate','eligible',eligible,
    'satOut',exists(select 1 from public.gtl_weekly_optouts o where o.user_id=p_user and o.season=p_season and o.week=p_week and o.mode=p_mode),
    'weekPoints',sum(ps.points) filter(where eligible),'weekScored',count(ps.points) filter(where eligible),
    'standingsPoints',sum(ps.points) filter(where eligible and ps.kickoff<=now_at),
    'awaitingKickoffPoints',sum(ps.points) filter(where eligible and ps.kickoff>now_at),
    'games',coalesce(jsonb_agg(jsonb_build_object('gameId',ps.game_id,'guess',ps.guess,'reference',ps.reference,
      'points',case when eligible then ps.points end,'eligible',eligible,'lockedIn',true,
      'lockedAt',coalesce(b.ballot#>array['lockedAt',ps.game_id],b.ballot->'submittedAt'),
      'late',public.gtl_guess_late(b.ballot,ps.game_id),'kickoff',ps.kickoff,'started',ps.kickoff<=now_at) order by ps.kickoff,ps.game_id),'[]'))
  into result from public.gtl_ballot_pick_scores(p_season,p_week,p_mode,b.ballot,b.audit) ps
  where public.gtl_ballot_locked_in(b.ballot,ps.game_id);
  return result;
end $$;


create or replace function public.gtl_save_weekly_ballot(p_user uuid,p_league text,p_mode text,p_revision bigint,p_picks jsonb,p_submit boolean) returns bigint
language plpgsql security invoker set search_path='' as $$
declare c jsonb; s integer; w integer; rev bigint; b public.gtl_weekly_ballots; entry record; v numeric; stamp timestamptz;
  next_ballot jsonb; event jsonb; was_submitted boolean; is_submitted boolean; refs jsonb; ref jsonb; g jsonb;
  changed jsonb:='[]'; market text; signature jsonb; locks jsonb; newly jsonb; prepared jsonb;
begin
  c:=public.gtl_weekly_context(p_user,p_league); s:=(c->>'season')::integer; w:=(c->>'week')::integer;
  if p_mode is null or p_mode not in ('guess_spread','guess_total') or p_picks is null or jsonb_typeof(p_picks)<>'object' or p_submit is null then raise exception 'GTL_BALLOT_INVALID'; end if;
  insert into public.gtl_weekly_versions(user_id,season,week) values(p_user,s,w) on conflict do nothing;
  select revision into rev from public.gtl_weekly_versions where user_id=p_user and season=s and week=w for update;
  if p_revision is null or p_revision<>rev then raise exception 'GTL_WEEKLY_CONFLICT'; end if;
  select * into b from public.gtl_weekly_ballots where user_id=p_user and season=s and week=w and mode=p_mode for update;
  stamp:=clock_timestamp();
  prepared:=public.gtl_prepare_guess_ballot(s,w,p_mode,b.ballot,p_picks,p_submit,'[]'::jsonb,stamp);
  next_ballot:=prepared->'ballot'; changed:=prepared->'changed'; newly:=prepared->'newly';
  was_submitted:=coalesce(b.ballot->>'submittedAt','')<>'';
  refs:=next_ballot->'scoringReferences'; p_picks:=next_ballot->'picks';
  event:=jsonb_build_object('id',gen_random_uuid(),'player',c->>'playerId','mode',p_mode,
    'type',case when was_submitted then 'ballot_edited' when p_submit then 'ballot_submitted' else 'ballot_saved' end,
    'timestamp',stamp,'before',coalesce(b.ballot->'picks','{}'),'after',p_picks,'changedGameIds',changed,'lockedGameIds',newly,
    'beforeScoringReferences',coalesce(b.ballot->'scoringReferences','{}'),'afterScoringReferences',refs,'late',next_ballot->'late');
  insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot,audit,origin_practice,provenance)
    values(p_user,s,w,p_mode,next_ballot,jsonb_build_array(event),(c->>'practice')::boolean,jsonb_build_array(jsonb_build_object('leagueId',p_league,'playerId',c->>'playerId')))
    on conflict(user_id,season,week,mode) do update set ballot=excluded.ballot,audit=public.gtl_weekly_ballots.audit||excluded.audit,
      origin_practice=public.gtl_weekly_ballots.origin_practice or excluded.origin_practice,provenance=public.gtl_weekly_ballots.provenance||excluded.provenance;
  update public.gtl_weekly_versions set revision=revision+1 where user_id=p_user and season=s and week=w;
  return rev+1;
end $$;

create or replace function public.gtl_mutate_personal(p_user uuid,p_action text,p_body jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare rev bigint; request uuid; receipt public.gtl_personal_receipts; sig jsonb; s integer; w integer; g jsonb;
  stamp timestamptz; before_value jsonb; after_value jsonb; target text; result jsonb; entry_id uuid;
  old_entry public.gtl_journal_entries; allowed text[]; val numeric; odds numeric; v_market text; quote_time timestamptz; placed_time timestamptz;
  b public.gtl_weekly_ballots; week_rev bigint; pick record; next_ballot jsonb; event jsonb;
  was_submitted boolean; is_submitted boolean; refs jsonb; scoring_ref jsonb; changed jsonb:='[]'; named_game jsonb; snap record;
  lock_in jsonb; locks jsonb; newly jsonb; completes boolean:=false; prepared jsonb;
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
      stamp:=clock_timestamp();
      prepared:=public.gtl_prepare_guess_ballot(s,w,p_body->>'mode',b.ballot,p_body->'picks',(p_body->>'submit')::boolean,coalesce(p_body->'lockIn','[]'::jsonb),stamp);
      next_ballot:=prepared->'ballot'; changed:=prepared->'changed'; newly:=prepared->'newly';
      was_submitted:=coalesce(b.ballot->>'submittedAt','')<>'';
      completes:=coalesce(next_ballot->>'submittedAt','')<>'' and not was_submitted;
      refs:=next_ballot->'scoringReferences';
      event:=jsonb_build_object('id',gen_random_uuid(),'player','u_'||replace(p_user::text,'-',''),'mode',p_body->>'mode',
        'type',case when was_submitted then 'ballot_edited' when (p_body->>'submit')::boolean or completes then 'ballot_submitted'
          when jsonb_array_length(newly)>0 then 'guess_locked_in' else 'ballot_saved' end,
        'timestamp',stamp,'before',coalesce(b.ballot->'picks','{}'),'after',next_ballot->'picks','changedGameIds',changed,'lockedGameIds',newly,
        'beforeScoringReferences',coalesce(b.ballot->'scoringReferences','{}'),'afterScoringReferences',refs,'late',next_ballot->'late');
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
  if p_action='personal/ballot' then
    result:=result||jsonb_build_object('scoringReceipt',public.gtl_guess_score_receipt(p_user,s,w,p_body->>'mode',stamp));
  end if;
  insert into public.gtl_personal_receipts(user_id,request_id,action,payload,result,created_at) values(p_user,request,p_action,p_body,result,stamp);
  return result;
end $$;

create or replace function public.gtl_ballot_pick_scores(p_season integer,p_week integer,p_mode text,p_ballot jsonb,p_audit jsonb)
returns table(game_id text,kickoff timestamptz,guess numeric,reference jsonb,points numeric)
language plpgsql stable security invoker set search_path='' as $$
declare sig jsonb; g jsonb; gid text; saved jsonb; submitted boolean; market text; guessed timestamptz; unknown boolean; stored timestamptz;
begin
  select z.signature into sig from public.gtl_weekly_slates z where z.season=p_season and z.week=p_week;
  if sig is null or p_mode is null or p_mode not in ('guess_spread','guess_total') then return; end if;
  submitted:=coalesce(p_ballot->>'submittedAt','')<>'';
  unknown:=public.gtl_submission_time_unknown(p_ballot);
  if submitted and unknown then
    begin stored:=(p_ballot->>'submittedAt')::timestamptz; exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then stored:=null; end;
  end if;
  market:=case when p_mode='guess_spread' then 'spread' else 'total' end;
  for g in select x from jsonb_array_elements(sig->'games') x order by (x->>'kickoff')::numeric,x->>'id' loop
    gid:=g->>'id'; game_id:=gid; kickoff:=to_timestamp((g->>'kickoff')::numeric);
    guess:=case when jsonb_typeof(p_ballot#>array['picks',gid])='number' then (p_ballot#>>array['picks',gid])::numeric end;
    saved:=p_ballot#>array['scoringReferences',gid];
    if jsonb_typeof(saved)='object' then
      reference:=jsonb_build_object('basis',case when saved->>'basis'='commissioner-ruled' then 'commissioner-ruled' else 'saved' end,
        'label',case when saved->>'basis'='commissioner-ruled' then 'commissioner-ruled line' else 'line saved with guess' end,
        'rule',saved->'basis','status',saved->>'status',
        'value',case when saved->>'status'='available' and jsonb_typeof(saved->'value')='number' then saved->'value' end,
        'source',saved->'source','sourceUrl',saved->'sourceUrl','bookCount',saved->'bookCount','snapshotId',saved->'snapshotId',
        'capturedAt',saved->'capturedAt','observedAt',saved->'observedAt','savedAt',saved->'savedAt','gapSeconds',saved->'ageSeconds',
        'decision',saved->'decision','reason',saved->'reason');
    elsif submitted then
      guessed:=public.gtl_guess_instant(p_ballot,p_audit,gid);
      if guessed is null then
        reference:=jsonb_build_object('basis','none','label','submission time unavailable','status','unavailable','value',null,
          'reason','submission-time-unavailable','guessedAt',null,'guessedAtKnown',false);
      else
        reference:=public.gtl_line_at_guess(p_season,p_week,sig,public.gtl_slate_game(p_season,p_week,sig,gid),market,guessed)
          ||jsonb_build_object('guessedAtKnown',not (unknown and guessed is not distinct from stored));
      end if;
    else
      reference:=null;
    end if;
    points:=case when public.gtl_ballot_locked_in(p_ballot,gid) and guess is not null and reference->>'status'='available' and jsonb_typeof(reference->'value')='number'
      then public.gtl_pick_points(guess,(reference->>'value')::numeric) end;
    return next;
  end loop;
end $$;

create or replace function public.gtl_resolve_pending_references(p_season integer,p_week integer) returns integer
language plpgsql security invoker set search_path='' as $$
declare b public.gtl_weekly_ballots; r record; refs jsonb; resolved jsonb; changed jsonb; n integer:=0; stamp timestamptz;
begin
  for b in select * from public.gtl_weekly_ballots x where x.season=p_season and x.week=p_week
      and public.gtl_ballot_has_locked(x.ballot) and jsonb_typeof(x.ballot->'scoringReferences')='object'
      and exists(select 1 from jsonb_each(x.ballot->'scoringReferences') e where e.value->>'status'='pending')
      order by x.user_id,x.mode for update loop
    refs:=b.ballot->'scoringReferences'; changed:='[]';
    for r in select key,value from jsonb_each(b.ballot->'scoringReferences') where value->>'status'='pending' order by key loop
      continue when not public.gtl_ballot_locked_in(b.ballot,r.key);
      resolved:=public.gtl_resolve_pending_reference(b.season,b.week,b.mode,r.key,r.value);
      if b.ballot->>'guessRule'='per-game-v1' and resolved is not null and not public.gtl_resolution_before_kickoff(b.season,b.week,r.key,resolved) then resolved:=null; end if;
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

create or replace function public.gtl_submission_intent_context(p_user uuid,p_intent jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; sig jsonb; games jsonb; s integer; w integer; v_mode text; picks jsonb;
  rev bigint; personal_rev bigint; b public.gtl_weekly_ballots; entry record; val numeric;
  submitted boolean; changed jsonb:='[]'; allowed text[]; stamp timestamptz; r public.gtl_personal_receipts;
  request uuid; personal_body jsonb;
begin
  if p_user is null or p_intent is null or jsonb_typeof(p_intent)<>'object' or octet_length(p_intent::text)>16384 then raise exception 'GTL_BALLOT_INVALID'; end if;
  v_mode:=p_intent->>'mode'; picks:=p_intent->'picks';
  if v_mode is null or v_mode not in ('guess_spread','guess_total') or jsonb_typeof(picks) is distinct from 'object'
    or jsonb_typeof(p_intent->'submit') is distinct from 'boolean'
    or jsonb_typeof(p_intent->'revision') is distinct from 'number' or (p_intent->>'revision') !~ '^[0-9]{1,16}$'
    or (p_intent->>'revision')::numeric>9007199254740990 then raise exception 'GTL_BALLOT_INVALID'; end if;
  if p_intent ? 'leagueId' then
    allowed:=array['leagueId','mode','revision','picks','submit'];
    if jsonb_typeof(p_intent->'leagueId') is distinct from 'string' or length(p_intent->>'leagueId') not between 1 and 200 then raise exception 'GTL_BALLOT_INVALID'; end if;
    if exists(select 1 from jsonb_object_keys(p_intent) k where not(k=any(allowed))) then raise exception 'GTL_BALLOT_INVALID'; end if;
    c:=public.gtl_weekly_context(p_user,p_intent->>'leagueId');
    s:=(c->>'season')::integer; w:=(c->>'week')::integer; games:=c#>'{state,games}'; sig:=public.gtl_weekly_slate(c->'state');
  else
    allowed:=array['season','week','mode','revision','picks','submit','personalRevision','requestId'];
    if not(p_intent ?& allowed) or exists(select 1 from jsonb_object_keys(p_intent) k where not(k=any(allowed||array['lockIn'])))
      or jsonb_typeof(p_intent->'season') is distinct from 'number' or (p_intent->>'season') !~ '^[0-9]{4}$'
      or jsonb_typeof(p_intent->'week') is distinct from 'number' or (p_intent->>'week') !~ '^[0-9]{1,2}$'
      or jsonb_typeof(p_intent->'personalRevision') is distinct from 'number' or (p_intent->>'personalRevision') !~ '^[0-9]{1,16}$'
      or (p_intent->>'personalRevision')::numeric>9007199254740990 then raise exception 'GTL_PERSONAL_INVALID'; end if;
    begin request:=(p_intent->>'requestId')::uuid; exception when invalid_text_representation then raise exception 'GTL_PERSONAL_INVALID'; end;
    if request is null then raise exception 'GTL_PERSONAL_INVALID'; end if;
    s:=(p_intent->>'season')::integer; w:=(p_intent->>'week')::integer;
    sig:=public.gtl_personal_context(p_user,s,w);
    select revision into personal_rev from public.gtl_personal_versions where user_id=p_user for update;
    personal_body:=(p_intent-array['personalRevision','revision'])||jsonb_build_object('revision',p_intent->'personalRevision','weeklyRevision',p_intent->'revision');
    select * into r from public.gtl_personal_receipts where user_id=p_user and request_id=request;
    if found then
      if r.action<>'personal/ballot' or r.payload<>personal_body then raise exception 'GTL_PERSONAL_RETRY_CONFLICT'; end if;
      return jsonb_build_object('replay',true,'requiresReferences',false,'ready',true);
    end if;
    if coalesce(personal_rev,0)<>(p_intent->>'personalRevision')::bigint then raise exception 'GTL_PERSONAL_CONFLICT'; end if;
    select t.games into games from public.gtl_schedule_templates t where t.season=s and t.week=w
      and public.gtl_weekly_slate(jsonb_build_object('league',jsonb_build_object('season',s,'week',w,'deadline',t.deadline),'games',t.games))=sig
      order by t.created_at desc,t.id limit 1;
    if games is null then raise exception 'GTL_PERSONAL_SLATE'; end if;
  end if;
  select revision into rev from public.gtl_weekly_versions where user_id=p_user and season=s and week=w for update;
  if coalesce(rev,0)<>(p_intent->>'revision')::bigint then raise exception 'GTL_WEEKLY_CONFLICT'; end if;
  stamp:=clock_timestamp();
  select * into b from public.gtl_weekly_ballots where user_id=p_user and season=s and week=w and mode=v_mode;
  changed:=public.gtl_prepare_guess_ballot(s,w,v_mode,b.ballot,picks,(p_intent->>'submit')::boolean,coalesce(p_intent->'lockIn','[]'::jsonb),stamp)->'newly';
  return jsonb_build_object('season',s,'week',w,'signature',sig,'games',games,'changedGameIds',changed,
    'market',case when v_mode='guess_spread' then 'spread' else 'total' end,'requiresReferences',jsonb_array_length(changed)>0,'replay',false);
end $$;

create or replace function public.gtl_sit_out_week(p_user uuid,p_season integer,p_week integer,p_mode text,p_now timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare sig jsonb; now_at timestamptz:=coalesce(p_now,clock_timestamp()); inserted boolean; locked_revision bigint;
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_season is null or p_week is null or p_mode is null or p_mode not in ('guess_spread','guess_total') then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  select signature into sig from public.gtl_weekly_slates where season=p_season and week=p_week;
  if sig is null then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  insert into public.gtl_weekly_versions(user_id,season,week) values(p_user,p_season,p_week) on conflict do nothing;
  select revision into locked_revision from public.gtl_weekly_versions where user_id=p_user and season=p_season and week=p_week for update;
  now_at:=greatest(now_at,clock_timestamp());
  if not exists(select 1 from jsonb_array_elements(sig->'games') g where public.gtl_guess_game_open(p_season,p_week,g->>'id',now_at)) then raise exception 'GTL_COMMUNITY_CLOSED'; end if;
  insert into public.gtl_weekly_optouts(user_id,season,week,mode,created_at) values(p_user,p_season,p_week,p_mode,now_at) on conflict do nothing;
  inserted:=found;
  if inserted then insert into public.gtl_access_audit(actor_id,event) values(p_user,format('sit_out:%s:%s:%s',p_season,p_week,p_mode)); end if;
  return jsonb_build_object('season',p_season,'week',p_week,'mode',p_mode,'satOut',true,'replayed',not inserted);
end $$;

create or replace function public.gtl_forfeit_guess_week(p_user uuid,p_season integer,p_week integer,p_reason text,p_now timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare sig jsonb; now_at timestamptz:=coalesce(p_now,clock_timestamp()); closes_at timestamptz; f public.gtl_week_forfeits; sat text[];
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_season is null or p_week is null or p_reason is null or p_reason not in ('skip','reveal') then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  select z.signature into sig from public.gtl_weekly_slates z where z.season=p_season and z.week=p_week;
  if sig is null then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  insert into public.gtl_weekly_versions(user_id,season,week) values(p_user,p_season,p_week) on conflict do nothing;
  perform 1 from public.gtl_weekly_versions v where v.user_id=p_user and v.season=p_season and v.week=p_week for update;
  select * into f from public.gtl_week_forfeits x where x.user_id=p_user and x.season=p_season and x.week=p_week;
  if found then
    return jsonb_build_object('season',f.season,'week',f.week,'reason',f.reason,'modes',to_jsonb(f.modes),'createdAt',f.created_at,'replayed',true);
  end if;
  now_at:=greatest(now_at,clock_timestamp());
  select max(to_timestamp((g->>'kickoff')::double precision)) into closes_at
    from jsonb_array_elements(case when jsonb_typeof(sig->'games')='array' then sig->'games' else '[]'::jsonb end) g;
  if closes_at is null or now_at>=closes_at then raise exception 'GTL_FORFEIT_CLOSED'; end if;
  with inserted as (
    insert into public.gtl_weekly_optouts(user_id,season,week,mode,created_at)
      select p_user,p_season,p_week,m->>'mode',now_at from jsonb_array_elements(public.gtl_forfeit_markets(p_user,p_season,p_week)) m
      where m->>'status'='open'
      on conflict do nothing returning mode)
  select coalesce(array_agg(mode order by mode),'{}') into sat from inserted;
  if cardinality(sat)=0 then raise exception 'GTL_FORFEIT_NOTHING'; end if;
  insert into public.gtl_week_forfeits(user_id,season,week,reason,modes,created_at) values(p_user,p_season,p_week,p_reason,sat,now_at) returning * into f;
  insert into public.gtl_access_audit(actor_id,event) values(p_user,format('forfeit:%s:%s:%s:%s',p_season,p_week,p_reason,array_to_string(sat,',')));
  return jsonb_build_object('season',f.season,'week',f.week,'reason',f.reason,'modes',to_jsonb(f.modes),'createdAt',f.created_at,'replayed',false);
end $$;

create or replace function public.gtl_read_community(p_user uuid,p_before timestamptz default null,p_limit integer default 30,p_now timestamptz default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s integer; w integer; sig jsonb; deadline timestamptz; game_count integer; result jsonb; now_at timestamptz:=coalesce(p_now,clock_timestamp());
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  select season,week,signature into s,w,sig from public.gtl_weekly_slates order by season desc,week desc limit 1;
  deadline:=to_timestamp((sig->>'deadline')::double precision);
  game_count:=coalesce(jsonb_array_length(sig->'games'),0);
  select jsonb_build_object(
    'viewer',p_user,
    'interests',coalesce((select jsonb_agg(i.league order by i.league) from public.gtl_league_interest i where i.user_id=p_user and i.notify),'[]'),
    'interestCounts',(select jsonb_object_agg(l.league,(select count(*) from public.gtl_league_interest i
        where i.league=l.league and i.notify and public.gtl_community_member(i.user_id)) order by l.league)
      from (values('nba'),('mlb'),('nhl'),('cfb'),('cbb')) l(league)),
    'admin',public.gtl_community_admin(p_user),
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',p.user_id,'displayName',p.display_name,
        'removed',exists(select 1 from public.gtl_community_removals r where r.user_id=p.user_id)) order by p.display_name,p.user_id)
      from public.gtl_profiles p),'[]'),
    'week',case when s is null then null else jsonb_build_object('season',s,'week',w,'deadline',deadline,'games',game_count) end,
    'optOuts',case when s is null then '[]'::jsonb else coalesce((select jsonb_agg(o.mode order by o.mode) from public.gtl_weekly_optouts o where o.user_id=p_user and o.season=s and o.week=w),'[]') end,
    'due',case when s is null then '[]'::jsonb else (select jsonb_agg(jsonb_build_object('mode',m.mode,
        'submitted',coalesce(b.ballot->>'submittedAt','')<>'',
        'satOut',exists(select 1 from public.gtl_weekly_optouts o where o.user_id=p_user and o.season=s and o.week=w and o.mode=m.mode),
        'locked',coalesce((select count(*) from jsonb_object_keys(coalesce(b.ballot->'picks','{}')) k where public.gtl_ballot_locked_in(b.ballot,k)),0),
        'filled',coalesce((select count(*) from jsonb_object_keys(coalesce(b.ballot->'picks','{}'))),0),
        'games',game_count,'openGames',(select count(*) from jsonb_array_elements(sig->'games') g where public.gtl_guess_game_open(s,w,g->>'id',now_at) and not public.gtl_ballot_locked_in(b.ballot,g->>'id')),'nextKickoff',(select min(to_timestamp((g->>'kickoff')::numeric)) from jsonb_array_elements(sig->'games') g where public.gtl_guess_game_open(s,w,g->>'id',now_at) and not public.gtl_ballot_locked_in(b.ballot,g->>'id'))) order by m.mode)
      from (values('guess_spread'),('guess_total')) m(mode)
      left join public.gtl_weekly_ballots b on b.user_id=p_user and b.season=s and b.week=w and b.mode=m.mode) end,
    'submissions',case when s is null then '[]'::jsonb else coalesce((select jsonb_agg(q.entry order by q.user_id,q.mode) from (
      select b.user_id,b.mode,jsonb_build_object('userId',b.user_id,'mode',b.mode,'submittedAt',b.ballot->'submittedAt','satOut',false,
          'late',public.gtl_ballot_late(b.ballot)) entry
        from public.gtl_weekly_ballots b where b.season=s and b.week=w and public.gtl_ballot_has_locked(b.ballot)
          and public.gtl_ballot_eligible(b.user_id,b.season,b.week,b.mode,b.origin_practice)
      union all
      select o.user_id,o.mode,jsonb_build_object('userId',o.user_id,'mode',o.mode,'submittedAt',null,'satOut',true,'late',null)
        from public.gtl_weekly_optouts o where o.season=s and o.week=w) q),'[]') end,
    'standings',case when s is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('userId',t.user_id,'mode',t.mode,
        'weekPoints',t.week_points,'weekScored',t.week_scored,'seasonPoints',t.season_points,'seasonScored',t.season_scored,'weeksSubmitted',t.weeks,
        'satOut',exists(select 1 from public.gtl_weekly_optouts o where o.user_id=t.user_id and o.season=s and o.week=w and o.mode=t.mode))
        order by t.mode,t.season_points desc nulls last,t.user_id) from (
      select u.user_id,u.mode,
        case when coalesce(bool_or(b.week=w),false) then round(sum(pt.points) filter (where b.week=w),2) end week_points,
        count(pt.points) filter (where b.week=w) week_scored,
        case when coalesce(bool_or(b.user_id is not null),false) then round(sum(pt.points),2) end season_points,
        count(pt.points) season_scored,count(distinct b.week) weeks
      from (select x.user_id,x.mode from public.gtl_weekly_ballots x where x.season=s and public.gtl_ballot_has_locked(x.ballot)
              and public.gtl_ballot_eligible(x.user_id,x.season,x.week,x.mode,x.origin_practice)
            union select o.user_id,o.mode from public.gtl_weekly_optouts o where o.season=s) u
      left join public.gtl_weekly_ballots b on b.user_id=u.user_id and b.mode=u.mode and b.season=s and public.gtl_ballot_has_locked(b.ballot)
        and public.gtl_ballot_eligible(b.user_id,b.season,b.week,b.mode,b.origin_practice)
      left join lateral (select ps.points from public.gtl_ballot_pick_scores(b.season,b.week,b.mode,b.ballot,b.audit) ps
        where ps.points is not null and ps.kickoff<=now_at) pt on true
      group by u.user_id,u.mode) t),'[]') end,
    'posts',coalesce((select jsonb_agg(x.post order by x.created_at desc,x.id desc) from (
      select p.id,p.created_at,jsonb_build_object('id',p.id,'actorId',p.actor_id,'kind',p.kind,'season',p.season,'week',p.week,'mode',p.mode,
        'payload',p.payload,'createdAt',p.created_at,
        'likes',(select count(*) from public.gtl_feed_likes l where l.post_id=p.id),
        'likedByMe',exists(select 1 from public.gtl_feed_likes l where l.post_id=p.id and l.user_id=p_user),
        'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'userId',c.user_id,'body',c.body,'createdAt',c.created_at) order by c.created_at,c.id)
          from public.gtl_feed_comments c where c.post_id=p.id),'[]'),
        'picks',case when p.kind<>'ballot_submitted' then null
          when g.shown is null and g.hidden is not null then null else coalesce(g.shown,'{}'::jsonb) end,
        'picksHidden',p.kind='ballot_submitted' and g.hidden is not null,
        'hiddenGames',case when p.kind='ballot_submitted' then coalesce(g.hidden,'[]'::jsonb) end,
        'late',case when p.kind='ballot_submitted' then public.gtl_ballot_late(pb.ballot) end
      ) post
      from (select * from public.gtl_feed_posts f where (p_before is null or f.created_at<p_before) and f.created_at<=now_at
            order by f.created_at desc,f.id desc limit p_limit) p
      left join public.gtl_weekly_ballots pb on p.kind='ballot_submitted' and pb.user_id=p.actor_id and pb.season=p.season and pb.week=p.week and pb.mode=p.mode
      left join lateral (select jsonb_object_agg(k.key,k.value) filter (where k.visible) shown,
          jsonb_agg(k.key order by k.key) filter (where not k.visible) hidden
        from (select e.key,e.value,p.actor_id=p_user or (public.gtl_guess_locked_in(p.actor_id,p.season,p.week,p.mode,e.key)
              and public.gtl_guess_revealed(p_user,p.season,p.week,p.mode,e.key,now_at)) visible
          from jsonb_each(case when p.kind='ballot_submitted' and jsonb_typeof(pb.ballot->'picks')='object' then pb.ballot->'picks' else '{}'::jsonb end) e) k) g on true
      ) x),'[]')
  ) into result;
  return result;
end $$;

create or replace function public.gtl_read_community_history(p_user uuid,p_season integer default null,p_now timestamptz default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare s integer; now_at timestamptz:=coalesce(p_now,clock_timestamp()); z record; b record; o record; g jsonb; tg jsonb; ps record;
  games jsonb; results jsonb; entries jsonb; weeks jsonb:='[]'; deadline timestamptz; gate jsonb; market text;
  submitted boolean; own boolean; shown boolean; any_shown boolean; hidden jsonb; scope text; picks jsonb; pts numeric;
  week_points numeric; week_scored integer; board_points numeric; board_scored integer; eligible boolean; ruled boolean; eligibility text; sat_out boolean; locked boolean; listed jsonb;
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  s:=p_season;
  if s is null then select max(season) into s from public.gtl_weekly_slates; end if;
  for z in select season,week,signature from public.gtl_weekly_slates where season=s order by week desc loop
    deadline:=to_timestamp((z.signature->>'deadline')::double precision);
    games:='[]';
    for g in select x from jsonb_array_elements(z.signature->'games') x order by (x->>'kickoff')::numeric,x->>'id' loop
      tg:=public.gtl_slate_game(z.season,z.week,z.signature,g->>'id');
      games:=games||jsonb_build_array(jsonb_build_object('id',g->>'id','awayCode',g->>'away','homeCode',g->>'home',
        'away',coalesce(tg->>'away',g->>'away'),'home',coalesce(tg->>'home',g->>'home'),'kickoff',to_timestamp((g->>'kickoff')::numeric)));
    end loop;
    results:=coalesce((select jsonb_object_agg(q.game_id,q.r) from (
      select distinct on (v.game_id) v.game_id,jsonb_build_object('status',v.status,'home',v.home,'away',v.away,'source',v.source,'sourceUrl',v.source_url,
        'observedAt',v.observed_at,'settledAt',v.settled_at,'origin','settlement') r
      from public.gtl_virtual_units_settlements v where v.season=z.season and v.week=z.week order by v.game_id,v.version desc) q),'{}');
    results:=coalesce((select jsonb_object_agg(q.game_id,jsonb_build_object('status',q.result->>'status','home',q.result->'home','away',q.result->'away',
        'source',q.result->'source','sourceUrl',q.result->'sourceURL','observedAt',q.result->'observedAt','settledAt',q.result->'reviewedAt','origin','commissioner_reported'))
      from (select distinct on (e.game_id) e.game_id,e.result from public.gtl_reviewed_result_events e where e.season=z.season and e.week=z.week order by e.game_id,e.version desc) q
      where not results ? q.game_id and q.result->>'status'='final'),'{}')||results;
    gate:=public.gtl_markets_visible(p_user,z.season,z.week,now_at);
    entries:='[]';
    listed:='[]';
    for b in select x.*,opt.created_at sat_out_at from public.gtl_weekly_ballots x
        left join public.gtl_weekly_optouts opt on opt.user_id=x.user_id and opt.season=x.season and opt.week=x.week and opt.mode=x.mode
        where x.season=z.season and x.week=z.week
        and case when opt.user_id is null then public.gtl_ballot_has_locked(x.ballot) or (x.user_id=p_user and coalesce(x.ballot->'picks','{}'::jsonb)<>'{}'::jsonb)
          else exists(select 1 from jsonb_array_elements(z.signature->'games') lg
            where public.gtl_guess_locked_in(x.user_id,x.season,x.week,x.mode,lg->>'id')) end
        order by x.user_id,x.mode loop
      submitted:=coalesce(b.ballot->>'submittedAt','')<>'';
      sat_out:=b.sat_out_at is not null;
      own:=b.user_id=p_user;
      market:=case when b.mode='guess_spread' then 'spread' else 'total' end;
      ruled:=exists(select 1 from public.gtl_weekly_eligibility_rulings r where r.user_id=b.user_id and r.season=b.season and r.week=b.week and r.mode=b.mode);
      eligible:=public.gtl_ballot_eligible(b.user_id,b.season,b.week,b.mode,b.origin_practice);
      eligibility:=case when ruled and eligible then 'ruled-eligible' when ruled then 'ruled-ineligible' when b.origin_practice then 'practice' else 'standard' end;
      scope:=case when jsonb_typeof(b.provenance)<>'array' then 'unknown'
        when exists(select 1 from jsonb_array_elements(b.provenance) e where e->>'import'='commissioner_ruled') then 'community-import'
        when b.provenance->-1->>'scope'='solo' then 'solo'
        when (b.provenance->-1->>'migration')::boolean then 'migrated-league'
        when b.provenance->-1 ? 'leagueId' then 'group' else 'unknown' end;
      picks:='[]'; hidden:='[]'; any_shown:=false; week_points:=0; week_scored:=0; board_points:=0; board_scored:=0;
      for ps in select * from public.gtl_ballot_pick_scores(b.season,b.week,b.mode,b.ballot,b.audit) loop
        shown:=coalesce((gate->ps.game_id->>market)::boolean,false);
        locked:=public.gtl_ballot_locked_in(b.ballot,ps.game_id);
        continue when sat_out and not locked and not own;
        pts:=case when eligible and locked and (own or shown) then ps.points end;
        if eligible and locked and ps.kickoff<=now_at and ps.points is not null then board_points:=board_points+ps.points; board_scored:=board_scored+1; end if;
        if pts is not null and (own or ps.kickoff<=now_at) then week_points:=week_points+pts; week_scored:=week_scored+1; end if;
        if own then
          picks:=picks||jsonb_build_array(jsonb_build_object('gameId',ps.game_id,'guess',ps.guess,'reference',case when shown then ps.reference end,
            'points',pts,'scorable',pts is not null,'hidden',false,'lockedIn',locked,'lockedAt',case when locked then coalesce(b.ballot#>array['lockedAt',ps.game_id],b.ballot->'submittedAt') end,'closedAtKickoff',coalesce(b.ballot->'closedAtKickoff' ? ps.game_id,false),'late',public.gtl_guess_late(b.ballot,ps.game_id)));
          any_shown:=true;
        elsif shown and locked then
          picks:=picks||jsonb_build_array(jsonb_build_object('gameId',ps.game_id,'guess',ps.guess,'reference',ps.reference,
            'points',pts,'scorable',pts is not null,'hidden',false,'lockedIn',locked,'lockedAt',case when locked then coalesce(b.ballot#>array['lockedAt',ps.game_id],b.ballot->'submittedAt') end,'closedAtKickoff',coalesce(b.ballot->'closedAtKickoff' ? ps.game_id,false),'late',public.gtl_guess_late(b.ballot,ps.game_id)));
          any_shown:=true;
        elsif shown then
          picks:=picks||jsonb_build_array(jsonb_build_object('gameId',ps.game_id,'guess',null,'reference',null,'points',null,'scorable',false,'hidden',false));
        else
          hidden:=hidden||to_jsonb(ps.game_id);
          picks:=picks||jsonb_build_array(jsonb_build_object('gameId',ps.game_id,'guess',null,'reference',null,'points',null,'scorable',false,'hidden',true));
        end if;
      end loop;
      entries:=entries||jsonb_build_array(jsonb_build_object('userId',b.user_id,'mode',b.mode,'status',case when sat_out then 'sat_out' when submitted then 'submitted' else 'draft' end,
        'submittedAt',b.ballot->'submittedAt','submittedAtKnown',not public.gtl_submission_time_unknown(b.ballot),
        'updatedAt',case when own then b.ballot->'updatedAt' end,
        'revisions',case when own then (select count(*) from jsonb_array_elements(b.audit) e where e->>'type'='ballot_edited') end,
        'provenance',case when own then scope end,'scoringPolicy',b.ballot->'scoringPolicy',
        'ruling',case when jsonb_typeof(b.ballot->'ruling')='object' then jsonb_build_object('decision',b.ballot#>'{ruling,decision}','basis',b.ballot#>'{ruling,basis}') end,
        'eligible',eligible,'eligibility',eligibility,
        'picksHidden',jsonb_array_length(hidden)>0,
        'picks',case when jsonb_array_length(hidden)>0 and not any_shown then null else picks end,
        'hiddenGames',coalesce((select jsonb_agg(h order by h) from jsonb_array_elements_text(hidden) h),'[]'),
        'late',public.gtl_ballot_late(b.ballot),
        'scoreTiming',case when own then 'immediate' else 'kickoff' end,
        'standingsPoints',case when board_scored>0 then board_points end,'awaitingKickoffPoints',case when own and week_scored>0 then week_points-board_points end,
        'weekPoints',case when week_scored>0 then week_points end,'weekScored',week_scored,'games',jsonb_array_length(games))
        ||case when sat_out then jsonb_build_object('satOutAt',b.sat_out_at) else '{}'::jsonb end);
      if sat_out then listed:=listed||to_jsonb(b.user_id::text||':'||b.mode); end if;
    end loop;
    for o in select user_id,mode,created_at from public.gtl_weekly_optouts where season=z.season and week=z.week order by user_id,mode loop
      continue when listed ? (o.user_id::text||':'||o.mode);
      entries:=entries||jsonb_build_array(jsonb_build_object('userId',o.user_id,'mode',o.mode,'status','sat_out','satOutAt',o.created_at,
        'picksHidden',false,'picks',null,'hiddenGames','[]'::jsonb,'late',null,'weekPoints',null,'weekScored',0,'games',jsonb_array_length(games)));
    end loop;
    weeks:=weeks||jsonb_build_array(jsonb_build_object('season',z.season,'week',z.week,'deadline',deadline,'closed',now_at>=deadline,
      'games',games,'results',results,
      'revealed',jsonb_build_object('guess_spread',public.gtl_week_revealed(p_user,z.season,z.week,'guess_spread',now_at),
        'guess_total',public.gtl_week_revealed(p_user,z.season,z.week,'guess_total',now_at)),
      'gate',gate,'entries',entries));
  end loop;
  return jsonb_build_object('viewer',p_user,'season',s,'now',now_at,
    'seasons',coalesce((select jsonb_agg(q.season order by q.season desc) from (select distinct season from public.gtl_weekly_slates) q),'[]'),
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',p.user_id,'displayName',p.display_name,
        'removed',exists(select 1 from public.gtl_community_removals r where r.user_id=p.user_id)) order by p.display_name,p.user_id)
      from public.gtl_profiles p),'[]'),
    'weeks',weeks);
end $$;

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
  gate:=public.gtl_markets_visible(p_user,s,w,now_at);
  results:=coalesce((select jsonb_object_agg(q.game_id,q.r) from (
    select distinct on (v.game_id) v.game_id,jsonb_build_object('status',v.status,'home',v.home,'away',v.away,'source',v.source,'sourceUrl',v.source_url,
      'observedAt',v.observed_at,'origin','settlement') r
    from public.gtl_virtual_units_settlements v where v.season=s and v.week=w order by v.game_id,v.version desc) q),'{}');
  results:=coalesce((select jsonb_object_agg(q.game_id,jsonb_build_object('status',q.result->>'status','home',q.result->'home','away',q.result->'away',
      'source',q.result->'source','sourceUrl',q.result->'sourceURL','observedAt',q.result->'observedAt','origin','commissioner_reported'))
    from (select distinct on (e.game_id) e.game_id,e.result from public.gtl_reviewed_result_events e where e.season=s and e.week=w order by e.game_id,e.version desc) q
    where not results ? q.game_id and q.result->>'status'='final'),'{}')||results;
  for b in select x.* from public.gtl_weekly_ballots x where x.user_id=p_user and x.season=s and x.week=w and x.mode in ('guess_spread','guess_total') loop
    market:=case when b.mode='guess_spread' then 'spread' else 'total' end;
    submitted:=coalesce(b.ballot->>'submittedAt','')<>'';
    eligible:=public.gtl_ballot_eligible(b.user_id,b.season,b.week,b.mode,b.origin_practice);
    for ps in select * from public.gtl_ballot_pick_scores(b.season,b.week,b.mode,b.ballot,b.audit) loop
      own:=own||jsonb_build_object(market||':'||ps.game_id,jsonb_build_object('guess',ps.guess,'reference',ps.reference,
        'points',case when eligible and public.gtl_ballot_locked_in(b.ballot,ps.game_id) then ps.points end,'late',public.gtl_guess_late(b.ballot,ps.game_id)));
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

create or replace function public.gtl_read_guess_picks(p_user uuid,p_season integer,p_week integer,p_mode text,p_game text,p_target uuid,p_now timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_season integer:=p_season; v_week integer:=p_week; v_signature jsonb; v_market text; v_gate jsonb; result jsonb;
  now_at timestamptz:=coalesce(p_now,clock_timestamp());
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_mode is null or p_mode not in ('guess_spread','guess_total') or (p_season is null)<>(p_week is null) then raise exception 'GTL_COMMUNITY_INVALID'; end if;
  if v_season is null then
    select z.season,z.week into v_season,v_week from public.gtl_weekly_slates z order by z.season desc,z.week desc limit 1;
  end if;
  select z.signature into v_signature from public.gtl_weekly_slates z where z.season=v_season and z.week=v_week;
  v_market:=case when p_mode='guess_spread' then 'spread' else 'total' end;
  v_gate:=public.gtl_markets_visible(p_user,v_season,v_week,now_at);
  with game as (
    select x->>'id' game_id,to_timestamp((x->>'kickoff')::numeric) kickoff
    from jsonb_array_elements(case when jsonb_typeof(v_signature->'games')='array' then v_signature->'games' else '[]'::jsonb end) x
    where p_game is null or x->>'id'=p_game
  ), member as (
    select p.user_id,p.display_name,exists(select 1 from public.gtl_community_removals r where r.user_id=p.user_id) removed
    from public.gtl_profiles p
  ), listed as (
    select m.* from member m where not m.removed
      or exists(select 1 from public.gtl_weekly_ballots x where x.user_id=m.user_id and x.season=v_season and x.week=v_week and x.mode=p_mode
        and public.gtl_ballot_has_locked(x.ballot))
      or exists(select 1 from public.gtl_weekly_optouts o where o.user_id=m.user_id and o.season=v_season and o.week=v_week and o.mode=p_mode)
  ), ballot as (
    select b.user_id,b.ballot,b.audit,coalesce(b.ballot->>'submittedAt','')<>'' submitted,
      public.gtl_ballot_eligible(b.user_id,b.season,b.week,b.mode,b.origin_practice) eligible
    from public.gtl_weekly_ballots b where b.season=v_season and b.week=v_week and b.mode=p_mode
  ), score as (
    select b.user_id,ps.game_id,ps.guess,ps.reference,ps.points
    from ballot b cross join lateral public.gtl_ballot_pick_scores(v_season,v_week,p_mode,b.ballot,b.audit) ps
    where b.eligible and public.gtl_ballot_locked_in(b.ballot,ps.game_id)
  ), cell as (
    select g.game_id,g.kickoff,m.user_id,m.display_name,m.removed,m.user_id=p_user own,b.ballot,coalesce(b.eligible,false) eligible,
      case when jsonb_typeof(b.ballot->'picks'->g.game_id)='number' then (b.ballot->'picks'->>g.game_id)::numeric end guess,
      public.gtl_guess_locked_in(m.user_id,v_season,v_week,p_mode,g.game_id) locked,
      exists(select 1 from public.gtl_weekly_optouts o where o.user_id=m.user_id and o.season=v_season and o.week=v_week and o.mode=p_mode) sat_out,
      coalesce((v_gate->g.game_id->>v_market)::boolean,false) open,
      sc.guess scored_guess,sc.reference,sc.points
    from game g cross join listed m
    left join ballot b on b.user_id=m.user_id
    left join score sc on sc.user_id=m.user_id and sc.game_id=g.game_id
  ), judged as (
    select c.*,c.own or (c.locked and c.open) visible,
      case when c.locked and (c.own or c.open) and c.points is not null
        then abs(c.scored_guess-(c.reference->>'value')::numeric) end error
    from cell c
  ), ranked as (
    select j.*,
      case when j.error is not null then rank() over (partition by j.game_id,j.error is null order by j.error) end place,
      case when j.error is not null then count(*) over (partition by j.game_id,j.error) end same,
      min(j.error) over (partition by j.game_id) best
    from judged j
  )
  select jsonb_build_object('scoreTiming','immediate','viewer',p_user,'season',v_season,'week',v_week,'mode',p_mode,'now',now_at,
    'deadline',case when v_signature is not null then to_timestamp((v_signature->>'deadline')::double precision) end,
    'games',coalesce((select jsonb_agg(jsonb_build_object('gameId',g.game_id,'kickoff',g.kickoff,'started',g.kickoff<=now_at,
        'open',coalesce((v_gate->g.game_id->>v_market)::boolean,false),
        'rows',coalesce((select jsonb_agg(jsonb_build_object('userId',r.user_id,'removed',r.removed,
            'status',case when r.locked then case when public.gtl_guess_late(r.ballot,r.game_id) is not null then 'late' else 'in' end
              when r.sat_out then 'sat_out' else 'not_yet' end,
            'lockedIn',r.locked,
            'late',case when r.locked then public.gtl_guess_late(r.ballot,r.game_id) end,
            'eligible',case when r.locked then r.eligible end,
            'hidden',r.locked and not r.visible,
            'pick',case when r.visible then r.guess end,
            'error',r.error,'points',case when r.error is not null then r.points end,'rank',case when r.kickoff<=now_at then r.place end,
            'tied',r.kickoff<=now_at and coalesce(r.same>1,false),'closest',r.kickoff<=now_at and coalesce(r.error=r.best,false))
          order by r.place nulls last,r.own desc,r.display_name,r.user_id)
          from ranked r where r.game_id=g.game_id and (p_target is null or r.user_id=p_target)),'[]'::jsonb))
      order by g.kickoff,g.game_id) from game g),'[]'::jsonb))
  into result;
  return result;
end $$;

-- All helpers and readers remain service-only; no client/table grants change.
revoke all on function public.gtl_ballot_locked_in(jsonb,text) from public,anon,authenticated;
grant execute on function public.gtl_ballot_locked_in(jsonb,text) to service_role;
revoke all on function public.gtl_ballot_has_locked(jsonb) from public,anon,authenticated;
grant execute on function public.gtl_ballot_has_locked(jsonb) to service_role;
revoke all on function public.gtl_guess_game_open(integer,integer,text,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_guess_game_open(integer,integer,text,timestamptz) to service_role;
revoke all on function public.gtl_live_rules() from public,anon,authenticated;
grant execute on function public.gtl_live_rules() to service_role;
revoke all on function public.gtl_guess_late(jsonb,text) from public,anon,authenticated;
grant execute on function public.gtl_guess_late(jsonb,text) to service_role;
revoke all on function public.gtl_prepare_guess_ballot(integer,integer,text,jsonb,jsonb,boolean,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_prepare_guess_ballot(integer,integer,text,jsonb,jsonb,boolean,jsonb,timestamptz) to service_role;
revoke all on function public.gtl_resolution_before_kickoff(integer,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.gtl_resolution_before_kickoff(integer,integer,text,jsonb) to service_role;
revoke all on function public.gtl_valid_pending_resolution(integer,integer,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.gtl_valid_pending_resolution(integer,integer,text,jsonb,jsonb) to service_role;
revoke all on function public.gtl_guard_fresh_submission() from public,anon,authenticated;
grant execute on function public.gtl_guard_fresh_submission() to service_role;
revoke all on function public.gtl_guard_optout_ballot() from public,anon,authenticated;
grant execute on function public.gtl_guard_optout_ballot() to service_role;
revoke all on function public.gtl_feed_on_ballot() from public,anon,authenticated;
grant execute on function public.gtl_feed_on_ballot() to service_role;
revoke all on function public.gtl_guess_score_receipt(uuid,integer,integer,text,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_guess_score_receipt(uuid,integer,integer,text,timestamptz) to service_role;
revoke all on function public.gtl_save_weekly_ballot(uuid,text,text,bigint,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.gtl_save_weekly_ballot(uuid,text,text,bigint,jsonb,boolean) to service_role;
revoke all on function public.gtl_mutate_personal(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.gtl_mutate_personal(uuid,text,jsonb) to service_role;
revoke all on function public.gtl_ballot_pick_scores(integer,integer,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.gtl_ballot_pick_scores(integer,integer,text,jsonb,jsonb) to service_role;
revoke all on function public.gtl_resolve_pending_references(integer,integer) from public,anon,authenticated;
grant execute on function public.gtl_resolve_pending_references(integer,integer) to service_role;
revoke all on function public.gtl_submission_intent_context(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.gtl_submission_intent_context(uuid,jsonb) to service_role;
revoke all on function public.gtl_sit_out_week(uuid,integer,integer,text,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_sit_out_week(uuid,integer,integer,text,timestamptz) to service_role;
revoke all on function public.gtl_forfeit_guess_week(uuid,integer,integer,text,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_forfeit_guess_week(uuid,integer,integer,text,timestamptz) to service_role;
revoke all on function public.gtl_read_community(uuid,timestamptz,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_read_community(uuid,timestamptz,integer,timestamptz) to service_role;
revoke all on function public.gtl_read_community_history(uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_read_community_history(uuid,integer,timestamptz) to service_role;
revoke all on function public.gtl_read_lines(uuid,integer,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_read_lines(uuid,integer,integer,timestamptz) to service_role;
revoke all on function public.gtl_read_guess_picks(uuid,integer,integer,text,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_read_guess_picks(uuid,integer,integer,text,text,uuid,timestamptz) to service_role;
