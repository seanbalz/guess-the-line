// D-82 Player Props storage (supabase/migrations/20261110130000_gtl_player_props.sql) on local PGlite only; it never
// connects to the hosted project. The migration is written and NOT applied, so this suite runs on ALL. Fixture
// accounts, identities and values only: no real player guesses, market lines or quotes.
// Optional disposable PostgreSQL runtime.
// Install: npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ALL, HOSTED, MIGRATIONS_DIR, NOT_HOSTED, PRELUDE, ROLLBACK_DIR, migrationSql, version } from './migrations.mjs';
import { catalog, parseFunctions, readMigrations } from '../scripts/migration-functions.mjs';
import { propAccuracy, propPaperRecord } from '../shared/player-props.mjs';

let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';

const MIGRATION = '20261110130000_gtl_player_props.sql';
const TABLES = ['gtl_prop_capability', 'gtl_prop_offers', 'gtl_prop_references', 'gtl_prop_guesses', 'gtl_prop_guess_events', 'gtl_prop_results'];
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const USERS = { troy: id(1), luke: id(2), gone: id(3), stranger: id(4) };
const EVENT = '2026_10_DAL_PHI', LATE = '2026_10_NYG_WAS', PLAYER = '00-0036358', RB = '00-0037000';
const iso = ms => new Date(ms).toISOString();

async function fixture(t, { ready = true } = {}) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(PRELUDE);
  for (const file of ALL) await db.exec(migrationSql(file));
  for (const [who, uid] of Object.entries(USERS)) {
    await db.query('insert into auth.users values($1)', [uid]);
    if (who !== 'stranger') await db.query('insert into public.gtl_profiles(user_id,display_name) values($1,$2)', [uid, `${who} Fixture`]);
  }
  await db.query('insert into public.gtl_community_removals(user_id,removed_by) values($1,$2)', [USERS.gone, USERS.troy]);
  if (ready) await db.exec('update public.gtl_prop_capability set live_lock_in=true');
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const sql = (name, args) => as('service_role', `select public.${name}(${Object.keys(args).map((k, i) => `${k}=>$${i + 1}`).join(',')}) value`, Object.values(args)).then(r => r.rows[0].value);
  const now = Date.now();
  const offer = (eventId, playerId, stat, kickoff, extra = {}) => sql('gtl_props_record_offer', { p_offer: { season: 2026, week: 10, eventId, playerId, stat,
    playerName: 'Fixture Receiver', team: eventId.includes('DAL') ? 'DAL' : 'NYG', position: 'WR', away: eventId.includes('DAL') ? 'DAL' : 'NYG',
    home: eventId.includes('DAL') ? 'PHI' : 'WAS', kickoff: iso(kickoff), source: 'fixture roster + schedule', ...extra } });
  const books = (lines, at = now - 10 * 60_000) => ['draftkings', 'fanduel', 'betmgm'].map((book, i) => ({ book, line: lines[i], observedAt: iso(at - i * 60_000) }));
  const reference = (stat, lines, opts = {}) => sql('gtl_props_record_reference', { p_event_id: opts.eventId ?? EVENT, p_player_id: opts.playerId ?? PLAYER,
    p_stat: stat, p_line: opts.line ?? [...lines].sort((a, b) => a - b)[1], p_books: opts.books ?? books(lines, opts.at) });
  const write = (fn, who, stat, guess, opts = {}) => sql(fn, { p_user: USERS[who], p_request: opts.request ?? randomUUID(), p_event_id: opts.eventId ?? EVENT,
    p_player_id: opts.playerId ?? PLAYER, p_stat: stat, p_guess: guess });
  const draft = (...a) => write('gtl_props_save_draft', ...a);
  const lock = (...a) => write('gtl_props_lock_in', ...a);
  const board = who => sql('gtl_props_board', { p_user: USERS[who], p_season: 2026, p_week: 10 });
  const count = async (table, where = 'true', args = []) => (await db.query(`select count(*)::int n from public.${table} where ${where}`, args)).rows[0].n;
  const guessRow = async (who, stat) => (await db.query('select * from public.gtl_prop_guesses where user_id=$1 and stat=$2', [USERS[who], stat])).rows[0];
  await offer(EVENT, PLAYER, 'player_reception_yds', now + 86_400_000);
  await offer(EVENT, PLAYER, 'player_receptions', now + 86_400_000);
  await offer(EVENT, RB, 'player_rush_yds', now + 86_400_000, { position: 'RB', playerName: 'Fixture Back' });
  return { db, as, sql, offer, books, reference, draft, lock, board, count, guessRow, now };
}

