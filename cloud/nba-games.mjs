import { normalizeNbaGames, gamesForLocalDate, validateNbaGamesRequest } from '../shared/nba-games.mjs';
const TTL = 300000;
const SOURCE = 'BALLDONTLIE';
function cachedSnapshot(raw) {
  if (raw?.games === null && raw.observedAt === null) return { ...raw, games: null };
  if (!Array.isArray(raw?.games) || typeof raw.observedAt !== 'string' || !Number.isFinite(Date.parse(raw.observedAt))) throw new Error('Invalid NBA cache.');
  // Reuse the canonical validator and rebuild every field; storage metadata and source records stay server-side.
  const data = raw.games.map(game => {
    if (!/^NBA:balldontlie:[1-9]\d*$/.test(game?.id) || game.startTime === undefined
      || !['scheduled', 'in_progress', 'final', 'postponed', 'canceled', 'delayed', 'suspended', 'abandoned', 'unknown'].includes(game.status)) throw new Error('Invalid NBA cache.');
    const providerTeam = team => ({ id: team?.id, full_name: team?.name, abbreviation: team?.abbreviation });
    return { id: Number(game.id.split(':')[2]), datetime: game.startTime, date: game.sourceDate,
      status_state: game.status, status: game.statusText,
      home_team: providerTeam(game.home), visitor_team: providerTeam(game.away), home_team_score: game.homeScore, visitor_team_score: game.awayScore };
  });
  return { games: normalizeNbaGames({ data, meta: { next_cursor: null } }, raw.observedAt), observedAt: raw.observedAt,
    leaseToken: raw.leaseToken, leasedAt: raw.leasedAt };
}
export function createNbaGamesCache(service) {
  return {
    read: ({ date, refresh }) => service.rpc('gtl_nba_claim_games', { p_date: date, p_refresh: refresh }),
    publish: ({ date, leaseToken, games }) => service.rpc('gtl_nba_finish_games', { p_date: date, p_token: leaseToken, p_games: games }),
  };
}
// The database, rather than a worker's memory or client options, owns TTL, lease and global cooldown.
export function createNbaGamesService({ apiKey, fetchImpl = fetch, cache, clock = Date.now }) {
  async function collect(date, observedAt) {
    const url = new URL('https://api.balldontlie.io/v1/games');
    url.searchParams.set('per_page', '100');
    for (const offset of [-1, 0, 1]) url.searchParams.append('dates[]', new Date(Date.parse(`${date}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10));
    const controller = new AbortController(); let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetchImpl(url, { method: 'GET', headers: { Authorization: apiKey }, redirect: 'error', signal: controller.signal });
          if (!response.ok || response.redirected) throw new Error('NBA source unavailable.');
          return normalizeNbaGames(await response.json(), observedAt);
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('NBA source unavailable.')); }, 10000); }),
      ]);
    } finally { clearTimeout(timer); }
  }
  return { async read(input) {
    const { date, timeZone } = validateNbaGamesRequest(input);
    const configured = typeof apiKey === 'string' && Boolean(apiKey.trim());
    let snapshot;
    const view = (unavailable = true) => {
      const observedAt = snapshot?.observedAt ?? null;
      const games = Array.isArray(snapshot?.games) ? snapshot.games : [];
      return { date, timeZone, games: gamesForLocalDate(games, date, timeZone), observedAt,
        stale: observedAt !== null && clock() - Date.parse(observedAt) >= TTL, unavailable, source: SOURCE };
    };
    try { snapshot = cachedSnapshot(await cache.read({ date, refresh: configured })); }
    catch { return view(); }
    const fresh = Array.isArray(snapshot?.games) && Number.isFinite(Date.parse(snapshot.observedAt)) && clock() - Date.parse(snapshot.observedAt) < TTL;
    if (!configured || !snapshot?.leaseToken) return view(!configured || !fresh);
    try {
      const observedAt = snapshot.leasedAt;
      // Do not spend a reservation delivered too late, or one inconsistent with this worker's clock.
      const leaseAge = clock() - Date.parse(observedAt);
      if (!Number.isFinite(leaseAge) || leaseAge < 0 || leaseAge >= 15000) throw new Error('NBA lease expired.');
      const games = await collect(date, observedAt);
      if (await cache.publish({ date, leaseToken: snapshot.leaseToken, games }) !== true) return view();
      snapshot = { games, observedAt }; return view(false);
    } catch {
      // A failed release may leave the lease until expiry; it never destroys prior data or cooldown.
      await cache.publish({ date, leaseToken: snapshot.leaseToken, games: null }).catch(() => {});
      return view();
    }
  } };
}
