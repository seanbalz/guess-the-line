const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARKETS = new Set(['spread','total']);
const SIDES = { spread: new Set(['home','away']), total: new Set(['over','under']) };
const BOOKS = { draftkings: 'DraftKings', fanduel: 'FanDuel', betmgm: 'BetMGM', betrivers: 'BetRivers', betonlineag: 'BetOnline.ag', betus: 'BetUS', bovada: 'Bovada', lowvig: 'LowVig.ag', mybookieag: 'MyBookie.ag' };
const point = (value, market) => Number.isFinite(value) && Number.isInteger(value * 2) && value >= (market === 'total' ? 0 : -100) && value <= (market === 'total' ? 200 : 100);
const odds = value => Number.isInteger(value) && Math.abs(value) >= 100 && Math.abs(value) <= 10000;
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
export const VIRTUAL_METHODS = { '/virtual-units': ['GET'], '/virtual-pick': ['POST'] };
export class VirtualUnitsError extends Error { constructor(status, message) { super(message); this.status = status; } }
const ERRORS = {
  GTL_FORBIDDEN: [403, 'Your account has not been added to this league.'],
  GTL_VIRTUAL_INVALID: [400, 'Choose a valid side, unit amount and saved named-book quote.'],
  GTL_VIRTUAL_CLOSED: [400, 'This matchup has started. Virtual picks and edits are closed.'],
  GTL_WEEKLY_CONFLICT: [409, 'Your virtual picks changed on another device. Refresh before saving again.'],
  GTL_VIRTUAL_QUOTE: [409, 'That saved quote is no longer available. Review the latest offered line before confirming.'],
};
export const providerVirtualError = message => ERRORS[message] ? new VirtualUnitsError(...ERRORS[message]) : new Error('Virtual units data is unavailable.');

function validateBody(body) {
  const allowed = ['gameId','market','side','line','odds','units','source','quotedAt'];
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) ||
    typeof body.gameId !== 'string' || body.gameId.length < 1 || body.gameId.length > 80 || !MARKETS.has(body.market) || !SIDES[body.market].has(body.side) ||
    !point(body.line, body.market) || !odds(body.odds) || !Number.isFinite(body.units) || body.units <= 0 || !Number.isInteger(body.units * 2) ||
    typeof body.source !== 'string' || !BOOKS[body.source] || !iso(body.quotedAt)) throw providerVirtualError('GTL_VIRTUAL_INVALID');
  return { ...body, line: Number(body.line), odds: Number(body.odds), units: Number(body.units), source: BOOKS[body.source] || body.source, quotedAt: iso(body.quotedAt) };
}

function latestQuotes(snapshot, game, market) {
  const sources = [snapshot, ...(Array.isArray(snapshot?.history) ? snapshot.history : [])];
  const byBook = new Map();
  for (const item of sources) {
    const captured = Date.parse(item?.createdAt);
    const row = item?.payload?.games?.find(candidate => candidate?.gameId === game.id && candidate.home === game.home && candidate.away === game.away && Date.parse(candidate.kickoff) === Date.parse(game.kickoff));
    for (const quote of row?.markets?.[market]?.quotes || []) {
      const observed = iso(quote.providerObservedAt), collected = iso(quote.collectedAt);
      if (!Number.isFinite(captured) || !observed || !collected || quote.provider !== 'the-odds-api' || !BOOKS[quote.book] || quote.market !== market || Date.parse(observed) > Date.parse(collected) || Date.parse(collected) > captured || Date.parse(observed) >= Date.parse(game.kickoff)) continue;
      const outcome = quote.outcomes?.[market === 'spread' ? 'home' : 'over'];
      if (!outcome || !point(Number(quote.value), market) || !odds(Number(outcome.odds))) continue;
      if (!byBook.has(quote.book)) byBook.set(quote.book, { book: quote.book, source: BOOKS[quote.book], value: Number(quote.value), outcomes: quote.outcomes, observedAt: observed, collectedAt: collected });
    }
  }
  return [...byBook.values()];
}

function bestOffers(game, snapshot) {
  return Object.fromEntries(['spread','total'].map(market => {
    const quotes = latestQuotes(snapshot, game, market);
    const offers = Object.fromEntries([...(market === 'spread' ? ['home','away'] : ['over','under'])].map(side => [side, quotes.map(q => ({ ...q, side, line: Number(q.outcomes[side].line), odds: Number(q.outcomes[side].odds) })).filter(q => point(q.line, market) && odds(q.odds)).sort((a,b) => {
      const line = market === 'spread' ? b.line - a.line : side === 'over' ? a.line - b.line : b.line - a.line;
      return line || (Math.abs(a.odds - (-110)) - Math.abs(b.odds - (-110))) || Date.parse(b.observedAt) - Date.parse(a.observedAt) || a.book.localeCompare(b.book);
    }).slice(0,1)[0] || null]));
    return [market, offers];
  }));
}

function decorate(payload, snapshot) {
  const now = Date.now();
  const games = (payload.games || []).map(game => ({ ...game, pacificDate: new Intl.DateTimeFormat('en-US', { timeZone:'America/Los_Angeles', month:'short', day:'numeric' }).format(new Date(game.kickoff)), offers: bestOffers(game, snapshot) }));
  return { ...payload, games, source: 'The Odds API saved named-book quotes', sourceUrl: 'https://the-odds-api.com/liveapi/guides/v4/', quoteCutoff: null, now: new Date(now).toISOString(), automaticResults: false };
}

export async function handleVirtualUnits({ route, body, user, leagueId, service, weekly, odds, clock = Date.now }) {
  if (!service?.read || !service?.save) throw new VirtualUnitsError(503, 'The virtual units service is not connected yet.');
  if (route === '/virtual-units') {
    const [payload, snapshot] = await Promise.all([service.read(user.id, leagueId), odds.marketSnapshot(user.id, leagueId).catch(() => null)]);
    return decorate({ ...payload, quoteHistoryAvailable: Boolean(snapshot) }, snapshot);
  }
  const pick = validateBody(body);
  const state = await weekly.load(user.id, leagueId);
  const game = state?.state?.games?.find(item => item.id === pick.gameId);
  if (!game) throw providerVirtualError('GTL_VIRTUAL_INVALID');
  if (clock() >= Date.parse(game.kickoff)) throw providerVirtualError('GTL_VIRTUAL_CLOSED');
  const snapshot = await odds.marketSnapshot(user.id, leagueId).catch(() => null);
  const offered = latestQuotes(snapshot, game, pick.market).flatMap(q => [pick.side].map(side => ({ ...q, line: Number(q.outcomes[side].line), odds: Number(q.outcomes[side].odds) })));
  const matched = offered.some(q => q.source === pick.source && q.line === pick.line && q.odds === pick.odds && q.observedAt === pick.quotedAt);
  if (!matched) throw providerVirtualError('GTL_VIRTUAL_QUOTE');
  const revision = state.revision;
  const next = await service.save(user.id, leagueId, revision, pick);
  return handleVirtualUnits({ route:'/virtual-units', user, leagueId, service, weekly, odds, clock }).then(result => ({ ...result, saved:true, revision:next }));
}
