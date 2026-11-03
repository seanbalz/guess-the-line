# Release card: M-38 Supabase job alerts by phone push — November 3, 2026

Board item 22. Design: [OPS_ALERTS.md](OPS_ALERTS.md). Sean chose a phone push to the commissioner (November 3, 2026).
This card covers one migration (M-38, Gate M), one Edge Function (`gtl-ops-alerts`, the new `ops-alerts` release target),
two admin scripts and a follow-up PR for the boundary probes. **Nothing here is applied or deployed.** Nothing players see
changes: the alerts go only to the active push subscriptions of the `sean-troy-luke` commissioner.

## Current state

| Part | State |
| --- | --- |
| M-38 `20261103190000_gtl_ops_alerts.sql` | **Not applied.** Local source only (`NOT_HOSTED` in `tests/migrations.mjs`). |
| `gtl-ops-alerts` Edge Function | **Not deployed.** Source, `supabase/config.toml` entry and release target exist on branch `claude/ops-watchdog`, which is not pushed (no PR). |
| `gtl_ops_alert_schedule` row `ops` | **Does not exist.** `ops_alerts_cron.sql` has not been run. |
| Cron job `gtl-ops-alerts` | **Not scheduled.** |
| Boundary probes | The 3 tables and 7 functions are in `scripts/boundary/league.mjs` as `awaitingDeploy`; the worker has no probe yet. |

## What M-38 adds

All of it new; no existing function or table is replaced.

| Object | What |
| --- | --- |
| `gtl_ops_alert_schedule` | The one `ops` row: enabled flag and endpoint. Service read-only, RLS on. |
| `gtl_ops_alert_runs` | One run per 15-minute slot, with a single-use capability. |
| `gtl_ops_incidents` | One open incident per key, with opened, notified, cleared and cleared-notified times. Never deleted (D-23). |
| `gtl_ops_findings(p_now)` | The checks, as rows (`failed`, `quiet`, `points-open`, `points-final`, `week-open`). Cron and SQL editor only. |
| `gtl_dispatch_ops_alerts()` | The 15-minute dispatcher. Opens and clears incidents; calls the worker only when a push is owed. Cron only. |
| `gtl_claim_ops_alerts`, `gtl_mark_ops_notification`, `gtl_record_ops_delivery`, `gtl_complete_ops_alerts` | The worker's database half. Service role only. |
| `gtl_ops_test_alert()` | Opens one synthetic `test` incident. Service role only. |

| File | SHA-256 | Bytes |
| --- | --- | --- |
| `supabase/migrations/20261103190000_gtl_ops_alerts.sql` | `f415f8f10ea982f49d17454729198c8b5c1c933c1ee02241b605763b50e888c1` | 24376 |
| `supabase/rollback/20261103190000_gtl_ops_alerts.sql` | `6e3d51631c9c4844702780102549da596da73dd96bc95b4877cf244a70c81300` | 688 |

The migration inserts no schedule row and registers no cron job; the admin scripts do. It reads only run status and times,
slate weeks and times, and whether a FINAL row exists. A test enforces that no ballot, pick, guess, selection, score,
name or feed table is referenced. The push text never names a player, a pick, a line or a score.

## Apply order

Each step waits for Sean's word. Steps 1 to 3 change nothing a player sees; step 4 sends pushes to Sean's phone.

### 1. M-38 through Gate M

1. **Queue.** Nothing else waits on these objects. M-38 reads hosted tables only and is rerunnable, so it may follow M-37 or
   go on its own.
2. **Deploy first.** Nothing. With no schedule row the dispatcher answers `disabled`.
3. **Approval.** Sean says "apply M-38" and approves the route: the SQL editor in his signed-in Chrome.
4. **Pre-check (read-only).**
   ```sql
   select to_regclass('public.gtl_ops_incidents') as incidents, to_regclass('public.gtl_ops_alert_runs') as runs;
   -- both null
   select count(*) from supabase_migrations.schema_migrations where name like '%ops_alerts%';  -- 0
   ```
