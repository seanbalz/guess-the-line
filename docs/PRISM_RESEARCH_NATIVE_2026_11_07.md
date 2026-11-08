# Prism Research, Games, Trends, Teams and NFL Fantasy — November 7, 2026

Status: **native implementation checked locally; not merged or deployed**.
Canonical research per-season data remains an explicit follow-up below. This is
not whole-app acceptance or a production release record.

## Reviewed layout fixes — November 7, 2026

The separate, unpublished `codex/research-visual-fidelity-2026-11-07` branch
starts at freshly fetched main `7aa93a6f`, fast-forwards the parent's integration
`24824facdf7f36dfa3b36e6521e9686fe48d480b`, and carries the Research dependency
as `ba92384a` (the equivalent of `f93d7c65`; both completion entries were kept).
The three reviewed composition findings now have native implementations:

- **Fantasy Players:** a separate Players browse beside Rankings, alphabetical
  and unranked, built from the loaded snapshot's `playerProfile` observations.
  Each card shows observed points/game, its real recorded-game spark, season and
  last-three-calendar-week averages with their own samples, and native usage and
  comparison actions. Search matches names/teams/positions; position includes
  FLEX. Six-row pagination, filters and the exact opener survive usage Back.
  The addressable usage layer reuses `PlayerProfileBody`, with missing statistics,
  bye rows, source/scoring settings, opponent history and distinctly labelled GTL
  estimates. Existing Rankings remains the initial view for compatible links;
  its weekly/ROS, report and profile-sheet controllers remain available.
- **Historical Trends:** the selected title/rate header, full-width source curve
  below it, and separated conditions/sample footer replace the tiny inline
  miniature. Native consistency labels remain descriptive. Curves stay visible
  at 320px and use system-color lines in forced colors; unavailable source series
  still draw no curve. Expansion, chart/table selection and all six periods stay
  on the same original candidate read. No weekly ID is joined to a canonical ID.
- **One game:** a compact Game overview leads with individual team marks, names,
  same-season records and recorded schedule/coverage. Existing permitted game
  actions precede the Research tabs and statistics. The tall Games/matchup
  headings and extra Games lip no longer dominate the loaded view; the native
  shell Back retains its exact route/focus/scroll behavior. The accessible matchup
  heading and 44px pager remain, including during detail-code failure and retry.
  The pager is an intentional native extension between actions and panels; the
  approved preview has no paging. The League feed's game sheet keeps its header.

These changes use the exact read-only approved review at
`3ac2eb50513ba73447ef890e4a47863cde7bdd76`: `populated-fantasy.jsx`,
`fantasy-players-{dark,light}-phone.png`, `trends-list-{dark,light}-phone.png`,
`populated-game-teams-{dark,light}-phone.png` and the existing usage/ranking
references. Full-page native captures and approval-source hashes are under
[`design/prism-research-fidelity-2026-11-07/`](../design/prism-research-fidelity-2026-11-07/).
They use fictional accounts through the real local handler/PGlite and the existing
public Fantasy snapshot. The full document captures include the fixed native dock
at its capture position; they are not physical-phone or hosted acceptance.

The canonical candidate **By season array and non-shortlist source curves remain
open backend projection dependencies** described below. The existing weekly
per-season reader stays functional. Shared header/sports-row/dock positioning is
the parent's separate owner question. No SQL, migration, API/provider, scoring,
reveal, Home or Bets source change is included. Independent parent review and
whole-app release gates remain required; no push, PR, merge or deploy is claimed.

Fix-branch verification: **73 focused component tests**, **35 Fantasy model/token
checks**, typecheck, Brand QA, cloud build and bundle-only privacy scan passed.
The final **14 actual-handler/PGlite browser regressions passed without skips**:
rankings/scoring/bye filters; player profiles/comparison; observed pagination and
usage Back/focus; lazy game details with failure/retry; board/game/All-trends axe;
the retained weekly Since-2002/By-season grouped tiles; game routing/paging/team
navigation; all Research phone routes with wide fonts; permitted play statistics;
six-period research, source and market gates; full-width historical curves; and
closed-source disclosure behavior. The added layout matrix covers 320/390px,
Dark/Light, forced colors, 44px targets, overflow and keyboard controls.

