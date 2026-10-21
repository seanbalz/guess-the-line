// Weekly situational trends: refresh the redacted current-season file and write the week file.
// Usage:
//   node scripts/trends.mjs --season 2026 --week 7 [--file games.csv] [--allow-pending]
//   node scripts/trends.mjs --season 2026 --week 7 --reuse-season-file --referees refs.json   (mid-week referee rerun)
//   node scripts/trends.mjs --season 2026 --week 7 --season-file shared/trends/season-2026-week-07.csv
//   node scripts/trends.mjs --season 2026 --week 7 --reuse-season-file --check                (verify committed files)
// Without --file it downloads the nflverse schedule release (CC BY 4.0). Unplayed games lose every
// line, odds, weather and referee field before anything is written or evaluated.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { HISTORY_COLUMNS, PERIODS, TRENDS_SOURCE, TrendsPendingError, generateWeek, parseCsvRows, rowPlayed, sourceHeaderLines, writeCompactCsv } from '../shared/trends.mjs';
import { easternToUtc } from '../shared/nfl-schedule.mjs';

const { values } = parseArgs({ options: {
  season: { type: 'string' }, week: { type: 'string' }, file: { type: 'string' }, origin: { type: 'string' },
  referees: { type: 'string' }, 'allow-pending': { type: 'boolean', default: false }, check: { type: 'boolean', default: false },
  'reuse-season-file': { type: 'boolean', default: false }, 'season-file': { type: 'string' }, retrieved: { type: 'string' },
} });
const season = Number(values.season), week = Number(values.week);
if (!Number.isInteger(season) || !Number.isInteger(week) || week < 1 || week > 25) throw new Error('Pass --season and --week.');
const sha = data => createHash('sha256').update(data).digest('hex');
const historyFile = `shared/trends/history-${PERIODS.warmupFirst}-${season - 1}.csv`;
const seasonFile = values['season-file'] ?? `shared/trends/season-${season}.csv`;
if (!new RegExp(`^shared/trends/season-${season}(?:-week-\\d{2})?\\.csv$`).test(seasonFile)) {
  throw new Error('Season file must be this season’s shared/trends snapshot.');
}
const weekFile = `shared/trends/${season}-week-${String(week).padStart(2, '0')}.json`;
const loaderFile = 'web/src/trendWeeks.generated.js';
if (!existsSync(historyFile)) throw new Error(`${historyFile} is missing; cut it with node scripts/trends-history.mjs --through ${season - 1}.`);
const historyCsv = readFileSync(historyFile, 'utf8');

