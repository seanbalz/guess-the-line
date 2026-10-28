// Server-only The Odds API V4 adapter. Do not import into web/ or return its
// complete result directly to browsers. Apply per-market ballot reveal first.
// Official docs checked 2026-10-08:
// https://the-odds-api.com/liveapi/guides/v4/
// https://the-odds-api.com/terms-and-conditions.html
export const ODDS_API_ORIGIN = 'https://api.the-odds-api.com';
const ORIGIN = ODDS_API_ORIGIN;
const SPORT = 'americanfootball_nfl';
const MAX_BODY = 1024 * 1024;
const MAX_EVENTS = 64;
const MAX_COST = 2;
const FRESH_MS = 5 * 60_000;
const FREE_US_BOOKS = Object.freeze({
  draftkings: 'DraftKings', fanduel: 'FanDuel', betmgm: 'BetMGM', betrivers: 'BetRivers',
  betonlineag: 'BetOnline.ag', betus: 'BetUS', bovada: 'Bovada', lowvig: 'LowVig.ag', mybookieag: 'MyBookie.ag',
});
export const DEFAULT_ODDS_BOOKS = Object.freeze(['draftkings', 'fanduel', 'betmgm']);
const ERRORS = {
  ODDS_CONFIG: 'The odds provider configuration is invalid.',
  ODDS_SLATE: 'The saved schedule is invalid. Review it before collecting quotes.',
  ODDS_BUSY: 'An odds collection is already running.',
  ODDS_BUDGET: 'The reserved free quota does not allow another odds collection.',
  ODDS_AUTH: 'The odds provider did not accept its server credentials.',
  ODDS_RATE_LIMIT: 'The odds provider is limiting requests. Try again later.',
  ODDS_UNAVAILABLE: 'The odds provider is temporarily unavailable.',
  ODDS_TIMEOUT: 'The odds provider request timed out.',
  ODDS_PAYLOAD: 'The odds provider returned an invalid response.',
  ODDS_BODY_LIMIT: 'The odds provider response exceeded the allowed size.',
  ODDS_QUOTA_COST: 'The odds provider reported an unexpected collection cost. Review quota before collecting again.',
};
export class OddsProviderError extends Error {
  constructor(code, quota = null) { super(ERRORS[code]); this.name = 'OddsProviderError'; this.code = code; this.quota = quota; }
}
const fail = code => { throw new OddsProviderError(code); };
const record = v => !!v && typeof v === 'object' && !Array.isArray(v);
const isoTime = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;
const iso = value => new Date(value).toISOString();
// V4 query examples use whole-second UTC; response/event identity keeps exact precision.
const queryTime = value => iso(value).replace(/\.\d{3}Z$/, 'Z');
const PROVIDER_CODES = new Set(['MISSING_KEY','INVALID_KEY','DEACTIVATED_KEY','EXCEEDED_FREQ_LIMIT','OUT_OF_USAGE_CREDITS',
  'MISSING_REGION','INVALID_REGION','INVALID_BOOKMAKERS','MISSING_MARKET','INVALID_MARKET','INVALID_DATE_FORMAT','INVALID_ODDS_FORMAT',
  'INVALID_SPORT','UNKNOWN_SPORT','INVALID_EVENT_IDS','INVALID_EVENT_ID','EVENT_NOT_FOUND','INVALID_COMMENCE_TIME_FROM','INVALID_COMMENCE_TIME_TO','INVALID_COMMENCE_TIME_RANGE']);
