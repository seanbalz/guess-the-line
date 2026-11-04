# Release record: D-69 step 3, Research, frontend Pages `a73e79f7` — November 4, 2026

This was one frontend release, from `main` at `87372514`, the merge of
[#486](https://github.com/seanbalz/guess-the-line/pull/486). Research is rebuilt as tiles and rows:
- **Landing:** the next-move card and four tiles (Games, Trends, Fantasy, Teams).
- **Games:** picture rows. One game opens as a layer.
- **Teams:** a list. One team opens as a layer.
- **Trends:** count-ups and a chart reveal.
- **Fantasy:** the report card as tiles and rows.

The PR body and the [completion register](COMPLETION_REGISTER.md) describe the change. The release card is a
[comment on #486](https://github.com/seanbalz/guess-the-line/pull/486#issuecomment-6641309404).

Sean's approvals (November 4, 2026):

- **"Deploy when ready"**, in the step 3 design session.
- **"Deploy"**, twice, in the operating session. The second time, the step 3 PR was not open yet. This session armed a
  script to release on the merge, and the design session opened the PR with merge-when-green on.
- The design session sent Sean the 390 px screenshots before the merge.
- This session approved both production gates after checking that each run title named this mode, `frontend` and
  `87372514`.

**Changes after the screenshots.** Two CI fixes, `c0ca3ee0` and `cbac055f`, landed after the screenshots. CI's Linux
fallback fonts are wider than the webfonts, and these fixes were for them:

- Trend names wrap instead of clipping. In wide faces, a name can break mid-word beside the 80 px sparkline.
- The game layer's stat tile value is 20 px at 359 px wide and below, down from 24 px. In wide faces at 390 px, "55.1"
  and "%" can split onto two lines.
- The note buttons' row wraps.
- A skeleton row may be shorter than its real row, never taller.
- The accessibility checks clear the sticky bars before they run, and the action-bar test runs at the layer's end.

## Release

- **Source:** `main` at `8737251495f8add2b6493a58ccd03c3c002ac2ca`.
  - Since the live frontend `7bb83a5b`, #486's merge is the only commit that changes `web/`.
  - #486 changes nothing in `supabase/`, `shared/` or `workers/`.
- **CI on `87372514`:** all 12 check runs succeeded (Tests 41903858282, Brand QA 41903858351, Dashboard checks
  41903858408).
- **Local evidence**, from the design session, before the CI fixes:
  - The full browser run on `1991ee04` passed 378 of 378, with 0 skipped.
  - Vitest: 889 pass. Typecheck and build are clean.
- **Runs:**
  - check-only [41906422008](https://github.com/seanbalz/guess-the-line/actions/runs/41906422008).
  - readiness [41906502150](https://github.com/seanbalz/guess-the-line/actions/runs/41906502150).
  - deploy [41906859675](https://github.com/seanbalz/guess-the-line/actions/runs/41906859675), `deploy` · `frontend`.
  - All succeeded, and every dispatch succeeded on the first try.
- **Release lane:** this session was the only release captain. The design session dispatched nothing.
- **Hosted:**
  - Pages deployment `a73e79f7-05ac-4e4a-915c-84e8ea5baf1d` (`https://a73e79f7.guess-the-line.pages.dev`).
  - The release verify step (checked at 20:31:04 UTC) matched 125 assets per URL, with frontend digest
    `43489be2f3b3e527c5779bc7802f2247cb088619e4b0f51788430a423c5e52a1`.
  - `gtl-api` is unchanged: v50, bundle `c5ed571b…`.
- **Migrations:** none. History digest `d40fdad9eb144738cdbd032e3c95ba433b4cb1606f3de3ab8079f0df1b8108f1`, unchanged.
- **Rollback:** redeploy `frontend` from `7bb83a5b449e853176433a5532c456b8880f4d4e` (run 41868177237).

## Readback

**Live bytes** (executed, signed out, about 20:35 UTC). The production entry and its lazy chunks (41 files) were fetched
from `https://guess-the-line.pages.dev`.

- The new app chunk contains these strings, all of them new in #486:
  - "Records and margins";
  - "Trends, teams and Fantasy are still here.";
  - "Games, the game kicked off";
  - "Loading this week’s games…".
- Fantasy stays a separate lazy chunk (`FantasyScreen-…js`). It contains the new "Beat average" and "Behind average".
- "statistical pace" appears only in the published Week 6 data chunk. That is a snapshot's own method text, which D-23
  keeps.

**Hosted logs** (executed, 20:31 to about 20:40 UTC): no signed-in `gtl-api` request yet.

**Not checked:**
- Signed in.
- On a real phone.

When a player opens Research, check the hosted logs for `GET /personal` (which the landing now reads) and the game
layer's reads: status, latency and Edge CPU.

## For Sean, from the design session's ledger

- The All trends back button and Trends' "Game details · SEA @ DEN" still use team codes. The new layers use full
  names.
- Back after opening a game directly shows the board's loading cells briefly.
- Going back from a team to its game reloads the game's data, which takes 4 requests.

## Left for later

These are deferred from the final review:
- the landing's once-a-second tick;
- live regions on the trend tiles' count-ups;
- duplicated helpers: `lastKickoff`, `weekGames`, `useClientLayoutEffect` and reveal-on-tap;
- the lip going forward on Trends, then a game, then Games, the same as the team-from-game lip.
