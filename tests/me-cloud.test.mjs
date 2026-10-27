import test from 'node:test';
import assert from 'node:assert/strict';
import { ME_METHODS, MeError, handleMe, providerMeError } from '../cloud/me.mjs';
import { projectChanges, projectRecords } from '../cloud/me-history.mjs';

// Redesign build plan stage 72 (M-27): the History routes in cloud/me.mjs, without a database. Contracts: only the signed-in
// owner is ever asked for (no request names another account); each SQL refusal code is mapped to a player sentence; while
// M-27 is missing the routes say History is unavailable (not Preferences); the reply is rebuilt field by field, so anything
// the SQL did not mean to send never reaches the browser; the retired Betting Challenge is graded by the old engine.
const USER = { id: '00000000-0000-4000-8000-00000000000a' };
const OTHER = '00000000-0000-4000-8000-00000000000b';
const NOW = Date.parse('2026-10-26T20:00:00Z');
const service = (reply, calls = []) => ({ rpc: async (name, args) => { calls.push([name, args]); return typeof reply === 'function' ? reply(name, args) : reply; } });
const changesReply = (extra = {}) => ({ ownerId: USER.id, now: '2026-10-26T20:00:00Z', markets: [{ season: 2026, week: 5, mode: 'guess_spread', deadline: '2026-10-09T00:15:00Z', satOut: false,
  games: [{ id: 'TB-DAL', awayCode: 'TB', homeCode: 'DAL', kickoff: '2026-10-09T00:15:00Z', secret: 'x' }], pendingChanges: 1,
  changes: [{ type: 'guess_locked_in', at: '2026-10-08T20:00:00Z', late: null, ruled: null, games: [{ gameId: 'TB-DAL', kind: 'locked', before: -9.5, after: -9.5,
    reference: { status: 'available', basis: 'line_at_guess', value: -8.5, observedAt: '2026-10-08T19:59:00Z', source: 'The Odds API', quotes: [1] }, extra: true }] },
  { type: 'made_up', at: '2026-10-08T20:00:00Z', games: [{ gameId: 'TB-DAL', kind: 'locked' }] },
  { type: 'ballot_saved', at: '2026-10-08T19:00:00Z', games: [{ gameId: 'NOT-ON', kind: 'draft', after: 3.5 }] }], ...extra }] });

test('the History routes are POST routes in the Me group', () => {
  assert.deepEqual(ME_METHODS['/me/changes'], ['POST']);
  assert.deepEqual(ME_METHODS['/me/records'], ['POST']);
  assert.ok(Object.isFrozen(ME_METHODS));
});

test('/me/changes asks only for the signed-in owner, with the handler clock, and validates the scope', async () => {
  const calls = [];
  const reply = await handleMe({ route: '/me/changes', body: { season: 2026, week: 5 }, user: USER, service: service(changesReply(), calls), clock: () => NOW });
  assert.deepEqual(calls, [['gtl_read_ballot_changes', { p_user: USER.id, p_season: 2026, p_week: 5, p_now: new Date(NOW).toISOString() }]]);
  assert.equal(reply.ownerId, USER.id);
  await handleMe({ route: '/me/changes', body: {}, user: USER, service: service(changesReply(), calls), clock: () => NOW });
  assert.deepEqual(calls[1][1], { p_user: USER.id, p_season: null, p_week: null, p_now: new Date(NOW).toISOString() });
  for (const body of [{ userId: OTHER }, { season: 2026 }, { week: 5 }, { season: 2026, week: 26 }, { season: 2026.5, week: 5 }, null, [], 'x']) {
    await assert.rejects(handleMe({ route: '/me/changes', body, user: USER, service: service(changesReply()) }),
      error => error instanceof MeError && error.status === 400 && error.message === 'Choose a season and week, or neither.', JSON.stringify(body));
  }
  for (const body of [{ season: 2026, week: 5 }, { userId: OTHER }]) {
    await assert.rejects(handleMe({ route: '/me/records', body, user: USER, service: service({}) }), error => error.status === 400, JSON.stringify(body));
  }
  await assert.rejects(handleMe({ route: '/me/changes', body: {}, user: { ...USER, is_anonymous: true }, service: service({}) }), error => error.status === 401);
});

test('refusal codes are mapped before the SQL raises them; a missing M-27 reads as History unavailable', async () => {
  assert.deepEqual([providerMeError('GTL_ME_PROFILE').status, providerMeError('GTL_ME_PROFILE').message], [403, 'Save your profile before opening History.']);
  assert.deepEqual([providerMeError('GTL_ME_INVALID').status, providerMeError('GTL_ME_INVALID').message], [400, 'Choose a season and week, or neither.']);
  const failing = error => ({ rpc: async () => { throw error; } });
  for (const route of ['/me/changes', '/me/records']) {
    // The adapter maps PostgREST's PGRST202 (function not found) to GTL_FEATURE_OFF.
    await assert.rejects(handleMe({ route, body: {}, user: USER, service: failing(providerMeError('GTL_FEATURE_OFF')) }),
      error => error instanceof MeError && error.status === 503 && error.message === 'History is not available yet. Your records are kept.', route);
    await assert.rejects(handleMe({ route, body: {}, user: USER, service: failing(providerMeError('GTL_ME_PROFILE')) }),
      error => error instanceof MeError && error.status === 403, route);
    await assert.rejects(handleMe({ route, body: {}, user: USER, service: failing(new Error('relation secret_table detail')) }),
      error => !(error instanceof MeError) && error.message === 'History is unavailable.', route);
  }
  // Preferences keep their own wording.
  await assert.rejects(handleMe({ route: '/me/preferences/save', body: { revision: 0, sportsbooks: [], guidanceCollapsed: false }, user: USER, service: {}, featureOff: new Set(['preferences']) }),
    error => error.message === 'Preferences are not available yet. Your saved choices are kept.');
});

