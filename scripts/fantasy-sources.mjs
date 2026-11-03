// Verified nflverse inputs for Fantasy snapshots: release metadata, size and SHA-256 checks, or a cached copy checked
// against its manifest. Shared by the manual builder (scripts/fantasy.mjs) and the scheduled refresh.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseFantasyCsv } from '../shared/fantasy-build.mjs';

const GITHUB_API = 'https://api.github.com';

/**
 * Waits before the second and third attempt of one source request (three attempts in all). The October 29, 2026 refresh
 * failed on one unauthenticated 403 from api.github.com ("Source metadata unavailable (403)") and its day's snapshot was
 * lost; a 403, 429, 5xx or network error is now retried, and the scheduled run sends the workflow's own token.
 */
export const SOURCE_RETRY_WAITS_MS = Object.freeze([5_000, 10_000]);
const retryable = status => status === 403 || status === 429 || status >= 500;

/**
 * Request headers for one source URL: the workflow's token (GH_TOKEN, else GITHUB_TOKEN) goes only to api.github.com,
 * never to a download host. Downloads send no headers, as before.
 */
export function sourceHeaders(url, env = process.env) {
  if (new URL(url).origin !== GITHUB_API) return {};
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  return { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/**
 * One source request with up to three attempts. Returns the last response (the caller checks `ok`), or throws the last
 * network error. Log lines name the host, path and status only: never a header or the token.
 */
export async function fetchSource(url, { headers, timeoutMs, fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  waits = SOURCE_RETRY_WAITS_MS, log = () => {} }) {
  const { host, pathname } = new URL(url);
  for (let attempt = 0; ; attempt++) {
    let response, failure;
    try {
      response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      failure = error;
    }
    if (response && !retryable(response.status)) return response;
    if (attempt >= waits.length) {
      if (response) return response;
      throw failure;
    }
    await response?.body?.cancel?.().catch(() => {});
    const seen = response ? `HTTP ${response.status}` : failure?.name === 'TimeoutError' ? 'timeout' : 'network error';
    log(`Source request ${host}${pathname} failed (${seen}); retrying in ${waits[attempt] / 1000} s.`);
    await sleep(waits[attempt]);
  }
}

export async function readFantasySources({ season, inputDir = null, root, fetchImpl = fetch, sleep, env = process.env, log = line => console.error(line) }) {
  const specs = [
    { key: 'stats', tag: 'stats_player', file: `stats_player_week_${season}.csv`, columns: ['player_id', 'position', 'season', 'season_type', 'week', 'game_id', 'team', 'opponent_team'] },
    { key: 'rosters', tag: 'weekly_rosters', file: `roster_weekly_${season}.csv`, columns: ['gsis_id', 'full_name', 'position', 'status', 'week', 'game_type'] },
    { key: 'injuries', tag: 'injuries', file: `injuries_${season}.csv`, columns: ['gsis_id', 'week', 'report_status', 'practice_status'] },
    { key: 'schedule', tag: 'schedules', file: 'games.csv', columns: ['game_id', 'season', 'game_type', 'week', 'home_team', 'away_team', 'gameday', 'gametime'] },
  ].map(spec => ({ ...spec, url: `https://github.com/nflverse/nflverse-data/releases/download/${spec.tag}/${spec.file}` }));
  const input = inputDir ? path.resolve(root, inputDir) : null;
  const manifest = input ? JSON.parse(await readFile(path.join(input, 'manifest.json'), 'utf8')) : null;
  const retrievedAt = new Date().toISOString();
  const request = (url, timeoutMs) => fetchSource(url, { headers: sourceHeaders(url, env), timeoutMs, fetchImpl, log, ...(sleep ? { sleep } : {}) });
  const sources = [], rows = {};
  for (const spec of specs) {
    let csv, metadata;
    if (input) {
      csv = await readFile(path.join(input, spec.file));
      metadata = manifest.find(entry => entry.name === spec.file && entry.browser_download_url === spec.url);
      if (!metadata || createHash('sha256').update(csv).digest('hex') !== metadata.sha256) throw new Error(`Unverified cached source: ${spec.file}`);
    } else {
      const release = await request(`${GITHUB_API}/repos/nflverse/nflverse-data/releases/tags/${spec.tag}`, 30_000);
      if (!release.ok) throw new Error(`Source metadata unavailable (${release.status}).`);
      metadata = (await release.json()).assets.find(asset => asset.name === spec.file && asset.browser_download_url === spec.url);
      if (!metadata) throw new Error(`Source asset unavailable: ${spec.file}`);
      const response = await request(spec.url, 60_000);
      if (!response.ok) throw new Error(`Source unavailable (${response.status}): ${spec.file}`);
      csv = Buffer.from(await response.arrayBuffer());
      if (metadata.size !== csv.byteLength) throw new Error(`Source changed during download: ${spec.file}`);
    }
    const sha256 = createHash('sha256').update(csv).digest('hex');
    if (metadata.digest?.startsWith('sha256:') && metadata.digest !== `sha256:${sha256}`) throw new Error(`Source checksum mismatch: ${spec.file}`);
    sources.push({ name: `nflverse ${spec.file}`, url: spec.url, license: 'CC BY 4.0', licenseUrl: 'https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md', retrievedAt: metadata.retrievedAt || retrievedAt, updatedAt: metadata.updated_at, sha256 });
    rows[spec.key] = parseFantasyCsv(csv.toString('utf8'), spec.columns);
  }
  return { rows, sources };
}
