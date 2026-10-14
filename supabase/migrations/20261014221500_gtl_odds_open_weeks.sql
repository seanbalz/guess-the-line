-- M-05, redesign build plan stage 22 (D-39: "Keep collecting games that haven't started", same calls, no extra
-- credits). Monday-night lines: after gtl_publish_week moves the collector to the next week on Monday 12:00 AM PT,
-- the previous week's games that have not kicked off (the Monday night game, or two) keep getting fresh lines, so a
-- late Monday guess has a current line to score against (D-27, D-36) and the game gets a line close to its kickoff.
--
-- How, at zero extra credits:
-- * gtl_odds_carryover_slate(at) lists the previous published week's games that have not kicked off at `at`.
-- * gtl_begin_odds_collection (the scheduled run and the commissioner's manual collection) hands the provider adapter
--   this week's games followed by those carried games. The adapter still makes one free event check and one odds
--   request (spreads and totals, region us, three books) whose cost does not depend on how many event ids it names;
--   a reported cost above two credits still stops and pauses the budget (ODDS_QUOTA_COST), as before.
-- * gtl_finish_odds_collection validates the payload against that same list (recomputed from the job's started_at,
--   so a kickoff during the 90-second lease cannot change it), stores this week's snapshot exactly as before, and
--   stores the carried games as a snapshot of their own week. gtl_market_snapshots.id references a collection, so a
--   zero-credit 'collect' row (reserved_credits 0, diagnostics.carryoverOf = the provider collection) records it.
--   Pending references of both weeks resolve in the same transaction, as before.
-- * Both begin RPCs count only collections that reserved credits toward the six per UTC day, so the record row never
--   takes a collection from anyone. For every row that exists today the count is unchanged (each 'collect' row
--   reserved two credits).
--
-- What does not change: the submission path's own collections (they collect the week being submitted), the schedule
-- (08:15 and 20:15 UTC), the cooldown, the cap of six, the reservation, the lease and replay rules, the claim, the
-- slate resolvers gtl_odds_collection_slate and gtl_odds_schedule_slate, and every reader. With no carried game
-- (Tuesday to Sunday, or once the last Monday game kicks off) each replaced function behaves exactly as its previous
-- body, result keys included. No table is created or altered; no existing row is changed or deleted (D-23).
--
-- Apply Tuesday or Wednesday (Gate M; plan section 6): no carried game exists then, so a collection in flight during
-- the apply cannot see two different lists. Rollback: supabase/rollback/<this file> restores the three bodies;
-- gtl_odds_carryover_slate and every stored row stay.
--
-- replaces public.gtl_begin_odds_collection md5 5efc7e17efb7e2865e414be942dff38a
-- replaces public.gtl_finish_odds_collection md5 3621558113169a9c82a1f1fe9684348a
-- replaces public.gtl_begin_submission_odds_collection md5 72ce60b20654f1a66df13426d050c0c4

-- The previous published week (the second newest gtl_weekly_slates row) and its games that have not kicked off at
-- p_at, in gtl_published_slate's shape and order. Null when there is no previous week, no template matches it, or
-- none of its games is left. A game is also left out when the newest week has the same id, or when one of its teams
-- plays a newest-week game within two days of it (never on a real NFL schedule), so a carried game can never make the
-- newest week's collection fail.
create or replace function public.gtl_odds_carryover_slate(p_at timestamptz) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare s integer; w integer; ps integer; pw integer; previous jsonb; newest jsonb; carried jsonb;
begin
  if p_at is null or not isfinite(p_at) then return null; end if;
  select season,week into s,w from public.gtl_weekly_slates order by season desc,week desc limit 1;
  select season,week into ps,pw from public.gtl_weekly_slates order by season desc,week desc offset 1 limit 1;
  if ps is null then return null; end if;
  previous:=public.gtl_published_slate(ps,pw);
  if previous is null then return null; end if;
  newest:=public.gtl_published_slate(s,w);
  select jsonb_agg(g order by (g->>'kickoff')::timestamptz,g->>'id') into carried from jsonb_array_elements(previous->'games') g
    where (g->>'kickoff')::timestamptz>p_at
      and not exists(select 1 from jsonb_array_elements(coalesce(newest->'games','[]'::jsonb)) x
        where x->>'id'=g->>'id'
          or ((x->>'home' in (g->>'home',g->>'away') or x->>'away' in (g->>'home',g->>'away'))
            and abs(extract(epoch from (x->>'kickoff')::timestamptz-(g->>'kickoff')::timestamptz))<172800));
  if carried is null then return null; end if;
  return jsonb_build_object('season',ps,'week',pw,'signature',previous->'signature','games',carried);
end $$;

-- Body of 20261012213000 except the carried games (gtl_odds_carryover_slate at the job's start) follow this week's in
-- the games the adapter collects, and the daily cap counts only collections that reserved credits.
create or replace function public.gtl_begin_odds_collection(p_user uuid,p_request uuid,p_operation text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; b public.gtl_odds_budget; job public.gtl_odds_collections; stamp timestamptz; lease uuid; carryover jsonb;
begin
  c:=public.gtl_odds_collection_slate(p_user);
  if p_request is null or p_operation is null or p_operation not in ('preflight','collect') then raise exception 'GTL_ODDS_REQUEST'; end if;
  select * into b from public.gtl_odds_budget where provider='the-odds-api' for update;
  if b.provider is null then raise exception 'GTL_ODDS_BUDGET'; end if;
  stamp:=clock_timestamp();
  -- Lease expiration does not refund uncertain network spending.
  if b.lease_token is not null and b.lease_until<=stamp then
    update public.gtl_odds_collections set status='failed',finished_at=stamp,error_code='ODDS_LEASE_EXPIRED',
      diagnostics=jsonb_build_object('status','failed','errorCode','ODDS_LEASE_EXPIRED') where lease_token=b.lease_token and status='running';
    update public.gtl_odds_budget set lease_token=null,lease_until=null,updated_at=stamp where provider=b.provider;
    b.lease_token:=null;
  end if;
  select * into job from public.gtl_odds_collections where id=p_request;
  if found then
    if job.actor_id<>p_user or job.operation<>p_operation then raise exception 'GTL_ODDS_REQUEST_CONFLICT'; end if;
    return jsonb_build_object('replay',true,'requestId',job.id,'operation',job.operation,'status',job.status,'diagnostics',job.diagnostics);
  end if;
  if b.lease_token is not null then raise exception 'GTL_ODDS_BUSY'; end if;
  if p_operation='preflight' then
    if b.last_preflight_at>stamp-interval '1 minute' then raise exception 'GTL_ODDS_COOLDOWN'; end if;
  else
    if b.last_successful_preflight_at is null or b.last_successful_preflight_at<stamp-interval '24 hours' or b.conservative_remaining is null then raise exception 'GTL_ODDS_PREFLIGHT_REQUIRED'; end if;
    if b.paused or b.conservative_remaining<52 then raise exception 'GTL_ODDS_BUDGET'; end if;
    if b.last_collection_at>stamp-interval '5 minutes' then raise exception 'GTL_ODDS_COOLDOWN'; end if;
    if (select count(*) from public.gtl_odds_collections where operation='collect' and reserved_credits=2 and started_at >= (date_trunc('day',stamp at time zone 'UTC') at time zone 'UTC'))>=6 then raise exception 'GTL_ODDS_DAILY_LIMIT'; end if;
  end if;
  -- The previous published week's games that have not kicked off at the job's start (stamp is its started_at,
  -- so gtl_finish_odds_collection recomputes exactly this list). They ride along in the same provider request.
  carryover:=public.gtl_odds_carryover_slate(stamp);
  lease:=gen_random_uuid();
  insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature)
    values(p_request,p_user,p_operation,'running',lease,stamp,stamp+interval '90 seconds',case when p_operation='collect' then 2 else 0 end,(c->>'season')::integer,(c->>'week')::integer,c->'signature');
  update public.gtl_odds_budget set lease_token=lease,lease_until=stamp+interval '90 seconds',
    conservative_remaining=case when p_operation='collect' then conservative_remaining-2 else conservative_remaining end,
    last_collection_at=case when p_operation='collect' then stamp else last_collection_at end,
    last_preflight_at=case when p_operation='preflight' then stamp else last_preflight_at end,updated_at=stamp where provider=b.provider;
  return jsonb_build_object('replay',false,'requestId',p_request,'lease',lease,'operation',p_operation,'games',(c->'games')||coalesce(carryover->'games','[]'::jsonb),
    'remainingCredits',b.conservative_remaining,'reserveCredits',50,'season',c->'season','week',c->'week');
end $$;

-- Body of 20261012230000 except the carried games: the payload is checked against this week's games followed by the
-- carried ones, this week's snapshot keeps only this week's games, and the carried games are stored as a snapshot of
-- their own week (with its zero-credit record row) and resolve that week's pending references.
create or replace function public.gtl_finish_odds_collection(p_user uuid,p_request uuid,p_lease uuid,p_payload jsonb,p_quota jsonb,p_error text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; b public.gtl_odds_budget; job public.gtl_odds_collections; stamp timestamptz; q record;
  remaining integer; used integer; lastcost integer; matched integer:=0; quotes integer:=0; item jsonb; market record; quote jsonb; schedule jsonb; captured timestamptz; observed timestamptz; summary jsonb; snapshot uuid;
  carryover jsonb; expected jsonb; carried text[]:='{}'; is_carried boolean; carried_matched integer:=0; carried_quotes integer:=0; carried_snapshot uuid;
begin
  c:=public.gtl_odds_collection_slate(p_user);
  select * into b from public.gtl_odds_budget where provider='the-odds-api' for update;
  select * into job from public.gtl_odds_collections where id=p_request for update;
  if job.id is null or job.actor_id<>p_user or job.lease_token is distinct from p_lease then raise exception 'GTL_ODDS_REQUEST'; end if;
  if job.status<>'running' then return job.diagnostics; end if;
  stamp:=clock_timestamp();
  if b.lease_token is distinct from p_lease or job.expires_at<=stamp then raise exception 'GTL_ODDS_LEASE'; end if;
  if c->'signature'<>job.slate_signature then raise exception 'GTL_SLATE_CONFLICT'; end if;
  -- The games gtl_begin_odds_collection handed the adapter: this week's, then the previous published week's games
  -- that had not kicked off when the job started.
  carryover:=public.gtl_odds_carryover_slate(job.started_at);
  expected:=(c->'games')||coalesce(carryover->'games','[]'::jsonb);
  if carryover is not null then select array_agg(g->>'id') into carried from jsonb_array_elements(carryover->'games') g; end if;
  if p_error is not null and p_error not in ('ODDS_CONFIG','ODDS_SLATE','ODDS_BUSY','ODDS_BUDGET','ODDS_AUTH','ODDS_RATE_LIMIT','ODDS_UNAVAILABLE','ODDS_TIMEOUT','ODDS_PAYLOAD','ODDS_BODY_LIMIT','ODDS_QUOTA_COST') then raise exception 'GTL_ODDS_REQUEST'; end if;
  if p_quota is null or jsonb_typeof(p_quota)<>'object' then raise exception 'GTL_ODDS_REQUEST'; end if;
  for q in select * from jsonb_each(p_quota) loop
    if q.key not in ('remaining','used','last') or (q.value<>'null'::jsonb and (jsonb_typeof(q.value)<>'number' or q.value::text !~ '^[0-9]{1,9}$')) then raise exception 'GTL_ODDS_REQUEST'; end if;
  end loop;
  remaining:=(p_quota->>'remaining')::integer; used:=(p_quota->>'used')::integer; lastcost:=(p_quota->>'last')::integer;
  if lastcost > (case when job.operation='preflight' then 0 else 2 end) then p_error:='ODDS_QUOTA_COST'; end if;
  if p_error is null and (p_payload is null or jsonb_typeof(p_payload)<>'object' or jsonb_typeof(p_payload->'games') is distinct from 'array' or jsonb_array_length(p_payload->'games')<>jsonb_array_length(expected) or octet_length(p_payload::text)>524288) then raise exception 'GTL_ODDS_PAYLOAD'; end if;
  if p_error is null then
    if p_payload->>'provider' is distinct from 'the-odds-api' or p_payload->>'sport' is distinct from 'americanfootball_nfl' or p_payload->'officialVerified' is distinct from 'false'::jsonb then raise exception 'GTL_ODDS_PAYLOAD'; end if;
    if (select count(*)<>count(distinct g->>'gameId') from jsonb_array_elements(p_payload->'games') g) then raise exception 'GTL_ODDS_PAYLOAD'; end if;
    for item in select value from jsonb_array_elements(p_payload->'games') loop
      select g into schedule from jsonb_array_elements(expected) g where g->>'id'=item->>'gameId';
      is_carried:=coalesce(item->>'gameId'=any(carried),false);
      if schedule is null or item->>'home' is distinct from schedule->>'home' or item->>'away' is distinct from schedule->>'away' or (item->>'kickoff')::timestamptz is distinct from (schedule->>'kickoff')::timestamptz then raise exception 'GTL_ODDS_PAYLOAD'; end if;
      if item->>'matchStatus'='matched' then if is_carried then carried_matched:=carried_matched+1; else matched:=matched+1; end if; end if;
      if job.operation='collect' then
        if jsonb_typeof(item->'markets') is distinct from 'object' then raise exception 'GTL_ODDS_PAYLOAD'; end if;
        for market in select * from jsonb_each(item->'markets') loop
          if market.key not in ('spread','total') or jsonb_typeof(market.value->'quotes') is distinct from 'array' then raise exception 'GTL_ODDS_PAYLOAD'; end if;
          for quote in select value from jsonb_array_elements(market.value->'quotes') loop
            captured:=(quote->>'collectedAt')::timestamptz; observed:=(quote->>'providerObservedAt')::timestamptz;
            if item->>'matchStatus' is distinct from 'matched' or quote->>'provider' is distinct from 'the-odds-api' or quote->>'market' is distinct from market.key or quote->>'providerEventId' is distinct from item->>'providerEventId' or captured is null or observed is null or observed>captured or observed<captured-interval '5 minutes' or captured<job.started_at-interval '5 seconds' or captured>(stamp+interval '5 seconds') or captured>=(schedule->>'kickoff')::timestamptz or jsonb_typeof(quote->'value') is distinct from 'number' then raise exception 'GTL_ODDS_PAYLOAD'; end if;
            if is_carried then carried_quotes:=carried_quotes+1; else quotes:=quotes+1; end if;
          end loop;
        end loop;
      end if;
    end loop;
    if job.operation='collect' and quotes>0 then
      snapshot:=job.id;
      -- Without a carryover the stored payload is the adapter's, byte for byte, as before. With one, this week's
      -- snapshot keeps only this week's games (in the adapter's order) and the carried games get their own below.
      insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values(snapshot,job.season,job.week,job.slate_signature,
        case when carryover is null then p_payload else p_payload||jsonb_build_object('games',(select coalesce(jsonb_agg(g order by n),'[]'::jsonb)
          from jsonb_array_elements(p_payload->'games') with ordinality x(g,n) where not (g->>'gameId'=any(carried)))) end,stamp);
      -- October 12, 2026: guesses saved before any line was stored take the first qualifying line collected after them.
      -- A fault leaves them pending for the next collection and never loses this snapshot.
      begin perform public.gtl_resolve_pending_references(job.season,job.week);
      exception when others then null; end;
    end if;
    -- The previous week's carried games get a snapshot of their own week, so every reader of that week (the line at
    -- a save, pending references, the community reads) finds it. gtl_market_snapshots.id must name a collection,
    -- so a zero-credit 'collect' row records it; the daily cap counts only rows that reserved credits. A fault here
    -- stores nothing for that week and never loses this week's snapshot.
    if job.operation='collect' and carried_quotes>0 then
      begin
        carried_snapshot:=gen_random_uuid();
        insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,finished_at,reserved_credits,season,week,slate_signature,diagnostics)
          values(carried_snapshot,job.actor_id,'collect','succeeded',gen_random_uuid(),job.started_at,job.expires_at,stamp,0,
            (carryover->>'season')::integer,(carryover->>'week')::integer,carryover->'signature',
            jsonb_build_object('requestId',carried_snapshot,'operation','collect','status','succeeded','snapshotId',carried_snapshot,
              'matchedEvents',carried_matched,'availableQuotes',carried_quotes,'officialVerified',false,'errorCode',null,'carryoverOf',job.id));
        insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values(carried_snapshot,
          (carryover->>'season')::integer,(carryover->>'week')::integer,carryover->'signature',
          p_payload||jsonb_build_object('games',(select jsonb_agg(g order by n) from jsonb_array_elements(p_payload->'games') with ordinality x(g,n) where g->>'gameId'=any(carried))),stamp);
      exception when others then carried_snapshot:=null;
      end;
      if carried_snapshot is not null then
        begin perform public.gtl_resolve_pending_references((carryover->>'season')::integer,(carryover->>'week')::integer);
        exception when others then null; end;
      end if;
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
    'snapshotId',snapshot,'matchedEvents',matched,'availableQuotes',quotes,'quota',jsonb_build_object('remaining',remaining,'used',used,'last',lastcost),'officialVerified',false,'errorCode',p_error)
    -- matchedEvents and availableQuotes stay this week's, so a scheduled run's succeeded or partial status means what it did.
    ||case when carryover is null then '{}'::jsonb else jsonb_build_object('carryover',jsonb_build_object('season',carryover->'season','week',carryover->'week',
      'games',jsonb_array_length(carryover->'games'),'snapshotId',carried_snapshot,'matchedEvents',carried_matched,'availableQuotes',carried_quotes)) end;
  update public.gtl_odds_collections set status=case when p_error is null then 'succeeded' else 'failed' end,finished_at=stamp,error_code=p_error,diagnostics=summary where id=job.id;
  return summary;
