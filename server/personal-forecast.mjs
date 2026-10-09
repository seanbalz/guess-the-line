import { validatePrediction } from './domain.mjs';

// Authenticated ownership, server timestamps, revisions and persistence belong
// to the account adapter. This validator never reads or changes a scored ballot.
export function validatePersonalForecast(body, { games, season, week } = {}) {
  if (!body || Array.isArray(body) || typeof body !== 'object'
    || Object.keys(body).some(key => !['season', 'week', 'gameId', 'market', 'value', 'requestId', 'revision'].includes(key))
    || !Number.isInteger(body.season) || body.season < 2020 || body.season > 2100
    || !Number.isInteger(body.week) || body.week < 1 || body.week > 22
    || !['spread', 'total'].includes(body.market)
    || typeof body.gameId !== 'string' || !body.gameId || body.gameId.length > 120
    || (season !== undefined && season !== body.season) || (week !== undefined && week !== body.week)
    || (games && !games.some(game => game.id === body.gameId))) throw new Error('Choose a current matchup and a separate spread or total forecast.');
  const value = validatePrediction(body.market === 'total' ? 'guess_total' : 'guess_spread', body.value);
  return { season: body.season, week: body.week, gameId: body.gameId, market: body.market, value };
}
