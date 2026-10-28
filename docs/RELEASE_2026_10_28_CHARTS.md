# Release card: chart fixes frontend — October 28, 2026

Sean, October 28, 2026: "continue", after the Guidance release
([RELEASE_2026_10_28_GUIDANCE.md](RELEASE_2026_10_28_GUIDANCE.md)) and the D-61 odds history row.

## Release: frontend

- **Source:** `main` at **`b4413bf6504d9e8286ca0f7ae1a3b3b7db0e5f6b`**. The workflow's source step requires main push CI
  (Tests, Dashboard checks, Brand QA) green on this exact SHA.
- **What ships** (app files changed since the live `45c5c5a`):
  - [#293](https://github.com/seanbalz/guess-the-lines-repo/pull/293): team charts stay steady with enlarged game labels
    (`web/src/next/teams/MarginChart.jsx`, `teams.css`).
  - [#291](https://github.com/seanbalz/guess-the-lines-repo/pull/291): plotting ranges on player comparison charts
    (`web/src/next/trends/charts.jsx`).
  - [#288](https://github.com/seanbalz/guess-the-lines-repo/pull/288), its app part only: the old Bet Tracker's label for a
    ticket settled `automatic_final` (`web/src/SocialBetTracker.jsx`, `shared/social-bets.mjs`). No ticket carries that
    source until M-19 (`20261028120000`, D-64 proposed) is applied, so nothing a player sees changes yet.
  - #292 and #294: docs and tests only.
- **Not deployed:** `gtl-api` (v39 stays; its only change since is #288's same label in `shared/social-bets.mjs`), and
  `gtl-results-refresh` (#288 adds the M-19 settlement call; it waits for Sean's decision on D-64 and "apply M-19").
- **Migrations:** none. M-19 stays in `NOT_HOSTED`. Expected hosted history **65 rows,
  `1c376874f677ec736194b5e4af02bb384f1673a39b140f75326566d322526c59`**.
- **Compatibility:** frontend only; no new request.
- **Rollback:** redeploy the frontend from `45c5c5a` (Pages `58bd9959-8f59-4348-94e7-2d102ae568df`).

## Results

- Main CI on `b4413bf`: Tests 40714631568, Dashboard checks 40714631668, Brand QA 40714631421, all success.
- **Readiness** [run 40717870972](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40717870972) and
  **frontend** [run 40718202459](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40718202459), gates approved
  through the GitHub API as Sean's account after each title matched; verified **15:42:36 UTC on October 28**: Pages
  **`b57d894a-34b8-4df7-8125-a46d4438475d`** (was `58bd9959`), 109 assets per URL, frontend SHA-256
  `9793ac2f2c61f4b08f01f64ad08e80c2d4b24ac9374ed27b235fdd57ef1477fc`. `gtl-api` v39 and the history `1c376874…` (65 rows)
  unchanged. **380 signed-out probes, 380 denied, none awaiting** (#288 added two Bet Tracker probes).
- **Live readback (this PC):** `/` loads `assets/index-C2m__Aal.js`.
- **Not verified:** signed-in use and real phones.

## Signed-in readback — October 28, 2026, about 21:45 UTC

Sean, October 28: "go ahead", after asking to be taken to the live app in Chrome on the Mac mini. By then the live
frontend was a later release from `91e3f51` (Pages `0a4c0d25`, [RELEASE_2026_10_28_NEW_APP_ONLY.md](RELEASE_2026_10_28_NEW_APP_ONLY.md)),
which contains `b4413bf`; since then `web/src/next/teams` and `web/src/next/trends` changed only in #295 (on-demand team
sheet) and #298 (lazy Research trends). Chrome on the Mac mini (desktop window, 1920px wide), the account already signed in there, read
only: no guess, draft or setting was changed (all 14 Week 8 spread guesses were already locked).

- **Build:** the page and a no-store fetch of `/` both load `assets/index-CWQ5bfDN.js`; no service worker.
- **#293 team chart:** Play › Guess the Spread › the Green Bay Packers logo opens the team sheet: 4–3 through Week 7,
  last five L W W W L, seven margin bars, "scale +24 to −21 points". With the slider focused, Home, four ArrowRight
  presses and End (real key presses) moved the selection 0, 1, 2, 3, 4 and 6; the plot stayed at top 515px, height
  183px and the slider at 758px for every selection, focus stayed on "Move across the games", and the page had no
  horizontal overflow.
- **#291 player comparison:** Research › Trends › Players shows the bounds above each chart: "Scale: −1.385 to +1.385
  points" (signed), "Scale: 0 to 2.357 points" (absolute error), "Scale: 0 to 100%" (cover rate), a signed bound on
  each Week 8 sentiment chart, and "Scale unavailable" on CHI @ SEA, which has 0 permitted guesses. Each figure's
  `aria-describedby` names its scale. The bounds keep three decimals while the bar values round to two (+1.38 against
  the +1.385 bound); that is how #291 renders the plotting range, noted here and not changed.
- **Errors:** after a reload, no console errors; all 29 requests answered 200, including `gtl-api` `/lobby`,
  `/community/read`, `/personal`, `/trends/week` and `/community/history`.
- **Still not verified:** real phones, and the enlarged-text 390/320px case #293 fixed (covered by its browser specs,
  not repeated on a device).
