import test from 'node:test';
import assert from 'node:assert/strict';
import { EPL_BODY_LIMITS, EPL_METHODS, EPL_RPCS, EPL_PUBLIC_CODES, EPL_SNAPSHOT_MAX_BYTES, EplError, handleEpl, providerEplError, createEplService } from '../cloud/epl.mjs';
import { ROUTE_METHODS, ROUTE_MODULES, createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';

// EPL Pick a Team routes on gtl-api (plan 2026-10-28-epl-pick-a-team.md, Task 4) over the M-30 service-only RPCs.
const USER = { id: '00000000-0000-4000-8000-00000000000a', is_anonymous: false };
const OTHER = '00000000-0000-4000-8000-00000000000c';
const NEMO = '865667912365666304', CULLEN = '1259267898757611520', ADAM = '719745569895018496', SEAN = '473955676301815808';
const EVAN = '719658248843632640', MARK = '1257180071064510465', STEVEN = '702644837370929152', DARIN = '1395236217460633600';
const ORDER = [NEMO, CULLEN, ADAM, SEAN, EVAN, MARK, STEVEN, DARIN];
const NOW = Date.parse('2026-10-30T12:00:00Z');
const KICKOFF = '2026-10-31T12:25:00+00:00';

function weekState(overrides = {}) {
  return {
    season: 2026, week: 9,
    weekRow: { windowStart: '2026-10-30T00:00:00+00:00', windowEnd: '2026-11-04T00:00:00+00:00', firstKickoff: KICKOFF, pickOrder: ORDER, status: 'open', seeded: true },
    picks: [
      { ownerId: NEMO, club: 'MNC', source: 'seeded', pickedAt: '2026-10-29T10:00:00+00:00', final: true },
      { ownerId: CULLEN, club: 'AVL', source: 'seeded', pickedAt: '2026-10-29T11:00:00+00:00', final: false },
    ],
    fixtures: [
      { eventId: 'e1', home: 'MNC', away: 'BOU', commenceTime: KICKOFF, status: 'scheduled', homeGoals: null, awayGoals: null },
      { eventId: 'e2', home: 'AVL', away: 'LIV', commenceTime: '2026-10-31T15:00:00+00:00', status: 'scheduled', homeGoals: null, awayGoals: null },
      { eventId: 'e3', home: 'ARS', away: 'TOT', commenceTime: '2026-11-01T16:30:00+00:00', status: 'scheduled', homeGoals: null, awayGoals: null },
      { eventId: 'e4', home: 'CHE', away: 'EVE', commenceTime: '2026-11-01T14:00:00+00:00', status: 'postponed', homeGoals: null, awayGoals: null },
    ],
    bonus: [{ ownerId: EVAN, points: 15, margin: 3, club: 'ARS' }],
    ...overrides,
  };
}

/** A fake EPL service: `member` is what gtl_epl_member answers, `admin` what gtl_community_admin answers. */
function fakeService({ member = ADAM, admin = false, state = weekState(), queue = ['ARS', 'LIV'], latest = { season: 2026, week: 9 }, errors = {} } = {}) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push([name, args]);
      if (Object.hasOwn(errors, name)) throw providerEplError(errors[name]);
      if (name === 'gtl_epl_member') return member;
      if (name === 'gtl_community_admin') return admin;
      if (name === 'gtl_epl_week_state') return state;
      if (name === 'gtl_epl_save_pick') return { season: args.p_season, week: args.p_week, ownerId: member, club: args.p_club, action: 'pick', picks: [...state.picks, { ownerId: member, club: args.p_club, source: 'pick', pickedAt: new Date(NOW).toISOString(), final: false }] };
      if (name === 'gtl_epl_save_queue') return { season: args.p_season, week: args.p_week, ownerId: member, clubs: args.p_clubs };
      if (name === 'gtl_epl_link_manager') return { ownerId: args.p_owner_id, userId: args.p_user };
      if (name === 'gtl_epl_seed_week') return { season: args.p_season, week: args.p_week, seeded: args.p_picks.length };
      if (name === 'gtl_epl_set_week_window') {
        if (!state) throw providerEplError('GTL_EPL_NO_WEEK');
        return { season: args.p_season, week: args.p_week, windowStart: args.p_window_start, windowEnd: args.p_window_end, firstKickoff: args.p_first_kickoff ?? state.weekRow.firstKickoff };
      }
      if (name === 'gtl_epl_save_snapshot') return true;
      if (name === 'gtl_epl_set_fixture_status') return { eventId: args.p_event_id, season: 2026, week: 9, status: args.p_status };
      if (name === 'gtl_epl_set_fixture_result') return { eventId: args.p_event_id, season: 2026, week: 9, status: 'final', homeGoals: args.p_home_goals, awayGoals: args.p_away_goals };
      throw new Error(`unexpected rpc ${name}`);
    },
    async latestWeek() { calls.push(['latestWeek']); return latest; },
    async readQueue(season, week, ownerId) { calls.push(['readQueue', season, week, ownerId]); return queue; },
  };
}
const call = (route, body, service, user = USER) => handleEpl({ route, body, user, service, clock: () => NOW });
const rejectsWith = (promise, status, code) => assert.rejects(promise, error => {
  assert.ok(error instanceof EplError, `${error?.message}`);
  assert.equal(error.status, status, error.message);
  if (code) assert.equal(error.code, code);
  return true;
});

