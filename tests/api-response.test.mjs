import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, SaveUncertainError, readResponse, requestResponse } from '../web/src/apiResponse.js';

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

test('lost mutation response stays uncertain without retrying or exposing transport detail', async () => {
  let requests = 0;
  await assert.rejects(requestResponse(async () => { requests++; throw new Error('private transport detail'); }, true), error => {
    assert.ok(error instanceof SaveUncertainError);
    assert.equal(error.uncertain, true);
    assert.match(error.message, /Check saved data/);
    assert.doesNotMatch(error.message, /private|not submitted|not saved/);
    return true;
  });
  assert.equal(requests, 1);
});

test('unreadable success and malformed success acknowledgements require saved-state readback', async () => {
  for (const response of [new Response('gateway html', { status: 200 }), json(null), json('OK'), json([])]) {
    await assert.rejects(readResponse(response, true), error => error.uncertain === true);
  }
});

test('unknown service failures after mutation cannot establish a rollback', async () => {
  for (const status of [500, 502, 503, 504]) {
    await assert.rejects(readResponse(json({ error: 'Unavailable' }, status), true), SaveUncertainError);
  }
});

test('explicit fresh-quote rejection remains safely retryable without pretending it is a revision conflict', async () => {
  await assert.rejects(readResponse(json({ error: 'Fresh quotes unavailable.', code: 'GTL_SUBMISSION_QUOTES_REQUIRED', submitted: false }, 503), true), error => {
    assert.ok(error instanceof ApiError);
    assert.notEqual(error.uncertain, true);
    assert.equal(error.code, 'GTL_SUBMISSION_QUOTES_REQUIRED');
    assert.equal(error.message, 'Fresh quotes unavailable.');
    return true;
  });
});

test('a rejection code without explicit pre-commit evidence does not resolve a service failure', async () => {
  await assert.rejects(readResponse(json({ code: 'GTL_SUBMISSION_QUOTES_REQUIRED' }, 503), true), SaveUncertainError);
  await assert.rejects(readResponse(json({ code: 'untrusted', submitted: false }, 503), true), SaveUncertainError);
});

test('revision and deadline rejections keep their definite recovery paths', async () => {
  await assert.rejects(readResponse(json({ error: 'Revision changed.' }, 409), true), error => {
    assert.match(error.message, /another group or on another device/);
    assert.notEqual(error.uncertain, true);
    return true;
  });
  await assert.rejects(readResponse(json({ error: 'Prediction deadline passed.' }, 423), true), error => error.status === 423 && !error.uncertain);
});

test('a coded submission refusal keeps its own sentence even when it mentions a changed guess (D-27)', async () => {
  const body = { error: 'The line for a changed guess could not be verified. Your guesses were not submitted. Keep your draft and try again.', code: 'GTL_SUBMISSION_QUOTES_REQUIRED', submitted: false };
  await assert.rejects(readResponse(json(body, 409), true), error => {
    assert.equal(error.message, body.error);
    assert.equal(error.code, 'GTL_SUBMISSION_QUOTES_REQUIRED');
    assert.equal(error.status, 409);
    assert.notEqual(error.uncertain, true);
    return true;
  });
  await assert.rejects(readResponse(json({ error: 'Revision changed.', code: 'NOT_A_SUBMISSION_CODE' }, 409), true), error => /another group or on another device/.test(error.message), 'an uncoded or foreign-coded revision 409 is still the conflict');
});

test('successful save acknowledgement passes through once without retry or extra reads', async () => {
  let requests = 0;
  const saved = { revision: 3, games: [], league: { week: 5 } };
  assert.deepEqual(await requestResponse(async () => { requests++; return json(saved); }, true), saved);
  assert.equal(requests, 1);
});

test('failed read requests never masquerade as uncertain saves', async () => {
  const network = new Error('Offline');
  await assert.rejects(requestResponse(async () => { throw network; }), error => error === network);
  await assert.rejects(readResponse(new Response('unreadable')), error => !error.uncertain && /Reload saved data/.test(error.message));
});

test('the final-pick refusal keeps its code and sentence, so a screen reloads instead of offering a conflict or a retry (stage 18)', async () => {
  await assert.rejects(readResponse(json({ error: 'Sent picks are final.', code: 'GTL_BALLOT_LOCKED' }, 409), true), error => {
    assert.deepEqual([error.message, error.code, error.status, error.uncertain], ['Sent picks are final.', 'GTL_BALLOT_LOCKED', 409, undefined]);
    return true;
  });
  // Without its code (a gtl-api deployed before stage 18) the same 409 reads as before; any other code is dropped.
  await assert.rejects(readResponse(json({ error: 'This ballot is submitted and permanently locked.' }, 409), true), error => error.code === null && error.status === 409);
  await assert.rejects(readResponse(json({ error: 'Your weekly ballot changed in another group or on another device.', code: 'GTL_WEEKLY_CONFLICT' }, 409), true),
    error => error.code === null && /another group or on another device/.test(error.message));
});


test('a kickoff refusal retains its code and triggers saved-state reconciliation rather than a revision conflict', async () => {
  await assert.rejects(readResponse(json({ error: 'This game has started. Its saved guess cannot be changed.', code: 'GTL_GAME_CLOSED' }, 409), true), error => {
    assert.equal(error.code, 'GTL_GAME_CLOSED');
    assert.equal(error.status, 409);
    assert.match(error.message, /game has started/);
    assert.notEqual(error.uncertain, true);
    return true;
  });
});
