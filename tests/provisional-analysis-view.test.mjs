import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../server/store.mjs';
import { createCloudHandler } from '../cloud/handler.mjs';
import { applyMarketView } from '../cloud/market-view.mjs';
import { applyProvisionalAnalysisView, applyTotalAnalysisView } from '../cloud/total-analysis-view.mjs';

const now = Date.parse('2026-10-08T20:00:00Z');
const iso = value => new Date(value).toISOString();
const user = '11111111-1111-4111-8111-111111111111';
const group = 'g_22222222222242228222222222222222';
const duel = 'g_a697831088e94d5eba8ca0fd51054076';

function fixture(mode = 'guess_spread') {
  const total = mode === 'guess_total';
  const state = seed();
  state.games = state.games.slice(0, 2);
  state.league = { ...state.league, id: group, name: 'Independent group', practice: false, roster: state.league.roster.slice(0, 2) };
  const values = total ? [44, 45] : [0, -3];
  state.ballots = Object.fromEntries(['sean', 'troy'].map((player, index) => [player, {
    [mode]: { picks: Object.fromEntries(state.games.map((game, i) => [game.id, values[i] + (index === i ? 0 : 1)])), submittedAt: iso(now - 120_000) },
  }]));
  state.history = []; state.bets = {}; state.results = {}; state.audit = []; state.archivedCount = 0;
  const snapshot = (time = now, selectedValues = values) => ({ id: `snapshot-${time}`, createdAt: iso(time), payload: { provider: 'the-odds-api', sport: 'americanfootball_nfl', fetchedAt: iso(time),
    games: state.games.map((game, index) => ({ ...game, gameId: game.id, providerEventId: `event-${index}`, matchStatus: 'matched', markets: {
      [total ? 'total' : 'spread']: { quotes: ['draftkings', 'fanduel', 'betmgm'].map(book => ({ book, provider: 'the-odds-api', providerEventId: `event-${index}`, timeBasis: 'provider_market_last_update', outcomes: total ? { over: { line: selectedValues[index] }, under: { line: selectedValues[index] } } : { home: { line: selectedValues[index] }, away: { line: -selectedValues[index] } }, market: total ? 'total' : 'spread', value: selectedValues[index], providerObservedAt: iso(time - 30_000), collectedAt: iso(time) })) },
      [total ? 'spread' : 'total']: { privateOtherMode: 'do-not-reveal', quotes: [] },
    } })),
  } });
  const view = { mode, revealed: true, playerId: 'sean', league: state.league,
    standings: state.league.roster.map(player => ({ ...player, submitted: true, points: null, record: null })),
    games: state.games.map(game => ({ ...game, prediction: state.ballots.sean[mode].picks[game.id], market: null, points: null, opponents: [{ id: 'troy', value: state.ballots.troy[mode].picks[game.id] }] })),
    score: null, snapshot: null, maxPoints: 20,
  };
  return { state, view, snapshot };
}

test('generic analysis supplies separate Spread and Total estimates without granting an official policy', () => {
  for (const mode of ['guess_spread', 'guess_total']) {
    const { view, snapshot } = fixture(mode);
    const projected = applyMarketView(view, snapshot(), now), before = structuredClone(projected);
    const result = applyProvisionalAnalysisView(projected, now), analysis = result.provisionalAnalysis;
    assert.equal(analysis.mode, mode); assert.equal(analysis.status, 'provisional'); assert.equal(analysis.officialVerified, false);
    assert.equal(analysis.score, 18); assert.equal(analysis.stale, false);
    assert(analysis.standings.every(player => player.points === 18 && player.record.W === 1 && player.record.L === 1 && player.record.T === 0));
    assert.equal(result.score, null); assert.equal(result.snapshot, null); assert.equal(result.scoringBenchmark, undefined);
    assert.equal(analysis.policyId, undefined); assert.equal(analysis.actualKickoff, undefined);
    assert.equal(JSON.stringify(result).includes('do-not-reveal'), false);
    const { provisionalAnalysis, ...unchanged } = result; assert.deepEqual(unchanged, before); assert.deepEqual(projected, before);
    if (mode === 'guess_spread') {
      assert.equal(analysis.games[view.games[0].id].value, 0); assert.equal(analysis.games[view.games[1].id].value, -3);
      assert.equal(applyTotalAnalysisView(projected, now), projected, 'legacy Total export stays mode-specific');
    }
  }
});