test('EPL_METHODS is the seven POST routes, frozen, and registered in gtl-api', () => {
  assert.deepEqual({ ...EPL_METHODS }, {
    '/epl/draft/read': ['POST'], '/epl/draft/pick': ['POST'], '/epl/queue/save': ['POST'],
    '/epl/admin/link': ['POST'], '/epl/admin/week': ['POST'], '/epl/admin/snapshot': ['POST'], '/epl/admin/fixture': ['POST'],
  });
  assert.ok(Object.isFrozen(EPL_METHODS));
  assert.equal(ROUTE_MODULES.epl, EPL_METHODS);
  for (const route of Object.keys(EPL_METHODS)) assert.deepEqual(ROUTE_METHODS[route], ['POST']);
});

test('every route requires a signed-in account and an unknown route is 404', async () => {
  for (const user of [null, {}, { id: 'nope' }, { ...USER, is_anonymous: true }]) {
    await rejectsWith(call('/epl/draft/read', {}, fakeService(), user), 401);
  }
  await rejectsWith(call('/epl/unknown', {}, fakeService()), 404);
});

test('a non-member is refused 403 GTL_EPL_FORBIDDEN before any state is read', async () => {
  for (const route of ['/epl/draft/read', '/epl/draft/pick', '/epl/queue/save']) {
    const service = fakeService({ member: null });
    const body = route === '/epl/draft/pick' ? { club: 'ARS' } : route === '/epl/queue/save' ? { clubs: [] } : {};
    await rejectsWith(call(route, body, service), 403, 'GTL_EPL_FORBIDDEN');
    assert.deepEqual(service.calls.map(c => c[0]), ['gtl_epl_member'], route);
  }
});

test('a non-member gets 403 even for a malformed body: membership is checked before the body (pre-T8 fix wave)', async () => {
  const bad = { '/epl/draft/read': [{ extra: 1 }, { season: 1999, week: 9 }], '/epl/draft/pick': [{}, { club: 'arsenal' }, { club: 'ARS', ownerId: SEAN }],
    '/epl/queue/save': [{ clubs: 'ARS' }, { clubs: ['ARS', 'ARS'] }, { extra: 1 }] };
  for (const [route, bodies] of Object.entries(bad)) for (const body of bodies) {
    const service = fakeService({ member: null });
    await rejectsWith(call(route, body, service), 403, 'GTL_EPL_FORBIDDEN');
    assert.deepEqual(service.calls.map(c => c[0]), ['gtl_epl_member'], `${route} ${JSON.stringify(body)}`);
  }
});

test('draft/read gives a member the board, the clubs playing, their own queue and last week\'s bonus', async () => {
  const service = fakeService();
  const view = await call('/epl/draft/read', {}, service);
  assert.equal(view.season, 2026);
  assert.equal(view.week, 9);
  assert.equal(view.status, 'open');
  assert.equal(view.deadline, KICKOFF);
  assert.deepEqual(view.order[0], { ownerId: NEMO, name: 'Nemo' });
  assert.deepEqual(view.order.map(o => o.name), ['Nemo', 'Cullen', 'Adam', 'Sean', 'Evan', 'Mark', 'Steven', 'Darin']);
  assert.deepEqual(view.picks, [
    { ownerId: NEMO, name: 'Nemo', club: 'MNC', source: 'seeded', pickedAt: '2026-10-29T10:00:00+00:00', final: true },
    { ownerId: CULLEN, name: 'Cullen', club: 'AVL', source: 'seeded', pickedAt: '2026-10-29T11:00:00+00:00', final: false },
  ]);
  assert.equal(view.onTheClock, ADAM);
  // The caller's own manager id, so the board knows when it is their turn (Task 8).
  assert.equal(view.me, ADAM);
  // Postponed fixtures are not pickable; each club appears once, against its opponent, with its kickoff.
  assert.deepEqual(view.clubs.map(c => c.code), ['MNC', 'BOU', 'AVL', 'LIV', 'ARS', 'TOT']);
  // The club's name comes from shared/epl-clubs.mjs, never the code (pre-T8 fix wave).
  assert.deepEqual(view.clubs[0], { code: 'MNC', name: 'Manchester City', opponent: 'BOU', kickoff: KICKOFF, home: true });
  assert.deepEqual(view.clubs[1], { code: 'BOU', name: 'Bournemouth', opponent: 'MNC', kickoff: KICKOFF, home: false });
  assert.deepEqual(view.clubs.map(c => c.name), ['Manchester City', 'Bournemouth', 'Aston Villa', 'Liverpool', 'Arsenal', 'Tottenham Hotspur']);
  assert.deepEqual(view.myQueue, ['ARS', 'LIV']);
  assert.deepEqual(view.bonusLastWeek, [{ ownerId: EVAN, name: 'Evan', points: 15, margin: 3, club: 'ARS' }]);
  assert.deepEqual(service.calls.find(c => c[0] === 'readQueue'), ['readQueue', 2026, 9, ADAM]);
  assert.deepEqual(service.calls.find(c => c[0] === 'gtl_epl_week_state'), ['gtl_epl_week_state', { p_season: 2026, p_week: 9 }]);
});

