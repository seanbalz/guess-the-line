import test from 'node:test';
import assert from 'node:assert/strict';
import { EPL_TABS, eplAccessFromLobby, eplFragment, eplGate, eplHash, eplRoute, knownEplAccess, noteLobbyEpl, primeLobby, resetEplAccessCache, SPORT_HOME, sportOptions, subscribeEplAccess, takePrimedLobby } from '../web/src/next/epl/route.js';
import { sportAt } from '../web/src/next/sportAt.js';
import { nbaFragment, nbaRoute } from '../web/src/next/nba/route.js';

test('EPL routes: four tabs, Play and Research sections, nothing outside #epl/', () => {
  assert.deepEqual(EPL_TABS, ['home', 'play', 'bets', 'research']);
  assert.deepEqual(eplRoute('#epl/play/pick'), { tab: 'play', section: 'pick' });
  assert.deepEqual(eplRoute('#epl/play/guess'), { tab: 'play', section: 'guess' });
  assert.deepEqual(eplRoute('#epl/play/leaderboard'), { tab: 'play', section: 'leaderboard' });
  assert.deepEqual(eplRoute('#epl/research/fantasy'), { tab: 'research', section: 'fantasy' });
  assert.deepEqual(eplRoute('#epl/home'), { tab: 'home' });
  assert.deepEqual(eplRoute('#epl/bets'), { tab: 'bets' });
  // A tab without a (known) section opens its first working one; Home and Bets have none.
  assert.deepEqual(eplRoute('#epl/play'), { tab: 'play', section: 'pick' });
  assert.deepEqual(eplRoute('#epl/play/nope'), { tab: 'play', section: 'pick' });
  assert.deepEqual(eplRoute('#epl/research'), { tab: 'research', section: 'fantasy' });
  assert.deepEqual(eplRoute('#epl/home/pick'), { tab: 'home' });
  for (const hash of ['#nba/games', '#home', '#play', '#epl', '#epl/', '#epl/playground', '#epl/lines', '', null, undefined]) assert.equal(eplRoute(hash), null, String(hash));
});

test('eplHash writes back what eplRoute reads', () => {
  for (const hash of ['#epl/home', '#epl/bets', '#epl/play/pick', '#epl/play/guess', '#epl/play/leaderboard', '#epl/research/fantasy']) assert.equal(eplHash(eplRoute(hash)), hash);
  assert.equal(eplHash({ tab: 'play' }), '#epl/play/pick');
  assert.equal(eplHash({ tab: 'home', section: 'pick' }), '#epl/home');
});

test('EPL and NBA fragments never claim each other', () => {
  assert.equal(nbaRoute('#epl/home'), null);
  assert.equal(nbaFragment('#epl/home'), false);
  assert.equal(eplFragment('#epl/home'), true);
  assert.equal(eplFragment('#epl-main'), true);
  for (const hash of ['#nba/games', '#home', '', null, undefined]) assert.equal(eplFragment(hash), false, String(hash));
});

test('sport switch hides NBA and offers EPL only with access; saved NBA links retain a home address', () => {
  assert.deepEqual(sportOptions(false), [{ value: 'nfl', label: 'NFL' }]);
  assert.deepEqual(sportOptions(true), [{ value: 'nfl', label: 'NFL' }, { value: 'epl', label: 'EPL' }]);
  assert.equal(SPORT_HOME.nba, '#nba/games');
  assert.equal(SPORT_HOME.epl, '#epl/home');
});

test('EPL access is the lobby reply\'s epl field: only epl true shows EPL, a missing field hides it', () => {
  assert.equal(eplAccessFromLobby({ profile: {}, epl: true }), true);
  for (const data of [{ epl: false }, { profile: {} }, { epl: 'true' }, null, undefined, []]) assert.equal(eplAccessFromLobby(data), false);
});

test('sportAt resolves NFL, NBA and EPL addresses, and in-page anchors keep the sport showing (pre-T8 fix wave)', () => {
  for (const hash of ['#nba/games', '#nba/bets', '#nba/history?status=win']) for (const current of ['nfl', 'nba', 'epl']) assert.equal(sportAt(hash, current), 'nba', `${hash} from ${current}`);
  for (const hash of ['#epl/home', '#epl/play/pick', '#epl/research']) for (const current of ['nfl', 'nba', 'epl']) assert.equal(sportAt(hash, current), 'epl', `${hash} from ${current}`);
  for (const hash of ['#home', '#play', '', '#'] ) for (const current of ['nfl', 'nba', 'epl']) assert.equal(sportAt(hash, current), 'nfl', `${hash} from ${current}`);
  // #epl-main is EPL's skip-link anchor: it keeps EPL while EPL shows and is never a way into EPL.
  assert.equal(sportAt('#epl-main', 'epl'), 'epl');
  assert.equal(sportAt('#epl-main', 'nfl'), 'nfl');
  assert.equal(sportAt('#epl-main', 'nba'), 'nfl');
  assert.equal(sportAt('#epl-main'), 'nfl', 'a cold #epl-main link opens NFL');
  assert.equal(sportAt('#nba-main', 'nba'), 'nba');
  assert.equal(sportAt('#nba-main', 'epl'), 'nfl');
  assert.equal(sportAt('#epl', 'nfl'), 'nfl', 'a bare #epl is no route');
  assert.equal(sportAt('#epl', 'epl'), 'epl');
});

