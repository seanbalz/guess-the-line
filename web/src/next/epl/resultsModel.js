// The epl/draft/read reply's Pick a Team `results` (cloud/epl.mjs; EPL delivery stage 4) as ResultsCard draws it. Pure: no
// React, DOM or clock. Anything malformed draws nothing rather than a guessed result.
const whole = v => Number.isInteger(v) && v >= 0;
const winnerOk = w => w && typeof w.ownerId === 'string' && typeof w.name === 'string' && typeof w.club === 'string'
  && whole(w.goalsFor) && whole(w.goalsAgainst) && Number.isInteger(w.margin) && w.margin > 0 && Number.isInteger(w.bonus);

/** The reply's `results`, checked field by field, or null. */
export function resultsModel(results) {
  if (!results || typeof results !== 'object' || !Number.isInteger(results.week) || !['final', 'pending'].includes(results.status)) return null;
  const m = results.matches ?? {};
  if (![m.total, m.final, m.postponed, m.pending].every(whole) || m.total < 1) return null;
  const winners = Array.isArray(results.winners) ? results.winners.filter(winnerOk) : [];
  return { season: results.season, week: results.week, status: results.status, review: results.review === true,
    matches: { total: m.total, final: m.final, postponed: m.postponed, pending: m.pending },
    winners: results.status === 'final' ? winners : [] };
}