test('draft/read reads the requested week, and the unlinked commissioner sees the board with no queue', async () => {
  const service = fakeService({ member: 'commissioner' });
  const view = await call('/epl/draft/read', { season: 2026, week: 9 }, service);
  assert.equal(view.myQueue, null);
  assert.equal(view.me, null);
  assert.ok(!service.calls.some(c => c[0] === 'latestWeek' || c[0] === 'readQueue'));
});

test('draft/read: nobody is on the clock after the deadline, and a missing week is 404', async () => {
  const closed = await handleEpl({ route: '/epl/draft/read', body: {}, user: USER, service: fakeService(), clock: () => Date.parse(KICKOFF) });
  assert.equal(closed.onTheClock, null);
  await rejectsWith(call('/epl/draft/read', {}, fakeService({ latest: null })), 404, 'GTL_EPL_NO_WEEK');
  await rejectsWith(call('/epl/draft/read', { season: 2026, week: 10 }, fakeService({ state: null })), 404, 'GTL_EPL_NO_WEEK');
  for (const body of [{ season: 2026 }, { week: 9 }, { season: 1999, week: 9 }, { season: 2026, week: 39 }, { extra: 1 }]) {
    await rejectsWith(call('/epl/draft/read', body, fakeService()), 400, 'GTL_EPL_INVALID');
  }
});

test('draft/pick sends the pick with server time and returns the board', async () => {
  const service = fakeService();
  const result = await call('/epl/draft/pick', { club: 'ARS' }, service);
  assert.deepEqual(service.calls.find(c => c[0] === 'gtl_epl_save_pick'), ['gtl_epl_save_pick',
    { p_user: USER.id, p_season: 2026, p_week: 9, p_club: 'ARS', p_now: new Date(NOW).toISOString() }]);
  assert.equal(result.action, 'pick');
  assert.equal(result.club, 'ARS');
  assert.equal(result.picks.at(-1).name, 'Adam');
});

test('draft/pick maps the database refusals to 409 and checks the turn before writing', async () => {
  await rejectsWith(call('/epl/draft/pick', { club: 'LIV' }, fakeService({ errors: { gtl_epl_save_pick: 'GTL_EPL_CLUB_TAKEN' } })), 409, 'GTL_EPL_CLUB_TAKEN');
  for (const code of ['GTL_EPL_NOT_YOUR_TURN', 'GTL_EPL_DRAFT_CLOSED', 'GTL_EPL_CLUB_NOT_PLAYING']) {
    await rejectsWith(call('/epl/draft/pick', { club: 'LIV' }, fakeService({ errors: { gtl_epl_save_pick: code } })), 409, code);
  }
  // The rules in shared/epl-draft.mjs refuse early, without a write.
  const taken = fakeService();
  await rejectsWith(call('/epl/draft/pick', { club: 'MNC' }, taken), 409, 'GTL_EPL_CLUB_TAKEN');
  assert.ok(!taken.calls.some(c => c[0] === 'gtl_epl_save_pick'));
  const notTurn = fakeService({ member: SEAN });
  await rejectsWith(call('/epl/draft/pick', { club: 'ARS' }, notTurn), 409, 'GTL_EPL_NOT_YOUR_TURN');
  assert.ok(!notTurn.calls.some(c => c[0] === 'gtl_epl_save_pick'));
  await rejectsWith(call('/epl/draft/pick', { club: 'CHE' }, fakeService()), 409, 'GTL_EPL_CLUB_NOT_PLAYING');
  await rejectsWith(handleEpl({ route: '/epl/draft/pick', body: { club: 'ARS' }, user: USER, service: fakeService(), clock: () => Date.parse(KICKOFF) }), 409, 'GTL_EPL_DRAFT_CLOSED');
  for (const body of [{}, { club: '' }, { club: 'arsenal' }, { club: 7 }, { club: 'ARS', ownerId: SEAN }]) {
    await rejectsWith(call('/epl/draft/pick', body, fakeService()), 400, 'GTL_EPL_INVALID');
  }
});

