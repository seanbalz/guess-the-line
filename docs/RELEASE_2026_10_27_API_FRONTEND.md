# Release card: redesign pieces, API then frontend — October 27, 2026

Prepared on Sean's instructions (October 27, 2026): "Yes, run the release preflight for main at 8ada72b. Report what it
finds and deploy nothing", then "Open one PR with the 8ada72b release card (API then frontend, digest bd53dcf4) and the
P-03 record fix" (#244). **Approved for release:** "Yes. Run a fresh preflight on the latest main and update the release
card for it. Then reject run 40428568548, cancel 40425215206, and release it API then frontend once readiness passes."
This card replaces [the de42953 frontend card](RELEASE_2026_10_27_DESIGN_FRONTEND.md); see [Stale runs](#stale-runs).

> **Split into two runs (Sean: "just do things now. i no longer want to wait").** `1db1c44`'s CI was still running, so
> the API and frontend went out from `8ada72b` first ([Release 1](#release-1-8ada72b-api-then-frontend)), and
> `1db1c44` follows as a **frontend-only** run. No server file changed between the two, so `gtl-api` v38 from `8ada72b`
> is the server `1db1c44`'s frontend expects.

## Release 1: 8ada72b, API then frontend

[Run 40523412584](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40523412584), card #244, approved at
the production gate through the GitHub API as Sean's account after the title matched the SHA and target. Source and
exact-SHA CI re-verified; hosted preflight 54 rows `bd53dcf4…`; verify passed 14:43:28 UTC.

- **API:** `gtl-api` v37 to **v38**, ACTIVE, JWT verification on, bundle
  `1647f94afc91220cdfd6ebb31ae502a93d9add3252840d3f01cf9a71bc17af9e` (`apiSourceVerified: false`).
- **Frontend:** Pages **`63edcb40-37fa-446e-b9b2-1ca32793bf77`** (was `b216c36b`), 107 assets per URL, frontend
  SHA-256 `0ff7f1db…7d25`, equal to the local `8ada72b` preflight build.
- **Unchanged:** migration history (54 rows, `bd53dcf4…`), `gtl-points-jobs` v1, `gtl-push-reminders` v5 and the
  other workers.
- **Boundary:** 363 signed-out probes, 334 denied, 29 awaiting: the new `gtl-api` routes now deny signed out; every
  awaiting probe is a function of an unapplied migration.
- **Hosted logs, 14:43–14:46 UTC:** 107 `gtl-api` requests, all 401 (the verify probes); no 5xx and no CPU, memory or
  error lines in `function_logs`. No signed-in request yet.

- **Source:** `main` at **`1db1c44062e2b63b7b945c6b0478a1ca6d72c8b6`** (#245 merged). Main CI on this exact SHA, `push`
  runs: [Tests 40519560211](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40519560211),
  [Dashboard checks 40519560153](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40519560153) (dashboard,
  Persona suite, four cloud browser shards), [Brand QA 40519560178](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40519560178).
  The workflow's source step re-checks all three before anything deploys.
- **Target (Release 2):** `frontend` only, after Release 1's `gtl-api` v38. No worker deploy, no migration.
- **Expected hosted state:** 54 migrations, digest
  **`bd53dcf4993d89a1378147bb5a14d34827a1687a312e4cc3a66964adb2f1f11a`** (P-03 included,
  [RELEASE_2026_10_26_POINTS_JOBS.md](RELEASE_2026_10_26_POINTS_JOBS.md)). Before Release 2: `gtl-api` v38
  (`8ada72b`), Pages `63edcb40-37fa-446e-b9b2-1ca32793bf77` (`8ada72b`).

## What ships

- **API** (`gtl-api` from v37 to the next version): the league feed routes (`/league/feed`, `/comments`, `/reactors`,
  `/react`, `/share-result`; #228, #229), `/me/changes` and `/me/records` (#232), `/bets/board` and `/bets/season`
  (#231), `/me/export` (#236), and `/league/features` and `/league/features/run` with the shared badge, award and streak
  rules (#226, #233, #234). Each stays off until its own migration is applied. No server file changed after `8ada72b`.
- **Frontend** since `9da3ce6`: Research market details, board lines and gated Community guesses (#224, #225, #230), the
  League feed screens (#238), D-60 step 1 (#240: every signed-in member opens the new app; `?app=classic` opens the old
  app), Me › History and its older records (#232, #235), Export my data (#236), the badges, awards and streaks screens
  (#237), Research game actions in Play (#242), the Your pick sheet (#243) and a game's bets from Research (#245).
- **Not shipped:** the `gtl-league-features` worker (no target here) and every unapplied migration, including M-23's
  kickoff posts (#239, migration only).

## Preflight (October 27, 2026, 14:20 UTC)

Local, on a clean checkout of `1db1c44`, with the workflow's own scripts; the workflow's `readiness` run repeats them
with the protected credentials before the deploy.

| Check | Result |
| --- | --- |
| `npm run build:cloud`, `check-cloud-boundary.mjs --bundle-only`, `release-manifest.mjs` | Built; no private state, contacts, source files or credentials; 108 artifacts, 3,658,213 bytes, frontend SHA-256 `d0b9fd921c884c3a37bb1f2f919b3f51de44140b873d4a9a43bc0228271f96b8`, clean tree |
| Hosted history (the workflow's read-only query) | 54 rows, digest `bd53dcf4…f11a`, unchanged since the 8ada72b preflight |
| Published schedule | 2026 Week 8, current; `timeRestrictions: false` |
| Signed-out boundary (`1db1c44`'s probe files, with P-03's tables and worker) | 367 probes: 326 denied, 41 awaiting, each a later migration or this `gtl-api` deploy; no request over 5 s |

## Compatibility

Read from the code and CI; not exercised signed in against production.

- **New `gtl-api` on the hosted database.** Existing routes are unchanged: `cloud/handler.mjs` only adds the `feed` and
  `features` route groups, `cloud/community.mjs` only exports `pointsFinal`, and `/me/preferences` keeps its path. A
  new route whose function is missing gets PostgREST's PGRST202, read as feature off: the feed answers 503 "not
  available right now", `/league/features` 404 "coming soon", History and Export 503 "not available yet", the Bets
  boards 503. Each stage's tests run with its own migration left out.
- **Old frontend (`b216c36b`) during the step between API and Pages:** it calls only the unchanged routes.
- **New frontend on the new API:** the League feed falls back to the Community feed on 404 or 503
  (`useLeagueFeed.js` `LEGACY_STATUSES`); badges and awards hide on 404 (`useFeatures.js`); History, its older records,
  Bets history and Export show their "not available yet" copy on 503. No screen reads the Bets boards yet. #242, #243 and
  #245 add one call, `POST /bets/read` (hosted M-10, deployed since `gtl-api` v32).
- **If the API step fails, the frontend step does not run.** A frontend alone on v37 would get 404 "Not found." on the
  History and Export routes, an error rather than the off copy, which is why this card ships both.
- **D-60:** this release makes the new app everyone's default.

## Stale runs

- **40428568548** (deploy · frontend · `de42953`, card #241) waits for approval with `RELEASE_HISTORY_SHA256`
  `30025780…4a2e`. Hosted history changed to 54 rows before it was approved, so its pre-deploy check would refuse
  ("Hosted migration history differs from the reviewed release card"). Rejected before this release.
- **40425215206** (deploy · frontend · `d2a7b29`) was restarted at 02:20 UTC and is queued behind it. Cancelled before
  this release.

## Release steps

1. Reject 40428568548 and cancel 40425215206 (done 14:23 UTC).
2. Release 1: `deploy`, `8ada72b`, `api-and-frontend`, card #244 (done, run 40523412584).
3. Release 2: once `1db1c44`'s push CI passes, `deploy`, `1db1c44`, `frontend`, this card's PR as `release_card`, digest
   `bd53dcf4993d89a1378147bb5a14d34827a1687a312e4cc3a66964adb2f1f11a`, `compatibility_reviewed`; the deploy run repeats
   the readiness checks before it uploads.
4. Read hosted logs for signed-in answers on the new routes (404 or 503 while their migrations are unapplied, never
   5xx from a crash) and for `function_logs` CPU-limit errors; signed-out probes alone do not show either.

## Rollback

Frontend (Release 2): restore Pages `63edcb40-37fa-446e-b9b2-1ca32793bf77` (`8ada72b`). Both releases: redeploy
`gtl-api` from `17afa76147f3110bbaa97ed51dbda9717ffbdcf4` (v37) with the `api` target and restore Pages
`b216c36b-7100-4fdb-a6a8-340df2494def` (`9da3ce6`). No data changes; no migration is part of either release.

## Not verified

- Signed-in production use of the new routes and screens; phone checks.
- `gtl-api` bundle bytes against the source (the workflow records `apiSourceVerified: false`).
