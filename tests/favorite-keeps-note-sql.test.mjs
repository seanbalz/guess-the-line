import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL, PRELUDE, migrationSql } from './migrations.mjs';
import { catalog, readMigrations } from '../scripts/migration-functions.mjs';
import { seed } from '../server/store.mjs';
import { PersonalError, handlePersonal, providerPersonalError } from '../cloud/personal.mjs';
// Optional disposable PostgreSQL runtime; never connects to the hosted project.
// Install: npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';

// Stage 27a of docs/REDESIGN_BUILD_PLAN.md, M-29 (D-40): the old app's "Save to Favorites" keeps a note already
// stored for the game instead of writing an empty note over it. The same requests run on two local databases: every
// migration before M-29 (the previous gtl_mutate_personal body) and every migration (ALL, the new body). They must
// agree on every save except the one D-40 changes. Synthetic accounts and notes only.
const M29 = ALL.find(file => file.endsWith('_gtl_favorite_keeps_note.sql')); // found by name: restamped at merge
const BEFORE = ALL.filter(file => file < M29);
const HAS_M09 = ALL.some(file => file.endsWith('_gtl_game_notes.sql')); // stage 27's gtl_set_game_note, when merged
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OWNER = 1, OTHER = 2, SEASON = 2026, WEEK = 5;

test('M-29 replaces gtl_mutate_personal and changes only the favorite/set save; every other line is the previous body', () => {
  assert.ok(M29, 'the M-29 migration is in supabase/migrations');
  const own = catalog(readMigrations(ALL)).files.find(entry => entry.file === M29);
  assert.deepEqual(own.functions.map(fn => fn.key), ['public.gtl_mutate_personal']);
  const [fn] = own.functions;
  assert.equal(fn.previous.file, '20261012230000_gtl_submit_with_line_at_guess.sql');
  assert.equal(fn.args, fn.previous.args, 'the argument list is unchanged (one pg_proc row)');
  const before = fn.previous.body.split('\n'), after = fn.body.split('\n'), at = after.findIndex(line => line.includes('-- D-40'));
  assert.ok(at > 0);
  // One line becomes six: two comment lines, the three-line keep, and the insert reading the note it keeps.
  assert.deepEqual(before[at].trim(), "insert into public.gtl_favorites(user_id,season,week,game_id,saved,notes,updated_at) values(p_user,s,w,g->>'id',(p_body->>'saved')::boolean,btrim(p_body->>'notes'),stamp)");
  assert.deepEqual(after.slice(at + 2, at + 6).map(line => line.trim()), [
    "if (after_value->>'saved')::boolean and after_value->>'notes'='' and not coalesce((before_value->>'saved')::boolean,false) then",
    "after_value:=after_value||jsonb_build_object('notes',coalesce(before_value->>'notes',''));",
    'end if;',
    "insert into public.gtl_favorites(user_id,season,week,game_id,saved,notes,updated_at) values(p_user,s,w,g->>'id',(after_value->>'saved')::boolean,after_value->>'notes',stamp)",
  ]);
  assert.deepEqual([...after.slice(0, at), ...after.slice(at + 6)], [...before.slice(0, at), ...before.slice(at + 1)]);
});

test('every error code the new body can raise is one the previous body raised, and cloud/personal.mjs maps each one', () => {
  const [fn] = catalog(readMigrations(ALL)).files.find(entry => entry.file === M29).functions;
  const codes = body => [...new Set([...body.matchAll(/raise exception '([A-Z0-9_]+)'/g)].map(match => match[1]))].sort();
  assert.deepEqual(codes(fn.body), codes(fn.previous.body), 'no new error code');
  assert.ok(codes(fn.body).length >= 10);
  for (const code of codes(fn.body)) {
    const error = providerPersonalError(code);
    assert.ok(error instanceof PersonalError && error.status >= 400 && error.status < 500 && error.code === code, `${code} is mapped`);
  }
});

