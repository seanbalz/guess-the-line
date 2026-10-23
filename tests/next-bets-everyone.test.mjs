// Bets › Everyone (M-10, D-36) view model, web/src/next/bets/everyone.js. Contracts:
// - a friend's pick shows its side and units at any time, and its line, price, book and result only when the server
//   marks that game's market open for the viewer; a closed market never draws terms even if a reply carries them;
// - your own picks always show in full and lead each game; a game lists who picked it, faces first;
// - one gate banner names the markets still closed; the weekly list shows picks, units and qualification;
// - an unpublished week and a week with no picks say so.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EVERYONE_COPY, everyoneBoard, pickText, sideText } from '../web/src/next/bets/everyone.js';

const LUKE = '00000000-0000-4000-8000-000000000003', TROY = '00000000-0000-4000-8000-000000000002', SEAN = '00000000-0000-4000-8000-000000000001';
const game = (id, away, home, kickoff) => ({ id, awayCode: away, homeCode: home, kickoff });
const pick = (userId, gameId, market, selection, extra = {}) => ({ userId, gameId, market, selection, status: null, result: null, audit: null, createdAt: null, updatedAt: null, ...extra });
const full = (side, line, odds, units, source = 'DraftKings') => ({ gameId: null, market: null, side, line, odds, units, source, quotedAt: '2026-10-22T18:00:00.000Z', selectedAt: '2026-10-22T18:01:00.000Z' });

function reply(overrides = {}) {
  return {
    season: 2026, week: 7, published: true, now: '2026-10-22T19:00:00.000Z', leagueId: null, revision: 0,
    roster: [{ userId: SEAN, displayName: 'Sean' }, { userId: TROY, displayName: 'Troy' }, { userId: LUKE, displayName: 'Luke' }],
    games: [game('SEA-DEN', 'SEA', 'DEN', '2026-10-25T20:05:00.000Z'), game('HOU-JAX', 'HOU', 'JAX', '2026-10-25T17:00:00.000Z')],
    markets: { 'SEA-DEN': { spread: { visible: false }, total: { visible: false } }, 'HOU-JAX': { spread: { visible: true, offers: {} }, total: { visible: false } } },
    bets: [
      // Troy's closed Spread on SEA-DEN: the server already reduced it to side and units.
      pick(TROY, 'SEA-DEN', 'spread', { side: 'home', units: 1.5 }),
      // Luke's own Total on SEA-DEN: always in full.
      pick(LUKE, 'SEA-DEN', 'total', full('over', 44.5, -110, 2)),
      // Sean's open Spread on HOU-JAX, settled.
      pick(SEAN, 'HOU-JAX', 'spread', full('away', 3, 120, 1, 'FanDuel'), { status: 'win', result: { status: 'final', netUnits: 1.2 } }),
    ],
    faces: { 'SEA-DEN': [TROY, LUKE], 'HOU-JAX': [SEAN] },
    qualification: [{ userId: SEAN, picks: 1, units: 1, qualified: false }, { userId: TROY, picks: 3, units: 4.5, qualified: true }, { userId: LUKE, picks: 1, units: 2, qualified: false }],
    ...overrides,
  };
}

test('a friend in a closed market shows side and units only; the lock sentence replaces the terms', () => {
  const board = everyoneBoard(reply(), LUKE);
  const troy = board.games.find(g => g.id === 'SEA-DEN').picks.find(p => p.userId === TROY);
  assert.equal(troy.open, false);
  assert.equal(troy.side, 'DEN');
  assert.equal(troy.units, '1.5U');
  assert.equal(troy.terms, null);
  assert.equal(troy.result, null);
  assert.equal(troy.locked, EVERYONE_COPY.locked('spread'));
});

