// D-26 Virtual Units settlement feed. Final scores come from the free public
// nflverse games.csv that team records already use (shared/nfl-schedule.mjs,
// scripts/team-records.mjs); no provider request, scrape or credential is
// involved. The builder turns one season/week of that file into the
// p_results payload of public.gtl_settle_virtual_units, finals only: the file
// carries no game status, so a postponement or cancellation is never inferred
// from it (D-18: an unconfirmed report must not settle or void a pick). Those
// two void statuses stay an explicit input for a later verified-source path.
import { NFLVERSE_SCHEDULE_URL, appCode } from '../shared/nfl-schedule.mjs';

export const SETTLEMENT_SOURCE = 'nflverse nfldata games.csv final scores';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = ['season', 'game_type', 'week', 'away_team', 'away_score', 'home_team', 'home_score'];
const STATUSES = new Set(['final', 'postponed', 'cancelled']);
const scope = (season, week) => Number.isInteger(season) && season >= 2000 && season <= 2200 && Number.isInteger(week) && week >= 1 && week <= 25;

function parseRows(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Schedule file is empty.');
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const names = header.split(',');
  const index = Object.fromEntries(COLUMNS.map(column => {
    const at = names.indexOf(column);
    if (at < 0) throw new Error(`Schedule file is missing the ${column} column.`);
    return [column, at];
  }));
  return lines.filter(Boolean).map(line => {
    const cells = line.split(',');
    return Object.fromEntries(COLUMNS.map(column => [column, (cells[index[column]] ?? '').trim()]));
  });
}

/**
 * Finals for one regular-season week as the settlement payload. A row with both
 * scores is a `final`; a row missing either score is listed in `pending` and
 * left out of the payload, so its picks stay pending. Duplicate matchups,
 * unknown team codes and non-integer scores throw: a bad file settles nothing.
 */
export function buildSettlementResults(csvText, season, week, { observedAt, actorId, source = SETTLEMENT_SOURCE, sourceUrl = NFLVERSE_SCHEDULE_URL } = {}) {
  if (!scope(season, week)) throw new Error('Pass a season between 2000 and 2200 and a week between 1 and 25.');
  if (actorId !== undefined && actorId !== null && !UUID.test(actorId)) throw new Error('Invalid actor.');
  const observed = observedAt === undefined ? null : new Date(observedAt);
  if (observed && !Number.isFinite(observed.getTime())) throw new Error('Invalid observed time.');
  const rows = parseRows(csvText).filter(row => Number(row.season) === season && row.game_type === 'REG' && Number(row.week) === week);
  if (!rows.length) throw new Error(`No ${season} Week ${week} regular-season games in the schedule file.`);
  const games = [], pending = [], seen = new Set();
  for (const row of rows) {
    const awayCode = appCode(row.away_team), homeCode = appCode(row.home_team);
    if (!/^[A-Z]{2,3}$/.test(awayCode) || !/^[A-Z]{2,3}$/.test(homeCode)) throw new Error(`Unknown team code ${row.away_team} or ${row.home_team}.`);
    const gameId = `${awayCode}-${homeCode}`;
    if (seen.has(gameId)) throw new Error(`Duplicate game ${gameId} in the schedule file.`);
    seen.add(gameId);
    if (row.away_score === '' || row.home_score === '') { pending.push(gameId); continue; }
    if (!/^\d{1,3}$/.test(row.away_score) || !/^\d{1,3}$/.test(row.home_score)) throw new Error(`Invalid final score for ${gameId}.`);
    const home = Number(row.home_score), away = Number(row.away_score);
    if (home > 200 || away > 200) throw new Error(`Invalid final score for ${gameId}.`);
    games.push({ gameId, status: 'final', home, away });
  }
  const payload = { source, sourceUrl, ...(observed ? { observedAt: observed.toISOString() } : {}), ...(actorId ? { actorId } : {}), games };
  return { payload, finals: games.map(game => game.gameId), pending };
}

