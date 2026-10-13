-- October 12, 2026: two defects found when Steven's complete Week 6 ballot was
-- refused with GTL_SUBMISSION_REFRESH_COOLDOWN (HTTP 429) eight to ten minutes
-- after Sean's 21:11 UTC submission collection. Function-only, append-only and
-- idempotent: no table is changed, no row is written, rewritten or deleted, and
-- every Week 5 collection, snapshot, intent, ballot and budget value stays as
-- recorded. The original files are untouched because hosted history is append-only.
--
-- Defect 1, the submission dead zone. gtl_submission_reference and the
-- gtl_guard_fresh_submission trigger (20261008232055) accept a saved market
-- reference only while its earliest provider observation is at most five
-- minutes old, but gtl_begin_submission_odds_collection refused a new 'collect'
-- while gtl_odds_budget.last_collection_at was younger than fifteen minutes.
-- Every collection was therefore followed by about ten minutes in which fresh
-- quotes were required and could not be requested (reproduced on PGlite at
-- T = 5, 6, 8, 10, 12 and 14 minutes after a collection; fresh at 2 and 4; a
-- new collection only at 15). The collect cooldown in both begin RPCs now equals
-- the five-minute freshness window, which stays untouched. Because the
-- submission RPC already raises GTL_ODDS_NOT_REQUIRED while references are
-- fresh, the shorter cooldown cannot cause a duplicate collection. The shared
-- per-UTC-day 'collect' cap moves from four to six so that the two scheduled
-- runs leave four submission-triggered collections per day: six collections at
-- two credits for thirty-one days is 372 credits, 128 above the 50-credit
-- reserve on the 500-credit free plan. The preflight cooldown (1 minute), the
-- 24-hour preflight validity, the 90-second lease, the two-credit reservation,
-- the 52-credit budget guard and the replay rules are unchanged.
--
-- Defect 2, the Week 6 scheduled-collector skip. gtl_publish_week
-- (20261009120000) re-points gtl_odds_schedule to the newest published week
-- (Week 6, 14 games), but gtl_claim_odds_refresh derived the collector's slate
-- from gtl_odds_commissioner, which reads the private 'sean-troy-luke' league
-- state (still Week 5, 15 games; nothing advances it), and then demanded exactly
-- fifteen games. Both October 12 runs were skipped with slate_changed. Scheduled
-- and manual collection now resolve the slate from the published week
-- (gtl_weekly_slates plus the matching gtl_schedule_templates row, the exact
-- match rule gtl_submission_intent_context already uses), compare it with the
-- schedule configuration, and accept the published game count instead of a
-- hard-coded fifteen. gtl_odds_commissioner itself is unchanged: result review
-- and the benchmark freeze still use the league context.
--
-- Ruling: the five-minute cooldown was recorded as not approved
-- (docs/RELEASE_2026_10_08.md, docs/PICK_COMPLETION_AUDIT.md). This file is
-- applied to the hosted project only after Sean confirms the constants
-- (5 minutes, 6 per UTC day); see docs/DECISIONS.md. Verified locally by
-- tests/submission-odds-window.test.mjs, tests/fresh-submission-sql.test.mjs,
-- tests/odds-refresh.test.mjs and tests/odds-collection.test.mjs.

-- The published slate for one season/week, in the shape the provider adapter
-- needs: full team names and ISO kickoffs, ordered by kickoff then id. Null when
-- the week is unpublished or no template matches its signature.
create or replace function public.gtl_published_slate(p_season integer,p_week integer) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare sig jsonb; t public.gtl_schedule_templates;
begin
  if p_season is null or p_week is null then return null; end if;
  select signature into sig from public.gtl_weekly_slates where season=p_season and week=p_week;
  if sig is null then return null; end if;
  select x.* into t from public.gtl_schedule_templates x where x.season=p_season and x.week=p_week
    and public.gtl_weekly_slate(jsonb_build_object('league',jsonb_build_object('season',p_season,'week',p_week,'deadline',x.deadline),'games',x.games))=sig
    order by x.created_at desc,x.id limit 1;
  if t.id is null then return null; end if;
  return jsonb_build_object('season',p_season,'week',p_week,'signature',sig,'deadline',t.deadline,
    'games',(select jsonb_agg(jsonb_build_object('id',g->>'id','home',g->>'home','away',g->>'away','kickoff',g->>'kickoff') order by (g->>'kickoff')::timestamptz,g->>'id')
      from jsonb_array_elements(t.games) g));
