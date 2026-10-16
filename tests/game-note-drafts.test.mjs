import test from 'node:test';
import assert from 'node:assert/strict';
import { clearNextDrafts } from '../web/src/nextDrafts.js';
import { gameNoteDraftKey, gameNoteFromRead, noteFitsWriteLimit, readGameNoteDraft, validNoteReply, writeGameNoteDraft } from '../web/src/next/lines/gameNoteDraft.js';

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
  assert.equal(writeGameNoteDraft(scope, { ...draft(`${note}x`), pending: { ...pending, note: `${note}x` } }, store), false);
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
test('SQL-length astral notes remain readable and recoverable while shortened drafts keep the API write limit', () => {
  const note = '🏈'.repeat(2000), store = storage();
  const read = { scope: 'account_private', ownerId: 'owner', season: 2026, week: 6, notes: [{ gameId: scope.gameId, note, revision: 12 }] };
  const base = gameNoteFromRead(read, scope);
  assert.deepEqual(base, { note, revision: 12 });
  assert.equal(noteFitsWriteLimit(base.note), false);
  assert.throws(() => gameNoteFromRead({ ...read, notes: [{ ...read.notes[0], note: `${note}x` }] }, scope), 'SQL-invalid saved text is still refused');

  // Removing one character does not make the old note writable yet, but losing that edit is not acceptable.
  const shortening = { text: '🏈'.repeat(1999), base, pending: null };
  assert.equal(writeGameNoteDraft(scope, shortening, store), true);
  assert.deepEqual(readGameNoteDraft(scope, store), { ...shortening, v: 1 });
  assert.equal(noteFitsWriteLimit(shortening.text), false);
  const request = { requestId: '00000000-0000-4000-8000-000000000002', season: 2026, week: 6, gameId: scope.gameId, note: shortening.text, revision: 12 };
  assert.equal(writeGameNoteDraft(scope, { ...shortening, pending: request }, store), false, 'an over-limit draft cannot become a retryable write');
  assert.deepEqual(readGameNoteDraft(scope, store), { ...shortening, v: 1 }, 'the rejected pending request does not erase recovery');
  assert.equal(noteFitsWriteLimit('🏈'.repeat(1000)), true);
  assert.equal(noteFitsWriteLimit(`${'🏈'.repeat(1000)}x`), false);

  // Explicit clearing is a new allowed write, with the whole previous version kept for conflict/retry recovery.
  const clearing = { text: '', base, pending: { ...request, note: '' } };
  assert.equal(noteFitsWriteLimit(clearing.text), true);
  assert.equal(writeGameNoteDraft(scope, clearing, store), true);
  assert.deepEqual(readGameNoteDraft(scope, store), { ...clearing, v: 1 });
  const reply = { ownerId: 'owner', season: 2026, week: 6, gameId: scope.gameId, note: '', revision: 13 };
  assert.equal(validNoteReply(reply, scope, clearing.pending), true);
  assert.equal(writeGameNoteDraft(scope, { text: '', base: { note: '', revision: 13 }, pending: null }, store), true);
  assert.equal(readGameNoteDraft(scope, store), null);
});
test('conflict review can adopt a shorter saved base without losing the remaining over-limit draft', () => {
  const store = storage(), text = '🏈'.repeat(1500);
  const before = { text, base: { note: '🏈'.repeat(2000), revision: 12 }, pending: null };
  assert.equal(writeGameNoteDraft(scope, before, store), true);
  const reviewed = { ...before, base: { note: 'b'.repeat(1000), revision: 13 } };
  assert.equal(writeGameNoteDraft(scope, reviewed, store), true);
  assert.deepEqual(readGameNoteDraft(scope, store), { ...reviewed, v: 1 });
  assert.equal(noteFitsWriteLimit(reviewed.text), false);
  const pending = { requestId: '00000000-0000-4000-8000-000000000003', season: 2026, week: 6, gameId: scope.gameId, note: text, revision: 13 };
  assert.equal(writeGameNoteDraft(scope, { ...reviewed, pending }, store), false);
  assert.deepEqual(readGameNoteDraft(scope, store), { ...reviewed, v: 1 });
  assert.equal(writeGameNoteDraft(scope, { ...reviewed, text: `${'🏈'.repeat(2000)}x` }, store), false, 'recovery remains bounded');
  const clear = { ...reviewed, text: '', pending: { ...pending, note: '' } };
  assert.equal(writeGameNoteDraft(scope, clear, store), true);
  assert.deepEqual(readGameNoteDraft(scope, store), { ...clear, v: 1 }, 'the explicit clear names the reviewed revision, retaining its exact request');
});
