# Migration apply packet — M-49 NBA N2 slate and lines (November 12, 2026)

Owner: Sean Balsiger. Version 2, prepared on branch `claude/nba-n2-2026-11-12` (based on `main` at
`acbe8406`, with `main` merged in through `6a3e02e9`; PR #558). Version 2 adds the NFL hour (D-85
item 7, Sean: "Yes, avoid that hour"), so the file's hashes and five function md5s changed. Spec: [NBA build-out, N2](superpowers/specs/2026-11-10-nba-buildout-design.md#n2-slate-and-capped-spread-lines-server-only-players-see-nothing).
Credit rule: [D-85](DECISIONS.md) item 3.

Status, November 12, 2026 UTC: **applied, deployed, and slate on.** Sean said "Yes, all three"
(November 11 Pacific). PR #558 merged as `2345d78f`. M-49 is hosted as `20261112055355` (SQL
editor, about 05:53 UTC; history 87 rows, digest `d0bcee51…`). `gtl-nba-jobs` v1 is deployed (run
43169209526 from `635e15cc`). The `slate` schedule row is enabled and `lines` is disabled
([release record](RELEASE_2026_11_12_NBA_N2_M49.md)). In section 6, steps 1 to 3 are done (step 1's
records are that PR; its `check:cloud --strict` is not run). Step 4 has `slate` enabled, with its
first run due 17:00 UTC November 12. Steps 5 and 6 are open. The rest of this packet is the
preparation as written.

Original status: **preparation only. Nothing here has been run against the hosted project.** The file is
written and tested on local PGlite only. Applying it needs your own "apply M-49", after the PR is
reviewed and merged with green CI, and a fresh read-only preflight in the same session. This
packet authorizes no apply, deploy, secret, schedule change or provider call.

Evidence tags: **executed** (run and observed), **inspected** (read in source), **assumed** (not
checked).

## 1. What it is

| Ledger | File (repo version) | Bytes | SHA-256 | md5 | Replaces | Rollback file |
| --- | --- | ---: | --- | --- | --- | --- |
| **M-49** | `20261112040000_gtl_nba_slate_lines.sql` | 59001 | `098728669080f731111c55aac8414d521bd5fb97c5987c39f61f636949d4efe0` | `0f2472c60227979ec188aaa625d2517c` | nothing | `supabase/rollback/20261112040000_gtl_nba_slate_lines.sql` (1255 bytes, SHA-256 `87b8a11abc4302ae882e900e64a11b30ad90e1ce6401c57e319edd3ed48eca08`, md5 `addaa0f67d939aab3d0796a66c9aa05e`) |

Hashes are of the branch files after the NFL-hour change (executed: `wc -c`, `sha256sum`,
`md5sum`). Version 1's values (53918 bytes, SHA-256 `123ef95e…6ef7`) are superseded. Recompute them
from the exact merged SHA before you apply. If a review changes the file, these values change too.

**Why M-49, not M-48.** The spec assumed M-48. Open PR #555 already names its
`20261112031000_gtl_player_props_refresh.sql` as M-48 (inspected), so this file takes M-49 and a
later timestamp, and filename order matches ledger order. The two files share no table or function:
M-48 replaces `gtl_begin_research_quotes`; M-49 replaces nothing (inspected). Either may be applied
first.

**What it adds.** Nothing existing changes.

- `gtl_nba_games`: one row per BALLDONTLIE game, with both providers' start times, the Odds API
  event it is linked to, the lock (the earlier start time), status and scores.
- Append-only `gtl_nba_game_observations`, `gtl_nba_slate_reads` and `gtl_nba_lines`.
- `gtl_nba_line_attempts`: each lines read's 1-credit reservation, or why NBA was refused.
- One-row `gtl_nba_budget`: cap 31 (cannot be raised), pause below 100 (cannot be lowered), an
  NBA-only pause.
- `gtl_nba_jobs_schedule` and `gtl_nba_job_runs`: the M-30 one-run capability pattern. The file
  creates no schedule row.
- Functions: `gtl_dispatch_nba_jobs` (cron only), `gtl_nba_claim_job`, `gtl_nba_finish_job`,
  `gtl_nba_publish_slate`, `gtl_nba_lines_due`, `gtl_nba_begin_lines_read`,
  `gtl_nba_finish_lines_read`, `gtl_nba_shadow_gate`, helpers `gtl_nba_lines_plan`,
  `gtl_nba_month_spent` and `gtl_nba_nfl_clear`, and three trigger functions.
