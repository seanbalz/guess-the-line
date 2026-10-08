# Rules — Guess the Line
## Classic
10 points exact spread; subtract 1 point per half-point off, floor 0. Weekly highest wins; tie breakers cumulative error then exact matches.
## Other proposed modes
Showdown: one or more spread/total selections per game, win +1, push 0, loss -1.
Betting Challenge (record-based): choose spreads, totals (over/under), or moneylines using actual recorded lines and odds. Each settled selection counts as a win, loss, or push; rank by win percentage with number of wins as a tiebreaker. No bankroll, stake, or profit/loss scoring.
Gauntlet: 3 lives, lose one per losing spread pick; correct picks tiebreak.
Decathlon: combined rank points across Classic, Showdown, Bankroll.
## Competition formats
Duel 2; Triple Threat 3; Free-for-All 4+. Formats and scoring modes are independent.
## Shared rules
Thursday noon Pacific verified frozen benchmark. Picks editable once per pick before Thursday kickoff; no changes afterward. Players can see opponents' picks after completing their own ballot, but not benchmark or score until reveal. Thursday kickoff commissioner summary. Fifteen-minute extension-request grace period; default zero only after manual review; player vote default and commissioner override. Notify slate availability and incomplete players two hours before kickoff. 1.5 and 3 point movement alerts by opt-in push/SMS/email.
These rules are product decisions; implementations must be tested before claiming live functionality.
## Clarified separate games (October 8, 2026)
Guess the Line: players predict hidden benchmark spreads; predictions may be revised until the established submission deadline. No one-edit limit applies to this mode. Score prediction accuracy against the frozen benchmark.
Betting Challenge: distinct virtual betting game running throughout the week; select actual quoted spreads, moneylines, and totals (over/under), store selected line, odds, timestamp and stake; grade results and track W-L-push and virtual P/L. Betting selections do not modify Guess the Line predictions. Rules for bet locking, bankroll, and stakes require separate confirmation.

## Betting Challenge record-only clarification (2026-10-08)
This is a record-based picks contest, not a virtual bankroll game. Record each selected market, side, line, odds and timestamp; grade W-L-P based on final game outcomes. Pushes excluded from win percentage. No profit/loss or stake requirement. Guess the Line remains a separate game.

## Record-based Betting Challenge pick limits
Default: one selection per NFL game per player, choosing either a point spread or a game total (over/under). Each league may configure a different per-game selection limit. The default mode does not include moneyline picks. Grade selections by W-L-P and win percentage, not profit.

## Guess the Line → Betting Challenge edge analysis
After Guess the Line predictions are recorded, compare each predicted spread (signed from the home team's perspective) with timestamped sportsbook consensus and a named, independently sourced professional model projection. Display: matchup, user's predicted spread, consensus, model spread, user's absolute discrepancy, model discrepancy, model/user directional agreement, and candidate side. Sort biggest discrepancies and closest guesses. Label disagreements as potential edges, not proven expected value; only estimate positive EV when calibrated probabilities and offered prices exist. Preserve original guesses and timestamps. For totals, use a separate total-points projection rather than inferring from spreads. Record actual lines and odds at Betting Challenge selection time; settle one required spread OR total pick per NFL game by default, W-L-P. Do not fabricate consensus, model output, or live odds; mark unavailable until verified. Do not reveal market benchmarks before the Guess the Line submission stage is complete.

## Classic competitive head-to-head / three-player standings
Maintain TWO parallel weekly and season standings for each league: (1) accuracy points, 10 for an exact spread and minus 1 per half point of absolute error, floor zero; (2) closest-to-line head-to-head record. For every NFL matchup, compare absolute signed-spread errors of all participating players against the same frozen official benchmark. The player(s) with smallest error win that matchup; a sole winner receives one matchup win, others one matchup loss. Tied smallest errors are recorded as ties for those players (and losses for players farther away). For a two-player exact tie both record a tie. Track W-L-T and closest-pick wins independently of accuracy points; never double-count wins from a tie. League standings display both, plus exact guesses and cumulative error as tiebreak context. Do not compute comparative results until all relevant player guesses and the benchmark are available. This applies to Duel, Triple Threat and Free-for-All.
