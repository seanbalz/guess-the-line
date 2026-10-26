import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ALL, HOSTED, NOT_HOSTED, version } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { assertNoLeak, leakScan, lineSecrets, pickSecrets, readerReply, READER_MIGRATIONS } from './helpers/leak-scan.mjs';
import { storeLines } from './helpers/guess-week.mjs';
import { catalog, readMigrations } from '../scripts/migration-functions.mjs';

// Redesign build plan stage 72, M-27 (20261026230000_gtl_me_history.sql): /me/changes, the owner's own Guess changes in plain
// values (D-16 keeps every revision), through the real gtl-api handler on ALL and local PGlite. Contracts:
// - only the signed-in owner's ballots are read; no request can name another account (D-16);
// - a change to a draft that can still change is counted, not listed, until that game is locked in, kicks off or its market
//   is sat out (D-39, D-23); no change carries a line for a game its owner has not locked in (D-36 line lock);
// - every stored event shape reads in plain values: D-16-era saves (every game named), legacy imports (no game list),
//   per-game lock-ins with the line saved, a resolved pending line, a commissioner-ruled import (D-25), the Late marker (D-30);
// - the functions are service-only and change nothing; existing routes answer as today while M-27 is missing.
// Fixture accounts and unusual half-point values only; never hosted data.
const MIGRATION = '20261026230000_gtl_me_history.sql';
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const FUNCTIONS = ['gtl_me_slate(integer,integer)', 'gtl_me_results(integer,integer)', 'gtl_read_ballot_changes(uuid,integer,integer,timestamptz)', 'gtl_read_me_records(uuid,timestamptz)'];
const LINES = { spread: [-11.5, 13.5, 6.5], total: [58.5, 31.5, 52.5] };
const LUKE = { spread: [-1.5, 4.5, 7.5], changed: 5.5 };
const TROY = { spread: [-6.5, 2.5, 9.5] };
const id = name => ACCOUNTS[name].id;

async function save(world, account, mode, picks, { submit = false, lockIn } = {}) {
  const { season, week } = world.state.league;
  const workspace = await world.api(account, 'personal');
  assert.equal(workspace.status, 200, JSON.stringify(workspace.body));
  const reply = await world.api(account, 'personal/ballot', { season, week, mode, picks, submit, revision: workspace.body.revision, weeklyRevision: workspace.body.weeklyRevision, requestId: randomUUID(), ...(lockIn ? { lockIn } : {}) });
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
  return reply.body;
}

test('M-27 is an unapplied, additive repo migration: new service-only functions, nothing replaced, its readers in the leak scan', () => {
  assert.ok(ALL.includes(MIGRATION) && NOT_HOSTED.includes(version(MIGRATION)) && !HOSTED.includes(MIGRATION));
  const cat = catalog(readMigrations(ALL)), own = cat.files.find(f => f.file === MIGRATION);
  assert.deepEqual(own.functions.map(fn => [fn.name, fn.replace, !!fn.previous]).sort(),
    [['gtl_me_results', false, false], ['gtl_me_slate', false, false], ['gtl_read_ballot_changes', false, false], ['gtl_read_me_records', false, false]],
    'four new functions; no existing body is replaced, so no rollback file is needed');
  assert.deepEqual([READER_MIGRATIONS['/me/changes'], READER_MIGRATIONS['/me/records']], [MIGRATION, MIGRATION]);
});

