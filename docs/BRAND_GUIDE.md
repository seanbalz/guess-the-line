# GUESS THE LINE — BRAND & DESIGN SYSTEM v1.0
Status: canonical for all product UI, documents, dashboards, presentations, notifications, iOS, and agent-generated assets. Updated 2026-10-08.
The new app (D-38, `web/src/next/`) follows the [D-38 section](#d-38-redesign-system-the-new-app--october-14-2026) at the end of this guide. Since D-60 (October 26, 2026) it is the app every member uses; everything above applies only to the old app, which stays reachable for older records and tools until it is deleted.

## Brand position
Competitive NFL spread prediction meets fantasy-sports game day. Tone: precise, fast, confident, playful competition; NOT a real-money sportsbook. Inspiration: DraftKings (dense live stats), FanDuel (clear market rows), Sleeper (social competition), ESPN/CBS (scoreboard hierarchy). Borrow interaction patterns only; do not copy their logos, trade dress, artwork or proprietary iconography.

## Selected identity — October 8, 2026
Sean selected **Primary logo 01: Yardline G** and **App icon 01: Field monogram** from the visual Identity board. Apply the exact original study geometry through `web/src/Brand.jsx` and the Field monogram favicon/app icon. The site title and visible wordmark are **Guess The Line**, with no GTL prefix in the browser title. This approval covers these two identity choices only; type, palette, icon language and broader motion remain provisional.

**Later same-day display refinement:** Sean supplied the Field monogram screenshot
and requested the icon alone, without adjacent site-name text. Product brand
placements now use the dark Yardline G inside the rounded lime Field monogram
tile, including its soft shadow. Keep the accessible name and browser title
**Guess The Line**. This overrides the visible-wordmark instruction above;
the underlying selected original geometry and other provisional categories stay
unchanged.

**October 14, 2026 (D-44): the G alone, on a transparent background.** Sean asked
for "the G with a more subtle backgroud like transparent and green logo". The
mark is now the Yardline G by itself, with no tile, rounded rectangle or shadow
behind it, in the theme green: lime `#B8F34B` on dark surfaces and deep green
`#3B6309` on light ones (`primaryForeground`; `accent-ink` in the new app), so the
G keeps at least 3:1 against what it sits on (lime on white is only 1.32:1). The
G's two paths stay exactly as selected; the svg is framed by the G's own bounds
(`22 20 81 53`), so the G fills the box the tile used to fill and every box keeps
its size. The favicon is deep green and turns lime in a dark browser tab
(`prefers-color-scheme` inside the file). The PNG icons (home screen, manifest,
notification icon and badge) are the lime G on a transparent background with a
12% margin, everywhere, including Android's launcher and push notifications
(Sean, October 14: "Transparent everywhere"; low contrast on a white launcher
circle or a light notification card is accepted). This overrides the tile and
shadow above. Google's consent screen shows no logo.

## Identity background
Working wordmark: **GUESS THE LINE**. Short label: **GTL**. Tagline: **Call the number. Own the board.** Brand mark direction: custom stylized G/L monogram integrated with a yard-line / ascending line chart. Use only original vector assets. Team logos may be shown when properly licensed/authorized; otherwise use team abbreviations in custom shields. Do not substitute league or sportsbook marks as our brand.

## Palette (dark-first)
- Canvas / Midnight: #0B1020
- Surface / Slate: #151D30
- Elevated card: #202B43
- Hairline border: #34425C
- Primary text: #F8FAFC
- Secondary text: #AAB8CF
- Primary action / Electric Lime: #B8F34B
- Primary action text: #101B0A
- Data accent / Cyan: #38BDF8
- Win / Emerald: #34D399
- Loss / Coral: #FB7185
- Pending / Amber: #FBBF24
- Neutral tie: #94A3B8
Use semantic meaning, not color alone. Meet WCAG AA contrast for text and controls.

## Type
UI and body: **Inter** (fallback system-ui, -apple-system, Segoe UI, sans-serif). Display/score numerals: **Barlow Condensed** bold (fallback Impact, Arial Narrow, sans-serif). Monospace for odds/line columns: **IBM Plex Mono** (fallback ui-monospace, SFMono-Regular, monospace). Do not distribute font files; load from licensed providers or use fallbacks.
Scale: hero 40/44; page title 28/34; section 20/28; body 16/24; metadata 13/18; stat numeral 36/40. Minimum interactive font 16px mobile.

## Grid and components
8px spacing system (4,8,12,16,24,32,48); 12px card radius, 8px control radius; 44px minimum touch targets; max content width 1200px; responsive one-column below 640px.
Navigation: Home / Guess the Line / Betting Challenge / League / History / Settings.
Top scoreboard: projected points, delta from previous verified snapshot, locked/provisional state, source + timestamp.
Matchup card: away/home shields, kickoff time PT, your signed spread, current consensus if permitted, model projection if sourced, points, delta arrow. Never use red/green alone.
Leaderboard: accuracy points and closest-pick W-L-T in separate columns. Betting Challenge W-L-P belongs in separate tab.
Charts: cyan line for provisional total, lime dot for current snapshot, vertical kickoff lock marker; hover/tap for source timestamp and per-game movement. Missing data shown as em dash with stale warning, not 0.
Buttons: lime filled primary, dark outlined secondary, ghost tertiary. Focus ring cyan 2px.
Micro-interactions: subtle 150–220ms easing, number count transitions, score delta pulses; honor reduced-motion. Avoid casino slot-machine animations and misleading win confetti.

## Documents / marketing
Use Midnight header, lime rule, white background for print when appropriate, Inter body, consistent GTL wordmark, source/date footer. Include version and owner. Social graphics: scoreboard-style typography, original shapes and team abbreviations, no unauthorized third-party logos. Notifications concise: matchup, movement, original/current line, timestamp, deep link.

## Data integrity and accessibility
Never display a provisional score as final; use explicit PROVISIONAL or LOCKED text. Separate market line from player's prediction; protect pre-submission visibility. Use signed spread conventions consistently and display both team and sign. Quote source and timestamp for every line. AA contrast, keyboard navigation, semantic tables, aria-live for score changes, readable reduced-motion fallback.

## Agent compliance checklist
1. Read this guide and tokens before any UI/document/image change.
2. Use shared tokens, typography, components; no ad hoc hex colors.
3. Confirm logo/team mark rights; create original assets instead of copying.
4. Test 320px mobile, iPhone safe areas, dark/light print, keyboard and contrast.
5. Screenshots/PR must show brand consistency and state labeling.
6. Design deviations require an explicit documented exception.

## Deliverables still needed
The selected original logo and app icon are implemented. The final type, palette, icon and motion selection is the new app's D-38 and D-55 system (D-58, October 26, 2026). This section's old-app type and palette are legacy until the old app retires. The new app's component kit is `web/src/next/ui/`. The native iOS asset catalog remains incomplete. The provisional functional theme is described below.

## Provisional functional theme option — 2026-10-08
The user requested a working Light option alongside Dark and System. This is a functional exception to waiting for final visual selection, not approval of the final brand identity. Dark remains the default. The preference is saved per browser/device, not synchronized to the game account. Light uses the existing print-paper white and print-ink navy, with pale surfaces; lime action fills retain dark text. `themes.light.primaryForeground` supplies dark green for readable accent text; cyan, win, loss, pending and tie foregrounds are darkened for contrast on light surfaces. Both themes use shared semantic tokens and respect the device choice only when System is selected. The five-option identity review remains open.

## D-38 redesign system (the new app) — October 14, 2026
Status: **final** (D-58, October 26, 2026). Sean confirmed the D-38 prototype and D-55 approvals as his final selection for typography, palette, supporting icons and motion, which also settles this section's review (build plan stage 6). Sean approved the redesign prototype (canvas version 2) on October 14, 2026 (D-38) and asked for it as soon as possible (D-39). This section is the brand system for the new app in `web/src/next/`, built beside the old app. Where it differs from the sections above, it governs the new app only. The old app keeps the sections above and `design/tokens.json` until the flip (build plan stage 80); `design/tokens.json` is retired only when nothing uses it (stage 81).

Sources of truth, in this order:
- `design/tokens-next.json`: every value (colors per theme, type scale, spacing, radii, motion, layers, avatar fills, the font link).
- `web/src/next/styles/tokens.css`: the same values as `--gx-` custom properties. `base.css` (root, resets, motion) and `components.css` (the shared `gx-` classes, ported from the prototype's shared classes).
- `tests/next-tokens.test.mjs`: the gate for every stylesheet under `web/src/next/` (prefix, tokens defined in both themes, CSS equal to the JSON, contrast, font floor, tabular numbers, reduced motion, no hard-coded colors).

### What stays and what changes
- **Stays:** the name **Guess The Line**, the Field monogram (since D-44 the Yardline G alone in `accent-ink` on a transparent background, with no tile; `Brand.jsx` geometry), Electric Lime `#B8F34B` for the one primary action, cyan for data in dark mode, dark as the default with Light and System per device, and every data-integrity rule above.
- **Darker navy** (D-35 "darker"): canvas `#070B16` instead of Midnight `#0B1020`; surfaces one step darker on the same hue. Browser theme color `#070B16` dark, `#EEF1F6` light.
- **Type:** Figtree replaces Inter for reading text; Big Shoulders Display for words only (titles, 20px and up); Barlow Condensed for every number and team abbreviation. IBM Plex Mono is not used.
- **Violet means live** (`#D08CFF` dark, `#7B2CBF` light), for games in progress only. It is the color most distinct from loss for color-blind players.
- **Loss** is `#FC7C8E` in dark. The separate tie color retires: a push uses pending plus the word PUSH.
- **Radii** 6 / 10 / 16 / 24 / pill (the old 12 card and 8 control radii stay in the old app).
- **12px floor** for uppercase status pills, tags and counters, and the initials in a 24px avatar, only. Reading text and every tappable label are 16px; meta is 13px.

### Palette
Tints are solid colors (the state color mixed into surface-1), so contrast is predictable. Never put white text on a colored fill; text on lime is always `accent-text`.

| Token | Dark (default) | Light | Use |
|---|---|---|---|
| `canvas` | `#070B16` | `#EEF1F6` | App background |
| `surface-1` | `#111A2D` | `#FFFFFF` | Cards, tab bar |
| `surface-2` | `#1B253B` | `#F3F5F9` | Controls on cards, sheets, dialogs |
| `surface-3` | `#26314B` | `#E3E8F0` | Pills, badges, pressed state |
| `border` | `#303D57` | `#D3DAE5` | Hairlines between rows (decorative only) |
| `border-strong` | `#7A89A6` | `#6E7D96` | Control outlines, dashed "not available" |
| `text-1` | `#F5F7FB` | `#0B1020` | Main text and numbers |
| `text-2` | `#BAC6D8` | `#3C4A63` | Secondary text, odds prices |
| `text-3` | `#95A2BB` | `#526078` | Meta and icons only |
| `accent` | `#B8F34B` | `#B8F34B` | Lime fill: the primary button, your selection, the active tab marker |
| `accent-text` | `#101B0A` | `#101B0A` | Text and icons on lime |
| `accent-ink` | `#B8F34B` | `#3B6309` | Lime as text or an edge on a surface; in light, the 1px edge of every lime fill; the logo (D-44) |
| `accent-tint` | `#283831` | `#EAFBC9` | Your row, your tag, your reaction |
| `data` / `data-tint` | `#38BDF8` / `#17344D` | `#03658A` / `#DBF3FE` | Links, line movement, charts, info |
| `win` / `win-tint` | `#34D399` / `#17383E` | `#067247` / `#DAF7ED` | Win, cover, rank up |
| `loss` / `loss-tint` | `#FC7C8E` / `#372A3D` | `#B32643` / `#FEE7EB` | Loss, rank down |
| `pending` / `pending-tint` | `#FBBF24` / `#32312C` | `#8C5200` / `#FEF3D8` | Push, pending, Late, due soon, Real slip |
| `live` / `live-tint` | `#D08CFF` / `#332F53` | `#7B2CBF` / `#F5E8FF` | Games in progress only |
| `on-state` | `#070B16` | `#FFFFFF` | Text on a solid state fill |
| `focus` | `#38BDF8` | `#03658A` | 2px focus ring with a 2px gap |
| `overlay` | `#070B16CC` | `#0B102099` | Scrim behind sheets, dialogs and celebrations |

Avatars (faces first): eight fills, the same in both themes, with initials in `#0B1020`: Iris `#B7ADFF`, Peach `#FFB79E`, Sky `#8FD8FF`, Mint `#8FE6C0`, Butter `#FFD97A`, Rose `#FFA3BE`, Lilac `#DDB3FF`, Sand `#DCCDAE`. Each player keeps one fill from a stable hash of the account, never by rank or result; a name always sits beside the face. In light mode avatars get a 1px `border` ring.

Dark-only lighting is decorative: a faint floodlight wash at the top of the canvas and yard lines inside the Home hero card. Text never sits on the wash. Light mode drops both; its glows become solid 2px rings.

### Type
Fonts load from Google Fonts with `display=swap` (no font file is distributed): Barlow Condensed 500/600/700, Big Shoulders Display 700/800, Figtree 400 to 800. The new app adds the link when it mounts (`web/src/next/styles/fonts.js`); `web/index.html` keeps the old app's fonts until the flip. Both content security policies already allow `fonts.googleapis.com` and `fonts.gstatic.com`. Fallbacks: Big Shoulders → Impact, Arial Narrow; Barlow → Arial Narrow; Figtree → system-ui, -apple-system, Segoe UI; then sans-serif.

| Style | Family, weight | Size / line | Case, tracking | Use |
|---|---|---|---|---|
| `display` | Big Shoulders 800 | 40 / 40 | upper, 0.01em | Home hero line, celebration title (one per screen at most) |
| `title` | Big Shoulders 800 | 28 / 32 | upper, 0.01em | The one screen title |
| `section` | Big Shoulders 700 | 20 / 24 | upper, 0.04em | Section heads, sheet and dialog titles |
| `team` | Barlow 700 | 20 / 24 | upper, 0.02em | Team abbreviations |
| `body` | Figtree 500 | 16 / 24 | — | Reading text, inputs |
| `strong` | Figtree 700 | 16 / 24 | — | Names, button labels |
| `label` | Figtree 600 | 14 / 20 | 0.01em | Chip captions (not tappable text) |
| `meta` | Figtree 500 | 13 / 18 | 0.01em | Kickoff, source and age |
| `micro` | Figtree 700 | 12 / 16 | upper, 0.06em | Status pills and counters only |
| `n-xl` | Barlow 700 | 56 / 56 | — | Home countdown only |
| `n-l` | Barlow 700 | 32 / 32 | — | Final scores, your guess readout |
| `n-m` | Barlow 600 | 24 / 28 | 0.01em | Lines on cards, board values |
| `n-s` | Barlow 600 | 18 / 22 | 0.01em | Odds lines, chip numbers |
| `n-xs` | Barlow 600 | 16 / 20 | 0.01em | Odds prices, to-win amounts |

Every number style sets `font-variant-numeric: tabular-nums` after its font, because Barlow and Figtree ship tabular figures switched off. Big Shoulders has no tabular figures, so it never sets a number. Spreads use the real minus sign (−3), never a hyphen.

### Spacing, radii, layers
- Spacing on a 4px base: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Page gutter 16; card padding 16 (Home hero 20); 24 between sections; touch targets at least 44, primary buttons 52 tall.
- One column at 390; at most 520 wide, centered, on larger screens. No horizontal page scroll; chip rails scroll inside their own track. Top bar 56, tab bar 64, dock bar 56, plus safe-area insets.
- Radii: `xs` 6 (pills, tags), `sm` 10 (buttons, chips, odds buttons, inputs), `md` 16 (cards, toasts), `lg` 24 (sheets, dialogs, Home hero, celebrations), `pill` (avatars, segmented controls). The badge keeps its own 14 (the Pylon shape).
- Elevation: cards `e1`, floating bars, toasts and menus `e2`, sheets `e3` with a scrim. Glows mark state, not height (selection, live, a settled win).
- Layer order: content 1, top bar 20, tab bar 30, dock 35, sheet 40, dialog 45, popover 48, toast 50, celebration overlay 60.

### Rules of restraint
1. One screen, one job, one title, and one lime button in view. Repeated buttons on cards are secondary.
2. Lime only for the primary action, your selections, the active tab and you. Ghost buttons and links use `data`.
3. A card shows at most 6 numbers; book lines, movement, records, referee, wind and full trends open on tap.
4. One meta line for source and time per row.
5. Empty state: one sentence and one action.
6. Plain words: Spread, Total, Units (U), Pick streak.
7. Never color alone: every state has a word or an icon (WIN, LOST, PUSH, LIVE, Late · 12 min).
8. Honest data: a value, "—" for missing (never 0), or a lock icon with a sentence for a hidden market. PROVISIONAL and FINAL are written out. No live score until a free live source is approved.
9. Faces first: every social item leads with an avatar.
10. Fine print lives behind ⓘ (D-55, below): explanations, disclaimers and credits open from an "About …" button; the one-word labels stay.

### Motion
Durations: tap 100ms, quick 160ms, base 240ms (sheets in), exit 200ms, big 600ms (bursts, count-ups, at most), pulse 1800ms (the LIVE dot, the only loop). Easing: standard, enter, exit and pop (a small overshoot for selections, saves and wins). Only transform and opacity animate. Motion explains a change; saves get a small moment, verified wins a big one, losses stay quiet; one big moment at a time and never on page load; never more than 3 flashes a second. Reduced motion (the device setting, or `data-motion="reduce"` on the app root) stops every animation and transition; numbers show their final value.

### Themes, contrast and other modes
- Dark is the default. Light applies when `Theme.jsx` sets `data-theme="light"` on `<html>` (it resolves System), or `data-theme="light"` on the app root. Light keeps the layout; glows become 2px rings; every lime fill gets a 1px `accent-ink` edge, since lime on the light surfaces is only 1.07 to 1.32:1 (1.07 on surface-3, 1.32 on white; the edge is 7.06:1 on white).
- Checked on the token values for both themes (`tests/next-tokens.test.mjs`): at least 4.5:1 for every text and icon color on every surface and on your-row tint, each state color and `text-1`/`text-2` on the state tints, text on lime and on solid state fills; at least 3:1 for control outlines, the focus ring and the edge of a lime fill. Lowest text pairs: dark `text-3` on your-row tint 4.80, light `win` on surface-3 4.87. Lowest outline: light `border-strong` on surface-3 3.39. Avatar initials 9.41 (Iris) to 13.94 (Butter).
- Known limits, handled by rule 7: win and lime are close in lightness, live and loss are similar in lightness, and the `border` hairline is decorative.
- Forced colors (Windows high contrast): controls draw a real border; selected chips, odds buttons and segments use Highlight.

### For agents building the new app
1. Use the `gx-` classes and `--gx-` tokens. Every class starts with `gx-` (screen classes too, for example `gx-home-hero`) and every selector stays under the `.gx` root. Never use the old app's custom properties inside `.gx`.
2. No hex, rgb or named colors outside `tokens.css`. A new color is a new token in `design/tokens-next.json` and `tokens.css`, in both themes, and must pass the contrast test.
3. Load `tokens.css`, `base.css` and `components.css` in that order. `base.css` cancels the old app's element rules (`styles.css` is loaded on every page); keep element selectors inside `:where()`.
4. Build screens from the React components in `web/src/next/ui/` (stage 8: Text, Button, IconButton, Card, List, Row, Pill, Tag, Chip, ChipRail, Segmented, GateBanner, LockLine, Countdown, Rank, Meter, Badge, Strip, Sheet, Dialog, Toast, Overlay, TeamMark, the Field monogram and Lucide icons). They only draw what they are given; the server and `web/src/next/rules.js` decide what is hidden. Check a screen's markup with `tests/helpers/ui-markup.mjs` (gx- classes, accessible names, every svg hidden or labelled, emoji only inside `data-emoji-ok`).
5. Any deviation from this section needs a recorded decision.

## Four-tab simplification direction — October 21, 2026

Sean approved consolidating navigation to **Home / Play / Bets / Research**, with
League inside Play and Fantasy inside Research, giving guessing/competition and
actual-bet research/tracking equal priority. He selected **One thing first**,
the third of five interactive layout examples, with one clear task above compact
rows that open into detail. See the [written design](superpowers/specs/2026-10-21-four-tab-simplification-design.md)
for coverage, navigation behavior, preservation requirements and preview evidence.

Sean approved the written specification and authorized implementation on October
21. The four-tab implementation is tracked in PR #162. Existing GTL tokens,
identity, type, semantic colors and Light/Dark/System remain the baseline. The
selection does not finalize unrelated brand categories, change game rules or
establish a native iOS release.

## D-55 glow, glass and trend charts — October 21, 2026

Sean approved the round 3 boards on the review canvas (R1–R5): the trend detail
and dragging of directions A and B, D's stat tiles and hit-rate bars, C's glow
styling in Dark and E's soft report styling in Light, and less text on screen.
This section extends the D-38 system for the new app; everything above still
applies unless this section says otherwise. Values live in `design/tokens-next.json`
and `web/src/next/styles/tokens.css`; `tests/next-tokens.test.mjs` checks them.

### New tokens

| Token | Dark | Light | Use |
|---|---|---|---|
| `hero-card` (effect) | deep-blue radial + linear glow | white to `#F4F9FD` | Home hero and an opened trend only |
| `hero-ring` (effect) | 1px cyan edge + deep shadow | 1px `#E3E8F0` + soft shadow | The same two cards |
| `hero-base` | `#0C2540` | `#FFFFFF` | The card's base color, for contrast checks |
| `hero-text-2` | `#C9DCEB` | `#3C4A63` | Secondary words on a glow card |
| `glass` / `glass-line` | `#FFFFFF1A` / `#FFFFFF33` | `#FFFFFF` / `#E3E8F0` | Pills, tooltips and tiles on a glow card |
| `glass-shadow`, `glass-blur` (effects) | inner highlight, 14px blur | soft shadow, none | The same |
| `track` | `#FFFFFF29` | `#E3E8F0` | Empty part of a bar or meter |
| `chart-line` | `#F5F7FB` | `#03658A` | The line over a glow area |
| `glow-1`, `glow-2`, `glow-3` | `#7DD3FC`, `#34D399`, `#B8F34B` | `#7DD3FC`, `#6EE7B7`, `#D9F99D` | Area fill, top to bottom |
| `bar-1`, `bar-2` | `#7DD3FC`, `#34D399` | `#0284C7`, `#059669` | Hit-rate and progress bars, start to end |
| `chart-glow` (effect) | `0.6` | `0` | Opacity of the blurred copy under a dark area |

Light cards now float on a soft shadow (`e1`: `0 0 0 1px #E3E8F0, 0 8px 24px`)
instead of a hairline border. Dark's page wash is a deeper blue at the top.

### Where glow and glass may appear

- At most two glow cards in view: the screen's one action card (each root's hero, the kit's
  `gx-card--hero`) and one opened trend.
- Glass only on a glow card: its pills, tooltips, segmented control and tiles.
- **Lime exception:** in Dark, lime is the decorative last stop of the chart
  glow (`glow-3`). It is never text, a state or a second button; the one primary
  action keeps the lime fill. The token test allows lime only as `accent`,
  `accent-ink` or `glow-3`.
- The glow gradient means "this is the chart", never win or loss. A season below
  break-even is drawn in `loss` with its sign and word.

### Trend charts

- **Research loading:** reuse the static loading skeletons from the shared kit:
  panels for a full Research read, compact lines for expanded evidence and its
  historical table. Keep the status in words for assistive technology; never
  draw sample charts or records while waiting. A failed read replaces the
  placeholder with its explanation and retry action. No shimmer or new loop.
  A failed historical-table download stays inside its evidence section. Keep
  the chart, selection and summary usable; retry only the table on request and
  keep keyboard focus in that section. Do not dismiss Research or reload the
  app automatically for a table failure.
- **Compact row:** title, side and percent, a 80 × 30 mini area, and units.
  Tapping opens the detail in place.
- **Opened trend:** title, a one-word state pill ("Not proven"), an ⓘ button, and
  a "Since 2002 / By season" control when seasons exist. Under them sit the
  headline number ("+45.2 U" or "7 of 8"), the chart and at most three tiles.
- **Line:** cumulative units, a 2px `chart-line` over the glow area, a solid
  `0 U` baseline, and a crosshair with a glass tooltip that follows the pointer
  or a finger. A range input moves it from the keyboard. The tooltip never
  claims more than the data: binned points say "after about N games".
  Line and season tooltips reserve the tallest supplied readout so wrapped labels
  never move the plot while scrubbing; the full current text remains visible.
- **Seasons:** one stem per season from the break-even line. Each stem is a
  button that shows its record and units, and a table with hit-rate bars follows.
  Stem lengths stay proportional; exact zero uses a hollow baseline marker.
  A visible 0 U key names break-even, and missing units have no mark.
- **Player comparison scales:** signed point bars show their negative/positive bounds; absolute-error bars start at
  zero and percentage bars use 0–100%. Labels describe the actual plotting range, including the existing one-point
  minimum frame. Absent observations say the scale is unavailable. Keep exact observations and their equivalent table.
- **Unit scales:** line and season views show the plotted range beside the
  chart, including zero. Read the range when comparing independently scaled
  charts. Small nonzero bounds retain their sign; all-zero evidence says
  break-even, while absent unit evidence says unavailable. The scale also
  describes the chart to assistive technology.
- **Research evidence:** date buttons in the historical table select matching
  cumulative endpoints; scrubbing selects the matching period row. The initial
  zero baseline has no period row. Keep period records distinct from cumulative
  chart records, preserve keyboard focus and use a check plus a tint/outline.
  Link separate reads only when their charted evidence matches. Keep the sample
  description outside the horizontal scroll region, with a native table caption.
- **Recorded market movement:** collected-time buttons select their charted
  observations, with the same check and selected-row treatment as Research.
  Keep missing observations as plain readable rows and preserve gaps in the
  chart. Duplicate timestamps have distinct observation names. One observation
  stays a static readout; selection adds no collection or network requests.
  Show the recorded range above the plot, with the home-team sign for spreads
  and points for totals. Use only plotted evidence for its bounds; identify a
  single observation and a flat series without inventing movement or a zero
  baseline. The same visible range describes the chart to assistive technology.
- **Tiles (from D):** win rate with a bar and a break-even tick at 52.4%, last
  10 as blocks, and games or units. Every bar carries its number in words.

In forced-colors mode, chart marks use the system Canvas/CanvasText colors and
selection uses Highlight/HighlightText. Decorative glow and area fills hide;
lines, a dashed zero baseline, stems, bar tracks and last-ten blocks retain their
shapes. The selected season keeps its check and gains a visible border; the
selected stem has an outline. Use real borders instead of relying on shadows.
Initials avatars use Canvas/CanvasText with a real border in forced colors.
This follows the user’s contrast palette without changing ordinary Light/Dark.

### Home and Bets (round 3)

- **Home:** the hero says "Lock in Week N" over glass countdown tiles and one progress
  bar per market (the status words stay beside each bar). Under it sit three stat tiles
  (Spread rank, Total rank, active tickets), who's in for the league (faces, one status
  word each, Standings and Invite) and a row to this week's trends. This brings the
  rank tiles and who's in back, which the four-tab "One thing first" Home had left out.
