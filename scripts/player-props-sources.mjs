// Verified nflverse inputs for the D-82 Player Props jobs (cloud/player-prop-jobs.mjs), checked like
// scripts/fantasy-sources.mjs does: the release metadata names the exact asset, the downloaded byte length must equal the
// published size and the SHA-256 must equal the published digest. Unlike the Fantasy reader a missing digest is refused
// too: a result receipt names the file it came from by hash. Public, free files only (CC BY 4.0); no credentials except
// the workflow's own token on api.github.com (sourceHeaders), never on a download host.
import { fetchSource, sourceHeaders } from './fantasy-sources.mjs';
import { propAssetReleaseUrl, propAssetMetadata, propSourceSpecs, verifyPropAsset } from '../cloud/player-prop-sources.mjs';
export { PROP_SOURCE_LICENSE, propSourceSpecs } from '../cloud/player-prop-sources.mjs';

/**
 * Reads one verified asset: `{ name, url, sha256, bytes, updatedAt, retrievedAt, text, ...license }`. Throws on a missing
 * asset, a size or digest mismatch, a missing digest or an oversized file; nothing partial is returned.
 */
export async function readPropSource(spec, { fetchImpl = fetch, sleep, env = process.env, log = line => console.error(line), clock = Date.now } = {}) {
  const request = (url, timeoutMs) => fetchSource(url, { headers: sourceHeaders(url, env), timeoutMs, fetchImpl, log, ...(sleep ? { sleep } : {}) });
  const release = await request(propAssetReleaseUrl(spec.tag), 30_000);
  if (!release.ok) throw new Error(`Source metadata unavailable (${release.status}).`);
  const metadata = propAssetMetadata(await release.json(), spec);
  const response = await request(spec.url, 120_000);
  if (!response.ok) throw new Error(`Source unavailable (${response.status}): ${spec.file}`);
  return verifyPropAsset(spec, metadata, new Uint8Array(await response.arrayBuffer()), clock);
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
