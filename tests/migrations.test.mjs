import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ALL, APPLIED, EXTENSION_ONLY, FILES, FIX_FORWARD, HOSTED, NOT_HOSTED, ROLLBACK_DIR, migrationSql, version, without } from './migrations.mjs';
import { parseFunctions } from '../scripts/migration-functions.mjs';

// Stage 3 of docs/REDESIGN_BUILD_PLAN.md: one place holds the migration lists every PGlite test and spec applies.

test('ALL is every repo migration in filename order; versions are unique 14-digit timestamps', () => {
  assert.ok(!process.env.GTL_ROLLBACK_CHECK, 'GTL_ROLLBACK_CHECK is set only by tests/rollback.test.mjs');
  assert.deepEqual(FILES, fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort());
  for (const file of FILES) assert.match(file, /^\d{14}_gtl_[a-z0-9_]+\.sql$/, `${file}: <timestamp>_gtl_<name>.sql`);
  assert.equal(new Set(FILES.map(version)).size, FILES.length, 'two migrations share a version');
  assert.deepEqual(EXTENSION_ONLY, ['20261008201000_gtl_hosted_scheduler_extensions.sql', '20261008201526_gtl_scheduler_extension_privacy.sql']);
  assert.deepEqual(ALL, FILES.filter(f => !EXTENSION_ONLY.includes(f)));
  assert.deepEqual([...ALL].sort(), ALL);
  for (const file of EXTENSION_ONLY) assert.doesNotMatch(migrationSql(file), /\bgtl_/, `${file} must stay extension-only: PGlite never applies it`);
});

test('HOSTED is ALL minus NOT_HOSTED, in the same order; every listed version names exactly one repo file', () => {
  for (const list of [NOT_HOSTED, FIX_FORWARD]) {
    assert.equal(new Set(list).size, list.length);
    for (const v of list) {
      assert.ok(Number.isSafeInteger(v) && String(v).length === 14, `${v} is a 14-digit version number`);
      assert.equal(ALL.filter(f => version(f) === v).length, 1, `${v} names no repo migration (or more than one)`);
    }
  }
  assert.deepEqual(HOSTED, ALL.filter(f => !NOT_HOSTED.includes(version(f))));
  // The web push migration is hosted since October 14, 2026 (hosted version 20261013030000).
  assert.ok(!NOT_HOSTED.includes(20261013030000));
  assert.ok(HOSTED.includes('20261013030000_gtl_web_push_reminders.sql'));
  assert.equal(HOSTED.length, ALL.length - NOT_HOSTED.length);
  for (const v of FIX_FORWARD) assert.ok(!fs.existsSync(`${ROLLBACK_DIR}${ALL.find(f => version(f) === v)}`), `${v} is fix-forward, so it has no rollback file`);
});

test('every repo migration is in exactly one of APPLIED and NOT_HOSTED, so a missing NOT_HOSTED line fails here', () => {
  // Follow-up to the stage 3 review: HOSTED failed open (ALL minus a hand-written list), so a migration PR without its
  // NOT_HOSTED line moved every old-app suite onto a schema players do not have.
  assert.equal(new Set(APPLIED).size, APPLIED.length);
  for (const v of APPLIED) assert.equal(ALL.filter(f => version(f) === v).length, 1, `APPLIED ${v} names no repo migration (or more than one)`);
  for (const file of ALL) {
    const listed = [APPLIED, NOT_HOSTED].filter(list => list.includes(version(file))).length;
    assert.equal(listed, 1, `${file}: ${listed ? 'in both APPLIED and NOT_HOSTED' : 'in neither list: a new migration goes in NOT_HOSTED, and the apply record (Gate M step 8) moves it to APPLIED'}`);
  }
  assert.deepEqual(HOSTED, ALL.filter(f => APPLIED.includes(version(f))));
  assert.deepEqual([...APPLIED].sort((a, b) => a - b), APPLIED, 'APPLIED stays in filename order');
});

test('the two files the hosted project applied out of filename order share no function, so the order makes no difference', () => {
  // Stage 3 review: 20261013010000 went in (as 20261013040845) before 20261012234500 (as 20261013050416).
  const names = file => new Set(parseFunctions(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'), file).map(fn => `${fn.schema}.${fn.name}`));
  const [first, second] = ['20261012234500_gtl_game_officials.sql', '20261013010000_gtl_line_at_guess_reads.sql'].map(names);
  assert.ok(first.size > 0 && second.size > 0);
  assert.deepEqual([...first].filter(name => second.has(name)), []);
});

test('migrationSql reads the repo file byte for byte outside a rollback check', () => {
  for (const file of ALL) assert.equal(migrationSql(file), fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
});

test('the old-app specs, the shared community world and the persona harness take HOSTED from this module', () => {
  // A hand-written list would drift from the hosted order; new specs pass ALL instead.
  const users = ['tests/cloud-browser/community-world.mjs', 'tests/cloud-browser/personas/harness.mjs', 'tests/cloud-browser/community.spec.js',
    'tests/cloud-browser/community-history.spec.js', 'tests/cloud-browser/personal.spec.js', 'tests/cloud-browser/results.spec.js',
    'tests/cloud-browser/social-no-league.spec.js'];
  for (const file of users) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /import \{[^}]*\bHOSTED\b[^}]*\} from '(?:\.\.\/)+migrations\.mjs'/, `${file} imports HOSTED`);
    assert.doesNotMatch(source, /'\d{14}_gtl_[a-z0-9_]+\.sql'\s*,\s*'\d{14}_gtl_/, `${file} still holds a hand-written migration list`);
    assert.doesNotMatch(source, /readdirSync\(['"`]supabase\/migrations/, `${file} reads the folder itself`);
  }
});

test('without() leaves out a migration and every later file built on its bodies, and nothing else', () => {
  const M07 = '20261015190710_gtl_guess_write_window.sql';
  // M-21's gtl_read_community is M-07's body (it calls M-07's helpers), and M-22 (when present) REQUIRES M-21.
  const dependents = ALL.filter(f => f.startsWith('20261026131000_') || f.startsWith('20261026132000_'));
  const kept = without(ALL, M07);
  assert.deepEqual(ALL.filter(f => !kept.includes(f)), [M07, ...dependents]);
  assert.deepEqual(without(ALL, ALL.at(-1)), ALL.slice(0, -1), 'the newest file has nothing after it');
  assert.deepEqual(kept, ALL.filter(f => kept.includes(f)), 'the order is kept');
});
