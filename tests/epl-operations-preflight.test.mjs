import test from 'node:test';
import assert from 'node:assert/strict';
import { eplFunctionExpectations, eplOperationsPreflightSql } from '../scripts/epl-operations-preflight.mjs';
import { createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { ALL, HOSTED, NOT_HOSTED } from './migrations.mjs';
import { readMigrations } from '../scripts/migration-functions.mjs';

test('EPL operational readback follows latest replacement bodies and refuses an empty catalog', () => {
  const expectations = eplFunctionExpectations();
  assert.ok(expectations.length > 0);
  assert.equal(expectations.find(fn => fn.name === 'gtl_epl_link_manager').file, '20261029060000_gtl_epl_open_access.sql');
  assert.equal(expectations.find(fn => fn.name === 'gtl_epl_link_manager').md5, '17a03bd9cbc92fc826a1ad91f4b1a714');
  assert.throws(() => eplOperationsPreflightSql([]), /No EPL function/);
  const source = eplFunctionExpectations(readMigrations(ALL));
  assert.ok(source.some(fn => fn.name === 'gtl_epl_save_guess'), 'all-source readiness includes moneyline');
  if (NOT_HOSTED.includes(20261029150000)) {
    assert.equal(expectations.some(fn => fn.name === 'gtl_epl_save_guess'), false, 'pending M-32 is not an operational expectation');
  }
});

test('EPL operational readback runs the real migration catalog, detects source drift, and keeps private columns out', {
  skip: pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.',
}, async t => {
  const world = await createCommunityWorld({ migrations: HOSTED, games: 2, troyBallots: false });
  t.after(() => world.db.close());
  const db = world.db;
  await db.exec("create schema cron;create table cron.job(jobname text,schedule text,active boolean,command text)");
  await db.query('insert into cron.job values($1,$2,true,$3)', ['gtl-epl-snapshot', '4 * * * *', 'PRIVATE_CRON_COMMAND']);
  await db.query("insert into public.gtl_epl_snapshots(label,captured_at,week,sha256,payload) values('audit-fixture',clock_timestamp(),9,'{}','{\"private\":\"PRIVATE_SNAPSHOT\"}')");
  const sql = eplOperationsPreflightSql();
  const result = await db.transaction(async tx => {
    await tx.exec('set transaction read only');
    return (await tx.query(sql)).rows[0].epl_operations_readback;
  });
  assert.equal(result.sourceScope, 'hosted-ledger');
  assert.equal(result.functions.length, eplFunctionExpectations().length);
  assert.deepEqual(result.functions.filter(fn => !fn.source_matches), []);
  assert.ok(result.functions.every(fn => fn.security_definer === false && fn.anon_execute === false && fn.authenticated_execute === false));
  assert.equal(result.functions.find(fn => fn.name === 'gtl_epl_dispatch_jobs').service_execute, false);
  assert.ok(result.tables.length > 0);
  assert.ok(result.tables.every(table => table.rls && !table.anonSelect && !table.authenticatedSelect));
  assert.deepEqual(result.cron, [{ jobname: 'gtl-epl-snapshot', schedule: '4 * * * *', active: true }]);
  assert.equal(result.snapshots.find(s => s.label === 'audit-fixture').payload, undefined);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
  const source = eplOperationsPreflightSql(readMigrations(ALL), { scope: 'all-source' });
  const readiness = (await db.query(source)).rows[0].epl_operations_readback;
  assert.equal(readiness.sourceScope, 'all-source');
  if (NOT_HOSTED.includes(20261029150000)) {
    const missing = readiness.functions.find(fn => fn.name === 'gtl_epl_save_guess');
    assert.equal(missing.source_matches, false, 'the unapplied moneyline function is correctly missing only in readiness scope');
    assert.equal(missing.signature, null);
  }
  // Simulate a hosted body mismatch locally; the query reports it without invoking any EPL writer.
  await db.exec("create or replace function public.gtl_epl_member(p_user uuid) returns text language sql security invoker set search_path='' as $$ select null::text $$");
  const drift = (await db.query(sql)).rows[0].epl_operations_readback.functions.filter(fn => !fn.source_matches);
  assert.deepEqual(drift.map(fn => fn.name), ['gtl_epl_member']);
});
