-- M-23 kickoff_posts (redesign build plan stage 63; D-35 social ruling: automatic posts; D-23). Local implementation only:
-- applying it to the hosted project is Sean's "apply M-23" (Gate M). High risk (it writes rows), alone, fix forward (Gate
-- M step 9): no rollback file, listed in FIX_FORWARD (tests/migrations.mjs). Apply after M-13 (the `kickoff` kind), M-21
-- (the old reader lists only the kinds the old app draws, so a kickoff post never shortens its pages) and M-22 (the new
-- feed reader draws kickoff posts and accepts comments on them only from their kickoff); M-01 is hosted.
--
-- What it does:
--   * gtl_kickoff_slots(season, week): a published week's time slots: each distinct kickoff instant and its games.
--   * gtl_write_kickoff_posts(season, week, actor): one `kickoff` post per slot, dated at its kickoff (created_at), so every
--     reader lists it only once that time has passed (gtl_read_community and gtl_read_league_feed list posts at or before
--     their clock). Payload { kickoff, games: [gameIds] }; no pick, line or name. Idempotent by dedupe_key
--     `kickoff:<season>:<week>:<epoch seconds>`: a rerun inserts nothing. Returns how many it wrote.
--   * gtl_feed_on_slate, an AFTER INSERT trigger on gtl_feed_posts for a `week_published` post: publishing a week
--     (gtl_publish_week, by hand or from the D-24 gtl-week-open job) writes that week's kickoff posts in the same
--     transaction, as the week's publisher, the actor of its week_published post (the app shows "Guess The Line" and the
--     monogram for both). An error never aborts the publish: the trigger catches it and writes one gtl_access_audit row,
--     `kickoff_posts_failed:<season>:<week>:<sqlstate>` (and swallows a failure of that write too).
--   * A one-time backfill for the newest published week: its kickoff posts as its week_published post's actor (or the
--     founding league's active commissioner when that post is missing). Idempotent by the same dedupe_key.
--
-- No existing row is updated or deleted. Dry run first: supabase/admin/kickoff_posts_dry_run.sql (read only) lists the exact
-- posts the backfill writes and which already exist. Off switch: none in code; the posts are rows (D-23 keeps them). To stop
-- new ones, Sean may approve `alter table public.gtl_feed_posts disable trigger gtl_feed_on_slate` (a hosted change that drops
-- nothing). Rerunnable: functions are create or replace, the trigger is create or replace, grants are restated.

create or replace function public.gtl_kickoff_slots(p_season integer,p_week integer)
returns table(kickoff timestamptz,games jsonb)
language sql stable security invoker set search_path='' as $$
  select to_timestamp((g->>'kickoff')::numeric),jsonb_agg(g->>'id' order by g->>'id')
  from public.gtl_weekly_slates s cross join lateral jsonb_array_elements(case when jsonb_typeof(s.signature->'games')='array' then s.signature->'games' else '[]'::jsonb end) g
  where s.season=p_season and s.week=p_week and jsonb_typeof(g->'kickoff')='number' and coalesce(g->>'id','')<>''
  group by 1 order by 1
$$;

create or replace function public.gtl_write_kickoff_posts(p_season integer,p_week integer,p_actor uuid) returns integer
language plpgsql security invoker set search_path='' as $$
declare written integer;
begin
  if p_season is null or p_week is null or p_actor is null or not exists(select 1 from public.gtl_profiles where user_id=p_actor) then return 0; end if;
  with ins as (
    insert into public.gtl_feed_posts(actor_id,kind,season,week,payload,dedupe_key,created_at)
      select p_actor,'kickoff',p_season,p_week,jsonb_build_object('kickoff',to_jsonb(s.kickoff),'games',s.games),
        format('kickoff:%s:%s:%s',p_season,p_week,extract(epoch from s.kickoff)::bigint),s.kickoff
      from public.gtl_kickoff_slots(p_season,p_week) s
      on conflict (dedupe_key) do nothing returning 1)
  select count(*) into written from ins;
  return written;
end $$;

create or replace function public.gtl_feed_on_slate() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  begin
    perform public.gtl_write_kickoff_posts(new.season,new.week,new.actor_id);
  exception when others then
    begin
      insert into public.gtl_access_audit(actor_id,event) values(new.actor_id,format('kickoff_posts_failed:%s:%s:%s',new.season,new.week,sqlstate));
    exception when others then null;
    end;
  end;
  return null;
end $$;
create or replace trigger gtl_feed_on_slate after insert on public.gtl_feed_posts
  for each row when (new.kind='week_published') execute function public.gtl_feed_on_slate();

revoke all on function public.gtl_kickoff_slots(integer,integer),public.gtl_write_kickoff_posts(integer,integer,uuid),public.gtl_feed_on_slate()
  from public,anon,authenticated;
grant execute on function public.gtl_kickoff_slots(integer,integer),public.gtl_write_kickoff_posts(integer,integer,uuid) to service_role;

-- The one-time backfill: the newest published week, as its publisher.
do $$
declare s integer; w integer; actor uuid;
begin
  select z.season,z.week into s,w from public.gtl_weekly_slates z order by z.season desc,z.week desc limit 1;
  if s is null then return; end if;
  select p.actor_id into actor from public.gtl_feed_posts p where p.dedupe_key=format('week:%s:%s',s,w);
  if actor is null then
    select m.user_id into actor from public.gtl_memberships m where m.league_id='sean-troy-luke' and m.role='commissioner' and m.active order by m.created_at limit 1;
  end if;
  perform public.gtl_write_kickoff_posts(s,w,actor);
end $$;
