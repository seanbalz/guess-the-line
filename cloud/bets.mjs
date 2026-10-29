// Recommendations use the current published account week, independent of a private
// group's older week. Reads reuse existing personal/M-01 RPCs and service-only stored
// quotes; they never collect odds. The old group Virtual Units routes are unchanged.
import { UUID_PATTERN } from './lobby.mjs';
import { TEAM_NAMES } from '../shared/nfl-schedule.mjs';
import { decorateVirtualUnits } from './virtual-units.mjs';
import { parseMarketsVisible } from './line-lock.mjs';
import { readLiveRules } from './live-rules.mjs';
import { bestOffer, newestPerBook } from '../shared/best-offer.mjs';
import { normalizeWeek, rankBoard, rankLabel, seasonBoard } from '../shared/bets-qual.mjs';

export class BetsError extends Error {
  constructor(status, message) { super(message); this.name = 'BetsError'; this.status = status; }
}
/** Route → allowed methods. Group routes take POST JSON bodies; the handler allows them no query parameters. */
export const BETS_METHODS = Object.freeze({ '/bets/recommendations': ['POST'], '/bets/recommendations/place': ['POST'], '/bets/read': ['POST'],
  '/bets/board': ['POST'], '/bets/season': ['POST'], '/bets/place': ['POST'] });
// The account-level Bets readers (M-10, M-12) and placement (M-11): one off switch, GTL_FEATURE_OFF=bets.
// GTL_FEATURE_OFF=bets-place turns off placement alone and keeps the readers.
const BETS_READERS = new Set(['/bets/read', '/bets/board', '/bets/season']);
const BETS_ROUTES = new Set([...BETS_READERS, '/bets/place']);
/** Database refusal code → [status, sentence]. A code is mapped here, and deployed, before the SQL can raise it. */
const ERRORS = Object.freeze({
  GTL_COMMUNITY_MEMBER: [403, 'Open My games and save your display name to join the community.'],
  GTL_PERSONAL_PROFILE: [403, 'Open My games and save your display name to join the community.'],
  GTL_PERSONAL_SLATE: [503, 'This week’s recommendations are not available right now.'],
  GTL_FEATURE_OFF: [503, 'Recommendations are not available right now.'],
  GTL_BETS_WEEK: [409, 'The published week changed. Refresh recommendations before saving.'],
  GTL_VIRTUAL_INVALID: [400, 'Choose a valid side, unit amount and saved named-book quote.'],
  GTL_VIRTUAL_CLOSED: [409, 'This matchup has started. Virtual picks are closed.'],
  GTL_VIRTUAL_QUOTE: [409, 'That saved quote changed. Refresh recommendations and review its terms.'],
  GTL_WEEKLY_CONFLICT: [409, 'Your picks changed on another device. Refresh before saving.'],
  GTL_LINE_LOCKED: [409, 'Submit or lock in your guess for this game and market before placing a pick.'],
  GTL_VIRTUAL_EXISTS: [409, 'You already have this matchup and market on your virtual card.'],
  GTL_BETS_INVALID: [400, 'Choose a published week and league.'],
  GTL_BET_CHANGED: [409, 'This bet changed. Review its saved terms before placing it again.'],
  GTL_BETS_REPLAY: [409, 'This request was already used for different bets. Review your slip and place it again.'],
});
export const providerBetsError = message => (Object.hasOwn(ERRORS, message) ? new BetsError(...ERRORS[message]) : new Error('Bets are unavailable.'));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
const text = value => typeof value === 'string' ? value : null;
const scope = value => Number.isInteger(value?.season) && value.season >= 2000 && value.season <= 2200 && Number.isInteger(value?.week) && value.week >= 1 && value.week <= 25;
const sameWeek = (a, b) => a.season === b.season && a.week === b.week;
const fail = code => { throw providerBetsError(code); };
const MARKETS = ['spread', 'total'];
const SIDES = { spread: ['home', 'away'], total: ['over', 'under'] };
const BOOKS = Object.freeze({ draftkings: 'DraftKings', fanduel: 'FanDuel', betmgm: 'BetMGM', betrivers: 'BetRivers',
  betonlineag: 'BetOnline.ag', betus: 'BetUS', bovada: 'Bovada', lowvig: 'LowVig.ag', mybookieag: 'MyBookie.ag' });
