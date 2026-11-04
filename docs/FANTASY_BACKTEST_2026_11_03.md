# Fantasy projection backtest — November 3, 2026

Owner: Claude · Board item 64 · Version 1 · Analysis only

This measures whether a usage-based weekly projection, with or without an opponent adjustment, is more accurate than
today's method (GTL statistical pace 1.1) and a plain season average. Nothing in production changed: no change to
`shared/fantasy-build.mjs`, the published snapshots, the Points game or any UI, and nothing was deployed. The live
method switches only on Sean's word (ask a19), in a later task.

## Verdict

**Yes, narrowly.** On the 2025 holdout, the usage method beats both baselines and every 95% interval excludes zero.
It was picked as the best new method on 2024, before 2025 was scored.

| 2025 holdout, 4,855 player-weeks | MAE (points) | usage minus baseline | 95% CI, resampling player-weeks | 95% CI, resampling players |
|---|---|---|---|---|
| usage | 4.451 | — | — | — |
| seasonAverage | 4.542 | −0.090 | [−0.125, −0.054] | [−0.130, −0.050] |
| pace11 (today) | 4.600 | −0.149 | [−0.194, −0.104] | [−0.195, −0.104] |

- **The gain is small.** About 2% of the season average's error and 3% of today's, or roughly a tenth of a point per
  player per week. Every method misses by about 4.5 Full PPR points on average; most weekly variation is not
  predictable from box scores.
- **It is not a lucky setting.** Scored on 2025 after the fact, all 64 usage grid points (MAE 4.446–4.492) beat both
  baselines. The 2024-chosen setting (4.451) is within 0.005 of the best 2025 grid point.
- **The opponent adjustment adds nothing.** usageOpp is 0.010 points worse than usage on 2025 (CI [−0.013, +0.035]) and
  also worse in-sample on 2024. Its tuned K_opp of 8 is the strongest shrinkage on the grid: the data wanted the
  factor pulled toward 1.
- **Today's pace 1.1 is less accurate than a plain season average,** in both seasons: +0.059 on 2025 (CI [+0.018,
  +0.098]) and +0.049 on 2024 (CI [+0.006, +0.088]). Putting 60% weight on the last three games adds more noise than
  signal.
- **Ranking improves modestly.** The mean within-position-week Spearman correlation on 2025 is 0.577 for usage, against
  0.565 for seasonAverage and 0.562 for pace11.
- **By position on 2025,** usage is clearly better at WR and TE. At RB it beats pace11 but not seasonAverage (CI
  [−0.106, +0.014]). At QB, nothing separates from either baseline, and usage's QB Spearman is no better.

If the a19 decision is to change the live method, this evidence supports usage without the opponent factor. It is a
modest accuracy gain, not a step change.

## Data and credit

Free, public nflverse data (D-56), from the [nflverse-data](https://github.com/nflverse/nflverse-data) releases under
[CC BY 4.0](https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md). Statistics by the nflverse project. The
release URLs and CSV parser are the ones `scripts/fantasy-sources.mjs` uses. Each download is checked against the
release's size and SHA-256 digest, then cached under `.local/fantasy-backtest/`, which is gitignored. No data file is
committed.

| File | SHA-256 of the copy used | Release updated |
|---|---|---|
| `stats_player/stats_player_week_2024.csv` | `3ddc45a84f759aa348ce465ae001752c530575455717657cdfe1f8abfcdb4759` | 2026-08-13 |
| `stats_player/stats_player_week_2025.csv` | `e5e0615b3d96a3eaebfaee91e55afb4a4e7fe0caf057454177bcd7d6ad4bcfc2` | 2026-08-13 |
| `schedules/games.csv` | `4825c6aa68699ad31a45494346d08e64a622d1f86e17398a69d9eec07476d7f0` | 2026-11-03 |

`games.csv` is a live file that nflverse keeps updating for the 2026 season. Only its 2024 and 2025 rows are used here.

Scope: regular season (`season_type` REG), weeks 1-18, positions QB, RB, WR and TE. Scoring is the Points game's
rules: Full PPR with a 4-point passing TD, computed with `scoreStats` from `shared/fantasy-rankings.mjs` on
`normalizePlayerStats` lines.

## Methods

All four are pure functions in `shared/fantasy-projections.mjs`. Each projects a player's week-w stat line from his
own appearances before week w in the same season, plus league and defense totals built only from those weeks. Each
returns null with fewer than 2 prior appearances, matching today's rule.

1. **seasonAverage:** per stat, the mean of all prior appearances. This is today's review baseline (`averageStats` in
   `shared/fantasy-review.mjs`), reproduced exactly; a test checks it against `buildFantasyReview`.