test('draft/pick refuses a week with a null or unparseable first kickoff as closed, before any rule or write (pre-T8 fix wave)', async () => {
  for (const firstKickoff of [null, 'not a time', '', 7]) {
    const service = fakeService({ state: weekState({ weekRow: { ...weekState().weekRow, firstKickoff } }) });
    await rejectsWith(call('/epl/draft/pick', { club: 'ARS' }, service), 409, 'GTL_EPL_DRAFT_CLOSED');
    assert.ok(!service.calls.some(c => c[0] === 'gtl_epl_save_pick'), String(firstKickoff));
  }
});

test('admin/fixture: the commissioner postpones or restores a match; a member is refused 403 (pre-T8 fix wave)', async () => {
  const service = fakeService({ admin: true });
  assert.deepEqual(await call('/epl/admin/fixture', { eventId: 'e8', status: 'postponed' }, service), { eventId: 'e8', season: 2026, week: 9, status: 'postponed' });
  assert.deepEqual(service.calls.at(-1), ['gtl_epl_set_fixture_status', { p_event_id: 'e8', p_status: 'postponed', p_by: USER.id }]);
  assert.equal((await call('/epl/admin/fixture', { eventId: 'e8', status: 'scheduled' }, fakeService({ admin: true }))).status, 'scheduled');
  const member = fakeService({ member: ADAM, admin: false });
  await rejectsWith(call('/epl/admin/fixture', { eventId: 'e8', status: 'postponed' }, member), 403, 'GTL_EPL_FORBIDDEN');
  assert.deepEqual(member.calls.map(c => c[0]), ['gtl_community_admin']);
  for (const body of [{}, { eventId: 'e8' }, { eventId: 'e8', status: 'final' }, { eventId: '', status: 'postponed' }, { eventId: 7, status: 'postponed' },
    { eventId: 'x'.repeat(129), status: 'postponed' }, { eventId: 'e8', status: 'postponed', extra: 1 }]) {
    const refused = fakeService({ admin: true });
    await rejectsWith(call('/epl/admin/fixture', body, refused), 400, 'GTL_EPL_INVALID');
    assert.ok(!refused.calls.some(c => c[0] === 'gtl_epl_set_fixture_status'), JSON.stringify(body));
  }
  await rejectsWith(call('/epl/admin/fixture', { eventId: 'e1', status: 'postponed' }, fakeService({ admin: true, errors: { gtl_epl_set_fixture_status: 'GTL_EPL_FIXTURE_LOCKED' } })), 409, 'GTL_EPL_FIXTURE_LOCKED');
});

test('admin/fixture: the commissioner records a final result for a needs_review week; goals are whole and only with final (final review)', async () => {
  const service = fakeService({ admin: true });
  assert.deepEqual(await call('/epl/admin/fixture', { eventId: 'e8', status: 'final', homeGoals: 2, awayGoals: 1 }, service),
    { eventId: 'e8', season: 2026, week: 9, status: 'final', homeGoals: 2, awayGoals: 1 });
  assert.deepEqual(service.calls.at(-1), ['gtl_epl_set_fixture_result', { p_event_id: 'e8', p_home_goals: 2, p_away_goals: 1, p_by: USER.id }]);
  const member = fakeService({ member: ADAM, admin: false });
  await rejectsWith(call('/epl/admin/fixture', { eventId: 'e8', status: 'final', homeGoals: 2, awayGoals: 1 }, member), 403, 'GTL_EPL_FORBIDDEN');
  for (const body of [{ eventId: 'e8', status: 'final', homeGoals: 2 }, { eventId: 'e8', status: 'final', homeGoals: -1, awayGoals: 0 },
    { eventId: 'e8', status: 'final', homeGoals: 1.5, awayGoals: 0 }, { eventId: 'e8', status: 'final', homeGoals: '2', awayGoals: 0 },
    { eventId: 'e8', status: 'final', homeGoals: 100, awayGoals: 0 }, { eventId: 'e8', status: 'postponed', homeGoals: 1, awayGoals: 0 }]) {
    const refused = fakeService({ admin: true });
    await rejectsWith(call('/epl/admin/fixture', body, refused), 400, 'GTL_EPL_INVALID');
    assert.ok(!refused.calls.some(c => c[0].startsWith('gtl_epl_set_fixture')), JSON.stringify(body));
  }
  await rejectsWith(call('/epl/admin/fixture', { eventId: 'e1', status: 'final', homeGoals: 0, awayGoals: 0 },
    fakeService({ admin: true, errors: { gtl_epl_set_fixture_result: 'GTL_EPL_FIXTURE_LOCKED' } })), 409, 'GTL_EPL_FIXTURE_LOCKED');
});

