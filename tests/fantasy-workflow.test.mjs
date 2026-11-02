// Contract: the Fantasy refresh runs only on main, can write release assets and nothing else, runs daily at 11:00 UTC
// plus seven off-the-hour Tuesday runs (06:17 to 10:17 UTC) for the D-61 Points open, plus on demand, and a manual run
// uploads only when not a dry run. Build gets the workflow's own token (for authenticated api.github.com lookups), never
// a repository secret.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const yaml = readFileSync(new URL('../.github/workflows/fantasy-refresh.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const step = name => {
  const start = yaml.indexOf(`      - name: ${name}\n`);
  assert.ok(start >= 0, `step ${name}`);
  const next = yaml.indexOf('\n      - ', start + 1);
  return yaml.slice(start, next < 0 ? undefined : next + 1);
};

test('permissions, branch guard and concurrency', () => {
  assert.match(yaml, /^permissions:\n {2}contents: write\n(?! {2}\S)/m);
  assert.doesNotMatch(yaml, /secrets\./);
  assert.match(yaml, /^ {4}if: github\.ref == 'refs\/heads\/main'$/m);
  assert.match(yaml, /concurrency:\n {2}group: fantasy-refresh\n {2}cancel-in-progress: false/);
  assert.doesNotMatch(yaml, /^ {4}permissions:/m, 'no job-level permissions widen the workflow token');
});

test('daily schedule at 11:00 UTC, seven off-the-hour Tuesday runs around the D-61 midnight Points open, plus a manual trigger that is a dry run by default', () => {
  const on = yaml.slice(yaml.indexOf('\non:\n') + 5, yaml.indexOf('\npermissions:'));
  assert.deepEqual(on.match(/^ {2}[a-z_]+:/gm), ['  schedule:', '  workflow_dispatch:'], 'exactly the schedule and manual triggers');
  const crons = on.match(/cron: '([^']*)'/g).map(line => line.slice(7, -1));
  assert.deepEqual(crons, ['0 11 * * *', '17 6 * * 2', '47 6 * * 2', '17 7 * * 2', '17 8 * * 2', '17 9 * * 2', '47 9 * * 2', '17 10 * * 2'],
    'the daily run, the three original Tuesday runs, and four more for late nflverse updates and GitHub\'s late starts');
  const tuesday = crons.filter(cron => cron.endsWith(' * * 2')).map(cron => cron.split(' ').map(Number));
  assert.ok(tuesday.every(([minute]) => minute !== 0), 'off the hour: GitHub delays top-of-hour schedules most');
  assert.deepEqual([...new Set(tuesday.map(([, hour]) => hour))], [6, 7, 8, 9, 10],
    'a run in every UTC hour from after the 05:33 Monday-night stats through the 08:00 UTC (PST) open and the later updates');
  assert.ok(tuesday.some(([minute, hour]) => hour * 60 + minute < 7 * 60), 'one run before the PDT open (07:00 UTC)');
  assert.ok(tuesday.some(([minute, hour]) => hour * 60 + minute < 8 * 60 && hour * 60 + minute > 7 * 60), 'one run before the PST open (08:00 UTC)');
  assert.match(yaml, /dry_run:[\s\S]*?default: true/);
});

test('build always; publish only on schedule or a non-dry manual run', () => {
  assert.match(step('Build'), /run: node scripts\/fantasy-refresh\.mjs --out \.local\/fantasy-release/);
  assert.match(step('Publish'), /if: \$\{\{ github\.event_name == 'schedule' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.dry_run == false\) \}\}\n\s+env:\n\s+GH_TOKEN: \$\{\{ github\.token \}\}\n\s+run: node scripts\/fantasy-publish\.mjs --dir \.local\/fantasy-release/);
  assert.equal(yaml.match(/fantasy-publish\.mjs/g).length, 1, 'exactly one publish step');
  assert.match(yaml, /persist-credentials: false/);
});

test('the workflow token reaches Build (authenticated source lookups) and Publish only, never checkout or a secret', () => {
  assert.match(step('Build'), /^ {6}- name: Build\n {8}env:\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n {8}run: node scripts\/fantasy-refresh\.mjs/);
  assert.match(step('Publish'), /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.equal(yaml.match(/GH_TOKEN/g).length, 2, 'Build and Publish, nothing else');
  assert.equal(yaml.match(/github\.token/g).length, 2);
  assert.doesNotMatch(yaml, /GITHUB_TOKEN|secrets\./);
});
