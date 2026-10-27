// Contract: the Fantasy refresh runs only on main, can write release assets and nothing else, runs daily at 11:00 UTC
// plus on demand, and a manual run uploads only when not a dry run.
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

test('daily schedule at 11:00 UTC, three Tuesday runs before the D-61 midnight Points open, plus a manual trigger that is a dry run by default', () => {
  const on = yaml.slice(yaml.indexOf('\non:\n') + 5, yaml.indexOf('\npermissions:'));
  assert.deepEqual(on.match(/^ {2}[a-z_]+:/gm), ['  schedule:', '  workflow_dispatch:'], 'exactly the schedule and manual triggers');
  assert.deepEqual(on.match(/cron: '[^']*'/g), ["cron: '0 11 * * *'", "cron: '17 6 * * 2'", "cron: '47 6 * * 2'", "cron: '17 7 * * 2'"],
    'one daily run at 11:00 UTC and Tuesday runs after nflverse\'s 05:33 UTC Monday-night stats, before the 07:00/08:00 UTC open');
  assert.match(yaml, /dry_run:[\s\S]*?default: true/);
});

test('build always; publish only on schedule or a non-dry manual run; the token reaches only Publish', () => {
  assert.match(yaml, /run: node scripts\/fantasy-refresh\.mjs --out \.local\/fantasy-release/);
  assert.match(yaml, /if: \$\{\{ github\.event_name == 'schedule' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.dry_run == false\) \}\}\n\s+env:\n\s+GH_TOKEN: \$\{\{ github\.token \}\}\n\s+run: node scripts\/fantasy-publish\.mjs --dir \.local\/fantasy-release/);
  assert.equal(yaml.match(/fantasy-publish\.mjs/g).length, 1, 'exactly one publish step');
  assert.equal(yaml.match(/GH_TOKEN/g).length, 1, 'the token is set only on Publish');
  assert.match(yaml, /persist-credentials: false/);
});
