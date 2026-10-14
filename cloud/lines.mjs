// Lines route group for the redesign (build plan, sections 3.1 and 3.3). Stage 4 wired it into cloud/handler.mjs
// once; stage 23 (M-06, supabase/migrations/20261015010000_gtl_lines_read.sql) adds POST /lines/read and /lines/game:
// the only safe way to read current lines, gated per game and market in SQL (D-36, D-39). A lines stage edits this
// file and scripts/boundary/lines.mjs, not the handler.
//
// The SQL gate decides what is open (gtl_markets_visible / gtl_guess_revealed: that game's kickoff, the viewer's own
// lock-in of that game and market, or the viewer's sit-out). This module is the second defense: every reply is rebuilt
// from a fixed list of keys, and a market whose `visible` is not exactly true becomes { visible: false } with nothing
// else, even if SQL sent a value, a book, a price, movement or a kickoff line under it. The viewer's own guess always
// comes back (D-23: never redacted from its owner); its line at the guess only under an open market.
import { UUID_PATTERN } from './lobby.mjs';

export class LinesError extends Error {
  constructor(status, message) { super(message); this.name = 'LinesError'; this.status = status; }
}
/** Route → allowed methods. Group routes take POST JSON bodies; the handler allows them no query parameters. */
export const LINES_METHODS = Object.freeze({ '/lines/read': ['POST'], '/lines/game': ['POST'] });
/** Database refusal code → [status, sentence]. A code is mapped here, and deployed, before the SQL can raise it. */
const ERRORS = Object.freeze({
  GTL_LINES_INVALID: [400, 'Check the week and game, then try again.'],
  GTL_COMMUNITY_MEMBER: [403, 'Open My games and save your display name to join the community.'],
  // The off switch (GTL_FEATURE_OFF=lines), and the answer while gtl-api is deployed and M-06 is not applied yet
  // (PostgREST's PGRST202, mapped by the handler's group RPC caller).
  GTL_FEATURE_OFF: [503, 'Lines are not available right now.'],
});
export const providerLinesError = message => (Object.hasOwn(ERRORS, message) ? new LinesError(...ERRORS[message]) : new Error('Lines are unavailable.'));
const invalid = () => { throw providerLinesError('GTL_LINES_INVALID'); };

const MARKETS = Object.freeze(['spread', 'total']);
const SIDES = Object.freeze({ spread: ['home', 'away'], total: ['over', 'under'] });
const BOOKS = Object.freeze({ draftkings: 'DraftKings', fanduel: 'FanDuel', betmgm: 'BetMGM' });
const GAME_ID = /^[A-Z]{2,3}-[A-Z]{2,3}$/;
const MAX_MOVEMENT = 48;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const number = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const time = value => (typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)) ? value : null);
const text = (value, max = 120) => (typeof value === 'string' && value.length <= max ? value : null);
const https = value => (typeof value === 'string' && value.length <= 200 && /^https:\/\/[^\s]+$/.test(value) ? value : null);
const flag = value => value === true;
const price = value => (Number.isInteger(value) && Math.abs(value) >= 100 && Math.abs(value) <= 10000 ? value : null);
const week = value => Number.isSafeInteger(value) && value >= 1 && value <= 25;
const season = value => Number.isSafeInteger(value) && value >= 2000 && value <= 2100;

/** The requested week: none (the newest published week) or a season and week together. Identity only from sign-in. */
function readWeek(body, allowed) {
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new LinesError(400, 'Unexpected request field. Player identity comes from sign-in.');
  const hasSeason = body.season !== undefined && body.season !== null, hasWeek = body.week !== undefined && body.week !== null;
  if (hasSeason !== hasWeek || (hasSeason && (!season(body.season) || !week(body.week)))) invalid();
  return { p_season: hasSeason ? body.season : null, p_week: hasWeek ? body.week : null };
}

const line = raw => (record(raw) ? {
  value: number(raw.value), capturedAt: time(raw.capturedAt), observedAt: time(raw.observedAt),
  bookCount: Number.isSafeInteger(raw.bookCount) ? raw.bookCount : null, source: text(raw.source), sourceUrl: https(raw.sourceUrl),
} : null);
const final = raw => (record(raw) ? {
  status: text(raw.status, 40), home: number(raw.home), away: number(raw.away), source: text(raw.source), sourceUrl: https(raw.sourceUrl),
  observedAt: time(raw.observedAt), origin: ['settlement', 'commissioner_reported'].includes(raw.origin) ? raw.origin : null,
} : null);
const game = raw => ({
  id: GAME_ID.test(raw?.id) ? raw.id : null, awayCode: text(raw?.awayCode, 4), homeCode: text(raw?.homeCode, 4),
  away: text(raw?.away, 80), home: text(raw?.home, 80), kickoff: time(raw?.kickoff), started: flag(raw?.started),
});
const late = raw => (record(raw) && number(raw.minutes) !== null ? { deadline: time(raw.deadline), minutes: raw.minutes } : null);

