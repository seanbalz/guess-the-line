import test from 'node:test';
import assert from 'node:assert/strict';
import { lockConfirmed, lockedAt, mergeDraft, ownEntry, perGameReady, scoreRows, scoreSummary } from '../web/src/next/play/scoring.js';

const games = [{ id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN' }, { id: 'HOU-JAX', awayCode: 'HOU', homeCode: 'JAX' }];
const week = { season: 2026, week: 6, games };
test('per-game entry requires all server capabilities', () => {
  assert.equal(perGameReady({ sentFinal: true, lateWindow: 'kickoff' }), false);
  assert.equal(perGameReady({ sentFinal: true, lateWindow: 'deadline', perGameScoring: true }), false);
  assert.equal(perGameReady({ sentFinal: true, lateWindow: 'kickoff', perGameScoring: true }), true);
});
test('filters AND team on either side with stable matchup ID and preserve a scored zero', () => {
  const entry = { status: 'draft', eligible: true, picks: [{ gameId: 'SEA-DEN', guess: -3, lockedIn: true, points: 0, reference: { value: 9 } }, { gameId: 'HOU-JAX', guess: 7, lockedIn: false, points: 10 }] };
  assert.equal(scoreRows(week, entry, { team: 'DEN' }).length, 1);
  assert.equal(scoreRows(week, entry, { team: 'SEA', matchup: 'HOU-JAX' }).length, 0);
  assert.deepEqual(scoreSummary(scoreRows(week, entry)), { points: 0, scored: 1, locked: 1, drafts: 1, pending: 0, ineligible: 0, remaining: 1, total: 2 });
});
test('pending, ineligible, closed drafts and hidden rows never become scored zeros', () => {
  const entry = { status: 'submitted', eligible: true, scoreTiming: 'immediate', picks: [{ gameId: 'SEA-DEN', guess: -3, lockedIn: true, points: null, reference: { status: 'pending', value: null } }, { gameId: 'HOU-JAX', guess: 8, lockedIn: false, lockedAt: '2026-10-15T18:00:00Z', points: 10 }] };
  const rows = scoreRows(week, entry);
  assert.equal(rows[0].status, 'Waiting for scoring line');
  assert.equal(rows[1].locked, false);
  assert.equal(scoreSummary(rows).points, null);
  assert.equal(scoreRows(week, { ...entry, eligible: false })[0].status, 'Not eligible');
  const hidden = scoreRows(week, { ...entry, picks: [{ gameId: 'SEA-DEN', hidden: true, guess: 88, points: 88, reference: { value: 88 } }] })[0];
  assert.equal(hidden.guess, null); assert.equal(hidden.points, null); assert.equal(hidden.reference, null);
});
test('new locks beat stale local drafts while other edits stay; spread and total stay independent', () => {
  const data = { ...week, ballots: { guess_spread: { picks: { 'SEA-DEN': -3 }, lockedAt: { 'SEA-DEN': '2026-10-15T18:00:00Z' } }, guess_total: { picks: { 'SEA-DEN': 44 } } } };
  const local = { base: { 'SEA-DEN': '', 'HOU-JAX': '' }, picks: { 'SEA-DEN': 9, 'HOU-JAX': 7 } };
  assert.deepEqual(mergeDraft(data, 'guess_spread', local), { 'SEA-DEN': -3, 'HOU-JAX': 7 });
  assert.equal(lockedAt(data.ballots.guess_total, 'SEA-DEN'), null);
  assert.equal(lockConfirmed(data, { ...week, mode: 'guess_spread', lockIn: ['SEA-DEN'], picks: { 'SEA-DEN': -3 } }), true);
  assert.equal(lockConfirmed(data, { ...week, week: 5, mode: 'guess_spread', lockIn: ['SEA-DEN'], picks: { 'SEA-DEN': -3 } }), false);
  assert.equal(lockedAt({ picks: { 'SEA-DEN': 3 }, submittedAt: '2026-10-15T18:00:00Z', closedAtKickoff: ['SEA-DEN'] }, 'SEA-DEN'), null);
});
test('own entry never reads another player and a sit-out retains its locked records', () => {
  const mine = { userId: 'a', mode: 'guess_total', status: 'sat_out', picks: [] };
  assert.equal(ownEntry({ entries: [{ userId: 'b', mode: 'guess_total' }, mine] }, 'a', 'guess_total'), mine);
  assert.equal(ownEntry({ entries: [mine] }, 'a', 'guess_spread'), null);
});
