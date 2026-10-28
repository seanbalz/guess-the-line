# Release card: D-62 team records, API then frontend — October 27, 2026

Sean, October 27, 2026, after D-62 ([DECISIONS.md](DECISIONS.md)) was started: "Continue mergeing and deploying", then
"Make fixes and changes then continue" and "Hurry up". This card ships D-62 in two runs so the API does not wait for
the screens: the API as soon as [#281](https://github.com/seanbalz/guess-the-lines-repo/pull/281) is on `main`, then the
frontend once the screens are.

## Release 1: API

- **Source:** `main` at **`4426994a2307d10717d7cee52b23f5ee61677c07`** (#281; #280 docs only). The workflow's source step requires main push CI (Tests, Dashboard
  checks, Brand QA) green on this exact SHA before anything deploys.
- **Order:** `api` only. `gtl-api` v38 to the next version.
- **What ships:** [#281](https://github.com/seanbalz/guess-the-lines-repo/pull/281) `POST /lines/teams`: every team's
  regular-season record, home and road splits, points and games (score and result once final) from the free nflverse
  `games.csv` that `gtl-api` already reads for slates and settlement. Signed-in only; no market of any kind for any game;
  parsed once per isolate and fresh for 10 minutes. Everything else in `gtl-api` is unchanged from v38's source
  (`8ada72b`): the other server-side changes since are D-61's in `shared/points-jobs.mjs` and `cloud/points-jobs.mjs`
  (imported only by `gtl-points-jobs`, already v2), a comment in `shared/points-scoring.mjs`, and
  `shared/fantasy-tools.mjs` (imported only by the app).
- **Compatibility:** additive route. The live frontend (Pages `48a36ee4`, `9460635`) never calls it. The new frontend
  falls back to the bundled records file when the route is missing, so either order is safe; API first lets the screens
  show live records the moment they ship.
- **Migrations:** none. Expected hosted history: **63 rows,
  `8a02c480d273a532082411166e08f794a9b71ca6636028adfad09709adee91bb`**; readiness re-reads it. `20261026220000` (D-59) stays
  unapplied; `20261027160000` (D-61 odds) is in effect through the SQL editor and has no history row.
- **Boundary:** 376 signed-out probes become 378 (the new route, signed out and with an invalid session). It is listed
  as awaiting deploy in `scripts/boundary/lines.mjs`; a follow-up moves it to denied once this run verifies.
- **Rollback:** redeploy `gtl-api` from `9e6fc7f` (v38's server code; `POST /lines/teams` answers 404 and the new
  frontend falls back to the bundled file).

## Release 2: frontend

- **Source:** `main` at **`befc0f38bed7c5b5b2bf614f9808b0edca1c0268`** (#282), frontend only, after Release 1. #283 follows
  as its own frontend run once it is on `main`, so the records and team page do not wait for it.
- **What ships:**
  - [#282](https://github.com/seanbalz/guess-the-lines-repo/pull/282): the shared Matchup (away mark @ home mark), each
    team's record on Play's game card, the Lines board and the game sheet, the team sheet with its margin chart and
    season games, and the locked-in card led by its score, with the details behind ⓘ.
  - [#283](https://github.com/seanbalz/guess-the-lines-repo/pull/283) (next run): matchups drawn as marks across the rest
    of the app.
  - `shared/team-records-2026.json` through Week 7 (#281), the fallback and the old app's team facts.
- **Compatibility:** reads `POST /lines/teams` (Release 1); without it, the bundled file.
- **Migrations:** none.
- **Rollback:** redeploy the frontend from `9460635` (Pages `48a36ee4-a4f9-48c8-a64b-b030a7d2d29a`).

## Results

- **Readiness (API)** [run 40635708798](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40635708798),
  gate approved through the GitHub API as Sean's account after the title matched: source and exact-SHA CI verified (Tests
  40633942391, Dashboard checks 40633942056, Brand QA 40633941691, all success).
- **API** [run 40635900898](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40635900898), gate approved the
  same way after the title and card matched; verified **05:06:48 UTC on October 28**: `gtl-api` v38 to **v39**, ACTIVE,
  JWT verification on, bundle `bec3b634da98270129ed7ba68d8cc1633be8c14f4a3ac880c69fcfb456fd481c`
  (`apiSourceVerified: false`). Hosted history `8a02c480…`, no migration applied (pending in the repo: 20261027160000,
  20261026220000). Other workers unchanged. **378 signed-out probes, 378 denied, none awaiting.**
- **Readiness (frontend)** [run 40637289845](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40637289845) and
  **frontend** [run 40637435347](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40637435347) from `befc0f3`
  (main CI: Tests 40635830758, Dashboard checks 40635830819, Brand QA 40635830829, all success), gates approved the same
  way; verified **05:22:40 UTC**: Pages **`a3aae3af-55f3-45cd-9964-9455f851074c`** (was `48a36ee4`), 108 assets per URL,
  frontend SHA-256 `9fa94c8e6d136810c6d93a24984e74f5407f1b97b71a3abf3e05d7752a6eee47`. `gtl-api` v39 (`bec3b634…`) and the
  history `8a02c480…` unchanged. 378 signed-out probes, 378 denied.
- **Live readback (this PC):** `/` loads `assets/index-BYBqp6XO.js`; `NextApp-CL46NZ1h.js` carries "About team records"
  (the team sheet) and the lazy `PerGamePlay-7NnapQWt.js` carries "Open team", "Records through Week", "About this score",
  "Missed by" and `gx-mu-btn`.
- **Release 3, frontend from `a2ccf23`** (#283; main CI Tests 40636629599, Dashboard checks 40636629755, Brand QA
  40636629605, all success): readiness [run 40638354066](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40638354066)
  failed in "Read-only hosted preflight and schedule evidence" with "The operation was aborted due to timeout" (the known
  probe timeout; nothing deployed); readiness [run 40638581867](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40638581867)
  with the same inputs passed. **frontend** [run 40638736191](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40638736191),
  gate approved the same way; verified **05:36:19 UTC**: Pages **`7b7dbabd-4fbb-4c47-b627-c7e9712513c5`** (was `a3aae3af`),
  108 assets per URL, frontend SHA-256 `da787dc07cad83e368cb338824e3ac7b6b61d41d275e829feb5db56e0c6b2c6d`. `gtl-api` v39 and
  the history `8a02c480…` unchanged. 378 signed-out probes, 378 denied. Live `/` loads `assets/index-COjDKQz3.js`; the
  Matchup component (`gx-mu-row`) is in the lazy `PerGamePlay-BBcnJmyX.js` chunk.
- **Boundary record:** `/lines/teams` leaves `awaitingDeploy` (`scripts/boundary/lines.mjs`); a not-deployed 404 from it
  is now an unexpected 404 (`tests/cloud-boundary.test.mjs`).
- **Rollback:** frontend from `9460635` (Pages `48a36ee4`); API from `9e6fc7f` (v38's server code).
- **Not verified:** signed-in use and real phones. The screens were exercised on fixture accounts in Chromium (the PRs'
  vitest and browser specs); no signed-in `/lines/teams` request had been seen when this was written.