const HTTP_STATUSES = new Set([400,401,403,404,422,429,500,502,503,504]);
const token = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const american = value => Number.isInteger(value) && Math.abs(value) >= 100 && Math.abs(value) <= 10000;
const point = (value, total) => Number.isFinite(value) && Number.isInteger(value * 2) && value >= (total ? 0 : -100) && value <= (total ? 200 : 100);
export const readQuota = headers => Object.fromEntries(['remaining', 'used', 'last'].map(key => {
  const raw = headers.get(`x-requests-${key}`);
  return [key, raw !== null && /^\d{1,9}$/.test(raw) ? Number(raw) : null];
}));
// A team plays once a week, but one collection may also carry the previous week's games that have not kicked off
// (a Monday night game after the next week opens; gtl_odds_carryover_slate), so the same team may appear twice only
// in games at least two days apart. A repeated game or a team twice at about the same time still fails.
const TEAM_GAP_MS = 2 * 86_400_000;
function validateGames(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 32) fail('ODDS_SLATE');
  const ids = new Set(), teams = new Map();
  return input.map(game => {
    const kickoff = record(game) ? isoTime(game.kickoff) : NaN;
    const clash = team => (teams.get(team) || []).some(other => Math.abs(other - kickoff) < TEAM_GAP_MS);
    if (!record(game) || !token(game.id) || ids.has(game.id) ||
      ![game.home, game.away].every(t => typeof t === 'string' && t.length >= 3 && t.length <= 80 && t.trim() === t) ||
      game.home === game.away || clash(game.home) || clash(game.away) || !Number.isFinite(kickoff)) fail('ODDS_SLATE');
    ids.add(game.id);
    for (const team of [game.home, game.away]) teams.set(team, [...(teams.get(team) || []), kickoff]);
    return { id: game.id, home: game.home, away: game.away, kickoff: iso(kickoff) };
  });
}
function matchEvents(events, games, now) {
  const counts = new Map();
  for (const e of events) if (record(e) && token(e.id)) counts.set(e.id, (counts.get(e.id) || 0) + 1);
  return games.map(game => {
    if (now >= isoTime(game.kickoff)) return { game, event: null, reason: 'kickoff_passed' };
    const paired = events.filter(e => record(e) && ((e.home_team === game.home && e.away_team === game.away) || (e.home_team === game.away && e.away_team === game.home)));
    const exact = paired.filter(e => e.sport_key === SPORT && e.home_team === game.home && e.away_team === game.away && isoTime(e.commence_time) === isoTime(game.kickoff) && token(e.id) && e.completed !== true);
    if (exact.length > 1 || exact.some(e => counts.get(e.id) !== 1)) return { game, event: null, reason: 'ambiguous_event' };
    if (exact.length !== 1) return { game, event: null, reason: paired.length ? 'schedule_mismatch' : 'event_missing' };
    return { game, event: exact[0], reason: null };
  });
}
function marketQuote(event, game, book, marketKey, now) {
  const rows = Array.isArray(book.markets) ? book.markets.filter(m => record(m) && m.key === marketKey) : [];
  if (rows.length !== 1) return { reason: rows.length ? 'ambiguous_market' : 'market_missing' };
  const market = rows[0], updated = isoTime(market.last_update);
  // Current V4 documentation deprecates book-level last_update. Never substitute it.
  if (!Number.isFinite(updated)) return { reason: 'market_timestamp_missing' };
  if (updated > now || updated >= isoTime(game.kickoff)) return { reason: 'invalid_market_timestamp' };
  if (now - updated > FRESH_MS) return { reason: 'stale_market' };
  if (now >= isoTime(game.kickoff)) return { reason: 'kickoff_passed' };
  const outcomes = market.outcomes;
  if (!Array.isArray(outcomes) || outcomes.length !== 2 || outcomes.some(o => !record(o) || !american(o.price) || !point(o.point, marketKey === 'totals'))) return { reason: 'invalid_outcomes' };
  const names = marketKey === 'spreads' ? [game.home, game.away] : ['Over', 'Under'];
  const first = outcomes.find(o => o.name === names[0]), second = outcomes.find(o => o.name === names[1]);
  if (!first || !second || first === second || (marketKey === 'spreads' ? first.point !== -second.point : first.point !== second.point)) return { reason: 'unpaired_outcomes' };
  const bookStamp = isoTime(book.last_update);
  return { quote: {
    provider: 'the-odds-api', providerEventId: event.id, book: book.key, source: FREE_US_BOOKS[book.key],
    market: marketKey === 'spreads' ? 'spread' : 'total', value: Object.is(first.point, -0) ? 0 : first.point,
    // Signed home spread; total is combined points. Both recorded prices remain paired.
    outcomes: marketKey === 'spreads'
      ? { home: { line: first.point, odds: first.price }, away: { line: second.point, odds: second.price } }
      : { over: { line: first.point, odds: first.price }, under: { line: second.point, odds: second.price } },
    providerObservedAt: iso(updated), timeBasis: 'provider_market_last_update',
    bookmakerUpdatedAt: Number.isFinite(bookStamp) ? iso(bookStamp) : null,
    collectedAt: iso(now), tradability: 'not_confirmed',
  } };
}
function normalize(matches, books, now) {
  return matches.map(({ game, event, reason }) => ({
    gameId: game.id, home: game.home, away: game.away, kickoff: game.kickoff,
    providerEventId: event?.id ?? null, matchStatus: reason || 'matched',
    markets: Object.fromEntries([['spread', 'spreads'], ['total', 'totals']].map(([key, providerKey]) => {
      const quotes = [], unavailable = [];
      for (const bookKey of books) {
        if (reason) { unavailable.push({ book: bookKey, reason }); continue; }
        const candidates = Array.isArray(event.bookmakers) ? event.bookmakers.filter(b => record(b) && b.key === bookKey) : [];
        if (candidates.length !== 1) { unavailable.push({ book: bookKey, reason: candidates.length ? 'ambiguous_book' : 'book_missing' }); continue; }
        const outcome = marketQuote(event, game, candidates[0], providerKey, now);
        if (outcome.quote) quotes.push(outcome.quote); else unavailable.push({ book: bookKey, reason: outcome.reason });
      }
      return [key, { status: quotes.length ? (unavailable.length ? 'partial' : 'available') : (unavailable.some(b => b.reason === 'stale_market') ? 'stale' : 'unavailable'), quotes, unavailable }];
    })),
  }));
}
async function boundedJson(response, { maxBytes = MAX_BODY, expectArray = true } = {}) {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBytes)) {
    await response.body?.cancel().catch(() => {}); fail('ODDS_BODY_LIMIT');
  }
  if (!(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === 'application/json')) {
    await response.body?.cancel().catch(() => {}); fail('ODDS_PAYLOAD');
  }
  const reader = response.body?.getReader();
  if (!reader) fail('ODDS_PAYLOAD');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel().catch(() => {}); fail('ODDS_BODY_LIMIT'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail('ODDS_PAYLOAD'); }
  if (expectArray ? (!Array.isArray(data) || data.length > MAX_EVENTS) : !record(data)) fail('ODDS_PAYLOAD');
  return data;
}

