import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seed } from '../server/store.mjs';
import { handleOfficials, providerOfficialsError } from '../cloud/officials.mjs';

// Optional disposable PostgreSQL runtime; never connects to the hosted project.
// Install: npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OFFICIALS = '20261012234500_gtl_game_officials.sql';
const MIGRATIONS = [
  '20261008164249_gtl_private_cloud_state.sql', '20261008174007_gtl_profiles_private_games_invites.sql', '20261008182836_gtl_canonical_weekly_entries.sql',
  '20261008185738_gtl_manual_odds_collection.sql', '20261008192528_gtl_scoped_spread_benchmark.sql', '20261008200926_gtl_twelve_hour_odds_refresh.sql',
  '20261009005145_gtl_social_bet_tracker.sql', '20261009120000_gtl_community_feed.sql', '20261009130000_gtl_league_interest.sql',
  '20261009140000_gtl_d23_data_rule.sql', '20261009150000_gtl_auto_open_week.sql', OFFICIALS,
];
const SEAN = 30, TROY = 1, REMOVED = 2, STRANGER = 3;

async function fixture(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public,auth to service_role;');
  for (const file of MIGRATIONS) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    if (file === MIGRATIONS[0]) {
      await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke', seed()]);
      for (const n of [SEAN, TROY, REMOVED, STRANGER]) await db.query('insert into auth.users values($1)', [id(n)]);
      await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner'),($2,'sean-troy-luke','troy','player')", [id(SEAN), id(TROY)]);
    }
    if (file === MIGRATIONS[1]) await db.query("insert into public.gtl_profiles(user_id,display_name) values($1,'Sean'),($2,'Troy'),($3,'Removed')", [id(SEAN), id(TROY), id(REMOVED)]);
    if (file === '20261009120000_gtl_community_feed.sql') await db.query('insert into public.gtl_community_removals(user_id,removed_by) values($1,$2)', [id(REMOVED), id(SEAN)]);
  }
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const service = { rpc: async (name, args) => {
    const params = Object.values(args), placeholders = params.map((_, i) => `$${i + 1}`).join(',');
    try { return (await as('service_role', `select public.${name}(${placeholders}) value`, params)).rows[0].value; }
    catch (error) { throw providerOfficialsError(error.message); }
  } };
  const slate = (await db.query('select season,week,signature from public.gtl_weekly_slates')).rows[0];
  const games = slate.signature.games.map(g => g.id);
  const user = n => ({ id: id(n), emailConfirmed: true, email: 'fixture@example.invalid' });
  const set = (n, body) => handleOfficials({ route: '/officials/set', body: { season: slate.season, week: slate.week, ...body }, user: user(n), service });
  const read = (n, body = {}) => handleOfficials({ route: '/officials/read', body: { season: slate.season, week: slate.week, ...body }, user: user(n), service });
  const rpc = (name, params) => as('service_role', `select public.${name}(${params.map((_, i) => `$${i + 1}`).join(',')}) value`, params).then(r => r.rows[0].value);
  return { db, as, service, slate, games, set, read, rpc };
}

