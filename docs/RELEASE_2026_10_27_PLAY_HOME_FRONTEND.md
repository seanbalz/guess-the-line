# Release card: frontend at 6b9c3d2 (Play, Home and League design) — October 27, 2026

Sean, October 27, 2026: "Once #264, #266 and #268 are merged and main's CI passes on that SHA, run the frontend release
(preflight, then the frontend target) and approve its gate. Record it in a release card." #266 shipped first under
[RELEASE_2026_10_27_TOUCH_FRONTEND.md](RELEASE_2026_10_27_TOUCH_FRONTEND.md) (Pages `59fde381`) after his "deploy";
this card ships the rest now that #268, the last of the three, is merged and `main` is green on it.

- **Source:** `main` at **`6b9c3d2bb2ce2e5fd2ed19ef01a4cca0778e5dab`** (#268). Push CI on this exact SHA: Tests
  [40590044552](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40590044552), Dashboard checks
  [40590044598](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40590044598), Brand QA
  [40590044503](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40590044503), all success.
- **Order:** `frontend` only.
- **What ships** over the live frontend (`21f9799`, Pages `59fde381`):
  - [#264](https://github.com/seanbalz/guess-the-lines-repo/pull/264) Play: the lock-in moment (stamp, one lime edge
    flash and a 20 ms buzz, only after a fresh read confirms the lock), week progress ("N of M locked", one tile per
    game, Next to lock), the reveal of everyone's guesses once `/community/picks` opens a game, the native guess
    control replacing ChipPicker in the per-game editor, and one look for Play's loading, error and empty states.
  - [#271](https://github.com/seanbalz/guess-the-lines-repo/pull/271): Confirm lock-in skips #266's press tick, so a
    lock-in buzzes only once confirmed (main's cloud browser shard 2 failed on `0de57b6`, `a6d655e` and `d98fb81`
    until it merged).
  - [#268](https://github.com/seanbalz/guess-the-lines-repo/pull/268) Home and League: count-ups from the last value
    this device saw, the rank-change toast and arrows, Home's next-step card with the week meter, awards and streak,
    League rows with faces, the leader edge, badges, the season race strip and the weekly recap card.
  - From other sessions: #269 fantasy tools, #270 market movement scale, #272 Research loading states.
  - #273 is the release 1 card only.
- **API:** not deployed. The only file under `supabase/`, `cloud/` or `shared/` changed since `21f9799` is
  `shared/fantasy-tools.mjs` (#269), pure functions imported only by `web/src/next/fantasy/`; `gtl-api` v38
  (`1647f94a…`) stays.
- **Compatibility:** no new route. The reveal reads `/community/picks` (M-08) and Home and League read
  `/league/features` and `/league/feed`, all served by v38 today; signed-out, all 376 probes are denied.
- **Migrations:** none. Hosted history from readiness: **63 rows,
  `8a02c480d273a532082411166e08f794a9b71ca6636028adfad09709adee91bb`**, the same as release 1. `20261027160000`
  (D-61 odds, reported run by Sean, hosted version not recorded) and `20261026220000` (D-59) are not needed.
- **Rollback:** redeploy the frontend from `21f9799` (Pages `59fde381-1492-4984-808d-76b5e16ec452`), or from `a887fd1`
  (Pages `84cba88f`) to drop release 1 as well.

## Readiness

[Run 40591861241](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40591861241), observed 22:04:56 UTC,
gate approved through the GitHub API as Sean's account after the title matched: source and exact-SHA CI verified; 63
rows and the digest above; Week 8 published (28 games); `gtl-api` v38 and every worker unchanged since release 1;
previous Pages `59fde381` from `21f9799`; 376 signed-out probes, 376 denied, none awaiting.

## Results

- **frontend** [run 40592205837](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40592205837), gate
  approved through the GitHub API as Sean's account after the title and card matched; verified **22:09:00 UTC**: Pages
  **`5d400209-ecfb-4493-a0b4-0f84ea1b7ef3`** (was `59fde381`), 108 assets per URL, frontend SHA-256
  `ad8562e1bb5a0188f5c22f594208112653a3a206a26dd30758ff85a964936419`. Hosted history before and after: 63 rows,
  `8a02c480…`; no migration applied. `gtl-api` v38 (`1647f94a…`) unchanged. 376 signed-out probes, 376 denied.
- **Live readback (this PC, after the run):** `https://guess-the-line.pages.dev/` loads `assets/index-Dsuthpjj.js`;
  its lazy `PerGamePlay-CoYVHGXB.css` carries #264's `gx-play-stamp` and `gx-play-reveal` rules and
  `NextApp-CGQMn7vn.css` carries #268's `gx-countup`. The entry stylesheet `index-D8j3nCbG.css` is unchanged from
  release 1 (the design CSS loads with those chunks).
- Signed-in and real-phone acceptance are not verified by this run: the lock-in moment, reveal, count-up and rank toast
  were exercised only on fixture accounts in Chromium (the PRs' browser specs).
