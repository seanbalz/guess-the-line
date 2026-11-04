# D-69 overhaul step 1 (Play) frontend release — November 4, 2026

Released November 4, 2026 at 06:42:15 UTC (10:42 PM PST, November 3): **frontend only**, from `main` at
`a10d28e9cdb0fdb20c323ad71b9c07893c41a35b`. That commit carries step 1 (PR #473, merged by Sean as `59a2a2ef`) together
with the design fixes (PR #474) and D-77 (PR #472) in one run. This note covers step 1. The "Guess the Line repo and
Codex sessions" session ran the release and keeps the run's own record (#474, D-77, the run as a whole). No migration,
Edge Function or server change.

## Approval

- Sean wrote "Release step 1" in the step 1 session after seeing the 390 px Light and Dark captures.
- For the batch, Sean told the release session "Ship all three". He approved the readiness gate in GitHub. The release
  session approved the deploy gate on his in-session "Approve it for me". Both come from that session's report; this
  session did not see those messages.

## What shipped for step 1 (PR #473)

Every Play section is a nesting card under a "Play" lip, with its own address:

- the landing's next-ballot card and six tiles (P1B);
- Your score and its game layer (P2B);
- Compare, one member at a time (P3B);
- Guess the Points slot tiles and slot layers (P4A);
- Badges and awards, grid first (P5A);
- League, board first, with the feed, History and week layers (P6A).

Bullseye, Week final, Whole week locked, Points exact, rank moments and the Pick streak play through the moments
engine. None plays on launch; each waits as NEW on its landing tile. The old picks fallback (`CommunityHome.jsx`
WeekPicks) and League history (`CommunityHistory.jsx`) are no longer imported. Build decisions still open for Sean's
review are listed in the D-69 addendum in [DECISIONS](DECISIONS.md). Build evidence is in the
[register entry](COMPLETION_REGISTER.md).

Step 1 changes no server route. The new Play reads routes that were already live: `/personal`, `/personal/read`,
`/community/read`, `/community/history`, `/league/features`, `/league/feed`, `/league/comparison` and `/points/read`.

## Gates

| Gate | Run | Result |
| --- | --- | --- |
| Exact-source CI on `a10d28e9` | Tests [41783832769](https://github.com/seanbalz/guess-the-line/actions/runs/41783832769), Dashboard [41783832773](https://github.com/seanbalz/guess-the-line/actions/runs/41783832773), Brand [41783832748](https://github.com/seanbalz/guess-the-line/actions/runs/41783832748) | All passed |
| Check-only | [41785547679](https://github.com/seanbalz/guess-the-line/actions/runs/41785547679) | Passed |
| Readiness | [41785590106](https://github.com/seanbalz/guess-the-line/actions/runs/41785590106) | Passed at 06:38 UTC |
| Deploy | [41787052379](https://github.com/seanbalz/guess-the-line/actions/runs/41787052379) | Frontend deployed 06:42:15 UTC; verify passed at 06:43:07 UTC |

The step 1 merge commit `59a2a2ef` also passed its own `push` CI, but it was not released on its own. Releasing it
after `a10d28e9` would have rolled D-77 back.

## What is live

- **Frontend:** Pages **`62e6b278-5f48-4d66-ba12-873497e22248`**. 127 production assets matched the build (frontend
  SHA-256 `e0b6e1335cc480a8868c0137456ff4548c80ff2695603bde5065c45f5c97d130`), per the deploy run. The previous Pages
  was `60fffc36` from `7a10cbd3`.
- **Checked by this session after the deploy:**
  - `https://guess-the-line.pages.dev/` serves entry `index-yhey1K9m.js`. Its new-app chunk `NextApp-btUS1fEq.js` carries
    step 1's nesting lip (`gx-nest-lip`), the Play tiles (`data-play-tile`), the guess reveal (`gx-play-reveal`) and
    the `personal/read` call.
- **API and migrations:** `gtl-api` v50 and the migration history (76 rows, digest `d40fdad9…`) are unchanged, per the
  release session.

## Signed-in readback

- **After the deploy (06:42:15–06:47 UTC):** the only `gtl-api` requests were the deploy run's signed-out probes, all
  401. No browser has called the API since the release. No "CPU Time exceeded" or worker-limit message was logged.
- **Baseline, the 24 hours before the deploy:** signed-in browser calls to the routes the new Play reads all returned
  200 (204 for CORS preflights), with no errors:

  | Route | Calls |
  | --- | --- |
  | `/personal/read` | 55 |
  | `/personal` | 76 |
  | `/community/read` | 115 |
  | `/community/history` | 6 |
  | `/league/features` | 60 |
  | `/points/read` | 41 |
  | `/league/comparison` | 5 |
  | `/league/feed` | 1 |

- **Still to do:** a readback of the first signed-in visit to the new Play.

## Not verified

- No signed-in use of the released Play yet.
- No real iPhone check of Play's layers, moments or NEW pills. Sean's iPhone check stands in for device acceptance
  (spec section 10). His step 0 iPhone check is not recorded either.

## Rollback

Redeploy the frontend from `7a10cbd3` (Pages `60fffc36`) through the protected workflow. That also takes out #474 and
D-77, which shipped in the same run. No data needs restoring: step 1 adds no server writes, and the moments engine keeps
its seen marks on the device.