test('a closed market never draws terms, even if the reply carries a line, price, book or result', () => {
  const forged = reply({ bets: [pick(TROY, 'SEA-DEN', 'spread', full('home', -13.5, -110, 1.5, 'BetMGM'), { status: 'win', result: { netUnits: 1.36 } })] });
  const row = everyoneBoard(forged, LUKE).games[0].picks[0];
  assert.equal(row.terms, null);
  assert.equal(row.result, null);
  assert.doesNotMatch(JSON.stringify(row), /13\.5|BetMGM|1\.36|−110|-110/);
});

test('an open market shows the friend’s full terms and result in words', () => {
  const sean = everyoneBoard(reply(), LUKE).games.find(g => g.id === 'HOU-JAX').picks[0];
  assert.equal(sean.open, true);
  assert.deepEqual(sean.terms, { pick: 'HOU +3', odds: '+120', book: 'FanDuel' });
  assert.deepEqual(sean.result, { label: 'Win', tone: 'win', net: '+1.20U' });
  assert.equal(sean.locked, null);
});

test('your own pick is always in full and leads its game; you are named You', () => {
  const picks = everyoneBoard(reply(), LUKE).games.find(g => g.id === 'SEA-DEN').picks;
  assert.equal(picks[0].userId, LUKE);
  assert.equal(picks[0].name, 'You');
  assert.equal(picks[0].display, 'Luke');
  assert.deepEqual(picks[0].terms, { pick: 'Over 44.5', odds: '−110', book: 'DraftKings' });
  assert.equal(picks[0].open, true, 'owner terms never close, whatever the market gate says');
});

test('games run by kickoff, list only games with picks, and lead with faces (you first)', () => {
  const board = everyoneBoard(reply(), LUKE);
  assert.deepEqual(board.games.map(g => g.id), ['HOU-JAX', 'SEA-DEN']);
  assert.deepEqual(board.games[1].faces.map(f => [f.name, f.you]), [['You', true], ['Troy', false]]);
});

test('one banner lists the markets where a friend’s terms are still closed', () => {
  assert.deepEqual(everyoneBoard(reply(), LUKE).closed, ['spread']);
  const allOpen = reply({ markets: { 'SEA-DEN': { spread: { visible: true }, total: { visible: true } }, 'HOU-JAX': { spread: { visible: true }, total: { visible: true } } } });
  assert.deepEqual(everyoneBoard(allOpen, LUKE).closed, []);
  // Troy: Luke's SEA-DEN Total is closed to him; Sean's HOU-JAX Spread is open; his own pick never counts.
  assert.deepEqual(everyoneBoard(reply(), TROY).closed, ['total']);
});

test('the weekly list shows you first, picks and units, and qualification as a word-ready flag', () => {
  const rows = everyoneBoard(reply(), LUKE).qualification;
  assert.deepEqual(rows.map(r => [r.name, r.picks, r.units, r.qualified]), [['You', 1, '2U', false], ['Sean', 1, '1U', false], ['Troy', 3, '4.5U', true]]);
});

test('an unpublished week and a week without picks say so', () => {
  const unpublished = everyoneBoard({ season: 2026, week: 8, published: false, roster: [], games: [], bets: [], faces: {}, markets: {}, qualification: [] }, LUKE);
  assert.equal(unpublished.published, false);
  assert.equal(unpublished.empty, false);
  const quiet = everyoneBoard(reply({ bets: [], faces: {}, qualification: [] }), LUKE);
  assert.equal(quiet.empty, true);
  assert.deepEqual(quiet.games, []);
});

test('sides and picks read in plain words with the real minus sign', () => {
  const g = game('SEA-DEN', 'SEA', 'DEN', null);
  assert.equal(sideText(g, 'spread', 'away'), 'SEA');
  assert.equal(sideText(g, 'total', 'under'), 'Under');
  assert.equal(pickText(g, 'spread', { side: 'home', line: -3 }), 'DEN −3');
  assert.equal(pickText(g, 'spread', { side: 'away', line: 0 }), "SEA Pick'em");
  assert.equal(pickText(g, 'total', { side: 'under', line: 41.5 }), 'Under 41.5');
  assert.equal(pickText(g, 'spread', { side: 'home' }), 'DEN', 'no line: the side alone');
});
