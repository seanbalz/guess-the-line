import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecommendations } from '../shared/recommended-bets.mjs';

// Fixture guesses and quotes only. No player's picks or live bookmaker data.
const observedAt = '2099-10-08T15:00:00.000Z', kickoff = '2099-10-08T20:00:00.000Z';
const now = Date.parse('2099-10-08T18:00:00.000Z');
const base = { id: 'NYJ-BUF', awayCode: 'NYJ', homeCode: 'BUF', away: 'New York Jets', home: 'Buffalo Bills', kickoff };
const quote = (side, line, extra = {}) => ({ book: 'draftkings', source: 'DraftKings', side, line, odds: -110, observedAt, ...extra });
const reference = value => ({ value, observedAt, source: 'Latest retained named-book median', books: 3 });
function fixture({ guess = -6.5, total = 48, spreadLine = -3.5, totalLine = 44.5 } = {}) {
  return {
    now,
    personal: { season: 2099, week: 5, games: [{ ...base, home: 'BUF', away: 'NYJ' }], ballots: {
      guess_spread: { picks: { [base.id]: guess }, submittedAt: observedAt, scoringReferences: { [base.id]: reference(-30) } },
      guess_total: { picks: { [base.id]: total }, submittedAt: observedAt, scoringReferences: { [base.id]: reference(100) } },
    } },
    virtual: { season: 2099, week: 5, games: [{ ...base, locked: { spread: false, total: false },
      consensus: { spread: reference(spreadLine), total: reference(totalLine) },
      offers: { spread: { home: quote('home', spreadLine), away: quote('away', -spreadLine) }, total: { over: quote('over', totalLine), under: quote('under', totalLine) } },
    }], picks: [], results: {} },
  };
}
const row = (input, market = 'spread') => buildRecommendations(input).rows.find(item => item.market === market);

test('every positive offered-line gap qualifies, including 0.5, 2.5 and 3; exact matches do not', () => {
  for (const gap of [0.5, 1, 2.5, 3, 8]) {
    const input = fixture({ guess: -7, spreadLine: -7 + gap });
    assert.equal(row(input).gap, gap);
  }
  assert.equal(row(fixture({ guess: -3.5 })), undefined);
});

test('spread direction follows signed-home values, including a favorite flip and pick’em', () => {
  for (const [guess, spreadLine, side] of [[-6.5, -3.5, 'home'], [-0.5, -3.5, 'away'], [-2, 1, 'home'], [2, -1, 'away'], [0, 3, 'home'], [0, -3, 'away']]) {
    const result = row(fixture({ guess, spreadLine }));
    assert.equal(result.side, side);
    assert.equal(result.evaluations[side].advantage, 3);
    assert.equal(result.evaluations[side === 'home' ? 'away' : 'home'].advantage, -3);
    assert.equal(result.offer.side, side);
  }
});

test('totals select Over above the median and Under below, never the saved scoring line', () => {
  assert.equal(row(fixture({ total: 48 }), 'total').side, 'over');
  const under = row(fixture({ total: 41.5 }), 'total');
  assert.equal(under.side, 'under');
  assert.equal(under.reference.value, 44.5);
  assert.equal(under.evaluations.under.advantage, 3);
  assert.equal(under.evaluations.over.advantage, -3);
});

test('both-side traffic lights turn green/red at one point; smaller signed gaps remain yellow', () => {
  for (const [gap, positive, negative] of [[0.5, 'yellow', 'yellow'], [1, 'green', 'red'], [3, 'green', 'red']]) {
    const result = row(fixture({ guess: -7, spreadLine: -7 + gap }));
    assert.equal(result.evaluations.home.color, positive);
    assert.equal(result.evaluations.away.color, negative);
    assert.equal(result.evaluations.home.label, positive === 'green' ? 'Favorable' : 'Small gap');
    assert.equal(result.evaluations.away.label, negative === 'red' ? 'Against your guess' : 'Small gap');
  }
});

test('consensus and actual book comparisons stay separate, including quarter-point medians', () => {
  const input = fixture({ guess: -4, spreadLine: -3.75 });
  const game = input.virtual.games[0];
  game.offers.spread = { home: quote('home', -3.5), away: quote('away', 5) };
  const result = row(input);
  assert.equal(result.consensusGap, 0.25);
  assert.equal(result.consensusEvaluations.home.advantage, 0.25);
  assert.equal(result.consensusEvaluations.away.advantage, -0.25);
  assert.equal(result.evaluations.home.advantage, 0.5);
  assert.equal(result.evaluations.home.color, 'yellow');
  assert.equal(result.evaluations.away.advantage, 1);
  assert.equal(result.evaluations.away.color, 'green');
  assert.equal(result.side, 'away');
  assert.equal(result.gap, 1);
  assert.equal(result.offerGap, 1);
  assert.strictEqual(result.offer, game.offers.spread.away);
});

