# Release card: the new app only (D-65) and the Research batch — October 28, 2026

October 28, 2026: "Change the app to only show the new version. Remove access to the old version entirely", then
"then deploy the frontend" and "go ahead". The card is
[issue #311](https://github.com/seanbalz/guess-the-line/issues/311).

## Release: frontend

- **Source:** `main` at **`91e3f51de6a3e633ed5aaccecca34401f5fe3232`** (merge of #305). Main push CI on this SHA:
  Tests, Dashboard checks and Brand QA all succeeded.
- **What ships** (app files changed since the live `6a7fc96`):
  - [#305](https://github.com/seanbalz/guess-the-line/pull/305), D-65: the new app is the only app. `GameHub.jsx` and
    `TryNewApp.jsx` are deleted. `?app=classic` opens the new app and is dropped from the address. Every "Use the old
    app" is now "Reload the app", and the outer fallback shows a reload screen.
  - #298–#304 and #306: the Research batch (lazy trends and Fantasy, recorded finals in the game sheet, result
    checks, game-sheet details, weekly trend retry, chart control names).
  - #307 (decision log) and #308 (the release preflight and Fantasy data point at the renamed repository).
- **Not deployed:** `gtl-api` stays v39 (bundle `bec3b634…481c`). Nothing in `cloud/`, `server/` or
  `supabase/functions` changed since `6a7fc96`.
- **Migrations:** none applied. Expected hosted history **65 rows,
  `1c376874f677ec736194b5e4af02bb384f1673a39b140f75326566d322526c59`**. M-19 (`20261028120000`) stays pending. It is
  additive and service-only, and this frontend does not call it.
- **Compatibility:** frontend only; no new request.
- **Rollback:** redeploy the frontend from `6a7fc96` (Pages `ae59b829-e6e6-4b2a-a2e5-24ccfdec4af6`).

## Results

- **Readiness** [run 40761893879](https://github.com/seanbalz/guess-the-line/actions/runs/40761893879): success, 20:21 UTC.
  A first attempt ([run 40760983813](https://github.com/seanbalz/guess-the-line/actions/runs/40760983813)) failed its
  "Require successful main push CI on the exact release commit" step and was dispatched again.
- **Frontend deploy** [run 40763390968](https://github.com/seanbalz/guess-the-line/actions/runs/40763390968): the gate was
  approved in GitHub Actions; verified **20:30:09 UTC on October 28**. Pages is
  **`0a4c0d25-632d-48c3-adaa-c60b1593058d`** (was `ae59b829`), with 107 assets per URL and frontend SHA-256
  `76c70033132fa4fb08d84d9aee722bbd4e47c476330cca689b07bd1dd3cc948e`. `gtl-api` v39 and the history `1c376874…`
  (65 rows) are unchanged. **380 signed-out probes, 380 denied, none awaiting.**
- **Live readback:**
  - `/` loads `assets/index-CWQ5bfDN.js`, whose chunk list names `NextApp-kZoble5D.js` and no `GameHub` or
    `TryNewApp` chunk.
  - Neither script contains "Use the old app" or "Older records and tools". The entry script contains
    "Reload the app".
  - `/?app=classic` serves the same entry script.
- **Not verified:** signed-in use and real phones. The commissioner tools (stages 77–78) have no UI until their new
  pages ship (D-65).
