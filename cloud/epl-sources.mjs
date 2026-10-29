// Public sources for the gtl-epl-jobs worker (plan 2026-10-28-epl-pick-a-team.md, Task 5). Server only: never import into
// web/. Four reads, each bounded in size and time, with no redirects and no credentials beyond The Odds API key in its own
// query string:
//   fetchSleeperSnapshot  the six Sleeper responses /Users/seanbalsiger/gtl-epl-snapshots/snapshot.py saves (state, league,
//                         users, rosters, one matchweek's stats and the next one's projections), each with the SHA-256 of
//                         its raw body, stored trimmed (shared/epl-sleeper.mjs trimSleeperSnapshot: rostered players only,
//                         only the nonzero stats a league scoring rule uses, plus a minimal directory; the real after-MW8
//                         snapshot goes from 650 KB to about 43 KB, about 1/15). Only a current UTC daily capture may
//                         supplement rostered names/team abbreviations from /v1/players/clubsoccer:epl (optional,
//                         bounded, raw hash retained); a current-directory position is never a scoring position.
//                         Sleeper's API is public and keyless.
//   fetchEplOdds          GET /v4/sports/soccer_epl/odds, h2h from DraftKings, FanDuel and BetMGM (1 credit): every listed
//                         event with its median American price per club.
//   fetchEplScores        GET /v4/sports/soccer_epl/scores?daysFrom=3 (2 credits): recent and upcoming events with final goals,
//                         as { scores, unmapped }: an event under a team name that maps to no club is listed in `unmapped`
//                         (its id only), so the worker never takes it for a match the feed dropped.
//   fetchEplDrawNoBet     GET /v4/sports/soccer_epl/events/<id>/odds, draw_no_bet from the same three books (1 credit per
//                         event; plan 2026-10-28-epl-moneyline.md Tasks 0 and 4): each book's two prices, a 3-way or
//                         sub-100 price rejected.
// Errors carry a fixed code and the quota the provider reported, never the key, the URL or the provider's text.
import { ODDS_API_ORIGIN, readQuota } from './odds-provider.mjs';
import { EPL_CLUBS, clubFromOddsName } from '../shared/epl-clubs.mjs';
import { MAX_DNB_PRICE } from '../shared/epl-moneyline.mjs';
import { priceStrength } from '../shared/epl-draft.mjs';
import { trimSleeperSnapshot } from '../shared/epl-sleeper.mjs';
import { enrichPlayerDisplay } from '../shared/epl-player-directory.mjs';

export const SLEEPER_BASE = 'https://api.sleeper.app';
export const SLEEPER_LEAGUE = '1395122699423993856';
const SLEEPER_SEASON = 2026;
const ODDS_BOOKS = Object.freeze(['draftkings', 'fanduel', 'betmgm']);
const MIB = 1024 * 1024;
const SLEEPER_LIMIT = Object.freeze({ maxBytes: 8 * MIB, timeoutMs: 30_000 });
// October 29 public EPL map: 2.33 MB / 1,910 players. Fail optional enrichment safely if it grows beyond these bounds.
export const SLEEPER_DIRECTORY_MAX_BYTES = 4 * MIB;
const DIRECTORY_LIMIT = Object.freeze({ maxBytes: SLEEPER_DIRECTORY_MAX_BYTES, timeoutMs: 10_000 });
const DIRECTORY_PATH = '/v1/players/clubsoccer:epl';
const DIRECTORY_MAX_PLAYERS = 10_000;
const ODDS_LIMIT = Object.freeze({ maxBytes: 1 * MIB, timeoutMs: 10_000 });
const MAX_EVENTS = 80;
const LABEL = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Odds API team name -> club code, for the 20 clubs (Task 6's list in shared/epl-clubs.mjs). Null prototype. */
export const ESPN_ABBR = Object.freeze(Object.assign(Object.create(null),
  Object.fromEntries(EPL_CLUBS.flatMap(c => c.oddsApiNames.map(n => [n, c.code])))));

const MESSAGES = {
  EPL_SOURCE_CONFIG: 'The EPL source request is invalid.',
  EPL_SOURCE_AUTH: 'The odds provider did not accept its server credentials.',
  EPL_SOURCE_RATE_LIMIT: 'The source is limiting requests.',
  EPL_SOURCE_UNAVAILABLE: 'The source is temporarily unavailable.',
  EPL_SOURCE_PAYLOAD: 'The source returned an invalid response.',
  EPL_SOURCE_BODY_LIMIT: 'The source response exceeded the allowed size.',
};
export class EplSourceError extends Error {
  constructor(code, quota = null) { super(MESSAGES[code] ?? MESSAGES.EPL_SOURCE_UNAVAILABLE); this.name = 'EplSourceError'; this.code = code; this.quota = quota; }
}
const fail = (code, quota) => { throw new EplSourceError(code, quota); };
const record = v => !!v && typeof v === 'object' && !Array.isArray(v);
const american = v => Number.isInteger(v) && Math.abs(v) >= 100 && Math.abs(v) <= MAX_DNB_PRICE;
const isoTime = v => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(v) ? Date.parse(v) : NaN);

