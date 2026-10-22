import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ALL as FUTURE_MIGRATIONS, HOSTED, MIGRATIONS_DIR, NOT_HOSTED, version } from './migrations.mjs';
import { topLevel } from '../scripts/migration-functions.mjs';
import { ACCOUNTS, createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { assertNoLeak, leakScan, lineSecrets, pickSecrets, READER_MIGRATIONS, READERS, readersOn } from './helpers/leak-scan.mjs';
import { sendBallot, serviceSql } from './helpers/guess-week.mjs';

// Redesign build plan stage 23, M-06 (20261015010000_gtl_lines_read.sql): the lines readers, gated per game and market by
// M-01's gtl_markets_visible / gtl_guess_revealed (D-39 per-game lock-in, D-31 kickoff, D-23 sit-out). Runs on ALL (the hosted
// project has neither M-01 nor M-06 yet), on the raw functions and through the real handler, on local PGlite only. Fixture
// accounts, lines and prices only, never live odds or real player data.
//
// Every line and pick is an unusual half point and no two share a size within a market (a spread matches either sign), so the
// leak scan can name each one. Stored capture times and the handler clock are whole seconds, so no printed time can read as a
// half point.
// This suite proves the pre-M-07 stage contract; M-07 has its own full-stack SQL suite.
const ALL = FUTURE_MIGRATIONS.filter(file => file < '20261015190710_gtl_guess_write_window.sql');

const MIGRATION = '20261015010000_gtl_lines_read.sql';
// M-10 is hosted since October 22, 2026, but the worlds here stop before M-07 or M-06 and so before its file: its
// reader runs only where the world installs it.
const BETS_READ = '20261015190820_gtl_bets_read.sql';
const readersIn = migrations => readersOn(migrations).filter(([route]) => route !== '/bets/read' || migrations.includes(BETS_READ));
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const HOUR = 3_600_000, MINUTE = 60_000;
const BOOKS = ['draftkings', 'fanduel', 'betmgm'];
const NEW_RPCS = ['gtl_read_lines(uuid,integer,integer,timestamptz)', 'gtl_read_game_lines(uuid,integer,integer,text,timestamptz)',
  'gtl_book_quotes_from_snapshot(jsonb,jsonb,text)', 'gtl_kickoff_line(integer,integer,text,text)'];
// Keys a lines reply may never carry anywhere: the raw provider payload and its ids, and the snapshot id.
const FORBIDDEN = ['payload', 'providerEventId', 'provider', 'outcomes', 'quotes', 'snapshotId', 'fetchedAt', 'markets', 'timeBasis', 'providerObservedAt', 'collectedAt', 'lease_token'];
const id = name => ACCOUNTS[name].id;
const iso = ms => new Date(ms).toISOString();
const second = ms => Math.floor(ms / 1000) * 1000;

/** Every key anywhere in a reply. */
function keys(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach(item => keys(item, found));
  else if (value && typeof value === 'object') for (const [key, inner] of Object.entries(value)) { found.add(key); keys(inner, found); }
  return found;
}
const noRawKeys = (reply, where) => assert.deepEqual(FORBIDDEN.filter(key => keys(reply).has(key)), [], `${where} carries a raw payload key`);

/**
 * Stores one collection for the world's open week, captured at `captured` (whole seconds) and stored a second later, or at
 * `stored` (a collection written late). games: { gameId: { spread?: market, total?: market } }; market: { books: { book:
 * { value, prices? } } } (prices default -110 both ways). A game or market left out is not in the payload.
 */
async function storeSnapshot(world, captured, games, { stored = captured + 1000 } = {}) {
  const { db, state } = world, { season, week } = state.league;
  const signature = (await db.query('select signature from public.gtl_weekly_slates where season=$1 and week=$2', [season, week])).rows[0].signature;
  const payload = { provider: 'the-odds-api', sport: 'americanfootball_nfl', officialVerified: false, fetchedAt: iso(captured),
    games: state.games.filter(g => games[g.id]).map((g, i) => ({
      gameId: g.id, home: g.home, away: g.away, kickoff: g.kickoff, providerEventId: `event-${g.id}`, matchStatus: 'matched',
      markets: Object.fromEntries(Object.entries(games[g.id]).map(([market, { books }]) => [market, { quotes: Object.entries(books).map(([book, { value, prices = [-110, -110] }]) => ({
        provider: 'the-odds-api', providerEventId: `event-${g.id}`, book, market, value, timeBasis: 'provider_market_last_update',
        collectedAt: iso(captured), providerObservedAt: iso(captured - 1000 * (i + 1)),
        outcomes: market === 'spread' ? { home: { line: value, odds: prices[0] }, away: { line: -value, odds: prices[1] } }
          : { over: { line: value, odds: prices[0] }, under: { line: value, odds: prices[1] } },
      })) }])),
    })) };
  const key = randomUUID();
  await db.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature) values($1,$2,'collect','succeeded',$3,$4,$5,2,$6,$7,$8)",
    [key, id('sean'), randomUUID(), iso(captured), iso(captured + 90_000), season, week, signature]);
  await db.query('insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values($1,$2,$3,$4,$5,$6)', [key, season, week, signature, payload, iso(stored)]);
  return key;
}
/** The same line at all three books (or `books` of them) for every game of `lines` ({ spread: { g: v }, total: { g: v } }). */
const uniform = (lines, books = BOOKS) => {
  const games = {};
  for (const [market, values] of Object.entries(lines)) for (const [g, value] of Object.entries(values)) {
    (games[g] ||= {})[market] = { books: Object.fromEntries(books.map(book => [book, { value }])) };
  }
  return games;
};

