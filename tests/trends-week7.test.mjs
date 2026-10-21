import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { T, corrections, historyCsv, read, registry, registryText, venues } from './trends-fixture.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const seasonFile = 'shared/trends/season-2026-week-07.csv';
const seasonCsv = read(seasonFile);
const text = read('shared/trends/2026-week-07.json');
const week = JSON.parse(text);

test('Week 7 is reproducible from its preserved and credited source snapshot', () => {
  const sources = {
    history: { file: 'shared/trends/history-1999-2025.csv', sha256: sha(historyCsv) },
    season: { file: seasonFile, sha256: sha(seasonCsv) },
    registrySha256: sha(registryText),
  };
  const rebuilt = T.generateWeek({ historyCsv, seasonCsv, season: 2026, week: 7, registry, venues, corrections, sources });
  assert.equal(JSON.stringify(rebuilt) + '\n', text);
  assert.equal(week.games.length, 14);
  assert.equal(week.source.license, 'CC BY 4.0');
  assert.match(read('web/src/trendWeeks.generated.js'), /'2026-07': \(\) => import\('\.\.\/\.\.\/shared\/trends\/2026-week-07\.json'\)/);
});

test('Week 7 trends and source snapshot do not reveal unplayed market lines or private picks', () => {
  const unplayed = T.parseCsvRows(seasonCsv).rows.filter(row => !T.rowPlayed(row));
  assert.ok(unplayed.some(row => Number(row.week) === 7));
  for (const row of unplayed) for (const column of T.REDACTED_COLUMNS) {
    assert.equal(row[column], '', `${row.game_id} ${column}`);
  }
  assert.ok(week.games.every(game => !game.played));
  assert.doesNotMatch(text, /[\w.+-]+@[\w-]+\.[\w.]+/);
  assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
});
