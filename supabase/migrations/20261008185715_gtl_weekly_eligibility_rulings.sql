-- Preserve original practice provenance and ballots. Explicit rulings are a
-- separate immutable record, entered only after a commissioner decision.
create table public.gtl_weekly_eligibility_rulings (
  user_id uuid not null,
  season integer not null,
  week integer not null,
  mode text not null check (mode in ('guess_spread','guess_total')),
  eligible boolean not null,
  reason text not null check (length(reason) between 10 and 1000),
  approved_by uuid not null references auth.users(id),
  context_league_id text not null references public.gtl_leagues(id),
  recorded_at timestamptz not null default now(),
  evidence jsonb not null check (jsonb_typeof(evidence)='object'),
  primary key(user_id,season,week,mode),
  foreign key(user_id,season,week,mode) references public.gtl_weekly_ballots
);
alter table public.gtl_weekly_eligibility_rulings enable row level security;
revoke all on public.gtl_weekly_eligibility_rulings from public,anon,authenticated,service_role;
-- Runtime can only read a ruling. No browser or gameplay route can create one.
grant select on public.gtl_weekly_eligibility_rulings to service_role;

create or replace function public.gtl_read_weekly_state(p_user uuid,p_league text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; s integer; w integer; result jsonb;
begin
  c:=public.gtl_weekly_context(p_user,p_league); s:=(c->>'season')::integer; w:=(c->>'week')::integer;
  -- One statement snapshot keeps revision, ballot, and selection reads coherent.
  with members as (select user_id,player_id from public.gtl_memberships where league_id=p_league and active and exists(select 1 from jsonb_array_elements(c#>'{state,league,roster}') r where r->>'id'=player_id)),
  bs as (select m.player_id,b.* from members m join public.gtl_weekly_ballots b on b.user_id=m.user_id and b.season=s and b.week=w),
  xs as (select m.player_id,x.* from members m join public.gtl_weekly_selections x on x.user_id=m.user_id and x.season=s and x.week=w),
  rs as (select m.player_id,r.* from members m join public.gtl_weekly_eligibility_rulings r on r.user_id=m.user_id and r.season=s and r.week=w),
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
    'ownEligibilityRulings',coalesce((select jsonb_object_agg(mode,jsonb_build_object('eligible',eligible,'reason',reason,'recordedAt',recorded_at)) from rs where user_id=p_user),'{}'),
    'eligibilityRulings',coalesce((select jsonb_object_agg(player_id,value) from (select player_id,jsonb_object_agg(mode,jsonb_build_object('eligible',eligible,'reason',reason,'recordedAt',recorded_at)) value from rs group by player_id) q),'{}'),
    'originPractice',coalesce((select jsonb_object_agg(mode,origin_practice) from bs where user_id=p_user),'{}'),
    'selectionPractice',coalesce((select bool_or(origin_practice) from xs where user_id=p_user),false),
    'selectionEligibility',coalesce((select jsonb_object_agg(player_id,eligible) from (select player_id,not bool_or(origin_practice) eligible from xs group by player_id) q),'{}'),
    'eligibility',coalesce((select jsonb_object_agg(player_id,value) from (select player_id,jsonb_object_agg(mode,coalesce((select eligible from rs where rs.player_id=bs.player_id and rs.mode=bs.mode),not origin_practice)) value from bs group by player_id) q),'{}')) into result;
  return result;
end $$;