2. **pace11:** today's `estimatePace`, imported from `shared/fantasy-build.mjs`, not reimplemented. Per stat, 0.6 × the
   mean of the last 3 appearances + 0.4 × the mean of all prior appearances.
3. **usage:**
   - **Opportunities:** targets, carries and pass attempts each use a recency-weighted mean of the player's prior
     appearances, with weight 0.5^(weeks ago ÷ H).
   - **Efficiency rates:** catch rate, yards per target, yards per carry, yards per pass attempt and interception rate.
     Each uses the player's season-to-date totals, shrunk toward his position's league rate with weight
     n ÷ (n + K_eff), where n is his opportunities.
   - **TD rates:** receiving TDs per target, rushing TDs per carry and passing TDs per attempt, shrunk the same way with
     K_td.
   - **Stat line:** opportunities × shrunk rates. Fumbles lost, 2-point conversions and return TDs use the season
     average.
4. **usageOpp:**
   - **Factor:** usage × an opponent factor. The factor is the opponent's Full PPR points allowed per game to the
     player's position so far, ÷ the league's per-game mean to that position so far. It is shrunk toward 1 by
     g ÷ (g + K_opp), with g the opponent's games played, then clamped to [0.8, 1.2]. Scoring is linear, so scaling the
     whole stat line scales the points by the same factor.
   - **Opponent:** from the week-w schedule. The player's team is taken from his latest prior appearance. A bye means no
     projection.

## Evaluation design

- **Graded set:** player-weeks in weeks 3-18 where the player appeared that week (has a stat row) and all four methods
  produced a projection, so every comparison is paired on the same player-weeks.
- **Metrics:** MAE, bias (projected minus actual), share within 5 points, and Spearman rank correlation within each
  position and week, averaged over position-weeks.
- **Uncertainty:** paired MAE difference with a 95% percentile bootstrap, 2,000 resamples, seed 64. The brief's
  interval resamples player-weeks. A second interval resamples whole players, because one player's weeks are
  correlated; it is barely wider.
- **Tuning on 2024 only:** a full grid over H ∈ {2, 3, 4, 6}, K_eff ∈ {10, 25, 50, 100}, K_td ∈ {50, 100, 200, 400} and
  K_opp ∈ {2, 4, 8}, minimising 2024 MAE. usage is tuned over its 64 points and usageOpp over all 192. The lowest MAE
  wins, and ties keep the earlier grid point. The best new method is the one with the lower 2024 MAE. 2025 was never
  used to choose anything; the 2025 grid range below is reported only as a sensitivity check.
- **No lookahead:** a test poisons every week-w-and-later row and the later schedule. It requires identical
  projections, and a control requires an earlier row to change them.

## Chosen settings (tuned on 2024 only)

| Method | H (weeks) | K_eff | K_td | K_opp | 2024 MAE |
|---|---|---|---|---|---|
| usage | 4 | 25 | 50 | — | 4.537 |
| usageOpp | 3 | 25 | 100 | 8 | 4.548 |

Grid for usage: 64 points, 2024 MAE from 4.537 to 4.570. Best five:

