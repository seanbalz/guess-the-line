# Current competition rules — reconciled October 8, 2026

This summary governs confirmed product rules. D-16 now supersedes D-02's permanent
submission lock and the common-reference scoring requirement for Spread and Total.
D-18 establishes a separate virtual units game; its remaining mechanics are open.
D-19 adds [social Bet Tracker](SOCIAL_BET_TRACKER.md): deliberately shared singles
and parlays appear in the owner's Unit Betting week, count by default, and support
owner exclusions, following, reviewed tails, filters and ROI/history comparisons.
Its audience is all signed-in players; existing private entries remain private.
Detailed D-05/D-06/D-08/D-10 policies retain their exact scope. Sections marked as
history preserve superseded proposals; they are not authorization to change rules.
Implementation, local verification and deployment are recorded separately in
`planning/project-tracker.json` and `docs/CLOUD_SETUP.md`.

| Topic | Current rule | Superseded or unresolved |
| --- | --- | --- |
| Weekly identity | One Spread ballot, one Total ballot and one Challenge selection per NFL matchup per account/week, reused in all groups (D-05/D-06). | Group-specific copies are superseded. Membership and standings remain private to each group. |
| Drafts and submission | Full-ballot submission reveals that market; edits before the configured deadline replace the changed guess's reference at save time (D-16). | D-02's permanent submission lock is superseded for Spread/Total. Initial submission must still be complete. |
| Analysis access | Submit Spread or Total separately to reveal that market's available analysis and submitted opponents. | Submitting one market cannot unlock the other or cross-market model/notification data. |
| Accuracy and records | Ten points exact, minus one per half-point error, floor zero, against each guess's saved submission/edit-time reference (D-16); separate closest-pick W-L-T compares individual absolute errors. Missing references and unsubmitted guesses are unscored. | A common later quote must not change anchored points or manufacture a missing historical reference. |
| Current consensus | Show the latest collected Spread/Total consensus separately from saved scoring references; retain source/time/stale labels. | Current consensus is informational and does not overwrite D-16 references. Twelve-hour collection is not continuous live pricing. |
| Fresh submission and source detail | New submissions and changed submitted guesses require fresh qualifying references. Reuse eligible cached quotes or attempt one shared, quota-limited refresh; reject without changing the ballot or reveal state if evidence is still unavailable (D-17). Show saved and latest book-level prices, observation/collection times, exclusions and the three-book median. | Historical missing references remain unscored. Caesars and Action Network are unavailable under current access; neither contributes fabricated data. Existing free collection limits remain. |
| Historical official freeze | Preserve existing actual-kickoff evidence and frozen records immutably. | The earlier common kickoff-reference scoring policy is historical under D-16; do not replace individual references with it. |
| Week 5 official waiver | Only Sean & Steven Duel, 2026 Week 5 Spread: DraftKings/FanDuel/BetMGM median can omit Action cross-check (D-09). | Other groups, weeks and Total do not inherit the waiver. Official Total policy remains unresolved. |
| Challenge | Record-only W-L-P; one immutable spread OR total per matchup; preserve side, actual recorded line/odds/source/times (D-06). | Default moneyline, bankroll, profit scoring and group-specific variants are superseded. |
| Virtual units game | D-18 adds a separate play-money spread/total game under Picks: $100 per unit, half-unit quick stakes from 0.5 through 3, its own W-L-P, net units and ROI. There is no starting bankroll or bankroll cap. Each matchup permits at most one spread pick and one total pick. First placement and edits are allowed until that game's kickoff; the earlier one-hour edit cutoff is superseded, and revision history is preserved. A same-day postponement carries saved picks and terms to the revised kickoff. A move to another day voids old picks, returns their virtual stakes, permits fresh picks and notifies affected players in-app, with opt-in push and email when connected. A possible cancellation or no contest leaves picks pending until a permitted official source verifies it; then void affected picks, return virtual stakes, preserve original pick/unit qualification credit and notify affected players through the agreed channels. Weekly qualification requires at least three placed picks **or** at least 3 units staked that week. A voided pick keeps its original pick and unit credit toward that threshold if not replaced, without qualifying the entire week by itself. A replacement in the same week for the same matchup and market counts as one pick at the replacement's unit stake, even when that stake is lower; the returned original stake is excluded from settled ROI. An unqualified week is excluded from weekly standings, while its picks remain in personal overall record and ROI. Simple side/unit buttons choose the most favorable point line from the most recently accessible named-book quotes, then the better odds among equal lines; show the book and quote age, with consensus separately. Newer saved quotes update the offered buttons, while placed picks retain their saved line and odds unless explicitly edited before kickoff. There is no quote-age cutoff for this virtual game: a retained named-book quote remains usable before kickoff during an app data outage or when a successful refresh omits that book's market; newer saved quotes from other books still compete for the best line. Show source, time, age and exact saved terms; do not call an aged quote a current executable offer. If a matchup's spread or total has no saved named-book quote ever, disable only that market's virtual-pick button until a genuine quote is saved; other markets stay open, and consensus is never substituted for book terms. Net units use saved American odds; ROI is net units over units risked on settled picks. Only a verified automatic final-score feed may settle virtual picks. | A permitted results feed and external notification delivery are not connected; corrected finals, cancellation evidence and the schedule timezone convention still need resolution. This does not add stakes or ROI to record-only Challenge. |
| Solo/journal/Best Bets | Separate optional personal forecasts and private journal/ROI are requested; Best Bets is a separate confidence contest (D-01/D-15). | Journal monetary conventions, Best Bets numerical rules, settlement and sharing require their stated decisions; they do not change Challenge or the D-18 game. |
| Exceptions | Case-by-case requests, player voting and commissioner review with audit. | Do not invent forfeits, zero scores, actual starts, approvals or blanket extensions. |
| Sources and schedule | Free sources with demonstrated access/reuse; twelve-hour market collection for the validated current slate (D-07/D-10). | No paid feeds, fabricated forecasts, silently generated future weeks or inferred ticket counts/sharp action. |
| Notifications and identity | Saved in-page notices and selected Yardline G/Field monogram are approved (D-12/D-14). | External delivery/consent and remaining brand categories are not established by those choices. |

