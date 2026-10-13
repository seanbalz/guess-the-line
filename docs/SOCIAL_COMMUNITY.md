# Social community and feed — D-21 and D-23

Owner: Sean Balsiger · Version 5 · Updated 2026-10-12 (Community history tab, D-27) · Decisions D-21, D-22, D-23, D-24, D-27

## What is built

| Part | Status |
|---|---|
| One community of every profile, commissioner removal | Database and API built and tested. Removal blocks the account's reads, posts, likes, comments and picks; it hides nothing (D-23) |
| Activity feed: joined, ballot submitted, Bet Tracker bet posted and settled | Built and tested; posts are created automatically by database triggers |
| Likes and comments (1–500 characters, safe retry) | Built and tested |
| Guess picks inside feed posts | Shown only to the author, to viewers who submitted the same season/week/mode ballot, to viewers who sat out that mode for the week, or to everyone after the deadline |
| Sit out this week (D-23) | Built and tested: `gtl_weekly_optouts`, `/community/sit-out`, Picks tab and group `PredictionEntry` button with a confirm dialog. Final per week and mode; forfeits that mode's score (shown as "Sat out", never 0), clears its picks-due entry, reveals others' picks and closes the ballot. Refused after the deadline or once that ballot is submitted |
| Who has submitted or sat out this week | Shown to everyone, without numbers |
| Picks due for the viewer: Spread and Total | `not_open` before the week's Monday 00:00 PT open (D-24), then `due`, then `urgent` within 2 hours of the deadline, then `closed`, or `done`; a sat-out mode is never due |
| Publish Week (commissioner) | Relabelled "Preview / publish early (fallback)" under D-24. `/community/publish-preview` shows the nflverse slate for review; `/community/publish` adds the slate, schedule template, a "Week N is open" post and moves the 12-hour odds collector. Identical republish is a no-op; a different slate for a published week is refused |
| Automatic week opening (D-24) | Built and tested on PGlite. Hosted on October 9: migration applied, `gtl-week-open` v1 deployed, both Monday cron jobs registered and the `nfl-weekly` schedule row enabled (see the [release checklist](#release-checklist--october-9-2026)). First automatic open: Week 6, Monday October 12, 12:00 AM PT |
| Team records (overall, home, road) | `shared/team-records.mjs` and `shared/team-records-2026.json` from nflverse finals |
| Community home (feed, picks-due card, leaderboard, likes, comments, Publish Week panel) | Built; browser-tested at 390px and 1280px |
| Picks tab: button entry (favorite team or Pick'em, then half-point chips 1–10, More for 10.5–20, −/+ 0.5) and team records under each game | Built; saves through the league-free weekly ballot |
| Group game screens (`PredictionEntry`) | Use the same `ChipPicker` button entry and team records under each matchup; the favorite dropdown, typed number and −/+ stepper are removed. Draft recovery, per-field conflicts, search and filter, Next game focus, review and submit, closed states and the signed home-spread contract are unchanged |
| History tab (D-27, Sean's October 12 ruling): every member's Spread and Total ballots for every week with the line saved with each guess, the final and the points | Built and tested locally (PGlite, handler and browser specs at 390px and 1280px). **Not deployed**: the migration and the `/community/history` route are pending; see [Community history](#community-history--october-12-2026) |
| Challenge and Units in the leaderboard strip | Not included; those records stay inside each group |
| Score-change and weekly-winner posts | Not built yet; they need the scoring engine's results. Hook: D-26 Virtual Units settlement (`gtl_settle_virtual_units`) returns per-pick `picks[]` and per-player `players[]` changes and writes `settled`/`resettled`/`voided` audit events, which a later trigger or post can consume; see the [settlement runbook](../planning/virtual-units-game.md#settlement-runbook--d-26) |

Practice ballots never post. Under D-23 nothing a member entered is deleted, moved or hidden: a removed member's posts, comments, likes, submissions, standings rows and member entry (flagged `removed: true`) stay visible to everyone; only the removed account loses access (`GTL_COMMUNITY_MEMBER` on its own reads and writes). Restoring a member returns their access. Removals, restorations and sit-outs (`sit_out:season:week:mode`) are written to `gtl_access_audit`. The commissioner is the active commissioner of the founding `sean-troy-luke` league.

The one visibility exception is the Guess pick reveal gate, shared by the feed and the group game screens through `gtl_week_revealed`: own full submission, a final weekly opt-out for that mode, or the deadline. An opt-out row can be inserted and read by the service role only; there is no update or delete grant, and a trigger refuses any later draft or submission for that user/week/mode (`GTL_COMMUNITY_SAT_OUT`).

## API (Supabase Edge Function `gtl-api`, POST, signed-in and email-confirmed)

| Route | Body | Result |
|---|---|---|
| `/community/read` | `{ before?: ISO time, limit?: 1–100 }` | members (with `removed`), week, optOuts (viewer's sat-out modes), due (with `satOut`), picksDue (sat-out modes excluded), submissions (with `satOut`), standings (with `satOut`), posts |
| `/community/like` | `{ postId, like: true/false }` | likes, likedByMe |
| `/community/comment` | `{ requestId, postId, body }` | id, replayed |
| `/community/member` | `{ userId, member: true/false }` (commissioner only) | userId, member |
| `/community/publish-preview` | `{ season, week }` (commissioner only) | the slate built from nflverse, with nothing saved |
| `/community/publish` | `{ season, week }` (commissioner only) | the slate plus `published: true`, or `false` if it was already published |
| `/community/sit-out` | `{ season, week, mode }` (`guess_spread` or `guess_total`) | `{ season, week, mode, satOut: true, replayed }`; 409 `GTL_COMMUNITY_CLOSED` after the deadline, 400 once that ballot is submitted |
| `/community/week-open` | `{}` (commissioner only) | D-24 scheduler status: `configured`, `enabled`, `season`, `utcCrons`, `lastRunAt`, `lastStatus`, `lastReason`, `currentWeek { season, week, openAt, deadline }` |
| `/community/history` | `{ season? }` (default: the newest published season) | D-27 history: `viewer`, `season`, `seasons`, `members` (with `removed`), `weeks[]` newest first, each with `deadline`, `closed`, `games[]`, `results{}`, `revealed{}` and `entries[]` (one per member and market: `status` submitted / sat_out / draft, `submittedAt`, `scoringPolicy`, `ruling`, `picksHidden`, `picks[]` with `guess`, `reference`, `points`, `scorable`, and `weekPoints`, `weekScored`, `games`; `updatedAt`, `revisions` (edits after submitting) and `provenance` are the viewer's own entries only and `null` on every other member's) |

The handler passes the request time to the database, so the deadline reveal, the sit-out cutoff and the picks-due state use one clock. It also strips pick values from any post marked hidden. `picksDue` carries `opensAt` (the week's Monday 00:00 PT) alongside `deadline`. Group game screens read opt-outs through `gtl_read_weekly_state` (`state.optOuts`), and the league engine's reveal gate honors them; the local workspace keeps the same shape in `.local/state.json` through `POST /api/sit-out`, although the local UI does not offer the button.

## Community history — October 12, 2026

Sean's ruling (D-27): "all historical guesses for all individuals should be saved in their accounts and shown in the community section, make sure you accumulate all data that's been stored", and "the spread when they guessed is the spread that their points total will be compared against."

**Screen.** Community → History (`#history`, one history entry like the other tabs). One player at a time (buttons; the viewer first, removed members kept and flagged), then one panel per week, newest first, with a Spread section and a Total section. Each section shows the submission time and, for the viewer's own ballots only, the last change, the number of revisions after submitting and where the ballot came from (group ballot, Solo, migrated from the group league, commissioner-ruled import); then the week's points out of the maximum, and one row per game: the guess, the line at the guess, the final when one is recorded, and the points. Above 720px the rows are a table with 13px headers; below it they are the comparison cards. A market with no ballot reads "No spreads ballot" / "No totals ballot" (Ben's Week 5 Total is that case, not an error); a sat-out week reads "Sat out · recorded as sat out, not zero" (also when a draft was saved before sitting out: the draft row stays stored, the week reads sat out, one entry per member and market); the viewer's own unsubmitted draft reads "Draft (not submitted)" and is shown to nobody else.

**Lines and points.** Points are the leaderboard expression, `gtl_pick_points(guess, line)` = `round(greatest(0, 10 − 2·|guess − line|), 2)`, applied only to the line saved with the guess (D-16, `scoringReferences`) or ruled for it (D-25, "commissioner-ruled line"). A submitted ballot that carries no saved line (the Week 5 ballots migrated from the group leagues) shows, per pick, the newest hosted 3-book snapshot captured at or before its submission instant, labelled **nearest snapshot at submission** and marked informational: it is never fed into points, so those ballots stay unscored rather than being scored against a later line. When no such snapshot exists the pick reads **no line stored** (with the first later snapshot named as context). Nothing is invented: no line, no timestamp (D-16).

**Reveal.** Another member's guesses, line values and per-pick points for a season/week/mode come back only once `gtl_week_revealed` says so for the viewer (own full submission, a final opt-out for that mode, or the deadline), exactly as feed posts do; until then the entry carries `picksHidden: true` and `picks: null`, and the handler strips the numbers a second time. Weekly totals are shared as they already are on the leaderboard. The last change (`updatedAt`), the revision count (`revisions`: the `ballot_edited` audit events, so draft saves and the submission itself are not revisions) and the origin (`provenance`) are derived from the private `audit` and `provenance` columns, which `gtl_read_weekly_state` keeps own-only and the feed's `submissions` never share; the reader returns them for the viewer's own ballots only, hidden or revealed, the handler nulls them again for any other member, and another player's section shows the submission time alone.

**Database.** Migration `20261012223000_gtl_community_history.sql` adds three service-only, security-invoker functions and nothing else (no table change, no row update, no new grant beyond execute to `service_role`): `gtl_pick_points(numeric, numeric)`, `gtl_history_reference(season, week, signature, game, market, submitted)` (the nearest-snapshot lookup, judged with `gtl_submission_reference` at the snapshot's own capture instant) and `gtl_read_community_history(p_user, p_season, p_now)`. Finals come from the latest `gtl_virtual_units_settlements` version per game (origin `settlement`), else the latest commissioner-reported `gtl_reviewed_result_events` final (origin `commissioner_reported`); the ledger is empty until the first settlement, so Week 5 finals may show as "No final recorded".

**Deployed state (October 12, 2026): not deployed.** The migration is a repo file only; apply it through the Supabase MCP (`apply_migration`, name `gtl_community_history`) or the SQL editor, never `db push`, and add its hosted version to the `reverted` list and `20261012223000` to the `applied` list in [step 2 of the release checklist](#release-checklist--october-9-2026) (both repair counts grow by one). The `/community/history` route ships with the next `gtl-api` deploy and the History tab with the next Pages deploy; `scripts/check-cloud-boundary.mjs` now expects the three functions and reports `unexpected 404` on the hosted project until the migration is applied. Scoring the four migrated Week 5 players against "the spread when they guessed" still needs a commissioner-ruled reference per player on the D-25 pattern (a ruled write path, not this read path); until then the History tab shows their guesses with the labelled informational line and no points.

## Automatic weekly pick window — D-24

A week's picks open at **12:00 AM America/Los_Angeles on the Monday of game week** and close at that week's TNF kickoff (the existing deadline).

**Open time.** `public.gtl_week_open_at(season, week)` and `weekOpenAt(deadline)` in `shared/nfl-schedule.mjs` both compute the Monday at or before the deadline's Pacific date at 00:00 Pacific (`date_trunc('week', deadline at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles'`; Intl in JavaScript). For a Thursday deadline that is deadline date minus three days. DST is handled by the zone conversion: Monday 00:00 PDT is 07:00 UTC, Monday 00:00 PST is 08:00 UTC, and the week after clocks change uses the new offset. The two implementations are cross-checked in `tests/week-open.test.mjs`.

**Enforcement.** A `before insert or update` trigger on `gtl_weekly_ballots` (`gtl_ballot_window`) raises `GTL_PREDICTION_NOT_OPEN` when `clock_timestamp()` is before the week's open. It covers the personal `/personal/ballot` path (`gtl_mutate_personal`), the group `/ballot` path (`gtl_save_weekly_ballot`) and any other writer; it sorts before the fresh-odds guard so a too-early save is reported as not open. Deadline and odds-reference checks are unchanged. The API returns 409 with "Week N picks open Monday 12:00 AM PT." The Home picks-due card and the Picks tab show "Week N opens Mon <date> 12:00 AM PT" with the chips disabled until then.

**Scheduler.** Same hosted pattern as the twelve-hour odds collector:

| Object | Role |
|---|---|
| `gtl_week_open_schedule` (`id='nfl-weekly'`, `enabled` default false, `endpoint`, `authorized_by`, `season`) | Administrator-managed configuration; service callers cannot change it |
| `gtl_week_open_runs` | One row per clock hour slot with the capability hash, status (`queued`, `running`, `succeeded`, `skipped`, `failed`) and reason |
| `gtl_dispatch_week_open()` | Run by pg_cron as `postgres`: mints a one-run 256-bit capability (hash stored), inserts the run, `net.http_post`s `{ runId }` with the bearer token to the Edge function |
| `gtl_claim_week_open(p_token, p_run)` | Service-role only: verifies the hash, the hour slot and a five-minute age before returning the actor and season; skips `commissioner_unavailable` if the authorized account is no longer the community commissioner |
| `gtl_complete_week_open(p_run, p_claim, p_reason)` | Records `succeeded` (published), `skipped` (`already_published`, `not_open_yet`, `no_upcoming_week`, `commissioner_unavailable`) or `failed` (`schedule_unavailable`, `slate_conflict`, `publish_failed`) |
| `gtl_read_week_open_schedule(p_user)` | Commissioner-only status for the panel |
| `supabase/functions/gtl-week-open` → `cloud/week-open.mjs` | Downloads the nflverse schedule, picks the regular-season week whose first game is the next one after now, refuses to act before that week's Monday 00:00 PT (`not_open_yet`), builds the slate with `buildSlate` and calls `gtl_publish_week` as `authorized_by`. Identical republish → `already_published` |

**Cron and DST.** Supabase pg_cron evaluates schedules in UTC, so Monday 00:00 Pacific is registered twice:

```
0 7 * * 1   gtl-week-open-monday-pdt   (00:00 PDT, mid-March to early November)
0 8 * * 1   gtl-week-open-monday-pst   (00:00 PST, early November to mid-March)
```

During PDT the 08:00 UTC job runs at 1:00 AM Pacific and ends `already_published`; during PST the 07:00 UTC job runs at Sunday 11:00 PM Pacific and the worker ends `not_open_yet`. Each run is a dated row in `gtl_week_open_runs`; no week opens early and none is missed. A manual `select public.gtl_dispatch_week_open()` at any other time is equally safe.

### Hosted state and rollback

The administrator steps (migration, function deploy, cron registration, schedule row, disabled dry run, one verified dispatch) were completed on the hosted project on October 9, 2026 and are recorded, together with what remains for Sean, in the [release checklist](#release-checklist--october-9-2026) below. The commissioner sees the status (enabled, last run) under Community → Preview / publish early (fallback) once `gtl-api` v15 and the frontend ship.

Rollback: `update public.gtl_week_open_schedule set enabled=false where id='nfl-weekly';` stops dispatch; `select cron.unschedule('gtl-week-open-monday-pdt'); select cron.unschedule('gtl-week-open-monday-pst');` removes the jobs. The window trigger stays; the manual fallback publish still opens a week.

## Team records refresh

```sh
node scripts/team-records.mjs --season 2026 --through-week 5
```

The script downloads the public nflverse schedule file, counts finals only (regular season, both scores present) and writes `shared/team-records-2026.json`. Neutral-site games count toward overall records only. The nflverse repository publishes no explicit license; records are plain facts derived from final scores and are credited to nflverse (Lee Sharpe). Re-run after each week's Monday game.

## Release checklist — October 9, 2026

One ordered list for everything in this document (D-21, D-22, D-23, D-24) and for D-25. Source: `main` at `597ab59` (PRs #10–#26). Hosted project: `onmrgvcehkflfaizvedl`. Steps 1–4 and 9 are **done** (October 9, 2026, through the Supabase MCP and SQL editor; step 9 at 17:44 UTC from the cloud session). Steps 5–8 are **pending** and are Sean's, run from the machine with the Supabase and Cloudflare logins. Fill the results into [RELEASE_2026_10_09.md](RELEASE_2026_10_09.md).

1. **Done — hosted migrations.** The eight remaining repo files were applied through the Supabase MCP (five at midday, the D-25 and D-26 files in the afternoon, the D-18 save-path fix in the evening), so the hosted migration history carries MCP-assigned versions, not the repo filenames:

   | Repo file | Hosted version |
   |---|---|
   | `20261008240000_gtl_virtual_units.sql` | `20261009110415` |
   | `20261009120000_gtl_community_feed.sql` (backfills one "joined" post per existing profile) | `20261009110525` |
   | `20261009130000_gtl_league_interest.sql` | `20261009110558` |
   | `20261009140000_gtl_d23_data_rule.sql` (opt-outs, the D-23 reader, the weekly-state opt-out field) | `20261009110656` |
   | `20261009150000_gtl_auto_open_week.sql` (ballot window trigger, scheduler tables and RPCs) | `20261009110743` |
   | `20261009160000_gtl_ruled_ballot_import.sql` (D-25 ruled-import RPC and ledger, PR #32) | `20261009174341` |
   | `20261009170000_gtl_virtual_units_settlement.sql` (D-26 settlement ledger and RPC, reader fields, PR #33) | `20261009184601` |
   | `20261009190000_gtl_virtual_units_save_isfinite.sql` (D-18 save-path fix: `isfinite(numeric)` and null quote terms, PR #40) | `20261009213204` |

   The 15 earlier hosted versions are `20261008164347`, `20261008175527`, `20261008183819`, `20261008190027`, `20261008191007`, `20261008193357`, `20261008201020`, `20261008201611`, `20261008202111` and `20261009012049` through `20261009012054`; their names match the repo files in order (the first nine files, then the six October 8 files). All 23 repo files (`main` at `7463b9b`) are therefore applied, under 23 hosted versions that differ from every filename. The D-24 ballot window (`GTL_PREDICTION_NOT_OPEN`) and the D-23 opt-out trigger are enforced on the hosted database from this point, for every writer including API v14.

2. **Do not run `npx supabase db push` as-is.** The CLI matches filename versions against hosted versions, would list every repo file as pending (all 23, applied under other versions) and try to re-run them. Pick one of the two options and stay with it:
   - Repair the hosted history once, then prove nothing is pending:
     ```sh
     npx supabase migration repair --linked --status reverted 20261008164347 20261008175527 20261008183819 20261008190027 20261008191007 20261008193357 20261008201020 20261008201611 20261008202111 20261009012049 20261009012050 20261009012051 20261009012052 20261009012053 20261009012054 20261009110415 20261009110525 20261009110558 20261009110656 20261009110743 20261009174341 20261009184601 20261009213204
     npx supabase migration repair --linked --status applied 20261008164249 20261008174007 20261008182836 20261008185715 20261008185738 20261008192528 20261008200926 20261008201000 20261008201526 20261008224444 20261008224735 20261008225401 20261008225607 20261008232055 20261008240000 20261009005145 20261009120000 20261009130000 20261009140000 20261009150000 20261009160000 20261009170000 20261009190000
     npx supabase db push --linked --include-all --dry-run   # must list nothing before db push is ever used again
     ```
   - Or keep applying each new migration file through the Supabase MCP or the SQL editor and never use `db push` for this project. The D-25, D-26 and D-18 save-path files were applied that way on October 9 and are already in both lists above; each later file adds its hosted version to the `reverted` list and its filename to the `applied` list, so both repair counts grow by one per file.

3. **Done — Edge function `gtl-week-open` v1** deployed with `verify_jwt = false` per `supabase/config.toml` (like `gtl-odds-refresh`; the per-run capability is checked in SQL). Bundle (`ezbr`) SHA-256 `bcf6044516ff009400b85fcb15e8fe9537318502991cd6a1977b8cc016b6a438`; source byte-identical to `main`.

4. **Done — D-24 administrator steps.** pg_cron jobs `gtl-week-open-monday-pdt` (`0 7 * * 1`) and `gtl-week-open-monday-pst` (`0 8 * * 1`) are registered (pg_cron and pg_net were already enabled by the odds scheduler migrations). The `gtl_week_open_schedule` row `nfl-weekly` is enabled with endpoint `https://onmrgvcehkflfaizvedl.supabase.co/functions/v1/gtl-week-open` and season 2026. The disabled dry run returned `{"status":"disabled"}`; after enabling, one verified dispatch (run `512cf7f7-6e75-4c8b-892e-3e19cea493c6`) finished `skipped` / `not_open_yet` with HTTP 200 from the worker. Week 6 opens automatically Monday 2026-10-12 at 07:00 UTC (12:00 AM PT); the manual fallback remains Community → Preview / publish early (fallback). Nothing beyond that one run is verified until the Monday slot fires.

5. **Done (October 12, 2026) — API.** `gtl-api` v15 was deployed from `main` at `17c22b5` (bundle `111c50f4…c099d48`; see the [release record](RELEASE_2026_10_09.md#october-12-deploy)); `gtl-odds-refresh` stays v1. The commands, kept for the next deploy, from the repo on `main`:
   ```sh
   git pull
   npm ci
   npx supabase functions deploy gtl-api            # ships the /community/* routes (read, like, comment, member, publish-preview, publish, sit-out, interest, week-open) and POST /virtual-units/settle (D-26)
   npx supabase functions deploy gtl-odds-refresh   # optional: its source is unchanged since v1; redeploy only to keep the bundle in step with main
   ```
   Check: signed in, `POST /functions/v1/gtl-api/community/read` with `{}` returns the feed; signed out it returns 401.

6. **Done (October 12, 2026) — frontend.** Pages `06c71c14` was deployed from `17c22b5` right after step 5; the previous production deployment `2106725d` (its deployment metadata records source `5ac3197`) stays selectable as a rollback. The commands, kept for the next deploy:
   ```sh
   npm run build:cloud
   npm run check:cloud
   npm run cloudflare -- pages deploy .local/cloud-dist --project-name guess-the-line --branch main --commit-dirty=true
   ```
   `check:cloud` is the live boundary probe (`scripts/check-cloud-boundary.mjs`). It expects `gtl_ruled_ballot_imports`, `gtl_import_ruled_ballot`, `gtl_virtual_units_settlements`, the three Virtual Units RPCs and `gtl_numeric_is_finite` on the hosted project; all of them are applied (step 9 and the [D-26 runbook](../planning/virtual-units-game.md#settlement-runbook--d-26)).

7. **Done (October 12, 2026) — post-deploy boundary probe and release manifest.** 152 live denials, 0 unexpected, at 20:43:48 UTC; manifest sourceSha256 `f47532fd…bdb16f1c20`, frontendSha256 `7e604426…dbb07e4`.
   ```sh
   node scripts/check-cloud-boundary.mjs   # live anonymous denials, including the eleven new tables, the D-25 RPC, the three Virtual Units RPCs and gtl_numeric_is_finite
   node scripts/release-manifest.mjs       # writes .local/release-manifest.json (private)
   ```
   Recorded in the v4 rows of [RELEASE_2026_10_09.md](RELEASE_2026_10_09.md) (PR #50).

8. **Pending (Sean) — team records after Week 5 finals.** After the Monday October 12 game is final:
   ```sh
   node scripts/team-records.mjs --season 2026 --through-week 5
   ```
   The committed file already says `through_week: 5` but holds only 65 finals (Weeks 1–4 plus the Week 5 Thursday game). Commit the refreshed `shared/team-records-2026.json`, then rebuild and redeploy (step 6) so the full Week 5 records ship.

9. **Done (October 9, 17:44 UTC, cloud session) — Ben's Week 5 picks (D-25), community leaderboard only.** Sean ruled on October 9 that the picks count on the shared community leaderboard and feed only; the Triple Threat roster stays Sean, Troy, Luke (no roster row, no group standings entry). The import path is the service-only, commissioner-only RPC `public.gtl_import_ruled_ballot(p_actor, p_user, p_season, p_week, p_mode, p_picks, p_submitted_at, p_ruling, p_reference)` from migration `20261009160000_gtl_ruled_ballot_import.sql`. It writes the ballot exactly as a submission-time save would, with the ruled eDraft 10:03 ET value as each game's `scoringReferences` value and `submittedAt` 2026-10-08T19:00:00Z (12:00 PM PT), records the ruling in `gtl_ruled_ballot_imports` and `gtl_access_audit`, and lets the unchanged `gtl_feed_on_ballot` trigger post `ballot_submitted` dated at that time, so the D-23 reveal gate applies as usual. `gtl_fresh_submission_guard` is bypassed only while that function is on the call stack (a transaction-local flag plus a `PG_CONTEXT` check); a direct insert, with or without the flag, is still refused. A second identical call returns `imported:false` and changes nothing; a different submitted ballot for the same key fails with `GTL_RULED_IMPORT_CONFLICT`. Applied and imported once from the cloud session after PR #32 merged: the migration is hosted version `20261009174341`; the step 9.4 select returned one row (`Ben 🫘`, 2026 / 5 / `guess_spread`, submitted 2026-10-08 19:00:00+00, decision D-25, 15 picks, 15 references, `payload_sha256` `076cbfc8bd65b03bb5b61f771227c6078c827accb9618102a95c5f772e49e223`, post `d07a0746-c4f0-4146-a6b9-7ac584fa3a6a`, 0 `sean-troy-luke` roster rows); a replay returned `imported:false`. The steps are kept for the record:
   1. **Apply the migration** (done: hosted `20261009174341`) through the Supabase MCP (`apply_migration`, name `gtl_ruled_ballot_import`, with the file's contents). It is the newest repo file, after `20261009150000_gtl_auto_open_week.sql`, and the hosted version will again differ from the filename (step 2 above). Never `db push`. Do this before step 6's `check:cloud` and step 7's boundary probe: both now expect `gtl_ruled_ballot_imports` and `gtl_import_ruled_ballot` to exist and report `unexpected 404` until it is applied. The migration is service-only and writes no data, so applying it ahead of the API deploy is safe.
   2. **Dry run** from `main`: `node scripts/import-ruled-ballot.mjs --user <Ben's auth.users id>` (profile "Ben 🫘", id starting `774b721b`; the full uuid is a command-line argument, never committed). Look up both ids first through the Supabase MCP (`execute_sql`): `select user_id from public.gtl_memberships where league_id='sean-troy-luke' and role='commissioner' and active;` (the commissioner, one row) and `select user_id, display_name from public.gtl_profiles where display_name='Ben 🫘' or user_id::text like '774b721b%';` (Ben, one row). It checks `data/picks/2026-week-05-ben.json` (sha256 `538b007d…`, unchanged) against the committed Week 5 slate and the ruled snapshot and prints counts and hashes only: 15 games, 15 picks, 15 references, expected 37.6 of 150, submitted 2026-10-08T19:00:00Z. It never prints a pick.
   3. **Import**, one of:
      - Script (Sean, or the cloud session with the key in its environment): `SUPABASE_URL=https://onmrgvcehkflfaizvedl.supabase.co SUPABASE_SERVICE_ROLE_KEY=<from the project's API settings, never from a file> node scripts/import-ruled-ballot.mjs --user <uuid> --execute`. The actor is resolved from `gtl_memberships` (the `sean-troy-luke` commissioner) unless `--actor <uuid>` is passed. The printed result carries counts, the `payloadSha256` and the feed `postId`, never picks.
      - Supabase MCP `execute_sql`: `node scripts/import-ruled-ballot.mjs --user <Ben uuid> --actor <commissioner uuid> --sql` writes the exact statement to `.local/ruled-ballot-import.sql` (private, mode 0600, it contains the picks; `.local/` is never committed). `--sql` refuses to run without `--actor`, so the file is executable as written and never carries a placeholder. Paste its one statement into `execute_sql`. Its shape: `select public.gtl_import_ruled_ballot('<commissioner uuid>'::uuid, '<Ben uuid>'::uuid, 2026, 5, 'guess_spread', '<p_picks>'::jsonb, '2026-10-08T19:00:00.000Z'::timestamptz, '<p_ruling>', '<p_reference>'::jsonb) as result;`
   4. **Verify** with the select the dry run prints (counts, never pick values):
      ```sql
      select i.user_id, p.display_name, i.season, i.week, i.mode, i.submitted_at, i.decision, i.payload_sha256,
        (select count(*) from jsonb_object_keys(b.ballot->'picks')) as picks, (select count(*) from jsonb_object_keys(b.ballot->'scoringReferences')) as "references",
        (select id from public.gtl_feed_posts f where f.dedupe_key=format('ballot:%s:%s:%s:%s',i.user_id,i.season,i.week,i.mode)) as post_id,
        (select count(*) from public.gtl_memberships m where m.user_id=i.user_id) as roster_rows
      from public.gtl_ruled_ballot_imports i join public.gtl_profiles p on p.user_id=i.user_id
      join public.gtl_weekly_ballots b on (b.user_id,b.season,b.week,b.mode)=(i.user_id,i.season,i.week,i.mode) order by i.recorded_at;
      ```
      Expect one row: `Ben 🫘`, 2026 / 5 / guess_spread, `submitted_at` 2026-10-08 19:00:00+00, decision D-25, picks 15, references 15, a `post_id`, `roster_rows` 0. Signed in as Sean, `POST /functions/v1/gtl-api/community/read` then lists Ben in `standings` (guess_spread, weekPoints 37.6, weekScored 15), in `submissions`, and a `ballot_submitted` post dated 2026-10-08T19:00:00Z. Record the hosted migration version, the `payload_sha256` and the post id in [RELEASE_2026_10_09.md](RELEASE_2026_10_09.md).
   Errors: `GTL_COMMUNITY_FORBIDDEN` (the actor is not the commissioner), `GTL_COMMUNITY_MEMBER` (no profile for that user id), `GTL_RULED_IMPORT_CONFLICT` (a different submitted ballot already exists; stop and reconcile by hand), `GTL_SLATE_CONFLICT`, `GTL_BALLOT_INCOMPLETE`, `GTL_BALLOT_INVALID`, `GTL_RULED_IMPORT_INVALID` (window, reference or ruling text).

Week 6 needs no manual publish: step 4 opens it. If the Monday run does not end `succeeded`, publish it by hand (Community → Preview / publish early (fallback) → Review schedule → Publish Week 6; before the frontend deploy, `POST /community/publish-preview` then `/community/publish` with `{"season":2026,"week":6}` signed in as Sean) and read `select status,reason,finished_at from public.gtl_week_open_runs order by created_at desc limit 1;` to see why.

## Coming soon leagues — D-22

| Part | Status |
|---|---|
| League switcher on the Community home: NFL (live, selected) plus NBA, MLB, NHL, College Football, College Basketball as "Coming soon" | Built; browser-tested at 390px and 1280px. Choosing a coming-soon league shows only its card |
| "Coming soon" section on the Feed tab: one card per league with a typical season window and a "Notify me" toggle | Built. The toggle changes only after the server confirms |
| Saved interest (`gtl_league_interest`, migration `20261009130000_gtl_league_interest.sql`) | Built and tested. Account-level; counts include current members only |
| Games, picks, schedules or odds for these leagues | None. Season windows are typical timing, not dates for a specific season. No league logos are used |

| Route | Body | Result |
|---|---|---|
| `/community/interest` | `{ league: "nba" \| "mlb" \| "nhl" \| "cfb" \| "cbb", notify: true/false }` | league, notify, count |

`/community/read` also returns `interests` (the viewer's leagues with Notify me on) and `interestCounts` (members per league).

Deploy: `20261009130000_gtl_league_interest.sql` is applied on the hosted project (hosted version `20261009110558`); `/community/interest` ships with the `gtl-api` deploy and the frontend deploy in the [release checklist](#release-checklist--october-9-2026). Nobody is notified automatically yet. The saved interest records who asked.

## Deployed state

Deployed from the cloud session on October 9, 2026, through the Supabase MCP: the five hosted migrations, `gtl-week-open` v1, both Monday cron jobs and the enabled `nfl-weekly` schedule row. Deployed from the Mac mini on October 12, 2026 (steps 5–7 above): `gtl-api` v15 and Pages `06c71c14`, both from `main` at `17c22b5`; see the [October 12 section of the release record](RELEASE_2026_10_09.md#october-12-deploy). The live site now has the Community screens, chips, sit-out and coming-soon leagues on top of the hosted database's D-24 window, D-23 opt-out trigger and backfilled "joined" posts. `main` has since added PR #35 and PR #47, and PR #36 is held for a second deploy after its own pre-flight.

*October 12, 2026:* migration `20261012213000_gtl_submission_odds_window.sql` (branch `claude/fix-submission-odds-window`: five-minute collect cooldown, six collections per UTC day, and scheduled/manual collection from the published week instead of the group league, which is why both October 12 scheduled runs skipped with `slate_changed`) is **not applied to the hosted project**. It waits for Sean's ruling on the constants (pending entry in [DECISIONS.md](DECISIONS.md)). When it is applied through the Supabase MCP, its hosted version joins the `reverted` list and its filename the `applied` list in step 2 above; never `db push`.

October 12, 2026 addition, also not deployed: migration `20261012223000_gtl_community_history.sql`, the `/community/history` route and the History tab (D-27, see [Community history](#community-history--october-12-2026)). The migration must be applied hosted before the `gtl-api` deploy that carries the route, or the tab reports the history as unavailable.