test('queue/save keeps the order sent and refuses duplicates, more than 20, and clubs not playing', async () => {
  const service = fakeService();
  const result = await call('/epl/queue/save', { clubs: ['LIV', 'ARS', 'TOT'] }, service);
  assert.deepEqual(result, { season: 2026, week: 9, clubs: ['LIV', 'ARS', 'TOT'] });
  assert.deepEqual(service.calls.find(c => c[0] === 'gtl_epl_save_queue'), ['gtl_epl_save_queue', { p_user: USER.id, p_season: 2026, p_week: 9, p_clubs: ['LIV', 'ARS', 'TOT'] }]);
  const many = Array.from({ length: 21 }, (_, i) => `C${String(i).padStart(2, '0')}`);
  for (const clubs of [['ARS', 'ARS'], many, ['CHE'], ['XYZ'], 'ARS', [1], ['ars']]) {
    const refused = fakeService();
    await rejectsWith(call('/epl/queue/save', { clubs }, refused), 400, 'GTL_EPL_QUEUE_INVALID');
    assert.ok(!refused.calls.some(c => c[0] === 'gtl_epl_save_queue'), JSON.stringify(clubs));
  }
  await rejectsWith(call('/epl/queue/save', { clubs: [] }, fakeService({ member: 'commissioner' })), 403, 'GTL_EPL_NOT_MEMBER');
  const empty = await call('/epl/queue/save', { clubs: [] }, fakeService());
  assert.deepEqual(empty.clubs, []);
});

test('admin routes are the commissioner\'s alone', async () => {
  const bodies = {
    '/epl/admin/link': { ownerId: DARIN, userId: OTHER },
    '/epl/admin/week': { season: 2026, week: 9, windowStart: '2026-10-30T00:00:00Z', windowEnd: '2026-11-04T00:00:00Z' },
    '/epl/admin/snapshot': { label: 'after-mw8', capturedAt: '2026-10-28T17:32:00Z', sha256: { rosters: 'a'.repeat(64) }, payload: { rosters: [] } },
    '/epl/admin/fixture': { eventId: 'e8', status: 'postponed' },
  };
  for (const [route, body] of Object.entries(bodies)) {
    // A linked manager (even Sean, who is also a manager) is not a commissioner unless gtl_community_admin says so.
    const service = fakeService({ member: SEAN, admin: false });
    await rejectsWith(call(route, body, service), 403, 'GTL_EPL_FORBIDDEN');
    assert.deepEqual(service.calls.map(c => c[0]), ['gtl_community_admin'], route);
  }
});

test('admin/link links an account to a manager', async () => {
  const service = fakeService({ admin: true });
  assert.deepEqual(await call('/epl/admin/link', { ownerId: DARIN, userId: OTHER }, service), { ownerId: DARIN, userId: OTHER });
  assert.deepEqual(service.calls.at(-1), ['gtl_epl_link_manager', { p_owner_id: DARIN, p_user: OTHER, p_by: USER.id }]);
  await rejectsWith(call('/epl/admin/link', { ownerId: DARIN, userId: OTHER }, fakeService({ admin: true, errors: { gtl_epl_link_manager: 'GTL_EPL_ALREADY_LINKED' } })), 409, 'GTL_EPL_ALREADY_LINKED');
  for (const body of [{ ownerId: '1', userId: OTHER }, { ownerId: 'constructor', userId: OTHER }, { ownerId: DARIN, userId: 'x' }, { ownerId: DARIN }, { ownerId: DARIN, userId: 7 }, { ownerId: null, userId: null }]) {
    await rejectsWith(call('/epl/admin/link', body, fakeService({ admin: true })), 400);
  }
});

test('admin/link with userId null unlinks the manager', async () => {
  const service = fakeService({ admin: true });
  assert.deepEqual(await call('/epl/admin/link', { ownerId: DARIN, userId: null }, service), { ownerId: DARIN, userId: null });
  assert.deepEqual(service.calls.map(c => c[0]), ['gtl_community_admin', 'gtl_epl_link_manager']);
  assert.deepEqual(service.calls.at(-1), ['gtl_epl_link_manager', { p_owner_id: DARIN, p_user: null, p_by: USER.id }]);
  await rejectsWith(call('/epl/admin/link', { ownerId: DARIN, userId: null }, fakeService({ admin: false })), 403, 'GTL_EPL_FORBIDDEN');
});

