-- Include versioned automatic finals in the existing member-only private group read.
create or replace function public.gtl_read_reviewed_results(p_user uuid,p_league text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare c jsonb;
begin
 c:=public.gtl_weekly_context(p_user,p_league);
 return jsonb_build_object('season',c->'season','week',c->'week','games',coalesce((
  with candidates as (
   select e.game_id,e.result,e.reviewed_at stamp from public.gtl_reviewed_result_events e
    where e.season=(c->>'season')::integer and e.week=(c->>'week')::integer
   union all
   select s.game_id,jsonb_build_object('status',s.status,'home',s.home,'away',s.away,'version',s.version,
    'reviewType','settlement','homeTeam',g->>'home','awayTeam',g->>'away','scheduledKickoff',g->>'kickoff',
    'source',s.source,'sourceURL',s.source_url,'observedAt',s.observed_at,'reviewedAt',s.settled_at),s.settled_at
   from public.gtl_virtual_units_settlements s
   join lateral jsonb_array_elements(c#>'{state,games}') g on g->>'id'=s.game_id
   where s.season=(c->>'season')::integer and s.week=(c->>'week')::integer
  ), latest as (
   select distinct on(game_id) game_id,result from candidates
   where exists(select 1 from jsonb_array_elements(c#>'{state,games}') g where g->>'id'=game_id)
   order by game_id,stamp desc,(result->>'version')::integer desc
  ) select jsonb_object_agg(game_id,result) from latest),'{}'));
end $$;
