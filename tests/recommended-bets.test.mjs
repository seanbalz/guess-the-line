import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecommendations, filterRecommendations, recommendationList, recommendationMarket, RECOMMENDATION_MARKETS, RECOMMENDATION_PREVIEW } from '../shared/recommended-bets.mjs';

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

test('all nonzero gaps qualify, including 0.25, 0.5, 2.5 and 3; exact matches do not', () => {
  for (const gap of [0.25, 0.5, 1, 2.5, 3, 8]) {
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

test('both-side traffic lights use ten percent of the market line', () => {
  for (const [gap, positive, negative] of [[0.25, 'yellow', 'yellow'], [0.5, 'yellow', 'yellow'], [1, 'green', 'red'], [3, 'green', 'red']]) {
    const result = row(fixture({ guess: -7, spreadLine: -7 + gap }));
    assert.equal(result.evaluations.home.color, positive);
    assert.equal(result.evaluations.away.color, negative);
    assert.equal(result.evaluations.home.label, positive === 'green' ? 'Favorable' : 'Small gap');
    assert.equal(result.evaluations.away.label, negative === 'red' ? 'Against your guess' : 'Small gap');
  }
});

test('equal relative spread and total gaps have equal rank strength and guidance', () => {
  const input = fixture({ guess: -11, spreadLine: -10, total: 55, totalLine: 50 });
  const result = buildRecommendations(input);
  assert.equal(result.rows.length, 2);
  for (const item of result.rows) {
    assert.equal(item.gapPercent, 10);
    assert.equal(item.evaluations[item.side].color, 'green');
  }
  assert.equal(row(input, 'spread').denominator, 10);
  assert.equal(row(input, 'total').denominator, 50);
});

test('percentage sorts cross-market differences ahead of larger raw-point gaps', () => {
  const input = fixture({ guess: -12, spreadLine: -10, total: 55, totalLine: 50 });
  assert.deepEqual(buildRecommendations(input).rows.map(item => item.market), ['spread', 'total']);
  assert.equal(row(input, 'spread').gapPercent, 20);
  assert.equal(row(input, 'total').gapPercent, 10);
});

test('pick’em and short spreads use the approved three-point denominator', () => {
  for (const spreadLine of [0, -0.5, 0.5, -2.5]) {
    const input = fixture({ guess: spreadLine + 0.5, spreadLine });
    const result = row(input);
    assert.equal(result.denominator, 3);
    assert.equal(result.gapPercent, 100 / 6);
    assert.equal(result.evaluations[result.side].color, 'green');
  }
  const input = fixture({ totalLine: 0, total: 5 });
  assert.equal(row(input, 'total'), undefined);
});

test('spread and total sort together by relative gap with deterministic ties and no top-three truncation', () => {
  const input = fixture();
  const other = { ...input.virtual.games[0], id: 'KC-DEN', homeCode: 'DEN', awayCode: 'KC', home: 'Denver Broncos', away: 'Kansas City Chiefs' };
  input.virtual.games.push(other);
  input.personal.games.push(other);
  input.personal.ballots.guess_spread.picks[other.id] = -10;
  input.personal.ballots.guess_total.picks[other.id] = 47.5;
  assert.deepEqual(buildRecommendations(input).rows.map(item => [item.key, item.gap]), [['KC-DEN:spread', 6.5], ['NYJ-BUF:spread', 3], ['NYJ-BUF:total', 3.5], ['KC-DEN:total', 3]]);
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

// BETS-NEXT-01: three games whose mixed percentage ranking puts every spread ahead of every total, so a market filter
// that ran after the top-three limit would leave Totals empty.
function mixedSlate() {
  const input = fixture();
  for (const [id, awayCode, homeCode, spread, total] of [['KC-DEN', 'KC', 'DEN', -10, 47.5], ['SF-SEA', 'SF', 'SEA', -5, 52]]) {
    const game = { ...input.virtual.games[0], id, awayCode, homeCode, away: awayCode, home: homeCode };
    input.virtual.games.push(game);
    input.personal.games.push(game);
    input.personal.ballots.guess_spread.picks[id] = spread;
    input.personal.ballots.guess_total.picks[id] = total;
  }
  return buildRecommendations(input).rows;
}
const keys = rows => rows.map(item => item.key);

test('All keeps the mixed percentage ranking; Spreads and Totals keep that order within one market', () => {
  const rows = mixedSlate();
  assert.deepEqual(keys(rows), ['KC-DEN:spread', 'NYJ-BUF:spread', 'SF-SEA:spread', 'SF-SEA:total', 'NYJ-BUF:total', 'KC-DEN:total']);
  assert.deepEqual(RECOMMENDATION_MARKETS, ['all', 'spread', 'total']);
  assert.strictEqual(filterRecommendations(rows, 'all'), rows, 'All is the unchanged mixed list');
  assert.deepEqual(keys(filterRecommendations(rows, 'spread')), ['KC-DEN:spread', 'NYJ-BUF:spread', 'SF-SEA:spread']);
  assert.deepEqual(keys(filterRecommendations(rows, 'total')), ['SF-SEA:total', 'NYJ-BUF:total', 'KC-DEN:total']);
  for (const market of ['spread', 'total']) {
    const chosen = filterRecommendations(rows, market);
    assert.ok(chosen.every(item => rows.includes(item)), 'the same row objects, never rebuilt or re-ranked');
    assert.deepEqual(chosen, rows.filter(item => item.market === market));
  }
});

test('the market choice applies to the complete ranked set before the top-three display limit', () => {
  const rows = mixedSlate();
  assert.equal(RECOMMENDATION_PREVIEW, 3);
  assert.deepEqual(rows.slice(0, 3).filter(item => item.market === 'total'), [], 'the fixture exposes a filter run after the limit');
  const totals = recommendationList(rows, { market: 'total' });
  assert.deepEqual(keys(totals.visible), ['SF-SEA:total', 'NYJ-BUF:total', 'KC-DEN:total']);
  assert.equal(totals.rows.length, 3, 'counts describe the chosen market');
  assert.equal(recommendationList(rows, { market: 'spread' }).visible.length, 3);
  assert.deepEqual(keys(recommendationList(rows, { market: 'all' }).visible), keys(rows.slice(0, 3)));
  assert.deepEqual(keys(recommendationList(rows, { market: 'all', expanded: true }).visible), keys(rows));
  const fewer = recommendationList(rows.filter(item => item.key !== 'SF-SEA:spread'), { market: 'spread' });
  assert.deepEqual(keys(fewer.visible), ['KC-DEN:spread', 'NYJ-BUF:spread'], 'fewer rows than the limit are all shown');
});

test('an empty market stays empty instead of falling back, and unknown choices mean All', () => {
  const totalsOnly = mixedSlate().filter(item => item.market === 'total');
  assert.deepEqual(recommendationList(totalsOnly, { market: 'spread' }), { rows: [], visible: [] });
  for (const value of [undefined, null, '', 'spreads', 'moneyline', 'SPREAD', 3, {}]) {
    assert.equal(recommendationMarket(value), 'all');
    assert.strictEqual(filterRecommendations(totalsOnly, value), totalsOnly);
  }
  assert.equal(recommendationMarket('spread'), 'spread');
  assert.equal(recommendationMarket('total'), 'total');
  assert.deepEqual(filterRecommendations(undefined, 'total'), []);
});

test('the market filter is display-only and changes no row, offer or saved pick', () => {
  const rows = mixedSlate(), before = structuredClone(rows);
  Object.freeze(rows);
  for (const market of RECOMMENDATION_MARKETS) for (const expanded of [false, true]) recommendationList(rows, { market, expanded });
  assert.deepEqual(rows, before);
});
