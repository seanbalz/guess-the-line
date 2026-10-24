import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';
import { POINTS_RPCS, handlePoints, pointsReadView } from '../cloud/points.mjs';
import { BOUNDARY_AREAS, awaitingDeploy } from '../scripts/check-cloud-boundary.mjs';

// Guess the Points routes (D-56; spec sections 4.2, 5, 7 and the section 9 Gate and Locks contracts) through the gtl-api
// handler with a fixture service: no database, no hosted project. Fixture accounts and players only; no real picks.
const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.test', emailConfirmed: true };
const OTHER = '22222222-2222-4222-8222-222222222222';
const REQUEST = '33333333-3333-4333-8333-333333333333';
const HIDDEN = 47, HOUSE = 31.5; // Sentinels: another member's guess and the House, which a hidden slot must never carry.
const slot = (name, patch = {}) => ({
  slot: name, playerId: `00-fixture-${name}`, name: `Fixture ${name}`, team: 'PIT', position: name === 'FLEX' ? 'WR' : name, gameKey: `2026_07_${name}`,
  kickoff: '2026-10-25T17:00:00Z', closed: false, state: 'open', actual: null, voidReason: null, revealed: false, own: null,
  house: null, lockedIn: [], guesses: [], ...patch,
});
const READ = Object.freeze({
  season: 2026, week: 7, status: 'open', groupId: null, opensAt: '2026-10-20T19:00:00Z', finalizeAt: '2026-10-29T19:00:00Z',
  scoringRules: { format: 'ppr', passingTds: 4, version: 'ppr4-v1' },
  result: { status: null, maximum: 50, points: null, finalizedAt: null, house: { points: null, complete: true } },
  slots: [
    slot('QB', { revealed: true, own: { guess: 18, locked: true, lockedAt: '2026-10-21T18:00:00Z', points: null },
      house: { estimate: 19.4, points: null }, lockedIn: [{ userId: USER.id, displayName: 'You Fixture' }, { userId: OTHER, displayName: 'Troy Fixture' }],
      guesses: [{ userId: OTHER, displayName: 'Troy Fixture', guess: 22, points: null }] }),
    // A reply that wrongly carries gated values for a hidden slot: the route drops them.
    slot('RB', { own: { guess: 12, locked: false, lockedAt: null, points: 9 }, house: { estimate: HOUSE, points: null },
      lockedIn: [{ userId: OTHER, displayName: 'Troy Fixture' }], guesses: [{ userId: OTHER, displayName: 'Troy Fixture', guess: HIDDEN, points: null }] }),
    slot('WR'), slot('TE'), slot('FLEX'),
  ],
  standings: { week: [{ userId: OTHER, displayName: 'Troy Fixture', points: null, exact: 0, off: null, rank: null, tied: false, secret: 'x' }], season: [] },
  internal: 'never sent',
});

