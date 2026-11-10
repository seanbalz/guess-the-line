// Verified nflverse inputs for the Fantasy defensive-matchup insights (shared/fantasy-defense.mjs): play-by-play,
// FTN charting, participation and last season's player statistics, each checked like scripts/fantasy-sources.mjs does
// (release metadata, size and SHA-256 digest, or a cached copy checked against its manifest). Files that nflverse has
// not published (this season's participation, before the season ends) are optional and come back as null.
// Raw downloads stay in memory or under the ignored .local/ folder; only the derived insights are published.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fetchSource, sourceHeaders } from './fantasy-sources.mjs';
import { DEFENSE_COLUMNS, DEFENSE_LICENSES, buildDefenseInsights, parseCsvColumns, validateDefenseInsights } from '../shared/fantasy-defense.mjs';

const GITHUB_API = 'https://api.github.com';
const RELEASES = 'https://github.com/nflverse/nflverse-data/releases/download';

/** What the insights read, per season. `license` names DEFENSE_LICENSES; FTN-derived data is CC BY-SA 4.0. */
export function defenseSourceSpecs(season) {
  const specs = [];
  for (const [year, when] of [[season, 'current'], [season - 1, 'prior']]) {
    specs.push(
      { when, key: 'pbp', tag: 'pbp', file: `play_by_play_${year}.csv.gz`, gzip: true, license: 'nflverse', optional: when === 'prior' },
      { when, key: 'ftn', tag: 'ftn_charting', file: `ftn_charting_${year}.csv`, license: 'ftn', optional: true },
      { when, key: 'participation', tag: 'pbp_participation', file: `pbp_participation_${year}.csv`, license: 'ftn', optional: true },
    );
  }
  // This season's player statistics are already read by the snapshot; last season's feed the game-level splits.
  specs.push({ when: 'prior', key: 'stats', tag: 'stats_player', file: `stats_player_week_${season - 1}.csv`, license: 'nflverse', optional: true });
  return specs.map(spec => ({ ...spec, url: `${RELEASES}/${spec.tag}/${spec.file}`, columns: DEFENSE_COLUMNS[spec.key] }));
}

export async function readDefenseSources({ season, inputDir = null, root, fetchImpl = fetch, sleep, env = process.env, log = line => console.error(line) }) {
  const input = inputDir ? path.resolve(root, inputDir) : null;
  const manifest = input ? JSON.parse(await readFile(path.join(input, 'manifest.json'), 'utf8')) : null;
  const retrievedAt = new Date().toISOString();
  const request = (url, timeoutMs) => fetchSource(url, { headers: sourceHeaders(url, env), timeoutMs, fetchImpl, log, ...(sleep ? { sleep } : {}) });
  const releases = new Map();
  const current = {}, prior = {}, sources = [], missing = [];
  for (const spec of defenseSourceSpecs(season)) {
    let bytes, metadata;
    if (input) {
      metadata = manifest.find(entry => entry.name === spec.file && entry.browser_download_url === spec.url);
      if (!metadata) { if (spec.optional) { missing.push(spec.file); continue; } throw new Error(`Unverified cached source: ${spec.file}`); }
      bytes = await readFile(path.join(input, spec.file));
      if (createHash('sha256').update(bytes).digest('hex') !== metadata.sha256) throw new Error(`Unverified cached source: ${spec.file}`);
    } else {
      if (!releases.has(spec.tag)) {
        const release = await request(`${GITHUB_API}/repos/nflverse/nflverse-data/releases/tags/${spec.tag}`, 30_000);
        if (!release.ok) throw new Error(`Source metadata unavailable (${release.status}).`);
        releases.set(spec.tag, (await release.json()).assets ?? []);
      }
      metadata = releases.get(spec.tag).find(asset => asset.name === spec.file && asset.browser_download_url === spec.url);
      if (!metadata) { if (spec.optional) { missing.push(spec.file); continue; } throw new Error(`Source asset unavailable: ${spec.file}`); }
      const response = await request(spec.url, 120_000);
      if (!response.ok) throw new Error(`Source unavailable (${response.status}): ${spec.file}`);
      bytes = Buffer.from(await response.arrayBuffer());
      if (metadata.size !== bytes.byteLength) throw new Error(`Source changed during download: ${spec.file}`);
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (metadata.digest?.startsWith('sha256:') && metadata.digest !== `sha256:${sha256}`) throw new Error(`Source checksum mismatch: ${spec.file}`);
    const text = (spec.gzip ? gunzipSync(bytes) : bytes).toString('utf8');
    (spec.when === 'current' ? current : prior)[spec.key] = parseCsvColumns(text, spec.columns);
    const license = DEFENSE_LICENSES[spec.license];
    sources.push({ name: `nflverse ${spec.file}`, url: spec.url, license: license.license, licenseUrl: license.licenseUrl, attribution: license.attribution,
      retrievedAt: metadata.retrievedAt || retrievedAt, updatedAt: metadata.updated_at ?? null, sha256 });
  }
  return { current, prior, sources, missing };
}

/** Room left for the rest of the snapshot when insights are attached; the published file must stay under MAX_FILE_BYTES. */
export const DEFENSE_HEADROOM_BYTES = 150_000;

/**
 * Adds `defense` to a built snapshot. Fail-soft: the snapshot is the product and publishes without insights when a
 * source is unreachable, a build or validation fails, or the file would exceed the size cap (player splits are dropped
 * first, keeping the team tables). Returns { snapshot, note } where note says what happened, for the run log.
 */
export async function attachDefenseInsights(snapshot, { rows, season, inputDir = null, root, maxBytes, read = readDefenseSources, build = buildDefenseInsights, validate = validateDefenseInsights, log = line => console.error(line) }) {
  let defense;
  try {
    const sources = await read({ season, inputDir, root, log });
    defense = build({ season, week: snapshot.week, players: snapshot.players, schedule: rows.schedule, injuries: rows.injuries,
      current: { ...sources.current, stats: rows.stats }, prior: sources.prior, sources: sources.sources, generatedAt: snapshot.generatedAt });
    defense.missingSources = sources.missing;
  } catch (error) {
    return { snapshot, note: `Defensive insights skipped: ${error?.message ?? error}` };
  }
  if (!validate(defense, { season, week: snapshot.week }).valid) return { snapshot, note: 'Defensive insights skipped: validation failed.' };
  const size = value => Buffer.byteLength(`${JSON.stringify(value)}\n`);
  let next = { ...snapshot, defense };
  if (size(next) > maxBytes - DEFENSE_HEADROOM_BYTES) next = { ...snapshot, defense: { ...defense, players: {}, trimmed: true } };
  if (size(next) > maxBytes - DEFENSE_HEADROOM_BYTES) return { snapshot, note: 'Defensive insights skipped: file size cap.' };
  return { snapshot: next, note: next.defense.trimmed ? 'Defensive insights attached without player splits (size cap).' : `Defensive insights attached for ${Object.keys(defense.players).length} players.` };
}
