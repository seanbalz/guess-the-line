import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../server/store.mjs';
import { createEngine } from '../server/engine.mjs';
import { createCloudHandler } from '../cloud/handler.mjs';
import { applySportsbookSources } from '../cloud/sportsbook-sources.mjs';
import { providerWeeklyError } from '../cloud/weekly.mjs';
import { providerPersonalError } from '../cloud/personal.mjs';
import { OddsProviderError } from '../cloud/odds-provider.mjs';
import { SubmissionOddsError } from '../cloud/submission-odds.mjs';
import { FEATURE_OFF } from '../cloud/optional-rpc.mjs';

// Handler wiring tests with explicitly trusted in-memory RPC/commit fakes.
// These verify sequencing and request boundaries, not SQL locks or hosted state.
const now = Date.parse('2030-10-10T18:00:00Z');
const iso = value => new Date(value).toISOString();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = id(2), books = ['draftkings', 'fanduel', 'betmgm'];
function reference(stamp = now, value = -3, snapshotId = id(700)) {
  return { status: 'available', value, source: 'The Odds API · 3-book median', sourceUrl: 'https://the-odds-api.com/',
    snapshotId, savedAt: iso(stamp), capturedAt: iso(stamp - 1000), observedAt: iso(stamp - 2000),
    quotes: books.map(book => ({ book, value, observedAt: iso(stamp - 2000), collectedAt: iso(stamp - 1000) })) };
}

