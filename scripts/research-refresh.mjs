#!/usr/bin/env node
// Offline free-data build. No Supabase credentials, odds requests or user records.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createResearchSnapshot, finalAvailableAt, RESEARCH_PERIODS } from '../shared/trends-research-candidates.mjs';
import { TRENDS_SOURCE, parseCsvRows, rowPlayed } from '../shared/trends.mjs';
import { observedPlayStatistics } from '../shared/research-play-statistics.mjs';
import { appCode, easternToUtc } from '../shared/nfl-schedule.mjs';
import { validatePublicResearchSnapshot, validateResearchIndex, MAX_RESEARCH_DECODED_BYTES } from '../shared/research-data.mjs';
import { snapshotModule } from './prepare-trends-research.mjs';
import { parseFantasyCsv } from '../shared/fantasy-build.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const root = fileURLToPath(new URL('../', import.meta.url));
export function buildPlayResearch({ csv, plays, season, now, sourceHash }) {
  const rows = parseCsvRows(csv).rows.filter(r => Number(r.season) === season);
  const completedGames = rows.filter(r => rowPlayed(r)).map(r => ({ id: r.game_id, date: r.gameday, availableAt: finalAvailableAt(r.gameday) }));
  // The schedule's team codes and PBP codes differ for LA/WSH and old aliases.
  const normalized = plays.map(p => ({ ...p, posteam: appCode(p.posteam) }));
  const cache = new Map();
  return rows.map(r => {
    const kickoff = easternToUtc(r.gameday, r.gametime), asOf = new Date(Math.min(Date.parse(now), Date.parse(kickoff) - 1)).toISOString();
    const teams = [r.away_team, r.home_team].map(appCode).map(team => {
      const key = `${team}:${asOf}`;
      if (!cache.has(key)) cache.set(key, observedPlayStatistics({ plays: normalized, completedGames, team, asOf, sourceHash }));
      return cache.get(key);
    });
    return { gameId: `${appCode(r.away_team)}-${appCode(r.home_team)}`, week: Number(r.week), kickoff, teams };
  });
}
export async function buildResearchRelease({ csv, plays, pbpHash, season, now, registry, venues, corrections }) {
  const rows = parseCsvRows(csv).rows;
  if (!rows.some(r => Number(r.season) === season) || rows.some(r => Number(r.season) === season && !rowPlayed(r) && Date.parse(finalAvailableAt(r.gameday)) <= Date.parse(now))) throw new Error('Current season finals are incomplete.');
  const snapshot = await createResearchSnapshot({ csv, now, season, registry, venues, corrections });
  snapshotModule(snapshot); // Same public/redacted-only publication guard as the bundled artifact.
  const playStatistics = buildPlayResearch({ csv, plays, season, now, sourceHash: pbpHash });
  const completed = rows.filter(r => Number(r.season) === season && rowPlayed(r) && Date.parse(finalAvailableAt(r.gameday)) <= Date.parse(now));
  const playedIds = new Set(plays.map(p => p.game_id));
  if (!completed.length || completed.some(r => !playedIds.has(r.game_id))) throw new Error('Play-by-play is missing completed games.');
  if (!snapshot.candidates.length || !playStatistics.some(g => g.teams.some(t => t.metrics.some(m => m.sample > 0 && m.value !== null)))) throw new Error('Research output is empty; publication refused.');
  const index = { version: 1, season, generatedAt: now, source: snapshot.source, pbpSha256: pbpHash, files: [] };
  const files = new Map();
  for (const period of RESEARCH_PERIODS) {
    const data = { ...snapshot, candidates: snapshot.candidates.map(c => ({ ...c, periods: { [period]: c.periods[period] } })), playStatistics };
    validatePublicResearchSnapshot(data, { season, period, now: Date.parse(now) });
    const json = JSON.stringify(data);
    if (Buffer.byteLength(json) > MAX_RESEARCH_DECODED_BYTES) throw new Error('Research payload exceeds the decoded limit.');
    const bytes = gzipSync(json, { level: 9 }), sha256 = sha(bytes), file = `${period}-${sha256}.json.gz`;
    index.files.push({ period, file, bytes: bytes.length, sha256 }); files.set(file, bytes);
  }
  validateResearchIndex(index, season, Date.parse(now));
  files.set('index.json', Buffer.from(JSON.stringify(index) + '\n'));
  return { index, files, receipt: { season, generatedAt: now, latestCompleted: snapshot.source.latestCompleted, completedGames: completed.length, candidates: snapshot.candidates.length,
    qualifyingTrends: snapshot.candidates.filter(c => c.qualification.qualifies).length, statisticMatchups: playStatistics.length, pbpGames: playedIds.size, sourceSha256: snapshot.source.sha256, pbpSha256: pbpHash } };
}
async function download(url, limit) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok || !response.body) throw new Error('Free research source unavailable.');
  const chunks = []; let size = 0;
  for await (const part of response.body) { size += part.length; if (size > limit) throw new Error('Research source exceeds limit.'); chunks.push(part); }
  return Buffer.concat(chunks);
}
async function main() {
  const { values } = parseArgs({ options: { season: { type: 'string' }, out: { type: 'string', default: '.local/research-release' }, schedule: { type: 'string' }, pbp: { type: 'string' }, now: { type: 'string' } } });
  const now = values.now ?? new Date().toISOString(), date = new Date(now), season = Number(values.season ?? (date.getUTCFullYear() - (date.getUTCMonth() < 2 ? 1 : 0)));
  if (!Number.isSafeInteger(season) || season < 2002 || season > 2100 || !Number.isFinite(date.getTime())) throw new Error('Invalid season/time.');
  const dir = path.resolve(root, values.out);
  if (!dir.startsWith(path.join(root, '.local') + path.sep)) throw new Error('Use an ignored .local output directory.');
  await fs.mkdir(dir, { recursive: true });
  const [schedule, pbp] = await Promise.all([
    values.schedule ? fs.readFile(values.schedule) : download(TRENDS_SOURCE.url, 12_000_000),
    values.pbp ? fs.readFile(values.pbp) : download(`https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`, 50_000_000),
  ]);
  const read = async name => JSON.parse(await fs.readFile(path.join(root, 'shared', name), 'utf8'));
  const [registry, venues, corrections] = await Promise.all(['trends-registry.json', 'nfl-venues.json', 'trends-corrections.json'].map(read));
  const plays = parseFantasyCsv(gunzipSync(pbp, { maxOutputLength: 150_000_000 }).toString('utf8'), ['game_id', 'posteam', 'play_type', 'qb_dropback', 'rush_attempt', 'pass_attempt', 'sack']);
  const result = await buildResearchRelease({ csv: schedule.toString('utf8'), plays, pbpHash: sha(pbp), season, now, registry, venues, corrections });
  for (const [file, bytes] of result.files) await fs.writeFile(path.join(dir, file), bytes);
  await fs.writeFile(path.join(dir, 'receipt.json'), JSON.stringify(result.receipt, null, 2) + '\n');
  // Retain exact source receipts for reproducibility; never upload raw source inputs.
  await fs.writeFile(path.join(dir, 'schedule.csv'), schedule); await fs.writeFile(path.join(dir, 'pbp.csv.gz'), pbp);
  console.log(JSON.stringify(result.receipt));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
