-- D-82 Player Props: guarded storage for the native-unit prop guessing mode.
-- Spec: docs/superpowers/specs/2026-11-09-player-props-design.md; readiness: docs/PLAYER_PROPS_READINESS_2026_11_09.md.
-- Additive only: seven new tables and new gtl_props_* functions. No existing table, function, grant or row changes.
-- Spread/Total scoring, references, pending-reference behavior, standings and the D-81 game-line calibration are
-- untouched, and nothing here joins their boards.
--
-- NOT APPLIED. Applying it needs its own reviewed apply instruction from Sean, a fresh hosted preflight and the
-- preservation/privacy/grant checks. Even once applied the mode stays OFF: gtl_prop_capability.live_lock_in starts
-- false and no function here turns it on. Every writer refuses with GTL_PROPS_OFF until a separately reviewed SQL
-- change sets it, after the hosted-data readiness audit (liveLockInReady) passes. gtl-api and the app have their own
-- flags as well (cloud/player-props.mjs, web/src/next/props/flag.js).
--
-- RLS is on for every table and browsers get no grants: gtl-api calls these service-only, security-invoker functions.
-- No function returns another user's guess, draft or lock (Guess-value privacy). A locked guess's saved reference and
-- the latest recorded line are returned to their owner only. Stat units and ranges follow shared/player-props.mjs.

create table if not exists public.gtl_prop_capability (
  id boolean primary key default true check (id),
  live_lock_in boolean not null default false,
  changed_at timestamptz not null default clock_timestamp(),
  note text check (note is null or char_length(note)<=300)
);
insert into public.gtl_prop_capability(id,live_lock_in,note) values(true,false,'Dark by default: readiness audit incomplete.')
  on conflict (id) do nothing;

-- A verified scheduled event, stable player ID and canonical full-game stat: the selection identity. Only a service job
-- that has verified the roster/event mapping and line availability records an offer; names alone never create one.
create table if not exists public.gtl_prop_offers (
  season integer not null check (season between 2000 and 2200),
  week integer not null check (week between 1 and 22),
  event_id text not null check (event_id ~ '^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$'),
  player_id text not null check (player_id ~ '^00-\d{7}$'),
  stat text not null check (stat in ('player_pass_yds','player_pass_completions','player_pass_attempts','player_pass_tds',
    'player_pass_interceptions','player_rush_yds','player_rush_attempts','player_rush_tds','player_reception_yds',
    'player_receptions','player_reception_tds')),
  player_name text not null check (char_length(player_name) between 1 and 80),
  team text not null check (team ~ '^[A-Z]{2,3}$'),
  position text not null check (position in ('QB','RB','WR','TE')),
  away text not null check (away ~ '^[A-Z]{2,3}$'),
  home text not null check (home ~ '^[A-Z]{2,3}$'),
  kickoff timestamptz not null,
  -- Where the identity came from (roster and schedule source names), for the receipt; never a quote.
  source text not null check (char_length(source) between 1 and 120),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (event_id,player_id,stat),
  check (split_part(event_id,'_',1)::integer=season and split_part(event_id,'_',2)::integer=week),
  check (team in (away,home) and away<>home)
);
create index if not exists gtl_prop_offers_week on public.gtl_prop_offers(season,week,kickoff);

-- Immutable three-book median receipts in the stat's own unit. Append-only: a later quote is a new row.
create table if not exists public.gtl_prop_references (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  player_id text not null,
  stat text not null,
  line numeric not null check (line*2=trunc(line*2)),
  books jsonb not null check (jsonb_typeof(books)='array' and jsonb_array_length(books) between 3 and 3),
  observed_from timestamptz not null,
  observed_to timestamptz not null,
  provider text not null check (provider='the-odds-api'),
  recorded_at timestamptz not null default clock_timestamp(),
  check (observed_from<=observed_to and observed_to<=recorded_at),
  foreign key (event_id,player_id,stat) references public.gtl_prop_offers(event_id,player_id,stat)
);
create index if not exists gtl_prop_references_selection on public.gtl_prop_references(event_id,player_id,stat,observed_to desc);

