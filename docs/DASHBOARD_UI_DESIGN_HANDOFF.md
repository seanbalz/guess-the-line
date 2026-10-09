# Guess The Line — Dashboard UI design handoff

Owner: Sean Balsiger · Version 1 · October 9, 2026 · Audience: the AI **design agent** assigned to improve the visual design of the Guess The Line dashboard

This document is the complete brief for a design agent. It says what the dashboard is, where its code and tokens live, which rules cannot be broken, what the current build looks like, what is visibly wrong with it, what the agent must deliver, how to prove the work, and how to hand it back. A separate document, [DASHBOARD_UX_OPTIMIZATION_HANDOFF.md](DASHBOARD_UX_OPTIMIZATION_HANDOFF.md), briefs the UX/optimization agent; the two agents share the context pack in section 1 and must not edit the same files in the same window without coordinating through a breadcrumb.

Read first, in this order: this file, `docs/BRAND_GUIDE.md`, `design/tokens.json`, `docs/DESIGN_EXPLORATION.md`, `docs/VISUAL_POLISH.md`, `docs/PERSONA_AUDIT_2026_10_09.md`, `AGENTS.md`, `docs/RULES.md`, `docs/DECISIONS.md` (D-14, D-16, D-21, D-22, D-23, D-24).

---

## 1. Context pack — repository, sync and deployment (shared with the UX agent)

### 1.1 Where the code lives and which copy is the truth

| Copy | Location | Role | State on 2026-10-09, 09:53 PDT |
|---|---|---|---|
| GitHub `main` | `seanbalz/guess-the-lines-repo` | **Code truth.** Every change lands through a pull request into `main`. | `ebcdae6` at 10:15 PDT (PR #30 reconciliation merged on top of PR #31's tracker commit) |
| Cloud Claude sessions | claude.ai/code, branches `claude/*` | Where PRs #10–#35 were produced on October 8–9. They have GitHub and the Supabase MCP, no Cloudflare credential, no Supabase CLI login. | Open drafts: #32 (Ben's Week 5 import), #33 (Virtual Units settlement, D-26), #34 (persona quick wins 2–11: chip helper line, call line, check icon on selected chips, `forced-colors` rules, error buttons, state screens, Appearance moved to the foot), #35 (these handoff documents) |
| Local Mac mini checkout | `/Users/seanbalsiger/betting-repo` | Sean's machine. The **only** place Cloudflare Pages can be deployed from. Codex sessions also work here on `codex/*` branches. Several agent sessions share this one working tree at the same time. | Was on PR #30's branch at `8c2d75d` at 09:53 PDT, clean, in sync; local `main` at `f1ade03` behind origin. Re-check with `git status -sb` before relying on it |
| Codex worktrees | `~/.codex/worktrees/virtual-units-*` | Separate checkouts for the D-18 virtual units branches | `codex/virtual-units-implementation`, `codex/virtual-units-rules` |

Rules that follow from this:

- Treat `origin/main` as the source of truth for code. Branch from it (`git fetch origin && git switch -c claude/<slug> origin/main`), open a PR into `main`, let CI run. Do not commit to `main` directly.
- Do not switch branches inside `/Users/seanbalsiger/betting-repo`; other sessions are building and testing there. If you are on the Mac mini, use `git worktree add` for a side branch.
- `main` is ahead of production. Design work must target `main`, not the live site.

### 1.2 What is deployed versus what is on `main`

| Component | Live (production) | On `main` | Who can ship it |
|---|---|---|---|
| Frontend (Cloudflare Pages `guess-the-line.pages.dev`) | Deployment `2106725d`, built October 8 from `30d331e` | D-21 Community home, chip pick entry, D-22 coming-soon leagues and 32 team marks, D-23 sit-out, D-24 auto-open, Edge board phone layout, persona-audit fixes | Sean, from the Mac mini: `npm run build:cloud && npm run check:cloud && npm run cloudflare -- pages deploy .local/cloud-dist --project-name guess-the-line --branch main --commit-dirty=true` |
| `gtl-api` Edge Function | v14 (October 8) | v15 source (community routes, sit-out, week-open status) | Supabase MCP or `npx supabase functions deploy gtl-api` (CLI not logged in anywhere) |
| Hosted database (Supabase `onmrgvcehkflfaizvedl`) | **Ahead of the app:** all 20 migrations, `gtl-week-open` v1, both Monday cron jobs, `nfl-weekly` schedule enabled | same | Already done through the MCP on October 9. Never run `npx supabase db push` as-is (hosted versions differ from filenames; see `docs/RELEASE_2026_10_09.md`) |
| CI | No deploy path: the repo has no Actions secrets | `test.yml`, `dashboard-checks.yml`, `brand-qa.yml` run on every PR | n/a |

The design agent never deploys. It ships PRs with evidence; Sean runs the release checklist in `docs/SOCIAL_COMMUNITY.md#release-checklist--october-9-2026`.

### 1.3 What never syncs (so you do not look for it in git)

| Thing | Where it lives | Note |
|---|---|---|
| `.local/` | Mac mini only, gitignored | `cloud-dist/` (production build), `previews/` (every screenshot ever taken, including `previews/personas/`), `personas/findings.json`, `state.json` (local owner workspace data), release manifest, test results |
| `.env.cloud` | Mac mini only | Supabase URL and publishable key for `build:cloud`; `.env.example` is the template |
| Dashboard preferences | Browser `localStorage` on each device | `gtl.theme` (Light/Dark/System), `gtl.dashboard.preferences.v1` (layout, sections, motion, notices), `gtl.dashboard.matchups.v1.<season>.<week>` (display filter). Never account-synced by design |
| Unsaved drafts | `sessionStorage` / tab recovery | 24-hour tab recovery; not synced |
| Picks and snapshots | `data/` in git | Private league data. Never serve the repository root, never place picks in static assets, never edit historical files |

### 1.4 Three ways to run the dashboard locally

| Mode | Command | URL | Data | Use for |
|---|---|---|---|---|
| Local owner workspace | `npm ci && npm run dev` | `http://127.0.0.1:5173` (Vite) + Node service on 8787 | `.local/state.json`, seeded from repo JSON; the "Local player view" select is **not** authentication | Day-to-day visual work |
| Isolated synthetic server | `GTL_TEST_PORT=8795 node scripts/test-server.mjs` | `http://127.0.0.1:8795` (serves `dist/`, so run `npm run build` first) | Temporary store with `SYNTHETIC TEST EVIDENCE` quotes; fixed clock 2026-10-08 16:00 UTC; Sean's Spread ballot submitted, Total empty | Screenshots and revealed states without touching real data (this document's screenshots used it) |
| Cloud preview | `npm run build:cloud && npm run preview:cloud` | `http://127.0.0.1:4173` | Exact production assets against the **hosted** account data; needs a real sign-in | Final parity check only |

