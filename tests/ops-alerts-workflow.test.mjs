// Contract (item 22): the Ops alerts workflow starts when either data refresh completes, by the exact names those
// workflows carry (a rename would silently stop alerts), can replay one run by hand, may only read runs and write issues,
// never sees a secret or the event payload inside a shell line, and handles one run at a time so an incident opens one issue.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WATCHED_WORKFLOWS } from '../shared/ops-alert.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const yaml = read('.github/workflows/ops-alerts.yml');

test('triggers: completion of exactly the two watched data workflows, matched by their real names, plus a manual replay', () => {
  const names = WATCHED_WORKFLOWS.map(file => read(file).match(/^name: (.+)$/m)[1]);
  assert.deepEqual(names, ['Fantasy refresh', 'Research data refresh']);
  assert.match(yaml, new RegExp(`^ {2}workflow_run:\\n {4}workflows: \\[${names.join(', ')}\\]\\n {4}types: \\[completed\\]$`, 'm'));
  const on = yaml.slice(yaml.indexOf('\non:\n') + 5, yaml.indexOf('\npermissions:'));
  assert.deepEqual(on.match(/^ {2}[a-z_]+:/gm), ['  workflow_run:', '  workflow_dispatch:']);
  assert.match(on, /run_id:\n {8}description: .+\n {8}required: true\n {8}type: string/);
});

test('least privilege: read runs and code, write issues, no secrets, no stored checkout credentials', () => {
  assert.match(yaml, /^permissions:\n {2}actions: read\n {2}contents: read\n {2}issues: write\n(?! {2}\S)/m);
  assert.doesNotMatch(yaml, /^ {4}permissions:/m);
  assert.doesNotMatch(yaml, /secrets\./);
  assert.match(yaml, /persist-credentials: false/);
});

test('only main runs (or a manual replay) are handled, one at a time, and the run id reaches the script only through env', () => {
  assert.match(yaml, /^ {4}if: github\.event_name == 'workflow_dispatch' \|\| github\.event\.workflow_run\.head_branch == 'main'$/m);
  assert.match(yaml, /^concurrency:\n {2}group: ops-alerts\n {2}cancel-in-progress: false$/m);
  assert.match(yaml, /env:\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n {10}RUN_ID: \$\{\{ github\.event\.workflow_run\.id \|\| inputs\.run_id \}\}\n {8}run: node scripts\/ops-alert\.mjs$/m);
  const runLines = yaml.match(/^ +run: .+$/gm);
  assert.deepEqual(runLines, ['        run: node scripts/ops-alert.mjs']);
  assert.ok(runLines.every(line => !line.includes('${{')), 'no expression is interpolated into a shell line');
});

test('both watched workflows still publish through a step named "Publish…", which is what closes an alert', () => {
  for (const file of WATCHED_WORKFLOWS) assert.match(read(file), /^ {6}- name: Publish\b/m, file);
});
