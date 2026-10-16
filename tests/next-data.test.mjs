import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { connectRefresh, createDataStore, createWriter, FOCUS_REFRESH_MS, REFRESH_MS, writeProblem } from '../web/src/next/data/store.js';
import {
  COMMUNITY, COMMUNITY_ID, communityPlayers, currentLeague, groupLeagues, leagueChoiceKey, leagueRows, pendingInvites, readLeagueChoice,
  saveLeagueChoice,
} from '../web/src/next/data/league.js';
import { profileName, signInMethods } from '../web/src/next/data/account.js';
import { NEXT_DRAFT_MAX, NEXT_DRAFT_PREFIX, clearNextDrafts, nextDraftKey, readNextDraft, removeNextDraft, writeNextDraft } from '../web/src/nextDrafts.js';
import { counter as playCounter } from '../web/src/next/play/index.js';
import { SLOTS, tabBadge } from '../web/src/next/shell/tabs.js';
import { ApiError, SaveUncertainError } from '../web/src/apiResponse.js';

// Redesign build plan, stage 11: the new app's data layer (web/src/next/data), its typed-text drafts
// (web/src/nextDrafts.js) and the Play counter. Pure modules only: fake reads, a fake clock, a fake window and fake
// storage. Fictional accounts; no player data and no network.

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const GROUP = `g_${'a'.repeat(32)}`;
const OTHER_GROUP = `g_${'b'.repeat(32)}`;

/** A read that answers when told to: `source.calls`, `source.answer(value)`, `source.fail(error)`, `source.signals`. */
function controlledSource() {
  const waiting = [];
  const source = signal => new Promise((resolve, reject) => { waiting.push({ resolve, reject }); source.signals.push(signal); });
  source.signals = [];
  Object.defineProperty(source, 'calls', { get: () => source.signals.length });
  source.answer = value => waiting.shift().resolve(value);
  source.fail = error => waiting.shift().reject(error);
  return source;
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const clock = (start = 1_000_000) => { const c = { ms: start, now: () => c.ms }; return c; };
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key: index => [...map.keys()][index] ?? null,
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: key => { map.delete(key); },
    keys: () => [...map.keys()],
  };
}
const throwingStorage = () => ({ get length() { throw new Error('blocked'); }, key() { throw new Error('blocked'); }, getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } });
/** A window with focus, online and visibilitychange events and one interval timer it can fire. */
function fakeWindow() {
  const listeners = { win: new Map(), doc: new Map() };
  const on = map => (type, fn) => { if (!map.has(type)) map.set(type, new Set()); map.get(type).add(fn); };
  const off = map => (type, fn) => map.get(type)?.delete(fn);
  const doc = { visibilityState: 'visible', addEventListener: on(listeners.doc), removeEventListener: off(listeners.doc) };
  const win = {
    document: doc,
    timers: new Map(),
    addEventListener: on(listeners.win),
    removeEventListener: off(listeners.win),
    setInterval(fn, ms) { const id = win.timers.size + 1; win.timers.set(id, { fn, ms }); return id; },
    clearInterval(id) { win.timers.delete(id); },
    fire(type) { for (const fn of listeners.win.get(type) ?? []) fn(); },
    fireDoc(type) { for (const fn of listeners.doc.get(type) ?? []) fn(); },
    tickInterval() { for (const t of win.timers.values()) t.fn(); },
    count: () => [...listeners.win.values(), ...listeners.doc.values()].reduce((n, set) => n + set.size, 0),
  };
  return win;
}

// ---------- the shared reads ----------

test('one request for two consumers: a read on its way is shared, and a loaded read is not repeated', async () => {
  const community = controlledSource();
  const store = createDataStore({ community });
  assert.equal(store.get('community').status, 'idle');
  const first = store.load('community');
  const second = store.load('community');
  assert.equal(community.calls, 1, 'the second consumer shares the read on its way');
  assert.equal(first, second);
  assert.equal(store.get('community').status, 'loading');
  community.answer({ viewer: A });
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a, b, 'both consumers get the same copy');
  assert.deepEqual(a.data, { viewer: A });
  assert.equal(a.status, 'ready');
  const third = await store.load('community');
  assert.equal(community.calls, 1, 'a loaded read is not read again by a third consumer');
  assert.equal(third.data, a.data);
  assert.equal(store.get('community'), store.get('community'), 'a stable view between changes');
});

