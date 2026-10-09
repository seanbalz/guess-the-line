-- D-05: one authenticated player's entries per NFL season/week, across all games.
-- Archive the exact prior JSON before backfill; never rewrite the league snapshots.
lock table public.gtl_leagues, public.gtl_memberships in share row exclusive mode;
create table public.gtl_prediction_archives (
  league_id text primary key, state jsonb not null, revision bigint not null,
  archived_at timestamptz not null default now()
);
insert into public.gtl_prediction_archives(league_id,state,revision) select id,state,revision from public.gtl_leagues;
create table public.gtl_weekly_slates (
  season integer not null, week integer not null, signature jsonb not null,
  primary key(season,week)
);
create table public.gtl_weekly_versions (
  user_id uuid not null references auth.users(id) on delete cascade,
  season integer not null, week integer not null, revision bigint not null default 0 check(revision between 0 and 9007199254740990),
  primary key(user_id,season,week), foreign key(season,week) references public.gtl_weekly_slates
);
create index gtl_weekly_versions_slate_idx on public.gtl_weekly_versions(season,week);
create table public.gtl_weekly_ballots (
  user_id uuid not null, season integer not null, week integer not null,
  mode text not null check(mode in ('guess_spread','guess_total')),
  ballot jsonb not null check(jsonb_typeof(ballot)='object'),
  audit jsonb not null default '[]' check(jsonb_typeof(audit)='array'),
  origin_practice boolean not null default false, provenance jsonb not null default '[]',
  primary key(user_id,season,week,mode),
  foreign key(user_id,season,week) references public.gtl_weekly_versions on delete cascade
);
create table public.gtl_weekly_selections (
  user_id uuid not null, season integer not null, week integer not null, game_id text not null,
  selection jsonb not null check(jsonb_typeof(selection)='object'),
  audit jsonb not null default '[]' check(jsonb_typeof(audit)='array'),
  origin_practice boolean not null default false, provenance jsonb not null default '[]',
  primary key(user_id,season,week,game_id),
  foreign key(user_id,season,week) references public.gtl_weekly_versions on delete cascade
);
-- Normalize timestamps and game order, not the picks. A changed deadline or schedule fails closed.
create function public.gtl_weekly_slate(p_state jsonb) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('season',(p_state#>>'{league,season}')::integer,'week',(p_state#>>'{league,week}')::integer,
    'deadline',extract(epoch from (p_state#>>'{league,deadline}')::timestamptz),
    'games',(select jsonb_agg(jsonb_build_object('id',g->>'id','away',g->>'awayCode','home',g->>'homeCode',
      'kickoff',extract(epoch from (g->>'kickoff')::timestamptz)) order by g->>'id') from jsonb_array_elements(p_state->'games') g))
$$;
-- A conflicting meaningful source ballot/selection requires explicit reconciliation, never choosing a later guess.
do $$
declare l record; b record; m record; x record; a jsonb; old jsonb; sig jsonb; s integer; w integer; u uuid;
begin
  for l in select * from public.gtl_leagues order by id loop
    s := (l.state#>>'{league,season}')::integer; w := (l.state#>>'{league,week}')::integer;
    sig := public.gtl_weekly_slate(l.state);
    if s is null or w is null or sig->'deadline'='null'::jsonb or jsonb_array_length(sig->'games')<1 or
      exists(select 1 from jsonb_array_elements(sig->'games') g where g->>'id' is null or g->>'away' is null or g->>'home' is null or g->>'kickoff' is null) or
      (select count(*)<>count(distinct g->>'id') from jsonb_array_elements(sig->'games') g) then raise exception 'GTL_SLATE_INVALID'; end if;
    insert into public.gtl_weekly_slates values(s,w,sig) on conflict do nothing;
    if (select signature from public.gtl_weekly_slates where season=s and week=w)<>sig then raise exception 'GTL_SLATE_CONFLICT'; end if;
    for b in select key player,value modes from jsonb_each(l.state->'ballots') loop
      for m in select key mode,value ballot from jsonb_each(b.modes) loop
        select coalesce(jsonb_agg(e order by n),'[]') into a from jsonb_array_elements(l.state->'audit') with ordinality q(e,n) where e->>'player'=b.player and e->>'mode'=m.mode;
        if coalesce(m.ballot->'picks','{}')='{}'::jsonb and coalesce(m.ballot->>'submittedAt','')='' and a='[]'::jsonb then continue; end if;
        select user_id into u from public.gtl_memberships where league_id=l.id and player_id=b.player;
        if u is null then raise exception 'GTL_UNMAPPED_LEGACY_ENTRY'; end if;
        insert into public.gtl_weekly_versions(user_id,season,week) values(u,s,w) on conflict do nothing;
        select ballot into old from public.gtl_weekly_ballots where user_id=u and season=s and week=w and mode=m.mode;
        if old is not null and old<>m.ballot then raise exception 'GTL_WEEKLY_BACKFILL_CONFLICT'; end if;
        insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot,audit,origin_practice,provenance)
          values(u,s,w,m.mode,m.ballot,a,l.practice,jsonb_build_array(jsonb_build_object('leagueId',l.id,'playerId',b.player,'migration',true)))
          on conflict(user_id,season,week,mode) do update set audit=public.gtl_weekly_ballots.audit||excluded.audit,
            origin_practice=public.gtl_weekly_ballots.origin_practice or excluded.origin_practice,
            provenance=public.gtl_weekly_ballots.provenance||excluded.provenance;
      end loop;
    end loop;
    for b in select key player,value selections from jsonb_each(l.state->'bets') loop
      for x in select key game,value selection from jsonb_each(b.selections) loop
        select user_id into u from public.gtl_memberships where league_id=l.id and player_id=b.player;
        if u is null then raise exception 'GTL_UNMAPPED_LEGACY_ENTRY'; end if;
        select coalesce(jsonb_agg(e order by n),'[]') into a from jsonb_array_elements(l.state->'audit') with ordinality q(e,n)
          where e->>'player'=b.player and e->>'mode'='betting_challenge' and e#>>'{after,gameId}'=x.game;
        insert into public.gtl_weekly_versions(user_id,season,week) values(u,s,w) on conflict do nothing;
        select selection into old from public.gtl_weekly_selections where user_id=u and season=s and week=w and game_id=x.game;
        if old is not null and old<>x.selection then raise exception 'GTL_WEEKLY_BACKFILL_CONFLICT'; end if;
        insert into public.gtl_weekly_selections(user_id,season,week,game_id,selection,audit,origin_practice,provenance)
          values(u,s,w,x.game,x.selection,a,l.practice,jsonb_build_array(jsonb_build_object('leagueId',l.id,'playerId',b.player,'migration',true)))
          on conflict(user_id,season,week,game_id) do update set audit=public.gtl_weekly_selections.audit||excluded.audit,
            origin_practice=public.gtl_weekly_selections.origin_practice or excluded.origin_practice,
            provenance=public.gtl_weekly_selections.provenance||excluded.provenance;
      end loop;
    end loop;
  end loop;
end $$;
-- Prior practice exposure follows a matching imported selection too.
update public.gtl_weekly_selections x set origin_practice=true
from public.gtl_weekly_ballots b where b.user_id=x.user_id and b.season=x.season and b.week=x.week
  and b.mode=case when x.selection->>'market'='total' then 'guess_total' else 'guess_spread' end and b.origin_practice;

-- League then membership then weekly-version lock order; no external calls in the transaction.
create function public.gtl_weekly_context(p_user uuid,p_league text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare l public.gtl_leagues; m public.gtl_memberships; sig jsonb;
begin
  -- Do not read private league state until membership is established.
  if not exists(select 1 from public.gtl_memberships where user_id=p_user and league_id=p_league and active) then raise exception 'GTL_FORBIDDEN'; end if;
  select * into l from public.gtl_leagues where id=p_league for share;
  select * into m from public.gtl_memberships where user_id=p_user and league_id=p_league and active for share;
  if m.user_id is null or l.id is null or not exists(select 1 from jsonb_array_elements(l.state#>'{league,roster}') r where r->>'id'=m.player_id) then raise exception 'GTL_FORBIDDEN'; end if;
  sig := public.gtl_weekly_slate(l.state);
  if not exists(select 1 from public.gtl_weekly_slates where season=(sig->>'season')::integer and week=(sig->>'week')::integer and signature=sig) then raise exception 'GTL_SLATE_CONFLICT'; end if;
  return jsonb_build_object('state',l.state,'leagueRevision',l.revision,'playerId',m.player_id,'practice',l.practice,'season',sig->'season','week',sig->'week');
end $$;

create function public.gtl_read_weekly_state(p_user uuid,p_league text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; s integer; w integer; result jsonb;
begin
  c:=public.gtl_weekly_context(p_user,p_league); s:=(c->>'season')::integer; w:=(c->>'week')::integer;
  -- One statement snapshot keeps revision, ballot, and selection reads coherent.
  with members as (select user_id,player_id from public.gtl_memberships where league_id=p_league and active and exists(select 1 from jsonb_array_elements(c#>'{state,league,roster}') r where r->>'id'=player_id)),
  bs as (select m.player_id,b.* from members m join public.gtl_weekly_ballots b on b.user_id=m.user_id and b.season=s and b.week=w),
  xs as (select m.player_id,x.* from members m join public.gtl_weekly_selections x on x.user_id=m.user_id and x.season=s and x.week=w),
  ba as (select player_id,jsonb_object_agg(mode,case when user_id=p_user then ballot else jsonb_build_object('picks',ballot->'picks','submittedAt',ballot->'submittedAt') end) value from bs group by player_id),
  xa as (select player_id,jsonb_object_agg(game_id,selection) value from xs group by player_id),
  events as (select e from bs cross join lateral jsonb_array_elements(audit) e where user_id=p_user union all select e from xs cross join lateral jsonb_array_elements(audit) e where user_id=p_user)
  select jsonb_build_object('state',
    jsonb_set(jsonb_set(jsonb_set(jsonb_set(c->'state','{ballots}',coalesce((select jsonb_object_agg(player_id,value) from ba),'{}')),
    '{bets}',coalesce((select jsonb_object_agg(player_id,value) from xa),'{}')),
    '{audit}',coalesce((select jsonb_agg(e||jsonb_build_object('player',c->>'playerId') order by e->>'timestamp',e->>'id') from events),'[]')),
    '{league,roster}',coalesce((select jsonb_agg(r order by n) from jsonb_array_elements(c#>'{state,league,roster}') with ordinality q(r,n) where exists(select 1 from members where player_id=r->>'id') or not exists(select 1 from public.gtl_memberships where league_id=p_league and player_id=r->>'id')),'[]')),
    'revision',coalesce((select revision from public.gtl_weekly_versions where user_id=p_user and season=s and week=w),0),
    'leagueRevision',c->'leagueRevision',
    'originPractice',coalesce((select jsonb_object_agg(mode,origin_practice) from bs where user_id=p_user),'{}'),
    'selectionPractice',coalesce((select bool_or(origin_practice) from xs where user_id=p_user),false),
    'selectionEligibility',coalesce((select jsonb_object_agg(player_id,eligible) from (select player_id,not bool_or(origin_practice) eligible from xs group by player_id) q),'{}'),
    'eligibility',coalesce((select jsonb_object_agg(player_id,value) from (select player_id,jsonb_object_agg(mode,not origin_practice) value from bs group by player_id) q),'{}')) into result;
  return result;
end $$;

create function public.gtl_save_weekly_ballot(p_user uuid,p_league text,p_mode text,p_revision bigint,p_picks jsonb,p_submit boolean) returns bigint
language plpgsql security invoker set search_path='' as $$
declare c jsonb; s integer; w integer; rev bigint; b public.gtl_weekly_ballots; entry record; v numeric; stamp timestamptz; next_ballot jsonb; event jsonb;
begin
  c:=public.gtl_weekly_context(p_user,p_league); s:=(c->>'season')::integer; w:=(c->>'week')::integer;
  if p_mode is null or p_mode not in ('guess_spread','guess_total') or p_picks is null or jsonb_typeof(p_picks)<>'object' or p_submit is null then raise exception 'GTL_BALLOT_INVALID'; end if;
  insert into public.gtl_weekly_versions(user_id,season,week) values(p_user,s,w) on conflict do nothing;
  select revision into rev from public.gtl_weekly_versions where user_id=p_user and season=s and week=w for update;
  if p_revision is null or p_revision<>rev then raise exception 'GTL_WEEKLY_CONFLICT'; end if;
  select * into b from public.gtl_weekly_ballots where user_id=p_user and season=s and week=w and mode=p_mode;
  if coalesce(b.ballot->>'submittedAt','')<>'' then raise exception 'GTL_BALLOT_LOCKED'; end if;
  stamp:=clock_timestamp();
  if stamp >= (c#>>'{state,league,deadline}')::timestamptz then raise exception 'GTL_PREDICTION_CLOSED'; end if;
  for entry in select * from jsonb_each(p_picks) loop
    if not exists(select 1 from jsonb_array_elements(c#>'{state,games}') g where g->>'id'=entry.key) or jsonb_typeof(entry.value)<>'number' then raise exception 'GTL_BALLOT_INVALID'; end if;
    v:=entry.value::numeric;
    if v*2<>trunc(v*2) or (p_mode='guess_spread' and (v < -100 or v > 100)) or (p_mode='guess_total' and (v < 0 or v > 200)) then raise exception 'GTL_BALLOT_INVALID'; end if;
  end loop;
  if p_submit and (select count(*) from jsonb_object_keys(p_picks))<>jsonb_array_length(c#>'{state,games}') then raise exception 'GTL_BALLOT_INCOMPLETE'; end if;
  next_ballot:=jsonb_build_object('picks',p_picks,'submittedAt',case when p_submit then to_jsonb(stamp) else 'null'::jsonb end);
  event:=jsonb_build_object('id',gen_random_uuid(),'player',c->>'playerId','mode',p_mode,'type',case when p_submit then 'ballot_submitted' else 'ballot_saved' end,'timestamp',stamp,'before',coalesce(b.ballot->'picks','{}'),'after',p_picks);
  insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot,audit,origin_practice,provenance)
    values(p_user,s,w,p_mode,next_ballot,jsonb_build_array(event),(c->>'practice')::boolean,jsonb_build_array(jsonb_build_object('leagueId',p_league,'playerId',c->>'playerId')))
    on conflict(user_id,season,week,mode) do update set ballot=excluded.ballot,audit=public.gtl_weekly_ballots.audit||excluded.audit,
      origin_practice=public.gtl_weekly_ballots.origin_practice or excluded.origin_practice,provenance=public.gtl_weekly_ballots.provenance||excluded.provenance;
  update public.gtl_weekly_versions set revision=revision+1 where user_id=p_user and season=s and week=w;
  return rev+1;
end $$;

create function public.gtl_save_weekly_selection(p_user uuid,p_league text,p_revision bigint,p_selection jsonb) returns bigint
language plpgsql security invoker set search_path='' as $$
declare c jsonb; s integer; w integer; rev bigint; g jsonb; market text; side text; v numeric; odds numeric; quote timestamptz; stamp timestamptz; value jsonb; event jsonb;
begin
  c:=public.gtl_weekly_context(p_user,p_league); s:=(c->>'season')::integer; w:=(c->>'week')::integer;
  if p_selection is null or jsonb_typeof(p_selection)<>'object' or exists(select 1 from jsonb_object_keys(p_selection) k where k not in ('gameId','market','side','line','odds','source','quotedAt')) then raise exception 'GTL_SELECTION_INVALID'; end if;
  select x into g from jsonb_array_elements(c#>'{state,games}') x where x->>'id'=p_selection->>'gameId';
  market:=p_selection->>'market'; side:=p_selection->>'side';
  if g is null or market is null or side is null or market not in ('spread','total') or (market='spread' and side not in ('home','away')) or (market='total' and side not in ('over','under')) then raise exception 'GTL_SELECTION_INVALID'; end if;
  insert into public.gtl_weekly_versions(user_id,season,week) values(p_user,s,w) on conflict do nothing;
  select revision into rev from public.gtl_weekly_versions where user_id=p_user and season=s and week=w for update;
  if p_revision is null or p_revision<>rev then raise exception 'GTL_WEEKLY_CONFLICT'; end if;
  if exists(select 1 from public.gtl_weekly_selections where user_id=p_user and season=s and week=w and game_id=g->>'id') then raise exception 'GTL_SELECTION_LOCKED'; end if;
  if not exists(select 1 from public.gtl_weekly_ballots where user_id=p_user and season=s and week=w and mode=case when market='total' then 'guess_total' else 'guess_spread' end and coalesce(ballot->>'submittedAt','')<>'') then raise exception 'GTL_MATCHING_BALLOT_REQUIRED'; end if;
  stamp:=clock_timestamp();
  if stamp >= (g->>'kickoff')::timestamptz then raise exception 'GTL_SELECTION_CLOSED'; end if;
  if jsonb_typeof(p_selection->'line') is distinct from 'number' or jsonb_typeof(p_selection->'odds') is distinct from 'number' or jsonb_typeof(p_selection->'source') is distinct from 'string' or jsonb_typeof(p_selection->'quotedAt') is distinct from 'string' then raise exception 'GTL_SELECTION_INVALID'; end if;
  v:=(p_selection->>'line')::numeric; odds:=(p_selection->>'odds')::numeric;
  if v*2<>trunc(v*2) or (market='spread' and (v < -100 or v > 100)) or (market='total' and (v < 0 or v > 200)) or odds<>trunc(odds) or abs(odds)<100 or abs(odds)>10000 or length(btrim(p_selection->>'source'))<2 or length(p_selection->>'source')>120 then raise exception 'GTL_SELECTION_INVALID'; end if;
  begin quote:=(p_selection->>'quotedAt')::timestamptz; exception when others then raise exception 'GTL_SELECTION_INVALID'; end;
  if quote > stamp or quote < stamp-interval '6 hours' or quote >= (g->>'kickoff')::timestamptz then raise exception 'GTL_QUOTE_STALE'; end if;
  value:=p_selection||jsonb_build_object('id',gen_random_uuid(),'source',btrim(p_selection->>'source'),'quotedAt',quote,'selectedAt',stamp,'verification','Manually entered; not independently verified');
  event:=jsonb_build_object('id',gen_random_uuid(),'player',c->>'playerId','mode','betting_challenge','type','selection_recorded','timestamp',stamp,'after',value);
  insert into public.gtl_weekly_selections(user_id,season,week,game_id,selection,audit,origin_practice,provenance)
    values(p_user,s,w,g->>'id',value,jsonb_build_array(event),(c->>'practice')::boolean or (select origin_practice from public.gtl_weekly_ballots where user_id=p_user and season=s and week=w and mode=case when market='total' then 'guess_total' else 'guess_spread' end),jsonb_build_array(jsonb_build_object('leagueId',p_league,'playerId',c->>'playerId')));
  update public.gtl_weekly_versions set revision=revision+1 where user_id=p_user and season=s and week=w;
  return rev+1;
end $$;

alter table public.gtl_prediction_archives enable row level security;
alter table public.gtl_weekly_slates enable row level security;
alter table public.gtl_weekly_versions enable row level security;
alter table public.gtl_weekly_ballots enable row level security;
alter table public.gtl_weekly_selections enable row level security;
revoke all on public.gtl_prediction_archives,public.gtl_weekly_slates,public.gtl_weekly_versions,public.gtl_weekly_ballots,public.gtl_weekly_selections from public,anon,authenticated,service_role;
-- PostgreSQL row locks require UPDATE on at least one column; the active flag is service-only.
grant update(active) on public.gtl_memberships to service_role;
grant select on public.gtl_prediction_archives,public.gtl_weekly_slates to service_role;
grant select,insert,update on public.gtl_weekly_versions,public.gtl_weekly_ballots to service_role;
grant select,insert on public.gtl_weekly_selections to service_role;
revoke all on function public.gtl_weekly_slate(jsonb),public.gtl_weekly_context(uuid,text),public.gtl_read_weekly_state(uuid,text),public.gtl_save_weekly_ballot(uuid,text,text,bigint,jsonb,boolean),public.gtl_save_weekly_selection(uuid,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.gtl_weekly_slate(jsonb),public.gtl_weekly_context(uuid,text),public.gtl_read_weekly_state(uuid,text),public.gtl_save_weekly_ballot(uuid,text,text,bigint,jsonb,boolean),public.gtl_save_weekly_selection(uuid,text,bigint,jsonb) to service_role;

-- Bridge protection: an older deployed handler cannot fork entries between backfill and rollout.
-- Invite acceptance can still update the roster and the league revision.
create function public.gtl_guard_legacy_entries() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.state->'ballots' is distinct from old.state->'ballots' or new.state->'bets' is distinct from old.state->'bets' or new.state->'audit' is distinct from old.state->'audit' then
    raise exception 'GTL_LEGACY_ENTRIES_FROZEN';
  end if;
  return new;
end $$;
create trigger gtl_guard_legacy_entries before update on public.gtl_leagues for each row execute function public.gtl_guard_legacy_entries();
revoke all on function public.gtl_guard_legacy_entries() from public,anon,authenticated;
grant execute on function public.gtl_guard_legacy_entries() to service_role;
