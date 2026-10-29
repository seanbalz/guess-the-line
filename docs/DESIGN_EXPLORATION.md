# GTL — Design exploration and approvals (2026-10-08; status reconciled 2026-10-26)

## October 29, 2026 — logo and favicon refinement selected

Sean asked for a more symmetrical logo, color variations and favicon edits,
then selected **01 Balanced (recommended)** from five visual directions.
[Comparison board](../design/logo-redraft-2026-10-29/concepts.png) ·
[Selected implementation](../design/logo-redraft-2026-10-29/selected-preview.png) ·
[Asset and verification record](../design/logo-redraft-2026-10-29/README.md).
This replaces the original Yardline G geometry in the identity rows below.
The theme pairing and transparent backgrounds remain; alternate colors are
exported assets. The simplified favicon drops the fine side hashes.

## Status by category — October 26, 2026

This table is the current status. Each row cites the decision that set it, with
Sean's words. The October 8 option lists further down are kept as history.

"Selected" means Sean has made the final choice. For the logo and the app icon he
chose one of five options. For type, palette, supporting icons and motion he
confirmed the approved D-38 and D-55 system as final (D-58). "Approved, and
chosen from options" means Sean approved layouts picked from sets of options.

| Category | Status | In use | Source | Still open |
| --- | --- | --- | --- | --- |
| Primary logo | **Selected** (option 01 of 5) | Yardline G. Since D-44 it is the G alone, in the theme green (lime `#B8F34B` on dark, deep green `#3B6309` on light) on a transparent background, with no tile | D-12 (October 8); D-14 (October 8, icon only); D-44 (October 14: "the G with a more subtle backgroud like transparent and green logo") | Nothing |
| App icon | **Selected** (option 01 of 5) | Field monogram, now the transparent lime G, used everywhere, including Android and push notifications. Low contrast on a white launcher circle is accepted | D-12; D-14; D-44 (Sean: "Transparent everywhere") | Nothing |
| UI and layout | **Approved, and chosen from options** | Detailed under the table | D-35 (October 13); D-38 (October 14); four-tab design (October 21); D-55 (October 21) | Real-phone acceptance (queue Q19). The new app is not yet the default (`DEFAULT_APP` is still `classic`; Q20) |
| Color palette | **Selected** (D-58, October 26): the D-38 and D-55 palette is final. It was never one of the October 8 schemes | `design/tokens-next.json`: darker navy canvas `#070B16`, Electric Lime `#B8F34B` for the one primary action, cyan `#38BDF8` for data in dark, violet for live games only, plus a Light theme. D-55 adds glow, glass, track, chart-line, bar and soft-light-card tokens, and lets lime close the dark chart glow (decoration only). It is closest to October 8 scheme 1 (Midnight / Lime / Cyan), made darker | D-35 ("refresh colors, type and spacing into a darker, higher-energy system"); D-38 prototype; D-55 ("This approves the D-55 tokens …"); D-58 | Nothing. The old app keeps its October 8 styling as legacy until it retires |
| Typography | **Selected** (D-58, October 26). It is not one of the October 8 pairings | Figtree for reading text, Big Shoulders Display for titles and other words 20px and up, Barlow Condensed for every number and team abbreviation. Loaded from Google Fonts, never distributed | D-35; D-38 prototype; D-58 | Nothing. The old app keeps Inter, Barlow Condensed and IBM Plex Mono as legacy until it retires |
| Supporting icon language | **Selected** (D-58, October 26): Lucide, as used in the prototype | Lucide outline icons (open-source set) in the new app. Team marks are separate (row below) | D-38 prototype; D-58 | Nothing |
| Team marks (not one of the five categories) | **Decided** | Official logos for all 32 teams, used only to identify teams next to their names, with the trademark notice. The D-22 original badges are the fallback. No backing chip | D-46 (October 14–15) | Nothing |
| Notifications and motion | **Motion selected** (D-58, October 26): the D-38 system | The durations, easings, one-loop rule and reduced-motion behavior in [the brand guide's Motion section](BRAND_GUIDE.md#motion). The push icon and badge are the transparent G (D-44) | D-38 prototype; D-44; D-58 | Nothing. Opt-in web push with one deadline reminder (D-28) is a product rule, not a visual choice |

The UI and layout row covers these approvals:
- **D-35 direction:**
  - Home is this week's game hub.
  - Sleeper-style social cards.
  - A FanDuel-style market row and slip, inside Bets only.
  - Minimal game cards.
- **D-38:** Sean approved the clickable prototype: "i like this design a lot", then "Approved; start the build."
- **Four-tab design:** Home / Play / Bets / Research. Sean chose "One thing first", the third of five interactive layout examples.
- **D-55 trend charts:** chosen from five directions (A–E). The detail comes from A and B (the draggable line and the by-season view), the dark style from C and the light style from E.
- **D-55 round 3:** Sean approved boards R1–R5: "build round 3 (R1–R5) into the app, update the brand tokens and guide to match, and move the fine print behind info buttons."
- **Rule of restraint 10:** fine print lives behind ⓘ.

### Open decision for Sean

*Resolved October 26, 2026 (D-58).*

Type, palette, supporting icons and motion were in use because Sean approved the
D-38 prototype and the D-55 boards, but none of the four had gone through the
five-option selection. The written D-38 section of `docs/BRAND_GUIDE.md` was also
still waiting for his review (build plan stage 6). Sean answered: "Yes: the D-38
prototype and D-55 approvals are my final selection for typography, palette,
supporting icons and motion."

All four categories are now **Selected**, and that answer also settles the
brand-guide review. Every category in this document now has a selection.
Changing one needs a new decision. A new choice in that category is presented as
five options first, by the rule below.

## Where this document applies

The rule below still holds: "Before locking any visible brand decision, present
five distinct, original examples per category. Obtain explicit user selection
before marking an option approved."
- The old app's `docs/BRAND_GUIDE.md` sections (before "D-38 redesign system")
  and `design/tokens.json` are **legacy**, not re-selected (D-58). They stay until
  the old app retires. New work uses the new app's system.
- The new app's D-38 and D-55 sections and `design/tokens-next.json` are the
  **selected brand system** (D-58).


## Confirmed constraints
- Free odds/data sources only. No paid provider without a new explicit decision. Never treat unlicensed scraping as an acceptable fallback. If free sources cannot support reliable automated snapshots, expose stale/manual fallback and document limitations.
- Before locking any visible brand decision, present **five distinct, original examples per category**. Obtain explicit user selection before marking an option approved.
- Applies across website, native iPhone app, docs, dashboards, notifications, social assets, and AI agent work.
- Existing BRAND_GUIDE.md and tokens.json are **provisional**, not approved final identity. Retain them as a working baseline until choices are made. *(October 8 wording. For the current status of each category, and of the new app's `tokens-next.json`, see the table at the top.)*
- Inspiration: DraftKings, FanDuel, Sleeper, ESPN, CBS; do not copy logos or protected visual identities.

## Five concept directions per category (October 8 proposals)
These are the original option lists. The table at the top records what was chosen since.
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

Sean explicitly selected Primary logo option 01 **Yardline G** and App icon option 01 **Field monogram**. Those two identity choices are approved. Other categories remained proposals on October 8; the table at the top records what later decisions approved. The functional Customize dashboard controls offer five layouts of the existing authorized data, section visibility, reduced/subtle motion and in-page notices; this does not approve a final palette/type system or activate push/email/SMS. Design Lab saves comparison preferences per browser and identifies the applied identity.

### Icon-only refinement
Sean supplied the selected Field monogram screenshot and requested icon-only
product branding, with no site-name text beside the mark. D-14 applies that
rounded lime tile and dark original glyph across the sidebar, sign-in and lobby.
The browser title and accessible name stay Guess The Line. D-44 (October 14,
2026) removes the tile: the G stands alone in the theme green on a transparent
background.
