import test from 'node:test';
import assert from 'node:assert/strict';
import { runSubmissionWithFreshOdds, SubmissionOddsError } from '../cloud/submission-odds.mjs';

const requestId = '00000000-0000-4000-8000-000000000001';
const fresh = { requiresReferences: true, ready: true };
const stale = { requiresReferences: true, ready: false };
const limitCases = [
  { source: 'GTL_ODDS_COOLDOWN', code: 'GTL_SUBMISSION_REFRESH_COOLDOWN', guidance: /try later; fresh quotes are still required/ },
  { source: 'GTL_ODDS_DAILY_LIMIT', code: 'GTL_SUBMISSION_REFRESH_DAILY_LIMIT', guidance: /midnight UTC, but fresh quotes and an open deadline are still required/ },
  { source: 'GTL_ODDS_BUDGET', code: 'GTL_SUBMISSION_REFRESH_BUDGET', guidance: /commissioner to review it; repeated retries will not clear this limit/ },
];

test('fresh saved evidence goes straight to atomic commit without collection', async () => {
  const calls = [];
  const result = await runSubmissionWithFreshOdds({
    preflight: async () => { calls.push('check'); return { ...fresh, scoringReferences: { untrusted: 99 } }; },
    collect: async () => { assert.fail('cache hit must not spend'); },
    commit: async (...args) => { calls.push('commit'); assert.deepEqual(args, []); return 8; },
  });
  assert.equal(result, 8);
  assert.deepEqual(calls, ['check', 'commit']);
});

for (const label of ['draft', 'unchanged submitted ballot']) test(`${label} needs neither quote refresh nor request ID`, async () => {
  let committed = 0;
  assert.equal(await runSubmissionWithFreshOdds({
    preflight: async () => ({ requiresReferences: false, ready: false }),
    collect: async () => { assert.fail('no reference changes'); },
    commit: async () => ++committed,
  }), 1);
});

test('missing references trigger one guarded collection, authoritative recheck and atomic save', async () => {
  const calls = []; let checks = 0;
  const result = await runSubmissionWithFreshOdds({ requestId,
    preflight: async () => { calls.push('check'); return ++checks === 1 ? stale : fresh; },
    collect: async args => { calls.push('collect'); assert.deepEqual(args, { requestId }); return { status: 'succeeded', payload: { guesses: 'must not be forwarded' } }; },
    commit: async (...args) => { calls.push('commit'); assert.deepEqual(args, []); return { revision: 3 }; },
  });
  assert.deepEqual(result, { revision: 3 });
  assert.deepEqual(calls, ['check', 'collect', 'check', 'commit']);
});

test('incomplete or stale coverage rejects without draft, audit or reveal mutations', async () => {
  const saved = { revision: 2, draft: { picks: { 'TB-DAL': -3 } }, submittedAt: null, audit: [] };
  const before = structuredClone(saved); let collections = 0;
  await assert.rejects(() => runSubmissionWithFreshOdds({ requestId,
    preflight: async () => stale,
    collect: async () => { collections++; return { status: 'succeeded', availableQuotes: 90 }; },
    commit: async () => { saved.submittedAt = 'must not be reached'; },
  }), error => error instanceof SubmissionOddsError && error.code === 'GTL_SUBMISSION_QUOTES_REQUIRED' && error.status === 409);
  assert.equal(collections, 1);
  assert.deepEqual(saved, before);
});

test('fresh authoritative evidence can satisfy a shared lease or quota denial without another collection', async () => {
  for (const code of ['GTL_ODDS_BUSY', ...limitCases.map(item => item.source)]) {
    let checks = 0, commits = 0, collections = 0;
    await runSubmissionWithFreshOdds({ requestId,
      preflight: async () => ++checks === 1 ? stale : fresh,
      collect: async () => { collections++; throw { code, message: 'internal provider secret' }; },
      commit: async () => { commits++; },
    });
    assert.equal(commits, 1); assert.equal(collections, 1); assert.equal(checks, 2);
  }
});

for (const { source, code, guidance } of limitCases) test(`${source} has specific safe guidance and preserves the entire saved ballot`, async () => {
  for (const status of [undefined, 429]) {
    for (const submitted of [false, true]) {
      const saved = {
        revision: 2,
        picks: { 'TB-DAL': -3 },
        submittedAt: submitted ? '2026-10-08T19:00:00Z' : null,
        scoringReferences: submitted ? { 'TB-DAL': { value: -2.5, snapshotId: 'existing-reference' } } : {},
        audit: submitted ? [{ action: 'submitted', revision: 2 }] : [],
        revealed: submitted,
      };
      const before = structuredClone(saved);
      let collections = 0, checks = 0;
      await assert.rejects(() => runSubmissionWithFreshOdds({ requestId,
        preflight: async () => { checks++; return stale; },
        collect: async () => {
          collections++;
          throw { code: source, status, message: 'provider secret', quota: { secret: 'private' }, retryAt: 'untrusted future time' };
        },
        commit: async () => { saved.revision++; saved.picks['TB-DAL'] = -4; saved.revealed = true; },
      }), failure => {
        assert.ok(failure instanceof SubmissionOddsError);
        assert.equal(failure.code, code);
        assert.equal(failure.status, 429);
        assert.match(failure.message, guidance);
        assert.doesNotMatch(failure.message, /secret|private|untrusted/);
        assert.equal(Object.hasOwn(failure, 'quota'), false);
        assert.equal(Object.hasOwn(failure, 'retryAt'), false);
        return true;
      });
      assert.equal(collections, 1);
      assert.equal(checks, 2);
      assert.deepEqual(saved, before);
    }
  }
});

