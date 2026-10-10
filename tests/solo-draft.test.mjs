import test from 'node:test';
import assert from 'node:assert/strict';
import { SOLO_DRAFT_PREFIX, soloDraftScope, soloSavedPicks, soloPicksDiffer, readSoloDraft, writeSoloDraft, removeSoloDraft, clearSoloDrafts, mergeSoloDraft } from '../web/src/soloDraft.js';

function storage() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key), key: index => [...entries.keys()][index], get length() { return entries.size; } };
}
const games = [{ id: 'TB-DAL' }, { id: 'PHI-JAX' }];
const scope = overrides => soloDraftScope({ accountId: 'user-one', season: 2026, week: 5, mode: 'guess_spread', ...overrides });
const empty = soloSavedPicks(games);

test('Solo recovery is isolated by account, season, week and market', () => {
  const store = storage(), draft = { 'TB-DAL': '-3.5', 'PHI-JAX': '' };
  assert.equal(writeSoloDraft(scope(), draft, empty, store), true);
  assert.deepEqual(readSoloDraft(scope(), games, store).draft, draft);
  for (const overrides of [{ accountId: 'user-two' }, { season: 2027 }, { week: 6 }, { mode: 'guess_total' }]) assert.equal(readSoloDraft(scope(overrides), games, store), null);
  assert.equal(scope({ accountId: '' }), null);
  assert.equal(scope({ mode: 'betting_challenge' }), null);
  assert.equal(writeSoloDraft(null, draft, empty, store), false);
  assert.ok(scope().startsWith(SOLO_DRAFT_PREFIX));
});

test('Solo recovery rejects copied identities, a changed slate, corrupt and extra data', () => {
  const store = storage();
  writeSoloDraft(scope(), { 'TB-DAL': '-3.5', 'PHI-JAX': '' }, empty, store);
  store.setItem(scope({ accountId: 'user-two' }), store.getItem(scope()));
  assert.equal(readSoloDraft(scope({ accountId: 'user-two' }), games, store), null);
  assert.equal(readSoloDraft(scope(), [{ id: 'NEW-GAME' }], store), null);
  const good = JSON.parse(store.getItem(scope()));
  for (const patch of [{ draft: { ...good.draft, hiddenLine: '999' } }, { draft: { ...good.draft, 'TB-DAL': 'Infinity' } }, { updatedAt: 'bad' }, { base: null }, { version: 2 }]) {
    store.setItem(scope(), JSON.stringify({ ...good, ...patch }));
    assert.equal(readSoloDraft(scope(), games, store), null);
  }
  store.setItem(scope(), '{bad'); assert.equal(readSoloDraft(scope(), games, store), null);
});

test('Solo recovery retains old copies for read-only reference rather than deleting at deadline', () => {
  const store = storage();
  writeSoloDraft(scope(), { 'TB-DAL': '-3.5', 'PHI-JAX': '' }, empty, store);
  const old = JSON.parse(store.getItem(scope())); old.updatedAt = '2020-01-01T00:00:00Z';
  store.setItem(scope(), JSON.stringify(old));
  assert.equal(readSoloDraft(scope(), games, store).updatedAt, old.updatedAt);
  removeSoloDraft(scope(), store); assert.equal(readSoloDraft(scope(), games, store), null);
});

test('restoring merges independent saved changes and requires explicit choices for conflicts', () => {
  const base = { 'TB-DAL': '-3', 'PHI-JAX': '' }, draft = { 'TB-DAL': '-4', 'PHI-JAX': '' };
  assert.deepEqual(mergeSoloDraft(base, draft, { 'TB-DAL': '-3.0', 'PHI-JAX': '1.5' }), { picks: { 'TB-DAL': '-4', 'PHI-JAX': '1.5' }, conflicts: {} });
  assert.deepEqual(mergeSoloDraft(base, draft, { 'TB-DAL': '-5', 'PHI-JAX': '1.5' }), {
    picks: { 'TB-DAL': '-5', 'PHI-JAX': '1.5' }, conflicts: { 'TB-DAL': { recovered: '-4', saved: '-5' } },
  });
  assert.equal(soloPicksDiffer({ 'TB-DAL': '-3.0', 'PHI-JAX': '' }, base), false);
  assert.equal(soloPicksDiffer({ 'TB-DAL': '0', 'PHI-JAX': '' }, empty), true);
});

test('signout clearing erases all Solo recovery without altering unrelated storage', () => {
  const store = storage();
  for (const overrides of [{}, { accountId: 'user-two' }, { mode: 'guess_total' }, { week: 6 }]) writeSoloDraft(scope(overrides), empty, empty, store);
  store.setItem('unrelated', 'keep'); clearSoloDrafts(store);
  assert.equal(store.length, 1); assert.equal(store.getItem('unrelated'), 'keep');
});

test('denied tab storage never masquerades as persistence or throws during cleanup', () => {
  const denied = { getItem() { throw Error('Denied'); }, setItem() { throw Error('Denied'); }, removeItem() { throw Error('Denied'); }, get length() { throw Error('Denied'); } };
  assert.equal(writeSoloDraft(scope(), empty, empty, denied), false);
  assert.equal(readSoloDraft(scope(), games, denied), null);
  assert.doesNotThrow(() => removeSoloDraft(scope(), denied));
  assert.doesNotThrow(() => clearSoloDrafts(denied));
});
