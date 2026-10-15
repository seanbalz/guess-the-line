import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';
import { handleBets, providerBetsError } from '../cloud/bets.mjs';
import { parseFeatureOff } from '../cloud/feature-off.mjs';
import { decorateVirtualUnits } from '../cloud/virtual-units.mjs';
import { readResponse } from '../web/src/apiResponse.js';

const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.test', emailConfirmed: true };
const AT = '2099-10-08T15:00:00.000Z', KICKOFF = '2099-10-08T20:00:00.000Z', NOW = Date.parse('2099-10-08T18:00:00.000Z');
const GAME = { id: 'NYJ-BUF', away: 'New York Jets', home: 'Buffalo Bills', awayCode: 'NYJ', homeCode: 'BUF', kickoff: KICKOFF };
const SIGNATURE = { deadline: Date.parse(KICKOFF) / 1000, games: [{ id: GAME.id, home: 'BUF', away: 'NYJ', kickoff: Date.parse(KICKOFF) / 1000 }] };
const PERSONAL = { season: 2099, week: 6, slates: [{ season: 2099, week: 6 }, { season: 2099, week: 5 }], weeklyRevision: 0, games: [GAME], ballots: { guess_spread: { picks: { [GAME.id]: -6.5 }, submittedAt: AT }, guess_total: { picks: { [GAME.id]: 48 } } }, journal: [{ notes: 'private journal sentinel' }], favorites: [{ notes: 'private note sentinel' }] };
const quotes = (market, value) => ['draftkings', 'fanduel', 'betmgm'].map(book => ({ provider: 'the-odds-api', book, market, value, providerObservedAt: AT, collectedAt: AT,
  outcomes: market === 'spread' ? { home: { line: value, odds: -110 }, away: { line: -value, odds: -110 } } : { over: { line: value, odds: -110 }, under: { line: value, odds: -110 } } }));
