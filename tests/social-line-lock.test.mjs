import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createCloudHandler } from '../cloud/handler.mjs';
import { handleSocial, legLocked, redactSocialWeek, socialGate } from '../cloud/social.mjs';
import { applySocialMutation, emptySocialState } from '../shared/social-bets.mjs';
import { assertNoLeak, leakScan, lineSecrets, READERS, READER_MIGRATIONS, readerReply, readersOn } from './helpers/leak-scan.mjs';
import { ALL, HOSTED, NOT_HOSTED, version } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, pgliteAvailable, sendBallot, storeBookLines } from './cloud-browser/community-world.mjs';

// Redesign build plan stage 21 (M-04, 20261015050000_gtl_social_line_lock.sql; D-36 as amended by D-39): the line lock on real
// slips. gtl_read_social gives each week the viewer's gate (M-01's gtl_markets_visible); /social/* redacts the locked legs of
// other players' slips (no line, no line in the selection), holds back their note and change reasons, and refuses a Tail while
// a leg is locked. Own slips are never redacted. Without a gate (M-04 not applied, or rolled back) nothing changes. Fixture
// games, books and lines only: every line is an unusual half point, so the leak scan can find it anywhere in a reply.

const MIGRATION = '20261015050000_gtl_social_line_lock.sql';
const VIEWER = '00000000-0000-4000-8000-000000000011', OTHER = '00000000-0000-4000-8000-000000000012';
const SEASON = 2099, WEEK = 5;
const KICK_A = '2099-10-08T20:00:00.000Z', KICK_B = '2099-10-11T17:00:00.000Z';
const NOW = Date.parse('2099-10-08T19:00:00.000Z');
const A = { id: 'NYJ-BUF', away: 'NYJ', home: 'BUF', kickoff: KICK_A }, B = { id: 'SEA-DEN', away: 'SEA', home: 'DEN', kickoff: KICK_B };
const GAMES = [A, B].map(g => ({ ...g, season: SEASON, week: WEEK }));
// The lines on the other player's tickets (and an older line a correction replaced): secrets the viewer must not receive.
const SECRETS = [
  ...lineSecrets({ [A.id]: -11.5, [B.id]: 13.5 }, { market: 'spread' }), ...lineSecrets({ [A.id]: 58.5 }, { market: 'total' }),
  { value: -9.5, kind: 'line', market: 'spread', label: 'the older spread line a correction replaced' },
];
const quotedAt = '2099-10-08T18:00:00.000Z';
const base = { season: SEASON, week: WEEK, odds: -110, stakeUnits: 1, source: 'Fixture book', quotedAt };
const spreadA = (line = -11.5) => ({ gameId: A.id, market: 'spread', side: 'home', line });

/** One week of shared slips, built through the real mutation module (receipts and audit included). */
function buildWeek() {
  let state = emptySocialState(), n = 0;
  const ids = {};
  const apply = (actorId, action, body, key) => {
    state = applySocialMutation(state, { actorId, action, body: { requestId: randomUUID(), ...body }, games: GAMES, now: NOW - 3_600_000 + (n += 1000), uuid: randomUUID });
    if (key) ids[key] = state.entries.at(-1).id;
  };
  apply(OTHER, 'create', { ...base, kind: 'single', legs: [spreadA()], notes: 'Grabbed BUF -11.5 before it moved' }, 'single');
  apply(OTHER, 'create', { ...base, kind: 'parlay', odds: 264, legs: [{ gameId: A.id, market: 'total', side: 'over', line: 58.5 }, { gameId: B.id, market: 'spread', side: 'away', line: 13.5 }] }, 'parlay');
  apply(OTHER, 'create', { ...base, kind: 'single', legs: [{ gameId: A.id, market: 'prop', side: 'Fixture Receiver', selection: 'Fixture Receiver over 41.5 receiving yards', line: 41.5 }] }, 'prop');
  apply(OTHER, 'create', { ...base, kind: 'single', legs: [spreadA(-9.5)] }, 'corrected');
  apply(OTHER, 'correct', { entryId: ids.corrected, revision: 1, reason: 'Ticket says -11.5, not -9.5', ...base, kind: 'single', legs: [spreadA()] });
  apply(VIEWER, 'create', { ...base, kind: 'single', legs: [spreadA()], notes: 'Mine at BUF -11.5' }, 'own');
  return { state, ids };
}
const WEEK_STATE = buildWeek();
const CLOSED = { [A.id]: { spread: false, total: false }, [B.id]: { spread: false, total: false } };

