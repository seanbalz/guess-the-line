import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ALL, EXTENSION_ONLY, FILES, FIX_FORWARD, HOSTED, NOT_HOSTED, ROLLBACK_DIR, migrationSql, version } from './migrations.mjs';

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