test('generic Spread analysis keeps exact event validation, complete snapshots and hidden drafts', () => {
  const { view, snapshot } = fixture();
  const older = snapshot(now - 600_000), partial = snapshot(now, [9, 9]);
  partial.payload.games[1].markets.spread.quotes.pop(); partial.history = [older];
  const retained = applyProvisionalAnalysisView(applyMarketView(view, partial, now), now).provisionalAnalysis;
  assert.equal(retained.snapshotId, older.id); assert.equal(retained.stale, true); assert.equal(retained.score, 18);
  for (const mutate of [sample => { sample.payload.games[0].home = 'Different home'; }, sample => { sample.payload.games[0].away = 'Different away'; }, sample => { sample.payload.games[0].gameId = 'Other-game'; }, sample => { sample.payload.games[0].kickoff = iso(now + 1000); }, sample => { sample.payload.games[0].markets.spread.quotes.pop(); }]) {
    const sample = snapshot(); mutate(sample);
    assert.equal(applyProvisionalAnalysisView(applyMarketView(view, sample, now), now).provisionalAnalysis, undefined);
  }
  const draft = structuredClone(view); draft.standings[1].submitted = false; draft.games.forEach(game => { game.opponents = []; });
  const analysis = applyProvisionalAnalysisView(applyMarketView(draft, snapshot(), now), now).provisionalAnalysis;
  assert.equal(analysis.standings.find(player => player.id === 'sean').points, 18);
  assert.equal(analysis.standings.find(player => player.id === 'troy').points, null);
  assert(analysis.standings.every(player => player.record === null));
  for (const changes of [{ revealed: false }, { mode: 'betting_challenge' }, { scoringBenchmark: { status: 'provisional' } }, { scoringBenchmark: { status: 'frozen' } }, { snapshot: { status: 'frozen' } }]) {
    const input = { ...view, ...changes }; assert.equal(applyProvisionalAnalysisView(input, now), input);
  }
});

test('cloud group reads use saved individual scoring references while current consensus stays separate', async () => {
  const { state, snapshot } = fixture();
  const states = Object.fromEntries([group, duel, 'sean-troy-luke'].map(id => [id, { ...structuredClone(state), league: { ...structuredClone(state.league), id } }]));
  const before = structuredClone(states), providerSnapshot = snapshot(), providerBefore = structuredClone(providerSnapshot), reads = [];
  let policyStatus = 'provisional';
  const handler = createCloudHandler({ clock: () => now,
    authenticate: async () => ({ id: user, email: 'fixture@example.test', emailConfirmed: true }),
    storage: { membership: async (_user, league) => states[league] ? { active: true, player_id: 'sean', role: 'commissioner' } : null },
    weekly: { load: async (_user, league) => ({ state: structuredClone(states[league]), revision: 7, leagueRevision: 3 }) },
    odds: {
      marketSnapshot: async (_user, league) => { reads.push(league); return providerSnapshot; },
      scoringBenchmark: async (_user, league) => league !== duel ? null : {
        policyId: 'explicit-duel-fixture', leagueId: duel, season: state.league.season, week: state.league.week, mode: 'guess_spread', status: policyStatus,
        capturedAt: iso(now - 60_000), quotedAt: iso(now - 90_000), actualKickoff: policyStatus === 'frozen' ? iso(now - 10_000) : null,
        games: Object.fromEntries(state.games.map((game, index) => [game.id, { value: [-2, -4][index], oldestObservedAt: iso(now - 90_000), newestObservedAt: iso(now - 70_000) }])),
      },
    },
  });
  const request = async (league, mode = 'guess_spread') => {
    const response = await handler(new Request(`https://fixture.invalid/state?league=${league}&mode=${mode}`, { headers: { authorization: 'Bearer fixture' } }));
    assert.equal(response.status, 200); return response.json();
  };
  for (const league of [group, 'sean-troy-luke']) {
    const result = await request(league);
    assert.equal(result.scoringPolicy, 'submission-time'); assert.equal(result.provisionalAnalysis, undefined); assert.equal(result.score, null);
    assert(result.games.every(game => game.currentConsensus?.value !== null));
    assert.equal(result.scoringBenchmark, undefined); assert.equal(result.revision, 7);
  }
  for (const status of ['provisional', 'frozen']) {
    policyStatus = status;
    const result = await request(duel);
    assert.equal(result.scoringBenchmark, undefined); assert.equal(result.provisionalAnalysis, undefined);
    assert.equal(result.score, null, 'legacy common benchmarks cannot invent submission-time evidence');
  }
  const beforeHidden = reads.length;
  for (const mode of ['guess_total', 'betting_challenge']) {
    const result = await request(group, mode);
    assert.equal(result.provisionalAnalysis, undefined); assert.equal(result.marketLineHistory, undefined);
    if (mode === 'betting_challenge') assert(result.games.every(game => game.quoteReceipts.every(receipt => receipt.market === 'spread')));
  }
  assert.equal(reads.length, beforeHidden + 1, 'Challenge can load already-revealed spread receipts; Total remains hidden');
  assert.deepEqual(states, before); assert.deepEqual(providerSnapshot, providerBefore);
});