test('game officials: service-only tables and functions, commissioner writes, member reads, append-only history', { skip }, async t => {
  const f = await fixture(t);
  const [game, other] = f.games;

  await t.test('browser roles reach no table or function; RLS is on; functions are invoker with a fixed search path', async () => {
    for (const table of ['gtl_game_officials', 'gtl_game_official_history']) {
      assert.equal((await f.db.query('select relrowsecurity from pg_class where oid=$1::regclass', [`public.${table}`])).rows[0].relrowsecurity, true);
      for (const role of ['anon', 'authenticated']) {
        await assert.rejects(() => f.as(role, `select * from public.${table}`), /permission denied/);
        await assert.rejects(() => f.as(role, `insert into public.${table}(season) values(2026)`), /permission denied/);
      }
    }
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(() => f.as(role, 'select public.gtl_read_game_officials($1,2026,5)', [id(TROY)]), /permission denied/);
      await assert.rejects(() => f.as(role, "select public.gtl_set_game_official($1,2026,5,'TB-DAL','Scott Novak')", [id(SEAN)]), /permission denied/);
    }
    const flags = (await f.db.query("select proname,prosecdef,proconfig from pg_proc where proname in ('gtl_set_game_official','gtl_read_game_officials') order by proname")).rows;
    assert.deepEqual(flags.map(r => [r.proname, r.prosecdef, r.proconfig]), [['gtl_read_game_officials', false, ['search_path=""']], ['gtl_set_game_official', false, ['search_path=""']]]);
    // The service role has no delete grant on either table: corrections are new revisions (D-23).
    for (const table of ['gtl_game_officials', 'gtl_game_official_history']) await assert.rejects(() => f.as('service_role', `delete from public.${table}`), /permission denied/);
    await assert.rejects(() => f.as('service_role', 'update public.gtl_game_official_history set referee=null'), /permission denied/);
  });

  await t.test('a non-commissioner is refused before anything is written, through the RPC and through the route', async () => {
    await assert.rejects(() => f.rpc('gtl_set_game_official', [id(TROY), f.slate.season, f.slate.week, game, 'Scott Novak']), /GTL_OFFICIALS_FORBIDDEN/);
    await assert.rejects(() => f.set(TROY, { gameId: game, referee: 'Scott Novak' }), error => error.status === 403 && /Only the commissioner/.test(error.message));
    await assert.rejects(() => f.set(STRANGER, { gameId: game, referee: 'Scott Novak' }), error => error.status === 403);
    assert.equal((await f.db.query('select count(*)::int n from public.gtl_game_officials')).rows[0].n, 0);
    assert.equal((await f.db.query("select count(*)::int n from public.gtl_access_audit where event like 'game_official:%'")).rows[0].n, 0);
  });

  await t.test('invalid games, unpublished weeks and malformed names are refused by the database itself', async () => {
    await assert.rejects(() => f.rpc('gtl_set_game_official', [id(SEAN), f.slate.season, f.slate.week, 'XX-YY', 'Scott Novak']), /GTL_OFFICIALS_UNKNOWN_GAME/);
    await assert.rejects(() => f.rpc('gtl_set_game_official', [id(SEAN), f.slate.season, f.slate.week + 1, game, 'Scott Novak']), /GTL_OFFICIALS_UNKNOWN_GAME/);
    for (const name of ['', '  ', 'X', 'Robert"); drop table x; --', '<b>Novak</b>', 'Scott  Novak'.replace('  ', '\u0000'), 'A'.repeat(61)]) {
      await assert.rejects(() => f.rpc('gtl_set_game_official', [id(SEAN), f.slate.season, f.slate.week, game, name]), /GTL_OFFICIALS_INVALID|invalid byte|null character/, JSON.stringify(name));
    }
    await assert.rejects(() => f.rpc('gtl_set_game_official', [id(SEAN), f.slate.season, f.slate.week, 'tb-dal', 'Scott Novak']), /GTL_OFFICIALS_INVALID/);
    await assert.rejects(() => f.rpc('gtl_set_game_official', [id(SEAN), 1999, f.slate.week, game, 'Scott Novak']), /GTL_OFFICIALS_INVALID/);
    await assert.rejects(() => f.set(SEAN, { gameId: 'XX-YY', referee: 'Scott Novak' }), error => error.status === 409);
    // A direct insert that bypassed the function still meets the table checks.
    await assert.rejects(() => f.as('service_role', 'insert into public.gtl_game_officials(season,week,game_id,referee,set_by) values($1,$2,$3,$4,$5)', [f.slate.season, f.slate.week, game, 'Scott  Novak', id(SEAN)]), /check constraint/);
    assert.equal((await f.db.query('select count(*)::int n from public.gtl_game_officials')).rows[0].n, 0);
  });

  await t.test('the commissioner sets, re-sets, repeats and clears; every change is a new revision with history and audit', async () => {
    const first = await f.set(SEAN, { gameId: game, referee: '  Ronald   Torbert ' });
    assert.deepEqual([first.gameId, first.referee, first.revision, first.changed], [game, 'Ron Torbert', 1, true], 'aliases and spacing are canonicalized before the write');
    assert.ok(Number.isFinite(Date.parse(first.setAt)));
    const same = await f.set(SEAN, { gameId: game, referee: 'Ron Torbert' });
    assert.deepEqual([same.referee, same.revision, same.changed], ['Ron Torbert', 1, false], 'saving the same referee writes nothing');
    const second = await f.set(SEAN, { gameId: game, referee: 'Scott Novak' });
    assert.deepEqual([second.referee, second.revision, second.changed], ['Scott Novak', 2, true]);
    const cleared = await f.set(SEAN, { gameId: game, referee: null });
    assert.deepEqual([cleared.referee, cleared.revision, cleared.changed], [null, 3, true]);
    const untouched = await f.set(SEAN, { gameId: other, referee: null });
    assert.deepEqual([untouched.referee, untouched.revision, untouched.changed], [null, 0, false], 'clearing a game that was never assigned writes nothing');
    await f.set(SEAN, { gameId: other, referee: "Shawn O'Hochuli-Smith Jr." });
    const history = (await f.db.query('select game_id,revision,referee,previous_referee,set_by from public.gtl_game_official_history order by game_id,revision')).rows;
    assert.deepEqual(history.filter(h => h.game_id === game).map(h => [h.revision, h.referee, h.previous_referee, h.set_by]),
      [[1, 'Ron Torbert', null, id(SEAN)], [2, 'Scott Novak', 'Ron Torbert', id(SEAN)], [3, null, 'Scott Novak', id(SEAN)]]);
    const current = (await f.db.query('select game_id,referee,revision,set_by from public.gtl_game_officials order by game_id')).rows;
    assert.deepEqual(current.find(r => r.game_id === game), { game_id: game, referee: null, revision: 3, set_by: id(SEAN) });
    const audit = (await f.db.query("select actor_id,event from public.gtl_access_audit where event like 'game_official:%' order by created_at,event")).rows;
    assert.equal(audit.length, 4);
    assert.ok(audit.every(row => row.actor_id === id(SEAN)));
    assert.ok(audit.some(row => row.event === `game_official:${f.slate.season}:${f.slate.week}:${game}:3`));
  });

  await t.test('members read the latest assignment per game; removed or profile-less accounts are refused', async () => {
    const view = await f.read(TROY);
    assert.deepEqual(Object.keys(view.assignments).sort(), [game, other].sort());
    assert.equal(view.assignments[game].referee, null);
    assert.equal(view.assignments[game].revision, 3);
    assert.equal(view.assignments[other].referee, "Shawn O'Hochuli-Smith Jr.");
    assert.deepEqual(await f.read(TROY, { week: f.slate.week + 1 }), { season: f.slate.season, week: f.slate.week + 1, assignments: {} });
    for (const n of [REMOVED, STRANGER]) await assert.rejects(() => f.read(n), error => error.status === 403 && /display name/.test(error.message));
    await assert.rejects(() => f.read(TROY, { season: 1999 }), error => error.status === 400);
  });
});
