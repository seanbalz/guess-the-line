-- P-01 (D-56): Guess the Points core. Spec: docs/superpowers/specs/2026-10-22-guess-the-points-design.md, sections
-- 3 (rules), 4.1 (tables), 4.2 (functions) and 7 (failure handling). Six new tables, the per-slot reveal gate, the
-- draft and lock-in writers, the reader, the actuals loader, the FINAL freeze and the slate publisher.
-- Additive only: no existing table, function, grant or row changes. Spread and Total scoring, gates, references and
-- readers are untouched, and nothing here is added to their boards. NOT APPLIED: it waits for Sean's explicit
-- "apply P-01" and the release evidence (spec section 10). The routes (gtl-api /points/*), the feed and push CHECK
-- extensions (P-02) and the schedules (P-03) are separate.
-- RLS is on for every table and browsers get no grants: gtl-api calls these service-only, security-invoker functions.
-- Scoring follows shared/points-scoring.mjs; kickoff windows and slate checks follow shared/points-slate.mjs.

create table if not exists public.gtl_points_slates (
  season integer not null check (season between 2000 and 2200),
  week integer not null check (week between 1 and 18),
  status text not null check (status in ('draft','published')),
  opens_at timestamptz not null,
  finalize_at timestamptz not null,
  -- Full PPR with 4-point passing TDs and the weights version the week is scored under (pinned at publish).
  scoring_rules jsonb not null check (jsonb_typeof(scoring_rules)='object' and scoring_rules->>'format'='ppr'
    and scoring_rules->'passingTds'='4'::jsonb and coalesce(scoring_rules->>'version','')<>''),
  -- Five slots in QB, RB, WR, TE, FLEX order: { slot, playerId, name, team, position, gameKey, kickoff }.
  slots jsonb not null check (jsonb_typeof(slots)='array' and jsonb_array_length(slots)=5),
  -- The House: GTL's weekly estimate per slot, withheld per viewer until the gate opens.
  house jsonb not null default '{}'::jsonb check (jsonb_typeof(house)='object'),
  -- Estimate snapshot season/week, checksum, selection-rule version and seed.
  provenance jsonb not null check (jsonb_typeof(provenance)='object'),
  created_by uuid references public.gtl_profiles(user_id),
  published_at timestamptz,
  published_by uuid references public.gtl_profiles(user_id),
  -- Append-only audit of every draft, swap and publish (who, when, what changed).
  audit jsonb not null default '[]'::jsonb check (jsonb_typeof(audit)='array'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (season,week),
  check ((status='published')=(published_at is not null))
);

create table if not exists public.gtl_points_guesses (
  user_id uuid not null references auth.users(id) on delete cascade,
  season integer not null,
  week integer not null,
  slot text not null check (slot in ('QB','RB','WR','TE','FLEX')),
  guess integer not null check (guess between 0 and 60),
  locked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id,season,week,slot),
  foreign key (season,week) references public.gtl_points_slates(season,week)
);
create index if not exists gtl_points_guesses_week on public.gtl_points_guesses(season,week,slot);

create table if not exists public.gtl_points_guess_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  season integer not null,
  week integer not null,
  slot text not null check (slot in ('QB','RB','WR','TE','FLEX')),
  action text not null check (action in ('draft','lock')),
  guess integer not null check (guess between 0 and 60),
  request_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (season,week) references public.gtl_points_slates(season,week)
);
create index if not exists gtl_points_guess_events_user on public.gtl_points_guess_events(user_id,season,week,created_at);

create table if not exists public.gtl_points_actual_loads (
  id uuid primary key,
  season integer not null check (season between 2000 and 2200),
  week integer not null check (week between 1 and 18),
  status text not null check (status in ('saved','skipped','failed')),
  source_url text,
  source_release text,
  upstream_published_at timestamptz,
  retrieved_at timestamptz,
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  rows_total integer not null default 0 check (rows_total>=0),
  rows_saved integer not null default 0 check (rows_saved>=0),
  rows_skipped integer not null default 0 check (rows_skipped>=0),
  -- Partial coverage is reported here as the worker found it, never hidden.
  coverage jsonb not null default '{}'::jsonb check (jsonb_typeof(coverage)='object'),
  -- Before/after week results for every non-FINAL week this load re-graded.
  regrades jsonb not null default '[]'::jsonb check (jsonb_typeof(regrades)='array'),
  error text check (error is null or char_length(error)<=500),
  created_at timestamptz not null default clock_timestamp(),
  check (status='failed' or sha256 is not null)
);
-- Idempotent per checksum: one accepted load per week and file.
create unique index if not exists gtl_points_actual_loads_checksum on public.gtl_points_actual_loads(season,week,sha256) where status<>'failed';

create table if not exists public.gtl_points_actuals (
  season integer not null check (season between 2000 and 2200),
  week integer not null check (week between 1 and 18),
  player_id text not null check (player_id ~ '^[0-9A-Za-z-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  team text not null check (team ~ '^[A-Z]{2,3}$'),
  position text not null check (position ~ '^[A-Z]{1,4}$'),
  game_key text not null check (game_key ~ '^[0-9A-Za-z_-]{1,40}$'),
  stats jsonb not null check (jsonb_typeof(stats)='object'),
  -- Fantasy points under each pinned rules version: { "<version>": n }.
  points jsonb not null check (jsonb_typeof(points)='object'),
  played text not null check (played in ('true','false','unknown')),
  played_basis text check (played_basis is null or char_length(played_basis)<=60),
  -- The load row is written last in the same transaction, after the re-grade is known.
  load_id uuid not null references public.gtl_points_actual_loads(id) deferrable initially deferred,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (season,week,player_id)
);

create table if not exists public.gtl_points_week_final (
  season integer not null,
  week integer not null,
  finalized_at timestamptz not null default clock_timestamp(),
  load_id uuid references public.gtl_points_actual_loads(id),
  maximum integer not null check (maximum between 0 and 50 and maximum%10=0),
  slots jsonb not null check (jsonb_typeof(slots)='array'),
  members jsonb not null check (jsonb_typeof(members)='array'),
  house jsonb not null check (jsonb_typeof(house)='object'),
  -- Corrections that arrive after FINAL are recorded here and change nothing else.
  notes jsonb not null default '[]'::jsonb check (jsonb_typeof(notes)='array'),
  primary key (season,week),
  foreign key (season,week) references public.gtl_points_slates(season,week)
);

alter table public.gtl_points_slates enable row level security;
alter table public.gtl_points_guesses enable row level security;
alter table public.gtl_points_guess_events enable row level security;
alter table public.gtl_points_actual_loads enable row level security;
alter table public.gtl_points_actuals enable row level security;
alter table public.gtl_points_week_final enable row level security;
revoke all on public.gtl_points_slates,public.gtl_points_guesses,public.gtl_points_guess_events,
  public.gtl_points_actual_loads,public.gtl_points_actuals,public.gtl_points_week_final
  from public,anon,authenticated,service_role;
-- No delete grant anywhere (D-23); events and loads are insert-only.
grant select,insert,update on public.gtl_points_slates,public.gtl_points_guesses,public.gtl_points_actuals,public.gtl_points_week_final to service_role;
grant select,insert on public.gtl_points_guess_events,public.gtl_points_actual_loads to service_role;

-- A published slate is fixed; its audit only grows.
create or replace function public.gtl_points_slate_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'GTL_POINTS_SLATE_FIXED'; end if;
  if new.season<>old.season or new.week<>old.week then raise exception 'GTL_POINTS_SLATE_FIXED'; end if;
  if jsonb_array_length(new.audit)<jsonb_array_length(old.audit) or coalesce((select jsonb_agg(e order by n)
      from jsonb_array_elements(new.audit) with ordinality a(e,n) where n<=jsonb_array_length(old.audit)),'[]'::jsonb)<>old.audit
    then raise exception 'GTL_POINTS_SLATE_FIXED'; end if;
  if old.status='published' and (new.status<>'published' or new.slots<>old.slots or new.house<>old.house
      or new.scoring_rules<>old.scoring_rules or new.provenance<>old.provenance or new.opens_at<>old.opens_at
      or new.finalize_at<>old.finalize_at or new.published_at<>old.published_at or new.published_by is distinct from old.published_by)
    then raise exception 'GTL_POINTS_SLATE_FIXED'; end if;
  return new;
end $$;
create or replace trigger gtl_points_slate_guard before update or delete on public.gtl_points_slates
  for each row execute function public.gtl_points_slate_guard();

-- Lock-in is per slot and final (D-39 pattern): no writer may change a locked row, and no write lands at or after the
-- slot's kickoff or before the week opens. Only server time counts.
create or replace function public.gtl_points_guess_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare st text; opens timestamptz; kick timestamptz;
begin
  if tg_op='UPDATE' then
    if old.locked_at is not null then raise exception 'GTL_POINTS_LOCKED'; end if;
    if new.user_id<>old.user_id or new.season<>old.season or new.week<>old.week or new.slot<>old.slot then raise exception 'GTL_POINTS_INVALID'; end if;
  end if;
  select s.status,s.opens_at,(x->>'kickoff')::timestamptz into st,opens,kick
  from public.gtl_points_slates s cross join lateral jsonb_array_elements(s.slots) x
  where s.season=new.season and s.week=new.week and x->>'slot'=new.slot;
  if st is distinct from 'published' or clock_timestamp()<opens then raise exception 'GTL_POINTS_NOT_OPEN'; end if;
  if kick is null or clock_timestamp()>=kick then raise exception 'GTL_POINTS_CLOSED'; end if;
  return new;
end $$;
create or replace trigger gtl_points_guess_guard before insert or update on public.gtl_points_guesses
  for each row execute function public.gtl_points_guess_guard();

-- History is append-only (D-23).
create or replace function public.gtl_points_append_only() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'GTL_POINTS_APPEND_ONLY'; end $$;
create or replace trigger gtl_points_guess_events_append_only before update or delete on public.gtl_points_guess_events
  for each row execute function public.gtl_points_append_only();
create or replace trigger gtl_points_actual_loads_append_only before update or delete on public.gtl_points_actual_loads
  for each row execute function public.gtl_points_append_only();

-- A FINAL week is frozen; only its notes grow.
create or replace function public.gtl_points_final_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' or new.season<>old.season or new.week<>old.week or new.finalized_at<>old.finalized_at
    or new.load_id is distinct from old.load_id or new.maximum<>old.maximum or new.slots<>old.slots
    or new.members<>old.members or new.house<>old.house
    or jsonb_array_length(new.notes)<jsonb_array_length(old.notes)
    or coalesce((select jsonb_agg(e order by n) from jsonb_array_elements(new.notes) with ordinality a(e,n)
      where n<=jsonb_array_length(old.notes)),'[]'::jsonb)<>old.notes
    then raise exception 'GTL_POINTS_FINAL_FROZEN'; end if;
  return new;
end $$;
create or replace trigger gtl_points_final_guard before update or delete on public.gtl_points_week_final
  for each row execute function public.gtl_points_final_guard();

-- Slot points: max(0, 10 − |guess − actual|), both rounded to the tenth.
create or replace function public.gtl_points_slot_points(p_guess numeric,p_actual numeric) returns numeric
language sql immutable security invoker set search_path='' as $$
  select greatest(0::numeric,10-abs(round(p_guess,1)-round(p_actual,1)))
$$;

-- Kickoff windows in Pacific time (spec default 4; shared/points-slate.mjs kickoffWindow).
create or replace function public.gtl_points_kickoff_window(p_kickoff timestamptz) returns text
language sql stable security invoker set search_path='' as $$
  select case
    when extract(isodow from l)=4 and l::time>='17:00' then 'thursday-night'
    when extract(isodow from l)=7 and l::time>='09:00' and l::time<'12:00' then 'sunday-early'
    when extract(isodow from l)=7 and l::time>='12:00' and l::time<'17:00' then 'sunday-late'
    when extract(isodow from l)=7 and l::time>='17:00' then 'sunday-night'
    when extract(isodow from l)=1 then 'monday-night'
    else 'other:'||to_char(l,'YYYY-MM-DD"T"HH24:MI') end
  from (select p_kickoff at time zone 'America/Los_Angeles' l) k
$$;

-- FINAL time: the following Thursday 12:00 PM PT (shared/points-scoring.mjs finalizeAt).
create or replace function public.gtl_points_finalize_at(p_opens_at timestamptz) returns timestamptz
language sql stable security invoker set search_path='' as $$
  select ((d+(case when (11-dw)%7=0 then 7 else (11-dw)%7 end)+7)::timestamp+time '12:00') at time zone 'America/Los_Angeles'
  from (select (p_opens_at at time zone 'America/Los_Angeles')::date d,extract(isodow from p_opens_at at time zone 'America/Los_Angeles')::integer dw) x
$$;

-- The first problem with five slots, or null (shared/points-slate.mjs slateProblem).
create or replace function public.gtl_points_slate_problem(p_slots jsonb) returns text
language plpgsql stable security invoker set search_path='' as $$
declare expected text[]:=array['QB','RB','WR','TE','FLEX']; x jsonb; k timestamptz;
begin
  if jsonb_typeof(p_slots) is distinct from 'array' or jsonb_array_length(p_slots)<>5 then return 'slots'; end if;
  for i in 1..5 loop
    x:=p_slots->(i-1);
    if jsonb_typeof(x)<>'object' or x->>'slot' is distinct from expected[i] then return 'slots'; end if;
    if not coalesce(x->>'position'=any(case when i=5 then array['RB','WR','TE'] else array[expected[i]] end),false) then return 'position'; end if;
    if coalesce(x->>'playerId','')!~'^[0-9A-Za-z-]{1,40}$' or char_length(coalesce(x->>'name','')) not between 1 and 80
      or coalesce(x->>'team','')!~'^[A-Z]{2,3}$' or coalesce(x->>'gameKey','')!~'^[0-9A-Za-z_-]{1,40}$' then return 'player'; end if;
    begin k:=(x->>'kickoff')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then return 'kickoff';
    end;
    if k is null then return 'kickoff'; end if;
  end loop;
  if (select count(distinct e->>'playerId') from jsonb_array_elements(p_slots) e)<>5 then return 'duplicate_player'; end if;
  if (select count(distinct e->>'gameKey') from jsonb_array_elements(p_slots) e)<>5 then return 'same_game'; end if;
  if (select count(distinct public.gtl_points_kickoff_window((e->>'kickoff')::timestamptz)) from jsonb_array_elements(p_slots) e)<2 then return 'one_kickoff_window'; end if;
  return null;
end $$;

-- Each slot's outcome at p_now (spec 3.5, 3.6, 7): open, pending, void or scored under the slate's pinned rules version.
create or replace function public.gtl_points_slot_outcomes(p_season integer,p_week integer,p_now timestamptz)
returns table(slot text,player_id text,team text,kickoff timestamptz,state text,actual numeric,void_reason text,house numeric)
language sql stable security invoker set search_path='' as $$
  select x->>'slot',x->>'playerId',x->>'team',k.kickoff,
    case when p_now<k.kickoff then 'open'
      when a.player_id is null then 'pending'
      when a.played='false' or a.team<>x->>'team' then 'void'
      when a.played<>'true' or jsonb_typeof(a.points->(s.scoring_rules->>'version')) is distinct from 'number' then 'pending'
      else 'scored' end,
    case when p_now>=k.kickoff and a.played='true' and a.team=x->>'team' and jsonb_typeof(a.points->(s.scoring_rules->>'version'))='number'
      then round((a.points->>(s.scoring_rules->>'version'))::numeric,1) end,
    case when p_now<k.kickoff or a.player_id is null then null
      when a.played='false' then coalesce(a.played_basis,'inactive')
      when a.team<>x->>'team' then 'team_change' end,
    case when jsonb_typeof(s.house->(x->>'slot'))='number' then round((s.house->>(x->>'slot'))::numeric,1) end
  from public.gtl_points_slates s
  cross join lateral jsonb_array_elements(s.slots) with ordinality j(x,n)
  cross join lateral (select (x->>'kickoff')::timestamptz kickoff) k
  left join public.gtl_points_actuals a on a.season=s.season and a.week=s.week and a.player_id=x->>'playerId'
  where s.season=p_season and s.week=p_week and s.status='published'
  order by j.n
$$;

-- One week's result (shared/points-scoring.mjs scoreWeek): the frozen row once FINAL, otherwise PROVISIONAL from the
-- current actuals. Only locked-in guesses score; points exist only for scored slots, every one of them past its
-- kickoff, so nothing here derives from a hidden guess. Null when the week has no published slate.
create or replace function public.gtl_points_week_scores(p_season integer,p_week integer,p_now timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare f public.gtl_points_week_final; result jsonb;
begin
  select * into f from public.gtl_points_week_final where season=p_season and week=p_week;
  if found then
    return jsonb_build_object('season',p_season,'week',p_week,'status','FINAL','maximum',f.maximum,'slots',f.slots,
      'members',f.members,'house',f.house,'finalizedAt',f.finalized_at);
  end if;
  if not exists(select 1 from public.gtl_points_slates where season=p_season and week=p_week and status='published') then return null; end if;
  with o as (
    select * from public.gtl_points_slot_outcomes(p_season,p_week,p_now)
  ), n as (
    select count(*) filter (where state='scored') scored from o
  ), g as (
    select user_id,slot,guess from public.gtl_points_guesses
    where season=p_season and week=p_week and locked_at is not null
  ), p as (
    select u.user_id,o.slot,
      case when o.state='scored' and g.guess is not null then public.gtl_points_slot_points(g.guess,o.actual) end pts,
      case when o.state='scored' and g.guess is not null then abs(g.guess-o.actual) end off
    from (select distinct user_id from g) u cross join o
    left join g on g.user_id=u.user_id and g.slot=o.slot
  ), m as (
    select user_id,jsonb_object_agg(slot,pts) slots,sum(pts) total,count(*) filter (where pts=10) exact,sum(off) off
    from p group by user_id
  )
  select jsonb_build_object('season',p_season,'week',p_week,
    'status',case when n.scored>0 then 'PROVISIONAL' end,
    'maximum',10*(select count(*) from o where o.state<>'void'),
    'slots',(select jsonb_agg(jsonb_build_object('slot',o.slot,'state',o.state,'actual',o.actual,'voidReason',o.void_reason)
      order by array_position(array['QB','RB','WR','TE','FLEX'],o.slot)) from o),
    'members',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'played',true,'slots',m.slots,
      'points',case when n.scored>0 then coalesce(m.total,0) end,'exact',m.exact,
      'off',case when n.scored>0 then coalesce(m.off,0) end) order by m.user_id) from m),'[]'::jsonb),
    'house',jsonb_build_object(
      'complete',not exists(select 1 from o where o.state<>'void' and o.house is null),
      'slots',(select jsonb_object_agg(o.slot,case when o.state='scored' and o.house is not null then public.gtl_points_slot_points(o.house,o.actual) end) from o),
      'points',case when n.scored>0 and not exists(select 1 from o where o.state<>'void' and o.house is null)
        then coalesce((select sum(public.gtl_points_slot_points(o.house,o.actual)) from o where o.state='scored'),0) end))
  into result from n;
  return result;
end $$;

-- The reveal gate (spec 3.4; D-31/D-39 per slot): another member's guess and the House for a slot are visible to the
-- viewer once the viewer has locked in that slot, or at its kickoff.
create or replace function public.gtl_points_revealed(p_viewer uuid,p_season integer,p_week integer,p_slot text,p_now timestamptz default null)
returns boolean language sql stable security invoker set search_path='' as $$
  select coalesce((select coalesce(p_now,clock_timestamp())>=(x->>'kickoff')::timestamptz
      from public.gtl_points_slates s cross join lateral jsonb_array_elements(s.slots) x
      where s.season=p_season and s.week=p_week and s.status='published' and x->>'slot'=p_slot),false)
    or exists(select 1 from public.gtl_points_guesses g where g.user_id=p_viewer and g.season=p_season and g.week=p_week
      and g.slot=p_slot and g.locked_at is not null)
$$;

-- Draft and lock-in share one writer. Refused before the open, at or after the slot's kickoff, out of range, or on a
-- locked slot; a retry with the same request replays its receipt (gtl_personal_receipts), even after kickoff.
create or replace function public.gtl_points_write(p_user uuid,p_request uuid,p_season integer,p_week integer,p_slot text,p_guess numeric,p_lock boolean)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_action text:=case when p_lock then 'points/lock' else 'points/draft' end; body jsonb; r public.gtl_personal_receipts;
  s public.gtl_points_slates; kick timestamptz; cur public.gtl_points_guesses; now_at timestamptz; result jsonb;
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_request is null or p_lock is null or p_season is null or p_week is null or p_slot is null
    or p_slot not in ('QB','RB','WR','TE','FLEX') or p_guess is null or p_guess<>trunc(p_guess) or p_guess not between 0 and 60
    then raise exception 'GTL_POINTS_INVALID'; end if;
  body:=jsonb_build_object('season',p_season,'week',p_week,'slot',p_slot,'guess',p_guess::integer);
  perform pg_advisory_xact_lock(hashtext('gtl_points_write:'||p_user::text));
  select * into r from public.gtl_personal_receipts where user_id=p_user and request_id=p_request;
  if found then
    if r.action<>v_action or r.payload<>body then raise exception 'GTL_POINTS_RETRY_CONFLICT'; end if;
    return r.result||jsonb_build_object('replayed',true);
  end if;
  now_at:=clock_timestamp();
  select * into s from public.gtl_points_slates where season=p_season and week=p_week;
  if not found or s.status<>'published' or now_at<s.opens_at then raise exception 'GTL_POINTS_NOT_OPEN'; end if;
  select (x->>'kickoff')::timestamptz into kick from jsonb_array_elements(s.slots) x where x->>'slot'=p_slot;
  if kick is null or now_at>=kick then raise exception 'GTL_POINTS_CLOSED'; end if;
  select * into cur from public.gtl_points_guesses where user_id=p_user and season=p_season and week=p_week and slot=p_slot for update;
  if found and cur.locked_at is not null then raise exception 'GTL_POINTS_LOCKED'; end if;
  insert into public.gtl_points_guesses(user_id,season,week,slot,guess,locked_at,created_at,updated_at)
  values(p_user,p_season,p_week,p_slot,p_guess::integer,case when p_lock then now_at end,now_at,now_at)
  on conflict (user_id,season,week,slot) do update set guess=excluded.guess,locked_at=excluded.locked_at,updated_at=excluded.updated_at;
  insert into public.gtl_points_guess_events(user_id,season,week,slot,action,guess,request_id,created_at)
  values(p_user,p_season,p_week,p_slot,case when p_lock then 'lock' else 'draft' end,p_guess::integer,p_request,now_at);
  result:=jsonb_build_object('season',p_season,'week',p_week,'slot',p_slot,'guess',p_guess::integer,'locked',p_lock,
    'lockedAt',case when p_lock then now_at end,'savedAt',now_at,'replayed',false);
  insert into public.gtl_personal_receipts(user_id,request_id,action,payload,result,created_at) values(p_user,p_request,v_action,body,result,now_at);
  return result;
end $$;

create or replace function public.gtl_points_save_draft(p_user uuid,p_request uuid,p_season integer,p_week integer,p_slot text,p_guess numeric)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select public.gtl_points_write(p_user,p_request,p_season,p_week,p_slot,p_guess,false)
$$;

create or replace function public.gtl_points_lock_in(p_user uuid,p_request uuid,p_season integer,p_week integer,p_slot text,p_guess numeric)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select public.gtl_points_write(p_user,p_request,p_season,p_week,p_slot,p_guess,true)
$$;

-- Reader (spec 4.2): the slate, the viewer's own guesses (drafts too), who has locked in (faces, no numbers), other
-- members' locked guesses and the House only where gtl_points_revealed opens, results with PROVISIONAL/FINAL/void
-- state, and week and season standings filtered to the group's roster. Other members' drafts are never returned.
create or replace function public.gtl_points_read(p_viewer uuid,p_season integer default null,p_week integer default null,p_group text default null,p_now timestamptz default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s integer:=p_season; w integer:=p_week; sl public.gtl_points_slates; now_at timestamptz:=coalesce(p_now,clock_timestamp());
  scores jsonb; roster uuid[]; slots_out jsonb; week_rows jsonb; season_rows jsonb; own jsonb;
begin
  if not public.gtl_community_member(p_viewer) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if (p_season is null)<>(p_week is null) or (p_season is not null and (p_season not between 2000 and 2200 or p_week not between 1 and 18))
    then raise exception 'GTL_POINTS_INVALID'; end if;
  if p_group is not null and not exists(select 1 from public.gtl_memberships where league_id=p_group and user_id=p_viewer and active)
    then raise exception 'GTL_POINTS_INVALID'; end if;
  if s is null then
    select x.season,x.week into s,w from public.gtl_points_slates x where x.status='published' order by x.season desc,x.week desc limit 1;
  end if;
  select * into sl from public.gtl_points_slates where season=s and week=w and status='published';
  if not found then
    return jsonb_build_object('season',s,'week',w,'status','unopened','groupId',p_group,'slots','[]'::jsonb,'result',null,
      'standings',jsonb_build_object('week','[]'::jsonb,'season','[]'::jsonb));
  end if;
  -- Community members, plus a removed member only while they have a lock-in this season (D-23 hides none).
  select coalesce(array_agg(p.user_id),'{}') into roster from public.gtl_profiles p
  where (public.gtl_community_member(p.user_id) or exists(select 1 from public.gtl_points_guesses g
      where g.user_id=p.user_id and g.season=s and g.locked_at is not null))
    and (p_group is null or exists(select 1 from public.gtl_memberships m where m.league_id=p_group and m.user_id=p.user_id and m.active));
  scores:=public.gtl_points_week_scores(s,w,now_at);
  select e into own from jsonb_array_elements(scores->'members') e where (e->>'userId')::uuid=p_viewer;

  select jsonb_agg(jsonb_build_object(
      'slot',x->>'slot','playerId',x->>'playerId','name',x->>'name','team',x->>'team','position',x->>'position',
      'gameKey',x->>'gameKey','kickoff',(x->>'kickoff')::timestamptz,'closed',now_at>=(x->>'kickoff')::timestamptz,
      'state',o->>'state','actual',o->'actual','voidReason',o->'voidReason','revealed',rv.open,
      'own',(select jsonb_build_object('guess',g.guess,'locked',g.locked_at is not null,'lockedAt',g.locked_at,
          'points',case when g.locked_at is not null then own->'slots'->(x->>'slot') end)
        from public.gtl_points_guesses g where g.user_id=p_viewer and g.season=s and g.week=w and g.slot=x->>'slot'),
      'house',case when rv.open then jsonb_build_object('estimate',sl.house->(x->>'slot'),'points',scores->'house'->'slots'->(x->>'slot')) end,
      'lockedIn',coalesce((select jsonb_agg(jsonb_build_object('userId',p.user_id,'displayName',p.display_name) order by p.display_name,p.user_id)
        from public.gtl_points_guesses g join public.gtl_profiles p on p.user_id=g.user_id
        where g.season=s and g.week=w and g.slot=x->>'slot' and g.locked_at is not null and g.user_id=any(roster)),'[]'::jsonb),
      'guesses',case when rv.open then coalesce((select jsonb_agg(jsonb_build_object('userId',p.user_id,'displayName',p.display_name,
          'guess',g.guess,'points',(select e->'slots'->(x->>'slot') from jsonb_array_elements(scores->'members') e where (e->>'userId')::uuid=g.user_id))
          order by p.display_name,p.user_id)
        from public.gtl_points_guesses g join public.gtl_profiles p on p.user_id=g.user_id
        where g.season=s and g.week=w and g.slot=x->>'slot' and g.locked_at is not null and g.user_id<>p_viewer and g.user_id=any(roster)),'[]'::jsonb)
        else '[]'::jsonb end)
    order by (x->>'kickoff')::timestamptz,j.n) into slots_out
  from jsonb_array_elements(sl.slots) with ordinality j(x,n)
  cross join lateral (select public.gtl_points_revealed(p_viewer,s,w,x->>'slot',now_at) open) rv
  left join lateral (select e o from jsonb_array_elements(scores->'slots') e where e->>'slot'=x->>'slot') oo on true;

  with m as (
    select (e->>'userId')::uuid uid,(e->>'points')::numeric pts,(e->>'exact')::integer exact,(e->>'off')::numeric off
    from jsonb_array_elements(scores->'members') e where (e->>'userId')::uuid=any(roster)
  ), r as (
    select m.*,p.display_name,case when pts is not null then rank() over (order by pts desc nulls last) end rnk,
      pts is not null and count(*) over (partition by pts)>1 tied
    from m join public.gtl_profiles p on p.user_id=m.uid
  )
  select coalesce(jsonb_agg(jsonb_build_object('userId',uid,'displayName',display_name,'points',pts,'exact',exact,'off',off,
    'rank',rnk,'tied',tied) order by pts desc nulls last,display_name,uid),'[]'::jsonb) into week_rows from r;

  with wk as (
    select x.week,public.gtl_points_week_scores(s,x.week,now_at) sc from public.gtl_points_slates x where x.season=s and x.status='published'
  ), m as (
    select wk.week,wk.sc->>'status' status,(e->>'userId')::uuid uid,(e->>'points')::numeric pts,wk.sc->'house' house
    from wk cross join jsonb_array_elements(wk.sc->'members') e
  ), a as (
    select uid,sum(pts) pts,count(*) weeks_played,count(pts) scored_weeks,
      count(*) filter (where pts is not null and status='PROVISIONAL') provisional_weeks,
      count(*) filter (where pts is not null and (house->>'complete')::boolean and jsonb_typeof(house->'points')='number'
        and pts>(house->>'points')::numeric) beat_house
    from m where uid=any(roster) group by uid
  ), r as (
    select a.*,p.display_name,case when pts is not null then rank() over (order by pts desc nulls last) end rnk,
      pts is not null and count(*) over (partition by pts)>1 tied
    from a join public.gtl_profiles p on p.user_id=a.uid
  )
  select coalesce(jsonb_agg(jsonb_build_object('userId',uid,'displayName',display_name,'points',pts,'weeksPlayed',weeks_played,
    'perWeek',case when scored_weeks>0 then round(pts/scored_weeks,1) end,'provisional',provisional_weeks>0,
    'provisionalWeeks',provisional_weeks,'beatHouse',beat_house,'rank',rnk,'tied',tied)
    order by pts desc nulls last,display_name,uid),'[]'::jsonb) into season_rows from r;

  return jsonb_build_object('season',s,'week',w,'status','open','groupId',p_group,'opensAt',sl.opens_at,'finalizeAt',sl.finalize_at,
    'scoringRules',sl.scoring_rules,
    'result',jsonb_build_object('status',scores->'status','maximum',scores->'maximum','points',own->'points',
      'finalizedAt',scores->'finalizedAt','house',jsonb_build_object('points',scores->'house'->'points','complete',scores->'house'->'complete')),
    'slots',coalesce(slots_out,'[]'::jsonb),
    'standings',jsonb_build_object('week',week_rows,'season',season_rows));
end $$;

-- Actuals loader (service only): idempotent per checksum; a failed fetch is recorded and changes nothing; invalid rows
-- are counted as skipped; partial coverage is stored as reported. A load re-grades its week while it is not FINAL
-- and records the before/after; after FINAL a changed slot is recorded as a note and changes nothing.
create or replace function public.gtl_points_load_actuals(p_payload jsonb)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare s integer; w integer; src jsonb; sha text; v_id uuid:=gen_random_uuid(); existing public.gtl_points_actual_loads;
  x jsonb; total integer:=0; saved integer:=0; skipped integer:=0; v_status text; before jsonb; after jsonb;
  regrades jsonb:='[]'::jsonb; changes jsonb; now_at timestamptz:=clock_timestamp(); final_week boolean;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(p_payload->'season') is distinct from 'number'
    or jsonb_typeof(p_payload->'week') is distinct from 'number' then raise exception 'GTL_POINTS_INVALID'; end if;
  s:=(p_payload->>'season')::integer; w:=(p_payload->>'week')::integer;
  if s not between 2000 and 2200 or w not between 1 and 18 then raise exception 'GTL_POINTS_INVALID'; end if;
  src:=coalesce(p_payload->'source','{}'::jsonb);
  if jsonb_typeof(src)<>'object' then raise exception 'GTL_POINTS_INVALID'; end if;
  if p_payload->>'status'='failed' then
    insert into public.gtl_points_actual_loads(id,season,week,status,source_url,source_release,retrieved_at,sha256,error,created_at)
    values(v_id,s,w,'failed',left(src->>'url',500),left(src->>'release',200),(src->>'retrievedAt')::timestamptz,
      case when src->>'sha256' ~ '^[0-9a-f]{64}$' then src->>'sha256' end,left(coalesce(p_payload->>'error','failed'),500),now_at);
    return jsonb_build_object('loadId',v_id,'status','failed','replayed',false);
  end if;
  sha:=src->>'sha256';
  if sha is null or sha!~'^[0-9a-f]{64}$' or jsonb_typeof(p_payload->'players') is distinct from 'array' then raise exception 'GTL_POINTS_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtext('gtl_points_week:'||s||':'||w));
  select * into existing from public.gtl_points_actual_loads where season=s and week=w and sha256=sha and status<>'failed';
  if found then return jsonb_build_object('loadId',existing.id,'status',existing.status,'replayed',true); end if;
  final_week:=exists(select 1 from public.gtl_points_week_final where season=s and week=w);
  before:=public.gtl_points_week_scores(s,w,now_at);
  for x in select e from jsonb_array_elements(p_payload->'players') e loop
    total:=total+1;
    if jsonb_typeof(x)<>'object' or coalesce(x->>'playerId','')!~'^[0-9A-Za-z-]{1,40}$' or char_length(coalesce(x->>'name','')) not between 1 and 80
      or coalesce(x->>'team','')!~'^[A-Z]{2,3}$' or coalesce(x->>'position','')!~'^[A-Z]{1,4}$' or coalesce(x->>'gameKey','')!~'^[0-9A-Za-z_-]{1,40}$'
      or jsonb_typeof(x->'stats') is distinct from 'object' or jsonb_typeof(x->'points') is distinct from 'object'
      or exists(select 1 from jsonb_each(x->'points') pv where jsonb_typeof(pv.value)<>'number')
      or coalesce(jsonb_typeof(x->'played'),'null') not in ('boolean','null')
      or char_length(coalesce(x->>'playedBasis',''))>60 then
      skipped:=skipped+1; continue;
    end if;
    insert into public.gtl_points_actuals(season,week,player_id,name,team,position,game_key,stats,points,played,played_basis,load_id,updated_at)
    values(s,w,x->>'playerId',x->>'name',x->>'team',x->>'position',x->>'gameKey',x->'stats',x->'points',
      case x->'played' when 'true'::jsonb then 'true' when 'false'::jsonb then 'false' else 'unknown' end,x->>'playedBasis',v_id,now_at)
    on conflict (season,week,player_id) do update set name=excluded.name,team=excluded.team,position=excluded.position,
      game_key=excluded.game_key,stats=excluded.stats,points=excluded.points,played=excluded.played,
      played_basis=excluded.played_basis,load_id=excluded.load_id,updated_at=excluded.updated_at;
    saved:=saved+1;
  end loop;
  v_status:=case when saved>0 then 'saved' else 'skipped' end;
  if final_week then
    select jsonb_agg(jsonb_build_object('slot',o.slot,'frozen',jsonb_build_object('state',f->'state','actual',f->'actual'),
        'loaded',jsonb_build_object('state',o.state,'actual',o.actual)) order by o.slot) into changes
    from public.gtl_points_slot_outcomes(s,w,now_at) o
    join public.gtl_points_week_final fw on fw.season=s and fw.week=w
    cross join lateral (select e f from jsonb_array_elements(fw.slots) e where e->>'slot'=o.slot) ff
    where o.state is distinct from f->>'state' or o.actual is distinct from (f->>'actual')::numeric;
    if changes is not null then
      update public.gtl_points_week_final set notes=notes||jsonb_build_array(jsonb_build_object('loadId',v_id,'at',now_at,'changes',changes))
      where season=s and week=w;
    end if;
  elsif before is not null then
    after:=public.gtl_points_week_scores(s,w,now_at);
    if after is distinct from before then
      regrades:=jsonb_build_array(jsonb_build_object('season',s,'week',w,'before',before,'after',after));
    end if;
  end if;
  insert into public.gtl_points_actual_loads(id,season,week,status,source_url,source_release,upstream_published_at,retrieved_at,
    sha256,rows_total,rows_saved,rows_skipped,coverage,regrades,created_at)
  values(v_id,s,w,v_status,left(src->>'url',500),left(src->>'release',200),(src->>'publishedAt')::timestamptz,(src->>'retrievedAt')::timestamptz,
    sha,total,saved,skipped,case when jsonb_typeof(p_payload->'coverage')='object' then p_payload->'coverage' else '{}'::jsonb end,regrades,now_at);
  return jsonb_build_object('loadId',v_id,'status',v_status,'replayed',false,'rowsTotal',total,'rowsSaved',saved,'rowsSkipped',skipped,
    'partial',coalesce(p_payload#>>'{coverage,partial}','false')='true','regraded',jsonb_array_length(regrades)>0,
    'finalNote',changes is not null);
end $$;

-- FINAL (service only): at the week's FINAL time, once no slot is open or pending, the week's member and House
-- results are frozen with the load they came from. A re-run is a no-op; an early or incomplete run changes nothing.
create or replace function public.gtl_points_finalize(p_season integer,p_week integer)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare sl public.gtl_points_slates; f public.gtl_points_week_final; now_at timestamptz:=clock_timestamp(); scores jsonb; last_load uuid;
begin
  if p_season is null or p_week is null or p_season not between 2000 and 2200 or p_week not between 1 and 18 then raise exception 'GTL_POINTS_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtext('gtl_points_week:'||p_season||':'||p_week));
  select * into f from public.gtl_points_week_final where season=p_season and week=p_week;
  if found then return jsonb_build_object('season',p_season,'week',p_week,'final',true,'replayed',true,'finalizedAt',f.finalized_at); end if;
  select * into sl from public.gtl_points_slates where season=p_season and week=p_week and status='published';
  if not found then return jsonb_build_object('season',p_season,'week',p_week,'final',false,'reason','unpublished'); end if;
  if now_at<sl.finalize_at then return jsonb_build_object('season',p_season,'week',p_week,'final',false,'reason','not_yet'); end if;
  if exists(select 1 from public.gtl_points_slot_outcomes(p_season,p_week,now_at) where state in ('open','pending'))
    then return jsonb_build_object('season',p_season,'week',p_week,'final',false,'reason','pending_stats'); end if;
  scores:=public.gtl_points_week_scores(p_season,p_week,now_at);
  select id into last_load from public.gtl_points_actual_loads where season=p_season and week=p_week and status='saved'
    order by created_at desc,id limit 1;
  insert into public.gtl_points_week_final(season,week,finalized_at,load_id,maximum,slots,members,house)
  values(p_season,p_week,now_at,last_load,(scores->>'maximum')::integer,scores->'slots',scores->'members',scores->'house');
  return jsonb_build_object('season',p_season,'week',p_week,'final',true,'replayed',false,'finalizedAt',now_at);
end $$;

create or replace function public.gtl_points_slate_json(p_slate public.gtl_points_slates) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('season',p_slate.season,'week',p_slate.week,'status',p_slate.status,'opensAt',p_slate.opens_at,
    'finalizeAt',p_slate.finalize_at,'scoringRules',p_slate.scoring_rules,'slots',p_slate.slots,'house',p_slate.house,
    'provenance',p_slate.provenance,'publishedAt',p_slate.published_at,'publishedBy',p_slate.published_by,'audit',p_slate.audit)
$$;

-- Slate publisher (commissioner or scheduler; p_actor null is the scheduler). Actions:
--   preview  the stored slate
--   draft    store or replace the unpublished slate (the builder's output, or a manual slate meeting the same rules)
--   publish  the scheduler at or after opens_at; the commissioner early (the D-24 fallback); never at or after the first kickoff
--   swap     commissioner only, before the open: replace one slot with another eligible player of that slot's position
-- Every change is appended to the slate's audit. A published slate is fixed.
create or replace function public.gtl_points_publish_slate(p_actor uuid,p_action text,p_season integer,p_week integer,p_slate jsonb default null)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare sl public.gtl_points_slates; now_at timestamptz:=clock_timestamp(); problem text; opens timestamptz; entry jsonb;
  idx integer; player jsonb; v_house jsonb; first_kick timestamptz;
begin
  if p_action is null or p_action not in ('preview','draft','publish','swap') or p_season is null or p_week is null
    or p_season not between 2000 and 2200 or p_week not between 1 and 18 then raise exception 'GTL_POINTS_INVALID'; end if;
  if (p_actor is not null and not public.gtl_community_admin(p_actor)) or (p_actor is null and p_action='swap')
    then raise exception 'GTL_POINTS_FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtext('gtl_points_slate:'||p_season||':'||p_week));
  select * into sl from public.gtl_points_slates where season=p_season and week=p_week for update;
  if p_action='preview' then
    if not found then raise exception 'GTL_POINTS_NO_SLATE'; end if;
    return public.gtl_points_slate_json(sl);
  end if;
  entry:=jsonb_build_object('action',p_action,'at',now_at,'by',p_actor);

  if p_action='draft' then
    if found and sl.status='published' then raise exception 'GTL_POINTS_SLATE_FIXED'; end if;
    if jsonb_typeof(p_slate) is distinct from 'object' or jsonb_typeof(p_slate->'provenance') is distinct from 'object'
      or jsonb_typeof(p_slate->'scoringRules') is distinct from 'object' or p_slate#>>'{scoringRules,format}' is distinct from 'ppr'
      or p_slate#>'{scoringRules,passingTds}' is distinct from '4'::jsonb or coalesce(p_slate#>>'{scoringRules,version}','')=''
      then raise exception 'GTL_POINTS_INVALID'; end if;
    begin opens:=(p_slate->>'opensAt')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then raise exception 'GTL_POINTS_INVALID';
    end;
    if opens is null then raise exception 'GTL_POINTS_INVALID'; end if;
    problem:=public.gtl_points_slate_problem(p_slate->'slots');
    if problem is not null then raise exception 'GTL_POINTS_SLATE_INVALID' using detail=problem; end if;
    v_house:=coalesce(p_slate->'house','{}'::jsonb);
    if jsonb_typeof(v_house)<>'object' or exists(select 1 from jsonb_each(v_house) h where h.key not in ('QB','RB','WR','TE','FLEX')
        or jsonb_typeof(h.value)<>'number' or (h.value::text)::numeric not between 0 and 100)
      then raise exception 'GTL_POINTS_INVALID'; end if;
    insert into public.gtl_points_slates(season,week,status,opens_at,finalize_at,scoring_rules,slots,house,provenance,created_by,audit,created_at,updated_at)
    values(p_season,p_week,'draft',opens,public.gtl_points_finalize_at(opens),p_slate->'scoringRules',p_slate->'slots',v_house,
      p_slate->'provenance',p_actor,jsonb_build_array(entry),now_at,now_at)
    on conflict (season,week) do update set opens_at=excluded.opens_at,finalize_at=excluded.finalize_at,scoring_rules=excluded.scoring_rules,
      slots=excluded.slots,house=excluded.house,provenance=excluded.provenance,audit=public.gtl_points_slates.audit||jsonb_build_array(entry),
      updated_at=excluded.updated_at
    returning * into sl;
    return public.gtl_points_slate_json(sl);
  end if;

  if not found then raise exception 'GTL_POINTS_NO_SLATE'; end if;
  if p_action='publish' then
    if sl.status='published' then return public.gtl_points_slate_json(sl)||jsonb_build_object('replayed',true); end if;
    if p_actor is null and now_at<sl.opens_at then raise exception 'GTL_POINTS_NOT_OPEN'; end if;
    problem:=public.gtl_points_slate_problem(sl.slots);
    if problem is not null then raise exception 'GTL_POINTS_SLATE_INVALID' using detail=problem; end if;
    select min((x->>'kickoff')::timestamptz) into first_kick from jsonb_array_elements(sl.slots) x;
    if now_at>=first_kick then raise exception 'GTL_POINTS_TOO_LATE'; end if;
    update public.gtl_points_slates set status='published',published_at=now_at,published_by=p_actor,opens_at=least(opens_at,now_at),
      audit=audit||jsonb_build_array(entry),updated_at=now_at
    where season=p_season and week=p_week returning * into sl;
    return public.gtl_points_slate_json(sl);
  end if;

  -- swap
  if sl.status='published' or now_at>=sl.opens_at then raise exception 'GTL_POINTS_SLATE_FIXED'; end if;
  player:=p_slate->'player';
  if jsonb_typeof(p_slate) is distinct from 'object' or jsonb_typeof(player) is distinct from 'object'
    or coalesce(jsonb_typeof(p_slate->'house'),'null') not in ('number','null') then raise exception 'GTL_POINTS_INVALID'; end if;
  idx:=array_position(array['QB','RB','WR','TE','FLEX'],p_slate->>'slot');
  if idx is null then raise exception 'GTL_POINTS_INVALID'; end if;
  player:=jsonb_build_object('slot',p_slate->>'slot','playerId',player->'playerId','name',player->'name','team',player->'team',
    'position',player->'position','gameKey',player->'gameKey','kickoff',player->'kickoff');
  problem:=public.gtl_points_slate_problem(jsonb_set(sl.slots,array[(idx-1)::text],player));
  if problem is not null then raise exception 'GTL_POINTS_SLATE_INVALID' using detail=problem; end if;
  if jsonb_typeof(p_slate->'house')='number' and (p_slate->>'house')::numeric not between 0 and 100 then raise exception 'GTL_POINTS_INVALID'; end if;
  entry:=entry||jsonb_build_object('slot',p_slate->>'slot','from',sl.slots->(idx-1)->'playerId','to',player->'playerId');
  update public.gtl_points_slates set slots=jsonb_set(slots,array[(idx-1)::text],player),
    house=case when jsonb_typeof(p_slate->'house')='number' then jsonb_set(house,array[p_slate->>'slot'],p_slate->'house') else house-(p_slate->>'slot') end,
    audit=audit||jsonb_build_array(entry),updated_at=now_at
  where season=p_season and week=p_week returning * into sl;
  return public.gtl_points_slate_json(sl);
end $$;

revoke all on function public.gtl_points_slate_guard(),public.gtl_points_guess_guard(),public.gtl_points_append_only(),
  public.gtl_points_final_guard(),public.gtl_points_slot_points(numeric,numeric),public.gtl_points_kickoff_window(timestamptz),
  public.gtl_points_finalize_at(timestamptz),public.gtl_points_slate_problem(jsonb),
  public.gtl_points_slot_outcomes(integer,integer,timestamptz),public.gtl_points_week_scores(integer,integer,timestamptz),
  public.gtl_points_revealed(uuid,integer,integer,text,timestamptz),
  public.gtl_points_write(uuid,uuid,integer,integer,text,numeric,boolean),
  public.gtl_points_save_draft(uuid,uuid,integer,integer,text,numeric),public.gtl_points_lock_in(uuid,uuid,integer,integer,text,numeric),
  public.gtl_points_read(uuid,integer,integer,text,timestamptz),public.gtl_points_load_actuals(jsonb),
  public.gtl_points_finalize(integer,integer),public.gtl_points_slate_json(public.gtl_points_slates),
  public.gtl_points_publish_slate(uuid,text,integer,integer,jsonb)
  from public,anon,authenticated;
grant execute on function public.gtl_points_slate_guard(),public.gtl_points_guess_guard(),public.gtl_points_append_only(),
  public.gtl_points_final_guard(),public.gtl_points_slot_points(numeric,numeric),public.gtl_points_kickoff_window(timestamptz),
  public.gtl_points_finalize_at(timestamptz),public.gtl_points_slate_problem(jsonb),
  public.gtl_points_slot_outcomes(integer,integer,timestamptz),public.gtl_points_week_scores(integer,integer,timestamptz),
  public.gtl_points_revealed(uuid,integer,integer,text,timestamptz),
  public.gtl_points_write(uuid,uuid,integer,integer,text,numeric,boolean),
  public.gtl_points_save_draft(uuid,uuid,integer,integer,text,numeric),public.gtl_points_lock_in(uuid,uuid,integer,integer,text,numeric),
  public.gtl_points_read(uuid,integer,integer,text,timestamptz),public.gtl_points_load_actuals(jsonb),
  public.gtl_points_finalize(integer,integer),public.gtl_points_slate_json(public.gtl_points_slates),
  public.gtl_points_publish_slate(uuid,text,integer,integer,jsonb)
  to service_role;

comment on table public.gtl_points_slates is 'D-56 Guess the Points: one slate per season and week. RLS on, no browser grants; gtl-api only.';
comment on table public.gtl_points_guesses is 'D-56: one guess per user, week and slot. Locked rows and writes at or after kickoff are refused by gtl_points_guess_guard.';
comment on table public.gtl_points_guess_events is 'D-56: append-only history of every Points draft save and lock-in (D-23).';
comment on table public.gtl_points_actuals is 'D-56: nflverse weekly actuals (CC BY 4.0) with points per pinned rules version and a played flag.';
comment on table public.gtl_points_actual_loads is 'D-56: append-only actuals load records, idempotent per checksum, with re-grade before/after.';
comment on table public.gtl_points_week_final is 'D-56: frozen FINAL week results; only notes for later corrections are appended.';
