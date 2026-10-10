import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMUNITY_DRAFT_PREFIX, COMMUNITY_DRAFT_TTL, communityDraftScope, communityDraftEdits, communityPicksDiffer, mergeCommunityDraft, readCommunityDraft, writeCommunityDraft, removeCommunityDraft, clearCommunityDrafts } from '../web/src/communityDraft.js';

function storage() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key), key: index => [...entries.keys()][index], get length() { return entries.size; } };
}
const games = [{ id: 'TB-DAL' }, { id: 'PHI-JAX' }, { id: 'CHI-GB' }];
const scope = overrides => communityDraftScope({ accountId: 'user-one', season: 2026, week: 5, mode: 'guess_spread', ...overrides });
const saved = { 'TB-DAL': '', 'PHI-JAX': 2.5, 'CHI-GB': '' };

test('Community recovery is isolated by account, season, week and market, and is never a ballot', () => {
  const store = storage(), draft = { 'TB-DAL': -3, 'PHI-JAX': 2.5, 'CHI-GB': '' };
  assert.equal(writeCommunityDraft(scope(), draft, saved, store), true);
  // Values are stored as strings; the copy carries the saved picks it was written against, nothing else.
  assert.deepEqual(readCommunityDraft(scope(), games, store).draft, { 'TB-DAL': '-3', 'PHI-JAX': '2.5', 'CHI-GB': '' });
  assert.deepEqual(readCommunityDraft(scope(), games, store).base, { 'TB-DAL': '', 'PHI-JAX': '2.5', 'CHI-GB': '' });
  for (const overrides of [{ accountId: 'user-two' }, { season: 2027 }, { week: 6 }, { mode: 'guess_total' }]) assert.equal(readCommunityDraft(scope(overrides), games, store), null);
  assert.equal(scope({ accountId: '' }), null);
  assert.equal(scope({ accountId: undefined }), null);
  assert.equal(scope({ mode: 'betting_challenge' }), null);
  assert.equal(writeCommunityDraft(null, draft, saved, store), false);
  assert.equal(writeCommunityDraft(scope(), draft, saved, null), false);
  assert.ok(scope().startsWith(COMMUNITY_DRAFT_PREFIX));
  assert.equal(scope(), `${COMMUNITY_DRAFT_PREFIX}user-one.2026.5.guess_spread`);
});

test('Community recovery rejects copied identities, a changed slate, corrupt and extra data', () => {
  const store = storage();
  writeCommunityDraft(scope(), { 'TB-DAL': -3, 'PHI-JAX': 2.5, 'CHI-GB': '' }, saved, store);
  // A copy moved under another account's key still names its own scope, so the other account never reads it.
  store.setItem(scope({ accountId: 'user-two' }), store.getItem(scope()));
  assert.equal(readCommunityDraft(scope({ accountId: 'user-two' }), games, store), null);
  assert.equal(readCommunityDraft(scope(), [{ id: 'NEW-GAME' }, ...games], store), null);
  const good = JSON.parse(store.getItem(scope()));
  for (const patch of [{ draft: { ...good.draft, hiddenLine: '999' } }, { draft: { ...good.draft, 'TB-DAL': 'Infinity' } }, { draft: { ...good.draft, 'TB-DAL': 3 } }, { updatedAt: 'bad' }, { base: null }, { version: 2 }]) {
    store.setItem(scope(), JSON.stringify({ ...good, ...patch }));
    assert.equal(readCommunityDraft(scope(), games, store), null);
  }
  store.setItem(scope(), '{bad'); assert.equal(readCommunityDraft(scope(), games, store), null);
  assert.equal(readCommunityDraft(null, games, store), null);
});