test('M-06 is a hosted repo migration; its readers run in the HOSTED leak scan', () => {
  assert.ok(ALL.includes(MIGRATION));
  assert.ok(!NOT_HOSTED.includes(version(MIGRATION)), 'confirmed hosted by the October 19 apply record');
  assert.deepEqual(READERS.filter(([route]) => route.startsWith('/lines/')).map(([route]) => route), ['/lines/read', '/lines/game']);
  for (const route of ['/lines/read', '/lines/game']) assert.equal(READER_MIGRATIONS[route], undefined, route);
  // The apply record removes the NOT_HOSTED line and the READER_MIGRATIONS entries together: a hosted file listed there fails here.
  for (const [route, file] of Object.entries(READER_MIGRATIONS)) assert.ok(NOT_HOSTED.includes(version(file)), `${route}: ${file} is hosted; remove it from READER_MIGRATIONS`);
  assert.equal(readersOn(HOSTED).filter(([route]) => route.startsWith('/lines/')).length, 2, 'HOSTED scans both lines readers');
  assert.equal(readersOn(FUTURE_MIGRATIONS).length, READERS.length, 'the complete schema covers every registered reader');
  assert.ok(readersOn(HOSTED).some(([route]) => route === '/bets/read'), 'HOSTED scans the M-10 reader');
  assert.ok(!readersIn(ALL).some(([route]) => route === '/bets/read'), 'the pre-M-07 schema does not install M-10');
});

test('M-06 takes all four functions from public, anon and authenticated and grants them to the service role only', () => {
  // PGlite has no Supabase default privileges, so has_function_privilege('authenticated', ...) is false whether or not the
  // revoke names that role (the grants check below cannot tell): the statement itself is checked here, as for M-09.
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf8');
  const statements = topLevel(sql).split(';').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
  const revokes = statements.filter(s => /^revoke /i.test(s)), grants = statements.filter(s => /^grant /i.test(s));
  assert.equal(revokes.length, 1);
  assert.equal(grants.length, 1);
  const named = statement => statement.match(/public\.gtl_\w+\([^)]*\)/g).map(name => name.replace(/^public\./, ''));
  assert.deepEqual(named(revokes[0]).sort(), [...NEW_RPCS].sort());
  assert.match(revokes[0], /^revoke all on function .* from public,anon,authenticated$/);
  assert.deepEqual(named(grants[0]).sort(), [...NEW_RPCS].sort());
  assert.match(grants[0], /^grant execute on function .* to service_role$/);
});

