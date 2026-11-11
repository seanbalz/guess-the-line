# Fantasy opportunity signals

Requested by Sean on November 11, 2026: "integrate with guess the line repo on github", from the waiver-wire
research in `seanbalz/fantasy-football` (`waiver-wire/`). This brings that research's core read into Research ›
Fantasy in the new app. Frontend and shared code only: no API, function, migration, workflow or snapshot change.

## What it shows

- **Usage profile, "Opportunity signal".** The player's read (Buy, Hold, Sell or Not enough data, always in words),
  expected and actual fantasy points per game, points over expected, and his role and production percentiles within
  his position. It is not shown in the Points ballot's profile presentation.
- **Fantasy › Buy / sell signals.** A tile on the Rankings card with the Buy and Sell counts, and a layer listing the
  strongest Buy and Sell reads, filterable by All, QB, RB, WR or TE. Each name opens the usage profile.

Values follow the viewer's scoring (Standard, Half PPR, PPR; 4- or 6-point passing TDs).

## Method

`shared/fantasy-signals.mjs`, pure functions over the loaded public snapshot:

1. **Expected points** for one recorded game are its targets, carries and passing attempts times the position's league
   per-opportunity rates (receptions, receiving yards and TDs per target; rushing yards and TDs per carry; passing
   yards, interceptions and TDs per attempt), scored in the selected format. Fumbles, two-point conversions and return
   TDs count zero. The rates are `leagueRates()` from `shared/fantasy-usage.mjs`, over the same games.
2. Per game over the player's recorded games before the snapshot's week: **expected**, **actual**, and **over expected**
   (actual − expected). A game counts only when every usage stat is known and it scores, the league-rate rule.
3. **Role percentile** ranks expected per game, and **production percentile** ranks actual per game, within the position
   among players with at least 2 recorded games (average rank for ties).
4. **Gap** = role − production. 18 or more reads **Buy**; −18 or less reads **Sell**; otherwise **Hold**. Fewer than
   2 games, or fewer than 10 qualified players at the position, reads **Not enough data**.

`SIGNAL_SETTINGS = { minGames: 2, minGroup: 10, gap: 18 }`. The ±18 threshold and the 10-player minimum come from the
research; they were not tuned on the backtest below.

Why it works: points over expected barely repeats from week to week (the research measured a week-to-week correlation
of −0.04 in 2026 Weeks 1–2), while opportunity does. A player whose usage ranks well above his scoring tends to score
more; one whose scoring has outrun his usage tends to score less.

**Not included:** air yards, red-zone or goal-line usage, snap share, route participation, coverage, injuries, depth
charts or matchup. The research used play-by-play for air-yard and field-position values; the snapshot carries only
per-game totals, so this is the reduced form. It is a descriptive read of role against production, not a projection,
and it does not change the GTL estimate or any ranking.

## Backtest

`node scripts/fantasy-signals-backtest.mjs --seasons 2024,2025` (analysis only; writes `.local/fantasy-signals-backtest/`).
For each week 3–15, signals are built from earlier games only (Full PPR, 4-point passing TDs) over every QB, RB, WR and
TE with a statistics row, rostered or not. The outcome is points per game over the player's recorded games in that week
and the next two, with at least two of them recorded. Change is outcome minus his season-to-date points per game.

| Season | Signal | Player-weeks | Pace before | Next 3 weeks | Change | Improved |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 2024 | Buy | 158 | 7.44 | 10.25 | **+2.80** | 70.3% |
| 2024 | Hold | 3,536 | 7.92 | 8.47 | +0.55 | 50.7% |
| 2024 | Sell | 253 | 10.65 | 9.07 | **−1.58** | 29.6% |
| 2025 | Buy | 174 | 7.72 | 10.16 | **+2.44** | 69.0% |
| 2025 | Hold | 3,677 | 7.67 | 8.01 | +0.34 | 48.4% |
| 2025 | Sell | 227 | 11.37 | 9.24 | **−2.13** | 27.3% |
| Pooled | Buy | 332 | 7.59 | 10.20 | **+2.61** | 69.6% |
| Pooled | Hold | 7,213 | 7.79 | 8.24 | +0.44 | 49.5% |
| Pooled | Sell | 480 | 10.99 | 9.15 | **−1.84** | 28.5% |

By position (change in points per game, Buy / Hold / Sell): 2024 QB +2.77 / +2.06 / −0.98, RB +0.76 / 0.00 / −2.25,
WR +3.50 / +0.43 / −2.12, TE +3.19 / +0.95 / −1.05; 2025 QB +1.88 / +0.53 / −1.88, RB +5.98 / +0.64 / −2.62 (5 Buys),
WR +2.33 / +0.02 / −3.18, TE +3.25 / +0.55 / −1.42. RB Buys are rare (21 and 5): an RB's role and production move
together more than other positions'.

As a forecast of the next three weeks' points per game, expected per game had a lower MAE than actual per game
(pooled 3.382 against 3.487; 2024 3.504 against 3.544; 2025 3.264 against 3.431), and their average was lower still
(3.338). The Hold group drifting up (+0.44) reflects the two-recorded-games requirement on the outcome.

Sources: nflverse `stats_player_week_2024.csv` (SHA-256 `3ddc45a84f759aa348ce465ae001752c530575455717657cdfe1f8abfcdb4759`)
and `stats_player_week_2025.csv` (`e5e0615b3d96a3eaebfaee91e55afb4a4e7fe0caf057454177bcd7d6ad4bcfc2`), CC BY 4.0,
downloaded November 11, 2026.

## Live read, Week 10 hosted snapshot

Against the hosted `2026-week-10.8ee6b576.json` (stats through Week 9, 524 players; PPR): 45 QBs, 106 RBs, 164 WRs and
101 TEs qualified. The strongest Buys by position were Tanner McKee (QB, gap +56), A.J. Brown (WR, +28) and Will
Mallory (TE, +43); no RB reached Buy. The strongest Sells were Trevor Lawrence and Brock Purdy (QB, −40), Jordan
Watkins (WR, −24) and Teagan Quitoriano (TE, −40). Low-volume players appear on both lists; the gap ranks within the
whole position, not only fantasy starters.

## Verification

- `node --test tests/fantasy-signals.test.mjs`: percentiles, expected line, Buy and Sell, minimum games and group,
  kickers absent, later weeks and missing usage excluded, board order and position filter, scoring separation.
- `vitest run tests/next-fantasy-signals-ui.test.jsx`: profile section in words, absent from the Points presentation,
  board lists, profile buttons, sample line, evidence and markup rules.
- `tests/cloud-browser/fantasy.spec.js` "buy / sell signals layer": the tile, the layer, the position filter and a Sell
  name opening the profile's Opportunity signal, at 320, 390 and 1390 px in dark and light, with the shared layout,
  44px-target and axe WCAG 2.2 AA checks (local Chromium, PGlite world, committed Week 6 snapshot).
- `npm run check` (typecheck, 3,212 node tests, 1,004 vitest tests, production build) passed on November 11, 2026.