5. **Apply.** The file from `main`, checked against the SHA-256 above.
6. **Verify.**
   ```sql
   select p.oid::regprocedure as fn, md5(p.prosrc) as body
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in ('gtl_ops_findings','gtl_dispatch_ops_alerts','gtl_claim_ops_alerts',
     'gtl_mark_ops_notification','gtl_record_ops_delivery','gtl_complete_ops_alerts','gtl_ops_test_alert') order by 1;
   -- 7 rows
   select proname, has_function_privilege('anon',oid,'execute') anon, has_function_privilege('authenticated',oid,'execute') authed,
          has_function_privilege('service_role',oid,'execute') service
   from pg_proc where pronamespace='public'::regnamespace and proname in ('gtl_ops_findings','gtl_dispatch_ops_alerts',
     'gtl_claim_ops_alerts','gtl_mark_ops_notification','gtl_record_ops_delivery','gtl_complete_ops_alerts','gtl_ops_test_alert') order by 1;
   -- anon and authed false for all 7; service true only for claim, mark, record_delivery, complete and test_alert
   select relname, relrowsecurity from pg_class where relname in ('gtl_ops_alert_schedule','gtl_ops_alert_runs','gtl_ops_incidents');
   -- 3 rows, all true
   select count(*) from public.gtl_ops_alert_schedule;  -- 0: no schedule row yet
   select public.gtl_dispatch_ops_alerts();              -- run in the SQL editor: {"status":"disabled"}
   ```
   Score hash: M-38 reads and writes no ballot, pick or settlement, so the hash is unchanged (as in the M-36 record).
7. **Record.** The hosted version here and in the register; move `20261103190000` from `NOT_HOSTED` to `APPLIED` in
   `tests/migrations.mjs`.
8. **Follow-up PR for the boundary probes.** In `scripts/boundary/league.mjs`, remove the 10 `awaitingDeploy` entries for
   M-38 (3 tables, 7 functions) so they become live signed-out probes. The worker probe is added after step 2 below, as
   M-26's record did. Do not change the probes before the apply.

### 2. Deploy the function: the `ops-alerts` release target

1. Run the **Shared production release** workflow with `target = ops-alerts`: `check-only`, then `readiness`, then `deploy`
   ([SHARED_DEPLOYMENT.md](SHARED_DEPLOYMENT.md)), from the exact merged SHA with green CI.
2. The source check requires `[functions.gtl-ops-alerts] verify_jwt = false` and the entry file. The first deploy creates the
   function (the preflight records `opsAlertsBefore`), and verification applies the create rule (version 1) and refuses any
   other function change. `gtl-api`, Pages and every other worker stay as they are.
3. No new secret: the worker reads the reminder worker's `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`.
4. **Verify.** The run's evidence shows `opsAlerts` ACTIVE, `verify_jwt` false, a bundle digest, and `opsAlertsCreated: true`.
   Then, in the same follow-up PR as step 1.8, add `gtl-ops-alerts` to `workerChecks` in `scripts/boundary/league.mjs`
   (a signed-out call with no token or a wrong one must be refused).

### 3. The schedule and cron: `supabase/admin/ops_alerts_cron.sql`

The first enabled dispatch alerts on **everything wrong at that moment**, history included (for example Points Week 9 not
open). So the script inserts the schedule row **disabled**, schedules the job (which then answers `disabled`), and reads back
what would push before anything is enabled.

1. Run the script's steps 1 to 3 in the SQL editor, on Sean's word.
2. **Read-backs.**
   ```sql
   select id,enabled,endpoint from public.gtl_ops_alert_schedule;      -- one row: ops, false, .../functions/v1/gtl-ops-alerts
   select jobname,schedule,active from cron.job where jobname='gtl-ops-alerts';   -- 7-59/15 * * * *, active
   select * from public.gtl_ops_findings(now());                       -- what the first tick would push
   ```
3. **Sean expects one push per row the last query returns**, on the first tick after the enable (minutes 7, 22, 37 and 52
   of each hour, clear of the busy :00, :05 and :15 slots). A row he already knows about still pushes once; it repeats only
   if it clears and opens again. If a row is stale or wrong, fix the cause (or disable the job family) before enabling.
