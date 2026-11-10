// Apply-order safety for the November 10 migration packet (docs/MIGRATION_APPLY_PACKET_2026_11_10.md, contradiction 1).
// The packet's recommended batch applies M-42..M-45 before the held M-33/M-34/M-35. M-34 and M-44 both rewrite
// gtl_epl_jobs_schedule_job_check, so M-34 applied after M-44 must neither fail over a saved 'results' row nor stop
// admitting 'results'. Both orders run here on PGlite. No hosted connection.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL, PRELUDE, migrationSql, version } from './migrations.mjs';

let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';

const M33 = 20261029151727, M34 = 20261029161613, M35 = 20261029162144, M44 = 20261110120000;
const HELD = [M33, M34, M35];
const JOBS = ['snapshot', 'fixtures', 'resolve', 'settle', 'nudge', 'dnb-check', 'standings', 'moneyline', 'results'];
const file = v => ALL.find(name => version(name) === v);
const BATCH_FIRST = [...ALL.filter(name => !HELD.includes(version(name))), ...HELD.map(file)];

async function open(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(PRELUDE);
  return db;
}
const apply = async (db, files, before = {}) => {
  for (const name of files) { await before[version(name)]?.(); await db.exec(migrationSql(name)); }
};
const definition = async db => (await db.query("select pg_get_constraintdef(oid) def from pg_constraint where conname='gtl_epl_jobs_schedule_job_check'")).rows.map(r => r.def);
async function assertAdmitsEveryJob(db) {
  const defs = await definition(db);
  assert.equal(defs.length, 1);
  for (const job of JOBS) assert.match(defs[0], new RegExp(`'${job}'`), job);
  await db.exec("insert into public.gtl_epl_jobs_schedule(job,enabled) values('results',false) on conflict(job) do update set enabled=false");
  for (const job of JOBS) await db.query('insert into public.gtl_epl_jobs_schedule(job,enabled) values($1,false) on conflict(job) do nothing', [job]);
  assert.equal((await db.query("select count(*)::int n from public.gtl_epl_jobs_schedule where job='results'")).rows[0].n, 1);
  await assert.rejects(() => db.query("insert into public.gtl_epl_jobs_schedule(job) values('other')"), /gtl_epl_jobs_schedule_job_check/);
}

test('the batch order applies M-42..M-45 first, then M-33/M-34/M-35, and keeps a saved results row admitted', { skip }, async t => {
  assert.ok(BATCH_FIRST.indexOf(file(M44)) < BATCH_FIRST.indexOf(file(M34)));
  const db = await open(t);
  // As supabase/admin/epl_results_cron.sql would after M-44: a disabled results row exists before M-34 arrives.
  await apply(db, BATCH_FIRST, { [M33]: () => db.exec("insert into public.gtl_epl_jobs_schedule(job,enabled) values('results',false)") });
  await assertAdmitsEveryJob(db);
  assert.equal((await db.query("select public.gtl_epl_dispatch_jobs('results') r")).rows[0].r.status, 'disabled');
});

test('M-34 after M-44 with no results row yet still admits a later results insert', { skip }, async t => {
  const db = await open(t);
  await apply(db, BATCH_FIRST);
  await assertAdmitsEveryJob(db);
});

test('filename order admits results, and re-running M-34 afterwards narrows nothing', { skip }, async t => {
  const db = await open(t);
  await apply(db, ALL);
  await assertAdmitsEveryJob(db);
  await db.exec(migrationSql(file(M34)));
  await assertAdmitsEveryJob(db);
});

test('M-34 keeps any job a later migration added, not only the nine it names', { skip }, async t => {
  const db = await open(t);
  await apply(db, BATCH_FIRST.filter(name => version(name) < M34));
  await db.exec(`alter table public.gtl_epl_jobs_schedule drop constraint gtl_epl_jobs_schedule_job_check;
    alter table public.gtl_epl_jobs_schedule add constraint gtl_epl_jobs_schedule_job_check check(job in (${[...JOBS, 'later-job'].map(j => `'${j}'`).join(',')}));
    insert into public.gtl_epl_jobs_schedule(job,enabled) values('later-job',false);`);
  await db.exec(migrationSql(file(M34)));
  await assertAdmitsEveryJob(db);
  assert.match((await definition(db))[0], /'later-job'/);
});