| H | K_eff | K_td | K_opp | MAE |
|---|---|---|---|---|
| 4 | 25 | 50 | — | 4.5373 |
| 4 | 25 | 100 | — | 4.5375 |
| 3 | 25 | 50 | — | 4.5382 |
| 3 | 25 | 100 | — | 4.5384 |
| 4 | 10 | 100 | — | 4.5384 |

Grid for usageOpp: 192 points, 2024 MAE from 4.548 to 4.598. Best five:

| H | K_eff | K_td | K_opp | MAE |
|---|---|---|---|---|
| 3 | 25 | 100 | 8 | 4.5483 |
| 3 | 10 | 100 | 8 | 4.5485 |
| 4 | 10 | 100 | 8 | 4.5487 |
| 3 | 25 | 50 | 8 | 4.5489 |
| 4 | 25 | 100 | 8 | 4.5489 |

Sensitivity, not selection: every grid point scored on every season. Only the 2024 grid chose the settings above.

| Season | usage grid MAE | usageOpp grid MAE | seasonAverage MAE | pace11 MAE |
|---|---|---|---|---|
| 2024 | 4.537–4.570 | 4.548–4.598 | 4.633 | 4.682 |
| 2025 | 4.446–4.492 | 4.450–4.513 | 4.542 | 4.600 |

## 2025 holdout

Graded player-weeks: 4855 of 5332 QB/RB/WR/TE appearances in weeks 3-18. Excluded: fewerThanTwoPrior 475, actualUnscoreable 0, noScheduledOpponent 2, methodUnscoreable 0.

| Method | MAE | Bias | Within 5 | Spearman (mean of 64 position-weeks) |
|---|---|---|---|---|
| seasonAverage | 4.542 | -0.154 | 66.1% | 0.565 |
| pace11 | 4.600 | -0.058 | 65.9% | 0.562 |
| usage | 4.451 | -0.041 | 67.0% | 0.577 |
| usageOpp | 4.462 | -0.032 | 66.9% | 0.580 |

Paired MAE difference (method − baseline; negative means the method is more accurate), 95% bootstrap CI, 2000 resamples, seed 64:

| Method vs baseline | Resampling player-weeks | Resampling players (clustered) |
|---|---|---|
| pace11 vs seasonAverage | +0.059 [+0.018, +0.098] | [+0.018, +0.102] |
| usage vs seasonAverage | -0.090 [-0.125, -0.054] | [-0.130, -0.050] |
| usageOpp vs seasonAverage | -0.080 [-0.125, -0.034] | [-0.129, -0.030] |
| usage vs pace11 | -0.149 [-0.194, -0.104] | [-0.195, -0.104] |
| usageOpp vs pace11 | -0.139 [-0.189, -0.087] | [-0.190, -0.087] |
| usageOpp vs usage | +0.010 [-0.013, +0.035] | [-0.014, +0.035] |

### By position

| Position | n | Method | MAE | Bias | Within 5 | Spearman |
|---|---|---|---|---|---|---|
| QB | 508 | seasonAverage | 6.824 | +0.018 | 46.1% | 0.329 |
| QB | 508 | pace11 | 6.820 | +0.129 | 47.2% | 0.335 |
| QB | 508 | usage | 6.712 | +0.283 | 47.4% | 0.326 |
| QB | 508 | usageOpp | 6.671 | +0.262 | 45.9% | 0.341 |
| RB | 1284 | seasonAverage | 4.497 | -0.486 | 66.7% | 0.713 |
| RB | 1284 | pace11 | 4.608 | -0.280 | 66.7% | 0.708 |
| RB | 1284 | usage | 4.453 | -0.297 | 67.5% | 0.724 |
| RB | 1284 | usageOpp | 4.472 | -0.308 | 68.2% | 0.725 |
| WR | 2039 | seasonAverage | 4.393 | +0.139 | 66.8% | 0.626 |
| WR | 2039 | pace11 | 4.421 | +0.157 | 66.9% | 0.623 |
| WR | 2039 | usage | 4.295 | +0.180 | 67.9% | 0.648 |
| WR | 2039 | usageOpp | 4.297 | +0.188 | 67.6% | 0.648 |
| TE | 1024 | seasonAverage | 3.761 | -0.408 | 74.0% | 0.592 |
| TE | 1024 | pace11 | 3.848 | -0.298 | 72.3% | 0.582 |
| TE | 1024 | usage | 3.640 | -0.320 | 74.2% | 0.611 |
| TE | 1024 | usageOpp | 3.681 | -0.268 | 74.2% | 0.605 |