- **The NFL hour (D-85 item 7).** NBA's lines read, the first and its one retry, never begins
  inside [K − 60 min, K) for any published NFL kickoff K.
  - A planned time inside a window moves earlier, so that a whole five-minute cron slot ends before
    the window opens.
  - A read that reaches a window anyway is refused as `nfl_window`: 0 credits, no lease. It runs
    after the window if a time before the NBA lock is clear; otherwise the refusal is recorded as
    the attempt.
  - Kickoffs are read from `gtl_weekly_slates`, the published NFL weeks that the NFL save and odds
    paths use (epoch seconds in `signature->'games'`).
  - A week not yet published (the Monday open, the off-season) has no window; NFL has nothing to
    collect for it either. A published week never changes (`GTL_SLATE_CONFLICT`), so a kickoff
    moved after publication keeps its published window.

It reads the hosted `gtl_odds_budget` row (schema unchanged), `gtl_weekly_slates` for the NFL hour
and, for the shadow gate only, `gtl_odds_refresh_runs` and `gtl_epl_job_runs`. It writes the shared budget row only from its own
reserve and finish functions, the same way the NFL and EPL collectors do.

**Dependencies.** Hosted already (inspected in `tests/migrations.mjs` `APPLIED`):
`20261008182836` (`gtl_weekly_slates`), `20261008185738` (`gtl_odds_budget`), `20261008200926` (`gtl_odds_refresh_runs`), `20261028190000`
M-30 (`gtl_epl_job_runs`), `20261021201054` and `20261021223100` (the NBA lease
`gtl_nba_claim_games` / `gtl_nba_finish_games` the worker uses). It needs no unapplied file, so it
has no `REQUIRES` entry.

**Risk.** Low for players: no player table, no route, no screen. It touches the shared Odds API
budget row only when the lines job runs, which stays disabled until you enable it separately.

## 2. Preflight (read-only, same session, immediately before)

```sql
begin transaction read only;
set local statement_timeout = '15s';
select clock_timestamp() as observed_at,
  (select count(*) from supabase_migrations.schema_migrations) as history_rows,
  (select max(version) from supabase_migrations.schema_migrations) as newest_version;
-- Not half-applied: expect 0 rows and all nulls.
select version, name from supabase_migrations.schema_migrations where name like '%nba_slate_lines%';
select to_regclass('public.gtl_nba_games'), to_regclass('public.gtl_nba_lines'), to_regclass('public.gtl_nba_line_attempts'),
       to_regclass('public.gtl_nba_budget'), to_regclass('public.gtl_nba_jobs_schedule'), to_regclass('public.gtl_nba_job_runs'),
       to_regclass('public.gtl_nba_game_observations'), to_regclass('public.gtl_nba_slate_reads');
select proname from pg_proc where pronamespace='public'::regnamespace
  and (proname like 'gtl_nba_%' or proname like 'gtl_dispatch_nba%') order by 1;
  -- expect exactly the four hosted NBA functions: gtl_nba_claim_games, gtl_nba_finish_games, gtl_nba_read_bets, gtl_nba_save_bet
-- The shared budget row and the columns M-49 reads (no values beyond counts and state).
select conservative_remaining, paused, lease_token is not null as leased, lease_until, updated_at
  from public.gtl_odds_budget where provider='the-odds-api';
select table_name, count(*) from information_schema.columns where table_schema='public'
  and ((table_name='gtl_odds_budget' and column_name in ('conservative_remaining','observed_remaining','observed_used','observed_last','observed_at','paused','lease_token','lease_until','updated_at'))
    or (table_name='gtl_odds_refresh_runs' and column_name in ('reason','created_at','claimed_at','finished_at'))
    or (table_name='gtl_epl_job_runs' and column_name in ('reason','started_at','claimed_at','finished_at'))
    or (table_name='gtl_weekly_slates' and column_name in ('season','week','signature')))
  group by 1 order by 1;   -- expect gtl_epl_job_runs 4, gtl_odds_budget 9, gtl_odds_refresh_runs 4, gtl_weekly_slates 3
-- The NFL hour reads each published week's kickoffs as epoch seconds: expect bad_kickoffs 0 and the newest weeks listed.
select count(*) filter (where jsonb_typeof(g->'kickoff')<>'number') as bad_kickoffs, count(*) as nfl_games,
       max(to_timestamp((g->>'kickoff')::double precision)) filter (where jsonb_typeof(g->'kickoff')='number') as latest_kickoff
  from public.gtl_weekly_slates s cross join lateral jsonb_array_elements(s.signature->'games') g;
-- The NBA lease functions the worker calls, unchanged since their October 22 apply.
select proname, md5(prosrc) from pg_proc where pronamespace='public'::regnamespace
  and proname in ('gtl_nba_claim_games','gtl_nba_finish_games') order by 1;
  -- expect gtl_nba_claim_games f2a8ce30c561d9dedb4be6dace10fa63, gtl_nba_finish_games afeed594711e205ba577a0a77d37f956
select extname from pg_extension where extname in ('pg_cron','pg_net') order by 1;   -- both, for the later schedule step
rollback;
```

