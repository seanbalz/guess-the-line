import test from 'node:test';
import assert from 'node:assert/strict';
import { clearNextDrafts } from '../web/src/nextDrafts.js';
import { gameNoteDraftKey, gameNoteFromRead, readGameNoteDraft, validNoteReply, writeGameNoteDraft } from '../web/src/next/lines/gameNoteDraft.js';

const scope = { accountId: 'owner', season: 2026, week: 6, gameId: 'SEA-DEN' };
function storage() {
  const values = new Map();
  return { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
const draft = text => ({ text, base: { note: 'Original\n text ', revision: 7 }, pending: null });
test('note recovery keeps whitespace and empty clearing drafts, scopes every identity, and uses the account purge prefix', () => {
  const store = storage();
  assert.equal(writeGameNoteDraft(scope, draft(''), store), true);
  assert.equal(readGameNoteDraft(scope, store).text, '');
  for (const other of [{ accountId: 'someone-else' }, { week: 5 }, { season: 2025 }, { gameId: 'SEA/DEN' }]) assert.equal(readGameNoteDraft({ ...scope, ...other }, store), null);
  const note = '  First line\nSecond line  ';
  writeGameNoteDraft(scope, draft(note), store);
  assert.equal(readGameNoteDraft(scope, store).text, note);
  clearNextDrafts(store);
  assert.equal(readGameNoteDraft(scope, store), null);
});
test('recovery keeps the exact uncertain request, refuses changed scope/content and never truncates UTF-16 text', () => {
  const store = storage(), note = '🏈'.repeat(1000);
  const pending = { requestId: '00000000-0000-4000-8000-000000000001', season: 2026, week: 6, gameId: scope.gameId, note, revision: 7 };
  assert.equal(writeGameNoteDraft(scope, { ...draft(note), pending }, store), true);
  assert.deepEqual(readGameNoteDraft(scope, store).pending, pending);
  assert.equal(writeGameNoteDraft(scope, draft(`${note}x`), store), false);
  assert.equal(readGameNoteDraft(scope, store).text, note);
  store.setItem(gameNoteDraftKey(scope), JSON.stringify({ ...draft(note), v: 1, pending: { ...pending, week: 5 } }));
  assert.equal(readGameNoteDraft(scope, store), null);
});
test('a notes read is usable only for the authenticated owner and exact week; its own revision is kept', () => {
  const read = { scope: 'account_private', ownerId: 'owner', season: 2026, week: 6, revision: 99, notes: [{ gameId: scope.gameId, note: '  exact\n', revision: 3 }] };
  assert.deepEqual(gameNoteFromRead(read, scope), { note: '  exact\n', revision: 3 });
  for (const forged of [{ ownerId: 'other' }, { week: 5 }, { scope: 'community' }]) assert.throws(() => gameNoteFromRead({ ...read, ...forged }, scope));
  assert.deepEqual(gameNoteFromRead({ ...read, notes: [] }, scope), { note: '', revision: 0 });
});
test('save confirmation requires the exact owner, game, week and untrimmed note', () => {
  const request = { note: ' Keep spaces ' }, reply = { ownerId: 'owner', season: 2026, week: 6, gameId: scope.gameId, note: request.note, revision: 4 };
  assert.equal(validNoteReply(reply, scope, request), true);
  for (const changed of [{ ownerId: 'other' }, { gameId: 'OTHER' }, { week: 5 }, { note: 'Keep spaces' }, { revision: -1 }]) assert.equal(validNoteReply({ ...reply, ...changed }, scope, request), false);
});
