// Contract: main push CI gives every commit its own run (releases need green push CI on the exact SHA, so a cancelled
// or queued main run blocks that release), runs each suite once, splits the cloud browser suite into four shards that
// together cover every top-level cloud browser spec, and the release gate requires every job that carries a suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REQUIRED_CI } from '../scripts/release-preflight.mjs';

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
  assert.deepEqual(REQUIRED_CI['dashboard-checks.yml'], ['dashboard', 'Persona suite', ...shards]);
  assert.deepEqual(REQUIRED_CI['test.yml'], ['Typecheck and test']);
  assert.deepEqual(REQUIRED_CI['brand-qa.yml'], ['Brand QA']);
  assert.match(dashboard, /^ {2}dashboard:$/m);
  assert.match(dashboard, /^ {4}name: Persona suite$/m);
  assert.match(workflows['test.yml'], /^ {4}name: Typecheck and test$/m);
  assert.match(workflows['brand-qa.yml'], /^ {4}name: Brand QA$/m);
});
