# Faster app start release — October 26, 2026

Released October 26, 2026 at 19:43 UTC (12:43 PM PT) on Sean's instruction (items 1–3
of the optimization list: "Test, PR, merge when green, then release and verify", then
"can you complete this now"): API then frontend from `main` at
`17afa76147f3110bbaa97ed51dbda9717ffbdcf4`, with the release card
[PR #210](https://github.com/seanbalz/guess-the-lines-repo/pull/210). No migration.

The source includes [#210](https://github.com/seanbalz/guess-the-lines-repo/pull/210)
(the optimizations and the date-independent Trends fixtures),
[#212](https://github.com/seanbalz/guess-the-lines-repo/pull/212) (two browser-test
fixes) and [#209](https://github.com/seanbalz/guess-the-lines-repo/pull/209) (new-app
league creation and invitations, frontend only, merged separately).

## What changed

- `gtl-api` answers CORS preflights with `Access-Control-Max-Age: 7200`.
- The new app shares account-scoped reads across screens (`web/src/sharedReads.js`:
  ticket summary, preferences, home score) and starts the Community read alongside
  `/lobby` once the device has seen the account with a name.
- Content-hashed `/assets/*` are `public, max-age=31536000, immutable`.
- The sign-in screen shows its form at once unless a saved session may exist or the
  address is a sign-in return, so it no longer jumps; the Google Fonts stylesheet no
  longer blocks the first paint.

## Gates

| Gate | Run | Result |
| --- | --- | --- |
| Main CI on the exact SHA | Tests, Dashboard checks (dashboard, Persona suite, four cloud browser shards), Brand QA | All passed on the `push` runs |
| Deploy | [40388963143](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40388963143) | Source and CI re-verified; API then frontend deployed; verify passed at 19:43:53 UTC |

The production gate was approved through the GitHub API as Sean's account, per his
instruction, after the run title matched the SHA and target. Main CI on `417b800`
(#210 alone) failed one browser shard on a test bug fixed in #212; that SHA was never
deployed.

## What is live

- **API:** `gtl-api` **v37**, bundle SHA-256
  `0703f9757dc9edff1824e82b0e2779609bd303a4e9280e7b121ac1d17f8d2c8d`.
- **Frontend:** Pages **`b8a31940-a235-434d-9de7-e6f5eb15b04b`**.
- **Unchanged:** migration history 53 rows, digest `30025780…4a2e`;
  `gtl-push-reminders` v4 and the other workers.
- **Boundary:** 306 of 306 signed-out probes denied.

## Verification (production)

- `OPTIONS /functions/v1/gtl-api/community/read` answers 204 with
  `access-control-max-age: 7200`.
- A hashed script (`/assets/index-thsn-6VC.js`) is served
  `Cache-Control: public, max-age=31536000, immutable`; the page still revalidates.
- The served `index.html` loads the Google Fonts stylesheet with `media="print"`.
- Lighthouse mobile, signed-out page, two runs: Performance 100 and 92 (69 on
  October 23), layout shift 0.000 both (was 0.634), first paint 1.2–2.3 s,
  Accessibility and Best Practices 100.

## Not verified

- A signed-in production start-up of the new app: the Chrome available to this
  session was signed out, and no password is entered by an agent. The new app's
  parallel and de-duplicated start-up is covered by `tests/cloud-browser/next-data.spec.js`
  (mutation-checked) and should show in hosted logs as `/community/read` starting with
  `/lobby` and one preferences and one ticket read per load.
- Phone checks.

## Rollback

API: redeploy `gtl-api` from `1efd802` (v36 source). Frontend: restore Pages
`3d274d87-8b1c-470d-9ede-de1287b2ea9f`. Nothing in the database changed.
