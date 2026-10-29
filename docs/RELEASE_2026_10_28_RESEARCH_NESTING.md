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

- **Main CI on `4564fff`:** Tests 40794429016, Dashboard checks 40794428148 and Brand QA 40794428212 all succeeded.
- **Deploy:** [run 40797726894](https://github.com/seanbalz/guess-the-line/actions/runs/40797726894). The gate was
  approved through the GitHub API as Sean's account after the title matched `deploy · frontend · 4564fff…`.
- **Verified at 01:03:10 UTC on October 29** (6:03 PM PT, October 28):
  - Pages **`a78d867c-414c-4069-be7e-5f624c3149be`**, with 114 assets checked and frontend SHA-256
    `55eac549e22a5fd38373c70a6cecde6e1c6b9e3c9c9c109eac28c3fbabe3e712`.
  - The deployment URL is `protected` (Cloudflare Access), so only `https://guess-the-line.pages.dev` was read byte
    for byte (#318).
  - `gtl-api` v39 (bundle `bec3b634…481c`) and the migration history `1c376874…` (65 rows) are unchanged.
  - **380 signed-out probes, 380 denied, none awaiting.**
- **Signed-in readback** (Chrome on the Mac mini, read only):
  - `/` loads `assets/index-BiyT3dAv.js`.
  - This week shows its card with 14 game tiles. LV @ NYJ opens with its heading focused, and its first trend opens
    with two lips.
  - Browser back goes trend › game › This week, one layer at a time.
  - Teams shows 28 team tiles; Players shows 13 member tiles and the This week tile.
  - After a reload, there were no console errors, and `/lobby`, `/community/read`, `/personal` and `/trends/week` all
    answered 200.
- **Not verified:** real phones.
