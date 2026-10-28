# Automatic bet settlement release card — October 28, 2026

Sean (October 28, 2026): "make sure that all pending bets are settled after the day that the game completes. There are
still pending bets from week 7." Rule: [D-64, approved by Sean October 28](DECISIONS.md). Behavior:
[SOCIAL_BET_TRACKER.md](SOCIAL_BET_TRACKER.md#automatic-settlement-m-19-d-64-proposed--october-28-2026).

**Status: live October 28, 2026.** Sean applied the migration and ran the backfill in the SQL editor; `results-refresh` readiness 40709474510 and deploy 40715129842 succeeded from `42329566` (migration history `1c376874…`, boundary 380/380 denied).

## What changes

| Component | Change | Compatibility |
| --- | --- | --- |
| Migration `20261028120000_gtl_social_auto_settle.sql` (M-19, shared tickets) | Adds `gtl_social_auto_grade` and `gtl_settle_social_pending`, service-only. Replaces no function, alters no table. | Additive. The deployed API and Pages are unaffected. |
| `gtl-results-refresh` worker | After storing finals, calls `gtl_settle_social_pending` for the claimed season. | A 404 (migration not applied) is a no-op, so either order works; apply first is preferred. |
| Release workflow | New `results-refresh` target (deploys only `gtl-results-refresh`, an update: it exists since October 20). | Mirrors `league-features`. |
| Frontend (optional) | Bet Tracker labels a system settlement "Settled automatically from the verified final score". | Without it the label reads `automatic_final`. Ships with the next frontend release. |

## Hosted steps (Sean)

1. **Merge** the PR after CI passes on `main`.
2. **Apply M-19** in the Supabase SQL editor: paste all of
   `supabase/migrations/20261028120000_gtl_social_auto_settle.sql`. Check:
   ```sql
   select proname,prosecdef,proconfig from pg_proc where proname in ('gtl_social_auto_grade','gtl_settle_social_pending');
   select has_function_privilege('authenticated','public.gtl_settle_social_pending(integer,integer,timestamptz,boolean)','EXECUTE'); -- false
   ```
3. **Preview the backlog** (read-only): parts 1–3 of `supabase/admin/settle_pending_backfill.sql`. Part 1 lists every
   pending shared ticket by week with what it would settle to; part 2 is the worker's own dry run.
4. **Settle the backlog** (one write, Week 7 and earlier): uncomment and run part 4,
   ```sql
   select public.gtl_settle_social_pending(p_season=>2026,p_week=>null,p_now=>null,p_dry_run=>false);
   ```
   Rerun part 1: only `waiting` and `manual` rows remain. Rerunning part 4 changes nothing.
5. **Deploy the worker**: Shared production release, target `results-refresh`, mode `readiness` then `deploy` with the
   merged SHA and this card. After its next `:05`/`:35` run, check `gtl_results_refresh_runs` shows `succeeded`.

Rollback: redeploy the previous `gtl-results-refresh` bundle (or leave it: without the function it is a no-op). No bulk
undo of settlements by design. Each one is in the week's audit with its before/after entry, and a tracked ticket's
owner can report a different result. `drop function public.gtl_settle_social_pending(integer,integer,timestamptz,boolean),
public.gtl_social_auto_grade(integer,integer,jsonb,timestamptz);` removes the functions and keeps the settled tickets.

## Still manual

Parlays, player props, any leg whose game is not on its week's published slate, and NBA tickets (no verified final
feed). A ticket its owner reported and then reopened stays as the owner left it.