D-16 is confirmed; [submission-time scoring](SUBMISSION_TIME_SCORING.md) records
its implementation and delivery state. Global leaderboard audience/eligibility,
historical official Total policy and detailed Best Bets rules remain separate.
This decision does not retroactively modify historical source files or invent
references for old submitted records.

Owner: Sean Balsiger; reconciliation: Codex, GOV-03, October 8, 2026.

## Historical common-reference Total analysis — D-13 (superseded for scoring by D-16)
After a player's Total ballot is submitted, the dashboard can show that market's
guesses, provisional accuracy points and closest-pick records against one complete
recorded three-book collection. All displayed players use the same reference;
unsubmitted opponents remain hidden. Missing references stay unscored, and source
age is explicit. Partial newer collections do not silently replace only some of
the games in a comparison.

This analysis does not apply the Spread-only Week 5 waiver to Total, establish an
official Total benchmark, freeze results, or rewrite any submitted guesses. An
official Total policy and freeze remain separate unresolved work. Challenge
records and outcome-model forecasts are separate from guessing accuracy.

## Twelve-hour market collection — D-10 (October 8, 2026)
The user requested automatic collection every 12 hours. This supersedes the
manual-only collection decision, while retaining the free-only budget, shared
four-attempt daily limit, 15-minute cooldown and 50-credit reserve. The hosted job
collects permitted pregame quotes for the verified current slate and skips games
that have already started. Retain earlier observations and label their age.
Do not silently create a future week's schedule or reset the measured quota.

The cadence does not relax the five-minute freshness gate for official kickoff
freezing. A twelve-hour snapshot is a dated reference, not a continuously current
betting line. Scheduled analysis updates never rewrite a frozen benchmark or a
submitted prediction. Visual summaries and expanded views use the same separate
spread/total reveal gates and the same source evidence.

## Historical Week 5 common-reference scoring policy — D-09 (preserve evidence)
Sean approved the DraftKings / FanDuel / BetMGM median for the **Sean & Steven
Duel, 2026 Week 5, Guess the Spread only**. This waives only the Action Network
cross-check for that competition. Other groups, weeks, Total and Challenge do
not inherit the waiver; the general verification requirements still apply.

- Use one complete snapshot covering all 15 canonical matchups, with exactly one
  valid quote from each approved book. Preserve signed home spreads, paired
  outcomes, exact event identities and kickoff times. Provider market-observation
  timestamps must be within five minutes of collection; at least 85% of the
  three quotes must be within five points of their median. With three books,
  all three must pass. Provider observation time is not a sportsbook-issued time.
- Before freezing, show provisional accuracy points and closest-pick W-L-T from
  the latest qualifying complete snapshot, including older retained snapshots
  when a newer collection is incomplete. Label a stale reference explicitly.
  All players use the same benchmark; incomplete opponents remain unscored and
  comparative W-L-T waits for every full ballot. Each viewer must first submit
  their spread ballot.