/** One market of a board row: { visible: false } when closed, nothing else. */
function boardMarket(raw) {
  if (raw?.visible !== true) return { visible: false };
  return { visible: true, ...line(raw) };
}

/** The viewer's own row for one market. The guess always; the line at the guess only while that market is open. */
function mineMarket(raw, open) {
  const at = open && record(raw?.lineAtGuess) ? raw.lineAtGuess : null;
  return {
    // Points exist only from kickoff, when the market is open to everyone; under a closed market they would hint at the line.
    guess: number(raw?.guess), lockedIn: flag(raw?.lockedIn), satOut: flag(raw?.satOut), late: late(raw?.late), points: open ? number(raw?.points) : null,
    lineAtGuess: at ? { value: number(at.value), status: text(at.status, 40), basis: text(at.basis, 40), label: text(at.label, 80), capturedAt: time(at.capturedAt), observedAt: time(at.observedAt) } : null,
  };
}

/** /lines/read: every game of the week with its gated lines, the final and the viewer's own rows. */
export function projectLines(raw, viewer) {
  if (!record(raw) || !Array.isArray(raw.games)) throw new Error('Invalid lines reply.');
  return {
    season: Number.isSafeInteger(raw.season) ? raw.season : null, week: Number.isSafeInteger(raw.week) ? raw.week : null,
    now: time(raw.now), published: flag(raw.published), deadline: time(raw.deadline),
    games: raw.games.filter(record).map(row => {
      const cells = Object.fromEntries(MARKETS.map(market => [market, boardMarket(row[market])]));
      return {
        ...game(row), final: final(row.final), ...cells,
        mine: { userId: viewer, ...Object.fromEntries(MARKETS.map(market => [market, mineMarket(row.mine?.[market], cells[market].visible)])) },
      };
    }),
  };
}

/** One market of the game sheet: { visible: false } when closed; else the line, books with prices, movement, kickoff line. */
function gameMarket(raw, market) {
  if (raw?.visible !== true) return { visible: false };
  const books = (Array.isArray(raw.books) ? raw.books : []).filter(book => record(book) && Object.hasOwn(BOOKS, book.book)).slice(0, 3).map(book => ({
    book: book.book, source: BOOKS[book.book], line: number(book.line),
    prices: Object.fromEntries(SIDES[market].map(side => [side, price(book.prices?.[side])])), observedAt: time(book.observedAt),
  }));
  const movement = (Array.isArray(raw.movement) ? raw.movement : []).filter(record).slice(-MAX_MOVEMENT)
    .map(point => ({ value: number(point.value), capturedAt: time(point.capturedAt) }));
  return { visible: true, line: line(raw.line), books, movement, kickoffLine: line(raw.kickoffLine) };
}

/** /lines/game: one game. */
export function projectGameLines(raw) {
  if (!record(raw) || !record(raw.game)) throw new Error('Invalid game lines reply.');
  return {
    season: Number.isSafeInteger(raw.season) ? raw.season : null, week: Number.isSafeInteger(raw.week) ? raw.week : null, now: time(raw.now),
    game: game(raw.game), ...Object.fromEntries(MARKETS.map(market => [market, gameMarket(raw[market], market)])),
  };
}

/**
 * The handler calls this only for a route in LINES_METHODS, after sign-in and email confirmation.
 * featureOff: the names gtl-api's GTL_FEATURE_OFF secret turns off (cloud/feature-off.mjs); `lines` stops both readers.
 */
export async function handleLines({ route, body = {}, user, service, clock = Date.now, featureOff = new Set() }) {
  if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new LinesError(401, 'Sign in to continue.');
  if (!Object.hasOwn(LINES_METHODS, route)) throw new LinesError(404, 'Not found.');
  if (!service?.rpc) throw new Error('Lines are not configured.');
  if (featureOff.has('lines')) throw providerLinesError('GTL_FEATURE_OFF');
  if (!record(body)) invalid();
  const now = new Date(clock()).toISOString();
  if (route === '/lines/read') {
    const target = readWeek(body, ['season', 'week']);
    return projectLines(await service.rpc('gtl_read_lines', { p_user: user.id, ...target, p_now: now }), user.id);
  }
  const target = readWeek(body, ['season', 'week', 'gameId']);
  if (typeof body.gameId !== 'string' || !GAME_ID.test(body.gameId)) invalid();
  return projectGameLines(await service.rpc('gtl_read_game_lines', { p_user: user.id, ...target, p_game: body.gameId, p_now: now }));
}
