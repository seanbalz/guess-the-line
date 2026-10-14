import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { assertNoLeak, leakScan, lineSecrets, pickSecrets, READERS, READER_MIGRATIONS, readersOn, withoutTimes } from './helpers/leak-scan.mjs';
import { ACCOUNTS, MIGRATIONS, createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { ALL, HOSTED } from './migrations.mjs';

// Stage 3 of docs/REDESIGN_BUILD_PLAN.md: the leak scan, first on synthetic replies, then on today's readers
// through the real handler and the HOSTED migrations on PGlite. Fixture accounts and values only.

const VIEWER = 'viewer-id', OTHER = 'other-id';
const SECRETS = [
  ...pickSecrets({ g1: -6.5, g2: 2.5 }, { market: 'spread', owner: OTHER }),
  ...pickSecrets({ g1: 37.5 }, { market: 'total', owner: OTHER }),
  ...lineSecrets({ g1: -11.5 }, { market: 'spread' }), ...lineSecrets({ g1: 58.5 }, { market: 'total' }),
];

test('the scan finds a line or a hidden pick anywhere in a reply, with its path', () => {
  const reply = {
    viewer: VIEWER, week: { season: 2026, week: 6, deadline: '2026-10-16T00:15:00Z', games: 2 },
    posts: [{ actorId: OTHER, kind: 'ballot_submitted', picks: { g1: -6.5, g2: 2.5 } }],
    board: [{ game: 'g1', consensus: { spread: 11.5, total: '58.5' } }],
    note: 'Line moved to BUF -11.5 at 9:15',
  };
  const found = leakScan(reply, { viewer: VIEWER, secrets: SECRETS });
  assert.deepEqual(found.map(f => f.path), ['$.posts[0].picks.g1', '$.posts[0].picks.g2', '$.board[0].consensus.spread', '$.board[0].consensus.total', '$.note']);
  // The other side of a spread line is the same secret; a total matches only as written.
  assert.equal(found[2].secret.label, 'spread line g1');
  assert.deepEqual(leakScan({ x: -58.5 }, { viewer: VIEWER, secrets: SECRETS }), []);
  assert.throws(() => assertNoLeak(reply, { viewer: VIEWER, secrets: SECRETS }, '/fixture'), /\/fixture \$\.posts\[0\]\.picks\.g1 = -6\.5 \(other-id spread pick g1\)/);
});

test('the viewer\'s own entries are exempt down to a nested entry that names another owner', () => {
  const reply = { entries: [
    { userId: VIEWER, picks: [{ gameId: 'g1', guess: -6.5, reference: { value: -11.5 } }], comments: [{ userId: OTHER, body: 'mine was 37.5' }] },
    { userId: OTHER, picks: null, picksHidden: true },
  ] };
  assert.deepEqual(leakScan(reply, { viewer: VIEWER, secrets: SECRETS }).map(f => f.path), ['$.entries[0].comments[0].body']);
  assert.equal(leakScan(reply, { viewer: OTHER, secrets: SECRETS }).length, 2, 'the same reply seen by someone else');
  assert.deepEqual(leakScan(reply, { viewer: VIEWER, secrets: SECRETS, exempt: p => p.endsWith('.comments') }), []);
  // Snake case owners count too.
  assert.deepEqual(leakScan([{ user_id: VIEWER, value: 2.5 }, { actor_id: OTHER, value: 2.5 }], { viewer: VIEWER, secrets: SECRETS }).map(f => f.path), ['$[1].value']);
});

test('no false finding from counts, weeks, seasons, timestamps, ids or points; whole-number secrets are refused', () => {
  const reply = { season: 2026, week: 6, games: 14, likes: 3, weekPoints: 17, at: '2026-10-11T17:00:00.000Z',
    id: '00000000-0000-4000-8000-000000000011', ratio: 0.5, standings: [{ userId: OTHER, weekPoints: 9, seasonPoints: 95.8 }] };
  assert.deepEqual(leakScan(reply, { viewer: VIEWER, secrets: SECRETS }), []);
  assert.throws(() => leakScan(reply, { viewer: VIEWER, secrets: [{ value: 3, kind: 'line', market: 'spread' }] }), /half-point/);
  assert.throws(() => leakScan(reply, { viewer: VIEWER, secrets: [{ value: 'x' }] }), /numeric/);
});

test('a timestamp whose seconds read like a secret is never a finding; the same number in words still is', () => {
  const secrets = [{ value: 31.5, kind: 'line', market: 'total', label: 'Total' }];
  // toISOString always writes milliseconds, so 31.5 seconds past a minute is "…:31.500Z", which Number() reads as 31.5.
  assert.deepEqual(leakScan({ observedAt: '2026-10-14T13:31:31.500Z', at: '2026-10-14T13:31:31.5Z', local: '2026-10-14T06:31:31.500-07:00' }, { viewer: VIEWER, secrets }), []);
  assert.equal(leakScan({ note: 'Total 31.5 at 2026-10-14T13:31:31.500Z' }, { viewer: VIEWER, secrets }).length, 1);
});

test('withoutTimes blanks ISO times so a substring check never reads a timestamp as a secret; other numbers stay', () => {
  const text = withoutTimes(JSON.stringify({ at: '2026-10-14T17:58:41.512Z', local: '2026-10-14T10:58:41.5-07:00', note: 'lean 41.5' }));
  assert.equal(text.match(/41\.5/g).length, 1, 'only the note keeps 41.5');
  assert.ok(!withoutTimes('2026-10-14T17:58:41.512Z').includes('41.5'));
});

// Unusual half points: no count, date or score in a reply can equal them. Two games: spread and total each.
const LINES = { spread: [-11.5, 13.5], total: [58.5, 31.5] };
const TROY = { spread: [-6.5, 2.5], total: [37.5, 61.5] };
const LUKE = { spread: [-1.5, 4.5], total: [40.5, 49.5] };

/** A stored three-book collection for the open week with the given line per game (fixture values, not live odds). */
async function storeLines(db, state, lines) {
  const iso = ms => new Date(ms).toISOString(), captured = Date.now() - 1000, { season, week } = state.league;
  const signature = (await db.query('select signature from public.gtl_weekly_slates where season=$1 and week=$2', [season, week])).rows[0].signature;
  const payload = { provider: 'the-odds-api', sport: 'americanfootball_nfl', officialVerified: false, fetchedAt: iso(captured), games: state.games.map((g, i) => ({
    gameId: g.id, home: g.home, away: g.away, kickoff: g.kickoff, providerEventId: `event${i}`, matchStatus: 'matched',
    markets: Object.fromEntries(['spread', 'total'].map(market => { const line = lines[market][g.id]; return [market, { quotes: ['draftkings', 'fanduel', 'betmgm'].map(book => ({
      provider: 'the-odds-api', providerEventId: `event${i}`, book, market, value: line, timeBasis: 'provider_market_last_update', collectedAt: iso(captured), providerObservedAt: iso(captured - 1000),
      outcomes: market === 'spread' ? { home: { line, odds: -110 }, away: { line: -line, odds: -110 } } : { over: { line, odds: -110 }, under: { line, odds: -110 } },
    })) }]; })) })) };
  const key = randomUUID();
  await db.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature) values($1,$2,'collect','succeeded',$3,now(),now()+interval '90 seconds',2,$4,$5,$6)", [key, ACCOUNTS.sean.id, randomUUID(), season, week, signature]);
  await db.query('insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values($1,$2,$3,$4,$5,$6)', [key, season, week, signature, payload, payload.fetchedAt]);
}