end $$;

-- Body of 20261012213000 except the daily cap counts only collections that reserved credits. The games it collects
-- (the week being submitted) are unchanged.
create or replace function public.gtl_begin_submission_odds_collection(p_user uuid,p_request uuid,p_intent jsonb,p_operation text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; b public.gtl_odds_budget; job public.gtl_odds_collections; binding public.gtl_submission_odds_intents;
  stamp timestamptz; lease uuid;
begin
  if p_request is null or p_operation is null or p_operation not in ('preflight','collect') then raise exception 'GTL_ODDS_REQUEST'; end if;
  -- A completed retry can return only its own bound result and never spend again.
  select * into job from public.gtl_odds_collections where id=p_request;
  if found then
    select * into binding from public.gtl_submission_odds_intents where request_id=p_request;
    if binding.request_id is null or job.actor_id is distinct from p_user or binding.actor_id is distinct from p_user
      or binding.intent is distinct from p_intent or job.operation<>p_operation then raise exception 'GTL_ODDS_REQUEST_CONFLICT'; end if;
    return jsonb_build_object('replay',true,'requestId',job.id,'operation',job.operation,'status',job.status,'diagnostics',job.diagnostics);
  end if;
  c:=public.gtl_submission_intent_context(p_user,p_intent);
  if not (c->>'requiresReferences')::boolean then raise exception 'GTL_ODDS_NOT_REQUIRED'; end if;
  if (public.gtl_preflight_submission(p_user,p_intent)->>'ready')::boolean then raise exception 'GTL_ODDS_NOT_REQUIRED'; end if;
  select * into b from public.gtl_odds_budget where provider='the-odds-api' for update;
  if b.provider is null then raise exception 'GTL_ODDS_BUDGET'; end if;
  stamp:=clock_timestamp();
  -- Recheck UUID after the global lock: concurrent requests may have completed.
  select * into job from public.gtl_odds_collections where id=p_request;
  if found then
    select * into binding from public.gtl_submission_odds_intents where request_id=p_request;
    if binding.request_id is null or job.actor_id is distinct from p_user or binding.intent is distinct from p_intent or job.operation<>p_operation then raise exception 'GTL_ODDS_REQUEST_CONFLICT'; end if;
    return jsonb_build_object('replay',true,'requestId',job.id,'operation',job.operation,'status',job.status,'diagnostics',job.diagnostics);
  end if;
  -- Waiting for the shared budget lock may cross a deadline or allow another
  -- collection to publish fresh references. Revalidate before reserving credit.
  c:=public.gtl_submission_intent_context(p_user,p_intent);
  if not (c->>'requiresReferences')::boolean then raise exception 'GTL_ODDS_NOT_REQUIRED'; end if;
  if (public.gtl_preflight_submission(p_user,p_intent)->>'ready')::boolean then raise exception 'GTL_ODDS_NOT_REQUIRED'; end if;
  stamp:=clock_timestamp();
  if b.lease_token is not null and b.lease_until<=stamp then
    update public.gtl_odds_collections set status='failed',finished_at=stamp,error_code='ODDS_LEASE_EXPIRED',diagnostics=jsonb_build_object('status','failed','errorCode','ODDS_LEASE_EXPIRED') where lease_token=b.lease_token and status='running';
    update public.gtl_odds_budget set lease_token=null,lease_until=null,updated_at=stamp where provider=b.provider;
    b.lease_token:=null;
  end if;
  if b.lease_token is not null then raise exception 'GTL_ODDS_BUSY'; end if;
  if p_operation='preflight' then
    if b.last_preflight_at>stamp-interval '1 minute' then raise exception 'GTL_ODDS_COOLDOWN'; end if;
  else
    if b.last_successful_preflight_at is null or b.last_successful_preflight_at<stamp-interval '24 hours' or b.conservative_remaining is null then raise exception 'GTL_ODDS_PREFLIGHT_REQUIRED'; end if;
    if b.paused or b.conservative_remaining<52 then raise exception 'GTL_ODDS_BUDGET'; end if;
    if b.last_collection_at>stamp-interval '5 minutes' then raise exception 'GTL_ODDS_COOLDOWN'; end if;
    if (select count(*) from public.gtl_odds_collections where operation='collect' and reserved_credits=2 and started_at >= (date_trunc('day',stamp at time zone 'UTC') at time zone 'UTC'))>=6 then raise exception 'GTL_ODDS_DAILY_LIMIT'; end if;
  end if;
  lease:=gen_random_uuid();
  insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature)
    values(p_request,p_user,p_operation,'running',lease,stamp,stamp+interval '90 seconds',case when p_operation='collect' then 2 else 0 end,(c->>'season')::integer,(c->>'week')::integer,c->'signature');
  insert into public.gtl_submission_odds_intents(request_id,actor_id,intent) values(p_request,p_user,p_intent);
  update public.gtl_odds_budget set lease_token=lease,lease_until=stamp+interval '90 seconds',
    conservative_remaining=case when p_operation='collect' then conservative_remaining-2 else conservative_remaining end,
    last_collection_at=case when p_operation='collect' then stamp else last_collection_at end,
    last_preflight_at=case when p_operation='preflight' then stamp else last_preflight_at end,updated_at=stamp where provider=b.provider;
  return jsonb_build_object('replay',false,'requestId',p_request,'lease',lease,'operation',p_operation,
    'games',(select jsonb_agg(jsonb_build_object('id',g->>'id','home',g->>'home','away',g->>'away','kickoff',g->>'kickoff') order by n)
      from jsonb_array_elements(c->'games') with ordinality q(g,n)),
    'remainingCredits',b.conservative_remaining,'reserveCredits',50,'season',c->'season','week',c->'week');
end $$;

-- create or replace keeps existing privileges; the grants are restated so this file stands on its own. The new
-- helper is service-only like every gtl_ RPC.
revoke all on function public.gtl_odds_carryover_slate(timestamptz),public.gtl_begin_odds_collection(uuid,uuid,text),
  public.gtl_finish_odds_collection(uuid,uuid,uuid,jsonb,jsonb,text),public.gtl_begin_submission_odds_collection(uuid,uuid,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.gtl_odds_carryover_slate(timestamptz),public.gtl_begin_odds_collection(uuid,uuid,text),
  public.gtl_finish_odds_collection(uuid,uuid,uuid,jsonb,jsonb,text),public.gtl_begin_submission_odds_collection(uuid,uuid,jsonb,text)
  to service_role;
