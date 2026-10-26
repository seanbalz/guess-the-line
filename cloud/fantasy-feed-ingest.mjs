// D-59 fantasy feed ingest. A machine-only endpoint: Sean's fantasy exporter (the private seanbalz/fantasy-football
// repository) uploads one feed file per request with its own upload secret, GTL_FANTASY_FEED_UPLOAD_SECRET. Each file is
// stored once, named by its full SHA-256, in the private fantasy-feed bucket and never replaced; the season index,
// written last, is the only object that changes. A feature's audience is fixed here, never read from the file, so a
// mislabelled export cannot widen who sees it. A community file must match its table and column allowlist and carry no
// owner-only key or string, and what is stored is the validated value re-serialized, never the raw request bytes.
// Single writer: the exporter runs on one machine and uploads one file at a time; concurrent uploads could lose an
// index entry (Storage has no conditional write), and the next upload of that feature restores it.

export const FEED_BUCKET = 'fantasy-feed';
/** Feature → who may read it through gtl-api. `owner` is Sean's account only (D-59), not the commissioner role. */
export const FEED_FEATURES = Object.freeze({
  usage: 'community',
  'usage-ecr': 'owner',
  rankings: 'owner',
  leagues: 'owner',
  draft: 'owner',
});
export const MAX_FEED_BYTES = 8 * 1024 * 1024;
const MAX_INDEX_BYTES = 256 * 1024;
const SUPERSEDED_KEPT = 3;
const MAX_DEPTH = 64;
const FUTURE_SKEW_MS = 5 * 60_000;
const MAX_CELL_LENGTH = 200;
// An explicit offset is required: a time without one would be read as the server's local time.
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
// Owner-only material: licensed FantasyPros values (ECR, R2P), league owners', managers' and users' identities, and email
// addresses. A community file carries none of it as a key or as a string value (a table names its columns in strings).
// Names are split into words first, so rank_ecr, fpEcr, ECRRank and owners_real_names all match.
const OWNER_ONLY_WORD = /^(?:ecr.*|.*ecr|r2p.*|owners?|managers?|users?|usernames?|e?mails?|realnames?)$/;
const EMAIL = /[^\s@"]+@[^\s@"]+\.[a-z]{2,}/i;
/**
 * The community `usage` file (D-59): data is { <table>: { cols, rows } } with these tables and nflverse-derived columns
 * only, each row an array of scalars in column order. Anything else, such as FantasyPros' ecr, pr, proj, grade and owned
 * or a roster's owner, belongs in an owner file; adding a column here is a reviewed change that widens its audience.
 */
const frozenTables = tables => Object.freeze(Object.fromEntries(Object.entries(tables).map(([name, cols]) => [name, Object.freeze(cols)])));
export const USAGE_TABLES = frozenTables({
  players: ['id', 'name', 'pos', 'team', 'exp'],
  tw: ['team', 'season', 'week', 'opp', 'site', 'pf', 'pa', 'plays', 'off_snaps', 'dropbacks', 'designed_rushes', 'sacks', 'scrambles',
    'team_targets', 'team_carries', 'air_yards', 'pass_rate', 'neutral_pass_rate', 'proe', 'epa_per_play', 'epa_per_db', 'epa_per_rush',
    'success_rate', 'shotgun_pct', 'no_huddle_pct', 'rz_trips', 'rz_td_pct'],
  games: ['season', 'week', 'team', 'opp', 'site', 'pf', 'pa', 'gameday', 'gametime', 'final'],
  pw: ['id', 'season', 'week', 'team', 'opp', 'site', 'pos', 'snaps', 'snap_pct', 'tm_snaps', 'tm_db', 'routes', 'tgt', 'tm_tgt', 'rec',
    'rec_yd', 'rec_td', 'air', 'tm_air', 'yac', 'yacoe', 'rec_fd', 'rz_tgt', 'i10_tgt', 'ez_tgt', 'deep_tgt', 'car', 'tm_car', 'rush_yd',
    'rush_td', 'rush_fd', 'rz_car', 'i10_car', 'i5_car', 'dsgn', 'scr', 'rsucc', 'stuff', 'att', 'cmp', 'pass_yd', 'pass_td', 'int', 'sk',
    'db', 'pass_air', 'cpoe', 'epa_db', 'rec_epa', 'rush_epa', 'drop', 'btkl', 'yco', 'sep', 'ryoe', 'ttt', 'fl', 'ppr', 'half', 'std', 'shfl'],
  dw: ['id', 'season', 'week', 'team', 'opp', 'pos', 'snaps', 'snap_pct', 'st', 'tkl', 'solo', 'tfl', 'sck', 'qbh', 'int', 'pd', 'ff', 'fr',
    'td', 'prss', 'mtkl', 'tgt_alw', 'yds_alw'],
  kw: ['id', 'season', 'week', 'team', 'opp', 'fgm', 'fga', 'lng', 'fg40', 'fg50', 'miss', 'xpm', 'xpa', 'ppr', 'shfl'],
});
/** Every community feature has a table allowlist; a community feature without one is refused. */
const COMMUNITY_TABLES = Object.freeze({ usage: USAGE_TABLES });
const ENVELOPE_KEYS = ['data', 'feature', 'generatedAt', 'schemaVersion', 'season', 'sources', 'week'];
const SOURCE_KEYS = new Set(['name', 'url', 'license']);
// The upload secret and every SHA-256 are 64 lowercase hex characters.
const HEX64 = /^[0-9a-f]{64}$/;

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
class IngestError extends Error { constructor(code, reason) { super('Fantasy feed request failed.'); this.code = code; this.reason = reason; } }
const invalid = reason => new IngestError('INPUT', reason);
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hex = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');

