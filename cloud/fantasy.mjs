// Fantasy snapshots for signed-in players (D-57): public nflverse-derived files published by the scheduled build as
// release assets of this repository. Every file is checked against the index's size and SHA-256 and its validator before
// it is served or cached; a failure is never cached. No lines, picks or account data are read or returned here.
import { validateFantasySnapshot } from '../shared/fantasy-rankings.mjs';
import { validateFantasyReview } from '../shared/fantasy-review.mjs';
import { validateFantasyIndex, FANTASY_REPOSITORY, MAX_FILE_BYTES } from '../shared/fantasy-index.mjs';
import { fantasySeason } from '../shared/fantasy-refresh.mjs';
import { UUID_PATTERN } from './lobby.mjs';

export const FANTASY_METHODS = Object.freeze({ '/fantasy/week': ['POST'] });
export class FantasyError extends Error {
  constructor(status, message) { super(message); this.name = 'FantasyError'; this.status = status; }
}
const UNAVAILABLE = 'Fantasy data is not available right now.';
const INDEX_TTL = 10 * 60_000, MAX_INDEX_BYTES = 64 * 1024, MAX_FILES = 6;
const ORIGINS = new Set(['https://github.com', 'https://release-assets.githubusercontent.com', 'https://objects.githubusercontent.com']);

/** Bounded public GET: HTTPS GitHub redirects only, no credentials, size-capped, 404 → null. */
export function createAssetReader({ fetchImpl = fetch } = {}) {
  return async (url, maxBytes, timeoutMs) => {
    const signal = AbortSignal.timeout(timeoutMs);
    let response;
    for (let redirects = 0; ; redirects++) {
      response = await fetchImpl(url, { redirect: 'manual', credentials: 'omit', signal });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      await response.body?.cancel();
      if (redirects >= 3) throw new Error('Redirect limit exceeded.');
      let target;
      try { target = new URL(response.headers.get('location') ?? '', url); } catch { /* refused below */ }
      if (!target || !ORIGINS.has(target.origin) || target.username || target.password) throw new Error('Redirect refused.');
      url = target.href;
    }
    if (response.status === 404) { await response.body?.cancel(); return null; }
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('Unavailable.'); }
    if (Number(response.headers.get('content-length')) > maxBytes) { await response.body.cancel(); throw new Error('Too large.'); }
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { await reader.cancel(); throw new Error('Too large.'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  };
}
const hex = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
const parse = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));

export function createFantasyService({ fetchImpl = fetch, clock = Date.now, repository = FANTASY_REPOSITORY } = {}) {
  const read = createAssetReader({ fetchImpl });
  const indexes = new Map(), files = new Map(), inflight = new Map();
  const base = season => `https://github.com/${repository}/releases/download/fantasy-data-${season}`;
  const once = (key, task) => {
    if (!inflight.has(key)) inflight.set(key, task().finally(() => inflight.delete(key)));
    return inflight.get(key);
  };
  async function index(season) {
    const hit = indexes.get(season), now = clock();
    if (hit && now - hit.at < INDEX_TTL) return { value: hit.value, stale: false };
    try {
      const value = await once(`index:${season}`, async () => {
        const bytes = await read(`${base(season)}/index.json`, MAX_INDEX_BYTES, 10_000);
        if (!bytes) return null;
        const parsed = parse(bytes);
        if (!validateFantasyIndex(parsed).valid || parsed.season !== season) throw new Error('Invalid index.');
        return parsed;
      });
      indexes.set(season, { at: now, value });
      return { value, stale: false };
    } catch {
      if (hit) return { value: hit.value, stale: true };
      throw new FantasyError(503, UNAVAILABLE);
    }
  }
  async function file(season, entry, valid) {
    if (files.has(entry.sha256)) {
      const value = files.get(entry.sha256);
      files.delete(entry.sha256); files.set(entry.sha256, value);
      return value;
    }
    return once(`file:${entry.sha256}`, async () => {
      const bytes = await read(`${base(season)}/${entry.file}`, MAX_FILE_BYTES, 15_000);
      if (!bytes || bytes.byteLength !== entry.bytes || await hex(bytes) !== entry.sha256) throw new Error('Checksum mismatch.');
      const value = parse(bytes);
      if (!valid(value)) throw new Error('Invalid file.');
      files.set(entry.sha256, value);
      while (files.size > MAX_FILES) files.delete(files.keys().next().value);
      return value;
    });
  }
  return {
    async week({ season, week }) {
      const now = clock(), { value: idx, stale } = await index(season);
      if (!idx?.snapshots.length) throw new FantasyError(404, 'No Fantasy data has been published for this season.');
      const entry = week ? idx.snapshots.find(item => item.week === week) : idx.snapshots.at(-1);
      if (!entry) throw new FantasyError(404, 'No Fantasy data has been published for that week.');
      let snapshot;
      try { snapshot = await file(season, entry, value => validateFantasySnapshot(value, { now }).valid && value.season === season && value.week === entry.week); }
      catch { throw new FantasyError(503, UNAVAILABLE); }
      const reviewEntry = idx.reviews.find(item => item.week === entry.week - 1);
      let review = null;
      if (reviewEntry) {
        try { review = await file(season, reviewEntry, value => validateFantasyReview(value).valid && value.season === season && value.week === reviewEntry.week); }
        catch { review = null; }
      }
      return { index: idx, snapshot, review, source: { retrievedAt: new Date(now).toISOString(), stale } };
    },
  };
}

export async function handleFantasy({ route, body = {}, user, service, clock = Date.now, featureOff = new Set() }) {
  if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new FantasyError(401, 'Sign in to continue.');
  if (route !== '/fantasy/week') throw new FantasyError(404, 'Not found.');
  if (featureOff.has('fantasy')) throw new FantasyError(503, UNAVAILABLE);
  const keys = Object.keys(body ?? {});
  if (keys.some(key => !['season', 'week'].includes(key)) || (keys.length && (keys.length !== 2
    || !Number.isSafeInteger(body.season) || body.season < 2020 || body.season > 2100
    || !Number.isSafeInteger(body.week) || body.week < 1 || body.week > 18))) throw new FantasyError(400, 'Check the requested season and week.');
  if (!service?.week) throw new FantasyError(503, UNAVAILABLE);
  return service.week(keys.length ? { season: body.season, week: body.week } : { season: fantasySeason(clock()), week: null });
}
