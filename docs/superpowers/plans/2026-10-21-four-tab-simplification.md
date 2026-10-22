# Four-tab simplification implementation plan

> For agentic workers: use subagent-driven-development to implement and review these tasks.

**Goal:** Build Sean's approved One thing first design across Home, Play, Bets and Research.
**Architecture:** Retain authenticated data providers and existing domain editors. Simplify the four roots; route into existing detailed workflows with origin-aware Back, explicit detail URLs and retained view preferences. Extend the shell rather than introducing another router.
**Tech stack:** React 19, Vite, existing GTL UI/tokens, Node tests, Vitest, Playwright/PGlite fixtures.

## Global constraints

- Exactly four labeled tabs: Home / Play / Bets / Research. League belongs to Play; Fantasy and game research belong to Research; account settings stay behind the avatar.
- One main action per root, compact summary rows, substantial lists on child pages. Follow the approved specification in `../specs/2026-10-21-four-tab-simplification-design.md`.
- Preserve scoring, per-game final lock, independent Spread/Total, chip entry, drafts, hidden-market privacy, source timestamps, actual-ticket terms, Virtual Units and shared audience labels. No migrations or new integrations.
- Use `design/tokens-next.json` and existing original identity. Light/Dark/System, 16px tappable text, 44px targets, safe-area and dock clearance; respect reduced motion.
- Retain old recovery access and all existing detailed workflows. Unavailable/stale data must stay explicit. No fabricated counts or live data.
- Work only in this task worktree; preserve other sessions and the frozen tracker. Commit reviewed named files; no deployment or merge is implied.

## Reconciliation completed before implementation

October 21: read PR #144's UX-NEXT-01, BETS-NEXT-01 and preservation requirements. Read-only SSH inspection of the Mini original checkout compared unpublished shell changes: Fantasy slot, icon, route, six-tab grid and their tests are represented by current main. No Mini files were changed. Real-iPhone acceptance remains open; browser geometry checks cannot close it.

### Task 1: Four-tab shell and reversible detail navigation

Files: `web/src/next/shell/{state.js,router.js,Shell.jsx,Frame.jsx,tabs.js,LayerHosts.jsx,shell.css,context.js}`, focused shell/router tests and harness as needed.

- [x] Add failing behavior tests for four tabs, legacy aliases, detail reload, nested Back, origin return and dirty-navigation cancellation.
- [x] Support detail destinations via `shell.go(tab, view)` and `shell.back()`, preserving existing view keys. Legacy `go('league'...)`, `go('lines'...)`, `go('fantasy'...)` map to the appropriate parent destination. `setView` still patches filter state; section changes must participate in navigation.
- [x] Keep `views.league`, `views.lines`, `views.fantasy` for retained adapters. New `views.research.section` values: `games`, `fantasy`, `trends`; Play detail sections `picks`, `score`, `compare`, `league`; Bets views `active`, `settled`, `tracked`, `recommended`, `virtual`, `add`. Empty section/view is the simplified root.
- [x] Main tab selection returns a selected tab to root; switching tabs preserves local filter preferences. Detail Back returns to actual opening screen. Expose a shared Back control through the frame or a reusable detail header. Do not mount hidden write forms that register active docks or dirty state.
- [x] Serialize only allowlisted navigation metadata into fragments/history (no player records, guesses or editor fields). Preserve auth fragments, old links and independent market intent across reload. Draft guards cover Back, same-tab return and browser traversal.
- [x] Use four equal bottom columns with 16px labels, stable viewport anchoring, safe area, measured dock space. Restore scroll/focus for ordinary drill-in Back.
- [x] Run shell/router unit tests and targeted shell harness browser tests. Review task diff before next task.

### Task 2: One thing first Home and Play

Files: `home/Home.jsx`, `home/home.css`, `play/Play.jsx`, new shared `ui/FocusLanding.jsx` and stylesheet if useful, Home/Play tests.

- [x] Reuse existing homeHero next-action state and existing data gates. Home shows one hero plus Your scores (independent markets), My bets, My league; move guidance, research preview, Fantasy, standings and full lists into appropriate details.
- [x] Play root shows one eligible Guess task, the other market row, My league, Your results. Open existing market editor and score/comparison adapters as child views without changing writes or chips.
- [x] Reuse current-week context from existing replies; no new score calculations. Keep errors/loading/unpublished and offline semantics.
- [x] Add/adjust meaningful markup and browser behavior tests for landing hierarchy, both market entry points, retained detailed results and no hidden references.
- [x] Verify targeted Home/Play tests and review.

### Task 3: Bets and Research roots, retained adapters