Visual review compares the whole captured document with the exact approval
sources. The native source-date/stale notices, snapshot selectors and sample
counts remain explicit instead of copying the preview's fixed published date or
featured-player order. The game tabs use separately framed buttons that grow for
wrapped labels at 320px. Original phone/axe/privacy assertions remain; the Games
lip selector alone now follows the retained native shell Back control. The
Fantasy layer keeps a stable identity so inserting browse controls cannot discard
heading focus. Capture/source hashes in the fix manifest identify this evidence;
the older broad verification below belongs to the dependency's earlier source.
Final capture inspection restored the new game tabs to system Canvas/Highlight
in forced colors; the affected Games/phone/capture test passed again with an
explicit system-Highlight assertion. The scoped final CSS also passed the token
gate, cloud build and bundle-only scan again.

## Authority and source

The selected-system review at `3ac2eb50513ba73447ef890e4a47863cde7bdd76`,
`SELECTED_DESIGN_HANDOFF.md`, `populated-research`, `populated-games`,
`populated-teams`, `populated-fantasy`, the rankings/accuracy previews and
`game-research-panels.js` are the visual authority. Reference captures include
`league-wording-research-*-phone.png`, `research-games[-expanded]-*-phone.png`,
`research-teams-*-phone.png`, `populated-game-teams-*-phone.png` and
`fantasy-{rankings,accuracy}-*-phone.png`.

The owned branch is `codex/confirmed-prism-research-2026-11-07`, based on freshly
fetched `42a5ad9930a5712c6b357564701fbb5628b12b43`. Shared dependencies are
`1e104fdf1266660a84c98971ddae91d9c153be68`,
`c6ff0a980849bed11248bb653ce5d669b1c3bd71` and `642a240c`.
The parent integration already carries those dependencies; only the area commit
should be cherry-picked.

## Native scope mapping

| Rollout area | Native implementation and retained data/controller contract |
|---|---|
| 08 Research overview/game | Native matchup notebook, four destination cards and a labelled historical league-scoring chart. The next matchup uses the shared personal read and server clock; historical scoring reuses the existing fingerprinted public subset. Game detail has Trends & markets / Team performance, six evidence periods, existing market-history controls, records, scoring averages, margins and observed play statistics. |
| 09 Games | Day filters/counts; separate team circles; actual records and last-five results; shared zero-based scoring bars; lazy inline comparison and a native Research action. Expanded Games stacks the team choices, then one full-width Record and two scoring tiles; the game-detail performance panel keeps three peer tiles, as in the corresponding references. Missing statistics remain —. |
| 10 Trends | Historical row list with All/Spread/Total, six existing periods, win rate, W–L–P, sample sizes and available source curves. Native expansion, chart/table selection, source timestamps, stale/missing/error/retry states and saved trends remain. The selected period persists through the existing shell route field. Teams/Players/Build and older weekly game/trend addresses remain functional. The data projection follow-up below is not closed. |
| 11 Teams | All-team search; separate team/opponent marks; records and last-five form; existing Home/Road/PPG, margin and season views. The mounted parent retains search, scroll and opener focus on Back. Records from another season never label the current game. |
| 12 Fantasy usage/comparison | Existing snapshot, scoring, usage-profile and two/three-player comparison controllers. Source values, true zero, missing/bye gaps and native table scrolling remain; reading values stay 16px. No fixture profile, estimate or no-op save controller is introduced. |
| 13 Fantasy rankings/accuracy | Mark/rank/player/estimated-points hierarchy; visible search; existing weekly/ROS, position/team/trend filters and pagination. Accuracy keeps the original four metrics, position rows and biggest misses, with sourced paired GTL/season-average error bars on one zero-based scale. Missing baselines are omitted; comparisons use the original unrounded numbers. PROVISIONAL/FINAL and source/method notices remain. |

The area uses shared 28px cards, card face, glass line, depth, blur and masked
edge reflection. The Research destination cards use the shared native CardButton
material without modifying the global Tile primitive. Status colors keep their
existing meanings. Shared shell/header/dock positions and league reachability
are retained; this work does not decide the pending navigation arrangement.

