import test from 'node:test';
import assert from 'node:assert/strict';
import { collectSubmissionOdds } from '../cloud/submission-collection.mjs';
import { SubmissionOddsError } from '../cloud/submission-odds.mjs';
import { OddsProviderError } from '../cloud/odds-provider.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user = { id: id(1) };
const requestId = id(2);
const intent = { kind: 'league', leagueId: 'sean-troy-luke', mode: 'guess_spread', revision: 3, picks: { 'TB-DAL': -3 }, submit: true };
const games = [{ id: 'TB-DAL', home: 'Dallas Cowboys', away: 'Tampa Bay Buccaneers', kickoff: '2030-10-10T23:15:00Z' }];
const job = () => ({ games, lease: id(3), remainingCredits: 496, reserveCredits: 50, actorId: id(99) });
const input = extra => ({ user, intent, requestId, uuid: () => id(4), ...extra });
const denied = code => Object.assign(new Error(`private storage detail: ${code}`), { code });

test('unconfigured provider or RPC service fails before any collection authorization or spend', async () => {
  for (const config of [
    { provider: null, service: { rpc: async () => assert.fail('provider missing') } },
    { provider: {}, service: null },
    { provider: {}, service: {} },
  ]) {
    await assert.rejects(() => collectSubmissionOdds(input(config)), error => error instanceof SubmissionOddsError && error.code === 'GTL_SUBMISSION_REFRESH_UNAVAILABLE');
  }
});

test('member identity and exact intent go only to narrow RPCs, never commissioner impersonation', async () => {
  const calls = [], immutableIntent = structuredClone(intent); let paidCalls = 0;
  const payload = { provider: 'the-odds-api', games: [], quota: { remaining: 494, used: 6, last: 2 } };
  const service = { rpc: async (name, args) => {
    calls.push({ name, args });
    if (name === 'gtl_begin_submission_odds_collection') {
      assert.deepEqual(args, { p_user: user.id, p_request: requestId, p_intent: intent, p_operation: 'collect' });
      return job();
    }
    assert.equal(name, 'gtl_finish_submission_odds_collection');
    assert.deepEqual(args, { p_user: user.id, p_request: requestId, p_lease: id(3), p_payload: payload,
      p_quota: { remaining: 494, used: 6, last: 2 }, p_error: null });
    return { status: 'succeeded' };
  } };
  const result = await collectSubmissionOdds(input({ service, provider: {
    preflight: async () => assert.fail('measured quota must not bootstrap'),
    collect: async args => { paidCalls++; assert.deepEqual(args, { games, remainingCredits: 496, reserveCredits: 50 }); return payload; },
  } }));
  assert.equal(result.status, 'succeeded'); assert.equal(paidCalls, 1);
  assert.deepEqual(calls.map(call => call.name), ['gtl_begin_submission_odds_collection', 'gtl_finish_submission_odds_collection']);
  assert.deepEqual(intent, immutableIntent);
});

test('authorization, conflict, quota, cooldown and busy denials never instantiate provider or bootstrap', async () => {
  for (const code of ['GTL_FORBIDDEN', 'GTL_WEEKLY_CONFLICT', 'GTL_PREDICTION_CLOSED', 'GTL_BALLOT_INCOMPLETE', 'GTL_ODDS_BUSY', 'GTL_ODDS_COOLDOWN', 'GTL_ODDS_BUDGET', 'GTL_ODDS_DAILY_LIMIT']) {
    const error = denied(code); let calls = 0;
    await assert.rejects(() => collectSubmissionOdds(input({
      service: { rpc: async name => { calls++; assert.equal(name, 'gtl_begin_submission_odds_collection'); throw error; } },
      provider: () => assert.fail('must authorize before constructing provider'),
      uuid: () => assert.fail('only preflight-required may bootstrap'),
    })), actual => actual === error);
    assert.equal(calls, 1);
  }
});

test('preflight-required alone permits one zero-credit bootstrap followed by one paid collection', async () => {
  const operations = []; let attempts = 0, preflights = 0, paidCalls = 0, generated = 0;
  const service = { rpc: async (name, args) => {
    assert.equal(args.p_user, user.id);
    if (name === 'gtl_begin_submission_odds_collection') {
      operations.push([args.p_operation, args.p_request]); assert.deepEqual(args.p_intent, intent);
      if (args.p_operation === 'collect' && ++attempts === 1) throw denied('GTL_ODDS_PREFLIGHT_REQUIRED');
      return job();
    }
    assert.equal(name, 'gtl_finish_submission_odds_collection');
    return { status: 'succeeded' };
  } };
  const result = await collectSubmissionOdds(input({ service, uuid: () => { generated++; return id(4); }, provider: {
    preflight: async args => { preflights++; assert.deepEqual(args, { games }); return { quota: { remaining: 496, used: 4, last: 0 } }; },
    collect: async args => { paidCalls++; assert.deepEqual(args, { games, remainingCredits: 496, reserveCredits: 50 }); return { quota: { remaining: 494, used: 6, last: 2 } }; },
  } }));
  assert.equal(result.status, 'succeeded'); assert.equal(preflights, 1); assert.equal(paidCalls, 1); assert.equal(generated, 1);
  assert.deepEqual(operations, [['collect', requestId], ['preflight', id(4)], ['collect', requestId]]);
});