function fixture({ reply = structuredClone(READ), failure = null, featureOff } = {}) {
  const calls = [];
  const points = {
    rpc: async (name, body) => {
      calls.push([name, body]);
      if (failure) throw failure;
      if (name === 'gtl_points_read') return reply;
      if (name === 'gtl_points_save_draft' || name === 'gtl_points_lock_in') {
        return { season: body.p_season, week: body.p_week, slot: body.p_slot, guess: body.p_guess, locked: name === 'gtl_points_lock_in',
          lockedAt: name === 'gtl_points_lock_in' ? '2026-10-21T18:00:00Z' : null, savedAt: '2026-10-21T18:00:00Z', replayed: false, receipt: 'internal' };
      }
      if (name === 'gtl_points_publish_slate') return { season: body.p_season, week: body.p_week, status: 'draft', slots: [], house: {}, provenance: {}, audit: [] };
      assert.fail(`Unexpected RPC ${name}`);
    },
  };
  const handler = createCloudHandler({ authenticate: async token => token === 'fixture' ? USER : null, points, featureOff,
    storage: { membership: async () => assert.fail('Points routes never read a private-group membership row themselves.') } });
  const request = (path, body = {}, token = 'fixture') => handler(new Request(`https://fixture.invalid/functions/v1/gtl-api/points/${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
  return { calls, request };
}
const lockBody = (patch = {}) => ({ season: 2026, week: 7, slot: 'QB', guess: 18, requestId: REQUEST, ...patch });

test('the read sends only the signed-in viewer and server time, and rebuilds the reply field by field', async () => {
  const f = fixture();
  const response = await f.request('read', { season: 2026, week: 7, groupId: 'g_0123456789abcdef0123456789abcdef' });
  assert.equal(response.status, 200);
  const view = await response.json();
  assert.deepEqual(f.calls, [['gtl_points_read', { p_viewer: USER.id, p_season: 2026, p_week: 7, p_group: 'g_0123456789abcdef0123456789abcdef', p_now: null }]]);
  assert.equal(view.slots.length, 5);
  assert.deepEqual(view.slots[0].guesses, [{ userId: OTHER, displayName: 'Troy Fixture', guess: 22, points: null }]);
  assert.deepEqual(view.slots[0].house, { estimate: 19.4, points: null });
  assert.equal(view.internal, undefined);
  assert.equal(view.standings.week[0].secret, undefined);
  // An unlocked draft never carries points, whatever the reply held.
  assert.deepEqual(view.slots[1].own, { guess: 12, locked: false, lockedAt: null, points: null });
});

test('gate: a slot that is not revealed carries no House estimate and no other member\'s guess (hidden sentinels)', async () => {
  const view = await (await fixture().request('read', {})).json();
  const rb = view.slots.find(row => row.slot === 'RB');
  assert.equal(rb.revealed, false);
  assert.equal(rb.house, null);
  assert.deepEqual(rb.guesses, []);
  assert.deepEqual(rb.lockedIn, [{ userId: OTHER, displayName: 'Troy Fixture' }], 'who has locked in shows as faces, without numbers');
  const text = JSON.stringify(view.slots.filter(row => !row.revealed));
  assert.doesNotMatch(text, new RegExp(`\\b${HIDDEN}\\b|${HOUSE}`));
});

test('an unopened week reads as unopened with nothing to show', async () => {
  const view = await (await fixture({ reply: { season: null, week: null, status: 'unopened', groupId: null, slots: [], result: null, standings: { week: [], season: [] } } }).request('read', {})).json();
  assert.deepEqual(view, { season: null, week: null, status: 'unopened', groupId: null, slots: [], result: null, standings: { week: [], season: [] } });
});

test('read refuses a half week, a bad group or an unexpected field before any database call', async () => {
  for (const body of [{ season: 2026 }, { week: 7 }, { season: 2026, week: 19 }, { groupId: '../g' }, { groupId: 7 }, { userId: OTHER }, { season: '2026', week: 7 }]) {
    const f = fixture(), response = await f.request('read', body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(f.calls.length, 0);
  }
});

test('draft and lock call their own writer with the signed-in user, never a client clock', async () => {
  for (const [path, rpc, locked] of [['draft', 'gtl_points_save_draft', false], ['lock', 'gtl_points_lock_in', true]]) {
    const f = fixture(), response = await f.request(path, lockBody({ requestId: REQUEST.toUpperCase() }));
    assert.equal(response.status, 200);
    assert.deepEqual(f.calls, [[rpc, { p_user: USER.id, p_request: REQUEST, p_season: 2026, p_week: 7, p_slot: 'QB', p_guess: 18 }]]);
    const result = await response.json();
    assert.equal(result.locked, locked);
    assert.equal(result.receipt, undefined);
  }
});

test('a guess must be a whole number from 0 to 60 for a real slot; anything else is refused before the database', async () => {
  for (const patch of [{ guess: 61 }, { guess: -1 }, { guess: 18.5 }, { guess: '18' }, { guess: null }, { slot: 'K' }, { slot: 'qb' }, { requestId: 'nope' },
    { week: 0 }, { season: 1999 }, { userId: OTHER }, { lockedAt: '2026-10-21T18:00:00Z' }]) {
    const f = fixture(), response = await f.request('lock', lockBody(patch));
    assert.equal(response.status, 400, JSON.stringify(patch));
    assert.equal(f.calls.length, 0);
  }
  for (const guess of [0, 60]) assert.equal((await fixture().request('draft', lockBody({ guess }))).status, 200);
});

test('database refusals keep their sentence and the codes the app acts on; anything else is the generic outage', async () => {
  const { providerPointsError } = await import('../cloud/points.mjs');
  for (const [code, status, publicCode] of [['GTL_POINTS_LOCKED', 409, 'GTL_POINTS_LOCKED'], ['GTL_POINTS_CLOSED', 409, 'GTL_POINTS_CLOSED'],
    ['GTL_POINTS_NOT_OPEN', 409, 'GTL_POINTS_NOT_OPEN'], ['GTL_POINTS_RETRY_CONFLICT', 409, undefined], ['GTL_COMMUNITY_MEMBER', 403, undefined]]) {
    const response = await fixture({ failure: providerPointsError(code) }).request('lock', lockBody());
    const body = await response.json();
    assert.equal(response.status, status, code);
    assert.equal(body.code, publicCode, code);
    assert.doesNotMatch(body.error, /GTL_|changed|revision/, `${code}: a readable sentence the app shows as is`);
  }
  const outage = await fixture({ failure: new Error('private SQL detail') }).request('read', {});
  assert.equal(outage.status, 503);
  assert.doesNotMatch(await outage.text(), /private SQL detail/);
});

test('feature flag: before P-01 is applied, every route answers 404 "coming soon" with GTL_POINTS_OFF', async () => {
  const sent = [];
  const adapter = createSupabaseAdapter({ url: 'https://project.supabase.co', anonKey: 'public-test-key', serviceRoleKey: 'server-test-secret', fetchImpl: async (url, options) => {
    sent.push(new URL(url).pathname);
    return Response.json({ code: 'PGRST202', message: 'Could not find the function' }, { status: 404 });
  } });
  const handler = createCloudHandler({ authenticate: async () => USER, points: adapter.points });
  for (const [path, body] of [['read', {}], ['draft', lockBody()], ['lock', lockBody()], ['slate', { action: 'preview', season: 2026, week: 7 }]]) {
    const response = await handler(new Request(`https://fixture.invalid/functions/v1/gtl-api/points/${path}`, {
      method: 'POST', headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    assert.equal(response.status, 404, path);
    assert.deepEqual(await response.json(), { error: 'Guess the Points is coming soon.', code: 'GTL_POINTS_OFF' }, path);
  }
  assert.deepEqual(sent, ['/rest/v1/rpc/gtl_points_read', '/rest/v1/rpc/gtl_points_save_draft', '/rest/v1/rpc/gtl_points_lock_in', '/rest/v1/rpc/gtl_points_publish_slate']);
  // A gtl-api with no Points service configured answers the same way.
  const bare = createCloudHandler({ authenticate: async () => USER });
  const response = await bare(new Request('https://fixture.invalid/functions/v1/gtl-api/points/read', { method: 'POST', headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' }, body: '{}' }));
  assert.equal(response.status, 404);
});

test('the `points` off switch pauses the writers; the read keeps working', async () => {
  const f = fixture({ featureOff: 'points' });
  for (const [path, body] of [['draft', lockBody()], ['lock', lockBody()], ['slate', { action: 'publish', season: 2026, week: 7 }]]) {
    const response = await f.request(path, body);
    assert.equal(response.status, 503, path);
    assert.match((await response.json()).error, /paused/);
  }
  assert.equal(f.calls.length, 0);
  assert.equal((await f.request('read', {})).status, 200);
});

test('slate: the commissioner check is the database\'s; an invalid draft or a missing slate body is refused first', async () => {
  const slots = ['QB', 'RB', 'WR', 'TE', 'FLEX'].map((name, i) => ({ slot: name, playerId: `00-fixture-${i}`, name: `Fixture ${i}`, team: 'PIT', position: name === 'FLEX' ? 'TE' : name,
    gameKey: `2026_07_G${i}`, kickoff: i ? '2026-10-25T17:00:00Z' : '2026-10-23T00:15:00Z' }));
  for (const body of [{ action: 'draft', season: 2026, week: 7 }, { action: 'swap', season: 2026, week: 7 }, { action: 'preview', season: 2026, week: 7, slate: {} },
    { action: 'delete', season: 2026, week: 7 }, { action: 'draft', season: 2026, week: 7, slate: { slots: slots.map(s => ({ ...s, gameKey: 'same' })) } }]) {
    const f = fixture(), response = await f.request('slate', body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  const draft = { opensAt: '2026-10-20T19:00:00Z', scoringRules: { format: 'ppr', passingTds: 4, version: 'ppr4-v1' }, slots, house: {}, provenance: {} };
  assert.equal((await f.request('slate', { action: 'draft', season: 2026, week: 7, slate: draft })).status, 200);
  assert.deepEqual(f.calls[0], ['gtl_points_publish_slate', { p_actor: USER.id, p_action: 'draft', p_season: 2026, p_week: 7, p_slate: draft }]);
  const { providerPointsError } = await import('../cloud/points.mjs');
  const refused = await fixture({ failure: providerPointsError('GTL_POINTS_FORBIDDEN') }).request('slate', { action: 'preview', season: 2026, week: 7 });
  assert.equal(refused.status, 403);
});

test('signed out or with an unknown token, every Points route answers 401 before any database call', async () => {
  for (const path of ['read', 'draft', 'lock', 'slate']) {
    const f = fixture(), response = await f.request(path, {}, 'invalid');
    assert.equal(response.status, 401, path);
    assert.equal(f.calls.length, 0);
  }
  await assert.rejects(handlePoints({ route: '/points/read', body: {}, user: { ...USER, is_anonymous: true }, service: { rpc: async () => assert.fail() } }), error => error.status === 401);
});

test('the reply reader refuses a malformed read instead of guessing', () => {
  for (const raw of [null, [], { status: 'other' }, { status: 'open', season: 2026, week: 7, slots: [{ slot: 'K', kickoff: '2026-10-25T17:00:00Z' }] }, { status: 'open', season: 2026, week: 7 }]) {
    assert.throws(() => pointsReadView(raw), /Invalid Points reply/);
  }
});

test('boundary: the routes and every P-01 function are probed in the guess area; hosted and deployed since October 23, so none awaits deploy', () => {
  const { guess } = BOUNDARY_AREAS;
  for (const name of POINTS_RPCS) {
    assert.ok(guess.rpcChecks.some(([rpc]) => rpc === name), name);
    assert.ok(!Object.hasOwn(awaitingDeploy, `rpc/${name}`), name);
  }
  for (const action of ['read', 'draft', 'lock', 'slate']) {
    assert.ok(guess.apiChecks.some(([route]) => route === `points/${action}`), action);
    assert.ok(!Object.hasOwn(awaitingDeploy, `gtl-api/points/${action}`), action);
  }
});
