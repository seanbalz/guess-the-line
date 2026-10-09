# Guess The Line — model validation

Owner: Sean Balsiger · Version 1 · October 8, 2026.

**Working historical prototype; not ready for weekly betting suggestions.**
Sean approved building a GTL model alongside outside forecasts whose reuse is
permitted. A deterministic score-based GTL model now runs locally and has been
evaluated on 1,070 held-out games. It did not beat a simpler rolling-score
baseline on mean absolute error. No current Week 5 projection, model API,
probability, expected value or automatic selection has been published.

## Source rights and actual coverage

The input is the publisher's [FiveThirtyEight NFL game repository](https://github.com/fivethirtyeight/nfl-elo-game),
which provides historical scores and explicitly invites alternative forecasting
evaluation. Its [MIT license](https://github.com/fivethirtyeight/nfl-elo-game/blob/fbec1afa38ece5befe24fb21be8ddba8eb160fe6/LICENSE)
is retained with attribution in `model/NOTICE.txt`. This uses that repository's
grant, not a blanket license inferred from another website or package.

- Pinned commit: `fbec1afa38ece5befe24fb21be8ddba8eb160fe6`.
- CSV SHA-256: `af16cf3c5848393057fad07feea278f0a85ab7b57ddbfe42ed96b5c80e7d519d`.
- 1,238,252 bytes; 16,810 completed games; September 26, 1920–February 7, 2021.
- Only dates, season, teams, neutral-site status and final scores are consumed.
  FiveThirtyEight's Elo ratings and probabilities are excluded. The new model
  is GTL research and does not imply publisher endorsement.
- The formerly linked `projects.fivethirtyeight.com/nfl-api/nfl_elo.csv` returned
  HTML during this review. The pipeline uses the pinned publisher GitHub CSV
  and rejects HTML, changed hashes, duplicate games and missing final scores.

Current inputs remain incomplete:

| Source | Verified scope | Remaining work |
|---|---|---|
| [FTN charting via nflverse](https://nflreadr.nflverse.com/reference/load_ftn_charting.html) | Explicit owner-authorized CC-BY-SA 4.0 subset, attribution to FTN via nflverse; available from 2022 and charted after games. | Features alone do not establish complete outcome labels, historical publication times or current coverage. Not ingested into this prototype. |
| [nflverse/nfldata](https://github.com/nflverse/nfldata) | Game/schedule source identified. No root license found in the reviewed repository listing. | Resolve the applicable dataset permission; [nflreadr terms](https://nflreadr.nflverse.com/) explicitly reserve upstream owners' conditions. Another repo's CC license is not transferred to this file. Not ingested. |
| [The Odds API scores](https://the-odds-api.com/liveapi/guides/v4/#get-scores) | Documented recent completed scores, same event IDs as odds; completed lookback up to three days, costing two credits. [Provider terms](https://the-odds-api.com/terms-and-conditions.html) allow retention, derived analytics and model training. | A prospective final-score ledger can use the existing provider after implementation and quota review. This endpoint cannot fill the missing 2021–2026 history. No key read or quota spent by this prototype. |
| [nfelo](https://github.com/greerreNFL/nfelo) and other outside forecasts | Candidate sources identified in the provider evaluation. | Free multiuser display/storage permission and separate total projections are not established. No copied forecasts or provider contact. |

## Method and leakage controls

The model predicts **actual home winning margin** and **actual combined points**.
It does not predict the sportsbook benchmark used to score Guess the Line.
The signed home-spread representation is the negative predicted home margin;
that conversion alone does not establish a calibrated fair betting line.

Features use exponentially weighted points scored/allowed, their matchup
difference and total, prior league scoring, home/neutral location and rest days.
The fixed update weight is 0.12; offseason ratings retain 70% of their deviation
from league scoring. Each target has a separate ridge regression with penalty
10. Features are standardized using training rows only. These choices were
fixed before the first evaluation; no tuning followed inspection of held-out
results. No injuries, quarterbacks, weather, play efficiency or opponent-strength
adjustment are included.

Every game's feature row is created before updating from that date's results.
The entire same-date batch is predicted before any of its scores are consumed;
reordering input rows cannot expose a result earlier. Coefficients are fixed
after training. Rolling state then updates chronologically with earlier dates,
including earlier held-out games, as a predeclared online update.

| Stage | Seasons | Games | Use |
|---|---|---:|---|
| Warm-up | 1995–1999 | 1,263 | Initialize rolling team features |
| Training | 2000–2013 | 3,722 | Fit coefficients and scaling |
| Calibration | 2014–2016 | 801 | Set residual interval bounds and reliability-bin cutoffs |
| Held-out evaluation | 2017–2020 | 1,070 | Measure performance without refitting or tuning |

**Publication-time limitation:** the source contains game dates, not original
score-availability timestamps or revision vintages. The test assumes completed
scores from an earlier date are available the next day. Chronological leakage
checks passed; a fully reconstructed historical feed with original publication
times has not been established. No 2026 values are invented or inferred.

## Measured results

Mean absolute error is in points; lower is better. All methods use the same
held-out games. The constant baseline uses the training-set mean. The rolling
baseline uses prior team points scored/allowed plus a fixed 2.5 home advantage
for margin; it uses no fitted regression.

| Target | GTL regression MAE | Constant baseline MAE | Rolling baseline MAE | GTL RMSE | GTL mean prediction minus actual |
|---|---:|---:|---:|---:|---:|
| Home margin | 10.426 | 11.193 | **10.423** | 13.473 | +2.068 |
| Combined points | 11.122 | 11.482 | **11.097** | 14.151 | −0.897 |

The regression improves over a constant prediction but offers **no MAE
improvement over the rolling baseline**. In 2019 and 2020 it overpredicts home
margin by about 3.17 and 3.39 points respectively, indicating material drift.
Do not describe this as a validated betting advantage.

The middle 80% of calibration residuals defines a research prediction interval.
Held-out coverage was **79.25% for margin** and **77.10% for totals**, with widths
of about **33.56** and **33.50 points**. The JSON report also includes five
prediction-reliability bins with predicted versus observed means. These are
outcome-error checks, not cover probability or Over/Under calibration. No Brier
score, ROI or EV is reported because there are no calibrated side probabilities
or historical offered prices in this input.

## Reproduction and exit conditions

Run the commands in `model/README.md`. Seven model tests passed, including
future-result and same-day leakage checks, restricted input columns, duplicate
and malformed data rejection, source-hash enforcement, deterministic repeated
evaluation, and current-data abstention. Raw data and individual retrospective
predictions stay in `.local/model-data/`; no private picks were read.

The current readiness check returns `blocked` for October 8, 2026, with null
spread/total/probability/EV values. Its last source game is February 7, 2021.
Production integration must first satisfy these concrete gates:

1. Obtain licensed recent historical and current outcomes, including a complete
   canonical ledger for every team used; retain observed/available-at timestamps.
2. Improve and reassess the fixed baseline on later untouched seasons, including
   comparison with timestamped market lines. Once an evaluation set is inspected,
   treat it as development evidence for subsequent versions.
3. Validate separate spread and total forecast uncertainty and, before claiming
   betting value, calibrated cover/Over probabilities at actual quoted lines and
   prices with pushes handled explicitly.
4. Add versioned server projection storage and adapters for permitted outside
   forecasts; retain whether each model uses market inputs. No combining a
   sportsbook-number guess with an outcome forecast as if they were equivalent.
5. Apply each player's independent submission gates to every projection,
   summary, export and notification. A home/away score pair reveals both markets.
   Preserve immutable ballots and reuse reviewed Challenge selections everywhere.
