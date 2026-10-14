// D-18 best price, one helper for every screen that names a "best" book offer
// (today the old Virtual Units route, cloud/virtual-units.mjs; later the Lines
// tab's Book lines table). Pure: no I/O, no clock, nothing read from storage.
//
// Order for one side of one market (D-18, docs/RULES.md "Virtual units game"):
//   1. the best point line for that side: more points for a spread side, a
//      lower total for Over, a higher total for Under;
//   2. then the better price, compared as decimal payout (+100 beats −110,
//      −105 beats −115); never "closest to −110";
//   3. then the newest observation;
//   4. then the book key, A to Z, so equal offers never flicker.
// Each book competes with one quote only: its newest retained quote observed
// before kickoff. A book missing from the latest snapshot keeps its newest
// older quote, never its oldest.

const time = value => {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : -Infinity;
};
const americanOdds = value => Number.isInteger(value) && Math.abs(value) >= 100;
const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const newer = (a, b) => (a === b ? 0 : a > b ? -1 : 1);

/** Decimal payout per unit staked, stake included: +100 → 2, −110 → 1.909…, +150 → 2.5. */
export function decimalPayout(odds) {
  if (!americanOdds(odds)) return null;
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / -odds;
}

/** How many points better line `a` is than line `b` for this side (positive: `a` is better). */
function linePoints(market, side, a, b) {
  if (market === 'total') return side === 'over' ? b - a : a - b;
  return a - b;
}

/**
 * Comparator for one side of one market: the better offer sorts first.
 * Offers carry `{ book, line, odds, observedAt }`.
 */
export function compareOffers(market, side) {
  return (a, b) => linePoints(market, side, b.line, a.line)
    || decimalPayout(b.odds) - decimalPayout(a.odds)
    || newer(time(a.observedAt), time(b.observedAt))
    || byKey(a.book, b.book);
}

/** The best offer for one side of one market, or null. Offers without a finite line or valid American odds never count. */
export function bestOffer(offers, market, side) {
  const usable = (Array.isArray(offers) ? offers : [])
    .filter(offer => offer && typeof offer.book === 'string' && Number.isFinite(offer.line) && americanOdds(offer.odds));
  return usable.sort(compareOffers(market, side))[0] || null;
}

/**
 * One quote per book: the newest one observed strictly before `kickoff`.
 * Newest means from the latest snapshot (`capturedAt`), then the latest
 * observation (`observedAt`), then the latest collection (`collectedAt`); on a
 * full tie the first one seen stays. With no valid kickoff nothing counts.
 * Returns books in the order they were first seen.
 */
export function newestPerBook(quotes, kickoff) {
  const cutoff = time(kickoff);
  const kept = new Map();
  if (cutoff === -Infinity) return [];
  for (const quote of Array.isArray(quotes) ? quotes : []) {
    const observed = time(quote?.observedAt);
    if (!quote || typeof quote.book !== 'string' || observed === -Infinity || observed >= cutoff) continue;
    const current = kept.get(quote.book);
    const order = current ? newer(time(quote.capturedAt), time(current.capturedAt))
      || newer(time(quote.observedAt), time(current.observedAt))
      || newer(time(quote.collectedAt), time(current.collectedAt)) : -1;
    if (order < 0) kept.set(quote.book, quote);
  }
  return [...kept.values()];
}
