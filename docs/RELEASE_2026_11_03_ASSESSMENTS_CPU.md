# Release record: `/lines/assessments` CPU fix, `gtl-api` v48 — November 3, 2026

Sean, November 3, 2026: "deploy now", then "#453 API fix", then "confirmed". The card is
[#456](https://github.com/seanbalz/guess-the-line/issues/456). The defect and the fix are in
[the signed-in readback](READBACK_2026_11_03_SIGNED_IN.md): a cold load of Bets › Research recommendations hit Edge
CPU (546 "CPU Time exceeded" at 20:53:58 UTC), and
[PR #453](https://github.com/seanbalz/guess-the-line/pull/453) evaluates each game-market's evidence once.

## Release

- **Source:** `main` at `386467aafff0090ff7f3bca92d457daeb7a5ef0e`, the newest green main.
  - #453 merged as `7cae0fa2`. Newer main pushes cancelled that commit's browser shard twice.
  - Against live v47 (`2c0c18b7`), the only `gtl-api` change is `cloud/research-assessments.mjs`. `cloud/push-reminders.mjs`
    (#450) also changed, but `gtl-api` does not import it.
- **CI on `386467aa`:** Tests 41724669526, Dashboard checks 41724669536 and Brand QA 41724669691 all succeeded.
- **Run:** [41726861800](https://github.com/seanbalz/guess-the-line/actions/runs/41726861800), `deploy` · `api`. Sean
  approved the production environment in GitHub.
  - The source check finished at 22:00:41 UTC and the deploy at 22:04:01 UTC.
  - The design critique session wrote the card and stood down as release captain; the session that shipped v46 and v47
    ran this release.
- **Hosted:** `gtl-api` v48, bundle `14cd1b1a84c9d3cea080b4fab9ea5346970f923b41cb7587f0ef5c4055113428`, JWT verification on.
- **Migrations:** none. History unchanged at 74 rows, digest `4345486d8d5097cfa2d8a114d44c5569682e5a70cc42a97901635e8379434066`.
- **Rollback:** redeploy `gtl-api` from `2c0c18b71fae57c5a425ad5c867e77d4a312f647` (v47, bundle `e45076a2…`).

## Readback

- **Signed-out (hosted logs, read-only):** every probe of v48 returned 401, as expected.
- **Signed-in cold loads** (Sean: "confirmed"):
  - The design critique session did three full reloads of `#bets/research` in the Mac mini Chrome (1920×1080), signed in
    as the commissioner and read-only: 22:04:40 (a cold worker, right after the deploy), 22:05:18 and 22:05:29 UTC.
  - Each load showed the Research recommendations list (20 assessed bets). None showed "Research is unavailable right
    now", and the console had no errors.
  - Each load also had an earlier `/lines/assessments` request that the client cancelled. `useAssessments` keys the
    request on personal data and sends it again once `/personal` returns. The cancelled requests never reach the hosted
    logs. Before the fix, the request sent after the cancel was the 546.
- **`function_edge_logs` since 22:04 UTC (executed, read-only):** `POST /lines/assessments` returned **200** on v48 three
  times: at 22:04:46.967 (3,288 ms wall), 22:05:24.279 (2,701 ms) and 22:05:33.531 (2,073 ms). The load's other calls also
  returned 200: `/lobby`, `/community/read`, `/personal`, `/trends/week` and `/lines/research-links`.
- **`function_logs` since 22:04 UTC (executed):** zero lines with "CPU Time" or "error", and no 546.
- **Not checked:** CPU time itself. The logs record wall time, and no per-request CPU figure is exposed.