Paired MAE difference by position, 95% CI resampling player-weeks:

| Position | usage vs seasonAverage | usage vs pace11 | usageOpp vs seasonAverage | usageOpp vs pace11 |
|---|---|---|---|---|
| QB | -0.112 [-0.250, +0.029] | -0.108 [-0.290, +0.066] | -0.154 [-0.341, +0.056] | -0.149 [-0.376, +0.079] |
| RB | -0.044 [-0.106, +0.014] | -0.155 [-0.241, -0.069] | -0.025 [-0.109, +0.059] | -0.136 [-0.231, -0.039] |
| WR | -0.099 [-0.153, -0.041] | -0.126 [-0.194, -0.059] | -0.096 [-0.162, -0.026] | -0.123 [-0.197, -0.049] |
| TE | -0.120 [-0.188, -0.052] | -0.207 [-0.291, -0.120] | -0.080 [-0.167, +0.009] | -0.167 [-0.265, -0.070] |

### Week-by-week accuracy trend (MAE)

| Week | n | seasonAverage | pace11 | usage | usageOpp |
|---|---|---|---|---|---|
| 3 | 275 | 4.883 | 4.883 | 4.591 | 4.610 |
| 4 | 298 | 4.613 | 4.613 | 4.431 | 4.485 |
| 5 | 268 | 4.404 | 4.392 | 4.296 | 4.341 |
| 6 | 289 | 4.710 | 4.845 | 4.582 | 4.602 |
| 7 | 304 | 4.704 | 4.832 | 4.585 | 4.651 |
| 8 | 262 | 4.669 | 4.863 | 4.580 | 4.539 |
| 9 | 289 | 4.407 | 4.434 | 4.368 | 4.365 |
| 10 | 290 | 4.709 | 4.703 | 4.546 | 4.490 |
| 11 | 303 | 4.562 | 4.721 | 4.563 | 4.705 |
| 12 | 289 | 4.411 | 4.454 | 4.330 | 4.332 |
| 13 | 335 | 4.290 | 4.348 | 4.240 | 4.205 |
| 14 | 307 | 4.386 | 4.420 | 4.423 | 4.341 |
| 15 | 328 | 4.733 | 4.779 | 4.675 | 4.713 |
| 16 | 348 | 4.533 | 4.644 | 4.432 | 4.474 |
| 17 | 337 | 4.390 | 4.483 | 4.332 | 4.320 |
| 18 | 333 | 4.350 | 4.285 | 4.298 | 4.267 |

## 2024 in-sample (tuning season)

Graded player-weeks: 4732 of 5185 QB/RB/WR/TE appearances in weeks 3-18. Excluded: fewerThanTwoPrior 452, actualUnscoreable 0, noScheduledOpponent 1, methodUnscoreable 0.

| Method | MAE | Bias | Within 5 | Spearman (mean of 64 position-weeks) |
|---|---|---|---|---|
| seasonAverage | 4.633 | -0.477 | 64.8% | 0.570 |
| pace11 | 4.682 | -0.316 | 64.6% | 0.566 |
| usage | 4.537 | -0.364 | 65.9% | 0.593 |
| usageOpp | 4.548 | -0.364 | 66.0% | 0.594 |