test('a secret used as an object key is a finding too; the viewer\'s own keys stay exempt', () => {
  // Follow-up to the stage 3 review: only values were scanned, so a distribution keyed by a pick went unseen.
  const reply = { distribution: { '-6.5': 1, '3': 2 }, byLine: { 'BUF -11.5': 'g1' }, mine: { userId: VIEWER, counts: { '2.5': 1 } } };
  assert.deepEqual(leakScan(reply, { viewer: VIEWER, secrets: SECRETS }).map(f => [f.path, f.found]),
    [['$.distribution["-6.5"] (key)', '-6.5'], ['$.byLine["BUF -11.5"] (key)', 'BUF -11.5']]);
  assert.deepEqual(leakScan(reply, { viewer: VIEWER, secrets: SECRETS, exempt: p => p.startsWith('$.distribution') || p.startsWith('$.byLine') }), []);
  // Ordinary keys (ids, dates, game ids, counts) never read as a half-point secret.
  assert.deepEqual(leakScan({ '2026-10-11': 1, 'TB-DAL': 2, '00000000-0000-4000-8000-000000000011': 3, '14': 4, 'week6': 5 }, { viewer: VIEWER, secrets: SECRETS }), []);
});

test('the viewer\'s playerId at the top of a /state or /export reply never exempts the other members in it', () => {
  // /state carries `playerId` (the viewer's roster id) beside every opponent's pick: it must not act as an owner key.
  const state = { playerId: VIEWER, mode: 'guess_spread', games: [{ id: 'g1', prediction: -1.5, opponents: [{ id: OTHER, player: OTHER, value: -6.5 }] }] };
  assert.deepEqual(leakScan(state, { viewer: VIEWER, secrets: SECRETS }).map(f => f.path), ['$.games[0].opponents[0].value']);
});

