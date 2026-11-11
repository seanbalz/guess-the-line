import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildNflGapBaseline, serializeBaseline, HISTORY_FILE, CORRECTIONS_FILE, OUTPUT } from '../scripts/prepare-nfl-gap-baseline.mjs';
import { historicalGapScore, NFL_GAP_BASELINE } from '../shared/nfl-gap-scale.mjs';
import { HISTORY_COLUMNS, writeCompactCsv } from '../shared/trends.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const fake = (id, overrides = {}) => ({ game_id: id, season: '2025', game_type: 'REG',
  home_score: '24', away_score: '21', spread_line: '3', total_line: '44', ...overrides });
const build = (rows, corrections = {}) => buildNflGapBaseline({
  historyCsv: writeCompactCsv(rows, { columns: HISTORY_COLUMNS, headerLines: [] }), correctionsJson: JSON.stringify(corrections),
});

test('published baseline reproduces from frozen files, with LF/CRLF independent provenance', () => {
  const input = { historyCsv: read(HISTORY_FILE), correctionsJson: read(CORRECTIONS_FILE) };
  const built = buildNflGapBaseline(input);
  assert.deepEqual(built, NFL_GAP_BASELINE);
  assert.equal(serializeBaseline(built), read(OUTPUT).replace(/\r\n/g, '\n'));
  assert.deepEqual(buildNflGapBaseline(Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value.replace(/\r?\n/g, '\r\n')]))), built);
  for (const market of ['spread', 'total']) {
    const sample = built.markets[market];
    assert.equal(sample.n, 2639);
    assert.equal(sample.bins.reduce((sum, [, n]) => sum + n, 0), sample.n);
  }
  assert.match(built.source.historySha256, /^[a-f0-9]{64}$/);
  assert.match(built.source.credit, /nflverse/);
});

test('nflverse spread signs use home winning margin, with away favorites and pick’em', () => {
  const b = build([fake('home'), fake('away', { home_score: '17', away_score: '24', spread_line: '-6' }),
    fake('pickem', { spread_line: '0' })]);
  assert.deepEqual(b.markets.spread.bins, [[0, 1], [1, 1], [3, 1]]);
  assert.deepEqual(b.markets.total.bins, [[1, 2], [3, 1]]);
});

test('calibration excludes other seasons, playoffs, no-contests and missing/invalid finals or lines, never turning blanks into zero', () => {
  const b = build([fake('good'), fake('future', { season: '2026' }), fake('old', { season: '2015' }),
    fake('playoff', { game_type: 'SB' }), fake('cancelled'), fake('unplayed', { home_score: '' }),
    fake('invalid', { home_score: 'NaN' }), fake('spread-only', { total_line: '' }),
    fake('total-only', { spread_line: '' }), fake('zero-total', { total_line: '0' })], { noContest: { cancelled: 'void' } });
  assert.equal(b.markets.spread.n, 3);
  assert.equal(b.markets.total.n, 2);
  assert.deepEqual(b.excluded, { noContest: 1, noFinal: 2, spreadLine: 1, totalLine: 2 });
  assert.throws(() => build([fake('same'), fake('same')]), /duplicate/);
  assert.throws(() => build([fake('none', { spread_line: '' })]), /Empty spread/);
});

test('gap size is a bounded monotone empirical rank, using the full precision before display rounding', () => {
  for (const market of ['spread', 'total']) {
    let previous = 0;
    for (let gap = 0; gap <= 100; gap += 0.25) {
      const score = historicalGapScore(market, gap);
      assert.ok(score >= previous && score >= 0 && score <= 100);
      previous = score;
    }
    assert.equal(historicalGapScore(market, 0), 0);
    assert.equal(historicalGapScore(market, 1000), 100);
    for (const invalid of [null, undefined, NaN, Infinity, -1, '3']) assert.equal(historicalGapScore(market, invalid), null);
  }
  for (const market of ['nba', 'toString', '__proto__']) assert.equal(historicalGapScore(market, 3), null);
  assert.ok(historicalGapScore('total', 5) > historicalGapScore('spread', 1));
  assert.notEqual(historicalGapScore('total', 5), historicalGapScore('spread', 5));
  assert.equal(historicalGapScore('spread', 1), 100 * 282 / 2639);
});
