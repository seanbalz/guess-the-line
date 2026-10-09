# Codex working-tree snapshot and local fast-forward to main

**Session:** 170fd341-bb7e-46fe-ae86-112d0593a2b0 · **Agent:** AI Agent (Claude Code, Claude Desktop) · **Device:** Mac mini · **Repository:** seanbalz/guess-the-lines-repo · **Branch:** codex/dashboard-games-wip-2026-10-09, then claude/reconcile-codex-wip-2026-10-09
**Objective:** Sean asked that the cloud Claude session and the local Mac mini checkout share the same information. The local checkout sat on codex/dashboard-games at 1dcab6e, 88 commits behind origin/main (f1ade03), with 54 uncommitted Codex files no other session could see. This snapshot publishes that working tree unchanged; local then fast-forwards to main.
**Jira:** N/A · **GitHub:** snapshot branch codex/dashboard-games-wip-2026-10-09 (not to be merged as-is); reconciliation PR seanbalz/guess-the-lines-repo#30 (https://github.com/seanbalz/guess-the-lines-repo/pull/30, draft)

| Timestamp (TZ) | Commit | Message | Changes | Validation | Status |
|---|---|---|---|---|---|
| 2026-10-09 09:10:59 PDT | `d035069` | Snapshot uncommitted Codex working tree from codex/dashboard-games | 29 modified + 25 new files staged verbatim; no edits | Scanned for secrets and personal data (none beyond test fixtures); not built, not tested | Complete |
| 2026-10-09 09:10:59 PDT | (this commit) | docs: breadcrumb for the Codex WIP snapshot | Adds this file | n/a | Complete |
| 2026-10-09 09:27:57 PDT | `5300083` | Reconcile the Codex working-tree snapshot with main (merge commit on claude/reconcile-codex-wip-2026-10-09) | 8 conflicted files resolved by hand; PredictionEntry combines D-23 sit-out with the recovery flow; team-marks test expects 15 official + 17 badge-only; four new specs rewritten for chip entry and community-home fixtures | tsc clean; node --test 435/435, 0 skipped; vitest 51/51; build, build:cloud, bundle boundary, release manifest, brand docs, persona static, diff --check all passed. Playwright suites not run to completion: Mac mini hit ENOSPC (222 MB free); CI runs them on the PR | Partial |
| 2026-10-09 09:27:57 PDT | (this commit) | docs: breadcrumb rows for the reconciliation merge | Adds the rows above | n/a | Complete |
| 2026-10-09 09:50:28 PDT | `7c7921c` | Fix two lazy-loading regressions and three brittle local specs | Eager install-prompt capture (installPrompt.js); deadline clock arms only while server time precedes the deadline; three local specs made robust to the lazy App | After Sean cleared the npm and Codex caches (5 GB free): tests/browser 39/39, cloud-browser 102/102, performance 3/3, accessibility 2/2, node --test 435/435, vitest 51/51, tsc, builds, bundle boundary, brand docs, diff --check | Complete |
| 2026-10-09 09:50:28 PDT | (this commit) | docs: breadcrumb row for the lazy-loading fixes | Adds the row above | n/a | Complete |

**Conflict map for the reconciler:** 15 files changed both here and on main after 1dcab6e: .github/workflows/dashboard-checks.yml, docs/DECISIONS.md, docs/RULES.md, docs/TEAM_LOGO_SOURCES.md, package.json, package-lock.json, tests/browser/dashboard.spec.js, tests/cloud-browser/prediction-completion.spec.js, tests/cloud-browser/results.spec.js, tests/cloud-browser/sportsbook-sources.spec.js, web/src/App.jsx, web/src/GameHub.jsx, web/src/PredictionEntry.jsx, web/src/api.js, web/src/teamLogoRegistry.js. planning/virtual-units-game.md exists on both sides as independent new files.

**Deployment reach recorded the same day:** Pages deploys work only from the Mac mini through `npm run cloudflare -- ...`; Supabase CLI is not logged in anywhere, Edge deploys go through the Supabase MCP; the repo has no Actions secrets, so no CI deploy path exists. Cloud session was told this by cross-session message (one-way).

**Next:** Persona suite locally, then mark PR #30 ready for review once its Dashboard checks are green. Sean to decide whether to add CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID / SUPABASE_ACCESS_TOKEN repo secrets for a shared deploy workflow.
**Sync:** GITHUB_SYNCED for both branches (verified by comparing HEAD with the origin ref after each push)
