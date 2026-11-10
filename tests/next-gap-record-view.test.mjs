import test from 'node:test';
import assert from 'node:assert/strict';
import { gapRecordView } from '../web/src/next/bets/gapRecordView.js';

test('paper-record view follows graded outcomes and filters without scoring guesses', () => {
  const board = { games: [{ id: 'a' }, { id: 'b' }] };
  const record = { graded: [{ gameId: 'a', market: 'spread', outcome: 'win', large: true }, { gameId: 'b', market: 'total', outcome: 'loss' }], wins: 1, losses: 1, pushes: 0, netUnits: -0.09, roi: -4.5, large: { wins: 1, losses: 0, pushes: 0, netUnits: 0.91, roi: 91 } };
  const all = gapRecordView(record, board);
  assert.equal(all.rows.length, 2);
  assert.ok(Math.abs(all.points[1] + 1 / 11) < 1e-12);
  assert.deepEqual(gapRecordView(record, board, 'large').rows.map(r => r.gameId), ['a']);
  assert.equal(gapRecordView(record, board, 'large').summary, record.large);
});

test('every combined row retains the actual season and week for drilldown', () => {
  const board = { games: [{ id: '2025:18:a', season: 2025, week: 18 }] };
  const record = { graded: [{ gameId: '2025:18:a', market: 'spread', outcome: 'win' }] };
  const row = gapRecordView(record, board).rows[0];
  assert.equal(row.season, 2025);
  assert.equal(row.week, 18);
});