Known gotcha: a Vite dev server left running across a large git move answers every module request with `504 (Outdated Optimize Dep)` and renders a blank page. Restart it. Google Chrome on macOS is used by the Playwright configs when present; otherwise run `npx playwright install chromium`.

---

## 2. What "the dashboard" is

Guess The Line is a private NFL prediction game (Guess the Spread, Guess the Total, Betting Challenge, plus Bet Tracker, Virtual Units and Solo). "The dashboard" means these surfaces, in priority order for this brief:

| Priority | Surface | Component | Heading / entry |
|---|---|---|---|
| 1 | **League Dashboard** (Overview) | `web/src/App.jsx` → `Overview` → `web/src/VisualDashboard.jsx` | "The weekly huddle." · sidebar item "Dashboard" |
| 2 | **Community home** (D-21 landing after sign-in) | `web/src/CommunityHome.jsx` | "Community" · Feed / Picks / Groups & games tabs, league switcher, picks-due card, season leaderboard, coming-soon cards |
| 3 | Dashboard-family pages in the league shell | `App.jsx`: `Leaderboard`, `Edges` (Edge board), `ComparePicks`/`SubmissionComparison.jsx`, `HistoryPage`, `SettingsPage`; `PredictionEntry.jsx` + `ChipPicker.jsx` (My picks); `VirtualUnits.jsx`; `SocialBetTracker.jsx` | "The bragging board.", "Find the difference.", "Your picks, side by side.", "Every call, on record.", "Make it yours." |
| 4 | Shell | `App.jsx` sidebar (`.sidebar`), topbar, page heading, footer, modal, toast; `GameHub.jsx` hub shell; `Brand.jsx` | — |

The app is React 18 + Vite, plain CSS files per component (no CSS framework), `lucide-react` icons, inline SVG charts. Lazy-loaded screens: `App` (league), `GameHub` (lobby), `PersonalWorkspace` (Solo), `SocialBetTracker`, `BrandLab`.

### 2.1 Anatomy of the League Dashboard (default "Command center" layout)

Rendered order inside `.visual-dashboard` (`VisualDashboard.jsx`), top to bottom:

1. `DashboardPreferences` — collapsed "Customize dashboard" disclosure (layout radios with mini previews, four section checkboxes, motion select, two notice checkboxes, reset) with `DashboardMatchupFilter` ("Choose dashboard games") nested inside.
2. `.dashboard-notices` — only when a newer saved market snapshot arrived or a refresh warning exists.
3. `SocialDashboardCard` — "Your betting week": four metric tiles (Included record, Known risk, Pending, Settled ROI), coverage line, recent shared bets or empty state, two buttons.
4. `.visual-scoreboard` — "Accuracy matchup" panel. Three states: **locked** ("Your ballot comes first" + Open ballot button) when the selected market is not submitted; **D-16 timestamped** (current production policy) → `DashboardInsights` with a three-tab area (Player points bars / Accuracy mix donut / Line movement) plus `ChartGuide` ("How to read this"); **legacy** benchmark/provisional paths → `.accuracy-bars`. Footer line + "Standings" link; "Source & scoring details" disclosure.
5. `.dashboard-detail-comparison` — collapsed "Compare accuracy in detail" (`PlayerComparison.jsx`: error distributions, opponent selector, per-game difference table).
6. `.visual-actions` — three `.game-option` tiles: Spread / Total / Challenge with status text ("Submitted", "0/15 entered", "Your card").
7. `.visual-chart-grid` — `.visual-gaps` "Errors against saved references" (legend, top five games as `<details>` rows with per-player gap bars, "Show all 15 games", footer "Largest gaps first · Analysis") and `.visual-history` (compact `LineMovement`: matchup select, SVG line chart, source table). The history column is suppressed when the Line movement tab already exists in the insights area.
8. `DataConnections` — collapsed "Data connections" (refresh status, `DecisionAnalysis`, five "Unavailable" source cards, research links after both submissions).

