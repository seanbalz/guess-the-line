import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { HEADERS_FROM, catalog, checkHeaders, forMigration, parseFunctions, readMigrations, topLevel } from '../scripts/migration-functions.mjs';
import { ALL, FIX_FORWARD, HOSTED, MIGRATIONS_DIR, PRELUDE, ROLLBACK_DIR, version } from './migrations.mjs';

// Stage 3 of docs/REDESIGN_BUILD_PLAN.md (Gate M step 9): supabase/rollback/<migration file> holds the bodies a
// migration replaces. Each one is checked here, applied on PGlite after HOSTED and its migration, and then the
// old-app SQL suites rerun on that database. A generated fixture shows the suites fail without the rollback.
// Optional disposable PostgreSQL runtime; never connects to the hosted project.
// Install: npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';

/** The old-app SQL suites: built on HOSTED through tests/migrations.mjs, so GTL_ROLLBACK_CHECK reaches them. */
const OLD_APP_SQL_SUITES = ['tests/community-history-sql.test.mjs', 'tests/line-at-guess-sql.test.mjs', 'tests/submission-line-at-guess-sql.test.mjs', 'tests/ruled-ballot-import.test.mjs'];
const ROLLBACKS = fs.readdirSync(ROLLBACK_DIR).filter(f => f.endsWith('.sql')).sort();
const ALLOWED = /^(?:create\s+or\s+replace\s+function|grant|revoke)\b/i;
const key = fn => `${fn.schema}.${fn.name}`;

/** What `migration` replaces (as of the repo files before it) and what a rollback file restores, with problems. */
function review(migrationPath, rollbackSql) {
  const name = path.basename(migrationPath), problems = [];
  const before = catalog(readMigrations(ALL.filter(f => f < name))).latest;
  const own = new Map(parseFunctions(fs.readFileSync(migrationPath, 'utf8'), name).map(fn => [key(fn), fn]));
  const replaced = new Map([...own.keys()].filter(k => before.has(k)).map(k => [k, before.get(k)]));
  const statements = topLevel(rollbackSql).split(';').map(s => s.trim()).filter(Boolean);
  for (const statement of statements) if (!ALLOWED.test(statement)) problems.push(`${name}: rollback statement not allowed: ${statement.split('\n')[0].slice(0, 80)}`);
  const restored = parseFunctions(rollbackSql, `rollback/${name}`);
  for (const fn of restored) {
    const prev = replaced.get(key(fn));
    if (!fn.replace) problems.push(`${name}: rollback must use create or replace for ${key(fn)}`);
    if (!prev) problems.push(`${name}: the rollback restores ${key(fn)}, which the migration does not replace`);
    else if (prev.md5 !== fn.md5) problems.push(`${name}: the rollback body of ${key(fn)} has md5 ${fn.md5}; the body the migration replaces (${prev.file}) has md5 ${prev.md5}`);
  }
  for (const k of replaced.keys()) if (!restored.some(fn => key(fn) === k)) problems.push(`${name}: the rollback does not restore ${k}`);
  return { name, replaced, added: [...own.keys()].filter(k => !before.has(k)), problems };
}

/**
 * Builds HOSTED plus the migration (in filename order) and applies the rollback straight after it. Reports
 * md5(prosrc) after the migration and after the rollback (before any later file, which may replace the same
 * function again), and any overload once every file is in.
 */
async function applyWithRollback(migrationPath, rollbackSql) {
  const name = path.basename(migrationPath), db = new PGlite();
  const files = [...new Set([...HOSTED, name])].sort();
  const md5s = async () => new Map((await db.query("select p.proname, md5(p.prosrc) md5 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")).rows.map(r => [`public.${r.proname}`, r.md5]));
  let after, restored;
  try {
    await db.exec(PRELUDE);
    for (const file of files) {
      await db.exec(fs.readFileSync(file === name ? migrationPath : path.join(MIGRATIONS_DIR, file), 'utf8'));
      if (file === name) { after = await md5s(); await db.exec(rollbackSql); restored = await md5s(); }
    }
    const overloads = (await db.query("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' group by proname having count(*)>1")).rows;
    return { after, restored, overloads };
  } finally { await db.close(); }
}

/** Reruns the old-app SQL suites in a child process on HOSTED + the migration (+ its rollback). Resolves to the TAP counts. */
function rerunSuites(check, suites = OLD_APP_SQL_SUITES) {
  // A fresh runner: without NODE_TEST_CONTEXT the child reports TAP instead of joining this run's protocol.
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  return new Promise(resolve => execFile(process.execPath, ['--test', '--test-reporter=tap', ...suites], {
    encoding: 'utf8', timeout: 600_000, maxBuffer: 64 * 1024 * 1024, env: { ...env, GTL_ROLLBACK_CHECK: JSON.stringify(check) },
  }, (error, stdout = '', stderr = '') => {
    const count = label => Number((stdout.match(new RegExp(`^# ${label} (\\d+)$`, 'm')) || [])[1] ?? NaN);
    // Never echo the child's TAP summary into this run's log (CI reads the skipped count from it).
    const tail = `${stdout}\n${stderr}`.split('\n').filter(line => !/^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b/.test(line)).slice(-60).join('\n');
    resolve({ status: error ? (error.code ?? 1) : 0, pass: count('pass'), fail: count('fail'), skipped: count('skipped'), tail });
  }));
}

