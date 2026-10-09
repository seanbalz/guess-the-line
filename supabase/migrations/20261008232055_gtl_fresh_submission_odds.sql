-- Fresh-reference submissions. No provider request, schedule, credential, or hosted activation is performed by this migration.
-- Prior ballots/snapshots are never backfilled; every check below applies only to a new save.

create or replace function public.gtl_submission_reference(p_payload jsonb,p_game jsonb,p_market text,p_saved timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e jsonb; q jsonb; vals numeric[]:='{}'; books text[]:='{}'; v numeric; midpoint numeric;
  receipts jsonb:='[]'; captured timestamptz; observed timestamptz; quoted timestamptz; first_quote timestamptz; last_quote timestamptz;
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
    receipts:=receipts||jsonb_build_array(jsonb_build_object('book',q->>'book','value',v,'observedAt',observed,'collectedAt',quoted));
    vals:=array_append(vals,v); books:=array_append(books,q->>'book');
    first_quote:=least(first_quote,observed); last_quote:=greatest(last_quote,observed);
  end loop;
  select array_agg(x order by x) into vals from unnest(vals) x; midpoint:=vals[2];
  if (select count(*) from unnest(vals) x where abs(x-midpoint)<=5)<3 or last_quote-first_quote>interval '5 minutes' then return null; end if;
  return jsonb_build_object('status',case when first_quote<p_saved-interval '5 minutes' then 'stale' else 'available' end,
    'value',case when first_quote<p_saved-interval '5 minutes' then null else midpoint end,
    'source','The Odds API · 3-book median','sourceUrl','https://the-odds-api.com/','bookCount',3,
    'capturedAt',captured,'observedAt',first_quote,'savedAt',p_saved,'officialVerified',false,
    'quotes',(select jsonb_agg(x order by x->>'book') from jsonb_array_elements(receipts) x),
    'reason',case when first_quote<p_saved-interval '5 minutes' then 'Saved market reference was older than five minutes at submission; unscored.' else null end);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then return null;
end $$;
revoke all on function public.gtl_submission_reference(jsonb,jsonb,text,timestamptz) from public,anon,authenticated;
grant execute on function public.gtl_submission_reference(jsonb,jsonb,text,timestamptz) to service_role;

-- All client intent fields are validated; names, kickoff and slate come from the
-- private database. This helper is service-only and must never be projected raw.
create function public.gtl_submission_intent_context(p_user uuid,p_intent jsonb) returns jsonb
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
    if not(p_intent ?& allowed) or exists(select 1 from jsonb_object_keys(p_intent) k where not(k=any(allowed)))
      or jsonb_typeof(p_intent->'season') is distinct from 'number' or (p_intent->>'season') !~ '^[0-9]{4}$'
      or jsonb_typeof(p_intent->'week') is distinct from 'number' or (p_intent->>'week') !~ '^[0-9]{1,2}$'
      or jsonb_typeof(p_intent->'personalRevision') is distinct from 'number' or (p_intent->>'personalRevision') !~ '^[0-9]{1,16}$'
      or (p_intent->>'personalRevision')::numeric>9007199254740990 then raise exception 'GTL_PERSONAL_INVALID'; end if;
    begin request:=(p_intent->>'requestId')::uuid; exception when invalid_text_representation then raise exception 'GTL_PERSONAL_INVALID'; end;
    if request is null then raise exception 'GTL_PERSONAL_INVALID'; end if;
    s:=(p_intent->>'season')::integer; w:=(p_intent->>'week')::integer;
    sig:=public.gtl_personal_context(p_user,s,w);
    -- Same personal -> weekly lock order as gtl_mutate_personal.
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
  if stamp>=to_timestamp((sig->>'deadline')::numeric) then raise exception 'GTL_PREDICTION_CLOSED'; end if;
  select * into b from public.gtl_weekly_ballots where user_id=p_user and season=s and week=w and mode=v_mode;
  -- Qualify the column to avoid ambiguity with the local variable.
  submitted:=coalesce(b.ballot->>'submittedAt','')<>'';
  for entry in select * from jsonb_each(picks) loop
    if not exists(select 1 from jsonb_array_elements(games) g where g->>'id'=entry.key) or jsonb_typeof(entry.value)<>'number' then raise exception 'GTL_BALLOT_INVALID'; end if;
    val:=entry.value::numeric;
    if mod(val*2,1)<>0 or (v_mode='guess_spread' and val not between -100 and 100) or (v_mode='guess_total' and val not between 0 and 200) then raise exception 'GTL_BALLOT_INVALID'; end if;
    if (submitted or (p_intent->>'submit')::boolean) and (not submitted or b.ballot#>array['picks',entry.key] is distinct from entry.value) then changed:=changed||jsonb_build_array(entry.key); end if;
  end loop;
  if (submitted or (p_intent->>'submit')::boolean) and (select count(*) from jsonb_object_keys(picks))<>jsonb_array_length(games) then raise exception 'GTL_BALLOT_INCOMPLETE'; end if;
  if exists(select 1 from jsonb_array_elements(games) g where changed ? (g->>'id') and stamp>=(g->>'kickoff')::timestamptz) then raise exception 'GTL_PREDICTION_CLOSED'; end if;
  return jsonb_build_object('season',s,'week',w,'signature',sig,'games',games,'changedGameIds',changed,
    'market',case when v_mode='guess_spread' then 'spread' else 'total' end,'requiresReferences',jsonb_array_length(changed)>0,'replay',false);
end $$;

create function public.gtl_preflight_submission(p_user uuid,p_intent jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; stamp timestamptz; g jsonb; snap record; ref jsonb; available boolean;
begin
  c:=public.gtl_submission_intent_context(p_user,p_intent);
  if not (c->>'requiresReferences')::boolean then return jsonb_build_object('requiresReferences',false,'ready',true); end if;
  stamp:=clock_timestamp();
  for g in select x from jsonb_array_elements(c->'games') x where (c->'changedGameIds') ? (x->>'id') loop
    available:=false;
    for snap in select payload from public.gtl_market_snapshots
      where season=(c->>'season')::integer and week=(c->>'week')::integer and slate_signature=c->'signature' and created_at<=stamp
      order by created_at desc,id desc limit 20 loop
      ref:=public.gtl_submission_reference(snap.payload,g,c->>'market',stamp);
      -- Match the existing save's first structurally qualifying observation.
      if ref is not null then available:=ref->>'status'='available'; exit; end if;
    end loop;
    if not available then return jsonb_build_object('requiresReferences',true,'ready',false); end if;
  end loop;
  return jsonb_build_object('requiresReferences',true,'ready',true);
end $$;

-- UPSERT fires INSERT triggers before conflict resolution, so load the current
-- canonical row even for TG_OP=INSERT. Upstream save functions hold its version
-- lock. The same guard covers group and personal saves in their transaction.
create function public.gtl_guard_fresh_submission() returns trigger
language plpgsql security invoker set search_path='' as $$
declare prior public.gtl_weekly_ballots; sig jsonb; game jsonb; g jsonb; pick record; ref jsonb;
  expected jsonb; snap public.gtl_market_snapshots; stamp timestamptz; submitted boolean; snapshot_id uuid;
begin
  select * into prior from public.gtl_weekly_ballots where user_id=new.user_id and season=new.season and week=new.week and mode=new.mode;
  submitted:=coalesce(prior.ballot->>'submittedAt','')<>'';
  if coalesce(new.ballot->>'submittedAt','')='' then
    if submitted then raise exception 'GTL_BALLOT_INCOMPLETE'; end if;
    return new;
  end if;
  if submitted and new.ballot->'submittedAt' is distinct from prior.ballot->'submittedAt' then raise exception 'GTL_SUBMISSION_ODDS_REQUIRED'; end if;
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
    if ref is null or ref->>'status' is distinct from 'available' or jsonb_typeof(ref->'value') is distinct from 'number'
      or (ref->>'savedAt')::timestamptz is distinct from stamp or (ref->>'observedAt')::timestamptz<clock_timestamp()-interval '5 minutes' then raise exception 'GTL_SUBMISSION_ODDS_REQUIRED'; end if;
    select x into g from jsonb_array_elements(sig->'games') x where x->>'id'=pick.key;
    if g is null then raise exception 'GTL_BALLOT_INVALID'; end if;
    select x into game from public.gtl_schedule_templates t cross join lateral jsonb_array_elements(t.games) x
      where t.season=new.season and t.week=new.week and x->>'id'=pick.key and x->>'homeCode'=g->>'home' and x->>'awayCode'=g->>'away'
        and extract(epoch from (x->>'kickoff')::timestamptz)=(g->>'kickoff')::numeric order by t.created_at desc,t.id limit 1;
    if game is null then raise exception 'GTL_SUBMISSION_ODDS_REQUIRED'; end if;
    snapshot_id:=(ref->>'snapshotId')::uuid;
    select * into snap from public.gtl_market_snapshots where id=snapshot_id and season=new.season and week=new.week and slate_signature=sig and created_at<=stamp;
    if snap.id is null then raise exception 'GTL_SUBMISSION_ODDS_REQUIRED'; end if;
    expected:=public.gtl_submission_reference(snap.payload,game,case when new.mode='guess_spread' then 'spread' else 'total' end,stamp);
    if expected is null or expected->>'status' is distinct from 'available' or ref is distinct from (expected||jsonb_build_object('snapshotId',snap.id)) then raise exception 'GTL_SUBMISSION_ODDS_REQUIRED'; end if;
  end loop;
  return new;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception 'GTL_SUBMISSION_ODDS_REQUIRED';
end $$;
create trigger gtl_fresh_submission_guard before insert or update on public.gtl_weekly_ballots
  for each row execute function public.gtl_guard_fresh_submission();

create table public.gtl_submission_odds_intents (
  request_id uuid primary key references public.gtl_odds_collections(id),
  actor_id uuid not null references auth.users(id), intent jsonb not null check(jsonb_typeof(intent)='object'),
  created_at timestamptz not null default clock_timestamp()
);
create index gtl_submission_odds_actor_idx on public.gtl_submission_odds_intents(actor_id);
alter table public.gtl_submission_odds_intents enable row level security;
revoke all on public.gtl_submission_odds_intents from public,anon,authenticated,service_role;
grant select,insert on public.gtl_submission_odds_intents to service_role;

create function public.gtl_begin_submission_odds_collection(p_user uuid,p_request uuid,p_intent jsonb,p_operation text) returns jsonb
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
    if b.last_collection_at>stamp-interval '15 minutes' then raise exception 'GTL_ODDS_COOLDOWN'; end if;
    if (select count(*) from public.gtl_odds_collections where operation='collect' and started_at >= (date_trunc('day',stamp at time zone 'UTC') at time zone 'UTC'))>=4 then raise exception 'GTL_ODDS_DAILY_LIMIT'; end if;
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

create function public.gtl_finish_submission_odds_collection(p_user uuid,p_request uuid,p_lease uuid,p_payload jsonb,p_quota jsonb,p_error text) returns jsonb
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


revoke all on function public.gtl_submission_intent_context(uuid,jsonb),public.gtl_preflight_submission(uuid,jsonb),
  public.gtl_guard_fresh_submission(),public.gtl_begin_submission_odds_collection(uuid,uuid,jsonb,text),
  public.gtl_finish_submission_odds_collection(uuid,uuid,uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.gtl_submission_intent_context(uuid,jsonb),public.gtl_preflight_submission(uuid,jsonb),
  public.gtl_guard_fresh_submission(),public.gtl_begin_submission_odds_collection(uuid,uuid,jsonb,text),
  public.gtl_finish_submission_odds_collection(uuid,uuid,uuid,jsonb,jsonb,text) to service_role;
