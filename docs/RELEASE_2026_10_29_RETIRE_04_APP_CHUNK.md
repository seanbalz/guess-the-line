# Release: drop the old App chunk (RETIRE-04), frontend — October 29, 2026

Sean, October 29: "do this for me" (deploy), after "i want each new pr to be live when finished".

## Run

- **Run:** [40804536700](https://github.com/seanbalz/guess-the-line/actions/runs/40804536700), `deploy · frontend ·
  58a1c94e250e03005b5b5f58b1783d41c9ab71ea`, 02:08–02:25 UTC. It was dispatched from Sean's GitHub account outside
  the release-captain session, with card [#331](https://github.com/seanbalz/guess-the-line/pull/331), history digest
  `1c376874…` and `compatibility_reviewed` true.
- **Gate:** approved at 02:21 UTC through the GitHub API as Sean's account by the RETIRE-03 session, after checking
  the title, inputs and the passed "Verify exact source and CI" job.
- **What shipped:** [#331](https://github.com/seanbalz/guess-the-line/pull/331). The cloud build no longer publishes
  `App-*.js`. Everything else since `4564fff` (Pages `bb293cc1`) is docs or tests.
- **Result:** the deploy step succeeded: **Pages `a2b099c3`**, 27 new files uploaded, 76 already present. The
  workflow's final "Verify live metadata, unchanged migration history, boundaries and frontend bytes" step **failed
  with "The operation was aborted due to timeout"**, so the run is marked failed and left no verified evidence
  artifact. The deployment itself is live.

## Manual verification (02:25–02:35 UTC)

- `https://guess-the-line.pages.dev/` loads `assets/index-BPu11LrU.js` (SHA-256 `4323f0a8…0fb3`). Its entry imports
  `NextApp-DFYd97PW.js` and **no `App` chunk**; no `GameHub`, no classic switch, no "Triple Threat".
- A clean `vite build --mode cloud` of `58a1c94` with production's public `VITE_SUPABASE_*` values gives 40 assets,
  none named `App-*`. **All 40 assets and `index.html` match production byte for byte.**
- `https://a2b099c3.guess-the-line.pages.dev/` returns HTTP 302 to Cloudflare Access, as step 1 intends.
- **Edge-cache caveat:** older hashed assets that had been fetched on the canonical domain, such as
  `App-DSMXQC_o.js` and `App-DNxm7tlM.js`, still answer HTTP 200 JavaScript there. The responses carry `age:` headers
  and `Cache-Control: public, max-age=31536000, immutable`, so they are Cloudflare edge-cache hits, not part of the
  deployment. Nothing references them, and an asset never fetched on the canonical domain answers with `index.html`.
  `*.pages.dev` has no cache-purge control.
- **Not verified here:** hosted migration history and `gtl-api` metadata (the timed-out step; no Supabase access in
  this session), signed-in use and real phones.

## Rollback

Redeploy the frontend from `4564fff65e473bf9007077f7903ffa968ce7367b` (Pages `bb293cc1`).
