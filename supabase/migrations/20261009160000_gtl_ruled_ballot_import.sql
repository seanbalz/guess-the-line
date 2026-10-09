-- D-25: a commissioner-ruled hosted import of one on-time ballot that the normal
-- save path can no longer accept (its deadline has passed and no D-16 snapshot
-- exists for its submission instant). The ballot is written exactly as a
-- submission-time save would have written it, with the ruled per-game references
-- in scoringReferences, so the community leaderboard scores it with the ruling and
-- never with a later snapshot. The ballot_submitted feed post comes from the
-- unchanged gtl_feed_on_ballot trigger, so the D-23 reveal gate applies as usual.
--
-- Scope: the shared community leaderboard and feed only (D-21/D-23 world). No
-- gtl_memberships row, league roster entry or group standings row is written: a
-- player imported here is not on any group roster. This migration applies no
-- hosted data; the import itself is run separately (scripts/import-ruled-ballot.mjs
-- or the equivalent select statement through the Supabase MCP).
--
-- The fresh-submission guard is bypassed only while this one function is on the
-- call stack: the function sets a transaction-local flag AND the guard checks
-- PG_CONTEXT for the function's frame. Neither the flag (set_config is not a REST
-- RPC) nor the frame is reachable from the browser roles, and a flag set by hand in
-- the SQL editor still leaves the guard in force for a direct insert.

-- One immutable ruling record per imported ballot, modelled on
-- gtl_weekly_eligibility_rulings, which keeps its read-only runtime grant.
create table public.gtl_ruled_ballot_imports (
  user_id uuid not null,
  season integer not null,
  week integer not null,
  mode text not null check (mode in ('guess_spread','guess_total')),
  submitted_at timestamptz not null,
  ruling text not null check (length(ruling) between 10 and 1000),
  decision text not null check (decision ~ '^D-[0-9]{1,3}$'),
  approved_by uuid not null references auth.users(id),
  -- The league whose commissioner ruled (the community admin check); not a roster entry.
  context_league_id text not null references public.gtl_leagues(id),
  recorded_at timestamptz not null default now(),
  evidence jsonb not null check (jsonb_typeof(evidence)='object'),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  primary key(user_id,season,week,mode),
  foreign key(user_id,season,week,mode) references public.gtl_weekly_ballots
);
alter table public.gtl_ruled_ballot_imports enable row level security;
revoke all on public.gtl_ruled_ballot_imports from public,anon,authenticated,service_role;
-- No update or delete: a ruling record is final.
grant select,insert on public.gtl_ruled_ballot_imports to service_role;

-- Same body as 20261008232055 plus the first block. Every other writer, including
-- API v14's /personal/ballot and group /ballot paths, is checked exactly as before.
create or replace function public.gtl_guard_fresh_submission() returns trigger
language plpgsql security invoker set search_path='' as $$
declare prior public.gtl_weekly_ballots; sig jsonb; game jsonb; g jsonb; pick record; ref jsonb;
  expected jsonb; snap public.gtl_market_snapshots; stamp timestamptz; submitted boolean; snapshot_id uuid; ctx text;
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

-- p_actor must be the community admin (the founding league's commissioner, the
-- same check cloud/community.mjs relies on); p_user must already have a profile.
-- p_reference: {decision:'D-25', source, sourceUrl (https), snapshot (repo path),
-- capturedAt, observedAt, values:{gameId: ruledValue}}; every slate game needs a
-- pick and a ruled value. Idempotent: an identical second call writes nothing and
-- returns imported:false; a different submitted ballot for the same key fails
-- closed. The week must already have closed (clock_timestamp() at or past its
-- deadline): before that the normal save path with a fresh D-16 reference is the
-- only way in, whoever the caller is. Timestamps render in UTC inside the function
-- so a replay compares equal whatever the caller's session time zone.
create function public.gtl_import_ruled_ballot(p_actor uuid,p_user uuid,p_season integer,p_week integer,p_mode text,p_picks jsonb,p_submitted_at timestamptz,p_ruling text,p_reference jsonb)
returns jsonb language plpgsql security invoker set search_path='' set timezone='UTC' as $$
declare sig jsonb; deadline timestamptz; opens timestamptz; captured timestamptz; observed timestamptz; game_count integer; g text; v numeric;
  refs jsonb:='{}'; next_ballot jsonb; event jsonb; b public.gtl_weekly_ballots; r public.gtl_ruled_ballot_imports; rev bigint; stamp timestamptz;
  decision text; digest text; post_id uuid; dedupe text;
