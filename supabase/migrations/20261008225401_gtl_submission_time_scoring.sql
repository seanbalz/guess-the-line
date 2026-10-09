-- D-16: scoring references belong to each saved submission/revision. Existing
-- ballots, archived scores, kickoff benchmarks and Challenge picks are untouched.
-- Reference capture and weekly revision advancement occur in one transaction.
create function public.gtl_submission_reference(p_payload jsonb,p_game jsonb,p_market text,p_saved timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e jsonb; q jsonb; vals numeric[]:='{}'; books text[]:='{}'; v numeric; midpoint numeric;
  captured timestamptz; observed timestamptz; quoted timestamptz; first_quote timestamptz; last_quote timestamptz;
begin
  if p_market not in ('spread','total') or p_saved is null or not isfinite(p_saved)
    or p_payload->>'provider' is distinct from 'the-odds-api' or p_payload->>'sport' is distinct from 'americanfootball_nfl'
    or jsonb_typeof(p_payload->'games') is distinct from 'array' then return null; end if;
  captured:=(p_payload->>'fetchedAt')::timestamptz;
  if captured is null or not isfinite(captured) or captured>p_saved or p_saved>=(p_game->>'kickoff')::timestamptz
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
    vals:=array_append(vals,v); books:=array_append(books,q->>'book');
    first_quote:=least(first_quote,observed); last_quote:=greatest(last_quote,observed);
  end loop;
  select array_agg(x order by x) into vals from unnest(vals) x; midpoint:=vals[2];
  if (select count(*) from unnest(vals) x where abs(x-midpoint)<=5)<3 or last_quote-first_quote>interval '5 minutes' then return null; end if;
  return jsonb_build_object('status',case when first_quote<p_saved-interval '5 minutes' then 'stale' else 'available' end,
    'value',case when first_quote<p_saved-interval '5 minutes' then null else midpoint end,
    'source','The Odds API · 3-book median','sourceUrl','https://the-odds-api.com/','bookCount',3,
    'capturedAt',captured,'observedAt',first_quote,'savedAt',p_saved,'officialVerified',false,
    'reason',case when first_quote<p_saved-interval '5 minutes' then 'Saved market reference was older than five minutes at submission; unscored.' else null end);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then return null;
end $$;
revoke all on function public.gtl_submission_reference(jsonb,jsonb,text,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_submission_reference(jsonb,jsonb,text,timestamptz) to service_role;

create or replace function public.gtl_save_weekly_ballot(p_user uuid,p_league text,p_mode text,p_revision bigint,p_picks jsonb,p_submit boolean) returns bigint
language plpgsql security invoker set search_path='' as $$
declare c jsonb; s integer; w integer; rev bigint; b public.gtl_weekly_ballots; entry record; v numeric; stamp timestamptz;
  next_ballot jsonb; event jsonb; was_submitted boolean; is_submitted boolean; refs jsonb; ref jsonb; g jsonb; snap public.gtl_market_snapshots;
  changed jsonb:='[]'; market text; signature jsonb;
begin
  c:=public.gtl_weekly_context(p_user,p_league); s:=(c->>'season')::integer; w:=(c->>'week')::integer;
  if p_mode is null or p_mode not in ('guess_spread','guess_total') or p_picks is null or jsonb_typeof(p_picks)<>'object' or p_submit is null then raise exception 'GTL_BALLOT_INVALID'; end if;
  insert into public.gtl_weekly_versions(user_id,season,week) values(p_user,s,w) on conflict do nothing;
  select revision into rev from public.gtl_weekly_versions where user_id=p_user and season=s and week=w for update;
  if p_revision is null or p_revision<>rev then raise exception 'GTL_WEEKLY_CONFLICT'; end if;
  select * into b from public.gtl_weekly_ballots where user_id=p_user and season=s and week=w and mode=p_mode;
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
      ref:=null;
      for snap in select * from public.gtl_market_snapshots where season=s and week=w and slate_signature=signature
        and created_at<=stamp order by created_at desc,id desc limit 20 loop
        ref:=public.gtl_submission_reference(snap.payload,g,market,stamp);
        if ref is not null then ref:=ref||jsonb_build_object('snapshotId',snap.id); exit; end if;
      end loop;
      refs:=refs||jsonb_build_object(g->>'id',coalesce(ref,jsonb_build_object('status','unavailable','value',null,'savedAt',stamp,
        'source',null,'sourceUrl',null,'snapshotId',null,'capturedAt',null,'observedAt',null,
        'reason','No qualifying saved reference at submission; unscored.')));
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

-- Only matching-group members receive references. The engine retains the separate
-- Spread/Total submission reveal gates; private provenance/audits stay own-only.
create or replace function public.gtl_read_weekly_state(p_user uuid,p_league text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; s integer; w integer; result jsonb;
begin
  c:=public.gtl_weekly_context(p_user,p_league); s:=(c->>'season')::integer; w:=(c->>'week')::integer;
  -- One statement snapshot keeps revision, ballot, and selection reads coherent.
  with members as (select user_id,player_id from public.gtl_memberships where league_id=p_league and active and exists(select 1 from jsonb_array_elements(c#>'{state,league,roster}') r where r->>'id'=player_id)),
  bs as (select m.player_id,b.* from members m join public.gtl_weekly_ballots b on b.user_id=m.user_id and b.season=s and b.week=w),
  xs as (select m.player_id,x.* from members m join public.gtl_weekly_selections x on x.user_id=m.user_id and x.season=s and x.week=w),
  rs as (select m.player_id,r.* from members m join public.gtl_weekly_eligibility_rulings r on r.user_id=m.user_id and r.season=s and r.week=w),
  ba as (select player_id,jsonb_object_agg(mode,case when user_id=p_user then ballot else jsonb_build_object('picks',ballot->'picks','submittedAt',ballot->'submittedAt','updatedAt',ballot->'updatedAt','scoringPolicy',ballot->'scoringPolicy','scoringReferences',ballot->'scoringReferences') end) value from bs group by player_id),
  xa as (select player_id,jsonb_object_agg(game_id,selection) value from xs group by player_id),
  events as (select e from bs cross join lateral jsonb_array_elements(audit) e where user_id=p_user union all select e from xs cross join lateral jsonb_array_elements(audit) e where user_id=p_user)
  select jsonb_build_object('state',
    jsonb_set(jsonb_set(jsonb_set(jsonb_set(c->'state','{ballots}',coalesce((select jsonb_object_agg(player_id,value) from ba),'{}')),
    '{bets}',coalesce((select jsonb_object_agg(player_id,value) from xa),'{}')),
    '{audit}',coalesce((select jsonb_agg(e||jsonb_build_object('player',c->>'playerId') order by e->>'timestamp',e->>'id') from events),'[]')),
    '{league,roster}',coalesce((select jsonb_agg(r order by n) from jsonb_array_elements(c#>'{state,league,roster}') with ordinality q(r,n) where exists(select 1 from members where player_id=r->>'id') or not exists(select 1 from public.gtl_memberships where league_id=p_league and player_id=r->>'id')),'[]')),
    'revision',coalesce((select revision from public.gtl_weekly_versions where user_id=p_user and season=s and week=w),0),
    'leagueRevision',c->'leagueRevision',
    'ownEligibilityRulings',coalesce((select jsonb_object_agg(mode,jsonb_build_object('eligible',eligible,'reason',reason,'recordedAt',recorded_at)) from rs where user_id=p_user),'{}'),
    'eligibilityRulings',coalesce((select jsonb_object_agg(player_id,value) from (select player_id,jsonb_object_agg(mode,jsonb_build_object('eligible',eligible,'reason',reason,'recordedAt',recorded_at)) value from rs group by player_id) q),'{}'),
    'originPractice',coalesce((select jsonb_object_agg(mode,origin_practice) from bs where user_id=p_user),'{}'),
    'selectionPractice',coalesce((select bool_or(origin_practice) from xs where user_id=p_user),false),
    'selectionEligibility',coalesce((select jsonb_object_agg(player_id,eligible) from (select player_id,not bool_or(origin_practice) eligible from xs group by player_id) q),'{}'),
    'eligibility',coalesce((select jsonb_object_agg(player_id,value) from (select player_id,jsonb_object_agg(mode,coalesce((select eligible from rs where rs.player_id=bs.player_id and rs.mode=bs.mode),not origin_practice)) value from bs group by player_id) q),'{}')) into result;
  return result;
end $$;
