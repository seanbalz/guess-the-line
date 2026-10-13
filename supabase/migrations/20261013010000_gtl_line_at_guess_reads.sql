-- Sean's rulings of October 12, 2026 (D-27): (2) "they can submit their guesses whenever. The spread when they guessed
-- is the spread that their points total will be compared against" and (3) "all historical guesses for all individuals
-- should be saved in their accounts and shown in the community section, make sure you accumulate all data that's been
-- stored. All players made picks last week for totals and spreads". D-08 (October 8): Sean's and Steven's Week 5 spread
-- ballots count; the practice designation is superseded by the recorded eligibility rulings, while origin_practice and
-- the provenance stay as stored.
--
-- Read-time only. No gtl_weekly_ballots, gtl_weekly_eligibility_rulings or gtl_feed_posts row is written or changed by
-- this file or by anything it defines. Points are computed when the community readers run:
-- * A pick with a saved reference (D-16, D-27) or a commissioner-ruled one (D-25) keeps it. Those are never re-resolved;
--   'stale', 'unavailable' and 'pending' ones stay unscored, and pending ones are resolved only by D-27's write path.
-- * A submitted pick with no saved reference (the Week 5 ballots migrated from the group leagues) is compared with the
--   line at the guess, in D-27's order: the newest stored line at or before the guess, of any age; else the first line
--   stored after the guess and before that game's kickoff. Stored lines are the hosted 3-book snapshots, judged at their
--   own capture instant exactly as D-27's save path and pending resolver judge them, and reference lines imported by the
--   commissioner (gtl_reference_line_imports). An imported line counts only from its recorded capture instant: a page
--   time is never treated as a storage time. Nothing is interpolated or invented.
-- * The guess instant of a pick is the newest submission or post-submission edit event that set its current value (an
--   edit re-anchors, D-16), else the ballot's stored submittedAt. A ballot whose origin records that the original submission
--   time is unavailable (Sean's Week 5 spread, seeded with the eDraft 03:33 ET page time) is compared at its stored
--   submittedAt, the submission time D-16 keeps as stored, and each such reference says so (guessedAtKnown false); only a
--   later edit re-anchors one of its picks. For that ballot every instant the record allows (the stored 07:33:00Z and the
--   repository's pick commits, 08:03:33Z to 08:17:14Z) selects the same stored line, because nothing was stored between
--   07:33Z and the 09:01:21Z eDraft capture or, without that import, the 19:15:22Z hosted collection.
-- * Effective eligibility, wherever a community reader filtered "not origin_practice": the ballot's eligibility ruling if
--   one is recorded, else not origin_practice (the gtl_read_weekly_state rule since 20261008185715). History lists every
--   submitted ballot; an ineligible one shows its guesses and lines, labelled, and never scores or ranks (D-23).
-- * gtl_read_community's standings and gtl_read_community_history take every reference and point from one function,
--   gtl_ballot_pick_scores, so the leaderboard and the history cannot disagree.
--
-- Imported reference lines: an explicit commissioner ruling is required (D-25 pattern); D-27 alone does not make a
-- non-hosted page a stored line. The import RPC is limited to 2026 Week 5, needs a recorded capture instant before every
-- imported game's kickoff, is idempotent per file and payload, and every import can be voided by an append-only record
-- that the resolver honours. No import is run by this file.
--
-- Privacy: after the D-23 reveal, a pick's reference carries its guess instant (guessedAt, gapSeconds), as saved
-- references already carry savedAt; the revision count, the last change and the provenance stay owner-only.

create table public.gtl_reference_line_imports (
  id uuid primary key default gen_random_uuid(),
  season integer not null,
  week integer not null,
  source_file text not null check (source_file ~ '^data/snapshots/[A-Za-z0-9._-]+\.json$'),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  decision text not null check (decision ~ '^D-[0-9]{1,3}$'),
  ruling text not null check (length(ruling) between 10 and 1000),
  approved_by uuid not null references auth.users(id),
  context_league_id text not null references public.gtl_leagues(id),
  evidence jsonb not null check (jsonb_typeof(evidence)='object'),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  line_count integer not null check (line_count between 1 and 64),
  recorded_at timestamptz not null default now(),
  -- The migrated ballots without a saved line are all in 2026 Week 5; every other week takes its lines from D-27's save path.
  check (season=2026 and week=5),
  unique (file_sha256,payload_sha256),
  foreign key (season,week) references public.gtl_weekly_slates
);
create table public.gtl_reference_lines (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.gtl_reference_line_imports(id),
  season integer not null,
  week integer not null,
  game_id text not null check (game_id ~ '^[A-Z]{2,3}-[A-Z]{2,3}$'),
  market text not null check (market in ('spread','total')),
  -- Not forced to half points: the eDraft medians are unrounded (-7.3, 1.8), as D-25 accepted.
  value numeric not null check ((market='spread' and value between -100 and 100) or (market='total' and value between 0 and 200)),
  source text not null check (length(btrim(source)) between 2 and 200),
  source_url text not null check (source_url ~ '^https://'),
  source_file text not null,
  file_sha256 text not null,
  observed_at timestamptz not null,
  captured_at timestamptz not null,
  check (captured_at>=observed_at),
  unique (import_id,game_id,market),
  foreign key (season,week) references public.gtl_weekly_slates
);
create index gtl_reference_lines_lookup_idx on public.gtl_reference_lines(season,week,game_id,market,captured_at);
-- The correction path: an import is never edited or deleted; a void record takes it out of every read.
create table public.gtl_reference_line_voids (
  import_id uuid primary key references public.gtl_reference_line_imports(id),
  decision text not null check (decision ~ '^D-[0-9]{1,3}$'),
  reason text not null check (length(reason) between 10 and 1000),
  approved_by uuid not null references auth.users(id),
  context_league_id text not null references public.gtl_leagues(id),
  recorded_at timestamptz not null default now()
);
alter table public.gtl_reference_line_imports enable row level security;
alter table public.gtl_reference_lines enable row level security;
alter table public.gtl_reference_line_voids enable row level security;
revoke all on public.gtl_reference_line_imports,public.gtl_reference_lines,public.gtl_reference_line_voids from public,anon,authenticated,service_role;
-- Append-only: no update or delete for any runtime role.
grant select,insert on public.gtl_reference_line_imports,public.gtl_reference_lines,public.gtl_reference_line_voids to service_role;

-- The schedule-template game for a slate entry, resolved exactly as the fresh-submission guard and the history reader do
-- (same id, codes and kickoff; the newest template wins).
create function public.gtl_slate_game(p_season integer,p_week integer,p_signature jsonb,p_game_id text) returns jsonb
language sql stable security invoker set search_path='' as $$
  select x from public.gtl_schedule_templates t cross join lateral jsonb_array_elements(t.games) x
    cross join lateral (select e from jsonb_array_elements(p_signature->'games') e where e->>'id'=p_game_id) s
    where t.season=p_season and t.week=p_week and x->>'id'=p_game_id and x->>'homeCode'=s.e->>'home' and x->>'awayCode'=s.e->>'away'
      and extract(epoch from (x->>'kickoff')::timestamptz)=(s.e->>'kickoff')::numeric
    order by t.created_at desc,t.id limit 1
$$;

-- Effective eligibility (the group reader's rule since 20261008185715): the recorded ruling, else not origin_practice.
create function public.gtl_ballot_eligible(p_user uuid,p_season integer,p_week integer,p_mode text,p_origin_practice boolean) returns boolean
language sql stable security invoker set search_path='' as $$
  select coalesce((select r.eligible from public.gtl_weekly_eligibility_rulings r
    where r.user_id=p_user and r.season=p_season and r.week=p_week and r.mode=p_mode),not coalesce(p_origin_practice,false))
$$;

-- A ballot imported without its original submission time (server/store.mjs seeds Sean's Week 5 spread with the eDraft
-- 03:33 ET page time and origin 'Imported complete ballot; original submission time unavailable'). Its stored submittedAt is
-- still the submission time the ballot carries (D-16 keeps it; ruling 3: "accumulate all data that's been stored"); this flag
-- labels it as such and keeps a submission event in the audit from standing in for it.
create function public.gtl_submission_time_unknown(p_ballot jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
  select coalesce(p_ballot->>'origin','') ~* 'submission time unavailable'
$$;

-- When the current value of one pick was guessed: the newest submission or post-submission edit event that set it (D-16
-- re-anchors an edited guess), else the ballot's stored submittedAt. Draft saves are not guesses. For a ballot whose original
-- submission time is unavailable only a later edit replaces the stored submittedAt. Null only when no readable instant is stored.
create function public.gtl_guess_instant(p_ballot jsonb,p_audit jsonb,p_game_id text) returns timestamptz
language plpgsql stable security invoker set search_path='' as $$
declare t timestamptz; known boolean:=not public.gtl_submission_time_unknown(p_ballot);
begin
  begin
    select max((e->>'timestamp')::timestamptz) into t from jsonb_array_elements(case when jsonb_typeof(p_audit)='array' then p_audit else '[]'::jsonb end) e
      where (e->>'type'='ballot_edited' or (known and e->>'type'='ballot_submitted'))
        and jsonb_typeof(e->'after')='object' and e->'after'->p_game_id is not null
        and e->'after'->p_game_id=p_ballot#>array['picks',p_game_id]
        and ((jsonb_typeof(e->'changedGameIds')='array' and e->'changedGameIds' ? p_game_id) or e->'after'->p_game_id is distinct from e->'before'->p_game_id);
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then t:=null;
  end;
  if t is null then
    begin t:=(p_ballot->>'submittedAt')::timestamptz; exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then t:=null; end;
  end if;
  return case when t is not null and isfinite(t) then t end;
end $$;

-- The line at the guess for a pick with no saved reference.
-- Step 1, the newest stored line at or before the guess (any age): the hosted line gtl_reference_at_save would have saved
-- (stored and collected at or before the guess), or an imported line captured at or before it; the later observation wins
-- and a tie goes to the hosted 3-book line.
-- Step 2, only when step 1 found nothing: the first line stored after the guess and before kickoff: the hosted line
-- gtl_resolve_pending_reference would have resolved (stored and collected after the guess; book observation times are
-- not compared with the guess, as in D-27), or an imported line captured after it; the earlier capture wins and a tie goes
-- to the hosted line.
-- Else gtl_history_reference's 'no line stored' shapes. Voided imports are never used.
create function public.gtl_line_at_guess(p_season integer,p_week integer,p_signature jsonb,p_game jsonb,p_market text,p_guessed timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare kickoff timestamptz; snap record; line jsonb; hosted jsonb; hosted_id uuid; imp public.gtl_reference_lines; rule text; use_hosted boolean;
begin
  if p_market is null or p_market not in ('spread','total') or p_guessed is null or not isfinite(p_guessed) then return null; end if;
  if p_game is null then
    return jsonb_build_object('basis','none','label','no line stored','status','unavailable','value',null,'reason','no-schedule-template','guessedAt',p_guessed);
  end if;
  kickoff:=(p_game->>'kickoff')::timestamptz;
  if p_guessed>=kickoff then
    return jsonb_build_object('basis','none','label','no line stored','status','unavailable','value',null,'reason','guess-at-or-after-kickoff','guessedAt',p_guessed);
  end if;
  rule:='newest-at-or-before';
  for snap in select id,payload from public.gtl_market_snapshots where season=p_season and week=p_week and slate_signature=p_signature
      and created_at<=p_guessed order by created_at desc,id desc loop
    line:=public.gtl_line_from_snapshot(snap.payload,p_game,p_market);
    if line is not null and (line->>'capturedAt')::timestamptz<=p_guessed then hosted:=line; hosted_id:=snap.id; exit; end if;
  end loop;
  select r.* into imp from public.gtl_reference_lines r where r.season=p_season and r.week=p_week and r.game_id=p_game->>'id' and r.market=p_market
    and r.captured_at<=p_guessed and not exists(select 1 from public.gtl_reference_line_voids v where v.import_id=r.import_id)
    order by r.observed_at desc,r.captured_at desc,r.id desc limit 1;
  if hosted is null and imp.id is null then
    rule:='first-after-submission';
    for snap in select id,payload from public.gtl_market_snapshots where season=p_season and week=p_week and slate_signature=p_signature
        and created_at>p_guessed order by created_at,id loop
      line:=public.gtl_line_from_snapshot(snap.payload,p_game,p_market);
      continue when line is null or (line->>'capturedAt')::timestamptz<=p_guessed;
      hosted:=line; hosted_id:=snap.id; exit;
    end loop;
    select r.* into imp from public.gtl_reference_lines r where r.season=p_season and r.week=p_week and r.game_id=p_game->>'id' and r.market=p_market
      and r.captured_at>p_guessed and r.captured_at<kickoff and not exists(select 1 from public.gtl_reference_line_voids v where v.import_id=r.import_id)
      order by r.captured_at,r.observed_at,r.id limit 1;
    if hosted is null and imp.id is null then
      return public.gtl_history_reference(p_season,p_week,p_signature,p_game,p_market,p_guessed)||jsonb_build_object('guessedAt',p_guessed);
    end if;
    use_hosted:=imp.id is null or (hosted is not null and (hosted->>'capturedAt')::timestamptz<=imp.captured_at);
  else
    use_hosted:=imp.id is null or (hosted is not null and (hosted->>'observedAt')::timestamptz>=imp.observed_at);
  end if;
  if use_hosted then
    return jsonb_build_object('basis','line-at-guess','label','line at guess','rule',rule,'origin','hosted-snapshot','status','available',
      'value',hosted->'value','source',hosted->'source','sourceUrl',hosted->'sourceUrl','bookCount',hosted->'bookCount','snapshotId',hosted_id,
      'sourceFile',null,'fileSha256',null,'decision',null,'capturedAt',hosted->'capturedAt','observedAt',hosted->'observedAt','guessedAt',p_guessed,
      'gapSeconds',floor(extract(epoch from p_guessed-(hosted->>'observedAt')::timestamptz))::bigint);
  end if;
  return jsonb_build_object('basis','line-at-guess','label','line at guess','rule',rule,'origin','imported-reference','status','available',
    'value',imp.value,'source',imp.source,'sourceUrl',imp.source_url,'bookCount',null,'snapshotId',null,
    'sourceFile',imp.source_file,'fileSha256',imp.file_sha256,'decision',(select i.decision from public.gtl_reference_line_imports i where i.id=imp.import_id),
    'capturedAt',imp.captured_at,'observedAt',imp.observed_at,'guessedAt',p_guessed,
    'gapSeconds',floor(extract(epoch from p_guessed-imp.observed_at))::bigint);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return null;
end $$;

-- One row per slate game for a ballot, in kickoff order: the guess, the reference shown with it and the points it gives.
-- The single scoring path for gtl_read_community's standings and gtl_read_community_history. A line at the guess carries
-- guessedAtKnown: false when the guess instant is the stored submittedAt of a ballot whose original submission time is
-- unavailable, true otherwise.
create function public.gtl_ballot_pick_scores(p_season integer,p_week integer,p_mode text,p_ballot jsonb,p_audit jsonb)
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
      -- The reference saved with the guess (D-16/D-27) or ruled for it (D-25): never re-resolved.
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
        -- No readable submission instant is stored: nothing to compare at, and none is invented (D-16).
        reference:=jsonb_build_object('basis','none','label','submission time unavailable','status','unavailable','value',null,
          'reason','submission-time-unavailable','guessedAt',null,'guessedAtKnown',false);
      else
        reference:=public.gtl_line_at_guess(p_season,p_week,sig,public.gtl_slate_game(p_season,p_week,sig,gid),market,guessed)
          ||jsonb_build_object('guessedAtKnown',not (unknown and guessed is not distinct from stored));
      end if;
    else
      reference:=null;
    end if;
    points:=case when guess is not null and reference->>'status'='available' and jsonb_typeof(reference->'value')='number'
      then public.gtl_pick_points(guess,(reference->>'value')::numeric) end;
    return next;
  end loop;
end $$;

-- Commissioner-checked, idempotent import of one committed reference-line file (the D-25 pattern). Only for 2026 Week 5,
-- only once that week has closed, only under an explicit ruling (p_reference.decision), and only for lines whose page time
-- and recorded capture instant both precede that game's kickoff and are not in the future. An identical replay writes
-- nothing; different content for an active file path or sha256 fails closed; a voided payload is never re-imported.
-- Nothing here touches a ballot.
create function public.gtl_import_reference_lines(p_actor uuid,p_season integer,p_week integer,p_file text,p_file_sha256 text,p_ruling text,p_reference jsonb)
returns jsonb language plpgsql security invoker set search_path='' set timezone='UTC' as $$
declare sig jsonb; deadline timestamptz; observed timestamptz; captured timestamptz; decision text; digest text; header public.gtl_reference_line_imports;
  g record; m record; kickoff timestamptz; n integer:=0; import_id uuid; stamp timestamptz:=clock_timestamp();
begin
  if not public.gtl_community_admin(p_actor) then raise exception 'GTL_COMMUNITY_FORBIDDEN'; end if;
  if p_season is distinct from 2026 or p_week is distinct from 5 or p_file is null or p_file !~ '^data/snapshots/[A-Za-z0-9._-]+\.json$'
    or p_file_sha256 is null or p_file_sha256 !~ '^[0-9a-f]{64}$' or p_ruling is null or length(btrim(p_ruling)) not between 10 and 1000
    or p_reference is null or jsonb_typeof(p_reference)<>'object' or octet_length(p_reference::text)>16384
    or coalesce(p_reference->>'decision','') !~ '^D-[0-9]{1,3}$' or length(btrim(coalesce(p_reference->>'source',''))) not between 2 and 200
    or coalesce(p_reference->>'sourceUrl','') !~ '^https://' or jsonb_typeof(p_reference->'lines') is distinct from 'object'
    or jsonb_typeof(p_reference->'observedAt') is distinct from 'string' or jsonb_typeof(p_reference->'capturedAt') is distinct from 'string' then
    raise exception 'GTL_REFERENCE_IMPORT_INVALID';
  end if;
  begin observed:=(p_reference->>'observedAt')::timestamptz; captured:=(p_reference->>'capturedAt')::timestamptz;
  exception when others then raise exception 'GTL_REFERENCE_IMPORT_INVALID'; end;
  if observed is null or captured is null or not isfinite(observed) or not isfinite(captured) or captured<observed or captured>stamp then
    raise exception 'GTL_REFERENCE_IMPORT_INVALID';
  end if;
  select signature into sig from public.gtl_weekly_slates where season=p_season and week=p_week;
  if sig is null then raise exception 'GTL_SLATE_CONFLICT'; end if;
  deadline:=to_timestamp((sig->>'deadline')::double precision);
  -- An open week takes its lines from D-27's save path only.
  if stamp<deadline then raise exception 'GTL_REFERENCE_IMPORT_INVALID'; end if;
  decision:=p_reference->>'decision';
  for g in select key,value from jsonb_each(p_reference->'lines') loop
    kickoff:=null;
    select to_timestamp((x->>'kickoff')::numeric) into kickoff from jsonb_array_elements(sig->'games') x where x->>'id'=g.key;
    -- Stored before this game's kickoff: the capture instant, not only the page time.
    if kickoff is null or jsonb_typeof(g.value)<>'object' or captured>=kickoff
      or (select count(*) from jsonb_object_keys(g.value) k)<1 or exists(select 1 from jsonb_object_keys(g.value) k where k not in ('spread','total')) then
      raise exception 'GTL_REFERENCE_IMPORT_INVALID';
    end if;
    for m in select key,value from jsonb_each(g.value) loop
      if jsonb_typeof(m.value)<>'number' or (m.key='spread' and (m.value::text)::numeric not between -100 and 100)
        or (m.key='total' and (m.value::text)::numeric not between 0 and 200) then raise exception 'GTL_REFERENCE_IMPORT_INVALID'; end if;
      n:=n+1;
    end loop;
  end loop;
  if n not between 1 and 64 then raise exception 'GTL_REFERENCE_IMPORT_INVALID'; end if;
  digest:=encode(sha256(convert_to(jsonb_build_object('season',p_season,'week',p_week,'file',p_file,'fileSha256',p_file_sha256,'reference',p_reference)::text,'UTF8')),'hex');
  -- One import at a time, so the active-file check below cannot race.
  perform pg_advisory_xact_lock(hashtext('gtl_reference_line_import'));
  select i.* into header from public.gtl_reference_line_imports i where i.file_sha256=p_file_sha256 and i.payload_sha256=digest;
  if header.id is not null then
    if header.source_file=p_file and header.season=p_season and header.week=p_week
      and not exists(select 1 from public.gtl_reference_line_voids v where v.import_id=header.id) then
      return jsonb_build_object('imported',false,'replayed',true,'importId',header.id,'season',p_season,'week',p_week,'file',p_file,
        'fileSha256',p_file_sha256,'payloadSha256',digest,'lines',header.line_count,'decision',header.decision);
    end if;
    raise exception 'GTL_REFERENCE_IMPORT_CONFLICT';
  end if;
  if exists(select 1 from public.gtl_reference_line_imports i where (i.file_sha256=p_file_sha256 or i.source_file=p_file)
      and not exists(select 1 from public.gtl_reference_line_voids v where v.import_id=i.id)) then
    raise exception 'GTL_REFERENCE_IMPORT_CONFLICT';
  end if;
  begin
    insert into public.gtl_reference_line_imports(season,week,source_file,file_sha256,decision,ruling,approved_by,context_league_id,evidence,payload_sha256,line_count,recorded_at)
      values(p_season,p_week,p_file,p_file_sha256,decision,btrim(p_ruling),p_actor,'sean-troy-luke',p_reference-'lines',digest,n,stamp) returning id into import_id;
    insert into public.gtl_reference_lines(import_id,season,week,game_id,market,value,source,source_url,source_file,file_sha256,observed_at,captured_at)
      select import_id,p_season,p_week,lg.key,lm.key,(lm.value::text)::numeric,btrim(p_reference->>'source'),p_reference->>'sourceUrl',p_file,p_file_sha256,observed,captured
      from jsonb_each(p_reference->'lines') lg cross join lateral jsonb_each(lg.value) lm;
  exception when unique_violation then raise exception 'GTL_REFERENCE_IMPORT_CONFLICT';
  end;
  insert into public.gtl_access_audit(actor_id,event) values(p_actor,format('reference_line_import:%s:%s:%s:%s:%s',decision,p_season,p_week,p_file,p_file_sha256));
  return jsonb_build_object('imported',true,'replayed',false,'importId',import_id,'season',p_season,'week',p_week,'file',p_file,
    'fileSha256',p_file_sha256,'payloadSha256',digest,'lines',n,'decision',decision);
end $$;

-- The correction path for an import: commissioner-only, append-only, idempotent for the same reason. A voided import's
-- lines are no longer read anywhere; the import and its lines stay stored. A corrected payload can then be imported.
create function public.gtl_void_reference_line_import(p_actor uuid,p_import uuid,p_decision text,p_reason text) returns jsonb
language plpgsql security invoker set search_path='' set timezone='UTC' as $$
declare v public.gtl_reference_line_voids; stamp timestamptz:=clock_timestamp();
begin
  if not public.gtl_community_admin(p_actor) then raise exception 'GTL_COMMUNITY_FORBIDDEN'; end if;
  if p_import is null or not exists(select 1 from public.gtl_reference_line_imports where id=p_import)
    or coalesce(p_decision,'') !~ '^D-[0-9]{1,3}$' or p_reason is null or length(btrim(p_reason)) not between 10 and 1000 then
    raise exception 'GTL_REFERENCE_IMPORT_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtext('gtl_reference_line_import'));
  select * into v from public.gtl_reference_line_voids where import_id=p_import;
  if v.import_id is not null then
    if v.decision=p_decision and v.reason=btrim(p_reason) then
      return jsonb_build_object('voided',true,'replayed',true,'importId',p_import,'decision',v.decision,'recordedAt',v.recorded_at);
    end if;
    raise exception 'GTL_REFERENCE_IMPORT_CONFLICT';
  end if;
  insert into public.gtl_reference_line_voids(import_id,decision,reason,approved_by,context_league_id,recorded_at)
    values(p_import,p_decision,btrim(p_reason),p_actor,'sean-troy-luke',stamp);
  insert into public.gtl_access_audit(actor_id,event) values(p_actor,format('reference_line_void:%s:%s',p_decision,p_import));
  return jsonb_build_object('voided',true,'replayed',false,'importId',p_import,'decision',p_decision,'recordedAt',stamp);
end $$;

-- Body of 20261009140000 (the newest definition) with two changes: effective eligibility instead of "not origin_practice"
-- (submissions and standings), and per-pick points from gtl_ballot_pick_scores (saved and ruled lines unchanged; a guess
-- with no saved line scores against the line at the guess). The output shape is unchanged.
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
    -- D-22: the viewer's coming-soon league notifications and member counts per league.
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
        'filled',coalesce((select count(*) from jsonb_object_keys(coalesce(b.ballot->'picks','{}'))),0),
        'games',game_count) order by m.mode)
      from (values('guess_spread'),('guess_total')) m(mode)
      left join public.gtl_weekly_ballots b on b.user_id=p_user and b.season=s and b.week=w and b.mode=m.mode) end,
    -- Who has submitted or sat out this week, never the numbers.
    'submissions',case when s is null then '[]'::jsonb else coalesce((select jsonb_agg(q.entry order by q.user_id,q.mode) from (
      select b.user_id,b.mode,jsonb_build_object('userId',b.user_id,'mode',b.mode,'submittedAt',b.ballot->'submittedAt','satOut',false) entry
        from public.gtl_weekly_ballots b where b.season=s and b.week=w and coalesce(b.ballot->>'submittedAt','')<>''
          and public.gtl_ballot_eligible(b.user_id,b.season,b.week,b.mode,b.origin_practice)
      union all
      select o.user_id,o.mode,jsonb_build_object('userId',o.user_id,'mode',o.mode,'submittedAt',null,'satOut',true)
        from public.gtl_weekly_optouts o where o.season=s and o.week=w) q),'[]') end,
    -- Points only, never picks: saved and ruled lines as stored (D-16/D-25); a guess with no saved line scores against the
    -- line at the guess (D-27), the same gtl_ballot_pick_scores rows the history shows.
    'standings',case when s is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('userId',t.user_id,'mode',t.mode,
        'weekPoints',t.week_points,'weekScored',t.week_scored,'seasonPoints',t.season_points,'seasonScored',t.season_scored,'weeksSubmitted',t.weeks,
        'satOut',exists(select 1 from public.gtl_weekly_optouts o where o.user_id=t.user_id and o.season=s and o.week=w and o.mode=t.mode))
        order by t.mode,t.season_points desc,t.user_id) from (
      select u.user_id,u.mode,
        round(coalesce(sum(pt.points) filter (where b.week=w),0),2) week_points,count(pt.points) filter (where b.week=w) week_scored,
        round(coalesce(sum(pt.points),0),2) season_points,count(pt.points) season_scored,count(distinct b.week) weeks
      from (select x.user_id,x.mode from public.gtl_weekly_ballots x where x.season=s and coalesce(x.ballot->>'submittedAt','')<>''
              and public.gtl_ballot_eligible(x.user_id,x.season,x.week,x.mode,x.origin_practice)
            union select o.user_id,o.mode from public.gtl_weekly_optouts o where o.season=s) u
      left join public.gtl_weekly_ballots b on b.user_id=u.user_id and b.mode=u.mode and b.season=s and coalesce(b.ballot->>'submittedAt','')<>''
        and public.gtl_ballot_eligible(b.user_id,b.season,b.week,b.mode,b.origin_practice)
      left join lateral (select ps.points from public.gtl_ballot_pick_scores(b.season,b.week,b.mode,b.ballot,b.audit) ps where ps.points is not null) pt on true
      group by u.user_id,u.mode) t),'[]') end,
    'posts',coalesce((select jsonb_agg(x.post order by x.created_at desc,x.id desc) from (
      select p.id,p.created_at,jsonb_build_object('id',p.id,'actorId',p.actor_id,'kind',p.kind,'season',p.season,'week',p.week,'mode',p.mode,
        'payload',p.payload,'createdAt',p.created_at,
        'likes',(select count(*) from public.gtl_feed_likes l where l.post_id=p.id),
        'likedByMe',exists(select 1 from public.gtl_feed_likes l where l.post_id=p.id and l.user_id=p_user),
        'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'userId',c.user_id,'body',c.body,'createdAt',c.created_at) order by c.created_at,c.id)
          from public.gtl_feed_comments c where c.post_id=p.id),'[]'),
        'picks',case when p.kind<>'ballot_submitted' then null
          when p.actor_id=p_user or public.gtl_week_revealed(p_user,p.season,p.week,p.mode,now_at)
          then (select b.ballot->'picks' from public.gtl_weekly_ballots b where b.user_id=p.actor_id and b.season=p.season and b.week=p.week and b.mode=p.mode)
          else null end,
        'picksHidden',p.kind='ballot_submitted' and p.actor_id<>p_user and not public.gtl_week_revealed(p_user,p.season,p.week,p.mode,now_at)
      ) post
      from public.gtl_feed_posts p
      where p_before is null or p.created_at<p_before
      order by p.created_at desc,p.id desc limit p_limit) x),'[]')
  ) into result;
  return result;