const SNAPSHOT = { id: 'snapshot', createdAt: AT, payload: { games: [{ gameId: GAME.id, home: GAME.home, away: GAME.away, kickoff: KICKOFF, markets: { spread: { quotes: quotes('spread', -3.5) }, total: { quotes: quotes('total', 61.5) } } }] } };
function fixture({ member = true, gate = { [GAME.id]: { spread: true, total: false } }, snapshot = SNAPSHOT, picks = [], failure = null } = {}) {
  const calls = [], raw = structuredClone(PERSONAL), stored = { snapshot: structuredClone(snapshot), picks: structuredClone(picks), settlements: [] };
  const service = {
    rpc: async (name, body) => {
      calls.push([name, body]);
      if (name === failure) throw new Error('private SQL detail');
      if (name === 'gtl_community_member') return member;
      if (name === 'gtl_read_personal') return raw;
      if (name === 'gtl_personal_context') return SIGNATURE;
      if (name === 'gtl_markets_visible') return gate;
      if (name === 'gtl_save_recommended_virtual_pick') {
        stored.picks.push({ game_id: body.p_body.gameId, market: body.p_body.market, selection: body.p_body, status: 'pending' }); raw.weeklyRevision += 1;
        return raw.weeklyRevision;
      }
      if (name === 'gtl_edit_recommended_virtual_pick') {
        const pick = stored.picks.find(pick => pick.game_id === body.p_body.gameId && pick.market === body.p_body.market);
        assert.ok(pick, 'edits never silently insert a new pick');
        const { updateQuote, ...change } = body.p_body;
        pick.selection = { ...pick.selection, ...change }; raw.weeklyRevision += 1;
        return raw.weeklyRevision;
      }
      assert.fail(`Unexpected RPC ${name}`);
    },
    recommendationState: async body => { calls.push(['recommendationState', body]); return stored; },
  };
  const handler = createCloudHandler({ authenticate: async token => token === 'fixture' ? USER : null, bets: service, clock: () => NOW,
    storage: { membership: async () => assert.fail('Current recommendations must not ask for private-group membership.') },
    oddsProvider: { collect: async () => assert.fail('Never collect on recommendation read.') },
  });
  const request = (body = {}, path = 'bets/recommendations', token = 'fixture', method = 'POST') => handler(new Request(`https://fixture.invalid/functions/v1/gtl-api/${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  }));
  return { service, handler, request, calls, raw, stored };
}
const placement = (extra = {}) => ({ season: 2099, week: 6, revision: 0, gameId: GAME.id, market: 'spread', side: 'home', line: -3.5, odds: -110, units: 1, source: 'betmgm', quotedAt: AT, ...extra });

test('current-account recommendations use published week and gate without private-group membership', async () => {
  const f = fixture(), response = await f.request();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.virtual.week, 6);
  assert.equal(result.virtual.scope, 'account_current');
  assert.equal(result.virtual.playerId, USER.id);
  assert.equal(result.personal.week, 6);
  assert.equal(result.virtual.games[0].consensus.spread.value, -3.5);
  assert.equal(result.virtual.games[0].offers.spread.home.book, 'betmgm');
  assert.equal(result.virtual.games[0].locked.total, true);
  assert.equal(result.virtual.games[0].consensus.total, undefined);
  assert.equal(result.virtual.games[0].offers.total, undefined);
  assert.equal(result.personal.ballots.guess_total.picks[GAME.id], 48, 'own draft remains owned data');
  assert.doesNotMatch(JSON.stringify(result), /61\.5|private journal sentinel|private note sentinel|outcomes|providerEventId/);
  assert.deepEqual(f.calls.find(([name]) => name === 'recommendationState')[1], { userId: USER.id, season: 2099, week: 6, signature: SIGNATURE, now: NOW });
});

test('authentication, membership, fixed body, method and query boundaries fail before privileged storage', async () => {
  for (const body of [{ userId: USER.id }, { season: 2099 }, { week: 5 }, { season: 2099, week: 0 }, { season: '2099', week: 5 }, { season: 2099, week: 5, userId: USER.id }, { league: 'sean-troy-luke' }]) {
    const f = fixture(); assert.equal((await f.request(body)).status, 400); assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  assert.equal((await f.request({}, 'bets/recommendations?league=sean-troy-luke')).status, 400);
  assert.equal((await f.request({}, 'bets/recommendations', 'bad')).status, 401);
  assert.equal((await f.request({}, 'bets/recommendations', 'fixture', 'GET')).status, 405);
  assert.equal(f.calls.length, 0);
  const removed = fixture({ member: false });
  assert.equal((await removed.request()).status, 403);
  assert.deepEqual(removed.calls.map(([name]) => name), ['gtl_community_member']);
});

test('historical own cards use their explicit week and the same gate; placement still forces the published week', async () => {
  const f = fixture({ picks: [{ game_id: GAME.id, market: 'spread', status: 'pending', selection: placement() }] });
  const originalRpc = f.service.rpc;
  f.service.rpc = async (name, args) => {
    const answer = await originalRpc(name, args);
    return name === 'gtl_read_personal' && args.p_week === 5 ? { ...answer, week: 5 } : answer;
  };
  const response = await f.request({ season: 2099, week: 5 });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.current, false); assert.equal(result.virtual.current, false);
  assert.equal(result.personal.week, 5); assert.equal(result.virtual.week, 5);
  assert.deepEqual(result.publishedWeek, { season: 2099, week: 6 });
  assert.deepEqual(result.slates, [{ season: 2099, week: 6 }, { season: 2099, week: 5 }]);
  assert.equal(result.personal.ownerId, USER.id); assert.equal(result.virtual.picks[0].ownerId, USER.id);
  assert.equal(result.virtual.picks[0].selection.line, -3.5);
  assert.equal(result.virtual.games[0].locked.total, true);
  assert.equal(result.virtual.games[0].consensus.total, undefined);
  assert.equal(f.calls.find(([name]) => name === 'recommendationState')[1].week, 5);
  assert.equal(f.calls.find(([name]) => name === 'gtl_markets_visible')[1].p_week, 5);
  f.calls.length = 0;
  assert.equal((await f.request(placement({ week: 5 }), 'bets/recommendations/place')).status, 409);
  assert.equal(f.calls.find(([name]) => name === 'gtl_read_personal')[1].p_week, null);
  assert.equal(f.calls.some(([name]) => name === 'gtl_save_recommended_virtual_pick'), false);
});

test('M-01 missing, malformed or failed never falls back to a deadline or returns a hidden line', async () => {
  for (const config of [{ gate: null }, { gate: { [GAME.id]: { spread: 'true', total: false } } }, { failure: 'gtl_markets_visible' }]) {
    const f = fixture(config), response = await f.request();
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /3\.5|61\.5|SQL detail/);
    assert.equal(f.calls.some(([name]) => name === 'recommendationState'), false);
  }
  const closed = fixture({ gate: {} });
  const result = await (await closed.request()).json();
  assert.deepEqual(result.virtual.games[0].locked, { spread: true, total: true });
  assert.deepEqual(result.virtual.games[0].offers, {});
});

test('missing saved quotes stay unavailable and do not fabricate consensus or odds', async () => {
  const f = fixture({ snapshot: null }), result = await (await f.request()).json();
  assert.equal(result.virtual.quoteHistoryAvailable, false);
  assert.equal(result.virtual.games[0].consensus.spread, null);
  assert.deepEqual(result.virtual.games[0].offers.spread, { home: null, away: null });
});

test('only own pick records and permitted fields are returned, with settled summary and preserved exact terms', async () => {
  const f = fixture({ picks: [{ game_id: GAME.id, market: 'spread', status: 'win', selection: { ...placement(), source: 'BetMGM', units: 2, secret: 'selection-secret' },
    result: { netUnits: 1.8182, status: 'final', home: 24, away: 17, secret: 'result-secret' }, audit: [{ before: 'audit-secret' }], user_id: USER.id }] });
  f.stored.settlements = [{ game_id: GAME.id, status: 'final', home: 24, away: 17, version: 2, settled_at: AT }, { game_id: GAME.id, status: 'final', home: 20, away: 17, version: 1 }];
  const result = await (await f.request()).json();
  assert.equal(result.virtual.picks.length, 1);
  assert.equal(result.virtual.picks[0].selection.units, 2);
  assert.equal(result.virtual.summary.wins, 1);
  assert.equal(result.virtual.summary.netUnits, 1.8182);
  assert.equal(result.virtual.results[GAME.id].version, 2);
  assert.doesNotMatch(JSON.stringify(result), /selection-secret|result-secret|audit-secret/);
});

test('place confirms current exact book terms then uses only authenticated actor and returns fresh state', async () => {
  const f = fixture(), response = await f.request(placement(), 'bets/recommendations/place');
  assert.equal(response.status, 200, await response.clone().text());
  const call = f.calls.find(([name]) => name === 'gtl_save_recommended_virtual_pick');
  assert.deepEqual(call[1], { p_user: USER.id, p_season: 2099, p_week: 6, p_revision: 0,
    p_body: { gameId: GAME.id, market: 'spread', side: 'home', line: -3.5, odds: -110, units: 1, source: 'BetMGM', quotedAt: AT } });
  const result = await response.json();
  assert.equal(result.virtual.revision, 1); assert.equal(result.virtual.picks.length, 1);
});

test('place refuses week/revision changes, hidden lines, quote changes and existing picks before writing', async () => {
  for (const change of [{ week: 5 }, { revision: 1 }, { source: 'draftkings' }, { line: -4 }, { odds: -105 }, { quotedAt: '2099-10-08T14:00:00Z' }, { market: 'total', side: 'over', line: 61.5 }]) {
    const f = fixture(), response = await f.request(placement(change), 'bets/recommendations/place');
    assert.equal(response.status, 409, JSON.stringify(change));
    assert.equal(f.calls.some(([name]) => name === 'gtl_save_recommended_virtual_pick'), false);
  }
  const duplicate = fixture({ picks: [{ game_id: GAME.id, market: 'spread', status: 'pending', selection: placement() }] });
  assert.equal((await duplicate.request(placement(), 'bets/recommendations/place')).status, 409);
  assert.equal(duplicate.calls.some(([name]) => name === 'gtl_save_recommended_virtual_pick'), false);
});

test('invalid place data and rollout switch never reach the database', async () => {
  for (const change of [{ userId: USER.id }, { units: 0 }, { units: 0.1 }, { odds: -99 }, { side: 'over' }, { revision: -1 }, { line: 3.25 }, { quotedAt: null }]) {
    const f = fixture(); assert.equal((await f.request(placement(change), 'bets/recommendations/place')).status, 400); assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  await assert.rejects(handleBets({ route: '/bets/recommendations', user: USER, service: f.service, featureOff: parseFeatureOff('recommendations') }), error => error.status === 503);
  assert.equal(f.calls.length, 0);
});

test('provider maps safe recommendation refusal codes and does not expose unknown database errors', () => {
  for (const code of ['GTL_VIRTUAL_EXISTS', 'GTL_VIRTUAL_MISSING', 'GTL_VIRTUAL_SETTLED', 'GTL_BETS_WEEK', 'GTL_WEEKLY_CONFLICT', 'GTL_VIRTUAL_CLOSED', 'GTL_VIRTUAL_QUOTE', 'GTL_LINE_LOCKED']) assert.equal(providerBetsError(code).status, 409);
  assert.equal(providerBetsError('GTL_FEATURE_OFF').status, 503);
  assert.equal(providerBetsError('secret error').message, 'Bets are unavailable.');
});

test('adapter reads exact signature and week, only authenticated owner picks, newest retained history, and no provider', async () => {
  const calls = [];
  const adapter = createSupabaseAdapter({ url: 'https://fixture.supabase.co', anonKey: 'public-fixture', serviceRoleKey: 'private-fixture', fetchImpl: async (url, options) => {
    const parsed = new URL(url); calls.push({ url: parsed, options });
    assert.equal(options.method, undefined); assert.equal(options.headers.Authorization, 'Bearer private-fixture');
    if (parsed.pathname === '/rest/v1/gtl_market_snapshots') return Response.json([{ id: 'new', created_at: AT, payload: SNAPSHOT.payload }, { id: 'old', created_at: AT, payload: {} }]);
    return Response.json([]);
  } });
  const result = await adapter.bets.recommendationState({ userId: USER.id, season: 2099, week: 6, signature: SIGNATURE, now: NOW });
  assert.equal(calls.length, 3);
  for (const { url } of calls) { assert.equal(url.searchParams.get('season'), 'eq.2099'); assert.equal(url.searchParams.get('week'), 'eq.6'); }
  const snapshots = calls.find(call => call.url.pathname.endsWith('gtl_market_snapshots')).url.searchParams;
  assert.equal(snapshots.get('slate_signature'), `eq.${JSON.stringify(SIGNATURE)}`);
  assert.equal(snapshots.get('created_at'), `lte.${new Date(NOW).toISOString()}`);
  assert.equal(snapshots.get('order'), 'created_at.desc,id.desc');
  assert.equal(calls.find(call => call.url.pathname.endsWith('gtl_virtual_units_picks')).url.searchParams.get('user_id'), `eq.${USER.id}`);
  assert.equal(result.snapshot.id, 'new'); assert.equal(result.snapshot.history.length, 2);
});

test('missing additive placement function maps to feature unavailable rather than pretending a save', async () => {
  const adapter = createSupabaseAdapter({ url: 'https://fixture.supabase.co', anonKey: 'public-fixture', serviceRoleKey: 'private-fixture', fetchImpl: async () => Response.json({ code: 'PGRST202' }, { status: 404 }) });
  await assert.rejects(adapter.bets.rpc('gtl_save_recommended_virtual_pick', {}), error => error.status === 503 && error.message === 'Recommendations are not available right now.');
  await assert.rejects(adapter.bets.rpc('gtl_edit_recommended_virtual_pick', {}), error => error.status === 503 && error.message === 'Recommendations are not available right now.');
});

test('own forecasts are bounded and sanitized, carry real personal revisions, and never unlock a hidden line', async () => {
  const f = fixture(); f.raw.revision = 7;
  const valid = { gameId: GAME.id, market: 'total', value: 49.5, savedAt: AT, revision: 3 };
  f.raw.forecasts = [{ ...valid, private: 'forecast-secret', season: 2099, week: 6 },
    { ...valid, week: 5 }, { ...valid, value: 49.25 }, { ...valid, value: '49.5' }, { ...valid, market: 'moneyline' },
    { ...valid, gameId: 'OTHER-GAME' }, { ...valid, savedAt: 'bad' }, { ...valid, savedAt: '2100-01-01T00:00:00Z' }];
  const result = await (await f.request()).json();
  assert.equal(result.personal.personalRevision, 7);
  assert.deepEqual(result.personal.forecasts, [valid]);
  assert.equal(result.virtual.games[0].locked.total, true);
  assert.equal(result.virtual.games[0].offers.total, undefined);
  assert.doesNotMatch(JSON.stringify(result), /forecast-secret/);
  delete f.raw.revision; delete f.raw.forecasts[0].revision;
  const absent = await (await f.request()).json();
  assert.equal(absent.personal.personalRevision, null);
  assert.equal(absent.personal.forecasts[0].revision, null);
});

test('recommendation consensus exposes retained quote ranges without changing the old Virtual Units response', async () => {
  const snapshot = structuredClone(SNAPSHOT), quotes = snapshot.payload.games[0].markets.spread.quotes;
  quotes[0].providerObservedAt = '2099-10-08T14:00:00.000Z'; quotes[0].value = -4.5;
  quotes[1].value = -2.5;
  const f = fixture({ snapshot }), result = await (await f.request()).json();
  assert.deepEqual(result.virtual.games[0].consensus.spread, { value: -3.5, source: 'Latest retained named-book median', books: 3,
    observedAt: '2099-10-08T14:00:00.000Z', oldestObservedAt: '2099-10-08T14:00:00.000Z', newestObservedAt: AT,
    oldestCollectedAt: AT, newestCollectedAt: AT, minValue: -4.5, maxValue: -2.5 });
  const old = decorateVirtualUnits({ season: 2099, week: 6, games: [GAME] }, snapshot,
    { gate: { season: 2099, week: 6, games: { [GAME.id]: { spread: true, total: false } } }, now: NOW, rules: {} });
  assert.equal(old.games[0].consensus.spread.oldestObservedAt, undefined);
  assert.deepEqual(Object.keys(old.games[0].consensus.spread).sort(), ['value', 'source', 'books', 'observedAt'].sort());
});

const savedPick = (extra = {}) => ({ game_id: GAME.id, market: 'spread', status: 'pending', result: null,
  selection: { gameId: GAME.id, market: 'spread', side: 'home', line: -4, odds: -115, units: 1, source: 'DraftKings', quotedAt: AT, selectedAt: AT }, ...extra });
const edit = (extra = {}) => ({ season: 2099, week: 6, revision: 0, gameId: GAME.id, market: 'spread', units: 2, ...extra });
test('explicit units-only edits preserve saved quote terms even when no current quote is available', async () => {
  const original = savedPick(), f = fixture({ snapshot: null, picks: [original] });
  const response = await f.request(edit(), 'bets/recommendations/edit');
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(f.calls.find(([name]) => name === 'gtl_edit_recommended_virtual_pick')[1], {
    p_user: USER.id, p_season: 2099, p_week: 6, p_revision: 0, p_body: { gameId: GAME.id, market: 'spread', units: 2 } });
  const result = await response.json();
  assert.deepEqual(result.virtual.picks[0].selection, { ...original.selection, units: 2, book: 'draftkings' });
  assert.equal(result.virtual.revision, 1);
  assert.equal(f.calls.some(([name]) => name === 'gtl_save_recommended_virtual_pick'), false);
});

test('an explicitly chosen updated quote and side must match the current named book exactly', async () => {
  const f = fixture({ picks: [savedPick()] });
  const body = { ...placement({ side: 'away', line: 3.5, units: 2 }), updateQuote: true };
  const response = await f.request(body, 'bets/recommendations/edit');
  assert.equal(response.status, 200);
  assert.deepEqual(f.calls.find(([name]) => name === 'gtl_edit_recommended_virtual_pick')[1].p_body,
    { gameId: GAME.id, market: 'spread', side: 'away', line: 3.5, odds: -110, units: 2, source: 'BetMGM', quotedAt: AT, updateQuote: true });
  const stale = fixture({ picks: [savedPick()] });
  assert.equal((await stale.request({ ...body, line: 4 }, 'bets/recommendations/edit')).status, 409);
  assert.equal(stale.calls.some(([name]) => name === 'gtl_edit_recommended_virtual_pick'), false);
});

test('edit refuses missing, settled, wrong-week, stale-revision or hidden picks and implicit quote changes', async () => {
  for (const [config, change, expected] of [
    [{}, {}, 409], [{ picks: [savedPick({ status: 'win' })] }, {}, 409],
    [{ picks: [savedPick()] }, { week: 5 }, 409], [{ picks: [savedPick()] }, { revision: 2 }, 409],
    [{ picks: [savedPick()], gate: {} }, {}, 409], [{ picks: [savedPick()] }, { side: 'away' }, 400],
    [{ picks: [savedPick()] }, { line: -3.5 }, 400], [{ picks: [savedPick()] }, { updateQuote: null }, 400],
    [{ picks: [savedPick()] }, { units: 0 }, 400], [{ picks: [savedPick()] }, { userId: USER.id }, 400],
  ]) {
    const f = fixture(config), response = await f.request(edit(change), 'bets/recommendations/edit');
    assert.equal(response.status, expected, JSON.stringify(change));
    assert.equal(f.calls.some(([name]) => name === 'gtl_edit_recommended_virtual_pick'), false);
  }
  const f = fixture({ picks: [savedPick()] });
  await assert.rejects(handleBets({ route: '/bets/recommendations/edit', body: edit(), user: USER, service: f.service, featureOff: parseFeatureOff('recommendations') }), error => error.status === 503);
  assert.equal(f.calls.length, 0);
});

test('the recommendation-edits off switch stops only editing before any database read', async () => {
  const f = fixture({ picks: [savedPick()] }), featureOff = parseFeatureOff('recommendation-edits');
  await assert.rejects(handleBets({ route: '/bets/recommendations/edit', body: edit(), user: USER, service: f.service, featureOff }), error => error.status === 503);
  assert.equal(f.calls.length, 0);
  assert.equal((await handleBets({ route: '/bets/recommendations', user: USER, service: f.service, featureOff, clock: () => NOW })).virtual.picks.length, 1);
  const empty = fixture();
  assert.equal((await handleBets({ route: '/bets/recommendations/place', body: placement(), user: USER, service: empty.service, featureOff, clock: () => NOW })).virtual.picks.length, 1);
});

test('stale quote errors keep their explicit quote-review instruction through the client response layer', async () => {
  const f = fixture({ picks: [savedPick()] });
  const response = await f.request({ ...placement({ line: -4 }), updateQuote: true }, 'bets/recommendations/edit');
  assert.equal(response.status, 409);
  await assert.rejects(readResponse(response, true), error => {
    assert.equal(error.status, 409);
    assert.equal(error.message, 'That saved quote is no longer current. Refresh recommendations and explicitly choose the updated quote.');
    assert.doesNotMatch(error.message, /another device|another group/);
    return true;
  });
});