- **Bets:** one pill row of short labels (Tracked / Recommended / Virtual) with their
  full names for screen readers. Each view's fine print sits behind the title's ⓘ, and
  your tracked bets lead with a net-units line you can drag and Record / ROI / Win rate
  tiles.
- **Bets › Virtual › Everyone (M-10):** a Your picks / Everyone switch under the pill row.
  - Everyone starts with this week's players: face, name, picks and units, and a
    Qualified pill.
  - Then one card per game: both team marks, the matchup, the kickoff and its faces.
  - Each pick row leads with a face. Your rows wear the your-row tint and lime
    edge.
  - A friend's closed market keeps side and units with a lock line (rule 8). One
    gate banner per screen.

### Rule of restraint 10: fine print lives behind ⓘ

Screens keep the one-word labels (Not proven, Pending, Locked, Sample, PROVISIONAL,
FINAL), missing values as "—", and the hidden-market lock lines. Explanations,
disclaimers and data credits open from a 44px ⓘ button named "About …" beside
the thing they explain. Every ⓘ topic is also listed in Menu › Guidance and
sources. One exception: the Open-Meteo credit stays beside forecast values
(D-34). The nflverse credit (CC BY 4.0) is one tap away in each trend ⓘ and in
Guidance and sources.

## D-62 team marks, records and the team page — October 27, 2026

