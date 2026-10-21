import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepareNbaImport } from '../scripts/nba-private-import.mjs';
import { PRELUDE } from './migrations.mjs';

let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Install the optional local PGlite runtime; never tests against production.';
const filename = '20261021201054_gtl_private_nba_storage.sql';
const migration = fs.readFileSync(`supabase/migrations/${filename}`, 'utf8');
const rollback = fs.readFileSync(`supabase/rollback/${filename}`, 'utf8');
const ownerId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const importId = '00000000-0000-4000-8000-000000000003';
function ledger() {
  return { entries: ['win', 'loss', 'pending', 'push', 'void'].map((outcome, i) => ({
    id: `00000000-0000-4000-8000-00000000001${i}`, sport: 'nba', season: '2026-27', eventDate: '2026-10-01',
    kind: i === 1 ? 'parlay' : 'single', label: "Synthetic quote ' \\ $nba_import$ test", odds: i === 1 ? 250 : -120,
    stakeUnits: 0.6, outcome, netUnits: [0.5, -0.6, null, 0, 0][i],
    legs: Array.from({ length: i === 1 ? 2 : 1 }, (_, leg) => ({ gameId: `NBA:test:${leg}`, market: 'spread', team: 'AAA', line: 1.5 })),
    oddsBasis: 'Synthetic test price', stakeBasis: 'Synthetic test stake' })) };
}
async function setup() {
  const db = new PGlite();
  await db.exec(`${PRELUDE} insert into auth.users values ('${ownerId}'),('${otherId}');`);
  // Mimic a project with broadly granted defaults; schema-local revokes cannot remove global grants,
  // so the migration must also revoke each created object's effective privileges.
  await db.exec('alter default privileges grant all on tables to anon, authenticated, service_role;');
  await db.exec(migration);
  return db;
}
async function rejects(db, sql, pattern) {
  await assert.rejects(db.exec(sql), pattern);
  await db.exec('rollback; reset role;');
}

test('private NBA import is atomic, exact on retry, and does not touch an NFL sentinel', { skip }, async () => {
  const db = await setup();
  try {
    await db.exec("create table public.nfl_sentinel (state jsonb);insert into public.nfl_sentinel values ('{\"net\":12.345}');");
    const original = ledger();
    const prepared = prepareNbaImport(JSON.stringify(original), { ownerId, importId });
    await db.exec(prepared.sql);
    await db.exec(prepared.sql);
    assert.equal((await db.query('select count(*)::int n from nba_private.bet_imports')).rows[0].n, 1);
    const rows = (await db.query('select source_record,net_units from nba_private.bets order by id')).rows;
    assert.deepEqual(rows.map(r => r.source_record), original.entries);
    assert.deepEqual(rows.map(r => r.net_units), ['0.50000000', '-0.60000000', null, '0.00000000', '0.00000000']);
    const modified = ledger(); modified.entries[0].label = 'Different source';
    await rejects(db, prepareNbaImport(JSON.stringify(modified), { ownerId, importId }).sql, /NBA_IMPORT_CONFLICT/);
    await rejects(db, prepareNbaImport(JSON.stringify(original), { ownerId: otherId, importId: '00000000-0000-4000-8000-000000000004' }).sql, /NBA_TICKET_CONFLICT/);
    assert.equal((await db.query('select count(*)::int n from nba_private.bet_imports')).rows[0].n, 1, 'failed import rolls back receipt');
    assert.deepEqual((await db.query('select state from public.nfl_sentinel')).rows, [{ state: { net: 12.345 } }]);
    await db.exec(migration);
    await db.exec(rollback);
    assert.equal((await db.query('select count(*)::int n from nba_private.bets')).rows[0].n, 5, 'retry and off switch preserve data');
  } finally { await db.close(); }
});

test('NBA schema denies all app roles, including the NFL service role, and forces RLS', { skip }, async () => {
  const db = await setup();
  try {
    await db.exec(prepareNbaImport(JSON.stringify(ledger()), { ownerId, importId }).sql);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const sql of ['select * from nba_private.bets', 'delete from nba_private.bets', "update nba_private.bets set outcome='loss'", 'select * from nba_private.bet_imports']) {
        await rejects(db, `begin;set local role ${role};${sql};commit;`, /permission denied/);
      }
      assert.equal((await db.query(`select has_schema_privilege('${role}','nba_private','USAGE') allowed`)).rows[0].allowed, false);
    }
    const tables = (await db.query("select relrowsecurity,relforcerowsecurity from pg_class where relnamespace='nba_private'::regnamespace and relkind='r'")).rows;
    assert.equal(tables.length, 2);
    assert.ok(tables.every(t => t.relrowsecurity && t.relforcerowsecurity));
    assert.equal((await db.query("select count(*)::int n from pg_policies where schemaname='nba_private'")).rows[0].n, 0);
    // RLS still denies a non-bypass app role even if a future administrator mistakenly grants access.
    await db.exec('grant usage on schema nba_private to authenticated;grant select on nba_private.bets to authenticated;set role authenticated;');
    assert.equal((await db.query('select count(*)::int n from nba_private.bets')).rows[0].n, 0);
    await db.exec('reset role;'); await db.exec(rollback);
    assert.equal((await db.query("select has_schema_privilege('authenticated','nba_private','USAGE') allowed")).rows[0].allowed, false);
  } finally { await db.close(); }
});

test('NBA storage rejects invalid units, non-NBA records and mismatched account ownership', { skip }, async () => {
  const db = await setup();
  try {
    await db.exec(prepareNbaImport(JSON.stringify(ledger()), { ownerId, importId }).sql);
    await rejects(db, `update nba_private.bets set owner_id='${otherId}';`, /foreign key/);
    for (const sql of ["update nba_private.bets set odds=0", "update nba_private.bets set stake_units='NaN'", "update nba_private.bets set stake_units=-1", "update nba_private.bets set sport='nfl'", "update nba_private.bets set legs='[]'"]) {
      await rejects(db, sql, /check constraint/);
    }
    await rejects(db, 'update nba_private.bets set net_units=123;', /can only be updated to DEFAULT/);
  } finally { await db.close(); }
});

test('import preparation refuses inconsistent results, duplicate IDs and non-NBA legs', () => {
  for (const modify of [d => d.entries[0].netUnits = 999, d => d.entries.push(d.entries[0]), d => d.entries[0].legs[0].gameId = 'NFL:test']) {
    const source = ledger(); modify(source);
    assert.throws(() => prepareNbaImport(JSON.stringify(source), { ownerId, importId }));
  }
});
