import test from 'node:test';
import assert from 'node:assert/strict';
import { sheetActions } from '../web/src/next/play/index.js';

const game = { id: 'HOU-JAX', season: 2026, week: 6 };
const data = { accountId: 'fixture', personal: { rules: { perGameScoring: true, sentFinal: true, lateWindow: 'kickoff' }, games: [game] } };
test('game actions require a signed-in, recognized game and per-game rules', () => {
  for (const action of sheetActions) {
    assert.equal(action.show(game, data), true);
    assert.equal(action.show(game, { ...data, accountId: null }), false);
    assert.equal(action.show(game, { ...data, personal: { ...data.personal, rules: {} } }), false);
    assert.equal(action.show(game, { ...data, personal: { ...data.personal, rules: { perGameScoring: true } } }), false);
    assert.equal(action.show({ ...game, id: 'UNKNOWN' }, data), false);
    assert.equal(action.show({ ...game, week: undefined }, data), false);
  }
});
test('Spread and Total actions preserve the explicit week/game and delegate to guarded navigation', () => {
  const calls = [], shell = { go: (...args) => calls.push(args) };
  sheetActions.forEach(action => action.run(game, shell));
  assert.deepEqual(calls, ['spread', 'total'].map(market => ['play', { section: 'picks', market, season: 2026, week: 6, pickGame: 'HOU-JAX' }]));
});
