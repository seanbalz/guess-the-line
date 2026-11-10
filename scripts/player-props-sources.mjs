// Verified nflverse inputs for the D-82 Player Props jobs (cloud/player-prop-jobs.mjs), checked like
// scripts/fantasy-sources.mjs does: the release metadata names the exact asset, the downloaded byte length must equal the
// published size and the SHA-256 must equal the published digest. Unlike the Fantasy reader a missing digest is refused
// too: a result receipt names the file it came from by hash. Public, free files only (CC BY 4.0); no credentials except
// the workflow's own token on api.github.com (sourceHeaders), never on a download host.
import { createHash } from 'node:crypto';
import { fetchSource, sourceHeaders } from './fantasy-sources.mjs';

const GITHUB_API = 'https://api.github.com';
const RELEASES = 'https://github.com/nflverse/nflverse-data/releases/download';
const MIB = 1024 * 1024;
export const PROP_SOURCE_LICENSE = Object.freeze({ license: 'CC BY 4.0', licenseUrl: 'https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md' });

/** The four release files the jobs read for one season, with their byte caps. */
export function propSourceSpecs(season) {
  const spec = (key, tag, file, maxBytes) => Object.freeze({ key, tag, file, maxBytes, url: `${RELEASES}/${tag}/${file}` });
  return Object.freeze({
    stats: spec('stats', 'stats_player', `stats_player_week_${season}.csv`, 32 * MIB),
    snaps: spec('snaps', 'snap_counts', `snap_counts_${season}.csv`, 16 * MIB),
    rosters: spec('rosters', 'weekly_rosters', `roster_weekly_${season}.csv`, 48 * MIB),
    schedule: spec('schedule', 'schedules', 'games.csv', 16 * MIB),
  });
}

/**
 * Reads one verified asset: `{ name, url, sha256, bytes, updatedAt, retrievedAt, text, ...license }`. Throws on a missing
 * asset, a size or digest mismatch, a missing digest or an oversized file; nothing partial is returned.
 */
export async function readPropSource(spec, { fetchImpl = fetch, sleep, env = process.env, log = line => console.error(line), clock = Date.now } = {}) {
  const request = (url, timeoutMs) => fetchSource(url, { headers: sourceHeaders(url, env), timeoutMs, fetchImpl, log, ...(sleep ? { sleep } : {}) });
  const release = await request(`${GITHUB_API}/repos/nflverse/nflverse-data/releases/tags/${spec.tag}`, 30_000);
  if (!release.ok) throw new Error(`Source metadata unavailable (${release.status}).`);
  const metadata = ((await release.json()).assets ?? []).find(asset => asset.name === spec.file && asset.browser_download_url === spec.url);
  if (!metadata) throw new Error(`Source asset unavailable: ${spec.file}`);
  if (!Number.isSafeInteger(metadata.size) || metadata.size > spec.maxBytes) throw new Error(`Source too large: ${spec.file}`);
  if (typeof metadata.digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(metadata.digest)) throw new Error(`Source digest unavailable: ${spec.file}`);
  const response = await request(spec.url, 120_000);
  if (!response.ok) throw new Error(`Source unavailable (${response.status}): ${spec.file}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (metadata.size !== bytes.byteLength) throw new Error(`Source changed during download: ${spec.file}`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (metadata.digest !== `sha256:${sha256}`) throw new Error(`Source checksum mismatch: ${spec.file}`);
  const updated = Date.parse(metadata.updated_at ?? '');
  return Object.freeze({ key: spec.key, name: `nflverse ${spec.file}`, url: spec.url, sha256, bytes: bytes.byteLength,
    updatedAt: Number.isFinite(updated) ? new Date(updated).toISOString() : null, retrievedAt: new Date(clock()).toISOString(),
    text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), ...PROP_SOURCE_LICENSE });
}

/** `sources.read(key)` for the jobs, reading each file at most once per run. */
export function createPropSources({ season, ...options }) {
  const specs = propSourceSpecs(season), cache = new Map();
  return {
    read(key) {
      if (!Object.hasOwn(specs, key)) return Promise.reject(new Error('Source refused.'));
      if (!cache.has(key)) cache.set(key, readPropSource(specs[key], options));
      return cache.get(key);
    },
  };
}
