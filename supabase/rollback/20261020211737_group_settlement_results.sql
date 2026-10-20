create or replace function public.gtl_read_reviewed_results(p_user uuid,p_league text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare c jsonb;
begin
  c:=public.gtl_weekly_context(p_user,p_league);
  return jsonb_build_object('season',c->'season','week',c->'week','games',coalesce((
    select jsonb_object_agg(game_id,result) from (select distinct on (e.game_id) e.game_id,e.result
    from public.gtl_reviewed_result_events e where e.season=(c->>'season')::integer and e.week=(c->>'week')::integer
    and exists(select 1 from jsonb_array_elements(c#>'{state,games}') g where g->>'id'=e.game_id)
    order by e.game_id,e.version desc) latest),'{}'));
end $$;