/**
 * collect({games,remainingCredits,reserveCredits=50}) does one free event preflight,
 * then at most one 2-credit request. It never retries, starts a schedule, or persists.
 * A future collector must add a shared database lease and quota reservation across
 * server instances; this instance's busy/budget guard is only a second defense.
 */
export function createOddsProvider({ apiKey, fetchImpl = fetch, clock = Date.now, bookmakers = DEFAULT_ODDS_BOOKS, timeoutMs = 10000 } = {}) {
  if (typeof apiKey !== 'string' || apiKey.length < 8 || apiKey.length > 256 || /\s/.test(apiKey) ||
    !Array.isArray(bookmakers) || !bookmakers.length || bookmakers.length > 10 || new Set(bookmakers).size !== bookmakers.length || bookmakers.some(b => !Object.hasOwn(FREE_US_BOOKS, b)) ||
    !Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 10000) fail('ODDS_CONFIG');
  const books = [...bookmakers];
  let busy = false, knownRemaining = null, stopped = false;
  async function request(endpoint, params = {}) {
    const url = new URL(`/v4/sports/${SPORT}/${endpoint}`, ORIGIN);
    url.search = new URLSearchParams({ apiKey, dateFormat: 'iso', ...params });
    const controller = new AbortController(); let timer, observedQuota = null, observedStatus = null, observedCode = null;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal });
          const quota = readQuota(response.headers); observedQuota = quota;
          observedStatus = HTTP_STATUSES.has(response.status) ? response.status : null;
          if (!response.ok) {
            try {
              const diagnostic = await boundedJson(response, { maxBytes: 4096, expectArray: false });
              observedCode = PROVIDER_CODES.has(diagnostic.error_code) ? diagnostic.error_code : null;
            } catch { /* Only a small, fixed code allowlist can escape an error body. */ }
            throw new OddsProviderError([401, 403].includes(response.status) ? 'ODDS_AUTH' : response.status === 429 ? 'ODDS_RATE_LIMIT' : 'ODDS_UNAVAILABLE', quota);
          }
          return { data: await boundedJson(response), quota };
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new OddsProviderError('ODDS_TIMEOUT', observedQuota)); }, timeoutMs); }),
      ]);
    } catch (error) {
      if (error instanceof OddsProviderError) {
        if (!error.quota && observedQuota) error.quota = observedQuota;
        error.diagnostic = { httpStatus: observedStatus, code: observedCode };
        throw error;
      }
      // Never forward fetch exception messages, response error bodies, URLs or causes.
      throw new OddsProviderError('ODDS_UNAVAILABLE', observedQuota);
    } finally { clearTimeout(timer); }
  }
  const noteQuota = quota => { if (quota.remaining !== null) knownRemaining = knownRemaining === null ? quota.remaining : Math.min(knownRemaining, quota.remaining); };
  return {
    async preflight({ games: input } = {}) {
      const games = validateGames(input);
      if (busy) fail('ODDS_BUSY');
      busy = true;
      try {
        const kickoffs = games.map(g => isoTime(g.kickoff));
        const result = await request('events', {
          commenceTimeFrom: queryTime(Math.min(...kickoffs) - 86400000),
          commenceTimeTo: queryTime(Math.max(...kickoffs) + 86400000),
        });
        noteQuota(result.quota);
        if (result.quota.last !== null && result.quota.last > 0) { stopped = true; throw new OddsProviderError('ODDS_QUOTA_COST', result.quota); }
        const now = clock();
        return { provider: 'the-odds-api', sport: SPORT, fetchedAt: iso(now), officialVerified: false,
          games: matchEvents(result.data, games, now).map(({ game, event, reason }) => ({
            gameId: game.id, home: game.home, away: game.away, kickoff: game.kickoff,
            providerEventId: event?.id ?? null, matchStatus: reason || 'matched',
          })), quota: result.quota,
        };
      } catch (error) { if (error instanceof OddsProviderError) throw error; throw new OddsProviderError('ODDS_UNAVAILABLE'); }
      finally { busy = false; }
    },
    async collect({ games: input, remainingCredits, reserveCredits = 50 } = {}) {
      const games = validateGames(input);
      if (!Number.isSafeInteger(remainingCredits) || remainingCredits < 0 || !Number.isSafeInteger(reserveCredits) || reserveCredits < 0) fail('ODDS_BUDGET');
      const budget = () => Math.min(remainingCredits, knownRemaining ?? remainingCredits);
      if (stopped || budget() - MAX_COST < reserveCredits) fail('ODDS_BUDGET');
      if (busy) fail('ODDS_BUSY');
      busy = true;
      try {
        const start = clock(); if (!Number.isFinite(start)) fail('ODDS_CONFIG');
        const kickoffs = games.map(g => isoTime(g.kickoff));
        const preflight = await request('events', {
          commenceTimeFrom: queryTime(Math.min(...kickoffs) - 86400000),
          commenceTimeTo: queryTime(Math.max(...kickoffs) + 86400000),
        }); noteQuota(preflight.quota);
        if (preflight.quota.last !== null && preflight.quota.last > 0) { stopped = true; throw new OddsProviderError('ODDS_QUOTA_COST', preflight.quota); }
        let matches = matchEvents(preflight.data, games, clock());
        const ids = matches.filter(m => m.event).map(m => m.event.id);
        let quota = preflight.quota, attemptedOdds = false;
        if (ids.length) {
          if (budget() - MAX_COST < reserveCredits) fail('ODDS_BUDGET');
          knownRemaining = budget() - MAX_COST; // Reserve even if the network result is unknown.
          attemptedOdds = true;
          const odds = await request('odds', { regions: 'us', bookmakers: books.join(','), markets: 'spreads,totals', oddsFormat: 'american', eventIds: ids.join(',') });
          quota = odds.quota; noteQuota(quota);
          if (quota.last !== null && quota.last > MAX_COST) { stopped = true; throw new OddsProviderError('ODDS_QUOTA_COST', quota); }
          const actual = matchEvents(odds.data, games, clock());
          matches = matches.map((match, i) => {
            if (!match.event) return match;
            if (actual[i].event && actual[i].event.id !== match.event.id) return { ...match, event: null, reason: 'event_id_changed' };
            return actual[i];
          });
        }
        const fetchedAt = clock(), normalized = normalize(matches, books, fetchedAt);
        const markets = normalized.flatMap(g => Object.values(g.markets));
        return {
          provider: 'the-odds-api', sport: SPORT, fetchedAt: iso(fetchedAt), selectedBooks: books.slice(),
          status: markets.every(m => m.status === 'available') ? 'available' : markets.some(m => m.quotes.length) ? 'partial' : 'unavailable',
          games: normalized, quota: { ...quota, estimatedMaxCost: attemptedOdds ? MAX_COST : 0, conservativeRemaining: knownRemaining },
          officialVerified: false,
          verification: { status: 'not_verified', reason: 'Independent-book consensus and the permitted Action Network cross-check have not been completed.' },
          model: null, expectedValue: null,
        };
      } catch (error) {
        if (error instanceof OddsProviderError) {
          if (error.quota) noteQuota(error.quota);
          if (error.code === 'ODDS_QUOTA_COST' || error.quota?.last > MAX_COST) {
            stopped = true; throw new OddsProviderError('ODDS_QUOTA_COST', error.quota);
          }
          throw error;
        }
        throw new OddsProviderError('ODDS_UNAVAILABLE');
      }
      finally { busy = false; }
    },
  };
}
