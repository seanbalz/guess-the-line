import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboardInsights } from '../web/src/dashboardInsightsModel.js';

const reference = (value, extra = {}) => ({ status: 'available', value, source: 'Synthetic three-book fixture', savedAt: '2026-10-08T17:00:00Z', capturedAt: '2026-10-08T16:59:00Z', observedAt: '2026-10-08T16:58:00Z', ...extra });
function fixture() {
  return { playerId: 'own', mode: 'guess_spread', revealed: true, scoringPolicy: 'submission-time',
    league: { roster: [{ id: 'own', name: 'Avery' }, { id: 'friend', name: 'Jordan' }, { id: 'draft', name: 'Casey' }] },
    standings: [{ id: 'own', submitted: true, points: 999 }, { id: 'friend', submitted: true }, { id: 'draft', submitted: false }],
    games: [0, 0.5, 1, 1.5, 6, null].map((prediction, i) => ({ id: `g${i}`, awayCode: `A${i}`, homeCode: `H${i}`, prediction, scoringReference: reference(0), currentConsensus: { value: 99 }, opponents: [{ id: 'friend', value: 1, scoringReference: reference(1) }, { id: 'draft', value: 0, scoringReference: reference(0) }] })),
  };
}

test('saved reference points preserve exact zero and zero points; disjoint mix includes missing guesses', () => {
  const data = fixture(), before = structuredClone(data), model = buildDashboardInsights(data);
  assert.equal(model.players[0].points, null);
  assert.equal(model.players[0].scoredSubtotal, 34);
  assert.deepEqual(model.players[0].games.map(game => game.points), [10, 9, 8, 7, 0, null]);
  assert.equal(model.players[0].scoredGames, 5);
  assert.equal(model.players[0].maxPoints, 60);
  assert.equal(model.players[0].meanError, 1.8);
  assert.deepEqual(model.mix.map(bucket => bucket.count), [1, 2, 2, 1]);
  assert.equal(model.mix.reduce((sum, bucket) => sum + bucket.count, 0), model.totalGames);
  assert.equal(model.players[1].points, 60);
  assert.deepEqual(data, before);
});

test('each player uses their own reference, never current market or another player reference', () => {
  const data = fixture();
  data.games = [data.games[0]];
  data.games[0].opponents[0] = { id: 'friend', value: 0, scoringReference: reference(2) };
  data.games[0].market = 0;
  data.games[0].analysisMarket = { value: 0 };
  data.games[0].scoringReference = reference(0, { status: 'stale' });
  const model = buildDashboardInsights(data);
  assert.equal(model.players[0].points, null);
  assert.equal(model.players[0].meanError, null);
  assert.equal(model.players[0].scoredGames, 0);
  assert.equal(model.players[0].games[0].reference, null);
  assert.equal(model.players[1].points, 6);
  assert.deepEqual(model.mix.map(bucket => bucket.count), [0, 0, 0, 1]);
});

test('a complete zero-point week differs from a week with no scored references', () => {
  const data = fixture();
  data.games = [{ ...data.games[0], prediction: 6 }];
  assert.equal(buildDashboardInsights(data).players[0].points, 0);
  data.games[0].scoringReference = null;
  const own = buildDashboardInsights(data).players[0];
  assert.equal(own.points, null);
  assert.equal(own.scoredSubtotal, null);
  assert.equal(own.scoredGames, 0);
});

test('null, missing and nonfinite values stay unscored without lowering averages', () => {
  const data = fixture();
  data.games[1].scoringReference = reference(null);
  data.games[2].scoringReference = reference(Infinity);
  data.games[3].scoringReference = undefined;
  data.games[4].prediction = NaN;
  const own = buildDashboardInsights(data).players[0];
  assert.equal(own.points, null);
  assert.equal(own.scoredSubtotal, 10);
  assert.equal(own.scoredGames, 1);
  assert.equal(own.unscoredGames, 5);
  assert.equal(own.meanError, 0);
  assert.equal(own.exact, 1);
});

test('independent market reveal, submitted owner and saved-reference policy are required', () => {
  for (const patch of [{ revealed: false }, { mode: 'betting_challenge' }, { mode: 'unknown' }, { scoringPolicy: undefined }]) assert.equal(buildDashboardInsights({ ...fixture(), ...patch }), null);
  const data = fixture();
  data.standings[0].submitted = false;
  assert.equal(buildDashboardInsights(data), null);
  data.standings[0].submitted = true;
  const opponent = buildDashboardInsights(data).players[2];
  assert.equal(opponent.points, null);
  assert.ok(opponent.games.every(game => game.guess === null && game.reference === null && game.source === null));
});

test('selection filters own mix and source details, never full-week player points', () => {
  const data = fixture(), all = buildDashboardInsights(data);
  const selected = buildDashboardInsights(data, [data.games[2], data.games[2], { id: 'unknown', prediction: 900, scoringReference: reference(900) }]);
  assert.equal(selected.filtered, true);
  assert.deepEqual(selected.ownGames.map(game => game.id), ['g2']);
  assert.deepEqual(selected.players.map(player => player.points), all.players.map(player => player.points));
  assert.deepEqual(selected.mix.map(bucket => bucket.count), [0, 1, 0, 0]);
  const empty = buildDashboardInsights(data, []);
  assert.equal(empty.visibleGames.length, 0);
  assert.equal(empty.mix.reduce((sum, bucket) => sum + bucket.count, 0), 0);
  assert.equal(empty.players[0].points, null);
  assert.equal(empty.players[0].scoredSubtotal, 34);
});

test('total is independent, captured legacy references retain their real timestamps, and duplicate games cannot inflate points', () => {
  const data = fixture(); data.mode = 'guess_total';
  data.games = [{ ...data.games[0], prediction: 44.5, scoringReference: reference(45, { status: 'captured', savedAt: null, recordedAt: '2026-10-08T17:01:00Z' }) }];
  data.games.push(data.games[0]);
  const model = buildDashboardInsights(data);
  assert.equal(model.market, 'Total');
  assert.equal(model.totalGames, 1);
  assert.equal(model.players[0].points, 9);
  assert.equal(model.players[0].games[0].savedAt, '2026-10-08T17:01:00Z');
  assert.equal(model.players[0].games[0].observedAt, '2026-10-08T16:58:00Z');
});