test('admin/week seeds MW9 with Sean\'s order and the chat picks', async () => {
  const service = fakeService({ admin: true, state: null });
  const picks = [
    { ownerId: NEMO, club: 'MNC' }, { ownerId: CULLEN, club: 'AVL' }, { ownerId: ADAM, club: 'LIV' }, { ownerId: SEAN, club: 'TOT' },
    { ownerId: EVAN, club: 'ARS' }, { ownerId: MARK, club: 'BRE' }, { ownerId: STEVEN, club: 'NEW', pickedAt: '2026-10-29T20:00:00Z' },
  ];
  const result = await call('/epl/admin/week', { season: 2026, week: 9, windowStart: '2026-10-30T00:00:00Z', windowEnd: '2026-11-04T00:00:00Z', firstKickoff: '2026-10-31T12:25:00Z', order: ORDER, picks }, service);
  assert.deepEqual(result, { season: 2026, week: 9, seeded: 7 });
  const [, args] = service.calls.find(c => c[0] === 'gtl_epl_seed_week');
  assert.deepEqual(args, {
    p_season: 2026, p_week: 9, p_window_start: '2026-10-30T00:00:00.000Z', p_window_end: '2026-11-04T00:00:00.000Z',
    p_first_kickoff: '2026-10-31T12:25:00.000Z', p_order: ORDER,
    p_picks: picks.map(p => ({ owner_id: p.ownerId, club: p.club, picked_at: p.pickedAt ? new Date(p.pickedAt).toISOString() : null })),
  });
});

test('admin/week with only a window corrects any open week (automatic, with real picks) and never seeds', async () => {
  // An automatically opened week (seeded false) that already has an in-app pick: gtl_epl_seed_week would refuse it.
  const auto = weekState({ weekRow: { ...weekState().weekRow, seeded: false }, picks: [{ ownerId: NEMO, club: 'MNC', source: 'pick', pickedAt: '2026-10-30T10:00:00+00:00', final: false }] });
  const service = fakeService({ admin: true, state: auto, errors: { gtl_epl_seed_week: 'GTL_EPL_SEED_REFUSED' } });
  const body = { season: 2026, week: 9, windowStart: '2026-10-29T00:00:00Z', windowEnd: '2026-11-05T00:00:00Z' };
  assert.deepEqual(await call('/epl/admin/week', body, service), {
    season: 2026, week: 9, windowStart: '2026-10-29T00:00:00.000Z', windowEnd: '2026-11-05T00:00:00.000Z', firstKickoff: new Date(KICKOFF).toISOString(),
  });
  assert.deepEqual(service.calls.map(c => c[0]), ['gtl_community_admin', 'gtl_epl_set_week_window']);
  assert.deepEqual(service.calls.at(-1)[1], { p_season: 2026, p_week: 9, p_window_start: '2026-10-29T00:00:00.000Z', p_window_end: '2026-11-05T00:00:00.000Z', p_first_kickoff: null });
  // The first kickoff can be corrected with the window.
  const kick = fakeService({ admin: true, state: auto });
  const moved = await call('/epl/admin/week', { ...body, firstKickoff: '2026-10-31T15:00:00Z' }, kick);
  assert.equal(moved.firstKickoff, '2026-10-31T15:00:00.000Z');
  assert.equal(kick.calls.at(-1)[1].p_first_kickoff, '2026-10-31T15:00:00.000Z');
  // A missing week is 404 and a resolved one 409; a bad window never reaches the database.
  await rejectsWith(call('/epl/admin/week', body, fakeService({ admin: true, state: null })), 404, 'GTL_EPL_NO_WEEK');
  await rejectsWith(call('/epl/admin/week', body, fakeService({ admin: true, errors: { gtl_epl_set_week_window: 'GTL_EPL_DRAFT_CLOSED' } })), 409, 'GTL_EPL_DRAFT_CLOSED');
  const bad = fakeService({ admin: true });
  await rejectsWith(call('/epl/admin/week', { ...body, windowEnd: '2026-10-28T00:00:00Z' }, bad), 400, 'GTL_EPL_INVALID');
  assert.deepEqual(bad.calls.map(c => c[0]), ['gtl_community_admin']);
});