4. Only after Sean has read those rows and says so, run the script's step 4 as its own statement:
   `update public.gtl_ops_alert_schedule set enabled=true where id='ops';`
5. **Verify.** After the next tick:
   ```sql
   select key,kind,opened_at,notified_at,cleared_at from public.gtl_ops_incidents order by id;   -- one per finding; notified_at set
   select slot_start,status,reason,sent,failed from public.gtl_ops_alert_runs order by slot_start desc limit 10;
   -- succeeded with sent >= 1; skipped/nothing_owed when nothing is wrong
   ```
   A run `failed` with `send_failed` means no device accepted the push; the alerts stay owed and the next tick retries.
   `vapid_unavailable` means a VAPID secret is missing on the function.

### 4. The test alert: `supabase/admin/ops_alerts_test.sql`

After step 3, on Sean's word: `select public.gtl_ops_test_alert();`. Sean should see, in this order, on his phone:

1. Within 15 minutes: one push titled `GTL ops alert`, "Test alert: this phone gets GTL ops alerts."
2. About 15 to 30 minutes after the call: one push titled `GTL ops alert cleared`, "Test alert cleared."

Read-backs are in the script: the open test incident, the run that pushed it (`succeeded`, `sent` at least 1), then the
incident with `cleared_at` and `cleared_notified_at` set. The incident and runs stay as a record (D-23).

## Rollback

- **Stop the alerts (reversible, first):** `select cron.unschedule('gtl-ops-alerts');` and
  `update public.gtl_ops_alert_schedule set enabled=false where id='ops';`. The row is never deleted (D-23). Every run and
  incident stays.
- **Permission off switch:** `supabase/rollback/20261103190000_gtl_ops_alerts.sql` revokes the worker's five functions from
  `service_role`. M-38 replaces no function, so there is no body to restore, and the repo's rollback convention forbids a
  drop. The dispatcher and the findings already have no grant. Restore by regranting. Tested by `tests/rollback.test.mjs`.
- **The function:** redeploy the previous source, or leave it deployed and disabled; with no enabled schedule nothing calls it.

## Known limits

- **Tapping an ops alert opens Picks**, because `web/public/sw.js` routes every tag except `gtl-points-*` there. Changing
  that is a visible UI change and needs Sean's phone mockups first.
- **Pushes last 4 hours**, the cap in `cloud/web-push.mjs`. A phone offline longer misses the alert after it was recorded.
- **A device that fails or is gone gets no more pushes in that run**; its alerts stay owed and are retried on the next run.
- **Disabling a job family clears its alert** with the "working again" wording. A disabled family is never checked.
- **The findings read every run row on each tick**, which is fine at today's volume. A per-family indexed lookup is noted as
  debt.
- **A job that alternates failing and succeeding** pushes on each change (the design accepts this).
- **Defect found outside this task:** `cloud/push-reminders.mjs` returns `finish(...)` without `await` inside `try`, so a
  refused completion escapes its error mapping. Not changed here; a one-line follow-up with a test.

## Evidence (local, executed on branch `claude/ops-watchdog`, not pushed)

- `tests/ops-alerts-sql.test.mjs` (PGlite, every migration): the checks at their boundaries, no duplicate pushes, a failed
  push stays owed, re-alert after recovery, grants, privacy and the go-live order of the admin script.
- `tests/ops-alerts.test.mjs`: the worker's text, guards, send, mark and error rules, and one end-to-end run of the real
  handler against the real migrations. Both dispatch-then-claim suites wait out the last 3 seconds of a 15-minute slot
  (`tests/helpers/slot-edge.mjs`).
- `tests/release-preflight.test.mjs`, `tests/ci-workflows.test.mjs`: the `ops-alerts` target deploys only
  `gtl-ops-alerts`, refuses a source without its config entry or entry file, and takes the create-or-update rule.
- `tests/migrations.test.mjs`, `tests/rollback.test.mjs`, `tests/cloud-boundary.test.mjs`: M-38 is registered as not hosted,
  its rollback is the reviewed off switch, and its probes are inert until the apply.

Nothing was applied, deployed, pushed or sent to a phone.