test('focus reads again (not within 15 seconds of the last good read); back online and every 5 minutes too; hidden tabs wait', async () => {
  assert.equal(REFRESH_MS, 300_000);
  assert.equal(FOCUS_REFRESH_MS, 15_000);
  const lobby = controlledSource();
  const community = controlledSource();
  const c = clock();
  const store = createDataStore({ lobby, community }, { now: c.now });
  const win = fakeWindow();
  const disconnect = connectRefresh(win, store);
  assert.deepEqual([...win.timers.values()].map(t => t.ms), [REFRESH_MS]);
  store.load('lobby');
  lobby.answer({ profile: { displayName: 'Avery' } });
  await tick();

  win.fire('focus');
  assert.equal(lobby.calls, 1, 'a focus right after a read does not read again');
  c.ms += FOCUS_REFRESH_MS;
  win.fire('focus');
  assert.equal(lobby.calls, 2, 'a focus 15 seconds later reads again');
  assert.equal(community.calls, 0, 'only reads a screen asked for are refreshed');
  win.fire('focus');
  assert.equal(lobby.calls, 2, 'a focus while that read is on its way shares it');
  lobby.answer({ profile: { displayName: 'Avery B' } });
  await tick();
  assert.equal(store.get('lobby').data.profile.displayName, 'Avery B');

  c.ms += FOCUS_REFRESH_MS;
  win.document.visibilityState = 'hidden';
  win.fireDoc('visibilitychange');
  win.tickInterval();
  assert.equal(lobby.calls, 2, 'a hidden tab neither refreshes on the timer nor on hiding');
  win.document.visibilityState = 'visible';
  win.fireDoc('visibilitychange');
  assert.equal(lobby.calls, 3, 'coming back into view reads again');
  lobby.answer({ profile: { displayName: 'Avery' } });
  await tick();
  win.tickInterval();
  assert.equal(lobby.calls, 4, 'the 5-minute tick reads again, however recent the last read');
  lobby.answer({ profile: { displayName: 'Avery' } });
  await tick();
  win.fire('online');
  assert.equal(lobby.calls, 5, 'back online reads again');
  lobby.answer({ profile: { displayName: 'Avery' } });
  await tick();

  disconnect();
  assert.equal(win.count(), 0, 'every listener is removed');
  assert.equal(win.timers.size, 0, 'the timer is cleared');
  c.ms += REFRESH_MS;
  win.fire('focus');
  assert.equal(lobby.calls, 5);
});

test('a failed refresh keeps the last good copy and notes the error; 403 and 404 drop it; 401 asks to sign in again', async () => {
  const lobby = controlledSource();
  const store = createDataStore({ lobby });
  store.load('lobby');
  lobby.answer({ profile: { displayName: 'Avery' } });
  await tick();
  const refresh = store.refresh();
  assert.equal(store.get('lobby').status, 'ready', 'the last copy stays on screen while a refresh runs');
  assert.equal(store.get('lobby').loading, true);
  lobby.fail(new ApiError('The game service is unavailable.', 503));
  await refresh;
  assert.equal(store.get('lobby').status, 'ready');
  assert.deepEqual(store.get('lobby').data, { profile: { displayName: 'Avery' } });
  assert.equal(store.get('lobby').error.status, 503);
  assert.equal(store.signInNeeded, false);

  const offline = store.refresh();
  lobby.fail(new TypeError('Failed to fetch'));
  await offline;
  assert.equal(store.get('lobby').status, 'ready', 'no answer at all keeps the copy too');

  const unauthorized = store.refresh();
  lobby.fail(new ApiError('Sign in to continue.', 401));
  await unauthorized;
  assert.equal(store.signInNeeded, true);
  assert.equal(store.get('lobby').status, 'ready', 'a 401 keeps what is on screen');
  store.clearSignInNeeded();
  assert.equal(store.signInNeeded, false);

  const refused = store.refresh();
  lobby.fail(new ApiError('Open My games and save your display name to join the community.', 403));
  await refused;
  assert.equal(store.get('lobby').status, 'error', 'a refusal means the copy no longer applies');
  assert.equal(store.get('lobby').data, null);
  assert.equal(store.get('lobby').error.status, 403);
  const again = store.refresh();
  assert.equal(store.get('lobby').status, 'error', 'a failure stays on screen while it is read again');
  assert.equal(store.get('lobby').loading, true);
  lobby.answer({ profile: { displayName: 'Avery' } });
  await again;
  assert.equal(store.get('lobby').status, 'ready');
  assert.equal(store.get('lobby').error, null);
});

