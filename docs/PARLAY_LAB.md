# Parlay Lab: research-first MVP (2026-11-15)

The existing Bets → Research screen now includes an NFL player-prop board and
bounded 2–3-leg research combinations. Cards show the supporting case, sample,
counterevidence, quote time, and expandable existing source/assessment details.
Category filtering covers touchdowns, passing, rushing, receiving and other props.
The current Research market/color filters also scope this board.

Composition uses only the existing server response: account/reveal permissions,
exact-market checks and quote-expiry handling remain unchanged. No new provider,
paid request, database migration or synthetic production data is introduced.
Ideas require sourced eligible supporting evidence, a current pregame quote and
no eligible opposing claim/conflict. Every leg uses the same book; same-game or
same-player combinations are excluded. Duplicate legs are removed. At most six
ideas are shown in server order, not claimed edge order. Shared dataset warnings
remain visible; distinct games do not prove statistical independence.

## Deliberate limits

- Only the server's retained best individual quotes are available. The screen
  cannot establish whether a sportsbook offers the combined ticket.
- Combined odds, probability, payout and expected value are deliberately absent.
- This is a qualitative shortlist, not a validated predictive model or claim of
  profitable picks. Empty research stays empty; stale or unavailable legs cannot
  enter ideas. Injury/role/market-terms verification remains necessary.
- No bet is placed, no sportsbook account connected, and no combination saved to
  the tracker. Existing single-assessment tracking is unchanged.
- Production feed coverage and hosted behavior have not been verified. No merge,
  deployment, migration apply or provider configuration was performed.

## Verification

- Typecheck and production Vite build passed.
- All 105 Vitest files / 1,031 tests passed, including two new render tests.
- Four new Node composition tests passed (2/3 legs, book/game/player conflicts,
  stale/missing/future quotes, missing support, counterevidence and empty views).
- Full Node run: 2,572 passed, 357 skipped, 13 failed due to the checkout's missing
  `.local/sql-check` PGlite dependency. Therefore `npm run check` is not green.
- Brand/document QA passed.
- Browser/mobile visual and interaction QA remains blocked: Chromium failed to
  start because the execution environment denied `socket()`, including a reviewed
  escalation attempt. No visual acceptance is claimed. Temporary fixture pages
  were removed and are not part of the change.

## Approved concept follow-through (November 15)

The source now includes a Projection center and highlighted Matchup spotlight,
following the approved illustrative mockup without importing its invented player
values, ranges, photos or rankings. A qualified model remains absent: projection,
range and edge are explicitly unavailable. The existing checked current quote
supplies the market side/line only. This is UI scaffolding, not delivered model
predictions. Matchup cards require eligible, source-backed `matchup` evidence and
show its reported metric, denominator, sample, period, as-of time and attribution.
No player position, defense ranking, favorable grade, season or last-five split
is inferred. Ineligible evidence stays out of the spotlight; the complete
assessment remains accessible. Each section is capped at six cards, and category
selection now also scopes parlay combinations. Retained-best-quote coverage
remains incomplete by design, not a full sportsbook combinator.

Follow-through typecheck, focused render/composition tests, cloud build, bundle
privacy scan and Brand QA passed locally. Full aggregate validation and hosted
CI must be checked on the final commit before merging. Browser/phone acceptance
is still outstanding. Deployment follows the protected shared release captain
workflow; a merged PR is not itself a deployment.
