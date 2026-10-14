import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ALL, HOSTED, MIGRATIONS_DIR, NOT_HOSTED, ROLLBACK_DIR, version } from './migrations.mjs';
import { catalog, parseFunctions, readMigrations, topLevel } from '../scripts/migration-functions.mjs';
import { ACCOUNTS, createCommunityWorld, id, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { leakScan, pickSecrets, READERS } from './helpers/leak-scan.mjs';

// Redesign build plan stage 27, M-09 (20261014190000_gtl_game_notes.sql): private notes per game (D-36 "notes stay",
// D-39). Only the owner reads or writes a note; up to 2,000 characters, never cut; the saved flag kept; every change
// audited and bumping the shared personal revision. Runs on ALL (the hosted project does not have M-09 yet), on the
// raw functions and through the real handler, on local PGlite only. Fixture accounts and text only, never real
// player data.
const MIGRATION = '20261014190000_gtl_game_notes.sql';
const NEW_RPCS = {
  'gtl_read_game_notes(uuid,integer,integer)': 'select public.gtl_read_game_notes($1)',
  'gtl_set_game_note(uuid,uuid,integer,integer,text,text,bigint)': "select public.gtl_set_game_note($1,gen_random_uuid(),2026,5,'TB-DAL','x',0)",
};
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';

test('M-09 is a repo file the hosted project does not have yet; it only adds two functions, so it has no header and no rollback', () => {
  assert.ok(ALL.includes(MIGRATION));
  assert.ok(NOT_HOSTED.includes(version(MIGRATION)), 'listed in NOT_HOSTED until the apply record removes it (Gate M step 8)');
  assert.ok(!HOSTED.includes(MIGRATION));
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf8');
  assert.deepEqual(parseFunctions(sql, MIGRATION).map(fn => fn.name), ['gtl_read_game_notes', 'gtl_set_game_note']);
  const before = catalog(readMigrations(ALL.filter(file => file < MIGRATION))).latest;
  assert.ok(!before.has('public.gtl_read_game_notes') && !before.has('public.gtl_set_game_note'), 'both functions are new; nothing is replaced');
  assert.doesNotMatch(sql, /^--\s*replaces\b/im);
  assert.ok(!fs.existsSync(path.join(ROLLBACK_DIR, MIGRATION)), 'an add-only migration has no rollback file; its off switch is GTL_FEATURE_OFF=notes');
  // Additive (D-23): two functions and their grants. No table, column, trigger, row or drop.
  const statements = topLevel(sql).split(';').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
  assert.deepEqual(statements.map(s => s.split(' ').slice(0, 2).join(' ')), ['create function', 'create function', 'revoke all', 'grant execute']);
  assert.match(statements[2], /from public,anon,authenticated$/);
  assert.match(statements[3], /to service_role$/);
});

/** A world on ALL with three fixture accounts and their profiles, plus helpers that call the SQL as the service role. */
async function notesWorld(t, options = {}) {
  const world = await createCommunityWorld({ migrations: ALL, games: 3, ...options });
  t.after(() => world.db.close());
  const { db, state } = world, { season, week } = state.league, games = state.games.map(g => g.id);
  const call = (name, args) => db.transaction(async tx => {
    await tx.exec('set local role service_role');
    return (await tx.query(`select public.${name}(${Object.keys(args).map((key, i) => `${key}=>$${i + 1}`).join(',')}) value`, Object.values(args))).rows[0].value;
  });
  const who = name => ACCOUNTS[name].id;
  const read = (name, scope = { p_season: season, p_week: week }) => call('gtl_read_game_notes', { p_user: who(name), ...scope });
  const set = (name, game, note, revision, request = randomUUID()) => call('gtl_set_game_note', { p_user: who(name), p_request: request, p_season: season, p_week: week, p_game: game, p_note: note, p_revision: revision });
  const workspace = name => call('gtl_read_personal', { p_user: who(name), p_season: season, p_week: week, p_cursor: null, p_archived: false });
  /** The old app's Favorites card: gtl_mutate_personal('favorite/set') with the shared revision it read. */
  const favorite = async (name, game, saved, notes, revision) => call('gtl_mutate_personal', { p_user: who(name), p_action: 'favorite/set',
    p_body: { requestId: randomUUID(), revision: revision ?? (await workspace(name)).revision, season, week, gameId: game, saved, notes } });
  const events = async name => (await db.query("select revision::int,action,target,before_value,after_value from public.gtl_personal_events where user_id=$1 order by revision", [who(name)])).rows;
  const note = async (name, game) => (await read(name)).notes.find(n => n.gameId === game);
  return { world, db, state, season, week, games, call, who, read, set, workspace, favorite, events, note };
}

test('M-09 SQL: private notes per game, never cut, the saved flag kept, every change audited and bumping the shared revision', { skip }, async t => {
  const f = await notesWorld(t);
  const [A, B, C] = f.games;

  await t.test('both functions are service-only, invoker-rights, with an empty search path and one pg_proc row each', async () => {
    for (const [signature, call] of Object.entries(NEW_RPCS)) {
      const name = signature.split('(')[0];
      const rows = (await f.db.query("select prosecdef, proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname=$1", [name])).rows;
      assert.equal(rows.length, 1, `${name}: one pg_proc row`);
      assert.equal(rows[0].prosecdef, false, `${name}: security invoker`);
      assert.deepEqual(rows[0].proconfig, ['search_path=""'], `${name}: empty search path`);
      for (const role of ['anon', 'authenticated']) {
        const granted = (await f.db.query('select has_function_privilege($1, $2, \'execute\') ok', [role, `public.${signature}`])).rows[0].ok;
        assert.equal(granted, false, `${role} cannot execute ${name}`);
        await assert.rejects(() => f.db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.query(call, [f.who('troy')]); }), /permission denied/);
      }
      assert.equal((await f.db.query('select has_function_privilege(\'service_role\', $1, \'execute\') ok', [`public.${signature}`])).rows[0].ok, true);
    }
  });

  await t.test('an empty week reads as no notes; no week means the newest published week', async () => {
    const empty = await f.read('troy');
    assert.deepEqual(empty, { scope: 'account_private', ownerId: f.who('troy'), season: f.season, week: f.week, notes: [] });
    assert.deepEqual(await f.read('troy', {}), empty);
    await assert.rejects(() => f.read('troy', { p_season: f.season, p_week: null }), /GTL_PERSONAL_INVALID/);
    await assert.rejects(() => f.read('troy', { p_season: f.season, p_week: 25 }), /GTL_PERSONAL_SLATE/);
  });

  await t.test('a first note creates a saved row, is audited and bumps the shared revision; the old app shows it', async () => {
    const before = (await f.workspace('troy')).revision;
    const saved = await f.set('troy', A, 'Wind at kickoff.\nCheck the injury report.', 0);
    assert.equal(saved.changed, true);
    assert.deepEqual({ gameId: saved.gameId, note: saved.note, saved: saved.saved, revision: saved.revision, ownerId: saved.ownerId },
      { gameId: A, note: 'Wind at kickoff.\nCheck the injury report.', saved: true, revision: before + 1, ownerId: f.who('troy') });
    assert.equal((await f.workspace('troy')).revision, before + 1, 'the shared personal revision moved');
    const [event] = (await f.events('troy')).slice(-1);
    assert.deepEqual(event, { revision: before + 1, action: 'personal/note', target: `${f.season}/${f.week}/${A}`, before_value: null,
      after_value: { saved: true, notes: 'Wind at kickoff.\nCheck the injury report.' } });
    const read = await f.note('troy', A);
    assert.equal(read.note, saved.note); assert.equal(read.revision, saved.revision); assert.equal(read.saved, true);
    assert.equal(Date.parse(read.updatedAt), Date.parse(saved.updatedAt));
    // The old app's Favorites tab reads the same row (a note lives on a saved game there).
    assert.deepEqual((await f.workspace('troy')).favorites.map(x => [x.gameId, x.notes]), [[A, saved.note]]);
  });

  await t.test('2,000 characters fit and come back whole, spaces and line breaks as typed; 2,001 are refused, never shortened', async () => {
    const full = `  ${'x'.repeat(1994)}\n\t \n`;
    assert.equal(full.length, 2000);
    const current = (await f.note('troy', A)).revision;
    const saved = await f.set('troy', A, full, current);
    assert.equal(saved.note, full);
    assert.equal((await f.note('troy', A)).note, full);
    assert.equal((await f.db.query('select notes from public.gtl_favorites where user_id=$1 and game_id=$2', [f.who('troy'), A])).rows[0].notes, full);
    await assert.rejects(() => f.set('troy', A, `${full}y`, saved.revision), /GTL_NOTE_TOO_LONG/);
    // The database counts characters, as its own check does: 2,000 four-byte characters fit (the route is stricter, see
    // tests/personal-workspace.test.mjs, so whatever either app saves the other can save again).
    const wide = '\u{1F3C8}'.repeat(2000);
    const widened = await f.set('troy', B, wide, 0);
    assert.equal((await f.note('troy', B)).note, wide);
    await f.set('troy', B, 'Short again.', widened.revision);
    assert.equal((await f.note('troy', A)).note, full, 'a refused save leaves the stored note as it was');
  });

  await t.test('saving the text already stored writes nothing, whatever revision it names', async () => {
    const before = await f.events('troy'), stored = await f.note('troy', A), shared = (await f.workspace('troy')).revision;
    const same = await f.set('troy', A, stored.note, 0);
    assert.equal(same.changed, false); assert.equal(same.revision, stored.revision); assert.equal(same.note, stored.note);
    assert.deepEqual(await f.events('troy'), before); assert.equal((await f.workspace('troy')).revision, shared);
    // An empty note on a game without a row creates nothing.
    const none = await f.set('troy', C, '', 0);
    assert.deepEqual([none.changed, none.note, none.saved, none.createdAt], [false, '', false, null]);
    assert.equal((await f.read('troy')).notes.some(n => n.gameId === C), false);
  });

  await t.test('the saved flag is kept: a note never saves or unsaves a game the old app saved or removed', async () => {
    const luke = 'luke';
    await f.favorite(luke, A, true, 'Old app note.');
    await f.favorite(luke, A, false, 'Old app note.');
    assert.deepEqual((await f.workspace(luke)).favorites, [], 'the old app lists saved games only');
    const unsaved = await f.note(luke, A);
    assert.deepEqual([unsaved.note, unsaved.saved], ['Old app note.', false], 'the notes reader hides nothing: the removed game keeps its note');
    const edited = await f.set(luke, A, 'New app note.', unsaved.revision);
    assert.equal(edited.saved, false, 'still not saved');
    const [event] = (await f.events(luke)).slice(-1);
    assert.deepEqual([event.before_value, event.after_value], [{ saved: false, notes: 'Old app note.' }, { saved: false, notes: 'New app note.' }]);
    await f.favorite(luke, A, true, 'New app note.');
    const resaved = await f.set(luke, A, 'Newer app note.', edited.revision);
    assert.equal(resaved.saved, true, 'still saved');
    assert.deepEqual((await f.workspace(luke)).favorites.map(x => x.notes), ['Newer app note.']);
  });

  await t.test('a note changed elsewhere refuses a stale save; the old app\'s next save sees the shared revision moved', async () => {
    const start = await f.note('troy', B);
    const first = await f.set('troy', B, 'Phone draft.', start.revision);
    const before = await f.events('troy');
    await assert.rejects(() => f.set('troy', B, 'Laptop draft.', start.revision), /GTL_NOTE_CONFLICT/);
    assert.deepEqual(await f.events('troy'), before, 'a refused save writes nothing');
    assert.equal((await f.note('troy', B)).note, 'Phone draft.');
    // The old app changes the text: the note's revision moves, so the new app must reload first.
    const shared = (await f.workspace('troy')).revision;
    await f.favorite('troy', B, true, 'Old app rewrite.', shared);
    const rewritten = await f.note('troy', B);
    assert.equal(rewritten.revision, shared + 1);
    await assert.rejects(() => f.set('troy', B, 'Stale.', first.revision), /GTL_NOTE_CONFLICT/);
    // Removing the game from Favorites leaves the text alone, so the note's revision does not move.
    await f.favorite('troy', B, false, 'Old app rewrite.');
    assert.equal((await f.note('troy', B)).revision, rewritten.revision);
    const after = await f.set('troy', B, 'Fresh.', rewritten.revision);
    // An old-app screen that read the workspace before that save is refused instead of overwriting the note.
    await assert.rejects(() => f.favorite('troy', B, true, 'Overwrite.', after.revision - 1), /GTL_PERSONAL_CONFLICT/);
    assert.equal((await f.note('troy', B)).note, 'Fresh.');
  });

  await t.test('a request id replays its first answer; reusing it for other content is refused', async () => {
    const request = randomUUID(), base = (await f.note('troy', C))?.revision ?? 0;
    const first = await f.set('troy', C, 'Replayed once.', base, request);
    const count = (await f.events('troy')).length;
    assert.deepEqual(await f.set('troy', C, 'Replayed once.', base, request), first);
    assert.equal((await f.events('troy')).length, count, 'the replay wrote no second event');
    await assert.rejects(() => f.set('troy', C, 'Something else.', base, request), /GTL_PERSONAL_RETRY_CONFLICT/);
    const shared = (await f.workspace('troy')).revision;
    await assert.rejects(() => f.call('gtl_mutate_personal', { p_user: f.who('troy'), p_action: 'favorite/set',
      p_body: { requestId: request, revision: shared, season: f.season, week: f.week, gameId: C, saved: true, notes: 'Replayed once.' } }), /GTL_PERSONAL_RETRY_CONFLICT/);
  });

  await t.test('clearing a note keeps the row and its saved flag, and the audit keeps every earlier text (D-23)', async () => {
    const current = await f.note('troy', A);
    const cleared = await f.set('troy', A, '', current.revision);
    assert.deepEqual([cleared.changed, cleared.note, cleared.saved], [true, '', true]);
    assert.deepEqual((await f.read('troy')).notes.find(n => n.gameId === A).note, '');
    const texts = (await f.events('troy')).filter(e => e.target.endsWith(`/${A}`)).map(e => e.before_value?.notes);
    assert.ok(texts.includes('Wind at kickoff.\nCheck the injury report.') && texts.includes(current.note), 'every earlier note text is in the audit');
  });

  await t.test('the database refuses what the route refuses, even from the trusted role', async () => {
    const base = (await f.note('troy', A)).revision;
    await assert.rejects(() => f.set('troy', 'FAKE-TEAM', 'x', base), /GTL_PERSONAL_INVALID/);
    await assert.rejects(() => f.set('troy', A, 'bell\u0007', base), /GTL_PERSONAL_INVALID/);
    await assert.rejects(() => f.set('troy', A, 'x', -1), /GTL_PERSONAL_INVALID/);
    await assert.rejects(() => f.set('troy', A, null, base), /GTL_PERSONAL_INVALID/);
    await assert.rejects(() => f.call('gtl_set_game_note', { p_user: f.who('troy'), p_request: randomUUID(), p_season: f.season, p_week: 25, p_game: A, p_note: 'x', p_revision: 0 }), /GTL_PERSONAL_SLATE/);
    await f.db.query('insert into auth.users values($1)', [id(9)]);
    for (const user of [id(9), null]) {
      await assert.rejects(() => f.call('gtl_read_game_notes', { p_user: user, p_season: f.season, p_week: f.week }), /GTL_PERSONAL_PROFILE/);
      await assert.rejects(() => f.call('gtl_set_game_note', { p_user: user, p_request: randomUUID(), p_season: f.season, p_week: f.week, p_game: A, p_note: 'x', p_revision: 0 }), /GTL_PERSONAL_PROFILE/);
    }
  });

  await t.test('no other user can read a note: each account reads only its own rows', async () => {
    await f.set('sean', A, 'Sean\'s own note.', 0);
    const troy = await f.read('troy'), luke = await f.read('luke'), sean = await f.read('sean');
    const texts = reply => reply.notes.map(n => n.note);
    assert.ok(!texts(luke).some(text => /Fresh|Replayed|Wind|Sean/.test(text)) && texts(luke).every(text => /app note/.test(text)));
    assert.ok(!texts(troy).some(text => /app note|Sean/.test(text)));
    assert.deepEqual(texts(sean), ['Sean\'s own note.']);
    for (const [name, reply] of [['troy', troy], ['luke', luke], ['sean', sean]]) assert.equal(reply.ownerId, f.who(name));
    // Every stored row is the owner's, and the reader keys only on the signed-in owner (there is no other argument).
    const rows = (await f.db.query('select user_id, count(*)::int n from public.gtl_favorites group by user_id order by user_id')).rows;
    assert.deepEqual(rows.map(r => [r.user_id, r.n]), [[f.who('luke'), 1], [f.who('troy'), 3], [f.who('sean'), 1]].sort());
    assert.deepEqual((await f.db.query("select proargnames from pg_proc where proname='gtl_read_game_notes'")).rows[0].proargnames, ['p_user', 'p_season', 'p_week']);
  });
});