test('D-82 migration: new gtl_props_* functions and gtl_prop_* tables only, written and not hosted, no rollback file', () => {
  assert.ok(ALL.includes(MIGRATION));
  assert.ok(NOT_HOSTED.includes(version(MIGRATION)), 'listed as not hosted until Sean\'s named apply');
  assert.ok(!HOSTED.includes(MIGRATION));
  assert.ok(version(MIGRATION) >= 20261110130000);
  const source = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf8');
  const before = catalog(readMigrations(ALL.filter(file => file < MIGRATION))).latest;
  for (const fn of parseFunctions(source, MIGRATION)) {
    assert.match(fn.name, /^gtl_props_/);
    assert.equal(before.has(`${fn.schema}.${fn.name}`), false, `${fn.name} is new`);
  }
  assert.ok(!fs.existsSync(path.join(ROLLBACK_DIR, MIGRATION)), 'replaces nothing, so it needs no rollback file');
  assert.doesNotMatch(source, /\b(drop|truncate|delete\s+from)\b/i);
  assert.doesNotMatch(source, /live_lock_in\s*=\s*true/i, 'no statement turns the mode on');
  const referenced = new Set([...source.matchAll(/public\.(gtl_[a-z_]+)/g)].map(m => m[1]).filter(name => !/^gtl_props?_/.test(name)));
  assert.deepEqual([...referenced].sort(), ['gtl_community_member'], 'Spread/Total, game-line calibration and other objects are not touched');
});

test('ships dark: live_lock_in starts false, writers refuse GTL_PROPS_OFF, the board offers nothing', { skip }, async t => {
  const f = await fixture(t, { ready: false });
  assert.equal((await f.db.query('select live_lock_in from public.gtl_prop_capability')).rows[0].live_lock_in, false);
  await f.reference('player_reception_yds', [66.5, 67.5, 68.5]);
  await assert.rejects(f.draft('troy', 'player_reception_yds', 72.5), /GTL_PROPS_OFF/);
  await assert.rejects(f.lock('troy', 'player_reception_yds', 72.5), /GTL_PROPS_OFF/);
  const board = await f.board('troy');
  assert.equal(board.ready, false); assert.deepEqual(board.offers, []); assert.deepEqual(board.own, []);
  assert.deepEqual(await f.sql('gtl_props_capability', {}), { ready: false });
  assert.equal(await f.count('gtl_prop_guesses'), 0);
});

test('browsers hold no grants: anon and authenticated can read no table and call no function', { skip }, async t => {
  const f = await fixture(t);
  for (const role of ['anon', 'authenticated']) {
    for (const table of TABLES) {
      const { rows } = await f.db.query(`select has_table_privilege($1,'public.${table}','select,insert,update,delete') ok`, [role]);
      assert.equal(rows[0].ok, false, `${role} on ${table}`);
    }
    const fns = (await f.db.query("select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'gtl_props_%'")).rows;
    assert.ok(fns.length >= 15);
    for (const { sig } of fns) assert.equal((await f.db.query('select has_function_privilege($1,$2,\'execute\') ok', [role, sig])).rows[0].ok, false, `${role} ${sig}`);
    await assert.rejects(f.as(role, 'select * from public.gtl_prop_guesses'), /permission denied/);
  }
  assert.equal((await f.db.query("select count(*)::int n from pg_class where relname like 'gtl_prop_%' and relkind='r' and not relrowsecurity")).rows[0].n, 0, 'RLS on every table');
});