Paired MAE difference (method − baseline; negative means the method is more accurate), 95% bootstrap CI, 2000 resamples, seed 64:

| Method vs baseline | Resampling player-weeks | Resampling players (clustered) |
|---|---|---|
| pace11 vs seasonAverage | +0.049 [+0.006, +0.088] | [+0.007, +0.090] |
| usage vs seasonAverage | -0.096 [-0.132, -0.058] | [-0.138, -0.053] |
| usageOpp vs seasonAverage | -0.085 [-0.135, -0.036] | [-0.134, -0.032] |
| usage vs pace11 | -0.144 [-0.191, -0.099] | [-0.191, -0.094] |
| usageOpp vs pace11 | -0.133 [-0.189, -0.080] | [-0.188, -0.079] |
| usageOpp vs usage | +0.011 [-0.012, +0.036] | [-0.014, +0.035] |

### By position

| Position | n | Method | MAE | Bias | Within 5 | Spearman |
|---|---|---|---|---|---|---|
| QB | 515 | seasonAverage | 6.421 | -1.394 | 47.6% | 0.406 |
| QB | 515 | pace11 | 6.423 | -0.878 | 48.5% | 0.403 |
| QB | 515 | usage | 6.153 | -1.062 | 50.7% | 0.433 |
| QB | 515 | usageOpp | 6.134 | -1.054 | 49.7% | 0.438 |
| RB | 1256 | seasonAverage | 4.591 | -0.014 | 63.6% | 0.684 |
| RB | 1256 | pace11 | 4.581 | -0.044 | 64.4% | 0.683 |
| RB | 1256 | usage | 4.498 | +0.027 | 65.8% | 0.693 |
| RB | 1256 | usageOpp | 4.465 | +0.011 | 66.7% | 0.696 |
| WR | 1983 | seasonAverage | 4.638 | -0.411 | 65.1% | 0.635 |
| WR | 1983 | pace11 | 4.729 | -0.262 | 64.4% | 0.631 |
| WR | 1983 | usage | 4.573 | -0.321 | 66.0% | 0.656 |
| WR | 1983 | usageOpp | 4.618 | -0.314 | 65.2% | 0.652 |
| TE | 978 | seasonAverage | 3.735 | -0.721 | 74.6% | 0.557 |
| TE | 978 | pace11 | 3.799 | -0.477 | 73.6% | 0.545 |
| TE | 978 | usage | 3.664 | -0.586 | 73.8% | 0.589 |
| TE | 978 | usageOpp | 3.678 | -0.584 | 75.1% | 0.590 |

Paired MAE difference by position, 95% CI resampling player-weeks:

| Position | usage vs seasonAverage | usage vs pace11 | usageOpp vs seasonAverage | usageOpp vs pace11 |
|---|---|---|---|---|
| QB | -0.268 [-0.411, -0.133] | -0.270 [-0.445, -0.099] | -0.287 [-0.487, -0.089] | -0.289 [-0.505, -0.083] |
| RB | -0.093 [-0.162, -0.028] | -0.082 [-0.169, +0.007] | -0.126 [-0.224, -0.039] | -0.115 [-0.216, -0.013] |
| WR | -0.065 [-0.127, -0.003] | -0.156 [-0.233, -0.083] | -0.020 [-0.098, +0.056] | -0.111 [-0.194, -0.031] |
| TE | -0.070 [-0.137, -0.003] | -0.134 [-0.214, -0.051] | -0.057 [-0.146, +0.030] | -0.121 [-0.214, -0.024] |

### Week-by-week accuracy trend (MAE)