test('a reply for another account, or of the wrong shape, never reaches the browser', async () => {
  await assert.rejects(handleMe({ route: '/me/changes', body: {}, user: USER, service: service({ ...changesReply(), ownerId: OTHER }) }), /Invalid history reply/);
  await assert.rejects(handleMe({ route: '/me/records', body: {}, user: USER, service: service({ ownerId: USER.id }) }), /Invalid history reply/);
  assert.throws(() => projectChanges({ ownerId: USER.id }, USER.id), /Invalid history reply/);
});

test('changes are rebuilt field by field: unknown types, kinds, games and fields are dropped', () => {
  const reply = projectChanges(changesReply(), USER.id);
  assert.deepEqual(reply.markets[0].games, [{ id: 'TB-DAL', awayCode: 'TB', homeCode: 'DAL', kickoff: '2026-10-09T00:15:00Z' }]);
  assert.deepEqual(reply.markets[0].changes, [{ type: 'guess_locked_in', at: '2026-10-08T20:00:00Z', late: null, ruled: null, games: [{ gameId: 'TB-DAL', kind: 'locked', before: -9.5, after: -9.5,
    reference: { status: 'available', basis: 'line_at_guess', value: -8.5, observedAt: '2026-10-08T19:59:00Z', source: 'The Odds API' }, beforeReference: null }] }]);
  assert.equal(reply.markets[0].pendingChanges, 1);
  const late = projectChanges(changesReply(), USER.id);
  assert.equal(late.markets[0].changes[0].late, null);
  const withLate = changesReply();
  withLate.markets[0].changes[0].late = { deadline: '2026-10-09T00:15:00Z', minutes: 12.9, extra: 1 };
  assert.deepEqual(projectChanges(withLate, USER.id).markets[0].changes[0].late, { deadline: '2026-10-09T00:15:00Z', minutes: 12 });
});

test('records: the Betting Challenge is graded by the old engine; private sections keep only their stored fields', () => {
  const slate = { season: 2026, week: 5, deadline: '2026-10-09T00:15:00Z', games: [{ id: 'TB-DAL', awayCode: 'TB', homeCode: 'DAL', kickoff: '2026-10-09T00:15:00Z' }, { id: 'SF-SEA', awayCode: 'SF', homeCode: 'SEA', kickoff: '2026-10-09T00:15:00Z' }],
    results: { 'TB-DAL': { status: 'final', home: 31, away: 21, origin: 'settlement', secret: 1 }, 'SF-SEA': { status: 'postponed', home: null, away: null }, 'NOT-ON': { status: 'final', home: 1, away: 0 } } };
  const raw = { ownerId: USER.id, now: '2026-10-26T20:00:00Z', member: true,
    challenge: { players: [{ userId: USER.id, displayName: 'You', removed: false }, { userId: OTHER, displayName: 'Removed Friend', removed: true }],
      selections: [
        { userId: USER.id, season: 2026, week: 5, gameId: 'TB-DAL', market: 'spread', side: 'home', line: -9.5, odds: -110, source: 'Book', practice: false, internal: 'x' },
        { userId: OTHER, season: 2026, week: 5, gameId: 'TB-DAL', market: 'total', side: 'under', line: 52, odds: -110 },
        { userId: OTHER, season: 2026, week: 5, gameId: 'SF-SEA', market: 'spread', side: 'away', line: 3.5, odds: -105 },
        { userId: 'stranger', season: 2026, week: 5, gameId: 'TB-DAL', market: 'spread', side: 'home', line: -1 },
      ], hidden: [{ userId: OTHER, season: 2026, week: 6, count: 2 }] },
    saved: [{ season: 2026, week: 5, gameId: 'TB-DAL', saved: false, note: 'kept', changes: [{ at: '2026-10-08T00:00:00Z', action: 'personal/note', before: null, after: { saved: false, notes: 'kept' } }] }],
    forecasts: [], journal: [{ id: '00000000-0000-4000-8000-0000000000aa', season: 2026, week: 5, gameId: 'TB-DAL', kind: 'research_note', market: 'spread', side: 'home', line: -9, odds: -110, archived: true, context: { quote: 1 } }],
    journalHidden: 2, forfeits: [{ season: 2026, week: 6, reason: 'reveal', modes: ['guess_spread', 'nope'], createdAt: '2026-10-15T00:00:00Z' }, { season: 2026, week: 7, reason: 'other' }],
    sitOuts: [], archives: [{ leagueId: 'sean-troy-luke', own: false, archivedCount: 3, games: [], snapshots: [{ id: 's1', total: 95.8, sourceUrl: 'http://not-https', games: { 'TB-DAL': { value: -8.5, originalPick: -9.5, points: 8 } } }] }],
    benchmarks: [], slates: [slate] };
  const reply = projectRecords(raw, USER.id);
  assert.deepEqual(reply.challenge.selections.map(s => [s.userId, s.gameId, s.final?.status ?? null, s.grade]),
    [[USER.id, 'TB-DAL', 'final', 'W'], [OTHER, 'TB-DAL', 'final', 'P'], [OTHER, 'SF-SEA', 'postponed', null]], 'a stranger\'s row is dropped; 31–21 covers −9.5; 52 is a push');
  assert.ok(!('internal' in reply.challenge.selections[0]));
  assert.deepEqual(reply.challenge.records, [{ userId: USER.id, W: 1, L: 0, P: 0, winRate: 100, selections: 1, ungraded: 0 }, { userId: OTHER, W: 0, L: 0, P: 1, winRate: null, selections: 2, ungraded: 1 }]);
  assert.deepEqual(reply.challenge.players[1], { userId: OTHER, displayName: 'Removed Friend', removed: true });
  assert.deepEqual(Object.keys(reply.slates[0].results), ['TB-DAL', 'SF-SEA'], 'results for games off the slate are dropped');
  assert.equal(reply.journal[0].archived, true);
  assert.ok(!('context' in reply.journal[0]), 'the journal record keeps its stored fields; the server context is not sent again');
  assert.deepEqual(reply.forfeits, [{ season: 2026, week: 6, reason: 'reveal', modes: ['guess_spread'], createdAt: '2026-10-15T00:00:00Z' }]);
  assert.deepEqual(reply.archives[0].snapshots[0], { id: 's1', source: null, sourceUrl: null, quotedAt: null, capturedAt: null, timeBasis: 'capture', total: null, games: { 'TB-DAL': { value: -8.5 } } },
    'another member never receives the commissioner seat\'s totals, picks or points, even if the SQL sent them');
  assert.equal(reply.journalHidden, 2);
});