-- One guess per user and exact selection, reused across every group: a group cannot create a second guess.
create table if not exists public.gtl_prop_guesses (
  user_id uuid not null references auth.users(id) on delete cascade,
  season integer not null,
  week integer not null,
  event_id text not null,
  player_id text not null,
  stat text not null,
  guess numeric not null check (guess*2=trunc(guess*2)),
  status text not null check (status in ('draft','locked')),
  reference_id uuid references public.gtl_prop_references(id),
  reference_line numeric,
  reference_observed_at timestamptz,
  saved_at timestamptz not null default clock_timestamp(),
  locked_at timestamptz,
  primary key (user_id,event_id,player_id,stat),
  foreign key (event_id,player_id,stat) references public.gtl_prop_offers(event_id,player_id,stat),
  check ((status='locked')=(locked_at is not null)),
  check ((status='locked')=(reference_id is not null and reference_line is not null and reference_observed_at is not null))
);
create index if not exists gtl_prop_guesses_week on public.gtl_prop_guesses(user_id,season,week);

-- Append-only audit of every draft save and lock-in (D-23). A request ID replays its own receipt and nothing else.
create table if not exists public.gtl_prop_guess_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  action text not null check (action in ('draft','lock')),
  event_id text not null,
  player_id text not null,
  stat text not null,
  guess numeric not null,
  reference_id uuid references public.gtl_prop_references(id),
  created_at timestamptz not null default clock_timestamp(),
  unique (user_id,request_id)
);

-- Actual-result receipts: append-only versions. A correction is a new version; nothing earlier is rewritten.
create table if not exists public.gtl_prop_results (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  player_id text not null,
  stat text not null,
  version integer not null check (version>=1),
  status text not null check (status in ('final','dnp','cancelled','correction_pending','identity_unverified')),
  actual integer,
  participated boolean,
  source text not null check (char_length(source) between 1 and 200),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  unique (event_id,player_id,stat,version),
  -- A final stat needs established participation; a zero is never inferred from a missing row.
  check (status<>'final' or (actual is not null and participated is true)),
  check (status='final' or actual is null),
  foreign key (event_id,player_id,stat) references public.gtl_prop_offers(event_id,player_id,stat)
);

alter table public.gtl_prop_capability enable row level security;
alter table public.gtl_prop_offers enable row level security;
alter table public.gtl_prop_references enable row level security;
alter table public.gtl_prop_guesses enable row level security;
alter table public.gtl_prop_guess_events enable row level security;
alter table public.gtl_prop_results enable row level security;
revoke all on public.gtl_prop_capability,public.gtl_prop_offers,public.gtl_prop_references,public.gtl_prop_guesses,
  public.gtl_prop_guess_events,public.gtl_prop_results from public,anon,authenticated,service_role;
-- No delete grant anywhere (D-23). The capability row is read-only to gtl-api; turning it on is a reviewed SQL change.
grant select on public.gtl_prop_capability to service_role;
grant select,insert,update on public.gtl_prop_offers,public.gtl_prop_guesses to service_role;
grant select,insert on public.gtl_prop_references,public.gtl_prop_guess_events,public.gtl_prop_results to service_role;

-- ---------- guards ----------
create or replace function public.gtl_props_append_only() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'GTL_PROPS_APPEND_ONLY'; end $$;
create or replace trigger gtl_prop_references_append_only before update or delete on public.gtl_prop_references
  for each row execute function public.gtl_props_append_only();
create or replace trigger gtl_prop_guess_events_append_only before update or delete on public.gtl_prop_guess_events
  for each row execute function public.gtl_props_append_only();
create or replace trigger gtl_prop_results_append_only before update or delete on public.gtl_prop_results
  for each row execute function public.gtl_props_append_only();

-- An offer's identity is fixed; only a verified schedule change may move its kickoff.
create or replace function public.gtl_props_offer_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'GTL_PROPS_APPEND_ONLY'; end if;
  if (new.season,new.week,new.event_id,new.player_id,new.stat,new.team,new.away,new.home)
    is distinct from (old.season,old.week,old.event_id,old.player_id,old.stat,old.team,old.away,old.home)
    then raise exception 'GTL_PROPS_INVALID'; end if;
  return new;
