-- D-82 Player Props jobs: the audit trail for the offer job and the result-ingestion job (cloud/player-prop-jobs.mjs,
-- scripts/player-props-jobs.mjs). Builds on 20261110130000_gtl_player_props.sql (not applied either) and must follow it.
-- Spec: docs/superpowers/specs/2026-11-09-player-props-design.md; readiness: docs/PLAYER_PROPS_READINESS_2026_11_09.md.
-- Additive only: two new append-only tables and new gtl_props_* functions. No existing table, function, grant or row
-- changes, and nothing here touches Spread/Total, research quotes, the odds budget or gtl_prop_capability.
--
-- NOT APPLIED. Applying it needs its own reviewed apply instruction from Sean, a fresh hosted preflight and the
-- preservation/privacy/grant checks, after (or together with) 20261110130000. No schedule is created: the jobs run only
-- from the manual, variable-gated workflow (.github/workflows/player-props-jobs.yml) and default to a dry run.
--
--   gtl_prop_offer_reviews   every candidate the offer job evaluated from already retained research quotes, eligible or
--                            not, with the exact reasons. Only an eligible review points at a recorded offer and reference.
--   gtl_prop_result_checks   every result observation the ingestion job made from the verified nflverse release, including
--                            the ungraded ones (not final, participation unverified, ...), and the evidence a stat correction
--                            needs before it can grade again.
--
-- Neither table holds a guess, a draft, a member or a price. RLS is on and browsers get no grants: only the service jobs
-- read and write them, through these security-invoker functions.

-- The offer job's reasons; an eligible review has none. reference_* mirror cloud/player-prop-receipts.mjs's unavailable reasons.
create table if not exists public.gtl_prop_offer_reviews (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  season integer not null check (season between 2000 and 2200),
  week integer not null check (week between 1 and 22),
  -- The research game ID the quotes were retained under (`DAL-PHI`), and the quote's roster identity as retained.
  game_id text not null check (game_id ~ '^[A-Z]{2,3}-[A-Z]{2,3}$'),
  player_ref text not null check (player_ref ~ '^[A-Za-z0-9._:-]{1,40}$'),
  stat text not null check (stat in ('player_pass_yds','player_pass_completions','player_pass_attempts','player_pass_tds',
    'player_pass_interceptions','player_rush_yds','player_rush_attempts','player_rush_tds','player_reception_yds',
    'player_receptions','player_reception_tds')),
  event_id text check (event_id is null or event_id ~ '^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$'),
  eligible boolean not null,
  reasons text[] not null default '{}' check (cardinality(reasons)<=12 and reasons <@ array['kicked_off','event_unmapped',
    'kickoff_mismatch','player_id_invalid','roster_unverified','roster_team_mismatch','roster_inactive','position_unsupported',
    'offer_identity_changed','reference_refused','reference_invalid_offer','reference_kicked_off','reference_unit_mismatch',
    'reference_no_retained_quotes','reference_event_mismatch','reference_missing_book','reference_book_line_mismatch',
    'reference_stale_or_future_quote','reference_not_time_aligned','reference_books_disagree']::text[]),
  reference_id uuid references public.gtl_prop_references(id),
  -- Provenance: the research fetch request IDs the quotes came from and the verified source files ({name, sha256}).
  quote_requests uuid[] not null default '{}' check (cardinality(quote_requests)<=16),
  sources jsonb not null default '[]' check (jsonb_typeof(sources)='array' and jsonb_array_length(sources)<=6 and octet_length(sources::text)<=2000),
  reviewed_at timestamptz not null default clock_timestamp(),
  unique (run_id,game_id,player_ref,stat),
  check (split_part(game_id,'-',1)<>split_part(game_id,'-',2)),
  check (eligible=(cardinality(reasons)=0)),
  check (not eligible or (event_id is not null and player_ref ~ '^00-\d{7}$' and reference_id is not null)),
  check (eligible or reference_id is null)
);
create index if not exists gtl_prop_offer_reviews_week on public.gtl_prop_offer_reviews(season,week,reviewed_at desc);

