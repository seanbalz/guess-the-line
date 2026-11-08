# Confirmed Prism Glass visual rollout — November 7, 2026

Status: **implementation in progress; remaining rollout NOT DEPLOYED**.
This is the approved-scope implementation and verification checklist, not a
release record. Existing Home-only production release remains separate. The
latest approved Home spacing is implemented and deployed from `70c2b85ea7466ca308c8e69006b4ec09888267a7`.
The remaining areas below distinguish reviewed local implementation from release.

## Current implementation evidence

- Shared materials/type/identity: local commit
  `1e104fdf1266660a84c98971ddae91d9c153be68`,
  [native evidence](PRISM_SHARED_NATIVE_2026_11_07.md). Thirty-two Node contracts,
  58 component tests, 53 browser tests and 13 final focused browser checks passed;
  typecheck, Brand QA, build and bundle privacy scan passed. Independent source
  review found no important regressions. Shared source does not close the
  per-area layout checklist or the positional navigation question below.
- Play/Points/Score: initial area source `04190436480143fcc3fd4446297fd39c17f9767e`
  and closeout `4193f638c7769300deccb45f454ab3de2f69f921` are integrated.
  Independent source/capture review approved the profile, controls, score
  metadata/chart order and opponent-strip closeout. Thirty-two hashed captures
  record the native result. See [area evidence](PRISM_PLAY_SCORE_NATIVE_2026_11_07.md).
- Bets receipts, terms/results and detailed analytics: reviewed source
  `25d64f6cfe91e9def639c7ff6fbdd8ca427f7f63`, integrated as `b5e1f269`.
  Local integration passed all 85 files / 886 Vitest tests and typecheck. The
  approved Bets landing and four remaining compositions are now integrated from
  `a8797ae0d41087882c5ea7fbc04d9e324a4a266d` and
  `b86ea0ba14a78822eb5370a142ff07d0c3f37a0f`. Independent review
  approved actual owner ticket previews, permitted retained-assessment teaser,
  full-name entry choices and receipt/actions/history ordering. See
  [closeout evidence](PRISM_BETS_CLOSEOUT_2026_11_07.md).
  Final combined parent validation passed 87 files / 901 Vitest tests,
  typecheck, Brand QA and whitespace checks. No remaining rollout is deployed.
