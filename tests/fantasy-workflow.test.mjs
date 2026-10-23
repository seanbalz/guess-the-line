// Contract: the Fantasy refresh runs only on main, can write release assets and nothing else, ships manual-only, and
// uploads only when not a dry run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const yaml = readFileSync(new URL('../.github/workflows/fantasy-refresh.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('permissions, branch guard and concurrency', () => {
  assert.match(yaml, /^permissions:\n {2}contents: write\n(?! {2}\S)/m);
  assert.doesNotMatch(yaml, /secrets\./);
  assert.match(yaml, /^ {4}if: github\.ref == 'refs\/heads\/main'$/m);
  assert.match(yaml, /concurrency:\n {2}group: fantasy-refresh\n {2}cancel-in-progress: false/);
});

test('manual trigger with dry run by default; no schedule until Task 14', () => {
  assert.match(yaml, /workflow_dispatch:/);
  assert.match(yaml, /dry_run:[\s\S]*?default: true/);
  assert.doesNotMatch(yaml, /^\s*schedule:/m);
  const triggers = yaml.slice(yaml.indexOf('\non:\n') + 5, yaml.indexOf('\npermissions:')).match(/^ {2}[a-z_]+:/gm);
  assert.deepEqual(triggers, ['  workflow_dispatch:'], 'manual is the only trigger until the schedule is added');
});

test('build always; publish only on schedule or a non-dry manual run; the token reaches only Publish', () => {
  assert.match(yaml, /run: node scripts\/fantasy-refresh\.mjs --out \.local\/fantasy-release/);
  assert.match(yaml, /if: \$\{\{ github\.event_name == 'schedule' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.dry_run == false\) \}\}\n\s+env:\n\s+GH_TOKEN: \$\{\{ github\.token \}\}\n\s+run: node scripts\/fantasy-publish\.mjs --dir \.local\/fantasy-release/);
  assert.equal(yaml.match(/fantasy-publish\.mjs/g).length, 1, 'exactly one publish step');
  assert.equal(yaml.match(/GH_TOKEN/g).length, 1, 'the token is set only on Publish');
  assert.match(yaml, /persist-credentials: false/);
});
