# Commissioner capture and busy-action correction — November 7, 2026

Owned branch `fix/commissioner-capture-paint-20261107` was created from freshly
fetched `origin/main` (`7aa93a6f`) and fast-forwarded to the reviewed handoff
`9ebfa67b19a87969b86729dfdc947ce2b90b63c9`. Implementation source is
`1509910334291ab0b096dbe8019fe4314231196d`. The authority remains the read-only
owner acceptance worktree at `3ac2eb50513ba73447ef890e4a47863cde7bdd76`, including
populated referee/final-review source and the busy final-review image. The prior
[footer, form and primary fixes](PRISM_COMMISSIONER_FIDELITY_FIXES_2026_11_07.md)
are preserved. This work has no push, PR, merge, release or hosted writes.

## Finding and change

The two checked-in Light referee bottom images contained blank card regions.
Before changing product CSS, the five-game referee test ran on unchanged handoff
source with the final active-scroller settling helper. Actual saved pixels in
both current and partial-save bottom images showed the assignment cards, native
selects, matchup marks and text. The post-fix run showed them again. This is
stale earlier capture evidence; a product paint defect was not reproduced, so no
referee rendering/CSS change was made. The stored images are now refreshed.

The final busy dialog had a separate actual width defect. The inherited
`.review-actions` flex rule retained `justify-content:flex-end` after the native
adapter changed it to grid. A browser regression failed with Keep editing
72.328125px narrower than its group during busy. The adapter now gives that
dialog's action grid a stretching single `minmax(0,1fr)` track and its buttons
100% width. Both actions measure 252px at 320, 322px at 390 and 482px at wide
sizes; offsets are zero. Normal and disabled busy states share this check.

The change is two narrowly scoped CSS rules plus browser evidence.
Native 16px reading/actions, 13px metadata, 16px inputs, 44px targets and the
transparent 3px/20px primary recipe remain checked. Controllers, form IDs,
external submit association, keyboard-reachable scroll bodies, request guards,
API/SQL/providers and the held header/dock layout are unchanged.

## Evidence and verification

The [manifest](../design/prism-commissioner-native-2026-11-07/evidence.json)
contains 232 images: 89 refreshed referee/final/results captures and 143 retained
captures. All 227 earlier filenames remain represented; five new busy viewport
captures extend coverage. Retained rows keep their original source/run/hash and
metrics, with their former evidence status recorded. The 168 distinct
theme/viewport checks include 63 refreshed checks; historical verification stays
under `inheritedVerification`. Incidental Odds captures from the existing final
editor flow were not substituted into the published evidence.

Actual pixel inspection covered the two affected Light bottoms, expanded Light
bottom, partial Dark bottom, Dark/Light 320 referee tops, forced referee top,
paired busy 390 bottoms, forced busy 320 and wide Light busy. Dark/Light 320/390,
representative Dark 768/Light 1440 and forced 320 use actual stored theme and
computed theme-token assertions. This is representative visual inspection, not
a claim that every image was individually inspected.

Checks passed on exclusive port 5288:

- Four targeted browser flows: five-game current/full-list/draft/busy/partial
  referee saves; referee read failure; correction validation/busy/error/conflict/
  adoption/unavailable gates; existing final editor. Drafts for games one and
  five survive compact/full toggling and partial saves. Final action width,
  footer/form association, reading, primary, layout, targets and Axe checks pass.
- Typecheck, 13 component checks and 69 focused Node/PGlite checks, no skips.
  Existing strict import/adapter and token tests pass without boundary changes.
- Brand QA, cloud build with non-secret frontend-test environment, bundle privacy
  and whitespace checks pass. The existing large-chunk advisory remains.
- Every published capture hash and current source hash was verified. Exact
  commands and the expected pre-fix failure are recorded in the manifest.

Raw local runs and logs are in this owned worktree's `.local/referee-baseline`,
`.local/busy-red` and `.local/commissioner-capture-paint`; source worktrees were
not edited. These fixture/PGlite checks establish local behavior only. Hosted
operation, physical-phone acceptance and independent parent review remain open.