/** Reads at most maxBytes of a response body (refusing a larger declared length before reading). */
async function readBounded(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) { void response.body?.cancel().catch(() => {}); fail('EPL_SOURCE_BODY_LIMIT'); }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { void reader.cancel().catch(() => {}); fail('EPL_SOURCE_BODY_LIMIT'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
const hex = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');

/** One GET: the parsed JSON, its raw-body SHA-256 and the Odds API quota headers. Every failure is a coded EplSourceError. */
async function getJson(url, { maxBytes, timeoutMs }, fetchImpl) {
  let quota = null;
  try {
    const response = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    quota = readQuota(response.headers);
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      fail([401, 403].includes(response.status) ? 'EPL_SOURCE_AUTH' : response.status === 429 ? 'EPL_SOURCE_RATE_LIMIT' : 'EPL_SOURCE_UNAVAILABLE', quota);
    }
    const bytes = await readBounded(response, maxBytes);
    let data;
    try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail('EPL_SOURCE_PAYLOAD', quota); }
    return { data, sha256: await hex(bytes), quota };
  } catch (error) {
    if (error instanceof EplSourceError) { error.quota ??= quota; throw error; }
    // Never forward a fetch exception's message, URL or cause.
    throw new EplSourceError('EPL_SOURCE_UNAVAILABLE', quota);
  }
}

const wholeSeconds = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const matchweek = n => Number.isInteger(n) && n >= 1 && n <= 38;

/** The Sleeper snapshot snapshot.py writes, as `{capturedAt, label, sha256: {key: hex}, payload}` (payload stored trimmed). */
export async function fetchSleeperSnapshot({ fetchImpl = fetch, label, statsWeek, projectionsWeek, clock = Date.now, enrichDirectory = false } = {}) {
  if (typeof label !== 'string' || !LABEL.test(label) || !matchweek(statsWeek) || !matchweek(projectionsWeek)) fail('EPL_SOURCE_CONFIG');
  const paths = [
    ['state', '/v1/state/clubsoccer:epl', record],
    ['league', `/v1/league/${SLEEPER_LEAGUE}`, record],
    ['users', `/v1/league/${SLEEPER_LEAGUE}/users`, Array.isArray],
    ['rosters', `/v1/league/${SLEEPER_LEAGUE}/rosters`, Array.isArray],
    [`stats_mw${statsWeek}`, `/stats/clubsoccer:epl/${SLEEPER_SEASON}/${statsWeek}?season_type=regular`, v => Array.isArray(v) || record(v)],
    [`projections_mw${projectionsWeek}`, `/projections/clubsoccer:epl/${SLEEPER_SEASON}/${projectionsWeek}?season_type=regular`, v => Array.isArray(v) || record(v)],
  ];
  const capturedAt = wholeSeconds(clock());
  const payload = { capturedAt, label, source: SLEEPER_BASE, leagueId: SLEEPER_LEAGUE, sources: {} };
  const sha256 = {};
  for (const [key, path, valid] of paths) {
    const { data, sha256: digest } = await getJson(new URL(path, SLEEPER_BASE), SLEEPER_LIMIT, fetchImpl);
    if (!valid(data)) fail('EPL_SOURCE_PAYLOAD');
    payload.sources[key] = { path, sha256: digest };
    payload[key] = data;
    sha256[key] = digest;
  }
  const trimmed = trimSleeperSnapshot(payload);
  // Only the worker's current UTC daily capture requests the optional map. Before/after/recheck captures and API
  // views never request it. A failed optional request still returns a good base capture, which saves the daily label
  // and prevents the scheduler retrying the directory every five minutes that day.
  if (enrichDirectory === true && label === `daily-${capturedAt.slice(0, 10)}`) {
    const source = { path: DIRECTORY_PATH, attemptedAt: capturedAt };
    let directory = null;
    try {
      const result = await getJson(new URL(DIRECTORY_PATH, SLEEPER_BASE), DIRECTORY_LIMIT, fetchImpl);
      source.sha256 = result.sha256; sha256.player_directory = result.sha256;
      if (!record(result.data) || Object.keys(result.data).length > DIRECTORY_MAX_PLAYERS) fail('EPL_SOURCE_PAYLOAD');
      directory = result.data;
      source.status = 'available';
    } catch (error) {
      source.status = 'unavailable';
      source.code = error instanceof EplSourceError ? error.code : 'EPL_SOURCE_UNAVAILABLE';
    }
    const enriched = enrichPlayerDisplay(trimmed, directory);
    trimmed.players = enriched.players;
    trimmed.sources.player_directory = { ...source, ...enriched.coverage };
  }
  return { capturedAt, label, sha256, payload: trimmed };
}

