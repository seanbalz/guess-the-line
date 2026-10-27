# Release card: new-app design, frontend only — October 27, 2026

> **Superseded October 27, 2026** by [the 8ada72b card](RELEASE_2026_10_27_API_FRONTEND.md) (API then frontend). P-03
> was applied on October 26 before this card was written ([record](RELEASE_2026_10_26_POINTS_JOBS.md)), so hosted
> history is 54 rows, digest `bd53dcf4…f11a`, not the 53-row digest below, and the live frontend is Pages `b216c36b`
> (`9da3ce6`), not `b8a31940`. Its run 40428568548 refuses at the pre-deploy history check; nothing below was deployed.

Sean's instruction (October 26–27, 2026): "I need changes on the design added asap", then "Deploy".

- **Source:** `main` at `de4295308c56d6e9b95d1e810ada9b5fbf45df04` (#240 merged). Main CI on this exact SHA
  passed: Tests, Dashboard checks (dashboard, Persona suite, four cloud browser shards) and Brand QA, all on the
  `push` runs.
- **Target:** `frontend` only (Pages). `gtl-api` stays at v37 (from `17afa76`, the October 26 release).
- **Order:** frontend alone. No API deploy, no worker deploy, no migration.

## What ships

Frontend changes since `17afa76`: Research charts and season tables (#216, #218), Research season selection, market
details, board lines and gated Community guesses (#222, #224, #225, #230), the NBA scheduled-game label (#217), the
League feed screens with comments and reactions (#238), the new-app commissioner Settlement screen (#214), and D-60
step 1 (#240): every signed-in member opens the new app; the old app opens only at `?app=classic`.

Run 40425215206 (from `d2a7b29`, without #240) was cancelled before approval and replaced by this one.

## Compatibility with `gtl-api` v37

- The new client calls `/league/feed`, `/league/comments`, `/league/reactors`, `/league/react` and
  `/league/share-result`. v37 answers these "Not found."; the League screen then shows the Community feed from
  `/community/read`, unchanged (stage 64 fallback, covered by the cloud browser suite on `HOSTED`).
- No other route was added or changed in `web/src/api.js` since `17afa76`.
- The server-side changes on `main` since `17afa76` (`cloud/feed.mjs`, `cloud/community.mjs`, `cloud/handler.mjs`,
  `cloud/points-jobs.mjs`, `cloud/fantasy-feed-ingest.mjs`, the two new functions) are **not** deployed by this release.

## Migrations

None applied or required. Hosted history stays 53 rows, digest
`300257804ccaa7c09d7ab3895ddb7221a5bacb2a44ce2ab6b6516bcc83cd4a2e` (the October 26 record). The unapplied files on
`main` (P-03, fantasy feed bucket, M-13, M-21, M-22, M-23) are untouched; each still needs Sean's own "apply".

## Rollback

Redeploy the frontend from `17afa76147f3110bbaa97ed51dbda9717ffbdcf4` (Pages `b8a31940`) with this workflow. No data
changes to undo.

## Note

With #240 the new app is the default; `?app=classic` still opens the old app on any device.
