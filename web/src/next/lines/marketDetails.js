import { bestOffer } from '../../../../shared/best-offer.mjs';
import { fmtDate, fmtNum, fmtSide, fmtTime, pacificParts } from '../format.js';

export const marketTime = time => {
  const parts = pacificParts(time);
  return parts ? `${fmtDate(time)}, ${parts.year} · ${fmtTime(time)} PT` : '—';
};

export const SIX_HOURS = 6 * 60 * 60 * 1000;
export const marketValue = (game, market, value) => market === 'spread'
  ? fmtSide(game.awayCode, game.homeCode, 'home', value) : fmtNum(value);

/** Freshness follows source observation, not collection or the device's wall clock. */
export function lineState(line, now) {
  if (!Number.isFinite(line?.value)) return 'Unavailable';
  const observed = Date.parse(line.observedAt);
  if (!Number.isFinite(observed) || !Number.isFinite(now) || observed > now) return 'Time unverified';
  return now - observed > SIX_HOURS ? 'Latest recorded line' : 'Current line';
}

/** The quote line is stored in home-team terms; compare each side in its own terms. */
export function bestRecordedBook(books, market, side, now) {
  const offers = books.filter(book => Number.isFinite(book.line) && Number.isFinite(Date.parse(book.observedAt)) && Date.parse(book.observedAt) <= now)
    .map(book => ({ book: book.book, line: market === 'spread' && side === 'away' ? -book.line : book.line,
      odds: book.prices?.[side], observedAt: book.observedAt }))
    .filter(offer => Number.isFinite(offer.line));
  return bestOffer(offers, market, side)?.book ?? null;
}

/** Real collection times on x, no invented zero baseline, and gaps at missing observations. */
export function movementGeometry(rows, kickoff) {
  const valid = rows.map((row, index) => ({ ...row, index, at: Date.parse(row.capturedAt) }))
    .filter(row => Number.isFinite(row.value) && Number.isFinite(row.at));
  if (!valid.length) return { points: [], path: '', kickoffX: null };
  const first = Math.min(...valid.map(p => p.at)), last = Math.max(...valid.map(p => p.at));
  const low = Math.min(...valid.map(p => p.value)), high = Math.max(...valid.map(p => p.value));
  const points = valid.map(p => ({ ...p, x: last === first ? 160 : 12 + (p.at - first) / (last - first) * 296,
    y: high === low ? 70 : 12 + (high - p.value) / (high - low) * 116 }));
  const path = points.map((p, i) => `${i && p.index === points[i - 1].index + 1 ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
  const kickoffAt = typeof kickoff === 'string' ? Date.parse(kickoff) : NaN;
  // A time marker is not a quote. Keep the original domain, points and gaps;
  // a single time or a kickoff outside the observations cannot locate a marker.
  const kickoffX = first < last && kickoffAt >= first && kickoffAt <= last
    ? 12 + (kickoffAt - first) / (last - first) * 296 : null;
  return { points, path, low, high, kickoffX };
}
