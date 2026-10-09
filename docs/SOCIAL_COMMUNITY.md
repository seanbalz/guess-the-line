# Social community and feed — D-21 and D-23

Owner: Sean Balsiger · Version 4 · Updated 2026-10-09 (hosted state and the single release checklist) · Decisions D-21, D-22, D-23, D-24

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

The handler passes the request time to the database, so the deadline reveal, the sit-out cutoff and the picks-due state use one clock. It also strips pick values from any post marked hidden. `picksDue` carries `opensAt` (the week's Monday 00:00 PT) alongside `deadline`. Group game screens read opt-outs through `gtl_read_weekly_state` (`state.optOuts`), and the league engine's reveal gate honors them; the local workspace keeps the same shape in `.local/state.json` through `POST /api/sit-out`, although the local UI does not offer the button.

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

One ordered list for everything in this document (D-21, D-22, D-23, D-24) and for D-25. Source: `main` at `597ab59` (PRs #10–#26). Hosted project: `onmrgvcehkflfaizvedl`. Steps 1–4 are **done** (October 9, 2026, through the Supabase MCP and SQL editor). Steps 5–9 are **pending** and are Sean's, run from the machine with the Supabase and Cloudflare logins. Fill the results into [RELEASE_2026_10_09.md](RELEASE_2026_10_09.md).

1. **Done — hosted migrations.** The five remaining repo files were applied through the Supabase MCP, so the hosted migration history carries MCP-assigned versions, not the repo filenames:

   | Repo file | Hosted version |
   |---|---|
   | `20261008240000_gtl_virtual_units.sql` | `20261009110415` |
   | `20261009120000_gtl_community_feed.sql` (backfills one "joined" post per existing profile) | `20261009110525` |
   | `20261009130000_gtl_league_interest.sql` | `20261009110558` |
   | `20261009140000_gtl_d23_data_rule.sql` (opt-outs, the D-23 reader, the weekly-state opt-out field) | `20261009110656` |
   | `20261009150000_gtl_auto_open_week.sql` (ballot window trigger, scheduler tables and RPCs) | `20261009110743` |

   The 15 earlier hosted versions are `20261008164347`, `20261008175527`, `20261008183819`, `20261008190027`, `20261008191007`, `20261008193357`, `20261008201020`, `20261008201611`, `20261008202111` and `20261009012049` through `20261009012054`; their names match the repo files in order (the first nine files, then the six October 8 files). 20 of the 21 repo files are therefore applied, under 20 hosted versions that differ from every filename; the 21st, `20261009160000_gtl_ruled_ballot_import.sql` (D-25), is pending until step 9.1 applies it. The D-24 ballot window (`GTL_PREDICTION_NOT_OPEN`) and the D-23 opt-out trigger are enforced on the hosted database from this point, for every writer including API v14.

2. **Do not run `npx supabase db push` as-is.** The CLI matches filename versions against hosted versions, would list every repo file as pending (all 21: the 20 applied under other versions plus the D-25 file) and try to re-run them. Pick one of the two options and stay with it:
   - Repair the hosted history once, then prove nothing is pending:
     ```sh
     npx supabase migration repair --linked --status reverted 20261008164347 20261008175527 20261008183819 20261008190027 20261008191007 20261008193357 20261008201020 20261008201611 20261008202111 20261009012049 20261009012050 20261009012051 20261009012052 20261009012053 20261009012054 20261009110415 20261009110525 20261009110558 20261009110656 20261009110743
     npx supabase migration repair --linked --status applied 20261008164249 20261008174007 20261008182836 20261008185715 20261008185738 20261008192528 20261008200926 20261008201000 20261008201526 20261008224444 20261008224735 20261008225401 20261008225607 20261008232055 20261008240000 20261009005145 20261009120000 20261009130000 20261009140000 20261009150000
     npx supabase db push --linked --include-all --dry-run   # must list nothing before db push is ever used again
     ```
   - Or keep applying each new migration file through the Supabase MCP or the SQL editor and never use `db push` for this project. Each file applied that way later (first `20261009160000_gtl_ruled_ballot_import.sql`, step 9.1) adds its hosted version to the `reverted` list and its filename to the `applied` list above, so both repair counts grow by one per file.

3. **Done — Edge function `gtl-week-open` v1** deployed with `verify_jwt = false` per `supabase/config.toml` (like `gtl-odds-refresh`; the per-run capability is checked in SQL). Bundle (`ezbr`) SHA-256 `bcf6044516ff009400b85fcb15e8fe9537318502991cd6a1977b8cc016b6a438`; source byte-identical to `main`.

4. **Done — D-24 administrator steps.** pg_cron jobs `gtl-week-open-monday-pdt` (`0 7 * * 1`) and `gtl-week-open-monday-pst` (`0 8 * * 1`) are registered (pg_cron and pg_net were already enabled by the odds scheduler migrations). The `gtl_week_open_schedule` row `nfl-weekly` is enabled with endpoint `https://onmrgvcehkflfaizvedl.supabase.co/functions/v1/gtl-week-open` and season 2026. The disabled dry run returned `{"status":"disabled"}`; after enabling, one verified dispatch (run `512cf7f7-6e75-4c8b-892e-3e19cea493c6`) finished `skipped` / `not_open_yet` with HTTP 200 from the worker. Week 6 opens automatically Monday 2026-10-12 at 07:00 UTC (12:00 AM PT); the manual fallback remains Community → Preview / publish early (fallback). Nothing beyond that one run is verified until the Monday slot fires.

5. **Pending (Sean) — API.** `gtl-api` is still v14 and `gtl-odds-refresh` is v1. From the repo on `main`:
   ```sh
   git pull
   npm ci
   npx supabase functions deploy gtl-api            # ships the /community/* routes: read, like, comment, member, publish-preview, publish, sit-out, interest, week-open
   npx supabase functions deploy gtl-odds-refresh   # optional: its source is unchanged since v1; redeploy only to keep the bundle in step with main
   ```
   Check: signed in, `POST /functions/v1/gtl-api/community/read` with `{}` returns the feed; signed out it returns 401.

6. **Pending (Sean) — frontend.** Pages is still `2106725d` from `30d331e`. Right after step 5:
   ```sh
   npm run build:cloud
   npm run check:cloud
   npm run cloudflare -- pages deploy .local/cloud-dist --project-name guess-the-line --branch main --commit-dirty=true
   ```
   `check:cloud` is the live boundary probe (`scripts/check-cloud-boundary.mjs`). From this merge it also expects `gtl_ruled_ballot_imports` and `gtl_import_ruled_ballot` on the hosted project, so apply step 9.1 first; until then it stops with `unexpected 404` for both.

7. **Pending (Sean) — post-deploy boundary probe and release manifest.**
   ```sh
   node scripts/check-cloud-boundary.mjs   # live anonymous denials, now including the ten new tables and the D-25 RPC; needs step 9.1 applied first, otherwise unexpected 404
   node scripts/release-manifest.mjs       # writes .local/release-manifest.json (private)
   ```
   Record the Pages deployment id, the `gtl-api` version and the manifest hashes in the PENDING rows of [RELEASE_2026_10_09.md](RELEASE_2026_10_09.md).

8. **Pending (Sean) — team records after Week 5 finals.** After the Monday October 12 game is final:
   ```sh
   node scripts/team-records.mjs --season 2026 --through-week 5
   ```
   The committed file already says `through_week: 5` but holds only 65 finals (Weeks 1–4 plus the Week 5 Thursday game). Commit the refreshed `shared/team-records-2026.json`, then rebuild and redeploy (step 6) so the full Week 5 records ship.

9. **Pending (after merge) — Ben's Week 5 picks (D-25), community leaderboard only.** Sean ruled on October 9 that the picks count on the shared community leaderboard and feed only; the Triple Threat roster stays Sean, Troy, Luke (no roster row, no group standings entry). The import path is the service-only, commissioner-only RPC `public.gtl_import_ruled_ballot(p_actor, p_user, p_season, p_week, p_mode, p_picks, p_submitted_at, p_ruling, p_reference)` from migration `20261009160000_gtl_ruled_ballot_import.sql`. It writes the ballot exactly as a submission-time save would, with the ruled eDraft 10:03 ET value as each game's `scoringReferences` value and `submittedAt` 2026-10-08T19:00:00Z (12:00 PM PT), records the ruling in `gtl_ruled_ballot_imports` and `gtl_access_audit`, and lets the unchanged `gtl_feed_on_ballot` trigger post `ballot_submitted` dated at that time, so the D-23 reveal gate applies as usual. `gtl_fresh_submission_guard` is bypassed only while that function is on the call stack (a transaction-local flag plus a `PG_CONTEXT` check); a direct insert, with or without the flag, is still refused. A second identical call returns `imported:false` and changes nothing; a different submitted ballot for the same key fails with `GTL_RULED_IMPORT_CONFLICT`. Nothing was applied or imported from the cloud session before merge. Run, in order:
   1. **Apply the migration** through the Supabase MCP (`apply_migration`, name `gtl_ruled_ballot_import`, with the file's contents). It is the newest repo file, after `20261009150000_gtl_auto_open_week.sql`, and the hosted version will again differ from the filename (step 2 above). Never `db push`. Do this before step 6's `check:cloud` and step 7's boundary probe: both now expect `gtl_ruled_ballot_imports` and `gtl_import_ruled_ballot` to exist and report `unexpected 404` until it is applied. The migration is service-only and writes no data, so applying it ahead of the API deploy is safe.
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

Deployed from the cloud session on October 9, 2026, through the Supabase MCP: the five hosted migrations, `gtl-week-open` v1, both Monday cron jobs and the enabled `nfl-weekly` schedule row. Not deployed: `gtl-api` v15 (the `/community/*` routes) and the frontend (Pages is still `2106725d`); those are Sean's steps 5–7 above. Until then the live site at API v14 has no Community screens, chips, sit-out or coming-soon leagues, while the hosted database already enforces the D-24 window and the D-23 opt-out trigger and already holds one backfilled "joined" post per profile.