Files: `bets/Bets.jsx`, `SocialBetTracker.jsx` (minimal optional initial filter/create props only), new `research/Research.jsx`, `shell/registry.jsx`, `fantasy/FantasyScreen.jsx`, `lines/LinesBoard.jsx` if needed, affected tests.

- [x] Bets root: Add a bet hero plus Active tickets, Settled tickets, Recommended, Virtual Units rows. Child routes reuse existing tracker, recommendation handoff/review, filters, history and Virtual Units. Optional tracker props must default to existing old-app behavior. Add opens the actual editor after a successful read; cannot imply save.
- [x] Research root: Explore games hero plus Fantasy and Trends rows. Child destinations reuse LinesBoard/FantasyFootball and existing game/trends details, with honest snapshot/source states. No speculative Fantasy or prediction features.
- [x] Register only four main screens; retain layer registry and old destinations via aliases. Ensure My league and all old links actually render their existing adapters.
- [x] Test recommendation-to-ticket exact terms, active/settled filters, add/review/save and back, Research/Fantasy old links, game notes, history and settings paths.
- [x] Review task diff and focused test evidence.

### Task 4: Integration, visual verification and handoff

Files: affected browser fixtures/tests, specification status, BRAND_GUIDE selection status, COMPLETION_REGISTER and this checklist.

- [x] Run typecheck, unit tests, cloud boundary, brand QA, production build and relevant browser/privacy suites. Update obsolete navigation assertions without removing behavioral coverage.
- [x] Check all four roots and detail Back at 320/390, light/dark, long-list scroll, resized viewport, safe-area/dock clearance, keyboard and accessibility. Save fictional fixture screenshots and inspect them.
- [x] Independent whole-branch review; resolve important findings with covering tests.
- Publication procedure: update PR #162 for the implementation, commit named files, push, run sync:check and inspect exact-head CI. The PR and conversation handoff record the resulting full commit and publication status.


## Implementation and verification - October 21

Sean approved the specification and explicitly authorized this build. The roots
now use one main action and compact rows; existing editors and detail adapters
remain behind those rows. Back preserves filter preferences and safely restores
focus/scroll after asynchronous content arrives. Explicit week addresses survive
reload and override cached selection during browser traversal. Only allowlisted
navigation metadata enters history; editor fields remain private.

| Check | Observed result |
| --- | --- |
| Full npm run check | 1,456 Node tests passed, zero skipped; 198 Vitest tests passed; typecheck and production build passed |
| Final typecheck and Vitest after review fixes | Passed; 198/198 |
| Final shell/router/token tests | 45/45 |
| Shell browser checks | 19/19, then 4/4 focused checks after preference/focus refinements |
| Affected feature integration | Initial 56/62; all six failures corrected (obsolete navigation/read assertions and retained private-league access); final corrected six-file run 38/38 |
| Legacy browser suite | 41/41 |
| Performance | 4/4 |
| Critical-path accessibility | 7/7 |
| Brand QA and cloud-build boundary | Passed |
| Independent source review | No actionable findings remain after corrections |

The final six-file run includes four-tab-redesign, next-bets-live,
recommended-bets, next-data, next-game-notes and next-home. It also covers
historical ticket reload, an incoming different-week address, browser Back,
Fantasy reload, remembered All weeks recommendation review, and Add from both
all-week lists and a remembered Add destination. Existing per-game scoring,
legacy draft/receipt recovery, Lines/weather, league privacy, profile/settings
and comparisons passed in the broader integration run.

The final feature run used isolated loopback port 5207 and a separate build/results
directory after a local port 5198 collision invalidated an intervening attempt.
That interrupted attempt is not counted as product verification. Local logs,
review reports and fictional-account screenshots live under
`.local/four-tab-review/`; they are ignored review artifacts, not production data.
All four roots were inspected in light/dark at 320/390, with one primary action,
16px tab labels, bottom navigation visible after scrolling, no side overflow and
no axe violations. The existing detail/dock, keyboard and reduced-motion checks
remain covered by the shell suites. Physical iPhone/Home Screen acceptance has
not been performed.

Shell implementation commit: `4b695e485cf70fb05062f32c7fd6153403a34736`.
The feature implementation and this evidence are published through
[PR #162](https://github.com/seanbalz/guess-the-lines-repo/pull/162), branch
`codex/four-tab-design`. Exact-head CI and branch sync are reported in the PR and
conversation handoff; local passes alone do not establish hosted CI, merge or
deployment. No migration, production writer, scoring engine, release or native
binary was changed. Other checkouts and the frozen tracker were preserved.