test('admin/week keeps the stored order and kickoff when only picks are sent, and maps a refused seed to 409', async () => {
  const service = fakeService({ admin: true });
  await call('/epl/admin/week', { season: 2026, week: 9, windowStart: '2026-10-30T00:00:00Z', windowEnd: '2026-11-04T00:00:00Z', picks: [] }, service);
  const [, args] = service.calls.find(c => c[0] === 'gtl_epl_seed_week');
  assert.deepEqual(args.p_order, ORDER);
  assert.equal(args.p_first_kickoff, new Date(KICKOFF).toISOString());
  assert.deepEqual(args.p_picks, []);
  await rejectsWith(call('/epl/admin/week', { season: 2026, week: 9, windowStart: '2026-10-30T00:00:00Z', windowEnd: '2026-11-04T00:00:00Z', order: ORDER }, fakeService({ admin: true, errors: { gtl_epl_seed_week: 'GTL_EPL_SEED_REFUSED' } })), 409, 'GTL_EPL_SEED_REFUSED');
  const base = { season: 2026, week: 10, windowStart: '2026-11-04T00:00:00Z', windowEnd: '2026-11-11T00:00:00Z', firstKickoff: '2026-11-07T12:30:00Z' };
  for (const body of [
    { ...base, windowEnd: '2026-11-01T00:00:00Z' }, { ...base, order: [NEMO, NEMO] }, { ...base, order: ['123'] },
    { ...base, order: ORDER, picks: [{ ownerId: NEMO, club: 'MNC' }, { ownerId: CULLEN, club: 'MNC' }] },
    { ...base, order: ORDER, picks: [{ ownerId: '42', club: 'MNC' }] }, { ...base, windowStart: 'soon' },
  ]) {
    await rejectsWith(call('/epl/admin/week', body, fakeService({ admin: true, state: null })), 400, 'GTL_EPL_INVALID');
  }
  // A new week without an order or a kickoff cannot be made up.
  await rejectsWith(call('/epl/admin/week', { ...base, firstKickoff: undefined, order: ORDER }, fakeService({ admin: true, state: null })), 400, 'GTL_EPL_INVALID');
  await rejectsWith(call('/epl/admin/week', { ...base, picks: [] }, fakeService({ admin: true, state: null })), 400, 'GTL_EPL_INVALID');
});

test('admin/snapshot stores a Sleeper snapshot by label', async () => {
  const service = fakeService({ admin: true });
  const body = { label: 'after-mw8', capturedAt: '2026-10-28T17:32:00Z', week: 8, sha256: { rosters: 'a'.repeat(64) }, payload: { rosters: [] } };
  assert.deepEqual(await call('/epl/admin/snapshot', body, service), { label: 'after-mw8', saved: true });
  assert.deepEqual(service.calls.at(-1), ['gtl_epl_save_snapshot', { p_label: 'after-mw8', p_captured_at: '2026-10-28T17:32:00.000Z', p_week: 8, p_sha256: body.sha256, p_payload: body.payload }]);
  for (const bad of [{ ...body, label: '' }, { ...body, label: 'A B' }, { ...body, capturedAt: 'x' }, { ...body, payload: [] }, { ...body, sha256: { rosters: 'zz' } }, { ...body, week: 0 }]) {
    await rejectsWith(call('/epl/admin/snapshot', bad, fakeService({ admin: true })), 400, 'GTL_EPL_INVALID');
  }
});

test('the error map: unknown codes stay private, M-30 not applied reads as coming soon', () => {
  for (const message of [undefined, 'GTL_UNKNOWN', 'constructor', '__proto__', 'secret detail']) {
    const error = providerEplError(message);
    assert.ok(!(error instanceof EplError));
    assert.equal(error.message, 'Pick a Team is unavailable.');
  }
  const off = providerEplError('GTL_FEATURE_OFF');
  assert.equal(off.status, 404);
  assert.equal(off.code, 'GTL_EPL_OFF');
  const statuses = {
    GTL_EPL_INVALID: 400, GTL_EPL_QUEUE_INVALID: 400, GTL_EPL_UNKNOWN_MANAGER: 400, GTL_EPL_FORBIDDEN: 403, GTL_EPL_NOT_MEMBER: 403,
    GTL_EPL_NO_WEEK: 404, GTL_EPL_DRAFT_CLOSED: 409, GTL_EPL_NOT_YOUR_TURN: 409, GTL_EPL_CLUB_NOT_PLAYING: 409, GTL_EPL_CLUB_TAKEN: 409,
    GTL_EPL_ALREADY_LINKED: 409, GTL_EPL_SEED_REFUSED: 409, GTL_EPL_NOT_RESOLVED: 409,
  };
  for (const [code, status] of Object.entries(statuses)) {
    assert.equal(providerEplError(code).status, status, code);
    assert.ok(EPL_PUBLIC_CODES.includes(providerEplError(code).code), code);
  }
});

test('createEplService reads the latest week and a queue through the table reader', async () => {
  const reads = [];
  const service = createEplService({ rpc: async () => 'x', rest: async (table, query) => { reads.push([table, query]); return table === 'gtl_epl_weeks' ? { season: 2026, week: 9 } : { clubs: ['ARS'] }; } });
  assert.deepEqual(await service.latestWeek(), { season: 2026, week: 9 });
  assert.deepEqual(await service.readQueue(2026, 9, ADAM), ['ARS']);
  assert.deepEqual(reads, [
    ['gtl_epl_weeks', { select: 'season,week', order: 'season.desc,week.desc', limit: '1' }],
    ['gtl_epl_queues', { select: 'clubs', season: 'eq.2026', week: 'eq.9', owner_id: `eq.${ADAM}`, limit: '1' }],
  ]);
  const none = createEplService({ rpc: async () => null, rest: async () => null });
  assert.equal(await none.latestWeek(), null);
  assert.deepEqual(await none.readQueue(2026, 9, ADAM), []);
});