test('a read that failed with no copy stays failed while it is read again; signing in again forgets its 401 and reads again', async () => {
  const lobby = controlledSource();
  const community = controlledSource();
  const store = createDataStore({ lobby, community });
  store.load('community');
  community.fail(new ApiError('You are not in the community.', 403));
  await tick();
  // The removed-account screen and the focus in it stay while the Community is read again (focus, tick, back online).
  const refusedAgain = store.refresh();
  assert.equal(community.calls, 2);
  assert.deepEqual([store.get('community').status, store.get('community').loading, store.get('community').error.status], ['error', true, 403]);
  community.fail(new ApiError('You are not in the community.', 403));
  await refusedAgain;
  assert.deepEqual([store.get('community').status, store.get('community').loading], ['error', false]);

  store.load('lobby');
  lobby.fail(new ApiError('Sign in to continue.', 401));
  await tick();
  assert.equal(store.signInNeeded, true);
  store.clearSignInNeeded();
  assert.equal(store.get('lobby').status, 'error', '"Not now" keeps the failure, with Try again');
  const tryAgain = store.refresh({ only: ['lobby'] });
  assert.deepEqual([store.get('lobby').status, store.get('lobby').loading], ['error', true], 'Try again keeps the card, saying so');
  lobby.fail(new ApiError('Sign in to continue.', 401));
  await tryAgain;
  assert.equal(store.signInNeeded, true);

  const renewed = store.signedInAgain();
  assert.equal(store.signInNeeded, false);
  assert.deepEqual([store.get('lobby').status, store.get('lobby').error], ['loading', null], 'once signed in again, that 401 no longer holds');
  assert.equal(store.get('community').status, 'error', 'any other failure stays until its answer comes');
  assert.equal(store.get('community').loading, true);
  assert.deepEqual([lobby.calls, community.calls], [3, 3], 'every read a screen asked for is read again');
  lobby.answer({ profile: { displayName: 'Avery' } });
  community.fail(new ApiError('You are not in the community.', 403));
  await renewed;
  assert.equal(store.get('lobby').status, 'ready');
  assert.equal(store.get('community').status, 'error');
});

test('abort on unmount: every read on its way is cancelled and its answer dropped; a later load starts afresh', async () => {
  const lobby = controlledSource();
  const community = controlledSource();
  const store = createDataStore({ lobby, community });
  let changes = 0;
  const unsubscribe = store.subscribe(() => { changes += 1; });
  store.load('lobby');
  store.load('community');
  store.abortAll();
  assert.equal(lobby.signals[0].aborted, true);
  assert.equal(community.signals[0].aborted, true);
  lobby.answer({ late: true });
  community.fail(new ApiError('late', 500));
  await tick();
  assert.equal(store.get('lobby').data, null, 'an answer after the abort is dropped');
  assert.equal(store.get('community').error, null);
  const before = changes;
  store.abortAll();
  assert.equal(changes, before, 'nothing to abort, nothing changes');
  const fresh = store.load('lobby');
  assert.equal(lobby.calls, 2);
  lobby.answer({ fresh: true });
  assert.deepEqual((await fresh).data, { fresh: true });
  unsubscribe();
  store.refresh();
  lobby.answer({ fresh: true });
  await tick();
  assert.equal(changes > before, true);
});

test('a read that throws at once still settles, and an unknown read is a programming error', async () => {
  const store = createDataStore({ lobby: () => { throw new ApiError('nope', 500); } });
  const view = await store.load('lobby');
  assert.equal(view.status, 'error');
  assert.equal(view.loading, false);
  assert.throws(() => store.get('feed'), /No read named feed/);
});

// ---------- writes ----------

test('a post-save refresh cannot reuse a read that started before the save', async () => {
  const community = controlledSource();
  const store = createDataStore({ community });
  const oldRead = store.load('community');
  const save = createWriter(store)('comment', async () => ({ saved: true }), { refresh: ['community'] });
  await tick();
  assert.equal(community.calls, 1);
  community.answer({ comments: [] });
  await oldRead;
  await tick();
  assert.equal(community.calls, 2, 'a fresh read follows the old in-flight answer');
  community.answer({ comments: ['new comment'] });
  assert.equal((await save).ok, true);
  assert.deepEqual(store.get('community').data.comments, ['new comment']);
});

