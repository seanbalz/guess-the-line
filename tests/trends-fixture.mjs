// Shared loaders for the situational-trends tests (not a test file itself).
import { readFileSync } from 'node:fs';
import * as T from '../shared/trends.mjs';

export const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
export const venues = JSON.parse(read('shared/nfl-venues.json'));
export const corrections = JSON.parse(read('shared/trends-corrections.json'));
export const registryText = read('shared/trends-registry.json');
export const registry = JSON.parse(registryText);
export const historyCsv = read('shared/trends/history-1999-2025.csv');
export const seasonCsv = read('shared/trends/season-2026.csv');

/** The 2026-10-12 study's conventions: every new rule off (parity with its published numbers). */
export const studyCorrections = {
  ...corrections,
  rules: { ...Object.fromEntries(Object.keys(corrections.rules).map(k => [k, false])), kickoffTwelveHourFix: true },
  kickoff: {}, roofOverrides: {}, qbIdMerge: {},
  venueOverrides: Object.fromEntries(Object.entries(corrections.venueOverrides).map(([k, v]) => [k, { stadium: v.stadium }])),
};

export function build(corr = corrections, { withSeason = true } = {}) {
  const rows = T.parseCsvRows(historyCsv).rows;
  if (withSeason) rows.push(...T.parseCsvRows(seasonCsv).rows);
  const fg = T.buildFeatures(T.normalizeRows(rows, { corrections: corr, venues }), { venues, corrections: corr });
  return { fg, pop: T.evaluationGames(fg), byId: new Map(fg.map(g => [g.id, g])) };
}

/** A synthetic schedule row with every engine column (blank unless given). */
export function row(o) {
  const r = Object.fromEntries(T.HISTORY_COLUMNS.map(c => [c, '']));
  Object.assign(r, { game_type: 'REG', location: 'Home', overtime: '0', div_game: '0', roof: 'outdoors', surface: 'grass', gametime: '13:00', weekday: 'Sunday' }, o);
  for (const k of Object.keys(r)) r[k] = r[k] === null || r[k] === undefined ? '' : String(r[k]);
  if (!r.game_id) r.game_id = `${r.season}_${String(r.week).padStart(2, '0')}_${r.away_team}_${r.home_team}`;
  return r;
}

export { T };
