// Legacy two-way contract with the pending three-way migration applied: the M-32 and M-36 SQL suites (the RPCs every
// deployed gtl-api and gtl-epl-jobs build calls) rerun unchanged on top of 20261110100000. Disposable PGlite only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('M-32 and M-36 suites pass unchanged on the three-way schema', () => {
  const env = { ...process.env, GTL_EPL_THREE_WAY_COMPAT: '1' };
  delete env.NODE_TEST_CONTEXT; // a nested runner, not a recursive run() of this file
  const run = spawnSync(process.execPath, ['--test', 'tests/epl-moneyline-sql.test.mjs', 'tests/epl-moneyline-collector-sql.test.mjs'], {
    env, encoding: 'utf8', timeout: 240_000 });
  const out = `${run.stdout}\n${run.stderr}`;
  assert.equal(run.status, 0, out.split('\n').filter(line => /^not ok|error|expected|actual/.test(line)).join('\n'));
  assert.match(out, /^# fail 0$/m);
  assert.doesNotMatch(out, /^# pass 0$/m);
});