begin
  if not public.gtl_community_admin(p_actor) then raise exception 'GTL_COMMUNITY_FORBIDDEN'; end if;
  if p_user is null or not exists(select 1 from public.gtl_profiles where user_id=p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_season is null or p_week is null or p_mode is null or p_mode not in ('guess_spread','guess_total')
    or p_picks is null or jsonb_typeof(p_picks)<>'object' or octet_length(p_picks::text)>16384
    or p_submitted_at is null or not isfinite(p_submitted_at)
    or p_ruling is null or length(btrim(p_ruling)) not between 10 and 1000
    or p_reference is null or jsonb_typeof(p_reference)<>'object' or octet_length(p_reference::text)>16384
    or jsonb_typeof(p_reference->'values') is distinct from 'object'
    or coalesce(p_reference->>'decision','') !~ '^D-[0-9]{1,3}$'
    or length(btrim(coalesce(p_reference->>'source',''))) not between 2 and 200
    or coalesce(p_reference->>'sourceUrl','') !~ '^https://'
    or length(coalesce(p_reference->>'snapshot','')) not between 1 and 200 then raise exception 'GTL_RULED_IMPORT_INVALID'; end if;
  begin captured:=(p_reference->>'capturedAt')::timestamptz; observed:=(p_reference->>'observedAt')::timestamptz;
  exception when others then raise exception 'GTL_RULED_IMPORT_INVALID'; end;
  -- The ruled reference must have existed before the ruled submission instant (D-16's spirit).
  if captured is null or observed is null or not isfinite(captured) or not isfinite(observed) or observed>captured or captured>p_submitted_at then raise exception 'GTL_RULED_IMPORT_INVALID'; end if;
  decision:=p_reference->>'decision';
  select signature into sig from public.gtl_weekly_slates where season=p_season and week=p_week;
  if sig is null then raise exception 'GTL_SLATE_CONFLICT'; end if;
  deadline:=to_timestamp((sig->>'deadline')::double precision); opens:=public.gtl_week_open_at(p_season,p_week);
  -- On time means inside that week's pick window (D-24 open, existing deadline).
  if p_submitted_at>=deadline or p_submitted_at<opens then raise exception 'GTL_RULED_IMPORT_INVALID'; end if;
  -- Only once the normal save path has closed; with the window check above this also
  -- means the ruled submission instant is always in the past.
  if clock_timestamp()<deadline then raise exception 'GTL_RULED_IMPORT_INVALID'; end if;
  game_count:=jsonb_array_length(sig->'games');
  if (select count(*) from jsonb_object_keys(p_picks))<>game_count or (select count(*) from jsonb_object_keys(p_reference->'values'))<>game_count then raise exception 'GTL_BALLOT_INCOMPLETE'; end if;
  for g in select x->>'id' from jsonb_array_elements(sig->'games') x order by x->>'id' loop
    if jsonb_typeof(p_picks->g) is distinct from 'number' then raise exception 'GTL_BALLOT_INVALID'; end if;
    v:=(p_picks->>g)::numeric;
    if mod(v*2,1)<>0 or (p_mode='guess_spread' and v not between -100 and 100) or (p_mode='guess_total' and v not between 0 and 200) then raise exception 'GTL_BALLOT_INVALID'; end if;
    if jsonb_typeof(p_reference->'values'->g) is distinct from 'number' then raise exception 'GTL_RULED_IMPORT_INVALID'; end if;
    v:=(p_reference->'values'->>g)::numeric;
    if (p_mode='guess_spread' and v not between -100 and 100) or (p_mode='guess_total' and v not between 0 and 200) then raise exception 'GTL_RULED_IMPORT_INVALID'; end if;
    -- The shape gtl_save_weekly_ballot writes, plus the ruling label. snapshotId is
    -- null on purpose: there is no gtl_market_snapshots row behind a ruled reference.
    refs:=refs||jsonb_build_object(g,jsonb_build_object('status','available','value',p_reference->'values'->g,
      'source',btrim(p_reference->>'source'),'sourceUrl',p_reference->>'sourceUrl','bookCount',null,'snapshotId',null,
      'snapshotFile',p_reference->>'snapshot','capturedAt',captured,'observedAt',observed,'savedAt',p_submitted_at,
      'officialVerified',false,'basis','commissioner-ruled','decision',decision,'reason',null));
  end loop;
  next_ballot:=jsonb_build_object('picks',p_picks,'submittedAt',p_submitted_at,'updatedAt',p_submitted_at,
    'scoringPolicy','submission-time','scoringReferences',refs,
    'ruling',jsonb_build_object('decision',decision,'basis','commissioner-ruled','approvedBy',p_actor));
  digest:=encode(sha256(convert_to(jsonb_build_object('season',p_season,'week',p_week,'mode',p_mode,'picks',p_picks,
    'submittedAt',p_submitted_at,'references',p_reference->'values')::text,'UTF8')),'hex');
  dedupe:=format('ballot:%s:%s:%s:%s',p_user,p_season,p_week,p_mode);
  insert into public.gtl_weekly_versions(user_id,season,week) values(p_user,p_season,p_week) on conflict do nothing;
  select revision into rev from public.gtl_weekly_versions where user_id=p_user and season=p_season and week=p_week for update;
  select * into b from public.gtl_weekly_ballots where user_id=p_user and season=p_season and week=p_week and mode=p_mode;
  if b.user_id is not null and coalesce(b.ballot->>'submittedAt','')<>'' then
    select * into r from public.gtl_ruled_ballot_imports where user_id=p_user and season=p_season and week=p_week and mode=p_mode;
    if b.ballot=next_ballot and r.user_id is not null and r.payload_sha256=digest then
      select id into post_id from public.gtl_feed_posts where dedupe_key=dedupe;
      return jsonb_build_object('imported',false,'replayed',true,'userId',p_user,'season',p_season,'week',p_week,'mode',p_mode,
        'submittedAt',p_submitted_at,'revision',rev,'games',game_count,'references',game_count,'postId',post_id,'payloadSha256',digest,'decision',decision);
    end if;
    raise exception 'GTL_RULED_IMPORT_CONFLICT';
  end if;
  stamp:=clock_timestamp();
  event:=jsonb_build_object('id',gen_random_uuid(),'player','u_'||replace(p_user::text,'-',''),'mode',p_mode,'type','ballot_submitted',
    'timestamp',p_submitted_at,'recordedAt',stamp,'actor',p_actor,'origin','commissioner_ruled_import','decision',decision,'ruling',btrim(p_ruling),
    'before',coalesce(b.ballot->'picks','{}'),'after',p_picks,
    'changedGameIds',(select jsonb_agg(x->>'id' order by x->>'id') from jsonb_array_elements(sig->'games') x),
    'beforeScoringReferences',coalesce(b.ballot->'scoringReferences','{}'),'afterScoringReferences',refs);
  -- A prior draft (no submittedAt) keeps its audit trail and is completed by the ruling.
  perform set_config('gtl.ruled_ballot_import','commissioner',true);
  insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot,audit,origin_practice,provenance)
    values(p_user,p_season,p_week,p_mode,next_ballot,jsonb_build_array(event),false,
      jsonb_build_array(jsonb_build_object('scope','community','import','commissioner_ruled','decision',decision,'approvedBy',p_actor)))
    on conflict(user_id,season,week,mode) do update set ballot=excluded.ballot,audit=public.gtl_weekly_ballots.audit||excluded.audit,
      origin_practice=false,provenance=public.gtl_weekly_ballots.provenance||excluded.provenance;
  -- Housekeeping, not the control: the guard's PG_CONTEXT check is what scopes the
  -- bypass. Clearing the flag keeps it from being read later in the same transaction.
  perform set_config('gtl.ruled_ballot_import','',true);
  update public.gtl_weekly_versions set revision=revision+1 where user_id=p_user and season=p_season and week=p_week;
  rev:=rev+1;
  insert into public.gtl_ruled_ballot_imports(user_id,season,week,mode,submitted_at,ruling,decision,approved_by,context_league_id,recorded_at,evidence,payload_sha256)
    values(p_user,p_season,p_week,p_mode,p_submitted_at,btrim(p_ruling),decision,p_actor,'sean-troy-luke',stamp,p_reference,digest);
  insert into public.gtl_access_audit(actor_id,event) values(p_actor,format('ruled_ballot_import:%s:%s:%s:%s:%s',decision,p_user,p_season,p_week,p_mode));
  select id into post_id from public.gtl_feed_posts where dedupe_key=dedupe;
  return jsonb_build_object('imported',true,'replayed',false,'userId',p_user,'season',p_season,'week',p_week,'mode',p_mode,
    'submittedAt',p_submitted_at,'revision',rev,'games',game_count,'references',game_count,'postId',post_id,'payloadSha256',digest,'decision',decision);
end $$;

revoke all on function public.gtl_guard_fresh_submission(),
  public.gtl_import_ruled_ballot(uuid,uuid,integer,integer,text,jsonb,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.gtl_guard_fresh_submission(),
  public.gtl_import_ruled_ballot(uuid,uuid,integer,integer,text,jsonb,timestamptz,text,jsonb) to service_role;