test('a failed zero-credit bootstrap never falls through to paid odds', async () => {
  let begins = 0, preflights = 0;
  const result = await collectSubmissionOdds(input({
    service: { rpc: async (name, args) => {
      if (name === 'gtl_begin_submission_odds_collection') {
        begins++; if (args.p_operation === 'collect') throw denied('GTL_ODDS_PREFLIGHT_REQUIRED');
        return job();
      }
      assert.equal(name, 'gtl_finish_submission_odds_collection'); return { status: 'failed', errorCode: 'ODDS_AUTH' };
    } },
    provider: { preflight: async () => { preflights++; throw new OddsProviderError('ODDS_AUTH'); }, collect: async () => assert.fail('bootstrap failed') },
  }));
  assert.equal(result.status, 'failed'); assert.equal(begins, 2); assert.equal(preflights, 1);
});

test('a second preflight-required rejection is propagated without recursive bootstrapping', async () => {
  let begins = 0, preflights = 0; const error = denied('GTL_ODDS_PREFLIGHT_REQUIRED');
  await assert.rejects(() => collectSubmissionOdds(input({
    service: { rpc: async (name, args) => {
      if (name === 'gtl_begin_submission_odds_collection') {
        begins++; if (args.p_operation === 'collect') throw error; return job();
      }
      return { status: 'succeeded' };
    } },
    provider: { preflight: async () => { preflights++; return {}; }, collect: async () => assert.fail('begin keeps rejecting') },
  })), actual => actual === error);
  assert.equal(begins, 3); assert.equal(preflights, 1);
});

test('provider failures persist only an allowlisted code and bounded quota integers', async () => {
  for (const [failure, expectedCode, expectedQuota] of [
    [new OddsProviderError('ODDS_TIMEOUT', { remaining: 492, used: '8', last: -1, apiKey: 'secret' }), 'ODDS_TIMEOUT', { remaining: 492, used: null, last: null }],
    [Object.assign(new Error('https://provider.invalid?apiKey=secret'), { quota: { remaining: 500 } }), 'ODDS_UNAVAILABLE', { remaining: null, used: null, last: null }],
  ]) {
    let finished;
    const result = await collectSubmissionOdds(input({
      service: { rpc: async (name, args) => {
        if (name === 'gtl_begin_submission_odds_collection') return job();
        finished = args; return { status: 'failed' };
      } },
      provider: { collect: async () => { throw failure; } },
    }));
    assert.equal(result.status, 'failed'); assert.equal(finished.p_payload, null);
    assert.equal(finished.p_error, expectedCode); assert.deepEqual(finished.p_quota, expectedQuota);
    assert.equal(JSON.stringify(finished).includes('secret'), false);
  }
});

test('successful provider quota is projected separately with no arbitrary fields or invalid values', async () => {
  let finished;
  await collectSubmissionOdds(input({
    service: { rpc: async (name, args) => {
      if (name === 'gtl_begin_submission_odds_collection') return job();
      finished = args; return { status: 'succeeded' };
    } },
    provider: { collect: async () => ({ quota: { remaining: 1_000_000_000, used: 6.5, last: 2, secret: 'ignored quota member' } }) },
  }));
  assert.deepEqual(finished.p_quota, { remaining: null, used: null, last: 2 });
});

test('running or completed replay never invokes provider or completes the lease again', async () => {
  for (const status of ['running', 'succeeded']) {
    let calls = 0;
    const result = await collectSubmissionOdds(input({
      service: { rpc: async name => {
        calls++; assert.equal(name, 'gtl_begin_submission_odds_collection'); return { replay: true, status, diagnostics: { status } };
      } },
      provider: () => assert.fail('replay cannot spend again'),
    }));
    assert.equal(result.status, status === 'succeeded' ? 'succeeded' : 'failed'); assert.equal(calls, 1);
  }
});

test('completion summary cannot expose arbitrary storage diagnostics or quota data', async () => {
  const result = await collectSubmissionOdds(input({
    service: { rpc: async name => name === 'gtl_begin_submission_odds_collection' ? job()
      : { status: 'succeeded', privateState: 'secret', quota: { remaining: 490, credential: 'secret' }, quotes: [{ value: -99 }] } },
    provider: { collect: async () => ({ quota: { remaining: 490, used: 10, last: 2 } }) },
  }));
  assert.equal(result.status, 'succeeded');
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(Object.hasOwn(result, 'privateState'), false);
  assert.equal(Object.hasOwn(result, 'quotes'), false);
});

test('replayed diagnostics cannot expose arbitrary stored payloads or quota members', async () => {
  const result = await collectSubmissionOdds(input({
    service: { rpc: async () => ({ replay: true, status: 'succeeded', diagnostics: { status: 'succeeded', payload: 'secret', quota: { credential: 'secret' } } }) },
    provider: () => assert.fail('replay must not instantiate provider'),
  }));
  assert.equal(result.status, 'succeeded');
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(Object.hasOwn(result, 'payload'), false);
});
