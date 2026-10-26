# Research Lines board — October 26, 2026

Owner: Sean Balsiger · Approved D-55/D-39 continuation · Source work, not a release

The board previously showed a player's saved scoring reference in the market
position. Per-game current quotes were added in PR #224. This follow-through
connects the board to the existing gated `/lines/read` reader, with the season
and week of the displayed personal slate explicitly included in every request.
It does not read the newest week implicitly, collect odds or change scoring.

## Delivered in this source batch

- Current/latest Spread and Total quotes, each with source and full observation
  date/time in PT. Spreads identify the home team. Six-hour age labels use server
  time plus monotonic elapsed time; missing/future times remain unverified and
  missing values remain an em dash. A genuine zero remains visible.
- Each market opens only when the reader returns `visible: true`. Closed cells
  stay lock icons, without quote or source metadata. Own guesses remain tags;
  the game sheet retains the independent saved scoring reference.
- One gate banner names locked markets and leads to the existing Play editor.
  “Review sit-out in Play” navigates only; the existing confirmation and recovery
  flow owns the write. Browsing the board does not submit or forfeit anything.
- Account/week/access changes, failed refreshes and invalid week replies hide
  old market values. Retry, focus, reconnect, visibility and the next kickoff
  re-read the week. Age timers update labels without polling for odds.
- Recorded finals show their supplied scores. Without a final, a started game
  says “Kicked off”; a kickoff timestamp alone is not proof a game is live.
- The per-game reader and board share the same scoped read lifecycle, preserving
  the per-game chart, quote comparison and freshness behavior from PR #224.

## Verification

Verification uses disposable fixtures, the real existing handler and migration
chain, and synthetic accounts. No hosted player data or production writes are
used. Coverage includes the board-to-receipt distinction, independent gates,
explicit week requests, no browsing writes, retry/wrong-week behavior, delayed
account replies, six-hour aging with a deliberately wrong device clock, keyboard
and chart interactions, and Light/Dark 320/390/1440px layout/accessibility.
The integrated Research/Lines/Trends run passed 27 cases; the remaining new case
had a test-only punctuation mismatch in the receipt assertion. After correction,
all five focused board cases passed, including the corrected case, both themes,
320px open and closed markets, and delayed account replies. Thus all 28 selected
browser cases passed across the integrated and focused runs. The final 26 rendered
component tests, 43 model/API-contract/token tests, 19 existing SQL gate tests,
typecheck, Brand QA, fixture build and bundle-only privacy scan passed. Final
320px Light/Dark board screenshots were inspected. CI/merge and release of this
board batch are still separate checkpoints.

## What remains

This delivers stage 33's board quote and gate-entry work. The old plan's direct
in-board `ForfeitDialog` is not added: players review the existing sit-out
confirmation in Play. A verified live-game status needs a suitable status
contract; the reader only supplies `started` and a recorded final. These are
explicit residual stage-33 items, not silently marked complete.

Stage 34's Everyone's picks, slot-based actions and League bets destinations
remain open under their existing dependencies. Hosted release, signed-in
readback and physical iPhone Safari/Home Screen acceptance remain separate.
The frozen v62 tracker, SQL, collectors, saved guesses and scoring references
are unchanged. Sean's corrected no-scroll-bug report is retained.