/** gtl_read_social's answer for one week; `noGate` leaves the key out, as the body before M-04 does. */
function raw({ gate = CLOSED, noGate = false, state = WEEK_STATE.state } = {}) {
  return { season: SEASON, week: WEEK, availableWeeks: [{ season: SEASON, week: WEEK }], following: [],
    profiles: [{ id: VIEWER, displayName: 'Viewer Fixture' }, { id: OTHER, displayName: 'Other Fixture' }],
    weeks: [{ season: SEASON, week: WEEK, revision: state.audit.length, state, games: [A, B].map(g => ({ ...g, kickoff: Date.parse(g.kickoff) / 1000 })), ...(noGate ? {} : { gate }) }] };
}
/** handleSocial over a fake service: the read answers `answer()`, commits are recorded. */
function service(answer) {
  const commits = [];
  return { commits, rpc: async (name, args) => {
    if (name === 'gtl_read_social') return answer(args);
    if (name === 'gtl_commit_social') { commits.push(args); return { revision: args.p_expected_revision + 1, replayed: false }; }
    throw new Error(`unexpected ${name}`);
  } };
}
const read = async (options = {}, { clock = NOW, rules, body = {} } = {}) => handleSocial({ route: '/social/read', body, user: { id: VIEWER }, service: service(() => raw(options)), clock: () => clock, ...(rules ? { rules: () => rules } : {}) });
const entry = (reply, key) => reply.entries.find(e => e.id === WEEK_STATE.ids[key]);
const tailBody = (sourceEntryId, requestId = randomUUID()) => ({ season: SEASON, week: WEEK, weekRevision: WEEK_STATE.state.audit.length, requestId, sourceEntryId, odds: -105, stakeUnits: 1, source: 'Viewer book', quotedAt });

test('socialGate: no key is today\'s behavior (null); a gate parses to { gameId: { spread, total } }; anything else opens nothing', () => {
  assert.equal(socialGate({ season: SEASON, week: WEEK }), null);
  assert.deepEqual({ ...socialGate({ gate: CLOSED }) }, CLOSED);
  for (const bad of [null, [], 'open', { [A.id]: true }, { [A.id]: { spread: 'true', total: false } }]) assert.deepEqual(Object.keys(socialGate({ gate: bad })), [], JSON.stringify(bad));
});

test('legLocked: only a spread or total leg, only with a gate, open with its market or at its kickoff', () => {
  const context = gate => ({ games: [A, B], gate: socialGate({ gate }), now: NOW });
  assert.equal(legLocked(spreadA(), context(CLOSED)), true);
  assert.equal(legLocked(spreadA(), { games: [A, B], gate: null, now: NOW }), false, 'no gate: today\'s behavior');
  assert.equal(legLocked({ gameId: A.id, market: 'prop', side: 'X', selection: 'X over 41.5', line: 41.5 }, context(CLOSED)), false, 'a prop has no Guess the Line line');
  assert.equal(legLocked(spreadA(), context({ ...CLOSED, [A.id]: { spread: true, total: false } })), false);
  assert.equal(legLocked({ gameId: A.id, market: 'total', side: 'over', line: 58.5 }, context({ ...CLOSED, [A.id]: { spread: true, total: false } })), true, 'the other market stays locked');
  assert.equal(legLocked(spreadA(), { ...context(CLOSED), now: Date.parse(KICK_A) }), false, 'kickoff opens it');
  assert.equal(legLocked({ gameId: 'toString', market: 'spread', side: 'home', line: 3.5 }, context(CLOSED)), true, 'a game the gate does not list stays locked');
  assert.equal(legLocked({ gameId: 'LV-KC', market: 'spread', side: 'home', line: 3.5 }, context({})), true, 'an unknown game has no kickoff to open it');
});