test('unknown rate limits retain the generic safe code without inferring a reset or cooldown', async () => {
  for (const source of [
    { status: 429, message: 'GTL_ODDS_COOLDOWN provider secret' },
    { status: 429, code: 'GTL_ODDS_DAILY_LIMIT secret' },
    { status: 429, code: 'GTL_ODDS_BUDGET_EXTRA', retryAt: 'private timestamp' },
  ]) {
    let collections = 0;
    await assert.rejects(() => runSubmissionWithFreshOdds({ requestId,
      preflight: async () => stale,
      collect: async () => { collections++; throw source; },
      commit: async () => assert.fail('unverified references must not submit'),
    }), failure => {
      assert.equal(failure.code, 'GTL_SUBMISSION_REFRESH_LIMIT');
      assert.equal(failure.status, 429);
      assert.doesNotMatch(failure.message, /secret|private|midnight|cooldown|commissioner/);
      assert.equal(Object.hasOwn(failure, 'retryAt'), false);
      return true;
    });
    assert.equal(collections, 1);
  }
});

test('failed or malformed collection responses are never accepted as fresh evidence', async () => {
  for (const result of [null, {}, { status: 'running' }, { status: 'failed', error: 'provider secret' }]) {
    await assert.rejects(() => runSubmissionWithFreshOdds({ requestId,
      preflight: async () => stale,
      collect: async () => result,
      commit: async () => assert.fail('no fresh source'),
    }), error => error.code === 'GTL_SUBMISSION_REFRESH_UNAVAILABLE' && !error.message.includes('secret'));
  }
  await assert.rejects(() => runSubmissionWithFreshOdds({ requestId,
    preflight: async () => stale,
    collect: async () => { throw new Error('https://provider.invalid?apiKey=secret'); },
    commit: async () => assert.fail('provider failure must not submit'),
  }), error => error instanceof SubmissionOddsError && !error.message.includes('secret'));
});

test('auth, deadline, revision and ballot preflight denials happen before any provider spend', async () => {
  for (const code of ['GTL_FORBIDDEN', 'GTL_PREDICTION_CLOSED', 'GTL_WEEKLY_CONFLICT', 'GTL_BALLOT_INCOMPLETE', 'GTL_BALLOT_INVALID']) {
    const denial = Object.assign(new Error('trusted server validation'), { code });
    await assert.rejects(() => runSubmissionWithFreshOdds({ requestId,
      preflight: async () => { throw denial; },
      collect: async () => assert.fail('preflight denied'),
      commit: async () => assert.fail('preflight denied'),
    }), error => error === denial);
  }
});

test('a concurrent revision change, access revocation or deadline crossing after collection prevents commit', async () => {
  for (const code of ['GTL_WEEKLY_CONFLICT', 'GTL_FORBIDDEN', 'GTL_PREDICTION_CLOSED']) {
    const denial = Object.assign(new Error('trusted server validation'), { code }); let checks = 0, collections = 0;
    await assert.rejects(() => runSubmissionWithFreshOdds({ requestId,
      preflight: async () => { if (++checks === 2) throw denial; return stale; },
      collect: async () => { collections++; return { status: 'succeeded' }; },
      commit: async () => assert.fail('second check denied'),
    }), error => error === denial);
    assert.equal(collections, 1);
  }
});

test('malformed readiness or collection request cannot spend or commit', async () => {
  for (const result of [null, {}, [], { requiresReferences: true }, { requiresReferences: 'false', ready: true }, { requiresReferences: true, ready: 1 }]) {
    await assert.rejects(() => runSubmissionWithFreshOdds({ requestId,
      preflight: async () => result,
      collect: async () => assert.fail('invalid trusted check'),
      commit: async () => assert.fail('invalid trusted check'),
    }), error => error.code === 'GTL_SUBMISSION_CHECK_UNAVAILABLE');
  }
  await assert.rejects(() => runSubmissionWithFreshOdds({ requestId: 'client supplied invalid ID',
    preflight: async () => stale,
    collect: async () => assert.fail('invalid ID'),
    commit: async () => assert.fail('invalid ID'),
  }), error => error.code === 'GTL_SUBMISSION_REQUEST');
});

test('atomic commit rejection after readiness cannot trigger a second collection or save', async () => {
  const denial = new SubmissionOddsError('GTL_SUBMISSION_QUOTES_REQUIRED'); let commits = 0, collections = 0;
  await assert.rejects(() => runSubmissionWithFreshOdds({ requestId,
    preflight: async () => fresh,
    collect: async () => { collections++; },
    commit: async () => { commits++; throw denial; },
  }), error => error === denial);
  assert.equal(commits, 1); assert.equal(collections, 0);
});

test('ambiguous commit transport failures propagate without retry or a false not-submitted claim', async () => {
  const uncertain = new Error('transport disconnected after request'); let commits = 0;
  await assert.rejects(() => runSubmissionWithFreshOdds({
    preflight: async () => fresh,
    commit: async () => { commits++; throw uncertain; },
  }), error => error === uncertain && !(error instanceof SubmissionOddsError));
  assert.equal(commits, 1);
});
