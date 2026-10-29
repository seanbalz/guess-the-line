# Guess The Line — RETIRE-03 hosted entry-point inventory

Owner: Sean Balsiger · Version 1 · October 28, 2026

Status: **read-only inventory and proposed closure plan, waiting for Sean's
approval.** Nothing in this record deleted, rolled back, redirected or changed a
deployment, project setting, domain or DNS record. It is evidence for
[RETIRE-03](../planning/new-app-retirement.md#retire-03--hosting-stale-clients-and-release-evidence),
not proof that the old app is closed.

## Summary

- Production (`https://guess-the-line.pages.dev`, Pages `0a4c0d25`, the D-65
  build from `main` at `91e3f51`) serves the new app only. Its entry script has
  no `GameHub` chunk and no `?app=classic` / "Use the old app" switch.
- **47 of the 48 deployment URLs recorded in this repository still answer HTTP
  200 with an old-app build.** 37 load the new app with a runnable old app
  (`GameHub` chunk and the classic switch); 10 are pre-redesign builds whose entry
  bundle *is* the old app.
- **Every one of those builds talks to the hosted Supabase project**
  (`onmrgvcehkflfaizvedl`). They are working old clients against live data, not
  static archives. Server-side rules (deadlines, lock-in, RLS, RPC guards) are
  what limits them today.
- No custom domain is recorded in the repository (the free-only budget rules
  one out; see [CLOUD_SETUP.md](CLOUD_SETUP.md)). Every recorded deploy used
  `--branch main`, so no preview branch alias is known.
- Devices: the service worker has never had a fetch handler or cache, and
  production `/` is served `max-age=0, must-revalidate`. A reload of the
  canonical URL gets the new app. Old asset paths on the canonical domain return
  the SPA `index.html` (`text/html`), so an already-open old tab fails its next
  lazy chunk load instead of loading old code.
- The production build still publishes the legacy `App` chunk
  (`assets/App-DNxm7tlM.js`, 204,784 bytes, contains "Triple Threat" and
  "Betting Challenge"). `web/src/main.jsx` imports it only when the build has no
  Supabase configuration, so the cloud build never renders it, but it is
  downloadable. That belongs to RETIRE-04 source cleanup.

## Scope and limits

- Checked October 28, 2026, about 20:35–20:40 UTC, with `curl` only, signed out.
  For each URL: `GET /`, the first `<script src="/assets/…js">` in the HTML (the
  entry script), then a search of that script for `GameHub-*.js` and for the
  classic switch strings `app=classic` / `Use the old app`. Pre-redesign builds
  were identified by "Triple Threat" and "Betting Challenge" in the entry bundle
  and no `NextApp` chunk.
- **The deployment list is not complete.** No Cloudflare login exists on this
  machine (`wrangler` is not installed here; the Mac mini holds the login), so
  the URLs are the 48 deployment IDs recorded anywhere in `docs/` and
  `planning/`. The October 15 audit's authenticated listing returned 25
  production deployments on its first page alone. Cloudflare keeps every
  deployment URL live until it is deleted, so more old URLs almost certainly
  exist. Step 1 of the plan closes them all regardless of how many there are.
- Custom domains and preview aliases were checked from the repository only.
  `main`, `production`, `preview`, `master`, `staging` and `dev`
  `.guess-the-line.pages.dev` all return HTTP 404; an unknown subdomain also
  returns 404. The Pages dashboard (Custom domains and Deployments tabs) is the
  authority.
- Signed-in workflows, installed Home Screen launches on real phones and open
  tabs on real devices were not checked.

## Inventory

`Classic switch` means the entry script contains the `?app=classic` / "Use the
old app" path. Pre-redesign builds have no switch because the old app is the
only app. `First recorded in` is the alphabetically first repository document
naming the ID, to help date it.

### Domains and aliases

| URL | HTTP | Entry script | `GameHub` chunk | Serves old app? | Notes |
|---|---|---|---|---|---|
| `https://guess-the-line.pages.dev` (production) | 200 | `index-CWQ5bfDN.js` | none | No | Same entry SHA-256 prefix `31306bc228ad` as `0a4c0d25`; `?app=classic` returns the same new-app page |
| `https://main.guess-the-line.pages.dev` and `production`, `preview`, `master`, `staging`, `dev` aliases | 404 | — | — | No | Production branch has no alias; no preview branch recorded |
| Custom domains | — | — | — | — | None recorded in the repository; confirm in the Pages dashboard |

### Deployment URLs

| URL | HTTP | Entry script | `GameHub` chunk | Classic switch | Build | First recorded in |
|---|---|---|---|---|---|---|
| `https://0a4c0d25.guess-the-line.pages.dev` | 200 | `index-CWQ5bfDN.js` | none | no | New app only (current production) | this record |
| `https://48a36ee4.guess-the-line.pages.dev` | 200 | `index-HFrUz8ur.js` | `GameHub-1vEr3XNV.js` | yes | New app + runnable old app | COMPLETION_REGISTER.md |
| `https://3d274d87.guess-the-line.pages.dev` | 200 | `index-C9oDGcuf.js` | `GameHub-1z9hfy7b.js` | yes | New app + runnable old app | COMPLETION_REGISTER.md |
| `https://21b65352.guess-the-line.pages.dev` | 200 | `index-DQvsaVeC.js` | `GameHub-7WFDl1ZD.js` | yes | New app + runnable old app | FANTASY_TRACK1_RELEASE.md |
| `https://59fde381.guess-the-line.pages.dev` | 200 | `index-DuBCSLk0.js` | `GameHub-B-TdyXqa.js` | yes | New app + runnable old app | RELEASE_2026_10_27_PLAY_HOME_FRONTEND.md |
| `https://7b7dbabd.guess-the-line.pages.dev` | 200 | `index-COjDKQz3.js` | `GameHub-B7tTIjf1.js` | yes | New app + runnable old app | RELEASE_2026_10_27_TEAMS.md |
| `https://af617cd2.guess-the-line.pages.dev` | 200 | `index-ClN5djXw.js` | `GameHub-BQw_NIY_.js` | yes | New app + runnable old app | COMPLETION_REGISTER_ARCHIVE_2026_10_26.md |
| `https://b8a31940.guess-the-line.pages.dev` | 200 | `index-thsn-6VC.js` | `GameHub-BWseFvuc.js` | yes | New app + runnable old app | COMPLETION_REGISTER.md |
| `https://0f9312bf.guess-the-line.pages.dev` | 200 | `index-CH9pT8T8.js` | `GameHub-BXeu_AzM.js` | yes | New app + runnable old app | COMPLETION_REGISTER.md |
| `https://7cca458b.guess-the-line.pages.dev` | 200 | `index-CH9pT8T8.js` | `GameHub-BXeu_AzM.js` | yes | New app + runnable old app | RELEASE_2026_10_28_D59_TRENDS.md |
| `https://fc7f3cd2.guess-the-line.pages.dev` | 200 | `index-BEyb3DF_.js` | `GameHub-BZEx4mw-.js` | yes | New app + runnable old app | AGENT_HANDOFF.md |
| `https://7ae80e71.guess-the-line.pages.dev` | 200 | `index-CPwj1N1m.js` | `GameHub-BjFCpncz.js` | yes | New app + runnable old app | COMPLETION_REGISTER.md |
| `https://0933a030.guess-the-line.pages.dev` | 200 | `index-BdrcFLxF.js` | `GameHub-BmJsnhA1.js` | yes | New app + runnable old app | COMPLETION_REGISTER_ARCHIVE_2026_10_26.md |
| `https://6da26a0f.guess-the-line.pages.dev` | 200 | `index-CrQ5Jn_v.js` | `GameHub-BwDv0L5f.js` | yes | New app + runnable old app | RELEASE_2026_10_09.md |
| `https://8a307b47.guess-the-line.pages.dev` | 200 | `index-D4gL0SwV.js` | `GameHub-C0kD8hYx.js` | yes | New app + runnable old app | RELEASE_2026_10_14.md |
| `https://9fb54fe4.guess-the-line.pages.dev` | 200 | `index-D8hZmOxc.js` | `GameHub-CCDMsUa9.js` | yes | New app + runnable old app | COMPLETION_REGISTER.md |
| `https://63edcb40.guess-the-line.pages.dev` | 200 | `index-iFp461FP.js` | `GameHub-CIztr_xl.js` | yes | New app + runnable old app | RELEASE_2026_10_27_API_FRONTEND.md |
| `https://9dd92b5b.guess-the-line.pages.dev` | 200 | `index-CeOjAMb9.js` | `GameHub-CTcaqjAg.js` | no | New app + runnable old app | DECISIONS.md |
| `https://06c71c14.guess-the-line.pages.dev` | 200 | `index-A3vmTdeN.js` | `GameHub-CZ543990.js` | no | New app + runnable old app | CLOUD_SETUP.md |
| `https://9ef3f651.guess-the-line.pages.dev` | 200 | `index-CCkqFnoq.js` | `GameHub-CeK8IGh2.js` | yes | New app + runnable old app | COMPLETION_REGISTER_ARCHIVE_2026_10_26.md |
| `https://dcfb977b.guess-the-line.pages.dev` | 200 | `index-BJ7cPr8s.js` | `GameHub-CyRu-j_-.js` | yes | New app + runnable old app | COMPLETION_REGISTER_ARCHIVE_2026_10_26.md |
| `https://46fb8ae6.guess-the-line.pages.dev` | 200 | `index-14xy6pAE.js` | `GameHub-D24VwR_Q.js` | yes | New app + runnable old app | COMPLETION_REGISTER_ARCHIVE_2026_10_26.md |
| `https://c251e8e1.guess-the-line.pages.dev` | 200 | `index-Big5Bvn8.js` | `GameHub-D4G4qexq.js` | yes | New app + runnable old app | RELEASE_2026_10_09.md |
| `https://ed3fb50b.guess-the-line.pages.dev` | 200 | `index-1OAlhnBS.js` | `GameHub-D6C5fBJn.js` | yes | New app + runnable old app | ACCOUNT_ACCESS_REGISTER.md |
| `https://b216c36b.guess-the-line.pages.dev` | 200 | `index-DZdtGUe2.js` | `GameHub-D9lDMB-Y.js` | yes | New app + runnable old app | RELEASE_2026_10_26_POINTS_JOBS.md |
| `https://0dde8b76.guess-the-line.pages.dev` | 200 | `index-Dr160OcE.js` | `GameHub-DSRjR3bc.js` | yes | New app + runnable old app | COMPLETION_REGISTER_ARCHIVE_2026_10_26.md |
| `https://78909363.guess-the-line.pages.dev` | 200 | `index-D5wcCtZQ.js` | `GameHub-DcHFXOUe.js` | yes | New app + runnable old app | COMPLETION_REGISTER_ARCHIVE_2026_10_26.md |
| `https://9b8f3a9c.guess-the-line.pages.dev` | 200 | `index-BXMC_VT5.js` | `GameHub-DeGfEqzv.js` | no | New app + runnable old app | RELEASE_2026_10_09.md |
| `https://4a03e6cd.guess-the-line.pages.dev` | 200 | `index-DAsAxLnJ.js` | `GameHub-DeSqZUWW.js` | yes | New app + runnable old app | COMPLETION_REGISTER.md |
| `https://fa406a83.guess-the-line.pages.dev` | 200 | `index-B5PRMpvb.js` | `GameHub-DsTerTeh.js` | yes | New app + runnable old app | RELEASE_2026_10_14.md |
| `https://ad10f1c1.guess-the-line.pages.dev` | 200 | `index-CvKijIrV.js` | `GameHub-Dtepqqfd.js` | yes | New app + runnable old app | COMPLETION_REGISTER_ARCHIVE_2026_10_26.md |
| `https://f092e744.guess-the-line.pages.dev` | 200 | `index-5SOeH9Vj.js` | `GameHub-Jwgux-TU.js` | yes | New app + runnable old app | COMPLETION_REGISTER_ARCHIVE_2026_10_26.md |
| `https://1e349227.guess-the-line.pages.dev` | 200 | `index-IXgyckTr.js` | `GameHub-QovsFTK5.js` | yes | New app + runnable old app | COMPLETION_REGISTER_ARCHIVE_2026_10_26.md |
| `https://58bd9959.guess-the-line.pages.dev` | 200 | `index-i-xzZuw3.js` | `GameHub-bJxFfYm-.js` | yes | New app + runnable old app | COMPLETION_REGISTER.md |
| `https://5d400209.guess-the-line.pages.dev` | 200 | `index-Dsuthpjj.js` | `GameHub-mgK7iiYi.js` | yes | New app + runnable old app | RELEASE_2026_10_27_FEED_POINTS_FRONTEND.md |
| `https://84cba88f.guess-the-line.pages.dev` | 200 | `index-DBgdoR14.js` | `GameHub-qJRqU_3-.js` | yes | New app + runnable old app | RELEASE_2026_10_27_D61.md |
| `https://b29836da.guess-the-line.pages.dev` | 200 | `index-B8YIB_GR.js` | `GameHub-sfHObVz7.js` | yes | New app + runnable old app | RELEASE_2026_10_14.md |
| `https://b57d894a.guess-the-line.pages.dev` | 200 | `index-C2m__Aal.js` | `GameHub-y4tzjvPq.js` | yes | New app + runnable old app | COMPLETION_REGISTER.md |
| `https://5bd91076.guess-the-line.pages.dev` | 200 | `index-TW6Khth6.js` | none (old app is the entry bundle) | no | Old app only (pre-redesign build) | CLOUD_SETUP.md |
| `https://531d14b5.guess-the-line.pages.dev` | 200 | `index-DU7ip-tq.js` | none (old app is the entry bundle) | no | Old app only (pre-redesign build) | ACCOUNT_ACCESS_REGISTER.md |
| `https://c6c1b82e.guess-the-line.pages.dev` | 200 | `index-BeE0fg0y.js` | none (old app is the entry bundle) | no | Old app only (pre-redesign build) | CLOUD_SETUP.md |
| `https://96d56fac.guess-the-line.pages.dev` | 200 | `index-zyfVj1_i.js` | none (old app is the entry bundle) | no | Old app only (pre-redesign build) | project-tracker.html |
| `https://3de3c6d1.guess-the-line.pages.dev` | 200 | `index-BDyxGOXV.js` | none (old app is the entry bundle) | no | Old app only (pre-redesign build) | CLOUD_SETUP.md |
| `https://2106725d.guess-the-line.pages.dev` | 200 | `index-pNz9Jurw.js` | none (old app is the entry bundle) | no | Old app only (pre-redesign build) | CLOUD_SETUP.md |
| `https://24fb7715.guess-the-line.pages.dev` | 200 | `index-C9tF0wKq.js` | none (old app is the entry bundle) | no | Old app only (pre-redesign build) | ACCOUNT_ACCESS_REGISTER.md |
| `https://9df514fa.guess-the-line.pages.dev` | 200 | `index-BfDoH6pA.js` | none (old app is the entry bundle) | no | Old app only (pre-redesign build) | CLOUD_SETUP.md |
| `https://dfe01cc5.guess-the-line.pages.dev` | 200 | `index-Bup_qbrS.js` | none (old app is the entry bundle) | no | Old app only (pre-redesign build) | CLOUD_SETUP.md |
| `https://4d23cfc9.guess-the-line.pages.dev` | 200 | `index-CPA3fx8c.js` | none (old app is the entry bundle) | no | Old app only (pre-redesign build) | CLOUD_SETUP.md |

Totals: 48 deployment URLs, all HTTP 200. 1 new-app only, 37 new app with a
runnable old app, 10 old app only. `9dd92b5b`, `06c71c14` and `9b8f3a9c` reference
a `GameHub` chunk from before the classic switch strings existed; they still run
the old app.

### Devices and caches

| Path | Finding | Risk |
|---|---|---|
| Service worker `web/public/sw.js` | Every version in Git (`dd965fe`, `cfb6bea`, `a9bfdd4`) handles only `push` and `notificationclick`; no `fetch` handler, no Cache Storage | No offline copy of an old bundle; nothing to unregister for retirement |
| Canonical `/` | `Cache-Control: public, max-age=0, must-revalidate` | Reload or relaunch gets the current build |
| Hashed assets | `/assets/*` are `immutable` for a year, per URL | Only matters on the deployment URL that served them; the canonical domain answers old asset paths with `index.html` (`text/html`), so they cannot run there |
| Already-open old tab on the canonical domain | Old code stays in memory until reload; its next lazy chunk import fails | Can still call the hosted API until reloaded; server rules apply |
| Home Screen install (`manifest.webmanifest`, `start_url: /`, `scope: /`) and `beforeinstallprompt` in `installPrompt.js` | Launch opens `/` of the origin it was installed from | An install made from a deployment URL keeps launching that old build until Step 1 below |
| Notification clicks | Open `/#picks` on the worker's own origin | Same as installs: a worker registered on a deployment URL opens that old build |

## Proposed closure plan (needs Sean's approval)

Each step changes hosting and needs Sean's explicit "approve RETIRE-03 step N".
None deletes player records; the database is untouched. Run from the Mac mini,
where the Cloudflare login lives.

1. **Block every non-production URL with Cloudflare Access (reversible, free).**
   Pages › `guess-the-line` › Settings › General › *Enable access policy* for
   preview deployments. This puts Cloudflare Access (free Zero Trust tier) in
   front of `*.guess-the-line.pages.dev`, which covers deployment-hash URLs and
   branch aliases, while leaving `guess-the-line.pages.dev` public. Allow only
   Sean's email. Verify by re-running this inventory: every row except
   production should return a redirect to `*.cloudflareaccess.com` instead of
   HTTP 200, and production should still return 200 with no `GameHub`. Undo:
   disable the policy. If any deployment-hash URL still returns 200, report it
   and go to step 2 for those IDs.
2. **Delete old deployments after RETIRE-01 backups are captured (irreversible
   for the hosted copy).** List all deployments with
   `npx wrangler pages deployment list --project-name guess-the-line` (paginate
   to the end) and record the full list in a dated addendum. Then delete every
   deployment except the current production one and the one immediately before
   it (kept as the rollback target, behind Access). Each build can be rebuilt
   from its Git commit; nothing in Git or Supabase is removed. Re-run the
   inventory; deleted URLs should return 404.
3. **Built October 29, not yet deployed — remove the legacy `App` chunk from the production build (RETIRE-04).** `web/src/main.jsx` now gates the old app on the raw `VITE_SUPABASE_*` values, so a cloud build has no `App` chunk (51 to 40 assets, about 206 KB less JavaScript); the local build keeps it. It ships with the next normal release.
   Drop the non-cloud `App` branch from `web/src/main.jsx` so the published
   `assets/` no longer contains old-app code; deploy through the normal
   [manual release workflow](SHARED_DEPLOYMENT.md).
4. **Device acceptance.** On a phone with a Home Screen install and with an open
   old tab: relaunch and reload, confirm the new app loads, drafts recover
   (RETIRE-01), and that a URL blocked in step 1 no longer opens the old app.
   Record results in the RETIRE-03 row.

Not proposed: a custom domain (paid add-on, outside the free-only budget) or
Pages `_redirects`/Functions changes (they only affect new deployments; existing
deployments are immutable).

## Reproduce

```bash
h=c251e8e1.guess-the-line.pages.dev
e=$(curl -s https://$h/ | grep -oE 'src="/assets/[^"]+\.js"' | head -1 | cut -d'"' -f2)
curl -s https://$h$e | grep -oE 'GameHub[-A-Za-z0-9_]*\.js' | sort -u
```
