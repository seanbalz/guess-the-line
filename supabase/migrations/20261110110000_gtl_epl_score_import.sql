-- EPL delivery stage 3 (docs/EPL_FEATURES_2026_11_09.md, confirmed behavior 4-5): the commissioner's reviewed weekly-score
-- import from Sleeper matchup screenshots. The screenshots are read in the commissioner's browser (local OCR); only the
-- SHA-256 of each image, the eight reviewed scores (and, for tied scores, the verified season totals) reach the database.
-- No image, OCR text or projection is stored.
--
-- What it adds (nothing existing is changed or replaced; no function body is replaced, so no rollback file is needed):
-- * gtl_epl_score_imports: one row per confirmed import of a matchweek (season, week, commissioner, the batch source hash,
--   the extracted week and whether the commissioner corrected it, the resulting next-week order). A correction is a new row
--   that names the import it supersedes; the chain has one root per matchweek and each import is superseded at most once.
--   source is always 'commissioner_screenshot_import': this is an explicit manual source, never a cumulative snapshot.
-- * gtl_epl_score_import_rows: the eight reviewed scores (exact two-decimal values), the season total where the review
--   supplied one, the OCR candidate and whether the commissioner edited it.
-- * gtl_epl_score_import_sources: every image hash seen for an import (repeat uploads and extra crops reconcile here).
-- * gtl_epl_score_import_openings: append-only record of every opening attempt and its outcome (opened, order_applied,
--   same_order, preserved_picks, preserved_closed, pending_results, season_end) with the previous and applied orders.
-- * gtl_epl_import_weekly_scores (the one writer) and gtl_epl_score_import_state (the review screen's read). Both check
--   p_by is the sean-troy-luke commissioner, like gtl_epl_link_manager. Service-role only; no browser role gets anything.
--
-- The writer, in one transaction under the matchweek's row lock (the same lock save_pick, save_queue, resolve and settle
-- take): refuses a missing attestation that Pick a Team bonuses are already included in the Sleeper totals, a draft that is
-- still open, a changed week without the explicit correction flag, any missing/duplicate/unknown manager or non-number score
-- (a missing score is never zero), tied scores without season totals, and an order different from the one the commissioner
-- reviewed. A repeat of the confirmed scores reconciles (new image hashes are recorded); different scores need an explicit
-- correction. Opening: when the week's draft is resolved but not settled, the bonus awards gtl-api computed from the stored
-- verified finals (shared/epl-draft.mjs settleBonus; points 0, November 2 ruling) settle it, exactly as gtl_epl_settle_week
-- does; without them (results not all verified) the import is kept and the opening waits (pending_results). The next week is
-- opened like gtl_epl_settle_week opens it, or, if it already exists, its order is replaced only while it is open, before its
-- first kickoff and without any pick; otherwise its picks and order are preserved. M-40's queue assignment runs afterwards.
-- The first picker's turn push is the existing opted-in nudge job (key season-week-owner-0) once the week has fixtures.
--
-- Apply after hosted M-30 (20261028190000) and M-40 (20261103212932, gtl_epl_advance_queues). Independent of M-33/M-34/M-35.
-- Rerunnable: tables/indexes if missing, functions create or replace with these argument lists, grants restated. Nothing is
-- dropped, deleted or truncated (D-23). Off switch: gtl-api answers the routes as unavailable while the functions are
-- absent; with the functions present, simply do not call them. No hosted action is performed by this file.

create table if not exists public.gtl_epl_score_imports (
  id uuid primary key default gen_random_uuid(),
  season integer not null,
  week integer not null,
  source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
  extracted_week integer check(extracted_week is null or extracted_week between 1 and 38),
  week_corrected boolean not null default false,
  pick_order text[] not null check(cardinality(pick_order) between 1 and 8),
  bonus_included boolean not null check(bonus_included),
  source text not null default 'commissioner_screenshot_import' check(source='commissioner_screenshot_import'),
  supersedes uuid references public.gtl_epl_score_imports(id),
  confirmed_by uuid not null references auth.users(id),
  confirmed_at timestamptz not null default clock_timestamp(),
  foreign key(season,week) references public.gtl_epl_weeks(season,week),
  check(week_corrected or extracted_week is null or extracted_week=week)
);
create unique index if not exists gtl_epl_score_imports_root_idx on public.gtl_epl_score_imports(season,week) where supersedes is null;
create unique index if not exists gtl_epl_score_imports_chain_idx on public.gtl_epl_score_imports(supersedes) where supersedes is not null;