test('Community recovery is offered for 24 hours, then dropped; a future-dated copy is dropped too', () => {
  const store = storage();
  writeCommunityDraft(scope(), { 'TB-DAL': -3, 'PHI-JAX': 2.5, 'CHI-GB': '' }, saved, store);
  const written = Date.parse(JSON.parse(store.getItem(scope())).updatedAt);
  assert.ok(readCommunityDraft(scope(), games, store, written + COMMUNITY_DRAFT_TTL - 1000));
  assert.equal(readCommunityDraft(scope(), games, store, written + COMMUNITY_DRAFT_TTL + 1000), null);
  assert.equal(store.getItem(scope()), null, 'an expired copy is removed, not kept');
  writeCommunityDraft(scope(), { 'TB-DAL': -3, 'PHI-JAX': 2.5, 'CHI-GB': '' }, saved, store);
  assert.equal(readCommunityDraft(scope(), games, store, written - 120_000), null);
  writeCommunityDraft(scope(), { 'TB-DAL': -3, 'PHI-JAX': 2.5, 'CHI-GB': '' }, saved, store);
  removeCommunityDraft(scope(), store); assert.equal(readCommunityDraft(scope(), games, store), null);
  removeCommunityDraft(null, store); removeCommunityDraft(scope(), null);
});

test('restoring puts the tab edits on top of the latest saved picks and counts only the games that changed', () => {
  const base = { 'TB-DAL': '', 'PHI-JAX': '2.5', 'CHI-GB': '' }, draft = { 'TB-DAL': '-3', 'PHI-JAX': '2.5', 'CHI-GB': '' };
  // The other device changed PHI-JAX and this tab did not: the saved value wins there, the tab's edit wins on TB-DAL (restored as a number).
  assert.deepEqual(mergeCommunityDraft(base, draft, { 'TB-DAL': '', 'PHI-JAX': 4, 'CHI-GB': '' }), { 'TB-DAL': -3, 'PHI-JAX': 4, 'CHI-GB': '' });
  // Both changed the same game: the tab's edit stays on top, the "Load latest" rule of the Picks tab.
  assert.deepEqual(mergeCommunityDraft(base, draft, { 'TB-DAL': -7, 'PHI-JAX': 2.5, 'CHI-GB': '' }), { 'TB-DAL': -3, 'PHI-JAX': 2.5, 'CHI-GB': '' });
  // A pick cleared in the tab stays cleared.
  assert.deepEqual(mergeCommunityDraft(base, { ...draft, 'PHI-JAX': '' }, { 'TB-DAL': '', 'PHI-JAX': 2.5, 'CHI-GB': '' }), { 'TB-DAL': -3, 'PHI-JAX': '', 'CHI-GB': '' });
  assert.equal(communityDraftEdits({ draft, base }), 1);
  assert.equal(communityDraftEdits({ draft: { ...draft, 'CHI-GB': '0' }, base }), 2);
  assert.equal(communityPicksDiffer({ 'TB-DAL': '', 'PHI-JAX': 2.5, 'CHI-GB': '' }, base), false);
  assert.equal(communityPicksDiffer({ 'TB-DAL': '', 'PHI-JAX': '2.50', 'CHI-GB': '' }, base), false);
  assert.equal(communityPicksDiffer({ 'TB-DAL': 0, 'PHI-JAX': 2.5, 'CHI-GB': '' }, base), true);
});

test('sign-out clearing erases every Community recovery copy without touching unrelated storage', () => {
  const store = storage();
  for (const overrides of [{}, { accountId: 'user-two' }, { mode: 'guess_total' }, { week: 6 }]) writeCommunityDraft(scope(overrides), saved, saved, store);
  store.setItem('gtl.solo-tab-draft.v1.user-one.2026.5.guess_spread', 'keep'); store.setItem('theme', 'light');
  clearCommunityDrafts(store);
  assert.equal(store.length, 2);
  assert.equal(store.getItem('theme'), 'light');
  assert.equal(store.getItem('gtl.solo-tab-draft.v1.user-one.2026.5.guess_spread'), 'keep');
  clearCommunityDrafts(null);
});