end $$;

-- Same commissioner check as gtl_odds_commissioner, same result keys, but the
-- slate is the newest published week (the week gtl_publish_week points the
-- schedule row at and the default gtl_read_community / gtl_read_personal use).
create or replace function public.gtl_odds_collection_slate(p_user uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare s integer; w integer; slate jsonb;
begin
  if not exists(select 1 from public.gtl_memberships where user_id=p_user and league_id='sean-troy-luke' and player_id='sean' and role='commissioner' and active) then raise exception 'GTL_ODDS_FORBIDDEN'; end if;
  select season,week into s,w from public.gtl_weekly_slates order by season desc,week desc limit 1;
  slate:=public.gtl_published_slate(s,w);
  if slate is null then raise exception 'GTL_SLATE_CONFLICT'; end if;
  return jsonb_build_object('season',to_jsonb(s),'week',to_jsonb(w),'signature',slate->'signature','games',slate->'games');
end $$;

-- Body of 20261008185738 except the slate source (gtl_odds_collection_slate),
-- the collect cooldown (5 minutes) and the daily cap (6).
create or replace function public.gtl_begin_odds_collection(p_user uuid,p_request uuid,p_operation text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; b public.gtl_odds_budget; job public.gtl_odds_collections; stamp timestamptz; lease uuid;
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
    if (select count(*) from public.gtl_odds_collections where operation='collect' and started_at >= (date_trunc('day',stamp at time zone 'UTC') at time zone 'UTC'))>=6 then raise exception 'GTL_ODDS_DAILY_LIMIT'; end if;
  end if;
  lease:=gen_random_uuid();
  insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature)
    values(p_request,p_user,p_operation,'running',lease,stamp,stamp+interval '90 seconds',case when p_operation='collect' then 2 else 0 end,(c->>'season')::integer,(c->>'week')::integer,c->'signature');
  update public.gtl_odds_budget set lease_token=lease,lease_until=stamp+interval '90 seconds',
    conservative_remaining=case when p_operation='collect' then conservative_remaining-2 else conservative_remaining end,
    last_collection_at=case when p_operation='collect' then stamp else last_collection_at end,
    last_preflight_at=case when p_operation='preflight' then stamp else last_preflight_at end,updated_at=stamp where provider=b.provider;
  return jsonb_build_object('replay',false,'requestId',p_request,'lease',lease,'operation',p_operation,'games',c->'games',
    'remainingCredits',b.conservative_remaining,'reserveCredits',50,'season',c->'season','week',c->'week');
end $$;

-- Body of 20261008185738 except the slate source (gtl_odds_collection_slate).
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

-- Body of 20261008232055 except the collect cooldown (5 minutes, equal to the
-- freshness window) and the daily cap (6). Preflight, lease, replay, reservation
-- and budget logic are unchanged.
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
    if (select count(*) from public.gtl_odds_collections where operation='collect' and started_at >= (date_trunc('day',stamp at time zone 'UTC') at time zone 'UTC'))>=6 then raise exception 'GTL_ODDS_DAILY_LIMIT'; end if;
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

-- Body of 20261008200926 except the slate source and the game-count rule: the
-- published slate must match the schedule configuration (season, week and
-- signature) and carry the configured number of games, not exactly fifteen.
-- The success result keeps the shape cloud/odds-refresh.mjs expects.
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
    if c->'signature' is distinct from cfg.slate_signature or (c->>'season')::integer<>cfg.season or (c->>'week')::integer<>cfg.week then failure:='slate_changed';
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

-- Body of 20261008200926 except 'partial' is relative to the published game
-- count n (fewer than n matched events or 6n quotes: three books, two markets).
create or replace function public.gtl_complete_odds_refresh(p_run uuid,p_claim uuid,p_reason text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare run public.gtl_odds_refresh_runs; collection public.gtl_odds_collections; state text; result_reason text; n integer;
begin
  select * into run from public.gtl_odds_refresh_runs where id=p_run for update;
  if not found or p_claim is null or run.claim_token is distinct from p_claim then raise exception 'GTL_SCHEDULE_RUN'; end if;
  if run.status<>'running' then return jsonb_build_object('runId',run.id,'status',run.status,'reason',run.reason); end if;
  if run.claimed_at<clock_timestamp()-interval '10 minutes' then raise exception 'GTL_SCHEDULE_EXPIRED'; end if;
  if p_reason is not null and p_reason not in ('budget_guard','cooldown','daily_limit','collection_busy','preflight_failed','provider_failed','slate_changed','commissioner_unavailable') then raise exception 'GTL_SCHEDULE_RUN'; end if;
  select * into collection from public.gtl_odds_collections where id=run.collection_request_id;
  if found and collection.status='succeeded' then
    n:=coalesce(jsonb_array_length(collection.slate_signature->'games'),0);
    if coalesce((collection.diagnostics->>'availableQuotes')::integer,0)=0 then state:='skipped'; result_reason:='no_quotes';
    elsif (collection.diagnostics->>'matchedEvents')::integer<n or (collection.diagnostics->>'availableQuotes')::integer<6*n then state:='partial';
    else state:='succeeded'; end if;
  else
    result_reason:=coalesce(p_reason,'provider_failed');
    state:=case when result_reason in ('budget_guard','cooldown','daily_limit','collection_busy','slate_changed','commissioner_unavailable') then 'skipped' else 'failed' end;
  end if;
  update public.gtl_odds_refresh_runs set status=state,reason=result_reason,finished_at=clock_timestamp() where id=run.id;
  return jsonb_build_object('runId',run.id,'status',state,'reason',result_reason);
end $$;

-- Body of 20261008200926 except the slate status comes from the published week
-- the schedule row points at (relative to its game count); membership in the
-- league is still required (GTL_FORBIDDEN). Adds the configured season and week.
create or replace function public.gtl_read_odds_schedule(p_user uuid,p_league text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; cfg public.gtl_odds_schedule; run public.gtl_odds_refresh_runs; slate text:='unavailable'; upcoming integer; n integer;
  budget public.gtl_odds_budget; pause_reason text; effective boolean;
begin
  perform public.gtl_weekly_context(p_user,p_league);
  select * into cfg from public.gtl_odds_schedule where id='nfl-12h';
  if found then c:=public.gtl_published_slate(cfg.season,cfg.week); end if;
  if c is not null and cfg.slate_signature=c->'signature' then
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

-- create or replace keeps existing privileges; the grants are restated so this
-- file stands on its own. gtl_dispatch_odds_refresh stays admin-only and
-- gtl_odds_commissioner's grants are untouched.
revoke all on function public.gtl_published_slate(integer,integer),public.gtl_odds_collection_slate(uuid),
  public.gtl_begin_odds_collection(uuid,uuid,text),public.gtl_finish_odds_collection(uuid,uuid,uuid,jsonb,jsonb,text),
  public.gtl_begin_submission_odds_collection(uuid,uuid,jsonb,text),
  public.gtl_claim_odds_refresh(text,uuid),public.gtl_complete_odds_refresh(uuid,uuid,text),public.gtl_read_odds_schedule(uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.gtl_published_slate(integer,integer),public.gtl_odds_collection_slate(uuid),
  public.gtl_begin_odds_collection(uuid,uuid,text),public.gtl_finish_odds_collection(uuid,uuid,uuid,jsonb,jsonb,text),
  public.gtl_begin_submission_odds_collection(uuid,uuid,jsonb,text),
  public.gtl_claim_odds_refresh(text,uuid),public.gtl_complete_odds_refresh(uuid,uuid,text),public.gtl_read_odds_schedule(uuid,text)
  to service_role;
