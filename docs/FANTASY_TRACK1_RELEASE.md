# Fantasy Track 1 release card (D-57)

Prepared October 23, 2026. Nothing here has been released, deployed or run on
GitHub. Fill the blanks at release time.

- Source SHA: (fill at release)
- Pull request: (fill when opened)
- Migration: none (Gate M does not apply).
- API change: new signed-in `POST /fantasy/week` (`cloud/fantasy.mjs`) with the
  `GTL_FEATURE_OFF=fantasy` switch. Requires an API deploy.
- Frontend change: hosted-first Fantasy loader with committed fallback, status line,
  game context with D-57-gated implied totals, accuracy card. Requires a Pages deploy.
- Workflow: `.github/workflows/fantasy-refresh.yml`, manual and dry run by default.
  The daily schedule is a separate later change after a verified manual run.
- Rollback: disable the workflow (data freezes) and redeploy the previous frontend
  (returns to committed snapshots). Nothing is deleted; the feature-off switch also
  disables the route.

## Record at release time

- Deployed API version and Pages deployment ID, with the source SHA.
- Dry-run and first publish workflow run links; the `fantasy-data-<season>` release
  and its `index.json` readback.
- Fresh verification evidence from the exact release source, with the CI results for
  that exact SHA.
- The release workflow run IDs for the API and for the frontend.
- Rollback readiness: the previous API version and Pages deployment, and the
  kill switch `fantasy` in `cloud/feature-off.mjs` (`GTL_FEATURE_OFF=fantasy`).
  Setting `GTL_FEATURE_OFF` is a hosted secret change and needs Sean's OK.

## Readback checklist

- [ ] Signed-in 2xx for `POST /fantasy/week` in hosted logs, and a signed-out 401.
- [ ] Phone-width check of the Fantasy tab (status line, context pill, accuracy card).
- [ ] A lock line appears for a game whose spread or total is not yet visible.
- [ ] Implied totals appear only after locking in or sitting out that game's markets
  (or kickoff), and disappear after switching accounts.
- [ ] No line values in any snapshot, review, static asset or Fantasy reply.