- **Matchup:** `ui/Matchup.jsx` draws away mark, code, "@", home mark, code. Sizes 24 (rows), 32 (cards) and 48 (the
  game card at the top of a pick screen, `layout="stack"` with each record under its code). Codes use Barlow 700; the
  "@" is `text-3`; records are Barlow 600 in `text-2`. With `onTeam`, each side is a 44px button named "Seattle
  Seahawks, 4–2. Open team". Text-only places keep "SEA @ DEN".
- **Records:** a team's record sits with its mark on every pick screen (two numbers per game). It amends rule of
  restraint 3 for records only; splits and game logs open on tap.
- **Team page:** a sheet, not a tab. One headline record, at most three tiles (Home, Road, Points per game), the last
  five as W/L blocks with the letter in each block, a margin chart in `win`/`loss` with its value in words, and the
  season's games as Matchup rows with scores. No market for a game that has not finished.

- **Team game selection:** a completed game with known scores has a 44px week button that selects its margin bar.
  Scrubbing the chart selects the matching season row. Use a check plus a row tint, and a real outline in forced
  colors; keep keyboard focus on the control used. Upcoming games and finals without scores stay plain rows.
  Put the result beneath its matchup so marks, codes and scores remain readable at 320px.
  Reserve the tallest supplied margin readout so enlarged/wrapped game labels never shift the plot or slider; keep
  the full selected label visible and expose only its existing accessible chart/slider descriptions.

