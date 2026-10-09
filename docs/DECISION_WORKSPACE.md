# Guess The Line — weekly decision workspace

> **Local implementation addendum — October 8, 2026:** Owner-private personal
> forecasts and the decision display are now integrated locally and independently
> gated by submitted market. Current eligible model forecasts remain unavailable;
> probability and expected value remain unset. The plan below is earlier design
> context. [D-16](SUBMISSION_TIME_SCORING.md) governs editable predeadline guesses
> and their saved scoring references. See the [data worker report](../planning/worker-reports/data-scoring-and-models.json)
> and [tracker](../planning/project-tracker.json); no deployment is implied.

Owner: Sean Balsiger · October 8, 2026 · Implementation plan, not a connected model feed

The user wants sourced model forecasts, original Guess the Spread/Total numbers
and their largest differences to inform weekly spread and Over/Under selections.
This extends the recorded comparison objective; it does not change prediction
locks, the free-only budget or the independent Spread/Total reveal rules.

## Three values, two comparison signals

For each revealed market, show **your original guess · market reference · model
forecast**, with source and time. Sort by model discrepancy or guess discrepancy,
and filter agreement, disagreement and missing inputs. Expand a matchup for the
recorded line chart, forecast provenance, input dependence and selection review.

The original guess predicts a sportsbook benchmark. A model forecast predicts a
game outcome. Keep both visible without averaging them into an outcome forecast.
A separate optional personal fair forecast remains PRED-01. Points of disagreement
are not a calibrated probability, expected value or proof of a profitable bet.

| Market | Model comparison | Original-guess comparison |
|---|---|---|
| Spread, all expressed as signed home-team lines | Market minus model fair line. Positive points toward home; negative toward away. A projected home winning margin converts to a negative fair home spread. | Market minus original guess. Positive means the user guessed a stronger home favorite than the observed market. |
| Total | Model combined-points forecast minus market. Positive points toward Over; negative toward Under. | Original guessed sportsbook total minus market. Positive means the guessed total was higher. |

Only two nonzero signs can agree or disagree. Zero, missing and stale values
remain explicit. A model that incorporates betting markets is not independent
evidence merely because another publisher created it.

## Source and selection requirements

1. Establish free display/retention permission for each model source, or obtain
   the user's choice to develop a separately labeled GTL model. The latter needs
   licensed inputs, point-in-time backtests and separate margin/total evaluation.
2. Preserve provider, model version, stable event identity, market, forecast time,
   ingestion time, input-market dependence and validation status. Append history.
3. Keep competition accuracy tied to the competition's benchmark. Decision
   research uses its own latest permitted market reference. Label both explicitly;
   after kickoff freeze they may legitimately differ.
4. A selection review needs an actual named-book side, line, price and quote time.
   The current derived median has no tradable price and cannot establish that a
   sportsbook offers a bet. Twelve-hour observations are dated research references.
5. Preserve the existing review/confirmation step and immutable account/week
   Challenge selection reused across groups. No automatic wager execution.
6. Filter models, summaries, exports and notices by submitted market. Predicted
   home/away score pairs reveal both spread and total and require both gates.

## Current evidence and unresolved work

The supplied October 8 21:45:42 UTC own-data audit contains fifteen submitted
spread guesses and fifteen submitted total guesses. This establishes that export's
state, not a new independent live read or another player's Total submission.
The exported file and all predictions are preserved unchanged.

The quote provider is connected; no cleared free outside model forecast feed is
connected. Existing research is in `ODDS_PROVIDER_EVALUATION.md`. D-11 now authorizes building and validating a clearly labeled GTL model alongside permitted outside sources. Historical prototype work is tracked in `MODEL_VALIDATION.md`; current-season forecasts remain subject to licensed current inputs and validation. No unauthorized publisher import or unsupported probability/EV claim is authorized. Phone push, email and SMS delivery
are separate from dashboard motion and in-page notices.

Live readback now confirms both Sean and Steven submitted all fifteen Spread and
Total guesses. The deployed Total dashboard displays provisional accuracy of
76/150 and 69/150 respectively against the saved complete collection; the Spread
view remains 95/150 and 93/150. These are dated comparison results, not official
frozen scores or forecasts. All twelve ballot/audit/provenance hashes matched
before and after this release.

The first [model validation](MODEL_VALIDATION.md) is complete: 1,070 held-out
games, separate margin/total regressions, and seven integrity tests. Neither
regression beats the rolling-score baseline on mean absolute error. The permitted
source ends February 2021. Current-week forecasts deliberately remain unavailable
until current inputs and stronger validation are established; model, probability,
expert and positive-EV callouts must not be filled with illustrative values.
