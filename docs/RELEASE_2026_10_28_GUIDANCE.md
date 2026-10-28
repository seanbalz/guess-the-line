# Release card: "About team records" in Guidance, frontend — October 28, 2026

Sean, October 28, 2026: "continue", after the D-59 and trend builder releases
([RELEASE_2026_10_28_D59_TRENDS.md](RELEASE_2026_10_28_D59_TRENDS.md)) and the open offer to list "About team records" in
Menu › Guidance and sources.

## Release: frontend

- **Source:** `main` after [#290](https://github.com/seanbalz/guess-the-lines-repo/pull/290) merges (SHA recorded in
  Results). The workflow's source step requires main push CI (Tests, Dashboard checks, Brand QA) green on that exact SHA.
- **What ships:** #290: `INFO.teamRecords` in Menu › Guidance and sources (D-55 rule 10), after the trend builder. The team
  sheet's ⓘ reads the same counting sentence from `web/src/next/info.js`. Nothing else in the app changes; #286 is docs
  and tests only.
- **API and workers:** not deployed; `gtl-api` v39 and `gtl-fantasy-ingest` v1 stay.
- **Migrations:** none. Expected hosted history **64 rows,
  `f39312113403e9b1dadc0f0331dda441686ff8a3723d5410ac087ac43eb46ad4`**.
- **Compatibility:** frontend only; no new request.
- **Rollback:** redeploy the frontend from `0e4289a` (Pages `7cca458b-b44f-47c0-a163-f47eb0adc316`).

## D-61 odds migration: read-only check

`20261027160000_gtl_odds_slots_before_points_open.sql` was run by Sean in his SQL editor on October 27 and has no history
row, so `tests/migrations.mjs` keeps it in `NOT_HOSTED`. Read-only readback on October 28 through the `supabase-gtl`
connection: the hosted bodies of `gtl_dispatch_odds_refresh`, `gtl_claim_odds_refresh` and `gtl_read_odds_schedule` have
md5 `98a4d878f8801592374d543f4d87a3b3`, `de8b1651570a0d8119522d5250022c6f` and `d17798bacf0a60f554b6a7753222b639`, equal to
the three bodies in the file at `583dbaa`; each carries the `06:15:00+00` anchor and none the old `08:15:00+00`.
`gtl-odds-every-12-hours` is `15 6,18 * * *`, active. Recording its history row is a hosted write and waits for Sean's OK.

## Results

Pending.
