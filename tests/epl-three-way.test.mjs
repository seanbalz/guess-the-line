// EPL three-way moneyline and EPL Bets recommendations: pure rules, the provider parser, the collector's market-aware
// lease and the /epl/bets/read and /epl/guess/* handlers over fake services. No network or database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { favorableGap, validOutcome, outcomeClub, clubOutcome, distance, EPL_MARKET_OUTCOMES } from '../shared/epl-moneyline.mjs';
import { orderedByGap, priceTrend, recommendationConcerns, candidateGap, STALE_PRICE_MS } from '../shared/epl-recommendations.mjs';
import { fetchEplDrawNoBet } from '../cloud/epl-sources.mjs';
import { createEplMoneylineCollector, normalizeEplThreeWayEvent } from '../cloud/epl-moneyline-collector.mjs';
import { EplError, handleEpl } from '../cloud/epl.mjs';
import { eplBetsView } from '../cloud/epl-bets.mjs';

const U = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OWNER = '473955676301815808', OTHER = '719658248843632640';
const NOW = Date.parse('2026-11-14T10:00:00Z'), KICK = '2026-11-14T15:00:00.000Z';
const at = ms => new Date(ms).toISOString();

test('markets, outcomes and the favorable gap on the line where -100 and +100 meet', () => {
  assert.deepEqual(EPL_MARKET_OUTCOMES, { draw_no_bet: ['home', 'away'], three_way: ['home', 'draw', 'away'] });
  assert.equal(validOutcome('draw_no_bet', 'draw'), false); assert.equal(validOutcome('three_way', 'draw'), true); assert.equal(validOutcome('moneyline', 'home'), false);
  const fx = { home: 'ARS', away: 'CHE' };
  assert.equal(outcomeClub(fx, 'away'), 'CHE'); assert.equal(outcomeClub(fx, 'draw'), null); assert.equal(clubOutcome(fx, 'ARS'), 'home'); assert.equal(clubOutcome(fx, 'LIV'), null);
  assert.equal(favorableGap(150, 180), 30); assert.equal(favorableGap(-120, 110), 30); assert.equal(favorableGap(-100, 100), 0);
  assert.equal(favorableGap(180, 150), -30); assert.equal(favorableGap(99, 150), null);
  assert.equal(Math.abs(favorableGap(-110, 120)), distance(-110, 120), 'the gap and the scoring distance share one line');
});

test('recommendation order is gap alone; trend and concerns flag without reordering or excluding', () => {
  const item = (eventId, gap, extra = {}) => ({ eventId, gap, commenceTime: KICK, price: 100, latestPrice: 100 + gap, ...extra });
  assert.equal(orderedByGap([item('a', 40), item('b', 30), item('c', 30)]), true);
  assert.equal(orderedByGap([item('a', 30), item('b', 40)]), false);
  assert.equal(orderedByGap([item('b', 30), item('a', 30)]), false, 'ties break by kickoff then event id');
  const candidate = { eventId: 'e1', price: 230, latestPrice: 260, gap: 30, books: 2, firstPrice: 280, latestObservedAt: at(NOW - STALE_PRICE_MS - 1), observations: 3, referencePrice: null, commenceTime: at(NOW + 1800e3) };
  assert.deepEqual(priceTrend(candidate), { from: 280, to: 260, observations: 3, change: -20, direction: 'shorter' });
  assert.deepEqual(recommendationConcerns(candidate, NOW), ['stale_price', 'few_books', 'shortening', 'reference_pending', 'kickoff_soon']);
  assert.deepEqual(recommendationConcerns({ ...candidate, gap: 120, books: 3, firstPrice: 200, referencePrice: 250, latestObservedAt: at(NOW), commenceTime: KICK }, NOW), ['large_gap']);
  assert.equal(candidateGap(candidate), 30);
});

const fakeOdds = body => {
  const calls = [];
  return { calls, impl: async url => { calls.push(new URL(url)); return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'x-requests-remaining': '300', 'x-requests-used': '200', 'x-requests-last': '2' } }); } };
};
const oddsEvent = bookmakers => ({ id: 'e1', commence_time: KICK, home_team: 'Arsenal', away_team: 'Chelsea', bookmakers });
const dnb = (h, a) => ({ key: 'draw_no_bet', last_update: at(NOW - 30000), outcomes: [{ name: 'Arsenal', price: h }, { name: 'Chelsea', price: a }] });
const h2h = outcomes => ({ key: 'h2h', last_update: at(NOW - 60000), outcomes });
const full = (h, d, a) => h2h([{ name: 'Arsenal', price: h }, { name: 'Draw', price: d }, { name: 'Chelsea', price: a }]);