function fixture(options = {}) {
  const state = seed();
  state.games = state.games.slice(0, 2).map(game => ({ ...game, kickoff: iso(now + 3600000) }));
  state.league.deadline = iso(options.expired ? now : now + 3600000);
  state.history = []; state.consensusHistory = []; state.audit = [];
  const picks = Object.fromEntries(state.games.map(game => [game.id, -3]));
  const submittedAt = options.submitted ? iso(now - 3600000) : null;
  state.ballots = { troy: { guess_spread: { picks: structuredClone(picks), submittedAt,
    ...(submittedAt ? { updatedAt: submittedAt, scoringPolicy: 'submission-time', scoringReferences: Object.fromEntries(state.games.map(game => [game.id, reference(now - 3600000)])) } : {}) } } };
  let revision = 3, personalRevision = 9, serial = 100;
  const calls = { preflights: [], required: [], begin: [], finish: [], paid: 0, commit: 0, membership: [] };
  const ready = new Set(options.cached ? state.games.map(game => game.id) : []);
  let authUser = { id: actor, email: 'ordinary-player@example.invalid', emailConfirmed: true };
  let member = { active: true, role: 'player', player_id: 'troy' };

  function required(intent) {
    const prior = state.ballots.troy[intent.mode] || { picks: {}, submittedAt: null };
    if (!prior.submittedAt && !intent.submit) return [];
    return state.games.filter(game => !prior.submittedAt || prior.picks[game.id] !== intent.picks[game.id]).map(game => game.id);
  }
  function check(intent) {
    if (intent.revision !== revision) throw providerWeeklyError('GTL_WEEKLY_CONFLICT');
    if (Object.hasOwn(intent, 'personalRevision') && intent.personalRevision !== personalRevision) throw providerPersonalError('GTL_PERSONAL_CONFLICT');
    if (options.preflightError) throw options.preflightError;
    if (options.secondCheckError && calls.preflights.length > 1) throw options.secondCheckError;
    const ids = required(intent); calls.required.push(ids);
    return { requiresReferences: ids.length > 0, ready: ids.every(gameId => ready.has(gameId)) };
  }
  function commit(mode, nextPicks, submit, expectedRevision) {
    calls.commit++;
    if (options.commitError) throw options.commitError;
    assert.equal(expectedRevision, revision);
    const prior = state.ballots.troy[mode] || { picks: {}, submittedAt: null };
    const ids = required({ mode, picks: nextPicks, submit });
    // October 12, 2026: the SQL commit never refuses for a missing line; it saves the line at the guess or pending.
    const refs = structuredClone(prior.scoringReferences || {});
    for (const gameId of ids) refs[gameId] = ready.has(gameId) ? reference() : { status: 'pending', basis: 'first_line_after_submission', value: null,
      source: null, sourceUrl: null, snapshotId: null, capturedAt: null, observedAt: null, savedAt: iso(now), ageSeconds: null,
      reason: 'No line was stored yet when this guess was saved. The first line collected after it becomes its reference.' };
    state.ballots.troy[mode] = { ...prior, picks: structuredClone(nextPicks), submittedAt: prior.submittedAt || (submit ? iso(now) : null),
      updatedAt: iso(now), scoringPolicy: 'submission-time', scoringReferences: refs };
    state.audit.push({ id: id(++serial), player: 'troy', mode, type: 'ballot_saved', timestamp: iso(now), before: prior.picks, after: nextPicks });
    return ++revision;
  }
  const odds = { rpc: async (name, args) => {
    assert.equal(args.p_user, actor, 'authenticated ordinary player must remain the actor');
    if (name === 'gtl_preflight_submission') {
      calls.preflights.push(structuredClone(args)); return check(args.p_intent);
    }
    if (name === 'gtl_begin_submission_odds_collection') {
      calls.begin.push(structuredClone(args));
      if (options.collectionError) throw options.collectionError;
      assert.equal(args.p_operation, 'collect');
      return { games: structuredClone(state.games), lease: id(500), remainingCredits: 496, reserveCredits: 50 };
    }
    assert.equal(name, 'gtl_finish_submission_odds_collection'); calls.finish.push(structuredClone(args));
    if (!args.p_error && options.collectionCompletes !== false) state.games.forEach(game => ready.add(game.id));
    return { status: args.p_error ? 'failed' : 'succeeded' };
  } };
  if (options.marketReadFails) odds.marketSnapshot = async () => { throw new Error('private provider response'); };
  const handler = createCloudHandler({
    // The live rules (gtl_live_rules); without options.rules the function is missing, as on the hosted project today.
    optionalRpc: async name => (name === 'gtl_live_rules' && options.rules ? options.rules : FEATURE_OFF),
    clock: () => now, uuid: () => id(++serial), authenticate: async () => authUser,
    storage: { membership: async (userId, leagueId) => { calls.membership.push({ userId, leagueId }); return member; } },
    weekly: {
      load: async () => ({ state: structuredClone(state), revision, leagueRevision: 0 }),
      saveBallot: async (userId, leagueId, mode, expected, nextPicks, submit) => {
        assert.equal(userId, actor); assert.equal(leagueId, state.league.id); return commit(mode, nextPicks, submit, expected);
      },
    },
    personal: { rpc: async (name, args) => {
      assert.equal(name, 'gtl_mutate_personal'); assert.equal(args.p_user, actor); assert.equal(args.p_action, 'personal/ballot');
      assert.equal(args.p_body.revision, personalRevision);
      const weeklyRevision = commit(args.p_body.mode, args.p_body.picks, args.p_body.submit, args.p_body.weeklyRevision);
      return { revision: ++personalRevision, weeklyRevision };
    } },
    odds, oddsProvider: { collect: async args => {
      calls.paid++; assert.equal(args.remainingCredits, 496); assert.equal(args.reserveCredits, 50);
      if (options.providerUnavailable) throw new OddsProviderError('ODDS_UNAVAILABLE');
      return { quota: { remaining: 494, used: 6, last: 2 } };
    } },
  });
  async function request(path, body, authorization = 'Bearer ordinary') {
    const response = await handler(new Request(`https://test.invalid${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(authorization ? { authorization } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
    return { status: response.status, body: await response.json() };
  }
  return { state, picks, ready, calls, request, setAuth: value => { authUser = value; }, setMember: value => { member = value; },
    ballot: patch => request('/ballot?mode=guess_spread', { revision, picks, submit: true, ...patch }),
    personal: patch => request('/personal/ballot', { requestId: id(900), revision: personalRevision, weeklyRevision: revision,
      season: state.league.season, week: state.league.week, mode: 'guess_spread', picks, submit: true, ...patch }),
  };
}

test('ordinary authenticated player collects fresh references and then commits a complete initial ballot', async () => {
  const f = fixture();
  const hidden = await f.request('/state?mode=guess_spread'); assert.equal(hidden.body.revealed, false);
  const result = await f.ballot();
  assert.equal(result.status, 200); assert.equal(result.body.revealed, true); assert.equal(result.body.revision, 4);
  assert.equal(f.calls.paid, 1); assert.equal(f.calls.commit, 1); assert.equal(f.calls.preflights.length, 1);
  assert.deepEqual(f.calls.required, [Object.keys(f.picks)]);
  assert(f.calls.membership.every(call => call.userId === actor));
  assert.equal(f.calls.begin[0].p_user, actor); assert.equal(f.calls.finish[0].p_user, actor);
  assert.equal(f.calls.begin[0].p_intent.leagueId, 'sean-troy-luke');
  assert(result.body.games.every(game => game.scoringReference.status === 'available'));
  const total = await f.request('/state?mode=guess_total');
  assert.equal(total.body.revealed, false); assert(total.body.games.every(game => game.market === null));
});

test('provider failure, incomplete collection, cooldown, daily cap, budget and busy lease never refuse the submission', async () => {
  for (const options of [
    { providerUnavailable: true }, { collectionCompletes: false },
    ...['GTL_ODDS_COOLDOWN', 'GTL_ODDS_DAILY_LIMIT', 'GTL_ODDS_BUDGET', 'GTL_ODDS_BUSY'].map(code => ({ collectionError: Object.assign(new Error('private quota detail'), { code, status: 429 }) })),
  ]) {
    const f = fixture(options);
    const result = await f.ballot();
    assert.equal(result.status, 200, JSON.stringify(options)); assert.equal(result.body.revealed, true);
    assert.equal(f.calls.commit, 1); assert.equal(f.calls.preflights.length, 1);
    assert.equal(JSON.stringify(result.body).includes('private quota detail'), false);
    // No line stored yet: each guess saves pending and is unscored until the first line after it.
    assert(result.body.games.every(game => game.scoringReference.status === 'pending' && game.points === null));
    assert.ok(f.state.ballots.troy.guess_spread.submittedAt);
  }
});

test('fresh cache avoids a provider request and stores only the trusted commit references', async () => {
  const f = fixture({ cached: true });
  const result = await f.ballot();
  assert.equal(result.status, 200); assert.equal(f.calls.paid, 0); assert.equal(f.calls.begin.length, 0);
  assert.equal(f.calls.preflights.length, 1); assert.equal(f.calls.commit, 1);
});

test('a failed latest-market read preserves the saved sportsbook receipt and the other market gate', async () => {
  const f = fixture({ submitted: true, marketReadFails: true });
  const result = await f.request('/state?mode=guess_spread');
  assert.equal(result.status, 200);
  assert.equal(result.body.marketFeed.status, 'unavailable');
  const sources = result.body.games[0].sportsbookSources;
  assert.equal(sources.scoring.value, -3);
  assert(sources.scoring.quotes.slice(0, 3).every(q => q.status === 'included'));
  assert.equal(sources.latest.status, 'unavailable');
  assert.equal(JSON.stringify(result.body).includes('private provider response'), false);
  const hidden = await f.request('/state?mode=guess_total');
  assert(hidden.body.games.every(game => !game.sportsbookSources));
});

test('submitted edits trust changed-only preflight while unchanged references and first submission survive', async () => {
  const f = fixture({ submitted: true }), before = structuredClone(f.state.ballots.troy.guess_spread);
  const [changed, unchanged] = Object.keys(f.picks);
  const result = await f.ballot({ picks: { ...f.picks, [changed]: -4 }, submit: false });
  assert.equal(result.status, 200); assert.deepEqual(f.calls.required, [[changed]]);
  assert.equal(f.calls.paid, 1);
  const after = f.state.ballots.troy.guess_spread;
  assert.equal(after.submittedAt, before.submittedAt);
  assert.deepEqual(after.scoringReferences[unchanged], before.scoringReferences[unchanged]);
  assert.equal(after.scoringReferences[changed].savedAt, iso(now));
});

test('a no-op submitted edit never refreshes original references or spends provider credits', async () => {
  const f = fixture({ submitted: true }), before = structuredClone(f.state.ballots.troy.guess_spread.scoringReferences);
  const result = await f.ballot({ submit: false });
  assert.equal(result.status, 200); assert.deepEqual(f.calls.required, [[]]);
  assert.equal(f.calls.paid, 0); assert.equal(f.calls.begin.length, 0);
  assert.deepEqual(f.state.ballots.troy.guess_spread.scoringReferences, before);
});

// Redesign stage 18 (M-02): once gtl_live_rules says sentFinal, the engine mirror refuses a change to a locked-in pick before any
// preflight, provider spend or commit, with the code the old app reloads on; before that (today) the same edit saves (D-16).
const FINAL_RULES = { sentFinal: true, lateWindow: 'deadline', revealAt: 'kickoff' };
test('sent picks are final once the live rules say so: the group ballot refuses an edit before any spend; an unchanged re-save passes', async () => {
  const f = fixture({ submitted: true, rules: FINAL_RULES }), before = structuredClone(f.state);
  const [first] = Object.keys(f.picks);
  for (const patch of [{ picks: { ...f.picks, [first]: -4 } }, { picks: { ...f.picks, [first]: -4 }, submit: false }, { picks: { [first]: -3 }, submit: false }]) {
    const result = await f.ballot(patch);
    assert.deepEqual([result.status, result.body], [409, { error: 'Sent picks are final.', code: 'GTL_BALLOT_LOCKED' }], JSON.stringify(patch));
  }
  assert.deepEqual([f.calls.preflights.length, f.calls.commit, f.calls.paid], [0, 0, 0]); assert.deepEqual(f.state, before);
  const same = await f.ballot();
  assert.equal(same.status, 200, JSON.stringify(same.body)); assert.equal(same.body.rules.sentFinal, true);
  // Today's rules (the function missing, or reporting sentFinal false): the mirror stays off and D-16's edit saves.
  for (const rules of [undefined, { ...FINAL_RULES, sentFinal: false }]) {
    const today = fixture({ submitted: true, rules });
    const edited = await today.ballot({ picks: { ...today.picks, [first]: -4 } });
    assert.equal(edited.status, 200, JSON.stringify(edited.body)); assert.equal(edited.body.rules.sentFinal, false);
  }
});

test('the database refusal of a locked-in pick reaches both apps as a 409 with its code, never as an uncoded conflict', async () => {
  const group = fixture({ commitError: providerWeeklyError('GTL_BALLOT_LOCKED') });
  assert.deepEqual(await group.ballot(), { status: 409, body: { error: 'Sent picks are final.', code: 'GTL_BALLOT_LOCKED' } });
  const solo = fixture({ commitError: providerPersonalError('GTL_BALLOT_LOCKED') });
  assert.deepEqual(await solo.personal(), { status: 409, body: { error: 'Sent picks are final.', code: 'GTL_BALLOT_LOCKED' } });
  // Every other refusal keeps its sentence only: no other database code leaves gtl-api.
  const conflict = fixture({ commitError: providerPersonalError('GTL_PERSONAL_CONFLICT') });
  const answer = await conflict.personal();
  assert.equal(answer.status, 409); assert.equal('code' in answer.body, false);
});

test('authentication, membership, deadline, revision and malformed ballot fail before preflight or spend', async () => {
  const cases = [
    { setup: f => f.setAuth(null), status: 401 },
    { setup: f => f.setAuth({ id: actor, email: 'ordinary@example.invalid', emailConfirmed: false }), status: 403 },
    { setup: f => f.setMember(null), status: 403 },
    { options: { expired: true }, status: 400 },
    { patch: { revision: 2 }, status: 409 },
    { patch: { picks: {} }, status: 400 },
    { patch: { picks: { 'TB-DAL': 2.25 } }, status: 400 },
    { patch: { scoringReferences: { guessed: 'untrusted' } }, status: 400 },
  ];
  for (const scenario of cases) {
    const f = fixture(scenario.options); scenario.setup?.(f);
    const result = await f.ballot(scenario.patch);
    assert.equal(result.status, scenario.status, JSON.stringify(scenario));
    assert.equal(f.calls.paid, 0); assert.equal(f.calls.preflights.length, 0); assert.equal(f.calls.commit, 0);
  }
});

test('authoritative preflight refusals never spend or commit; a malformed preflight only skips the refresh', async () => {
  for (const code of ['GTL_WEEKLY_CONFLICT', 'GTL_PREDICTION_CLOSED', 'GTL_FORBIDDEN']) {
    const f = fixture({ preflightError: providerWeeklyError(code) });
    const before = structuredClone(f.state), result = await f.ballot();
    assert.notEqual(result.status, 200); assert.equal(f.calls.commit, 0); assert.equal(f.calls.paid, 0); assert.deepEqual(f.state, before);
  }
  // A revision race after the refresh is caught by the SQL commit itself (GTL_WEEKLY_CONFLICT), not a second check.
  const f = fixture({ preflightError: new Error('storage fault') });
  const result = await f.ballot();
  assert.equal(result.status, 200); assert.equal(f.calls.paid, 0); assert.equal(f.calls.commit, 1);
});

test('an integrity refusal at the atomic commit preserves the draft and returns retry without a second collection', async () => {
  const f = fixture({ cached: true, commitError: new SubmissionOddsError('GTL_SUBMISSION_QUOTES_REQUIRED') });
  const before = structuredClone(f.state), result = await f.ballot();
  assert.equal(result.status, 409); assert.equal(result.body.code, 'GTL_SUBMISSION_QUOTES_REQUIRED');
  assert.equal(result.body.submitted, false); assert.deepEqual(f.state, before);
  assert.equal(f.calls.commit, 1); assert.equal(f.calls.paid, 0);
});

test('personal ballot validates request fields before preflight or market access', async () => {
  for (const patch of [
    { playerId: 'sean' }, { scoringReferences: {} }, { requestId: 'not-a-uuid' },
    { weeklyRevision: '3' }, { revision: -1 }, { mode: 'betting_challenge' },
    { picks: { 'TB-DAL': 2.25 } }, { submit: 'true' },
  ]) {
    const f = fixture(), result = await f.personal(patch);
    assert.equal(result.status, 400); assert.equal(f.calls.preflights.length, 0);
    assert.equal(f.calls.paid, 0); assert.equal(f.calls.commit, 0); assert.equal(f.calls.membership.length, 0);
  }
});

test('personal submit keeps weekly and personal revisions distinct without requiring dummy membership', async () => {
  const f = fixture(); f.setMember(null);
  const result = await f.personal();
  assert.equal(result.status, 200); assert.deepEqual(result.body, { revision: 10, weeklyRevision: 4,
    rules: { sentFinal: false, lateWindow: 'deadline', revealAt: 'deadline' } });
  const intent = f.calls.preflights[0].p_intent;
  assert.equal(intent.revision, 3); assert.equal(intent.personalRevision, 9); assert.equal(intent.requestId, id(900));
  assert.equal(Object.hasOwn(intent, 'leagueId'), false); assert.equal(f.calls.membership.length, 0);
  assert.equal(f.calls.paid, 1); assert.equal(f.calls.commit, 1);
});

test('personal weekly and workspace conflicts each stop before collection', async () => {
  for (const patch of [{ weeklyRevision: 2 }, { revision: 8 }]) {
    const f = fixture(), before = structuredClone(f.state), result = await f.personal(patch);
    assert.equal(result.status, 409); assert.equal(f.calls.paid, 0); assert.equal(f.calls.commit, 0);
    assert.deepEqual(f.state, before);
  }
});

test('engine-to-source projection retains persisted receipt after its snapshot leaves twenty-record history', () => {
  const f = fixture({ submitted: true }), state = f.state;
  const savedAt = now - 3600000;
  const saved = state.ballots.troy.guess_spread.scoringReferences[state.games[0].id];
  saved.quotes[1].value = -3.5;
  // Every retained recent snapshot is different; the original receipt is absent.
  const snapshot = n => ({ id: id(800 + n), createdAt: iso(now - 60000 + n), payload: {
    provider: 'the-odds-api', sport: 'americanfootball_nfl', fetchedAt: iso(now - 60001 + n),
    games: state.games.map(game => ({ gameId: game.id, home: game.home, away: game.away, kickoff: game.kickoff,
      matchStatus: 'matched', providerEventId: game.id, markets: { spread: { quotes: books.map(book => ({
        provider: 'the-odds-api', providerEventId: game.id, book, market: 'spread', value: -6,
        timeBasis: 'provider_market_last_update', providerObservedAt: iso(now - 60002 + n), collectedAt: iso(now - 60001 + n),
        outcomes: { home: { line: -6 }, away: { line: 6 } },
      })), unavailable: [] } } })),
  } });
  const latest = snapshot(20); latest.history = Array.from({ length: 20 }, (_, index) => snapshot(index));
  assert(!latest.history.some(row => row.id === saved.snapshotId));
  const view = createEngine(state, { clock: () => now }).view('troy', 'guess_spread');
  assert.equal(view.games[0].scoringReference.quotes[1].value, -3.5);
  const result = applySportsbookSources(view, latest, now).games[0].sportsbookSources;
  assert.equal(result.scoring.value, -3); assert.equal(result.scoring.savedAt, iso(savedAt));
  assert.equal(result.scoring.quotes.find(row => row.book === 'fanduel').value, -3.5);
  assert(result.scoring.quotes.slice(0, 3).every(row => row.status === 'included'));
  assert.equal(result.latest.value, -6);
  const hidden = createEngine(state, { clock: () => now }).view('troy', 'guess_total');
  assert.equal(applySportsbookSources(hidden, latest, now), hidden);
  assert(hidden.games.every(game => !Object.hasOwn(game, 'sportsbookSources')));
});
