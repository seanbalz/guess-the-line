// Offline research report, never an authenticated endpoint, a collector or a production writer.
// node scripts/discover-trends.mjs --season 2026 --file .local/trends-discovery/source.csv --now <ISO>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, dirname, sep, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { discoverTrends, variedDiscoveries, DISCOVERY_WINDOWS } from '../shared/trends-discovery.mjs';
import { TRENDS_SOURCE } from '../shared/trends.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = s => createHash('sha256').update(s).digest('hex');
export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: { season: { type: 'string' }, week: { type: 'string' }, file: { type: 'string' }, now: { type: 'string' }, teams: { type: 'string' }, window: { type: 'string', default: 'recent12' }, out: { type: 'string', default: '.local/trends-discovery/report.json' } } });
  const output = resolve(root, values.out), rel = relative(resolve(root, '.local'), output);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel) || resolve(output) === resolve(root, '.local')) throw new Error('Report output must be inside .local/.');
  const season = Number(values.season), week = values.week === undefined ? null : Number(values.week), now = values.now ?? new Date().toISOString();
  if (!Number.isInteger(season) || season < 2002 || season > 2100 || !DISCOVERY_WINDOWS.includes(values.window) || week !== null && (!Number.isInteger(week) || week < 1 || week > 25)) throw new Error('Pass a valid --season and --window.');
  let csv;
  if (values.file) csv = readFileSync(resolve(root, values.file), 'utf8');
  else { const r = await fetch(TRENDS_SOURCE.url, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error('Free history source HTTP ' + r.status); csv = await r.text(); }
  const inputs = Object.fromEntries(['venues', 'corrections'].map(name => {
    const file = `shared/${name === 'venues' ? 'nfl-venues' : 'trends-corrections'}.json`, text = readFileSync(resolve(root, file), 'utf8');
    return [name, { file, sha256: hash(text), value: JSON.parse(text) }];
  }));
  const report = discoverTrends({ csv, now, season, week, teams: values.teams ? values.teams.split(',') : [], venues: inputs.venues.value, corrections: inputs.corrections.value });
  report.source.sha256 = hash(csv); report.source.inputs = Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, { file: v.file, sha256: v.sha256 }]));
  report.variety = variedDiscoveries(report.candidates, { window: values.window });
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report) + '\n');
  console.log(JSON.stringify({ output: relative(root, output), version: report.version, discoveredAt: now, source: report.source, scope: report.scope, searched: report.searched,
    findings: report.variety.selected.map(({ id }) => { const c = report.candidates.find(c => c.id === id), r = c.windows[values.window]; return { id, title: c.title, window: values.window, requested: r.requested, completeWindow: r.completeWindow, sample: r.sample, record: [r.wins, r.losses, r.pushes], earlier: [r.earlier.wins, r.earlier.losses, r.earlier.pushes], dates: r.coverage, label: c.label }; }) }));
  return report;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main().catch(e => { console.error(e.message); process.exitCode = 1; });