-- One observation of one offer's final stat. `outcome` says what the job did with it:
--   recorded                a new gtl_prop_results version was written from this observation (result_version)
--   unchanged               the newest recorded version already says this
--   ungraded                no receipt could be written (reason): a missing row is never a zero
--   correction_pending      the observation disagrees with the recorded version: a correction_pending version was written
--   correction_unconfirmed  a correction is pending and this observation is not yet confirmed by a second verified release
create table if not exists public.gtl_prop_result_checks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  event_id text not null,
  player_id text not null,
  stat text not null,
  outcome text not null check (outcome in ('recorded','unchanged','ungraded','correction_pending','correction_unconfirmed')),
  observed_status text check (observed_status in ('final','dnp','cancelled','identity_unverified')),
  observed_actual integer,
  observed_participated boolean,
  reason text check (reason in ('not_started','not_final','event_missing','stats_not_covering_game','duplicate_stat_rows',
    'stat_missing','stat_invalid','participation_unverified')),
  result_version integer check (result_version>=1),
  source text not null check (char_length(source) between 1 and 200),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz not null,
  checked_at timestamptz not null default clock_timestamp(),
  unique (run_id,event_id,player_id,stat),
  foreign key (event_id,player_id,stat) references public.gtl_prop_offers(event_id,player_id,stat),
  check ((outcome='ungraded')=(observed_status is null)),
  check ((outcome='ungraded')=(reason is not null)),
  check (observed_status='final' or observed_actual is null),
  check (observed_status<>'final' or (observed_actual is not null and observed_participated is true)),
  check ((outcome in ('recorded','correction_pending'))=(result_version is not null))
);
create index if not exists gtl_prop_result_checks_selection on public.gtl_prop_result_checks(event_id,player_id,stat,checked_at desc);

alter table public.gtl_prop_offer_reviews enable row level security;
alter table public.gtl_prop_result_checks enable row level security;
revoke all on public.gtl_prop_offer_reviews,public.gtl_prop_result_checks from public,anon,authenticated,service_role;
-- Append-only (D-23): no update or delete grant, and the trigger refuses both anyway.
grant select,insert on public.gtl_prop_offer_reviews,public.gtl_prop_result_checks to service_role;
create or replace trigger gtl_prop_offer_reviews_append_only before update or delete on public.gtl_prop_offer_reviews
  for each row execute function public.gtl_props_append_only();
create or replace trigger gtl_prop_result_checks_append_only before update or delete on public.gtl_prop_result_checks
  for each row execute function public.gtl_props_append_only();

-- The jobs' schema probe. An unapplied migration answers PostgREST 404 (PGRST202), which the jobs treat as a no-op.
create or replace function public.gtl_props_jobs_capability() returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('jobs',true,'ready',public.gtl_props_ready())
$$;

