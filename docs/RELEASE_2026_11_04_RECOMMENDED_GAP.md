# Release record: D-77 gap card, design fixes and D-69 step 1 (Play), frontend Pages `62e6b278` — November 4, 2026

This was one frontend release, released from `main` at `a10d28e9`, and it shipped three merged pull requests:

- [#472](https://github.com/seanbalz/guess-the-line/pull/472) (D-77, Recommended: your gaps vs. closing lines).
- [#474](https://github.com/seanbalz/guess-the-line/pull/474) (design fixes).
- [#473](https://github.com/seanbalz/guess-the-line/pull/473) (D-69 step 1, Play).

The release card is the "Release card" section of #472.

Sean's approvals (November 3, 2026 PT):

- He approved the D-77 captures with "Ok".
- He chose "Ship all three" when asked whether one release should also ship #474 and #473. Both were merged but not live.
- On the production gates: Sean approved readiness himself in GitHub. He then said "Approve it for me", and this session approved the deploy gate.
- The fantasy optimization session relayed that Sean had approved #474 going live. In the step 1 Play session he wrote "Release step 1".

## Release

- **Source:** `main` at `a10d28e9cdb0fdb20c323ad71b9c07893c41a35b`, the merge of #472.
  - Between the live frontend `7a10cbd3` and this source, only `web/`, `shared/`, `tests/`, `design/` and `docs/` changed.
  - Nothing changed in `cloud/`, `supabase/`, `scripts/` or `.github/`.
- **CI on `a10d28e9`:** Tests 41783832769, Dashboard checks 41783832773 and Brand QA 41783832748 all succeeded.
- **Runs:**
  - check-only [41785547679](https://github.com/seanbalz/guess-the-line/actions/runs/41785547679).
  - readiness [41785590106](https://github.com/seanbalz/guess-the-line/actions/runs/41785590106).
  - deploy [41787052379](https://github.com/seanbalz/guess-the-line/actions/runs/41787052379), `deploy` · `frontend`. All three succeeded.
- **Release lane:** this session was the only release captain.
  - The design critique session and the step 1 Play session both stood down and dispatched nothing.
  - A separate check-only run for the older `f418769e` (#474 only), run 41785593931, was cancelled by the session that dispatched it and never reached deploy.
  - Merges to `main` were held from dispatch until the deploy finished.
- **Hosted:**
  - Pages deployment `62e6b278-5f48-4d66-ba12-873497e22248` (`https://62e6b278.guess-the-line.pages.dev`) completed at 2026-11-04 06:42:15 UTC.
  - The release verify step (checked at 06:43:07 UTC) matched 127 assets on `https://guess-the-line.pages.dev`, with frontend digest `e0b6e1335cc480a8868c0137456ff4548c80ff2695603bde5065c45f5c97d130`.
  - `gtl-api` is unchanged: v50, bundle `c5ed571b…`, JWT verification on.
- **Migrations:** none.
  - History unchanged at 76 rows, digest `d40fdad9eb144738cdbd032e3c95ba433b4cb1606f3de3ab8079f0df1b8108f1`.
  - The three pending repository migrations (`20261029151727`, `20261029161613`, `20261029162144`) predate this release and are untouched.
- **Rollback:** redeploy `frontend` from `7a10cbd338c545fe9a1e8d8819c6e00d4fe2eed2` (run 41753107909).

## Readback

- **Live bytes (executed, signed out):** the production entry `assets/index-yhey1K9m.js` lazy-loads `VirtualUnits-B067d_gi.js`. That chunk contains the D-77 strings "beat the close", "About your gaps", "Each gap, in kickoff order" and "Top 3 to act on".
- **D-77 adds no route.** The card reads the player's own `/lines/read`, which was already live. Not checked: a signed-in view of the card on a phone.
- **D-69 step 1:** the step 1 Play session's readback and release note are in
  [#476](https://github.com/seanbalz/guess-the-line/pull/476) (`docs/RELEASE_2026_11_04_OVERHAUL_STEP1.md`).
  - Step 1's markers are in the live `NextApp-btUS1fEq.js`.
  - From 06:42:15 to 06:47 UTC, `gtl-api` saw only the deploy's signed-out 401 probes and no CPU-limit messages.
  - The first signed-in visit after the deploy will be added to #476.
- **#474:** the fantasy optimization session is checking the design fixes live.
