# Prism History and pick scorecards — November 7, 2026

This unpublished implementation ports the confirmed historical gap record
(area 17), Account Guess History and Bets/Older History directions (areas
41–43), and the approved pick-focused paired scorecard into native components.
The exact source, capture hashes and scoped checks are recorded in the
[evidence manifest](../design/prism-history-scorecard-native-2026-11-07/evidence.json).
Independent parent review remains pending.

The task branch is `codex/prism-history-scorecard-2026-11-07`, created in its own
checkout from freshly fetched `origin/main` at
`7aa93a6ffe79eafb58bd6c7d12ec230b6d77b0e9` and fast-forwarded to the parent’s
reviewed integration base `893ee2baf5cae9350f6175abb93417c6021e00a5` before edits.
The read-only visual authority is the owner-acceptance checkout at
`3ac2eb50513ba73447ef890e4a47863cde7bdd76`. The owner’s subsequent confirmation
of the exact paired scorecard supersedes that reference’s stale pending text.
Reference hashes in the manifest preserve what was read.

## Native presentation

| Area | Native result | Data and interaction retained |
|---|---|---|
| Guess History | Glass week rows, outlined person/market controls, expanded pick-focused cards and owner timeline | Existing history/records/changes readers, removed-player, Late, original-time, ruling, practice, draft and owner gates |
| Bets and Older History | Scoped glass rows, readable records, journal/note/archive detail surfaces | Existing read-only records and source lines; real-slip fallback while records are off; no Guess points on sportsbook tickets |
| Saved Guess receipt | Separate opponent circle and full name; pick circle, nickname/location and saved guess; authoritative points ring, status, saved comparison/difference and one shared scale | Original saved scoring reference and points, eligibility, pending state, provenance Info, Late marker and weekly-score navigation |
| Historical gaps | Hit-rate ring, existing week/market controls, local 10%+ filter, native paper-unit chart with linked lettered outcomes, first-six/all list, Spread/Total detail | Existing gated board and gap grading, standard `GAP_WIN_UNITS`, actual recorded finals, original paper meaning and detail/back focus/selection/scroll |

The scorecard reads authoritative Guess points. Its difference and chart geometry
compare permitted stored numbers; neither recalculates scores nor replaces a
saved reference. Spread charts explicitly name the home team’s signed scale;
the main pick identifies the team favored by the saved guess. Total cards name
combined points. Team locations identify the catalog team, never a stadium or
device location. Each mark retains its own circle and native image fallback.

Scoped History lists clear the shared List backplate locally. Global List
styles and the held shell/header/sport/dock placement are retained. The 320px
pick pill keeps team identity and saved guess beside one another at native
reading sizes. Shared token parity, typography floors, native hidden handling,
forced colors and transform/press rules pass the existing checks.

## Verification and captures

- **59 Node checks passed**, including token parity/contrast/source constraints,
  history formatting and permission redaction, chart geometry, existing scoring
  history, recommendations and paper-record math.
- **12 score component checks passed**, including pending versus zero, ineligible
  points, saved provenance and the fuller native composition.
- **10 scoped actual-handler/PGlite browser checks passed**: History own/other
  member records and historical anchors, read-only archives and journal, real
  lock-in/receipt/weekly navigation, historical read-only receipts, Monday
  pending refresh and paper-record grading/filter behavior. Three final native
  capture checks passed after token/CSS corrections; two final History checks
  passed after the narrow paired-pill refinement. Zero skips.
- Native captures use the saved ThemeProvider preference and assert computed
  theme canvas/text tokens. Both themes cover 320/390 with representative
  768/1440 layouts; forced colors covers 320. Controls, axe, overflow, chart
  selection, back focus and absence of extra placement/read calls were checked.
- Typecheck, Brand QA (`python -X utf8` on Windows), cloud build, bundle-only
  privacy scan and diff whitespace checks passed. The cloud build retains its
  existing large-chunk warning.

The manifest contains **64 PNG hashes**, dimensions and source hashes. The
[cropped Dark 320px scorecard](../design/prism-history-scorecard-native-2026-11-07/pick-card-dark-320.png)
and [Light 390px scorecard](../design/prism-history-scorecard-native-2026-11-07/pick-card-light-390.png)
show the complete paired composition. The
[Spread paper detail](../design/prism-history-scorecard-native-2026-11-07/gap-detail-spread-light-390.png)
and [Total paper detail](../design/prism-history-scorecard-native-2026-11-07/gap-detail-total-dark-320.png)
show full-name references and recorded finals. Full-page captures retain the
current fixed shell/dock, whose placement remains the parent’s held question.
All captured accounts and newly supplied test values are fictional fixtures;
historical fixtures keep their existing labelled source context.

