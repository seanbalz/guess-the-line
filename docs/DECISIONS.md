# Decision log

## D-18 — separate virtual units game (October 8, 2026)

Sean confirmed a separate play-money spread/total game under Picks. One unit is $100 virtual; there is no bankroll cap. A player may place one spread and one total pick per NFL matchup, using simple side and unit buttons, and may edit either until that matchup's kickoff. The offered line comes from the best point line among retained named-book quotes, with odds breaking point-line ties; saved picks keep their original terms unless explicitly edited. **There is no quote-age cutoff for this virtual game:** a saved named-book quote remains selectable before kickoff if collection fails or a successful refresh omits that book's market. Newer saved quotes from other books still compete for the best point line. Show the quote's source, observation/collection time and prominent age, and never claim that an aged quote is a current executable offer. Weekly qualification is three picks or 3 units, including the agreed void/replacement credit rules. Settlement uses saved American odds and only a verified automatic final-score feed, which is not connected for this game. See the [D-18 task list and remaining decisions](../planning/virtual-units-game.md). This confirms rules, not implementation or deployment. The successful-refresh omission rule follows Sean's “Continue” response to the recommended path and may be revised if he clarifies otherwise.

- Fixed initial game: Sean Balsiger, Troy Jun, Luke Jun. Commissioner Sean; no backup manager.
- Multiple independent competitions and scoring modes, including Duel, Triple Threat, Free-for-All.
- Six requested sources: Action Network consensus, ESPN, DraftKings, FanDuel, Circa, Pinnacle. Cross-check sources; consensus is second gate. >=85% within +/-5 of normalized median, with stronger independent-source requirements.
- Thursday 12 PM Pacific benchmark; kickoff cutoff normally 5:15 PM Pacific; 15-minute extension-request grace to 5:30 PM when kickoff 5:15.
- One edit PER PICK before kickoff (supersedes older unlimited-edits wording and erroneous one edit per week).
- Other players' guesses visible once a player's entire ballot is submitted; no premature benchmark/score reveal.
- Missed deadline case by case; player voting by default; commissioner Sean can override; default approved forfeit zero; extenuating circumstances extensions.
- Notify slate availability, incomplete-player reminder two hours before kickoff, commissioner kickoff summary. No 30-minute reminder.
- Immediate movement alerts at 1.5 and 3 points, via independently optional push, text, email.
- Mobile-friendly website and native iPhone app desired.
- 2026 Week 5 Game 1 Sean entered Dallas Cowboys -9.5 vs Tampa Bay. Earlier -7.5 was assistant transcription error; correcting does not consume an edit.
- Many features remain unimplemented. Do not imply this GitHub repo already contains deployed app or live integrations.
- 2026-10-08: User clarified Guess the Line and Betting Challenge are two separate games with separate records. Guess the Line predictions are editable until submission deadline; prior one-edit-per-pick rule superseded for Guess the Line. Betting Challenge supports virtual spread, moneyline, and over/under picks throughout the week.

- 2026-10-08: Betting Challenge is based on win-loss record, not profit or bankroll. Remove virtual $100 bankroll as default. Track wins, losses, pushes and win percentage for spread, total and moneyline picks.

- 2026-10-08: Record-based Betting Challenge default is one pick per game per player, either spread or over/under; leagues can override the per-game pick limit. Moneyline is not part of this default mode.

- 2026-10-08: Link Guess the Line to Betting Challenge with a comparative edge board: user's original predicted spread, verified market consensus, and independently sourced professional model; rank largest gaps and closest guesses; record potential betting edges and eventual W-L-P outcomes. Keep totals projections separate, preserve predictions, and never invent live odds or professional projections.

- 2026-10-08: For Guess the Line, add separate per-matchup closest-to-actual-spread W-L-T record for head-to-head and three-player formats alongside existing accuracy points; compare absolute errors, record ties fairly, show weekly and season totals. Keep separate from Betting Challenge W-L-P.

- 2026-10-08: User supersedes Thursday-noon scoring freeze: provide a continuously updated provisional score dashboard after picks are submitted, with historical point movement as consensus spreads change; lock the official benchmark at actual TNF kickoff. Preserve timestamped source snapshots and a locked immutable scoring reference. Live polling/hosting not yet confirmed.
