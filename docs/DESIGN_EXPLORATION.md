# GTL — Design exploration and approvals (2026-10-08)

## Confirmed constraints
- Free odds/data sources only. No paid provider without a new explicit decision. Never treat unlicensed scraping as an acceptable fallback. If free sources cannot support reliable automated snapshots, expose stale/manual fallback and document limitations.
- Before locking any visible brand decision, present **five distinct, original examples per category**. Obtain explicit user selection before marking an option approved.
- Applies across website, native iPhone app, docs, dashboards, notifications, social assets, and AI agent work.
- Existing BRAND_GUIDE.md and tokens.json are **provisional**, not approved final identity. Retain them as a working baseline until choices are made.
- Inspiration: DraftKings, FanDuel, Sleeper, ESPN, CBS; do not copy logos or protected visual identities.

## Five concept directions per category (proposals only)
### Primary logo / wordmark
1. **Yardline G** — custom angular G with football-field hash marks.
2. **Split Spread** — GTL letters split by a center betting line.
3. **Scoreboard Block** — stacked GUESS / THE LINE in a modular score-tile.
4. **Gridiron Crest** — original rounded shield with GTL and one yard stripe.
5. **Market Pulse** — custom G/L monogram intersected by an ascending chart line.

### App icon
1. Lime G monogram on midnight navy.
2. Two opposing score tiles separated by a center line.
3. Minimal football-field hash + numeral 3.
4. Cyan-to-lime original rising trend glyph (no sportsbook branding).
5. GTL three-letter condensed square lockup.

### Typography pairings (use only appropriately licensed fonts / system fallbacks)
1. Inter + Barlow Condensed (working baseline).
2. Manrope + Rajdhani.
3. IBM Plex Sans + IBM Plex Mono.
4. Outfit + Oswald.
5. Space Grotesk + Archivo Narrow.
For each: show headline, score numeral, matchup row, odds/line, and small label. Test mobile legibility and numerals.

### Color schemes
1. **Midnight / Lime / Cyan**: #0B1020, #B8F34B, #38BDF8 (working baseline).
2. **Deep Navy / Ice Blue / Orange**: #0B1630, #75D7FF, #FF9B45.
3. **Charcoal / Gold / Teal**: #101418, #F3C969, #39C5B5.
4. **Ink / Electric Purple / Mint**: #121026, #A78BFA, #6EE7B7.
5. **Dark Slate / Signal Red / Silver**: #111827, #F87171, #CBD5E1.
Ensure AA contrast and semantic win/loss/pending statuses for each.

### UI / dashboard layout concepts
1. Live-score command center: headline total, trend chart, game grid.
2. Fantasy matchup cards: stacked team tiles and compact scoring.
3. Sportsbook market rows: dense, sortable signed spreads and movement.
4. Social league view: player avatars, W-L-T, rivalry comparison.
5. Analytics lab: historical movement, source confidence, edge comparison.
All five must be responsive and support provisional/locked/stale labels.

### Supporting icon language
1. Monoline sports glyphs.
2. Filled scoreboard pictograms.
3. Rounded geometric UI symbols.
4. Stencil field-marker icons.
5. Two-tone data-and-sports symbols.
Draw originals or use an appropriately licensed open icon set, with attribution if required.

### Notifications and motion examples
1. Clean live-score ticker.
2. Subtle +points counter transition.
3. Market-movement mini sparkline.
4. Rivalry matchup reveal.
5. Freeze-at-kickoff timestamp marker.
Respect reduced-motion and avoid casino slot-machine effects.

## Required approval deliverables
For EACH category, generate five visual or typographic examples (not just labels) in a reviewable comparison board, identify accessibility/licensing concerns, and ask for one selection. Do not call text concepts final visual mockups. Record selections in docs/BRAND_GUIDE.md and design/tokens.json; propagate to all assets. Request one decision at a time; proceed with independent work in parallel.

## Free-data acceptance
Inventory public/free odds feeds and their licensing, rate limits, source attribution, historical availability, sportsbook coverage, and refresh cadence. Prototype with verified snapshots; never invent current odds or claim continuous updates before a deployed poller exists.

## Recorded selections — October 8

Sean explicitly selected Primary logo option 01 **Yardline G** and App icon option 01 **Field monogram**. Those two identity choices are approved. Other categories remain proposals. The functional Customize dashboard controls offer five layouts of the existing authorized data, section visibility, reduced/subtle motion and in-page notices; this does not approve a final palette/type system or activate push/email/SMS. Design Lab saves comparison preferences per browser and identifies the applied identity.

### Icon-only refinement
Sean supplied the selected Field monogram screenshot and requested icon-only
product branding, with no site-name text beside the mark. D-14 applies that
rounded lime tile and dark original glyph across the sidebar, sign-in and lobby.
The browser title and accessible name stay Guess The Line. D-44 (October 14,
2026) removes the tile: the G stands alone in the theme green on a transparent
background.
