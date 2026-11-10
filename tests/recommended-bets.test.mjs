import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecommendations, filterRecommendations, gapRecord, GAP_WIN_UNITS, recommendationList, recommendationMarket, RECOMMENDATION_MARKETS, RECOMMENDATION_PREVIEW } from '../shared/recommended-bets.mjs';

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

test('both-side traffic lights use the historical top quarter with distinct spread and total boundaries', () => {
  for (const [gap, positive, negative] of [[0.5, 'yellow', 'yellow'], [3, 'yellow', 'yellow'], [13.5, 'yellow', 'yellow'], [14, 'green', 'red']]) {
    const result = row(fixture({ guess: -gap, spreadLine: 0 }));
    assert.equal(result.evaluations.home.color, positive);
    assert.equal(result.evaluations.away.color, negative);
    assert.equal(result.evaluations.home.label, positive === 'green' ? 'Large gap in your direction' : gap >= 8 ? 'Moderate gap' : 'Small gap');
    assert.equal(result.evaluations.away.label, negative === 'red' ? 'Large gap against your guess' : gap >= 8 ? 'Moderate gap' : 'Small gap');
  }
  assert.equal(row(fixture({ total: 64, totalLine: 50 }), 'total').evaluations.over.color, 'yellow');
  assert.equal(row(fixture({ total: 64.5, totalLine: 50 }), 'total').evaluations.over.color, 'green');
});

test('the old equal-percentage example now ranks a five-point total gap above a one-point spread gap', () => {
  const input = fixture({ guess: -11, spreadLine: -10, total: 55, totalLine: 50 });
  const result = buildRecommendations(input);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows.map(item => item.market), ['total', 'spread']);
  assert.ok(row(input, 'total').gapScore > row(input, 'spread').gapScore);
  for (const item of result.rows) assert.equal(item.evaluations[item.side].color, 'yellow');
});

test('historical market scales replace percentages without an arbitrary total multiplier', () => {
  const input = fixture({ guess: -12, spreadLine: -10, total: 55, totalLine: 50 });
  assert.deepEqual(buildRecommendations(input).rows.map(item => item.market), ['total', 'spread']);
  assert.ok(row(input, 'total').gapScore > row(input, 'spread').gapScore);
  assert.equal(row(input, 'spread').gapPercent, undefined);
});

test('pick’em, short spreads and large spreads give the same gap the same size', () => {
  const expected = row(fixture({ guess: 0.5, spreadLine: 0 })).gapScore;
  for (const spreadLine of [0, -0.5, 0.5, -2.5, 10, -20]) {
    const input = fixture({ guess: spreadLine + 0.5, spreadLine });
    const result = row(input);
    assert.equal(result.gapScore, expected);
    assert.equal(result.evaluations[result.side].color, 'yellow');
  }
  const input = fixture({ totalLine: 0, total: 5 });
  assert.equal(row(input, 'total'), undefined);
});

