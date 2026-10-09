# GUESS THE LINE — BRAND & DESIGN SYSTEM v1.0
Status: canonical for all product UI, documents, dashboards, presentations, notifications, iOS, and agent-generated assets. Updated 2026-10-08.

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
The selected original logo and app icon are implemented. The broader component library, native iOS asset catalog, and final type/palette/theme approval remain incomplete. The provisional functional theme is described below.

## Provisional functional theme option — 2026-10-08
The user requested a working Light option alongside Dark and System. This is a functional exception to waiting for final visual selection, not approval of the final brand identity. Dark remains the default. The preference is saved per browser/device, not synchronized to the game account. Light uses the existing print-paper white and print-ink navy, with pale surfaces; lime action fills retain dark text. `themes.light.primaryForeground` supplies dark green for readable accent text; cyan, win, loss, pending and tie foregrounds are darkened for contrast on light surfaces. Both themes use shared semantic tokens and respect the device choice only when System is selected. The five-option identity review remains open.