// Stage 75 (M-28): POST /me/export. Contracts: the owner only, no fields; a missing M-28 reads "Export is not available yet";
// the reply passes whole only with every section in shape and the owner's id; a push device anywhere in it refuses the reply.
test('/me/export asks for the signed-in owner only and passes the owner\'s rows on whole', async () => {
  const { EXPORT_SECTIONS } = await import('../cloud/me-history.mjs');
  const reply = Object.fromEntries(EXPORT_SECTIONS.map(key => [key, ['profile', 'communityRemoval'].includes(key) ? null : []]));
  Object.assign(reply, { format: 'gtl-account-export-v1', ownerId: USER.id, exportedAt: '2026-10-26T20:00:00Z', profile: { displayName: 'You' },
    ballots: [{ season: 2026, week: 5, mode: 'guess_total', late: { minutes: 12 }, ballot: { picks: { 'TB-DAL': 44.5 } }, audit: [{ type: 'ballot_saved' }] }], unknownSection: [1] });
  const calls = [];
  const out = await handleMe({ route: '/me/export', body: {}, user: USER, service: service(reply, calls), clock: () => NOW });
  assert.deepEqual(calls, [['gtl_export_me', { p_user: USER.id, p_now: new Date(NOW).toISOString() }]]);
  assert.deepEqual(Object.keys(out), [...EXPORT_SECTIONS]);
  assert.deepEqual(out.ballots, reply.ballots, 'your own rows are never redacted (D-23)');
  for (const body of [{ userId: OTHER }, { season: 2026 }]) {
    await assert.rejects(handleMe({ route: '/me/export', body, user: USER, service: service(reply) }), error => error.status === 400, JSON.stringify(body));
  }
  await assert.rejects(handleMe({ route: '/me/export', body: {}, user: USER, service: service({ ...reply, ownerId: OTHER }) }), /Invalid history reply/);
  await assert.rejects(handleMe({ route: '/me/export', body: {}, user: USER, service: service({ ...reply, ballots: { not: 'a list' } }) }), /Invalid history reply/);
  await assert.rejects(handleMe({ route: '/me/export', body: {}, user: USER, service: service({ ...reply, posts: [{ payload: { endpoint: 'https://push.example/secret' } }] }) }),
    /Invalid history reply/, 'a push device never leaves the server, wherever it would sit');
  await assert.rejects(handleMe({ route: '/me/export', body: {}, user: USER, service: { rpc: async () => { throw providerMeError('GTL_FEATURE_OFF'); } } }),
    error => error instanceof MeError && error.status === 503 && error.message === 'Export is not available yet. Every record is kept.');
  await assert.rejects(handleMe({ route: '/me/export', body: {}, user: USER, service: { rpc: async () => { throw new Error('detail'); } } }),
    error => !(error instanceof MeError) && error.message === 'Export is unavailable.');
  assert.deepEqual(ME_METHODS['/me/export'], ['POST']);
});