end $$;

-- Body of 20261012223000 with these changes: every submitted ballot is listed whatever its eligibility (an ineligible one is
-- labelled and never scored, D-23); the slate games come from gtl_slate_game; per-pick rows come from
-- gtl_ballot_pick_scores; each entry carries eligible, eligibility and submittedAtKnown.
create or replace function public.gtl_read_community_history(p_user uuid,p_season integer default null,p_now timestamptz default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare s integer; now_at timestamptz:=coalesce(p_now,clock_timestamp()); z record; b record; o record; g jsonb; tg jsonb; ps record;
  games jsonb; results jsonb; entries jsonb; weeks jsonb:='[]'; deadline timestamptz; rev_spread boolean; rev_total boolean;
  submitted boolean; own boolean; revealed boolean; scope text; picks jsonb; pts numeric;
  week_points numeric; week_scored integer; eligible boolean; ruled boolean; eligibility text;
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  s:=p_season;
  if s is null then select max(season) into s from public.gtl_weekly_slates; end if;
  for z in select season,week,signature from public.gtl_weekly_slates where season=s order by week desc loop
    deadline:=to_timestamp((z.signature->>'deadline')::double precision);
    -- Slate games with the full names the schedule template carries.
    games:='[]';
    for g in select x from jsonb_array_elements(z.signature->'games') x order by (x->>'kickoff')::numeric,x->>'id' loop
      tg:=public.gtl_slate_game(z.season,z.week,z.signature,g->>'id');
      games:=games||jsonb_build_array(jsonb_build_object('id',g->>'id','awayCode',g->>'away','homeCode',g->>'home',
        'away',coalesce(tg->>'away',g->>'away'),'home',coalesce(tg->>'home',g->>'home'),'kickoff',to_timestamp((g->>'kickoff')::numeric)));
    end loop;
    -- Finals: the latest D-26 settlement version per game; a commissioner-reported final (gtl_reviewed_result_events) fills a
    -- game the settlement ledger has not recorded. Each is labelled.
    results:=coalesce((select jsonb_object_agg(q.game_id,q.r) from (
      select distinct on (v.game_id) v.game_id,jsonb_build_object('status',v.status,'home',v.home,'away',v.away,'source',v.source,'sourceUrl',v.source_url,
        'observedAt',v.observed_at,'settledAt',v.settled_at,'origin','settlement') r
      from public.gtl_virtual_units_settlements v where v.season=z.season and v.week=z.week order by v.game_id,v.version desc) q),'{}');
    results:=coalesce((select jsonb_object_agg(q.game_id,jsonb_build_object('status',q.result->>'status','home',q.result->'home','away',q.result->'away',
        'source',q.result->'source','sourceUrl',q.result->'sourceURL','observedAt',q.result->'observedAt','settledAt',q.result->'reviewedAt','origin','commissioner_reported'))
      from (select distinct on (e.game_id) e.game_id,e.result from public.gtl_reviewed_result_events e where e.season=z.season and e.week=z.week order by e.game_id,e.version desc) q
      where not results ? q.game_id and q.result->>'status'='final'),'{}')||results;
    rev_spread:=public.gtl_week_revealed(p_user,z.season,z.week,'guess_spread',now_at);
    rev_total:=public.gtl_week_revealed(p_user,z.season,z.week,'guess_total',now_at);
    entries:='[]';
    -- Every submitted ballot of every member, eligible or not, plus the viewer's own drafts. A member and market that was sat
    -- out is listed by the opt-out loop below instead (a draft saved before sitting out stays stored, D-23).
    for b in select x.* from public.gtl_weekly_ballots x where x.season=z.season and x.week=z.week
        and (coalesce(x.ballot->>'submittedAt','')<>'' or (x.user_id=p_user and coalesce(x.ballot->'picks','{}'::jsonb)<>'{}'::jsonb))
        and not exists(select 1 from public.gtl_weekly_optouts opt where opt.user_id=x.user_id and opt.season=x.season and opt.week=x.week and opt.mode=x.mode)
        order by x.user_id,x.mode loop
      submitted:=coalesce(b.ballot->>'submittedAt','')<>'';
      own:=b.user_id=p_user;
      revealed:=own or (case when b.mode='guess_spread' then rev_spread else rev_total end);
      ruled:=exists(select 1 from public.gtl_weekly_eligibility_rulings r where r.user_id=b.user_id and r.season=b.season and r.week=b.week and r.mode=b.mode);
      eligible:=public.gtl_ballot_eligible(b.user_id,b.season,b.week,b.mode,b.origin_practice);
      eligibility:=case when ruled and eligible then 'ruled-eligible' when ruled then 'ruled-ineligible' when b.origin_practice then 'practice' else 'standard' end;
      scope:=case when jsonb_typeof(b.provenance)<>'array' then 'unknown'
        when exists(select 1 from jsonb_array_elements(b.provenance) e where e->>'import'='commissioner_ruled') then 'community-import'
        when b.provenance->-1->>'scope'='solo' then 'solo'
        when (b.provenance->-1->>'migration')::boolean then 'migrated-league'
        when b.provenance->-1 ? 'leagueId' then 'group' else 'unknown' end;
      picks:='[]'; week_points:=0; week_scored:=0;
      for ps in select * from public.gtl_ballot_pick_scores(b.season,b.week,b.mode,b.ballot,b.audit) loop
        -- An ineligible ballot shows its guesses and lines but never scores (D-08/D-23).
        pts:=case when eligible then ps.points end;
        if pts is not null then week_points:=week_points+pts; week_scored:=week_scored+1; end if;
        picks:=picks||jsonb_build_array(jsonb_build_object('gameId',ps.game_id,'guess',ps.guess,'reference',ps.reference,'points',pts,'scorable',pts is not null));
      end loop;
      entries:=entries||jsonb_build_array(jsonb_build_object('userId',b.user_id,'mode',b.mode,'status',case when submitted then 'submitted' else 'draft' end,
        'submittedAt',b.ballot->'submittedAt','submittedAtKnown',not public.gtl_submission_time_unknown(b.ballot),
        -- Own-only: the last change, the post-submission edits and the origin, null for another member's ballot.
        'updatedAt',case when own then b.ballot->'updatedAt' end,
        'revisions',case when own then (select count(*) from jsonb_array_elements(b.audit) e where e->>'type'='ballot_edited') end,
        'provenance',case when own then scope end,'scoringPolicy',b.ballot->'scoringPolicy',
        'ruling',case when jsonb_typeof(b.ballot->'ruling')='object' then jsonb_build_object('decision',b.ballot#>'{ruling,decision}','basis',b.ballot#>'{ruling,basis}') end,
        'eligible',eligible,'eligibility',eligibility,
        'picksHidden',not revealed,'picks',case when revealed then picks end,
        'weekPoints',round(week_points,2),'weekScored',week_scored,'games',jsonb_array_length(games)));
    end loop;
    -- Sat-out weeks (one entry per member and market; any draft saved before the opt-out is excluded above).
    for o in select user_id,mode,created_at from public.gtl_weekly_optouts where season=z.season and week=z.week order by user_id,mode loop
      entries:=entries||jsonb_build_array(jsonb_build_object('userId',o.user_id,'mode',o.mode,'status','sat_out','satOutAt',o.created_at,
        'picksHidden',false,'picks',null,'weekPoints',0,'weekScored',0,'games',jsonb_array_length(games)));
    end loop;
    weeks:=weeks||jsonb_build_array(jsonb_build_object('season',z.season,'week',z.week,'deadline',deadline,'closed',now_at>=deadline,
      'games',games,'results',results,'revealed',jsonb_build_object('guess_spread',rev_spread,'guess_total',rev_total),'entries',entries));
  end loop;
  return jsonb_build_object('viewer',p_user,'season',s,'now',now_at,
    'seasons',coalesce((select jsonb_agg(q.season order by q.season desc) from (select distinct season from public.gtl_weekly_slates) q),'[]'),
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',p.user_id,'displayName',p.display_name,
        'removed',exists(select 1 from public.gtl_community_removals r where r.user_id=p.user_id)) order by p.display_name,p.user_id)
      from public.gtl_profiles p),'[]'),
    'weeks',weeks);
