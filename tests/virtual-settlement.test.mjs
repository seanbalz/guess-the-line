import test from 'node:test';
import assert from 'node:assert/strict';
import { NFLVERSE_SCHEDULE_URL } from '../shared/nfl-schedule.mjs';
import { SETTLEMENT_SOURCE, buildSettlementResults, createVirtualSettlementAdapter, settleVirtualUnitsWeek, summarizeSettlement, validateSettlementPayload } from '../cloud/virtual-settlement.mjs';

// A fixture in the public nflverse games.csv layout (extra columns included); no network.
const HEADER = 'game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score,location,result,total';
const csv = [HEADER,
  '2026_05_TB_DAL,2026,REG,5,2026-10-08,Thursday,20:15,TB,14,DAL,31,Home,17,45',
  '2026_05_PHI_JAX,2026,REG,5,2026-10-11,Sunday,09:30,PHI,21,JAX,24,Neutral,3,45',
  '2026_05_BUF_LA,2026,REG,5,2026-10-12,Monday,20:15,BUF,,LA,,Home,,',
  '2026_05_SF_SEA,2026,REG,5,2026-10-11,Sunday,20:20,SF,0,SEA,0,Home,0,0',
  '2026_06_SEA_DEN,2026,REG,6,2026-10-15,Thursday,20:15,SEA,20,DEN,27,Home,7,47',
  '2025_05_TB_DAL,2025,REG,5,2025-10-09,Thursday,20:15,TB,10,DAL,20,Home,10,30',
  '2026_19_SEA_DEN,2026,POST,19,2027-01-10,Sunday,13:00,SEA,3,DEN,6,Home,3,9'].join('\n');
const UUID = '00000000-0000-4000-8000-000000000030';

test('builder emits finals only, pending rows stay pending, codes are mapped and other weeks are ignored', () => {
  const built = buildSettlementResults(csv, 2026, 5, { observedAt: '2026-10-13T08:00:00Z', actorId: UUID });
  assert.deepEqual(built.payload, { source: SETTLEMENT_SOURCE, sourceUrl: NFLVERSE_SCHEDULE_URL, observedAt: '2026-10-13T08:00:00.000Z', actorId: UUID, games: [
    { gameId: 'TB-DAL', status: 'final', home: 31, away: 14 }, { gameId: 'PHI-JAX', status: 'final', home: 24, away: 21 }, { gameId: 'SF-SEA', status: 'final', home: 0, away: 0 }] });
  assert.deepEqual(built.finals, ['TB-DAL', 'PHI-JAX', 'SF-SEA']);
  assert.deepEqual(built.pending, ['BUF-LAR'], 'nflverse LA is the app\'s LAR; a row without both scores is not a final');
  assert.equal(Object.hasOwn(buildSettlementResults(csv, 2026, 6).payload, 'observedAt'), false);
  assert.equal(Object.hasOwn(buildSettlementResults(csv, 2026, 6).payload, 'actorId'), false);
  assert.deepEqual(buildSettlementResults(csv, 2026, 6).payload.games, [{ gameId: 'SEA-DEN', status: 'final', home: 27, away: 20 }]);
  assert.ok(built.payload.games.every(game => !('postponed' in game)), 'postponement and cancellation are never inferred from the file');
  validateSettlementPayload(built.payload);
});

test('builder refuses a bad file instead of settling part of a week', () => {
  assert.throws(() => buildSettlementResults(csv, 2026, 7), /No 2026 Week 7 regular-season games/);
  assert.throws(() => buildSettlementResults(csv, 2027, 5), /No 2027 Week 5/);
  assert.throws(() => buildSettlementResults(csv, 1999, 5), /season between 2000 and 2200/);
  assert.throws(() => buildSettlementResults('game_id,season\n1,2026', 2026, 5), /missing the game_type column/);
  assert.throws(() => buildSettlementResults('', 2026, 5), /empty/);
  assert.throws(() => buildSettlementResults([HEADER, '2026_05_TB_DAL,2026,REG,5,2026-10-08,Thursday,20:15,TB,14,DAL,31,Home,17,45', '2026_05_TB_DAL,2026,REG,5,2026-10-08,Thursday,20:15,TB,14,DAL,31,Home,17,45'].join('\n'), 2026, 5), /Duplicate game TB-DAL/);
  assert.throws(() => buildSettlementResults([HEADER, '2026_05_TB_DAL,2026,REG,5,2026-10-08,Thursday,20:15,TB,14.5,DAL,31,Home,17,45'].join('\n'), 2026, 5), /Invalid final score for TB-DAL/);
  assert.throws(() => buildSettlementResults([HEADER, '2026_05_TB_DAL,2026,REG,5,2026-10-08,Thursday,20:15,TB,14,DAL,-3,Home,17,45'].join('\n'), 2026, 5), /Invalid final score/);
  assert.throws(() => buildSettlementResults([HEADER, '2026_05_TB_DAL,2026,REG,5,2026-10-08,Thursday,20:15,TB,14,DAL,201,Home,17,45'].join('\n'), 2026, 5), /Invalid final score/);
  assert.throws(() => buildSettlementResults([HEADER, '2026_05_XX_DAL,2026,REG,5,2026-10-08,Thursday,20:15,T1,14,DAL,20,Home,6,34'].join('\n'), 2026, 5), /Unknown team code T1/);
  assert.throws(() => buildSettlementResults(csv, 2026, 5, { actorId: 'not-a-uuid' }), /Invalid actor/);
  assert.throws(() => buildSettlementResults(csv, 2026, 5, { observedAt: 'yesterday' }), /Invalid observed time/);
});

