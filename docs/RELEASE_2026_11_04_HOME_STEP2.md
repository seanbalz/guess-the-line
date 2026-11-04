# Release record: D-69 step 2, Home, frontend Pages `beab6d1b` — November 4, 2026

This was one frontend release, from `main` at `7bb83a5b`, the merge of
[#482](https://github.com/seanbalz/guess-the-line/pull/482). Home becomes layout H1A: the next-move card, six kit tiles,
This week as game tiles, and the Who's in layer at `#home?layer=who`. The PR body and the
[completion register](COMPLETION_REGISTER.md) describe the change. The release card is a
[comment on #482](https://github.com/seanbalz/guess-the-line/pull/482#issuecomment-6636089745).

Sean's approvals (November 4, 2026), in the operating session:

- **"Yes, merge #482"**, answering "Do Home step 2's 390 px captures in PR #482 look right to merge?". #482 was already
  merged (13:24:40 UTC, under Sean's account) when this answer arrived.
- **"Yes, release it"**, answering "Release Home step 2 to the live site now?".
- The session approved both production gates after checking that each run title named this mode, `frontend` and
  `7bb83a5b`.

## Release

- **Source:** `main` at `7bb83a5b449e853176433a5532c456b8880f4d4e`.
  - Since the live frontend `68019b3e`, #482's merge is the only commit that changes `web/`.
  - #482 changes only `web/src/next/`, tests and docs. Nothing in `supabase/`, `shared/` or the workers changed.
- **CI on `7bb83a5b`:** all 12 check runs succeeded (Tests 41837843424, Brand QA 41837843813, Dashboard checks
  41837843840).
- **Runs:**
  - check-only [41863935353](https://github.com/seanbalz/guess-the-line/actions/runs/41863935353).
  - readiness [41866238155](https://github.com/seanbalz/guess-the-line/actions/runs/41866238155).
  - deploy [41868177237](https://github.com/seanbalz/guess-the-line/actions/runs/41868177237), `deploy` · `frontend`.
  - All succeeded. Every dispatch succeeded on the first try.
- **Release lane:** this session was the only release captain. The step 3 session was told not to dispatch.
- **Hosted:**
  - Pages deployment `beab6d1b-1c26-4b14-9d15-58c2b5a03c7c` (`https://beab6d1b.guess-the-line.pages.dev`).
  - The release verify step (checked at 16:34:28 UTC) matched 125 assets per URL, with frontend digest
    `06a79112d0441bab1d14361e586484074d9138d10543d9f986b8274b264ddb79`.
  - `gtl-api` is unchanged: v50, bundle `c5ed571b…`.
- **Migrations:** none. History digest `d40fdad9eb144738cdbd032e3c95ba433b4cb1606f3de3ab8079f0df1b8108f1`, unchanged.
- **Rollback:** redeploy `frontend` from `68019b3ea9cb2d188ede71d658b960b397daf172` (run 41810080997).

## Readback

**Live bytes** (executed, signed out, about 16:40 UTC). The production entry and its 27 lazy chunks were fetched from
`https://guess-the-line.pages.dev`. The new app chunk contains "Your next move", "Pick streak" and "Who’s in". "Who’s in"
is new in #482; no file under `web/src` at `68019b3e` has it.

**Hosted logs** (executed, 16:35 to about 16:45 UTC):

- No signed-in `gtl-api` request arrived yet, so `GET /personal` from the new Home is not yet observed.
- There are 401s on `push/status`, `push/subscribe`, `push/unsubscribe` and `gtl-push-reminders` at 16:28, 16:33 and
  16:34 UTC. These are the release runs' signed-out boundary probes: the user agent is `node`, and the minutes match
  this readiness and deploy. The quick-wins release left the same pattern at 09:47 to 09:51 UTC.

**Not checked:** signed in, and on a real phone. When a player opens Home, check the hosted logs for `GET /personal`
status, latency and Edge CPU.

## Left for later

The #482 follow-ups, unchanged by this release:

- The week inputs are duplicated between `weekGames` and PerGamePlay.
- Skeleton heights for the 320 px, done and closed states.
- Leftover dead code: `HomeSummaries.jsx`, `ResearchPreview.jsx` and Play's `homeTiles` slot.
