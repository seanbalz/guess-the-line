import test from 'node:test';
import assert from 'node:assert/strict';
import { eplRecheckDueAt } from '../shared/epl-corrections.mjs';
import { resolveDeadline } from '../shared/epl-draft.mjs';

test('Tuesday recheck respects Pacific DST and never precedes the original final capture', () => {
  assert.equal(new Date(eplRecheckDueAt({ lastKickoff: '2026-10-26T20:00:00Z', originalCapturedAt: '2026-10-27T02:00:00Z' })).toISOString(), '2026-10-27T19:00:00.000Z');
  assert.equal(new Date(eplRecheckDueAt({ lastKickoff: '2026-11-02T20:00:00Z', originalCapturedAt: '2026-11-03T02:00:00Z' })).toISOString(), '2026-11-03T20:00:00.000Z');
  assert.equal(new Date(eplRecheckDueAt({ lastKickoff: '2026-11-02T20:00:00Z', originalCapturedAt: '2026-11-04T00:05:00Z' })).toISOString(), '2026-11-04T01:05:00.000Z');
  assert.equal(eplRecheckDueAt({}), null);
});

test('strict auto-picks require table positions only when price evidence does not decide the club', () => {
  const input = { order: ['a', 'b'], picks: [], clubs: ['ARS', 'LIV'], requirePosition: true };
  assert.throws(() => resolveDeadline(input), /EPL_STANDINGS_REQUIRED/);
  assert.throws(() => resolveDeadline({ ...input, favorability: { ARS: { threeWay: -110 }, LIV: { threeWay: -110 } } }), /EPL_STANDINGS_REQUIRED/);
  assert.deepEqual(resolveDeadline({ ...input, favorability: { ARS: { threeWay: -120 }, LIV: { threeWay: -110 } } }).at(-1), { managerId: 'b', club: 'ARS', source: 'auto' });
  assert.equal(resolveDeadline({ ...input, favorability: { ARS: { position: 4 }, LIV: { position: 1 } } }).at(-1).club, 'LIV');
  assert.equal(resolveDeadline({ ...input, clubs: ['LIV'] }).at(-1).club, 'LIV');
});
