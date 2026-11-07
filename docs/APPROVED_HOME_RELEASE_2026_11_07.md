# Approved Home deployment — November 7, 2026

Sean approved and requested deployment (“Good deploy”) after the two Home
mockups at `3ac2eb50513ba73447ef890e4a47863cde7bdd76`:

- `previews/league-wording-home-dark-phone.png`, SHA-256
  `53604c72bd7a38025d25a3d471a8c10778abebe46bec5e02062304ebe9070a07`
- `previews/league-wording-home-light-phone.png`, SHA-256
  `87b61ca78e6352266ceca8fb1bf8849fb49f38a742c0d6f4493d2f2d511d54a5`

Paths are under `design/style-directions-2026-11-04/` on that review commit.
The approval covers Home only. PR #491's broader foundation is excluded from
this release; other page layouts remain on main's current production design.

## Confirmed data clarification

The mockup's rank/points are illustrative. Sean explicitly selected **“Add a
Spread / Total selector (recommended)”** for Your season, keeping these two
markets' Community ranks and accuracy points separate. No combined score,
fixed sample numbers, invented opponent guess or bookmaker line may ship.

## Native implementation plan

- [x] From fresh main `7604cee25f4182d7c5262217c05f20d84b2994e3`, carry only
  the separately reviewed timing/Windows test-fixture fixes from `051b628b`.
  Do not merge the broad foundation or preview branch.
- [x] Add Home-specific palette/material/type tokens in the canonical JSON
  and CSS. Keep every existing global token unchanged. Scope the new Home
  layout and frame to the actual National Football League Home landing,
  retaining original styling when navigating elsewhere or opening a full page.
- [x] Match the approved hierarchy: hybrid G and circular league marks;
  Your week heading; compact next-action/progress ring; Your season's two
  accent stats; League/Research graphical navigation; upcoming-game rows;
  safe Community activity summary; floating bottom navigation. Preserve
  server-derived states, navigation, permissions, lock/reveal gates and data.
- [x] Replace fictional figures with the shared Community/personal reads.
  The progress ring uses the next eligible market, stated explicitly. Season
  stats/league bars use the selected market only. Activity summaries never
  contain guesses, lines, comments or private selections. Research's small
  historical scoring series uses a fingerprinted public-history subset with
  an as-of date, not a live forecast or bookmaker quote.
- [x] Verify pure models, native markup, source contrast/parity, both themes
  and phone widths, real local actions/recovery, and isolation of other pages.
  Compare native captures with the approved reference before release.
- [ ] Push named reviewed files and PR; satisfy exact source CI and review,
  merge, wait for exact-main push checks, then use manual frontend-only
  check-only/readiness/deploy with a release card, migration-history digest,
  compatibility and rollback evidence. Record hosted byte verification and
  production version. No API/worker deployment or migration apply.

No further approval of this already approved Home design is requested.
The production environment's technical approval gate remains part of the
authorized manual release. Avatars/photos/new awards and NBA remain held.

## Local verification

- Typecheck and Brand QA passed (`python -X utf8 scripts/check-brand-docs.py`
  on Windows).
- Full Vitest: 85 files, 886 tests passed. Updated markup/engine tests cover
  the approved composition, separate stats, loading/recovery and streak
  preservation. The count differs from the old layout suite because obsolete
  countdown/six-tile presentation assertions were replaced.
- Full Node run before the final narrow token import exception: 2933 passed,
  one failed, zero skipped. That failure was the old-app import guard treating
  the canonical design JSON as a screen import. The new exception permits only
  HomeBrand's two named token imports. Its focused rerun and Home/streak/token
  contracts passed; five model/provenance tests passed. Full exact-source CI
  remains required before merge/release.
- Browser: 62 passed in the broad Home/shared-navigation/League/features/Trends
  run. The one remaining failure asserted the old 16px navigation label floor;
  the approved compact Home labels are 13–14px. After updating that Home-only
  expectation, the final six Home/four-tab checks passed, including Dark/Light
  320/390, axe, read-only/privacy checks and chrome/style restoration.
- Native screenshots were compared with the approved references and are
  [published with hashes](../design/approved-home-release-2026-11-07/README.md).
  Test data is fictional. A browser capture does not establish phone acceptance.
- Read-only source review found no remaining important defects. No schema,
  API, worker, pick data, historical snapshot or provider-budget change is made.

The Supabase app connector returned `UNAUTHORIZED` (reauthentication required).
No SQL ran. Hosted release checks use the existing protected GitHub workflow;
connector access is not inferred from that workflow's credentials.