/** Equal-length lowercase hex strings compared without an early exit. */
function sameSecret(given, expected) {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function createFantasyFeedAdapter({ url, serviceRoleKey, fetchImpl = fetch }) {
  const base = new URL(url);
  if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash || base.username || base.password || !serviceRoleKey) throw new Error('Invalid fantasy feed configuration.');
  const object = path => new URL(`/storage/v1/object/${FEED_BUCKET}/${path}`, base);
  const auth = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
  const reply = async response => { try { return await response.json(); } catch { return null; } };
  return {
    /**
     * Stores bytes at path. Without upsert an existing object is left as it is and reported as 'exists'. The index is
     * rewritten in place, so it is written, and read back, with no-cache: a cached copy would drop entries on the next write.
     */
    async put(path, bytes, { upsert }) {
      const response = await fetchImpl(object(path), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { ...auth, 'Content-Type': 'application/json', 'x-upsert': upsert ? 'true' : 'false', ...(upsert ? { 'Cache-Control': 'no-cache' } : {}) }, body: bytes });
      if (response.ok) { await response.body?.cancel(); return 'created'; }
      const body = await reply(response);
      // Storage answers a duplicate with 409, or with 400 and statusCode "409" on older versions.
      if (!upsert && (response.status === 409 || String(body?.statusCode) === '409')) return 'exists';
      throw new Error('Fantasy feed storage unavailable.');
    },
    /** Reads a size-capped object, or null when it does not exist. */
    async get(path, maxBytes) {
      const response = await fetchImpl(object(path), { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { ...auth, 'Cache-Control': 'no-cache' } });
      if (!response.ok) {
        const body = await reply(response);
        if (response.status === 404 || String(body?.statusCode) === '404') return null;
        throw new Error('Fantasy feed storage unavailable.');
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > maxBytes) throw new Error('Fantasy feed object too large.');
      return bytes;
    },
  };
}