const UUID = UUID_PATTERN;
const integer = value => Number.isSafeInteger(value) && value >= 0;

const leagueOk = value => value === undefined || (typeof value === 'string' && value.length >= 1 && value.length <= 100);
function rosterOf(raw) {
  return (Array.isArray(raw?.roster) ? raw.roster : []).filter(row => UUID.test(row?.userId || ''))
    .map(row => ({ userId: row.userId, displayName: text(row.displayName)?.slice(0, 60) ?? null }));
}
const totalsOf = (rows, members) => (Array.isArray(rows) ? rows : []).filter(row => members.has(row?.userId)).map(row => ({ userId: row.userId, ...normalizeWeek(row) }));
const boardRow = (row, viewer) => ({ userId: row.userId, you: row.userId === viewer, rank: row.rank, rankLabel: rankLabel(row), tied: row.tied,
  wins: row.wins, losses: row.losses, pushes: row.pushes, pending: row.pending, voids: row.voids, picks: row.picks, units: row.units,
  riskUnits: row.riskUnits, netUnits: row.netUnits, roi: row.roi, qualified: row.qualified, ...(Number.isInteger(row.qualifiedWeeks) ? { qualifiedWeeks: row.qualifiedWeeks } : {}) });

/** M-12: one week's board. Rows come from the league roster only; the order is shared/bets-qual.mjs. */
export function projectBoard(raw, viewer) {
  if (!record(raw) || !Array.isArray(raw.roster) || !Array.isArray(raw.rows)) throw new Error('Invalid Bets board reply.');
  const roster = rosterOf(raw), members = new Set(roster.map(row => row.userId));
  const { board, unranked } = rankBoard(totalsOf(raw.rows, members));
  return { season: integer(raw.season) ? raw.season : null, week: integer(raw.week) ? raw.week : null, published: raw.published === true,
    leagueId: text(raw.leagueId), roster, board: board.map(row => boardRow(row, viewer)), unranked: unranked.map(row => boardRow(row, viewer)) };
}

/** M-12: a season, week by week, and the season board (anyone qualified in at least one week). */
export function projectSeason(raw, viewer) {
  if (!record(raw) || !Array.isArray(raw.roster) || !Array.isArray(raw.weeks)) throw new Error('Invalid Bets season reply.');
  const roster = rosterOf(raw), members = new Set(roster.map(row => row.userId));
  const weeks = raw.weeks.filter(week => integer(week?.week) && week.week >= 1 && week.week <= 25)
    .map(week => ({ week: week.week, rows: totalsOf(week.rows, members) }));
  const { board, unranked } = seasonBoard(weeks);
  return { season: integer(raw.season) ? raw.season : null, leagueId: text(raw.leagueId), who: UUID.test(raw.who || '') ? raw.who : null, roster,
    weeks: weeks.map(week => ({ week: week.week, rows: week.rows.map(row => ({ ...row, you: row.userId === viewer })) })),
    board: board.map(row => boardRow(row, viewer)), unranked: unranked.map(row => boardRow(row, viewer)) };
}