test('the provider read asks for h2h in the same request only when the lease reserved it, and keeps complete three-way books only', async () => {
  const plain = fakeOdds(oddsEvent([{ key: 'draftkings', markets: [dnb(-150, 120), full(-120, 260, 300)] }]));
  const two = await fetchEplDrawNoBet({ apiKey: 'test-odds-key-123', fetchImpl: plain.impl, eventIds: ['e1'], observations: true, clock: () => NOW });
  assert.equal(plain.calls[0].searchParams.get('markets'), 'draw_no_bet'); assert.equal(two.events[0].threeWayBooks, undefined);
  const books = [
    { key: 'draftkings', markets: [dnb(-150, 120), full(-120, 260, 300)] },
    { key: 'fanduel', markets: [dnb(-145, 118), h2h([{ name: 'Arsenal', price: -110 }, { name: 'Chelsea', price: 320 }])] },     // two outcomes only
    { key: 'betmgm', markets: [full(-125, 270, 310), full(-130, 270, 310)] },                                                  // ambiguous: two h2h markets
    { key: 'pinnacle', markets: [full(-118, 255, 305)] },                                                                      // not an allowed book
  ];
  const three = fakeOdds(oddsEvent(books));
  const reply = await fetchEplDrawNoBet({ apiKey: 'test-odds-key-123', fetchImpl: three.impl, eventIds: ['e1'], observations: true, clock: () => NOW, threeWay: true });
  assert.equal(three.calls.length, 1, 'one request carries both markets'); assert.equal(three.calls[0].searchParams.get('markets'), 'draw_no_bet,h2h');
  assert.deepEqual(reply.events[0].threeWayBooks, { draftkings: { home: -120, draw: 260, away: 300 } });
  assert.deepEqual(reply.events[0].books, { draftkings: { ARS: -150, CHE: 120 }, fanduel: { ARS: -145, CHE: 118 } }, 'draw-no-bet parsing is unchanged');
  assert.equal(reply.events[0].threeWayBookObservedAt.draftkings, at(NOW - 60000));
});

const fixture = { eventId: 'e1', home: 'ARS', away: 'CHE', commenceTime: KICK };
const providerEvent = (changes = {}) => ({ eventId: 'e1', available: true, home: 'ARS', away: 'CHE', commenceTime: KICK, observedAt: at(NOW - 1000), responseSha256: 'c'.repeat(64),
  books: { draftkings: { ARS: -150, CHE: 120 }, fanduel: { ARS: -140, CHE: 110 } }, bookObservedAt: { draftkings: at(NOW - 30000), fanduel: at(NOW - 30000) },
  threeWayBooks: { draftkings: { home: -120, draw: 260, away: 300 }, fanduel: { home: -110, draw: 250, away: 320 } },
  threeWayBookObservedAt: { draftkings: at(NOW - 60000), fanduel: at(NOW - 60000) }, ...changes });

test('three-way normalization needs two complete allowed books for the exact stored fixture', () => {
  const ok = normalizeEplThreeWayEvent(providerEvent(), fixture, NOW);
  assert.deepEqual(ok.medians, { home: -115, draw: 255, away: 310 }); assert.deepEqual(Object.keys(ok.books), ['draftkings', 'fanduel']);
  for (const changes of [{ threeWayBooks: { draftkings: { home: -120, draw: 260, away: 300 } } }, { threeWayBooks: { draftkings: { home: -120, away: 300 }, fanduel: { home: -110, draw: 250, away: 320 } } },
    { home: 'CHE' }, { commenceTime: '2026-11-14T16:00:00Z' }, { responseSha256: 'x' }, { observedAt: at(NOW - 200000) },
    { threeWayBookObservedAt: { draftkings: at(NOW - 400000), fanduel: at(NOW - 400000) } }, { available: false }])
    assert.equal(normalizeEplThreeWayEvent(providerEvent(changes), fixture, NOW), null, JSON.stringify(changes));
});