end $$;
create or replace trigger gtl_props_offer_guard before update or delete on public.gtl_prop_offers
  for each row execute function public.gtl_props_offer_guard();

-- Lock-in is final: a locked row never changes, no row is deleted, and nothing is written at or after kickoff.
create or replace function public.gtl_props_guess_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare kick timestamptz;
begin
  if tg_op='DELETE' then raise exception 'GTL_PROPS_APPEND_ONLY'; end if;
  if tg_op='UPDATE' then
    if old.status='locked' then raise exception 'GTL_PROPS_LOCKED'; end if;
    if (new.user_id,new.event_id,new.player_id,new.stat,new.season,new.week)
      is distinct from (old.user_id,old.event_id,old.player_id,old.stat,old.season,old.week) then raise exception 'GTL_PROPS_INVALID'; end if;
  end if;
  select o.kickoff into kick from public.gtl_prop_offers o where o.event_id=new.event_id and o.player_id=new.player_id and o.stat=new.stat
    and o.season=new.season and o.week=new.week;
  if kick is null then raise exception 'GTL_PROPS_INVALID'; end if;
  if clock_timestamp()>=kick then raise exception 'GTL_PROPS_CLOSED'; end if;
  return new;
end $$;
create or replace trigger gtl_props_guess_guard before insert or update or delete on public.gtl_prop_guesses
  for each row execute function public.gtl_props_guess_guard();

-- ---------- helpers ----------
create or replace function public.gtl_props_ready() returns boolean
language sql stable security invoker set search_path='' as $$
  select coalesce((select c.live_lock_in from public.gtl_prop_capability c where c.id),false)
$$;

-- shared/player-props.mjs validPropGuess: half-point steps; yards signed, counts nonnegative.
create or replace function public.gtl_props_valid_value(p_stat text,p_value numeric) returns boolean
language sql immutable security invoker set search_path='' as $$
  select p_value is not null and p_value*2=trunc(p_value*2) and coalesce(case p_stat
    when 'player_pass_yds' then p_value between -100 and 700
    when 'player_rush_yds' then p_value between -100 and 400
    when 'player_reception_yds' then p_value between -100 and 400
    when 'player_pass_completions' then p_value between 0 and 70
    when 'player_pass_attempts' then p_value between 0 and 90
    when 'player_rush_attempts' then p_value between 0 and 60
    when 'player_receptions' then p_value between 0 and 30
    when 'player_pass_tds' then p_value between 0 and 10
    when 'player_pass_interceptions' then p_value between 0 and 10
    when 'player_rush_tds' then p_value between 0 and 10
    when 'player_reception_tds' then p_value between 0 and 10
  end,false)
$$;

create or replace function public.gtl_props_reference_json(r public.gtl_prop_references) returns jsonb
language sql stable security invoker set search_path='' as $$
  select case when r.id is null then null else jsonb_build_object('id',r.id,'line',r.line,'books',r.books,
    'observedFrom',r.observed_from,'observedTo',r.observed_to,'recordedAt',r.recorded_at,'provider',r.provider) end
$$;

create or replace function public.gtl_props_guess_json(g public.gtl_prop_guesses) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('season',g.season,'week',g.week,'eventId',g.event_id,'playerId',g.player_id,'stat',g.stat,
    'guess',g.guess,'status',g.status,'savedAt',g.saved_at,'lockedAt',g.locked_at,
    'reference',case when g.status='locked' then (select public.gtl_props_reference_json(r) from public.gtl_prop_references r where r.id=g.reference_id) end)
$$;

-- ---------- service writers: identities, references and results (no provider call happens in SQL) ----------
create or replace function public.gtl_props_record_offer(p_offer jsonb) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare o public.gtl_prop_offers;
begin
  if jsonb_typeof(p_offer)<>'object' then raise exception 'GTL_PROPS_INVALID'; end if;
  insert into public.gtl_prop_offers(season,week,event_id,player_id,stat,player_name,team,position,away,home,kickoff,source)
  values((p_offer->>'season')::integer,(p_offer->>'week')::integer,p_offer->>'eventId',p_offer->>'playerId',p_offer->>'stat',
    p_offer->>'playerName',p_offer->>'team',p_offer->>'position',p_offer->>'away',p_offer->>'home',(p_offer->>'kickoff')::timestamptz,p_offer->>'source')
  on conflict (event_id,player_id,stat) do update set kickoff=excluded.kickoff,player_name=excluded.player_name,position=excluded.position
  returning * into o;
  return jsonb_build_object('eventId',o.event_id,'playerId',o.player_id,'stat',o.stat,'kickoff',o.kickoff);
