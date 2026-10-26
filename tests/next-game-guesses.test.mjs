import test from 'node:test';
import assert from 'node:assert/strict';
import { gameGuesses } from '../web/src/next/lines/gameGuesses.js';
const game = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN' };
const members = [{ id: 'you', displayName: 'Player One' }, { id: 'other', displayName: 'Player Two' }];
const row = { userId: 'other', status: 'in', lockedIn: true, eligible: true, hidden: false, pick: -3.5, error: 2, points: 6, rank: 1, closest: true };
const view = (rows, { open = true, started = false } = {}) => gameGuesses({ games: [{ gameId: game.id, open, started, rows }] }, 'YOU', members, game, 'spread');

test('closed games and foreign drafts never disclose picks, scores or ranks; own drafts stay visible', () => {
  for (const item of [view([row], { open: false }).rows[0], view([{ ...row, hidden: true }]).rows[0], view([{ ...row, status: 'not_yet', lockedIn: false }]).rows[0]]) {
    assert.equal(item.pick, null); assert.equal(item.score, null); assert.equal(item.place, null);
    assert.doesNotMatch(JSON.stringify(item), /3.5|6 points/);
  }
  const own = view([{ ...row, userId: 'you', status: 'not_yet', lockedIn: false }], { open: false }).rows[0];
  assert.equal(own.pick, 'DEN −3.5'); assert.equal(own.status, 'Your draft'); assert.equal(own.score, null);
});

test('reader scores stay distinct from kickoff ranks, missing values, zero and eligibility', () => {
  assert.equal(view([row]).rows[0].score, '6 points · 2 off');
  assert.equal(view([row]).rows[0].place, null);
  assert.equal(view([{ ...row, tied: true }], { started: true }).rows[0].place, 'Tied closest');
  assert.equal(view([{ ...row, rank: 2, tied: true, closest: false }], { started: true }).rows[0].place, 'Tied #2');
  assert.equal(view([{ ...row, points: 0, error: 7 }]).rows[0].score, '0 points · 7 off');
  assert.equal(view([{ ...row, points: null, error: null }]).rows[0].score, 'Score pending');
  assert.equal(view([{ ...row, eligible: false }]).rows[0].score, 'Not scoring');
  assert.equal(view([{ ...row, pick: null }]).rows[0].pick, null);
  assert.equal(view([{ ...row, pick: 0 }]).rows[0].pick, "Pick'em");
});

test('Late, removed and sit-out records keep labels; counts do not expose a foreign draft', () => {
  const board = view([{ ...row, status: 'late', removed: true }, { ...row, userId: 'absent', status: 'sat_out', lockedIn: false, pick: null },
    { ...row, userId: 'you', status: 'not_yet', lockedIn: false }, { ...row, userId: 'third', status: 'not_yet', lockedIn: false }]);
  assert.equal(board.rows[0].status, 'Late'); assert.equal(board.rows[0].removed, true);
  assert.equal(board.rows[1].status, 'Sitting out'); assert.equal(board.rows[1].score, null);
  assert.equal(board.summary, '1 locked in · 2 not locked in · 1 sitting out');
  assert.equal(view([{ ...row, status: 'invented' }]).rows.length, 0);
});
