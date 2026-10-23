# Fantasy Track 1 release card (D-57)

Prepared October 23, 2026; filled for release the same day (Pacific) from the
check-only and readiness runs below. **Not deployed.** The production deploy waits
for Sean's approval of this card.

- Source SHA: `0bd4f1a588f20da90fea9d5931ce7bc0d20cad6d` (`main`, the merge of
  [PR #198](https://github.com/seanbalz/guess-the-lines-repo/pull/198); design and
  plan in [PR #192](https://github.com/seanbalz/guess-the-lines-repo/pull/192)).
- Target and order: `api-and-frontend`. The workflow deploys `gtl-api` first, then
  Pages, from the same SHA.
- Migration: none (Gate M does not apply). Hosted history is 51 migrations with
  digest `bd9da17ade5d3f6a98924270c88174b0ced7d4740102bd4e62c762f8e22d3b17`,
  unchanged since the October 22 applies. The one pending repository migration is
  `20261023180000_gtl_points_core.sql` (P-01, D-56), listed in `NOT_HOSTED`. This
  release does not apply it, and nothing in the API or frontend bundles imports the
  Points code (`shared/points-scoring.mjs` and `shared/points-slate.mjs` are only
  used by tests).
- API change since `gtl-api` v34 (source `d65268e`): new signed-in
  `POST /fantasy/week` (`cloud/fantasy.mjs`, wired in `cloud/handler.mjs`) with the
  `GTL_FEATURE_OFF=fantasy` switch (`cloud/feature-off.mjs`), plus the
  `shared/fantasy-*` modules it reads with. No other API source changed.
- Frontend change since Pages `21b65352` (source `06a6fcb`): hosted-first Fantasy
  loader with committed fallback, status line, game context with D-57-gated implied
  totals, accuracy card (`web/src/Fantasy*`, `web/src/fantasy*`,
  `web/src/next/fantasy/*`, `fantasyApi` in `web/src/api.js`). No other frontend
  source changed.
- Workflow: `.github/workflows/fantasy-refresh.yml`, manual and dry run by default.
  The daily schedule is a separate later change after a verified manual run.

## Compatibility

Either deploy order is safe, and so is the window before the first data publish:

- Until the refresh workflow publishes the `fantasy-data-2026` release,
  `POST /fantasy/week` answers 404 "No Fantasy data has been published for this
  season." `web/src/fantasyLoader.js` falls back to the committed snapshot for every
  status except 400, 401 and 403, so players keep today's Week 6 rankings.
- The current frontend (Pages `21b65352`) never calls the new route.
- The new frontend against API v34 gets a 404 for the unknown route and falls back
  the same way.
- The route reads only public release assets of this repository over HTTPS, checks
  each file's size, SHA-256 and validator, and returns no lines, picks or account
  data. It refuses signed-out and anonymous callers (401).

## Gates

| Gate | Run | Result |
| --- | --- | --- |
| Main CI on the exact SHA | [Tests](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40025300650), [Dashboard checks](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40025300646) (Persona suite and dashboard), [Brand QA](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40025300571) | All passed on the `push` runs |
| Check-only | [40030329389](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40030329389) | Exact source and main CI verified |
| Readiness | [40030382826](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40030382826) | Passed at 21:58 UTC; deploy steps skipped |
| Deploy | Not run | Waits for Sean's approval |

Readiness report (read-only hosted snapshot, 21:58:13 UTC):

- Build: exact source, clean tree, Node 22. Source SHA-256 `cef3f8b4…6475`,
  frontend SHA-256 `909461ef…70bd4`; the built frontend passed the private-data scan.
- Functions: `gtl-api` v34 ACTIVE with JWT verification on (bundle `b853a6fb…`);
  `gtl-odds-refresh` v6, `gtl-week-open` v5, `gtl-push-reminders` v4 and
  `gtl-results-refresh` v3 are not part of this release.
- Schedule evidence: published 2026 Week 7 present; time restrictions off (October
  19 policy).
- Boundaries: 283 of 284 signed-out probes denied. The remaining one, signed-out
  `POST fantasy/week`, is listed as awaiting this API deploy, not as a denial.

## Rollback

- API: redeploy `gtl-api` from `d65268e` (v34 source). The kill switch
  `GTL_FEATURE_OFF=fantasy` turns the route off without a redeploy; setting it is a
  hosted secret change and needs Sean's OK.
- Frontend: restore Pages `21b65352-a177-4569-9b03-4d5c6c080bfd` (source `06a6fcb`).
- Data: disable the refresh workflow (data freezes). Nothing is deleted.

## Approval

- Sean's approval: **pending**. Deploy dispatch inputs once approved: mode `deploy`,
  the SHA above, target `api-and-frontend`, this card's URL, the digest above and
  `compatibility_reviewed` checked.

## After the deploy

1. Record the deployed API version and Pages deployment ID, the release run ID and
   the verify step's evidence in a dated release record.
2. Signed-out `POST /fantasy/week` returns 401 (the awaiting probe becomes a denial).
3. With Sean's OK, a dry run of `fantasy-refresh.yml`, then the first real run;
   read back the `fantasy-data-2026` release and its `index.json`.

## Readback checklist

- [ ] Signed-in 2xx for `POST /fantasy/week` in hosted logs, and a signed-out 401.
- [ ] Phone-width check of the Fantasy tab (status line, context pill, accuracy card).
- [ ] A lock line appears for a game whose spread or total is not yet visible.
- [ ] Implied totals appear only after locking in or sitting out that game's markets
  (or kickoff), and disappear after switching accounts.
- [ ] No line values in any snapshot, review, static asset or Fantasy reply.
