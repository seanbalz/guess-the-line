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

- **Source:** `main` at **`SOURCE_FRONTEND`** (screens PRs merged), frontend only, after Release 1.
- **What ships:**
  - [#282](https://github.com/seanbalz/guess-the-lines-repo/pull/282): the shared Matchup (away mark @ home mark), each
    team's record on Play's game card, the Lines board and the game sheet, the team sheet with its margin chart and
    season games, and the locked-in card led by its score, with the details behind ⓘ.
  - LOGOS_PR: matchups drawn as marks across the rest of the app.
  - `shared/team-records-2026.json` through Week 7 (#281), the fallback and the old app's team facts.
- **Compatibility:** reads `POST /lines/teams` (Release 1); without it, the bundled file.
- **Migrations:** none.
- **Rollback:** redeploy the frontend from `9460635` (Pages `48a36ee4-a4f9-48c8-a64b-b030a7d2d29a`).

## Results