test('the rollback convention: each file names a migration, restores exactly the bodies it replaces, and never drops', () => {
  assert.ok(fs.existsSync(path.join(ROLLBACK_DIR, 'README.md')), 'supabase/rollback/README.md explains the convention');
  for (const file of ROLLBACKS) {
    assert.ok(ALL.includes(file), `supabase/rollback/${file} must share its migration's exact filename`);
    assert.ok(!FIX_FORWARD.includes(version(file)), `${file} is listed as fix-forward`);
    const { problems, replaced } = review(path.join(MIGRATIONS_DIR, file), fs.readFileSync(path.join(ROLLBACK_DIR, file), 'utf8'));
    assert.deepEqual(problems, []);
    assert.ok(replaced.size > 0, `${file} replaces no function, so it needs no rollback (an off switch covers new tables)`);
  }
  // From stage 3 on, a migration that replaces a function ships with its rollback, unless it is fix-forward.
  for (const { file, functions } of catalog(readMigrations()).files) {
    if (version(file) <= HEADERS_FROM || !functions.some(fn => fn.previous)) continue;
    assert.ok(ROLLBACKS.includes(file) || FIX_FORWARD.includes(version(file)), `${file} replaces a function: add supabase/rollback/${file} (node scripts/migration-functions.mjs --rollback) or list it in FIX_FORWARD`);
  }
  // The reviewer refuses anything but restored bodies and grants.
  const fixture = path.join(MIGRATIONS_DIR, ALL.find(f => f.startsWith('20261013010000')));
  const drafted = forMigration(fixture).rollback;
  assert.match(review(fixture, `${drafted}\ndrop table public.gtl_feed_posts;`).problems.join('\n'), /not allowed: drop table/);
  assert.match(review(fixture, `${drafted}\ndelete from public.gtl_weekly_ballots;`).problems.join('\n'), /not allowed: delete from/);
  assert.deepEqual(review(fixture, drafted).problems, [], 'a drafted rollback passes as drafted');
  assert.match(review(fixture, '-- nothing restored\n').problems.join('\n'), /does not restore public\.gtl_read_community/);
});

test('the old-app SQL suites take HOSTED and migrationSql from tests/migrations.mjs', () => {
  for (const suite of OLD_APP_SQL_SUITES) {
    const source = fs.readFileSync(suite, 'utf8');
    assert.match(source, /import \{ HOSTED, migrationSql \} from '\.\/migrations\.mjs';/, suite);
    assert.doesNotMatch(source, /readFileSync\(`supabase\/migrations/, `${suite} reads a migration without migrationSql`);
  }
});

for (const file of ROLLBACKS) {
  test(`${file}: HOSTED, the migration, then its rollback restores every replaced body; the old-app SQL suites pass with the migration and after its rollback`, { skip }, async () => {
    const migration = path.join(MIGRATIONS_DIR, file), rollback = path.join(ROLLBACK_DIR, file);
    const { replaced, added } = review(migration, fs.readFileSync(rollback, 'utf8'));
    const { restored, overloads } = await applyWithRollback(migration, fs.readFileSync(rollback, 'utf8'));
    assert.deepEqual(overloads, []);
    for (const [k, prev] of replaced) assert.equal(restored.get(k), prev.md5, `${k} is back to the body from ${prev.file}`);
    for (const k of added) assert.ok(restored.has(k), `${k} (added by the migration) stays after the rollback`);
    // Both at once. With the migration and no rollback is the schema the old-app suites (on HOSTED) get once it is applied: a
    // branch a suite keeps for the new body (community-history-sql's PER_GAME for M-01) runs nowhere else before the apply.
    const [applied, run] = await Promise.all([rerunSuites({ migration }), rerunSuites({ migration, rollback })]);
    assert.ok(applied.status === 0 && applied.fail === 0 && applied.skipped === 0 && applied.pass > 0, `old-app SQL suites with the migration applied:\n${applied.tail}`);
    assert.ok(run.status === 0 && run.fail === 0 && run.skipped === 0 && run.pass > 0, `old-app SQL suites after the rollback:\n${run.tail}`);
  });
}

test('fixture: a migration that breaks gtl_pick_points fails the old-app suites; its drafted rollback restores the body and they pass', { skip }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtl-rollback-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // A replacing migration newer than every repo file, with its header, that scores every guess -1.
  const prev = catalog(readMigrations(ALL)).latest.get('public.gtl_pick_points');
  const migration = path.join(dir, '29991231000000_gtl_rollback_fixture.sql'), rollback = path.join(dir, 'rollback.sql');
  fs.writeFileSync(migration, prev.statement.replace(prev.body, '\n  select -1::numeric\n').replace(/^create\s+function/i, 'create or replace function'));
  const { headers, rollback: rollbackSql } = forMigration(migration);
  assert.deepEqual(headers, [`-- replaces public.gtl_pick_points md5 ${prev.md5}`]);
  fs.writeFileSync(migration, `${headers.join('\n')}\n${fs.readFileSync(migration, 'utf8')}`);
  fs.writeFileSync(rollback, rollbackSql);
  assert.deepEqual(checkHeaders(catalog([...readMigrations(ALL), { file: path.basename(migration), sql: fs.readFileSync(migration, 'utf8') }])), []);
  assert.deepEqual(review(migration, rollbackSql).problems, []);
  const { after, restored } = await applyWithRollback(migration, rollbackSql);
  assert.notEqual(after.get('public.gtl_pick_points'), prev.md5, 'the fixture migration replaced the body');
  assert.equal(restored.get('public.gtl_pick_points'), prev.md5, 'the rollback put the previous body back');
  // Both runs at once: the history suite without the rollback, and every old-app suite with it.
  const [broken, fixed] = await Promise.all([rerunSuites({ migration }, ['tests/community-history-sql.test.mjs']), rerunSuites({ migration, rollback })]);
  assert.ok(broken.fail > 0 && broken.status !== 0, `without the rollback the history suite must fail:\n${broken.tail}`);
  assert.ok(fixed.status === 0 && fixed.fail === 0 && fixed.skipped === 0 && fixed.pass > 0, `old-app SQL suites after the rollback:\n${fixed.tail}`);
});