/** Rebuild the SQL reply. A forged line under a closed cell never reaches the browser. */
export function projectBets(raw, viewer) {
  if (!record(raw) || !Array.isArray(raw.games) || !Array.isArray(raw.roster) || !Array.isArray(raw.bets)) throw new Error('Invalid Bets reply.');
  const roster = raw.roster.filter(row => UUID.test(row?.userId || '')).map(row => ({ userId: row.userId, displayName: text(row.displayName)?.slice(0, 60) ?? null }));
  const members = new Set(roster.map(row => row.userId));
  const games = raw.games.filter(row => typeof row?.id === 'string' && /^[A-Z]{2,3}-[A-Z]{2,3}$/.test(row.id))
    .map(row => ({ id: row.id, homeCode: text(row.home)?.slice(0, 4) ?? null, awayCode: text(row.away)?.slice(0, 4) ?? null,
      kickoff: finite(row.kickoff) ? new Date(row.kickoff * 1000).toISOString() : null }));
  const ids = new Set(games.map(game => game.id));
  const markets = Object.fromEntries(games.map(game => [game.id, Object.fromEntries(MARKETS.map(market => {
    const cell = raw.markets?.[game.id]?.[market];
    if (cell?.visible !== true) return [market, { visible: false }];
    const quotes = (Array.isArray(cell.quotes) ? cell.quotes : []).filter(q => Object.hasOwn(BOOKS, q?.book)
      && SIDES[market].includes(q?.side) && time(q.observedAt) && time(q.collectedAt) && time(q.capturedAt));
    const offers = Object.fromEntries(SIDES[market].map(side => {
      const candidates = newestPerBook(quotes.filter(q => q.side === side), game.kickoff);
      const chosen = bestOffer(candidates.filter(q => finite(q.line) && Number.isInteger(q.odds)
        && Math.abs(q.odds) >= 100 && Math.abs(q.odds) <= 10000), market, side);
      return [side, chosen ? { book: chosen.book, source: BOOKS[chosen.book], side, line: chosen.line, odds: chosen.odds,
        observedAt: time(chosen.observedAt), collectedAt: time(chosen.collectedAt) } : null];
    }));
    return [market, { visible: true, offers }];
  }))]));
  const bets = raw.bets.filter(row => members.has(row?.userId) && ids.has(row?.gameId) && MARKETS.includes(row?.market))
    .map(row => {
      const own = row.userId === viewer, open = markets[row.gameId][row.market].visible;
      return { userId: row.userId, gameId: row.gameId, market: row.market,
        selection: own || open ? selectionView(row.selection) : {
          side: SIDES[row.market].includes(row.selection?.side) ? row.selection.side : null,
          units: finite(row.selection?.units) && row.selection.units > 0 ? row.selection.units : null,
        },
        status: own || open ? text(row.status) : null, result: own || open ? resultView(row.result) : null,
        audit: own && Array.isArray(row.audit) ? row.audit : null,
        createdAt: own || open ? time(row.createdAt) : null,
        updatedAt: own || open ? time(row.updatedAt) : null };
    });
  const faces = Object.fromEntries(games.map(game => [game.id,
    [...new Set((Array.isArray(raw.faces?.[game.id]) ? raw.faces[game.id] : []).filter(id => members.has(id)))]]));
  const qualification = (Array.isArray(raw.qualification) ? raw.qualification : []).filter(row => members.has(row?.userId))
    .map(row => ({ userId: row.userId, picks: integer(row.picks) ? row.picks : 0,
      units: finite(row.units) && row.units >= 0 ? row.units : 0, qualified: row.qualified === true }));
  return { season: integer(raw.season) ? raw.season : null, week: integer(raw.week) ? raw.week : null,
    published: raw.published === true, now: time(raw.now), leagueId: text(raw.leagueId), revision: integer(raw.revision) ? raw.revision : 0,
    roster, games, markets, bets, faces, qualification };
}

function gamesFromSignature(signature) {
  if (!record(signature) || !Array.isArray(signature.games) || !signature.games.length || signature.games.length > 32) throw new Error('Invalid published slate.');
  const ids = new Set();
  return signature.games.map(game => {
    const kickoff = Number(game?.kickoff) * 1000;
    if (!game || !TEAM_NAMES[game.home] || !TEAM_NAMES[game.away] || game.home === game.away
      || game.id !== `${game.away}-${game.home}` || !Number.isFinite(kickoff) || ids.has(game.id)) throw new Error('Invalid published game.');
    ids.add(game.id);
    return { id: game.id, homeCode: game.home, awayCode: game.away, home: TEAM_NAMES[game.home], away: TEAM_NAMES[game.away], kickoff: new Date(kickoff).toISOString() };
  });
}

