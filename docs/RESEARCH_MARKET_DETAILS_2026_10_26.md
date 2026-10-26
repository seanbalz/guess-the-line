# Research game market details — October 26, 2026

Owner: Sean Balsiger · Approved redesign stage 34 · Source work, not a release

The Research game sheet previously showed saved personal references, weather,
notes and historical trends, but did not consume the existing gated `/lines/game`
reader. The larger approved line-card, book-quote and movement scope was still
unfinished despite the recent chart polish. This batch supplies that per-game
view. Stage 33's board-wide current lines and stage 34's remaining competition
and action-bar destinations are separate work.

## What changes

Opening a game reads its market detail once. Each open market shows its recorded
consensus, source, book count and observation time. “Current line” requires an
observation at most six hours old; older observations say “Latest recorded line.”
Missing or future observation times say “Time unverified.” Started games use the
recorded label and show the separate kickoff reference when supplied.

Book lines expand into the three supported named-book quotes, with a side
selector, recorded point line, price and observation time. “Best recorded” uses
the existing `shared/best-offer.mjs` ordering: point line for that side, then
price, observation time and book key. Missing lines/prices and unknown/future
observation times cannot earn that label. It is a comparison of stored quotes,
not a promise of executable sportsbook availability.

Movement expands into a chart and the corresponding observation table. The x
axis uses actual collection times. Spread values always name the home team;
totals carry no spread sign or Units label. A pointer drag and keyboard slider
select the same recorded points. One observation remains one point, and missing
values/times leave gaps rather than invented zero values or connecting segments.
The supporting explanation is available beside Market lines and in Menu →
Guidance and sources. Both themes use the approved D-58 tokens.

## Access, freshness and preservation

The server's `visible === true` is required independently for Spread and Total.
Closed markets show a lock sentence and render no line, book, movement or kickoff
values, including if a malformed reply contains those fields. No client
inference opens a market. The server continues to enforce the existing gate.

The hook scopes replies to account, published week, game and personal-access
version. Scope changes hide prior data during render; aborted or older replies
cannot restore it. Focus, reconnect and manual refresh clear old market data
before replacement. A failed read shows a retry. Kickoff schedules a fresh read;
an age-label timer uses server time plus monotonic elapsed time and does not poll
or collect odds. A response for a different week or game is refused.

“You on this game” keeps the existing saved scoring reference. The current quote
and its subsequent movement never re-anchor a saved guess. No database, scoring,
writer, collection, polling, paid-source or migration changes are included.

## Evidence and remaining work

All 23 integrated Research/Lines/Trends browser tests passed. Four focused
market-detail tests passed after the final layout/timestamp changes, and a fifth
freshness-boundary test passed with a deliberately wrong device wall clock and
no additional odds read. The 26 rendered-component tests, 37 model/API-contract/
price-order/token tests, typecheck, Brand QA, fixture build and bundle-only
privacy scan passed. Light/Dark 320px movement screenshots were inspected.
Tests use a disposable database, the existing handler and synthetic sportsbook
snapshots. They are not live account or hosted
release evidence. CI/merge, frontend release, signed-in hosted readback and
physical-iPhone Safari/Home Screen acceptance remain separate.

Next source scope: stage 33's board-wide gated current lines, timestamps and gate
banner; then the remaining stage 34 competition/action destinations according to
their existing dependencies. The earlier source/hosted/phone distinction remains
mandatory; the completion register and queue must not close Research on chart
polish alone. The frozen v62 tracker remains unchanged.
