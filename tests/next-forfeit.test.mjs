import test from 'node:test';
import assert from 'node:assert/strict';
import { forfeitView, forfeitKey } from '../web/src/next/play/forfeit.js';
const scope = { accountId: 'luke', season: 2026, week: 6 };
const feed = () => ({ viewer: 'luke', week: { season: 2026, week: 6 }, picksDue: { now: '2026-10-15T12:00:00Z' },
  forfeit: { season: 2026, week: 6, open: true, closesAt: '2026-10-20T00:15:00Z', forfeit: null,
    markets: [{ mode: 'guess_spread', status: 'open', games: 4, lockedIn: 1 }, { mode: 'guess_total', status: 'submitted', games: 4, lockedIn: 4 }] } });
test('reveal describes the whole-week market scope and preserves partial lock counts', () => {
  const view = forfeitView(feed(), scope);
  assert.equal(view.canConfirm, true); assert.equal(view.affected, 'Spread'); assert.equal(view.rows[0].lockedIn, 1);
  const both = feed(); both.forfeit.markets[1].status = 'open'; both.forfeit.markets[1].lockedIn = 0;
  assert.equal(forfeitView(both, scope).affected, 'Spread and Total');
});
test('missing, malformed or mismatched reader never offers a write', () => {
  for (const patch of [{ viewer: 'troy' }, { viewer: 3 }, { week: { season: 2026, week: 7 } }, { picksDue: {} }, { forfeit: null }]) assert.equal(forfeitView({ ...feed(), ...patch }, scope), null);
  for (const patch of [{ week: 7 }, { markets: [] }, { markets: [{ mode: 'guess_spread', status: 'open', games: 1, lockedIn: 2 }] }, { forfeit: { reason: 'reveal', modes: [] } }]) assert.equal(forfeitView({ ...feed(), forfeit: { ...feed().forfeit, ...patch } }, scope), null);
});
test('closed, disabled and already recorded states cannot confirm another forfeit', () => {
  for (const patch of [{ open: false }, { closesAt: '2026-10-15T12:00:00Z' }, { forfeit: { reason: 'skip', modes: ['guess_spread'], createdAt: '2026-10-15T10:00:00Z' } }]) assert.equal(forfeitView({ ...feed(), forfeit: { ...feed().forfeit, ...patch } }, scope).canConfirm, false);
  assert.notEqual(forfeitKey(scope), forfeitKey({ ...scope, accountId: 'troy' }));
  assert.notEqual(forfeitKey(scope), forfeitKey({ ...scope, week: 7 }));
});

test('a confirmed receipt remains readable when the done state omits its clock', () => {
  const reply = feed(); reply.picksDue = { state: 'done', modes: [] };
  reply.forfeit.open = false; reply.forfeit.forfeit = { reason: 'reveal', modes: ['guess_spread'], createdAt: '2026-10-15T12:00:00Z' };
  assert.equal(forfeitView(reply, scope).stored.reason, 'reveal');
  assert.equal(forfeitView(reply, scope).canConfirm, false);
});