The two lease md5s are the repo's bodies (executed with `node scripts/migration-functions.mjs
--latest`); the hosted values are **assumed** to match until this preflight reads them. If any
answer differs, stop and reconcile before applying.

Score hash: run the November 10 packet's
[P1](MIGRATION_APPLY_PACKET_2026_11_10.md#p1-score-hash-gate-m-step-5-sql-editor-as-postgres)
before and after, and compare. M-49 writes no ballot, pick or settlement, so it must not change.

## 3. Guard and apply

One transaction in your signed-in SQL editor (the route the November 10 packet describes), or
Supabase MCP `apply_migration` with name `gtl_nba_slate_lines` and the exact merged file, preceded by
this guard as its own `execute_sql`. Never `npx supabase db push`.

```sql
-- Guard: raises unless the preflight state still holds. Run it as the first statement.
do $$ begin
  if to_regclass('public.gtl_nba_games') is not null or to_regclass('public.gtl_nba_line_attempts') is not null
    or exists(select 1 from supabase_migrations.schema_migrations where name like '%nba_slate_lines%')
    or to_regclass('public.gtl_odds_budget') is null or to_regclass('public.gtl_odds_refresh_runs') is null
    or to_regclass('public.gtl_epl_job_runs') is null or to_regclass('public.gtl_weekly_slates') is null
    or to_regprocedure('public.gtl_nba_claim_games(date,boolean)') is null
    or to_regprocedure('public.gtl_nba_finish_games(date,uuid,jsonb)') is null
  then raise exception 'M-49 preflight no longer holds'; end if;
end $$;
-- Then the exact file, then (SQL editor route only) the history row:
-- insert into supabase_migrations.schema_migrations(version,name,statements,created_by)
--   values('<UTC yyyymmddhhmiss>','gtl_nba_slate_lines',array[$gtlmig$<file>$gtlmig$],'<your account>');
```

A second accidental run is refused by the guard. The file itself is also rerunnable (create if not
exists, create or replace).

## 4. Verify (read-only)

```sql
begin transaction read only;
select p.oid::regprocedure::text as signature, md5(p.prosrc) as body_md5, p.prosecdef as definer, p.proconfig,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon, has_function_privilege('authenticated',p.oid,'EXECUTE') as authed,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service
from pg_proc p where p.pronamespace='public'::regnamespace
  and (p.proname like 'gtl_nba_%' or p.proname like 'gtl_dispatch_nba%') order by 1;
select c.relname, c.relrowsecurity as rls, (select count(*) from pg_policy where polrelid=c.oid) as policies,
       has_table_privilege('anon',c.oid,'SELECT') as anon_select, has_table_privilege('authenticated',c.oid,'SELECT') as authed_select,
       has_table_privilege('service_role',c.oid,'SELECT') as svc_select, has_table_privilege('service_role',c.oid,'INSERT') as svc_insert,
       has_table_privilege('service_role',c.oid,'UPDATE') as svc_update, has_table_privilege('service_role',c.oid,'DELETE') as svc_delete