end $$;

-- A qualifying reference: exactly the three permitted books, each with one half-point line in the stat's unit, observed
-- before kickoff and not after now, within the last six hours and within 30 minutes of each other, every book within
-- the existing +/-5 policy of the median, and the median equal to p_line. Anything else is refused, never repaired.
create or replace function public.gtl_props_record_reference(p_event_id text,p_player_id text,p_stat text,p_line numeric,p_books jsonb)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare o public.gtl_prop_offers; r public.gtl_prop_references; now_at timestamptz:=clock_timestamp();
  lines numeric[]; first_at timestamptz; last_at timestamptz; med numeric;
begin
  select * into o from public.gtl_prop_offers where event_id=p_event_id and player_id=p_player_id and stat=p_stat;
  if not found then raise exception 'GTL_PROPS_INVALID'; end if;
  if now_at>=o.kickoff then raise exception 'GTL_PROPS_CLOSED'; end if;
  if jsonb_typeof(p_books)<>'array' or jsonb_array_length(p_books)<>3
    or (select count(distinct b->>'book') from jsonb_array_elements(p_books) b where b->>'book' in ('draftkings','fanduel','betmgm'))<>3
    or exists(select 1 from jsonb_array_elements(p_books) b where jsonb_typeof(b->'line')<>'number'
      or not public.gtl_props_valid_value(p_stat,(b->>'line')::numeric) or coalesce(b->>'observedAt','')='')
    then raise exception 'GTL_PROPS_REFERENCE_UNAVAILABLE'; end if;
  select array_agg((b->>'line')::numeric order by (b->>'line')::numeric),min((b->>'observedAt')::timestamptz),max((b->>'observedAt')::timestamptz)
    into lines,first_at,last_at from jsonb_array_elements(p_books) b;
  med:=lines[2];
  if last_at>now_at or last_at>=o.kickoff or first_at<now_at-interval '6 hours' or last_at-first_at>interval '30 minutes'
    or abs(lines[1]-med)>5 or abs(lines[3]-med)>5 or p_line is distinct from med or not public.gtl_props_valid_value(p_stat,p_line)
    then raise exception 'GTL_PROPS_REFERENCE_UNAVAILABLE'; end if;
  insert into public.gtl_prop_references(event_id,player_id,stat,line,books,observed_from,observed_to,provider,recorded_at)
  values(p_event_id,p_player_id,p_stat,med,
    (select jsonb_agg(jsonb_build_object('book',b->>'book','line',(b->>'line')::numeric,'observedAt',(b->>'observedAt')::timestamptz) order by b->>'book')
      from jsonb_array_elements(p_books) b),first_at,last_at,'the-odds-api',now_at)
  returning * into r;
  return public.gtl_props_reference_json(r);
end $$;

create or replace function public.gtl_props_record_result(p_result jsonb) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare o public.gtl_prop_offers; v integer; r public.gtl_prop_results; st text:=p_result->>'status';
begin
  if jsonb_typeof(p_result)<>'object' then raise exception 'GTL_PROPS_INVALID'; end if;
  select * into o from public.gtl_prop_offers where event_id=p_result->>'eventId' and player_id=p_result->>'playerId' and stat=p_result->>'stat';
  if not found then raise exception 'GTL_PROPS_INVALID'; end if;
  if st='final' and (jsonb_typeof(p_result->'actual')<>'number' or (p_result->>'actual')::numeric<>trunc((p_result->>'actual')::numeric)
      or ((p_result->>'actual')::integer<0 and o.stat not in ('player_pass_yds','player_rush_yds','player_reception_yds')))
    then raise exception 'GTL_PROPS_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtext('gtl_props_result:'||o.event_id||o.player_id||o.stat));
  select coalesce(max(version),0)+1 into v from public.gtl_prop_results where event_id=o.event_id and player_id=o.player_id and stat=o.stat;
  insert into public.gtl_prop_results(event_id,player_id,stat,version,status,actual,participated,source,source_sha256,observed_at)
  values(o.event_id,o.player_id,o.stat,v,st,case when st='final' then (p_result->>'actual')::integer end,
    case when jsonb_typeof(p_result->'participated')='boolean' then (p_result->>'participated')::boolean end,
    p_result->>'source',p_result->>'sourceSha256',(p_result->>'observedAt')::timestamptz)
  returning * into r;
  return jsonb_build_object('eventId',r.event_id,'playerId',r.player_id,'stat',r.stat,'version',r.version,'status',r.status,
    'actual',r.actual,'participated',r.participated,'observedAt',r.observed_at);
