import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudHandler } from '../cloud/handler.mjs';
import { picksDue, providerCommunityError } from '../cloud/community.mjs';
import { NFLVERSE_SCHEDULE_URL } from '../shared/nfl-schedule.mjs';

const USER = '00000000-0000-4000-8000-000000000001';
const forbidden = new Proxy({}, { get: () => () => { throw new Error('Community routes must not touch league, ballot or lobby services.'); } });
const feed = { viewer: USER, admin: false, members: [{ id: USER, displayName: 'Ben' }], week: { season: 2026, week: 6, deadline: '2026-10-16T00:15:00Z', games: 14 },
  due: [{ mode: 'guess_spread', submitted: true, filled: 14, games: 14 }, { mode: 'guess_total', submitted: false, filled: 3, games: 14 }],
  submissions: [], posts: [{ id: '00000000-0000-4000-8000-000000000009', actorId: USER, kind: 'ballot_submitted', mode: 'guess_spread', createdAt: '2026-10-14T00:00:00Z', likes: 0, likedByMe: false, comments: [], picksHidden: true, picks: { 'SEA-DEN': -3 }, payload: {} }] };

function handler(calls) {
  return createCloudHandler({
    authenticate: async () => ({ id: USER, emailConfirmed: true, email: 'ben@example.invalid' }),
    storage: forbidden, weekly: forbidden, lobby: forbidden, social: forbidden,
    community: { rpc: async (name, args) => { calls.push([name, args]); return name === 'gtl_sit_out_week' ? { satOut: true, replayed: false } : feed; } },
    clock: () => Date.parse('2026-10-15T23:00:00Z'),
  });
}

