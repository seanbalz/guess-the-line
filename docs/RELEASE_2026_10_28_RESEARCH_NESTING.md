# Release card: Research nesting cards (D-66) and main, frontend — October 28, 2026

Sean, October 28: "Release", then "Deploy merge release everything now. Do not wait. I want it done now". #324 was
merged with an admin override while its re-run "Typecheck and test" was still running. On the merged tree, typecheck
and 502 of 502 vitest tests passed. The two cloud-browser files its earlier failure named passed 51 of 51 locally.

## Release: frontend

- **Source:** `main` at **`4564fff65e473bf9007077f7903ffa968ce7367b`**. The workflow's source step requires main push
  CI (Tests, Dashboard checks and Brand QA) green on that exact SHA.
- **What ships** (app changes since the last verified frontend, `91e3f51`, Pages `0a4c0d25`):
  - **D-66 Research nesting cards:**
    - [#320](https://github.com/seanbalz/guess-the-line/pull/320) Trends › Teams.
    - [#322](https://github.com/seanbalz/guess-the-line/pull/322) Trends › Players.
    - [#324](https://github.com/seanbalz/guess-the-line/pull/324) Trends › This Week.
  - **Research batch:** #310 (lazy matchup research), #313 (research season table) and #321 (readable historical tables).
  - **Bets and Menu:** #315 (stay on Recommended after tracking a recommended bet) and #316 (Menu › Commissioner tools).
  - **Release tooling and tests:** #318 (the verify step reads the production URL when Cloudflare Access guards
    deployment URLs) and #317 (cloud-browser spec fixes). Other merges are docs only.
- **Not deployed:** `gtl-api` stays v39 (built from `4426994`).
  - **API-side changes since then:** only `cloud/results-refresh.mjs` and M-19 (`20261028120000`), and neither ships here.
  - **Shared changes:** the `shared/` files gtl-api imports changed only in #288's settlement label.
- **Migrations:** none. Hosted history read through `supabase-gtl` before dispatch: **65 rows,
  `1c376874f677ec736194b5e4af02bb384f1673a39b140f75326566d322526c59`**.
- **Compatibility:** frontend only. Every request the new frontend makes exists in `gtl-api` v39.
- **Readiness:** skipped on Sean's "Do not wait". The deploy run repeats the source, CI, configuration and live
  checks before it deploys.
- **Rollback:** redeploy the frontend from `91e3f51` (Pages `0a4c0d25-632d-48c3-adaa-c60b1593058d`).

## Earlier run on the same evening

[Run 40793951139](https://github.com/seanbalz/guess-the-line/actions/runs/40793951139) was a frontend deploy of
`d06019c`. It was dispatched and approved from Sean's account outside this session at about 00:25 UTC on October 29,
before #318 merged.

- **What it did:** its "Deploy only the scanned frontend" step succeeded, so `d06019c` (Teams and Players, without This
  Week) went live and `/` served `assets/index-Cbb4p9oN.js`.
- **Why it failed:** its verify step ran the pre-#318 checker. That checker reads the Access-guarded deployment URL,
  so the step failed and the run recorded no evidence. This release replaces that deployment.

## Results

Pending.