end $$;

-- ---------- member writers ----------
-- Draft and lock share one writer. Order of checks: capability, membership, input, replay, offer/kickoff, existing lock,
-- and (lock only) a qualifying reference. A refused lock changes nothing: gtl-api saves the draft in its own call first.
create or replace function public.gtl_props_write(p_user uuid,p_request uuid,p_event_id text,p_player_id text,p_stat text,p_guess numeric,p_lock boolean)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare o public.gtl_prop_offers; cur public.gtl_prop_guesses; ev public.gtl_prop_guess_events; r public.gtl_prop_references;
  now_at timestamptz; saved public.gtl_prop_guesses;
begin
  if not public.gtl_props_ready() then raise exception 'GTL_PROPS_OFF'; end if;
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_request is null or p_lock is null or p_event_id is null or p_player_id is null or not public.gtl_props_valid_value(p_stat,p_guess)
    then raise exception 'GTL_PROPS_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtext('gtl_props_write:'||p_user::text));
  select * into ev from public.gtl_prop_guess_events where user_id=p_user and request_id=p_request;
  if found then
    if ev.action<>(case when p_lock then 'lock' else 'draft' end) or ev.event_id<>p_event_id or ev.player_id<>p_player_id
      or ev.stat<>p_stat or ev.guess<>p_guess then raise exception 'GTL_PROPS_RETRY_CONFLICT'; end if;
    select * into saved from public.gtl_prop_guesses where user_id=p_user and event_id=p_event_id and player_id=p_player_id and stat=p_stat;
    return public.gtl_props_guess_json(saved)||jsonb_build_object('replayed',true);
  end if;
  now_at:=clock_timestamp();
  select * into o from public.gtl_prop_offers where event_id=p_event_id and player_id=p_player_id and stat=p_stat;
  if not found then raise exception 'GTL_PROPS_INVALID'; end if;
  if now_at>=o.kickoff then raise exception 'GTL_PROPS_CLOSED'; end if;
  select * into cur from public.gtl_prop_guesses where user_id=p_user and event_id=p_event_id and player_id=p_player_id and stat=p_stat for update;
  if found and cur.status='locked' then
    -- A repeated lock of the same final value is idempotent; anything else is refused and the final row is unchanged.
    if p_lock and cur.guess=p_guess then return public.gtl_props_guess_json(cur)||jsonb_build_object('replayed',true); end if;
    raise exception 'GTL_PROPS_LOCKED';
  end if;
  if p_lock then
    select * into r from public.gtl_prop_references x where x.event_id=p_event_id and x.player_id=p_player_id and x.stat=p_stat
      and x.observed_to<o.kickoff and x.observed_to<=now_at and x.observed_from>=now_at-interval '6 hours'
    order by x.observed_to desc,x.recorded_at desc,x.id limit 1;
    if not found then raise exception 'GTL_PROPS_REFERENCE_UNAVAILABLE'; end if;
  end if;
  insert into public.gtl_prop_guesses(user_id,season,week,event_id,player_id,stat,guess,status,reference_id,reference_line,reference_observed_at,saved_at,locked_at)
  values(p_user,o.season,o.week,p_event_id,p_player_id,p_stat,p_guess,case when p_lock then 'locked' else 'draft' end,
    r.id,r.line,r.observed_to,now_at,case when p_lock then now_at end)
  on conflict (user_id,event_id,player_id,stat) do update set guess=excluded.guess,status=excluded.status,reference_id=excluded.reference_id,
    reference_line=excluded.reference_line,reference_observed_at=excluded.reference_observed_at,saved_at=excluded.saved_at,locked_at=excluded.locked_at
  returning * into saved;
  insert into public.gtl_prop_guess_events(user_id,request_id,action,event_id,player_id,stat,guess,reference_id,created_at)
  values(p_user,p_request,case when p_lock then 'lock' else 'draft' end,p_event_id,p_player_id,p_stat,p_guess,r.id,now_at);
  return public.gtl_props_guess_json(saved)||jsonb_build_object('replayed',false);