/** Reads a JSON request body of at most maxBytes within timeoutMs; any other type, size or delay fails. */
export async function readFeedBody(request, timeoutMs, maxBytes = MAX_FEED_BYTES) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw invalid('content_type');
  const declared = Number(request.headers.get('content-length'));
  if (declared > maxBytes) throw new IngestError('TOO_LARGE');
  const reader = request.body?.getReader(); if (!reader) throw invalid('body');
  const chunks = []; let length = 0; let timeout;
  const timedOut = new Promise((_, reject) => { timeout = setTimeout(() => reject(invalid('timeout')), timeoutMs); });
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), timedOut]); if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { void reader.cancel().catch(() => {}); throw new IngestError('TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { clearTimeout(timeout); void reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

/** snake_case, kebab-case, camelCase and ECRRank names as lowercase words; digits stay with their letters (r2p). */
const words = text => text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase().match(/[a-z0-9]+/g) ?? [];
const followedBy = (list, word, next) => list.some((item, i) => item === word && next.test(list[i + 1] ?? ''));
/** True for an email address or an owner-only name, including a bare display_name (player_display_name is public nflverse). */
export function ownerOnlyText(text) {
  const list = words(text);
  return EMAIL.test(text) || list.some(word => OWNER_ONLY_WORD.test(word)) || followedBy(list, 'real', /^names?$/)
    || (list.length === 2 && followedBy(list, 'display', /^names?$/));
}

/** Each distinct string is checked once; a usage file repeats team codes and positions thousands of times. */
function checkText(text, seen) {
  if (seen.has(text)) return;
  seen.add(text);
  if (ownerOnlyText(text)) throw invalid('owner_only');
}

/** One walk over data: nesting within MAX_DEPTH, finite numbers only, and for a community file no owner-only key or string. */
function scanData(value, community, seen = new Set(), depth = 0) {
  if (depth > MAX_DEPTH) throw invalid('depth');
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw invalid('number'); return; }
  if (typeof value === 'string') { if (community) checkText(value, seen); return; }
  if (Array.isArray(value)) { for (const item of value) scanData(item, community, seen, depth + 1); return; }
  if (isObject(value)) for (const [key, item] of Object.entries(value)) { if (community) checkText(key, seen); scanData(item, community, seen, depth + 1); }
}

const scalar = cell => cell === null || typeof cell === 'boolean' || (typeof cell === 'number' && Number.isFinite(cell))
  || (typeof cell === 'string' && cell.length <= MAX_CELL_LENGTH);
/** A community file's data: only allowlisted tables, each { cols, rows } with allowlisted columns and rows of scalars. */
function validateTables(data, tables) {
  if (!tables || !isObject(data) || !Object.keys(data).length) throw invalid('tables');
  for (const [name, table] of Object.entries(data)) {
    if (!Object.hasOwn(tables, name) || !isObject(table) || Object.keys(table).sort().join() !== 'cols,rows') throw invalid('tables');
    const { cols, rows } = table;
    if (!Array.isArray(cols) || !cols.length || new Set(cols).size !== cols.length || cols.some(col => !tables[name].includes(col))) throw invalid('columns');
    if (!Array.isArray(rows) || rows.some(row => !Array.isArray(row) || row.length !== cols.length || !row.every(scalar))) throw invalid('rows');
  }
}

const validWeek = week => week === null || (Number.isInteger(week) && week >= 1 && week <= 22);

/** Validates one feed file's envelope and returns its fixed audience. Never echoes the input. */
export function validateFeedFile(file, now) {
  if (!isObject(file)) throw invalid('envelope');
  if (Object.keys(file).sort().join() !== ENVELOPE_KEYS.join()) throw invalid('envelope');
  if (file.schemaVersion !== 1) throw invalid('schema_version');
  if (typeof file.feature !== 'string' || !Object.hasOwn(FEED_FEATURES, file.feature)) throw invalid('feature');
  if (!Number.isInteger(file.season) || file.season < 2020 || file.season > 2100) throw invalid('season');
  if (!validWeek(file.week)) throw invalid('week');
  const generated = typeof file.generatedAt === 'string' && ISO_TIME.test(file.generatedAt) ? Date.parse(file.generatedAt) : NaN;
  if (!Number.isFinite(generated) || generated > now + FUTURE_SKEW_MS) throw invalid('generated_at');
  if (!Array.isArray(file.sources) || file.sources.length < 1 || file.sources.length > 20) throw invalid('sources');
  for (const source of file.sources) {
    if (!isObject(source) || Object.keys(source).some(key => !SOURCE_KEYS.has(key))) throw invalid('sources');
    if (typeof source.name !== 'string' || !source.name.trim() || source.name.length > 100) throw invalid('sources');
    if (source.license !== undefined && (typeof source.license !== 'string' || source.license.length > 100)) throw invalid('sources');
    if (source.url !== undefined) {
      let parsed; try { parsed = new URL(source.url); } catch { throw invalid('sources'); }
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || source.url.length > 500) throw invalid('sources');
    }
  }
  if (!isObject(file.data) && !Array.isArray(file.data)) throw invalid('data');
  const audience = FEED_FEATURES[file.feature];
  scanData(file.data, audience === 'community');
  if (audience === 'community') validateTables(file.data, COMMUNITY_TABLES[file.feature]);
  return audience;
}

export const feedPath = (file, sha256) => `${file.season}/${file.feature}/${file.season}-${file.feature}${file.week === null ? '' : `-week-${String(file.week).padStart(2, '0')}`}.${sha256}.json`;
export const indexPath = season => `${season}/index.json`;
const sameKey = (a, b) => a.feature === b.feature && a.week === b.week;

