import test from 'node:test';
import assert from 'node:assert/strict';
import { yourPick } from '../web/src/next/lines/yourPick.js';

const id = 'SEA-DEN';
const now = '2026-10-14T12:00:00Z', kickoff = '2026-10-15T20:00:00Z';
function data(reference, locked = true) {
  return { season: 2026, week: 6, now, deadline: kickoff, games: [{ id, awayCode: 'SEA', homeCode: 'DEN', kickoff }],
    rules: { sentFinal: true, lateWindow: 'kickoff', revealAt: 'kickoff', perGameScoring: true },
    ballots: { guess_spread: { picks: { [id]: 0 }, lockedAt: locked ? { [id]: now } : {}, guessRule: 'per-game-v1',
      lockedLate: { [id]: { minutes: 12 } }, scoringReferences: { [id]: reference } } } };
}
test('owner receipt preserves zero, Late and the saved source without market data', () => {
  const view = yourPick(data({ status: 'available', basis: 'line_at_guess', value: 0, source: 'Saved fixture', observedAt: now }), null, id, 'spread');
  assert.equal(view.line, "Pick'em"); assert.equal(view.lineLabel, 'Line at your guess');
  assert.equal(view.source, 'Saved fixture'); assert.equal(view.observedAt, now); assert.match(view.row.late, /12/);
});
test('a draft never inherits a forged scoring reference, including after kickoff or sit-out', () => {
  const personal = data({ status: 'available', value: -11.5, source: 'SECRET' }, false);
  for (const patch of [{}, { now: '2026-10-16T12:00:00Z' }, { optOuts: ['guess_spread'] }]) {
    const view = yourPick({ ...personal, ...patch }, null, id, 'spread');
    assert.equal(view.line, null); assert.equal(view.source, null); assert.equal(view.lockedAt, null);
    assert.equal(view.lineLabel, 'No locked-in scoring line');
  }
});
test('pending, missing, resolved and commissioner references keep distinct labels', () => {
  for (const [reference, label, value] of [
    [{ status: 'pending', value: 99.5 }, 'Line pending', null],
    [undefined, 'Scoring line unavailable', null],
    [{ status: 'unavailable', value: 99.5 }, 'Scoring line unavailable', null],
    [{ status: 'available', basis: 'first_line_after_submission', value: -3 }, 'First line after submission', 'DEN −3'],
    [{ status: 'available', basis: 'commissioner-ruled', value: -3 }, 'Commissioner-ruled line', 'DEN −3'],
  ]) {
    const view = yourPick(data(reference), null, id, 'spread');
    assert.equal(view.lineLabel, label); assert.equal(view.line, value);
  }
});
test('unknown game, market or clock fails closed; Total never inherits a Spread reference', () => {
  const personal = data({ status: 'available', value: -11.5 });
  assert.equal(yourPick(personal, null, 'OTHER', 'spread'), null);
  assert.equal(yourPick(personal, null, id, 'invalid'), null);
  assert.equal(yourPick({ ...personal, now: 'invalid' }, null, id, 'spread'), null);
  assert.equal(yourPick(personal, null, id, 'total').line, null);
});
