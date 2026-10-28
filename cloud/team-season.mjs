// D-62: team records current through this weekend's finals for POST /lines/teams, computed live from the free public
// nflverse schedule file gtl-api already reads (publicSchedule in cloud/handler.mjs), so a final shows as soon as
// nflverse posts it, with no deploy. shared/team-records-2026.json stays the app's bundled fallback.
//
// One cache per isolate. The file is read and parsed once per fill, and each season's teams are computed once per
// fill, never per request (Edge CPU). A fill is fresh for 10 minutes. When a refill fails, a value under 24 hours old
// is served marked stale, and the next attempt waits a minute so an outage does not hold every request on the fetch.
// With nothing that young the read answers null and cloud/lines.mjs refuses with a 503. Final scores only: the rows
// come from parseScheduleCsv, which reads no market column, and cloud/lines.mjs rebuilds the reply from fixed keys.
import { parseScheduleCsv, teamSeason } from '../shared/team-records.mjs';

export const TEAMS_FRESH_MS = 10 * 60_000;
export const TEAMS_STALE_MS = 24 * 60 * 60_000;
export const TEAMS_RETRY_MS = 60_000;
const MAX_FILE = 12_000_000;

export function createTeamSeasonProvider({ loadSchedule, clock = Date.now }) {
  let cache = null, inFlight = null, retryAt = 0;
  async function fill() {
    const csv = await loadSchedule();
    if (typeof csv !== 'string' || csv.length > MAX_FILE) throw new Error('Invalid schedule file.');
    const rows = parseScheduleCsv(csv).filter(row => row.game_type === 'REG');
    const newest = rows.reduce((year, row) => Math.max(year, Number(row.season) || 0), 0);
    if (!newest) throw new Error('No regular-season games in the schedule file.');
    return { rows, newest, seasons: new Map(), readAt: clock() };
  }
  /** The cached file and whether it is stale, or null when nothing under 24 hours old can be served. */
  async function source() {
    if (cache && clock() - cache.readAt < TEAMS_FRESH_MS) return { data: cache, stale: false };
    if (clock() >= retryAt) {
      inFlight ??= fill().then(data => { cache = data; retryAt = 0; return data; }, () => { retryAt = clock() + TEAMS_RETRY_MS; return null; })
        .finally(() => { inFlight = null; });
      const data = await inFlight;
      if (data) return { data, stale: false };
    }
    return cache && clock() - cache.readAt < TEAMS_STALE_MS ? { data: cache, stale: true } : null;
  }
  return {
    /** One season (the newest in the file when none is named) with `updatedAt` (when the file was read) and `stale`. */
    async read({ season = null } = {}) {
      const found = await source();
      if (!found) return null;
      const { data, stale } = found, year = season ?? data.newest;
      if (!data.seasons.has(year)) data.seasons.set(year, teamSeason(data.rows, { season: year }));
      return { ...data.seasons.get(year), updatedAt: new Date(data.readAt).toISOString(), stale };
    },
  };
}