test('the market-aware collector requests three-way only with the reserved credit and falls back exactly when absent', async () => {
  const lease = (threeWay) => ({ status: 'ready', leaseId: U(50), token: U(51), threeWay, fixture });
  for (const threeWay of [true, false]) {
    const calls = [], sources = [];
    const collector = createEplMoneylineCollector({ markets: true, clock: () => NOW, rpc: async (name, args) => { calls.push([name, args]); return name.startsWith('gtl_epl_begin') ? lease(threeWay) : { status: 'refreshed', threeWay }; },
      drawNoBet: async args => { sources.push(args); return { events: [providerEvent()], quota: { remaining: 98 } }; } });
    assert.deepEqual(await collector.refreshForLock({ userId: U(1), eventId: 'e1' }), { status: 'refreshed' });
    assert.deepEqual(calls.map(c => c[0]), ['gtl_epl_begin_moneyline_markets', 'gtl_epl_finish_moneyline_markets']);
    assert.deepEqual(sources, [threeWay ? { eventIds: ['e1'], observations: true, threeWay: true } : { eventIds: ['e1'], observations: true }]);
    const finish = calls[1][1];
    assert.equal(finish.p_event.eventId, 'e1');
    assert.equal(threeWay ? finish.p_three_way.medians.draw : finish.p_three_way, threeWay ? 255 : null);
  }
  const calls = [];
  const fallback = createEplMoneylineCollector({ markets: true, clock: () => NOW, rpc: async name => { calls.push(name); if (name === 'gtl_epl_begin_moneyline_markets') throw { code: 'GTL_EPL_MONEYLINE_OFF' }; return name === 'gtl_epl_begin_moneyline_read' ? lease(undefined) : { status: 'refreshed' }; },
    drawNoBet: async args => { assert.deepEqual(args, { eventIds: ['e1'], observations: true }); return { events: [providerEvent()] }; } });
  assert.deepEqual(await fallback.refreshForLock({ userId: U(1), eventId: 'e1' }), { status: 'refreshed' });
  assert.deepEqual(calls, ['gtl_epl_begin_moneyline_markets', 'gtl_epl_begin_moneyline_read', 'gtl_epl_finish_moneyline_read']);
  const broken = createEplMoneylineCollector({ markets: true, rpc: async () => { throw new Error('private transport'); }, drawNoBet: async () => assert.fail('no provider request after a failed lease') });
  assert.deepEqual(await broken.refreshForLock({ userId: U(1), eventId: 'e1' }), { status: 'unavailable' });
});

const marketFixture = { eventId: 'e1', home: 'ARS', away: 'CHE', commenceTime: KICK, status: 'scheduled', kickedOff: false };
const row = (extra = {}) => ({ eventId: 'e1', ownerId: OWNER, club: null, price: 250, status: 'draft', savedAt: at(NOW), lockedAt: null, referencePrice: null,
  referenceObservedAt: null, referenceSource: null, distance: null, state: 'draft', market: 'three_way', outcome: 'draw', ...extra });
function guessWorld({ markets = true, threeWayEntry = markets === true, guesses, saveError } = {}) {
  const calls = []; let stamp = NOW, current = guesses ?? [row()];
  const service = {
    async guessReady() { return true; }, async marketsReady() { calls.push('markets'); return markets; },
    async guessWeeks() { return [{ season: 2026, week: 12 }]; }, async guessGate() { return true; },
    async guessFixture(id) { return id === 'e1' ? { season: 2026, week: 12, home: 'ARS', away: 'CHE' } : null; },
    async refreshForLock() { calls.push('refresh'); },
    async rpc(name, args) {
      calls.push([name, args]);
      if (name === 'gtl_epl_member') return OWNER;
      if (name === 'gtl_epl_guess_board_markets') return { season: 2026, week: 12, ownerId: OWNER, threeWayEntry, fixtures: [marketFixture], guesses: current };
      if (name === 'gtl_epl_guess_board') return { season: 2026, week: 12, ownerId: OWNER, fixtures: [marketFixture], guesses: current.filter(g => g.market !== 'three_way').map(({ market, outcome, ...g }) => g) };
      if (name === 'gtl_epl_save_market_guess_current') {
        if (saveError) throw saveError;
        const club = args.p_outcome === 'home' ? 'ARS' : args.p_outcome === 'away' ? 'CHE' : null;
        current = [row({ club, price: args.p_price, market: args.p_market, outcome: args.p_outcome, status: args.p_lock ? 'locked' : 'draft', lockedAt: args.p_lock ? args.p_now : null, state: args.p_lock ? 'pending' : 'draft' })];
        return current[0];
      }
      if (name === 'gtl_epl_save_guess_current') { current = [row({ club: args.p_club, price: args.p_price, market: 'draw_no_bet', outcome: args.p_club === 'ARS' ? 'home' : 'away' })]; const { market, outcome, ...legacy } = current[0]; return legacy; }
      throw new Error(`unexpected ${name}`);
    },
  };
  return { calls, call: (route, body = {}) => handleEpl({ route: `/epl/${route}`, body, user: { id: U(1) }, service, clock: () => stamp++ }) };
}