test('owner-only audited drafts: editable before kickoff, one row per exact selection, other stats independent', { skip }, async t => {
  const f = await fixture(t);
  const first = await f.draft('troy', 'player_reception_yds', 70);
  assert.equal(first.status, 'draft'); assert.equal(first.reference, null); assert.equal(first.replayed, false);
  await f.draft('troy', 'player_reception_yds', 72.5);
  await f.draft('troy', 'player_receptions', 5.5);
  assert.equal(await f.count('gtl_prop_guesses', 'user_id=$1', [USERS.troy]), 2, 'a different stat for the same athlete is independent');
  assert.equal(Number((await f.guessRow('troy', 'player_reception_yds')).guess), 72.5);
  assert.equal(await f.count('gtl_prop_guess_events', "user_id=$1 and action='draft'", [USERS.troy]), 3, 'every save is audited (D-23)');
  const own = (await f.board('troy')).own;
  assert.equal(own.length, 2);
  assert.ok(own.every(g => g.reference === null && g.latest === null), 'a draft never carries a market number');
  assert.deepEqual((await f.board('luke')).own, [], 'another member never sees my draft');
  await assert.rejects(f.draft('gone', 'player_reception_yds', 70), /GTL_COMMUNITY_MEMBER/);
  await assert.rejects(f.draft('stranger', 'player_reception_yds', 70), /GTL_COMMUNITY_MEMBER/);
  await assert.rejects(f.board('stranger'), /GTL_COMMUNITY_MEMBER/);
});

test('signed yards vs nonnegative counts are enforced in SQL exactly as in the shared domain', { skip }, async t => {
  const f = await fixture(t);
  assert.equal(Number((await f.draft('troy', 'player_rush_yds', -2.5, { playerId: RB })).guess), -2.5);
  await assert.rejects(f.draft('troy', 'player_receptions', -0.5), /GTL_PROPS_INVALID/);
  await assert.rejects(f.draft('troy', 'player_reception_yds', 72.25), /GTL_PROPS_INVALID/);
  await assert.rejects(f.draft('troy', 'player_reception_yds', 400.5), /GTL_PROPS_INVALID/);
  await assert.rejects(f.draft('troy', 'player_pass_yds', 200), /GTL_PROPS_INVALID/, 'a stat without an offer for that player');
  assert.equal(await f.sql('gtl_props_valid_value', { p_stat: 'player_pass_interceptions', p_value: 0 }), true);
  assert.equal(await f.sql('gtl_props_valid_value', { p_stat: 'player_pass_interceptions', p_value: -1 }), false);
});

test('reference receipts: exactly three permitted books, half-point lines, time-aligned, within +/-5 of the median, never repaired', { skip }, async t => {
  const f = await fixture(t);
  const ok = await f.reference('player_reception_yds', [66.5, 67.5, 70.5]);
  assert.equal(Number(ok.line), 67.5); assert.equal(ok.books.length, 3); assert.equal(ok.provider, 'the-odds-api');
  const refused = async (lines, opts) => assert.rejects(f.reference('player_reception_yds', lines, opts), /GTL_PROPS_REFERENCE_UNAVAILABLE/);
  await refused([60.5, 67.5, 70.5]); // 7 yards from the median
  await refused([66.5, 67.5, 70.5], { line: 68.5 }); // the median is computed, not supplied
  await refused([66.5, 67.5, 70.5], { books: f.books([66.5, 67.5, 70.5]).slice(0, 2) });
  await refused([66.5, 67.5, 70.5], { books: f.books([66.5, 67.5, 70.5]).map((b, i) => i ? b : { ...b, book: 'caesars' }) });
  await refused([66.5, 67.5, 70.25]);
  await refused([66.5, 67.5, 70.5], { at: f.now - 7 * 3_600_000 }); // older than six hours
  await refused([66.5, 67.5, 70.5], { at: f.now + 3_600_000 }); // after now
  await refused([66.5, 67.5, 70.5], { books: f.books([66.5, 67.5, 70.5]).map((b, i) => i === 2 ? { ...b, observedAt: iso(f.now - 50 * 60_000) } : b) }); // not aligned
  await assert.rejects(f.db.query('update public.gtl_prop_references set line=1'), /GTL_PROPS_APPEND_ONLY/);
  await assert.rejects(f.db.query('delete from public.gtl_prop_references'), /GTL_PROPS_APPEND_ONLY/);
  assert.equal(await f.count('gtl_prop_references'), 1);
});

