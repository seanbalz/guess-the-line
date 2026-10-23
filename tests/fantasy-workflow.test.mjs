// Contract: the Fantasy refresh runs only on main, can write release assets and nothing else, ships manual-only, and
// uploads only when not a dry run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const yaml = readFileSync(new URL('../.github/workflows/fantasy-refresh.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('permissions, branch guard and concurrency', () => {
  assert.match(yaml, /^permissions:\n {2}contents: write\n(?! {2}\S)/m);
  assert.doesNotMatch(yaml, /secrets\./);
  assert.match(yaml, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(yaml, /concurrency:\n {2}group: fantasy-refresh\n {2}cancel-in-progress: false/);
});

test('manual trigger with dry run by default; no schedule until Task 14', () => {
  assert.match(yaml, /workflow_dispatch:/);
  assert.match(yaml, /dry_run:[\s\S]*?default: true/);
  assert.doesNotMatch(yaml, /^\s*schedule:/m);
});

test('build always; publish only when not a dry run', () => {
  assert.match(yaml, /run: node scripts\/fantasy-refresh\.mjs --out \.local\/fantasy-release/);
  assert.match(yaml, /if: \$\{\{ github\.event_name == 'schedule' \|\| inputs\.dry_run == false \}\}\n\s+run: node scripts\/fantasy-publish\.mjs --dir \.local\/fantasy-release/);
});