/** The median of American prices, taken on implied probability (so -110 and +110 meet at +100); null for none. */
export function medianAmerican(prices) {
  const probs = prices.filter(american).map(priceStrength).sort((a, b) => a - b);
  if (!probs.length) return null;
  const mid = Math.floor(probs.length / 2);
  const p = Math.round((probs.length % 2 ? probs[mid] : (probs[mid - 1] + probs[mid]) / 2) * 1e9) / 1e9;
  return p > 0.5 ? -Math.round((100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p);
}

const oddsKey = apiKey => {
  if (typeof apiKey !== 'string' || apiKey.length < 8 || apiKey.length > 256 || /\s/.test(apiKey)) fail('EPL_SOURCE_CONFIG');
  return apiKey;
};

/** EPL h2h odds (1 credit): `{events: [{eventId, home, away, commenceTime, h2h: {club: median price}}], quota, unknown}`. */
export async function fetchEplOdds({ apiKey, fetchImpl = fetch } = {}) {
  const url = new URL('/v4/sports/soccer_epl/odds', ODDS_API_ORIGIN);
  url.search = new URLSearchParams({ regions: 'us', markets: 'h2h', bookmakers: ODDS_BOOKS.join(','), oddsFormat: 'american', apiKey: oddsKey(apiKey) });
  const { data, quota } = await getJson(url, ODDS_LIMIT, fetchImpl);
  if (!Array.isArray(data) || data.length > MAX_EVENTS) fail('EPL_SOURCE_PAYLOAD', quota);
  const events = []; let unknown = 0;
  for (const e of data) {
    const commence = record(e) ? isoTime(e.commence_time) : NaN;
    if (!record(e) || typeof e.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(e.id) || !Number.isFinite(commence)) fail('EPL_SOURCE_PAYLOAD', quota);
    const home = clubFromOddsName(e.home_team), away = clubFromOddsName(e.away_team);
    if (!home || !away || home === away) { unknown++; continue; }
    const books = (Array.isArray(e.bookmakers) ? e.bookmakers : []).filter(b => record(b) && ODDS_BOOKS.includes(b.key));
    const h2h = {};
    for (const [club, name] of [[home, e.home_team], [away, e.away_team]]) {
      const prices = books.flatMap(b => (Array.isArray(b.markets) ? b.markets : []).filter(m => record(m) && m.key === 'h2h')
        .flatMap(m => (Array.isArray(m.outcomes) ? m.outcomes : []).filter(o => record(o) && o.name === name).map(o => o.price)));
      const median = medianAmerican(prices);
      if (median !== null) h2h[club] = median;
    }
    events.push({ eventId: e.id, home, away, commenceTime: new Date(commence).toISOString(), h2h });
  }
  return { events, quota, unknown };
}

/** At most this many events in one draw-no-bet read (1 credit each): a full matchweek is 10. */
export const DNB_MAX_EVENTS = 20;
const EVENT_ID = /^[A-Za-z0-9_-]{1,100}$/;
/** A book stops the read only when the key is refused or the provider is limiting; any other failure is that event's. */
const STOPPING = new Set(['EPL_SOURCE_AUTH', 'EPL_SOURCE_RATE_LIMIT']);

/** One book's draw-no-bet market: both clubs' American prices, or null for anything else (a third outcome such as "Draw", a
 * missing club, a price with |p| < 100, or more than one such market). */
function dnbBook(b, homeName, awayName, home, away) {
  const markets = (Array.isArray(b.markets) ? b.markets : []).filter(m => record(m) && m.key === 'draw_no_bet');
  if (markets.length !== 1 || !Array.isArray(markets[0].outcomes) || markets[0].outcomes.length !== 2) return null;
  const price = name => { const o = markets[0].outcomes.find(x => record(x) && x.name === name); return o && american(o.price) ? o.price : null; };
  const h = price(homeName), a = price(awayName);
  return h === null || a === null ? null : { [home]: h, [away]: a };
}

/** EPL draw-no-bet odds for named events (event-level market, 1 credit per event), from DraftKings, FanDuel and BetMGM:
 * `{events: [{eventId, available, home, away, commenceTime, books: {book: {club: price}}, rejected}], quota}`. An event the
 * provider cannot price (not found, unavailable, an invalid reply or one for another event) is `{eventId, available: false}`;
 * `rejected` counts the books whose market was not a valid 2-way price. `quota` is the newest the provider reported. */
export async function fetchEplDrawNoBet({ apiKey, fetchImpl = fetch, eventIds, observations = false, clock = Date.now } = {}) {
  const key = oddsKey(apiKey);
  if (!Array.isArray(eventIds) || !eventIds.length || eventIds.length > DNB_MAX_EVENTS || new Set(eventIds).size !== eventIds.length
    || !eventIds.every(id => typeof id === 'string' && EVENT_ID.test(id))) fail('EPL_SOURCE_CONFIG');
  const events = [];
  let quota = null;
  for (const eventId of eventIds) {
    const url = new URL(`/v4/sports/soccer_epl/events/${eventId}/odds`, ODDS_API_ORIGIN);
    url.search = new URLSearchParams({ regions: 'us', markets: 'draw_no_bet', bookmakers: ODDS_BOOKS.join(','), oddsFormat: 'american', apiKey: key });
    const none = { eventId, available: false, books: {}, rejected: 0 };
    let data;
    try {
      const reply = await getJson(url, ODDS_LIMIT, fetchImpl);
      quota = reply.quota ?? quota; data = reply.data;
      if (observations) none.observation = { observedAt: new Date(clock()).toISOString(), responseSha256: reply.sha256 };
    } catch (error) {
      if (error?.quota) quota = error.quota;
      if (STOPPING.has(error?.code)) throw error;
      events.push(none); continue;
    }
    const commence = record(data) ? isoTime(data.commence_time) : NaN;
    const home = record(data) ? clubFromOddsName(data.home_team) : null, away = record(data) ? clubFromOddsName(data.away_team) : null;
    if (!record(data) || data.id !== eventId || !Number.isFinite(commence) || !home || !away || home === away) { events.push(none); continue; }
    const books = {}, bookObservedAt = {}; let rejected = 0;
    for (const b of (Array.isArray(data.bookmakers) ? data.bookmakers : []).filter(x => record(x) && ODDS_BOOKS.includes(x.key))) {
      const prices = Object.hasOwn(books, b.key) ? null : dnbBook(b, data.home_team, data.away_team, home, away);
      if (prices) {
        books[b.key] = prices;
        const m = b.markets.find(x => x.key === 'draw_no_bet');
        const observed = isoTime(m.last_update ?? b.last_update);
        if (Number.isFinite(observed)) bookObservedAt[b.key] = new Date(observed).toISOString();
      } else rejected++;
    }
    events.push({ eventId, available: true, home, away, commenceTime: new Date(commence).toISOString(), books, rejected, ...(observations ? { ...none.observation, bookObservedAt } : {}) });
  }
  return { events, quota };
}

const goals = (scores, name) => {
  const row = Array.isArray(scores) ? scores.find(s => record(s) && s.name === name) : null;
  const n = row && typeof row.score === 'string' && /^\d{1,2}$/.test(row.score) ? Number(row.score) : null;
  return n;
};

/** EPL scores (2 credits with daysFrom): `[{eventId, completed, home, away, homeGoals, awayGoals, commenceTime}]`. */
export async function fetchEplScores({ apiKey, fetchImpl = fetch, daysFrom = 3, onQuota } = {}) {
  if (!Number.isInteger(daysFrom) || daysFrom < 1 || daysFrom > 3) fail('EPL_SOURCE_CONFIG');
  const url = new URL('/v4/sports/soccer_epl/scores', ODDS_API_ORIGIN);
  url.search = new URLSearchParams({ daysFrom: String(daysFrom), apiKey: oddsKey(apiKey) });
  let result;
  try { result = await getJson(url, ODDS_LIMIT, fetchImpl); } catch (error) { if (error?.quota) onQuota?.(error.quota); throw error; }
  const { data, quota } = result;
  onQuota?.(quota);
  if (!Array.isArray(data) || data.length > MAX_EVENTS) fail('EPL_SOURCE_PAYLOAD', quota);
  const rows = [], unmapped = [];
  for (const e of data) {
    const commence = record(e) ? isoTime(e.commence_time) : NaN;
    if (!record(e) || typeof e.id !== 'string' || !Number.isFinite(commence)) fail('EPL_SOURCE_PAYLOAD', quota);
    const home = clubFromOddsName(e.home_team), away = clubFromOddsName(e.away_team);
    if (!home || !away) { unmapped.push(e.id); continue; }
    const homeGoals = goals(e.scores, e.home_team), awayGoals = goals(e.scores, e.away_team);
    const completed = e.completed === true && homeGoals !== null && awayGoals !== null;
    rows.push({ eventId: e.id, completed, home, away, homeGoals: completed ? homeGoals : null, awayGoals: completed ? awayGoals : null, commenceTime: new Date(commence).toISOString() });
  }
  return { scores: rows, unmapped };
}