/** A local database with `files` applied, two players with profiles, and the calls the suites below make. */
async function schema(t, files) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(PRELUDE);
  await db.exec(migrationSql(files[0]));
  const state = seed(); state.ballots = {}; state.bets = {}; state.audit = [];
  await db.query("insert into public.gtl_leagues(id,state) values('sean-troy-luke',$1)", [state]);
  for (const n of [OWNER, OTHER]) await db.query('insert into auth.users values($1)', [id(n)]);
  for (const file of files.slice(1)) await db.exec(migrationSql(file));
  const call = async (name, args) => (await db.transaction(async tx => {
    await tx.exec('set local role service_role');
    return tx.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) value`, args);
  })).rows[0].value;
  for (const n of [OWNER, OTHER]) await call('gtl_save_profile', [id(n), `Player ${n}`]);
  const hasM09 = (await db.query("select count(*)::int n from pg_proc where proname='gtl_set_game_note'")).rows[0].n === 1;
  let request = 1000;
  const read = (who = OWNER) => call('gtl_read_personal', [id(who), SEASON, WEEK, null, false]);
  const body = async (gameId, saved, notes, who = OWNER) => ({ requestId: id(++request), revision: (await read(who)).revision, season: SEASON, week: WEEK, gameId, saved, notes });
  const s = {
    db, call, read, body, hasM09,
    games: (await read()).games.map(game => game.id),
    favorite: async (gameId, saved, notes, who = OWNER) => call('gtl_mutate_personal', [id(who), 'favorite/set', await body(gameId, saved, notes, who)]),
    row: async (gameId, who = OWNER) => (await db.query('select saved,notes from public.gtl_favorites where user_id=$1 and season=$2 and week=$3 and game_id=$4', [id(who), SEASON, WEEK, gameId])).rows[0] ?? null,
    events: async (gameId, who = OWNER) => (await db.query('select action,before_value "before",after_value "after" from public.gtl_personal_events where user_id=$1 and target=$2 order by revision', [id(who), `${SEASON}/${WEEK}/${gameId}`])).rows,
    count: async table => (await db.query(`select count(*)::int n from public.${table}`)).rows[0].n,
    // The new app's private note on a game the player never saved (D-36, stage 35). Through stage 27's writer when this
    // schema has it (M-09); otherwise the row that writer leaves under D-40: the note, and the game still not saved.
    gameSheetNote: async (gameId, note, who = OWNER) => {
      if (hasM09) await call('gtl_set_game_note', [id(who), id(++request), SEASON, WEEK, gameId, note, 0]);
      else await db.query('insert into public.gtl_favorites(user_id,season,week,game_id,saved,notes) values($1,$2,$3,$4,false,$5)', [id(who), SEASON, WEEK, gameId, note]);
    },
  };
  // gtl-api's route for the same database: cloud/personal.mjs validates, trims and maps errors as in production.
  const service = { rpc: async (name, args) => {
    try {
      return await db.transaction(async tx => {
        await tx.exec('set local role service_role');
        return (await tx.query(`select public.${name}(${Object.keys(args).map((key, i) => `${key}=>$${i + 1}`).join(',')}) value`, Object.values(args))).rows[0].value;
      });
    } catch (error) { throw providerPersonalError(error.message); }
  } };
  s.route = (route, payload, who = OWNER) => handlePersonal({ route, body: payload, user: { id: id(who) }, service });
  return s;
}

test('Save to Favorites keeps a stored note (D-40); every other save behaves as before', { skip }, async t => {
  const [old, now] = [await schema(t, BEFORE), await schema(t, ALL)];
  assert.equal(now.hasM09, HAS_M09, 'M-09 is used when this checkout has it');
  assert.equal(now.games.length, 15);

  await t.test('a note stored on a game that is not saved: the save keeps it exactly as stored; before M-29 it was written over', async () => {
    const game = now.games[0], note = '  Line moved twice.\nWatch the wind.  ';
    for (const s of [old, now]) {
      await s.gameSheetNote(game, note);
      assert.deepEqual(await s.row(game), { saved: false, notes: note });
      assert.deepEqual((await s.read()).favorites, [], 'the old reader still lists saved games only');
      assert.deepEqual(await s.favorite(game, true, ''), { revision: (await s.read()).revision, entryId: null, saved: true });
    }
    assert.deepEqual(await now.row(game), { saved: true, notes: note });
    assert.deepEqual((await now.read()).favorites.map(f => [f.gameId, f.notes]), [[game, note]]);
    assert.deepEqual((await now.events(game)).at(-1), { action: 'favorite/set', before: { saved: false, notes: note }, after: { saved: true, notes: note } });
    // The previous body: the empty note replaced the stored one, and only the audit kept the text (D-23).
    assert.deepEqual(await old.row(game), { saved: true, notes: '' });
    assert.deepEqual((await old.events(game)).at(-1), { action: 'favorite/set', before: { saved: false, notes: note }, after: { saved: true, notes: '' } });
  });

  await t.test('a game removed from Favorites and saved again gets its note back, with each step audited', async () => {
    const game = now.games[1], note = 'Revisit after the injury report';
    for (const s of [old, now]) {
      await s.favorite(game, true, ''); await s.favorite(game, true, note); await s.favorite(game, false, note);
      assert.deepEqual((await s.read()).favorites.filter(f => f.gameId === game), []);
      await s.favorite(game, true, '');
    }
    assert.deepEqual(await now.row(game), { saved: true, notes: note });
    assert.deepEqual((await now.events(game)).map(e => [e.before, e.after]), [
      [null, { saved: true, notes: '' }],
      [{ saved: true, notes: '' }, { saved: true, notes: note }],
      [{ saved: true, notes: note }, { saved: false, notes: note }],
      [{ saved: false, notes: note }, { saved: true, notes: note }],
    ]);
    assert.deepEqual(await old.row(game), { saved: true, notes: '' });
  });

  await t.test('every other save writes the note it sends, the same on the previous body and the new one', async () => {
    const cases = [
      { name: 'no row, saved with no note', request: [true, ''], expect: { saved: true, notes: '' } },
      { name: 'no row, saved with a note', request: [true, 'Fresh note'], expect: { saved: true, notes: 'Fresh note' } },
      { name: 'no row, not saved', request: [false, ''], expect: { saved: false, notes: '' } },
      { name: 'saved game, a new note', setup: [[true, 'First']], request: [true, 'Second'], expect: { saved: true, notes: 'Second' } },
      { name: 'saved game, the note edited to empty (clears it)', setup: [[true, 'First']], request: [true, ''], expect: { saved: true, notes: '' } },
      { name: 'saved game, removed with its note', setup: [[true, 'First']], request: [false, 'First'], expect: { saved: false, notes: 'First' } },
      { name: 'saved game, removed with an emptied note', setup: [[true, 'First']], request: [false, ''], expect: { saved: false, notes: '' } },
      { name: 'stored note on a game not saved, saved with a note of its own', note: 'Stored', request: [true, 'Typed'], expect: { saved: true, notes: 'Typed' } },
      { name: 'stored note on a game not saved, a request that keeps it not saved', note: 'Stored', request: [false, ''], expect: { saved: false, notes: '' } },
    ];
    for (const [i, c] of cases.entries()) {
      const game = now.games[2 + i], results = [];
      for (const s of [old, now]) {
        if (c.note) await s.gameSheetNote(game, c.note);
        for (const step of c.setup || []) await s.favorite(game, ...step);
        await s.favorite(game, ...c.request);
        results.push({ row: await s.row(game), event: (await s.events(game)).at(-1) });
      }
      assert.deepEqual(results[1].row, c.expect, c.name);
      assert.deepEqual(results[1], results[0], `${c.name}: same row and audit as the previous body`);
    }
  });

  await t.test('request-id retries replay the first answer; a stale revision is refused; two simultaneous saves give one commit', async () => {
    const game = now.games[11], note = 'Kept through a retry';
    await now.gameSheetNote(game, note);
    const request = await now.body(game, true, ''), events = await now.count('gtl_personal_events');
    const first = await now.call('gtl_mutate_personal', [id(OWNER), 'favorite/set', request]);
    assert.deepEqual(await now.call('gtl_mutate_personal', [id(OWNER), 'favorite/set', request]), first, 'a retry replays the first answer');
    assert.equal(await now.count('gtl_personal_events'), events + 1, 'and writes no second event');
    await assert.rejects(() => now.call('gtl_mutate_personal', [id(OWNER), 'favorite/set', { ...request, notes: 'Different' }]), /GTL_PERSONAL_RETRY_CONFLICT/);
    const receipt = (await now.db.query('select payload,result from public.gtl_personal_receipts where user_id=$1 and request_id=$2', [id(OWNER), request.requestId])).rows[0];
    assert.deepEqual(receipt, { payload: request, result: first }, 'the receipt holds the request as sent');
    await assert.rejects(() => now.call('gtl_mutate_personal', [id(OWNER), 'favorite/set', { ...request, requestId: id(5000), saved: false }]), /GTL_PERSONAL_CONFLICT/);
    assert.deepEqual(await now.row(game), { saved: true, notes: note });

    const other = now.games[12];
    await now.gameSheetNote(other, 'Kept once');
    const payload = await now.body(other, true, ''), before = await now.count('gtl_personal_events');
    const results = await Promise.allSettled([id(5001), id(5002)].map(requestId => now.call('gtl_mutate_personal', [id(OWNER), 'favorite/set', { ...payload, requestId }])));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.match(results.find(r => r.status === 'rejected').reason.message, /GTL_PERSONAL_CONFLICT/);
    assert.equal(await now.count('gtl_personal_events'), before + 1);
    assert.deepEqual(await now.row(other), { saved: true, notes: 'Kept once' });
  });

  await t.test('after the note comes back, an edit to empty still clears it and the audit keeps the text', async () => {
    const game = now.games[11];
    await now.favorite(game, true, '');
    assert.deepEqual(await now.row(game), { saved: true, notes: '' });
    assert.deepEqual((await now.events(game)).at(-1), { action: 'favorite/set', before: { saved: true, notes: 'Kept through a retry' }, after: { saved: true, notes: '' } });
  });

  await t.test("a save reads only the player's own row", async () => {
    const game = now.games[13], note = 'Only mine';
    await now.gameSheetNote(game, note, OWNER);
    await now.favorite(game, true, '', OTHER);
    assert.deepEqual(await now.row(game, OTHER), { saved: true, notes: '' });
    assert.deepEqual(await now.row(game, OWNER), { saved: false, notes: note });
    assert.ok(!JSON.stringify(await now.read(OTHER)).includes(note));
  });

  await t.test('through the gtl-api route: a blank note trims to empty and the stored note is kept; replies and refusals are as before', async () => {
    const game = now.games[14], note = 'Through the route\nsecond line';
    await now.gameSheetNote(game, note);
    const revision = (await now.read()).revision;
    const reply = await now.route('/favorite/set', { requestId: id(6000), revision, season: SEASON, week: WEEK, gameId: game, saved: true, notes: '   ' });
    assert.deepEqual(reply, { revision: revision + 1, entryId: null, saved: true });
    assert.deepEqual(await now.row(game), { saved: true, notes: note });
    const view = await now.route('/personal', {});
    assert.equal(view.favorites.find(f => f.gameId === game).notes, note);
    await assert.rejects(() => now.route('/favorite/set', { requestId: id(6001), revision, season: SEASON, week: WEEK, gameId: game, saved: false, notes: note }),
      error => error instanceof PersonalError && error.status === 409 && error.code === 'GTL_PERSONAL_CONFLICT');
    await assert.rejects(() => now.route('/favorite/set', { requestId: id(6000), revision, season: SEASON, week: WEEK, gameId: game, saved: true, notes: 'Changed' }),
      error => error instanceof PersonalError && error.status === 409 && error.code === 'GTL_PERSONAL_RETRY_CONFLICT');
  });
});
