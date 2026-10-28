// Offline publication step for the trend builder's history (proposed D-63, docs/TRENDS.md "Trend builder").
// node scripts/prepare-trend-builder.mjs [--season-file shared/trends/season-2026-week-07.csv] [--check]
// Input: the frozen nflverse history and a redacted season file already in the repository. Output: played games only,
// with the builder's condition values computed by the same engine as every trend (shared/trends.mjs buildFeatures).
// No unplayed line, no player data. Reproduction: the same inputs give byte-identical output (--check).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import * as T from '../shared/trends.mjs';
import { BUILDER_SCHEMA, BUILDER_VERSION, GAME_CONDITIONS, SPLIT, TEAM_CONDITIONS } from '../shared/trend-builder.mjs';

export const OUTPUT = 'shared/trends/builder-history.json';
export const HISTORY_FILE = 'shared/trends/history-1999-2025.csv';
export const DEFAULT_SEASON_FILE = 'shared/trends/season-2026-week-07.csv';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const sha = text => createHash('sha256').update(text).digest('hex');

/** Encode one engine value: [value bit, known bit]. 'pending' and null are unknown. */
const bits = v => (v === true ? [1, 1] : v === false ? [0, 1] : [0, 0]);

export function buildBuilderHistory({ historyCsv, seasonCsv, seasonFile, venues, corrections }) {
  const rows = T.parseCsvRows(historyCsv).rows;
  const seasonRows = T.parseCsvRows(seasonCsv).rows;
  // The season file is already redacted for unplayed games; check it anyway, and keep its played rows only.
  for (const r of seasonRows) if (!T.rowPlayed(r)) for (const c of T.REDACTED_COLUMNS) if (r[c]) throw new Error(`Unredacted ${c} in ${r.game_id}.`);
  rows.push(...seasonRows);
  const games = T.normalizeRows(rows, { venues, corrections });
  T.redactUnplayed(games);
  const features = T.buildFeatures(games, { venues, corrections });
  // The engine's evaluation population: played, 2002 on, both closing lines recorded.
  const pop = T.evaluationGames(features, { firstSeason: SPLIT.builtOnFirst });
  const teams = [...new Set(pop.flatMap(g => [g.homeApp, g.awayApp]))].sort();
  const teamIndex = new Map(teams.map((t, i) => [t, i]));
  const epoch = Date.UTC(SPLIT.builtOnFirst, 0, 1);
  const cols = { day: [], season: [], week: [], home: [], away: [], hs: [], as: [], spread: [], total: [], g: [], gk: [], t: [] };
  for (const g of pop) {
    let gv = 0, gk = 0;
    for (const c of GAME_CONDITIONS) { const [v, k] = bits(g.gf[c.atom]); gv |= v << c.bit; gk |= k << c.bit; }
    const team = [0, 1].map(side => {
      let v = 0, k = 0;
      for (const c of TEAM_CONDITIONS) { const [a, b] = bits(g.tf[side][c.atom]); v |= a << c.bit; k |= b << c.bit; }
      return [v, k];
    });
    if (!Number.isInteger(g.spread * 2) || !Number.isInteger(g.total * 2)) throw new Error(`Line not in half points: ${g.id}.`);
    cols.day.push(Math.round((Date.parse(`${g.date}T00:00:00Z`) - epoch) / 86400000));
    cols.season.push(g.season); cols.week.push(g.week);
    cols.home.push(teamIndex.get(g.homeApp)); cols.away.push(teamIndex.get(g.awayApp));
    cols.hs.push(g.homeScore); cols.as.push(g.awayScore);
    cols.spread.push(g.spread * 2); cols.total.push(g.total * 2);
    cols.g.push(gv); cols.gk.push(gk);
    cols.t.push((team[0][0] | (team[1][0] << 8) | (team[0][1] << 16) | (team[1][1] << 24)) >>> 0);
  }
  const last = pop.at(-1);
  return {
    schema: BUILDER_SCHEMA, version: BUILDER_VERSION,
    source: {
      url: T.TRENDS_SOURCE.url, license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      credit: 'Data: nflverse; schedules maintained by Lee Sharpe (CC BY 4.0), modified',
      modified: 'Played games since 2002 with both closing lines; corrections from shared/trends-corrections.json; conditions computed by GTL.',
      lineSource: T.LINE_SOURCE,
      history: { file: HISTORY_FILE, sha256: sha(historyCsv) },
      season: { file: seasonFile, sha256: sha(seasonCsv) },
    },
    coverage: { firstSeason: pop[0].season, from: pop[0].date, through: last.date, lastSeason: last.season, games: pop.length },
    conditions: { game: GAME_CONDITIONS.map(c => c.id), team: TEAM_CONDITIONS.map(c => c.id) },
    teams, games: cols,
  };
}

export function builderHistoryText(options) {
  return JSON.stringify(buildBuilderHistory(options)) + '\n';
}

function main() {
  const { values } = parseArgs({ options: { 'season-file': { type: 'string' }, check: { type: 'boolean', default: false } } });
  const seasonFile = values['season-file'] ?? DEFAULT_SEASON_FILE;
  const text = builderHistoryText({
    historyCsv: read(HISTORY_FILE), seasonCsv: read(seasonFile), seasonFile,
    venues: JSON.parse(read('shared/nfl-venues.json')), corrections: JSON.parse(read('shared/trends-corrections.json')),
  });
  const out = new URL(OUTPUT, root);
  if (values.check) {
    if (!existsSync(out) || readFileSync(out, 'utf8') !== text) throw new Error('Trend builder history differs; regenerate and review before publication.');
  } else writeFileSync(out, text, 'utf8');
  const data = JSON.parse(text);
  console.log(JSON.stringify({ check: values.check, output: OUTPUT, bytes: Buffer.byteLength(text), ...data.coverage }));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
