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

## Not done

- The schedule setup (`supabase/admin/league_features_cron.sql`: the disabled schedule row, the disabled-dispatch check,
  then on Sean's word the enable, one verified run and the 15-minute cron). No features run has been recorded yet.

## Probe timeouts

The signed-out checker's 15-second request limit aborted the first release run and several local runs today, on a
different `gtl-api` route each time (`invite/revoke`, `league/comparison`, `bets/recommendations`, `nba/games`). None of
those requests appears in the edge logs, where every probe of those routes answered 401 within a second, so the request
does not reach the API; single `curl` calls never stall. Not resolved here.

## Rollback

The worker does nothing until its schedule row is enabled. To remove it from service, leave the schedule disabled; a
redeploy of an earlier source is not needed.
