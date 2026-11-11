// Contract: expected points come only from recorded opportunities and league rates from the same games; reads need two
// games and a full position group; the gap threshold decides Buy / Hold / Sell; nothing after the selected week counts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SIGNAL_SETTINGS, expectedLine, opportunitySignals, percentiles, signalBoard, snapshotSignals } from '../shared/fantasy-signals.mjs';
import { scoreStats } from '../shared/fantasy-rankings.mjs';

const zero = { passingYards: 0, passingTds: 0, interceptions: 0, rushingYards: 0, rushingTds: 0, receptions: 0, receivingYards: 0, receivingTds: 0, fumblesLost: 0, twoPointConversions: 0, specialTeamsTds: 0, targets: 0, carries: 0, passingAttempts: 0 };
const wrGame = (week, targets, receptions, yards, tds = 0) => ({ ...zero, week, targets, receptions, receivingYards: yards, receivingTds: tds });
// Twelve receivers: targets rise with i, but production is flat except where noted, so role and production separate.
const receivers = Array.from({ length: 12 }, (_, i) => ({ id: `wr${i}`, name: `Receiver ${String(i).padStart(2, '0')}`, team: 'SEA', position: 'WR',
  history: [wrGame(1, 2 + i, 3, 40), wrGame(2, 2 + i, 3, 40)] }));
// wr11 has the biggest role and flat production: Buy. wr0 has the smallest role and two touchdowns a game: Sell.
receivers[0].history = [wrGame(1, 2, 2, 30, 2), wrGame(2, 2, 2, 30, 2)];

test('percentiles share ranks on ties and top out at 100', () => {
  assert.deepEqual(percentiles([3, 1, 2]), [100, (1 / 3) * 100, (2 / 3) * 100]);
  assert.deepEqual(percentiles([5, 5, 1, 9]), [62.5, 62.5, 25, 100]);
});

test('expected line multiplies opportunities by league rates and zeroes rare events', () => {
  const rates = { receptions: 0.5, receivingYards: 6, receivingTds: 0.05, rushingYards: 4, rushingTds: 0.02, passingYards: 7, interceptions: 0.02, passingTds: 0.05 };
  const line = expectedLine({ ...zero, targets: 10, carries: 5, passingAttempts: 0 }, rates);
  assert.equal(line.receptions, 5); assert.equal(line.receivingYards, 60); assert.equal(line.rushingYards, 20);
  assert.equal(line.fumblesLost, 0); assert.equal(line.passingYards, 0);
  assert.equal(scoreStats(line, { scoring: 'ppr', passingTds: 4, position: 'WR' }), 5 + 6 + 2 + 3 + 0.6);
});

test('role ahead of production reads Buy; production ahead of role reads Sell', () => {
  const signals = opportunitySignals(receivers, { week: 3 });
  const top = signals.get('wr11'), bottom = signals.get('wr0');
  assert.equal(top.signal, 'buy');
  assert.ok(top.overExpected < 0, 'a Buy has scored under his expected points');
  assert.equal(bottom.signal, 'sell');
  assert.ok(bottom.overExpected > 0);
  assert.ok(Math.abs(top.gap) >= SIGNAL_SETTINGS.gap && Math.abs(bottom.gap) >= SIGNAL_SETTINGS.gap);
  // Expected points total actual points across the group: the league rates come from these same games.
  const reads = [...signals.values()];
  const close = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(close(reads.reduce((t, r) => t + r.expected, 0), reads.reduce((t, r) => t + r.actual, 0)));
});

test('one game, a short position group or a kicker gets no read', () => {
  const signals = opportunitySignals([...receivers, { id: 'one', position: 'WR', history: [wrGame(1, 9, 1, 5)] },
    { id: 'te', position: 'TE', history: [wrGame(1, 5, 3, 30), wrGame(2, 5, 3, 30)] }, { id: 'k', position: 'K', history: [] }], { week: 3 });
  assert.equal(signals.get('one').signal, 'insufficient');
  assert.equal(signals.get('one').games, 1);
  assert.equal(signals.get('te').signal, 'insufficient', 'fewer than ten qualified tight ends');
  assert.equal(signals.get('te').gap, null);
  assert.equal(signals.has('k'), false);
});

test('games at or after the selected week and games with a missing usage stat never count', () => {
  const later = receivers.map(player => ({ ...player, history: [...player.history, wrGame(3, 30, 20, 300, 3)] }));
  assert.deepEqual([...opportunitySignals(later, { week: 3 }).values()], [...opportunitySignals(receivers, { week: 3 }).values()]);
  const gap = receivers.map(player => player.id === 'wr5' ? { ...player, history: [...player.history, { ...wrGame(2.5, null, 4, 50), week: 2, targets: null }] } : player);
  // A row with an unknown target count is not a usable game (its duplicate week is skipped too).
  assert.equal(opportunitySignals(gap, { week: 3 }).get('wr5').games, 2);
});

test('the board lists Buy and Sell strongest first and filters by position', () => {
  const snapshot = { week: 3, players: receivers };
  const signals = snapshotSignals(snapshot, { scoring: 'ppr', passingTds: 4 });
  const board = signalBoard(snapshot, signals, { position: 'WR' });
  assert.equal(board.buy[0].player.id, 'wr11');
  assert.equal(board.sell[0].player.id, 'wr0');
  assert.ok(board.buy.every((row, i, all) => i === 0 || all[i - 1].gap >= row.gap));
  assert.equal(board.qualified, 12);
  assert.equal(signalBoard(snapshot, signals, { position: 'RB' }).qualified, 0);
  assert.equal(signalBoard(snapshot, signals, { position: 'FLEX' }).qualified, 12);
});

test('scoring changes the values, never which games count', () => {
  const ppr = opportunitySignals(receivers, { week: 3, scoring: 'ppr' }), standard = opportunitySignals(receivers, { week: 3, scoring: 'standard' });
  assert.equal(ppr.get('wr4').games, standard.get('wr4').games);
  assert.ok(ppr.get('wr4').actual > standard.get('wr4').actual);
});