test('through gtl-api: /personal/note and /personal/notes serve only the signed-in owner; no other reader carries a note', { skip }, async t => {
  const f = await notesWorld(t, { groupScreens: true });
  const { world, season, week } = f, [A] = f.games;
  // An unusual half point inside the note: the leak scan can find it anywhere a note text might travel.
  const NOTE = 'Private note for the fixture: lean 41.5 if the wind holds.';
  const secrets = pickSecrets({ [A]: 41.5 }, { market: 'total', owner: 'troy' });

  const saved = await world.api('troy', 'personal/note', { requestId: randomUUID(), season, week, gameId: A, note: NOTE, revision: 0 });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual([saved.body.note, saved.body.saved, saved.body.changed], [NOTE, true, true]);
  const own = await world.api('troy', 'personal/notes', {});
  assert.equal(own.status, 200);
  assert.deepEqual(own.body.notes.map(n => [n.gameId, n.note]), [[A, NOTE]], 'the owner reads the note whole');
  assert.equal(own.body.ownerId, ACCOUNTS.troy.id);
  assert.deepEqual(leakScan(own.body, { viewer: ACCOUNTS.troy.id, secrets }), [], 'the owner\'s own note is never a leak');
  assert.ok(leakScan(own.body, { viewer: ACCOUNTS.luke.id, secrets }).length > 0, 'the scan is not vacuous: the note carries the secret');
  assert.equal((await world.api('troy', 'personal', undefined)).body.favorites[0].notes, NOTE, 'the old app\'s Solo screen shows it too');

  for (const viewer of ['luke', 'sean']) {
    const notes = await world.api(viewer, 'personal/notes', { season, week });
    assert.equal(notes.status, 200);
    assert.deepEqual(notes.body.notes, [], `${viewer} reads no note of Troy's`);
    for (const [route, method, body] of [...READERS, ['/personal/notes', 'POST', {}]]) {
      const reply = await world.api(viewer, route.slice(1), method === 'GET' ? undefined : body);
      assert.equal(reply.status, 200, `${viewer} ${route}: ${JSON.stringify(reply.body)}`);
      const text = JSON.stringify(reply.body);
      assert.ok(!text.includes('Private note for the fixture') && !text.includes('41.5'), `${viewer} ${route} carries Troy's note`);
      assert.deepEqual(leakScan(reply.body, { viewer: ACCOUNTS[viewer].id, secrets }), [], `${viewer} ${route}`);
    }
    // There is no way to name another account: identity comes from sign-in, and any other field is refused.
    for (const field of ['userId', 'ownerId', 'owner', 'user']) {
      assert.equal((await world.api(viewer, 'personal/notes', { season, week, [field]: ACCOUNTS.troy.id })).status, 400);
      assert.equal((await world.api(viewer, 'personal/note', { requestId: randomUUID(), season, week, gameId: A, note: 'x', revision: 0, [field]: ACCOUNTS.troy.id })).status, 400);
    }
  }
  // A stale save through the route is a 409 with the sentence the new app shows; the stored note stays.
  const stale = await world.api('troy', 'personal/note', { requestId: randomUUID(), season, week, gameId: A, note: 'Other device.', revision: 0 });
  assert.deepEqual([stale.status, stale.body], [409, { error: 'This note changed on another device. Refresh before saving again.' }]);
  assert.equal((await world.api('troy', 'personal/notes', {})).body.notes[0].note, NOTE);
});

test('without M-09 (the hosted schema today) the old personal routes answer as before and the notes routes fail closed', { skip }, async t => {
  const world = await createCommunityWorld({ migrations: HOSTED });
  t.after(() => world.db.close());
  const { season, week } = world.state.league, game = world.state.games[0].id;
  const home = await world.api('troy', 'personal', undefined);
  assert.equal(home.status, 200);
  const favorite = await world.api('troy', 'favorite/set', { requestId: randomUUID(), revision: home.body.revision, season, week, gameId: game, saved: true, notes: 'Old app only.' });
  assert.equal(favorite.status, 200, JSON.stringify(favorite.body));
  assert.equal((await world.api('troy', 'personal', undefined)).body.favorites[0].notes, 'Old app only.');
  for (const [route, body] of [['personal/notes', {}], ['personal/note', { requestId: randomUUID(), season, week, gameId: game, note: 'x', revision: 0 }]]) {
    const reply = await world.api('troy', route, body);
    assert.equal(reply.status, 503, route);
    assert.doesNotMatch(JSON.stringify(reply.body), /Old app only|gtl_|function/, `${route} gives no note and no database detail`);
  }
});
