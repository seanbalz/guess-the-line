import test from 'node:test';
import assert from 'node:assert/strict';
import { BETS_METHODS, BetsError, handleBets, projectBets } from '../cloud/bets.mjs';

const VIEWER = '00000000-0000-4000-8000-000000000001';
const FRIEND = '00000000-0000-4000-8000-000000000002';
const NOW = '2026-10-15T18:00:00Z';
const GAME = 'TB-DAL';
const USER = { id: VIEWER, is_anonymous: false };

test('Bets read is an authenticated POST with server-owned identity and clock', async () => {
  assert.deepEqual(BETS_METHODS['/bets/read'], ['POST']);
  const calls = [];
  const service = { rpc: async (name, args) => { calls.push([name, args]); return { season: 2026, week: 6, games: [], roster: [], bets: [] }; } };
  for (const user of [null, { id: 'bad' }, { ...USER, is_anonymous: true }])
    await assert.rejects(handleBets({ route: '/bets/read', body: {}, user, service }),
      error => error instanceof BetsError && error.status === 401);
  for (const body of [{ userId: VIEWER }, { now: NOW }, { season: 2026 }, { week: 6 }, { season: '2026', week: 6 }, { leagueId: 5 }])
    await assert.rejects(handleBets({ route: '/bets/read', body, user: USER, service }),
      error => error instanceof BetsError && error.status === 400);
  assert.equal(calls.length, 0);
  await handleBets({ route: '/bets/read', body: { season: 2026, week: 6, leagueId: 'friends' },
    user: USER, service, clock: () => Date.parse(NOW) });
  assert.deepEqual(calls, [['gtl_read_bets', { p_user: VIEWER, p_season: 2026, p_week: 6,
    p_league: 'friends', p_now: '2026-10-15T18:00:00.000Z' }]]);
  await assert.rejects(handleBets({ route: '/bets/read', body: {}, user: USER, service, featureOff: new Set(['bets']) }),
    error => error instanceof BetsError && error.status === 503);
  assert.equal(calls.length, 1, 'off switch refuses before SQL');
  await assert.rejects(handleBets({ route: '/bets/recommendations', body: {}, user: USER,
    service: { ...service, recommendationState: async () => ({}) }, featureOff: new Set(['bets']) }),
    error => error instanceof BetsError && error.status === 403);
  assert.equal(calls[1][0], 'gtl_community_member', 'the new reader switch does not disable existing recommendations');
});

test('Bets projection drops forged opponent terms and every hidden offer, while preserving own receipt', () => {
  const saved = { gameId: GAME, market: 'spread', side: 'home', line: -13.5, odds: -110, units: 2,
    source: 'DraftKings', quotedAt: NOW, selectedAt: NOW };
  const raw = { season: 2026, week: 6, published: true, now: NOW, revision: 0,
    games: [{ id: GAME, away: 'TB', home: 'DAL', kickoff: Date.parse('2026-10-16T01:00:00Z') / 1000 }],
    roster: [{ userId: VIEWER, displayName: 'Viewer' }, { userId: FRIEND, displayName: 'Friend' }],
    markets: { [GAME]: { spread: { visible: false, quotes: [{ book: 'draftkings', line: -13.5, odds: -110 }] },
      total: { visible: false, quotes: [{ book: 'fanduel', line: 51.5, odds: -110 }] } } },
    bets: [{ userId: FRIEND, gameId: GAME, market: 'spread', selection: saved, status: 'win',
      audit: [{ after: saved }], result: { netUnits: 2.5 }, createdAt: NOW, updatedAt: NOW },
    { userId: VIEWER, gameId: GAME, market: 'spread', selection: saved, status: 'pending', audit: [{ after: saved }] }],
    faces: { [GAME]: [FRIEND, VIEWER] }, qualification: [] };
  const reply = projectBets(raw, VIEWER);
  assert.deepEqual(reply.markets[GAME].spread, { visible: false });
  assert.deepEqual(reply.bets[0].selection, { side: 'home', units: 2 });
  assert.equal(reply.bets[0].status, null);
  assert.equal(reply.bets[0].result, null);
  assert.equal(reply.bets[0].audit, null);
  assert.equal(reply.bets[0].createdAt, null);
  assert.equal(reply.bets[0].updatedAt, null);
  assert.equal(reply.bets[1].selection.line, -13.5);
  assert.equal(reply.bets[1].audit.length, 1);
  assert.equal(JSON.stringify(reply.bets[0]).includes('13.5'), false);
});

test('a newer saved named-book quote replaces its older price, even if that side has no usable price', () => {
  const kickoff = '2026-10-16T01:00:00Z';
  const earlier = '2026-10-15T16:00:00Z', later = '2026-10-15T17:00:00Z';
  const raw = { season: 2026, week: 6, published: true, now: NOW, revision: 0,
    games: [{ id: GAME, away: 'TB', home: 'DAL', kickoff: Date.parse(kickoff) / 1000 }],
    roster: [], bets: [], markets: { [GAME]: { spread: { visible: true, quotes: [
      { book: 'draftkings', side: 'home', line: -3.5, odds: -110, observedAt: earlier, collectedAt: earlier, capturedAt: earlier },
      { book: 'draftkings', side: 'home', line: null, odds: null, observedAt: later, collectedAt: later, capturedAt: later },
      { book: 'fanduel', side: 'home', line: -4.5, odds: -110, observedAt: later, collectedAt: later, capturedAt: later },
    ] }, total: { visible: false } } } };
  const reply = projectBets(raw, VIEWER);
  assert.equal(reply.markets[GAME].spread.offers.home.book, 'fanduel');
  assert.equal(reply.markets[GAME].spread.offers.away, null);
});
