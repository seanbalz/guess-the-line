# Codex working-tree snapshot and local fast-forward to main

**Session:** 170fd341-bb7e-46fe-ae86-112d0593a2b0 · **Agent:** AI Agent (Claude Code, Claude Desktop) · **Device:** Mac mini · **Repository:** seanbalz/guess-the-lines-repo · **Branch:** codex/dashboard-games-wip-2026-10-09
**Objective:** Sean asked that the cloud Claude session and the local Mac mini checkout share the same information. The local checkout sat on codex/dashboard-games at 1dcab6e, 88 commits behind origin/main (f1ade03), with 54 uncommitted Codex files no other session could see. This snapshot publishes that working tree unchanged; local then fast-forwards to main.
**Jira:** N/A · **GitHub:** branch codex/dashboard-games-wip-2026-10-09 (no PR; not to be merged as-is)

| Timestamp (TZ) | Commit | Message | Changes | Validation | Status |
|---|---|---|---|---|---|
| 2026-10-09 09:10:59 PDT | `d035069` | Snapshot uncommitted Codex working tree from codex/dashboard-games | 29 modified + 25 new files staged verbatim; no edits | Scanned for secrets and personal data (none beyond test fixtures); not built, not tested | Complete |
| 2026-10-09 09:10:59 PDT | (this commit) | docs: breadcrumb for the Codex WIP snapshot | Adds this file | n/a | Complete |

**Conflict map for the reconciler:** 15 files changed both here and on main after 1dcab6e: .github/workflows/dashboard-checks.yml, docs/DECISIONS.md, docs/RULES.md, docs/TEAM_LOGO_SOURCES.md, package.json, package-lock.json, tests/browser/dashboard.spec.js, tests/cloud-browser/prediction-completion.spec.js, tests/cloud-browser/results.spec.js, tests/cloud-browser/sportsbook-sources.spec.js, web/src/App.jsx, web/src/GameHub.jsx, web/src/PredictionEntry.jsx, web/src/api.js, web/src/teamLogoRegistry.js. planning/virtual-units-game.md exists on both sides as independent new files.

**Deployment reach recorded the same day:** Pages deploys work only from the Mac mini through `npm run cloudflare -- ...`; Supabase CLI is not logged in anywhere, Edge deploys go through the Supabase MCP; the repo has no Actions secrets, so no CI deploy path exists. Cloud session was told this by cross-session message (one-way).

**Next:** Local main fast-forwarded to origin/main. Reconcile this branch against main in a PR, file by file, keeping main's D-18..D-25 decisions. Sean to decide whether to add CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID / SUPABASE_ACCESS_TOKEN repo secrets for a shared deploy workflow.
**Sync:** GITHUB_SYNCED (verified by comparing HEAD with origin ref after push)
