// D-69 step 4 (spec 5A, "Next move + tiles"): Bets' landing as plain data. Contracts: the first card is "Place your picks"
// while any game is still to kick off by the server's clock, else "Track a bet" with your last settled tickets; five tiles
// in order with distinct glyphs, NEW only on My bets; no line, pick or market value ever reaches the landing (D-31); no
// surface line runs over twelve words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BETS_SECTIONS } from '../web/src/next/bets/betsNav.js';
import { betsClock, betsHero, betsTiles, clockUntil, ownWeek, recentResults } from '../web/src/next/bets/betsModel.js';

const LUKE = '00000000-0000-4000-8000-000000000003', TROY = '00000000-0000-4000-8000-000000000002';
const ms = value => Date.parse(value), words = text => String(text).trim().split(/\s+/).length;
const personal = (now = '2026-11-08T19:00:00Z') => ({ season: 2026, week: 9, now, games: [
  { id: 'DAL-NYG', kickoff: '2026-11-06T01:15:00Z' }, { id: 'SEA-DEN', kickoff: '2026-11-08T18:00:00Z' },
  { id: 'KC-BUF', kickoff: '2026-11-08T21:25:00Z' }, { id: 'LAR-SF', kickoff: '2026-11-10T01:20:00Z' }],
  ballots: { guess_spread: { picks: { 'DAL-NYG': -3, 'KC-BUF': -2.5, 'LAR-SF': 3 }, lockedAt: { 'DAL-NYG': '2026-11-05T00:00:00Z', 'KC-BUF': '2026-11-07T00:00:00Z' } },
    guess_total: { picks: { 'LAR-SF': 47.5 }, lockedAt: { 'LAR-SF': '2026-11-08T00:00:00Z' } } } });
const community = { week: { season: 2026, week: 9 }, optOuts: [], members: [{ id: TROY, displayName: 'Troy' }, { id: LUKE, displayName: 'Luke' }, { id: 'x', displayName: 'Gone', removed: true }] };
const ticket = (id, outcome, settledAt, ownerId = LUKE) => ({ id, ownerId, outcome, settledAt, updatedAt: settledAt });
const tickets = (entries, extra = {}) => ({ loading: false, error: null, data: { entries }, active: entries.filter(e => e.outcome === 'pending').length, ...extra });

test('the server’s clock and where the landing’s clock stops, from the /personal read only', () => {
  assert.equal(betsClock(personal()), ms('2026-11-08T19:00:00Z'));
  assert.equal(betsClock({ season: 2026, week: 9 }), null, 'never the device clock');
  assert.equal(clockUntil(personal()), ms('2026-11-10T01:20:00Z'));
  assert.equal(clockUntil(null), 0);
});

test('while a game is still open: Place your picks, the games still open as its meter, the one lime button opens Your picks', () => {
  assert.deepEqual(betsHero({ personal: personal(), now: ms('2026-11-08T19:00:00Z') }), { kind: 'place', week: 9, eyebrow: 'Week 9 · Your next move',
    title: 'Place your picks', meter: { done: 2, of: 4 }, line: '2 of 4 games still open', action: 'Place picks', target: 'virtual' });
  assert.equal(betsHero({ personal: personal(), now: null }).line, '4 of 4 games still open', 'without the server’s clock nothing has kicked off');
});

test('once every game kicked off, or with no week: Track a bet, your last five settled tickets as its meter', () => {
  const after = ms('2026-11-10T05:00:00Z');
  const entries = [ticket('a', 'win', '2026-11-01T00:00:00Z'), ticket('b', 'loss', '2026-11-02T00:00:00Z'), ticket('c', 'pending', null),
    ticket('d', 'win', '2026-11-03T00:00:00Z'), ticket('e', 'push', '2026-11-04T00:00:00Z'), ticket('f', 'win', '2026-11-05T00:00:00Z'),
    ticket('g', 'void', '2026-11-06T00:00:00Z'), ticket('h', 'win', '2026-11-07T00:00:00Z', TROY)];
  assert.deepEqual(recentResults(tickets(entries), LUKE), { shown: 5, won: 2 }, 'your newest five settled: g f e d b');
  assert.deepEqual(betsHero({ personal: personal(), tickets: tickets(entries), viewer: LUKE, now: after }), { kind: 'track', week: 9, eyebrow: 'Your next move',
    title: 'Track a bet', meter: { done: 2, of: 5 }, line: '2 of your last 5 settled tickets won', action: 'Add a bet', target: 'add' });
  for (const [read, line] of [[tickets([]), 'No settled tickets yet'], [{ loading: true, data: null }, 'Loading your tickets…'], [{ loading: false, error: { status: 0 }, data: null }, 'Your tickets didn’t load']]) {
    const hero = betsHero({ personal: null, tickets: read, viewer: LUKE });
    assert.deepEqual([hero.kind, hero.week, hero.line, hero.meter], ['track', null, line, read.loading || read.error ? null : { done: 0, of: 5 }], 'no "0 of 5" picture while tickets load or failed');
  }
  assert.equal(betsHero({ tickets: tickets([ticket('a', 'win', '2026-11-01T00:00:00Z')]), viewer: LUKE }).line, '1 of your last 1 settled ticket won');
});

