# October 12 — Continue with Google sign-in

**Session:** fb4f53b0-c392-4260-bba2-e75ce4a1cece (Claude Code session; this work ran as a worktree-isolated subagent) · **Agent:** AI Agent (Claude Code) · **Device:** Mac mini · **Repository:** seanbalz/guess-the-lines-repo · **Branch:** claude/google-sign-in (from origin/main 4bacc39)
**Objective:** Add a "Continue with Google" button to sign-in and create-account (Sean's October 12 decision: Google sign-in is how new players sign up and recover access), keep email sign-in working, keep pending invitations across the OAuth round trip, and write Sean's provider setup steps.
**Jira:** N/A · **GitHub:** this branch's PR

No deploy, Supabase setting, Google setting or migration was touched. The Google provider is still off in the hosted project; until Sean follows docs/GOOGLE_SIGN_IN_SETUP.md the button shows "Google sign-in isn't switched on yet. Use email for now."

Local suite runs used temporary Playwright config wrappers that only raised the webServer start timeout to 15 minutes; the external volume made each Vite build take 1–3 minutes. The wrappers were deleted and are not committed.

| Timestamp (TZ) | Commit | Changes | Validation | Status |
|---|---|---|---|---|
| 2026-10-12 19:18:33 PDT | `e8946c1` | web/src/oauth.js (new), AuthGate.jsx button, divider and busy state, auth.js import, styles.css token-only rules, tests/google-sign-in.test.mjs, tests/cloud-browser/google-sign-in.spec.js, docs/GOOGLE_SIGN_IN_SETUP.md, CLOUD_SETUP.md link | npm run check: typecheck, 501 node tests, 51 vitest, build passed; test:browser 39/39; test:cloud-browser 128/131 on the first run, and the 3 failures were "Tearing down context exceeded the test timeout" under load average 7–9, all passing on a rerun (5/5 incl. sibling widths); the 11 new Google specs passed; test:accessibility 2/2; persona-static-checks shows no findings on the new selectors; check-brand-docs passed; git diff --check clean | Complete |
| 2026-10-12 19:48:34 PDT | (this commit) | This breadcrumb | git diff --check; check-brand-docs | Complete |
| 2026-10-12 20:45:12 PDT | `fe5ab3b` | Merge origin/main 62078f4; narrow the CSP assertion for Google Fonts | Merged main (design stack #53–#55); kept both styles.css hunks (Google button rules and Stage 1 panel-heading wrap); the CSP test now forbids Google origins in connect-src, form-action, script-src, frame-src and default-src instead of anywhere, since #54 allows Google Fonts in style-src/font-src | `npm run check`: node 526/526, vitest 51/51, build OK | Complete |
| 2026-10-12 20:49:32 PDT | (this commit) | Parse CSP directives exactly in the sign-in test (security review) | Every directive parsed by exact name; required directives must exist; duplicates fail; only style-src may name https://fonts.googleapis.com and only font-src https://fonts.gstatic.com; any other Google origin in any directive (including script-src-elem or new ones) fails | google-sign-in tests 5/5; negative checks reject accounts.google.com in default-src, apis.google.com in script-src-elem and a non-Fonts Google host in style-src; node suite green | Complete |

**Next:** Sean completes Parts 1–2 of docs/GOOGLE_SIGN_IN_SETUP.md, deploys the frontend from main after merge using the release checklist, then runs Part 3 (real Google consent, one user row with both providers, invitation round trip).
**Sync:** GITHUB_SYNCED once pushed (verified by comparing HEAD with the origin ref)