end $$;

create or replace function public.gtl_props_save_draft(p_user uuid,p_request uuid,p_event_id text,p_player_id text,p_stat text,p_guess numeric)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select public.gtl_props_write(p_user,p_request,p_event_id,p_player_id,p_stat,p_guess,false)
$$;
create or replace function public.gtl_props_lock_in(p_user uuid,p_request uuid,p_event_id text,p_player_id text,p_stat text,p_guess numeric)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select public.gtl_props_write(p_user,p_request,p_event_id,p_player_id,p_stat,p_guess,true)
$$;

-- ---------- readers (owner only) ----------
-- The week's eligible selections and the viewer's own drafts and locks. No current market number is returned for an
-- unlocked selection (entry-only hiding); a locked one carries its saved reference and, separately, the latest line.
create or replace function public.gtl_props_board(p_user uuid,p_season integer,p_week integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare now_at timestamptz:=clock_timestamp(); ready boolean:=public.gtl_props_ready();
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_season is null or p_week is null or p_season not between 2000 and 2200 or p_week not between 1 and 22 then raise exception 'GTL_PROPS_INVALID'; end if;
  return jsonb_build_object('ready',ready,'season',p_season,'week',p_week,
    'offers',case when not ready then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('eventId',o.event_id,'playerId',o.player_id,
        'stat',o.stat,'playerName',o.player_name,'team',o.team,'position',o.position,'away',o.away,'home',o.home,'kickoff',o.kickoff,
        'closed',now_at>=o.kickoff) order by o.kickoff,o.event_id,o.player_name,o.player_id,o.stat)
      from public.gtl_prop_offers o where o.season=p_season and o.week=p_week),'[]'::jsonb) end,
    'own',coalesce((select jsonb_agg(public.gtl_props_guess_json(g)||jsonb_build_object(
        'playerName',o.player_name,'team',o.team,'position',o.position,'away',o.away,'home',o.home,'kickoff',o.kickoff,
        'latest',case when g.status='locked' then (select jsonb_build_object('line',x.line,'observedTo',x.observed_to)
          from public.gtl_prop_references x where x.event_id=g.event_id and x.player_id=g.player_id and x.stat=g.stat
          order by x.observed_to desc,x.recorded_at desc,x.id limit 1) end) order by o.kickoff,g.event_id,g.player_id,g.stat)
      from public.gtl_prop_guesses g join public.gtl_prop_offers o using (event_id,player_id,stat)
      where g.user_id=p_user and g.season=p_season and g.week=p_week),'[]'::jsonb));
end $$;

