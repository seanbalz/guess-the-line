import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, readMigrations } from '../scripts/migration-functions.mjs';
import { ALL, HOSTED, PRELUDE, migrationSql } from './migrations.mjs';

// Stage 3 of docs/REDESIGN_BUILD_PLAN.md: every gtl_ RPC has exactly one pg_proc row. A `create or replace` that
// changes an argument list adds an overload instead of replacing the body (section 4.1 "Never"), and PostgREST then
// calls whichever one matches the named arguments. The same run proves scripts/migration-functions.mjs reads every
// body exactly as Postgres stores it, so its md5 list is the one Gate M compares with the hosted md5(prosrc).
// Optional disposable PostgreSQL runtime; never connects to the hosted project.
// Install: npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';

for (const [label, files] of [['ALL', ALL], ['HOSTED', HOSTED]]) {
  test(`${label}: every gtl_ function has exactly one pg_proc row, and its md5(prosrc) is the repo's newest body`, { skip }, async t => {
    const db = new PGlite(); t.after(() => db.close());
    await db.exec(PRELUDE);
    for (const file of files) await db.exec(migrationSql(file));
    const rows = (await db.query(`select p.proname name, count(*)::int rows, array_agg(md5(p.prosrc) order by p.oid) md5s,
        array_agg(pg_get_function_identity_arguments(p.oid) order by p.oid) args
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' group by p.proname order by p.proname`)).rows;
    const overloads = rows.filter(r => r.rows !== 1).map(r => `public.${r.name}: ${r.rows} rows (${r.args.join(' | ')})`);
    assert.deepEqual(overloads, [], 'one pg_proc row per function: an argument-list change created an overload');
    assert.ok(rows.filter(r => r.name.startsWith('gtl_')).length >= 90, 'the gtl_ RPCs are all here');
    const { latest } = catalog(readMigrations(files));
    assert.deepEqual(rows.map(r => `public.${r.name}`).sort(), [...latest.keys()].filter(k => k.startsWith('public.')).sort(), 'the functions the parser finds are the functions Postgres has');
    const drift = rows.filter(r => latest.get(`public.${r.name}`).md5 !== r.md5s[0]).map(r => r.name);
    assert.deepEqual(drift, [], 'md5(prosrc) equals the md5 of the newest body in the repo');
  });
}
