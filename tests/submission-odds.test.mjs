import test from 'node:test';
import assert from 'node:assert/strict';
import { runSubmissionWithFreshOdds, SubmissionOddsError } from '../cloud/submission-odds.mjs';

// October 12, 2026 ruling: a refresh is tried when useful and never required. commit() is the authority.
const requestId = '00000000-0000-4000-8000-000000000001';
const fresh = { requiresReferences: true, ready: true };
const aged = { requiresReferences: true, ready: false };

test('a line observed in the last five minutes goes straight to commit without spending', async () => {
  const calls = [];
  const result = await runSubmissionWithFreshOdds({ requestId,
    preflight: async () => { calls.push('check'); return { ...fresh, scoringReferences: { untrusted: 99 } }; },
    collect: async () => assert.fail('a fresh line must not spend'),
    commit: async (...args) => { calls.push('commit'); assert.deepEqual(args, []); return 8; },
  });
  assert.equal(result, 8); assert.deepEqual(calls, ['check', 'commit']);
});

for (const label of ['draft', 'unchanged submitted ballot']) test(`${label} needs neither a refresh nor a request ID`, async () => {
  let committed = 0;
  assert.equal(await runSubmissionWithFreshOdds({
    preflight: async () => ({ requiresReferences: false, ready: false }),
    collect: async () => assert.fail('no reference changes'),
    commit: async () => ++committed,
  }), 1);
});

test('an aged or missing line triggers exactly one collection, then the commit, with no second check', async () => {
  const calls = [];
  const result = await runSubmissionWithFreshOdds({ requestId,
    preflight: async () => { calls.push('check'); return aged; },
    collect: async args => { calls.push('collect'); assert.deepEqual(args, { requestId }); return { status: 'succeeded' }; },
    commit: async () => { calls.push('commit'); return { revision: 3 }; },
  });
  assert.deepEqual(result, { revision: 3 }); assert.deepEqual(calls, ['check', 'collect', 'commit']);
});

test('cooldown, daily cap, budget guard, busy lease, rate limit and provider faults never refuse the save', async () => {
  const failures = ['GTL_ODDS_COOLDOWN', 'GTL_ODDS_DAILY_LIMIT', 'GTL_ODDS_BUDGET', 'GTL_ODDS_BUSY', 'GTL_ODDS_PREFLIGHT_REQUIRED', 'GTL_ODDS_NOT_REQUIRED', 'GTL_ODDS_REQUEST_CONFLICT']
    .map(code => ({ code, status: 429, message: 'provider secret' }))
    .concat([{ status: 429 }, new Error('https://provider.invalid?apiKey=secret'), new SubmissionOddsError('GTL_SUBMISSION_REFRESH_UNAVAILABLE')]);
  for (const failure of failures) {
    let commits = 0, collections = 0;
    const result = await runSubmissionWithFreshOdds({ requestId,
      preflight: async () => aged,
      collect: async () => { collections++; throw failure; },
      commit: async () => ++commits,
    });
    assert.equal(result, 1); assert.equal(collections, 1); assert.equal(commits, 1);
  }
  for (const outcome of [null, {}, { status: 'running' }, { status: 'failed', errorCode: 'ODDS_TIMEOUT' }]) {
    let commits = 0;
    await runSubmissionWithFreshOdds({ requestId, preflight: async () => aged, collect: async () => outcome, commit: async () => ++commits });
    assert.equal(commits, 1);
  }
});

test('database refusals at preflight stop before any spend or commit, exactly as the commit would', async () => {
  for (const denial of [
    ...['GTL_FORBIDDEN', 'GTL_PREDICTION_CLOSED', 'GTL_WEEKLY_CONFLICT', 'GTL_BALLOT_INCOMPLETE', 'GTL_BALLOT_INVALID', 'GTL_PERSONAL_RETRY_CONFLICT', 'GTL_PREDICTION_NOT_OPEN']
      .map(code => Object.assign(new Error('trusted server validation'), { code })),
    Object.assign(new Error('Your weekly entries changed.'), { status: 409 }),
  ]) {
    await assert.rejects(() => runSubmissionWithFreshOdds({ requestId,
      preflight: async () => { throw denial; },
      collect: async () => assert.fail('preflight denied'),
      commit: async () => assert.fail('preflight denied'),
    }), error => error === denial);
  }
});

test('a malformed or failing preflight skips the refresh and lets the authoritative commit decide', async () => {
  for (const preflight of [async () => null, async () => ({ requiresReferences: true }), async () => [], async () => { throw new Error('storage fault'); }, undefined]) {
    let commits = 0;
    await runSubmissionWithFreshOdds({ requestId, preflight, collect: async () => assert.fail('no verified need to spend'), commit: async () => ++commits });
    assert.equal(commits, 1);
  }
  let commits = 0;
  await runSubmissionWithFreshOdds({ requestId: 'client supplied invalid ID', preflight: async () => aged, collect: async () => assert.fail('invalid ID'), commit: async () => ++commits });
  assert.equal(commits, 1, 'an invalid server request ID skips only the refresh');
});

test('an integrity refusal at the atomic commit propagates once, without a second collection', async () => {
  const denial = new SubmissionOddsError('GTL_SUBMISSION_QUOTES_REQUIRED'); let commits = 0, collections = 0;
  await assert.rejects(() => runSubmissionWithFreshOdds({ requestId, preflight: async () => aged,
    collect: async () => { collections++; return { status: 'succeeded' }; }, commit: async () => { commits++; throw denial; } }),
  error => error === denial && error.status === 409 && !/fresh quotes|retry later/i.test(error.message));
  assert.equal(commits, 1); assert.equal(collections, 1);
});

test('ambiguous commit transport failures propagate without retry or a false not-submitted claim', async () => {
  const uncertain = new Error('transport disconnected after request'); let commits = 0;
  await assert.rejects(() => runSubmissionWithFreshOdds({ preflight: async () => fresh, commit: async () => { commits++; throw uncertain; } }),
    error => error === uncertain && !(error instanceof SubmissionOddsError));
  assert.equal(commits, 1);
});

test('no player-facing refusal message names a refresh limit any more', () => {
  for (const code of ['GTL_SUBMISSION_REFRESH_COOLDOWN', 'GTL_SUBMISSION_REFRESH_DAILY_LIMIT', 'GTL_SUBMISSION_REFRESH_BUDGET', 'GTL_SUBMISSION_REFRESH_LIMIT', 'GTL_SUBMISSION_REFRESH_BUSY']) {
    assert.equal(new SubmissionOddsError(code).code, 'GTL_SUBMISSION_CHECK_UNAVAILABLE');
  }
});