test('a closed gate: no line of another player\'s slip anywhere in the reply; locked legs, notes and reasons held back; own slip whole', async () => {
  const reply = await read();
  assertNoLeak(reply, { viewer: VIEWER, secrets: SECRETS }, '/social/read with every market locked');
  const single = entry(reply, 'single');
  assert.deepEqual(single.legs, [{ gameId: A.id, market: 'spread', side: 'home', line: null, selection: 'BUF', locked: true }]);
  assert.deepEqual([single.locked, single.lockedMarkets, single.canTail, single.notes, single.noteHidden], [true, ['spread'], false, null, true]);
  const parlay = entry(reply, 'parlay');
  assert.deepEqual(parlay.legs.map(leg => [leg.market, leg.side, leg.line, leg.selection, leg.locked]), [['total', 'over', null, 'Over', true], ['spread', 'away', null, 'SEA', true]]);
  assert.deepEqual([parlay.lockedMarkets, parlay.canTail, parlay.noteHidden], [['spread', 'total'], false, false]);
  // The correction's history keeps both versions and the reason, all held back.
  const corrected = entry(reply, 'corrected');
  assert.deepEqual(corrected.audit.map(event => [event.action, event.reason, event.before?.legs?.[0]?.line ?? null, event.after.legs[0].line, event.after.legs[0].locked]), [['create', null, null, null, true], ['correct', null, null, null, true]]);
  // A prop is not a Guess the Line market: it stays whole and can be tailed.
  const prop = entry(reply, 'prop');
  assert.deepEqual([prop.legs[0].line, prop.legs[0].selection, prop.locked, prop.canTail], [41.5, 'Fixture Receiver over 41.5 receiving yards', undefined, true]);
  // The viewer's own slip is never redacted (D-23): line, selection and note come back as saved.
  const own = entry(reply, 'own');
  assert.deepEqual([own.legs[0].line, own.legs[0].selection, own.notes, own.locked], [-11.5, 'BUF -11.5', 'Mine at BUF -11.5', undefined]);
  assert.ok(leakScan(reply, { viewer: OTHER, secrets: SECRETS }).some(f => f.path.startsWith(`$.entries[${reply.entries.indexOf(own)}]`)), 'the scan is not vacuous: the own slip carries the line');
  // Records, ROI and the selection chart still count every slip; the chart names the side, never the hidden line.
  assert.equal(reply.summary.bets, 5);
  assert.ok(reply.selectionBreakdown.some(row => row.label === `${A.id} · BUF` && row.count === 2), 'the single and the corrected slip, without their line');
  // The reply names its viewer at the root (actorId), which the scan reads as "all of this is the viewer's": the strict scan
  // takes that off (readerReply), so the counts, chart and selection rows built from the other player's slips are scanned
  // too. Filtered to that player, so no row is the viewer's own.
  const others = await read({}, { body: { filters: { playerId: OTHER } } });
  assert.equal(others.entries.length, 4);
  assertNoLeak(readerReply(others), { viewer: VIEWER, secrets: SECRETS }, '/social/read, the other player\'s slips, root included');
  const whole = await read({ noGate: true }, { body: { filters: { playerId: OTHER } } });
  assert.ok(leakScan(readerReply(whole), { viewer: VIEWER, secrets: SECRETS }).some(f => f.path.startsWith('$.selectionBreakdown')), 'the strict scan reaches the selection rows');
  assert.deepEqual(reply.rules, { sentFinal: false, lateWindow: 'deadline', revealAt: 'deadline' });
});