function personalView(raw, games, now, rules, ownerId) {
  const ballots = Object.fromEntries(MARKETS.map(market => {
    const mode = `guess_${market}`, ballot = raw.ballots?.[mode];
    return [mode, {
      picks: Object.fromEntries(games.filter(game => finite(ballot?.picks?.[game.id])).map(game => [game.id, ballot.picks[game.id]])),
      submittedAt: time(ballot?.submittedAt),
      lockedAt: Object.fromEntries(games.filter(game => time(ballot?.lockedAt?.[game.id])).map(game => [game.id, ballot.lockedAt[game.id]])),
    }];
  }));
  return { ownerId, season: raw.season, week: raw.week, now: new Date(now).toISOString(), weeklyRevision: Number.isSafeInteger(raw.weeklyRevision) ? raw.weeklyRevision : 0, games, ballots, rules };
}

function selectionView(raw) {
  return { gameId: text(raw?.gameId), market: text(raw?.market), side: text(raw?.side), line: finite(raw?.line) ? raw.line : null,
    odds: finite(raw?.odds) ? raw.odds : null, units: finite(raw?.units) ? raw.units : null, source: text(raw?.source),
    quotedAt: time(raw?.quotedAt), selectedAt: time(raw?.selectedAt) };
}
function resultView(raw) {
  return record(raw) ? { status: text(raw.status), home: finite(raw.home) ? raw.home : null, away: finite(raw.away) ? raw.away : null,
    netUnits: finite(raw.netUnits) ? raw.netUnits : null, reason: text(raw.reason), source: text(raw.source), sourceUrl: text(raw.sourceUrl), observedAt: time(raw.observedAt) } : null;
}
function pickView(raw, games, ownerId) {
  const ids = new Set(games.map(game => game.id));
  return (Array.isArray(raw) ? raw : []).filter(pick => ids.has(pick.game_id) && MARKETS.includes(pick.market)).map(pick => ({
    ownerId, gameId: pick.game_id, market: pick.market, selection: selectionView(pick.selection), status: text(pick.status), result: resultView(pick.result),
    createdAt: time(pick.created_at), updatedAt: time(pick.updated_at),
  }));
}
function summaryOf(picks) {
  const count = status => picks.filter(pick => pick.status === status).length;
  const settled = picks.filter(pick => ['win', 'loss', 'push'].includes(pick.status));
  const units = pick => finite(pick.selection.units) ? pick.selection.units : 0;
  const riskUnits = settled.reduce((sum, pick) => sum + units(pick), 0);
  const netUnits = settled.reduce((sum, pick) => sum + (pick.result?.netUnits ?? (pick.status === 'loss' ? -units(pick) : 0)), 0);
  return { wins: count('win'), losses: count('loss'), pushes: count('push'), pending: count('pending'), voids: count('void'), riskUnits, netUnits,
    roi: riskUnits ? Math.round(netUnits / riskUnits * 10000) / 100 : null, qualificationPicks: picks.length, qualificationUnits: picks.reduce((sum, pick) => sum + units(pick), 0) };
}
function offerView(offer) {
  return offer ? { book: offer.book, source: offer.source, side: offer.side, line: offer.line, odds: offer.odds, observedAt: offer.observedAt, collectedAt: offer.collectedAt } : null;
}

