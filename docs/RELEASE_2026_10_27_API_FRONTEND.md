# Release card: redesign pieces, API then frontend — October 27, 2026

Prepared on Sean's instruction (October 27, 2026): "Yes, run the release preflight for main at 8ada72b. Report what it
finds and deploy nothing", then "Open one PR with the 8ada72b release card (API then frontend, digest bd53dcf4) and the
P-03 record fix". **Nothing here is deployed.** The deploy needs Sean's own word. This card replaces
[the de42953 frontend card](RELEASE_2026_10_27_DESIGN_FRONTEND.md); see [Stale runs](#stale-runs).

- **Source:** `main` at `8ada72bd354fad88726d9a2cf8656e79f832d10d` (#237 merged). Main CI on this exact SHA passed on
  the `push` runs: [Tests 40438316854](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40438316854),
  [Dashboard checks 40438316715](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40438316715) (dashboard,
  Persona suite, four cloud browser shards), [Brand QA 40438316729](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40438316729).
- **Target:** `api-and-frontend`, one run: `gtl-api` first, then Pages. No worker deploy, no migration.
- **Expected hosted state:** 54 migrations, digest
  **`bd53dcf4993d89a1378147bb5a14d34827a1687a312e4cc3a66964adb2f1f11a`** (P-03 included,
  [RELEASE_2026_10_26_POINTS_JOBS.md](RELEASE_2026_10_26_POINTS_JOBS.md)). `gtl-api` v37 (`17afa76`), Pages
  `b216c36b-7100-4fdb-a6a8-340df2494def` (`9da3ce6`).

## What ships

- **API** (`gtl-api` from v37 to the next version): the league feed routes (`/league/feed`, `/comments`, `/reactors`,
  `/react`, `/share-result`; #228, #229), `/me/changes` and `/me/records` (#232), `/bets/board` and `/bets/season`
  (#231), `/me/export` (#236), and `/league/features` and `/league/features/run` with the shared badge, award and streak
  rules (#226, #233, #234). Each stays off until its own migration is applied.
- **Frontend** since `9da3ce6`: Research market details, board lines and gated Community guesses (#224, #225, #230), the
  League feed screens (#238), D-60 step 1 (#240: every signed-in member opens the new app; `?app=classic` opens the old
  app), Me › History and its older records (#232, #235), Export my data (#236) and the badges, awards and streaks
  screens (#237).
- **Not shipped:** the `gtl-league-features` worker (no target here) and every unapplied migration, including M-23's
  kickoff posts (#239, migration only).

## Preflight (October 27, 2026, 13:12 UTC)

Run locally because the release workflow's queue is held by run 40428568548 (see [Stale runs](#stale-runs)); a new
dispatch would cancel the queued run and then wait behind it. The checks are the ones the workflow runs.

| Check | Result |
| --- | --- |
| `release-preflight.mjs source` (clean checkout, fetched `origin/main`) | Passed: SHA reachable from `main`, JWT verification kept for `gtl-api`, the three CI runs above |
| `tests/release-preflight.test.mjs` | 25/25 |
| `npm run build:cloud`, `check-cloud-boundary.mjs --bundle-only`, `release-manifest.mjs` | Built; no private state, contacts, source files or credentials; 108 artifacts, 3,647,953 bytes, frontend SHA-256 `0ff7f1db97eb17e66537d3efecf57306f1a268fb67f3909038fdebc68d5f7d25`, clean tree |
| Hosted history (the workflow's read-only query) | 54 rows, digest `bd53dcf4…f11a`; equals the October 26 53-row digest plus P-03 only |
| Published schedule | 2026 Week 8, current; `timeRestrictions: false` |
| Signed-out boundary (8ada72b's probe files) | 363 probes: 322 denied, 41 awaiting, each a later migration or this `gtl-api` deploy |

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
  Bets history and Export show their "not available yet" copy on 503. No screen reads the Bets boards yet.
- **If the API step fails, the frontend step does not run.** A frontend alone on v37 would get 404 "Not found." on the
  History and Export routes, an error rather than the off copy, which is why this card ships both.
- **D-60:** this release makes the new app everyone's default.

## Stale runs

- **40428568548** (deploy · frontend · `de42953`, card #241) is waiting for approval with
  `RELEASE_HISTORY_SHA256` `30025780…4a2e`. Hosted history changed to 54 rows before it was approved, so its pre-deploy
  check refuses ("Hosted migration history differs from the reviewed release card") and nothing deploys. Reject it.
- **40425215206** (deploy · frontend · `d2a7b29`) was restarted at 02:20 UTC and is queued behind it. Cancel it.

## Release steps (each needs Sean's word)

1. Merge this card's PR (docs and tests only; the deployed bytes are `8ada72b`'s).
2. Reject 40428568548 and cancel 40425215206.
3. Dispatch `readiness` for `8ada72b`, `api-and-frontend`; approve; confirm 54 rows and `bd53dcf4…`.
4. Dispatch `deploy` with this PR as `release_card`, digest `bd53dcf4993d89a1378147bb5a14d34827a1687a312e4cc3a66964adb2f1f11a`
   and `compatibility_reviewed`; approve.
5. Record the evidence in a dated release record. Read hosted logs for signed-in answers on the new routes (404 or 503
   while their migrations are unapplied, never 5xx from a crash) and for `function_logs` CPU-limit errors; signed-out
   probes alone do not show either.

## Rollback

API: redeploy `gtl-api` from `17afa76147f3110bbaa97ed51dbda9717ffbdcf4` (v37) with the `api` target. Frontend: restore
Pages `b216c36b-7100-4fdb-a6a8-340df2494def` (`9da3ce6`). No data changes; no migration is part of this release.

## Not verified

- Signed-in production use of the new routes and screens; phone checks.
- `gtl-api` bundle bytes against the source (the workflow records `apiSourceVerified: false`).
