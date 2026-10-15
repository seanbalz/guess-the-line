// D-18 best price (shared/best-offer.mjs). Fixture quotes only: books, lines and
// prices are made up for these tests, except the Week 6 SEA −3 case: the build plan
// (docs/REDESIGN_BUILD_PLAN.md, stage 14) records "SEA −3 picks BetMGM −102", and
// FanDuel −106 is the price the old closest-to-−110 rule preferred that day (from the
// stage 14 planning notes). Both are public market prices, not player data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bestOffer, compareOffers, decimalPayout, newestPerBook, usableOffer } from '../shared/best-offer.mjs';

const at = hour => new Date(Date.UTC(2099, 9, 8, hour)).toISOString();
const offer = (book, line, odds, observedAt = at(10)) => ({ book, line, odds, observedAt });
const pick = (offers, market, side) => bestOffer(offers, market, side)?.book ?? null;

test('decimal payout includes the stake and never treats -110 as special', () => {
  assert.equal(decimalPayout(100), 2);
  assert.equal(decimalPayout(-100), 2);
  assert.equal(decimalPayout(150), 2.5);
  assert.equal(decimalPayout(-200), 1.5);
  assert.ok(Math.abs(decimalPayout(-110) - 21 / 11) < 1e-12);
  for (const bad of [null, undefined, 99, -99, 0, 1.5, '−110', Number.NaN]) assert.equal(decimalPayout(bad), null);
});

test('at the same line the better price wins: +100 beats -110 and -105 beats -115', () => {
  assert.equal(pick([offer('draftkings', -8, -110), offer('fanduel', -8, 100)], 'spread', 'home'), 'fanduel');
  assert.equal(pick([offer('fanduel', -8, 100), offer('draftkings', -8, -110)], 'spread', 'home'), 'fanduel', 'input order does not matter');
  // "Closest to -110" called these two a tie and fell through to the book key (BetMGM).
  assert.equal(pick([offer('betmgm', 3.5, -115), offer('fanduel', 3.5, -105)], 'spread', 'away'), 'fanduel');
  assert.equal(pick([offer('betmgm', 44.5, -115), offer('fanduel', 44.5, -105)], 'total', 'over'), 'fanduel');
  assert.equal(pick([offer('betmgm', 44.5, 120), offer('fanduel', 44.5, 105)], 'total', 'under'), 'betmgm');
  assert.equal(pick([offer('draftkings', 1, -102), offer('fanduel', 1, -106), offer('betmgm', 1, -110)], 'spread', 'home'), 'draftkings');
});

test('the best line comes before the price for every side', () => {
  // More points for a spread side.
  assert.equal(pick([offer('draftkings', -3.5, 120), offer('fanduel', -3, -125)], 'spread', 'home'), 'fanduel');
  assert.equal(pick([offer('draftkings', 3, 120), offer('fanduel', 3.5, -125)], 'spread', 'away'), 'fanduel');
  // A lower total for Over, a higher total for Under.
  assert.equal(pick([offer('draftkings', 45, 110), offer('fanduel', 44.5, -125)], 'total', 'over'), 'fanduel');
  assert.equal(pick([offer('draftkings', 44.5, 110), offer('fanduel', 45, -125)], 'total', 'under'), 'fanduel');
});

test('equal prices fall to the newest observation, then the book key A to Z', () => {
  assert.equal(pick([offer('betmgm', -3, -110, at(9)), offer('fanduel', -3, -110, at(11)), offer('draftkings', -3, -110, at(10))], 'spread', 'home'), 'fanduel');
  assert.equal(pick([offer('fanduel', -3, -110), offer('draftkings', -3, -110), offer('betmgm', -3, -110)], 'spread', 'home'), 'betmgm');
  // +100 and -100 are the same price.
  assert.equal(pick([offer('fanduel', -3, -100), offer('draftkings', -3, 100)], 'spread', 'home'), 'draftkings');
  const sorted = [offer('fanduel', -3, -110), offer('betmgm', -3, -110, at(9)), offer('draftkings', -3, -110)].sort(compareOffers('spread', 'home'));
  assert.deepEqual(sorted.map(item => item.book), ['draftkings', 'fanduel', 'betmgm']);
});

test('Week 6 build-plan case: SEA -3 picks BetMGM -102 over FanDuel -106', () => {
  // SEA is the away team at DEN; both books hang SEA -3. The old rule picked FanDuel (-106 is closer to -110).
  const sea = [offer('fanduel', -3, -106, '2026-10-13T08:15:00.000Z'), offer('betmgm', -3, -102, '2026-10-13T08:15:00.000Z')];
  const best = bestOffer(sea, 'spread', 'away');
  assert.equal(best.book, 'betmgm');
  assert.equal(best.odds, -102);
  assert.equal(best.line, -3);
});

test('the comparator takes only a known market and side, and only usable offers compete', () => {
  // Follow-up to the stage 14 review: compareOffers is exported for the Lines tab, so an unknown market no longer
  // falls back to the spread rules and an invalid price is the caller's to filter (usableOffer), as bestOffer does.
  for (const [market, side] of [['moneyline', 'home'], ['spread', 'over'], ['total', 'home'], [undefined, undefined]]) {
    assert.throws(() => compareOffers(market, side), /Unknown market side/, `${market} ${side}`);
    assert.throws(() => bestOffer([offer('fanduel', -3, -110)], market, side), /Unknown market side/);
  }
  for (const [market, side] of [['spread', 'home'], ['spread', 'away'], ['total', 'over'], ['total', 'under']]) assert.equal(typeof compareOffers(market, side), 'function');
  assert.equal(usableOffer(offer('fanduel', -3, -110)), true);
  for (const bad of [null, undefined, { line: -3, odds: -110 }, offer('fanduel', Number.NaN, -110), offer('fanduel', -3, 50), offer('fanduel', -3, '−110')]) assert.equal(usableOffer(bad), false, JSON.stringify(bad));
});

