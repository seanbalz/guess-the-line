# Trends tiles and chart: glass, one number, top three first (D-75) — design

Owner: Sean Balsiger · Version 1 · November 3, 2026 · Approved design, not built

## Why

After the November 3 readback, Sean looked at the Trends tile captures and said: "I don't like the graphs and charts
chosen. This doesn't look good compared to the new glossy air Apple type nodes. Needs to be concise and useful and not
overwhelming."

The tiles stacked up to 13 deep. Each had a two-line title, a three-part record ("975–903–47") and a meter bar with a
tick. The opened trend's chart carried a scale line, three pills and three stat boxes.

## What Sean chose

The choices were made on the private canvas
[GTL Trends Tiles and Chart Options](https://claude.ai/artifact/XKm5YakrtHG5JzBo11fDQf).

- **Scope:** "Trends tiles + trend chart (Recommended)". That covers the trend tiles on This Week and Teams and the
  opened trend's chart. Other Research charts wait for the overhaul's Research step.
- **Option:** from five options, he answered "Rec", my recommendation: **5 · Top three, rest folded**.
- **Mockups:** he then asked "Show mockup always", and approved the drawn screens ("Yes"). They are the canvas rows
  "Chosen: 5 · Top three, rest folded" (four screens, Dark and Light) and "Option 5 · the Teams landing". The mockups
  set the layout; the app's tokens and copy rules set the look.

## The design

### Every trend tile

- **The look:** glass, using the existing `--gx-glass` and `--gx-glass-shadow` tokens, with the `--gx-radius-md` (16px)
  radius for tiles and `--gx-radius-lg` (24px) for the hero and the chart card, and a 12px gap. The two themes already differ: dark is translucent with an inner highlight, light is white with a soft shadow.
- **Content:** the trend's title, then **one big number, the win rate** to one decimal ("55.6%"), then one meta line:
  "712 games · since 2002" (`sinceText`, so a coach reads "since 2024").
- **Removed:** the W–L–P record and the meter bar.
- **Win rate:** wins out of decided games, W / (W + L), with pushes left out. For a card it comes from its
  `chart.record`, and for a row from its `split`. It is never rounded before display, and with no decided game it
  shows "—".
- **Locked trends:** a trend in a locked market is still the lock tile, with no number (D-31, D-36).

### This Week, the first card

- **The hero:** the strongest trend, by the existing `strength` order, gets one larger glass card. It shows the game
  and the title, the big win rate, "win rate · N games since YYYY", and a small line from the trend's own
  `chart.spark` when it has one. A row trend has no spark, so its hero has no line. If the strongest trend is locked,
  the hero is a lock at hero size.
- **Two tiles:** the second and third trends sit side by side.
- **"All N trends this week":** a row that opens a new layer, **All trends**, at the address `weekList=all`. It has a
  "Back to This week" lip and lists every trend of the week, strongest first, as glass tiles in two columns. A tile
  opens its trend, and the trend's lips lead back through its game.
- **Unchanged:** the freshness line, the saved-trends row and the game tiles, which become glass tiles.

### Teams

- **One team:** any locks first, then the team's **two strongest** trends as glass tiles. Then a row,
  "N more <CODE> trends", opens the rest in place in the same tiles. It is a button with `aria-expanded`; it is not
  an address.
- **The Teams landing:** each team's tile becomes glass. It shows the mark, "Home" or "Road", the venue win rate as
  the big number and "N games". The meter goes. The meta line reads "Covers at this week's venue · since 2002", or
  "Overs …" for Total.

### One opened trend

- **The chart card:** one glass card. The big win rate and "win rate since YYYY" sit on top. Then one line from
  `chart.spark` with a soft fill under it, which fades out in light. The record (388–310–14) and "+42.7 U at −110" go
  at the bottom.
- **Removed:** the scale text, the three pills and the three stat boxes.
- **No spark:** a trend without one, such as a row, shows the big win rate and the record, with no line.
- **Behind the ⓘ:** the tier ("Not proven"), the conditions, the sentence and the source, joining what is already
  there.
- **Unchanged:** "Windows and dates" and "Game details".

## What does not change

- No server, data, route, migration or rule change. This is the frontend only.
- **Gates:** no line-based number appears before its market opens.
- **The rest of Research:** strength ordering, the Players and Build sections, and the Fantasy, Games and Teams sheet
  charts are unchanged. The overhaul's Research step (D-69 step 3) still adds its motion: the chart reveal, count-ups
  and entrances.
- Type and the brand tokens are unchanged (D-58).

## Pieces

- **`web/src/next/trends/TrendLayer.jsx`:**
  - `TrendTile` becomes the glass tile.
  - New `TrendHero` (the hero card) and `TrendChartCard`, which replaces the `TrendDetail` use inside `trendLayer`.
  - `winRate(card)` and the display text.
- **`web/src/next/trends/WeekNest.jsx`:** the hero, the two tiles, the All trends row and the `weekList=all` layer.
- **`web/src/next/trends/TeamsNest.jsx`:** the two-and-fold team layer and the glass landing tiles.
- **`web/src/next/trends/teamNest.js`:** `trendShare` returns the exact win rate from the record, for rows and cards.
- **`web/src/next/ui/nest.css`:** `.gx-nest-tile--glass`, `.gx-nest-hero` and the chart card, using existing tokens
  only.
- **Router and state:** add `weekList` to the Trends keys in `shell/router.js` and to `ROUTE_KEYS` and the
  trends-step list in `shell/state.js`.
- **`shared/trends-view.mjs`:** export `sinceText`.
- **PR #461:** its "since" label folds into this work, and #461 closes.

## Checks

- **Unit (Vitest):**
  - the win rate's math, its "—" case and pushes left out;
  - one hero plus two tiles plus the All trends row;
  - a locked strongest trend stays a lock;
  - the team fold: two shown, then the expand with `aria-expanded`;
  - the chart card with and without a spark;
  - no surface sentence over twelve words;
  - the router accepts and round-trips `weekList`.
- **Cloud browser** (`next-trends.spec.js`): This Week › All trends › a trend › Back, the team fold and the opened
  card, at 320 and 390px in Light and Dark, with axe and no sideways scroll, and every report `skipped 0`.
- **Captures:** 390px Light and Dark captures of the real build go to Sean before any release.

## Release

Frontend only, through the protected workflow, after Sean OKs the captures of the built screens.
