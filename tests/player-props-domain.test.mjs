// D-82 Player Props native-unit domain (shared/player-props.mjs). Fixture identities and illustrative values only; the
// accuracy fixtures are the approved board's layout values (receiving misses 6/5/2/3/4 = 4.0 yd; receptions
// 1/0.5/0.5/0/1 = 0.6 rec; paper 5-2-1 = 71.4%), not account statistics or market lines.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PROP_STATS, PROP_STAT_KEYS, propStat, propSelection, propSelectionKey, validPropGuess, validPropActual, propGuessProblem,
  stepPropGuess, propMiss, propAccuracy, formatPropMean, gradePropPaper, propGapLarge, propPaperRecord, PROP_PAPER_WIN_UNITS,
  filterPropRows } from '../shared/player-props.mjs';
import { RESEARCH_PROP_UNITS } from '../shared/research-markets.mjs';
import { GAP_WIN_UNITS } from '../shared/recommended-bets.mjs';

const EVENT = '2026_10_DAL_PHI', PLAYER = '00-0036358', OTHER = '00-0035000';

test('eleven canonical full-game stats, each with its own key and the unit the research market map records', () => {
  assert.equal(PROP_STATS.length, 11);
  assert.deepEqual(PROP_STAT_KEYS, ['player_pass_yds', 'player_pass_completions', 'player_pass_attempts', 'player_pass_tds', 'player_pass_interceptions',
    'player_rush_yds', 'player_rush_attempts', 'player_rush_tds', 'player_reception_yds', 'player_receptions', 'player_reception_tds']);
  for (const s of PROP_STATS) {
    assert.equal(RESEARCH_PROP_UNITS[s.key], s.unit, `${s.key} unit agrees with shared/research-markets.mjs`);
    assert.equal(s.signed, s.unit === 'yards', `${s.key}: only yards are signed`);
    assert.ok(Object.isFrozen(s));
  }
  // The readiness audit's raw result columns.
  assert.deepEqual(PROP_STATS.map(s => s.resultColumn), ['passing_yards', 'completions', 'attempts', 'passing_tds', 'passing_interceptions',
    'rushing_yards', 'carries', 'rushing_tds', 'receiving_yards', 'receptions', 'receiving_tds']);
  for (const excluded of ['player_anytime_td', 'player_1st_td', 'player_pass_yds_q1', 'player_reception_yds_alternate', 'player_pass_longest_completion'])
    assert.equal(propStat(excluded), null, `${excluded} is outside the catalog`);
});

test('selection identity is event + stable player ID + stat with matching season/week; names never join', () => {
  const base = { season: 2026, week: 10, eventId: EVENT, playerId: PLAYER, stat: 'player_reception_yds' };
  assert.equal(propSelectionKey(base), `2026:10:${EVENT}:${PLAYER}:player_reception_yds`);
  assert.notEqual(propSelectionKey({ ...base, stat: 'player_receptions' }), propSelectionKey(base), 'a different stat is independent');
  assert.notEqual(propSelectionKey({ ...base, playerId: OTHER }), propSelectionKey(base));
  for (const bad of [{ playerId: 'CeeDee Lamb' }, { playerId: '36358' }, { eventId: 'DAL-PHI' }, { week: 9 }, { season: 2025 }, { stat: 'receiving_yards' }])
    assert.equal(propSelection({ ...base, ...bad }), null, JSON.stringify(bad));
  assert.ok(Object.isFrozen(propSelection(base)));
});