test('spread and total sort together by historical size with no top-three truncation', () => {
  const input = fixture();
  const other = { ...input.virtual.games[0], id: 'KC-DEN', homeCode: 'DEN', awayCode: 'KC', home: 'Denver Broncos', away: 'Kansas City Chiefs' };
  input.virtual.games.push(other);
  input.personal.games.push(other);
  input.personal.ballots.guess_spread.picks[other.id] = -10;
  input.personal.ballots.guess_total.picks[other.id] = 47.5;
  assert.deepEqual(buildRecommendations(input).rows.map(item => [item.key, item.gap]), [['KC-DEN:spread', 6.5], ['NYJ-BUF:total', 3.5], ['NYJ-BUF:spread', 3], ['KC-DEN:total', 3]]);
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

test('equal historical scores keep deterministic kickoff/key order regardless of input order', () => {
  const input = fixture(), other = { ...input.virtual.games[0], id: 'KC-DEN', homeCode: 'DEN', awayCode: 'KC', home: 'DEN', away: 'KC' };
  input.virtual.games.push(other);
  input.personal.games.push(other);
  input.personal.ballots.guess_spread.picks[other.id] = -6.5;
  input.personal.ballots.guess_total.picks[other.id] = 48;
  const expected = ['KC-DEN:total', 'NYJ-BUF:total', 'KC-DEN:spread', 'NYJ-BUF:spread'];
  assert.deepEqual(buildRecommendations(input).rows.map(row => row.key), expected);
  input.virtual.games.reverse(); input.personal.games.reverse();
  assert.deepEqual(buildRecommendations(input).rows.map(row => row.key), expected);
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

// BETS-NEXT-01: three games whose historical-size ranking puts every spread ahead of every total, so a market filter
// that ran after the top-three limit would leave Totals empty.
function mixedSlate() {
  const input = fixture();
  input.personal.ballots.guess_spread.picks[base.id] = -25;
  for (const [id, awayCode, homeCode, spread, total] of [['KC-DEN', 'KC', 'DEN', -30, 47.5], ['SF-SEA', 'SF', 'SEA', -20, 52]]) {
    const game = { ...input.virtual.games[0], id, awayCode, homeCode, away: awayCode, home: homeCode };
    input.virtual.games.push(game);
    input.personal.games.push(game);
    input.personal.ballots.guess_spread.picks[id] = spread;
    input.personal.ballots.guess_total.picks[id] = total;
  }
  return buildRecommendations(input).rows;
}
const keys = rows => rows.map(item => item.key);

test('All keeps the mixed historical-size ranking; Spreads and Totals keep that order within one market', () => {
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

// D-77 actionable-first ordering survives the D-81 magnitude correction.
test('actionable rows rank ahead of bigger unavailable gaps; historical-size order holds inside each group', () => {
  const input = fixture({ guess: -12, spreadLine: -10, total: 52, totalLine: 50 });
  const other = { ...input.virtual.games[0], id: 'KC-DEN', homeCode: 'DEN', awayCode: 'KC', home: 'Denver Broncos', away: 'Kansas City Chiefs' };
  input.virtual.games.push(other);
  input.personal.games.push({ ...other, home: 'DEN', away: 'KC' });
  input.personal.ballots.guess_spread.picks[other.id] = -10.5;
  input.personal.ballots.guess_total.picks[other.id] = 50.5;
  // All four can be acted on: compare each gap on its own market's historical scale.
  assert.deepEqual(buildRecommendations(input).rows.map(item => [item.key, item.actionable]),
    [['NYJ-BUF:spread', true], ['NYJ-BUF:total', true], ['KC-DEN:spread', true], ['KC-DEN:total', true]]);
  // The biggest gap's favorable side has no quote, and the next one already has a saved Virtual Units pick.
  input.virtual.games[0].offers.spread.home = null;
  input.virtual.picks = [{ season: 2099, week: 5, gameId: 'KC-DEN', market: 'spread', selection: { side: 'home' } }];
  const rows = buildRecommendations(input).rows;
  assert.deepEqual(rows.map(item => [item.key, item.actionable]),
    [['NYJ-BUF:total', true], ['KC-DEN:total', true], ['NYJ-BUF:spread', false], ['KC-DEN:spread', false]]);
  assert.deepEqual(rows.slice(0, RECOMMENDATION_PREVIEW).map(item => item.key), ['NYJ-BUF:total', 'KC-DEN:total', 'NYJ-BUF:spread'], 'the preview takes the actionable ones first');
  assert.deepEqual(filterRecommendations(rows, 'spread').map(item => item.key), ['NYJ-BUF:spread', 'KC-DEN:spread'], 'the market filter keeps the order');
});

// D-77 (Sean, November 3, 2026: "Your gaps' paper record").
const board = games => ({ season: 2099, week: 5, games });
const played = ({ id = 'NYJ-BUF', home = 24, away = 20, status = 'final', started = true, spread = -3.5, total = 44.5, guesses = {}, mine = {} } = {}) => ({
  id, started, final: status ? { status, home, away } : null,
  spread: spread === null ? { visible: false } : { visible: true, value: spread }, total: total === null ? { visible: false } : { visible: true, value: total },
  mine: Object.fromEntries(['spread', 'total'].map(market => [market, { guess: guesses[market] ?? null, lockedIn: guesses[market] != null, satOut: false, late: null, ...mine[market] }])),
});

test('recommendation colors and the historical Large filter agree on both sides of each market cutoff', () => {
  for (const [market, line, gap] of [['spread', 0, 13.5], ['spread', -3.5, 14], ['total', 44.5, 14], ['total', 44.5, 14.5]]) {
    for (const direction of [-1, 1]) {
      const guess = line + gap * direction;
      const input = fixture(market === 'spread' ? { guess, spreadLine: line } : { total: guess, totalLine: line });
      const recommendation = row(input, market);
      const record = gapRecord(board([played({ [market]: line, guesses: { [market]: guess } })]));
      assert.equal(record.graded[0].gapScore, recommendation.gapScore);
      assert.equal(record.graded[0].large, recommendation.evaluations[recommendation.side].color === 'green');
      assert.equal(record.large.riskUnits, record.graded[0].large ? 1 : 0);
    }
  }
  assert.equal(gapRecord(board([played({ total: 0, guesses: { total: 5 } })])).notGraded.noLine, 1);
});

test('the gap record grades the side your locked guess favored against the closing line and the final', () => {
  // BUF 24, NYJ 20; closing BUF -3.5 and 44.5.
  const cases = [
    [{ spread: -7 }, 'spread', 'home', 'win'], // you had BUF by more than 3.5; BUF won by 4
    [{ spread: -1 }, 'spread', 'away', 'loss'], // you had BUF by less; BUF covered
    [{ total: 48 }, 'total', 'over', 'loss'], // 44 points, under 44.5
    [{ total: 40 }, 'total', 'under', 'win'],
  ];
  for (const [guesses, market, side, outcome] of cases) {
    const record = gapRecord(board([played({ guesses })]));
    assert.deepEqual(record.graded.map(g => [g.market, g.side, g.outcome]), [[market, side, outcome]], JSON.stringify(guesses));
  }
  // A whole-number line that lands exactly is a push; a flipped favorite still follows the signed home value.
  assert.equal(gapRecord(board([played({ spread: -4, guesses: { spread: -6 } })])).graded[0].outcome, 'push');
  assert.deepEqual(gapRecord(board([played({ home: 17, away: 21, spread: 2.5, guesses: { spread: 5 } })])).graded.map(g => [g.side, g.outcome]), [['away', 'win']]);
});

test('the gap record retains all grading and paper ROI, with a separate historical top-quarter record', () => {
  const record = gapRecord(board([
    played({ id: 'A-B', guesses: { spread: -20, total: 25 } }), // large spread win and total win
    played({ id: 'C-D', guesses: { spread: 15, total: 45 } }), // large spread loss, small total loss
    played({ id: 'E-F', spread: -4, guesses: { spread: -18 } }), // large spread push
  ]));
  assert.deepEqual([record.wins, record.losses, record.pushes, record.riskUnits], [2, 2, 1, 5]);
  assert.equal(record.netUnits, Math.round((2 * GAP_WIN_UNITS - 2) * 100) / 100);
  assert.equal(record.netUnits, -0.18);
  assert.equal(record.roi, -3.64, 'ROI from the unrounded net: -0.1818 over 5 units');
  assert.deepEqual([record.large.wins, record.large.losses, record.large.pushes], [2, 1, 1]);
  assert.equal(record.large.netUnits, 0.82);
  assert.equal(record.large.roi, 20.45);
  // Recommended's Spreads / Totals choice narrows the record the same way it narrows the list.
  const games = [played({ id: 'A-B', guesses: { spread: -7, total: 48 } })];
  assert.deepEqual([gapRecord(board(games), { market: 'spread' }).graded.map(g => g.market), gapRecord(board(games), { market: 'total' }).graded.map(g => g.market),
    gapRecord(board(games), { market: 'nonsense' }).graded.map(g => g.market)], [['spread'], ['total'], ['spread', 'total']]);
});

test('nothing is estimated: no final, no closing line, an even guess, a draft or a sit-out is never graded', () => {
  const record = gapRecord(board([
    played({ id: 'A-B', status: null, started: true, guesses: { spread: -7 } }), // started, no final yet
    played({ id: 'C-D', status: 'in_progress', guesses: { total: 40 } }),
    played({ id: 'E-F', started: false, status: null, guesses: { spread: -7 } }), // not started
    played({ id: 'G-H', spread: null, guesses: { spread: -7 } }), // no closing line
    played({ id: 'I-J', guesses: { spread: -3.5 } }), // even with the closing line
    played({ id: 'K-L', guesses: { spread: -7 }, mine: { spread: { lockedIn: false } } }), // a draft
    played({ id: 'M-N', guesses: { total: 40 }, mine: { total: { satOut: true } } }),
  ]));
  assert.deepEqual([record.wins, record.losses, record.pushes, record.riskUnits, record.roi], [0, 0, 0, 0, null]);
  assert.deepEqual(record.notGraded, { noFinal: 3, noLine: 1 });
  assert.equal(record.even, 1);
  assert.deepEqual(record.graded, []);
  assert.equal(gapRecord(null), null);
  assert.equal(gapRecord({ games: 'x' }), null);
});