- **Team detail loading:** defer the detailed team view/chart and its styles until the sheet opens. Keep the sheet
  frame, back and close controls stable while the existing panels load. A failed download stays inside the frame
  with one explicit retry; preserve focus in the details and reuse the cached record read. Closing a pending view
  must return focus to its opener and a late download must not reopen it.

- October 28, 2026: the optional Research Trends page uses the existing static
  panel skeleton and a local text/retry state while code loads. Navigation stays
  available; the same named content region retains retry focus. Existing tokens,
  chart treatment and D-63 proposed labels are unchanged.

- **Recorded final cards (October 28):** keep completed matchups in a named Final
  section, with a strong readable score and separate result-source/observation
  metadata. Label commissioner-reported results and kickoff times explicitly.
  Use Kickoff passed when only the scheduled time is known; reserve live styling
  for a verified in-progress state. Existing card, text and wrapping tokens apply.
  Game-sheet arrows and swipes follow the displayed board order captured on
  opening, with account/week guards; this snapshot stays out of URL/history.

- **Recorded result in a game sheet:** reuse the board's already permitted final
  score and source in a card below the matchup. Say Recorded when opened and
  direct the player to the board for updates; keep this distinct from current
  market quotes. Preserve commissioner-reported and unverified-time wording,
  account/week guards, current-game paging and long-source wrapping. Reconnect
  focus to a recreated opener only within its captured account/week scope;
  unkeyed openers keep their normal modal behavior.