test('unmount cancels a post-save refresh queued behind an in-flight read', async () => {
  const community = controlledSource();
  const store = createDataStore({ community });
  const oldRead = store.load('community');
  const save = createWriter(store)('comment', async () => ({ saved: true }), { refresh: ['community'] });
  await tick();
  store.abortAll();
  community.answer({ comments: [] });
  await oldRead;
  await save;
  assert.equal(community.calls, 1, 'no fresh read is started after the app unmounts');
});

test('no write retry after SaveUncertainError: sent once, the reads are checked again, and nothing sends it again', async () => {
  const lobby = controlledSource();
  const c = clock();
  const store = createDataStore({ lobby }, { now: c.now });
  const win = fakeWindow();
  connectRefresh(win, store);
  store.load('lobby');
  lobby.answer({ profile: { displayName: '' } });
  await tick();
  const write = createWriter(store);
  let sends = 0;
  const send = () => { sends += 1; return Promise.reject(new SaveUncertainError(502)); };
  const first = write('profile', send, { refresh: ['lobby'] });
  const twice = write('profile', send, { refresh: ['lobby'] });
  assert.equal(first, twice, 'a second tap while the first is on its way gets its answer');
  await tick();
  assert.equal(lobby.calls, 2, 'the account is read again to check what was saved');
  lobby.answer({ profile: { displayName: '' } });
  const result = await first;
  assert.equal(sends, 1);
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'uncertain');
  assert.match(result.message, /could not confirm/);
  // Focus, the timer and coming back online read again; none of them sends the write.
  c.ms += REFRESH_MS;
  win.fire('focus');
  lobby.answer({ profile: { displayName: '' } });
  await tick();
  win.tickInterval();
  lobby.answer({ profile: { displayName: '' } });
  await tick();
  assert.equal(lobby.calls, 4);
  assert.equal(sends, 1, 'a write is never sent again by itself');
  // The member taps again: a new write.
  const ok = await write('profile', () => { sends += 1; return Promise.resolve({ displayName: 'Avery' }); });
  assert.deepEqual(ok, { ok: true, data: { displayName: 'Avery' } });
  assert.equal(sends, 2);
});

test('a write answered 401 asks to sign in again and does not read again; other problems are named', async () => {
  const lobby = controlledSource();
  const store = createDataStore({ lobby });
  store.load('lobby');
  lobby.answer({});
  await tick();
  const write = createWriter(store);
  const result = await write('join', () => Promise.reject(new ApiError('Sign in to continue.', 401)), { refresh: ['lobby'] });
  assert.equal(result.kind, 'signIn');
  assert.equal(store.signInNeeded, true);
  assert.equal(lobby.calls, 1, 'a read after a 401 would only answer 401 again');
  const refusing = write('join', () => Promise.reject(new ApiError('This invitation is unavailable, expired, or belongs to another email address.', 404)), { refresh: ['lobby'] });
  await tick();
  assert.equal(lobby.calls, 2, 'a refusal reads again, so the screen shows what is saved');
  lobby.answer({});
  assert.deepEqual(await refusing, { ok: false, kind: 'refused', message: 'This invitation is unavailable, expired, or belongs to another email address.', status: 404 });
  assert.deepEqual(writeProblem(new TypeError('Failed to fetch')), { kind: 'offline', message: '', status: 0 });
  assert.deepEqual(writeProblem(new ApiError('The saved data service is temporarily unavailable.', 503)), { kind: 'failed', message: 'The saved data service is temporarily unavailable.', status: 503 });
  assert.equal(writeProblem(new SaveUncertainError()).kind, 'uncertain');
});

// ---------- leagues ----------

const lobbyFor = (leagues, invites = []) => ({ profile: { id: A, displayName: 'Avery Stone' }, leagues, pendingInvites: invites });

test('the switcher lists only this account\'s leagues: the Community first, then its groups by name', () => {
  const lobby = lobbyFor([
    { id: GROUP, name: 'Zeta friends', format: 'group', role: 'player', memberCount: 4, maxMembers: 20, practice: false },
    { id: 'sean-troy-luke', name: 'Triple Threat', format: 'triple-threat', role: 'commissioner', memberCount: 3, maxMembers: 3, practice: false },
    { id: 'not-a-league', name: 'Bad id' },
    null,
  ]);
  const community = { members: [{ id: A, displayName: 'Avery Stone', removed: false }, { id: B, displayName: 'Blake', removed: true }, { id: 'c', displayName: 'Casey' }] };
  assert.equal(communityPlayers(community), 2, 'removed members are not counted as players');
  assert.equal(communityPlayers(null), null);
  const rows = leagueRows({ lobby, community, current: { id: GROUP } });
  assert.deepEqual(rows.map(row => [row.id, row.name, row.players, row.on]), [
    [COMMUNITY_ID, 'Community', 2, false],
    ['sean-troy-luke', 'Triple Threat', 3, false],
    [GROUP, 'Zeta friends', 4, true],
  ]);
  assert.equal(rows[1].host, true);
  assert.deepEqual(leagueRows({ lobby: null, community: null, current: null }).map(row => [row.id, row.on]), [[COMMUNITY_ID, true]]);
  assert.equal(groupLeagues({ leagues: [{ id: GROUP, name: '  ' }] })[0].name, 'Private league');
});

