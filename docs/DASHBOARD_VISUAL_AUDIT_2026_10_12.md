# Guess The Line — Dashboard visual audit (Stage 0)

Owner: Sean Balsiger · Version 1 · October 12, 2026 · Author: design agent (Claude Code, Mac mini) · Brief: [DASHBOARD_UI_DESIGN_HANDOFF.md](DASHBOARD_UI_DESIGN_HANDOFF.md) section 6, Stage 0

This is a walk-through of the surfaces in section 2 of the brief, captured from `origin/main` at `9f66183` (PRs #34, #36, #42–#47 included). It confirms, extends or disputes the October 9 issue list (D1–D15) and ranks what Stages 1 and 2 should fix. No code changed in this stage. The decisions Sean made on October 12 (webfonts, 16px root, score-first order, commissioner-only Design lab, three layouts, ringed team marks, "Total" as the second market's name) are taken as given; the five-alternative brand categories remain proposals.

## 1. Method

| Item | Detail |
|---|---|
| Build | `npm run build` of `9f66183` in an isolated worktree; `npm run check` passed (node:test 481/481, vitest 51/51) before any screenshot |
| League shell | `GTL_TEST_PORT=8797 node scripts/test-server.mjs` — synthetic store, fixed clock 2026-10-08 16:00 UTC, `SYNTHETIC TEST EVIDENCE` quotes, Sean's Spread ballot submitted, Total empty |
| Community home | the persona harness (local PGlite, real cloud handler and migrations, mocked auth; six games, Ben Fixture signed in, Troy and Luke Fixture members). No hosted data was read |
| Viewports | 1440×1000, 390×844, 320×700, each in Dark and Light (`gtl.theme` set before load); full-page captures with animations disabled |
| Measurements | per screen: document vs viewport width, page height, root font size, count of rendered text elements under 12px, top offset of the Accuracy matchup panel and the action tiles, loaded webfonts |
| Static checks | `node scripts/persona-static-checks.mjs`; a grep of every `font-size` and `border-radius` declaration in `web/src/*.css` |

Screenshots (not committed; kept locally under `.local/previews/design/` and attached to the PR):

- League dashboard: `before-dashboard-{1440,390,320}-{dark,light}.png`, `before-dashboard-total-{1440,390,320}-{dark,light}.png`, `before-dashboard-customize-1440-{dark,light}.png`
- Leaderboard: `before-leaderboard-{1440,390,320}-{dark,light}.png`
- Edge board: `before-edgeboard-{1440,390,320}-{dark,light}.png`
- Compare picks, History & audit, My picks: `before-compare-1440-*.png`, `before-history-1440-*.png`, `before-mypicks-1440-*.png`
- Community home: `before-community-feed-{1440,390,320}-{dark,light}.png`, `before-community-picks-{1440,390,320}-{dark,light}.png`
- Metrics: `before-metrics.json`, `before-community-metrics.jsonl`

## 2. Measured baseline

| Screen (Dark; Light identical) | Page height 1440 / 390 / 320 | Accuracy panel top 1440 / 390 / 320 | Action tiles top 1440 / 390 / 320 | Text elements under 12px (1440) |
|---|---|---|---|---|
| League dashboard (Spread, submitted) | 3248 / 3731 / 4099 px | 1052 / 1495 / 1683 px | 1947 / 2407 / 2683 px | 38 of 514 |
| League dashboard (Total tab, not submitted) | 1808 / 2314 / 2599 px | 1052 / 1495 / 1683 px | 1509 / 2006 / 2246 px | 19 of 136 |
| Leaderboard | 1000 / 1216 / 1293 px | — | — | 36 of 75 |
| Edge board | 2337 / 5861 / 6408 px | — | — | 99 of 205 |
| Compare picks | 7048 px (1440) | — | — | 92 of 414 |
| History & audit | 1810 px (1440) | — | — | 56 of 102 |
| My picks | 7929 px (1440) | — | — | 143 of 879 |
| Community feed | — | — | — | 9 per width |

- No horizontal page scroll on any captured screen (document width equals viewport width at 320, 390 and 1440 in both themes).
- Root font size is 14px everywhere (16px only at ≥1600px). No webfont is loaded (`document.fonts` reports nothing loaded); Inter, Barlow Condensed and IBM Plex Mono render only where installed on the machine.
- Rendered sizes on the dashboard at 1440: 8px ×6, 9px ×12, 10px ×2, 11px ×18 text runs; 13–14px carry most of the copy.
- Declared `font-size` values across `web/src/*.css`: 5, 6, 7, 8, 9, 10, 11px appear 4, 8, 20, 38, 43, 53, 44 times (styles.css carries almost all; the 5–7px rules are Brand Lab studies and the layout mini-previews).
- `border-radius` values in use: 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 20px, 50%, 24% — two declarations use `var(--radius-card,12px)`, one `var(--radius-control,8px)` and one `var(--control-radius,8px)`; none of those variables is defined, so only the fallbacks apply.
- `persona-static-checks`: 5 contrast pairs below 4.5:1 (all Brand Lab or `.option-index` decoration), 15 declared sizes under 44px on interactive selectors (legacy local-workspace rules), 39 interactive/label rules under 12px, no `forced-colors` block in `styles.css`.

## 3. Heuristic scores per surface

Scale 1 (poor) to 5 (strong). Motion is scored on whether movement is meaningful, consistent and reduced-motion safe.

| Surface | Hierarchy | Density | Consistency | State clarity | Legibility | Motion | Notes |
|---|---|---|---|---|---|---|---|
| League dashboard (Command center) | 1 | 2 | 3 | 4 | 2 | 4 | Settings card and betting-week card come before the game; the action tiles are 1947px down on desktop |
| League dashboard (Total, not submitted) | 2 | 3 | 3 | 4 | 2 | 4 | Locked scoreboard is clear, but it still sits under Customize and Your betting week |
| Community feed | 2 | 3 | 3 | 4 | 3 | 4 | League switcher wraps to three rows at 390/320 before the picks-due card; 8px leaderboard headers |
| Community picks | 3 | 3 | 4 | 4 | 3 | 4 | Chip rows are clean and fit at 320; sticky save bar is strong |
| Leaderboard | 3 | 2 | 3 | 4 | 2 | — | Three stat tiles push the standings below the fold on phones; the table scrolls sideways in its card at 390 |
| Edge board | 3 | 2 | 3 | 4 | 1 | — | Provenance in 8px mono, three lines per row, outweighs the 12px numbers (D9) |
| Compare picks / History / My picks | 3 | 2 | 3 | 4 | 2 | — | Same small-type pattern: 8px headers, 9px badges |
| Shell (sidebar, topbar, footer) | 2 | 3 | 2 | 3 | 1 | 4 | Eleven sidebar entries, reused icons, Design lab visible to players, 8px footer and `v0.1` |

## 4. Ranked issue list

Severity: 1 blocks or misleads, 2 major friction, 3 moderate, 4 polish. "Stage" is where this plan fixes it.

| Rank | Ref | Severity | Status vs October 9 | Observation (this run) | Stage |
|---|---|---|---|---|---|
| 1 | D1 | 2 | **Confirmed** | Customize dashboard (settings) is the first card and Your betting week (four 0/— tiles and an empty state) the second. The Accuracy matchup panel starts at 1052px on desktop, 1495px at 390 and 1683px at 320 (about two screens down on a phone); the Spread/Total/Challenge tiles at 1947 / 2407 / 2683px. | 2 (item 1, decision 3) |
| 2 | D6, D11 | 2 | **Confirmed, quantified** | Root 14px; 38 text runs under 12px on the dashboard and 99 on the Edge board; eyebrows 9px, table headers 8px, badges 9px, sidebar caption 9px, footer 8px, league chip caption 8px, `v0.1` 8px. Low-vision persona at 200% still reads 16px headers on screen. | 1 |
| 3 | D7 | 3 | **Partly fixed (PR #36)** | `--font-*` now exported, so numerals use the mono chain, but no webfont is loaded, so the chain falls through to `ui-monospace` / Impact on machines without the fonts. Radius, spacing and motion are still hard-coded: 16 distinct radii in use; three variables referenced but undefined. | 1 |
| 4 | D3 | 2 | **Confirmed** | The three `.game-option` tiles are visually identical; "0/15 entered" (Total, the one that needs action) has the same weight as "Submitted". At 320 the labels wrap inside three narrow columns ("0/15 / entered"). | 2 (item 3) |
| 5 | D2 | 2 | **Confirmed** | With no references the gaps panel prints "Reference unavailable / Not submitted / Not submitted" for each of five games (fifteen lines), and the score rows print "— / 150" three times above empty tracks. The useful fact (scores appear after Troy and Luke submit) is not stated. | 2 (item 2) |
| 6 | D8 | 3 | **Confirmed** | Eleven sidebar entries; `TrendingUp` for Virtual Units and Unit Betting, `Users` for Bet Tracker, Compare picks and the league chip; Design lab with a Draft badge shown to every player. | 2 (decision 4 now; icons and grouping in a later Stage 2 PR) |
| 7 | — | 3 | **New** | The second market is named three ways on one screen: the dashboard tab says "Over/Under", the action tile and nav context say "Total", other pages say "Guess the Total". | 2 (decision 7) |
| 8 | D5 | 3 | **Confirmed** | Insights tabs wrap at 390 and 320, leaving "Line movement" alone on a second row. | 2 (item 6, later PR) |
| 9 | D10 | 3 | **Confirmed, extended** | The PNG MIME fix from PR #36 works (`/team-logos/buf.png` → `image/png`), but the 3840×2564 Bills and 1920×1379 Rams PNGs decode late: in an Edge board capture taken 0.8 s after navigation both rows still showed no mark; at 2.5 s both had `naturalWidth > 0`. Official full-colour marks and flat original badges still differ in weight at 24–32px. | 2 (item 7, decision 6, later PR) |
| 10 | D4 | 3 | **Confirmed** | Six disclosure types share one chevron (Customize, How to read this, Source & scoring details, Compare accuracy in detail, each gap row, Show all 15 games, Data connections). | 2 (item 4, later PR) |
| 11 | D14 | 3 | **Partly fixed (PR #34)** | Appearance moved to the foot. The six-chip league switcher still wraps to three rows at 390 and 320, so the Feed/Picks tabs and the picks-due card start about 600px down; five chips lead to "Coming soon" only. Leaderboard headers are still 8px. | 1 (type), 2 (Community home pass) |
| 12 | — | 3 | **New** | Leaderboard: three large stat tiles ("150", "Triple Threat", "At submission") take about 380px at 390 before the standings, and the standings table scrolls horizontally inside its card (the ACCURACY column is cut). | 2 (later PR) |
| 13 | D9 | 3 | **Confirmed** | Edge board consensus cells: one 12px number above three lines of 8px tracked mono provenance. | 1 (type floor), 2 (later PR) |
| 14 | — | 4 | **New** | The community feed's subtitle is followed by an orphaned people icon on its own line at 390 and 320. | 2 (Community home pass) |
| 15 | D12 | 4 | **Confirmed** | Legacy rules (`.score-hero`, `.hero-grid`, `.field-art`, `.progress-card`, `.preview-game*`, `.status-strip`) still ship; most of the 5–7px declarations belong to Brand Lab studies. | later cleanup |
| 16 | D15 | 4 | **Disputed in part** | Light was reviewed on every captured screen this time. Contrast holds; no Light-only defect was found beyond those shared with Dark. Polish items (pale stat tiles with hairline borders, the drawer's shadow edge visible at x≈0–12px on phone screens) are minor. | 2 (item 9) |
| 17 | D13 | — | **Resolved (PRs #34, #43, #47)** | Selected chips carry a check icon and a forced-colors border; team chips are content-sized and fit at 320; keyboard model merged. No change proposed. | — |

What is good and must be preserved (confirmed): colour token discipline, icon-only Field monogram, cyan focus rings, native `<details>`/`<dialog>`, honest state labels (SAVED REFERENCES, Unscored · 0 of 15 references available, Ballot not submitted), Away/Home labels in the matchup component, no horizontal scroll at 320, the Community picks chip layout and sticky save bar, the Edge board phone cards.

## 5. Plan this audit feeds

1. **Stage 1 — token foundation (separate PR):** webfonts from Google Fonts with `font-display: swap` (CSP updated for `fonts.googleapis.com` / `fonts.gstatic.com` in `server/index.mjs` and `web/public/_headers`); radius, spacing, motion and type-scale variables exported through `web/src/themeTokens.js`; 16px root and body 16/24; every non-decorative rule under 12px raised (mixed-case metadata to 13px, tracked uppercase micro-labels to 12px). No layout change.
2. **Stage 2, first PR:** score first and next action (rank 1, 4), one consolidated empty state per panel (rank 5), weighted action tiles (rank 4), Design lab commissioner-only (rank 6), three layouts with stored `markets`/`social` preferences falling back to Command center, "Total" everywhere (rank 7), betting week moved below the game.
3. **Stage 2, later PRs:** disclosure taxonomy, tabs that fit, team-mark ring and PNG downscale, sidebar icons and grouping, Leaderboard and Edge board density, Community home switcher, forced-colors rules in `styles.css`, motion spec.
4. **Stage 3:** five rendered alternatives per provisional category, one question at a time. Nothing in Stages 1–2 records a brand approval.
