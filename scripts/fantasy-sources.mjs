// Verified nflverse inputs for Fantasy snapshots: release metadata, size and SHA-256 checks, or a cached copy checked
// against its manifest. Shared by the manual builder (scripts/fantasy.mjs) and the scheduled refresh.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseFantasyCsv } from '../shared/fantasy-build.mjs';

export async function readFantasySources({ season, inputDir = null, root }) {
  const specs = [
    { key: 'stats', tag: 'stats_player', file: `stats_player_week_${season}.csv`, columns: ['player_id', 'position', 'season', 'season_type', 'week', 'game_id', 'team', 'opponent_team'] },
    { key: 'rosters', tag: 'weekly_rosters', file: `roster_weekly_${season}.csv`, columns: ['gsis_id', 'full_name', 'position', 'status', 'week', 'game_type'] },
    { key: 'injuries', tag: 'injuries', file: `injuries_${season}.csv`, columns: ['gsis_id', 'week', 'report_status', 'practice_status'] },
    { key: 'schedule', tag: 'schedules', file: 'games.csv', columns: ['game_id', 'season', 'game_type', 'week', 'home_team', 'away_team', 'gameday', 'gametime'] },
  ].map(spec => ({ ...spec, url: `https://github.com/nflverse/nflverse-data/releases/download/${spec.tag}/${spec.file}` }));
  const input = inputDir ? path.resolve(root, inputDir) : null;
  const manifest = input ? JSON.parse(await readFile(path.join(input, 'manifest.json'), 'utf8')) : null;
  const retrievedAt = new Date().toISOString();
  const sources = [], rows = {};
  for (const spec of specs) {
    let csv, metadata;
    if (input) {
      csv = await readFile(path.join(input, spec.file));
      metadata = manifest.find(entry => entry.name === spec.file && entry.browser_download_url === spec.url);
      if (!metadata || createHash('sha256').update(csv).digest('hex') !== metadata.sha256) throw new Error(`Unverified cached source: ${spec.file}`);
    } else {
      const release = await fetch(`https://api.github.com/repos/nflverse/nflverse-data/releases/tags/${spec.tag}`, { signal: AbortSignal.timeout(30000), headers: { Accept: 'application/vnd.github+json' } });
      if (!release.ok) throw new Error(`Source metadata unavailable (${release.status}).`);
      metadata = (await release.json()).assets.find(asset => asset.name === spec.file && asset.browser_download_url === spec.url);
      if (!metadata) throw new Error(`Source asset unavailable: ${spec.file}`);
      const response = await fetch(spec.url, { signal: AbortSignal.timeout(60000) });
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