test('lock without a qualifying reference is refused and the draft is kept intact', { skip }, async t => {
  const f = await fixture(t);
  await f.draft('troy', 'player_reception_yds', 72.5);
  await assert.rejects(f.lock('troy', 'player_reception_yds', 72.5), /GTL_PROPS_REFERENCE_UNAVAILABLE/);
  const row = await f.guessRow('troy', 'player_reception_yds');
  assert.equal(row.status, 'draft'); assert.equal(Number(row.guess), 72.5); assert.equal(row.reference_id, null);
  assert.equal(await f.count('gtl_prop_guess_events', "action='lock'"), 0, 'a refused lock writes nothing');
});

test('lock-in is final, per prop and idempotent; later lines never rewrite the saved reference', { skip }, async t => {
  const f = await fixture(t);
  await f.reference('player_reception_yds', [66.5, 67.5, 68.5]);
  const request = randomUUID();
  const locked = await f.lock('troy', 'player_reception_yds', 72.5, { request });
  assert.equal(locked.status, 'locked'); assert.equal(Number(locked.reference.line), 67.5); assert.equal(locked.replayed, false);
  assert.equal((await f.lock('troy', 'player_reception_yds', 72.5, { request })).replayed, true, 'the same request replays');
  assert.equal((await f.lock('troy', 'player_reception_yds', 72.5)).replayed, true, 'a repeated lock of the same value is idempotent');
  await assert.rejects(f.lock('troy', 'player_reception_yds', 75), /GTL_PROPS_LOCKED/);
  await assert.rejects(f.draft('troy', 'player_reception_yds', 75), /GTL_PROPS_LOCKED/);
  await assert.rejects(f.lock('troy', 'player_receptions', 5.5, { request }), /GTL_PROPS_RETRY_CONFLICT/, 'a request ID cannot be reused for another selection');
  await assert.rejects(f.db.query("update public.gtl_prop_guesses set guess=80 where stat='player_reception_yds'"), /GTL_PROPS_LOCKED/);
  await assert.rejects(f.db.query('delete from public.gtl_prop_guesses'), /GTL_PROPS_APPEND_ONLY/);
  // A later, different line is recorded separately and shown as the latest market; the saved reference stays.
  const later = await f.sql('gtl_props_record_reference', { p_event_id: EVENT, p_player_id: PLAYER, p_stat: 'player_reception_yds', p_line: 74.5,
    p_books: f.books([73.5, 74.5, 75.5], f.now - 60_000) });
  const own = (await f.board('troy')).own.find(g => g.stat === 'player_reception_yds');
  assert.equal(Number(own.reference.line), 67.5, 'saved reference unchanged');
  assert.equal(Number(own.latest.line), Number(later.line), 'latest recorded line kept separately');
  assert.equal(await f.count('gtl_prop_guess_events', "action='lock'"), 1);
  // Another stat for the same athlete still locks independently.
  await assert.rejects(f.lock('troy', 'player_receptions', 5.5), /GTL_PROPS_REFERENCE_UNAVAILABLE/);
  assert.equal((await f.guessRow('troy', 'player_reception_yds')).status, 'locked');
});

