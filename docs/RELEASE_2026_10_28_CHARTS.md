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

Pending.
