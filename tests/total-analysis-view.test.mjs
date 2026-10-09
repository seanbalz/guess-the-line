import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMarketView } from '../cloud/market-view.mjs';
import { applyTotalAnalysisView } from '../cloud/total-analysis-view.mjs';

const now = Date.parse('2026-10-08T20:00:00Z');
const iso = value => new Date(value).toISOString();
function fixture() {
  const games = [
    { id: 'A', home: 'Home A', away: 'Away A', kickoff: iso(now + 3600_000), prediction: 44, market: null, points: null, opponents: [{ id: 'other', value: 45 }] },
    { id: 'B', home: 'Home B', away: 'Away B', kickoff: iso(now + 7200_000), prediction: 0, market: null, points: null, opponents: [{ id: 'other', value: 0 }] },
  ];
  const view = { revealed: true, mode: 'guess_total', playerId: 'own', games,
    league: { practice: false }, officialEligible: true, officialStatus: 'Awaiting verified quotes and actual kickoff',
    standings: [{ id: 'own', submitted: true, points: null, record: null }, { id: 'other', submitted: true, points: null, record: null }],
    score: null, maxPoints: 20, snapshot: null,
  };
  const snapshot = (time = now, values = [44.5, 0]) => ({ id: `snapshot-${time}`, createdAt: iso(time), payload: { provider: 'the-odds-api', sport: 'americanfootball_nfl', fetchedAt: iso(time),
    games: games.map((game, index) => ({ ...game, gameId: game.id, providerEventId: `event-${index}`, matchStatus: 'matched', markets: {
      total: { quotes: ['draftkings', 'fanduel', 'betmgm'].map(book => ({ book, provider: 'the-odds-api', providerEventId: `event-${index}`, timeBasis: 'provider_market_last_update', outcomes: { over: { line: values[index] }, under: { line: values[index] } }, market: 'total', value: values[index], providerObservedAt: iso(time - 30_000), collectedAt: iso(time) })) },
      spread: { privateOtherMode: -99 },
    } })),
  } });
  return { view, snapshot };
}

test('total analysis scores all submitted players against one collected reference without changing official values', () => {
  const { view, snapshot } = fixture();
  const projected = applyMarketView(view, snapshot(), now), before = structuredClone(projected);
  const result = applyTotalAnalysisView(projected, now), analysis = result.provisionalAnalysis;
  assert.equal(analysis.score, 19); assert.equal(analysis.maxPoints, 20);
  assert.equal(analysis.games.B.value, 0); assert.equal(analysis.games.B.points, 10);
  assert.equal(analysis.stale, false); assert.equal(analysis.status, 'provisional'); assert.equal(analysis.officialVerified, false);
  assert.equal(analysis.timeBasis, 'collection'); assert.equal(analysis.quotedAt, undefined);
  assert.equal(analysis.policyId, undefined); assert.equal(analysis.actualKickoff, undefined);
  for (const player of analysis.standings) {
    assert.equal(player.points, 19); assert.equal(player.error, .5); assert.equal(player.exact, 1);
    assert.deepEqual(player.record, { W: 0, L: 0, T: 2 });
  }
  const { provisionalAnalysis, ...unchanged } = result;
  assert.deepEqual(unchanged, before); assert.deepEqual(projected, before);
  assert.equal(JSON.stringify(analysis).includes('privateOtherMode'), false);
});

test('incomplete later collections retain an older complete reference, never mixed-game estimates', () => {
  const { view, snapshot } = fixture();
  const older = snapshot(now - 600_000), latest = snapshot(now, [90, 90]);
  latest.payload.games[1].markets.total.quotes.pop(); latest.history = [older];
  const analysis = applyTotalAnalysisView(applyMarketView(view, latest, now), now).provisionalAnalysis;
  assert.equal(analysis.snapshotId, older.id); assert.equal(analysis.capturedAt, older.createdAt);
  assert.equal(analysis.games.A.value, 44.5); assert.equal(analysis.games.B.value, 0);
  assert.equal(analysis.score, 19); assert.equal(analysis.stale, true);
  const missing = snapshot(); missing.payload.games[1].markets.total.quotes.pop();
  const partialView = applyMarketView(view, missing, now);
  assert.equal(applyTotalAnalysisView(partialView, now), partialView);
});

test('unsubmitted or missing opponent numbers stay unscored and suppress every comparative record', () => {
  for (const mutation of [view => { view.standings[1].submitted = false; }, view => { view.games[1].opponents = []; }]) {
    const { view, snapshot } = fixture(); mutation(view);
    const analysis = applyTotalAnalysisView(applyMarketView(view, snapshot(), now), now).provisionalAnalysis;
    assert.equal(analysis.standings.find(player => player.id === 'own').points, 19);
    assert.equal(analysis.standings.find(player => player.id === 'other').points, null);
    assert(analysis.standings.every(player => player.record === null));
  }
});

test('total estimates preserve submission gates, practice status and frozen official views', () => {
  const { view, snapshot } = fixture();
  const projected = applyMarketView(view, snapshot(), now);
  for (const changes of [
    { revealed: false }, { mode: 'guess_spread' }, { mode: 'betting_challenge' },
    { scoringBenchmark: { status: 'frozen' } }, { snapshot: { status: 'frozen' } },
    { standings: projected.standings.map(player => ({ ...player, submitted: false })) },
  ]) {
    const input = { ...projected, ...changes };
    assert.equal(applyTotalAnalysisView(input, now), input);
  }
  const practice = { ...projected, league: { practice: true }, officialEligible: false, officialStatus: 'Practice game — no official scores' };
  const result = applyTotalAnalysisView(practice, now);
  assert.equal(result.provisionalAnalysis.score, 19); assert.equal(result.provisionalAnalysis.officialVerified, false);
  assert.equal(result.officialEligible, false); assert.equal(result.officialStatus, practice.officialStatus);
});

test('freshness is never inferred from collection time when actual observations have expired', () => {
  const { view, snapshot } = fixture();
  const checkAt = now + 280_000; // Collection is under five minutes old; observations are older.
  const analysis = applyTotalAnalysisView(applyMarketView(view, snapshot(), checkAt), checkAt).provisionalAnalysis;
  assert.equal(analysis.stale, true); assert.equal(analysis.capturedAt, iso(now));
  const invalidHistory = [
    item => { item.capturedAt = iso(now + 1); item.quotedAt = item.capturedAt; },
    item => { item.games.B.value = -1; }, item => { item.games.B.value = .25; },
    item => { item.timeBasis = 'publication'; }, item => { item.verified = true; },
    item => { item.games.extra = { value: 50 }; },
  ];
  for (const mutate of invalidHistory) {
    const projected = applyMarketView(view, snapshot(), now); mutate(projected.marketLineHistory[0]);
    assert.equal(applyTotalAnalysisView(projected, now), projected);
  }
});