test('before M-04 (no gate in the week): today\'s behavior, every line and note, Tail open', async () => {
  const reply = await read({ noGate: true });
  assert.ok(leakScan(reply, { viewer: VIEWER, secrets: SECRETS }).length >= 6, 'today the tracker shows every slip whole');
  for (const key of ['single', 'parlay', 'corrected', 'prop']) {
    const slip = entry(reply, key);
    assert.equal(slip.locked, undefined, key); assert.equal(slip.noteHidden, undefined, key); assert.equal(slip.canTail, true, key);
  }
  assert.equal(entry(reply, 'single').notes, 'Grabbed BUF -11.5 before it moved');
  // The same projection as a gate with every market open: the lock adds nothing while nothing is locked.
  const open = await read({ gate: { [A.id]: { spread: true, total: true }, [B.id]: { spread: true, total: true } } });
  assert.deepEqual(reply, open);
  assert.deepEqual(reply.rules, { sentFinal: false, lateWindow: 'deadline', revealAt: 'deadline' });
});

test('a lock-in opens that game and market only; a kickoff opens the game; a gate that does not parse opens nothing', async () => {
  const spreadOpen = await read({ gate: { ...CLOSED, [A.id]: { spread: true, total: false } } });
  const single = entry(spreadOpen, 'single');
  assert.deepEqual([single.legs[0].line, single.notes, single.locked, single.canTail], [-11.5, 'Grabbed BUF -11.5 before it moved', undefined, true]);
  assert.equal(entry(spreadOpen, 'corrected').audit.at(-1).reason, 'Ticket says -11.5, not -9.5', 'every version of the corrected slip is open');
  const parlay = entry(spreadOpen, 'parlay');
  assert.deepEqual([parlay.legs.map(leg => leg.locked === true), parlay.lockedMarkets, parlay.canTail], [[true, true], ['spread', 'total'], false], 'Total on A and Spread on B stay locked');
  assertNoLeak(spreadOpen, { viewer: VIEWER, secrets: SECRETS.filter(s => !(s.market === 'spread' && Math.abs(s.value) !== 13.5)) }, 'Spread open on game A only');

  const kicked = await read({}, { clock: Date.parse(KICK_A) + 60_000 });
  assert.deepEqual(entry(kicked, 'single').legs[0].line, -11.5, 'game A kicked off');
  const legs = entry(kicked, 'parlay').legs;
  assert.deepEqual([legs[0].line, legs[1].line, legs[1].locked, entry(kicked, 'parlay').lockedMarkets], [58.5, null, true, ['spread']], 'game B has not kicked off');

  const malformed = await read({ gate: { [A.id]: 'yes' } });
  assertNoLeak(malformed, { viewer: VIEWER, secrets: SECRETS }, 'a gate of the wrong shape');
  assert.equal(entry(malformed, 'single').locked, true);
});

test('the history read: each week follows its own gate', async () => {
  const week6 = buildWeek(), six = { ...raw({ state: week6.state }).weeks[0], week: 6, gate: CLOSED };
  six.state = structuredClone(week6.state);
  for (const e of six.state.entries) e.week = 6;
  for (const event of six.state.audit) for (const snap of [event.before, event.after]) if (snap) snap.week = 6;
  const answer = { ...raw({ gate: { [A.id]: { spread: true, total: true }, [B.id]: { spread: true, total: true } } }), weeks: [raw({ gate: { [A.id]: { spread: true, total: true }, [B.id]: { spread: true, total: true } } }).weeks[0], six] };
  const reply = await handleSocial({ route: '/social/read', body: { allHistory: true }, user: { id: VIEWER }, service: service(() => answer), clock: () => NOW });
  const byWeek = week => reply.entries.filter(e => e.week === week && e.ownerId === OTHER && e.legs.some(leg => leg.market !== 'prop'));
  assert.ok(byWeek(5).length === 3 && byWeek(5).every(e => !e.locked), 'week 5 is open');
  assert.ok(byWeek(6).length === 3 && byWeek(6).every(e => e.locked), 'week 6 is locked');
});

