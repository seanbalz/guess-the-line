# Guess The Line — Home and comparison release

Owner: Sean Balsiger · Version 2 · October 16, 2026

Status: merged as #149 after #143, with all five final-head checks passing on
each PR. Combined main source: `8942725746f199270d79fce562ac37cf92d64d69`.
Not applied or deployed. See [the combined release record](RELEASE_2026_10_16_HOME_FANTASY.md)
for current source gates, access setup and dependencies.

## Scope and dependencies

D-53 is the approved product contract. Fantasy PR #143 merged first, followed by
Home/comparisons #149. The final reconciliation preserves the tested #149 tree.
Do not merge #140 merely to enable Home: its unrelated Virtual Units writer and migration are not required.

New routes:

- `POST /league/comparison { season?, leagueId? }`: authenticated, confirmed
  account; server validates active private membership and filters the history
  roster and entries. Uses M-07's existing per-game reveal/scoring reader. No
  client-supplied owner or clock. Pre-M-07 replies are unavailable, not legacy scores.
- `POST /me/preferences {}` and `/me/preferences/save
  { revision, sportsbooks, guidanceCollapsed }`: account-private settings,
  append-only SQL versions, expected-revision concurrency, idempotent identical
  retries. Unsupported books cannot be added. Previously selected unavailable
  books remain identified and can be removed. No odds or picks enter this reply.

The comparison helper uses only eligible, locked, revealed, numeric scores and
saved references. All-player benchmarks average each game's contributors including
self, then weight games equally. Selected-player comparisons require a common game
for every selected player. No score, pick, reference or official rank is mutated.

## Required release order

1. Review final-head CI and merge Fantasy #143 before this branch. Re-run exact
   main-push checks on the final merge source before a release.
2. Follow `SHARED_DEPLOYMENT.md` and Gate M with fresh hosted history/body/grant
   evidence, source SHA and existing deployment authorization/access. Coordinate
   with the separate core-scoring release owner; never deploy its older source
   over the combined release.
3. Deploy the compatible API error mappings first. Comparisons are unavailable
   until M-07 and its dependency chain are applied and verified. This PR does not
   authorize their application or change their quiet-window gates.
4. Apply `20261016010000_gtl_score_comparison.sql` only after M-07 and all its
   prerequisites. Apply `20261016011000_gtl_account_preferences.sql` after the
   compatible API. Both are additive; neither edits existing scoring functions.
5. Deploy Pages from the same exact reviewed source. Verify with two authenticated
   fixture/test accounts: private outsider exclusion, per-game reveal, different
   market gates, common-game counts, saved settings/reload, account switch and
   mobile Light/Dark. Verify existing live player scores are unchanged.
6. Move NOT_HOSTED entries only after actual migration/body/grant read-back;
   add account_preferences to boundary table probes and reconcile awaiting-deploy entries from actual release evidence.

Rollback: `GTL_FEATURE_OFF=comparisons` stops comparison reads;
`GTL_FEATURE_OFF=preferences` stops settings writes while preserving readable
saved versions. Revert Pages/API through the release workflow as needed. No DROP,
row deletion, generic `supabase db push`, or scoring re-anchoring.

## Verification

- Typecheck, cloud production build, brand-document QA, migration headers and diff checks pass.
- Full Vitest run: 198 tests pass (14 files).
- Final focused Node run: 111 tests pass, no skips, including real PGlite membership,
  reveal, browser-role grants, settings concurrency/idempotency and rollout boundaries.
- First GitHub run: all 1,442 Node tests pass with zero skips, plus 198 Vitest tests.
  Brand, Windows and Persona checks pass. The cloud browser suite passed 249 of
  258 cases: eight failures were old Home-read/menu-order expectations, and one
  exposed Fantasy rank-column overflow. The expectations now include only the
  added read routes and Settings tab stop; the rank column fits its content.
  The performance fixture likewise handles the new authenticated preference read.
  Local parallel browser verification was stopped under machine overload; final
  GitHub CI on the correction commit remains the complete-suite gate.
- The next GitHub run passed 257/258 cloud browser cases; its only failure was
  the Settings selector omitting the label suffix. The exact accessible label
  is now used and that full keyboard/navigation case passes locally (1 test).
- Browser checks: three Home regressions and four Fantasy regressions pass. Three
  new flows pass: comparisons/guidance/settings with 320px Light/Dark axe checks;
  concurrent edit and account switch; downstream-save failure and recovery.
- Keyboard regression fixed: Save settings retains focus after success, so Escape
  closes its sheet. Mobile source timestamps expand beneath each comparison table.

Screenshots and raw logs are local ignored evidence under `.local/`; they contain
fixture accounts, not production player data.
The implementation phase included no hosted migration inspection or signed-in
live verification. The subsequent read-only production baseline and current
access blockers are recorded in the combined release record.

Final merge verification supersedes the pending-CI notes above: all five checks
passed on #143 head `fc3e7081e7bb6a8b59fe5bc82e411c7be14076e5` and #149 head
`b991396d63cfdb39ae0f13bd9b86da1d0d9d570d`. No migration or deployment is implied.
