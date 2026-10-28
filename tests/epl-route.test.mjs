import test from 'node:test';
import assert from 'node:assert/strict';
import { cachedEplAccess, EPL_TABS, eplFragment, eplGate, eplHash, eplRoute, readEplAccess, resetEplAccessCache, SPORT_HOME, sportOptions } from '../web/src/next/epl/route.js';
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

test('sport switch offers EPL only with access; each sport has a home address', () => {
  assert.deepEqual(sportOptions(false), [{ value: 'nfl', label: 'NFL' }, { value: 'nba', label: 'NBA' }]);
  assert.deepEqual(sportOptions(true), [{ value: 'nfl', label: 'NFL' }, { value: 'nba', label: 'NBA' }, { value: 'epl', label: 'EPL' }]);
  assert.equal(SPORT_HOME.nba, '#nba/games');
  assert.equal(SPORT_HOME.epl, '#epl/home');
});

test('EPL access reads draft/read once: refused (401, 403, feature off) hides EPL; anything else shows it', async () => {
  const calls = [];
  const answer = result => async (action, body) => { calls.push([action, body]); if (result instanceof Error) throw result; return result; };
  const failure = (status, code = null) => Object.assign(new Error('x'), { status, code });
  assert.equal(await readEplAccess(answer({ season: 2026, week: 9 })), true);
  assert.deepEqual(calls, [['draft/read', {}]]);
  assert.equal(await readEplAccess(answer(failure(403, 'GTL_EPL_FORBIDDEN'))), false);
  assert.equal(await readEplAccess(answer(failure(403))), false);
  assert.equal(await readEplAccess(answer(failure(401))), false);
  assert.equal(await readEplAccess(answer(failure(404, 'GTL_EPL_OFF'))), false);
  // A member before any week is stored, or a passing outage, keeps the option.
  assert.equal(await readEplAccess(answer(failure(404, 'GTL_EPL_NO_WEEK'))), true);
  assert.equal(await readEplAccess(answer(failure(503))), true);
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

test('EPL access is read once per signed-in account and read again when the account changes (pre-T8 fix wave)', async () => {
  resetEplAccessCache();
  const calls = [];
  const api = async (action, body, options) => { calls.push([action, body, options]); return { season: 2026 }; };
  const [a, b] = await Promise.all([cachedEplAccess('user-1', api), cachedEplAccess('user-1', api)]);
  assert.deepEqual([a, b, await cachedEplAccess('user-1', api)], [true, true, true]);
  assert.equal(calls.length, 1, 'one draft/read for the session');
  assert.deepEqual(calls[0].slice(0, 2), ['draft/read', {}]);
  const refused = async () => { calls.push(['refused']); throw Object.assign(new Error('x'), { status: 403 }); };
  assert.equal(await cachedEplAccess('user-2', refused), false, 'a new sign-in reads again');
  assert.equal(await cachedEplAccess('user-2', api), false, 'and keeps that answer');
  assert.equal(calls.length, 2);
  assert.equal(await cachedEplAccess('user-1', api), true);
  assert.equal(calls.length, 3, 'switching back is a sign-in change too');
  resetEplAccessCache();
});