test('market-aware read exposes the market capability; a legacy schema keeps the exact two-way reply', async () => {
  const view = await guessWorld().call('guess/read');
  assert.deepEqual(view.markets, ['draw_no_bet', 'three_way']); assert.equal(view.guesses[0].market, 'three_way'); assert.equal(view.guesses[0].club, null);
  assert.deepEqual((await guessWorld({ markets: false }).call('guess/read')).markets, ['draw_no_bet'], 'the off switch keeps reads market-aware');
  const legacy = guessWorld({ markets: null, guesses: [row({ market: 'draw_no_bet', outcome: 'home', club: 'ARS' })] });
  const old = await legacy.call('guess/read');
  assert.equal(old.markets, undefined); assert.deepEqual(Object.keys(old.guesses[0]).sort(), ['club', 'distance', 'eventId', 'lockedAt', 'ownerId', 'price', 'referenceObservedAt', 'referencePrice', 'referenceSource', 'savedAt', 'state', 'status'].sort());
  assert.ok(legacy.calls.some(c => c[0] === 'gtl_epl_guess_board') && !legacy.calls.some(c => c[0] === 'gtl_epl_guess_board_markets'));
  for (const bad of [row({ club: 'ARS' }), row({ outcome: 'home' }), row({ market: 'draw_no_bet' }), row({ market: 'draw_no_bet', outcome: 'home', club: 'CHE' })])
    await assert.rejects(guessWorld({ guesses: [bad] }).call('guess/read'), /Invalid EPL guess reply/);
});

test('three-way save uses the market writer, locks once with refresh after acceptance; legacy bodies still save two-way', async () => {
  const f = guessWorld();
  const locked = await f.call('guess/save', { eventId: 'e1', market: 'three_way', outcome: 'draw', price: 240, lock: true });
  assert.equal(locked.status, 'locked'); assert.equal(locked.outcome, 'draw');
  assert.deepEqual(f.calls.filter(Array.isArray).map(c => c[0]), ['gtl_epl_member', 'gtl_epl_save_market_guess_current', 'gtl_epl_guess_board_markets']);
  assert.ok(f.calls.indexOf('refresh') > f.calls.findIndex(c => c[0] === 'gtl_epl_save_market_guess_current'));
  const save = f.calls.find(c => c[0] === 'gtl_epl_save_market_guess_current')[1];
  assert.deepEqual(Object.keys(save).sort(), ['p_event_id', 'p_lock', 'p_market', 'p_now', 'p_outcome', 'p_price', 'p_user']);
  const legacyBody = guessWorld();
  const two = await legacyBody.call('guess/save', { eventId: 'e1', club: 'CHE', price: 140, lock: false });
  assert.equal(two.market, 'draw_no_bet'); assert.equal(two.club, 'CHE');
  assert.equal(legacyBody.calls.find(c => c[0] === 'gtl_epl_save_market_guess_current')[1].p_outcome, 'away');
  const oldSchema = guessWorld({ markets: null });
  assert.equal((await oldSchema.call('guess/save', { eventId: 'e1', club: 'ARS', price: -130, lock: false })).club, 'ARS');
  assert.ok(oldSchema.calls.some(c => c[0] === 'gtl_epl_save_guess_current'));
});

test('three-way entry needs positive capability; malformed market bodies refuse before any write', async () => {
  for (const markets of [null, false]) {
    const f = guessWorld({ markets });
    await assert.rejects(f.call('guess/save', { eventId: 'e1', market: 'three_way', outcome: 'draw', price: 250, lock: true }), e => e.code === 'GTL_EPL_MARKET_OFF' && e.status === 409);
    assert.ok(!f.calls.some(c => Array.isArray(c) && c[0].startsWith('gtl_epl_save')));
  }
  for (const body of [{ eventId: 'e1', market: 'draw_no_bet', outcome: 'draw', price: 250, lock: false }, { eventId: 'e1', market: 'three_way', outcome: 'draw', club: 'ARS', price: 250, lock: false },
    { eventId: 'e1', market: 'three_way', price: 250, lock: false }, { eventId: 'e1', club: 'ARS', outcome: 'home', price: -130, lock: false }, { eventId: 'e1', market: 'parlay', outcome: 'home', price: -130, lock: false },
    { eventId: 'e1', market: 'three_way', outcome: 'draw', price: 99, lock: false }, { eventId: 'e1', club: 'LIV', price: -130, lock: false }]) {
    const f = guessWorld();
    await assert.rejects(f.call('guess/save', body), e => e.code === 'GTL_EPL_GUESS_INVALID', JSON.stringify(body));
    assert.ok(!f.calls.some(c => Array.isArray(c) && c[0].startsWith('gtl_epl_save')));
  }
  const off = guessWorld({ saveError: new EplError(409, 'refused', 'GTL_EPL_MARKET_OFF') });
  await assert.rejects(off.call('guess/save', { eventId: 'e1', market: 'three_way', outcome: 'home', price: -130, lock: false }), e => e.code === 'GTL_EPL_MARKET_OFF');
});

