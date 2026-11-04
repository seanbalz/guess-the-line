// D-69 step 4: Bets › Your gap's rules as plain data (the old VirtualUnits.jsx Recommended view, rebuilt). Contracts: a
// row says its game as marks and codes, its point gap, the side to review and the quote's age, the % on the right over a
// word that says its state; four tiles; the saved card in the app's words; the review closes at kickoff by the server's
// clock; the placement body is the reviewed quote's exact terms; a lost reply is confirmed only by the exact saved terms;
// a locked or already saved market's selection is dropped; the trends are the market's own; D-77's units keep their style.
import test from 'node:test';
import assert from 'node:assert/strict';
import week7 from '../shared/trends/2026-week-07.json' with { type: 'json' };
import { GAP_COPY, closedReason, confirmsChoice, gapRow, gapTiles, gapTrendCards, gapUnits, pendingRows, placeBody, quoteAge, savedRows, staleKeys, termsText, trackTicket, weekOptions } from '../web/src/next/bets/gap/gapModel.js';

const now = Date.parse('2099-10-08T17:00:00Z');
const game = { id: 'SEA-DEN', away: 'Seattle Seahawks', home: 'Denver Broncos', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2099-10-08T20:00:00Z', offers: { total: { over: { book: 'betmgm', source: 'BetMGM', side: 'over', line: 44.5, odds: -110, observedAt: '2099-10-08T15:00:00Z' } } }, locked: { spread: false, total: false } };
const row = { key: 'SEA-DEN:total', game, market: 'total', guess: 55, gap: 10.5, gapPercent: 23.595, side: 'over', reference: { value: 44.5, books: 3, observedAt: '2099-10-08T15:00:00Z' }, offer: game.offers.total.over, savedPick: null, actionable: true, evaluations: {} };
const words = text => String(text).trim().split(/\s+/).length;

test('a row: marks and codes, the point gap, the side to review and the quote’s age; the % over a word that says its state', () => {
  assert.deepEqual(gapRow(row, { now }), { item: 'SEA-DEN:total', gameId: 'SEA-DEN', market: 'total', away: 'SEA', home: 'DEN', title: 'SEA @ DEN · Total',
    meta: '10.5 pt gap · Review Over · 2h old', value: '23.6%', word: 'To act on', tone: 'good', ariaLabel: 'SEA at DEN total, 23.6% gap, 10.5 points, review Over, To act on' });
  assert.deepEqual([gapRow({ ...row, savedPick: {}, actionable: false }, { now }).word, gapRow(row, { now, selection: {} }).word, gapRow({ ...row, offer: null, actionable: false }, { now }).word], ['Saved', 'On your card', 'No quote']);
  assert.equal(quoteAge('2099-10-08T16:48:00Z', now), '12m old');
});

test('four tiles: to act on, gaps, the biggest gap and your card', () => {
  const rows = [row, { ...row, key: 'HOU-JAX:spread', market: 'spread', gapPercent: 42.9, actionable: false, game: { ...game, id: 'HOU-JAX', awayCode: 'HOU', homeCode: 'JAX' } }];
  assert.deepEqual(gapTiles({ rows, picks: [{}] }).map(t => [t.key, t.label, t.big, t.sub]), [['act', 'To act on', '1', 'favorable quote'], ['gaps', 'Gaps', '2', 'this week'],
    ['top', 'Biggest gap', '42.9%', 'HOU @ JAX · Spread'], ['card', 'Your card', '1', 'saved pick']]);
  assert.deepEqual(gapTiles({ rows: [], picks: [] }).map(t => t.big), ['0', '0', '—', '0']);
});

test('your card and your virtual card in the app’s words; a closed selection says so', () => {
  const selection = { gameId: 'SEA-DEN', market: 'total', side: 'over', units: 2, offer: game.offers.total.over, game };
  assert.equal(termsText(game, 'total', 'over', selection.offer, 2), 'Over 44.5 · −110 · 2U · BetMGM');
  const [pending] = pendingRows({ 'SEA-DEN:total': selection }, new Set(), { games: [game] }, now);
  assert.deepEqual([pending.item, pending.meta, pending.word], ['SEA-DEN:total', 'Over 44.5 · −110 · 2U · BetMGM', 'Ready']);
  assert.equal(pendingRows({ 'SEA-DEN:total': selection }, new Set(['SEA-DEN:total']), { games: [game] }, now).length, 0, 'a shown row holds its own review');
  assert.equal(pendingRows({ 'SEA-DEN:total': selection }, new Set(), { games: [game] }, Date.parse('2099-10-08T20:01:00Z'))[0].word, 'Closed');
  const [saved] = savedRows({ games: [game], picks: [{ gameId: 'SEA-DEN', market: 'total', status: 'pending', selection: { side: 'over', line: 44.5, odds: -110, units: 1, source: 'BetMGM' } }] });
  assert.deepEqual([saved.title, saved.meta, saved.value, saved.word], ['SEA @ DEN · Total', 'Over 44.5 · −110 · 1U · BetMGM', '1U', 'Pending']);
  const [won] = savedRows({ games: [game], picks: [{ gameId: 'SEA-DEN', market: 'total', status: 'win', result: { netUnits: 0.91 }, selection: { side: 'over', line: 44.5, odds: -110, units: 1, source: 'BetMGM' } }] });
  assert.deepEqual([won.value, won.word, won.tone], ['+0.91U', 'Won', 'good']);
});

test('the review closes at kickoff by the server’s clock; a started, final or missing game is closed', () => {
  assert.equal(closedReason(game, now, null), null);
  assert.equal(closedReason(game, Date.parse('2099-10-08T20:00:00Z'), null), 'Kickoff reached');
  assert.equal(closedReason({ ...game, started: true }, now, null), 'Game closed');
  assert.equal(closedReason(game, now, { status: 'final' }), 'Game closed');
  assert.equal(closedReason(null, now, null), 'Matchup unavailable');
});

test('the placement sends the reviewed quote’s exact terms; a lost reply is confirmed only by the same saved terms', () => {
  const choice = { gameId: 'SEA-DEN', market: 'total', side: 'over', units: 2, offer: game.offers.total.over };
  assert.deepEqual(placeBody(choice, { season: 2099, week: 5, revision: 7 }), { gameId: 'SEA-DEN', market: 'total', side: 'over', line: 44.5, odds: -110, units: 2,
    source: 'betmgm', quotedAt: '2099-10-08T15:00:00Z', season: 2099, week: 5, revision: 7 });
  const saved = selection => ({ picks: [{ gameId: 'SEA-DEN', market: 'total', selection }] });
  const exact = { side: 'over', line: 44.5, odds: -110, units: 2, source: 'BetMGM', quotedAt: '2099-10-08T15:00:00.000Z' };
  assert.equal(confirmsChoice(saved(exact), choice), true);
  for (const change of [{ units: 1 }, { odds: -105 }, { source: 'FanDuel' }, { quotedAt: '2099-10-08T15:30:00Z' }]) assert.equal(confirmsChoice(saved({ ...exact, ...change }), choice), false, JSON.stringify(change));
  assert.deepEqual(trackTicket({ ...row, offer: game.offers.total.over }, { season: 2099, week: 5 }), { season: 2099, week: 5, kind: 'single',
    legs: [{ gameId: 'SEA-DEN', market: 'total', side: 'over', line: 44.5 }], odds: -110, source: 'BetMGM', quotedAt: '2099-10-08T15:00:00Z', stakeUnits: null, placedAt: null });
});

test('a selection on a market now locked, or already saved, is dropped; the week options name older weeks', () => {
  const selections = { 'SEA-DEN:total': { gameId: 'SEA-DEN', market: 'total' }, 'HOU-JAX:spread': { gameId: 'HOU-JAX', market: 'spread' }, 'KC-BUF:total': { gameId: 'KC-BUF', market: 'total' } };
  const data = { games: [{ ...game, locked: { total: true } }, { id: 'HOU-JAX', locked: {} }, { id: 'KC-BUF', locked: {} }], picks: [{ gameId: 'HOU-JAX', market: 'spread' }] };
  assert.deepEqual(staleKeys(data, selections).sort(), ['HOU-JAX:spread', 'SEA-DEN:total']);
  assert.deepEqual(weekOptions({ publishedWeek: { season: 2099, week: 6 }, slates: [{ season: 2099, week: 6 }, { season: 2099, week: 5 }] }),
    [{ value: 'current', label: 'Current · 2099 Week 6' }, { value: '2099:5', label: '2099 Week 5' }]);
  assert.deepEqual(weekOptions(null), []);
});

test('trends are the market’s own from the published week; D-77’s units keep their style; no copy runs over twelve words', () => {
  const spread = gapTrendCards(week7, 'PIT-NO', 'spread', -3), total = gapTrendCards(week7, 'PIT-NO', 'total', 45);
  assert.ok(spread.every(card => week7.cards[card.id].market.endsWith('_ats')));
  assert.ok(total.length > 0 && total.every(card => week7.cards[card.id].market.startsWith('total')));
  assert.deepEqual(gapTrendCards(week7, 'NOT-A-GAME', 'total', 45), []);
  assert.deepEqual([gapUnits(2.55), gapUnits(-1), gapUnits(0), gapUnits(2.5)], ['+2.55U', '−1U', '0U', '+2.5U']);
  for (const [key, text] of Object.entries(GAP_COPY)) if (typeof text === 'string') assert.ok(words(text) <= 12, key);
});

test('the left-out note names every reason a market is not ranked, in at most 12 words', () => {
  assert.equal(GAP_COPY.leftOut, 'Drafts, locked markets, started games and missing lines are left out.');
  assert.ok(GAP_COPY.leftOut.split(/s+/).length <= 12);
});