test('payload validation mirrors the SQL refusals', () => {
  const base = { source: 'fixture', games: [{ gameId: 'TB-DAL', status: 'final', home: 1, away: 0 }] };
  validateSettlementPayload(base);
  validateSettlementPayload({ ...base, games: [{ gameId: 'TB-DAL', status: 'postponed' }, { gameId: 'PHI-JAX', status: 'cancelled' }] });
  for (const bad of [null, [], { games: [] }, { ...base, source: 'x' }, { ...base, extra: 1 }, { ...base, sourceUrl: 'http://example.invalid' }, { ...base, observedAt: 'nope' }, { ...base, actorId: 'nope' },
    { ...base, games: [{ gameId: 'TB-DAL', status: 'pending' }] }, { ...base, games: [{ gameId: 'TB-DAL', status: 'final', home: 1 }] }, { ...base, games: [{ gameId: 'TB-DAL', status: 'final', home: 1.5, away: 0 }] },
    { ...base, games: [{ gameId: 'TB-DAL', status: 'postponed', home: 1 }] }, { ...base, games: [base.games[0], base.games[0]] }, { ...base, games: [{ ...base.games[0], extra: true }] }]) {
    assert.throws(() => validateSettlementPayload(bad), /Invalid settlement payload/);
  }
});

const rpcResult = { season: 2026, week: 5, settledAt: '2026-10-13T08:00:01.000Z', source: SETTLEMENT_SOURCE, settled: 2, corrected: 1, unchanged: 0, picksSettled: 4,
  games: [{ gameId: 'TB-DAL', status: 'final', version: 2, changed: true, picksSettled: 2, previous: { version: 1, status: 'final', home: 30, away: 14, settledAt: 'x' } }, { gameId: 'PHI-JAX', status: 'final', version: 1, changed: true, picksSettled: 2, previous: null }, { gameId: 'SF-SEA', status: 'final', version: 1, changed: true, picksSettled: 0, previous: null }],
  picks: [{ userId: UUID, gameId: 'TB-DAL', market: 'spread', outcome: 'win', netUnits: 0.9091 }], players: [{ userId: UUID, picksSettled: 4, netUnitsDelta: 1 }] };

