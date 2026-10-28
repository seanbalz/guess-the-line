// M-30 executed on PGlite: the save_pick, resolve, seed and settle RPCs run for real (the static checks in
// epl-migration.test.mjs cannot catch a runtime SQL error).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PRELUDE } from './migrations.mjs';
const { PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js');

const FILE = 'supabase/migrations/20261028180000_gtl_epl_pick_a_team.sql';
const U = n => `00000000-0000-4000-8000-00000000000${n}`;
const A = '719658248843632640', B = '473955676301815808', C = '702644837370929152'; // Evan, Sean, Steven
const KICK = '2026-11-07T12:30:00Z', BEFORE = '2026-11-06T12:00:00Z', AFTER = '2026-11-07T13:00:00Z';

async function setup(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(PRELUDE);
  await db.exec(fs.readFileSync('supabase/migrations/20261008164249_gtl_private_cloud_state.sql', 'utf8'));
  await db.exec('alter default privileges grant all on tables to anon,authenticated,service_role;');
  await db.exec(fs.readFileSync(FILE, 'utf8'));
  await db.exec(`insert into auth.users values ('${U(1)}'),('${U(2)}'),('${U(3)}'),('${U(4)}');
    update public.gtl_epl_managers set user_id='${U(1)}' where owner_id='${A}';
    update public.gtl_epl_managers set user_id='${U(2)}' where owner_id='${B}';
    update public.gtl_epl_managers set user_id='${U(3)}' where owner_id='${C}';
    insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order,status)
      values(2026,9,'2026-11-02T08:00:00Z','2026-11-09T08:00:00Z','${KICK}','{${A},${B},${C}}','open');
    insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time) values
      ('e1',2026,9,'Arsenal','Chelsea','${KICK}'),('e2',2026,9,'Liverpool','Everton','${KICK}'),('e3',2026,9,'Spurs','Fulham','${KICK}');`);
  const call = async (sql, params = []) => (await db.query(sql, params)).rows[0].r;
  const pick = (user, club, now = BEFORE) => call('select public.gtl_epl_save_pick($1,2026,9,$2,$3) r', [user, club, now]);
  return { db, call, pick };
}

test('save_pick enforces turn, club availability and the deadline', async t => {
  const { db, pick } = await setup(t);
  await assert.rejects(pick(U(2), 'Liverpool'), /GTL_EPL_NOT_YOUR_TURN/, 'second manager cannot go first');
  await assert.rejects(pick(U(4), 'Liverpool'), /GTL_EPL_NOT_YOUR_TURN/, 'a non-manager has no turn');
  await assert.rejects(pick(U(1), 'Wolves'), /GTL_EPL_CLUB_NOT_PLAYING/);
  await assert.rejects(pick(U(1), 'Arsenal', AFTER), /GTL_EPL_DRAFT_CLOSED/);
  const first = await pick(U(1), 'Arsenal');
  assert.equal(first.action, 'pick'); assert.equal(first.club, 'Arsenal');
  await assert.rejects(pick(U(2), 'Arsenal'), /GTL_EPL_CLUB_TAKEN/);
  await assert.rejects(pick(U(3), 'Liverpool'), /GTL_EPL_NOT_YOUR_TURN/, 'third waits for second');
  const second = await pick(U(2), 'Liverpool');
  assert.equal(second.action, 'pick');
  const rows = (await db.query('select owner_id,club,final from public.gtl_epl_picks order by owner_id')).rows;
  assert.deepEqual(rows.find(r => r.owner_id === A), { owner_id: A, club: 'Arsenal', final: true }, 'previous pick final once the next manager picks');
  assert.equal(rows.find(r => r.owner_id === B).final, false);
  await assert.rejects(pick(U(1), 'Spurs'), /GTL_EPL_NOT_YOUR_TURN/, 'a final pick cannot change');
  const change = await pick(U(2), 'Spurs');
  assert.equal(change.action, 'change');
  assert.equal((await pick(U(2), 'Spurs')).action, 'unchanged');
  assert.equal((await db.query("select count(*)::int n from public.gtl_epl_pick_history")).rows[0].n, 3, 'pick, pick, change; unchanged writes nothing');
  assert.deepEqual((await db.query('select owner_id,club,action from public.gtl_epl_pick_history order by id')).rows.map(r => r.action), ['pick', 'pick', 'change']);
});

test('two managers racing for one club: exactly one succeeds', async t => {
  const { pick, db } = await setup(t);
  await pick(U(1), 'Arsenal');
  const results = await Promise.allSettled([pick(U(2), 'Liverpool'), pick(U(3), 'Liverpool')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const lost = results.find(r => r.status === 'rejected');
  assert.match(String(lost.reason), /GTL_EPL_CLUB_TAKEN|GTL_EPL_NOT_YOUR_TURN/);
  assert.equal((await db.query("select count(*)::int n from public.gtl_epl_picks where club='Liverpool'")).rows[0].n, 1);
});

test('resolve_week fills gaps once and is idempotent', async t => {
  const { call, pick, db } = await setup(t);
  await pick(U(1), 'Arsenal');
  const rows = JSON.stringify([{ owner_id: B, club: 'Liverpool', source: 'queue' }, { owner_id: C, club: null, source: 'none' }]);
  const first = await call('select public.gtl_epl_resolve_week(2026,9,$1::jsonb) r', [rows]);
  assert.equal(first.added, 2); assert.equal(first.status, 'resolved');
  const again = await call('select public.gtl_epl_resolve_week(2026,9,$1::jsonb) r', [rows]);
  assert.equal(again.added, 0);
  assert.equal((await db.query('select count(*)::int n from public.gtl_epl_picks')).rows[0].n, 3);
  assert.equal((await db.query('select count(*)::int n from public.gtl_epl_pick_history')).rows[0].n, 3);
  assert.equal((await db.query('select count(*)::int n from public.gtl_epl_picks where not final')).rows[0].n, 0);
});

test('settle_week awards once and opens the next week once', async t => {
  const { call, db } = await setup(t);
  await assert.rejects(call('select public.gtl_epl_settle_week(2026,9,$1::jsonb,null) r', ['[]']), /GTL_EPL_NOT_RESOLVED/);
  await call('select public.gtl_epl_resolve_week(2026,9,$1::jsonb) r', ['[]']);
  const awards = JSON.stringify([{ owner_id: A, points: 3, margin: 2, club: 'Arsenal' }]);
  const next = JSON.stringify({ week: 10, window_start: '2026-11-09T08:00:00Z', window_end: '2026-11-16T08:00:00Z', first_kickoff: '2026-11-14T12:30:00Z', pick_order: [C, B, A] });
  const first = await call('select public.gtl_epl_settle_week(2026,9,$1::jsonb,$2::jsonb) r', [awards, next]);
  assert.equal(first.awarded, 1); assert.equal(first.nextOpened, true);
  const again = await call('select public.gtl_epl_settle_week(2026,9,$1::jsonb,$2::jsonb) r', [awards, next]);
  assert.equal(again.awarded, 0); assert.equal(again.nextOpened, false);
  assert.deepEqual((await db.query('select status,pick_order from public.gtl_epl_weeks where week=10')).rows, [{ status: 'open', pick_order: [C, B, A] }]);
});

test('seed_week hand-seeds a week, refuses once a real pick exists, and reruns cleanly', async t => {
  const { call, pick, db } = await setup(t);
  await db.exec('delete from public.gtl_epl_weeks');
  const args = [JSON.stringify([{ owner_id: A, club: 'Arsenal', picked_at: '2026-11-03T10:00:00Z' }, { owner_id: B, club: 'Liverpool' }])];
  const sql = `select public.gtl_epl_seed_week(2026,9,'2026-11-02T08:00:00Z','2026-11-09T08:00:00Z','${KICK}',array['${A}','${B}','${C}'],$1::jsonb) r`;
  assert.equal((await call(sql, args)).seeded, 2);
  assert.equal((await call(sql, args)).seeded, 2, 'rerun is allowed while only seeded picks exist');
  const rows = (await db.query('select owner_id,source,final from public.gtl_epl_picks')).rows;
  const by = id => rows.find(r => r.owner_id === id);
  assert.deepEqual([by(A), by(B)].map(r => [r.source, r.final]), [['seeded', true], ['seeded', false]], 'all but the latest are final');
  await db.exec(`insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time) values('e1',2026,9,'Arsenal','Chelsea','${KICK}'),('e2',2026,9,'Spurs','Fulham','${KICK}') on conflict do nothing`);
  await pick(U(3), 'Spurs'); // the third manager is next in order
  await assert.rejects(call(sql, args), /GTL_EPL_SEED_REFUSED/);
});

test('the migration applies twice without error or duplicate rows', async t => {
  const { db } = await setup(t);
  await db.exec(fs.readFileSync(FILE, 'utf8'));
  assert.equal((await db.query('select count(*)::int n from public.gtl_epl_managers')).rows[0].n, 8);
});