test('Tail is refused while a leg is locked, before any write; it works once the line is open; a saved tail replays', async () => {
  const closed = service(() => raw());
  const refused = handleSocial({ route: '/social/tail', body: tailBody(WEEK_STATE.ids.single), user: { id: VIEWER }, service: closed, clock: () => NOW });
  await assert.rejects(refused, error => error.status === 409 && error.message === 'Submit your Spread picks to see this line.');
  await assert.rejects(handleSocial({ route: '/social/tail', body: tailBody(WEEK_STATE.ids.parlay), user: { id: VIEWER }, service: closed, clock: () => NOW,
    rules: () => ({ sentFinal: true, lateWindow: 'deadline', revealAt: 'kickoff' }) }), error => error.status === 409 && error.message === 'Lock in your Spread pick to see this line.');
  assert.equal(closed.commits.length, 0, 'nothing is written');
  // A prop slip has no line to lock: it can be tailed now.
  const prop = await handleSocial({ route: '/social/tail', body: tailBody(WEEK_STATE.ids.prop), user: { id: VIEWER }, service: closed, clock: () => NOW });
  assert.equal(closed.commits.length, 1); assert.equal(prop.replayed, false);
  // Spread open on game A: that single can be tailed, and the copy is the viewer's own whole slip.
  const open = service(() => raw({ gate: { ...CLOSED, [A.id]: { spread: true, total: false } } }));
  const requestId = randomUUID();
  await handleSocial({ route: '/social/tail', body: tailBody(WEEK_STATE.ids.single, requestId), user: { id: VIEWER }, service: open, clock: () => NOW });
  const saved = open.commits[0].p_state, tail = saved.entries.at(-1);
  assert.deepEqual([tail.ownerId, tail.sourceEntryId, tail.legs[0].line], [VIEWER, WEEK_STATE.ids.single, -11.5]);
  // An exact retry of that saved tail replays even if the gate were to read closed: the lock never undoes a saved tail.
  const retry = service(() => raw({ state: saved }));
  await handleSocial({ route: '/social/tail', body: { ...tailBody(WEEK_STATE.ids.single, requestId), weekRevision: saved.audit.length }, user: { id: VIEWER }, service: retry, clock: () => NOW });
  assert.equal(retry.commits.length, 1, 'the replay goes to the commit, which answers it from the receipt');
  // Kickoff opens the slip too; Tail itself then closes for the started leg (unchanged rule).
  await assert.rejects(handleSocial({ route: '/social/tail', body: tailBody(WEEK_STATE.ids.single), user: { id: VIEWER }, service: service(() => raw()), clock: () => Date.parse(KICK_A) + 1 }),
    error => error.status === 409 && /started/.test(error.message));
});

