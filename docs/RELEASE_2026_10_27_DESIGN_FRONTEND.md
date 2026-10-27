# Release card: new-app design, frontend only — October 27, 2026

Sean's instruction (October 26–27, 2026): "I need changes on the design added asap", then "Deploy".

- **Source:** `main` at `d2a7b29bfe793495cc5d215c569ce9f3ef8522b9` (#238 merged). Main CI on this exact SHA
  passed: Tests, Dashboard checks (dashboard, Persona suite, four cloud browser shards) and Brand QA, all on the
  `push` runs.
- **Target:** `frontend` only (Pages). `gtl-api` stays at v37 (from `17afa76`, the October 26 release).
- **Order:** frontend alone. No API deploy, no worker deploy, no migration.

## What ships

Frontend changes since `17afa76`: Research charts and season tables (#216, #218), Research season selection, market
details, board lines and gated Community guesses (#222, #224, #225, #230), the NBA scheduled-game label (#217), the
League feed screens with comments and reactions (#238), and the new-app commissioner Settlement screen (#214).

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

The redesign is the new app. Until D-60 (#240) makes it the default, a device sees it after "Try the new app" in the
Community footer.