- Freezing is manual and requires the commissioner's confirmed actual start
  time and an HTTPS evidence source. The time cannot be in the future, earlier
  than 30 minutes before the scheduled first kickoff, or on a different Pacific
  date. A reschedule outside this window requires review; scheduled time alone
  does not establish actual kickoff.
- Freeze the latest qualifying complete snapshot whose collection and every
  source observation occurred strictly before that actual start, with all
  observations no more than five minutes old at kickoff. If none exists, leave
  the benchmark unavailable for freezing. The stored result and kickoff evidence
  are immutable; only an identical request may be replayed.
- Preserve original guesses, submission locks, practice provenance, eligibility
  rulings and archived scores. This policy does not adjudicate missed deadlines,
  create forfeits, alter Challenge selections, or enable automatic polling.
  Manual collection remains limited to four attempts per UTC day, at least
  15 minutes apart, with a 50-credit reserve.

## Week 5 commissioner ruling — D-08 (October 8, 2026)
Sean explicitly ruled that both his and Steven's submitted 2026 Week 5 spread
predictions count as a real competition, accepting Steven's prior line exposure.
The Sean & Steven Duel is no longer a practice game. This supersedes its earlier
practice designation. A separate immutable ruling makes both weekly spread
ballots eligible in nonpractice groups; original practice provenance, numbers and
submission timestamps stay intact. The original permanent lock was subsequently
superseded by D-16's audited pre-deadline edits. This does not claim blind
play, extend an exception to Total or Challenge, or verify the scoring benchmark.

## Current weekly identity and reuse policy — D-05/D-06 (October 8, 2026)
- Each authenticated player has one spread ballot and one total ballot per season/week, shared across all groups, Duels and matchups. Creating or joining a group reuses the same draft, submitted values and saved scoring references; D-16 edits update the same weekly ballot before the existing deadline.
- Betting Challenge also uses one weekly set of selections: one immutable spread OR total per NFL matchup, with the same side, quote, odds and timestamps everywhere. Group-specific pick variants are superseded.
- Group membership controls access to that group’s roster and comparative standings. Reusing your own picks never reveals unrelated groups or players.
- Preserve original values, imported timestamps and audit history. Conflicting historical versions require explicit reconciliation; never silently choose or rewrite a submission.
- Practice-origin selections retain their provenance across groups; reuse does not establish blind official eligibility.

## Earlier submission and analysis policy — D-02 (October 8, 2026)
D-16 supersedes the permanent scored-guess lock below. Independent full-ballot
reveal, truthful source evidence and separate personal forecasts still apply.

- Spread and total are independent ballots. A draft can change until it is submitted or the configured deadline passes.
- Full-ballot submission permanently locks that mode’s scored guesses and immediately opens its analysis. No scored revisions after market/model exposure, including practice games.
- Review all entries before final submission; cancelling the review preserves the draft. Already-submitted data and historical audit entries stay intact; no retroactive first-submission or reveal timestamps are invented.
- Reveal only the submitted market’s available quotes, submitted opponents and analysis. Submitting spread does not unlock total quotes, forecasts, public splits or sharp signals, and vice versa. Cross-market outputs that would reveal an unsubmitted total/spread stay hidden.
- Requested analysis includes the original guess, named market reference, independent model, public ticket share, public money/handle share, provider betting volume (reported absolute ticket counts and, for totals, Over/Under ticket percentages) and separately labeled sharp-action evidence. Display source, covered books/sample, timestamp and unavailable/stale status. No fabricated zero or connected status.
- A guess of the sportsbook benchmark is not a calibrated outcome forecast. Its point discrepancy does not establish cover probability or positive expected value. Separate personal forecasts remain future work, with their own editable history and no effect on competition scoring.
- Submission lock is separate from official benchmark freezing at actual Thursday kickoff. No live collector or official benchmark is implied by the reveal interface.

## Historical rule evolution — superseded where inconsistent with the summary above

The following original notes are retained for audit. Their noon freeze, editable-after-submission, bankroll, moneyline and per-group variants are superseded as mapped above. Consistent scoring descriptions remain explanatory; newer numbered policies control.

