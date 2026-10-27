-- Read-only dry run for M-23 (20261026133000_gtl_kickoff_posts.sql, redesign build plan stage 63). Run it in the SQL editor
-- before "apply M-23": it lists, for the newest published week, the exact kickoff posts the migration's one-time backfill
-- writes (one per kickoff time slot, dated at its kickoff, as the week's publisher), and whether each already exists. It
-- writes nothing and needs none of M-23's functions. After the apply, the same query shows every row with exists = true.
with week as (
  select z.season,z.week,z.signature from public.gtl_weekly_slates z order by z.season desc,z.week desc limit 1
), actor as (
  select coalesce(
    (select p.actor_id from public.gtl_feed_posts p, week where p.dedupe_key=format('week:%s:%s',week.season,week.week)),
    (select m.user_id from public.gtl_memberships m where m.league_id='sean-troy-luke' and m.role='commissioner' and m.active order by m.created_at limit 1)
  ) actor_id
), slots as (
  select week.season,week.week,to_timestamp((g->>'kickoff')::numeric) kickoff,jsonb_agg(g->>'id' order by g->>'id') games
  from week cross join lateral jsonb_array_elements(week.signature->'games') g
  where jsonb_typeof(g->'kickoff')='number' and coalesce(g->>'id','')<>''
  group by week.season,week.week,3
)
select slots.season,slots.week,slots.kickoff,slots.games,actor.actor_id,
  format('kickoff:%s:%s:%s',slots.season,slots.week,extract(epoch from slots.kickoff)::bigint) dedupe_key,
  exists(select 1 from public.gtl_feed_posts p where p.dedupe_key=format('kickoff:%s:%s:%s',slots.season,slots.week,extract(epoch from slots.kickoff)::bigint)) "exists"
from slots cross join actor
order by slots.kickoff;