test('offers without a usable line or price never count, and no offers gives null', () => {
  assert.equal(bestOffer([], 'spread', 'home'), null);
  assert.equal(bestOffer(undefined, 'spread', 'home'), null);
  assert.equal(pick([offer('draftkings', Number.NaN, 500), offer('fanduel', -3, 50), offer('betmgm', -3.5, -110), null], 'spread', 'home'), 'betmgm');
  const offers = [offer('fanduel', -8, 100), offer('draftkings', -8, -110)];
  bestOffer(offers, 'spread', 'home');
  assert.deepEqual(offers.map(item => item.book), ['fanduel', 'draftkings'], 'the caller\'s array is not reordered');
});

const quote = (book, capturedAt, observedAt = capturedAt, extra = {}) => ({ book, capturedAt, observedAt, collectedAt: capturedAt, ...extra });
const kickoff = at(20);

test('a book missing from the newest snapshot uses its newest older quote, not its oldest', () => {
  // The snapshot reader returns history oldest first, after the latest snapshot itself.
  const latest = [quote('draftkings', at(12), at(12), { line: -8 })];
  const history = [quote('betmgm', at(8), at(8), { line: -9 }), quote('betmgm', at(10), at(10), { line: -7.5 }), ...latest];
  const kept = newestPerBook([...latest, ...history], kickoff);
  assert.deepEqual(kept.map(item => [item.book, item.line]), [['draftkings', -8], ['betmgm', -7.5]]);
  // The same answer when the snapshots arrive newest first.
  assert.deepEqual(newestPerBook([...history].reverse(), kickoff).map(item => [item.book, item.line]).sort(), [['betmgm', -7.5], ['draftkings', -8]]);
});

test('a book in the newest snapshot keeps that quote even when an older one was a better price', () => {
  const kept = newestPerBook([quote('fanduel', at(12), at(12), { odds: -120 }), quote('fanduel', at(8), at(8), { odds: 100 })], kickoff);
  assert.deepEqual(kept.map(item => item.odds), [-120]);
});

test('the latest snapshot comes before the latest observation: its quote wins even when it was observed earlier', () => {
  // Follow-up to the stage 14 review: every other fixture observes at its capture time, so swapping the two
  // comparisons in newestPerBook passed. Here the latest snapshot (12:00) carries FanDuel's quote observed at 9:00,
  // and an earlier snapshot (11:00) carried a quote observed at 10:00: the latest snapshot's quote is the one kept.
  const kept = newestPerBook([quote('fanduel', at(11), at(10), { id: 'earlier-snapshot' }), quote('fanduel', at(12), at(9), { id: 'latest-snapshot' })], kickoff);
  assert.deepEqual(kept.map(item => item.id), ['latest-snapshot']);
  assert.deepEqual(newestPerBook([quote('fanduel', at(12), at(9), { id: 'latest-snapshot' }), quote('fanduel', at(11), at(10), { id: 'earlier-snapshot' })], kickoff).map(item => item.id), ['latest-snapshot']);
});

test('within one snapshot the later observation, then the later collection, wins; a full tie keeps the first seen', () => {
  assert.equal(newestPerBook([quote('fanduel', at(12), at(9), { id: 'a' }), quote('fanduel', at(12), at(11), { id: 'b' })], kickoff)[0].id, 'b');
  assert.equal(newestPerBook([quote('fanduel', at(12), at(9), { id: 'a', collectedAt: at(10) }), quote('fanduel', at(12), at(9), { id: 'b', collectedAt: at(11) })], kickoff)[0].id, 'b');
  assert.equal(newestPerBook([quote('fanduel', at(12), at(9), { id: 'a' }), quote('fanduel', at(12), at(9), { id: 'b' })], kickoff)[0].id, 'a');
});

test('nothing observed at or after kickoff counts', () => {
  const kept = newestPerBook([
    quote('draftkings', at(19), at(19), { id: 'before' }),
    quote('draftkings', at(21), at(20), { id: 'at-kickoff' }),
    quote('fanduel', at(21), at(21), { id: 'after-kickoff' }),
    quote('betmgm', at(19), '2099-10-08T19:59:59.999Z', { id: 'just-before' }),
  ], kickoff);
  assert.deepEqual(kept.map(item => item.id), ['before', 'just-before']);
  assert.deepEqual(newestPerBook([quote('fanduel', at(21), at(20))], kickoff), []);
});

test('quotes with no book or no valid observation time, and a missing kickoff, keep nothing', () => {
  assert.deepEqual(newestPerBook([quote(undefined, at(12)), quote('fanduel', at(12), 'not a time'), null], kickoff), []);
  assert.deepEqual(newestPerBook([quote('fanduel', at(12))], undefined), []);
  assert.deepEqual(newestPerBook([quote('fanduel', at(12))], 'not a time'), []);
  assert.deepEqual(newestPerBook(undefined, kickoff), []);
});