test('a favorable book offer remains actionable when the guess exactly matches consensus', () => {
  const input = fixture({ guess: -3.5, total: 44.5 });
  input.virtual.games[0].offers.spread.home = quote('home', -3);
  input.virtual.games[0].offers.total.under = quote('under', 45.5);
  const result = buildRecommendations(input);
  assert.equal(result.counts.actionable, 2);
  assert.deepEqual(result.rows.map(item => [item.market, item.side, item.gap, item.consensusGap]), [['total', 'under', 1, 0], ['spread', 'home', 0.5, 0]]);
  assert.equal(result.rows[0].consensusEvaluations.under.label, 'Even');
});

test('dual favorable offers choose the larger gap, then consensus direction or stable side order for ties', () => {
  const input = fixture({ guess: -4, spreadLine: -3 });
  input.virtual.games[0].offers.spread = { home: quote('home', -3), away: quote('away', 5) };
  assert.equal(row(input).side, 'home');
  input.virtual.games[0].consensus.spread.value = -5;
  assert.equal(row(input).side, 'away');
  input.virtual.games[0].consensus.spread.value = -4;
  assert.equal(row(input).side, 'home');
});

test('spread and total sort together descending with deterministic ties and no top-three truncation', () => {
  const input = fixture();
  const other = { ...input.virtual.games[0], id: 'KC-DEN', homeCode: 'DEN', awayCode: 'KC', home: 'Denver Broncos', away: 'Kansas City Chiefs' };
  input.virtual.games.push(other);
  input.personal.games.push(other);
  input.personal.ballots.guess_spread.picks[other.id] = -10;
  input.personal.ballots.guess_total.picks[other.id] = 47.5;
  assert.deepEqual(buildRecommendations(input).rows.map(item => [item.key, item.gap]), [['KC-DEN:spread', 6.5], ['NYJ-BUF:total', 3.5], ['KC-DEN:total', 3], ['NYJ-BUF:spread', 3]]);
});

test('ranking uses actual offered points rather than a larger consensus discrepancy', () => {
  const input = fixture({ guess: -6.5, spreadLine: -0.5, total: 48, totalLine: 47.5 });
  input.virtual.games[0].offers.spread.home = quote('home', -6);
  input.virtual.games[0].offers.total.over = quote('over', 43);
  const result = buildRecommendations(input);
  assert.deepEqual(result.rows.map(item => [item.market, item.gap, item.consensusGap]), [['total', 5, 0.5], ['spread', 0.5, 6]]);
});

test('saved and unavailable comparisons never displace an actionable unsaved recommendation', () => {
  const input = fixture({ guess: -10 });
  const other = { ...structuredClone(input.virtual.games[0]), id: 'KC-DEN', homeCode: 'DEN', awayCode: 'KC', home: 'Denver Broncos', away: 'Kansas City Chiefs' };
  input.virtual.games.push(other);
  input.personal.games.push(other);
  input.personal.ballots.guess_spread.picks[other.id] = -4;
  input.personal.ballots.guess_total.picks[other.id] = 46;
  input.virtual.games[0].offers.total.over = null;
  input.virtual.picks = [{ gameId: base.id, market: 'spread', selection: { side: 'home' }, status: 'pending' }];
  const result = buildRecommendations(input);
  assert.deepEqual(result.rows.map(item => [item.key, item.actionable]), [
    ['KC-DEN:total', true], ['KC-DEN:spread', true], ['NYJ-BUF:spread', false], ['NYJ-BUF:total', false],
  ]);
  assert.equal(result.counts.actionable, 2);
  assert.equal(result.counts.saved, 1);
  assert.equal(result.counts.unavailableOffer, 1);
  const unavailable = result.rows.at(-1);
  assert.equal(unavailable.gap, null);
  assert.equal(unavailable.offerGap, null);
  assert.equal(unavailable.rankGap, unavailable.consensusGap);
  assert.deepEqual(unavailable.evaluations.over, { side: 'over', advantage: null, color: null, label: 'Unavailable', offer: null });
});

test('only own submitted or per-game locked-in guesses count; drafts and other markets stay closed', () => {
  const input = fixture();
  delete input.personal.ballots.guess_spread.submittedAt;
  assert.equal(row(input), undefined);
  input.personal.ballots.guess_spread.lockedAt = { [base.id]: observedAt };
  assert.equal(row(input).lockedAt, observedAt);
  input.virtual.games[0].locked.spread = true;
  const result = buildRecommendations(input);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].market, 'total');
  assert.equal(result.counts.locked, 1);
  delete input.virtual.games[0].locked.spread;
  assert.equal(row(input), undefined, 'a missing visibility flag is not an open market');
});

