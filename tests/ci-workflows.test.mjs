// Contract: main push CI gives every commit its own run (releases need green push CI on the exact SHA, so a cancelled
// or queued main run blocks that release), runs each suite once, splits the cloud browser suite into four shards that
// together cover every top-level cloud browser spec, and the release gate requires every job that carries a suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_CI, CLOUD_SHARDS, requiredJobs, successfulRun, REPOSITORY } from '../scripts/release-preflight.mjs';

const read = name => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const workflows = Object.fromEntries(['test.yml', 'dashboard-checks.yml', 'brand-qa.yml'].map(name => [name, read(name)]));
const dashboard = workflows['dashboard-checks.yml'];

test('each main commit gets its own run; pull requests still replace older runs', () => {
  for (const [name, yaml] of Object.entries(workflows)) {
    assert.match(yaml, /^concurrency:\n {2}group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.ref == 'refs\/heads\/main' && github\.sha \|\| github\.ref \}\}\n {2}cancel-in-progress: \$\{\{ github\.ref != 'refs\/heads\/main' \}\}$/m, name);
    assert.match(yaml, /^on:\n {2}push:\n {4}branches: \[main\]\n {2}pull_request:$/m, `${name} still runs on main pushes and pull requests`);
  }
});

test('npm test runs once, in Tests, with the skipped-test assertion', () => {
  assert.match(workflows['test.yml'], /npm test 2>&1 \| tee \.local\/npm-test\.log/);
  assert.match(workflows['test.yml'], /node:test skipped/);
  assert.doesNotMatch(dashboard, /^\s+- run: npm test$/m);
  assert.doesNotMatch(dashboard, /run: npm test\b/);
});

test('the cloud browser suite runs as four shards over every top-level spec, and only there', () => {
  assert.match(dashboard, /^ {4}name: Cloud browser suite \(\$\{\{ matrix\.shard \}\}\/4\)$/m);
  assert.match(dashboard, /fail-fast: false\n\s+matrix:\n\s+shard: \[1, 2, 3, 4\]/);
  const runs = dashboard.match(/--config playwright\.cloud\.config\.js[^\n]*tests\/cloud-browser\/\*\.spec\.js/g);
  assert.deepEqual(runs, ['--config playwright.cloud.config.js --shard=${{ matrix.shard }}/4 tests/cloud-browser/*.spec.js']);
  assert.match(dashboard, /npx playwright test --config playwright\.cloud\.config\.js tests\/cloud-browser\/personas/, 'personas keep their own job');
  assert.match(dashboard, /name: cloud-browser-evidence-\$\{\{ matrix\.shard \}\}/, 'each shard keeps its evidence');
});

test('the dashboard job keeps its other suites', () => {
  for (const step of ['npm run build', 'npm run test:browser', 'npm run test:performance', 'npm run test:accessibility', 'scripts/check-cloud-boundary.mjs --bundle-only', 'python3 scripts/snapshots.py check']) {
    assert.ok(dashboard.includes(step), step);
  }
});

test('the release gate requires every job that carries a suite, by its rendered name', () => {
  const shards = [1, 2, 3, 4].map(shard => `Cloud browser suite (${shard}/4)`);
  assert.deepEqual(CLOUD_SHARDS, shards);
  const repo = fileURLToPath(new URL('..', import.meta.url));
  assert.deepEqual(requiredJobs(repo, 'dashboard-checks.yml'), ['dashboard', 'Persona suite', ...shards]);
  assert.deepEqual(REQUIRED_CI['test.yml'], ['Typecheck and test']);
  assert.deepEqual(REQUIRED_CI['brand-qa.yml'], ['Brand QA']);
  assert.match(dashboard, /^ {2}dashboard:$/m);
  assert.match(dashboard, /^ {4}name: Persona suite$/m);
  assert.match(workflows['test.yml'], /^ {4}name: Typecheck and test$/m);
  assert.match(workflows['brand-qa.yml'], /^ {4}name: Brand QA$/m);
});

test('the gate requires the jobs the release commit itself defines: shards from this change on, the dashboard job before it', t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'gtl-ci-jobs-'));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  mkdirSync(path.join(dir, '.github/workflows'), { recursive: true });
  const file = path.join(dir, '.github/workflows/dashboard-checks.yml');
  const sha = 'a'.repeat(40);
  const run = { id: 9, run_attempt: 1, head_sha: sha, event: 'push', head_branch: 'main', path: '.github/workflows/dashboard-checks.yml', repository: { full_name: REPOSITORY }, status: 'completed', conclusion: 'success' };
  const passed = names => names.map(name => ({ name, status: 'completed', conclusion: 'success' }));

  // A commit from before the shards: its dashboard job ran the cloud browser suite itself.
  writeFileSync(file, 'jobs:\n  dashboard:\n    runs-on: ubuntu-latest\n  personas:\n    name: Persona suite\n');
  assert.deepEqual(requiredJobs(dir, 'dashboard-checks.yml'), ['dashboard', 'Persona suite']);
  assert.doesNotThrow(() => successfulRun([run], passed(['dashboard', 'Persona suite']), sha, 'dashboard-checks.yml', requiredJobs(dir, 'dashboard-checks.yml')));

  // A commit with the shards: every shard job must have passed.
  writeFileSync(file, dashboard);
  const required = requiredJobs(dir, 'dashboard-checks.yml');
  assert.doesNotThrow(() => successfulRun([run], passed(required), sha, 'dashboard-checks.yml', required));
  assert.throws(() => successfulRun([run], passed(required.filter(name => name !== 'Cloud browser suite (3/4)')), sha, 'dashboard-checks.yml', required), /required job Cloud browser suite \(3\/4\) did not pass/);
  assert.throws(() => successfulRun([run], passed(required).map(job => job.name === 'Cloud browser suite (1/4)' ? { ...job, conclusion: 'skipped' } : job), sha, 'dashboard-checks.yml', required), /Cloud browser suite \(1\/4\)/);
  assert.deepEqual(requiredJobs(dir, 'test.yml'), ['Typecheck and test']);
});