/** Account-week data; older weeks keep saved cards readable. Every gate is from M-01; failures stay closed. */
export async function readRecommendations({ user, service, clock = Date.now, optionalRpc, selectedWeek = null }) {
  if (await service.rpc('gtl_community_member', { p_user: user.id }) !== true) fail('GTL_COMMUNITY_MEMBER');
  const raw = await service.rpc('gtl_read_personal', { p_user: user.id, p_season: selectedWeek?.season ?? null, p_week: selectedWeek?.week ?? null, p_cursor: null, p_archived: false });
  if (!scope(raw)) throw new Error('Invalid current week.');
  if (selectedWeek && !sameWeek(raw, selectedWeek)) throw new Error('Invalid selected week.');
  const slates = (Array.isArray(raw.slates) ? raw.slates : []).filter(scope).map(({ season, week }) => ({ season, week }))
    .sort((a, b) => b.season - a.season || b.week - a.week);
  if (!slates.length || !slates.some(week => sameWeek(week, raw))) throw new Error('Invalid published weeks.');
  const publishedWeek = slates[0], current = sameWeek(raw, publishedWeek);
  const now = clock(), args = { p_user: user.id, p_season: raw.season, p_week: raw.week };
  const [signature, visible, rules] = await Promise.all([
    service.rpc('gtl_personal_context', args), service.rpc('gtl_markets_visible', { ...args, p_now: new Date(now).toISOString() }), readLiveRules(optionalRpc),
  ]);
  const games = gamesFromSignature(signature), gate = { season: raw.season, week: raw.week, games: parseMarketsVisible(visible), markets: null };
  // Membership and the exact slate are established before the privileged storage read.
  const stored = await service.recommendationState({ userId: user.id, season: raw.season, week: raw.week, signature, now });
  if (!record(stored) || !Array.isArray(stored.picks) || !Array.isArray(stored.settlements)) throw new Error('Recommendation data unavailable.');
  const personal = personalView(raw, games, now, rules, user.id), picks = pickView(stored.picks, games, user.id), summary = summaryOf(picks), results = {};
  const ids = new Set(games.map(game => game.id));
  for (const result of stored.settlements) if (ids.has(result.game_id) && !Object.hasOwn(results, result.game_id)) {
    results[result.game_id] = { ...resultView({ ...result, sourceUrl: result.source_url, observedAt: result.observed_at }), version: result.version, settledAt: time(result.settled_at) };
  }
  const lastSettledAt = Object.values(results).map(result => result.settledAt).filter(Boolean).sort().at(-1) ?? null;
  const virtual = decorateVirtualUnits({ season: raw.season, week: raw.week, revision: personal.weeklyRevision, games, picks, results, summary,
    settlement: { lastSettledAt, settledGames: Object.keys(results).length, settledPicks: picks.length - summary.pending, pendingPicks: summary.pending },
    quoteHistoryAvailable: Boolean(stored.snapshot), scope: current ? 'account_current' : 'account_history', playerId: user.id, current,
  }, stored.snapshot, { gate, now, rules });
  // Drop provider payload/outcomes: only a visible market's exact named-book terms leave the server.
  virtual.games = virtual.games.map(game => ({ ...game, offers: Object.fromEntries(Object.entries(game.offers).map(([market, sides]) => [market,
    Object.fromEntries(Object.entries(sides).map(([side, offer]) => [side, offerView(offer)])),
  ])) }));
  return { personal, virtual, slates, publishedWeek, current };
}

const PLACE_KEYS = ['season', 'week', 'revision', 'gameId', 'market', 'side', 'line', 'odds', 'units', 'source', 'quotedAt'];
function validatePlace(body) {
  if (!scope(body) || !Number.isSafeInteger(body.revision) || body.revision < 0 || Object.keys(body).some(key => !PLACE_KEYS.includes(key))
    || typeof body.gameId !== 'string' || !/^[A-Z]{2,3}-[A-Z]{2,3}$/.test(body.gameId) || !SIDES[body.market]?.includes(body.side)
    || !finite(body.line) || !Number.isInteger(body.line * 2) || (body.market === 'total' ? body.line < 0 || body.line > 200 : Math.abs(body.line) > 100)
    || !Number.isInteger(body.odds) || Math.abs(body.odds) < 100 || Math.abs(body.odds) > 10000
    || !finite(body.units) || body.units <= 0 || !Number.isInteger(body.units * 2) || typeof body.source !== 'string' || !time(body.quotedAt)) fail('GTL_VIRTUAL_INVALID');
}