These are scoped local checks. Actual account completeness, physical phones,
hosted permissions/source freshness, integration CI and release acceptance need
their separate evidence. Full hosted cloud checks were unavailable because the
owned checkout has no `.env.cloud`; the built frontend privacy scan passed.
No push, PR, merge, deployment or migration apply was performed. Held avatars,
NBA, awards, providers, credentials, historical files and the frozen tracker
remain outside this work.

## Independent review visual corrections — November 7, 2026

The isolated `codex/history-visual-fidelity-fix` branch starts at freshly fetched
`origin/main` (`7aa93a6ffe79eafb58bd6c7d12ec230b6d77b0e9`) and fast-forwards to
`7426e7054186893983e4c15dc8fcf1cb322fee1f`. It addresses the independent review's
two visual findings. Outcome-specific native gap-button selectors now override
the neutral button rule: Win uses accent ink and Loss uses loss ink for letters
and borders. Push retains neutral ink. Selected outlines and letter labels stay;
forced colors use Canvas/CanvasText and Highlight selection.

Older destination rows restore the approved leading-icon recipe: 21px content,
10px padding (8px below 359px), a 1px glass border, 15px corners, native glass
face/shadow and accent ink. The last chevron retains its existing muted styling.
Forced colors give the leading tile a system canvas and real border, without a
shadow. No controller, API, SQL, reader, scoring, paper grading, authoritative
points, reveal boundary, saved reference, header or dock code changed.

The pre-fix browser run reproduced both findings. The final command was
`npx playwright test --config playwright.prism-history.config.js tests/cloud-browser/next-prism-history.spec.js tests/cloud-browser/recommended-bets.spec.js --grep 'Prism History|D-77' --output .local/prism-history-verified`:
**3 passed, no failures or skips**. It checks computed W/L colors and borders,
selected 3px outlines with 2px offsets, letters and 44px targets in Dark/Light at
320/390/768/1440, plus Canvas/Highlight in forced colors. A temporary native-button
P clone checks neutral presentation only; it never enters record data or grading.
Older checks cover the full leading-icon recipe, untouched chevrons, responsive
layout and forced colors. SVG probes match Chromium's `preserve-parent-color`
behavior. Captures use the existing saved ThemeProvider preference helper.

All **64 captures were regenerated**; 30 PNG hashes changed. The manifest refreshes
all 21 source hashes and retains the nine reference hashes. Dark 390px Older and
Light 320px gap-record captures were visually inspected. The 15 token checks,
typecheck, Brand QA, cloud build, bundle-only privacy scan and whitespace check
passed. The existing build chunk warning remains. These are local Chromium and
fictional-account/PGlite checks; physical phones, hosted access, release acceptance
and independent parent re-review remain separate. No push, PR, merge, deployment
or migration apply occurred.


## Parent integration adapter — November 7, 2026

The root integrated the reviewed source and both closeout commits as `df487a79`,
`78bf5040` and `b52e86b0`. Independent re-review approved the scoped color/icon
fix and all 94 hashes in its original source worktree. These source snapshots
remain provenance, rather than being rewritten to represent later integration.

The combined root check found the retained `VirtualUnits.jsx` importing native
`GapRecord`, which violates the unchanged app boundary. The integration restores
the exact prior local GapRecord fallback and accepts an optional view component;
only native Bets imports/injects the selected GapRecord. The same gated board,
record, week and key still reach it. No reader, save, grading or filter changes.
The root also updates the receipt test's exact accessible name to its approved
full team names, preserving assertions on the actual saved guess/reference.

Verification: 29 model/import/token/loading contracts and typecheck passed; the
two affected component files passed all 28 tests. The preceding full run passed
912/913 before the stale name expectation was repaired. Two real-handler/PGlite
browser checks passed for History Bets/Older/journal privacy and the D-77 paper
record/filters. The strict boundary test remains unchanged. Independent review
of this adapter and exact-source whole-branch CI/release remain required.


The parent adapter at `a0eb47bb76004e641ee95a7c635a20050c078969` subsequently
passed independent scoped review without Critical/Important findings. Combined
History/EPL validation passed all 90 files / 914 component tests, typecheck and
29 focused contracts. Exact-source CI, remaining area ports and release remain
separate from this local approval.
