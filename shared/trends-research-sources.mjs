// Reviewed, permitted primary posts only. No automatic X collection.
export const RESEARCH_SOURCES = Object.freeze([
  ['rotobot_ai', 'RotoBot'], ['parlayscience', 'ParlayScience'], ['fatbosspicks', 'Fatboss'], ['trendscenterapp', 'TrendsCenter'], ['bettingpros', 'BettingPros'], ['bookitwithtrent', 'Book It With Trent'],
].map(([id, name]) => Object.freeze({ id, name, accountUrl: `https://x.com/${id}` })));
const fail = () => { throw new TypeError('Invalid reviewed research feed.'); };
const object = (v, keys) => { if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !keys.includes(k))) fail(); };
const string = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
const instant = v => string(v, 40) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(v)
  && Number(v.slice(11, 13)) < 24 && Number.isFinite(Date.parse(v))
  && new Date(`${v.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) === v.slice(0, 10);
const id = v => string(v, 100) && /^[a-zA-Z0-9_-]+$/.test(v);

export function validateReviewedFeed(input) {
  if (typeof input === 'string') { if (input.length > 24000 || new TextEncoder().encode(input).length > 48000) fail(); try { input = JSON.parse(input); } catch { fail(); } }
  const encoded = JSON.stringify(input);
  if (!encoded || encoded.length > 24000 || new TextEncoder().encode(encoded).length > 48000) fail();
  object(input, ['version', 'checkedAt', 'availability', 'entries']);
  if (input.version !== 1 || !instant(input.checkedAt) || !Array.isArray(input.entries) || input.entries.length > 100) fail();
  object(input.availability, RESEARCH_SOURCES.map(s => s.id));
  if (Object.values(input.availability).some(s => !['available', 'unavailable'].includes(s))) fail();
  const seen = new Map();
  const revised = new Set();
  for (const e of input.entries) {
    object(e, ['id', 'version', 'previousRevision', 'sourceId', 'sourceUrl', 'postedAt', 'capturedAt', 'status', 'review', 'event', 'selection', 'market', 'postedLine', 'price', 'originalTerms', 'dependencies']);
    if (!id(e.id) || seen.has(e.id) || !Number.isInteger(e.version) || e.version < 1 || !RESEARCH_SOURCES.some(s => s.id === e.sourceId)) fail();
    const url = typeof e.sourceUrl === 'string' && e.sourceUrl.match(/^https:\/\/x\.com\/([a-zA-Z0-9_]+)\/status\/([0-9]{1,25})$/);
    if (!url || url[1].toLowerCase() !== e.sourceId || !instant(e.postedAt) || !instant(e.capturedAt) || Date.parse(e.postedAt) > Date.parse(e.capturedAt) || Date.parse(e.capturedAt) > Date.parse(input.checkedAt)) fail();
    if (!['available', 'corrected', 'deleted', 'inaccessible'].includes(e.status)) fail();
    object(e.review, ['primaryPost', 'reusePermitted', 'nflDependenciesComplete']);
    if (e.review.primaryPost !== true || e.review.reusePermitted !== true || e.review.nflDependenciesComplete !== true) fail();
    if (!string(e.event, 160) || !string(e.selection, 240) || !string(e.originalTerms, 1200) || !['spread', 'total', 'moneyline', 'prop', 'parlay', 'other'].includes(e.market)) fail();
    if (e.postedLine !== null && (typeof e.postedLine !== 'number' || !Number.isFinite(e.postedLine) || Math.abs(e.postedLine) > 10000)) fail();
    if (e.price !== null && (!Number.isInteger(e.price) || Math.abs(e.price) < 100 || Math.abs(e.price) > 10000)) fail();
    if (!Array.isArray(e.dependencies) || e.dependencies.length > 16) fail();
    for (const d of e.dependencies) {
      object(d, ['season', 'week', 'gameId', 'market']);
      if (!Number.isInteger(d.season) || d.season < 2000 || d.season > 2100 || !Number.isInteger(d.week) || d.week < 1 || d.week > 25 || !/^[A-Z]{2,3}-[A-Z]{2,3}$/.test(d.gameId) || !['spread', 'total', 'both'].includes(d.market)) fail();
    }
    if (['spread', 'total'].includes(e.market) && e.dependencies.length === 0) fail();
    if (e.previousRevision !== null) {
      const previous = seen.get(e.previousRevision);
      if (!previous || revised.has(e.previousRevision) || previous.sourceId !== e.sourceId || e.version !== previous.version + 1 || Date.parse(e.capturedAt) < Date.parse(previous.capturedAt)) fail();
      revised.add(e.previousRevision);
    } else if (e.version !== 1) fail();
    seen.set(e.id, e);
  }
  return structuredClone(input);
}

/** Filtering must not disclose a suppressed entry's ID, title, URL or count. */
export function projectReviewedSources(feed, { board, now, invalid = false }) {
  const allowedIds = new Set();
  const allowed = e => (e.previousRevision === null || allowedIds.has(e.previousRevision)) && Date.parse(e.capturedAt) <= Date.parse(now) && e.dependencies.every(d => {
    if (d.season !== board.season || d.week !== board.week) return false;
    const g = board.games.find(g => g.id === d.gameId);
    return d.market === 'both' ? g?.spread?.visible === true && g?.total?.visible === true : g?.[d.market]?.visible === true;
  });
  for (const e of feed?.entries ?? []) if (allowed(e)) allowedIds.add(e.id);
  const source = s => {
    const available = feed?.availability[s.id] === 'available' && Date.parse(feed.checkedAt) <= Date.parse(now);
    const entries = available ? feed.entries.filter(e => e.sourceId === s.id && allowedIds.has(e.id)) : [];
    return { ...s, status: invalid ? 'invalid-configuration' : available ? entries.length ? 'reviewed' : 'no-verified-plays' : 'unavailable', checkedAt: feed?.checkedAt ?? null, plays: entries.map(e => ({ ...e, review: undefined, sourceState: 'source-reported', label: 'Source-reported · not verified' })) };
  };
  const all = RESEARCH_SOURCES.map(source);
  return { sources: all.slice(0, 5), trent: all[5] };
}