// M-11: a slip of up to 64 bets. Each names the exact offer it was read with and, for an edit, the
// stored terms it replaces (`expected`); a new bet sends `expected: null`. SQL repeats every check.
const SLIP_KEYS = ['gameId', 'market', 'side', 'line', 'odds', 'units', 'source', 'quotedAt', 'expected'];
const TERM_KEYS = ['side', 'line', 'odds', 'units', 'source', 'quotedAt'];
const SOURCES = new Set(Object.values(BOOKS));
function validTerms(market, terms) {
  return SIDES[market]?.includes(terms.side) && finite(terms.line) && Number.isInteger(terms.line * 2)
    && (market === 'total' ? terms.line >= 0 && terms.line <= 200 : Math.abs(terms.line) <= 100)
    && Number.isInteger(terms.odds) && Math.abs(terms.odds) >= 100 && Math.abs(terms.odds) <= 10000
    && finite(terms.units) && terms.units > 0 && Number.isInteger(terms.units * 2) && SOURCES.has(terms.source) && Boolean(time(terms.quotedAt));
}
function validateBetsPlace(body) {
  const keys = Object.keys(body);
  if (keys.length !== 4 || !['season', 'week', 'requestId', 'bets'].every(key => keys.includes(key)) || !scope(body)
    || !UUID.test(body.requestId || '') || !Array.isArray(body.bets) || body.bets.length < 1 || body.bets.length > 64) fail('GTL_VIRTUAL_INVALID');
  const seen = new Set();
  return body.bets.map(bet => {
    if (!record(bet) || Object.keys(bet).some(key => !SLIP_KEYS.includes(key)) || !Object.hasOwn(bet, 'expected')
      || typeof bet.gameId !== 'string' || !/^[A-Z]{2,3}-[A-Z]{2,3}$/.test(bet.gameId) || !MARKETS.includes(bet.market)
      || seen.has(`${bet.gameId}:${bet.market}`) || !validTerms(bet.market, bet)
      || (bet.expected !== null && (!record(bet.expected) || Object.keys(bet.expected).some(key => !TERM_KEYS.includes(key))
        || !validTerms(bet.market, bet.expected)))) fail('GTL_VIRTUAL_INVALID');
    seen.add(`${bet.gameId}:${bet.market}`);
    return { gameId: bet.gameId, market: bet.market, side: bet.side, line: bet.line, odds: bet.odds, units: bet.units, source: bet.source,
      quotedAt: bet.quotedAt, expected: bet.expected === null ? null : Object.fromEntries(TERM_KEYS.map(key => [key, bet.expected[key]])) };
  });
}
function placedView(raw) {
  if (!record(raw) || !Array.isArray(raw.bets)) throw new Error('Invalid Bets place reply.');
  return { season: integer(raw.season) ? raw.season : null, week: integer(raw.week) ? raw.week : null, requestId: UUID.test(raw.requestId || '') ? raw.requestId : null,
    revision: integer(raw.revision) ? raw.revision : null, replayed: raw.replayed === true,
    bets: raw.bets.map(row => ({ ...selectionView(row), edited: row?.edited === true })) };
}

