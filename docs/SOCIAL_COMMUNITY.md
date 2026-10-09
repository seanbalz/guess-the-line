# Social community and feed — D-21

Owner: Sean Balsiger · Version 1 · Updated 2026-10-09 · Decision D-21

## What is built

| Part | Status |
|---|---|
| One community of every profile, commissioner removal | Database and API built and tested |
| Activity feed: joined, ballot submitted, Bet Tracker bet posted and settled | Built and tested; posts are created automatically by database triggers |
| Likes and comments (1–500 characters, safe retry) | Built and tested |
| Guess picks inside feed posts | Shown only to the author, to viewers who submitted the same season/week/mode ballot, or to everyone after the deadline |
| Who has submitted this week | Shown to everyone, without numbers |
| Picks due for the viewer: Spread and Total | `due`, then `urgent` within 2 hours of the deadline, then `closed`, or `done` |
| Publish Week (commissioner) | `/community/publish-preview` shows the nflverse slate for review; `/community/publish` adds the slate, schedule template, a "Week N is open" post and moves the 12-hour odds collector. Identical republish is a no-op; a different slate for a published week is refused |
| Team records (overall, home, road) | `shared/team-records.mjs` and `shared/team-records-2026.json` from nflverse finals |
| Community home (feed, picks-due card, leaderboard, likes, comments, Publish Week panel) | Built; browser-tested at 390px and 1280px |
| Picks tab: button entry (favorite team or Pick'em, then half-point chips 1–10, More for 10.5–20, −/+ 0.5) and team records under each game | Built; saves through the league-free weekly ballot |
| Group game screens (`PredictionEntry`) | Use the same `ChipPicker` button entry and team records under each matchup; the favorite dropdown, typed number and −/+ stepper are removed. Draft recovery, per-field conflicts, search and filter, Next game focus, review and submit, closed states and the signed home-spread contract are unchanged |
| Challenge and Units in the leaderboard strip | Not included; those records stay inside each group |
| Score-change and weekly-winner posts | Not built yet; they need the scoring engine's results |

Practice ballots never post. Removed members, and their posts, comments and submissions, disappear from everyone's feed. Restoring a member brings them back. Removals and restorations are written to `gtl_access_audit`. The commissioner is the active commissioner of the founding `sean-troy-luke` league.

## API (Supabase Edge Function `gtl-api`, POST, signed-in and email-confirmed)

| Route | Body | Result |
|---|---|---|
| `/community/read` | `{ before?: ISO time, limit?: 1–100 }` | members, week, due, picksDue, submissions, standings, posts |
| `/community/like` | `{ postId, like: true/false }` | likes, likedByMe |
| `/community/comment` | `{ requestId, postId, body }` | id, replayed |
| `/community/member` | `{ userId, member: true/false }` (commissioner only) | userId, member |
| `/community/publish-preview` | `{ season, week }` (commissioner only) | the slate built from nflverse, with nothing saved |
| `/community/publish` | `{ season, week }` (commissioner only) | the slate plus `published: true`, or `false` if it was already published |

The handler passes the request time to the database, so the deadline reveal and the picks-due state use one clock. It also strips pick values from any post marked hidden.

## Team records refresh

```sh
node scripts/team-records.mjs --season 2026 --through-week 5
```

The script downloads the public nflverse schedule file, counts finals only (regular season, both scores present) and writes `shared/team-records-2026.json`. Neutral-site games count toward overall records only. The nflverse repository publishes no explicit license; records are plain facts derived from final scores and are credited to nflverse (Lee Sharpe). Re-run after each week's Monday game.

## Deploy checklist (run from the machine with the Supabase and Cloudflare logins)

1. Merge the PR and pull `main`.
2. `npx supabase db push` to apply `20261009120000_gtl_community_feed.sql`. It backfills one "joined" post per existing profile.
3. `npx supabase functions deploy gtl-api` to ship the `/community/*` routes.
4. Check: signed in, `POST /functions/v1/gtl-api/community/read` with `{}` returns your feed. Signed out, it returns 401.
5. Publish Week 6: in the app, Community → Publish a week → Review schedule → Publish Week 6. (Before the frontend deploy, the same can be done with `POST /community/publish-preview` and then `/community/publish` with `{"season":2026,"week":6}` while signed in as Sean.) Members then submit through the league-free weekly ballot (`/personal/ballot`).
6. Frontend deploy only after the feed screen PR merges: `npm run build:cloud`, then `npm run cloudflare`.
7. Record the release (commit, migration, function version) in a new `docs/RELEASE_*.md`.

Nothing in this document has been deployed from the cloud session.