test('the lines readers (M-06): a cell opens per game and market on a lock-in, a sit-out or that game\'s kickoff; nothing else ever shows', { skip }, async t => {
  let clock = null;
  // groupScreens: the old group routes (/state, /export) in the leak scan list read membership and the weekly state too.
  // virtualUnits: /virtual-units is one of the READERS (stage 20).
  const world = await createCommunityWorld({ migrations: ALL, games: 4, troyBallots: false, groupScreens: true, virtualUnits: true, clock: () => clock ?? second(Date.now()) });
  t.after(() => world.db.close());
  const { db, state } = world, ids = state.games.map(g => g.id), [A, B, C, D] = ids;
  const map = values => Object.fromEntries(ids.map((g, i) => [g, values[i]]));
  const kickoff = ids.map(g => Date.parse(state.games.find(x => x.id === g).kickoff));
  const { season, week } = state.league, FIRST = kickoff[0], LAST = kickoff[3];
  const sql = serviceSql(db);
  const NOW = second(Date.now());
  assert.ok(NOW + 3 * HOUR <= FIRST, 'the fixture week is open for at least three more hours');

  // Three collections. The newest has only two books for game A, so A's newest qualifying line is the middle one.
  const P1 = { spread: map([-11.5, 13.5, 6.5, -9.5]), total: map([58.5, 31.5, 52.5, 36.5]) };
  const P2 = { spread: map([-10.5, 12.5, 5.5, -8.5]), total: map([57.5, 32.5, 53.5, 35.5]) };
  const P3 = { spread: map([-14.5, 15.5, 4.5, -16.5]), total: map([60.5, 30.5, 54.5, 34.5]) };
  await storeSnapshot(world, NOW - 3 * HOUR, uniform(P1));
  await storeSnapshot(world, NOW - 2 * HOUR, uniform(P2));
  const twoBooks = uniform({ spread: { [A]: P3.spread[A] }, total: { [A]: P3.total[A] } }, ['draftkings', 'fanduel']);
  const rest = uniform({ spread: Object.fromEntries(ids.slice(1).map(g => [g, P3.spread[g]])), total: Object.fromEntries(ids.slice(1).map(g => [g, P3.total[g]])) });
  await storeSnapshot(world, NOW - HOUR, { ...rest, ...twoBooks });
  const NEWEST = { spread: { ...P3.spread, [A]: P2.spread[A] }, total: { ...P3.total, [A]: P2.total[A] } };
  const allLines = [P1, P2, P3].flatMap(p => [...lineSecrets(p.spread, { market: 'spread' }), ...lineSecrets(p.total, { market: 'total' })]);

  // Troy sends Spread only; Sean keeps a Spread draft and sits out Total; Luke has nothing.
  const TROY = { spread: map([-2.5, 3.5, 7.5, -1.5]) };
  const SEAN = { spread: map([17.5, -18.5, 19.5, -20.5]) };
  await sendBallot(world, 'troy', 'guess_spread', TROY.spread);
  await sendBallot(world, 'sean', 'guess_spread', SEAN.spread, false);
  const satOut = await world.api('sean', 'community/sit-out', { season, week, mode: 'guess_total' });
  assert.equal(satOut.status, 200, JSON.stringify(satOut.body));
  const othersPicks = who => [...(who === 'troy' ? [] : pickSecrets(TROY.spread, { market: 'spread', owner: 'troy' })), ...(who === 'sean' ? [] : pickSecrets(SEAN.spread, { market: 'spread', owner: 'sean' }))];

  const read = (who, now = NOW, args = {}) => sql('gtl_read_lines', { p_user: id(who), p_season: null, p_week: null, p_now: iso(now), ...args });
  const gameLines = (who, g, now = NOW) => sql('gtl_read_game_lines', { p_user: id(who), p_season: season, p_week: week, p_game: g, p_now: iso(now) });
  const row = (reply, g) => reply.games.find(x => x.id === g);
  const api = async (who, route, body, now = null) => {
    clock = now;
    try { return await world.api(who, route, body); } finally { clock = null; }
  };

  await t.test('the four functions are service-only and security invoker, one pg_proc row each', async () => {
    for (const signature of NEW_RPCS) {
      for (const role of ['anon', 'authenticated']) assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${signature}`, 'EXECUTE'])).rows[0].ok, false, `${role} ${signature}`);
      assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', ['service_role', `public.${signature}`, 'EXECUTE'])).rows[0].ok, true, signature);
      assert.deepEqual((await db.query('select prosecdef from pg_proc where proname=$1', [signature.split('(')[0]])).rows, [{ prosecdef: false }], signature);
    }
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(() => db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.query('select public.gtl_read_lines($1)', [id('luke')]); }), /permission denied/, role);
      await assert.rejects(() => db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.query("select public.gtl_read_game_lines($1,null,null,'TB-DAL')", [id('luke')]); }), /permission denied/, role);
    }
  });

  await t.test('no value key before a lock-in: a viewer with no ballot gets { visible: false } for every game and market, and no line or pick', async () => {
    const reply = await read('luke');
    assert.deepEqual([reply.season, reply.week, reply.published, reply.games.map(g => g.id)], [season, week, true, ids]);
    for (const g of reply.games) {
      assert.deepEqual([g.spread, g.total], [{ visible: false }, { visible: false }], g.id);
      assert.deepEqual(g.mine, { userId: id('luke'),
        spread: { guess: null, lockedIn: false, satOut: false, late: null, points: null, lineAtGuess: null },
        total: { guess: null, lockedIn: false, satOut: false, late: null, points: null, lineAtGuess: null } });
      assert.deepEqual([g.started, g.final, g.kickoff.slice(0, 16)], [false, null, iso(kickoff[ids.indexOf(g.id)]).slice(0, 16)]);
    }
    for (const g of ids) {
      const detail = await gameLines('luke', g);
      assert.deepEqual(Object.keys(detail).sort(), ['game', 'now', 'season', 'spread', 'total', 'viewer', 'week'], g);
      assert.deepEqual([detail.game.id, detail.spread, detail.total], [g, { visible: false }, { visible: false }], g);
    }
    assertNoLeak(reply, { viewer: id('luke'), secrets: [...allLines, ...othersPicks('luke')] }, 'gtl_read_lines');
    for (const g of ids) assertNoLeak(await gameLines('luke', g), { viewer: id('luke'), secrets: [...allLines, ...othersPicks('luke')] }, `gtl_read_game_lines ${g}`);
  });

  await t.test('a locked-in Spread opens Spread lines while Total stays locked; the newest qualifying line, a two-book snapshot skipped', async () => {
    const reply = await read('troy');
    for (const g of reply.games) {
      assert.deepEqual(g.spread, { visible: true, value: NEWEST.spread[g.id], capturedAt: g.spread.capturedAt, observedAt: g.spread.observedAt,
        bookCount: 3, source: 'The Odds API · 3-book median', sourceUrl: 'https://the-odds-api.com/' }, g.id);
      assert.equal(Date.parse(g.spread.capturedAt), g.id === A ? NOW - 2 * HOUR : NOW - HOUR, `${g.id}: the newest qualifying collection`);
      assert.deepEqual(g.total, { visible: false }, `${g.id}: Total stays locked`);
      // His own rows: the guess, locked in, and the line saved with it (the newest qualifying line at the save).
      assert.deepEqual([g.mine.userId, g.mine.spread.guess, g.mine.spread.lockedIn, g.mine.spread.lineAtGuess.value, g.mine.spread.lineAtGuess.basis, g.mine.spread.points],
        [id('troy'), TROY.spread[g.id], true, NEWEST.spread[g.id], 'saved', null], g.id);
      assert.deepEqual(g.mine.total, { guess: null, lockedIn: false, satOut: false, late: null, points: null, lineAtGuess: null });
    }
    // No Total line anywhere, even without the owner exemption, and nobody else's pick.
    const totals = [P1, P2, P3].flatMap(p => lineSecrets(p.total, { market: 'total' }));
    assert.deepEqual(leakScan(reply, { viewer: id('troy'), secrets: totals, ownerKeys: [] }), []);
    assertNoLeak(reply, { viewer: id('troy'), secrets: [...totals, ...othersPicks('troy')] }, 'gtl_read_lines');
    // Not vacuous: the Spread lines are there.
    assert.ok(leakScan(reply, { viewer: id('luke'), secrets: lineSecrets(NEWEST.spread, { market: 'spread' }) }).length >= 4);
    for (const g of ids) {
      const detail = await gameLines('troy', g);
      assert.deepEqual(detail.total, { visible: false }, g);
      assert.equal(detail.spread.line.value, NEWEST.spread[g], g);
      assert.deepEqual(detail.spread.books.map(b => [b.book, b.line, b.prices]), BOOKS.slice().sort().map(book => [book, NEWEST.spread[g], { home: -110, away: -110 }]), g);
      assert.deepEqual(detail.spread.movement.map(p => p.value), g === A ? [P1.spread[g], P2.spread[g]] : [P1.spread[g], P2.spread[g], P3.spread[g]], `${g}: every qualifying line, oldest first`);
      assert.equal(detail.spread.kickoffLine, null, 'no kickoff line before kickoff');
      assert.deepEqual(leakScan(detail, { viewer: id('troy'), secrets: totals, ownerKeys: [] }), [], g);
      noRawKeys(detail, `gtl_read_game_lines ${g}`);
    }
    noRawKeys(reply, 'gtl_read_lines');
  });

  await t.test('a sit-out opens that market for the rest of the week; a draft is never a lock-in', async () => {
    const reply = await read('sean');
    for (const g of reply.games) {
      assert.deepEqual(g.spread, { visible: false }, `${g.id}: a Spread draft opens nothing`);
      assert.equal(g.total.visible, true); assert.equal(g.total.value, NEWEST.total[g.id], g.id);
      assert.deepEqual(g.mine.spread, { guess: SEAN.spread[g.id], lockedIn: false, satOut: false, late: null, points: null, lineAtGuess: null }, 'his own draft, never its line');
      assert.deepEqual([g.mine.total.satOut, g.mine.total.guess, g.mine.total.lockedIn], [true, null, false]);
    }
    const spreads = [P1, P2, P3].flatMap(p => lineSecrets(p.spread, { market: 'spread' }));
    assert.deepEqual(leakScan(reply, { viewer: id('sean'), secrets: spreads, ownerKeys: [] }), [], 'no Spread line, even in his own rows');
    for (const g of ids) {
      const detail = await gameLines('sean', g);
      assert.deepEqual(detail.spread, { visible: false }); assert.equal(detail.total.visible, true);
      assert.deepEqual(leakScan(detail, { viewer: id('sean'), secrets: [...spreads, ...othersPicks('sean')], ownerKeys: [] }), [], g);
    }
  });

  await t.test('one game opens at its kickoff, both markets, for everyone; the last kickoff opens the week', async () => {
    const first = await read('luke', FIRST);
    assert.deepEqual(first.games.map(g => [g.id, g.spread.visible, g.total.visible, g.started]), ids.map((g, i) => [g, i === 0, i === 0, i === 0]));
    assert.deepEqual([row(first, A).spread.value, row(first, A).total.value], [P2.spread[A], P2.total[A]], 'game A\'s newest qualifying lines');
    const later = ids.slice(1);
    const hidden = [P1, P2, P3].flatMap(p => [...lineSecrets(Object.fromEntries(later.map(g => [g, p.spread[g]])), { market: 'spread' }), ...lineSecrets(Object.fromEntries(later.map(g => [g, p.total[g]])), { market: 'total' })]);
    assertNoLeak(first, { viewer: id('luke'), secrets: [...hidden, ...othersPicks('luke')] }, 'at the first kickoff');
    const last = await read('luke', LAST);
    assert.ok(last.games.every(g => g.spread.visible && g.total.visible && g.started));
    // Troy's own row: from kickoff his points count (a submitted eligible ballot), and his Total stays empty.
    const troy = await read('troy', LAST);
    for (const g of troy.games) assert.equal(g.mine.spread.points, Math.max(0, 10 - 2 * Math.abs(TROY.spread[g.id] - NEWEST.spread[g.id])), g.id);
  });

  await t.test('through gtl-api: /lines/read and /lines/game give each viewer only the cells open to them, at every moment', async () => {
    const moments = [['now', null], ['first kickoff', FIRST], ['last kickoff', LAST]];
    for (const [label, now] of moments) {
      for (const who of ['luke', 'troy', 'sean']) {
        const board = await api(who, 'lines/read', {}, now);
        assert.equal(board.status, 200, JSON.stringify(board.body));
        const raw = await read(who, now ?? second(Date.now()));
        for (const g of board.body.games) {
          const open = { spread: row(raw, g.id).spread.visible, total: row(raw, g.id).total.visible };
          for (const market of ['spread', 'total']) {
            if (!open[market]) assert.deepEqual(g[market], { visible: false }, `${who} ${label} ${g.id} ${market}`);
            else assert.equal(g[market].value, row(raw, g.id)[market].value, `${who} ${label} ${g.id} ${market}`);
          }
          // The secrets this viewer must not see at this moment: every line of a closed cell, and the other players' picks.
          const closed = [P1, P2, P3].flatMap(p => ['spread', 'total'].filter(m => !open[m]).flatMap(m => lineSecrets({ [g.id]: p[m][g.id] }, { market: m })));
          assertNoLeak(g, { viewer: id(who), secrets: [...closed, ...othersPicks(who)] }, `${who} /lines/read ${label} ${g.id}`);
          assert.deepEqual(leakScan(g, { viewer: id(who), secrets: closed, ownerKeys: [] }), [], `${who} ${label} ${g.id}: not even in his own row`);
          const detail = await api(who, 'lines/game', { season, week, gameId: g.id }, now);
          assert.equal(detail.status, 200, JSON.stringify(detail.body));
          for (const market of ['spread', 'total']) if (!open[market]) assert.deepEqual(detail.body[market], { visible: false });
          assert.deepEqual(leakScan(detail.body, { viewer: id(who), secrets: [...closed, ...othersPicks(who)], ownerKeys: [] }), [], `${who} /lines/game ${label} ${g.id}`);
          noRawKeys(detail.body, `/lines/game ${g.id}`);
        }
        noRawKeys(board.body, '/lines/read');
      }
    }
    // Every reader in the leak scan list, for a viewer with nothing sent: no line and no pick of anyone else.
    for (const [route, method, body] of readersIn(ALL)) {
      const reply = await world.api('luke', route.slice(1), method === 'GET' ? undefined : body);
      assert.equal(reply.status, 200, `${route}: ${JSON.stringify(reply.body)}`);
      assertNoLeak(reply.body, { viewer: id('luke'), secrets: [...allLines, ...othersPicks('luke')] }, route);
    }
  });

  await t.test('the reader follows gtl_guess_locked_in per game: when M-02 records one game\'s lock-in, only that game and market opens', async () => {
    // Luke drafts Total. A stand-in for M-02's per-game body marks only his Total guess on game C as locked in, and every
    // Spread guess Troy sent except game B's (so B is a game where his own guess has a saved line but is not locked in).
    const LUKE = { total: map([40.5, 41.5, 42.5, 43.5]) };
    await sendBallot(world, 'luke', 'guess_total', LUKE.total, false);
    const original = (await db.query("select pg_get_functiondef(p.oid) def from pg_proc p where p.proname='gtl_guess_locked_in'")).rows[0].def;
    await db.exec(`create or replace function public.gtl_guess_locked_in(p_user uuid,p_season integer,p_week integer,p_mode text,p_game text) returns boolean
      language sql stable security invoker set search_path='' as $$ select (p_user='${id('luke')}'::uuid and p_mode='guess_total' and p_game='${C}')
        or (p_user='${id('troy')}'::uuid and p_mode='guess_spread' and p_game<>'${B}') $$`);
    try {
      // Troy: B's Spread closes; his own guess stays, its saved line does not (as in History, M-01), anywhere in his reply.
      const troy = await read('troy');
      assert.deepEqual(troy.games.map(g => [g.id, g.spread.visible, g.mine.spread.lockedIn, g.mine.spread.guess, g.mine.spread.lineAtGuess?.value ?? null]),
        ids.map(g => [g, g !== B, g !== B, TROY.spread[g], g === B ? null : NEWEST.spread[g]]));
      const bLines = [P1, P2, P3].flatMap(p => lineSecrets({ [B]: p.spread[B] }, { market: 'spread' }));
      assert.deepEqual(leakScan(troy, { viewer: id('troy'), secrets: bLines, ownerKeys: [] }), [], 'game B\'s Spread line, not even in his own row');
      const troyB = await api('troy', 'lines/read', {});
      assert.deepEqual(leakScan(troyB.body, { viewer: id('troy'), secrets: bLines, ownerKeys: [] }), []);
      assert.deepEqual((await gameLines('troy', B)).spread, { visible: false });
      const reply = await read('luke');
      assert.deepEqual(reply.games.map(g => [g.id, g.spread.visible, g.total.visible, g.mine.total.lockedIn, g.mine.total.guess]),
        ids.map(g => [g, false, g === C, g === C, LUKE.total[g]]));
      assert.equal(row(reply, C).total.value, NEWEST.total[C]);
      const detail = await gameLines('luke', C);
      assert.deepEqual([detail.spread, detail.total.visible, detail.total.line.value], [{ visible: false }, true, NEWEST.total[C]]);
      assert.deepEqual((await gameLines('luke', B)).total, { visible: false });
      const hidden = [P1, P2, P3].flatMap(p => [...lineSecrets(p.spread, { market: 'spread' }), ...lineSecrets(Object.fromEntries(ids.filter(g => g !== C).map(g => [g, p.total[g]])), { market: 'total' })]);
      assert.deepEqual(leakScan(reply, { viewer: id('luke'), secrets: hidden, ownerKeys: [] }), []);
    } finally { await db.exec(original); }
    assert.ok((await read('luke')).games.every(g => !g.total.visible), 'the M-01 body again: a draft opens nothing');
  });

  await t.test('finals come from the settlement ledger; an unknown or unpublished week answers published: false', async () => {
    await db.query("insert into public.gtl_virtual_units_settlements(season,week,game_id,version,status,home,away,source,source_url,observed_at) values($1,$2,$3,1,'final',24,17,'Fixture final score','https://example.test/final',$4)",
      [season, week, D, iso(LAST + 4 * HOUR)]);
    const reply = await read('luke');
    assert.deepEqual(row(reply, D).final, { status: 'final', home: 24, away: 17, source: 'Fixture final score', sourceUrl: 'https://example.test/final', observedAt: row(reply, D).final.observedAt, origin: 'settlement' });
    assert.deepEqual(row(reply, A).final, null);
    const unknown = await read('luke', NOW, { p_season: 1999, p_week: 1 });
    assert.deepEqual({ ...unknown, now: Date.parse(unknown.now) }, { viewer: id('luke'), season: 1999, week: 1, now: NOW, published: false, deadline: null, games: [] });
    const explicit = await read('troy', NOW, { p_season: season, p_week: week });
    assert.deepEqual(explicit.games.map(g => g.spread.value), ids.map(g => NEWEST.spread[g]));
  });

  await t.test('refusals: a malformed request, an unknown game, a non-member and a removed member', async () => {
    await assert.rejects(() => read('luke', NOW, { p_season: season }), /GTL_LINES_INVALID/);
    await assert.rejects(() => sql('gtl_read_game_lines', { p_user: id('luke'), p_season: season, p_week: week, p_game: 'XX-YY', p_now: iso(NOW) }), /GTL_LINES_INVALID/);
    await assert.rejects(() => sql('gtl_read_game_lines', { p_user: id('luke'), p_season: null, p_week: null, p_game: null, p_now: iso(NOW) }), /GTL_LINES_INVALID/);
    const stranger = randomUUID();
    await db.query('insert into auth.users values($1)', [stranger]);
    await assert.rejects(() => sql('gtl_read_lines', { p_user: stranger, p_season: null, p_week: null, p_now: null }), /GTL_COMMUNITY_MEMBER/);
    await assert.rejects(() => sql('gtl_read_game_lines', { p_user: stranger, p_season: null, p_week: null, p_game: A, p_now: null }), /GTL_COMMUNITY_MEMBER/);
    // Through gtl-api: the mapped codes.
    assert.deepEqual(await api('luke', 'lines/read', { season }), { status: 400, body: { error: 'Check the week and game, then try again.' } });
    assert.deepEqual(await api('luke', 'lines/game', { gameId: 'XX-YY' }), { status: 400, body: { error: 'Check the week and game, then try again.' } });
    await db.query('insert into public.gtl_community_removals(user_id,removed_by) values($1,$2)', [id('luke'), id('sean')]);
    for (const [route, body] of [['lines/read', {}], ['lines/game', { gameId: A }]]) {
      assert.deepEqual(await api('luke', route, body), { status: 403, body: { error: 'Open My games and save your display name to join the community.' } }, route);
    }
  });
});

test('the kickoff line, movement and named books with prices (M-06): the newest qualifying line in the 12 hours before kickoff, else none', { skip }, async t => {
  const world = await createCommunityWorld({ migrations: ALL, games: 3, troyBallots: false });
  t.after(() => world.db.close());
  const { db, state } = world, [X, Y, Z] = state.games.map(g => g.id), { season, week } = state.league;
  const K = Date.parse(state.games[0].kickoff), KY = Date.parse(state.games[1].kickoff), KZ = Date.parse(state.games[2].kickoff);
  const sql = serviceSql(db);
  // Luke sits out both markets, so every cell is open to him and the content itself is what is checked here.
  for (const mode of ['guess_spread', 'guess_total']) assert.equal((await world.api('luke', 'community/sit-out', { season, week, mode })).status, 200);
  const lines = (g, now) => sql('gtl_read_game_lines', { p_user: id('luke'), p_season: season, p_week: week, p_game: g, p_now: iso(now) });
  const kickoffLine = (g, market) => sql('gtl_kickoff_line', { p_season: season, p_week: week, p_game: g, p_market: market });

  // Q1, 13 hours before X: all three games. Q2, 5 hours before X: game X only, three books at different lines and prices (one
  // price out of range). Q3, 2 hours before X: X and Y with two books. Q4, 10 minutes after X's kickoff: X (no longer a line for
  // X) and Y with two books. QZ, exactly 12 hours before Z's kickoff: Z only.
  const Q1 = await storeSnapshot(world, K - 13 * HOUR, uniform({ spread: { [X]: -6.5, [Y]: 3.5, [Z]: 0.5 }, total: { [X]: 47.5, [Y]: 41.5, [Z]: 38.5 } }));
  const Q2 = await storeSnapshot(world, K - 5 * HOUR, { [X]: {
    spread: { books: { draftkings: { value: -7, prices: [-105, -115] }, fanduel: { value: -7.5, prices: [100, -120] }, betmgm: { value: -8, prices: [-110, -110] } } },
    total: { books: { draftkings: { value: 48.5, prices: [-112, -108] }, fanduel: { value: 48.5, prices: [105, -125] }, betmgm: { value: 49, prices: [-110, 99] } } },
  } });
  await storeSnapshot(world, K - 2 * HOUR, uniform({ spread: { [X]: -8.5, [Y]: 4.5 }, total: { [X]: 49.5, [Y]: 42.5 } }, ['draftkings', 'betmgm']));
  await storeSnapshot(world, K + 10 * MINUTE, { ...uniform({ spread: { [X]: -9.5 }, total: { [X]: 50.5 } }), ...uniform({ spread: { [Y]: 5.5 }, total: { [Y]: 43.5 } }, ['fanduel', 'betmgm']) });
  const QZ = await storeSnapshot(world, KZ - 12 * HOUR, uniform({ spread: { [Z]: 1.5 }, total: { [Z]: 39.5 } }));

  await t.test('gtl_kickoff_line: newest qualifying in the 12-hour window (inclusive); outside it, two books or after kickoff, none', async () => {
    const x = await kickoffLine(X, 'spread');
    assert.deepEqual([x.value, Date.parse(x.capturedAt), x.bookCount, x.snapshotId], [-7.5, K - 5 * HOUR, 3, Q2], 'Q3 has two books and Q4 was captured after kickoff');
    assert.equal((await kickoffLine(X, 'total')).value, 48.5);
    assert.equal(await kickoffLine(Y, 'spread'), null, 'Y\'s only qualifying line is 14 hours before its kickoff');
    assert.equal(await kickoffLine(Y, 'total'), null);
    assert.deepEqual([(await kickoffLine(Z, 'spread')).value, (await kickoffLine(Z, 'spread')).snapshotId], [1.5, QZ], 'exactly 12 hours before kickoff counts');
    for (const [g, market] of [['XX-YY', 'spread'], [X, 'moneyline'], [X, null], [null, 'spread']]) assert.equal(await kickoffLine(g, market), null, `${g} ${market}`);
    assert.equal(await sql('gtl_kickoff_line', { p_season: 1999, p_week: 1, p_game: X, p_market: 'spread' }), null);
    assert.ok(KY > K && KZ > KY);
  });

  await t.test('gtl_book_quotes_from_snapshot: the three named books with both prices, only when the line qualifies', async () => {
    const snap = async key => (await db.query('select payload from public.gtl_market_snapshots where id=$1', [key])).rows[0].payload;
    const game = async g => sql('gtl_slate_game', { p_season: season, p_week: week, p_signature: (await db.query('select signature from public.gtl_weekly_slates where season=$1 and week=$2', [season, week])).rows[0].signature, p_game_id: g });
    const books = await sql('gtl_book_quotes_from_snapshot', { p_payload: await snap(Q2), p_game: await game(X), p_market: 'spread' });
    assert.deepEqual(books.map(b => [b.book, b.source, b.line, b.prices]), [['betmgm', 'BetMGM', -8, { home: -110, away: -110 }], ['draftkings', 'DraftKings', -7, { home: -105, away: -115 }], ['fanduel', 'FanDuel', -7.5, { home: 100, away: -120 }]]);
    const totals = await sql('gtl_book_quotes_from_snapshot', { p_payload: await snap(Q2), p_game: await game(X), p_market: 'total' });
    assert.deepEqual(totals.map(b => [b.book, b.prices]), [['betmgm', { over: -110, under: null }], ['draftkings', { over: -112, under: -108 }], ['fanduel', { over: 105, under: -125 }]], 'a price out of range is null');
    for (const b of [...books, ...totals]) assert.deepEqual(Object.keys(b).sort(), ['book', 'line', 'observedAt', 'prices', 'source']);
    assert.equal(await sql('gtl_book_quotes_from_snapshot', { p_payload: await snap(Q2), p_game: await game(Y), p_market: 'spread' }), null, 'Y is not in Q2');
    assert.equal(await sql('gtl_book_quotes_from_snapshot', { p_payload: await snap(Q1), p_game: await game(X), p_market: 'moneyline' }), null);
    assert.equal(await sql('gtl_book_quotes_from_snapshot', { p_payload: {}, p_game: await game(X), p_market: 'spread' }), null);
  });

  await t.test('gtl_read_game_lines over time: the newest qualifying line and its books, movement oldest first, the kickoff line only from kickoff', async () => {
    const early = await lines(X, K - 6 * HOUR);
    assert.deepEqual([early.spread.line.value, early.spread.movement.map(p => p.value), early.spread.books.map(b => b.prices.home), early.spread.kickoffLine],
      [-6.5, [-6.5], [-110, -110, -110], null], 'only Q1 was stored then');
    const before = await lines(X, K - HOUR);
    assert.deepEqual([before.spread.line.value, Date.parse(before.spread.line.capturedAt), before.spread.movement.map(p => [p.value, Date.parse(p.capturedAt)]), before.spread.kickoffLine],
      [-7.5, K - 5 * HOUR, [[-6.5, K - 13 * HOUR], [-7.5, K - 5 * HOUR]], null], 'Q3 has two books; no kickoff line before kickoff');
    assert.deepEqual(before.spread.books.map(b => [b.book, b.line, b.prices]), [['betmgm', -8, { home: -110, away: -110 }], ['draftkings', -7, { home: -105, away: -115 }], ['fanduel', -7.5, { home: 100, away: -120 }]]);
    assert.deepEqual([before.game.started, before.total.line.value, before.total.movement.map(p => p.value)], [false, 48.5, [47.5, 48.5]]);
    const at = await lines(X, K);
    assert.deepEqual([at.game.started, at.spread.kickoffLine.value, Date.parse(at.spread.kickoffLine.capturedAt), 'snapshotId' in at.spread.kickoffLine, at.total.kickoffLine.value], [true, -7.5, K - 5 * HOUR, false, 48.5]);
    const after = await lines(X, K + HOUR);
    assert.deepEqual([after.spread.line.value, after.spread.movement.length], [-7.5, 2], 'a collection captured after kickoff is never a line for that game');
    const y = await lines(Y, KY + HOUR);
    assert.deepEqual([y.spread.line.value, y.spread.movement.map(p => p.value), y.spread.kickoffLine, y.total.kickoffLine], [3.5, [3.5], null, null]);
    noRawKeys([early, before, at, after, y], 'gtl_read_game_lines');
    // The board shows the same newest line.
    const board = await sql('gtl_read_lines', { p_user: id('luke'), p_season: season, p_week: week, p_now: iso(K - HOUR) });
    assert.deepEqual(board.games.map(g => [g.id, g.spread.value, g.total.value]), [[X, -7.5, 48.5], [Y, 3.5, 41.5], [Z, 1.5, 39.5]]);
  });

  await t.test('movement keeps the newest 48 qualifying lines', async () => {
    for (let i = 0; i < 50; i++) await storeSnapshot(world, K - 4 * HOUR + i * MINUTE, uniform({ spread: { [Z]: 2 + (i % 2) / 2 }, total: { [Z]: 40 } }));
    const z = await lines(Z, K);
    assert.equal(z.spread.movement.length, 48);
    assert.equal(Date.parse(z.spread.movement.at(-1).capturedAt), K - 4 * HOUR + 49 * MINUTE, 'the newest last');
    assert.equal(Date.parse(z.spread.movement[0].capturedAt), K - 4 * HOUR + 2 * MINUTE, 'the four oldest of the 52 qualifying lines (Q1, QZ and two of these) are left out');
  });

  await t.test('gtl_kickoff_line goes by when a line was captured, not when it was stored: one captured before the window and stored inside it is not a kickoff line', async () => {
    // A collection for Y captured 12 hours 30 minutes before its kickoff, written 90 minutes late (11 hours before kickoff).
    const late = await storeSnapshot(world, KY - 12 * HOUR - 30 * MINUTE, uniform({ spread: { [Y]: 6.5 }, total: { [Y]: 44.5 } }), { stored: KY - 11 * HOUR });
    assert.equal(await kickoffLine(Y, 'spread'), null);
    assert.equal(await kickoffLine(Y, 'total'), null);
    // It is still Y's newest qualifying line: only the kickoff line has the 12-hour window.
    const y = await lines(Y, KY + HOUR);
    assert.deepEqual([y.spread.line.value, Date.parse(y.spread.line.capturedAt), y.spread.kickoffLine, y.total.line.value, y.total.kickoffLine],
      [6.5, KY - 12 * HOUR - 30 * MINUTE, null, 44.5, null]);
    assert.equal((await db.query('select count(*)::int n from public.gtl_market_snapshots where id=$1 and created_at>=$2', [late, iso(KY - 12 * HOUR)])).rows[0].n, 1, 'stored inside the window');
  });
});

test('before the apply: on the hosted schema /lines/* answer the generic 503 and every other reader is unchanged', { skip }, async t => {
  const before = HOSTED.filter(file => file < MIGRATION);
  const world = await createCommunityWorld({ migrations: before, troyBallots: false, groupScreens: true, virtualUnits: true });
  t.after(() => world.db.close());
  for (const [route, body] of [['lines/read', {}], ['lines/game', { gameId: 'TB-DAL' }]]) {
    assert.deepEqual(await world.api('luke', route, body), { status: 503, body: { error: 'The saved data service is temporarily unavailable. Please try again.' } }, route);
  }
  for (const [route, method, body] of readersIn(before).filter(([route]) => !route.startsWith('/lines/') && route !== '/community/picks')) assert.equal((await world.api('luke', route.slice(1), method === 'GET' ? undefined : body)).status, 200, route);
});