/** The handler calls this only for a route in BETS_METHODS, after sign-in and email confirmation. */
export async function handleBets({ route, body = {}, user, service, clock = Date.now, optionalRpc, featureOff = new Set() }) {
  if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new BetsError(401, 'Sign in to continue.');
  if (!Object.hasOwn(BETS_METHODS, route)) throw new BetsError(404, 'Not found.');
  if (!service?.rpc) throw new Error('Bets are not configured.');
  if ((BETS_ROUTES.has(route) && featureOff.has('bets'))
    || (route === '/bets/place' && featureOff.has('bets-place'))
    || (!BETS_ROUTES.has(route) && featureOff.has('recommendations'))) fail('GTL_FEATURE_OFF');
  if (!record(body)) fail('GTL_VIRTUAL_INVALID');
  if (route === '/bets/read') {
    if (Object.keys(body).some(key => !['season','week','leagueId'].includes(key))
      || (body.season === undefined) !== (body.week === undefined)
      || (body.season !== undefined && !scope(body))
      || (body.leagueId !== undefined && (typeof body.leagueId !== 'string' || body.leagueId.length < 1 || body.leagueId.length > 100)))
      fail('GTL_BETS_INVALID');
    return projectBets(await service.rpc('gtl_read_bets', { p_user: user.id, p_season: body.season ?? null,
      p_week: body.week ?? null, p_league: body.leagueId ?? null, p_now: new Date(clock()).toISOString() }), user.id);
  }
  if (route === '/bets/board') {
    if (Object.keys(body).some(key => !['season','week','leagueId'].includes(key))
      || (body.season === undefined) !== (body.week === undefined)
      || (body.season !== undefined && !scope(body)) || !leagueOk(body.leagueId)) fail('GTL_BETS_INVALID');
    return projectBoard(await service.rpc('gtl_read_bets_board', { p_user: user.id, p_season: body.season ?? null,
      p_week: body.week ?? null, p_league: body.leagueId ?? null }), user.id);
  }
  if (route === '/bets/season') {
    if (Object.keys(body).some(key => !['season','leagueId','who'].includes(key))
      || (body.season !== undefined && !(Number.isInteger(body.season) && body.season >= 2000 && body.season <= 2200))
      || !leagueOk(body.leagueId) || (body.who !== undefined && !UUID.test(body.who || ''))) fail('GTL_BETS_INVALID');
    return projectSeason(await service.rpc('gtl_read_bets_season', { p_user: user.id, p_season: body.season ?? null,
      p_league: body.leagueId ?? null, p_who: body.who ?? null }), user.id);
  }
  if (route === '/bets/place') {
    const request = validateBetsPlace(body);
    const placed = await service.rpc('gtl_place_bets', { p_user: user.id, p_season: body.season, p_week: body.week,
      p_request: body.requestId, p_bets: request });
    return { placed: placedView(placed), bets: projectBets(await service.rpc('gtl_read_bets', { p_user: user.id, p_season: body.season,
      p_week: body.week, p_league: null, p_now: new Date(clock()).toISOString() }), user.id) };
  }
  if (typeof service.recommendationState !== 'function') throw new Error('Bets are not configured.');
  if (route === '/bets/recommendations') {
    const keys = Object.keys(body);
    if (keys.length && (keys.length !== 2 || !keys.includes('season') || !keys.includes('week') || !scope(body))) throw new BetsError(400, 'Choose a published season and week. Player identity comes from sign-in.');
    return readRecommendations({ user, service, clock, optionalRpc, selectedWeek: keys.length ? { season: body.season, week: body.week } : null });
  }
  validatePlace(body);
  const current = await readRecommendations({ user, service, clock, optionalRpc });
  if (!sameWeek(body, current.virtual)) fail('GTL_BETS_WEEK');
  if (body.revision !== current.virtual.revision) fail('GTL_WEEKLY_CONFLICT');
  const game = current.virtual.games.find(game => game.id === body.gameId);
  if (!game) fail('GTL_VIRTUAL_INVALID');
  if (clock() >= Date.parse(game.kickoff) || current.virtual.results[game.id]) fail('GTL_VIRTUAL_CLOSED');
  if (game.locked[body.market]) fail('GTL_LINE_LOCKED');
  if (current.virtual.picks.some(pick => pick.gameId === game.id && pick.market === body.market)) fail('GTL_VIRTUAL_EXISTS');
  const offer = game.offers[body.market]?.[body.side];
  if (!offer || offer.book !== body.source || offer.line !== body.line || offer.odds !== body.odds || Date.parse(offer.observedAt) !== Date.parse(body.quotedAt)) fail('GTL_VIRTUAL_QUOTE');
  // The additive writer repeats membership, current week, gate, quote, revision and kickoff
  // checks atomically. It never replaces another saved pick; old group edits stay on their old route.
  await service.rpc('gtl_save_recommended_virtual_pick', { p_user: user.id, p_season: body.season, p_week: body.week, p_revision: body.revision,
    p_body: { gameId: body.gameId, market: body.market, side: body.side, line: offer.line, odds: offer.odds, units: body.units, source: offer.source, quotedAt: offer.observedAt } });
  return readRecommendations({ user, service, clock, optionalRpc });
}