/** Every entry names a known feature in this season, a SHA-256 and exactly the path this function gives that file. */
function validIndex(index, season) {
  return isObject(index) && index.schemaVersion === 1 && index.season === season && Array.isArray(index.files) && Array.isArray(index.superseded)
    && [...index.files, ...index.superseded].every(entry => isObject(entry) && Object.hasOwn(FEED_FEATURES, entry.feature) && entry.season === season
      && validWeek(entry.week) && typeof entry.sha256 === 'string' && HEX64.test(entry.sha256) && entry.path === feedPath(entry, entry.sha256));
}

/**
 * The season index with entry as current for its feature and week; the replaced entry joins the newest superseded copies.
 * Every entry's audience is set again from FEED_FEATURES, so an entry carried forward never keeps an older audience. The
 * read route still works out the audience from the feature itself, never from the index.
 */
export function nextIndex(previous, entry, publishedAt) {
  const index = previous ?? { schemaVersion: 1, season: entry.season, updatedAt: null, files: [], superseded: [] };
  const current = index.files.find(file => sameKey(file, entry));
  if (current?.sha256 === entry.sha256) return null;
  const audience = file => ({ ...file, audience: FEED_FEATURES[file.feature] });
  const superseded = current ? [{ ...current, supersededAt: publishedAt }, ...index.superseded] : index.superseded;
  const kept = superseded.filter((file, i) => superseded.slice(0, i).filter(other => sameKey(other, file)).length < SUPERSEDED_KEPT);
  const files = [...index.files.filter(file => !sameKey(file, entry)), entry]
    .sort((a, b) => a.feature.localeCompare(b.feature) || (a.week ?? 0) - (b.week ?? 0));
  return { schemaVersion: 1, season: entry.season, updatedAt: publishedAt, files: files.map(audience), superseded: kept.map(audience) };
}

export function createFantasyFeedIngestHandler({ service, secret, featureOff = new Set(), clock = Date.now, bodyTimeoutMs = 20000 }) {
  return async request => {
    try {
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (new URL(request.url).search) return json({ error: 'Invalid fantasy feed request.' }, 400);
      // A missing or malformed secret leaves the endpoint closed, never open.
      if (typeof secret !== 'string' || !HEX64.test(secret)) return json({ error: 'The fantasy feed service is not configured.' }, 503);
      const match = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('authorization') || '');
      if (!match || !sameSecret(match[1], secret)) return json({ error: 'Unauthorized.' }, 401);
      if (featureOff.has('fantasy-feed')) return json({ error: 'Fantasy feed uploads are switched off. Nothing stored is lost.', code: 'GTL_FEATURE_OFF' }, 503);
      const bytes = await readFeedBody(request, bodyTimeoutMs);
      let file; try { file = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw invalid('json'); }
      const now = clock();
      const audience = validateFeedFile(file, now);
      // The checks ran on the parsed value, so that value is what is stored and hashed: a duplicate key the parser
      // dropped, or anything else only the raw text carried, never reaches Storage.
      const stored = new TextEncoder().encode(JSON.stringify(file));
      const sha256 = await hex(stored);
      const path = feedPath(file, sha256);
      await service.put(path, stored, { upsert: false });
      const indexBytes = await service.get(indexPath(file.season), MAX_INDEX_BYTES);
      let previous = null;
      if (indexBytes) {
        try { previous = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(indexBytes)); } catch { previous = undefined; }
        // An index this function did not write is never overwritten.
        if (!validIndex(previous, file.season)) throw new Error('Unexpected fantasy feed index.');
      }
      const publishedAt = new Date(now).toISOString();
      const generatedAt = new Date(Date.parse(file.generatedAt)).toISOString();
      const entry = { feature: file.feature, season: file.season, week: file.week, audience, path, sha256, bytes: stored.byteLength, generatedAt, publishedAt };
      const index = nextIndex(previous, entry, publishedAt);
      if (index) await service.put(indexPath(file.season), new TextEncoder().encode(JSON.stringify(index)), { upsert: true });
      return json({ status: index ? 'published' : 'unchanged', feature: file.feature, season: file.season, week: file.week, audience, sha256, path, bytes: stored.byteLength });
    } catch (error) {
      if (error?.code === 'INPUT') return json({ error: 'Invalid fantasy feed file.', reason: error.reason }, 400);
      if (error?.code === 'TOO_LARGE') return json({ error: 'Fantasy feed file too large.' }, 413);
      return json({ error: 'The fantasy feed service is temporarily unavailable.' }, 503);
    }
  };
}