- Home spacing: [PR #494](https://github.com/seanbalz/guess-the-line/pull/494)
  merged at `70c2b85ea7466ca308c8e69006b4ec09888267a7` after all PR checks
  passed. Its first CI caught an old 212px loading placeholder and obsolete 18px
  padding assertion. Fix `2d96c5d7589df3ccfa7b840c0fae299a5e1de074` retains
  the approved ready layout, matches the 194px/16px loader and passed 40 Node /
  17 Home/layers/scrolling browser checks plus independent review. Fresh
  exact-main production CI passed all 12 jobs. Protected frontend deploy
  [42426632652](https://github.com/seanbalz/guess-the-line/actions/runs/42426632652)
  released Pages `6a847959-7b70-4c21-bcb3-fc2af1403621`; all 127 production
  assets matched at 23:47:36 UTC. API/workers/history remain unchanged.
- Integration checks found stale accessible-name/radius expectations, inline
  SVG vector numbers colliding with numeric privacy scans, and a possible
  pending-frame focus handoff race. Names are reconciled; brand SVGs now emit
  as unchanged cacheable media without relaxing privacy scans. Research owns
  actual chart target sizing. The deterministic Shell focus fix is integrated
  and independently reviewed; it cancels only pending forward restoration after
  the user moves focus or starts input, preserving native Back restoration.
- Integration CI follow-up: the retained editor receives optional identity view
  slots from native Bets, and its selected skin is consolidated into the existing
  `liveBets.css` adapter. Import-boundary and token checks are unchanged. Ticket
  and recommendation loading use native Skeleton shapes. Browser regressions
  now take the approved direct-market and score/history comparison paths. Local
  checks passed: 26 import/loading/token contracts, 25 affected component tests,
  six Bets controller flows, two local social flows and three full-root/Compare/
  draft-guard flows. The broad Node run passed 2,936 of 2,938 before its two
  temporary stylesheet-location findings were repaired; the affected contracts
  subsequently passed. Final component validation passed all 901 tests again.
  The 28px card assertion passed its original disclosure/hidden-content browser
  case. Further phone checks repaired a real Pick'em inset below 8px and a 24px
  All ticket views summary; the summary now has a 44px target. The original
  score-label/padding and full-shell target/axe cases passed, as did badge
  first-read/moment seeding through the updated score card. The shell's exact
  read inventory includes the retained-assessment POST, verified read-only in
  `cloud/lines.mjs` and `cloud/research-assessments.mjs`; unknown mutations remain
  counted. Broader PR CI and the separately owned Research fixes remain pending;
  no full-suite or release claim is made here.
- Research source `f93d7c6560842be78ad0bd9a15d14632bb60fd0f` and fidelity fix
  `2ac6ff1c31d52cba02b8c2f41ab7258035289925` are integrated as `d4d1d694`
  and `2ef9ca46`. Independent review supports the three implementation fixes:
  observed Fantasy Players browse and addressable usage, full-width Trends
  curves/footer, and compact Game overview with actions before Research panels.
  Two mislabeled 390px Light captures were replaced by `ce524dfc`, integrated
  as `b5dea82d`; independent re-review closed that evidence finding. The helper
  now sets the real saved preference and asserts resolved attributes and rendered
  canvas/ink. The other 28 capture files are unchanged. Combined parent validation
  passed all 88 files / 906 Vitest tests, typecheck and 26 import/loading/token
  contracts. [Evidence and exact limits](PRISM_RESEARCH_NATIVE_2026_11_07.md).
  Canonical candidate season rows and bounded non-shortlist curves are now
  integrated from independently approved `0bec834d` / `a1a2d4cf`, as `d50a657a`
  / `266c74e6`. Exact selected-record season arrays, lazy full detail and bounded
  previews preserve existing scope/reveal/source rules. Source verification:
  39 Node, 46 component and eight native browser checks; six real public-data
  assets reproduced byte for byte. [Data compatibility and evidence](RESEARCH_CHART_PAYLOADS_2026_11_07.md).
  The hourly refresh may publish additive fields after main merge, before API;
  old readers tolerate them. API/frontend deployment and actual data publication
  remain release work. No Research release or physical-device acceptance is claimed.
- League and National Football League actions: independently reviewed source
  `194ba410` / `e1dcb1ff` / `b5fa0244` is integrated as `eacbeb06` / `1ad151f6`
  / `893ee2ba`. Private weekly labels, native uncertain-close dialog, contextual
  standings/feed hierarchy, game-bet alignment and transparent comments/Picks/
  Reactors surfaces are corrected. The final review checked all 213 capture and
  29 source hashes. [Scenario coverage](PRISM_LEAGUE_ACTIONS_FIDELITY_FIXES_2026_11_07.md)
  remains 33 paired, five unverified and five held core scenarios; saved-scope,
  four Menu variants and the distinct forfeit account-change branch still need
  coverage. Shared frame and finer Virtual Units compatibility remain held.
  This closes the reviewed defects, not all 106 references or hosted acceptance.
- Latest integrated validation through `893ee2ba`: all 89 files / 911 Vitest
  tests, typecheck, 51 focused data/token Node checks, Brand QA, cloud build and
  bundle privacy passed. Four integration browser checks passed: actual public
  row previews/seasons/table selection, period/account late-reply isolation,
  hidden/uncertain Picks and Reactors loading/failure/empty states. Re-execution
  generated temporary captures; reviewed committed captures and manifest were
  preserved. PR CI at prior `7ce04475` passed Tests, Brand, dashboard, Persona
  and browser shards 1/4; shards 2/3 exposed stale pre-port selectors/layout
  assumptions plus game-note keyboard clearance and a wide-font Games spacing
  issue. Those findings need repair and fresh exact-source CI before release.
- Tracked bet stakes support smaller custom values without backend changes.
  Virtual Units still has positive-half-unit enforcement in both API and SQL;
  its approved finer entry requires a separately reviewed compatibility change
  and explicit migration-apply authorization. Do not present unsupported values
  as saveable or treat this dependency as an unanswered design choice.

### Navigation discrepancy found during implementation

The approved Home/overview captures use the logo-and-league header and floating
bottom bar. The separately approved `league-wording-native-nfl-dark-phone.png`
and `league-wording-native-epl-light-phone.png` instead retain Community/FEPL
in the header, a separate centered sports row and a full-width bottom bar.
This is a concrete conflict between approved references, not a reopened palette
or material decision. One owner question with both existing references asks
which arrangement should govern the other screens. Structural changes to those
headers/docks are held pending the reply; native league switching remains
reachable. The separately approved Home spacing release and independent area
implementation continue. No new Menu switcher placement is inferred.

## Authority and approval boundaries

Sean's current instruction is: “That looks better. Continue to deploy. Move onto
deploy all off the rest of the visual updates”. His standing restriction remains:
implement confirmed mockup designs/layouts; do not invent arrangements. Preserve
prior scoped approvals without reopening selected recipes or navigation unless
an actual issue is reported. Completing a styling foundation alone does not
complete the approved application redesign.

The reference worktree is
`C:/Users/sbals/betting-repo-worktrees/owner-acceptance-2026-11-04`, at
`3ac2eb50513ba73447ef890e4a47863cde7bdd76`. Reference files below are under
`design/style-directions-2026-11-04/` in that commit. They may not yet exist in a
fresh production task checkout; read the reference commit, without switching or
changing its owner's checkout.

- `SELECTED_DESIGN_HANDOFF.md`: consolidated system and implementation boundaries.
- `selected-system-review.json`: exact recipes, per-area approval scopes,
  reviewed commits/captures and capture hashes. This is the detailed ledger.
- `selected-system-overview.html` / `selected-system-review.html`: rendered evidence.
- `NATIVE_COVERAGE_REVIEW.md`: native coverage and preserved limitations.
- `DESIGN_DEPLOYMENT_ROADMAP.md`: implementation, integration, CI, phone acceptance
  and hosted release workstreams.
- `PICK_SCORECARD_REVIEW.md` / `pick-scorecard-review.html`: exact paired scorecard.

The saved handoff says scorecard visual approval is pending. That wording predates
Sean's subsequent “Perfect. Now answer my question about what else is needed to
deploy full redesign”, after choosing “Pick-focused scorecard (recommended)”,
followed by “Move forward with rec”. The active-session authority and PR #491
handoff record identify the reviewed reference as `3ac2eb50513ba73447ef890e4a47863cde7bdd76`.
Treat that exact dark/Porcelain rendering as approved. Both earlier empty full-pill
placements remain rejected. Do not infer a new layout or copy fictional data.

Representative scoped approvals in the ledger:

| Approved set | Reviewed commit | Scope |
|---|---|---|
| Current Home/Play/Bets and ticket/entry closeout | `6bfcfdbe787bdc2d44019aa3e3c85530cf009ebd` | Fourteen supplied paired captures; earlier specialized approvals retained |
| NFL actions/shared navigation | `9c2aa961f14f6a68cc51858e777c4e0796a9b5e5` | 104 newly approved plus two prior Virtual-minimum captures, 106 total |
| EPL shell | `c6fb2b44bacc90fa44ba89e8932da7343e20cf4b` | Eight supplied league/History/Bets/Info captures |
| Team/league circles | `d109e5386b49093f66b173492261bbb5e126739a` | Twenty supplied captures; G excluded |
| Full league wording | `5fe706bc7f1ecea2d51ab2b5f40d486f7d050718` | Twenty supplied full-name explanation/logo navigation captures |
| Account Guess History | `e585b0afa23deb49996f4b044010d5b41656d5ce` | Nineteen states plus expanded/Info views, 44 captures |
| Account Bets/Older History | `5c4210863f486bf77b1fec251073b26a55d5d89e` | Sixty supplied captures |

Visual approval covers supplied presentations and recorded linked examples; it
is not acceptance of every unseen state, actual saves, hosted sources, privacy,
permissions or physical-device behavior. The registered route inventory below
is a reconciliation checklist, not blanket owner acceptance of unseen states.
Except for the shared-frame discrepancy above, no owner design decision remains
open for the confirmed scope described here.

## Exact selected recipes

`prism-refinement.css` includes historical blue exploration defaults. Do not copy
it wholesale. Use final JSON recipes and later selected adapters; move their
values and structure into native reusable components, not DOM preview adapters.
The native token source is `design/tokens-next.json`; update it and native CSS
tokens together and retain token parity. Legacy `design/tokens.json` is not
silently rewritten by this rollout. Read `docs/BRAND_GUIDE.md` and token sources
before any implementation.

| Recipe | Dark | Light / Porcelain |
|---|---|---|
| Canvas | `#202126` | `#E9ECE8` |
| Background | `linear-gradient(150deg,#2A2D37 0%,#202126 50%,#17181D 100%)` | `linear-gradient(150deg,#FAFBF6,#E9ECE8 55%,#E0E7DE)` |
| Text / muted | `#F3E9D7` / `#C4B9A6` | `#243128` / `#536252` |
| Accent | `#B8F34B` | `#3B6309` |
| Card fill | `linear-gradient(135deg,#FFFFFF14,#FFFFFF06)` | `linear-gradient(135deg,#FFFFFFC7,#FFFFFF66)` |
| Card border | `#FFFFFF38` | `#FFFFFFD9` |
| Card shadow | `inset 0 1px 0 #FFFFFF80,0 4px 6px #00000070,0 18px 28px #000000A6` | `inset 0 1px 0 #FFFFFF,0 4px 6px #20302412,0 18px 28px #20302424` |
| Primary action | Transparent, ink `#F3E9D7`, full `3px solid #B8F34B` outline | Transparent, ink `#2C4617`, full `3px solid #3B6309` outline |
| Primary shadow | `inset 0 1px 0 #FFFFFF26,0 8px 16px #00000080` | `inset 0 1px 0 #FFFFFFCC,0 8px 16px #24332318` |
| Secondary shadow | `inset 0 1px 0 #FFFFFF40,0 4px 8px #00000040` | `inset 0 1px 0 #FFFFFFCC,0 4px 8px #24332312` |
| Original G | `logo-hybrid/lime.svg` | `logo-hybrid/light-deep-green.svg` |

Cards use 28px radius, 18px blur, `.65` gloss. Primary and secondary actions use
20px radius; primary shine is zero and backdrop is `blur(18px)`.
Typography is `-apple-system, BlinkMacSystemFont, Inter, "Segoe UI", sans-serif`.
Icons use Lucide geometry with selected **03 Glossy glass** finish. Use selective
accent on action cards/key ranks/accuracy figures; supporting cards stay neutral.

One individual glass circle belongs behind each team/league mark, contain-fit,
with preserved source art/proportions. The G is excluded. League controls use
52px circles, 30×32px artwork and 8px gap with an active theme-accent outline.
Team circle sizes remain contextual; former Home 34×38 portraits become 34×34,
compact Research 32×34 becomes 32×32. Nested operational marks have a transparent
inner background, leaving one outer glass circle. Home game-detail fallback marks
use separate 64px circles. Full National Football League / Premier League names
belong in explanations and descriptive accessible labels; navigation uses marks.
FEPL remains the existing named identity. Preserve source/code literals, typed
values, route IDs and stored team/sport codes; never broad-replace MIN/NEW/NO.
Official marks identify teams/leagues with source notices, not GTL branding or
an asserted license/affiliation.

## Per-area implementation checklist

All unchecked entries below are **NOT IMPLEMENTED / NOT DEPLOYED as a complete
approved visual port by this audit**. Existing functional code or a shared token
change does not close an entry. Each entry requires native-source reconciliation,
actual data/controllers, both-theme capture comparison and appropriate checks.
Native paths below are under `web/src/next/` unless otherwise stated. Artifact
stems mean the matching `.jsx` / `.css` plus ledger entry; fixture modules are
reference math/data only and must not enter the production bundle.

### 01. Shared system and shell

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `selected-system-review.json; selected-system-review.js; prism-refinement.css; visual-icon-treatments.css; populated-nfl-actions; NFL_ACTIONS_NAVIGATION_REVIEW.md`.
- Native targets: `styles/tokens.css, base.css, components.css; ui primitives; shell/Frame.jsx and shell.css; me/MenuSheet.jsx`.
- Required presentation and behavior: Themes/type/material/icons, cards/buttons/inputs/chips/dialogs/sheets/charts; four tabs, access-defined sports, NFL-only, admin/non-admin/reminder-disabled/busy Menu and failed layers. Retain routes, badge semantics and native controllers.

### 02. Team/league identity and wording

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `selected-league-marks.js; selected-team-circles.js; selected-league-wording.js; LEAGUE_CIRCLES_SELECTED_REVIEW.md; TEAM_LEAGUE_CIRCLES_REVIEW.md; LEAGUE_WORDING_REVIEW.md`.
- Native targets: `ui/TeamMark.jsx, Matchup.jsx, PictureRow.jsx; shared sport controls and per-context wrappers`.
- Required presentation and behavior: Separate glass circles, context sizing, full explanatory names, accessible labels and image fallback. G excluded; preserve FEPL and actual code/route/option values.

### 03. Home latest spacing

- [x] Port and verify this area. Status: **IMPLEMENTED AND DEPLOYED** from
  `70c2b85ea7466ca308c8e69006b4ec09888267a7`, Pages `6a847959`, verified
  frontend run `42426632652`. [Durable release evidence](https://github.com/seanbalz/guess-the-line/pull/496).
- Reference: `Approved home-spacing artifacts at 5faead67b9a66091c595168d89bfe21556dec01f; overview-closeout-home captures; home-compact-selected.js`.
- Native targets: `home/Home.jsx, ApprovedHome.jsx, HomeBrand.jsx, approvedHome.css`.
- Required presentation and behavior: Latest approved spacing has a 60px ring and 16px card padding (supersedes the earlier 18px reference). Real market-specific figures, live reads, 80px charts, targets, safe areas and privacy rules are retained. Loading placeholder matches the 194px ready card.

### 04. Play overview, Spread and Total

- [x] Port and verify this area. Status: **LOCALLY IMPLEMENTED AND REVIEWED / NOT DEPLOYED**. Source `4193f638`, integrated `be5986ba`; [evidence](PRISM_PLAY_SCORE_NATIVE_2026_11_07.md).
- Reference: `overview-closeout-play captures; populated-play; playDraftLockIn`.
- Native targets: `play/Play.jsx, PerGamePlay.jsx, GuessPicker.jsx and dialogs/cards`.
- Required presentation and behavior: Draft, confirmation, locked-in, separate markets and overview. Preserve per-game locks/drafts, configured deadlines and reveal/controller behavior.

### 05. Guess the Points

- [x] Port and verify this area. Status: **LOCALLY IMPLEMENTED AND REVIEWED / NOT DEPLOYED**. Source `4193f638`, integrated `be5986ba`; [evidence](PRISM_PLAY_SCORE_NATIVE_2026_11_07.md).
- Reference: `populated-points; points-preview-stepper.jsx; pointsDraftPreview`.
- Native targets: `play/points/PointsBallot.jsx, PointsProfile.jsx, PointsBoard.jsx, SlotContext.jsx`.
- Required presentation and behavior: Week overview, player draft, confirmation, usage profile and confirmed card; whole-point bounds/taps/hold behavior and retained independent drafts.

### 06. Scores and history

- [x] Port and verify this area. Status: **LOCALLY IMPLEMENTED AND REVIEWED / NOT DEPLOYED**. Source `4193f638`, integrated `be5986ba`; [evidence](PRISM_PLAY_SCORE_NATIVE_2026_11_07.md).
- Reference: `populated-score; score-preview-number-line.jsx; scoreHistoryPreview`.
- Native targets: `play/WeeklyScore.jsx, ScoreComparison.jsx, score tiles and history layers`.
- Required presentation and behavior: Separate Spread/Total summaries, team AND matchup filters/subtotals, six/show-all game list, history scale, signed game axis, source Info; actual outcome stays separate from guess scoring.

### 07. League boards, feed and comments

- [ ] Port and verify this area. Status: **LOCALLY IMPLEMENTED / SCOPED REVIEW APPROVED / COVERAGE GAPS / NOT DEPLOYED**. Five reviewed findings and expanded native state coverage are in [the fidelity fix record](PRISM_LEAGUE_ACTIONS_FIDELITY_FIXES_2026_11_07.md); all held/unverified states remain explicit.
- Reference: `populated-league; leaguePreview`.
- Native targets: `league/LeagueScreen.jsx, LeagueBoard.jsx; feed/Feed.jsx, DigestCard.jsx, PostCard.jsx, CommentsSheet.jsx and reactions`.
- Required presentation and behavior: Spread/Total/Points boards, ties/unranked/House, more rows, folded posts, hidden picks/results, six reactions and comment drafts/length/focus return. Use native persistence/privacy gates.

### 08. Research overview and game

- [x] Local visual/data port and independent review complete. Status: **IMPLEMENTED LOCALLY / NOT DEPLOYED**. [Visual evidence](PRISM_RESEARCH_NATIVE_2026_11_07.md), [canonical data and release dependencies](RESEARCH_CHART_PAYLOADS_2026_11_07.md).
- Reference: `populated-research; game-research-panels.js; populatedGameResearch`.
- Native targets: `research/ResearchLanding.jsx, ResearchView.jsx, MatchupResearch.jsx, ResearchCards.jsx, ResearchChart.jsx; lines/GameDetails.jsx; charts/`.
- Required presentation and behavior: Compact header, six evidence periods, chart/table links, season comparisons, team records/PPG/margins/play statistics, original market-history deep link; preserve real source/missing/stale states.

### 09. Research Games

- [x] Port and verify this area. Status: **LOCALLY IMPLEMENTED AND REVIEWED / NOT DEPLOYED**. Sources `f93d7c65`, `2ac6ff1c`; [native evidence](PRISM_RESEARCH_NATIVE_2026_11_07.md).
- Reference: `populated-games; populatedGamesList`.
- Native targets: `lines/GamesScreen.jsx, LinesBoard.jsx and owning Research Games view`.
- Required presentation and behavior: Day filters/counts, individual team circles, records/last-five, shared zero-based PPG scale, inline team comparison and keyboard chart selection.

### 10. Research Trends

- [x] Local visual/data port and independent review complete. Status: **IMPLEMENTED LOCALLY / NOT DEPLOYED**. [Visual evidence](PRISM_RESEARCH_NATIVE_2026_11_07.md), [canonical data and release dependencies](RESEARCH_CHART_PAYLOADS_2026_11_07.md).
- Reference: `populated-research; populatedTrendsList`.
- Native targets: `trends/TrendsScreen.jsx, TrendLayer.jsx; charts/TrendRow.jsx, TrendDetail.jsx; research/ResearchChart.jsx`.
- Required presentation and behavior: Market filters, six periods, records/sample counts/sparklines, expanded charts/tables/results and keyboard selection; do not fabricate evidence.

### 11. Research Teams

- [x] Port and verify this area. Status: **LOCALLY IMPLEMENTED AND REVIEWED / NOT DEPLOYED**. Source `f93d7c65`; [native evidence](PRISM_RESEARCH_NATIVE_2026_11_07.md).
- Reference: `populated-teams; populatedTeams`.
- Native targets: `teams/TeamsScreen.jsx, TeamView.jsx, TeamSheet.jsx, TeamMatchup.jsx`.
- Required presentation and behavior: Search all teams, own/opponent circles, records/last-five, home/road/PPG, margin chart and games, browse/scroll/focus preservation on Back, source Info.

### 12. NFL Fantasy browse, usage and comparison

- [x] Port and verify this area. Status: **LOCALLY IMPLEMENTED AND REVIEWED / NOT DEPLOYED**. Sources `f93d7c65`, `2ac6ff1c`, corrected Light evidence `ce524dfc`; [native evidence](PRISM_RESEARCH_NATIVE_2026_11_07.md).
- Reference: `populated-fantasy; populatedFantasy`.
- Native targets: `fantasy/FantasyScreen.jsx, FantasyTools.jsx and related native views`.
- Required presentation and behavior: Search/position/pagination, scoring settings, actual points/usage profiles and missing/bye gaps, two/three-player comparison, native table scrolling and Back/focus retention.

### 13. NFL Fantasy rankings and accuracy

- [x] Port and verify this area. Status: **LOCALLY IMPLEMENTED AND REVIEWED / NOT DEPLOYED**. Sources `f93d7c65`, `2ac6ff1c`; [native evidence](PRISM_RESEARCH_NATIVE_2026_11_07.md).
- Reference: `populated-fantasy-rankings.jsx; populated-fantasy-accuracy.jsx; fantasyRankingsAccuracy`.
- Native targets: `fantasy/FantasyReport.jsx and owning ranking views/models`.
- Required presentation and behavior: Weekly/ROS/search/position/team/trend filters, rankings/profile links, report metrics/position rows/biggest misses, source/method/provisional labels and native paired error bars.

### 14. Bets overview, receipts and entry

- [x] Port and verify this area. Status: **LOCALLY IMPLEMENTED AND REVIEWED / NOT DEPLOYED**. Source `b86ea0ba`, integrated `35ae5fc6`; [evidence](PRISM_BETS_CLOSEOUT_2026_11_07.md). Virtual Units finer precision remains a separate API/SQL dependency.
- Reference: `overview-closeout-bets/open-ticket/settled-ticket/entry captures; populated-bets; isolated-bet-editor.jsx; bets-number-choices.jsx; bets-book-choices.jsx`.
- Native targets: `bets/Bets.jsx, TrackedBetRow.jsx and actual tracked editor/controller; web/src/trackedBetTerms.js`.
- Required presentation and behavior: Open/settled receipts, single/parlay selection and terms, incomplete-leg guards, units/cash conversion, manual source catalog; unknown odds/return/source/time stays unknown.

### 15. Bets performance

- [x] Port and verify this area. Status: **LOCALLY IMPLEMENTED AND REVIEWED / NOT DEPLOYED**. [Initial evidence](PRISM_BETS_NATIVE_2026_11_07.md) and [closeout](PRISM_BETS_CLOSEOUT_2026_11_07.md).
- Reference: `populated-bets-overview; betsOverviewPreview`.
- Native targets: `bets/TrackedOverview.jsx, NetUnits.jsx and charts/filters`.
- Required presentation and behavior: Net chart/keyboard-pointer selection, record/open counts/risk/ROI, breakdowns/matching tickets, result/type/source/date filters/reset, optional cash, zero-filter and unknown-price states.

### 16. Bets results and corrections

- [x] Port and verify this area. Status: **LOCALLY IMPLEMENTED AND REVIEWED / NOT DEPLOYED**. [Initial evidence](PRISM_BETS_NATIVE_2026_11_07.md) and [closeout](PRISM_BETS_CLOSEOUT_2026_11_07.md).
- Reference: `populated-bets-changes; isolated-result-editor.jsx; betsChangesPreview`.
- Native targets: `Actual result/correction editors and tracked receipts/history`.
- Required presentation and behavior: Player-reported result/full return/source, validation/pending restoration, open-ticket corrections/reason, protected settled terms, retained versions and expandable before/after history.

### 17. Historical gap record

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `populated-gap-record; gapRecordPreview`.
- Native targets: `Owning native gap-record/recommendation view; charts/TrendDetail.jsx, TrendLine.jsx; number-line presentation`.
- Required presentation and behavior: Hit-rate/W-L-P, week/market/gap filters, paper-unit chart/outcome selection, spread/total details and Back retention; actual source records and explicit paper-unit assumptions.

### 18. NFL action layers

- [ ] Port and verify this area. Status: **LOCALLY IMPLEMENTED / COVERAGE GAPS / NOT DEPLOYED**. [The 43-state fidelity ledger](PRISM_LEAGUE_ACTIONS_FIDELITY_FIXES_2026_11_07.md) maps each exact native composition and distinguishes paired captures, unverified states and held API/SQL/shared-frame work. No 106/106 acceptance claim.
- Reference: `NFL_ACTIONS_NAVIGATION_REVIEW.md; populated-nfl-actions; isolated-nfl-actions.jsx; nflActionsNavigationPreview`.
- Native targets: `play/ForfeitDialog.jsx; lines/YourPickSheet.jsx, EveryoneGuesses.jsx; bets/GameBetsSheet.jsx, EveryoneBets.jsx, PlaceBets.jsx; feed/PicksSheet.jsx, ReactorsSheet.jsx`.
- Required presentation and behavior: All 106 approved captures: reveal/forfeit, saved drafts/pending/stale/scope, game/everyone bets and read states, feed hidden/picks/share uncertain, reactors/read states, Virtual entry/slip/locked/no-offer/busy/uncertain, source/rules Info and scrolled forms. Exact scenarios below.

### 19. Account overview, Profile and Reminders

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `Account overview captures; populated-account; accountProfileRemindersPreview`.
- Native targets: `me/MenuSheet.jsx, ProfileSettings.jsx, PickReminders.jsx`.
- Required presentation and behavior: Name/unchanged/validation/conflict/uncertain check; reminders off/on/blocked/install/unsupported/unconfigured. Preserve actual subscriptions, permission request and granted-permission semantics.

### 20. Settings and guidance

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `populated-account-tools; accountToolsPreview`.
- Native targets: `me/AccountPreferences.jsx and guidance destinations`.
- Required presentation and behavior: Manual book preferences/selected count, retained-unavailable and conflict drafts, getting-started preference; all 19 guidance topics and original source/license links.

### 21. Public app invite

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `populated-app-invite; appInvitePreview`.
- Native targets: `Account entry and actual app invite/share view/controller`.
- Required presentation and behavior: Approved generic shareable public link; native device sharing when supported and manual-select fallback. Button/link is not authorization to send messages to others.

### 22. Authentication, recovery and first name

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `populated-access; accessPreview; accessRecoveryPreview`.
- Native targets: `web/src/AuthGate.jsx; me/NameStep.jsx`.
- Required presentation and behavior: Sign-in/create/email confirmation/name; forgot/reset/account-neutral notice/mismatch/unavailable/loading. Preserve provider/session/recovery validation and returning-account skip behavior.

### 23. Session and retained-name recovery

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `populated-session-recovery; sessionRecoveryPreview`.
- Native targets: `me/SignInAgain.jsx, NameStep.jsx`.
- Required presentation and behavior: Password/Google methods, failed/Google-only, name uncertain/offline/sign-in-required and saved invitation notice; explicit check versus Continue semantics.

### 24. Appearance

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `populated-appearance; appearancePreview`.
- Native targets: `Actual native theme/motion preferences and store`.
- Required presentation and behavior: Dark/Light/System miniature preview, explicit and OS reduced motion, unavailable storage, device-only persistence and OS precedence.

### 25. Export

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `populated-export; exportPreview`.
- Native targets: `me/ExportSheet.jsx and actual authenticated export controller`.
- Required presentation and behavior: Overview/categories/preparing/busy/completion/failure/retry/unavailable, owner-scoped data and actual device downloads; preserve excluded push devices/nothing deleted.

### 26. App continuity

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `populated-continuity; isolated-continuity-views.jsx; continuityPreview`.
- Native targets: `shell/AppGate.jsx, Boundary.jsx, native offline/failure/reload surfaces`.
- Required presentation and behavior: Offline, startup skeleton, account failure, tab/page failure retaining navigation, dirty-reload warning; actual preservation and confirm-before-clear order.

### 27. League setup and invitations

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `populated-league-setup; leagueSetupPreview`.
- Native targets: `league/SwitcherSheet.jsx, CreateLeague.jsx, InvitePlayers.jsx`.
- Required presentation and behavior: Community-first switcher, private Duel/Group creation, host-only invitation entry/link/status/revoke/join check. Retain actual permissions, token validation and uncertain readback.

### 28. League access recovery

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `populated-league-access; isolated-league-access-views.jsx; leagueAccessPreview`.
- Native targets: `Native access/removed/invite cards and league shell`.
- Required presentation and behavior: Private access pending, removed Community with/without private fallback, saved invitation, joining busy/uncertain; records/retention and real access rules preserved.

### 29. Commissioner members

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `populated-commissioner; commissionerMembersPreview`.
- Native targets: `me/commissioner/CommissionerTools.jsx; me/CommunityMembers.jsx`.
- Required presentation and behavior: Six native destinations, member list/remove/restore confirmations, self-protection, pending check and admin-required states; actual authorization/concurrency/readback.

### 30. Commissioner weekly operations

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `populated-commissioner-status; commissionerOperationsPreview`.
- Native targets: `Existing status/week-opening/settlement tools and controllers`.
- Required presentation and behavior: Status, free-quota pause, uncertain settlement/check, week inputs, reviewed schedule and error; preserve schedule review, bounds, freshness and free limits.

### 31. Referee assignments

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `populated-referees; refereesPreview`.
- Native targets: `web/src/RefereeAssignments.jsx`.
- Required presentation and behavior: Current/draft/busy/partial-save/read-error; retained remaining drafts/extra options/explicit clearing and hosted-over-file precedence.

### 32. Final-score review

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `populated-final-review; finalScoresReviewPreview`.
- Native targets: `Existing commissioner final-score review view/controller`.
- Required presentation and behavior: Entry/completed assertion/first confirmation/source correction/conflict refresh-adopt-review/unavailable/busy; retain source scope, versions and Challenge grading warning.

### 33. Odds connection

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `populated-odds-connection; oddsConnectionPreview`.
- Native targets: `me/commissioner/OddsConnection.jsx`.
- Required presentation and behavior: Initial/measured check/fetch count/quota block/pending/rate-limit/busy; preserve measured threshold/reserve, free-only limits and actual request/readback gates.

### 34. EPL correction review

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `populated-epl-corrections; eplCorrectionsPreview`.
- Native targets: `me/commissioner/EplCorrectionReviews.jsx`.
- Required presentation and behavior: Ready/missing/empty/unavailable/failed/denied/loading/refreshing/stale, source times and signed differences; remains read-only.

### 35. EPL manager linking

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `populated-epl-claim; isolated-epl-claim.jsx; eplManagerPreview`.
- Native targets: `epl/ClaimCard.jsx`.
- Required presentation and behavior: Choose/watching/linked/taken/already-linked/failed/uncertain/busy/no-managers; preserve first-claim concurrency, identity/grants and session watching.

### 36. EPL Home and recovery

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `populated-epl-home; isolated-epl-home.jsx; eplHomeRecoveryPreview`.
- Native targets: `epl/EplHome.jsx, PickATeam.jsx; epl/guess/HomeMoneylineProgress.jsx`.
- Required presentation and behavior: Turn/picked/unlinked/all-in/locked/progress-failed/loading/failed/forbidden/off/no-week/stale/review and source popup; real clock/turn and independent progress recovery.

### 37. EPL draft, confirmation and backups

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `populated-epl; isolated-epl-queue.jsx; eplDraftPreview`.
- Native targets: `epl/DraftBoard.jsx, PickATeam.jsx, QueueSheet.jsx, MarginChart.jsx`.
- Required presentation and behavior: Can-pick/waiting/closed, confirmation/latest pick change, ranking move/add/remove, skip taken clubs, first available ranked club and tied margin bonus presentation.

### 38. EPL Moneyline

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `populated-epl-moneyline; isolated-epl-moneyline.jsx; eplMoneylinePreview`.
- Native targets: `epl/guess/EplGuess.jsx, GuessCard.jsx, PriceStepper.jsx, DistanceLine.jsx, EplGuessLeaderboard.jsx`.
- Required presentation and behavior: Entry/saved draft/results/closed/uncertain/stale/busy/read-only/unavailable/loading/failed; leaderboard/empty/loading/failed and expanded reveal. Actual quote/save/lock/privacy rules.

### 39. FEPL Fantasy

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `populated-epl-fantasy; isolated-epl-fantasy.jsx; eplFantasyPreview`.
- Native targets: `epl/fantasy/EplFantasy.jsx, Matchup.jsx, Standings.jsx, Rosters.jsx, Insights.jsx, WeeklyLine.jsx`.
- Required presentation and behavior: Matchup/standings/rosters/insights/no-repeat/ambiguous/no-team/matchup gaps/standing missing/insight gaps/no detail/loading/failed/forbidden/off/no-data, expanded standing and source/estimate Info.

### 40. EPL shell

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `EPL_SHELL_REVIEW.md; populated-epl-shell; isolated-epl-shell.jsx`.
- Native targets: `epl/EplShell.jsx, EplApp.jsx`.
- Required presentation and behavior: FEPL league sheet, History unavailable/NFL handoff, Bets unavailable and Info. Preserve existing availability; no new EPL history/betting feature.

### 41. Account Guess History

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `populated-account-history; isolated-account-history.jsx; accountGuessHistoryPreview`.
- Native targets: `me/HistoryGuess.jsx, HistoryMatchup.jsx, HistoryPage.jsx`.
- Required presentation and behavior: Nineteen states and expanded game/source/rules views, 44 captures: weeks/week/total/other-hidden/removed/sat-out/practice/empty/loading/failed/records-off/changes loading-failed-empty-held/draft-active/late/ruled/no-ballot.

### 42. Account Bets and Older History

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `HISTORY_BETS_OLDER_REVIEW.md; populated-history-records; isolated-history-records.jsx`.
- Native targets: `me/HistoryBets.jsx, HistoryOlder.jsx`.
- Required presentation and behavior: Twenty-four states and expanded/Info views, 60 captures: Bets week/read states; seven Older sections; older loading/failed/off/empty; independent Slips loading/failed/empty. Original records/redaction/provenance preserved.

### 43. Pick-focused scorecard

- [ ] Port and verify this area. Status: **NOT IMPLEMENTED / NOT DEPLOYED** by this audit.
- Reference: `PICK_SCORECARD_REVIEW.md; pick-scorecard-review.html; previews/pick-scorecard-dark-phone.png and pick-scorecard-light-phone.png`.
- Native targets: `Typed reusable History/Bets/shared-sheet presentation in appropriate native contexts`.
- Required presentation and behavior: Opponent, separate team circles, team/market, saved guess, comparison/difference, points/status/shared-scale chart where mode and reveal allow. Never add Guess points to sportsbook tickets. Do not copy fictional values or invent quotes/times to fill fields.

## Integration constraints and held scope

Unit behavior is settled: quick choices start at **0.5U**, Custom may use smaller
positive values including **0.01U**, and +/- taps change **0.1U**. Preserve native
precision/maximums and Unknown where applicable. The preview ledger says native
production Virtual still had a 0.5U floor. Assess current API/database compatibility
before claiming the approved Custom control works; source/API/migration order is
separate from visual approval. Do not silently widen server rules. Do not reapply
M-02/M-03/M-04/M-08/M-05/M-06/M-07 or other already applied migrations.

Sportsbook choices are a manual source catalog, not connected feeds. Use real
records/source provenance and honest missing/stale/unavailable states. Preserve
all saved inputs/history, draft/lock/reveal/private-group/removed-access boundaries,
free-only provider constraints and actual permissions. Nothing entered by players
is deleted, moved or hidden contrary to current rules. Never expose unrevealed
picks in static assets or unauthenticated routes. Do not backfill historic scoring
references with later quotes.

**Never ship** preview iframe viewers, fictional fixtures, static storyboard
states, disabled/no-op actions, local fake saves, DOM adapters/MutationObservers
or isolated controller replacements. Port approved presentation to native React
components around the existing real controllers. Show targeted actual data
contexts; do not invent arrangements or fill empty cards with fabricated data.

Held/excluded: NBA visual work and navigation remain parked; preserve its retained
saved routes/records/APIs. New avatar/profile-photo options, new awards/celebrations
and popup/award exploration remain held. Existing initials and existing award
guidance are retained. Preserve the three parked Signal files, unpublished Mini
worktrees and frozen v62 tracker. Held work is not a release prerequisite.

PR #491 (`origin/codex/prism-production-2026-11-07`) is a draft foundation reference,
not authority for new layouts or proof of a complete port. Its token/shared-style,
font/TeamMark/shell/nest changes and four Home/Research captures do not implement
the full inventory above. Reconcile useful named changes against current main;
never merge its broader foundation as a substitute for the confirmed layouts.

## Verification and release checklist

- [ ] Start implementation from freshly fetched `origin/main` in an exclusively
  owned task branch/worktree; preserve every other session's checkout.
- [ ] Reconcile each area above with current native code, exact reference recipes,
  supplied approval scope and live data/controllers. Record named files/results.
- [ ] Check both themes at 320/390/768/1440 widths; compare changed phone captures
  with the approved artifacts. Verify overflow, readable values, image fallback,
  chart scales/source labels, keyboard/touch/focus return, reduced motion and
  relevant performance. Existing navigation acceptance stands unless an issue
  is reported; this does not waive technical checks.
- [ ] Exercise actual relevant saves/recovery/drafts/locks/reveals, chart/history
  data, private/removed access, auth/invites/export and commissioner gates.
  Preview screenshots do not prove actual account or writer behavior.
- [ ] Run token parity, Brand/source checks and change-appropriate Node/Vitest/
  browser tests. Resolve failures; preserve rules/data/source assertions.
- [ ] Review the actual integrated candidate on Sean's phone/Home Screen app in
  both themes with real account access; record precise acceptance limitations.
- [ ] Stage reviewed named files only, inspect staged diff/checks, commit/push,
  open PR and run `npm run sync:check`. Report branch, full SHA, PR, checks and
  unpublished work. Do not claim merge/deploy/private sync from this check.
- [ ] Satisfy exact successful main-push CI for the release SHA, prepare release
  card/compatibility/rollback evidence and fresh protected readiness/preservation
  digests. Follow `docs/SHARED_DEPLOYMENT.md` and the manual workflow below.
- [ ] Use frontend-only deployment unless reviewed implementation requires a
  compatible API release. Migration apply is separately authorized and ordered.
- [ ] Verify hosted source SHA, deployed bytes/behavior, privacy/permissions,
  source labels and preserved data; record dated release IDs/evidence in the
  current completion register through its owning agent. This doc records none.

October 19 removed weekday/quiet-window/kickoff-buffer release restrictions.
Do not reintroduce those windows; dependencies and individual migration order,
source/CI/readiness/preservation/privacy/compatibility/rollback checks remain.
Player deadlines and locks are unchanged.

### Manual workflow dispatch inputs

Read from `.github/workflows/release.yml` in the Home spacing task checkout on
November 7. Re-read exact main workflow before dispatching a real release.

| Input key | Type / choices | Requirement / default |
|---|---|---|
| `mode` | choice: `check-only`, `readiness`, `deploy` | Required; default `check-only` |
| `source_sha` | string, full 40-character SHA reachable from main | Required |
| `target` | choice: `frontend`, `api`, `api-and-frontend`, `push-reminders`, `points-jobs`, `league-features`, `fantasy-ingest`, `results-refresh`, `epl-jobs`, `ops-alerts`, `odds-refresh` | Required; default `frontend` |
| `release_card` | repository release-card URL string | Exact SHA/order/migration review/rollback; deploy checks enforce requirements |
| `migration_history_sha256` | reviewed 64-character protected-readiness digest string | Deploy checks enforce requirements |
| `compatibility_reviewed` | boolean | Default `false`; release-card compatibility and separately authorized migration boundaries |

The dispatch must use main. `check-only` verifies source/CI only. `readiness` and
`deploy` use protected `production`; source/CI is rechecked after approval. The
workflow builds/scans/fingerprints exact source, reads hosted preflight, deploys
only the selected component, then verifies metadata/migration-history/boundaries/
frontend bytes. It does not apply database migrations or flip app defaults.
A failed post-deploy check can follow a successful mutation; investigate before
retrying. Source artifacts and hosted evidence remain distinct from signed-in
and real-phone acceptance.

## Read-only worktree-operation observation

The parent had one in-flight create-worktree request named
`confirmed-visual-rollout`, from `origin/main`, with no returned operation ID.
At this audit, `git worktree list --porcelain` did not register
`C:/Users/sbals/.codex/worktrees/confirmed-visual-rollout/betting-repo`, and
`Test-Path -LiteralPath` returned `False`. This establishes local absence at the
observation, not the asynchronous operation's remote status. No second creation,
restart, branch change, index operation or cancellation was issued by this audit.
A separate `prism-shared-rollout` worktree was registered at
`42a5ad9930a5712c6b357564701fbb5628b12b43` on
`codex/confirmed-prism-shared-2026-11-07`; it is not the requested same-name path.

## Exhaustive reference route reconciliation

The following screen/layer IDs are read directly from the selected-system ledger.
They preserve exact identifiers. Check each against the corresponding scoped
approval/captures above, native current exposure and actual-state behavior. An
entry closes only with implementation and evidence; it does not invent a new
feature or owner approval of an unseen arrangement.

### Home
- [ ] `Home/overview` — Overview
- [ ] `Home/league` — League
- [ ] `Home/game` — Game details

### Play
- [ ] `Play/overview` — Overview
- [ ] `Play/spread` — Spread draft
- [ ] `Play/total` — Total draft
- [ ] `Play/points` — Points draft
- [ ] `Play/score` — Score and history
- [ ] `Play/league` — League

### Bets
- [ ] `Bets/overview` — Overview
- [ ] `Bets/ticket` — Ticket details
- [ ] `Bets/tracking` — Track a bet
- [ ] `Bets/recommendations` — Recommendations
- [ ] `Bets/performance` — My bets overview
- [ ] `Bets/result-report` — Report a result
- [ ] `Bets/ticket-correction` — Correct an open ticket
- [ ] `Bets/gap-record` — Historical gap record

### Research
- [ ] `Research/overview` — Overview
- [ ] `Research/game` — Game details
- [ ] `Research/games` — Games list
- [ ] `Research/trends` — Trend evidence
- [ ] `Research/fantasy` — Fantasy table
- [ ] `Research/teams` — Team profiles

### EPL
- [ ] `EPL/overview` — Overview
- [ ] `EPL/draft` — Pick a Team
- [ ] `EPL/confirmation` — Team confirmation
- [ ] `EPL/epl-manager-choose` — Manager - Choose your identity
- [ ] `EPL/epl-manager-watching` — Manager - Just watching
- [ ] `EPL/epl-manager-linked` — Manager - Link result example
- [ ] `EPL/epl-manager-taken` — Manager - Already claimed
- [ ] `EPL/epl-manager-already-linked` — Manager - Account already linked
- [ ] `EPL/epl-manager-failed` — Manager - Failed claim
- [ ] `EPL/epl-manager-uncertain` — Manager - Unconfirmed reply
- [ ] `EPL/epl-manager-busy` — Manager - Claiming example
- [ ] `EPL/epl-manager-no-managers` — Manager - No identities offered
- [ ] `EPL/epl-home-turn` — Home - Your turn
- [ ] `EPL/epl-home-picked` — Home - Your club picked
- [ ] `EPL/epl-home-unlinked` — Home - Manager not linked
- [ ] `EPL/epl-home-all-in` — Home - All picks in
- [ ] `EPL/epl-home-locked` — Home - Draft locked
- [ ] `EPL/epl-home-progress-failed` — Home - Moneyline progress unavailable
- [ ] `EPL/epl-home-loading` — Draft recovery - Loading
- [ ] `EPL/epl-home-failed` — Draft recovery - Failed read
- [ ] `EPL/epl-home-forbidden` — Draft recovery - Access refused
- [ ] `EPL/epl-home-off` — Draft recovery - Feature off
- [ ] `EPL/epl-home-no-week` — Draft recovery - No open matchweek
- [ ] `EPL/epl-home-stale` — Draft recovery - Last board retained
- [ ] `EPL/epl-home-review` — Draft recovery - Results/source review
- [ ] `EPL/epl-moneyline-entry` — Moneyline - Sample entry
- [ ] `EPL/epl-moneyline-saved-draft` — Moneyline - Saved draft example
- [ ] `EPL/epl-moneyline-results` — Moneyline - Rule-math/pending/unscored
- [ ] `EPL/epl-moneyline-closed` — Moneyline - Closed unsaved draft
- [ ] `EPL/epl-moneyline-uncertain` — Moneyline - Unconfirmed save
- [ ] `EPL/epl-moneyline-stale` — Moneyline - Saved data stale
- [ ] `EPL/epl-moneyline-busy` — Moneyline - Checking example
- [ ] `EPL/epl-moneyline-read-only` — Moneyline - Read-only
- [ ] `EPL/epl-moneyline-unavailable` — Moneyline - Prices unverified
- [ ] `EPL/epl-moneyline-loading` — Moneyline - Loading
- [ ] `EPL/epl-moneyline-failed` — Moneyline - Read failed
- [ ] `EPL/epl-moneyline-leaderboard` — Moneyline - Rule-math leaderboard
- [ ] `EPL/epl-moneyline-leaderboard-empty` — Moneyline - Empty leaderboard
- [ ] `EPL/epl-moneyline-leaderboard-loading` — Moneyline - Leaderboard loading
- [ ] `EPL/epl-moneyline-leaderboard-failed` — Moneyline - Leaderboard read failed
- [ ] `EPL/epl-fantasy-matchup` — FEPL Fantasy - Matchup
- [ ] `EPL/epl-fantasy-standings` — FEPL Fantasy - Standings
- [ ] `EPL/epl-fantasy-rosters` — FEPL Fantasy - Rosters
- [ ] `EPL/epl-fantasy-insights` — FEPL Fantasy - Insights
- [ ] `EPL/epl-fantasy-no-repeat` — FEPL Fantasy - No Repeat
- [ ] `EPL/epl-fantasy-ambiguous` — FEPL Fantasy - Ambiguous
- [ ] `EPL/epl-fantasy-no-team` — FEPL Fantasy - No Team
- [ ] `EPL/epl-fantasy-matchup-gaps` — FEPL Fantasy - Matchup Gaps
- [ ] `EPL/epl-fantasy-standings-missing` — FEPL Fantasy - Standings Missing
- [ ] `EPL/epl-fantasy-insights-gaps` — FEPL Fantasy - Insights Gaps
- [ ] `EPL/epl-fantasy-insights-no-detail` — FEPL Fantasy - Insights No Detail
- [ ] `EPL/epl-fantasy-loading` — FEPL Fantasy - Loading
- [ ] `EPL/epl-fantasy-failed` — FEPL Fantasy - Failed
- [ ] `EPL/epl-fantasy-forbidden` — FEPL Fantasy - Forbidden
- [ ] `EPL/epl-fantasy-off` — FEPL Fantasy - Off
- [ ] `EPL/epl-fantasy-no-data` — FEPL Fantasy - No Data

### Account
- [ ] `Account/overview` — Overview
- [ ] `Account/profile` — Profile
- [ ] `Account/reminders` — Reminders off
- [ ] `Account/reminders-on` — Reminders enabled
- [ ] `Account/profile-conflict` — Profile - name changed elsewhere
- [ ] `Account/profile-pending` — Profile - save needs checking
- [ ] `Account/reminders-blocked` — Reminders - blocked
- [ ] `Account/reminders-install` — Reminders - Home Screen setup
- [ ] `Account/reminders-unsupported` — Reminders - unsupported browser
- [ ] `Account/reminders-unconfigured` — Reminders - server setup unavailable
- [ ] `Account/settings` — Sportsbooks and guidance settings
- [ ] `Account/settings-unavailable` — Settings - retained unavailable book
- [ ] `Account/settings-conflict` — Settings - draft conflict example
- [ ] `Account/guidance` — Guidance and sources
- [ ] `Account/league-switcher` — Your leagues and invitations
- [ ] `Account/league-create` — Create a league
- [ ] `Account/league-invite` — Invite players
- [ ] `Account/league-join-check` — Join needs checking example
- [ ] `Account/app-invite-entry` — App invite - Account entry
- [ ] `Account/app-invite` — Invite friends to Guess the Line
- [ ] `Account/app-invite-share` — App invite - device sharing proposal
- [ ] `Account/app-invite-fallback` — App invite - link fallback
- [ ] `Account/access-sign-in` — Account access - Sign in
- [ ] `Account/access-create` — Account access - Create account
- [ ] `Account/access-confirmation` — Account access - Email confirmation example
- [ ] `Account/access-name` — Account access - First-name setup
- [ ] `Account/access-forgot` — Account access - Forgot password
- [ ] `Account/access-reset-requested` — Account access - Reset notice example
- [ ] `Account/access-reset` — Account access - New password example
- [ ] `Account/access-reset-mismatch` — Account access - Password mismatch example
- [ ] `Account/access-unavailable` — Account access - Sign-in unavailable example
- [ ] `Account/access-loading` — Account access - Loading example
- [ ] `Account/appearance` — Appearance - Theme and motion
- [ ] `Account/appearance-system` — Appearance - System example
- [ ] `Account/appearance-reduced` — Appearance - Reduce motion on
- [ ] `Account/appearance-device-reduced` — Appearance - Device requests reduced motion
- [ ] `Account/appearance-storage-unavailable` — Appearance - Storage unavailable example
- [ ] `Account/export-data` — Export my data
- [ ] `Account/export-preparing` — Export - Preparation example
- [ ] `Account/export-completion` — Export - Completion example
- [ ] `Account/export-failed` — Export - Failure example
- [ ] `Account/export-unavailable` — Export - Unavailable example
- [ ] `Account/app-offline` — App states - Offline with content
- [ ] `Account/app-startup` — App states - Startup loading
- [ ] `Account/app-account-failed` — App states - Account failed to load
- [ ] `Account/app-tab-failed` — App states - Tab failed
- [ ] `Account/app-page-failed` — App states - Page failed
- [ ] `Account/app-reload-warning` — App states - Reload warning storyboard
- [ ] `Account/league-access-pending` — League access - Pending
- [ ] `Account/league-access-removed` — League access - Community removed, private leagues
- [ ] `Account/league-access-removed-no-groups` — League access - Community removed, no private leagues
- [ ] `Account/league-access-saved-link` — League access - Saved private link
- [ ] `Account/league-access-saved-joining` — League access - Joining example
- [ ] `Account/league-access-saved-uncertain` — League access - Join needs checking example
- [ ] `Account/session-expired` — Session - Sign in again
- [ ] `Account/session-failed` — Session - Sign-in failure example
- [ ] `Account/session-google` — Session - Google-only example
- [ ] `Account/name-save-uncertain` — Name recovery - Save needs checking
- [ ] `Account/name-save-offline` — Name recovery - Offline
- [ ] `Account/name-save-sign-in` — Name recovery - Sign-in required
- [ ] `Account/name-private-invite` — Name setup - Private invite example
- [ ] `Account/commissioner-hub` — Commissioner menu
- [ ] `Account/commissioner-members` — Community members
- [ ] `Account/commissioner-remove` — Remove access confirmation
- [ ] `Account/commissioner-restore` — Restore access confirmation
- [ ] `Account/commissioner-pending` — Access change needs checking
- [ ] `Account/commissioner-restricted` — Community admin required
- [ ] `Account/commissioner-status` — Schedule and settlement
- [ ] `Account/commissioner-status-paused` — Automatic refresh paused
- [ ] `Account/commissioner-settlement-uncertain` — Settlement needs checking
- [ ] `Account/commissioner-week-entry` — Week opening entry
- [ ] `Account/commissioner-week-review` — Archived schedule review
- [ ] `Account/commissioner-week-error` — Week opening connection error
- [ ] `Account/referees-ready` — Referees - Current examples
- [ ] `Account/referees-draft` — Referees - Unsaved choices
- [ ] `Account/referees-busy` — Referees - Saving example
- [ ] `Account/referees-partial` — Referees - Partial-save example
- [ ] `Account/referees-read-error` — Referees - Read-error example
- [ ] `Account/final-review-form` — Final scores - Example entry
- [ ] `Account/final-review-confirmation` — Final scores - Confirmation
- [ ] `Account/final-review-correction` — Final scores - Metadata correction
- [ ] `Account/final-review-conflict` — Final scores - Version conflict
- [ ] `Account/final-review-unavailable` — Final scores - Service unavailable
- [ ] `Account/final-review-busy` — Final scores - Recording example
- [ ] `Account/odds-connection-initial` — Odds connection - Before check
- [ ] `Account/odds-connection-ready` — Odds connection - Example check complete
- [ ] `Account/odds-connection-fetched` — Odds connection - Example fetch summary
- [ ] `Account/odds-connection-low-quota` — Odds connection - Protected reserve
- [ ] `Account/odds-connection-pending` — Odds connection - Request pending
- [ ] `Account/odds-connection-failed` — Odds connection - Provider error
- [ ] `Account/odds-connection-checking` — Odds connection - Checking example
- [ ] `Account/epl-corrections-ready` — EPL correction comparison
- [ ] `Account/epl-corrections-missing` — EPL partial totals / no picks
- [ ] `Account/epl-corrections-empty` — EPL no corrections
- [ ] `Account/epl-corrections-unavailable` — EPL checks unavailable
- [ ] `Account/epl-corrections-failed` — EPL read failed
- [ ] `Account/epl-corrections-denied` — EPL restricted
- [ ] `Account/epl-corrections-loading` — EPL first loading
- [ ] `Account/epl-corrections-refreshing` — EPL refreshing
- [ ] `Account/epl-corrections-stale` — EPL last-loaded reviews
- [ ] `Account/history-weeks` — Guess History - Weeks
- [ ] `Account/history-week` — Guess History - Week
- [ ] `Account/history-total` — Guess History - Total
- [ ] `Account/history-other-hidden` — Guess History - Other Hidden
- [ ] `Account/history-removed` — Guess History - Removed
- [ ] `Account/history-sat-out` — Guess History - Sat Out
- [ ] `Account/history-practice` — Guess History - Practice
- [ ] `Account/history-empty` — Guess History - Empty
- [ ] `Account/history-loading` — Guess History - Loading
- [ ] `Account/history-failed` — Guess History - Failed
- [ ] `Account/history-records-off` — Guess History - Records Off
- [ ] `Account/history-changes-loading` — Guess History - Changes Loading
- [ ] `Account/history-changes-failed` — Guess History - Changes Failed
- [ ] `Account/history-changes-empty` — Guess History - Changes Empty
- [ ] `Account/history-changes-held` — Guess History - Changes Held
- [ ] `Account/history-draft-active` — Guess History - Draft Active
- [ ] `Account/history-late` — Guess History - Late
- [ ] `Account/history-ruled` — Guess History - Ruled
- [ ] `Account/history-no-ballot` — Guess History - No Ballot
- [ ] `Account/records-bets` — History records - Bets
- [ ] `Account/records-bets-empty` — History records - Bets Empty
- [ ] `Account/records-bets-loading` — History records - Bets Loading
- [ ] `Account/records-bets-unavailable` — History records - Bets Unavailable
- [ ] `Account/records-bets-failed` — History records - Bets Failed
- [ ] `Account/records-weeks-loading` — History records - Weeks Loading
- [ ] `Account/records-weeks-failed` — History records - Weeks Failed
- [ ] `Account/records-no-weeks` — History records - No Weeks
- [ ] `Account/records-older` — History records - Older
- [ ] `Account/records-challenge` — History records - Challenge
- [ ] `Account/records-saved` — History records - Saved
- [ ] `Account/records-forecasts` — History records - Forecasts
- [ ] `Account/records-journal` — History records - Journal
- [ ] `Account/records-slips` — History records - Slips
- [ ] `Account/records-archives` — History records - Archives
- [ ] `Account/records-benchmark` — History records - Benchmark
- [ ] `Account/records-benchmark-unfrozen` — History records - Benchmark Unfrozen
- [ ] `Account/records-older-loading` — History records - Older Loading
- [ ] `Account/records-older-failed` — History records - Older Failed
- [ ] `Account/records-older-off` — History records - Older Off
- [ ] `Account/records-older-empty` — History records - Older Empty
- [ ] `Account/records-slips-loading` — History records - Slips Loading
- [ ] `Account/records-slips-failed` — History records - Slips Failed
- [ ] `Account/records-slips-empty` — History records - Slips Empty
- [ ] `Account/action-forfeit-ready` — NFL / shared · forfeit ready
- [ ] `Account/action-forfeit-loading` — NFL / shared · forfeit loading
- [ ] `Account/action-forfeit-unconfirmed` — NFL / shared · forfeit unconfirmed
- [ ] `Account/action-forfeit-busy` — NFL / shared · forfeit busy
- [ ] `Account/action-forfeit-expired` — NFL / shared · forfeit expired
- [ ] `Account/action-forfeit-done` — NFL / shared · forfeit done
- [ ] `Account/action-forfeit-scope` — NFL / shared · forfeit scope
- [ ] `Account/action-saved-pick` — NFL / shared · saved pick
- [ ] `Account/action-saved-total` — NFL / shared · saved total
- [ ] `Account/action-saved-draft` — NFL / shared · saved draft
- [ ] `Account/action-saved-pending` — NFL / shared · saved pending
- [ ] `Account/action-saved-stale` — NFL / shared · saved stale
- [ ] `Account/action-saved-scope` — NFL / shared · saved scope
- [ ] `Account/action-game-bets` — NFL / shared · game bets
- [ ] `Account/action-game-bets-loading` — NFL / shared · game bets loading
- [ ] `Account/action-game-bets-failed` — NFL / shared · game bets failed
- [ ] `Account/action-game-bets-empty` — NFL / shared · game bets empty
- [ ] `Account/action-feed-picks` — NFL / shared · feed picks
- [ ] `Account/action-feed-hidden` — NFL / shared · feed hidden
- [ ] `Account/action-feed-picks-loading` — NFL / shared · feed picks loading
- [ ] `Account/action-feed-picks-failed` — NFL / shared · feed picks failed
- [ ] `Account/action-feed-picks-empty` — NFL / shared · feed picks empty
- [ ] `Account/action-feed-share-uncertain` — NFL / shared · feed share uncertain
- [ ] `Account/action-reactors` — NFL / shared · reactors
- [ ] `Account/action-reactors-loading` — NFL / shared · reactors loading
- [ ] `Account/action-reactors-failed` — NFL / shared · reactors failed
- [ ] `Account/action-reactors-empty` — NFL / shared · reactors empty
- [ ] `Account/action-virtual` — NFL / shared · virtual
- [ ] `Account/action-virtual-slip` — NFL / shared · virtual slip
- [ ] `Account/action-virtual-locked` — NFL / shared · virtual locked
- [ ] `Account/action-virtual-no-offer` — NFL / shared · virtual no offer
- [ ] `Account/action-virtual-busy` — NFL / shared · virtual busy
- [ ] `Account/action-virtual-uncertain` — NFL / shared · virtual uncertain
- [ ] `Account/action-menu` — NFL / shared · menu
- [ ] `Account/action-menu-admin` — NFL / shared · menu admin
- [ ] `Account/action-menu-no-reminders` — NFL / shared · menu no reminders
- [ ] `Account/action-menu-busy` — NFL / shared · menu busy
- [ ] `Account/action-navigation-nfl` — NFL / shared · navigation nfl
- [ ] `Account/action-navigation-epl` — NFL / shared · navigation epl
- [ ] `Account/action-navigation-nfl-only` — NFL / shared · navigation nfl only
- [ ] `Account/action-navigation-layer-failed` — NFL / shared · navigation layer failed
- [ ] `Account/action-forfeit-close-warning` — NFL / shared · forfeit close warning
- [ ] `Account/action-virtual-minimum` — NFL / shared · 0.01U slip minimum
- [ ] `Account/epl-shell-leagues` — EPL native shell · leagues
- [ ] `Account/epl-shell-history` — EPL native shell · history
- [ ] `Account/epl-shell-bets` — EPL native shell · bets

## NFL action scenario reconciliation

These exact scenarios are enumerated separately because several share a native
screen/layer. The 106 approved captures also include scrolled forms and source/
rules Info pairs. All remain implementation/verification tasks here.

- [ ] `forfeit-ready`
- [ ] `forfeit-close-warning`
- [ ] `forfeit-loading`
- [ ] `forfeit-unconfirmed`
- [ ] `forfeit-busy`
- [ ] `forfeit-expired`
- [ ] `forfeit-done`
- [ ] `forfeit-scope`
- [ ] `saved-pick`
- [ ] `saved-total`
- [ ] `saved-draft`
- [ ] `saved-pending`
- [ ] `saved-stale`
- [ ] `saved-scope`
- [ ] `game-bets`
- [ ] `game-bets-loading`
- [ ] `game-bets-failed`
- [ ] `game-bets-empty`
- [ ] `feed-picks`
- [ ] `feed-hidden`
- [ ] `feed-picks-loading`
- [ ] `feed-picks-failed`
- [ ] `feed-picks-empty`
- [ ] `feed-share-uncertain`
- [ ] `reactors`
- [ ] `reactors-loading`
- [ ] `reactors-failed`
- [ ] `reactors-empty`
- [ ] `virtual`
- [ ] `virtual-minimum`
- [ ] `virtual-slip`
- [ ] `virtual-locked`
- [ ] `virtual-no-offer`
- [ ] `virtual-busy`
- [ ] `virtual-uncertain`
- [ ] `menu`
- [ ] `menu-admin`
- [ ] `menu-no-reminders`
- [ ] `menu-busy`
- [ ] `navigation-nfl`
- [ ] `navigation-epl`
- [ ] `navigation-nfl-only`
- [ ] `navigation-layer-failed`