test('your week: games open to bet are still to kick off with a locked or sat-out market; every locked guess counts', () => {
  assert.deepEqual(ownWeek(personal(), community, ms('2026-11-08T19:00:00Z')), { open: 2, ready: 2, locked: 3 });
  assert.deepEqual(ownWeek(personal(), { ...community, optOuts: ['guess_total'] }, ms('2026-11-08T22:00:00Z')), { open: 1, ready: 1, locked: 3 }, 'a sit-out opens prices too');
  assert.deepEqual(ownWeek(null, null, null), { open: 0, ready: 0, locked: 0 });
});

test('five tiles in order with distinct glyphs; NEW only on My bets', () => {
  const now = ms('2026-11-08T19:00:00Z');
  const tiles = betsTiles({ personal: personal(), community, tickets: tickets([ticket('a', 'pending', null), ticket('b', 'pending', null)]), now, viewer: LUKE, waitingWins: 1 });
  assert.deepEqual(tiles.map(t => t.key), BETS_SECTIONS);
  assert.deepEqual(tiles.map(t => t.label), ['My bets', 'Your picks', 'Everyone', 'Recommended', 'Your gap']);
  assert.equal(new Set(tiles.map(t => t.icon)).size, 5);
  const [mine, picks, everyone, recommended, gap] = tiles;
  assert.deepEqual([mine.big, mine.sub, mine.ariaLabel, mine.isNew], ['2', 'active tickets', 'My bets, 2 active tickets', true]);
  assert.deepEqual([picks.big, picks.sub, picks.ariaLabel], ['2', 'games open to bet', 'Your picks, 2 games open to bet']);
  assert.deepEqual([everyone.big, everyone.sub, everyone.faces.map(f => [f.id, f.you])], ['2', 'players', [[LUKE, true], [TROY, false]]]);
  assert.deepEqual([recommended.big, recommended.sub, recommended.ariaLabel], ['—', 'Research assessments', 'Recommended, research assessments']);
  assert.deepEqual([gap.big, gap.sub, gap.ariaLabel], ['3', 'locked guesses', 'Your gap, 3 locked guesses against the lines']);
  assert.deepEqual(tiles.slice(1).map(t => t.isNew), [false, false, false, false]);
  const later = betsTiles({ personal: personal(), community, tickets: tickets([]), now: ms('2026-11-10T05:00:00Z'), viewer: LUKE });
  assert.deepEqual([later[1].big, later[1].sub], ['0', 'Week 9 closed']);
  const unlocked = betsTiles({ personal: { ...personal(), ballots: {} }, community, tickets: tickets([]), now, viewer: LUKE });
  assert.deepEqual([unlocked[1].big, unlocked[1].sub, unlocked[4].big], ['0', 'Lock in to see prices', '0']);
  const none = betsTiles({ personal: null, community: null, tickets: { loading: true }, viewer: LUKE, communityShowing: false });
  assert.deepEqual(none.map(t => t.big), ['—', '—', '—', '—', '—']);
  assert.deepEqual([none[1].sub, none[2].sub, none[2].faces, none[4].sub], ['No week open', 'Friends’ picks', null, 'No week open']);
});

test('a failed /personal read says Not loaded on Your picks and Your gap, never "No week open"', () => {
  const tiles = betsTiles({ personal: null, community: null, tickets: tickets([]), viewer: LUKE, failed: true });
  assert.deepEqual([tiles[1].big, tiles[1].sub, tiles[1].ariaLabel], ['—', 'Not loaded', 'Your picks, not loaded']);
  assert.deepEqual([tiles[4].big, tiles[4].sub, tiles[4].ariaLabel], ['—', 'Not loaded', 'Your gap, not loaded']);
  assert.equal(betsTiles({ personal: null, community: null, tickets: tickets([]), viewer: LUKE })[1].sub, 'No week open', 'a 404 is still no week');
});

test('one player is "1 player", not "1 players"', () => {
  const one = betsTiles({ personal: personal(), community: { ...community, members: [{ id: LUKE, displayName: 'Luke' }] }, tickets: tickets([]), now: ms('2026-11-08T19:00:00Z'), viewer: LUKE })[2];
  assert.deepEqual([one.big, one.sub, one.ariaLabel], ['1', 'player', 'Everyone, 1 player, friends’ Virtual Units picks']);
});

test('the My bets tile opens Settled tickets while a win waits (so opening it plays the moment), else Active', () => {
  const at = waitingWins => betsTiles({ personal: personal(), community, tickets: tickets([]), viewer: LUKE, waitingWins });
  assert.equal(at(1)[0].view, 'settled');
  assert.equal(at(0)[0].view, 'active');
  assert.deepEqual(at(0).slice(1).map(t => t.view), ['virtual', 'everyone', 'research', 'recommended']);
});

test('D-31: no line, pick or market value reaches the landing; no surface line over twelve words', () => {
  const read = personal();
  for (const now of [ms('2026-11-08T19:00:00Z'), ms('2026-11-10T05:00:00Z'), null]) {
    const hero = betsHero({ personal: read, tickets: tickets([]), viewer: LUKE, now });
    const tiles = betsTiles({ personal: read, community, tickets: tickets([]), now, viewer: LUKE });
    const shown = JSON.stringify([hero, tiles.map(({ faces, ...tile }) => tile)]);
    // The tile key "picks" and its label "Your picks" are words, not values: only the read's values are secrets here.
    for (const secret of ['2.5', '47.5', 'ballots', 'lockedAt', '2026-11-07']) assert.equal(shown.includes(secret), false, secret);
    for (const text of [hero.eyebrow, hero.title, hero.line, hero.action, ...tiles.map(t => t.sub)]) assert.ok(words(text) <= 12, text);
  }
});
