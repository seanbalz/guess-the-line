# Badges worker release — October 27, 2026

Sean's instruction (October 27, 2026): "Add a league-features target to the release workflow as a PR, then deploy
gtl-league-features, then run the schedule setup with one verified run. Ask before each production step", then "Once #257
is merged and main's CI passes on that SHA, deploy gtl-league-features with the league-features target and approve its
gate. Then ask me before the schedule setup."

- **Target:** [#257](https://github.com/seanbalz/guess-the-lines-repo/pull/257) added `league-features` to the Shared
  production release workflow, merged 17:31 UTC as `97c1b83e4481c4fd8a6e963541083fb98f77cd33`.
- **Source CI:** Tests, Dashboard checks (dashboard, Persona suite, four cloud browser shards) and Brand QA passed on the
  `push` runs for `97c1b83`.

## Runs

| Run | Result |
| --- | --- |
| [40554576610](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40554576610) | Gate approved through the GitHub API as Sean's account after the title matched; the read-only hosted preflight aborted on a 15-second request timeout ("The operation was aborted due to timeout"). Nothing was deployed. |
| [40554981916](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40554981916) | Same SHA, target and digest. Its gate was approved from Sean's account without a comment (not by this session). Source and CI re-verified, preflight passed, `gtl-league-features` deployed, verify passed 18:00:34 UTC. |

## What is live

- **`gtl-league-features` v1** (created): ACTIVE, `verify_jwt` false, bundle
  `9ddad5ceccdf03a2710f13f9889160f2a08c2da4a3097f74f6dfeb3626c98836` (`leagueFeaturesSourceVerified: false`: the bundle
  digest is recorded, the hosted bytes are not matched to the checkout).
- **Unchanged:** `gtl-api` v38 (`1647f94a…`), every other function, migration history (63 rows,
  `8a02c480d273a532082411166e08f794a9b71ca6636028adfad09709adee91bb`); Pages not touched.
- **Boundary:** the run's verify probed 374 signed-out requests, all denied. The worker answers 401 with no machine token
  and with an invalid one. This record's PR adds it to `workerChecks` (`scripts/boundary/league.mjs`): 376 probes, all
  denied, from this PC at 18:04 UTC.

## Schedule setup (18:08–18:12 UTC)

Sean's instruction: "In the SQL editor in my signed-in Chrome: add the schedule row disabled and check the disabled
dispatch, then enable it and run one dispatch and verify it (runs row, feature run, badges, awards, the recap post,
function logs), then register the 15-minute cron." Each step ran in the SQL editor (role `postgres`) and was read back
through the read-only connection.

1. **Disabled row:** `supabase/admin/league_features_cron.sql`'s insert added `league-features`, `enabled` false, endpoint
   `https://onmrgvcehkflfaizvedl.supabase.co/functions/v1/gtl-league-features`, the week-open schedule's authorizing
   commissioner, season 2026. `gtl_dispatch_league_features()` answered `{"status":"disabled"}`; no run row, no HTTP call.
2. **One verified run:** enabled, then one dispatch: `{"runId":"4575e098-2361-481b-93e7-a4e59edd3b78","status":"queued"}`
   at 18:10:37.
   - `gtl_features_schedule_runs`: `succeeded` (slot 18:00), claimed 18:10:38, finished 18:10:39.
   - `gtl_feature_runs`: trigger `schedule`, season 2026; summary 58 earned, 18 awards, 10 streaks, 1 post, 0 skipped,
     0 removed, no replay.
   - Rows: 58 `gtl_badge_events`, 18 `gtl_weekly_awards`, 10 `gtl_player_streaks`.
   - Feed: one `weekly_recap` post for Week 7, Community scope (no league). No `badge_earned` post (a first run's
     backfill is never posted).
   - Logs: `POST /functions/v1/gtl-league-features` 200 in 1,946 ms; booted in 26 ms; no error line.
   - Score hash (25 ballots, `41fa6ae2003cd33f7e7e14bbb3f136f2`) and the 110 posts made by 15:20 UTC unchanged.
3. **Cron:** `gtl-league-features-every-15-minutes` (job 16), `*/15 * * * *`, was registered at 18:12 and removed at 18:13
   (`cron.unschedule` returned true) on Sean's "i dont need that job running every 15 minutes", before its first run.
   No features cron exists; the schedule row stays enabled, so a cron at another cadence (or a manual dispatch) is all a
   run needs. The only run so far is the verified one above.

Rollback: `update public.gtl_features_schedule set enabled=false where id='league-features'` (every run, badge and award
stays, D-23); `select cron.unschedule('gtl-league-features-every-15-minutes')` stops the dispatches.

## Probe timeouts

The signed-out checker's 15-second request limit aborted the first release run and several local runs today, on a
different `gtl-api` route each time (`invite/revoke`, `league/comparison`, `bets/recommendations`, `nba/games`). None of
those requests appears in the edge logs, where every probe of those routes answered 401 within a second, so the request
does not reach the API; single `curl` calls never stall. Not resolved here.

## Rollback

Disable the schedule row (above) to take the worker out of service; a redeploy of an earlier source is not needed.
