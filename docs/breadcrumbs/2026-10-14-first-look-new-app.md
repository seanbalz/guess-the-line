# First look: "Try the new app" offered to every member

**Session:** 2116af41-7991-4922-879d-62e6d866ffc5 · **Agent:** AI Agent (Claude Code) · **Device:** Mac mini · **Repository:** seanbalz/guess-the-lines-repo · **Branch:** claude/first-look-new-app (from origin/main 7dce01e)
**Objective:** Sean's goal (October 14, 5:15 PM PT): "get the new desktop/mobile version of the app live and ready to test in the next hour, work with the other GTL sessions to get it complete". The build plan's first-look deploy (Phase 1) is one Pages deploy after stages 2 and 6 to 13 merge, with the first-look PR turning "Try the new app" on for every member (D-39).
**Jira:** N/A · **GitHub:** this branch's PR

## State at the start

- Merged: stages 2 (#70), 6 (#74), 7 (#75), 8 (#78), 9 (#77), 10 (#87), 11 (#93). Stage 13 (#111, read-only Lines, game sheet and simplified trends) is a mergeable draft at `1027a12` with Brand QA, Persona suite and Typecheck and test green and `dashboard` still running. Stage 12 (read-only Home) has no PR and no branch, so Home shows "Coming next" until it lands; Sean's hour does not allow building it, and he is told so.
- Coordination: the cloud coordinator ("Guess the line repo status") was asked to undraft #111 when green, with this session marking it ready and merging it at about 5:40 PM PT otherwise. The message to the Mac mini deploy session ("Cloud/local repo sync for Guess the Line") was held undelivered by the app (different permission modes); that session is idle, so no parallel deploy is expected.

## Change

`NEW_APP_OFFERED` in `web/src/TryNewApp.jsx` is now on unless a build sets `VITE_GTL_OFFER_NEW_APP=0` (the off switch, so the button can be withdrawn without a code change). The test, `docs/DASHBOARD_APP.md` and the build plan's first-look paragraph say so. Nothing else in the switch changes: the choice is per device, `?app=classic` still forces the old app, and a failed chunk load still falls back to the old app.

| Timestamp (TZ) | Commit | Changes | Validation | Status | Next | Sync |
|---|---|---|---|---|---|---|
| 2026-10-14 17:16 PDT | `aada23e` (#114) | `web/src/TryNewApp.jsx`, `tests/next-app-view.test.mjs`, `docs/DASHBOARD_APP.md`, `docs/REDESIGN_BUILD_PLAN.md`, this breadcrumb | `node --test tests/next-app-view.test.mjs` 12/12; `check-brand-docs.py`; `git diff --check`; cloud build carries the button copy (see the PR) | Complete | Merge after #111; Pages deploy; release record | GITHUB_SYNCED, merged as `87f324d` |
| 2026-10-14 17:45 PDT | (this commit) | Release record: "October 14 first-look deploy (87f324d)" in `docs/RELEASE_2026_10_09.md`; this row | #111 merged `caf4ab2` (pinned `1027a12`), #114 merged `87f324d` (pinned `aada23e`); pre-flight on `87f324d` clean (tsc; node 1,206/1,206; vitest 163/163; build; bundle boundary); Pages `6da26a0f` live, alias byte-identical, next chunk served; boundary 224 denials / 0 unexpected / 10 awaiting by decision; `check:cloud` passes; manifest 73 artifacts | Complete | Sean's first look; stage 12 Home | LOCAL_ONLY until pushed |
