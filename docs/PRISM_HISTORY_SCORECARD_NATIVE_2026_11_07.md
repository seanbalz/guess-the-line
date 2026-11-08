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
