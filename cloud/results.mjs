export const RESULTS_METHODS = { '/results/review': ['POST'] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class ResultError extends Error { constructor(status, message) { super(message); this.status = status; } }
const ERRORS = {
  GTL_RESULT_FORBIDDEN: [403, 'Only the original commissioner can review final results.'],
  GTL_ODDS_FORBIDDEN: [403, 'Only the original commissioner can review final results.'],
  GTL_FORBIDDEN: [403, 'Your account has not been added to this league.'],
  GTL_RESULT_INPUT: [400, 'Provide the canonical matchup, final home/away scores, HTTPS source, observed time and review reason.'],
  GTL_RESULT_CONFLICT: [409, 'This result changed. Review the current version before correcting it.'],
  GTL_RESULT_REQUEST_CONFLICT: [409, 'This review request was already used for different content.'],
  GTL_SLATE_CONFLICT: [409, 'The canonical weekly schedule changed and requires review.'],
};
export const providerResultError = message => ERRORS[message] ? new ResultError(...ERRORS[message]) : new Error('Reviewed results unavailable.');

export async function handleResultReview({ body, user, service, clock = Date.now }) {
  const keys = ['requestId', 'season', 'week', 'gameId', 'home', 'away', 'source', 'sourceURL', 'observedAt', 'expectedVersion', 'reason'];
  if (!body || typeof body !== 'object' || Array.isArray(body) || keys.some(key => !Object.hasOwn(body, key))
    || Object.keys(body).some(key => !keys.includes(key)) || !UUID.test(body.requestId || '')
    || !Number.isInteger(body.season) || body.season < 2020 || body.season > 2100 || !Number.isInteger(body.week) || body.week < 1 || body.week > 22
    || typeof body.gameId !== 'string' || !/^[A-Z]{2,4}-[A-Z]{2,4}$/.test(body.gameId)
    || ![body.home, body.away].every(value => Number.isInteger(value) && value >= 0 && value <= 200)
    || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0 || body.expectedVersion >= Number.MAX_SAFE_INTEGER
    || typeof body.source !== 'string' || body.source.trim().length < 2 || body.source.length > 120
    || typeof body.reason !== 'string' || body.reason.trim().length < 5 || body.reason.length > 500
    || typeof body.sourceURL !== 'string' || body.sourceURL.length > 2048 || /\s/.test(body.sourceURL)
    || typeof body.observedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(body.observedAt)
    || !Number.isFinite(Date.parse(body.observedAt)) || Date.parse(body.observedAt) > clock()) throw providerResultError('GTL_RESULT_INPUT');
  let source;
  try { source = new URL(body.sourceURL); } catch { throw providerResultError('GTL_RESULT_INPUT'); }
  if (source.protocol !== 'https:' || source.username || source.password) throw providerResultError('GTL_RESULT_INPUT');
  if (!service?.review) throw new ResultError(503, 'The reviewed-results service is not available yet.');
  return service.review(user.id, { ...body, source: body.source.trim(), sourceURL: source.href, reason: body.reason.trim(), observedAt: new Date(body.observedAt).toISOString() });
}

export function applyReviewedResults(state, document, now = Date.now()) {
  if (!document || document.season !== state.league.season || document.week !== state.league.week || !document.games
    || !Number.isFinite(now)) return state;
  const results = { ...state.results };
  for (const game of state.games) {
    const row = document.games[game.id];
    if (!row || row.status !== 'final' || row.reviewType !== 'commissioner_reported'
      || row.homeTeam !== game.home || row.awayTeam !== game.away || Date.parse(row.scheduledKickoff) !== Date.parse(game.kickoff)
      || ![row.home, row.away].every(value => Number.isInteger(value) && value >= 0 && value <= 200)
      || !Number.isSafeInteger(row.version) || row.version < 1 || !Number.isFinite(Date.parse(row.observedAt))
      || !Number.isFinite(Date.parse(row.reviewedAt)) || Date.parse(row.observedAt) <= Date.parse(game.kickoff)
      || Date.parse(row.observedAt) > Date.parse(row.reviewedAt) || Date.parse(row.reviewedAt) > now) continue;
    results[game.id] = { status: 'final', home: row.home, away: row.away, version: row.version,
      source: row.source, sourceURL: row.sourceURL, observedAt: row.observedAt, reviewedAt: row.reviewedAt,
      reviewType: 'commissioner_reported', verification: 'Commissioner-reported final; not independently verified' };
  }
  return { ...state, results };
}