-- The viewer's locked guesses over an inclusive week range, with the saved reference (accuracy), the last qualifying
-- retained pre-kickoff line (paper record) and the newest result version. The whole range or an error; never partial.
create or replace function public.gtl_props_history(p_user uuid,p_from_season integer,p_from_week integer,p_to_season integer,p_to_week integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare n integer;
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_from_season is null or p_from_week is null or p_to_season is null or p_to_week is null
    or p_from_season not between 2000 and 2200 or p_to_season not between 2000 and 2200
    or p_from_week not between 1 and 22 or p_to_week not between 1 and 22
    or (p_from_season,p_from_week)>(p_to_season,p_to_week) then raise exception 'GTL_PROPS_INVALID'; end if;
  select count(*) into n from public.gtl_prop_guesses g where g.user_id=p_user and g.status='locked'
    and (g.season,g.week)>=(p_from_season,p_from_week) and (g.season,g.week)<=(p_to_season,p_to_week);
  if n>5000 then raise exception 'GTL_PROPS_RANGE_TOO_LARGE'; end if;
  return jsonb_build_object('from',jsonb_build_object('season',p_from_season,'week',p_from_week),
    'to',jsonb_build_object('season',p_to_season,'week',p_to_week),'complete',true,
    'rows',coalesce((select jsonb_agg(public.gtl_props_guess_json(g)||jsonb_build_object(
        'playerName',o.player_name,'team',o.team,'position',o.position,'away',o.away,'home',o.home,'kickoff',o.kickoff,
        'closingLine',(select x.line from public.gtl_prop_references x where x.event_id=g.event_id and x.player_id=g.player_id and x.stat=g.stat
          and x.observed_to<o.kickoff order by x.observed_to desc,x.recorded_at desc,x.id limit 1),
        'result',(select jsonb_build_object('status',r.status,'actual',r.actual,'participated',r.participated,'version',r.version,'observedAt',r.observed_at)
          from public.gtl_prop_results r where r.event_id=g.event_id and r.player_id=g.player_id and r.stat=g.stat order by r.version desc limit 1))
        order by o.kickoff,g.event_id,g.player_id,g.stat)
      from public.gtl_prop_guesses g join public.gtl_prop_offers o using (event_id,player_id,stat)
      where g.user_id=p_user and g.status='locked'
        and (g.season,g.week)>=(p_from_season,p_from_week) and (g.season,g.week)<=(p_to_season,p_to_week)),'[]'::jsonb));
end $$;

create or replace function public.gtl_props_capability() returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('ready',public.gtl_props_ready())
$$;

revoke all on function public.gtl_props_append_only(),public.gtl_props_offer_guard(),public.gtl_props_guess_guard(),
  public.gtl_props_ready(),public.gtl_props_valid_value(text,numeric),public.gtl_props_reference_json(public.gtl_prop_references),
  public.gtl_props_guess_json(public.gtl_prop_guesses),public.gtl_props_record_offer(jsonb),
  public.gtl_props_record_reference(text,text,text,numeric,jsonb),public.gtl_props_record_result(jsonb),
  public.gtl_props_write(uuid,uuid,text,text,text,numeric,boolean),public.gtl_props_save_draft(uuid,uuid,text,text,text,numeric),
  public.gtl_props_lock_in(uuid,uuid,text,text,text,numeric),public.gtl_props_board(uuid,integer,integer),
  public.gtl_props_history(uuid,integer,integer,integer,integer),public.gtl_props_capability()
  from public,anon,authenticated;
grant execute on function public.gtl_props_append_only(),public.gtl_props_offer_guard(),public.gtl_props_guess_guard(),
  public.gtl_props_ready(),public.gtl_props_valid_value(text,numeric),public.gtl_props_reference_json(public.gtl_prop_references),
  public.gtl_props_guess_json(public.gtl_prop_guesses),public.gtl_props_record_offer(jsonb),
  public.gtl_props_record_reference(text,text,text,numeric,jsonb),public.gtl_props_record_result(jsonb),
  public.gtl_props_write(uuid,uuid,text,text,text,numeric,boolean),public.gtl_props_save_draft(uuid,uuid,text,text,text,numeric),
  public.gtl_props_lock_in(uuid,uuid,text,text,text,numeric),public.gtl_props_board(uuid,integer,integer),
  public.gtl_props_history(uuid,integer,integer,integer,integer),public.gtl_props_capability()
  to service_role;

comment on table public.gtl_prop_capability is 'D-82 Player Props: one row; live_lock_in starts false and no function enables it. RLS on, gtl-api reads only.';
comment on table public.gtl_prop_offers is 'D-82: eligible selections by verified event, stable player ID and canonical stat. Identity fixed.';
comment on table public.gtl_prop_references is 'D-82: append-only three-book median receipts in native units.';
comment on table public.gtl_prop_guesses is 'D-82: one guess per user and exact selection; owner-only; locked rows are final.';
comment on table public.gtl_prop_guess_events is 'D-82: append-only audit of every Player Props draft save and lock-in (D-23).';
comment on table public.gtl_prop_results is 'D-82: append-only final-stat receipts; corrections are new versions; missing evidence stays ungraded.';
