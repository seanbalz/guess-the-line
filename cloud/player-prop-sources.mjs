import { createAssetReader } from './fantasy.mjs';
import { propWeekRoster } from './player-prop-quote-requests.mjs';

const GITHUB_RELEASE = 'https://api.github.com/repos/nflverse/nflverse-data/releases/tags';
const RELEASES = 'https://github.com/nflverse/nflverse-data/releases/download';
const MIB = 1024 * 1024;
export const PROP_SOURCE_LICENSE = Object.freeze({ license: 'CC BY 4.0', licenseUrl: 'https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md' });
export const propAssetReleaseUrl = tag => `${GITHUB_RELEASE}/${tag}`;

export function propSourceSpecs(season) {
  const spec = (key, tag, file, maxBytes) => Object.freeze({ key, tag, file, maxBytes, url: `${RELEASES}/${tag}/${file}` });
  return Object.freeze({
    stats: spec('stats', 'stats_player', `stats_player_week_${season}.csv`, 32 * MIB),
    snaps: spec('snaps', 'snap_counts', `snap_counts_${season}.csv`, 16 * MIB),
    rosters: spec('rosters', 'weekly_rosters', `roster_weekly_${season}.csv`, 48 * MIB),
    schedule: spec('schedule', 'schedules', 'games.csv', 16 * MIB),
  });
}

/** Asset metadata and byte verification shared by the operator jobs and the Edge roster reader. */
export function propAssetMetadata(release, spec) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const matches = assets.filter(asset => asset?.name === spec.file && asset.browser_download_url === spec.url);
  if (matches.length !== 1) throw new Error(`Source asset unavailable: ${spec.file}`);
  const [metadata] = matches;
  if (!Number.isSafeInteger(metadata.size) || metadata.size <= 0 || metadata.size > spec.maxBytes) throw new Error(`Source too large: ${spec.file}`);
  if (typeof metadata.digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(metadata.digest)) throw new Error(`Source digest unavailable: ${spec.file}`);
  return metadata;
}

export async function verifyPropAsset(spec, metadata, bytes, clock) {
  if (!bytes || metadata.size !== bytes.byteLength) throw new Error(`Source changed during download: ${spec.file}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const sha256 = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  if (metadata.digest !== `sha256:${sha256}`) throw new Error(`Source checksum mismatch: ${spec.file}`);
  const updated = Date.parse(metadata.updated_at ?? '');
  return Object.freeze({ key: spec.key, name: `nflverse ${spec.file}`, url: spec.url, sha256, bytes: bytes.byteLength,
    updatedAt: Number.isFinite(updated) ? new Date(updated).toISOString() : null, retrievedAt: new Date(clock()).toISOString(),
    text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), ...PROP_SOURCE_LICENSE });
}

const ROSTER_TTL = 2 * 60_000;
const UNAVAILABLE_TTL = 30_000;
const EDGE_ROSTER_BYTES = 24 * MIB;

/** Credential-free, one bounded download at a time per isolate. Only the requested week's parsed facts are cached. */
export function createPropRosterReader({ fetchImpl = fetch, clock = Date.now } = {}) {
  const read = createAssetReader({ fetchImpl });
  let cached, pending;
  async function load(season, week) {
    const spec = { ...propSourceSpecs(season).rosters, maxBytes: EDGE_ROSTER_BYTES };
    const releaseBytes = await read(propAssetReleaseUrl(spec.tag), MIB, 5_000);
    if (!releaseBytes) return null;
    const release = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(releaseBytes));
    if (release?.tag_name !== spec.tag || release.draft !== false) return null;
    const metadata = propAssetMetadata(release, spec);
    if (metadata.state !== 'uploaded') return null;
    const source = await verifyPropAsset(spec, metadata, await read(spec.url, metadata.size, 10_000), clock);
    if (!source.updatedAt || Date.parse(source.updatedAt) > clock()) return null;
    const people = propWeekRoster(source.text, { season, week });
    return people.size ? { people, availableAt: source.updatedAt } : null;
  }
  return async (season, week) => {
    const scope = `${season}:${week}`;
    if (cached?.scope === scope && cached.expiresAt > clock()) return cached.value;
    if (pending) return pending.scope === scope ? pending.result : null;
    const result = load(season, week).catch(() => null).then(value => {
      cached = { scope, value, expiresAt: clock() + (value ? ROSTER_TTL : UNAVAILABLE_TTL) };
      return value;
    }).finally(() => { pending = null; });
    pending = { scope, result };
    return result;
  };
}