Above the dashboard the league shell adds: eyebrow "NFL · WEEK 05 / 2026", `h1` "The weekly huddle.", subtitle, two heading actions ("Compare picks" primary, "Make your picks" secondary), the Spread / Over/Under market tabs (`.dashboard-market-tabs`), practice/eligibility notices.

### 2.2 The five layouts

`web/src/dashboardPreferences.js` defines `DASHBOARD_LAYOUTS`; `web/src/visualLayouts.css` implements them with CSS `order` on `[data-layout]` and a few grid overrides. Nothing else changes between layouts.

| id | Label | What moves |
|---|---|---|
| `command` | Command center (default) | Scores → actions → gaps + history |
| `matchups` | Matchup cards | Actions first; gap list becomes a two-column card grid |
| `markets` | Market rows | Actions first; each gap row becomes a three-column grid showing Your guess / Reference values inline |
| `social` | Social league | Accuracy players as two-column cards, label stacked above bar |
| `analytics` | Analytics lab | History first, then the rest |

Preferences also toggle four sections (`scores`, `gaps`, `history`, `connections`; at least one stays on), motion (`system`/`subtle`/`reduced`; OS reduced-motion always wins) and two in-page notices.

### 2.3 Dashboard states the design must cover

| State | Trigger | What renders today |
|---|---|---|
| Loading | first read | `.loading` spinner "Loading your league…" |
| Error | API failure | `.error-banner` with Reload / Refresh / Check saved data button |
| Membership pending | 403 in cloud | `Empty` panel with "Check league access" |
| Market not submitted | `data.revealed === false` | locked scoreboard; no gaps, no history |
| Submitted, D-16 timestamped | production policy | insights tabs, saved-reference drilldowns, current consensus boxes |
| Submitted, legacy provisional / frozen benchmark | historical groups only | accuracy bars, PROVISIONAL / FROZEN badges |
| Practice or not official | `league.practice` / `officialEligible === false` | PRACTICE badge, amber practice banner |
| Missing references | no eligible reference at save | "Unscored · 0 of 15 references available", "Reference unavailable" rows; em dash for numbers (never 0) |
| Stale reference | reference older than its freshness window | "Stale saved reference" amber badge |
| New market data | newer collected snapshot than last seen | `.market-update-notice` |
| Refresh problems | collector overdue / failed / paused | `.refresh-warning` amber text |
| Display filter | "Selected games" with none | "No matchups selected…" drilldown copy |
| Week not open (D-24) / closed / sat out (D-23) | Community Picks tab and My picks | status lines, disabled chips (see persona audit #41, #43, #44) |

---

## 3. Non-negotiable constraints

These come from `AGENTS.md`, `docs/BRAND_GUIDE.md`, `docs/RULES.md` and numbered decisions. A design that breaks one of them will not be merged.

1. **Approved identity only.** Primary logo = **Yardline G** (option 01), app icon = **Field monogram** (option 01), displayed **icon-only** (D-14): the dark glyph inside a rounded lime tile with a soft shadow, no wordmark beside it. Accessible name and browser title stay **Guess The Line**. Geometry lives in `web/src/Brand.jsx`; do not redraw it.
2. **Everything else is provisional** (type, palette, UI layout concept, iconography, motion). You may propose, you may not approve. To change a provisional category you must present **five distinct original visual alternatives** (rendered, not described), identify accessibility and licensing concerns, and ask Sean for **one** selection. Record a selection only after Sean makes it, in `docs/BRAND_GUIDE.md` and `design/tokens.json` (tracker item UX-06). Functional controls (Light/Dark/System, the five layouts) are not approvals.
3. **Tokens, not hex.** Use `design/tokens.json` through the CSS variables `Theme.jsx` writes (`--canvas`, `--surface`, `--card`, `--border`, `--text`, `--muted`, `--primary`, `--primaryText`, `--primaryForeground`, `--cyan`, `--win`, `--loss`, `--pending`, `--tie`, `--overlay`, `--touch-target`). No ad hoc colors. Both themes must pass WCAG AA; `scripts/persona-static-checks.mjs` measures every pair the stylesheets combine.
4. **Data integrity in the UI.** Never show a provisional score as final; use explicit PROVISIONAL / FROZEN / SAVED REFERENCES / PRACTICE text. Missing data is an em dash with a reason, never 0. Every line shows source and timestamp. Keep each player's **saved scoring reference** visually distinct from **current consensus** (D-16/D-17). Never use color alone for meaning. No "edge", "value", "recommendation" or confetti language; a gap is disagreement, not expected value.
5. **Reveal gates.** A market's references, opponents' picks and history stay hidden until the viewer submits that market (or sits out under D-23, or the deadline passes). Spread and Total gates are independent. Dashboard previews, filters and notices must not leak the other market.
6. **D-23: nothing a player entered is deleted, moved or hidden.** Removed members stay visible with a flag; sat-out weeks read "Sat out", never 0.
7. **Original assets only.** No league, team or sportsbook logos beyond the 15 reviewed marks in `web/public/team-logos/` and the original badges (D-22); no DraftKings/FanDuel/ESPN trade dress. Borrow interaction patterns, not artwork. Fonts: do not distribute font files; load from a licensed provider or use the fallbacks named in the guide.
8. **Accessibility floor.** 44px minimum targets, 16px interactive type on mobile, visible 2px cyan focus ring, semantic tables, `aria-live` for score changes, keyboard access to everything, reduced-motion fallback (global rule in `styles.css` plus per-file blocks), `forced-colors` support where state is shown by fill. axe must stay at zero violations (currently zero on 24 scanned screens).
9. **Breakpoints to keep green:** 320, 390, 1440 in Light and Dark; the group ballot additionally 768, 1024, 1280, 1366. No horizontal page scroll.
10. **Free only.** No paid font, icon, image or data service. No new runtime dependency without a one-line justification in the PR.
11. **Privacy.** Screenshots in PRs may use the synthetic server or persona harness; never post real players' current-week picks before the deadline.

---

## 4. Current design system as actually built

### 4.1 Tokens and how they reach CSS

- `design/tokens.json` holds colors (dark), `themes.light`, `themes.dark.primaryForeground`, fonts, radius (card 12 / control 8), spacing scale 4–48, `touchTargetMin` 44, motion 150/220, print colors, identity record.
- `web/src/Theme.jsx` writes **only** colors + theme overrides + `--touch-target` to `:root`, and sets `data-theme`. **Fonts, radius, spacing and motion tokens are not exported as CSS variables**; every stylesheet hard-codes pixel values, so drift is unchecked (radii in use: 2, 4, 6, 7, 8, 9, 10, 12, 13, 14; font sizes from 5px to 82px).
- `--font-mono` is referenced in seven stylesheets and **defined nowhere**. Four usages have no fallback (`.visual-scoreboard .score-number`, `.accuracy-row > strong`, `.single-line-point > strong`, `.benchmark-summary-score strong`), so the headline score numerals render in the body font, not mono. `--radius-card`, `--control-radius` and `--touch-target-min` are also undefined (they carry fallbacks).
- No webfont is loaded (no `@font-face`, no font link in `web/index.html`). Inter renders only where it is installed; Barlow Condensed (used by `.league-badge` and the Brand Lab type study) and IBM Plex Mono fall back to Impact / `ui-monospace`.
- Root type is 14px (16px only at ≥1600px). The brand guide specifies body 16/24, metadata 13/18, 16px interactive on mobile. The persona static check counts 39 interactive/label rules under 12px.

### 4.2 Type, color and component inventory (as used on the dashboard)

| Element | Today | Guide |
|---|---|---|
| Page title `h1` | Inter 36/1.2, −1.4px tracking (30 at ≤960, 33 at ≤720) | 28/34 page title, 40/44 hero |
| Section `h2` | 24 (visual panels), 17 (generic), 15 (panel-heading) | 20/28 |
| Eyebrow / section label | 8–10px, 1.2–1.7px tracking, uppercase | 13/18 metadata |
| Table `th` | 8px | — |
| Score numeral | 28px (insights) / 72–82px in unused `.score-hero` | 36/40 stat numeral, Barlow Condensed |
| Mono | `.mono` → 'IBM Plex Mono' fallback chain; tabular nums | IBM Plex Mono |
| Primary button | lime fill, dark text, 44px, 12px label (16 on mobile) | lime filled |
| Secondary | surface fill, hairline border | dark outlined |
| Text button | muted, 11px | ghost |
| Badge | 9px uppercase, muted/lime/amber/cyan tints | — |
| Panel | `--surface`, 1px `--line` (border at 57%), radius 12 | 12px card radius |
| Focus | 2px cyan outline, 4px offset | cyan 2px |
| Bars | accuracy track 14px (`--card`), fill cyan, own = lime; gap track 7px | cyan provisional / lime current |
| Line chart | cyan stroke 3, dots r5, grid dashed `--line`, labels 9–14px | cyan line, lime dot, kickoff lock marker (not implemented) |
| Donut | r48, stroke 12, segments lime/cyan/amber/tie | — |
| Icons | lucide-react, 15–28px | monoline (provisional) |
| Team marks | 15 reviewed logos (13 SVG, 2 PNG) + original hexagon-ish badges; 24/32/48px | abbreviations in custom shields when no rights |

Breakpoints in use: `≥1600`, `≤1200`, `≤960`, `≤720` (sidebar becomes a drawer, mobile type bump), `≤360`; visual dashboard `≤900`, `≤720`; preferences `≤1100`, `≤720`, `≤400`; insights `≤639`, `≤359`; chip ballot `≤1359`, `900–1359`, `≤720`; team matchup `≤640`.

### 4.3 Stylesheet map

| File | Owns |
|---|---|
| `web/src/styles.css` (80 KB, long single-line rules) | tokens fallback on `:root`, shell, sidebar, topbar, headings, buttons, badges, tables, modal, toast, Brand Lab studies, hub, comparison, line movement, benchmark panels, the whole visual dashboard block, print, reduced motion. Contains unused legacy rules (`.score-hero`, `.hero-grid`, `.field-art`, `.progress-card`, `.preview-game`, `.status-strip`) from the first dashboard |
| `web/src/visualLayouts.css` | five layouts, motion data attributes, notices, market row values |
| `web/src/dashboardPreferences.css` | Customize panel, layout previews |
| `web/src/dashboardInsights.css` | tabs, points bars, donut, references list |
| `web/src/dashboardMatchupFilter.css` | matchup filter |
| `web/src/socialDashboardCard.css` | Your betting week |
| `web/src/scoringReferences.css` | reference values, consensus boxes, Edge board phone layout |
| `web/src/teamIdentity.css` | marks and matchup rows |
| `web/src/chipPicker.css`, `web/src/community.css`, `web/src/entryExperience.css`, `web/src/chartGuide.css`, `web/src/brand.css`, `web/src/personalWorkspace.css`, `web/src/socialBetTracker.css`, `web/src/sportsbookSources.css`, `web/src/predictionReview.css` | the rest |

---

## 5. Observed design issues (evidence from the October 9 build)

Screenshots were taken on 2026-10-09 at 09:56 PDT from the compiled build of `main` + PR #30 against the isolated synthetic server (Sean's Spread ballot submitted, no references, Total empty), at 1440×1000, 390×844 and 320×700. Regenerate them with the script in Appendix B; the PNGs are not committed.

| # | Where | Observation | Why it matters | Guide / audit reference |
|---|---|---|---|---|
| D1 | Dashboard, all widths | The first card is **Customize dashboard** (a settings control), the second is **Your betting week** (four zero/dash metric tiles plus an empty state). The game itself — Accuracy matchup and the Spread / Total / Challenge tiles — starts below the fold on desktop and about 2.5 screens down at 390px. | Hierarchy inverts the product: the hidden-line prediction game is the product; Bet Tracker is an attachment. | Brand guide "Top scoreboard" should lead; PLAY_WORKSPACE_UX home card order; persona #17 (same pattern on Community home) |
| D2 | Gaps panel, empty | With no references, five games each print three identical text lines ("Reference unavailable / Not submitted / Not submitted") = fifteen lines of the same sentence, no bars. Score rows show "— / 150" three times with a thin empty track. | Empty states read as a broken page and bury the one useful fact (what the player should do next). | Guide: missing data as em dash **with** stale warning, not repetition |
| D3 | `.visual-actions` tiles | Spread "Submitted", Total "0/15 entered", Challenge "Your card" are visually identical cards; the one that needs action is not emphasized. At 320px three columns cramp and labels wrap. | The next action has no visual weight. | PLAY_WORKSPACE_UX "This week / next action" |
| D4 | Dashboard | Six collapsed disclosures stack in one view (Customize, How to read this, Source & scoring details, Compare accuracy in detail, Data connections, each gap row, plus "Show all 15 games"). Same chevron for all; no visual distinction between "settings", "explanation" and "data". | Accordion fatigue; the chevron loses meaning. | — |
| D5 | Insights tabs at 390 and 320 | "Player points / Accuracy mix / Line movement" wraps to two rows; the orphan "Line movement" sits alone. | Looks broken on phones. | 320/390 fit rule |
| D6 | Type scale everywhere | Root 14px; eyebrows 8–9px; table headers 8px; footer 8px; nav 12px; badge 9px; metadata 10px. | Below the brand scale and below legibility for low vision (persona audit severity 2 at 200% zoom). | Guide type scale; persona #12, #20, #38 |
| D7 | Tokens | `--font-mono` undefined → score numerals in Inter; no webfonts; radius/spacing/motion tokens not exported; hard-coded px drift. | The system cannot be reasoned about from `tokens.json`. | Guide "Use shared tokens"; UX-06 |
| D8 | Sidebar | Eleven entries; `TrendingUp` used for both Virtual Units and Unit Betting; `Users` for Bet Tracker, Compare picks and the league chip. "Design lab · Draft" is visible to every player. | Icon ambiguity; internal tooling in player navigation. | Guide navigation list (six items) |
| D9 | Edge board table | Consensus column carries three lines of 8px mono provenance per row; numbers are 12px. | Provenance is required but drowns the numbers it qualifies. | SIMPLE_DASHBOARD "receipts behind a compact four-value comparison" (UX-02/04) |
| D10 | Team marks | Mixed language: full-color official SVGs next to flat original badges; weights differ at 24px. In the local build the Bills and Rams rows show **no mark**: `server/index.mjs` has no `.png` MIME entry, serves them as `application/octet-stream` under `nosniff`, and Chrome drops them. Both PNGs are oversized (3840×2564 and 1920×1379, ~270 KB each) for a 24–32px slot. Production Pages serves PNG correctly, so this is local-only, but the asset size is not. | Inconsistent identity row; asset weight. | VISUAL_POLISH priorities 1 and 4; D-22 |
| D11 | Metadata | Footer 8px; "Local preview · No live odds feed · All times Pacific" and the local-note "v0.1" in 8px tracked caps. | Unreadable; v0.1 is stale. | — |
| D12 | Dead CSS | `.score-hero`, `.hero-grid`, `.field-art`, `.progress-card`, `.preview-game*`, `.status-strip`, `.compact-standings` and most Brand Lab study rules ship in the main stylesheet but are not rendered by `Overview`. | 80 KB stylesheet, slower audits, confusing for designers. | PERFORMANCE_AUDIT |
| D13 | Chips (Community and My picks) | Selected chip differs from unselected by fill only; identical under forced colors; team chips truncate ("Command…") at 390. **PR #34 (draft) adds a check icon on selected chips and `forced-colors` blocks in `chipPicker.css` and `community.css`; the truncation remains.** | State invisible for Windows High Contrast and color-blind users. | persona #10, #21 |
| D14 | Community home | Theme selector card (115px) is the first element; league switcher is six chips of which five lead nowhere live; 8px leaderboard headers. **PR #34 moves Appearance to the foot; the switcher and the 8px headers remain.** | Primary action below the fold. | persona #17, #12 |
| D15 | Light theme | Tokens pass AA (lowest real pair 5.5:1), but no screenshot review of the full dashboard in Light exists after D-21. | Unknown polish. | UX-03 |

What is already good and must be preserved: token discipline for color (no stray hex outside the Brand Lab), icon-only Field monogram, cyan focus rings everywhere, native `<details>`/`<dialog>` semantics, honest state labels (SAVED REFERENCES, Unscored, Stale), the matchup component with Away/Home labels, zero axe violations, reduced-motion handling, the compact Edge board phone card layout from PR #22, the group ballot card layout from PR #26.

---

## 6. Design brief — what the agent is asked to produce

Work in this order. Each stage ends with evidence in a PR; do not combine stages into one PR.

### Stage 0 — Visual audit (no code)

Deliver `docs/DASHBOARD_VISUAL_AUDIT_<date>.md`: your own walk-through of the surfaces in section 2 at 320/390/1440 in both themes, a heuristic score per surface (hierarchy, density, consistency, state clarity, legibility, motion), and a ranked issue list that confirms, extends or disputes section 5. Include the exact screenshot filenames you generated (keep them under `.local/previews/design/` locally and attach them to the PR; do not commit PNGs).

### Stage 1 — Token foundation (small, mergeable PR)

- Export fonts, radius, spacing and motion from `design/tokens.json` as CSS variables in `Theme.jsx` (`--font-body`, `--font-display`, `--font-mono`, `--radius-card`, `--radius-control`, `--space-1..7`, `--motion-quick`, `--motion-standard`). Define `--font-mono` once and remove the dead references.
- Load Inter, Barlow Condensed and IBM Plex Mono from a free licensed provider (all three are OFL; Google Fonts is acceptable under the guide's "licensed providers" clause) with `font-display: swap` and system fallbacks, **after** asking Sean one question: "Load OFL webfonts from Google Fonts, or stay on system fallbacks?" (recommend Google Fonts; impact: one DNS lookup, ~60 KB, numerals finally match the guide).
- Raise root type to 16px and set a real scale (title 28/34, section 20/28, body 16/24, metadata 13/18, stat numeral 36/40). This is a global change; do it behind the persona static check and the 320/390 fit tests, and expect to touch `styles.css` extensively. Remove every rule under 12px that is not decorative.
- No visual redesign in this PR; it is the substrate.

### Stage 2 — Dashboard hierarchy and components (the core redesign)

Target the League Dashboard first, then Community home. Required outcomes:

1. **Score first, next action second.** Lead with a compact scoreboard: the viewer's accuracy for the selected market (points, closest-pick record, exact count), its state label (SAVED REFERENCES / PROVISIONAL / FROZEN / PRACTICE / Unscored), and source age. Directly under it, the next action: the market still due with its deadline (real deadline only; never a manufactured countdown), or "Submitted · editable until <deadline>". The betting-week card moves below the game content or becomes a one-line summary row.
2. **One consolidated empty state** per panel instead of repeated rows; it names the reason and the action ("Scores appear after Troy and Luke submit"; "No reference was saved with this ballot").
3. **Action tiles with weight:** the due market is the primary-styled tile; submitted tiles are quiet; Challenge shows its W–L–P.
4. **Disclosure taxonomy:** three visual kinds — settings (gear, moved to the bottom or into Settings & setup), explanation (question icon, one per screen), data drilldown (chevron inside tables). Customize dashboard leaves the top of the page.
5. **Charts as a system:** one line style, one bar style, one donut; legends identical across insights, gaps and comparison; own player always lime, others cyan/tie; kickoff lock marker on line charts when the deadline is known; hover/tap reveals source and time; empty chart = single readable value plus timestamp, never a flat line.
6. **Tabs that fit:** insights tabs as a segmented control that never wraps (icons at 320, labels at 390+), or a select below 360.
7. **Team identity row:** one size system (24/32/48), consistent optical weight between official marks and original badges (add a subtle ring or tile behind official marks or lighten badges), fix the PNG MIME in `server/index.mjs` and downscale the two PNGs to ≤ 256px (keep the originals' rights references).
8. **Navigation:** unique icon per item; group the sidebar (Play / Review / Social / Account); hide Design lab behind a commissioner-only flag or Settings.
9. **Light theme parity:** every panel reviewed in Light; add `forced-colors` rules for chips, liked hearts, urgent cards and the "me" leaderboard row.
10. **Motion spec:** 150 ms quick, 220 ms standard, easing documented; only for real state changes (new snapshot, expanded drilldown, score change); honor the three-way motion preference.

Keep every accessible name, test hook and state string listed in section 7 unless you update the matching spec in the same PR.

### Stage 3 — Five visual alternatives for the still-provisional categories (proposal only)

Type pairing, palette, UI layout concept, icon language and motion each need **five rendered originals** before any can be approved. The Brand Lab (`web/src/BrandLab.jsx`, "Design lab") already holds the October 8 studies; extend or replace them with real dashboard renders (the same panel in five treatments), not swatches. Present each category as one question to Sean with your recommendation and the accessibility/licensing notes. Record nothing until he answers.

### Stage 4 — Hand-back

Update `docs/BRAND_GUIDE.md` (only what Sean approved), `design/tokens.json`, `docs/VISUAL_POLISH.md` (what shipped), the breadcrumb file for every commit, and the tracker rows UX-03, UX-06, UX-11, UX-15 through a PR note (Sean updates `planning/project-tracker.json`).

---

## 7. Test hooks and strings that the suites depend on

Changing these without updating the spec breaks CI. The dashboard specs are `tests/browser/dashboard.spec.js`, `dashboard-charts.spec.js`, `social-dashboard.spec.js`, `market-table.spec.js`, `experience.spec.js`, `submission-scoring.spec.js`; `tests/cloud-browser/onboarding.spec.js` (five layouts, preferences, notices, team marks, 320/390 light/dark fits), `community.spec.js`, `d23.spec.js`, `prediction-completion.spec.js`, `results.spec.js`, `sportsbook-sources.spec.js`; `tests/accessibility/critical-paths.spec.js` (axe, keyboard, 320 reflow); `tests/performance/lazy-loading.spec.js`; `tests/cloud-browser/personas/*.spec.js`.

| Hook | Used for |
|---|---|
| heading "The weekly huddle." | dashboard loaded |
| `.score-number` containing `—` | unscored state |
| `.game-option` count 3 | action tiles |
| buttons "Compare picks", "Make your picks" inside `.heading-actions` | heading actions (tests target `.heading-actions`, never `.last()`) |
| button "Open navigation" / `aria-controls="game-navigation"` | mobile drawer |
| link "Skip to main content" focused on first Tab | skip link |
| `aria-pressed` on mode tabs and layout radios; `[data-layout]`, `[data-dashboard-motion]` on `.visual-dashboard` | layouts and motion |
| `aria-label="Expand <name> accuracy details"`, `"Expand <AWAY> at <HOME> gap details"` | drilldowns |
| region "Spread pick comparison" / "Total pick comparison"; `.comparison-table`, `.comparison-mobile` | comparison |
| headings "Errors against saved references", "Your total analysis", "Your spread analysis" | panels |
| text "Unscored · no eligible reference", "Stale saved consensus", "Saved with guess", "Current consensus" | reference states |
| `.market-comparison`, `.market-guess-cell`, `.market-consensus-value`, `.market-gap-cell` with `data-label` | Edge board phone layout |
| `.team-identity[data-logo-status]`, `.team-matchup`, Away/Home labels | marks |
| `.chip`, `.chip.selected`, `aria-pressed`, labels "Lower by half a point" / "Raise by half a point", `role="group"` label "<Away> at <Home> Spread|Total" | chip entry |
| `localStorage` keys in section 1.3 | preference persistence |
| `document.documentElement.scrollWidth <= innerWidth` at 320/390 | no horizontal scroll |

Run before every PR: `npm run check` (typecheck, Node tests, build), `npm run test:browser`, `npm run test:accessibility`, `node scripts/persona-static-checks.mjs`, `python3 scripts/check-brand-docs.py`, `git diff --check`. For cloud-style suites install the disposable database once: `npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8`, then `npm run test:cloud-browser` and `npm run test:personas`.

---

## 8. Delivery protocol

1. Branch `claude/<slug>` from `origin/main`; one concern per PR; PR title in plain words; description lists the screens touched, the screenshot evidence (320/390/1440 × Light/Dark), the suites run and their counts, and anything deliberately left out.
2. Every commit gets a row in `docs/breadcrumbs/YYYY-MM-DD-<slug>.md` (session id, device, timestamp with zone, commit, changes, validation, status, next step, sync state). Follow the existing file shape.
3. Never: deploy; run `npx supabase db push`; edit anything under `data/`; commit `.local/`, `.env*`, PNG screenshots or font files; add a paid service; change scoring, deadline, reveal or D-23 behavior (that is the UX agent's and the rules owner's domain, and even they need decisions first); approve a provisional brand category yourself.
4. One question to Sean at a time, with a recommended default and its impact. Keep working on everything that does not depend on the answer.
5. Report outcomes faithfully: which suites ran, which were skipped (for example PGlite suites skip without `.local/sql-check`), what was not verified on a physical phone.

### Decision backlog for Sean (ask one at a time, in this order)

1. Webfonts from Google Fonts (OFL) or system fallbacks only. Recommend Google Fonts.
2. Root type 16px with the guide's scale (denser screens become longer). Recommend yes.
3. Dashboard order: game scoreboard and next action first, betting week after. Recommend yes.
4. Hide "Design lab" from players (commissioner-only). Recommend yes.
5. Keep all five layouts or reduce to Command center + Matchup cards + Analytics lab. Recommend reduce; the social and market variants differ by one grid rule each.
6. Unify team marks (ring behind official logos, or badge style for all 32). Recommend ring; it keeps the reviewed assets.
7. Then the five-alternative selections, one category per question: type → palette → iconography → motion → layout concept.

---

## Appendix A — File map for the design agent

| Path | What |
|---|---|
| `web/src/App.jsx` | league shell, navigation, `Overview`, `Leaderboard`, `Edges`, `ComparePicks`, `HistoryPage`, `SettingsPage`, `LineMovement`, `SourceNote`, modal, toast |
| `web/src/VisualDashboard.jsx` | the dashboard body described in 2.1 |
| `web/src/DashboardInsights.jsx`, `dashboardInsightsModel.js`, `ChartGuide.jsx` | D-16 insights tabs, donut, saved references list, beginner guide |
| `web/src/DashboardPreferences.jsx`, `dashboardPreferences.js`, `DashboardMatchupFilter.jsx` | layouts, sections, motion, notices, display filter, localStorage |
| `web/src/SocialDashboardCard.jsx` | Your betting week |
| `web/src/PlayerComparison.jsx`, `playerComparisonModel.js`, `PlayerComparisonHistory.jsx` | Compare accuracy in detail |
| `web/src/ScoringReference.jsx`, `scoringReferences.js`, `SportsbookSources.jsx` | reference value, current consensus, policy note |
| `web/src/DataConnections.jsx`, `DecisionAnalysis.jsx` | data connections panel |
| `web/src/TeamIdentity.jsx`, `teamLogoRegistry.js`, `web/public/team-logos/` | marks |
| `web/src/CommunityHome.jsx`, `ChipPicker.jsx`, `TeamFacts.jsx`, `SitOutWeek.jsx` | Community home and chip entry |
| `web/src/PredictionEntry.jsx`, `SubmissionComparison.jsx`, `ChallengeQuoteReview.jsx` | My picks, comparison, Challenge |
| `web/src/GameHub.jsx`, `AuthGate.jsx`, `PersonalWorkspace.jsx`, `SocialBetTracker.jsx`, `VirtualUnits.jsx`, `BrandLab.jsx`, `InstallApp.jsx` | hub, sign-in, Solo, Bet Tracker, Virtual Units, Design lab, install |
| `web/src/Theme.jsx`, `Brand.jsx`, `brand.css` | theme application, identity |
| `web/src/main.jsx`, `web/index.html`, `web/public/manifest.webmanifest`, `web/public/app-icon*.png`, `favicon.svg` | entry, PWA, icons |
| `design/tokens.json`, `docs/BRAND_GUIDE.md`, `docs/DESIGN_EXPLORATION.md`, `docs/VISUAL_POLISH.md`, `docs/TEAM_LOGO_SOURCES.md` | design sources of truth |
| `scripts/persona-static-checks.mjs`, `scripts/check-brand-docs.py`, `.github/workflows/brand-qa.yml` | brand and accessibility checks |
| `server/index.mjs` | local Node service (static MIME map, API) |

## Appendix B — Screenshot script used for this handoff

Build first (`npm run build`), start `GTL_TEST_PORT=8795 node scripts/test-server.mjs`, then run this from the repository root with Node 22 (adjust the import path if your checkout lives elsewhere). It writes full-page PNGs for the states reviewed in section 5.

```js
import { chromium } from '/absolute/path/to/repo/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs';
const out = process.argv[2], base = 'http://127.0.0.1:8795';
const exe = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
async function shot(name, width, height, steps) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(base + '/');
  await page.getByRole('heading', { name: 'The weekly huddle.' }).waitFor();
  if (steps) await steps(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  await page.close();
}
await shot('dashboard-1440-command', 1440, 1000);
await shot('dashboard-1440-overunder', 1440, 1000, p => p.getByRole('button', { name: 'Over/Under' }).click());
await shot('dashboard-1440-customize-open', 1440, 1000, p => p.locator('.dashboard-preferences > summary').click());
await shot('dashboard-390', 390, 844);
await shot('dashboard-320', 320, 700);
await shot('leaderboard-1440', 1440, 1000, async p => { await p.getByRole('button', { name: 'Leaderboard', exact: true }).click(); await p.locator('main h1').waitFor(); });
await shot('edgeboard-1440', 1440, 1000, async p => { await p.getByRole('button', { name: 'Edge board', exact: true }).click(); await p.locator('main h1').waitFor(); });
await browser.close();
```

Light theme: set `localStorage.setItem('gtl.theme','light')` with `page.addInitScript` before `goto`. Other layouts: `localStorage.setItem('gtl.dashboard.preferences.v1', JSON.stringify({version:1,layout:'matchups',modules:{scores:true,gaps:true,history:true,connections:true},motion:'system',notices:{marketUpdates:true,dataIssues:true}}))`.

## Appendix C — Decisions index that shapes the dashboard

| Decision | Effect on design |
|---|---|
| D-02 → superseded by D-16/D-17 | Submission-time scoring reference per guess; edits re-anchor; current consensus shown separately with timestamps |
| D-05/D-06 | One weekly ballot and one Challenge set reused across groups; rosters and standings separate |
| D-14 | Icon-only Field monogram |
| D-18 | Virtual Units play-money game (separate screen) |
| D-21 | One community, feed, shared season leaderboard, chip entry replaces typed numbers |
| D-22 | Coming-soon leagues with Notify me; a mark for all 32 teams |
| D-23 | Nothing deleted, moved or hidden; "Sat out" never 0 |
| D-24 | Weeks open Monday 12:00 AM PT, close at TNF kickoff; "Week N opens Mon …" states |
| D-25 | Ben's Week 5 picks, commissioner-ruled reference (data only) |