test('settleVirtualUnitsWeek downloads the file, builds finals, calls the RPC once and returns counts without user ids', async () => {
  const calls = [];
  const service = { schedule: async () => csv, settle: async (season, week, payload) => { calls.push([season, week, payload]); return rpcResult; } };
  const result = await settleVirtualUnitsWeek({ season: 2026, week: 5, service, actorId: UUID, clock: () => Date.parse('2026-10-13T08:00:00Z') });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][2], { source: SETTLEMENT_SOURCE, sourceUrl: NFLVERSE_SCHEDULE_URL, observedAt: '2026-10-13T08:00:00.000Z', actorId: UUID, games: [
    { gameId: 'TB-DAL', status: 'final', home: 31, away: 14 }, { gameId: 'PHI-JAX', status: 'final', home: 24, away: 21 }, { gameId: 'SF-SEA', status: 'final', home: 0, away: 0 }] });
  assert.deepEqual(result, { season: 2026, week: 5, source: SETTLEMENT_SOURCE, sourceUrl: NFLVERSE_SCHEDULE_URL, observedAt: '2026-10-13T08:00:00.000Z', finals: 3, pending: ['BUF-LAR'],
    settledAt: '2026-10-13T08:00:01.000Z', settled: 2, corrected: 1, unchanged: 0, picksSettled: 4,
    games: [{ gameId: 'TB-DAL', status: 'final', version: 2, changed: true, picksSettled: 2, previous: { version: 1, status: 'final', home: 30, away: 14 } },
      { gameId: 'PHI-JAX', status: 'final', version: 1, changed: true, picksSettled: 2, previous: null }, { gameId: 'SF-SEA', status: 'final', version: 1, changed: true, picksSettled: 0, previous: null }] });
  assert.equal(JSON.stringify(result).includes(UUID), false, 'the commissioner-facing summary carries no account ids');
  const scheduleDown = { schedule: async () => { throw new Error('offline'); }, settle: async () => { throw new Error('must not run'); } };
  await assert.rejects(() => settleVirtualUnitsWeek({ season: 2026, week: 5, service: scheduleDown }), /offline/);
  await assert.rejects(() => settleVirtualUnitsWeek({ season: 2026, week: 9, service }), /No 2026 Week 9/);
  assert.equal(calls.length, 1, 'a bad file never reaches the RPC');
  const refused = { schedule: async () => csv, settle: async () => { const error = new Error('refused'); error.code = 'GTL_SETTLEMENT_EARLY'; throw error; } };
  await assert.rejects(() => settleVirtualUnitsWeek({ season: 2026, week: 5, service: refused }), error => error.code === 'GTL_SETTLEMENT_EARLY');
  await assert.rejects(() => settleVirtualUnitsWeek({ season: 2026, week: 5, service: { schedule: async () => csv, settle: async () => ({ settled: 'two' }) } }), /Invalid settlement result/);
  assert.throws(() => summarizeSettlement({ ...rpcResult, games: [{ gameId: 'TB-DAL', status: 'final', version: '1', changed: true }] }), /Invalid settlement result/);
  await assert.rejects(() => settleVirtualUnitsWeek({ season: 2026, week: 5, service: {} }), /not configured/);
  await assert.rejects(() => settleVirtualUnitsWeek({ season: 2026, week: 0, service }), /Invalid settlement scope/);
});

test('adapter reaches only the public schedule file and the settlement RPC, and scrubs provider errors', async () => {
  const seen = [];
  const key = 'service-role-fixture';
  const service = createVirtualSettlementAdapter({ url: 'https://example.supabase.co', serviceRoleKey: key, fetchImpl: async (url, options) => {
    seen.push([String(url), options?.method || 'GET', options?.headers?.Authorization, options?.body]);
    if (String(url) === NFLVERSE_SCHEDULE_URL) return new Response(csv);
    if (String(url).endsWith('/rest/v1/rpc/gtl_settle_virtual_units')) return JSON.parse(options.body).p_week === 5 ? Response.json(rpcResult) : new Response(JSON.stringify({ message: 'GTL_SETTLEMENT_WEEK', secret: key }), { status: 400 });
    throw new Error(`unexpected ${url}`);
  } });
  assert.equal(await service.schedule(), csv);
  assert.deepEqual(seen[0], [NFLVERSE_SCHEDULE_URL, 'GET', undefined, undefined], 'the public file is fetched without credentials');
  const built = buildSettlementResults(csv, 2026, 5).payload;
  assert.deepEqual(await service.settle(2026, 5, built), rpcResult);
  assert.deepEqual([seen[1][0], seen[1][1], seen[1][2], JSON.parse(seen[1][3])], ['https://example.supabase.co/rest/v1/rpc/gtl_settle_virtual_units', 'POST', `Bearer ${key}`, { p_season: 2026, p_week: 5, p_results: built }]);
  await assert.rejects(() => service.settle(2026, 6, built), error => error.code === 'GTL_SETTLEMENT_WEEK' && !error.message.includes(key));
  await assert.rejects(() => service.settle(2026, 5, { games: [] }), /Invalid settlement payload/);
  assert.equal(seen.length, 3, 'an invalid payload never leaves the process');
  assert.throws(() => createVirtualSettlementAdapter({ url: 'http://example.supabase.co', serviceRoleKey: key }), /Invalid settlement configuration/);
  assert.throws(() => createVirtualSettlementAdapter({ url: 'https://example.supabase.co/path', serviceRoleKey: key }), /Invalid settlement configuration/);
  assert.throws(() => createVirtualSettlementAdapter({ url: 'https://example.supabase.co', serviceRoleKey: '' }), /Invalid settlement configuration/);
});
