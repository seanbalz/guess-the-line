// Legacy two-way contract with the pending three-way migration applied: the M-32 and M-36 SQL suites (the RPCs every
// deployed gtl-api and gtl-epl-jobs build calls) rerun unchanged on top of 20261110100000. Disposable PGlite only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// The nested run's summary counts. The nested run asks for the TAP reporter ("# pass 30"), so the result does not
// depend on the Node version's default (Node 22 prints TAP to a pipe; Node 24 prints the spec reporter's "ℹ pass 30").
// Both prefixes are accepted so a reporter change cannot silently turn this check into a no-op.
function nestedSummary(out) {
  const counts = {};
  for (const [, key, value] of out.matchAll(/^(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)$/gm)) {
    counts[key] = Number(value);
  }
  return counts;
}

test('nestedSummary reads the TAP and the spec reporter summaries alike', () => {
  const tap = '# tests 30\n# suites 0\n# pass 30\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
  const spec = 'ℹ tests 30\nℹ suites 0\nℹ pass 30\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n';
  const expected = { tests: 30, pass: 30, fail: 0, cancelled: 0, skipped: 0, todo: 0 };
  assert.deepEqual(nestedSummary(tap), expected);
  assert.deepEqual(nestedSummary(spec), expected);
  assert.deepEqual(nestedSummary('ok 1 - a test named # pass 0\n'), {}); // a count only counts on its own line
});

test('M-32 and M-36 suites pass unchanged on the three-way schema', () => {
  const env = { ...process.env, GTL_EPL_THREE_WAY_COMPAT: '1' };
  delete env.NODE_TEST_CONTEXT; // a nested runner, not a recursive run() of this file
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap',
    'tests/epl-moneyline-sql.test.mjs', 'tests/epl-moneyline-collector-sql.test.mjs'], {
    env, encoding: 'utf8', timeout: 240_000 });
  const out = `${run.stdout}\n${run.stderr}`;
  assert.equal(run.status, 0, out.split('\n').filter(line => /^not ok|error|expected|actual/.test(line)).join('\n'));
  const counts = nestedSummary(out);
  assert.ok(Number.isInteger(counts.pass), `no node:test summary in the nested output:\n${out.slice(-2000)}`);
  assert.ok(counts.pass > 0, 'the nested suites ran no test');
  // A file that registers no test still reports one passing pseudo-test named after its path.
  assert.doesNotMatch(out, /^(?:not )?ok \d+ - .*\.test\.mjs$/m, 'a nested file registered no test of its own');
  assert.equal(counts.fail, 0, 'a nested suite failed');
  assert.equal(counts.cancelled, 0, 'a nested test was cancelled');
  assert.equal(counts.skipped, 0, 'a nested test was skipped (the SQL suites need .local/sql-check)');
});