create table if not exists public.gtl_epl_score_import_rows (
  import_id uuid not null references public.gtl_epl_score_imports(id),
  owner_id text not null references public.gtl_epl_managers(owner_id),
  score numeric not null check(score between -1000 and 10000 and round(score,2)=score),
  season_total numeric check(season_total is null or (season_total between -10000 and 100000 and round(season_total,2)=season_total)),
  extracted_score numeric check(extracted_score is null or (extracted_score between -1000 and 10000 and round(extracted_score,2)=extracted_score)),
  edited boolean not null,
  primary key(import_id,owner_id)
);

create table if not exists public.gtl_epl_score_import_sources (
  import_id uuid not null references public.gtl_epl_score_imports(id),
  image_sha256 text not null check(image_sha256 ~ '^[0-9a-f]{64}$'),
  source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key(import_id,image_sha256)
);

create table if not exists public.gtl_epl_score_import_openings (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.gtl_epl_score_imports(id),
  season integer not null,
  week integer not null,
  outcome text not null check(outcome in ('opened','order_applied','same_order','preserved_picks','preserved_closed','pending_results','season_end')),
  previous_order text[],
  applied_order text[],
  awarded integer not null default 0,
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default clock_timestamp()
);
create index if not exists gtl_epl_score_import_openings_import_idx on public.gtl_epl_score_import_openings(import_id,id);

alter table public.gtl_epl_score_imports enable row level security;
alter table public.gtl_epl_score_import_rows enable row level security;
alter table public.gtl_epl_score_import_sources enable row level security;
alter table public.gtl_epl_score_import_openings enable row level security;
revoke all on public.gtl_epl_score_imports,public.gtl_epl_score_import_rows,public.gtl_epl_score_import_sources,
  public.gtl_epl_score_import_openings from public,anon,authenticated,service_role;
-- Append-only for the API role: no update and no delete (D-23).
grant select,insert on public.gtl_epl_score_imports,public.gtl_epl_score_import_rows,public.gtl_epl_score_import_sources,
  public.gtl_epl_score_import_openings to service_role;

-- The confirmed import a matchweek currently stands on: the end of its correction chain, or null.
create or replace function public.gtl_epl_score_import_head(p_season integer,p_week integer) returns uuid
language sql stable security invoker set search_path='' as $$
  select i.id from public.gtl_epl_score_imports i where i.season=p_season and i.week=p_week
    and not exists(select 1 from public.gtl_epl_score_imports n where n.supersedes=i.id)
  order by i.confirmed_at desc,i.id limit 1;
$$;

-- p_sources: the SHA-256 (hex) of each screenshot in the batch. p_scores: [{ owner_id, score, season_total?, extracted_score? }]
-- for every manager in the matchweek's order. p_expected_order: the order the commissioner reviewed. p_awards: null while the
-- week's verified results are incomplete, otherwise [{ owner_id, margin, club }] computed by gtl-api from stored finals.
create or replace function public.gtl_epl_import_weekly_scores(p_by uuid,p_season integer,p_week integer,p_extracted_week integer,
  p_week_corrected boolean,p_sources text[],p_scores jsonb,p_expected_order text[],p_bonus_included boolean,p_correction boolean,p_awards jsonb)
returns jsonb
language plpgsql security invoker set search_path='' as $$
declare w public.gtl_epl_weeks; nxt public.gtl_epl_weeks; r record; v jsonb; stamp timestamptz;
  owners text[]:='{}'; scores numeric[]:='{}'; totals numeric[]:='{}'; extracted numeric[]:='{}';
  v_source text; v_images text[]; v_order text[]; head uuid; head_row public.gtl_epl_score_imports; effective uuid;
  reconciliation text; same boolean; added integer; awarded integer:=0; outcome text; previous text[]; applied text[];
  i integer; n integer; fixtures integer:=0; v_kickoff timestamptz;
