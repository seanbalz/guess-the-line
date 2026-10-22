import { isNbaDate } from './nba-bets.mjs';
const invalid = () => { throw new Error('GTL_NBA_INVALID'); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.trim() && value.length <= max;
const states = new Set(['scheduled', 'in_progress', 'final', 'postponed', 'canceled', 'delayed', 'suspended', 'abandoned', 'unknown']);
export function validateNbaGamesRequest({ date, timeZone } = {}) {
  if (!isNbaDate(date) || typeof timeZone !== 'string' || timeZone.length > 100 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(timeZone)) invalid();
  try { new Intl.DateTimeFormat('en-US', { timeZone }).format(); } catch { invalid(); }
  return { date, timeZone };
}
function team(value) {
  if (!record(value) || !Number.isSafeInteger(value.id) || value.id <= 0 || !text(value.full_name, 100) || !text(value.abbreviation, 10)) invalid();
  return { id: value.id, name: value.full_name.trim(), abbreviation: value.abbreviation.trim() };
}
function score(value, status) {
  if (value !== null && value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > 1000)) invalid();
  return ['in_progress', 'final'].includes(status) ? value ?? null : null;
}
function statusOf(game) {
  if (game.status_state !== undefined && game.status_state !== null) {
    const state = states.has(game.status_state) ? game.status_state : 'unknown';
    return state;
  }
  const label = typeof game.status === 'string' ? game.status.trim().toLowerCase() : '';
  if (/^final(?:\/\d*ot)?$/.test(label)) return 'final';
  if (/^(?:\d(?:st|nd|rd|th) qtr|halftime|\d*ot)$/.test(label)) return 'in_progress';
  if (states.has(label)) return label;
  if (/^\d{1,2}:\d{2}\s*(?:am|pm)\s*(?:et|est|edt)?$/i.test(label)) return 'scheduled';
  return 'unknown';
}
export function normalizeNbaGames(payload, observedAt) {
  if (!record(payload) || !Array.isArray(payload.data) || payload.data.length > 100 || !record(payload.meta)
    || payload.meta.next_cursor !== null && payload.meta.next_cursor !== undefined
    || typeof observedAt !== 'string' || !Number.isFinite(Date.parse(observedAt))) invalid();
  const seen = new Set();
  return payload.data.map(game => {
    if (!record(game) || !Number.isSafeInteger(game.id) || game.id <= 0 || seen.has(game.id)) invalid();
    seen.add(game.id);
    const sourceDate = typeof game.date === 'string' ? game.date.slice(0, 10) : null;
    if (!isNbaDate(sourceDate)) invalid();
    let startTime = null;
    if (game.datetime !== null && game.datetime !== undefined) {
      if (typeof game.datetime !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(game.datetime)
        || !isNbaDate(game.datetime.slice(0, 10)) || !Number.isFinite(Date.parse(game.datetime))) invalid();
      startTime = new Date(game.datetime).toISOString();
    }
    const status = statusOf(game), home = team(game.home_team), away = team(game.visitor_team);
    if (home.id === away.id) invalid();
    return { id: `NBA:balldontlie:${game.id}`, startTime, sourceDate, home, away, status,
      statusText: text(game.status, 100) ? game.status.trim() : 'Unknown',
      homeScore: score(game.home_team_score, status), awayScore: score(game.visitor_team_score, status), observedAt };
  }).sort((a, b) => (a.startTime ?? a.sourceDate).localeCompare(b.startTime ?? b.sourceDate) || a.id.localeCompare(b.id));
}
export function gamesForLocalDate(games, date, timeZone) {
  validateNbaGamesRequest({ date, timeZone });
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return games.filter(game => {
    if (game.startTime === null) return game.sourceDate === date;
    const parts = Object.fromEntries(formatter.formatToParts(new Date(game.startTime)).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}` === date;
  });
}