test('signed yards versus nonnegative counts; half-point steps; same rule for line and guess', () => {
  assert.ok(validPropGuess('player_rush_yds', -2.5), 'a negative rushing line is a valid yard value');
  assert.ok(validPropGuess('player_reception_yds', 72.5));
  assert.ok(!validPropGuess('player_receptions', -0.5), 'counts cannot be negative');
  assert.ok(validPropGuess('player_receptions', 0));
  assert.ok(!validPropGuess('player_reception_yds', 72.3), 'half-point steps only');
  assert.ok(!validPropGuess('player_reception_yds', '72.5'));
  assert.ok(!validPropGuess('player_reception_yds', -0));
  assert.ok(!validPropGuess('player_pass_tds', 10.5));
  assert.ok(!validPropGuess('player_unknown', 1));
  assert.ok(validPropActual('player_rush_yds', -4));
  assert.ok(!validPropActual('player_rush_attempts', -1));
  assert.ok(!validPropActual('player_receptions', 2.5), 'a final stat is whole');
  assert.equal(propGuessProblem('player_receptions', -1), 'Receptions cannot be negative.');
  assert.equal(propGuessProblem('player_reception_yds', 72.25), 'Use whole or half numbers, such as 72.5.');
  assert.equal(propGuessProblem('player_rush_yds', -3), null);
  assert.equal(stepPropGuess('player_reception_yds', 72.5, 1), 73);
  assert.equal(stepPropGuess('player_receptions', 0, -1), 0, 'clamped at zero for a count');
  assert.equal(stepPropGuess('player_rush_yds', 0, -1), -0.5, 'yards step below zero');
  assert.ok(!Object.is(stepPropGuess('player_rush_yds', 0.5, -1), -0));
});

test('accuracy: native-unit mean absolute miss per stat from the saved reference; no combined score; exact zero vs unavailable', () => {
  const row = (stat, guess, line) => ({ stat, guess, reference: { line } });
  const rows = [
    ...[[72.5, 66.5], [60, 65], [80.5, 78.5], [45.5, 48.5], [90, 86]].map(([g, l]) => row('player_reception_yds', g, l)),
    ...[[5.5, 4.5], [4, 4.5], [6, 5.5], [3.5, 3.5], [7.5, 6.5]].map(([g, l]) => row('player_receptions', g, l)),
  ];
  const result = propAccuracy(rows);
  assert.deepEqual(result.map(r => r.stat), ['player_reception_yds', 'player_receptions']);
  const [yards, receptions] = result;
  assert.deepEqual(yards.misses, [6, 5, 2, 3, 4]);
  assert.equal(yards.mean, 4); assert.equal(yards.count, 5); assert.equal(yards.unit, 'yards'); assert.equal(formatPropMean(yards.mean), '4.0');
  assert.deepEqual(receptions.misses, [1, 0.5, 0.5, 0, 1]);
  assert.equal(receptions.mean, 0.6); assert.equal(receptions.total, 3); assert.equal(formatPropMean(receptions.mean), '0.6');
  assert.ok(!('overall' in result) && result.every(r => !('combined' in r) && !('percent' in r)), 'no combined or percentage score');
  // High and low misses cannot cancel out.
  assert.equal(propAccuracy([row('player_rush_yds', 10, 0), row('player_rush_yds', -10, 0)])[0].mean, 10);
  // Exact accuracy is a zero mean with a nonzero count; no guesses is no card and no zero.
  const exact = propAccuracy([row('player_pass_tds', 1.5, 1.5)])[0];
  assert.equal(exact.mean, 0); assert.equal(exact.count, 1);
  assert.deepEqual(propAccuracy([]), []);
  assert.equal(formatPropMean(null), '—');
  // A later or current line is not an input: only reference.line is read.
  assert.equal(propAccuracy([{ ...row('player_receptions', 5.5, 4.5), latest: { line: 5.5 }, closingLine: 5.5 }])[0].mean, 1);
  assert.equal(propMiss('player_receptions', 5.5, 4.5), 1);
});

