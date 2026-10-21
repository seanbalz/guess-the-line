// Public historical Trends assembled only after the existing membership/published-week reader authorizes.
import seedData from './trends-seed.mjs';
import { generateWeek, parseCsvRows, writeCompactCsv, rowPlayed, REDACTED_COLUMNS, TRENDS_SOURCE } from '../shared/trends.mjs';
import { easternToUtc, appCode } from '../shared/nfl-schedule.mjs';
import { UUID_PATTERN } from './lobby.mjs';
export const TRENDS_METHODS = Object.freeze({ '/trends/week': ['POST'] });
export class TrendsError extends Error {
 constructor(status, message) { super(message); this.status = status; this.name = 'TrendsError'; }
}
const TTL = 5 * 60_000, RETRY = 60_000, MAX_CACHE = 4;
export const MAX_SOURCE_BYTES = 5_000_000;
/** Bounded public request: no credentials, redirects or provider error bodies. */
export function createSeasonReader({ fetchImpl = fetch } = {}) {
 return async () => {
  const response = await fetchImpl(TRENDS_SOURCE.url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error('Public schedule unavailable.');
  if (Number(response.headers.get('content-length')) > MAX_SOURCE_BYTES) { await response.body?.cancel(); throw new Error('Public schedule size exceeded.'); }
  if (!response.body) throw new Error('Public schedule unavailable.');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
   while (true) { const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength; if (size > MAX_SOURCE_BYTES) { await reader.cancel(); throw new Error('Public schedule size exceeded.'); } chunks.push(value);
   }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
 };
}
/** A week uses only earlier-week finals known at request time. Frozen finals retain their original evidence. */
export function prepareSeason({ sourceCsv, seedCsv, season, week, now, slate = [] }) {
 const source = parseCsvRows(sourceCsv).rows.filter(r => Number(r.season) === season);
 const frozen = parseCsvRows(seedCsv).rows.filter(r => Number(r.season) === season);
 if (!source.length || source.length > 400) throw new Error('Invalid public season.');
 const ids = new Set(), published = new Map(slate.map(g => [g.id, g]));
 const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long' });
 const frozenFinals = new Map(frozen.filter(rowPlayed).map(r => [r.game_id, r]));
 const rows = source.map(raw => {
  if (ids.has(raw.game_id) || !/^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(raw.game_id)
   || !Number.isInteger(Number(raw.week)) || Number(raw.week) < 1 || Number(raw.week) > 25
   || !/^\d{4}-\d{2}-\d{2}$/.test(raw.gameday) || !/^\d{2}:\d{2}$/.test(raw.gametime)) throw new Error('Invalid public game.');
  ids.add(raw.game_id);
  const r = { ...(frozenFinals.get(raw.game_id) ?? raw) };
  const eligible = Number(r.week) < week && Date.parse(easternToUtc(r.gameday, r.gametime)) <= now;
  if (!eligible || !rowPlayed(r)) {
   for (const field of REDACTED_COLUMNS) r[field] = '';
   r.home_score = r.away_score = r.overtime = '';
  } else if (![r.home_score, r.away_score].every(s => /^\d{1,3}$/.test(s))) throw new Error('Invalid public final.');
  const slot = Number(r.week) === week ? published.get(appCode(r.away_team) + '-' + appCode(r.home_team)) : null;
  if (slot) {
   const parts = Object.fromEntries(formatter.formatToParts(new Date(slot.kickoff)).map(p => [p.type, p.value]));
   r.gameday = parts.year + '-' + parts.month + '-' + parts.day; r.gametime = parts.hour + ':' + parts.minute; r.weekday = parts.weekday;
  }
  return r;
 });
 // A source refresh must not silently remove an already frozen final.
 for (const r of frozen) if (rowPlayed(r) && !ids.has(r.game_id)) throw new Error('Public season lost a frozen final.');
 return writeCompactCsv(rows, { redactUnplayed: true });
}
export function createTrendsService({ rpc, readSeason = createSeasonReader(), clock = Date.now, seed = seedData } = {}) {
 const cache = new Map(), inflight = new Map();
 const publicCopy = value => {
  const copy = structuredClone(value);
  copy.availability.sourceAgeMs = Math.max(0, clock() - Date.parse(copy.availability.sourceAsOf));
  return copy;
 };
 let sourceEntry = null;
 const source = () => {
  const now = clock();
  if (!sourceEntry || now - sourceEntry.at >= (sourceEntry.failed ? RETRY : TTL)) {
   const entry = { at: now, failed: false, promise: null };
   entry.promise = Promise.resolve().then(readSeason).then(csv => ({ csv, at: new Date(clock()).toISOString() }), error => { entry.failed = true; throw error; });
   sourceEntry = entry;
  }
  return sourceEntry.promise;
 };
 const remember = (key, value, at, failed) => {
  cache.delete(key); cache.set(key, { value, at, failed });
  while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  return value;
 };
 return {
  rpc,
  async week(published) {
   const { season, week } = published;
   if (season !== seed.season) throw new TrendsError(503, 'Trends require a refreshed historical seed for this season.');
   const scope = published.games.map(g => [g.id, g.kickoff]).sort((a,b) => a[0].localeCompare(b[0]));
   const key = JSON.stringify([season, week, scope]), now = clock(), hit = cache.get(key);
   if (hit && now - hit.at < (hit.failed ? RETRY : TTL)) return publicCopy(hit.value);
   if (inflight.has(key)) return publicCopy(await inflight.get(key));
   if (inflight.size >= 2) throw new TrendsError(503, 'Trends are refreshing. Try again shortly.');
   const task = (async () => {
    let input, sourceAsOf, stale = false, reason = null;
    try { const fresh = await source(); input = prepareSeason({ sourceCsv: fresh.csv, seedCsv: seed.seasonCsv, season, week, now, slate: published.games }); sourceAsOf = fresh.at; }
    catch {
     stale = true; reason = 'Public schedule unavailable; dated seed fallback.';
     if (hit) return remember(key, { ...hit.value, availability: { ...hit.value.availability, stale: true, reason: 'Public schedule unavailable; last successful generation.' } }, now, true);
     try { input = prepareSeason({ sourceCsv: seed.seasonCsv, seedCsv: seed.seasonCsv, season, week, now, slate: published.games }); sourceAsOf = seed.sourceAsOf; }
     catch { throw new TrendsError(503, 'Trends are unavailable for this week. Try again shortly.'); }
    }
    let result;
    try { result = generateWeek({ ...seed, seasonCsv: input, season, week, allowPending: true, includeWindows: true }); }
    catch { throw new TrendsError(503, 'Trends are unavailable for this week. Try again shortly.'); }
    const allowed = new Map(published.games.map(g => [g.id, g]));
    result.games = result.games.filter(g => allowed.has(g.id)).map(g => ({ ...g, kickoff: allowed.get(g.id).kickoff }));
    if (result.games.length !== allowed.size) throw new TrendsError(503, 'Trends are unavailable for this published slate.');
    const teams = new Set(result.games.flatMap(g => [g.home, g.away]));
    result.pending = result.pending.filter(p => teams.has(p.team));
    // The source refresh timestamp and last final date are distinct. No current lines enter this shared cache.
    if (!stale && parseCsvRows(input).rows.some(r => Number(r.week) < week && !rowPlayed(r)
      && Date.parse(easternToUtc(r.gameday, r.gametime)) < now - 12 * 3_600_000)) {
     stale = true; reason = 'Earlier-week final overdue in public source; pending records remain pending.';
    }
    result.availability = { generatedAt: new Date(now).toISOString(), sourceAsOf, stale, reason,
     evidencePolicy: 'Earlier-week finals only; current and later week results and lines excluded.' };
    result.source.season = { url: TRENDS_SOURCE.url, asOf: sourceAsOf };
    return remember(key, result, now, stale);
   })();
   inflight.set(key, task);
   try { return publicCopy(await task); } finally { inflight.delete(key); }
  },
 };
}
export async function handleTrends({ route, body = {}, user, service, clock = Date.now, featureOff = new Set() }) {
 if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new TrendsError(401, 'Sign in to continue.');
 if (route !== '/trends/week') throw new TrendsError(404, 'Not found.');
 if (featureOff.has('trends')) throw new TrendsError(503, 'Trends are not available right now.');
 if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['season', 'week'].includes(k))
  || !Number.isSafeInteger(body.season) || body.season < 2000 || body.season > 2100
  || !Number.isSafeInteger(body.week) || body.week < 1 || body.week > 25) throw new TrendsError(400, 'Check the requested season and week.');
 if (!service?.rpc || !service?.week) throw new TrendsError(503, 'Trends are not available right now.');
 // Always authorize before even consulting the public-output cache, including removed members.
 const published = await service.rpc('gtl_read_lines', { p_user: user.id, p_season: body.season, p_week: body.week, p_now: new Date(clock()).toISOString() });
 if (published?.published !== true) throw new TrendsError(404, 'This week is not published.');
 if (published.season !== body.season || published.week !== body.week || !Array.isArray(published.games) || published.games.length < 1 || published.games.length > 32
  || new Set(published.games.map(g => g.id)).size !== published.games.length
  || published.games.some(g => !/^[A-Z]{2,3}-[A-Z]{2,3}$/.test(g.id) || !Number.isFinite(Date.parse(g.kickoff)))) throw new TrendsError(503, 'The published slate is unavailable.');
 return service.week({ season: published.season, week: published.week, games: published.games.map(g => ({ id: g.id, kickoff: g.kickoff })) });
}
