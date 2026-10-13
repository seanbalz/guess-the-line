// Cut the frozen trends history (completed seasons) from the nflverse schedule release.
// Usage: node scripts/trends-history.mjs [--file games.csv [--origin text]] [--through 2025] [--retrieved YYYY-MM-DD]
// Without --file it downloads the CC BY 4.0 release asset. Writes shared/trends/history-1999-<through>.csv.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { HISTORY_COLUMNS, PERIODS, TRENDS_SOURCE, parseCsvRows, rowPlayed, sourceHeaderLines, writeCompactCsv } from '../shared/trends.mjs';

const { values } = parseArgs({ options: { file: { type: 'string' }, origin: { type: 'string' }, through: { type: 'string', default: '2025' }, retrieved: { type: 'string' } } });
const through = Number(values.through);
if (!Number.isInteger(through) || through < PERIODS.discoveryLast) throw new Error('Pass --through with a completed season (2017 or later).');
let bytes;
if (values.file) bytes = readFileSync(values.file);
else {
  const response = await fetch(TRENDS_SOURCE.url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${TRENDS_SOURCE.url}`);
  bytes = Buffer.from(await response.arrayBuffer());
}
const sha256 = createHash('sha256').update(bytes).digest('hex');
const { columns, rows } = parseCsvRows(bytes.toString('utf8'));
if (columns.length !== 46) throw new Error(`Expected the 46-column nflverse schedule header, got ${columns.length} columns.`);
const kept = rows.filter(r => Number(r.season) >= PERIODS.warmupFirst && Number(r.season) <= through);
const unplayed = kept.filter(r => !rowPlayed(r));
if (unplayed.length) throw new Error(`Season ${through} is not complete: ${unplayed.length} games have no final (${unplayed.slice(0, 5).map(r => r.game_id).join(', ')}).`);
const retrieved = values.retrieved ?? new Date().toISOString().slice(0, 10);
const text = writeCompactCsv(kept, {
  headerLines: sourceHeaderLines({ origin: values.file ? (values.origin ?? 'local copy of the schedule file') : TRENDS_SOURCE.url, sha256, bytes: bytes.length, retrieved,
    scope: `seasons ${PERIODS.warmupFirst}-${through} (${PERIODS.warmupFirst}-${PERIODS.firstSeason - 1} only warm up rolling state)` }),
  columns: HISTORY_COLUMNS,
});
const out = `shared/trends/history-${PERIODS.warmupFirst}-${through}.csv`;
writeFileSync(out, text);
console.log(`${out}: ${kept.length} games, ${Buffer.byteLength(text)} bytes; input sha256 ${sha256}`);
