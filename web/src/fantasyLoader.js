// The Fantasy loader with no React and no network of its own (D-57): hosted /fantasy/week first, the committed snapshot
// for the same week when the hosted read fails for any reason other than 400/401/403, and never another week's data.
import { validateFantasySnapshot } from '../../shared/fantasy-rankings.mjs';

export const fantasyWeekKey = (season, week) => `${season}-${String(week).padStart(2, '0')}`;
const entry = key => { const [season, week] = key.split('-').map(Number); return { key, season, week }; };
const byNewest = (a, b) => b.season - a.season || b.week - a.week;
const CACHE_MS = 5 * 60_000;

export function createFantasyLoader({ cloud, readHosted, staticWeeks, initialKey, now = Date.now }) {
  const cache = new Map();
  const staticList = () => Object.keys(staticWeeks).map(entry);
  const saved = async (key, fallback) => {
    const loader = staticWeeks[key];
    if (!loader) return null;
    const module = await loader(), snapshot = module.default ?? module;
    if (!validateFantasySnapshot(snapshot).valid || fantasyWeekKey(snapshot.season, snapshot.week) !== key) throw new Error('Invalid fantasy snapshot');
    return { origin: 'saved', fallback, snapshot, review: null, weeks: staticList().sort(byNewest), retrievedAt: null, indexStale: false };
  };
  const hosted = async key => {
    const [season, week] = key ? key.split('-').map(Number) : [];
    const reply = await readHosted(key ? { season, week } : {});
    const snapshot = reply?.snapshot;
    if (!validateFantasySnapshot(snapshot, { now: now() }).valid || (key && fantasyWeekKey(snapshot.season, snapshot.week) !== key)) {
      throw Object.assign(new Error('Invalid fantasy reply'), { status: 502 });
    }
    const weeks = new Map(staticList().map(item => [item.key, item]));
    for (const item of reply.index?.snapshots ?? []) { const k = fantasyWeekKey(reply.index.season, item.week); weeks.set(k, entry(k)); }
    return { origin: 'hosted', fallback: false, snapshot, review: reply.review ?? null, weeks: [...weeks.values()].sort(byNewest),
      retrievedAt: reply.source?.retrievedAt ?? null, indexStale: reply.source?.stale === true };
  };
  const load = key => {
    const cacheKey = key ?? 'latest', hit = cache.get(cacheKey);
    if (hit && now() - hit.at < CACHE_MS) return hit.promise;
    const promise = (cloud
      ? hosted(key).catch(error => { if ([400, 401, 403].includes(error?.status)) throw error; return saved(key ?? initialKey, true); })
      : saved(key ?? initialKey, false)
    ).catch(error => { cache.delete(cacheKey); throw error; });
    cache.set(cacheKey, { at: now(), promise });
    return promise;
  };
  return { load, clear: () => cache.clear() };
}