test('eplGate: EPL renders only once access is true; false leaves for NFL; loading renders nothing EPL-specific (pre-T8 fix wave)', () => {
  assert.equal(eplGate('epl', true), 'show');
  assert.equal(eplGate('epl', false), 'leave');
  assert.equal(eplGate('epl', null), 'wait');
  assert.equal(eplGate('epl', undefined), 'wait');
  for (const sport of ['nfl', 'nba']) for (const access of [true, false, null]) assert.equal(eplGate(sport, access), 'other');
});

test('EPL access comes from noted lobby replies per account, and a cold #epl link primes one lobby read the NFL app reuses', async () => {
  resetEplAccessCache();
  let changes = 0;
  const stop = subscribeEplAccess(() => { changes += 1; });
  assert.equal(knownEplAccess('user-1'), null, 'unknown until a lobby reply says');
  noteLobbyEpl('user-1', { epl: true });
  assert.equal(knownEplAccess('user-1'), true); assert.equal(knownEplAccess('user-2'), null, 'another account is unknown');
  noteLobbyEpl('user-1', { epl: true }); assert.equal(changes, 1, 'the same answer notifies once');
  noteLobbyEpl('user-1', {}); assert.equal(knownEplAccess('user-1'), false); assert.equal(changes, 2);
  stop();
  resetEplAccessCache();
  const calls = [];
  const read = data => async () => { calls.push('lobby'); return data; };
  const [a, b] = await Promise.all([primeLobby('user-1', read({ epl: true })), primeLobby('user-1', read({ epl: true }))]);
  assert.deepEqual([a, b], [{ epl: true }, { epl: true }]); assert.equal(calls.length, 1, 'one lobby read');
  assert.equal(knownEplAccess('user-1'), true);
  assert.deepEqual(await takePrimedLobby('user-1'), { epl: true }, 'the NFL app takes the same answer');
  assert.equal(takePrimedLobby('user-1'), null, 'only once');
  await primeLobby('user-2', read({ epl: true }), () => 0);
  assert.equal(takePrimedLobby('user-2', () => 120_000), null, 'a stale primed answer is read again');
  assert.equal(takePrimedLobby('user-3'), null);
  await assert.rejects(primeLobby('user-4', async () => { throw new Error('down'); }));
  assert.equal(knownEplAccess('user-4'), false, 'a failed lobby read hides EPL (a cold #epl link leaves for NFL)');
  assert.equal(takePrimedLobby('user-4'), null, 'and the NFL app reads the lobby itself');
  resetEplAccessCache();
});

test('EPL open access: any account whose lobby says epl true gets the EPL option, linked or not', () => {
  resetEplAccessCache();
  // Lobby replies epl: true for every signed-in account once M-30 is applied (cloud/lobby.mjs); no membership field.
  noteLobbyEpl('watcher', { profile: { displayName: 'Someone' }, epl: true });
  assert.equal(knownEplAccess('watcher'), true);
  assert.equal(eplGate('epl', knownEplAccess('watcher')), 'show');
  assert.ok(sportOptions(knownEplAccess('watcher')).some(o => o.value === 'epl'));
  noteLobbyEpl('watcher', { profile: {}, epl: false });
  assert.ok(!sportOptions(knownEplAccess('watcher')).some(o => o.value === 'epl'));
  resetEplAccessCache();
});

// A sport selection keeps the active app tab; only the sport-specific detail address changes.
test('sport switching preserves the active destination and restores matching NFL detail', async () => {
  const { sportSwitchHash } = await import('../web/src/next/epl/route.js');
  assert.equal(sportSwitchHash('epl', '#research/games?season=2026&week=8'), '#epl/research/fantasy');
  assert.equal(sportSwitchHash('epl', '#play/picks'), '#epl/play/pick');
  assert.equal(sportSwitchHash('epl', '#bets/active'), '#epl/bets');
  assert.equal(sportSwitchHash('nfl', '#nba/games', '#research/games'), '#research/games');
  assert.equal(sportSwitchHash('nfl', '#epl/research/fantasy', '#research/games'), '#research/games');
  assert.equal(sportSwitchHash('nfl', '#epl/play/pick', '#research/games'), '#play');
});