| Week | n | seasonAverage | pace11 | usage | usageOpp |
|---|---|---|---|---|---|
| 3 | 254 | 5.826 | 5.826 | 5.311 | 5.250 |
| 4 | 288 | 4.457 | 4.457 | 4.385 | 4.425 |
| 5 | 255 | 5.100 | 5.203 | 4.985 | 4.887 |
| 6 | 256 | 4.967 | 5.028 | 4.732 | 4.787 |
| 7 | 302 | 4.652 | 4.716 | 4.665 | 4.724 |
| 8 | 326 | 4.553 | 4.661 | 4.512 | 4.583 |
| 9 | 305 | 4.397 | 4.513 | 4.373 | 4.315 |
| 10 | 278 | 4.333 | 4.406 | 4.281 | 4.249 |
| 11 | 290 | 4.969 | 5.045 | 4.838 | 4.796 |
| 12 | 270 | 4.340 | 4.291 | 4.252 | 4.275 |
| 13 | 331 | 4.331 | 4.315 | 4.188 | 4.184 |
| 14 | 267 | 4.452 | 4.635 | 4.509 | 4.644 |
| 15 | 329 | 4.615 | 4.579 | 4.693 | 4.773 |
| 16 | 324 | 4.222 | 4.369 | 4.101 | 4.061 |
| 17 | 337 | 4.522 | 4.456 | 4.411 | 4.414 |
| 18 | 320 | 4.710 | 4.751 | 4.600 | 4.630 |

## Limits

- **Box scores only.** The backtest has no snap counts, routes, depth charts, injuries, weather or betting totals. A
  live method could use some of these. The backtest cannot say whether they would help.
- **Players who did not appear are not graded.** A player with no nflverse stat row that week is excluded. That
  includes an active player who recorded no stat, whose zero game is also missing from his history. The graded set is
  conditioned on appearing.
- **Same-season data only.** Weeks 1-2 are never graded. Rookies and returning players are excluded until their second
  appearance, and there is no carry-over from the previous season.
- **Traded players** are looked up under their last prior team. When that team was on bye, the player-week had no
  scheduled opponent and was dropped: 1 player-week in 2024 and 2 in 2025.
- **Two seasons.** There is one tuning season and one holdout. Both bootstrap intervals ignore shocks shared by every
  player in a week, such as a weather-heavy week, so they may still be slightly narrow.
- **Grid edges.** usage chose K_td = 50, the smallest value tried, and usageOpp chose K_opp = 8, the largest. The grid
  was fixed in advance and not widened. Across the whole grid, MAE moves by only 0.03-0.05 points.
- **Weeks 3-4.** seasonAverage and pace11 are identical by construction, because with at most 3 prior appearances,
  "the last three" means all of them.
- **Fumble accounting.** This is today's scoring. `normalizePlayerStats` counts `fumbles_lost_total`. In 25 offensive
  rows in 2024 and 28 in 2025 (about 0.5%), that differs from nflverse's own `fantasy_points_ppr` by exactly 2 points,
  where the total and the sum of sack, rushing and receiving fumbles lost disagree. The script reports this check. All
  methods share it.
- **Bias.** All four methods under-project on average in 2024 (−0.32 to −0.48 points) and less in 2025 (−0.03 to
  −0.15). The bias is shared, not specific to one method.

## Reproduce

```sh
node scripts/fantasy-backtest.mjs --seasons 2024,2025
node --test --test-reporter=tap tests/fantasy-projections.test.mjs tests/fantasy-build.test.mjs tests/fantasy-review.test.mjs
```

- **What the script writes:** `.local/fantasy-backtest/results.json` (every graded row, all grid results and both
  intervals) and `.local/fantasy-backtest/tables.md`, which holds the tables above.
- **Determinism:** two runs produced identical tables. A run takes about 10 seconds once the data is cached.
- **Downloads:** a cached file is reused only when its SHA-256 matches the cache manifest; otherwise it is downloaded
  again and checked against the release's digest.

---
Sources: nflverse-data releases `stats_player` and `schedules`, CC BY 4.0, retrieved November 3, 2026 (UTC). Report
dated November 3, 2026. Board item 64.