let seasonCsv;
if (values['reuse-season-file']) {
  if (values.file) throw new Error('--reuse-season-file and --file are exclusive.');
  seasonCsv = readFileSync(seasonFile, 'utf8');
} else {
  let bytes;
  if (values.file) bytes = readFileSync(values.file);
  else {
    const response = await fetch(TRENDS_SOURCE.url);
    if (!response.ok) throw new Error(`Download failed: ${response.status} ${TRENDS_SOURCE.url}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  const { columns, rows } = parseCsvRows(bytes.toString('utf8'));
  if (columns.length !== 46) throw new Error(`Expected the 46-column nflverse schedule header, got ${columns.length} columns.`);
  const seasonRows = rows.filter(r => Number(r.season) === season);
  if (!seasonRows.length) throw new Error(`No ${season} rows in the schedule file.`);
  // A final more than 12 hours overdue means the file is stale or a game needs a no-contest entry.
  const now = Date.now();
  const overdue = seasonRows.filter(r => !rowPlayed(r) && Number(r.week) < week && r.gametime
    && Date.parse(easternToUtc(r.gameday, r.gametime.slice(0, 5))) < now - 12 * 3_600_000);
  if (overdue.length && !values['allow-pending']) {
    console.error(`Earlier games have kicked off more than 12 hours ago without a final: ${overdue.map(r => r.game_id).join(', ')}`);
    process.exit(1);
  }
  seasonCsv = writeCompactCsv(seasonRows, {
    headerLines: sourceHeaderLines({ origin: values.file ? (values.origin ?? 'local copy of the schedule file') : TRENDS_SOURCE.url,
      sha256: sha(bytes), bytes: bytes.length, retrieved: values.retrieved ?? new Date().toISOString().slice(0, 10),
      scope: `season ${season} (all games; unplayed games redacted)`, redacted: true }),
    columns: HISTORY_COLUMNS, redactUnplayed: true,
  });
}

let referees = {};
if (values.referees) referees = JSON.parse(readFileSync(values.referees, 'utf8'));
const corrections = JSON.parse(readFileSync('shared/trends-corrections.json', 'utf8'));
const venues = JSON.parse(readFileSync('shared/nfl-venues.json', 'utf8'));
const registryText = readFileSync('shared/trends-registry.json', 'utf8');
const registry = JSON.parse(registryText);
for (const [gameId, name] of Object.entries(referees)) {
  if (name === null) continue;
  referees[gameId] = corrections.refereeAliases?.[name] ?? name;
}

let weekData;
try {
  weekData = generateWeek({ historyCsv, seasonCsv, season, week, registry, venues, corrections, referees, allowPending: values['allow-pending'],
    sources: { history: { file: historyFile, sha256: sha(historyCsv) }, season: { file: seasonFile, sha256: sha(seasonCsv) }, registrySha256: sha(registryText) } });
} catch (error) {
  if (error instanceof TrendsPendingError) {
    console.error(`${error.message}\nTeams with a pending earlier game show "updates after the final" when run with --allow-pending.`);
    process.exit(1);
  }
  throw error;
}
const unknownGames = Object.keys(referees).filter(id => !(id in weekData.assignedReferees));
const unknownNames = Object.values(referees).filter(n => n !== null && !weekData.refereeOptions.includes(n));
if (unknownGames.length || unknownNames.length) {
  console.error(`Referee file problems. Unknown games: ${unknownGames.join(', ') || 'none'}. Unknown referees: ${unknownNames.join(', ') || 'none'}. Options: ${weekData.refereeOptions.join(', ')}`);
  process.exit(1);
}
const weekText = JSON.stringify(weekData) + '\n';
const weekFiles = new Set(readdirSync('shared/trends').filter(f => /^\d{4}-week-\d{2}\.json$/.test(f)));
weekFiles.add(weekFile.split('/').pop());
const loaderText = [
  '// Generated by scripts/trends.mjs; do not edit. Each week file is a lazy, same-origin chunk.',
  'export const TREND_WEEKS = {',
  ...[...weekFiles].sort().map(f => `  '${f.slice(0, 4)}-${f.slice(10, 12)}': () => import('../../shared/trends/${f}'),`),
  '};',
  '',
].join('\n');

const outputs = [[weekFile, weekText], [loaderFile, loaderText], ...(values['reuse-season-file'] ? [] : [[seasonFile, seasonCsv]])];
if (values.check) {
  const stale = outputs.filter(([file, text]) => !existsSync(file) || readFileSync(file, 'utf8') !== text).map(([file]) => file);
  if (stale.length) { console.error(`Out of date: ${stale.join(', ')}`); process.exit(1); }
  console.log(`${weekFile} is current.`);
} else {
  for (const [file, text] of outputs) writeFileSync(file, text);
}
const gz = (await import('node:zlib')).gzipSync(weekText).length;
console.log(`${weekFile}: ${weekData.games.length} games, ${Buffer.byteLength(weekText)} bytes (${gz} gzip); as of ${weekData.asOf}`);
console.log(`season file sha256 ${sha(seasonCsv)}; history sha256 ${sha(historyCsv)}`);
console.log(`cards: ${weekData.tierCounts.tier1} Tier 1, ${weekData.tierCounts.tier2} Tier 2, ${weekData.tierCounts.watch} watch list; rows ${Object.keys(weekData.rows).length}`);
console.log(`pending teams: ${weekData.pending.map(p => `${p.team} (${p.gameId})`).join(', ') || 'none'}`);