-- One review per run and candidate; a retried run with the same run ID replays its first review and changes nothing.
create or replace function public.gtl_props_record_review(p_review jsonb) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare r public.gtl_prop_offer_reviews; o public.gtl_prop_offers; ref public.gtl_prop_references; reasons text[]; requests uuid[];
begin
  if jsonb_typeof(p_review)<>'object' or jsonb_typeof(p_review->'eligible')<>'boolean'
    or jsonb_typeof(coalesce(p_review->'reasons','[]'))<>'array' or jsonb_typeof(coalesce(p_review->'quoteRequests','[]'))<>'array'
    or jsonb_typeof(coalesce(p_review->'sources','[]'))<>'array' then raise exception 'GTL_PROPS_INVALID'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(p_review->'reasons','[]')) x where jsonb_typeof(x)<>'string')
    or exists(select 1 from jsonb_array_elements(coalesce(p_review->'quoteRequests','[]')) x where jsonb_typeof(x)<>'string'
      or x#>>'{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    or exists(select 1 from jsonb_array_elements(coalesce(p_review->'sources','[]')) x where jsonb_typeof(x)<>'object'
      or (select count(*) from jsonb_object_keys(x))<>2 or char_length(coalesce(x->>'name','')) not between 1 and 120
      or coalesce(x->>'sha256','') !~ '^[0-9a-f]{64}$') then raise exception 'GTL_PROPS_INVALID'; end if;
  select coalesce(array_agg(x order by x),'{}') into reasons from (select distinct x from jsonb_array_elements_text(coalesce(p_review->'reasons','[]')) x) d;
  select coalesce(array_agg(x::uuid order by x),'{}') into requests from (select distinct x from jsonb_array_elements_text(coalesce(p_review->'quoteRequests','[]')) x) d;
  select * into r from public.gtl_prop_offer_reviews where run_id=(p_review->>'runId')::uuid and game_id=p_review->>'gameId'
    and player_ref=p_review->>'playerRef' and stat=p_review->>'stat';
  if found then
    -- A retry may have recorded another (identical, append-only) reference receipt; the first review keeps its own.
    if r.eligible<>(p_review->>'eligible')::boolean or r.reasons<>reasons or r.event_id is distinct from p_review->>'eventId'
      then raise exception 'GTL_PROPS_RETRY_CONFLICT'; end if;
    return jsonb_build_object('id',r.id,'eligible',r.eligible,'referenceId',r.reference_id,'replayed',true);
  end if;
  if (p_review->>'eligible')::boolean then
    -- An eligible review names a recorded offer for this exact week and a reference recorded for that exact selection.
    select * into o from public.gtl_prop_offers where event_id=p_review->>'eventId' and player_id=p_review->>'playerRef' and stat=p_review->>'stat'
      and season=(p_review->>'season')::integer and week=(p_review->>'week')::integer and away||'-'||home=p_review->>'gameId';
    if not found then raise exception 'GTL_PROPS_INVALID'; end if;
    select * into ref from public.gtl_prop_references where id=(p_review->>'referenceId')::uuid and event_id=o.event_id and player_id=o.player_id and stat=o.stat;
    if not found then raise exception 'GTL_PROPS_INVALID'; end if;
  end if;
  insert into public.gtl_prop_offer_reviews(run_id,season,week,game_id,player_ref,stat,event_id,eligible,reasons,reference_id,quote_requests,sources)
  values((p_review->>'runId')::uuid,(p_review->>'season')::integer,(p_review->>'week')::integer,p_review->>'gameId',p_review->>'playerRef',
    p_review->>'stat',p_review->>'eventId',(p_review->>'eligible')::boolean,reasons,(p_review->>'referenceId')::uuid,requests,coalesce(p_review->'sources','[]'))
  returning * into r;
  return jsonb_build_object('id',r.id,'eligible',r.eligible,'referenceId',r.reference_id,'replayed',false);
end $$;

