-- M-19 / D-64 (proposed — needs Sean): one-time settlement of the shared Bet Tracker tickets still pending from
-- Week 7 and earlier. Paste into the Supabase SQL editor AFTER 20261028120000_gtl_social_auto_settle.sql is applied.
-- Parts 1–3 only read. Part 4 writes, and is commented out until you have read the preview.
-- After this, the gtl-results-refresh worker (every 30 minutes) settles new tickets on its own once the game's
-- Pacific day has ended; this backfill is the same function the worker calls, run once by hand.

-- 1. Read-only preview: every pending shared ticket, by week, and what it would settle to right now.
--    status: settle (outcome win/loss/push/void) | waiting (no_final, postponed, before_day_end) | manual (parlay, prop, ...)
--    reopened = the owner reported a result and later set it back to pending; left alone.
select e.season,e.week,
  g->>'status' status,coalesce(g->>'outcome',g->>'reason') would_be,
  bool_or(exists(select 1 from jsonb_array_elements(w.state->'audit') a
    where a->>'entryId'=e.entry->>'id' and a->>'action'='settle' and a->>'actorId'=e.entry->>'ownerId')) any_reopened,
  count(*) tickets,
  sum((g->>'netUnits')::numeric) net_units
from public.gtl_social_weeks w
cross join lateral (select w.season,w.week,x entry from jsonb_array_elements(w.state->'entries') x where x->>'outcome'='pending') e
cross join lateral (select public.gtl_social_auto_grade(e.season,e.week,e.entry,now()) g) graded
group by 1,2,3,4 order by 1,2,3,4;

-- 2. Read-only: the same function the worker calls, as a dry run (writes nothing). Check settled/voided/needsManual.
select public.gtl_settle_social_pending(p_season=>2026,p_week=>null,p_now=>null,p_dry_run=>true);

-- 3. Read-only: the other places a pending bet can sit. Virtual Units / recommended picks (gtl_virtual_units_picks)
--    already settle on every worker run from the same finals; a non-zero "behind_final" here means the worker is not
--    running (check gtl_results_refresh_runs). NBA tickets have no verified final feed and stay owner-settled.
select 'virtual_units' kind,p.season,p.week,count(*) pending,
  count(*) filter(where exists(select 1 from public.gtl_virtual_units_settlements s
    where s.season=p.season and s.week=p.week and s.game_id=p.game_id and s.status<>'postponed')) behind_final
from public.gtl_virtual_units_picks p where p.status='pending' group by 1,2,3
union all
select 'nba',null,null,count(*),null from nba_private.bets where outcome='pending'
order by 1,2,3;
select status,reason,count(*),max(finished_at) last_finished from public.gtl_results_refresh_runs
where created_at>now()-interval '2 days' group by 1,2 order by 4 desc nulls last;

-- 4. WRITE (once, after reading 1–3): settle every eligible pending ticket of the season. Safe to repeat: a second
--    run changes nothing. Its reply lists the counts and each changed ticket.
-- select public.gtl_settle_social_pending(p_season=>2026,p_week=>null,p_now=>null,p_dry_run=>false);

-- 5. Read-only check afterwards: the preview in part 1 should show only waiting/manual rows.
-- Rollback: there is no bulk undo by design (every change is in each week's audit with its before/after entry).
-- A tracked ticket's owner can report a different result in Bet Tracker, which the automatic path never overrides.