from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relname like 'gtl_nba_%' order by 1;
select tgname, tgrelid::regclass::text from pg_trigger where not tgisinternal and tgrelid::regclass::text like '%gtl_nba_%' order by 1;
select * from public.gtl_nba_budget;
select count(*) from public.gtl_nba_jobs_schedule;   -- 0: the file creates no schedule row
select public.gtl_nba_lines_plan(clock_timestamp());  -- null: no game is stored yet
select conservative_remaining, paused, lease_token is not null as leased from public.gtl_odds_budget where provider='the-odds-api';  -- as in the preflight
rollback;
```

Expected (executed on PGlite with every repo migration):

- **Functions.** 14 new rows plus the 4 earlier NBA functions. Every new function: `definer` false,
  `proconfig` `{search_path=""}`, `anon` false, `authed` false. `service` is true for all except
  `gtl_dispatch_nba_jobs(text)`, which is false (cron only). The body md5s:

  | Function | md5(prosrc) |
  | --- | --- |
  | `gtl_dispatch_nba_jobs(text)` | `49043221dc15592811281fa7f4463ab1` |
  | `gtl_nba_append_only()` | `dad64c2bd79647d7d55e9338bc58ca11` |
  | `gtl_nba_attempts_guard()` | `953f91a896632167f54cff811b9cad91` |
  | `gtl_nba_begin_lines_read(uuid,uuid,date)` | `184eb8fcce9a6dd4add829e47e776a4e` |
  | `gtl_nba_claim_job(text,uuid)` | `eb9e7215d4d4c2ea73aea148879b91ca` |
  | `gtl_nba_finish_job(uuid,uuid,text,jsonb)` | `6670c7ed0d33acf3c930e43cf78c24a3` |
  | `gtl_nba_finish_lines_read(uuid,uuid,jsonb,text,jsonb)` | `2a0c9d0b8f16e6373b63f090926c4266` |
  | `gtl_nba_games_guard()` | `8e607c05414f4e74eee4e0c087f8f439` |
  | `gtl_nba_lines_due(uuid,uuid)` | `2abc76b3af50bfeb35bf8d5546b496f6` |
  | `gtl_nba_lines_plan(timestamptz)` | `cb7abd0674a7c0e4789a3deb0aa82492` |
  | `gtl_nba_month_spent(timestamptz)` | `6ef8080035ecee7b687f9fb22149565d` |
  | `gtl_nba_nfl_clear(timestamptz,boolean)` | `a444a8be4f0dcf7f4aa73afc519f77f3` |
  | `gtl_nba_publish_slate(uuid,uuid,date,timestamptz,jsonb,jsonb)` | `74813076648f5deebea6c3b4e91c89c6` |
  | `gtl_nba_shadow_gate()` | `ef9c27022b799faf32b0e73787eced09` |

- **Tables.** 8 tables, every one with `rls` true, 0 policies, no anon or authenticated select, and
  no service-role delete. Service-role insert on games, observations, slate reads, attempts and
  lines. Service-role update on games, plus column updates on attempts and runs. The schedule and
  budget are select only.
- **Triggers.** 8: `gtl_nba_attempts_guard`, `gtl_nba_budget_keep`,
  `gtl_nba_game_observations_append_only`, `gtl_nba_games_guard`, `gtl_nba_job_runs_keep`,
  `gtl_nba_jobs_schedule_keep`, `gtl_nba_lines_append_only` and `gtl_nba_slate_reads_append_only`.
- **Budget row.** `monthly_cap` 31, `pause_below` 100, `paused` false. The shared budget is unchanged
  from the preflight.

Then `npm run check:cloud` from a checkout with `.env.cloud`. It should report the M-49 probes as
denied, not awaiting.

## 5. Rollback and off switches

- **First off switch: the schedule.** No job runs while both schedule rows are absent or disabled
  (`supabase/admin/nba_jobs_cron.sql`, "Off switch").
- **NBA-only pause.** `update public.gtl_nba_budget set paused=true;` refuses every lines read as
  `nba_paused`. No credit is spent, and NFL and EPL are untouched.
- **Rollback file.** `supabase/rollback/20261112040000_gtl_nba_slate_lines.sql` only revokes. It
  takes the service role's execute right on every new entry point and its insert and update on the
  N2 tables. Every row stays readable (D-23), and nothing is dropped or deleted.
  `tests/rollback.test.mjs` applies it on PGlite after hosted plus M-49, and reruns the old-app SQL
  suites with the migration and after the rollback (executed in the full run on this branch).

## 6. After the apply (each step its own word from you, in this order)

1. **Record the apply.** Write a dated release record with the hosted version, history md5 and the
   readbacks above. Move `20261112040000` from `NOT_HOSTED` to `APPLIED` in `tests/migrations.mjs`,
   and add the ledger row. Remove the M-49 `awaitingDeploy` entries in
   `scripts/boundary/nba-jobs.mjs`, then run `check:cloud --strict`.
2. **Deploy the worker.** `gtl-nba-jobs` was not deployed when this was written (it is v1 since
   November 12 UTC). Its `supabase/config.toml` entry is `verify_jwt = false` (the one-run
   capability is the credential). It reads the secrets `THE_ODDS_API_KEY` and
   `BALLDONTLIE_API_KEY`, which are already used by the other workers and `gtl-api`. The release
   workflow's `nba-jobs` target deploys it (added by PR #560, merged November 12 UTC). After the
   deploy, add `['scheduled nba jobs', 'gtl-nba-jobs', { runId: missingId }]` to
   `scripts/boundary/bets.mjs` `workerChecks`.
3. **Schedule rows.** Run `supabase/admin/nba_jobs_cron.sql`, which creates both rows disabled.
4. **Enable `slate`** (free). Check one run in `gtl_nba_job_runs` and the `gtl_nba_slate_reads`
   counts (`unmatched_events`).
5. **Enable `lines`** (at most 31 credits a month). Check one run, `gtl_nba_line_attempts` and
   `gtl_nba_lines`.
6. **Watch the shadow gate.** `select public.gtl_nba_shadow_gate();` must answer `"open": true`
   (10 consecutive game days) before N3's writer is turned on.

## 7. Things not to do

- Never `npx supabase db push` against this project.
- Do not enable `lines` before `slate` has stored a game day, and never raise `monthly_cap` or lower
  `pause_below` (the table refuses both).
- Do not clear the shared `gtl_odds_budget` lease by hand while any NFL, EPL or research collection
  may be running.
