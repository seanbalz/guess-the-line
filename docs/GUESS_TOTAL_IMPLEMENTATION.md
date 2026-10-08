# Guess the Total — implementation handoff



## Guess the Total (Over/Under) — separate Guess the Line competition (2026-10-08)
- Add a **third independent mode** named `guess_total` / **Guess the Total**, distinct from `guess_spread` and `betting_challenge`. Each player predicts the **combined points scored by both teams** in every NFL game, without seeing the current market total. Accept nonnegative numbers in 0.5-point increments (optionally whole numbers); no over/under side is chosen during the prediction stage.
- Default **10 accuracy points** for an exact market total; subtract **1 point per 0.5 point of absolute error**, floor at 0: `max(0, 10 - 2 * abs(predicted_total - consensus_total))`. This is the recommended parity rule, pending league-configurable adjustments. A 15-game slate has a separate maximum of 150 points for Guess the Total; do **not** combine with spread scores unless a separate combined championship is explicitly enabled.
- Track **separate** per-matchup closest-to-market-total W-L-T for Duel, Triple Threat and Free-for-All; compare absolute errors, including ties, independently from spread W-L-T.
- Apply the same hidden-benchmark, full-ballot reveal, editable-until-submission-deadline, source/time audit, provisional six-hour snapshots, and **actual Thursday Night Football kickoff** benchmark freeze as Guess the Spread. Record the last valid **pre-kickoff** total quote; never use a post-kickoff number to rewrite the benchmark.
- Preserve prediction revisions and avoid leaking current market totals to players who have not completed their total ballot. Do not infer totals from spreads. Independently source consensus totals and independent model projected totals.
- Schema/API fields: `market_type: "spread" | "total"`, `predicted_total`, `consensus_total`, `model_total`, `source_book`, `quoted_at`, `snapshot_id`, `score_status`. A player may submit both a spread prediction and a total prediction for the **same** game; these are two different Guess competitions.
- Betting Challenge remains unchanged: default one required **spread OR over/under bet per game**, graded W-L-P from actual outcomes at the **quoted selected line**. Guess the Total prediction is not itself a wager.
- Historic Week 5: 15 spread predictions exist; **no Guess the Total predictions are recorded yet**. Display `Not submitted` rather than fabricating totals or counting them as zeros before deadline adjudication.


## Agent acceptance tests
1. A player can submit and revise a total independently of a spread on the same NFL game.
2. Total accuracy at exact, ±0.5, ±1, ±5, and greater than 5 points is 10, 9, 8, 0, 0.
3. Opponents cannot see private predictions before permitted reveal; league RLS prevents cross-league access.
4. Two-player and three-player closest-total W-L-T tests include exact ties.
5. A 15-game total ballot reports out of 150, separately from spread out of 150.
6. Snapshot changes recalculate provisional total score; freeze uses last valid quote before actual Thursday kickoff; stale/missing quotes do not create fabricated scores.
7. Betting Challenge remains one ATS or O/U pick per game by default and is not auto-submitted from total guesses.
8. Existing Week 5 spread picks remain byte-for-byte unchanged and total guesses start unsubmitted.

## UI
Separate tabs: Guess Spread | Guess Total | Betting Challenge. Total matchup input labelled 'Predict combined points'. Separate points and W-L-T columns. Historic chart with market totals vs personal guesses and score changes, gated by permissions.

## Dependencies
TheRundown free API is a candidate for spreads and totals, subject to commercial/public-display rights. Free alternatives must be evaluated and verified; no invented or unlicensed lines.
