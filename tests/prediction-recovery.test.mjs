import test from 'node:test';
import assert from 'node:assert/strict';
import { draftScope, draftHasChanges, readDraft, writeRecoveryCopy, removeDraft, savedAttemptMatches } from '../web/src/predictionDraft.js';

const storage = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
const games = [{ id: 'TB-DAL', prediction: null }, { id: 'PHI-JAX', prediction: 42 }];
const data = { playerId: 'troy', mode: 'guess_total', league: { season: 2026, week: 5 }, games };
const copy = () => ({ updatedAt: new Date().toISOString(), draft: { 'TB-DAL': '44.5', 'PHI-JAX': '' }, base: { 'TB-DAL': '', 'PHI-JAX': '42' }, pendingSave: null });

test('recovery isolates authenticated accounts even when their legacy roster IDs match', () => {
  const store = storage(), original = copy(), scope = draftScope(data, 'account-a');
  writeRecoveryCopy(scope, original, store);
  assert.deepEqual(readDraft(scope, games, store), original);
  for (const other of [draftScope(data, 'account-b'), draftScope(data), draftScope({ ...data, mode: 'guess_spread' }, 'account-a'), draftScope({ ...data, league: { season: 2026, week: 6 } }, 'account-a')]) assert.equal(readDraft(other, games, store), null);
  assert.equal(draftScope({ ...data, league: { ...data.league, id: 'another-group' } }, 'account-a'), scope);
});

test('closed recovery preserves cleared and entered values without altering its lifetime or saved ballot', () => {
  const store = storage(), scope = draftScope(data), original = copy(), saved = JSON.stringify(games);
  writeRecoveryCopy(scope, original, store);
  assert.equal(draftHasChanges(readDraft(scope, games, store)), true);
  assert.equal(readDraft(scope, games, store).draft['PHI-JAX'], '');
  assert.equal(readDraft(scope, games, store).updatedAt, original.updatedAt);
  removeDraft(scope, store);
  assert.equal(readDraft(scope, games, store), null);
  assert.equal(JSON.stringify(games), saved);
});

test('old, future and malformed uncertain copies cannot be restored', () => {
  const store = storage(), scope = draftScope(data);
  for (const patch of [{ updatedAt: new Date(Date.now() - 24 * 3600000 - 1000).toISOString() }, { updatedAt: new Date(Date.now() + 120000).toISOString() }, { pendingSave: { submit: true, revision: -1, picks: {} } }]) {
    writeRecoveryCopy(scope, { ...copy(), ...patch }, store);
    assert.equal(readDraft(scope, games, store), null);
  }
});

const attempt = { submit: true, revision: 4, serverNow: '2026-10-08T18:00:00Z', picks: { 'TB-DAL': 0, 'PHI-JAX': 44.5 }, changed: ['TB-DAL', 'PHI-JAX'] };
const readback = () => ({ ...data, now: '2026-10-08T18:01:00Z', weeklyRevision: 5, submittedAt: '2026-10-08T18:00:01Z', games: games.map(game => ({ ...game, prediction: attempt.picks[game.id], scoringReference: { status: 'available', value: 0, savedAt: '2026-10-08T18:00:01Z' } })) });
test('uncertain submission is confirmed only by newer saved values and required timestamped references', () => {
  assert.equal(savedAttemptMatches(readback(), attempt), true);
  for (const change of [value => { value.weeklyRevision = 4; }, value => { value.submittedAt = null; }, value => { value.games[0].prediction = null; }, value => { value.games[0].scoringReference = null; }, value => { value.games[0].scoringReference.savedAt = '2026-10-08T17:59:59Z'; }, value => { value.games[0].scoringReference.savedAt = '2026-10-08T18:02:00Z'; }]) {
    const value = readback(); change(value); assert.equal(savedAttemptMatches(value, attempt), false);
  }
});

test('changed-only confirmation accepts retained references and does not confuse null with zero', () => {
  const value = readback(); value.games[1].scoringReference = { status: 'available', value: 45, savedAt: '2026-10-08T17:00:00Z' };
  assert.equal(savedAttemptMatches(value, { ...attempt, changed: ['TB-DAL'] }), true);
  value.games[0].prediction = null;
  assert.equal(savedAttemptMatches(value, { ...attempt, changed: ['TB-DAL'] }), false);
  assert.equal(savedAttemptMatches({ ...value, submittedAt: null }, { ...attempt, submit: false, picks: { 'PHI-JAX': 44.5 }, changed: [] }), true);
});
