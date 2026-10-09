import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../server/store.mjs';
import { createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';

const now = Date.parse('2026-10-08T18:00:00Z');
const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';

test('authenticated forecast integration scopes ownership, week and independently revealed market', async () => {
  const state = seed(), calls = [];
  const base = { ownerId: owner, season: 2026, week: 5, gameId: state.games[0].id, market: 'spread', value: -4.5, revision: 1, savedAt: '2026-10-08T17:59:00Z' };
  let offline = false;
  const handler = createCloudHandler({ clock: () => now,
    authenticate: async token => token === 'valid' ? { id: owner, email: 'fixture@example.invalid', emailConfirmed: true } : null,
    storage: { membership: async () => ({ active: true, player_id: 'sean', role: 'player' }) },
    weekly: { load: async () => ({ state: structuredClone(state), revision: 0, leagueRevision: 0 }) },
    personal: { readForecasts: async (...scope) => {
      calls.push(scope); if (offline) throw new Error('private provider details');
      return [base, { ...base, ownerId: other, revision: 99, value: -89 }, { ...base, week: 6, revision: 100, value: -90 },
        { ...base, market: 'total', revision: 101, value: 199 }, { ...base, scorePair: [123, 456], revision: 0 }];
    } },
  });
  const read = (mode, token = 'valid') => handler(new Request(`https://fixture.invalid/state?mode=${mode}`, { headers: { Authorization: `Bearer ${token}` } }));
  assert.equal((await read('guess_spread', 'invalid')).status, 401); assert.equal(calls.length, 0);
  const blind = await (await read('guess_total')).json();
  assert.equal(blind.revealed, false); assert.equal(calls.length, 0);
  assert(blind.games.every(game => !game.decisionAnalysis));
  const revealed = await (await read('guess_spread')).json();
  assert.equal(revealed.revealed, true); assert.deepEqual(calls, [[owner, 2026, 5]]);
  const decision = revealed.games[0].decisionAnalysis;
  assert.deepEqual(decision.personalForecast, { value: -4.5, savedAt: base.savedAt, revision: 1, kind: 'personal_outcome_forecast' });
  assert.equal(decision.model, null); assert.equal(decision.probability, null); assert.equal(decision.expectedValue, null);
  assert.equal(JSON.stringify(revealed).includes('scorePair'), false);
  offline = true;
  const response = await read('guess_spread'), degraded = await response.json();
  assert.equal(response.status, 200); assert.equal(degraded.games[0].prediction, revealed.games[0].prediction);
  assert.equal(JSON.stringify(degraded).includes('private provider details'), false);
});

test('forecast adapter binds authenticated owner and current week and only returns allowlisted fields', async () => {
  const requests = [];
  let rows = [{ game_id: 'fixture', market: 'spread', value: -4.5, saved_at: '2026-10-08T17:59:00Z', revision: 2, private_note: 'never project this', user_id: other }];
  const adapter = createSupabaseAdapter({ url: 'https://fixture.invalid', anonKey: 'public-fixture', serviceRoleKey: 'server-fixture',
    fetchImpl: async (url, options) => { requests.push({ url, options }); return new Response(JSON.stringify(rows), { status: 200 }); },
  });
  assert.deepEqual(await adapter.personal.readForecasts(owner, 2026, 5), [{ ownerId: owner, season: 2026, week: 5, gameId: 'fixture', market: 'spread', value: -4.5, savedAt: rows[0].saved_at, revision: 2 }]);
  const { url, options } = requests[0];
  assert.equal(url.pathname, '/rest/v1/gtl_personal_forecasts');
  assert.equal(url.searchParams.get('user_id'), `eq.${owner}`);
  assert.equal(url.searchParams.get('season'), 'eq.2026'); assert.equal(url.searchParams.get('week'), 'eq.5');
  assert.equal(url.searchParams.get('select'), 'game_id,market,value,saved_at,revision');
  assert.equal(options.headers.Authorization, 'Bearer server-fixture'); assert.equal(options.redirect, 'error');
  for (const scope of [[other + '&user_id=other', 2026, 5], [owner, 2026, 0], [owner, 2026.5, 5]]) await assert.rejects(() => adapter.personal.readForecasts(...scope));
  assert.equal(requests.length, 1);
  rows = Array(65).fill(rows[0]); await assert.rejects(() => adapter.personal.readForecasts(owner, 2026, 5), /Invalid forecast response/);
});