const rec = (extra = {}) => ({ eventId: 'e1', home: 'ARS', away: 'CHE', commenceTime: KICK, market: 'three_way', outcome: 'draw', club: null, price: 230, lockedAt: at(NOW - 3600e3),
  referencePrice: 250, referenceObservedAt: at(NOW - 3600e3), latestPrice: 260, latestObservedAt: at(NOW - 60e3), books: 3, gap: 30, firstPrice: 240, firstObservedAt: at(NOW - 86400e3), observations: 4, ...extra });
const betsReply = (items, extra = {}) => ({ season: 2026, week: 12, ownerId: OWNER, asOf: at(NOW), locked: items.length + 1, unpriced: 1, withoutGap: 0, items, ...extra });
function betsWorld(reply, error) {
  const calls = [];
  const service = { async guessWeeks() { calls.push('weeks'); return [{ season: 2026, week: 12 }]; },
    async refreshForLock() { calls.push('refresh'); }, async rpc(name, args) { calls.push([name, args]); if (error) throw error; return reply; } };
  return { calls, call: (body = {}) => handleEpl({ route: '/epl/bets/read', body, user: { id: U(1) }, service, clock: () => NOW }) };
}

test('/epl/bets/read is account-scoped, reads stored evidence only and keeps the server order with explanations', async () => {
  const items = [rec({ eventId: 'e2', home: 'LIV', away: 'EVE', market: 'draw_no_bet', outcome: 'home', club: 'LIV', price: -150, latestPrice: -110, gap: 40, books: 2, firstPrice: -120 }), rec()];
  const f = betsWorld(betsReply(items));
  const view = await f.call();
  assert.deepEqual(f.calls.map(c => Array.isArray(c) ? c[0] : c), ['weeks', 'gtl_epl_bet_recommendations'], 'no provider, lease or refresh call');
  assert.deepEqual(f.calls[1][1], { p_user: U(1), p_season: 2026, p_week: 12 });
  assert.deepEqual(view.items.map(i => [i.eventId, i.gap]), [['e2', 40], ['e1', 30]]);
  assert.deepEqual(view.items[0].concerns, ['few_books']); assert.equal(view.items[1].trend.direction, 'longer');
  assert.equal(view.items[1].source, 'Median of DraftKings, FanDuel and BetMGM');
  assert.ok(!JSON.stringify(view).includes(OTHER));
  await assert.rejects(f.call({ season: 2026 }), e => e.status === 400 && e.code === 'GTL_EPL_BETS_INVALID');
  await assert.rejects(f.call({ season: 2026, week: 12, ownerId: OTHER }), e => e.status === 400);
  const absent = await betsWorld(null, new EplError(404, 'off', 'GTL_EPL_OFF')).call();
  assert.deepEqual([absent.available, absent.reason, absent.items], [false, 'schema_unavailable', []]);
  await assert.rejects(betsWorld(null, new Error('private')).call(), /private/);
});

test('bets replies are rebuilt and refused when the order, gap, counts or identity are inconsistent', () => {
  const target = { season: 2026, week: 12 };
  assert.equal(eplBetsView(betsReply([rec()]), target, NOW).items.length, 1);
  for (const bad of [betsReply([rec({ gap: 31 })]), betsReply([rec({ gap: 0, latestPrice: 230 })]), betsReply([rec({ eventId: 'e2', gap: 20, latestPrice: 250 }), rec()]),
    betsReply([rec()], { locked: 5 }), betsReply([rec()], { ownerId: 'someone' }), betsReply([rec({ club: 'ARS' })]), betsReply([rec({ outcome: 'home' })]),
    betsReply([rec({ market: 'draw_no_bet' })]), betsReply([rec({ latestObservedAt: at(NOW + 3600e3) })]), betsReply([rec(), rec()]), { ...betsReply([rec()]), season: 2025 }])
    assert.throws(() => eplBetsView(bad, target, NOW), /Invalid EPL bets reply/);
  const view = eplBetsView({ ...betsReply([rec()]), private: 'x', items: [{ ...rec(), evidence: { books: {} } }] }, target, NOW);
  assert.ok(!JSON.stringify(view).includes('evidence') && !JSON.stringify(view).includes('private'));
});