test('paper record: side vs last qualifying line, verified final, D-77 1U at -110, pushes outside the rate', () => {
  const final = actual => ({ status: 'final', participated: true, actual });
  const g = (guess, closingLine, result, stat = 'player_reception_yds') => ({ stat, guess, closingLine, result });
  const rows = [
    g(72.5, 66.5, final(80)), g(72.5, 66.5, final(90)), g(60, 65, final(50)), g(60, 65, final(55)), g(70, 65, final(70)),
    g(70, 65, final(60)), g(60, 65, final(66)), g(70, 65, final(65)),
    g(70, 65, null), g(70, 65, { status: 'dnp', participated: false, actual: null }),
  ];
  const record = propPaperRecord(rows);
  assert.deepEqual([record.wins, record.losses, record.pushes], [5, 2, 1]);
  assert.equal(record.winRate.toFixed(3), '0.714');
  assert.deepEqual(record.ungraded, { no_final: 1, dnp: 1 }, 'missing evidence and DNP are ungraded, never losses');
  assert.equal(PROP_PAPER_WIN_UNITS, GAP_WIN_UNITS, 'the D-77 convention without importing the game-line calibration');
  assert.ok(Math.abs(record.netUnits - (5 * 10 / 11 - 2)) < 1e-12);
});

test('paper grading never invents zeros: missing row, unverified participation, corrections and cancellations stay ungraded', () => {
  const grade = result => gradePropPaper({ stat: 'player_receptions', guess: 4.5, closingLine: 3.5, result });
  assert.deepEqual(grade(undefined), { outcome: 'ungraded', side: 'over', reason: 'no_final' });
  assert.equal(grade({ status: 'final', actual: 0 }).reason, 'participation_unverified', 'a zero needs participation evidence');
  assert.equal(grade({ status: 'final', participated: true, actual: 0 }).outcome, 'loss', 'a confirmed zero grades');
  assert.equal(grade({ status: 'correction_pending' }).reason, 'correction_pending');
  assert.equal(grade({ status: 'cancelled' }).reason, 'cancelled');
  assert.equal(grade({ status: 'identity_unverified' }).reason, 'identity_unverified');
  assert.equal(gradePropPaper({ stat: 'player_receptions', guess: 4.5, closingLine: null, result: { status: 'final', participated: true, actual: 9 } }).reason, 'no_line');
  assert.equal(gradePropPaper({ stat: 'player_receptions', guess: 3.5, closingLine: 3.5 }).outcome, 'even');
  assert.equal(gradePropPaper({ stat: 'player_rush_yds', guess: -1.5, closingLine: 2.5, result: { status: 'final', participated: true, actual: -3 } }).outcome, 'win', 'under on signed yards');
});

test('prop 10%+ gap uses the absolute reference; a zero reference has no class; gap size narrows the paper record only', () => {
  assert.equal(propGapLarge(72.5, 65.5), true);
  assert.equal(propGapLarge(66.5, 65.5), false);
  assert.equal(propGapLarge(-3, -10), true, 'absolute magnitude of a negative reference');
  assert.equal(propGapLarge(0.5, 0), null);
  const final = { status: 'final', participated: true, actual: 1 };
  const rows = [{ stat: 'player_rush_tds', guess: 0.5, closingLine: 0, result: final }, { stat: 'player_rush_yds', guess: 80, closingLine: 60.5, result: { ...final, actual: 90 } },
    { stat: 'player_rush_yds', guess: 61, closingLine: 60.5, result: { ...final, actual: 90 } }];
  assert.equal(propPaperRecord(rows).wins, 3);
  assert.equal(propPaperRecord(rows, { tier: 'large' }).wins, 1);
  // Accuracy is unaffected by the paper filter: it is a separate function over saved references.
  assert.equal(propAccuracy(rows.map(r => ({ ...r, reference: { line: r.closingLine } }))).length, 2);
  assert.deepEqual(filterPropRows([{ playerId: PLAYER, stat: 'player_rush_yds' }, { playerId: OTHER, stat: 'player_rush_yds' }], { playerId: PLAYER }).length, 1);
});

test('D-81 game-line calibration is never imported by the prop domain, receipts or routes', () => {
  for (const file of ['shared/player-props.mjs', 'cloud/player-props.mjs', 'cloud/player-prop-receipts.mjs']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /from '[^']*(nfl-gap-scale|nfl-gap-baseline|recommended-bets)\.mjs'/, `${file} imports a game-line gap module`);
  }
});