test('concurrent lock attempts with different values leave exactly one final guess', { skip }, async t => {
  const f = await fixture(t);
  await f.reference('player_reception_yds', [66.5, 67.5, 68.5]);
  const results = await Promise.allSettled([70, 71, 72, 73].map(guess => f.lock('luke', 'player_reception_yds', guess)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.ok(results.filter(r => r.status === 'rejected').every(r => /GTL_PROPS_LOCKED/.test(r.reason.message)));
  assert.equal(await f.count('gtl_prop_guesses', "status='locked'"), 1);
});

test('server kickoff: no draft or lock at or after kickoff; the existing draft is preserved', { skip }, async t => {
  const f = await fixture(t);
  await f.offer(LATE, PLAYER, 'player_reception_yds', f.now - 60_000);
  await assert.rejects(f.draft('troy', 'player_reception_yds', 50, { eventId: LATE }), /GTL_PROPS_CLOSED/);
  await f.draft('troy', 'player_receptions', 4.5);
  await f.reference('player_receptions', [3.5, 4.5, 4.5]);
  await f.db.query("update public.gtl_prop_offers set kickoff=clock_timestamp()-interval '1 minute' where stat='player_receptions'");
  await assert.rejects(f.lock('troy', 'player_receptions', 4.5), /GTL_PROPS_CLOSED/);
  assert.equal((await f.guessRow('troy', 'player_receptions')).status, 'draft');
  await assert.rejects(f.db.query("update public.gtl_prop_offers set player_id='00-0000001' where stat='player_receptions'"), /GTL_PROPS_INVALID/, 'identity is fixed');
});

test('results are append-only versions; history gives the saved reference, the last pre-kickoff line and the newest result', { skip }, async t => {
  const f = await fixture(t);
  await f.reference('player_reception_yds', [66.5, 67.5, 68.5]);
  await f.lock('troy', 'player_reception_yds', 72.5);
  await f.reference('player_receptions', [4.5, 4.5, 5.5]);
  await f.lock('troy', 'player_receptions', 5.5);
  await f.draft('troy', 'player_rush_yds', 30, { playerId: RB });
  await f.reference('player_reception_yds', [69.5, 70.5, 70.5], { at: f.now - 60_000 });
  await f.db.query("update public.gtl_prop_offers set kickoff=clock_timestamp()-interval '20 seconds'");
  const SHA = 'a'.repeat(64), result = (stat, extra) => f.sql('gtl_props_record_result', { p_result: { eventId: EVENT, playerId: PLAYER, stat, source: 'fixture stats', sourceSha256: SHA, observedAt: iso(f.now), ...extra } });
  await assert.rejects(result('player_reception_yds', { status: 'final', actual: 0 }), /check constraint|violates/, 'a final zero needs participation');
  await assert.rejects(result('player_receptions', { status: 'final', actual: -1, participated: true }), /GTL_PROPS_INVALID/);
  await result('player_reception_yds', { status: 'correction_pending' });
  const v2 = await result('player_reception_yds', { status: 'final', actual: 80, participated: true });
  assert.equal(v2.version, 2);
  await assert.rejects(f.db.query('update public.gtl_prop_results set actual=1'), /GTL_PROPS_APPEND_ONLY/);
  const history = await f.sql('gtl_props_history', { p_user: USERS.troy, p_from_season: 2026, p_from_week: 1, p_to_season: 2026, p_to_week: 18 });
  assert.equal(history.complete, true);
  assert.equal(history.rows.length, 2, 'locked guesses only; the draft is not a record');
  const yards = history.rows.find(r => r.stat === 'player_reception_yds');
  assert.equal(Number(yards.reference.line), 67.5); assert.equal(Number(yards.closingLine), 70.5); assert.equal(yards.result.actual, 80);
  const rows = history.rows.map(r => ({ ...r, guess: Number(r.guess), reference: { line: Number(r.reference.line) }, closingLine: Number(r.closingLine) }));
  const accuracy = propAccuracy(rows);
  assert.deepEqual(accuracy.map(a => [a.stat, a.mean]), [['player_reception_yds', 5], ['player_receptions', 1]]);
  const paper = propPaperRecord(rows);
  assert.equal(paper.wins, 1); assert.deepEqual(paper.ungraded, { no_final: 1 }, 'no result yet stays ungraded');
  assert.deepEqual((await f.sql('gtl_props_history', { p_user: USERS.luke, p_from_season: 2026, p_from_week: 1, p_to_season: 2026, p_to_week: 18 })).rows, []);
  await assert.rejects(f.sql('gtl_props_history', { p_user: USERS.troy, p_from_season: 2026, p_from_week: 9, p_to_season: 2026, p_to_week: 1 }), /GTL_PROPS_INVALID/);
});