test('the league choice is kept per account on this device; a league this account is not in shows as pending', () => {
  const storage = memoryStorage();
  assert.equal(readLeagueChoice(A, storage), null, 'nothing saved: the Community');
  assert.equal(saveLeagueChoice(A, { id: GROUP, name: 'Zeta friends' }, storage), true);
  assert.deepEqual(readLeagueChoice(A, storage), { id: GROUP, name: 'Zeta friends' });
  assert.equal(readLeagueChoice(B, storage), null, 'another account on this device reads only its own');
  assert.equal(storage.getItem(leagueChoiceKey(A)), JSON.stringify({ id: GROUP, name: 'Zeta friends' }));
  assert.equal(saveLeagueChoice(A, COMMUNITY, storage), true);
  assert.equal(storage.getItem(leagueChoiceKey(A)), null, 'the Community is the default, so it is not stored');
  assert.equal(saveLeagueChoice(A, { id: 'drop table', name: 'x' }, storage), false);
  for (const bad of ['{"id":"elsewhere"}', 'not json', '[]', '{"id":"g_short"}']) {
    storage.setItem(leagueChoiceKey(A), bad);
    assert.equal(readLeagueChoice(A, storage), null, bad);
  }
  assert.equal(readLeagueChoice(A, throwingStorage()), null);
  assert.equal(saveLeagueChoice(A, { id: GROUP, name: 'x' }, throwingStorage()), false);
  assert.equal(readLeagueChoice('', storage), null);

  const lobby = lobbyFor([{ id: GROUP, name: 'Zeta friends (renamed)', role: 'player', memberCount: 5 }]);
  assert.deepEqual(currentLeague(null, lobby), { ...COMMUNITY, pending: false });
  assert.deepEqual(currentLeague({ id: GROUP, name: 'Zeta friends' }, lobby), { id: GROUP, name: 'Zeta friends (renamed)', players: 5, host: false, community: false, pending: false });
  assert.deepEqual(currentLeague({ id: OTHER_GROUP, name: 'Old group' }, lobby), { id: OTHER_GROUP, name: 'Old group', community: false, pending: true });
});

test('invites sent to this account, and the account\'s name and sign-in methods', () => {
  const lobby = lobbyFor([], [
    { id: 'inv-1', leagueId: GROUP, leagueName: 'Zeta friends', format: 'group', inviterName: 'Casey', expiresAt: '2026-10-20T16:00:00Z' },
    { id: '', leagueName: 'no id' },
    { id: 'inv-2', leagueId: OTHER_GROUP, leagueName: '', inviterName: null, expiresAt: null },
  ]);
  assert.deepEqual(pendingInvites(lobby), [
    { id: 'inv-1', leagueId: GROUP, leagueName: 'Zeta friends', from: 'Casey', expiresAt: '2026-10-20T16:00:00Z' },
    { id: 'inv-2', leagueId: OTHER_GROUP, leagueName: 'Private league', from: 'A league host', expiresAt: null },
  ]);
  assert.deepEqual(pendingInvites(null), []);
  assert.equal(profileName(lobby), 'Avery Stone');
  for (const blank of [{ profile: { displayName: '   ' } }, { profile: {} }, null]) assert.equal(profileName(blank), '');
  assert.deepEqual(signInMethods({ app_metadata: { provider: 'email', providers: ['email'] } }), { password: true, google: false });
  assert.deepEqual(signInMethods({ app_metadata: { provider: 'google', providers: ['google'] } }), { password: false, google: true });
  assert.deepEqual(signInMethods({ app_metadata: { provider: 'email', providers: ['email', 'google'] } }), { password: true, google: true });
  assert.deepEqual(signInMethods({}), { password: true, google: false });
});

// ---------- typed-text drafts ----------

