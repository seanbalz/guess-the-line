// Refresh data/team-records/<season>.json from the public nflverse schedule file.
// Usage: node scripts/team-records.mjs --season 2026 --through-week 5 [--file games.csv]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { computeTeamRecords, parseScheduleCsv } from '../shared/team-records.mjs';

const SOURCE = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';
const { values } = parseArgs({ options: { season: { type: 'string' }, 'through-week': { type: 'string' }, file: { type: 'string' } } });
const season = Number(values.season), throughWeek = Number(values['through-week']);
if (!Number.isInteger(season) || !Number.isInteger(throughWeek) || throughWeek < 0) throw new Error('Pass --season and --through-week.');
const text = values.file ? readFileSync(values.file, 'utf8') : await (await fetch(SOURCE)).text();
const records = computeTeamRecords(parseScheduleCsv(text), season, throughWeek);
const out = {
  ...records,
  source: SOURCE,
  source_credit: 'nflverse nfldata (Lee Sharpe); final scores only',
  retrieved_at: new Date().toISOString(),
};
mkdirSync('data/team-records', { recursive: true });
writeFileSync(`data/team-records/${season}.json`, JSON.stringify(out, null, 2) + '\n');
console.log(`${season} through Week ${throughWeek}: ${records.finals} finals, ${Object.keys(records.teams).length} teams`);
