# Commissioner visual fidelity fixes — November 7, 2026

Local source `055e5840fa133e89b23a5bf2e155ce0da7e5e206` on `codex/commissioner-fidelity-fix`, based on
`113e036c80df2b9ed4208bb2e319afa1e69c01e0`. This branch was created from freshly
fetched `origin/main` and fast-forwarded to that reviewed source. The approved
reference remains the read-only owner acceptance worktree at
`3ac2eb50513ba73447ef890e4a47863cde7bdd76`. No push, PR, merge or release occurred.

Referee Save, Odds check/fetch, Premier League correction Refresh and final-score
entry Review/Refresh now use the individual tool's pinned `Sheet.footer`.
Each controller supplies body and footer through a render callback; state,
requests, validation, busy guards and permission checks stay in their existing
owners. Unique React IDs associate external submit buttons with their real
forms. There are no DOM queries, registration effects, duplicated controls or
new native/legacy import exceptions in this adapter. Read-only scroll bodies
remain keyboard reachable through the existing `bodyTabIndex` API.

The retained final-result editor's existing stylesheet supplies its transparent
primary, full 3px green border, 20px corners, enabled/disabled theme ink and
forced system colors. It also makes operational callouts and validation/save
errors 16px. The optional button backdrop filter was omitted after visual review
caught a Light-theme paint defect inside the scrolling native dialog. The
outline, shadow and correct text remain visible. The confirmation dialog keeps
its existing controller and actions. Footer placement does not change it into
a different submit workflow.

The correction destination, loading and empty-state wording now says Premier
League in visible/accessibility text. Existing National Football League wording
remains. Route IDs and API names remain unchanged. Current referee assignments,
full-list guidance and the Odds benchmark explanation use body reading text.
The held app header/dock, avatar explorations, NBA and awards remain untouched.
The parent's new AccountSheet at `a0eb47bb76004e641ee95a7c635a20050c078969` was
inspected read-only; this implementation continues to use the existing Sheet.

## Evidence and verification

The [updated manifest](../design/prism-commissioner-native-2026-11-07/evidence.json)
contains 227 image hashes across 44 states: 205 regenerated captures and 22
retained Member captures. The retained captures explicitly keep their earlier
source and controls/theme/layout checks; they do not claim the new reading or
footer proof. There are 143 regenerated theme/layout/reading/footer checks and
20 retained checks. All 21 current source hashes, 21 authority-source hashes and
78 reference-image hashes were verified. The original initial port and its
limits remain in [the native port record](PRISM_COMMISSIONER_NATIVE_2026_11_07.md).

The checks first reproduced the original missing referee footer, the filled
lime final-review primary and the 12px operational validation error. They now
verify stationary visible footers while the body scrolls; real unique submit
form association; primary outline/background/radius and enabled/disabled ink;
16px semantic operational paragraphs, callouts and errors; and 44px targets.
Captures assert the actual stored theme plus computed canvas/ink, with Dark and
Light at 320/390, representative 768/1440 and forced system colors. Final-dialog
captures explicitly settle their active scroll region and require the last
confirmation action to be fully in the viewport at the bottom.

The five-game referee fixture edits games one and five, collapses to the first
three, saves both through the real form, and checks that a partial save preserves
the hidden fifth game's draft and full-list changed count. A five-game schedule
fixture exercises compact/full lists and the existing real local publish route.
Final-review validation, save failure, retry with the same request ID, version
conflict/adoption, unavailable read and disabled busy action states remain
covered. No actual provider or hosted write is performed.

Verification passed:

- Typecheck; 13 commissioner/correction component checks; 69 focused Node/PGlite
  tests with no skips. The 24 token/import-adapter checks passed again after the
  final CSS change. No allowlist or boundary exception changed.
- All 11 affected browser flows across the main run and focused rerun. The main
  run passed ten; its correction-loading test initially captured the lazy code
  placeholder before the controller existed. It now waits for the disabled
  Refresh action and passed with the two final-review flows (three passed).
- Two final-review/Odds flows passed again after the capture scroll proof;
  those images supersede their earlier copies. Browser commands and exclusive
  port 5276 configuration are recorded in the manifest; local config/artifacts
  remain ignored.
- Brand QA, final cloud build and bundle privacy, whitespace checks. The build
  retains the existing large-chunk advisory. Sean's Week 5 source is unchanged.

Representative images were visually inspected; automated checks do not assert
that every image was individually reviewed. These are local fixture/service and
PGlite observations, not hosted administrator behavior, live source availability,
physical-phone acceptance or all slow-network/account-switch interleavings.
Controller save logic, data/API/SQL, authorization, request identities, free
collection limits, source freshness and scoring are unchanged. Independent
review and parent integration remain pending.