test('the cloud handler carries the live rules on /social replies and words the refusal with them', async () => {
  const optional = async name => (name === 'gtl_live_rules' ? { sentFinal: true, lateWindow: 'deadline', revealAt: 'kickoff' } : { featureOff: true });
  const social = service(() => raw());
  const handler = createCloudHandler({ authenticate: async () => ({ id: VIEWER, email: 'viewer@example.test', emailConfirmed: true }), social, optionalRpc: optional, clock: () => NOW,
    storage: { membership() { throw new Error('Social routes must not require membership.'); } } });
  const post = (route, body) => handler(new Request(`https://example.test/gtl-api/social/${route}`, { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const reply = await (await post('read', {})).json();
  assert.deepEqual(reply.rules, { sentFinal: true, lateWindow: 'deadline', revealAt: 'kickoff' });
  assertNoLeak(reply, { viewer: VIEWER, secrets: SECRETS }, 'handler /social/read');
  const refused = await post('tail', tailBody(WEEK_STATE.ids.single));
  assert.deepEqual([refused.status, await refused.json()], [409, { error: 'Lock in your Spread pick to see this line.' }]);
  assert.equal(social.commits.length, 0);
});

test('redactSocialWeek never changes its input and leaves a week without a gate as it is', () => {
  const before = structuredClone(WEEK_STATE.state);
  const seen = redactSocialWeek(WEEK_STATE.state, { actorId: VIEWER, games: [A, B], gate: socialGate({ gate: CLOSED }), now: NOW });
  assert.deepEqual(WEEK_STATE.state, before);
  assert.deepEqual([...seen.locked.keys()].sort(), [WEEK_STATE.ids.single, WEEK_STATE.ids.parlay, WEEK_STATE.ids.corrected].sort());
  assert.equal(redactSocialWeek(WEEK_STATE.state, { actorId: VIEWER, games: [A, B], gate: null, now: NOW }).state, WEEK_STATE.state);
});

test('M-04 is not hosted yet and /social/read joins the leak scan through it', () => {
  assert.ok(ALL.includes(MIGRATION));
  assert.ok(NOT_HOSTED.includes(version(MIGRATION)), 'the apply record removes it');
  assert.ok(READERS.some(([route]) => route === '/social/read'));
  assert.equal(READER_MIGRATIONS['/social/read'], MIGRATION);
  assert.ok(!readersOn(HOSTED).some(([route]) => route === '/social/read'), 'a HOSTED suite does not scan it yet');
});

// The real handler, the migrations and PGlite (tests/cloud-browser/community-world.mjs). Troy posts slips at the stored book
// lines; Luke has sent nothing; Sean has sent nothing. Fixture lines only.
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const WORLD_LINES = { spread: [-11.5, 13.5], total: [58.5, 31.5] };

async function slipsWorld(t, migrations, options = {}) {
  const world = await createCommunityWorld({ migrations, troyBallots: false, groupScreens: true, virtualUnits: true, optionalRpc: true, ...options });
  t.after(() => world.db.close());
  const { state } = world, { season, week } = state.league, ids = state.games.map(g => g.id);
  const map = values => Object.fromEntries(ids.map((g, i) => [g, values[i]]));
  const lines = { spread: map(WORLD_LINES.spread), total: map(WORLD_LINES.total) };
  await storeBookLines(world, lines);
  const secrets = [...lineSecrets(lines.spread, { market: 'spread' }), ...lineSecrets(lines.total, { market: 'total' })];
  const social = async (account, body = {}) => {
    const reply = await world.api(account, 'social/read', body);
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    return reply.body;
  };
  const create = async (account, legs, notes = '') => {
    const { weekRevision } = await social(account);
    const reply = await world.api(account, 'social/create', { season, week, weekRevision, requestId: randomUUID(), kind: legs.length > 1 ? 'parlay' : 'single', legs, odds: legs.length > 1 ? 264 : -110, stakeUnits: 1, source: 'Fixture book', notes });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    return reply.body.entries.find(e => e.ownerId === ACCOUNTS[account].id && e.recordedAt === reply.body.entries.filter(x => x.ownerId === ACCOUNTS[account].id).map(x => x.recordedAt).sort().at(-1)).id;
  };
  const tail = async (account, sourceEntryId) => {
    const { weekRevision } = await social(account);
    return world.api(account, 'social/tail', { season, week, weekRevision, requestId: randomUUID(), sourceEntryId, odds: -105, stakeUnits: 1, source: 'My own book', quotedAt: new Date(Date.now() - 60_000).toISOString() });
  };
  const commits = async () => (await world.db.query('select count(*)::integer n from public.gtl_social_commits')).rows[0].n;
  const [g0, g1] = ids;
  const spreadSlip = await create('troy', [{ gameId: g0, market: 'spread', side: 'home', line: lines.spread[g0] }], `Took it at ${lines.spread[g0]}`);
  const parlaySlip = await create('troy', [{ gameId: g0, market: 'total', side: 'over', line: lines.total[g0] }, { gameId: g1, market: 'spread', side: 'home', line: lines.spread[g1] }]);
  return { world, state, season, week, ids, g0, g1, lines, map, secrets, social, create, tail, commits, spreadSlip, parlaySlip };
}
const slip = (reply, id) => reply.entries.find(e => e.id === id);

test('ALL (M-04 applied): no reader gives Luke a line before he locks in; a Spread send opens Spread only; a sit-out opens Total; Tail follows', { skip }, async t => {
  const f = await slipsWorld(t, ALL);
  // The full leak gate for this viewer: every reader the schema serves, /social/read included, with Troy's slips in the week.
  // Luke has no slip yet, so nothing in a reply is his own: each reply is scanned root included (readerReply).
  for (const reader of readersOn(ALL)) {
    const [route, method, body] = reader, reply = await f.world.api('luke', route.slice(1), method === 'GET' ? undefined : body);
    assert.equal(reply.status, 200, `${route}: ${JSON.stringify(reply.body)}`);
    assertNoLeak(readerReply(reply.body), { viewer: ACCOUNTS.luke.id, secrets: f.secrets }, route);
  }
  // A slip change answers with the same projection: Luke's own prop slip (no Guess the Line line) gets Troy's legs locked.
  const prop = await f.world.api('luke', 'social/create', { season: f.season, week: f.week, weekRevision: (await f.social('luke')).weekRevision, requestId: randomUUID(), kind: 'single',
    legs: [{ gameId: f.g0, market: 'prop', side: 'Fixture Receiver', selection: 'Fixture Receiver over 77.5 receiving yards', line: 77.5 }], odds: -110, stakeUnits: 1, source: 'Fixture book' });
  assert.equal(prop.status, 200, JSON.stringify(prop.body));
  assertNoLeak(readerReply(prop.body), { viewer: ACCOUNTS.luke.id, secrets: f.secrets }, '/social/create reply');
  assert.equal(slip(prop.body, f.spreadSlip).locked, true);
  const before = await f.social('luke');
  assert.deepEqual([slip(before, f.spreadSlip).locked, slip(before, f.spreadSlip).canTail, slip(before, f.spreadSlip).noteHidden], [true, false, true]);
  assert.deepEqual(before.rules, { sentFinal: false, lateWindow: 'deadline', revealAt: 'kickoff' }, 'M-01 is in ALL');
  // Troy's own reply carries his lines and his note: own slips are never redacted.
  const troy = await f.social('troy');
  assert.ok(leakScan(troy, { viewer: ACCOUNTS.luke.id, secrets: f.secrets }).length >= 3);
  assert.equal(slip(troy, f.spreadSlip).notes, `Took it at ${f.lines.spread[f.g0]}`);

  const writes = await f.commits();
  const refused = await f.tail('luke', f.spreadSlip);
  assert.deepEqual([refused.status, refused.body], [409, { error: 'Submit your Spread picks to see this line.' }]);
  assert.equal(await f.commits(), writes, 'a refused tail writes nothing');

  await sendBallot(f.world, 'luke', 'guess_spread', f.map([-6.5, 2.5]));
  const spread = await f.social('luke');
  assert.deepEqual([slip(spread, f.spreadSlip).legs[0].line, slip(spread, f.spreadSlip).locked, slip(spread, f.spreadSlip).notes], [f.lines.spread[f.g0], undefined, `Took it at ${f.lines.spread[f.g0]}`]);
  assert.deepEqual(slip(spread, f.parlaySlip).legs.map(leg => leg.locked === true), [true, false], 'Total still locked; Spread on the second game open');
  assertNoLeak(spread, { viewer: ACCOUNTS.luke.id, secrets: lineSecrets(f.lines.total, { market: 'total' }) }, '/social/read after a Spread send');
  const tailed = await f.tail('luke', f.spreadSlip);
  assert.equal(tailed.status, 200, JSON.stringify(tailed.body));
  assertNoLeak(readerReply(tailed.body), { viewer: ACCOUNTS.luke.id, secrets: lineSecrets(f.lines.total, { market: 'total' }) }, '/social/tail reply after a Spread send');
  assert.equal((await f.tail('luke', f.parlaySlip)).status, 409);

  const satOut = await f.world.api('luke', 'community/sit-out', { season: f.season, week: f.week, mode: 'guess_total' });
  assert.equal(satOut.status, 200, JSON.stringify(satOut.body));
  const open = await f.social('luke');
  assert.equal(slip(open, f.parlaySlip).locked, undefined);
  assert.ok(leakScan(open, { viewer: ACCOUNTS.luke.id, secrets: f.secrets }).length >= 3, 'every line is open to him now');
  assert.equal((await f.tail('luke', f.parlaySlip)).status, 200);
});

test('ALL: the SQL gate is gtl_markets_visible per week; a kickoff opens one game; the function stays service-only', { skip }, async t => {
  const f = await slipsWorld(t, ALL);
  const asService = (sql, args) => f.world.db.transaction(async tx => { await tx.exec('set local role service_role'); return (await tx.query(sql, args)).rows[0].v; });
  const rawRead = () => asService('select public.gtl_read_social($1,null,null,false) v', [ACCOUNTS.sean.id]);
  const gate = await asService('select public.gtl_markets_visible($1,$2,$3,null) v', [ACCOUNTS.sean.id, f.season, f.week]);
  assert.deepEqual((await rawRead()).weeks.map(w => w.gate), [gate]);
  assert.deepEqual(gate, { [f.g0]: { spread: false, total: false }, [f.g1]: { spread: false, total: false } });
  // The first game kicks off on the published slate: the database opens it for everyone.
  await f.world.db.query(`update public.gtl_weekly_slates set signature=jsonb_set(signature,'{games}',(select jsonb_agg(case when g->>'id'=$3
    then jsonb_set(g,'{kickoff}',to_jsonb(extract(epoch from now())::numeric - 60)) else g end order by n) from jsonb_array_elements(signature->'games') with ordinality x(g,n)))
    where season=$1 and week=$2`, [f.season, f.week, f.g0]);
  assert.deepEqual((await rawRead()).weeks[0].gate, { [f.g0]: { spread: true, total: true }, [f.g1]: { spread: false, total: false } });
  const sean = await f.social('sean');
  assert.deepEqual(slip(sean, f.parlaySlip).legs.map(leg => leg.locked === true), [false, true]);
  assert.equal(slip(sean, f.spreadSlip).locked, undefined);
  // Every week of the history read carries its own gate.
  const all = await asService('select public.gtl_read_social($1,null,null,true) v', [ACCOUNTS.sean.id]);
  assert.ok(all.weeks.length >= 1 && all.weeks.every(w => w.gate && typeof w.gate === 'object'));
  // One pg_proc row, security invoker, executable by the service role only.
  const proc = (await f.world.db.query("select count(*)::integer n, bool_or(prosecdef) definer from pg_proc where proname='gtl_read_social'")).rows[0];
  assert.deepEqual(proc, { n: 1, definer: false });
  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(() => f.world.db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.query('select public.gtl_read_social($1,null,null,false)', [ACCOUNTS.sean.id]); }), /permission denied/);
  }
});

for (const [label, migrations] of [['ALL without M-04 (the deploy before the apply)', ALL.filter(file => file !== MIGRATION)], ['HOSTED', HOSTED]]) {
  test(`${label}: the tracker answers as today, every slip whole and Tail open`, { skip }, async t => {
    const f = await slipsWorld(t, migrations);
    const luke = await f.social('luke');
    assert.ok(leakScan(luke, { viewer: ACCOUNTS.luke.id, secrets: f.secrets }).length >= 3, 'no gate: today\'s behavior');
    assert.deepEqual([slip(luke, f.spreadSlip).locked, slip(luke, f.spreadSlip).canTail, slip(luke, f.spreadSlip).notes], [undefined, true, `Took it at ${f.lines.spread[f.g0]}`]);
    const raw = await f.world.db.transaction(async tx => { await tx.exec('set local role service_role'); return (await tx.query('select public.gtl_read_social($1,null,null,false) v', [ACCOUNTS.luke.id])).rows[0].v; });
    assert.equal(Object.hasOwn(raw.weeks[0], 'gate'), false);
    assert.equal((await f.tail('luke', f.spreadSlip)).status, 200);
  });
}