begin
  if p_by is null or not exists(select 1 from public.gtl_memberships where user_id=p_by and league_id='sean-troy-luke' and role='commissioner' and active) then
    raise exception 'GTL_EPL_FORBIDDEN' using errcode='P0001'; end if;
  if p_bonus_included is distinct from true then raise exception 'GTL_EPL_IMPORT_ATTESTATION' using errcode='P0001'; end if;
  if p_season is null or p_week is null or p_week not between 1 and 38 or (p_extracted_week is not null and p_extracted_week not between 1 and 38) then
    raise exception 'GTL_EPL_IMPORT_INVALID' using errcode='P0001'; end if;
  if p_extracted_week is not null and p_extracted_week<>p_week and p_week_corrected is distinct from true then
    raise exception 'GTL_EPL_IMPORT_WEEK_MISMATCH' using errcode='P0001'; end if;
  if p_sources is null or cardinality(p_sources) not between 1 and 12 or exists(select 1 from unnest(p_sources) s where s is null or s !~ '^[0-9a-f]{64}$') then
    raise exception 'GTL_EPL_IMPORT_INVALID' using errcode='P0001'; end if;
  select array_agg(distinct s order by s) into v_images from unnest(p_sources) s;
  v_source:=encode(sha256(convert_to(array_to_string(v_images,','),'UTF8')),'hex');
  if p_scores is null or jsonb_typeof(p_scores)<>'array' or jsonb_array_length(p_scores)>8 then raise exception 'GTL_EPL_IMPORT_INVALID' using errcode='P0001'; end if;

  select * into w from public.gtl_epl_weeks where season=p_season and week=p_week for update;
  if not found then raise exception 'GTL_EPL_NO_WEEK' using errcode='P0001'; end if;
  if w.status='open' then raise exception 'GTL_EPL_IMPORT_WEEK_OPEN' using errcode='P0001'; end if;

  for r in select value as item from jsonb_array_elements(p_scores) loop
    v:=r.item;
    if jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(v->'owner_id') is distinct from 'string' then raise exception 'GTL_EPL_IMPORT_INVALID' using errcode='P0001'; end if;
    if exists(select 1 from jsonb_object_keys(v) k where k not in ('owner_id','score','season_total','extracted_score')) then raise exception 'GTL_EPL_IMPORT_INVALID' using errcode='P0001'; end if;
    -- A missing score is incomplete, never zero.
    if jsonb_typeof(v->'score') is distinct from 'number' then raise exception 'GTL_EPL_IMPORT_INCOMPLETE' using errcode='P0001'; end if;
    if coalesce(jsonb_typeof(v->'season_total'),'null') not in ('number','null') or coalesce(jsonb_typeof(v->'extracted_score'),'null') not in ('number','null') then
      raise exception 'GTL_EPL_IMPORT_INVALID' using errcode='P0001'; end if;
    if (v->>'owner_id')=any(owners) or not ((v->>'owner_id')=any(w.pick_order)) then raise exception 'GTL_EPL_IMPORT_INVALID' using errcode='P0001'; end if;
    if (v->>'score')::numeric not between -1000 and 10000 or round((v->>'score')::numeric,2)<>(v->>'score')::numeric
      or (v->>'season_total' is not null and ((v->>'season_total')::numeric not between -10000 and 100000 or round((v->>'season_total')::numeric,2)<>(v->>'season_total')::numeric))
      or (v->>'extracted_score' is not null and ((v->>'extracted_score')::numeric not between -1000 and 10000 or round((v->>'extracted_score')::numeric,2)<>(v->>'extracted_score')::numeric)) then
      raise exception 'GTL_EPL_IMPORT_INVALID' using errcode='P0001'; end if;
    owners:=owners||(v->>'owner_id'); scores:=scores||(v->>'score')::numeric;
    totals:=totals||(v->>'season_total')::numeric; extracted:=extracted||(v->>'extracted_score')::numeric;
  end loop;
  -- All eight (every manager in the matchweek's order) or nothing.
  if cardinality(owners)<>cardinality(w.pick_order) then raise exception 'GTL_EPL_IMPORT_INCOMPLETE' using errcode='P0001'; end if;
  -- Tied weekly scores need the tied managers' verified season totals; never a rank, record or projection.
  n:=cardinality(owners);
  for i in 1..n loop
    if totals[i] is null and exists(select 1 from generate_subscripts(scores,1) j where j<>i and scores[j]=scores[i]) then
      raise exception 'GTL_EPL_IMPORT_TIE_TOTALS' using errcode='P0001'; end if;
  end loop;
  -- Ascending weekly score; ties by the lower season total; then owner id (the existing pickOrder and M-35 rule). Sean adds
  -- bonuses in Sleeper (November 2 ruling): the reviewed totals already include them and nothing is added here.
  select array_agg(owners[ix] order by scores[ix],totals[ix] nulls last,owners[ix] collate "C") into v_order from generate_subscripts(owners,1) ix;
  if p_expected_order is distinct from v_order then raise exception 'GTL_EPL_IMPORT_ORDER_CHANGED' using errcode='P0001'; end if;

  -- Reconcile with the confirmed import of this matchweek, if any (serialised by the week row lock above).
  head:=public.gtl_epl_score_import_head(p_season,p_week);
  if head is not null then
    select * into head_row from public.gtl_epl_score_imports where id=head;
    select bool_and(x.score=owners_scores.score and x.season_total is not distinct from owners_scores.total) and count(*)=n into same
      from public.gtl_epl_score_import_rows x
      join (select owners[ix] as owner_id,scores[ix] as score,totals[ix] as total from generate_subscripts(owners,1) ix) owners_scores on owners_scores.owner_id=x.owner_id
      where x.import_id=head;
    same:=coalesce(same,false) and (select count(*) from public.gtl_epl_score_import_rows where import_id=head)=n;
  end if;
  if head is not null and same then
    effective:=head;
    insert into public.gtl_epl_score_import_sources(import_id,image_sha256,source_sha256,recorded_by)
      select head,s,v_source,p_by from unnest(v_images) s on conflict do nothing;
    get diagnostics added=row_count;
    reconciliation:=case when added>0 then 'reconciled' else 'duplicate' end;
  else
    -- Different candidate scores never silently replace a confirmed import: they need the commissioner's explicit correction.
    if head is not null and p_correction is distinct from true then raise exception 'GTL_EPL_IMPORT_CONFLICT' using errcode='P0001'; end if;
    insert into public.gtl_epl_score_imports(season,week,source_sha256,extracted_week,week_corrected,pick_order,bonus_included,supersedes,confirmed_by)
      values(p_season,p_week,v_source,p_extracted_week,coalesce(p_week_corrected,false) and p_extracted_week is distinct from p_week,v_order,true,head,p_by)
      returning id into effective;
    insert into public.gtl_epl_score_import_rows(import_id,owner_id,score,season_total,extracted_score,edited)
      select effective,owners[ix],scores[ix],totals[ix],extracted[ix],extracted[ix] is distinct from scores[ix] from generate_subscripts(owners,1) ix;
    insert into public.gtl_epl_score_import_sources(import_id,image_sha256,source_sha256,recorded_by)
      select effective,s,v_source,p_by from unnest(v_images) s;
    reconciliation:=case when head is null then 'new' else 'correction' end;
  end if;
  select pick_order into v_order from public.gtl_epl_score_imports where id=effective;

  -- Settle the drafted matchweek from the verified finals gtl-api read (gtl_epl_settle_week's award rows), or wait.
  if w.status in ('resolved','needs_review') then
    if p_awards is null or jsonb_typeof(p_awards)='null' then
      insert into public.gtl_epl_score_import_openings(import_id,season,week,outcome,recorded_by) values(effective,p_season,p_week+1,'pending_results',p_by);
      return jsonb_build_object('importId',effective,'season',p_season,'week',p_week,'reconciliation',reconciliation,'order',to_jsonb(v_order),
        'opening',jsonb_build_object('outcome','pending_results','week',p_week+1));
    end if;
    if jsonb_typeof(p_awards)<>'array' then raise exception 'GTL_EPL_IMPORT_INVALID' using errcode='P0001'; end if;
    if exists(select 1 from jsonb_array_elements(p_awards) a where jsonb_typeof(a) is distinct from 'object'
        or jsonb_typeof(a->'owner_id') is distinct from 'string' or jsonb_typeof(a->'margin') is distinct from 'number'
        or (a->>'margin')::numeric<>trunc((a->>'margin')::numeric) or (a->>'margin')::numeric not between 0 and 99
        or not exists(select 1 from public.gtl_epl_picks k where k.season=p_season and k.week=p_week and k.owner_id=a->>'owner_id' and k.club is not null and k.club=a->>'club'))
      or (select count(distinct a->>'owner_id') from jsonb_array_elements(p_awards) a)<>jsonb_array_length(p_awards) then
      raise exception 'GTL_EPL_IMPORT_INVALID' using errcode='P0001'; end if;
    insert into public.gtl_epl_bonus(season,week,owner_id,points,margin,club)
      select p_season,p_week,a->>'owner_id',0,(a->>'margin')::integer,a->>'club' from jsonb_array_elements(p_awards) a
      on conflict(season,week,owner_id) do nothing;
    get diagnostics awarded=row_count;
    update public.gtl_epl_weeks set status='settled' where season=p_season and week=p_week;
  end if;

  if p_week>=38 then
    outcome:='season_end';
  else
    select * into nxt from public.gtl_epl_weeks where season=p_season and week=p_week+1 for update;
    stamp:=clock_timestamp(); -- after both locks: a lock wait never backdates the kickoff check
    if not found then
      insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order,status)
        values(p_season,p_week+1,w.window_end,w.window_end+interval '7 days',w.window_end+interval '7 days',v_order,'open');
      outcome:='opened'; applied:=v_order;
    else
      previous:=nxt.pick_order;
      if exists(select 1 from public.gtl_epl_picks k where k.season=p_season and k.week=p_week+1) then outcome:='preserved_picks';
      elsif nxt.status<>'open' or stamp>=nxt.first_kickoff then outcome:='preserved_closed';
      elsif nxt.pick_order=v_order then outcome:='same_order';
      else
        update public.gtl_epl_weeks set pick_order=v_order where season=p_season and week=p_week+1;
        outcome:='order_applied'; applied:=v_order;
      end if;
    end if;
    -- M-40: a first picker who already holds a ranked backup list is assigned now (nothing without fixtures).
    if outcome in ('opened','order_applied') then perform public.gtl_epl_advance_queues(p_season,p_week+1,stamp); end if;
    select count(*) into fixtures from public.gtl_epl_fixtures f where f.season=p_season and f.week=p_week+1;
    select first_kickoff into v_kickoff from public.gtl_epl_weeks where season=p_season and week=p_week+1;
  end if;
  insert into public.gtl_epl_score_import_openings(import_id,season,week,outcome,previous_order,applied_order,awarded,recorded_by)
    values(effective,p_season,p_week+1,outcome,previous,applied,awarded,p_by);
  return jsonb_build_object('importId',effective,'season',p_season,'week',p_week,'reconciliation',reconciliation,'order',to_jsonb(v_order),'awarded',awarded,
    'opening',jsonb_build_object('outcome',outcome,'week',p_week+1,
      'order',case when outcome='season_end' then null else (select to_jsonb(pick_order) from public.gtl_epl_weeks where season=p_season and week=p_week+1) end,
      'fixtures',fixtures,
      -- No kickoff is reported until the week's fixtures are read (the stored placeholder is not a real kickoff).
      'firstKickoff',case when fixtures>0 then v_kickoff end));
end $$;

-- The review screen: the known manager mapping (immutable owner id, first name, Sleeper username), the season's matchweeks,
-- and for p_week its confirmed import, the next week's state and any saved after-mw<week> Sleeper season totals.
create or replace function public.gtl_epl_score_import_state(p_by uuid,p_season integer,p_week integer) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare v_season integer:=p_season; head uuid; snap jsonb; result jsonb;
begin
  if p_by is null or not exists(select 1 from public.gtl_memberships where user_id=p_by and league_id='sean-troy-luke' and role='commissioner' and active) then
    raise exception 'GTL_EPL_FORBIDDEN' using errcode='P0001'; end if;
  if v_season is null then select max(season) into v_season from public.gtl_epl_weeks; end if;
  result:=jsonb_build_object('season',v_season,
    'managers',coalesce((select jsonb_agg(jsonb_build_object('ownerId',m.owner_id,'name',m.name,'sleeperName',m.sleeper_name) order by m.owner_id) from public.gtl_epl_managers m),'[]'::jsonb),
    'weeks',coalesce((select jsonb_agg(jsonb_build_object('week',x.week,'status',x.status,'pickOrder',to_jsonb(x.pick_order)) order by x.week)
      from public.gtl_epl_weeks x where x.season=v_season),'[]'::jsonb));
  if p_week is null or v_season is null then return result; end if;
  head:=public.gtl_epl_score_import_head(v_season,p_week);
  select s.payload into snap from public.gtl_epl_snapshots s where s.label in ('after-mw'||p_week,'after-mw'||lpad(p_week::text,2,'0'))
    and s.payload->'state'->>'season'=v_season::text order by s.captured_at desc,s.id desc limit 1;
  return result||jsonb_build_object('week',p_week,
    'import',case when head is null then null else (select jsonb_build_object('id',i.id,'confirmedAt',i.confirmed_at,'sourceSha256',i.source_sha256,
        'extractedWeek',i.extracted_week,'weekCorrected',i.week_corrected,'order',to_jsonb(i.pick_order),'supersedes',i.supersedes,
        'corrections',(select count(*) from public.gtl_epl_score_imports c where c.season=i.season and c.week=i.week)-1,
        'images',(select jsonb_agg(src.image_sha256 order by src.recorded_at,src.image_sha256) from public.gtl_epl_score_import_sources src where src.import_id=i.id),
        'rows',(select jsonb_agg(jsonb_build_object('ownerId',x.owner_id,'score',x.score,'seasonTotal',x.season_total,'edited',x.edited)
          order by array_position(i.pick_order,x.owner_id)) from public.gtl_epl_score_import_rows x where x.import_id=i.id),
        'opening',(select jsonb_build_object('outcome',o.outcome,'week',o.week,'recordedAt',o.recorded_at) from public.gtl_epl_score_import_openings o
          where o.import_id=i.id order by o.id desc limit 1))
      from public.gtl_epl_score_imports i where i.id=head) end,
    'next',(select jsonb_build_object('week',x.week,'status',x.status,'pickOrder',to_jsonb(x.pick_order),
        'picks',(select count(*) from public.gtl_epl_picks k where k.season=x.season and k.week=x.week),
        'fixtures',(select count(*) from public.gtl_epl_fixtures f where f.season=x.season and f.week=x.week))
      from public.gtl_epl_weeks x where x.season=v_season and x.week=p_week+1),
    -- Verified Sleeper season totals after this matchweek, only from a saved after-mw<week> snapshot of this season.
    'snapshotTotals',case when snap is null or jsonb_typeof(snap->'rosters') is distinct from 'array' then null else
      (select jsonb_object_agg(ro->>'owner_id',round(((ro->'settings'->>'fpts')::numeric+coalesce((ro->'settings'->>'fpts_decimal')::numeric,0)/100),2))
        from jsonb_array_elements(snap->'rosters') ro where jsonb_typeof(ro->'settings'->'fpts')='number' and ro->>'owner_id' ~ '^[0-9]{1,30}$'
          and coalesce(jsonb_typeof(ro->'settings'->'fpts_decimal'),'null') in ('number','null')) end);
end $$;

revoke all on function public.gtl_epl_score_import_head(integer,integer),
  public.gtl_epl_import_weekly_scores(uuid,integer,integer,integer,boolean,text[],jsonb,text[],boolean,boolean,jsonb),
  public.gtl_epl_score_import_state(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.gtl_epl_score_import_head(integer,integer),
  public.gtl_epl_import_weekly_scores(uuid,integer,integer,integer,boolean,text[],jsonb,text[],boolean,boolean,jsonb),
  public.gtl_epl_score_import_state(uuid,integer,integer) to service_role;
