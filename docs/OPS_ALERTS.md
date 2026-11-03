# Ops alerts (item 22)

Sean wants to know when a scheduled job fails or a weekly outcome is missed, without checking by hand. Two halves:

| Half | Watches | Channel | Status |
|---|---|---|---|
| GitHub data refreshes | Fantasy refresh, Research data refresh | GitHub issue assigned to Sean (`ops-alert` label) | Live: PR #433, #436 |
| Supabase jobs | The 22 pg_cron jobs and the outcomes they own | Web push to the commissioner's phone (Sean's choice, November 3) | M-38 applied (hosted `20261103184656`); function not deployed ([release card](RELEASE_2026_11_03_OPS_ALERTS_M38.md)) |

## Why the Supabase half needs its own check

A pg_cron row says `succeeded` when the dispatcher SQL ran, not when the work happened. On November 3 the Points catch-up
logged `nothing_due` six times while Week 9 had no slate. Each job family already records its real outcome in a run table
(`status`, `reason`): EPL, league features, odds, Points, push reminders, results and week open. The check reads those
tables and the outcomes themselves.

## What it checks

Every 15 minutes, from pg_cron (on time, unlike GitHub's schedule).

| Key | Problem | Fires when | Clears when |
|---|---|---|---|
| `failed:<family>` | A job failed | An enabled family's latest finished run is `failed` | Its latest finished run is not `failed`, or the family is disabled |
| `quiet:<family>` | A job stopped running | An enabled family has no run row newer than its limit: results 2 h; EPL moneyline, snapshot, resolve and nudge 1 h; Points 26 h; odds 26 h | A run row appears, or the family is disabled |
| `points-open:<season>-<week>` | Points week not open | The next week's slate is not published 2 h after its expected open: Tuesday 12:00 AM PT, a week after the latest published slate's scheduled Tuesday | It is published |
| `points-final:<season>-<week>` | Points week not FINAL | A slate's `finalize_at` passed 1 h ago with no FINAL row | The FINAL row exists |
| `week-open:<season>-<week>` | Weekly Spread/Total week not open | The next week has no `gtl_weekly_slates` row 2 h after its expected Monday 12:00 AM PT open (`gtl_week_open_at`) | The row exists |

Not checked here, on purpose:
- **Odds `partial` runs** (18 of 27 in 14 days): item 40 owns that, and an alert on each one would be noise.
- **Push reminder, week-open, league-features and the other EPL jobs' silence:** they run only when something is due, so silence is normal. Their failures are still checked.
- **Weeks after Week 18** are never expected.

## What Sean's phone shows

One push per change, to the active push subscriptions of the `sean-troy-luke` commissioner (`gtl_memberships` role
`commissioner`). The text never names a player, a pick, a line or a score.

- Title for every alert: `GTL ops alert`.
- `Points Week 10 is not open. It was due 12:00 AM PT.`
- `Points Week 9 is not FINAL. It was due 12:00 PM PT.`
- `The results refresh failed at 2:35 PM PT.`
- `The results refresh has not run since 2:35 PM PT.`
- Recovery: title `GTL ops alert cleared`, body `Points Week 10 is open now.` or `The results refresh is working again.`

The tag is `gtl-ops-<key>`, so a recovery replaces its own alert on the lock screen. Pushes last 4 hours (the cap in `cloud/web-push.mjs`), and a tap opens Picks.

## How

- **Migration M-38:**
  - `gtl_ops_incidents`: key, opened, cleared, the notified and cleared-notified times. Service-only, RLS on, never deleted (D-23).
  - `gtl_ops_findings()`: the checks above, as rows.
  - `gtl_ops_alert_schedule`: the enabled row, inserted by the admin script, disabled first.
  - `gtl_ops_alert_runs`: one run per 15-minute slot.
  - `gtl_dispatch_ops_alerts()`, the one-run-capability dispatcher (the `gtl_dispatch_week_open` pattern). It opens and clears incidents, and dispatches the worker only when a push is owed, so a quiet hour costs no function call.
  - `gtl_claim_ops_alerts`, `gtl_mark_ops_notification`, `gtl_record_ops_delivery` and `gtl_complete_ops_alerts`: the worker's, service role only.
  - `gtl_ops_test_alert()`: opens one synthetic incident for the test script.
- **Worker `gtl-ops-alerts`:** a new Edge Function with the same VAPID secrets and `cloud/web-push.mjs`. It sends each owed push and records which incidents were notified. A push that fails stays owed and is retried on the next run.
- **Cron:** `supabase/admin/ops_alerts_cron.sql` adds `gtl-ops-alerts` at minutes 7, 22, 37 and 52 (`7-59/15 * * * *`, clear of the busy :00, :05 and :15 slots), run by hand on Sean's word. It inserts the row disabled and reads `gtl_ops_findings(now())` back first: the first enabled tick pushes once per current finding.
- **Release:** the `ops-alerts` target of the shared release workflow deploys only `gtl-ops-alerts`. M-38 goes through Gate M (Sean's SQL editor).
- **Test alert:** `supabase/admin/ops_alerts_test.sql` opens a synthetic `test` incident. The next tick pushes "Test alert: this phone gets GTL ops alerts." and the tick after clears it with "Test alert cleared.", proving the phone receives one alert and one cleared push.

## Tests

- **PGlite:** each check fires and clears at its boundary.
- **No duplicates:** an incident pushes once, its recovery pushes once, and a failed push stays owed.
- **Privacy:** findings never read picks.
- **Worker:** unit tests for the payloads, the capability path and missing VAPID keys.
- **Release:** a contract test for the release step.