The new comparison reads existing `/lines/assessments` only when opened. Its
observed play statistics follow the existing account/week scope and server-side
two-market gate. It retains sample counts, definitions, source time and nflverse
credit. It does not collect quotes or use a new provider. The dedicated team
view continues to use its existing lazy detail controller.

Graphical Games has taller cards than the old compact rows. Opening a fresh
game layer starts at the top, while paging retains its scroll and Back restores
the captured board/game position. Its short loading frame has enough end
clearance for the sports control to scroll entirely past the fixed header.
The test edge normalizer includes the sports control and keeps the original
44px/axe checks; no check is disabled or privacy sentinel relaxed.

## Required canonical research data follow-up

Do not mark canonical candidate **By season** complete. Existing weekly-card
season charts are still real and reachable: `/trends/week` has
`selection.perSeason`, mapped by `shared/trends-view.mjs` and the existing
`trendDetailProps`/TrendDetail/SeasonTable controllers.

Canonical `/lines/research` is a different candidate model. Its detail projection
in `cloud/trends-research.mjs` adds `recent`, `historical`, `seasonRecord`,
`prospective`, `retrospective` and the selected-period series; it has no exact
per-season array. `createResearchSnapshot` in
`shared/trends-research-candidates.mjs` currently stores six period summaries and
at most 48 chronological bins per period. Those bins may cross year boundaries,
so exact year records cannot be reconstructed from them.

The additive handoff is a bounded, source-derived season array for the same
permitted canonical candidate, built offline from its real matched records and
projected through the existing authenticated reader. Native SeasonTable rows
are `{season,w,l,p,units}`. ResearchCards' ResearchCard can pass those to the
existing TrendDetail `seasons` prop; ResearchDetail's separate candidate read
must keep its existing evidence-key guard when linking chart/table selection.
Never join a canonical candidate to an unrelated weekly card by a similar title.

Summary curves are currently projected only for shortlist candidates or an
explicit `candidateId`. Other canonical rows keep their missing miniature
curve rather than drawing fictional points; their existing on-demand detail
read can supply actual chart data. Completing every pictured miniature needs
that real detail or a bounded source-derived summary spark projection. No new
backend period, API implementation, migration or provider change is included
in this area commit.

The landing's fictional A/B Fantasy bars are not copied into production.
Unavailable landing summaries remain honest; the existing Fantasy route loads
its real rankings, usage and comparison data lazily.

## Local evidence and verification

- Full Vitest: **85 files / 887 tests passed**.
- Token parity, CSS rules and chart geometry: **23 Node checks passed**.
- Research/Fantasy/model/reveal suite: **94 Node checks passed**.
- Typecheck, Brand QA (Python UTF-8 mode), cloud-test build and bundle privacy
  scan passed. No live hosted check or deploy is represented by the bundle scan.
- The broad native browser matrix covered 106 cases. It found four layout/test
  transition issues; the corrected cases and latest compositions were rerun
  separately. All four original issues were reconciled; the last rebuilt
  **four focused browser checks passed**, including the complete Research
  phone matrix and both comparison arrangements. The capture manifest records
  the final focused verification.
- Browser coverage includes 320/390px in both themes, wide type and 200% text,
  keyboard chart/table selection, image/route/code/style recovery, account/week
  masking, market gates, hidden picks, old references versus current quotes,
  zero versus missing results, source freshness and forced colors.

Evidence is under
[`design/prism-research-native-2026-11-07/`](../design/prism-research-native-2026-11-07/).
These are native local fixture-world captures, not real player/account evidence.
Historical public source subsets remain labelled. Full-page browser captures
show the scroll document and fixed bars at the capture position; they are not
physical-phone acceptance or proof of hosted data, merge or release.

No production player data, API implementation, SQL/migration, provider budget,
global tokens, Home, Play or Bets implementation is changed by this area port.
The frozen tracker, other sessions and unpublished Mini worktrees are preserved.
The branch is intentionally unpublished for parent integration; no PR or deploy
was performed from this checkout.