test('/me/changes: the owner\'s own changes only, drafts held until locked in, kickoff or a sit-out, no line before lock-in', { skip }, async t => {
  let clock = null;
  const world = await createCommunityWorld({ migrations: ALL, games: 3, troyBallots: false, optionalRpc: true, clock: () => clock ?? Date.now() });
  t.after(() => world.db.close());
  const { db, state } = world, ids = state.games.map(g => g.id), { season, week } = state.league;
  const map = values => Object.fromEntries(ids.map((g, i) => [g, values[i]]));
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const changes = async (who, body = {}) => world.api(who, 'me/changes', body);
  const market = (reply, mode) => reply.body.markets.find(m => m.season === season && m.week === week && m.mode === mode);
  await storeLines(db, state, { spread: map(LINES.spread), total: map(LINES.total) });

  await t.test('grants: every new function is service-only, one pg_proc row each', async () => {
    for (const fn of FUNCTIONS) {
      for (const role of ['anon', 'authenticated']) {
        const allowed = (await db.query(`select has_function_privilege('${role}','public.${fn}','execute') ok`)).rows[0].ok;
        assert.equal(allowed, false, `${role} may not execute ${fn}`);
      }
      assert.equal((await db.query(`select has_function_privilege('service_role','public.${fn}','execute') ok`)).rows[0].ok, true, fn);
      assert.equal((await db.query('select count(*)::int n from pg_proc where proname=$1', [fn.split('(')[0]])).rows[0].n, 1, fn);
    }
    await assert.rejects(() => as('authenticated', 'select public.gtl_read_ballot_changes($1)', [id('luke')]), /permission denied/);
  });

  // Troy sends his Spread (the old app's whole-market Submit). Luke saves a draft, changes one game, then locks in the first.
  await save(world, 'troy', 'guess_spread', map(TROY.spread), { submit: true });
  await save(world, 'luke', 'guess_spread', map(LUKE.spread));
  await save(world, 'luke', 'guess_spread', { ...map(LUKE.spread), [ids[1]]: LUKE.changed });
  await save(world, 'luke', 'guess_spread', { ...map(LUKE.spread), [ids[1]]: LUKE.changed }, { lockIn: [ids[0]] });
  const ballotsBefore = (await db.query('select user_id,mode,ballot::text b,audit::text a from public.gtl_weekly_ballots order by 1,2')).rows;

  await t.test('before kickoff: the locked-in game reads in plain values with its line; the open drafts are counted, not listed', async () => {
    const reply = await changes('luke');
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.equal(reply.body.ownerId, id('luke'));
    assert.deepEqual(reply.body.markets.map(m => m.mode), ['guess_spread'], 'only Luke\'s own ballots: he has no Total');
    const spread = market(reply, 'guess_spread');
    assert.deepEqual(spread.games.map(g => g.id), ids);
    assert.deepEqual(spread.changes.map(c => [c.type, c.games.map(g => [g.gameId, g.kind, g.before, g.after])]), [
      ['ballot_saved', [[ids[0], 'draft', null, LUKE.spread[0]]]],
      ['guess_locked_in', [[ids[0], 'locked', LUKE.spread[0], LUKE.spread[0]]]],
    ]);
    const locked = spread.changes[1].games[0];
    assert.deepEqual([locked.reference.status, locked.reference.value], ['available', LINES.spread[0]], 'the line saved with the lock-in');
    assert.equal(spread.changes[0].games[0].reference, null, 'a draft save carries no line');
    assert.equal(spread.pendingChanges, 2, 'the first save\'s other two games and the second save: held while they can still change');
    assert.equal(spread.changes[1].late, null, 'locked in before the deadline');
    // The other games' lines and Troy's picks never appear: Luke has locked in only the first game.
    assertNoLeak(readerReply(reply.body), { viewer: id('luke'), secrets: [
      ...lineSecrets({ [ids[1]]: LINES.spread[1], [ids[2]]: LINES.spread[2] }, { market: 'spread' }), ...lineSecrets(map(LINES.total), { market: 'total' }),
      ...pickSecrets(map(TROY.spread), { market: 'spread', owner: 'troy' }),
      ...pickSecrets({ [ids[1]]: LUKE.spread[1], [ids[2]]: LUKE.spread[2] }, { market: 'spread', owner: 'luke-draft' }),
    ] }, '/me/changes luke');
    assert.ok(!JSON.stringify(reply.body).includes(String(LUKE.changed)), 'the held draft change is not in the reply');
  });

  await t.test('Troy\'s whole-market send reads as three lock-ins with their lines; Sean, with no ballot, has none', async () => {
    const troy = market(await changes('troy'), 'guess_spread');
    assert.deepEqual(troy.changes.map(c => [c.type, c.games.map(g => [g.kind, g.after, g.reference?.value])]),
      [['ballot_submitted', ids.map((_, i) => ['locked', TROY.spread[i], LINES.spread[i]])]]);
    const sean = await changes('sean');
    assert.deepEqual([sean.status, sean.body.markets], [200, []]);
  });

  await t.test('no request can name another account or read part of a scope', async () => {
    for (const body of [{ userId: id('troy') }, { ownerId: id('troy') }, { season }, { week }, { season, week: 0 }, { season: 1999, week }, { season: '2026', week }, []]) {
      const reply = await world.api('luke', 'me/changes', body);
      assert.equal(reply.status, 400, JSON.stringify(body));
      // gtl-api refuses a non-object body before the route; every object is refused by the History route itself.
      assert.equal(reply.body.error, Array.isArray(body) ? 'A JSON object is required.' : 'Choose a season and week, or neither.');
    }
    const scoped = await changes('luke', { season, week });
    assert.deepEqual(scoped.body.markets.map(m => [m.season, m.week, m.mode]), [[season, week, 'guess_spread']]);
    assert.deepEqual((await changes('luke', { season, week: week + 1 })).body.markets, [], 'a week without a ballot');
  });

  await t.test('after each kickoff every change is listed: the drafts and the changed game, nothing held', async () => {
    clock = Date.parse(state.games.at(-1).kickoff) + 60_000;
    try {
      const spread = market(await changes('luke'), 'guess_spread');
      assert.deepEqual(spread.changes.map(c => [c.type, c.games.map(g => [g.gameId, g.kind, g.before, g.after])]), [
        ['ballot_saved', ids.map((g, i) => [g, 'draft', null, LUKE.spread[i]])],
        ['ballot_saved', [[ids[1], 'draft', LUKE.spread[1], LUKE.changed]]],
        ['guess_locked_in', [[ids[0], 'locked', LUKE.spread[0], LUKE.spread[0]]]],
      ]);
      assert.equal(spread.pendingChanges, 0);
      assert.ok(spread.changes.slice(0, 2).every(c => c.games.every(g => g.reference === null)), 'a draft never carried a line');
    } finally { clock = null; }
  });

  await t.test('a sit-out opens its market\'s drafts to their owner; the other market stays held', async () => {
    await save(world, 'sean', 'guess_total', map([40.5, 44.5, 47.5]));
    await save(world, 'sean', 'guess_spread', map([-2.5, 3.5, 1.5]));
    assert.equal((await world.api('sean', 'community/sit-out', { season, week, mode: 'guess_total' })).status, 200);
    const reply = await changes('sean');
    const total = market(reply, 'guess_total'), spread = market(reply, 'guess_spread');
    assert.equal(total.satOut, true);
    assert.deepEqual(total.changes.map(c => c.games.map(g => [g.kind, g.after])), [[['draft', 40.5], ['draft', 44.5], ['draft', 47.5]]]);
    assert.deepEqual([spread.satOut, spread.changes, spread.pendingChanges], [false, [], 1]);
  });

  await t.test('stored event shapes: legacy, D-16 edits, a resolved line, a ruled import, and Late after the deadline', async () => {
    // Fixture events appended to Troy's audit as stored rows (the audit column only; the ballot itself is untouched).
    const deadline = Date.parse(state.league.deadline);
    const at = ms => new Date(ms).toISOString();
    const events = [
      { id: 'legacy-1', player: 'troy', mode: 'guess_spread', type: 'ballot_submitted', timestamp: at(deadline - 3_600_000), before: {}, after: map(TROY.spread) },
      { id: randomUUID(), player: 'troy', mode: 'guess_spread', type: 'ballot_edited', timestamp: at(deadline - 1_800_000), before: map(TROY.spread), after: { ...map(TROY.spread), [ids[2]]: 10.5 },
        changedGameIds: [ids[2]], beforeScoringReferences: {}, afterScoringReferences: { [ids[2]]: { status: 'available', value: LINES.spread[2], basis: 'line_at_guess' } } },
      { id: randomUUID(), player: 'troy', mode: 'guess_spread', type: 'reference_resolved', timestamp: at(deadline - 600_000), changedGameIds: [ids[1]],
        beforeScoringReferences: { [ids[1]]: { status: 'pending', basis: 'first_line_after_submission' } }, afterScoringReferences: { [ids[1]]: { status: 'available', value: LINES.spread[1], basis: 'first_line_after_submission' } } },
      { id: randomUUID(), player: 'troy', mode: 'guess_spread', type: 'ballot_submitted', timestamp: at(deadline - 300_000), before: {}, after: map(TROY.spread),
        changedGameIds: ids, origin: 'commissioner_ruled_import', decision: 'D-25', afterScoringReferences: map(LINES.spread.map(v => ({ status: 'available', value: v, basis: 'commissioner-ruled' }))) },
      { id: randomUUID(), player: 'troy', mode: 'guess_spread', type: 'guess_locked_in', timestamp: at(deadline + 12 * 60_000 + 5_000), before: map(TROY.spread), after: map(TROY.spread),
        changedGameIds: [], lockedGameIds: [ids[2]], afterScoringReferences: { [ids[2]]: { status: 'available', value: LINES.spread[2] } }, late: { deadline: at(deadline), minutes: 12 } },
    ];
    await db.query("update public.gtl_weekly_ballots set audit=audit||$1::jsonb where user_id=$2 and mode='guess_spread'", [JSON.stringify(events), id('troy')]);
    const troy = market(await changes('troy'), 'guess_spread');
    const shown = troy.changes.slice(1);
    assert.deepEqual(shown.map(c => [c.type, c.games.map(g => [g.gameId, g.kind, g.before, g.after])]), [
      ['ballot_submitted', ids.map((g, i) => [g, 'locked', null, TROY.spread[i]])],
      ['ballot_edited', [[ids[2], 'edited', TROY.spread[2], 10.5]]],
      ['reference_resolved', [[ids[1], 'resolved', null, null]]],
      ['ballot_submitted', ids.map((g, i) => [g, 'locked', null, TROY.spread[i]])],
      ['guess_locked_in', [[ids[2], 'locked', TROY.spread[2], TROY.spread[2]]]],
    ]);
    assert.deepEqual([shown[2].games[0].beforeReference, shown[2].games[0].reference.value, shown[2].games[0].reference.basis],
      [{ status: 'pending', basis: 'first_line_after_submission' }, LINES.spread[1], 'first_line_after_submission']);
    assert.deepEqual([shown[3].ruled, shown[3].games[0].reference.basis], [{ decision: 'D-25' }, 'commissioner-ruled']);
    assert.deepEqual([shown[0].late, shown[1].late, shown[4].late?.minutes], [null, null, 12], 'Late only for a lock-in saved after the deadline');
    assert.deepEqual(shown[4].late.deadline && Date.parse(shown[4].late.deadline), deadline);
  });

  await t.test('reading changes writes nothing', async () => {
    const after = (await db.query('select user_id,mode,ballot::text b,audit::text a from public.gtl_weekly_ballots where user_id<>$1 order by 1,2', [id('troy')])).rows;
    assert.deepEqual(after.filter(r => r.user_id !== id('sean')), ballotsBefore.filter(r => r.user_id !== id('troy') && r.user_id !== id('sean')));
  });
});

test('while M-27 is missing (HOSTED), existing routes answer as today and History answers unavailable', { skip }, async t => {
  const world = await createCommunityWorld({ migrations: HOSTED });
  t.after(() => world.db.close());
  for (const [route, body] of [['community/history', {}], ['community/read', {}], ['me/preferences', {}], ['personal', undefined]]) {
    const reply = await world.api('luke', route, body);
    assert.equal(reply.status, 200, `${route}: ${JSON.stringify(reply.body)}`);
  }
  for (const route of ['me/changes', 'me/records']) {
    const reply = await world.api('luke', route, {});
    assert.equal(reply.status, 503, route);
    assert.ok(!leakScan(reply.body, { viewer: id('luke'), secrets: [{ value: 13.5, kind: 'line', market: 'spread' }] }).length);
  }
});