end $$;

-- create or replace keeps existing privileges; the two readers' grants are restated, and every new function is service-only.
revoke all on function public.gtl_slate_game(integer,integer,jsonb,text),public.gtl_ballot_eligible(uuid,integer,integer,text,boolean),
  public.gtl_submission_time_unknown(jsonb),public.gtl_guess_instant(jsonb,jsonb,text),
  public.gtl_line_at_guess(integer,integer,jsonb,jsonb,text,timestamptz),public.gtl_ballot_pick_scores(integer,integer,text,jsonb,jsonb),
  public.gtl_import_reference_lines(uuid,integer,integer,text,text,text,jsonb),public.gtl_void_reference_line_import(uuid,uuid,text,text),
  public.gtl_read_community(uuid,timestamptz,integer,timestamptz),public.gtl_read_community_history(uuid,integer,timestamptz)
  from public,anon,authenticated;
grant execute on function public.gtl_slate_game(integer,integer,jsonb,text),public.gtl_ballot_eligible(uuid,integer,integer,text,boolean),
  public.gtl_submission_time_unknown(jsonb),public.gtl_guess_instant(jsonb,jsonb,text),
  public.gtl_line_at_guess(integer,integer,jsonb,jsonb,text,timestamptz),public.gtl_ballot_pick_scores(integer,integer,text,jsonb,jsonb),
  public.gtl_import_reference_lines(uuid,integer,integer,text,text,text,jsonb),public.gtl_void_reference_line_import(uuid,uuid,text,text),
  public.gtl_read_community(uuid,timestamptz,integer,timestamptz),public.gtl_read_community_history(uuid,integer,timestamptz)
  to service_role;