-- One check per run and offer; result_version must name a version that exists for this exact selection.
create or replace function public.gtl_props_record_check(p_check jsonb) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare c public.gtl_prop_result_checks; o public.gtl_prop_offers; v integer;
begin
  if jsonb_typeof(p_check)<>'object' then raise exception 'GTL_PROPS_INVALID'; end if;
  select * into o from public.gtl_prop_offers where event_id=p_check->>'eventId' and player_id=p_check->>'playerId' and stat=p_check->>'stat';
  if not found then raise exception 'GTL_PROPS_INVALID'; end if;
  if p_check ? 'observedActual' and jsonb_typeof(p_check->'observedActual') not in ('number','null')
    or p_check ? 'observedParticipated' and jsonb_typeof(p_check->'observedParticipated') not in ('boolean','null')
    or p_check ? 'resultVersion' and jsonb_typeof(p_check->'resultVersion') not in ('number','null') then raise exception 'GTL_PROPS_INVALID'; end if;
  select * into c from public.gtl_prop_result_checks where run_id=(p_check->>'runId')::uuid and event_id=o.event_id and player_id=o.player_id and stat=o.stat;
  if found then
    if c.outcome<>p_check->>'outcome' or c.result_version is distinct from (p_check->>'resultVersion')::integer then raise exception 'GTL_PROPS_RETRY_CONFLICT'; end if;
    return jsonb_build_object('id',c.id,'outcome',c.outcome,'replayed',true);
  end if;
  v:=(p_check->>'resultVersion')::integer;
  if v is not null and not exists(select 1 from public.gtl_prop_results r where r.event_id=o.event_id and r.player_id=o.player_id and r.stat=o.stat and r.version=v)
    then raise exception 'GTL_PROPS_INVALID'; end if;
  insert into public.gtl_prop_result_checks(run_id,event_id,player_id,stat,outcome,observed_status,observed_actual,observed_participated,reason,
    result_version,source,source_sha256,observed_at)
  values((p_check->>'runId')::uuid,o.event_id,o.player_id,o.stat,p_check->>'outcome',p_check->>'observedStatus',(p_check->>'observedActual')::integer,
    (p_check->>'observedParticipated')::boolean,p_check->>'reason',v,p_check->>'source',p_check->>'sourceSha256',(p_check->>'observedAt')::timestamptz)
  returning * into c;
  return jsonb_build_object('id',c.id,'outcome',c.outcome,'replayed',false);
end $$;

-- What the jobs need for one week: each recorded offer with its newest result version and newest check. Service-only; it
-- returns no guess, draft, member, line or price.
create or replace function public.gtl_props_jobs_state(p_season integer,p_week integer) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if p_season is null or p_week is null or p_season not between 2000 and 2200 or p_week not between 1 and 22 then raise exception 'GTL_PROPS_INVALID'; end if;
  if (select count(*) from public.gtl_prop_offers o where o.season=p_season and o.week=p_week)>5000 then raise exception 'GTL_PROPS_RANGE_TOO_LARGE'; end if;
  return jsonb_build_object('ready',public.gtl_props_ready(),'season',p_season,'week',p_week,
    'offers',coalesce((select jsonb_agg(jsonb_build_object('eventId',o.event_id,'playerId',o.player_id,'stat',o.stat,'team',o.team,
        'away',o.away,'home',o.home,'kickoff',o.kickoff,
        'result',(select jsonb_build_object('version',r.version,'status',r.status,'actual',r.actual,'participated',r.participated,
            'sourceSha256',r.source_sha256,'observedAt',r.observed_at)
          from public.gtl_prop_results r where r.event_id=o.event_id and r.player_id=o.player_id and r.stat=o.stat order by r.version desc limit 1),
        'lastCheck',(select jsonb_build_object('outcome',c.outcome,'observedStatus',c.observed_status,'observedActual',c.observed_actual,
            'observedParticipated',c.observed_participated,'sourceSha256',c.source_sha256,'checkedAt',c.checked_at)
          from public.gtl_prop_result_checks c where c.event_id=o.event_id and c.player_id=o.player_id and c.stat=o.stat
          order by c.checked_at desc,c.id desc limit 1))
      order by o.kickoff,o.event_id,o.player_id,o.stat)
      from public.gtl_prop_offers o where o.season=p_season and o.week=p_week),'[]'::jsonb));
end $$;

revoke all on function public.gtl_props_jobs_capability(),public.gtl_props_record_review(jsonb),public.gtl_props_record_check(jsonb),
  public.gtl_props_jobs_state(integer,integer) from public,anon,authenticated;
grant execute on function public.gtl_props_jobs_capability(),public.gtl_props_record_review(jsonb),public.gtl_props_record_check(jsonb),
  public.gtl_props_jobs_state(integer,integer) to service_role;

comment on table public.gtl_prop_offer_reviews is 'D-82 jobs: append-only review of every offer candidate from retained research quotes, eligible or not, with reasons.';
comment on table public.gtl_prop_result_checks is 'D-82 jobs: append-only result observations from the verified nflverse release, including ungraded ones and correction evidence.';
