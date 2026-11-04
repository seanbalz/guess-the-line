// The week's report card for GTL’s weekly estimates as plain data (D-69 step 3: the old FantasyAccuracy.jsx's numbers as
// tiles and rows). Every number is shared/fantasy-review.mjs summarizeReview's under the chosen scoring, formatted as
// before; nothing is recomputed. A review grades the estimates published for its week and names no method, so the card
// never names one (the rankings ⓘ names the shown snapshot's own).
import { formatFantasyNumber as number } from '../../../../shared/fantasy-rankings.mjs';
import { summarizeReview } from '../../../../shared/fantasy-review.mjs';

const percent = value => (value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`);
const signed = value => `${value > 0 ? '+' : '−'}${number(Math.abs(value))}`;
export const REPORT_COPY = Object.freeze({
  about: 'A report card for GTL’s weekly estimates, not a forecast or betting claim. Each estimate is graded against the recorded result, beside a season-average baseline.',
});

export function reportModel(review, filters, scoringLabel) {
  const s = summarizeReview(review, filters);
  const miss = row => ({ id: row.id, title: row.name, meta: `${row.team} ${row.position} · est. ${number(row.estimate)} · actual ${number(row.actual)}`,
    value: signed(row.diff), word: row.diff > 0 ? 'too high' : 'too low' });
  return {
    week: review.week, status: review.status, graded: s.graded, mae: s.mae,
    none: `No graded players for Week ${review.week} under these settings.`,
    tiles: [
      { key: 'miss', label: 'Off by', big: number(s.mae), sub: `pts per player · ${scoringLabel}` },
      { key: 'baseline', label: 'Season average', big: number(s.baselineMae), sub: 'pts per player' },
      { key: 'within', label: 'Within 5 points', big: percent(s.within5), sub: 'of graded players' },
      { key: 'graded', label: 'Players graded', big: String(s.graded), sub: s.beatBaseline.length ? `Beat average: ${s.beatBaseline.join(', ')}` : 'Beat average: none' },
    ],
    positions: s.byPosition.map(r => {
      const beat = r.baselineMae !== null && r.pairedMae !== null && r.pairedMae < r.baselineMae;
      return { position: r.position, value: number(r.pairedMae), meta: `${r.graded} graded · season average ${number(r.baselineMae)}`,
        word: r.baselineMae === null ? 'No average' : beat ? 'Beat average' : 'Behind average', tone: beat ? 'good' : 'plain' };
    }),
    overs: s.overs.map(miss), unders: s.unders.map(miss),
    fine: [REPORT_COPY.about,
      s.withoutBaseline > 0 ? `GTL on the same players: ${number(s.pairedMae)}; ${s.withoutBaseline} without a season average.` : null,
      `Listed available, no stats row: ${s.noStatsRow} · Played without an estimate: ${s.playedWithoutEstimate}. Neither is scored as zero.`].filter(Boolean),
  };
}

/** The rankings card's report tile: the miss in points, or the status while nothing is graded. */
export function reportTile(review, filters) {
  const s = summarizeReview(review, filters);
  return s.graded ? { big: number(s.mae), sub: 'pts off per player' } : { big: review.status, sub: 'How close the estimates were' };
}
