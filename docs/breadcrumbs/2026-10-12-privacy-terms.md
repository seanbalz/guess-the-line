# October 12 Privacy Policy and Terms of Service pages

**Session:** fb4f53b0-c392-4260-bba2-e75ce4a1cece · **Agent:** AI Agent (Claude Code) · **Device:** Mac mini · **Repository:** seanbalz/guess-the-lines-repo · **Branch:** claude/privacy-terms-pages (from origin/main 26f4e38)
**Objective:** Public `/privacy` and `/terms` pages so the Google OAuth consent screen can leave Testing mode (Sean's request, October 12), plus Privacy and Terms links on the sign-in card and app footers.
**Jira:** N/A · **GitHub:** this branch's PR into main

Static files `web/public/privacy.html` and `web/public/terms.html` are copied into the build as-is. Cloudflare Pages serves `privacy.html` at `/privacy` with a 200 (and redirects `/privacy.html` to `/privacy`), per its documented route matching. The local server (`server/index.mjs`) now mirrors that before its SPA fallback; `vite preview` already does. No deploy, Supabase or Google setting was changed.

| Timestamp (TZ) | Commit | Changes | Validation | Status |
|---|---|---|---|---|
| 2026-10-12 20:41:48 PDT | (this commit) | Privacy and Terms pages (inline token CSS, light/dark via prefers-color-scheme, no scripts); `LegalLinks` on AuthGate, App footer, GameHub and CommunityHome footers; server `.html` route matching; tests `tests/legal-pages.test.mjs`, `tests/browser/legal-pages.spec.js`, `tests/accessibility/legal-links.spec.js`; this breadcrumb | `npm run check` (517 node + 51 vitest pass, build ok); `npm run test:browser` 41 passed; `npm run test:accessibility` 7 passed; `python3 scripts/check-brand-docs.py`; `git diff --check` | Complete |

**Next:** Sean reviews the policy wording (especially the account-deletion paragraph against D-23), merges, deploys Pages from the Mac mini, then enters on the Google consent Branding page: home `https://guess-the-line.pages.dev`, privacy `https://guess-the-line.pages.dev/privacy`, terms `https://guess-the-line.pages.dev/terms`.
**Sync:** GITHUB_SYNCED once pushed (verified by comparing HEAD with the origin ref)
