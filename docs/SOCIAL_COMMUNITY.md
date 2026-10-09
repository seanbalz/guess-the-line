# Social community and feed — D-21 and D-23

Owner: Sean Balsiger · Version 3 · Updated 2026-10-09 · Decisions D-21, D-23, D-24

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
| Automatic week opening (D-24) | Built and tested on PGlite; hosted cron registration is an administrator step below. Not enabled by default |
| Team records (overall, home, road) | `shared/team-records.mjs` and `shared/team-records-2026.json` from nflverse finals |
| Community home (feed, picks-due card, leaderboard, likes, comments, Publish Week panel) | Built; browser-tested at 390px and 1280px |
| Picks tab: button entry (favorite team or Pick'em, then half-point chips 1–10, More for 10.5–20, −/+ 0.5) and team records under each game | Built; saves through the league-free weekly ballot |
| Group game screens (`PredictionEntry`) | Use the same `ChipPicker` button entry and team records under each matchup; the favorite dropdown, typed number and −/+ stepper are removed. Draft recovery, per-field conflicts, search and filter, Next game focus, review and submit, closed states and the signed home-spread contract are unchanged |
| Challenge and Units in the leaderboard strip | Not included; those records stay inside each group |
| Score-change and weekly-winner posts | Not built yet; they need the scoring engine's results |

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

### Administrator deploy steps (never run from the cloud session)

1. `npx supabase db push` to apply `20261009150000_gtl_auto_open_week.sql`. The ballot window is enforced from this point for every published week.
2. `npx supabase functions deploy gtl-week-open` (`verify_jwt = false` in `supabase/config.toml`, like `gtl-odds-refresh`; the per-run capability is checked in SQL).
3. In the SQL editor, register the two jobs (pg_cron and pg_net are already enabled by the odds scheduler migrations):
   ```sql
   select cron.schedule('gtl-week-open-monday-pdt','0 7 * * 1',$$select public.gtl_dispatch_week_open()$$);
   select cron.schedule('gtl-week-open-monday-pst','0 8 * * 1',$$select public.gtl_dispatch_week_open()$$);
   ```
4. Insert the disabled configuration row, then verify a dry run returns `{"status":"disabled"}`:
   ```sql
   insert into public.gtl_week_open_schedule(id,enabled,endpoint,authorized_by,season)
     values('nfl-weekly',false,'https://<project-ref>.supabase.co/functions/v1/gtl-week-open','<Sean''s auth.users id>',2026);
   select public.gtl_dispatch_week_open();
   ```
5. Enable it and run one verified dispatch: `update public.gtl_week_open_schedule set enabled=true where id='nfl-weekly'; select public.gtl_dispatch_week_open();` Then read `select status,reason,finished_at from public.gtl_week_open_runs order by created_at desc limit 1;` — off the Monday slot it ends `skipped / not_open_yet` or `skipped / already_published`; on the slot it ends `succeeded` and a "Week N is open" post appears. Nothing beyond this one run is verified until the first Monday fires.
6. The commissioner sees the status (enabled, last run) under Community → Preview / publish early (fallback).

Rollback: `update public.gtl_week_open_schedule set enabled=false where id='nfl-weekly';` stops dispatch; `select cron.unschedule('gtl-week-open-monday-pdt'); select cron.unschedule('gtl-week-open-monday-pst');` removes the jobs. The window trigger stays; the manual fallback publish still opens a week.

## Team records refresh

```sh
node scripts/team-records.mjs --season 2026 --through-week 5
```

The script downloads the public nflverse schedule file, counts finals only (regular season, both scores present) and writes `shared/team-records-2026.json`. Neutral-site games count toward overall records only. The nflverse repository publishes no explicit license; records are plain facts derived from final scores and are credited to nflverse (Lee Sharpe). Re-run after each week's Monday game.

## Deploy checklist (run from the machine with the Supabase and Cloudflare logins)

1. Merge the PR and pull `main`.
2. `npx supabase db push` to apply `20261009120000_gtl_community_feed.sql` (it backfills one "joined" post per existing profile) and `20261009140000_gtl_d23_data_rule.sql` (opt-outs, the D-23 reader and the weekly-state opt-out field).
3. `npx supabase functions deploy gtl-api` to ship the `/community/*` routes, including `/community/sit-out`.
4. Check: signed in, `POST /functions/v1/gtl-api/community/read` with `{}` returns your feed. Signed out, it returns 401.
5. Publish Week 6: in the app, Community → Preview / publish early (fallback) → Review schedule → Publish Week 6. (Before the frontend deploy, the same can be done with `POST /community/publish-preview` and then `/community/publish` with `{"season":2026,"week":6}` while signed in as Sean.) Members then submit through the league-free weekly ballot (`/personal/ballot`) once the week's Monday 00:00 PT open has passed (D-24). Later weeks open automatically once the D-24 administrator steps above are complete.
6. Frontend deploy only after the feed screen PR merges: `npm run build:cloud`, then `npm run cloudflare`.
7. Record the release (commit, migration, function version) in a new `docs/RELEASE_*.md`.

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

Deploy: `npx supabase db push` applies `20261009130000_gtl_league_interest.sql`, then `npx supabase functions deploy gtl-api` and the frontend deploy as above. Nobody is notified automatically yet. The saved interest records who asked.

Nothing in this document has been deployed from the cloud session.
