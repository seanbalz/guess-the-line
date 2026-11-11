#!/usr/bin/env node
// Offline check of the opportunity signals (shared/fantasy-signals.mjs). Analysis only: reads free public nflverse
// player-week statistics (CC BY 4.0), writes .local/fantasy-signals-backtest/, and changes no production path.
//
// For each season and each week w from 3 through 15, signals are built from games before w only (Full PPR, 4-point
// passing TDs). The outcome is the player's Full PPR points per game over his recorded games in weeks w to w + 2.
// Reported: for each signal, how points per game moved against his season-to-date pace; and whether expected points
// per game or actual points per game was the better forecast of those next three weeks (MAE over the same players).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { normalizePlayerStats, parseFantasyCsv } from '../shared/fantasy-build.mjs';
import { scoreStats } from '../shared/fantasy-rankings.mjs';
import { USAGE_POSITIONS } from '../shared/fantasy-usage.mjs';
import { SIGNAL_SETTINGS, opportunitySignals } from '../shared/fantasy-signals.mjs';
import { fetchSource, sourceHeaders } from './fantasy-sources.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = path.join(root, '.local/fantasy-signals-backtest');
const FIRST_WEEK = 3, LAST_WEEK = 15, WINDOW = 3, MIN_OUTCOME_GAMES = 2;
const COLUMNS = ['player_id', 'player_display_name', 'position', 'season', 'season_type', 'week'];
const mean = values => values.reduce((total, value) => total + value, 0) / values.length;
const round = (value, places = 3) => Math.round(value * 10 ** places) / 10 ** places;
const ppr = (stats, position) => scoreStats(stats, { scoring: 'ppr', passingTds: 4, position });

const args = process.argv.slice(2), value = flag => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
if (args.includes('--help') || !value('--seasons')) {
  console.log('node scripts/fantasy-signals-backtest.mjs --seasons 2024,2025');
  process.exit(args.includes('--help') ? 0 : 1);
}
const seasons = value('--seasons').split(',').map(Number);
if (!seasons.every(Number.isInteger)) throw new Error('Provide integer seasons.');

/** The release asset, reused from .local when already downloaded; its SHA-256 is reported either way. */
async function load(season) {
  const file = `stats_player_week_${season}.csv`, url = `https://github.com/nflverse/nflverse-data/releases/download/stats_player/${file}`;
  let csv = await readFile(path.join(outDir, file)).catch(() => null);
  if (!csv) {
    const response = await fetchSource(url, { headers: sourceHeaders(url), timeoutMs: 120_000, log: line => console.error(line) });
    if (!response.ok) throw new Error(`Source unavailable (${response.status}): ${file}`);
    csv = Buffer.from(await response.arrayBuffer());
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, file), csv);
  }
  return { rows: parseFantasyCsv(csv.toString('utf8'), COLUMNS).filter(row => row.season_type === 'REG' && USAGE_POSITIONS.includes(row.position)),
    source: { url, sha256: createHash('sha256').update(csv).digest('hex'), license: 'CC BY 4.0' } };
}

function evaluate(season, rows) {
  const byPlayer = new Map();
  for (const row of rows) {
    const id = row.player_id, entry = byPlayer.get(id) ?? { id, name: row.player_display_name, position: row.position, history: [] };
    entry.history.push({ week: Number(row.week), ...normalizePlayerStats(row) });
    byPlayer.set(id, entry);
  }
  const players = [...byPlayer.values()], graded = [];
  for (let week = FIRST_WEEK; week <= LAST_WEEK; week++) {
    const signals = opportunitySignals(players, { week });
    for (const player of players) {
      const read = signals.get(player.id);
      if (!read || read.signal === 'insufficient') continue;
      const next = player.history.filter(row => row.week >= week && row.week < week + WINDOW).map(row => ppr(row, player.position)).filter(points => points !== null);
      if (next.length < MIN_OUTCOME_GAMES) continue;
      graded.push({ season, week, id: player.id, name: player.name, position: player.position, signal: read.signal, games: read.games,
        expected: read.expected, actual: read.actual, gap: read.gap, next: mean(next) });
    }
  }
  return graded;
}

function summarize(rows) {
  const bySignal = Object.fromEntries(['buy', 'hold', 'sell'].map(signal => {
    const group = rows.filter(row => row.signal === signal);
    return [signal, group.length ? { n: group.length, priorPerGame: round(mean(group.map(row => row.actual)), 2), nextPerGame: round(mean(group.map(row => row.next)), 2),
      change: round(mean(group.map(row => row.next - row.actual)), 2), improved: round(mean(group.map(row => row.next > row.actual ? 1 : 0)), 3) } : { n: 0 }];
  }));
  const mae = key => round(mean(rows.map(row => Math.abs(row.next - row[key]))), 3);
  const blend = round(mean(rows.map(row => Math.abs(row.next - (row.expected + row.actual) / 2))), 3);
  return { playerWeeks: rows.length, bySignal, forecastMae: { actualPerGame: mae('actual'), expectedPerGame: mae('expected'), blend } };
}

const results = { generatedAt: new Date().toISOString(), settings: SIGNAL_SETTINGS, window: WINDOW, minOutcomeGames: MIN_OUTCOME_GAMES, weeks: [FIRST_WEEK, LAST_WEEK], seasons: {}, sources: [] };
const all = [];
for (const season of seasons) {
  const { rows, source } = await load(season);
  const graded = evaluate(season, rows);
  all.push(...graded);
  results.sources.push(source);
  results.seasons[season] = { ...summarize(graded), byPosition: Object.fromEntries(USAGE_POSITIONS.map(position => [position, summarize(graded.filter(row => row.position === position))])) };
}
results.pooled = summarize(all);
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify({ seasons: Object.fromEntries(Object.entries(results.seasons).map(([season, value]) => [season, { playerWeeks: value.playerWeeks, bySignal: value.bySignal, forecastMae: value.forecastMae }])), pooled: results.pooled }, null, 2));
