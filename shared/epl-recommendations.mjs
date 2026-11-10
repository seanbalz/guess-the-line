// EPL Bets recommendations (docs/EPL_FEATURES_2026_11_09.md, confirmed behavior 3; delivery stage 2). Pure functions only:
// no clock of their own, no I/O. The server (gtl_epl_bet_recommendations) chooses and orders the candidates from the
// manager's own locked guesses and the latest stored same-market odds; these helpers re-check that order and describe
// each candidate. Favorable gap alone orders the list. Trend context and concerns explain, support or flag a candidate;
// they never reorder or exclude one. A guess of a sportsbook price is not an estimated outcome probability, and a gap
// is not proof of profitable expected value.
import { favorableGap, toLine, validPrice } from './epl-moneyline.mjs';

export const RECOMMENDATION_MAX_ITEMS = 100;
/** A latest price older than this is flagged as possibly stale (never dropped). */
export const STALE_PRICE_MS = 12 * 3600_000;
/** A gap at least this large on the line is flagged for a second look (never dropped). */
export const LARGE_GAP = 100;
export const KICKOFF_SOON_MS = 3600_000;
export const CONCERNS = Object.freeze(['stale_price', 'few_books', 'large_gap', 'shortening', 'reference_pending', 'kickoff_soon']);

/** True when `items` is in the server's order: gap descending, then kickoff, then event id. */
export function orderedByGap(items) {
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1], b = items[i];
    const cmp = b.gap - a.gap || Date.parse(a.commenceTime) - Date.parse(b.commenceTime) || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0);
    if (cmp > 0) return false;
  }
  return true;
}

/** Movement of the stored same-market price from its first stored observation to the latest, on the line. */
export function priceTrend(item) {
  if (!validPrice(item?.firstPrice) || !validPrice(item?.latestPrice) || !Number.isInteger(item?.observations) || item.observations < 1) return null;
  const change = toLine(item.latestPrice) - toLine(item.firstPrice);
  return { from: item.firstPrice, to: item.latestPrice, observations: item.observations, change, direction: change > 0 ? 'longer' : change < 0 ? 'shorter' : 'flat' };
}

/** Concerns to show beside a candidate. They flag; they never reorder or exclude. */
export function recommendationConcerns(item, now) {
  const out = [];
  const observed = Date.parse(item?.latestObservedAt ?? ''), kickoff = Date.parse(item?.commenceTime ?? '');
  if (Number.isFinite(observed) && Number.isFinite(now) && now - observed > STALE_PRICE_MS) out.push('stale_price');
  if (Number.isInteger(item?.books) && item.books < 3) out.push('few_books');
  if (Number.isFinite(item?.gap) && item.gap >= LARGE_GAP) out.push('large_gap');
  if (priceTrend(item)?.direction === 'shorter') out.push('shortening');
  if (item?.referencePrice === null || item?.referencePrice === undefined) out.push('reference_pending');
  if (Number.isFinite(kickoff) && Number.isFinite(now) && kickoff - now <= KICKOFF_SOON_MS) out.push('kickoff_soon');
  return out;
}

/** The gap a candidate must carry, recomputed from its own prices. */
export const candidateGap = item => favorableGap(item?.price, item?.latestPrice);
