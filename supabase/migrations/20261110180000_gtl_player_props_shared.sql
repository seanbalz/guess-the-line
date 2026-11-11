-- D-82 Player Props: everyone's locked prop guesses, opened under the existing reveal rules (D-31 as amended by D-39).
-- Spec: docs/superpowers/specs/2026-11-09-player-props-design.md ("opponent guesses still need the existing
-- owner/exact-selection lock-in/kickoff reveal protections"). Requires 20261110130000_gtl_player_props.sql.
-- Additive only: one new service-only reader. No table, row, grant or existing function changes.
--
-- NOT APPLIED. Applying it needs its own reviewed apply instruction from Sean after 20261110130000, a fresh hosted
-- preflight and the privacy/grant checks. Until it is applied gtl-api's /props/shared answers "not available" (PostgREST
-- PGRST202) and nothing else changes; old clients never call it.
--
-- Another member's prop guess is returned only when ALL of these hold:
--   - it is locked in (a draft is never returned, nor told apart from no guess);
--   - the viewer has locked in that exact selection (event, stable player ID and canonical stat), or that event has
--     kicked off. A different stat for the same athlete is a different selection and stays closed.
-- Only the guess value, its lock-in time and the member's display name are returned: no saved reference, latest line,
-- quote, draft or audit row of anyone. A removed member's locked guess stays listed and is labelled (D-23).

create or replace function public.gtl_props_shared(p_user uuid,p_season integer,p_week integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare now_at timestamptz:=clock_timestamp();
begin
  if not public.gtl_community_member(p_user) then raise exception 'GTL_COMMUNITY_MEMBER'; end if;
  if p_season is null or p_week is null or p_season not between 2000 and 2200 or p_week not between 1 and 22 then raise exception 'GTL_PROPS_INVALID'; end if;
  return jsonb_build_object('viewer',p_user,'season',p_season,'week',p_week,'now',now_at,
    'selections',coalesce((select jsonb_agg(jsonb_build_object('eventId',s.event_id,'playerId',s.player_id,'stat',s.stat,
        'playerName',s.player_name,'team',s.team,'position',s.position,'away',s.away,'home',s.home,'kickoff',s.kickoff,
        'started',s.started,'ownLocked',s.own_locked,
        'rows',coalesce((select jsonb_agg(jsonb_build_object('userId',g.user_id,'displayName',p.display_name,
            'removed',exists(select 1 from public.gtl_community_removals r where r.user_id=g.user_id),
            'guess',g.guess,'lockedAt',g.locked_at) order by g.locked_at,g.user_id)
          from public.gtl_prop_guesses g left join public.gtl_profiles p on p.user_id=g.user_id
          where g.event_id=s.event_id and g.player_id=s.player_id and g.stat=s.stat and g.status='locked' and g.user_id<>p_user),'[]'::jsonb))
        order by s.kickoff,s.event_id,s.player_name,s.player_id,s.stat)
      from (select o.event_id,o.player_id,o.stat,o.player_name,o.team,o.position,o.away,o.home,o.kickoff,now_at>=o.kickoff started,
              exists(select 1 from public.gtl_prop_guesses m where m.user_id=p_user and m.event_id=o.event_id and m.player_id=o.player_id
                and m.stat=o.stat and m.status='locked') own_locked
            from public.gtl_prop_offers o where o.season=p_season and o.week=p_week) s
      -- Open to this viewer, and worth listing: their own lock (even with no one else in yet) or someone else's lock.
      where (s.own_locked or s.started)
        and (s.own_locked or exists(select 1 from public.gtl_prop_guesses x where x.event_id=s.event_id and x.player_id=s.player_id
          and x.stat=s.stat and x.status='locked' and x.user_id<>p_user))),'[]'::jsonb));
end $$;

revoke all on function public.gtl_props_shared(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.gtl_props_shared(uuid,integer,integer) to service_role;

comment on function public.gtl_props_shared(uuid,integer,integer) is 'D-82: other members'' locked prop guesses, only for selections the viewer locked in or whose event kicked off. Values and names only; never drafts, references or lines.';
