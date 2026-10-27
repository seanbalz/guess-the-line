import test from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES_METHODS, FEATURES_RPCS, computeFeatures, featuresView, handleFeatures, providerFeaturesError, runFeatures } from '../cloud/features.mjs';
import { FEATURES as OFF_SWITCHES } from '../cloud/feature-off.mjs';
import { ROUTE_MODULES } from '../cloud/handler.mjs';

// Redesign build plan stage 69: the /league/features routes (cloud/features.mjs) with a fake service, so each contract is
// checked without a database. Fixture accounts and numbers only.
const USER = { id: '00000000-0000-4000-8000-000000000001', is_anonymous: false };
const OTHER = '00000000-0000-4000-8000-000000000002';
const NOW = Date.parse('2026-11-10T20:00:00Z');
const fake = replies => {
  const calls = [];
  return { calls, rpc: async (name, args) => { calls.push([name, args]); const value = replies[name]; return typeof value === 'function' ? value(args) : value; } };
};
const call = (route, body, service, extra = {}) => handleFeatures({ route, body, user: USER, service, clock: () => NOW, uuid: () => 'run-1', ...extra });

test('the routes, their RPC allowlist and the off switch are registered', () => {
  assert.deepEqual({ ...ROUTE_MODULES.features }, { '/league/features': ['POST'], '/league/features/run': ['POST'] });
  assert.deepEqual({ ...FEATURES_METHODS }, { ...ROUTE_MODULES.features });
  assert.deepEqual([...FEATURES_RPCS], ['gtl_read_features', 'gtl_read_feature_inputs', 'gtl_record_feature_results', 'gtl_community_admin']);
  assert.match(OFF_SWITCHES.features, /league\/features\/run/);
});

test('signed-out, unknown fields and bad values are refused before any call', async () => {
  const service = fake({});
  await assert.rejects(handleFeatures({ route: '/league/features', body: {}, user: null, service }), /Sign in/);
  for (const body of [{ viewer: OTHER }, { leagueId: 'bad' }, { season: 1999 }, { season: '2026' }, []])
    await assert.rejects(call('/league/features', body, service), error => error.status === 400, JSON.stringify(body));
  await assert.rejects(call('/league/features/run', { leagueId: null }, service), error => error.status === 400, 'the run takes only a season');
  assert.equal(service.calls.length, 0);
});

test('a missing M-25 reads as "coming soon" (404), never a raw provider error', () => {
  const error = providerFeaturesError('GTL_FEATURE_OFF');
  assert.deepEqual([error.status, error.message], [404, 'Badges and awards are coming soon.']);
  assert.equal(providerFeaturesError('anything else').message, 'Badges and awards are unavailable.');
  assert.equal(providerFeaturesError('anything else').status, undefined, 'an unknown code is a 500, its text never sent');
});

test('the reader is rebuilt field by field, and a badge not visible yet on the server clock is dropped', async () => {
  const badge = (visibleAt, extra = {}) => ({ userId: OTHER, badge: 'bullseye', key: `bullseye:${OTHER}:2026:10:G1:spread`, week: 10, visibleAt, facts: { gameId: 'G1', guess: -3, secretNote: { line: -3 } }, ...extra });
  const service = fake({ gtl_read_features: { viewer: USER.id, leagueId: null, season: 2026, ran: true, extra: 'dropped',
    badges: [badge('2026-11-10T19:00:00Z'), badge('2026-11-10T21:00:00Z', { key: 'later' })],
    awards: [{ week: 10, version: 1, createdAt: '2026-11-10T19:30:00Z', awards: [{ id: 'best_guess', winners: [OTHER], entries: [{ userId: OTHER, gameId: 'G1', guess: -3, nested: { x: 1 } }], value: { error: 0, points: 10 } }] }],
    seasonWinners: null, streaks: [{ userId: OTHER, streaks: { pick: { current: 4, best: 6 }, bets: { current: 1, best: 3 }, levels: 9 } }] } });
  const view = await call('/league/features', { leagueId: null, season: 2026 }, service);
  assert.deepEqual(service.calls, [['gtl_read_features', { p_user: USER.id, p_league: null, p_season: 2026, p_now: new Date(NOW).toISOString() }]], 'the server clock, never a client one');
  assert.deepEqual(view, { leagueId: null, season: 2026, ran: true,
    badges: [{ userId: OTHER, badge: 'bullseye', key: `bullseye:${OTHER}:2026:10:G1:spread`, week: 10, visibleAt: '2026-11-10T19:00:00Z', facts: { gameId: 'G1', guess: -3 } }],
    awards: [{ week: 10, version: 1, createdAt: '2026-11-10T19:30:00Z', awards: [{ id: 'best_guess', winners: [OTHER], entries: [{ userId: OTHER, gameId: 'G1', guess: -3 }], value: { error: 0, points: 10 } }] }],
    seasonWinners: null, streaks: [{ userId: OTHER, pick: { current: 4, best: 6 }, bets: { current: 1, best: 3 } }] });
  assert.throws(() => featuresView({ viewer: OTHER }, USER.id, NOW), /Invalid features reply/, 'a reply for another viewer is refused');
  assert.throws(() => featuresView({ viewer: USER.id, badges: [badge('2026-11-10T19:00:00Z', { badge: 'levels' })] }, USER.id, NOW), /Invalid features reply/);
});