const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
/** Shape check for a p_results payload (mirrors the SQL function's refusals) before it leaves the process. */
export function validateSettlementPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => !['source', 'sourceUrl', 'observedAt', 'actorId', 'games'].includes(key))
    || typeof payload.source !== 'string' || payload.source.trim().length < 2 || payload.source.length > 120
    || (payload.sourceUrl != null && (typeof payload.sourceUrl !== 'string' || !/^https:\/\/[^\s@]+$/.test(payload.sourceUrl) || payload.sourceUrl.length > 2048))
    || (payload.observedAt != null && !Number.isFinite(Date.parse(payload.observedAt)))
    || (payload.actorId != null && !UUID.test(payload.actorId)) || !Array.isArray(payload.games)) throw new Error('Invalid settlement payload.');
  const seen = new Set();
  for (const game of payload.games) {
    if (!game || typeof game !== 'object' || Array.isArray(game) || Object.keys(game).some(key => !['gameId', 'status', 'home', 'away'].includes(key))
      || typeof game.gameId !== 'string' || !game.gameId || seen.has(game.gameId) || !STATUSES.has(game.status)) throw new Error('Invalid settlement payload.');
    seen.add(game.gameId);
    if (game.status === 'final' ? !integer(game.home, 0, 200) || !integer(game.away, 0, 200) : game.home != null || game.away != null) throw new Error('Invalid settlement payload.');
  }
  return payload;
}

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
/** The commissioner-facing summary: counts and per-game versions, never user ids. */
export function summarizeSettlement(result) {
  if (!record(result) || !Array.isArray(result.games) || !['settled', 'corrected', 'unchanged', 'picksSettled'].every(key => Number.isInteger(result[key]) && result[key] >= 0)) throw new Error('Invalid settlement result.');
  return {
    settledAt: typeof result.settledAt === 'string' ? result.settledAt : null,
    settled: result.settled, corrected: result.corrected, unchanged: result.unchanged, picksSettled: result.picksSettled,
    games: result.games.map(game => {
      if (!record(game) || typeof game.gameId !== 'string' || !STATUSES.has(game.status) || !Number.isInteger(game.version) || typeof game.changed !== 'boolean') throw new Error('Invalid settlement result.');
      return { gameId: game.gameId, status: game.status, version: game.version, changed: game.changed, picksSettled: Number.isInteger(game.picksSettled) ? game.picksSettled : 0,
        previous: record(game.previous) ? { version: game.previous.version, status: game.previous.status, home: game.previous.home ?? null, away: game.previous.away ?? null } : null };
    }),
  };
}

/**
 * One settlement run for a season/week: download the public schedule file,
 * build the finals payload and hand it to the service-only RPC. This is the
 * function a later scheduled job (pg_cron + pg_net dispatch, like gtl-week-open)
 * or the commissioner route calls; it performs no retries and keeps the RPC's
 * refusal codes so the caller can map them.
 */
export async function settleVirtualUnitsWeek({ season, week, service, actorId = null, clock = Date.now }) {
  if (!scope(season, week)) throw new Error('Invalid settlement scope.');
  if (typeof service?.schedule !== 'function' || typeof service?.settle !== 'function') throw new Error('The settlement service is not configured.');
  const csv = await service.schedule();
  const { payload, finals, pending } = buildSettlementResults(csv, season, week, { observedAt: new Date(clock()).toISOString(), actorId });
  const result = summarizeSettlement(await service.settle(season, week, validateSettlementPayload(payload)));
  return { season, week, source: payload.source, sourceUrl: payload.sourceUrl, observedAt: payload.observedAt, finals: finals.length, pending, ...result };
}

/** Service-role adapter for the script and a future scheduled worker; the key never leaves the process. */
export function createVirtualSettlementAdapter({ url, serviceRoleKey, fetchImpl = fetch }) {
  const base = new URL(url);
  if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash || base.username || base.password || !serviceRoleKey) throw new Error('Invalid settlement configuration.');
  return {
    async schedule() {
      const response = await fetchImpl(NFLVERSE_SCHEDULE_URL, { redirect: 'error', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Public schedule unavailable.');
      return response.text();
    },
    async settle(season, week, results) {
      const response = await fetchImpl(new URL('/rest/v1/rpc/gtl_settle_virtual_units', base), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_season: season, p_week: week, p_results: validateSettlementPayload(results) }) });
      if (!response.ok) {
        let code;
        try { code = (await response.json()).message; } catch { /* No raw provider error escapes. */ }
        const error = new Error('Settlement request failed.');
        error.code = typeof code === 'string' && /^GTL_SETTLEMENT_(WEEK|GAME|INPUT|EARLY)$/.test(code) ? code : 'UNAVAILABLE';
        throw error;
      }
      return response.json();
    },
  };
}