test('community read is isolated from league services, passes request time and never leaks hidden picks', async () => {
  const calls = [];
  const response = await handler(calls)(new Request('https://fixture.invalid/community/read', { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: '{}' }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(calls[0][0], 'gtl_read_community');
  assert.equal(calls[0][1].p_now, '2026-10-15T23:00:00.000Z');
  assert.equal(body.posts[0].picks, null, 'hidden picks are stripped even if the provider returned them');
  assert.deepEqual(body.picksDue, { state: 'urgent', opensAt: '2026-10-12T07:00:00.000Z', deadline: '2026-10-16T00:15:00Z', week: 6, modes: [{ mode: 'guess_total', submitted: false, satOut: false, filled: 3, games: 14 }], now: '2026-10-15T23:00:00.000Z' });
  assert.deepEqual(body.optOuts, []);
  assert.deepEqual(body.members, [{ id: USER, displayName: 'Ben', removed: false }]);
});

test('redesign stage 2 push guard: /community/read says pushConfigured only with a valid VAPID public key and never carries the key', async () => {
  const KEY = `B${'Q'.repeat(86)}`;
  const read = async (pushPublicKey, body = {}) => {
    const app = createCloudHandler({
      authenticate: async () => ({ id: USER, emailConfirmed: true, email: 'ben@example.invalid' }),
      // The guard reads only the configured key: the push service itself is never called by a community read.
      storage: forbidden, weekly: forbidden, lobby: forbidden, social: forbidden, push: forbidden, pushPublicKey,
      community: { rpc: async () => feed },
      clock: () => Date.parse('2026-10-15T23:00:00Z'),
    });
    const response = await app(new Request('https://fixture.invalid/community/read', { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    assert.equal(response.status, 200);
    return response.text();
  };
  for (const body of [{}, { limit: 1 }, { before: '2026-10-14T00:00:00Z' }]) {
    const on = await read(KEY, body);
    assert.equal(JSON.parse(on).pushConfigured, true, JSON.stringify(body));
    assert.equal(on.includes(KEY), false, 'the VAPID key is never in a community reply');
    assert.doesNotMatch(on, /publicKey|vapid/i);
  }
  // Missing, empty, malformed, the wrong length or prefix, padded, a private-key-sized value or a non-string: false.
  for (const key of [undefined, null, '', 'not-a-key', KEY.slice(1), `${KEY}=`, `${KEY}Q`, `A${'Q'.repeat(86)}`, `B${'Q'.repeat(85)}+`, 'Q'.repeat(43), 42, { key: KEY }]) {
    const off = await read(key);
    assert.equal(JSON.parse(off).pushConfigured, false, JSON.stringify(key) ?? 'undefined');
    assert.equal(off.includes(KEY), false);
  }
});

test('D-23 sit-out route validates strictly, passes the request time and returns the final opt-out', async () => {
  const calls = [];
  const send = (body, auth = 'Bearer token') => handler(calls)(new Request('https://fixture.invalid/community/sit-out', { method: 'POST', headers: { ...(auth ? { authorization: auth } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  for (const body of [{}, { season: 2026, week: 6 }, { season: 2026, week: 6, mode: 'betting_challenge' }, { season: '2026', week: 6, mode: 'guess_total' }, { season: 2026, week: 0, mode: 'guess_total' },
    { season: 2026, week: 6, mode: 'guess_total', userId: USER }]) assert.equal((await send(body)).status, 400, JSON.stringify(body));
  assert.equal((await send({ season: 2026, week: 6, mode: 'guess_total' }, null)).status, 401);
  assert.equal(calls.length, 0, 'invalid requests never reach the database');
  const response = await send({ season: 2026, week: 6, mode: 'guess_total' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { season: 2026, week: 6, mode: 'guess_total', satOut: true, replayed: false });
  assert.deepEqual(calls, [['gtl_sit_out_week', { p_user: USER, p_season: 2026, p_week: 6, p_mode: 'guess_total', p_now: '2026-10-15T23:00:00.000Z' }]]);
});

test('community routes reject unknown fields and unauthenticated requests', async () => {
  const send = (path, body, auth = 'Bearer token') => handler([])(new Request(`https://fixture.invalid${path}`, { method: 'POST', headers: { ...(auth ? { authorization: auth } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  assert.equal((await send('/community/read', { extra: 1 })).status, 400);
  assert.equal((await send('/community/like', { postId: 'nope', like: true })).status, 400);
  assert.equal((await send('/community/read', {}, null)).status, 401);
});

test('picks-due states', () => {
  const at = iso => Date.parse(iso);
  assert.equal(picksDue({ week: null }, 0).state, 'none');
  assert.equal(picksDue({ ...feed, due: feed.due.map(d => ({ ...d, submitted: true })) }, 0).state, 'done');
  assert.equal(picksDue(feed, at('2026-10-14T00:00:00Z')).state, 'due');
  assert.equal(picksDue(feed, at('2026-10-16T00:15:00Z')).state, 'closed');
  const satOut = { ...feed, due: feed.due.map(d => (d.mode === 'guess_total' ? { ...d, satOut: true } : d)) };
  assert.equal(picksDue(satOut, at('2026-10-14T00:00:00Z')).state, 'done', 'a sat-out mode is never due');
  const both = { ...feed, due: feed.due.map(d => ({ ...d, submitted: false, satOut: d.mode === 'guess_total' })) };
  assert.deepEqual(picksDue(both, at('2026-10-14T00:00:00Z')).modes.map(d => d.mode), ['guess_spread']);
  // D-24: not due before Monday 00:00 PT of game week; the open time is reported for the notice.
  const early = picksDue(feed, at('2026-10-12T06:59:59Z'));
  assert.deepEqual([early.state, early.opensAt, early.week, early.modes.length], ['not_open', '2026-10-12T07:00:00.000Z', 6, 1]);
  assert.equal(picksDue(feed, at('2026-10-12T07:00:00Z')).state, 'due');
  assert.equal(picksDue({ ...feed, week: { ...feed.week, deadline: '2026-12-11T01:15:00Z' } }, at('2026-12-07T07:30:00Z')).state, 'not_open', 'PST: Monday 00:00 PT is 08:00 UTC');
  assert.equal(picksDue({ ...feed, week: { ...feed.week, deadline: '2026-12-11T01:15:00Z' } }, at('2026-12-07T08:00:00Z')).state, 'due');
});

test('commissioner week-open status route is validated and never passes a token', async () => {
  const calls = [];
  const status = { configured: true, enabled: true, season: 2026, utcCrons: ['0 7 * * 1', '0 8 * * 1'], lastRunAt: '2026-10-12T07:00:01Z', lastStatus: 'succeeded', lastReason: null, currentWeek: { season: 2026, week: 6, openAt: '2026-10-12T07:00:00+00:00', deadline: '2026-10-16T00:15:00+00:00' }, capability_hash: 'x' };
  const app = createCloudHandler({ authenticate: async () => ({ id: USER, emailConfirmed: true, email: 'ben@example.invalid' }), storage: forbidden, weekly: forbidden, lobby: forbidden, social: forbidden,
    community: { rpc: async (name, args) => { calls.push([name, args]); return status; } } });
  const send = body => app(new Request('https://fixture.invalid/community/week-open', { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const response = await send({});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(calls, [['gtl_read_week_open_schedule', { p_user: USER }]]);
  assert.deepEqual(body, { configured: true, enabled: true, season: 2026, timeZone: 'America/Los_Angeles', localTime: '00:00', weekday: 'Monday', utcCrons: ['0 7 * * 1', '0 8 * * 1'],
    lastRunAt: '2026-10-12T07:00:01Z', lastFinishedAt: null, lastStatus: 'succeeded', lastReason: null, currentWeek: { season: 2026, week: 6, openAt: '2026-10-12T07:00:00+00:00', deadline: '2026-10-16T00:15:00+00:00' } });
  assert.equal((await send({ extra: 1 })).status, 400);
});

test('commissioner publish routes build the slate from the schedule source; preview writes nothing, republish reports published:false and a conflicting slate fails closed', async () => {
  const csv = 'game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score,location\n'
    + '2026_06_SEA_DEN,2026,REG,6,2026-10-15,Thursday,20:15,SEA,,DEN,,Home\n2026_06_HOU_JAX,2026,REG,6,2026-10-18,Sunday,09:30,HOU,,JAX,,Neutral';
  const calls = [], control = { admin: true, published: true, conflict: false };
  const app = createCloudHandler({
    authenticate: async () => ({ id: USER, emailConfirmed: true, email: 'ben@example.invalid' }),
    storage: forbidden, weekly: forbidden, lobby: forbidden, social: forbidden,
    community: { schedule: async () => csv, rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === 'gtl_community_admin') return control.admin;
      if (control.conflict) throw providerCommunityError('GTL_SLATE_CONFLICT');
      return { season: 2026, week: 6, games: 2, published: control.published };
    } },
  });
  const send = (route, body) => app(new Request(`https://fixture.invalid/community/${route}`, { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const preview = await send('publish-preview', { season: 2026, week: 6 });
  assert.equal(preview.status, 200);
  const slate = await preview.json();
  assert.deepEqual(slate.games.map(g => [g.id, g.matchup, g.kickoff, g.neutral]), [['SEA-DEN', 'Seattle Seahawks @ Denver Broncos', '2026-10-16T00:15:00.000Z', false], ['HOU-JAX', 'Houston Texans @ Jacksonville Jaguars', '2026-10-18T13:30:00.000Z', true]]);
  assert.deepEqual([slate.season, slate.week, slate.deadline, slate.source], [2026, 6, '2026-10-16T00:15:00.000Z', NFLVERSE_SCHEDULE_URL]);
  assert.deepEqual(calls.map(c => c[0]), ['gtl_community_admin'], 'a preview never reaches gtl_publish_week');
  const first = await send('publish', { season: 2026, week: 6 });
  assert.equal(first.status, 200);
  assert.equal((await first.json()).published, true);
  const [, args] = calls.find(c => c[0] === 'gtl_publish_week');
  assert.deepEqual(Object.keys(args), ['p_user', 'p_season', 'p_week', 'p_games', 'p_deadline', 'p_source']);
  assert.deepEqual([args.p_user, args.p_season, args.p_week, args.p_deadline, args.p_source], [USER, 2026, 6, '2026-10-16T00:15:00.000Z', NFLVERSE_SCHEDULE_URL]);
  assert.deepEqual(args.p_games.map(g => Object.keys(g).sort()), Array(2).fill(['away', 'awayCode', 'home', 'homeCode', 'id', 'kickoff', 'matchup']), 'the neutral flag stays out of the stored slate');
  control.published = false;
  assert.deepEqual(await (await send('publish', { season: 2026, week: 6 })).json(), { ...slate, published: false }, 'an identical republish is reported as a no-op');
  control.conflict = true;
  const conflict = await send('publish', { season: 2026, week: 6 });
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: 'A different schedule is already published for that week. Nothing was changed.' });
  control.conflict = false; control.admin = false;
  for (const route of ['publish-preview', 'publish']) assert.equal((await send(route, { season: 2026, week: 6 })).status, 403, `${route} is commissioner-only`);
  control.admin = true;
  const missing = await send('publish-preview', { season: 2026, week: 7 });
  assert.equal(missing.status, 422);
  assert.match((await missing.json()).error, /^The public schedule could not be used: No 2026 Week 7/);
  for (const body of [{}, { season: 2026 }, { season: 2026, week: 0 }, { season: '2026', week: 6 }, { season: 2026, week: 6, extra: 1 }]) assert.equal((await send('publish', body)).status, 400, JSON.stringify(body));
  assert.equal(calls.filter(c => c[0] === 'gtl_publish_week').length, 3, 'only the three publish attempts reached the database');
});

test('community interest route validates strictly and normalizes interests (D-22)', async () => {
  const calls = [];
  const app = createCloudHandler({
    authenticate: async () => ({ id: USER, emailConfirmed: true, email: 'ben@example.invalid' }),
    storage: forbidden, weekly: forbidden, lobby: forbidden, social: forbidden,
    community: { rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === 'gtl_set_league_interest') return { league: args.p_league, notify: args.p_notify, count: 4 };
      return { ...feed, interests: ['nhl', 'nfl', 'nba', 7], interestCounts: { nba: 2, nhl: '1', nfl: 9, mlb: -3 } };
    } },
    clock: () => Date.parse('2026-10-15T23:00:00Z'),
  });
  const send = (path, body, auth = 'Bearer token') => app(new Request(`https://fixture.invalid${path}`, { method: 'POST', headers: { ...(auth ? { authorization: auth } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  for (const body of [{}, { league: 'nba' }, { notify: true }, { league: 'nfl', notify: true }, { league: 'NBA', notify: true }, { league: 'nba', notify: 1 }, { league: 'nba', notify: true, extra: 1 }, ['nba', true]]) {
    assert.equal((await send('/community/interest', body)).status, 400, JSON.stringify(body));
  }
  assert.equal(calls.length, 0, 'invalid bodies never reach the database');
  assert.equal((await send('/community/interest', { league: 'nba', notify: true }, null)).status, 401);
  const ok = await send('/community/interest', { league: 'cbb', notify: true });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { league: 'cbb', notify: true, count: 4 });
  assert.deepEqual(calls.at(-1), ['gtl_set_league_interest', { p_user: USER, p_league: 'cbb', p_notify: true }]);
  const read = await (await send('/community/read', {})).json();
  assert.deepEqual(read.interests, ['nba', 'nhl'], 'unknown and live leagues are dropped');
  assert.deepEqual(read.interestCounts, { nba: 2, mlb: 0, nhl: 1, cfb: 0, cbb: 0 });
});

test('community history route validates strictly, passes request time, keeps the shape strict and never leaks a hidden ballot or another member\'s own-only fields', async () => {
  const OTHER = '00000000-0000-4000-8000-000000000002';
  const raw = { viewer: USER, season: 2026, now: '2026-10-15T23:00:00+00:00', seasons: [2026, 'x'], members: [{ id: USER, displayName: 'Ben' }, { id: OTHER, displayName: 'Troy', removed: true }],
    weeks: [{ season: 2026, week: 6, deadline: '2026-10-16T00:15:00+00:00', closed: false,
      games: [{ id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', away: 'Seattle Seahawks', home: 'Denver Broncos', kickoff: '2026-10-16T00:15:00+00:00' }],
      results: { 'SEA-DEN': { status: 'final', home: 27, away: 24, source: 'nflverse games.csv', observedAt: '2026-10-16T04:00:00+00:00', settledAt: '2026-10-16T04:01:00+00:00', origin: 'settlement' }, 'X-Y': { status: 'weird', home: 1, away: 2 } },
      revealed: { guess_spread: true, guess_total: false },
      entries: [
        { userId: OTHER, mode: 'guess_total', status: 'submitted', submittedAt: '2026-10-14T00:00:00+00:00', updatedAt: '2026-10-14T01:00:00+00:00', revisions: 2, provenance: 'solo', scoringPolicy: 'submission-time', picksHidden: true,
          picks: [{ gameId: 'SEA-DEN', guess: 44, reference: { basis: 'saved', status: 'available', value: 44.5 }, points: 9, scorable: true }], weekPoints: 9, weekScored: 1, games: 1 },
        { userId: OTHER, mode: 'guess_spread', status: 'submitted', submittedAt: '2026-10-14T00:00:00+00:00', updatedAt: '2026-10-14T00:00:00+00:00', revisions: 1, provenance: 'migrated-league', scoringPolicy: null, ruling: null, picksHidden: false,
          picks: [{ gameId: 'SEA-DEN', guess: -3, reference: { basis: 'nearest-snapshot', label: 'nearest snapshot at submission', status: 'informational', value: -3.5, source: 'The Odds API · 3-book median', sourceUrl: 'http://insecure.example/', snapshotId: OTHER, observedAt: '2026-10-13T23:50:00+00:00', gapSeconds: 600 }, points: null, scorable: false }],
          weekPoints: 0, weekScored: 0, games: 1 },
        { userId: USER, mode: 'guess_spread', status: 'sat_out', satOutAt: '2026-10-13T00:00:00+00:00', picksHidden: false, picks: null, weekPoints: 0, weekScored: 0, games: 1 },
        { userId: USER, mode: 'guess_total', status: 'draft', submittedAt: null, updatedAt: '2026-10-15T22:00:00+00:00', revisions: 3, provenance: 'group', scoringPolicy: null, ruling: null, picksHidden: false,
          picks: [{ gameId: 'SEA-DEN', guess: 41, reference: null, points: null, scorable: false }], weekPoints: 0, weekScored: 0, games: 1 },
        { userId: OTHER, mode: 'betting_challenge', status: 'submitted', picksHidden: false, picks: [] },
        { userId: OTHER, mode: 'guess_total', status: 'pending', picksHidden: false, picks: [] },
      ] }] };
  const calls = [];
  const app = createCloudHandler({
    authenticate: async () => ({ id: USER, emailConfirmed: true, email: 'ben@example.invalid' }),
    storage: forbidden, weekly: forbidden, lobby: forbidden, social: forbidden,
    community: { rpc: async (name, args) => { calls.push([name, args]); return raw; } },
    clock: () => Date.parse('2026-10-15T23:00:00Z'),
  });
  const send = (body, auth = 'Bearer token') => app(new Request('https://fixture.invalid/community/history', { method: 'POST', headers: { ...(auth ? { authorization: auth } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  for (const body of [{ week: 5 }, { season: '2026' }, { season: 1999 }, { season: 2026.5 }, { season: 2026, extra: 1 }, [2026]]) assert.equal((await send(body)).status, 400, JSON.stringify(body));
  assert.equal((await send({}, null)).status, 401);
  assert.equal(calls.length, 0, 'invalid requests never reach the database');
  const response = await send({});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(calls, [['gtl_read_community_history', { p_user: USER, p_season: null, p_now: '2026-10-15T23:00:00.000Z' }]]);
  assert.deepEqual([body.viewer, body.season, body.seasons, body.now], [USER, 2026, [2026], '2026-10-15T23:00:00+00:00']);
  assert.deepEqual(body.members, [{ id: USER, displayName: 'Ben', removed: false }, { id: OTHER, displayName: 'Troy', removed: true }]);
  const [week] = body.weeks;
  assert.deepEqual([week.season, week.week, week.deadline, week.closed, week.revealed, week.games], [2026, 6, '2026-10-16T00:15:00+00:00', false, { guess_spread: true, guess_total: false }, raw.weeks[0].games]);
  assert.deepEqual(week.results, { 'SEA-DEN': { status: 'final', home: 27, away: 24, source: 'nflverse games.csv', observedAt: '2026-10-16T04:00:00+00:00', settledAt: '2026-10-16T04:01:00+00:00', origin: 'settlement' } }, 'an unknown result status is dropped');
  assert.deepEqual(week.entries.map(e => [e.userId, e.mode, e.status]), [[OTHER, 'guess_total', 'submitted'], [OTHER, 'guess_spread', 'submitted'], [USER, 'guess_spread', 'sat_out'], [USER, 'guess_total', 'draft']], 'unknown modes and statuses are dropped');
  const [hidden, revealed, satOut, draft] = week.entries;
  assert.deepEqual([hidden.picksHidden, hidden.picks, hidden.weekPoints, hidden.weekScored, hidden.submittedAt, hidden.scoringPolicy, hidden.ruling], [true, null, 9, 1, '2026-10-14T00:00:00+00:00', 'submission-time', null], 'hidden picks are stripped even if the provider returned them');
  assert.ok(!JSON.stringify(hidden).includes('44'), 'no guess, line or per-pick points for a hidden ballot');
  // The last change, the revision count and the provenance come from the private audit and provenance columns: the viewer's own only, hidden or revealed.
  assert.deepEqual([hidden.updatedAt, hidden.revisions, hidden.provenance, revealed.updatedAt, revealed.revisions, revealed.provenance], [null, null, null, null, null, null], 'another member\'s own-only fields are stripped even if the provider returned them');
  assert.ok(!JSON.stringify([hidden, revealed]).includes('solo') && !JSON.stringify([hidden, revealed]).includes('2026-10-14T01'), 'no provenance or change time of another member');
  assert.deepEqual([draft.status, draft.submittedAt, draft.updatedAt, draft.revisions, draft.provenance, draft.picksHidden, draft.picks], ['draft', null, '2026-10-15T22:00:00+00:00', 3, 'group', false, [{ gameId: 'SEA-DEN', guess: 41, reference: null, points: null, scorable: false, hidden: false }]], 'the viewer\'s own fields pass through');
  assert.deepEqual(revealed.picks, [{ gameId: 'SEA-DEN', guess: -3, points: null, scorable: false, reference: { basis: 'nearest-snapshot', label: 'nearest snapshot at submission', status: 'informational', value: -3.5, source: 'The Odds API · 3-book median',
    sourceUrl: null, snapshotId: OTHER, capturedAt: null, observedAt: '2026-10-13T23:50:00+00:00', savedAt: null, decision: null, reason: null, gapSeconds: 600, detail: null, priorSnapshotAt: null, nextSnapshotAt: null,
    rule: null, origin: null, sourceFile: null, fileSha256: null, bookCount: null, guessedAt: null, guessedAtKnown: null }, hidden: false }], 'a non-https source link is dropped; an informational line never carries points');
  assert.deepEqual([revealed.submittedAtKnown, revealed.eligible, revealed.eligibility], [true, true, 'standard'], 'absent fields read as a known submission time and a standard ballot');
  assert.deepEqual([satOut.status, satOut.satOutAt, satOut.picks, satOut.weekPoints], ['sat_out', '2026-10-13T00:00:00+00:00', null, 0]);
  await send({ season: 2026 });
  assert.equal(calls.at(-1)[1].p_season, 2026);
  assert.equal((await send({ season: 2026, week: 6 })).status, 400);
});

test('community history passes the line at the guess through a whitelist and never scores an ineligible ballot, whatever the provider returned', async () => {
  const OTHER = '00000000-0000-4000-8000-000000000002', THIRD = '00000000-0000-4000-8000-000000000003';
  const game = { id: 'TB-DAL', awayCode: 'TB', homeCode: 'DAL', away: 'Tampa Bay Buccaneers', home: 'Dallas Cowboys', kickoff: '2026-10-09T00:15:00+00:00' };
  const imported = { basis: 'line-at-guess', label: 'line at guess', rule: 'newest-at-or-before', origin: 'imported-reference', status: 'available', value: -8.5, source: 'eDraft consensus',
    sourceUrl: 'https://edraft.com/nfl/odds/week-5', bookCount: null, snapshotId: null, sourceFile: 'data/snapshots/2026-week-05-20261008T150212589Z.json',
    fileSha256: 'e9ebad5d805cccc732848886d843014dd3dcdb782e6656dadeb0b965c5876b69', decision: 'D-99', capturedAt: '2026-10-08T15:02:12.589+00:00', observedAt: '2026-10-08T14:03:00+00:00',
    guessedAt: '2026-10-08T18:43:07.147792+00:00', guessedAtKnown: true, gapSeconds: 16807 };
  const hosted = { ...imported, rule: 'first-after-submission', origin: 'hosted-snapshot', value: -9, source: 'The Odds API · 3-book median', sourceUrl: 'https://the-odds-api.com/', bookCount: 3,
    snapshotId: '168c62b9-2834-41f3-82b1-8e28ff29db58', sourceFile: null, fileSha256: null, decision: null, gapSeconds: -1859 };
  const raw = { viewer: USER, season: 2026, now: '2026-10-13T01:00:00+00:00', seasons: [2026], members: [{ id: USER, displayName: 'Ben' }, { id: OTHER, displayName: 'Sthomas' }, { id: THIRD, displayName: 'Luke' }],
    weeks: [{ season: 2026, week: 5, deadline: '2026-10-09T00:15:00+00:00', closed: true, games: [game], results: {}, revealed: { guess_spread: true, guess_total: true }, entries: [
      { userId: OTHER, mode: 'guess_spread', status: 'submitted', submittedAt: '2026-10-08T18:43:07.147792+00:00', eligible: true, eligibility: 'ruled-eligible', picksHidden: false,
        picks: [{ gameId: 'TB-DAL', guess: -3, reference: imported, points: 0, scorable: true }], weekPoints: 0, weekScored: 1, games: 1 },
      { userId: OTHER, mode: 'guess_total', status: 'submitted', submittedAt: '2026-10-08T21:48:40.61355+00:00', eligible: true, eligibility: 'bogus', picksHidden: false,
        picks: [{ gameId: 'TB-DAL', guess: 45, reference: { ...hosted, rule: 'made-up', origin: 'elsewhere', sourceFile: '../../etc/passwd', fileSha256: 'XYZ', bookCount: '3', guessedAtKnown: 'false' }, points: 3, scorable: true }], weekPoints: 3, weekScored: 1, games: 1 },
      { userId: THIRD, mode: 'guess_spread', status: 'submitted', submittedAt: '2026-10-08T22:00:00+00:00', eligible: false, eligibility: 'practice', picksHidden: false,
        picks: [{ gameId: 'TB-DAL', guess: -1, reference: hosted, points: 6, scorable: true }], weekPoints: 6, weekScored: 1, games: 1 },
      { userId: THIRD, mode: 'guess_total', status: 'submitted', submittedAt: '2026-10-08T22:05:00+00:00', eligible: false, eligibility: 'ruled-ineligible', picksHidden: true,
        picks: [{ gameId: 'TB-DAL', guess: 41, reference: hosted, points: 6, scorable: true }], weekPoints: 6, weekScored: 1, games: 1 },
      // A ballot without its original submission time: compared at its stored submittedAt, labelled guessedAtKnown false.
      { userId: USER, mode: 'guess_spread', status: 'submitted', submittedAt: '2026-10-08T07:33:00+00:00', submittedAtKnown: false, eligible: true, eligibility: 'ruled-eligible', picksHidden: false,
        picks: [{ gameId: 'TB-DAL', guess: -9.5, reference: { ...hosted, guessedAt: '2026-10-08T07:33:00+00:00', guessedAtKnown: false, gapSeconds: -42066 }, points: 9, scorable: true },
          { gameId: 'PHI-JAX', guess: -3.5, reference: { basis: 'none', label: 'submission time unavailable', status: 'unavailable', value: null, reason: 'submission-time-unavailable', guessedAt: null, guessedAtKnown: false }, points: null, scorable: false }],
        weekPoints: 9, weekScored: 1, games: 1 },
    ] }] };
  const app = createCloudHandler({
    authenticate: async () => ({ id: USER, emailConfirmed: true, email: 'ben@example.invalid' }),
    storage: forbidden, weekly: forbidden, lobby: forbidden, social: forbidden,
    community: { rpc: async () => raw },
    clock: () => Date.parse('2026-10-13T01:00:00Z'),
  });
  const response = await app(new Request('https://fixture.invalid/community/history', { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: '{}' }));
  assert.equal(response.status, 200);
  const [steven, stevenTotal, practice, ineligible, own] = (await response.json()).weeks[0].entries;
  assert.deepEqual([steven.eligible, steven.eligibility, steven.weekScored, steven.picks[0].points, steven.picks[0].scorable], [true, 'ruled-eligible', 1, 0, true], 'zero points is a score');
  assert.deepEqual(steven.picks[0].reference, { basis: 'line-at-guess', label: 'line at guess', status: 'available', value: -8.5, source: 'eDraft consensus', sourceUrl: 'https://edraft.com/nfl/odds/week-5',
    snapshotId: null, capturedAt: '2026-10-08T15:02:12.589+00:00', observedAt: '2026-10-08T14:03:00+00:00', savedAt: null, decision: 'D-99', reason: null, gapSeconds: 16807, detail: null,
    priorSnapshotAt: null, nextSnapshotAt: null, rule: 'newest-at-or-before', origin: 'imported-reference', sourceFile: 'data/snapshots/2026-week-05-20261008T150212589Z.json',
    fileSha256: 'e9ebad5d805cccc732848886d843014dd3dcdb782e6656dadeb0b965c5876b69', bookCount: null, guessedAt: '2026-10-08T18:43:07.147792+00:00', guessedAtKnown: true });
  const odd = stevenTotal.picks[0].reference;
  assert.deepEqual([stevenTotal.eligibility, odd.rule, odd.origin, odd.sourceFile, odd.fileSha256, odd.bookCount, odd.guessedAtKnown, odd.gapSeconds, stevenTotal.picks[0].points], ['standard', null, null, null, null, null, null, -1859, 3], 'unknown labels, paths, hashes and flags are dropped; a negative gap (first line after) passes');
  assert.deepEqual([practice.eligible, practice.eligibility, practice.weekPoints, practice.weekScored, practice.picks[0].points, practice.picks[0].scorable, practice.picks[0].guess, practice.picks[0].reference.value],
    [false, 'practice', 0, 0, null, false, -1, -9], 'an ineligible ballot shows its guess and line and never a point');
  assert.deepEqual([ineligible.eligibility, ineligible.picks, ineligible.weekPoints, ineligible.weekScored], ['ruled-ineligible', null, 0, 0], 'hidden picks still carry no numbers');
  assert.deepEqual([own.submittedAtKnown, own.weekPoints, own.weekScored, own.picks[0].reference.basis, own.picks[0].reference.guessedAt, own.picks[0].reference.guessedAtKnown, own.picks[0].reference.gapSeconds, own.picks[0].points],
    [false, 9, 1, 'line-at-guess', '2026-10-08T07:33:00+00:00', false, -42066, 9], 'the line at the stored submission time passes, labelled');
  assert.deepEqual([own.picks[1].reference.basis, own.picks[1].reference.reason, own.picks[1].reference.guessedAt, own.picks[1].reference.guessedAtKnown, own.picks[1].points], ['none', 'submission-time-unavailable', null, false, null], 'an unreadable stored time has no line');
});

// Redesign stage 17 (D-39, D-31, D-23; DP-1): /community/read and /community/history read both shapes. The provider before M-01
// hides a whole post or entry (picksHidden, no hiddenGames) and sends numbers for every standing; M-01 opens picks game by game,
// names the withheld games, and sends null points for no ballot. The handler is the second gate either way.
test('stage 17: the board keeps null for no ballot (DP-1), and a post passes its open games only, whatever the provider returned', async () => {
  const A = '00000000-0000-4000-8000-0000000000a1', B = '00000000-0000-4000-8000-0000000000b2', POST = '00000000-0000-4000-8000-0000000000c3';
  const base = { id: POST, actorId: A, kind: 'ballot_submitted', season: 2026, week: 6, mode: 'guess_spread', createdAt: '2026-10-14T00:00:00Z', likes: 0, likedByMe: false, comments: [], payload: {} };
  const reply = async (posts, standings = [], submissions = []) => {
    const app = createCloudHandler({
      authenticate: async () => ({ id: USER, emailConfirmed: true, email: 'ben@example.invalid' }),
      storage: forbidden, weekly: forbidden, lobby: forbidden, social: forbidden,
      community: { rpc: async () => ({ ...feed, members: [{ id: USER, displayName: 'Ben' }, { id: A, displayName: 'A' }, { id: B, displayName: 'B' }], posts, standings, submissions }) },
      clock: () => Date.parse('2026-10-15T23:00:00Z'),
    });
    const response = await app(new Request('https://fixture.invalid/community/read', { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: '{}' }));
    assert.equal(response.status, 200);
    return response.json();
  };
  // DP-1: null stays null (M-01: no submitted ballot that week or season, a sit-out included); the old shape's numbers pass.
  const board = await reply([], [
    { userId: A, mode: 'guess_spread', weekPoints: null, weekScored: 0, seasonPoints: null, seasonScored: 0, weeksSubmitted: 0, satOut: true },
    { userId: B, mode: 'guess_spread', weekPoints: 0, weekScored: 0, seasonPoints: 12.5, seasonScored: 2, weeksSubmitted: 1, satOut: false },
    { userId: B, mode: 'guess_total', weekPoints: '7.25', weekScored: 1, seasonPoints: 'x', seasonScored: 1, weeksSubmitted: 1, satOut: false },
  ], [{ userId: A, mode: 'guess_total', submittedAt: '2026-10-14T00:00:00Z', satOut: false, late: { deadline: '2026-10-16T00:15:00Z', minutes: 12, extra: 'never shown' } },
    { userId: B, mode: 'guess_total', submittedAt: null, satOut: true, late: { minutes: 3 } }]);
  assert.deepEqual(board.standings.map(s => [s.userId, s.mode, s.weekPoints, s.seasonPoints, s.satOut]),
    [[A, 'guess_spread', null, null, true], [B, 'guess_spread', 0, 12.5, false], [B, 'guess_total', 7.25, null, false]], 'null is never read as 0; a number stays a number');
  assert.deepEqual(board.submissions.map(s => s.late), [{ deadline: '2026-10-16T00:15:00Z', minutes: 12 }, null], 'the Late marker carries its two keys only; a sit-out has none');

  const posts = await reply([
    // M-01, partly open: one game shown, two withheld; the provider wrongly also sent a withheld game's number.
    { ...base, picksHidden: true, picks: { 'SEA-DEN': -3.5, 'HOU-JAX': 7.5 }, hiddenGames: ['HOU-JAX', 'KC-LV'], late: { deadline: '2026-10-16T00:15:00Z', minutes: 12 } },
    // M-01, every game withheld.
    { ...base, id: '00000000-0000-4000-8000-0000000000c4', picksHidden: true, picks: null, hiddenGames: ['SEA-DEN', 'HOU-JAX'], late: null },
    // Before M-01: a hidden post names no game; nothing passes, whatever the provider sent.
    { ...base, id: '00000000-0000-4000-8000-0000000000c5', picksHidden: true, picks: { 'SEA-DEN': -2.5 } },
    // Hidden but naming nothing (inconsistent): nothing passes.
    { ...base, id: '00000000-0000-4000-8000-0000000000c6', picksHidden: true, picks: { 'SEA-DEN': -2.5 }, hiddenGames: [] },
    // Open, but a withheld game named anyway (inconsistent): that game never passes, and the post says it is not whole.
    { ...base, id: '00000000-0000-4000-8000-0000000000c7', picksHidden: false, picks: { 'SEA-DEN': -1.5, 'HOU-JAX': 9.5 }, hiddenGames: ['HOU-JAX'] },
    // Fully open, old and new shape alike; junk keys and values never pass.
    { ...base, id: '00000000-0000-4000-8000-0000000000c8', picksHidden: false, picks: { 'SEA-DEN': -4.5, '../x': 1, 'KC-LV': 'nope' }, hiddenGames: [] },
    { ...base, id: '00000000-0000-4000-8000-0000000000c9', picksHidden: false, picks: { 'SEA-DEN': 0 } },
  ]);
  const shape = p => [p.picksHidden, p.picks, p.hiddenGames, p.late];
  assert.deepEqual(posts.posts.map(shape), [
    [true, { 'SEA-DEN': -3.5 }, ['HOU-JAX', 'KC-LV'], { deadline: '2026-10-16T00:15:00Z', minutes: 12 }],
    [true, null, ['HOU-JAX', 'SEA-DEN'], null],
    [true, null, null, null],
    [true, null, null, null],
    [true, { 'SEA-DEN': -1.5 }, ['HOU-JAX'], null],
    [false, { 'SEA-DEN': -4.5 }, [], null],
    [false, { 'SEA-DEN': 0 }, [], null],
  ]);
  const text = JSON.stringify(posts.posts);
  for (const secret of ['7.5', '-2.5', '9.5', 'nope', '../x']) assert.equal(text.includes(secret), false, `${secret} never passes`);
});

test('stage 17: History passes another member\'s open rows and withholds the rest, row by row; the viewer\'s own rows are never withheld', async () => {
  const OTHER = '00000000-0000-4000-8000-000000000002';
  const row = (gameId, guess, extra = {}) => ({ gameId, guess, reference: { basis: 'saved', status: 'available', value: guess - 1 }, points: 8, scorable: true, ...extra });
  const entries = [
    // M-01, partly open: one row shown; the other withheld, though the provider sent its numbers.
    { userId: OTHER, mode: 'guess_spread', status: 'submitted', submittedAt: '2026-10-14T00:00:00+00:00', picksHidden: true, hiddenGames: ['HOU-JAX'],
      picks: [row('SEA-DEN', -3.5), row('HOU-JAX', 6.5, { hidden: true })], weekPoints: 8, weekScored: 1, games: 2, late: { deadline: '2026-10-16T00:15:00Z', minutes: 75 } },
    // M-01, a row marked hidden but not named in hiddenGames still carries no number.
    { userId: OTHER, mode: 'guess_total', status: 'submitted', submittedAt: '2026-10-14T00:00:00+00:00', picksHidden: false, hiddenGames: [],
      picks: [row('SEA-DEN', 44.5), row('HOU-JAX', 51.5, { hidden: true })], weekPoints: 8, weekScored: 1, games: 2 },
    // The viewer's own draft: never withheld; M-01 sends null points for a draft.
    { userId: USER, mode: 'guess_spread', status: 'draft', submittedAt: null, picksHidden: false, hiddenGames: [], picks: [row('SEA-DEN', -2.5, { reference: null, points: null, scorable: false })], weekPoints: null, weekScored: 0, games: 2 },
    // A sit-out: null points (M-01), never 0.
    { userId: USER, mode: 'guess_total', status: 'sat_out', satOutAt: '2026-10-13T00:00:00+00:00', picksHidden: false, hiddenGames: [], picks: null, weekPoints: null, weekScored: 0, games: 2, late: { minutes: 5 } },
  ];
  const app = createCloudHandler({
    authenticate: async () => ({ id: USER, emailConfirmed: true, email: 'ben@example.invalid' }),
    storage: forbidden, weekly: forbidden, lobby: forbidden, social: forbidden,
    community: { rpc: async () => ({ viewer: USER, season: 2026, now: '2026-10-15T23:00:00+00:00', seasons: [2026], members: [{ id: USER, displayName: 'Ben' }, { id: OTHER, displayName: 'Troy' }],
      weeks: [{ season: 2026, week: 6, deadline: '2026-10-16T00:15:00+00:00', closed: false, games: [], results: {}, revealed: {}, gate: { 'SEA-DEN': { spread: true, total: true }, 'HOU-JAX': { spread: false, total: 'yes' }, bad: { spread: true } }, entries }] }) },
    clock: () => Date.parse('2026-10-15T23:00:00Z'),
  });
  const response = await app(new Request('https://fixture.invalid/community/history', { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: '{}' }));
  assert.equal(response.status, 200);
  const [week] = (await response.json()).weeks;
  assert.deepEqual(week.gate, { 'SEA-DEN': { spread: true, total: true }, 'HOU-JAX': { spread: false, total: false } }, 'the viewer\'s gate: booleans only, game ids only');
  const [partly, marked, draft, satOut] = week.entries;
  assert.deepEqual([partly.picksHidden, partly.hiddenGames, partly.weekPoints, partly.late], [true, ['HOU-JAX'], 8, { deadline: '2026-10-16T00:15:00Z', minutes: 75 }]);
  assert.deepEqual(partly.picks.map(p => [p.gameId, p.guess, p.reference?.value ?? null, p.points, p.hidden]), [['SEA-DEN', -3.5, -4.5, 8, false], ['HOU-JAX', null, null, null, true]]);
  assert.deepEqual([marked.picksHidden, marked.hiddenGames, marked.picks.map(p => [p.guess, p.hidden])], [true, ['HOU-JAX'], [[44.5, false], [null, true]]]);
  assert.deepEqual([draft.picksHidden, draft.weekPoints, draft.picks.map(p => [p.guess, p.hidden])], [false, null, [[-2.5, false]]]);
  assert.deepEqual([satOut.weekPoints, satOut.picks, satOut.late], [null, null, null], 'a sit-out: null, never 0, and no Late marker');
  const text = JSON.stringify(week.entries);
  for (const secret of ['6.5', '5.5', '51.5', '50.5']) assert.equal(text.includes(secret), false, `${secret} never passes`);
});