test('forecast mode uses only an explicit saved forecast without changing the original guess or reference', () => {
  const input = fixture();
  const forecast = { gameId: base.id, market: 'spread', value: -1, savedAt: observedAt };
  input.personal.forecasts = [forecast];
  const original = structuredClone(input);
  const guessRow = row(input), forecastRow = row({ ...input, basis: 'forecast' });
  assert.equal(guessRow.side, 'home');
  assert.equal(guessRow.basis, 'guess');
  assert.equal(guessRow.forecast, null);
  assert.equal(forecastRow.side, 'away');
  assert.equal(forecastRow.basis, 'forecast');
  assert.equal(forecastRow.guess, -6.5);
  assert.equal(forecastRow.comparisonValue, -1);
  assert.strictEqual(forecastRow.forecast, forecast);
  assert.strictEqual(forecastRow.reference, input.virtual.games[0].consensus.spread);
  assert.equal(forecastRow.gap, 2.5);
  assert.equal(forecastRow.evaluations.home.label, 'Against your forecast');
  assert.deepEqual(input, original);
});

test('forecast mode never falls back for missing, invalid, future, cross-week or ambiguous forecasts', () => {
  const valid = { gameId: base.id, market: 'spread', value: -1, savedAt: observedAt };
  const invalid = [undefined, [], [{ ...valid, value: null }], [{ ...valid, value: '-1' }], [{ ...valid, value: -1.25 }],
    [{ ...valid, value: -101 }], [{ ...valid, savedAt: null }], [{ ...valid, savedAt: 'not-a-date' }],
    [{ ...valid, savedAt: '2099-10-08T19:00:00.000Z' }], [{ ...valid, season: 2098 }], [{ ...valid, week: 4 }],
    [{ ...valid, gameId: 'KC-DEN' }], [{ ...valid, market: 'total' }], [valid, { ...valid }]];
  for (const forecasts of invalid) {
    const input = { ...fixture(), basis: 'forecast' };
    delete input.personal.ballots.guess_total;
    input.personal.forecasts = forecasts;
    const result = buildRecommendations(input);
    assert.equal(result.rows.length, 0);
    assert.equal(result.counts.missingForecast, 1);
    assert.equal(result.counts.actionable, 0);
  }
  assert.equal(buildRecommendations({ ...fixture(), basis: 'model' }).status, 'unavailable');
  assert.equal(buildRecommendations({ ...fixture(), basis: null }).status, 'unavailable');
});

test('an explicit forecast cannot bypass submitted-guess, market visibility or kickoff gates', () => {
  const input = { ...fixture(), basis: 'forecast' };
  input.personal.forecasts = [{ gameId: base.id, market: 'spread', value: -1, savedAt: observedAt }];
  delete input.personal.ballots.guess_spread.submittedAt;
  assert.equal(row(input), undefined);
  input.personal.ballots.guess_spread.lockedAt = { [base.id]: observedAt };
  assert.equal(row(input).side, 'away');
  input.virtual.games[0].locked.spread = true;
  assert.equal(row(input), undefined);
  input.virtual.games[0].locked.spread = false;
  input.now = Date.parse(kickoff);
  assert.equal(row(input), undefined);
});

test('total forecasts use their own market value and keep both actual book comparisons', () => {
  const input = { ...fixture({ total: 48 }), basis: 'forecast' };
  input.personal.forecasts = [
    { gameId: base.id, market: 'spread', value: -1, savedAt: observedAt },
    { gameId: base.id, market: 'total', value: 42, savedAt: observedAt },
  ];
  const result = row(input, 'total');
  assert.equal(result.guess, 48);
  assert.equal(result.comparisonValue, 42);
  assert.equal(result.side, 'under');
  assert.equal(result.gap, 2.5);
  assert.equal(result.evaluations.over.advantage, -2.5);
  assert.equal(result.evaluations.over.label, 'Against your forecast');
  assert.equal(result.evaluations.under.advantage, 2.5);
  assert.equal(result.evaluations.under.color, 'green');
  assert.equal(buildRecommendations(input).counts.actionable, 2);
  delete input.virtual.games[0].consensus.total;
  assert.equal(row(input, 'total'), undefined, 'a forecast does not bypass the current-reference requirement');
});

test('missing, invalid or future guesses, lock times and references cannot form recommendations', () => {
  for (const guess of [null, undefined, NaN, Infinity, '-6.5', -101, -6.25]) {
    const input = fixture(); input.personal.ballots.guess_spread.picks[base.id] = guess;
    assert.equal(row(input), undefined);
  }
  for (const timestamp of [null, '', 'not-a-date', '2099-10-08T19:00:00.000Z']) {
    const input = fixture(); input.personal.ballots.guess_spread.submittedAt = timestamp;
    assert.equal(row(input), undefined);
  }
  for (const referenceValue of [null, {}, { value: -3.5 }, reference(NaN), reference('-3.5'), { ...reference(-3.5), observedAt: '2099-10-08T19:00:00.000Z' }]) {
    const input = fixture(); input.virtual.games[0].consensus.spread = referenceValue;
    assert.equal(row(input), undefined);
    assert.equal(buildRecommendations(input).counts.missingReference, 1);
  }
});

