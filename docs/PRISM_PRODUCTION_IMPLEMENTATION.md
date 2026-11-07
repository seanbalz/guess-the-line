# Prism Glass production implementation — November 7, 2026

Sean approved the fuller pick-focused scorecard at
`3ac2eb50513ba73447ef890e4a47863cde7bdd76` (“Perfect”), then authorized the
recommended production implementation (“Move forward with rec”). The approved
[handoff](https://github.com/seanbalz/guess-the-line/blob/3ac2eb50513ba73447ef890e4a47863cde7bdd76/design/style-directions-2026-11-04/SELECTED_DESIGN_HANDOFF.md)
and [scorecard](https://github.com/seanbalz/guess-the-line/blob/3ac2eb50513ba73447ef890e4a47863cde7bdd76/design/style-directions-2026-11-04/PICK_SCORECARD_REVIEW.md)
are design authority. The scorecard's rendering is now approved in both themes;
its fictional data is never production input. Prior approvals stay closed.

## Implementation plan and boundaries

Execute inline in an owned worktree from freshly fetched main
`7604cee25f4182d7c5262217c05f20d84b2994e3`. Keep the old mockup branch and parked
Signal files untouched. Port native components rather than merge the 120-commit
exploration branch or ship its iframe/DOM adapters. No schema, provider, account
permission, scoring, saved-input or deadline changes are needed for this shared
visual foundation. Release and real-phone acceptance remain separate.

- [x] Update `design/tokens-next.json` and
  `web/src/next/styles/tokens.css` together: charcoal/Porcelain gradients,
  ivory/ink, selected glass face/edge/shadow, 28px cards, 20px actions, 18px blur
  and system-first typography. Preserve semantic data/state contrast. Update
  `styles/fonts.js`, `tests/webfonts.test.mjs` and `tests/next-tokens.test.mjs`
  for the approved platform stack and Inter fallback; keep parity, contrast,
  scoping, tabular-number and motion gates. Run baseline, changed requirement
  failure, implementation and passing checks.
- [x] Apply shared production classes in `styles/base.css`,
  `styles/components.css`, `ui/nest.css`, `ui/tile.css` and `shell/shell.css`:
  floating cards, transparent outlined primary actions, restrained glossy icon
  surfaces, separate team circles and sentence-case headings. Retain touch,
  focus, hidden, scroll/safe-area and modal semantics. Provide opaque fallbacks
  for reduced transparency. No invented data or decorative field-line overlays.
- [x] Verify the native UI kit and real shell, Home, Play, Bets and Research
  routes with existing browser fixtures: both themes, 320/390 widths, keyboard,
  fallback imagery, touch/overflow and accessibility. Run typecheck, production
  build, Brand QA, token/fonts tests and affected component tests. Inspect
  phone captures and publish review evidence with named files/PR/sync status.

## Verification and review evidence

The full Node rerun passed **2,931 tests, zero failures, zero skips**. The full
Vitest rerun after the fallback fix passed **85 files / 889 tests**. Typecheck,
production build and Brand QA pass. Vite still reports its existing large-chunk
notice; no performance improvement or physical Safari acceptance is inferred.

The initial kit browser batch passed 24 cases. The native accessibility batch
passed 11 cases (Home, Who's in, Research board/game/All trends, shell/menu,
320px wider labels, team circles and reduced transparency). The real-controller
batch passed 24 cases across Bets, Play, sport history and browser chrome:
entry, exact custom values, retry/idempotency, sign-in recovery, filters, inline
ticket expansion and navigation. These run against disposable PGlite and mocked
transport; no hosted account data was read or changed. Native phone captures
in both themes are [published here](../design/prism-production-2026-11-07/README.md).

The requested independent code review found one important visual issue: the
new fixed 24px circle clipped three-letter fallbacks under native font metrics.
The fallback is now a bounded decorative SVG text run, preserving accessible
container names, stable geometry, decode behavior and the existing original-
badge/letters fallback chain. Both new asset-failure tests failed before the
fix. Targeted DP-27/circle/NYG/WAS/BUF failure tests then passed in both themes;
review found no remaining important issues. The full kit rerun passed all 28 cases, including the two
new fallback cases. Across the 28/11/24 browser batches, six cases overlap
(57 distinct browser cases). The already captured normal loaded-
artwork views are unchanged by this fallback-only repair.

## Test-fixture repairs needed for a usable gate

At the current clock, unchanged main reproduced all five earlier EPL failures:
16 pass / 5 fail across 21 tests. The fixed November 7 kickoff was already past,
so the production database-clock guards correctly refused a reorder or allowed
resolution. Tests now establish the intended before-kickoff state relative to
the run and retain explicit deadline and post-lock stale-timestamp checks.
Both SQL suites passed all 21 after this test-only fix. No production SQL or
real schedule/deadline changed.

Unchanged main also reproduced the Windows research-intake failure: synthesized
POSIX mode bits are 0666, not an NTFS ACL measurement. The test now keeps the
strict 0600 assertion on POSIX and uses a directory junction on Windows to
exercise the same realpath escape refusal without privileged file symlinks.
Receipt redaction, private ignored paths, publication validation and escape
guards remain tested. This does not establish NTFS ACL privacy or modify the
intake implementation. The repaired test and subsequent full suite pass.

## Following implementation slices

The shared foundation is the first independently reviewable part of the full
production design. Subsequent slices cover the exact hybrid G finish, league
mark navigation and wording, typed scorecard/record contexts, section-specific
layouts and graphics, then approved units/odds/source/invite refinements with
real controllers. Each must retain the approved visual authority and privacy.
Track outstanding work explicitly; foundation completion does not complete the
full redesign. Avatars/photos, new award exploration and NBA remain held.

Full rollout follows five workstreams: native design implementation; actual
data/interaction integration; regression/CI; actual release-candidate phone
acceptance; approved release and hosted verification. No release is dispatched
by this implementation plan. Exact-main CI, compatibility, protected readiness,
data preservation, rollback and production approval remain required under
`docs/SHARED_DEPLOYMENT.md`; old timing windows remain removed.