test('drafts are kept per account in this tab; another account never reads them; clearNextDrafts removes only them', () => {
  const store = memoryStorage({ 'gtl.community-tab-draft.v1.x': 'old app', 'gtl.app': 'next' });
  assert.equal(nextDraftKey(A, 'name-step'), `${NEXT_DRAFT_PREFIX}${A}.name-step`);
  for (const bad of [[A, 'Name Step'], [A, ''], ['', 'name-step'], [null, 'name-step']]) assert.equal(nextDraftKey(...bad), null);
  assert.equal(readNextDraft(A, 'name-step', store), '');
  assert.equal(writeNextDraft(A, 'name-step', 'Avery St', store), true);
  assert.equal(readNextDraft(A, 'name-step', store), 'Avery St');
  assert.equal(readNextDraft(B, 'name-step', store), '', 'a second account sees no draft from the first');
  assert.equal(writeNextDraft(B, 'name-step', 'Blake', store), true);
  assert.equal(writeNextDraft(A, 'name-step', 'x'.repeat(NEXT_DRAFT_MAX + 1), store), false, 'too long to keep');
  assert.equal(readNextDraft(A, 'name-step', store), 'Avery St');
  store.setItem(nextDraftKey(A, 'note'), '{"v":2,"text":"other version"}');
  assert.equal(readNextDraft(A, 'note', store), '');
  assert.equal(writeNextDraft(A, 'name-step', '', store), true, 'an empty draft is removed');
  assert.equal(store.getItem(nextDraftKey(A, 'name-step')), null);
  writeNextDraft(A, 'name-step', 'Avery', store);
  removeNextDraft(A, 'name-step', store);
  assert.equal(readNextDraft(A, 'name-step', store), '');
  writeNextDraft(A, 'name-step', 'Avery', store);
  clearNextDrafts(store);
  assert.deepEqual(store.keys().sort(), ['gtl.app', 'gtl.community-tab-draft.v1.x'], 'only the new app\'s drafts go');
  // Blocked storage never throws.
  assert.equal(readNextDraft(A, 'name-step', throwingStorage()), '');
  assert.equal(writeNextDraft(A, 'name-step', 'x', throwingStorage()), false);
  clearNextDrafts(throwingStorage());
  removeNextDraft(A, 'name-step', throwingStorage());
  clearNextDrafts(null);
});

test('AuthGate clears the new app\'s drafts with the old app\'s on every account change (sign-out included)', () => {
  const source = readFileSync(new URL('../web/src/AuthGate.jsx', import.meta.url), 'utf8');
  assert.match(source, /import \{ clearNextDrafts \} from '\.\/nextDrafts';/);
  const changed = source.match(/function accountChanged\(nextSession\) \{([\s\S]*?)\n {2}\}/)?.[1] ?? '';
  assert.match(changed, /if \(lastAccount\.current && lastAccount\.current !== next\) \{ clearTabDrafts\(\); clearSoloDrafts\(\); clearCommunityDrafts\(\); clearNextDrafts\(\); \}/);
});

// ---------- the Play counter ----------

test('the Play counter: ballots still due this week, from the server\'s picksDue, in the tab\'s name too', () => {
  const due = (state, modes) => ({ community: { picksDue: { state, modes: modes.map(mode => ({ mode, submitted: false, satOut: false })) } } });
  assert.deepEqual(playCounter(due('due', ['guess_spread', 'guess_total'])), { count: 2, label: '2 ballots due' });
  assert.deepEqual(playCounter(due('urgent', ['guess_total'])), { count: 1, label: '1 ballot due' });
  const late = due('late', ['guess_spread', 'guess_total']);
  assert.equal(playCounter(late), null, 'lateness alone does not promise an open game');
  late.community.picksDue.modes[0].openGames = 1; late.community.picksDue.modes[1].openGames = 0;
  assert.deepEqual(playCounter(late), { count: 1, label: '1 ballot due' });
  for (const state of ['not_open', 'closed', 'done', 'none']) assert.equal(playCounter(due(state, ['guess_total'])), null, state);
  assert.equal(playCounter(due('due', [])), null);
  for (const data of [null, {}, { community: null }, { community: { picksDue: { state: 'due' } } }]) assert.equal(playCounter(data), null);
  assert.equal(SLOTS.play.counter, playCounter);
  assert.deepEqual(tabBadge('play', due('due', ['guess_spread', 'guess_total'])), { label: 'Play', name: 'Play, 2 ballots due', count: 2, dot: false });
  assert.deepEqual(tabBadge('play', { lobby: {}, community: null }), { label: 'Play', name: 'Play', count: 0, dot: false });
});