test('readersOn: a reader whose migration the hosted project does not have yet runs only on a schema that has it', () => {
  for (const [route, file] of Object.entries(READER_MIGRATIONS)) {
    assert.ok(READERS.some(([r]) => r === route), `${route} is a reader`);
    assert.ok(ALL.includes(file), `${route}: ${file} is a repo migration`);
  }
  const hosted = readersOn(HOSTED).map(([route]) => route), all = readersOn(ALL).map(([route]) => route);
  assert.deepEqual(all, READERS.map(([route]) => route), 'ALL serves every reader');
  assert.deepEqual(hosted, READERS.map(([route]) => route).filter(route => !Object.hasOwn(READER_MIGRATIONS, route) || HOSTED.includes(READER_MIGRATIONS[route])));
  assert.ok(hosted.includes('/community/read') && hosted.includes('/export'), 'today\'s readers stay on HOSTED');
});

test('today\'s readers give a viewer who has not sent picks no line and no hidden pick; own entries stay visible', { skip: pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.' }, async t => {
  // groupScreens: the group routes (/state, /export) read membership and the weekly state too; virtualUnits: /virtual-units
  // (stage 20) reads the same database, with the stored lines below as its book quotes.
  const world = await createCommunityWorld({ troyBallots: false, groupScreens: true, virtualUnits: true });
  t.after(() => world.db.close());
  const { state } = world, ids = state.games.map(g => g.id);
  const map = values => Object.fromEntries(ids.map((g, i) => [g, values[i]]));
  /** Sends a full market through the real /personal/ballot route, as the old app does. */
  const send = async (account, mode, picks) => {
    const workspace = await world.api(account, 'personal');
    assert.equal(workspace.status, 200, JSON.stringify(workspace.body));
    const { revision, weeklyRevision } = workspace.body;
    const sent = await world.api(account, 'personal/ballot', { season: state.league.season, week: state.league.week, mode, picks, submit: true, revision, weeklyRevision, requestId: randomUUID() });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
  };
  // Lines exist for the open week, and Troy sends both markets.
  await storeLines(world.db, state, { spread: map(LINES.spread), total: map(LINES.total) });
  await send('troy', 'guess_spread', map(TROY.spread));
  await send('troy', 'guess_total', map(TROY.total));
  const secrets = owner => [
    ...lineSecrets(map(LINES.spread), { market: 'spread' }), ...lineSecrets(map(LINES.total), { market: 'total' }),
    ...(owner === 'troy' ? [] : [...pickSecrets(map(TROY.spread), { market: 'spread', owner: 'troy' }), ...pickSecrets(map(TROY.total), { market: 'total', owner: 'troy' })]),
  ];
  const read = async (account, [route, method, body]) => {
    const reply = await world.api(account, route.slice(1), method === 'GET' ? undefined : body);
    assert.equal(reply.status, 200, `${route}: ${JSON.stringify(reply.body)}`);
    return reply.body;
  };
  // Luke has not sent or sat out: no line, no Troy pick, in any reader.
  // Every reader the hosted schema serves (readersOn: a reader whose migration is not hosted yet runs in its own suite on ALL).
  for (const reader of readersOn(MIGRATIONS)) assertNoLeak(await read('luke', reader), { viewer: ACCOUNTS.luke.id, secrets: secrets('luke') }, reader[0]);
  // The scan is not vacuous: Troy's own reply carries his picks, which only the owner exemption clears.
  const own = await read('troy', READERS[0]);
  const troyPicks = [...pickSecrets(map(TROY.spread), { market: 'spread', owner: 'troy' }), ...pickSecrets(map(TROY.total), { market: 'total', owner: 'troy' })];
  assert.ok(leakScan(own, { viewer: ACCOUNTS.luke.id, secrets: troyPicks }).length >= 4, 'Troy\'s picks are in his own feed');
  assert.deepEqual(leakScan(own, { viewer: ACCOUNTS.troy.id, secrets: troyPicks }), []);
  // Once Luke sends his Spread, Troy's Spread picks reach him (the D-23 reveal); his Total stays hidden.
  await send('luke', 'guess_spread', map(LUKE.spread));
  const after = await read('luke', READERS[0]);
  assert.deepEqual(leakScan(after, { viewer: ACCOUNTS.luke.id, secrets: pickSecrets(map(TROY.total), { market: 'total', owner: 'troy' }) }), []);
  assert.ok(leakScan(after, { viewer: ACCOUNTS.luke.id, secrets: pickSecrets(map(TROY.spread), { market: 'spread', owner: 'troy' }) }).length >= 2, 'the revealed Spread picks are found');
  assert.deepEqual(leakScan(after, { viewer: ACCOUNTS.luke.id, secrets: pickSecrets(map(LUKE.spread), { market: 'spread', owner: 'luke' }) }), [], 'his own picks are never a leak');
  // The group screen too (/state): the scan sees Troy's revealed Spread picks there, so its clean scan above is not vacuous.
  const groupSpread = await read('luke', READERS.find(([route]) => route === '/state?mode=guess_spread'));
  assert.ok(leakScan(groupSpread, { viewer: ACCOUNTS.luke.id, secrets: pickSecrets(map(TROY.spread), { market: 'spread', owner: 'troy' }) }).length >= 2, 'the revealed Spread picks are found in /state');
  // /export and /personal carry Luke's own Spread picks now, with no owner key (leak-scan.mjs: `playerId` is not one), so
  // the scan sees inside them too; a suite that scans them for their own viewer after a send exempts those paths.
  for (const route of ['/export', '/personal']) {
    const reply = await read('luke', READERS.find(([r]) => r === route));
    assert.ok(leakScan(reply, { viewer: ACCOUNTS.luke.id, secrets: pickSecrets(map(LUKE.spread), { market: 'spread', owner: 'luke' }) }).length >= 2, `the scan sees Luke's own picks in ${route}`);
  }
  // Lines too: History now shows the Spread line at each of Troy's guesses, and still no Total line.
  const history = await read('luke', READERS[1]);
  assert.ok(leakScan(history, { viewer: ACCOUNTS.luke.id, secrets: lineSecrets(map(LINES.spread), { market: 'spread' }) }).length >= 2, 'the revealed Spread lines are found');
  assertNoLeak(history, { viewer: ACCOUNTS.luke.id, secrets: [...lineSecrets(map(LINES.total), { market: 'total' }), ...pickSecrets(map(TROY.total), { market: 'total', owner: 'troy' })] }, READERS[1][0]);
  // And the old Virtual Units screen (stage 20): his Spread book lines open with his send; his Total lines stay locked.
  const units = READERS.find(([route]) => route === '/virtual-units'), unitsReply = await read('luke', units);
  assert.ok(leakScan(unitsReply, { viewer: ACCOUNTS.luke.id, secrets: lineSecrets(map(LINES.spread), { market: 'spread' }) }).length >= 2, 'the opened Spread lines are found');
  assertNoLeak(unitsReply, { viewer: ACCOUNTS.luke.id, secrets: lineSecrets(map(LINES.total), { market: 'total' }) }, units[0]);
});