test('the gtl-api adapter gives EPL a caller limited to its own functions, and the handler sends the public code', async () => {
  const requests = [];
  const adapter = createSupabaseAdapter({ url: 'https://project.supabase.co', anonKey: 'public-test-key', serviceRoleKey: 'server-test-secret', fetchImpl: async (url, options) => {
    requests.push(new URL(url).pathname);
    return Response.json({ message: 'GTL_EPL_CLUB_TAKEN' }, { status: 400 });
  } });
  assert.deepEqual([...EPL_RPCS].sort(), ['gtl_community_admin', 'gtl_epl_link_manager', 'gtl_epl_member', 'gtl_epl_save_pick', 'gtl_epl_save_queue', 'gtl_epl_save_snapshot', 'gtl_epl_seed_week', 'gtl_epl_set_fixture_result', 'gtl_epl_set_fixture_status', 'gtl_epl_set_week_window', 'gtl_epl_week_state']);
  await assert.rejects(adapter.epl.rpc('gtl_epl_save_pick', {}), error => error instanceof EplError && error.status === 409);
  await assert.rejects(adapter.epl.rpc('gtl_epl_resolve_week', {}), /Invalid operation/);
  assert.deepEqual(requests, ['/rest/v1/rpc/gtl_epl_save_pick']);

  const handler = createCloudHandler({ authenticate: async () => ({ ...USER, email: 'adam@example.com', emailConfirmed: true }), epl: fakeService({ member: null }) });
  const response = await handler(new Request('https://fixture.invalid/functions/v1/gtl-api/epl/draft/read', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer token' }, body: '{}' }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Pick a Team is for the FEPL managers.', code: 'GTL_EPL_FORBIDDEN' });
});

test('gtl-api reads a full-size Sleeper snapshot on /epl/admin/snapshot and keeps the 32 KB cap everywhere else', async () => {
  assert.deepEqual(EPL_BODY_LIMITS, { '/epl/admin/snapshot': EPL_SNAPSHOT_MAX_BYTES });
  const service = fakeService({ admin: true });
  const handler = createCloudHandler({ authenticate: async () => ({ ...USER, email: 'sean@example.com', emailConfirmed: true }), epl: service });
  const post = (route, body) => handler(new Request(`https://fixture.invalid/functions/v1/gtl-api${route}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer token' }, body }));
  // Well above a trimmed import (about 110 KB for the after-MW8 file) and the 32 KB cap: stats for 2000 players.
  const stats = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`p${i}`, { pts_half_ppr: i / 10, gp: 8, min: 600, goal: 1, ast: 2, padding: 'x'.repeat(100) }]));
  const snapshot = JSON.stringify({ label: 'after-mw8', capturedAt: '2026-10-28T17:32:00Z', week: 8, payload: { rosters: [], stats_mw8: stats } });
  assert.ok(snapshot.length > 250_000 && snapshot.length < EPL_SNAPSHOT_MAX_BYTES, `${snapshot.length}`);
  const saved = await post('/epl/admin/snapshot', snapshot);
  assert.equal(saved.status, 200, JSON.stringify(await saved.clone().json()));
  assert.deepEqual(await saved.json(), { label: 'after-mw8', saved: true });
  assert.equal(service.calls.at(-1)[0], 'gtl_epl_save_snapshot');
  assert.equal(Object.keys(service.calls.at(-1)[1].p_payload.stats_mw8).length, 2000);
  // Over the snapshot cap is still refused, and the other EPL routes keep the 32 KB cap.
  assert.equal((await post('/epl/admin/snapshot', JSON.stringify({ label: 'x', padding: 'x'.repeat(EPL_SNAPSHOT_MAX_BYTES) }))).status, 413);
  assert.equal((await post('/epl/admin/week', JSON.stringify({ padding: 'x'.repeat(32769) }))).status, 413);
  assert.equal((await post('/epl/queue/save', JSON.stringify({ padding: 'x'.repeat(32769) }))).status, 413);
});

test('the raised snapshot cap is checked against the commissioner before the body is read', async () => {
  const big = JSON.stringify({ label: 'after-mw8', padding: 'x'.repeat(40_000) });
  for (const [service, why] of [[fakeService({ admin: false }), 'a member'], [fakeService({ errors: { gtl_community_admin: new Error('down') } }), 'a failed check']]) {
    const handler = createCloudHandler({ authenticate: async () => ({ ...USER, email: 'adam@example.com', emailConfirmed: true }), epl: service });
    const response = await handler(new Request('https://fixture.invalid/functions/v1/gtl-api/epl/admin/snapshot', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer token' }, body: big }));
    assert.equal(response.status, 413, why);
    assert.ok(!service.calls.some(([name]) => name === 'gtl_epl_save_snapshot'), why);
  }
});
