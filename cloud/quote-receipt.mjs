const BOOKS = { draftkings: 'DraftKings', fanduel: 'FanDuel', betmgm: 'BetMGM' };
const FRESH_MS = 5 * 60_000;
const time = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : NaN;
const odds = value => Number.isInteger(value) && Math.abs(value) >= 100 && Math.abs(value) <= 10000;
const point = (value, market) => Number.isFinite(value) && Number.isInteger(value * 2)
  && (market === 'total' ? value >= 0 && value <= 200 : Math.abs(value) <= 100);

// Receipts are rebuilt from server-owned immutable snapshot bytes, never from
// client-supplied prices or verified flags. A receipt is no guarantee of a fill.
export function buildQuoteReceipt(snapshot, game, market, book, side, now = Date.now()) {
  if (!Number.isFinite(now) || !['spread', 'total'].includes(market) || !Object.hasOwn(BOOKS, book)
    || !(market === 'spread' ? ['home', 'away'] : ['over', 'under']).includes(side)
    || typeof snapshot?.id !== 'string' || !snapshot.id || !Array.isArray(snapshot.payload?.games)) return null;
  const captured = time(snapshot.createdAt), kickoff = time(game?.kickoff);
  if (!Number.isFinite(captured) || !Number.isFinite(kickoff) || captured > now || now >= kickoff) return null;
  const matches = snapshot.payload.games.filter(row => row.gameId === game.id && row.home === game.home && row.away === game.away && time(row.kickoff) === kickoff);
  if (matches.length !== 1 || matches[0].matchStatus !== 'matched') return null;
  const event = matches[0], quotes = event.markets?.[market]?.quotes;
  if (!Array.isArray(quotes)) return null;
  const matching = quotes.filter(quote => quote?.book === book);
  if (matching.length !== 1) return null;
  const quote = matching[0], observed = time(quote.providerObservedAt), collected = time(quote.collectedAt);
  if (quote.market !== market || quote.provider !== 'the-odds-api' || typeof event.providerEventId !== 'string' || !event.providerEventId
    || quote.providerEventId !== event.providerEventId || !point(quote.value, market)
    || !Number.isFinite(observed) || !Number.isFinite(collected) || observed > collected || collected > captured
    || captured - observed > FRESH_MS || now - observed > FRESH_MS || observed >= kickoff || collected >= kickoff) return null;
  const sides = market === 'spread' ? ['home', 'away'] : ['over', 'under'];
  const first = quote.outcomes?.[sides[0]], second = quote.outcomes?.[sides[1]];
  if (!first || !second || !point(first.line, market) || !point(second.line, market) || !odds(first.odds) || !odds(second.odds)
    || first.line !== quote.value || (market === 'spread' ? first.line !== -second.line : first.line !== second.line)) return null;
  const chosen = quote.outcomes[side];
  return { snapshotId: snapshot.id, provider: 'the-odds-api', providerEventId: event.providerEventId,
    gameId: game.id, book, source: BOOKS[book], market, side, line: Object.is(chosen.line, -0) ? 0 : chosen.line,
    odds: chosen.odds, quotedAt: new Date(observed).toISOString(), collectedAt: new Date(collected).toISOString(),
    snapshotCapturedAt: new Date(captured).toISOString(), timeBasis: 'provider_market_last_update',
    tradability: 'not_confirmed', expiresAt: new Date(Math.min(observed + FRESH_MS, kickoff)).toISOString() };
}

export function confirmQuoteReceipt(reviewed, latestSnapshot, game, now = Date.now()) {
  const current = buildQuoteReceipt(latestSnapshot, game, reviewed?.market, reviewed?.book, reviewed?.side, now);
  if (!current || !reviewed || Object.keys(current).some(key => current[key] !== reviewed[key])) {
    throw new Error('The recorded quote changed or expired. Review the latest named-book quote before confirming.');
  }
  return { ...current, selectedAt: new Date(now).toISOString(), enteredAt: new Date(now).toISOString(), verification: 'Recorded provider quote; tradability not confirmed' };
}

export function compareSelectionQuotes(selection, snapshots, game, now = Date.now()) {
  const selected = time(selection?.selectedAt), original = selection?.quoteReceipt;
  const unavailable = reason => ({ status: 'unavailable', reason, selectedAt: Number.isFinite(selected) ? selection.selectedAt : null,
    enteredAt: selection?.enteredAt || null, laterQuote: null, lineDifference: null, oddsChanged: null });
  if (!Number.isFinite(now) || !Number.isFinite(selected) || selected > now || !original
    || original.gameId !== game.id || original.market !== selection.market || original.side !== selection.side
    || original.line !== selection.line || original.odds !== selection.odds || !Object.hasOwn(BOOKS, original.book)
    || !Number.isFinite(time(original.quotedAt)) || !Number.isFinite(time(original.collectedAt))
    || time(original.quotedAt) > time(original.collectedAt) || time(original.collectedAt) > selected) return unavailable('No recorded provider receipt exists for this selection.');
  const later = (Array.isArray(snapshots) ? snapshots : []).filter(snapshot => time(snapshot?.createdAt) > selected && time(snapshot.createdAt) <= now)
    .sort((a, b) => time(b.createdAt) - time(a.createdAt))
    .map(snapshot => buildQuoteReceipt(snapshot, game, original.market, original.book, original.side, time(snapshot.createdAt)))
    .find(receipt => receipt && receipt.providerEventId === original.providerEventId && time(receipt.quotedAt) > selected);
  if (!later) return unavailable('No later saved observation for the same event, book, market and side.');
  return { status: 'available', selectedAt: selection.selectedAt, enteredAt: selection.enteredAt || null,
    selectedQuote: { book: original.book, source: BOOKS[original.book], market: selection.market, side: selection.side, line: selection.line,
      odds: selection.odds, quotedAt: original.quotedAt, collectedAt: original.collectedAt, snapshotId: original.snapshotId },
    laterQuote: later, lineDifference: later.line - selection.line, oddsChanged: later.odds !== selection.odds,
    meaning: 'Later recorded offer minus selected quote; not closing-line value, profit or competition scoring.' };
}