test('the run: commissioner only, paused by GTL_FEATURE_OFF=features, and it records what the shared rules compute', async () => {
  const inputs = { season: 2026, now: new Date(NOW).toISOString(), rosters: { community: [USER.id, OTHER] }, weeks: [{ season: 2026, week: 10,
    games: [{ id: 'G1', home: 'AAA', away: 'BBB', kickoff: '2026-11-10T18:00:00Z', result: null }],
    kickoff: { G1: { spread: -3, total: 44 } },
    guesses: [{ userId: OTHER, market: 'spread', gameId: 'G1', guess: -3, reference: -3, points: 10, late: false }], ballots: [], bets: [] }] };
  const summary = { runId: 'run-1', season: 2026, earned: 1, removed: 0, awards: 0, streaks: 2, posts: 1, postsSkipped: 0, replay: false, private: 'dropped' };
  await assert.rejects(call('/league/features/run', {}, fake({}), { featureOff: new Set(['features']) }), error => error.status === 503);
  const member = fake({ gtl_community_admin: false });
  await assert.rejects(call('/league/features/run', {}, member), error => error.status === 403);
  assert.deepEqual(member.calls.map(c => c[0]), ['gtl_community_admin']);
  const admin = fake({ gtl_community_admin: true, gtl_read_feature_inputs: inputs, gtl_record_feature_results: summary });
  const result = await call('/league/features/run', { season: 2026 }, admin);
  assert.deepEqual(result, { runId: 'run-1', season: 2026, earned: 1, removed: 0, awards: 0, streaks: 2, posts: 1, postsSkipped: 0, replay: false });
  const [, read, record] = admin.calls;
  assert.deepEqual(read, ['gtl_read_feature_inputs', { p_season: 2026, p_now: new Date(NOW).toISOString() }]);
  assert.equal(record[0], 'gtl_record_feature_results');
  assert.deepEqual({ ...record[1], p_results: undefined }, { p_run: 'run-1', p_trigger: 'manual', p_actor: USER.id, p_results: undefined });
  assert.deepEqual(record[1].p_results.badges.map(b => b.key), [`bullseye:${OTHER}:2026:10:G1:spread`, `dialed_in:${OTHER}:2026:10:spread`], 'a one-game week: 10 of 10');
  assert.deepEqual(record[1].p_results.badges[0].facts, { gameId: 'G1', market: 'spread', guess: -3, points: 10, away: 'BBB', home: 'AAA' }, 'the game\'s codes ride along');
  assert.deepEqual(record[1].p_results, computeFeatures(inputs, NOW), 'exactly the shared rules\' answer');
});

test('computeFeatures sends only live, visible badges; an award week waits for its finals; streaks for every Community member', () => {
  const week = { season: 2026, week: 10, kickoff: {}, ballots: [], bets: [],
    games: [{ id: 'G1', home: 'AAA', away: 'BBB', kickoff: '2026-11-10T18:00:00Z', result: null }, { id: 'G2', home: 'CCC', away: 'DDD', kickoff: '2026-11-10T21:00:00Z', result: null }],
    guesses: [{ userId: OTHER, market: 'spread', gameId: 'G1', guess: -3, reference: -3, points: 10, late: false }] };
  const results = computeFeatures({ season: 2026, rosters: { community: [USER.id, OTHER], 'not-a-league': [USER.id] }, weeks: [week] }, NOW);
  assert.deepEqual(results.badges.map(b => b.badge), ['bullseye'], 'Dialed In (week badge, last kickoff 21:00) is not visible at 20:00');
  assert.deepEqual(results.awards, [], 'no game is final yet');
  assert.deepEqual(results.streaks.map(s => s.userId), [USER.id, OTHER]);
  assert.ok(results.computed.includes('bullseye') && !results.computed.includes('closer'), 'question badges are not computed, so they are never removed either');
  assert.throws(() => computeFeatures({ season: 2026, rosters: {}, weeks: [{ ...week, bets: [{ kind: 'real_slip' }] }] }, NOW), /Invalid game-feature input/);
});

test('runFeatures before any week is published records nothing', async () => {
  const service = fake({ gtl_read_feature_inputs: { season: null, weeks: [], rosters: { community: [] } } });
  assert.deepEqual(await runFeatures({ rpc: service.rpc, now: NOW, trigger: 'schedule', runId: 'run-2' }), { season: null, skipped: 'no_season' });
  assert.deepEqual(service.calls.map(c => c[0]), ['gtl_read_feature_inputs']);
});