test('the current reference is required even if a saved scoring reference is available', () => {
  const input = fixture(); delete input.virtual.games[0].consensus.spread;
  assert.equal(row(input), undefined);
});

test('old retained quotes stay usable and preserve book, odds, source and observed time exactly', () => {
  const input = fixture(), game = input.virtual.games[0];
  game.consensus.spread.observedAt = '2099-10-01T15:00:00.000Z';
  game.offers.spread.home.observedAt = '2099-10-01T15:00:00.000Z';
  const result = row(input);
  assert.strictEqual(result.reference, game.consensus.spread);
  assert.strictEqual(result.offer, game.offers.spread.home);
  assert.equal(result.offer.odds, -110);
});

test('missing or malformed named-book terms leave the discrepancy visible but unavailable', () => {
  for (const offer of [null, {}, quote('home', -3.5, { book: '' }), quote('home', -3.5, { source: '' }), quote('home', -3.5, { odds: -90 }), quote('home', -3.5, { observedAt: null }), quote('home', -3.5, { observedAt: '2099-10-08T19:00:00.000Z' }), quote('away', -3.5)]) {
    const input = fixture(); input.virtual.games[0].offers.spread.home = offer;
    assert.equal(row(input).offer, null);
    assert.equal(buildRecommendations(input).counts.unavailableOffer, 1);
  }
});

test('a suggested named-book offer must still favor the chosen side against the guess', () => {
  for (const [guess, total, side, market, line] of [[-6.5, 48, 'home', 'spread', -7], [-0.5, 48, 'away', 'spread', 0], [-6.5, 48, 'over', 'total', 48], [-6.5, 41.5, 'under', 'total', 41]]) {
    const input = fixture({ guess, total });
    input.virtual.games[0].offers[market][side] = quote(side, line);
    const result = row(input, market);
    assert.equal(result.offer, null);
    assert.strictEqual(result.evaluations[side].offer, input.virtual.games[0].offers[market][side], 'other-side controls may still display exact terms');
  }
});

test('games at kickoff, completed, cancelled, suspended or postponed are excluded', () => {
  const input = fixture(); input.now = Date.parse(kickoff);
  assert.equal(buildRecommendations(input).rows.length, 0);
  for (const status of ['final', 'cancelled', 'canceled', 'postponed', 'suspended', 'in_progress', 'live']) {
    const state = fixture(); state.virtual.results[base.id] = { status };
    assert.equal(buildRecommendations(state).rows.length, 0, status);
    delete state.virtual.results[base.id]; state.virtual.games[0].status = status;
    assert.equal(buildRecommendations(state).rows.length, 0, `game ${status}`);
  }
});

test('different weeks, mismatched game metadata and ambiguous slate rows never join', () => {
  const input = fixture(); input.personal.week = 6;
  assert.equal(buildRecommendations(input).status, 'week-mismatch');
  for (const change of [{ id: 'NYJ-NE' }, { homeCode: 'NE' }, { home: 'New England Patriots' }, { kickoff: '2099-10-08T21:00:00.000Z' }, { kickoff: null }, { week: 6 }]) {
    const state = fixture(); Object.assign(state.personal.games[0], change);
    assert.equal(buildRecommendations(state).rows.length, 0);
  }
  const state = fixture(); state.virtual.games.push(structuredClone(state.virtual.games[0]));
  assert.equal(buildRecommendations(state).rows.length, 0);
  assert.equal(buildRecommendations({}).status, 'unavailable');
});

test('an existing saved pick remains attached once, with its exact terms, including duplicate API rows', () => {
  const input = fixture(), saved = { gameId: base.id, market: 'spread', status: 'pending', selection: { side: 'away', line: 2.5, odds: 105, units: 2, source: 'FanDuel', quotedAt: observedAt } };
  input.virtual.picks = [saved, structuredClone(saved), { ...saved, market: 'total', week: 4 }];
  const result = buildRecommendations(input);
  assert.equal(result.rows.length, 2);
  assert.strictEqual(row(input).savedPick, saved);
  assert.equal(row(input, 'total').savedPick, null);
  assert.equal(result.counts.saved, 1);
});

test('building recommendations does not mutate authenticated replies', () => {
  const input = fixture(), original = structuredClone(input);
  buildRecommendations(input);
  assert.deepEqual(input, original);
});
