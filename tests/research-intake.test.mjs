import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fixture } from './fixtures/research-assessments.mjs';

const cli = args => spawnSync(process.execPath, ['scripts/research-intake.mjs', ...args], { encoding: 'utf8', timeout: 10000 });
test('private intake defaults to validation, logs only a receipt and refuses public or escaped paths', async t => {
  const dir = path.resolve('.local', `research-intake-test-${randomUUID()}`); await fs.mkdir(dir, { recursive: true });
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'input.json'), output = path.join(dir, 'output.json');
  await fs.writeFile(input, JSON.stringify({ snapshot: fixture().snapshot }));
  const result = cli(['--input', input, '--output', output]);
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout); assert.equal(receipt.published, false); assert.equal(receipt.candidates, 1);
  assert.equal(receipt.availableSources, 0); assert.match(receipt.inputSha256, /^[a-f0-9]{64}$/);
  for (const secret of ['Synthetic Receiver', '65.5', 'fixture-over', 'sourceUrl']) assert.ok(!result.stdout.includes(secret));
  assert.equal(JSON.parse(await fs.readFile(output, 'utf8')).snapshot.candidates.length, 1);
  assert.equal((await fs.stat(output)).mode & 0o077, 0);
  assert.equal(cli(['--input', 'package.json']).status, 1);
  await fs.symlink(path.resolve('package.json'), path.join(dir, 'escape.json'));
  assert.equal(cli(['--input', path.join(dir, 'escape.json')]).status, 1);
  const missingId = cli(['--input', input, '--publish']);
  assert.equal(missingId.status, 1); assert.ok(!missingId.stderr.includes('Synthetic Receiver'));
});