### Classic
10 points exact spread; subtract 1 point per half-point off, floor 0. Weekly highest wins; tie breakers cumulative error then exact matches.
## Other proposed modes
Showdown: one or more spread/total selections per game, win +1, push 0, loss -1.
Betting Challenge (record-based): choose spreads, totals (over/under), or moneylines using actual recorded lines and odds. Each settled selection counts as a win, loss, or push; rank by win percentage with number of wins as a tiebreaker. No bankroll, stake, or profit/loss scoring.
Gauntlet: 3 lives, lose one per losing spread pick; correct picks tiebreak.
Decathlon: combined rank points across Classic, Showdown, Bankroll.
## Competition formats
Duel 2; Triple Threat 3; Free-for-All 4+. Formats and scoring modes are independent.
## Shared rules
Official scoring benchmark freezes at actual Thursday Night Football kickoff Pacific; pre-kickoff score is provisional. Picks editable once per pick before Thursday kickoff; no changes afterward. Players can see opponents' picks after completing their own ballot, but not benchmark or score until reveal. Thursday kickoff commissioner summary. Fifteen-minute extension-request grace period; default zero only after manual review; player vote default and commissioner override. Notify slate availability and incomplete players two hours before kickoff. 1.5 and 3 point movement alerts by opt-in push/SMS/email.
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

## Live provisional score dashboard and kickoff freeze
After each player submits predictions, display an accessible running provisional score (total and per-game accuracy points) against the latest timestamped verified multi-book consensus snapshot. On each subsequent line update, recalculate and persist the provisional total, per-game changes, source lines, and timestamps; show a time-series chart, game-level movement and leaderboard. Label provisional scores clearly. Freeze the official scoring benchmark at the actual Thursday Night Football kickoff (America/Los_Angeles), not at Thursday noon; retain the final verified pre-kickoff snapshot as immutable scoring benchmark and mark the score locked. Continue to retain historical snapshots for audit. If odds are unavailable or polling is not connected, display last verified timestamp and stale/unavailable state rather than inventing live updates. All players use the same snapshot for fair scoring. Prediction submission/edit deadlines are separate from benchmark freeze and must be configured explicitly.


## Guess the Total (Over/Under) — separate Guess the Line competition (2026-10-08)
- Add a **third independent mode** named `guess_total` / **Guess the Total**, distinct from `guess_spread` and `betting_challenge`. Each player predicts the **combined points scored by both teams** in every NFL game, without seeing the current market total. Accept nonnegative numbers in 0.5-point increments (optionally whole numbers); no over/under side is chosen during the prediction stage.
- Default **10 accuracy points** for an exact market total; subtract **1 point per 0.5 point of absolute error**, floor at 0: `max(0, 10 - 2 * abs(predicted_total - consensus_total))`. This is the recommended parity rule, pending league-configurable adjustments. A 15-game slate has a separate maximum of 150 points for Guess the Total; do **not** combine with spread scores unless a separate combined championship is explicitly enabled.
- Track **separate** per-matchup closest-to-market-total W-L-T for Duel, Triple Threat and Free-for-All; compare absolute errors, including ties, independently from spread W-L-T.
- Apply the same hidden-benchmark, full-ballot reveal, editable-until-submission-deadline, source/time audit, provisional six-hour snapshots, and **actual Thursday Night Football kickoff** benchmark freeze as Guess the Spread. Record the last valid **pre-kickoff** total quote; never use a post-kickoff number to rewrite the benchmark.
- Preserve prediction revisions and avoid leaking current market totals to players who have not completed their total ballot. Do not infer totals from spreads. Independently source consensus totals and independent model projected totals.
- Schema/API fields: `market_type: "spread" | "total"`, `predicted_total`, `consensus_total`, `model_total`, `source_book`, `quoted_at`, `snapshot_id`, `score_status`. A player may submit both a spread prediction and a total prediction for the **same** game; these are two different Guess competitions.
- Betting Challenge remains unchanged: default one required **spread OR over/under bet per game**, graded W-L-P from actual outcomes at the **quoted selected line**. Guess the Total prediction is not itself a wager.
- Historic Week 5: 15 spread predictions exist; **no Guess the Total predictions are recorded yet**. Display `Not submitted` rather than fabricating totals or counting them as zeros before deadline adjudication.


## Historical provisional comparison coverage — before D-16

Submitted Spread and Total ballots now receive independently gated provisional
analysis in each authorized matching group. Each mode uses one complete saved
three-book collection for all submitted players; incomplete/draft opponents
remain unscored. This display does not grant official benchmark approval to
other groups or Total, change immutable weekly picks, or extend D-09. Existing
approved/frozen references took precedence in that release. D-16 subsequently
confirmed individual submission/edit-time scoring and supersedes this common
reference behavior in the local implementation. See SUBMISSION_TIME_SCORING.md
for verification and outstanding hosted delivery.
