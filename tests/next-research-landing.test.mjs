// D-69 step 3 (spec 5A, "Next move + tiles"): Research's landing as plain data. Contracts: the first card is this week's
// games and lines while a game is still to kick off, the latest week's results once all have, and a plain card with no
// week; "kicked off" follows the server's clock only; four tiles in order, none of them NEW; no line, pick or market
// ever reaches the landing (D-31); and no surface line runs over twelve words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDING_COPY, RESEARCH_TILES, clockUntil, lastKickoffOf, researchClock, researchHero, researchTiles, weekGamesOf } from '../web/src/next/research/researchModel.js';
import { trendsTile } from '../web/src/next/home/homeModel.js';

const GAMES = [
  { id: 'KC-BUF', awayCode: 'KC', homeCode: 'BUF', away: 'Kansas City Chiefs', home: 'Buffalo Bills', kickoff: '2026-11-08T21:25:00Z', line: -2.5 },
  { id: 'DAL-NYG', awayCode: 'DAL', homeCode: 'NYG', away: 'Dallas Cowboys', home: 'New York Giants', kickoff: '2026-11-06T01:15:00Z' },
  { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', away: 'Seattle Seahawks', home: 'Denver Broncos', kickoff: '2026-11-08T18:00:00Z' },
];
const community = (now = '2026-11-08T19:00:00Z', week = 9) => ({ week: { season: 2026, week, deadline: GAMES[1].kickoff, games: GAMES },
  picksDue: { state: 'due', week, now }, picks: { 'SEA-DEN': -3 }, ballots: { guess_spread: { picks: { 'SEA-DEN': -3 } } } });
const ms = value => Date.parse(value);
const words = text => String(text).trim().split(/\s+/).length;

test('the week’s games in kickoff order, the server’s clock and the last kickoff, from the Community read only', () => {
  assert.deepEqual(weekGamesOf(community()).map(g => g.id), ['DAL-NYG', 'SEA-DEN', 'KC-BUF']);
  assert.equal(researchClock(community()), ms('2026-11-08T19:00:00Z'));
  assert.equal(researchClock({ week: community().week }), null, 'never the device clock');
  assert.equal(lastKickoffOf(community()), ms('2026-11-08T21:25:00Z'));
  assert.equal(lastKickoffOf(null), null);
});

test('the first card while games are left: the slate, the week meter and how many kicked off; the one lime button opens the games', () => {
  const hero = researchHero(community(), ms('2026-11-08T19:00:00Z'));
  assert.deepEqual(hero, { kind: 'week', week: 9, eyebrow: 'Week 9 · This week’s lines', title: '3 games', meter: { done: 2, of: 3 },
    line: '2 of 3 kicked off', action: 'Open games', target: 'games' });
  assert.equal(researchHero(community(), ms('2026-11-04T12:00:00Z')).line, '0 of 3 kicked off');
  assert.equal(researchHero(community(), null).meter.done, 0, 'without the server’s clock nothing counts as kicked off');
});

test('once every game kicked off it is the week’s results; with no week a plain card that opens Trends', () => {
  assert.deepEqual(researchHero(community(), ms('2026-11-09T02:00:00Z')), { kind: 'played', week: 9, eyebrow: 'Week 9 · Results', title: 'Week 9 results',
    meter: { done: 3, of: 3 }, line: 'All 3 games kicked off', action: 'See results', target: 'games' });
  for (const none of [null, { week: null }, { week: { season: 2026, week: 9, games: [] } }]) {
    assert.deepEqual(researchHero(none, null), { kind: 'none', week: none?.week?.week ?? null, eyebrow: 'Research', title: 'No week is open yet', meter: null,
      line: 'Trends, teams and Fantasy are still here.', action: 'Open trends', target: 'trends' });
  }
});

test('four tiles in order: the next game, Home’s saved-trends tile, Fantasy and Teams; none is NEW', () => {
  const tiles = researchTiles({ community: community(), now: ms('2026-11-08T19:00:00Z'), saved: [] });
  assert.deepEqual(tiles.map(t => t.key), RESEARCH_TILES);
  assert.deepEqual(tiles.map(t => t.label), ['Games', 'Trends', 'Fantasy', 'Teams']);
  const [games, trends, fantasy, teams] = tiles;
  assert.deepEqual([games.big, games.sub, games.ariaLabel, games.next.id], ['1:25 PM', 'Sun · next game', 'Games, next game KC at BUF, Sun 1:25 PM PT', 'KC-BUF']);
  assert.deepEqual([trends.big, trends.sub, trends.ariaLabel, trends.open], [trendsTile([]).big, trendsTile([]).sub, trendsTile([]).ariaLabel, trendsTile([]).open]);
  assert.equal(researchTiles({ community: community(), now: null, saved: [{ id: 'a' }, { id: 'b' }] })[1].ariaLabel, 'Trends, 2 saved');
  assert.deepEqual([fantasy.big, fantasy.sub, fantasy.ariaLabel, fantasy.open], ['—', 'Player rankings', 'Fantasy, player rankings', { section: 'fantasy' }]);
  assert.deepEqual([teams.big, teams.sub, teams.ariaLabel, teams.open], ['32', 'Records and margins', 'Teams, all 32, records and margins', { section: 'teams' }]);
  assert.equal(tiles.some(t => 'isNew' in t), false);
  const played = researchTiles({ community: community(), now: ms('2026-11-09T02:00:00Z') })[0];
  assert.deepEqual([played.big, played.sub, played.next], ['3', 'all kicked off', null]);
  const none = researchTiles({ community: null })[0];
  assert.deepEqual([none.big, none.sub, none.ariaLabel], ['—', 'No week open', 'Games, no week open']);
  assert.equal(new Set(tiles.map(t => t.icon)).size, 4, 'no two tiles share a glyph');
});

test('a failed read: every tile reads a dash with neutral words, never "No week open" (the alert says the week did not load)', () => {
  const [games, trends, fantasy, teams] = researchTiles({ community: null, failed: true });
  assert.deepEqual([games.big, games.sub, games.ariaLabel, games.next], ['—', 'Not loaded', 'Games, not loaded', null]);
  assert.equal(trends.ariaLabel, trendsTile([]).ariaLabel, 'the device’s own saved trends still show');
  assert.deepEqual([fantasy.big, teams.big], ['—', '32']);
  assert.equal(researchTiles({ community: null })[0].sub, 'No week open', 'a loaded read with no week still says so');
});

test('untimed games: the card and the Games tile agree (not "all kicked off" while a game has no time); a one-game week reads as one', () => {
  const untimed = { week: { season: 2026, week: 9, games: [GAMES[1], { ...GAMES[0], kickoff: null }] }, picksDue: { now: '2026-11-09T02:00:00Z' } };
  const now = ms('2026-11-09T02:00:00Z');
  assert.equal(researchHero(untimed, now).kind, 'week');
  assert.equal(researchHero(untimed, now).line, '1 of 2 kicked off');
  const tile = researchTiles({ community: untimed, now })[0];
  assert.notEqual(tile.sub, 'all kicked off');
  assert.deepEqual([tile.big, tile.sub, tile.ariaLabel], ['—', 'Time to be set', 'Games, a kickoff time is not set']);
  const one = { week: { season: 2026, week: 9, games: [GAMES[1]] }, picksDue: { now: '2026-11-09T02:00:00Z' } };
  assert.equal(researchHero(one, now).line, 'The game kicked off');
  assert.equal(researchHero(one, ms('2026-11-04T12:00:00Z')).title, '1 game');
  assert.equal(researchTiles({ community: one, now })[0].ariaLabel, 'Games, the game kicked off');
  assert.equal(researchHero(community(), ms('2026-11-04T12:00:00Z')).eyebrow, 'Week 9 · This week’s lines');
});

test('the clock stops: with a server clock but no timed game the landing’s timer is told to stop at once', () => {
  assert.equal(clockUntil(community()), ms('2026-11-08T21:25:00Z'));
  for (const none of [null, { picksDue: { now: '2026-11-08T19:00:00Z' } }, { week: { season: 2026, week: 9, games: [] }, picksDue: { now: '2026-11-08T19:00:00Z' } },
    { week: { season: 2026, week: 9, games: [{ id: 'A-B', awayCode: 'A', homeCode: 'B', kickoff: null }] } }]) assert.equal(clockUntil(none), 0);
});

test('every landing line is twelve words or fewer, the copy and spoken labels included', () => {
  for (const text of Object.values(LANDING_COPY)) assert.ok(words(text) <= 12, text);
  for (const now of [ms('2026-11-04T12:00:00Z'), ms('2026-11-09T02:00:00Z'), null]) {
    for (const tile of researchTiles({ community: community(), now })) assert.ok(words(tile.ariaLabel) <= 12, tile.ariaLabel);
  }
  for (const tile of researchTiles({ community: null, failed: true })) assert.ok(words(tile.ariaLabel) <= 12 && words(tile.sub) <= 12);
});

test('D-31: no line, pick or market reaches the landing, whatever the read carries; no surface line over twelve words', () => {
  const read = community();
  const shown = JSON.stringify([researchHero(read, ms('2026-11-08T19:00:00Z')), researchTiles({ community: read, now: ms('2026-11-08T19:00:00Z') })]);
  for (const secret of ['-2.5', '−2.5', '-3', '−3', 'picks', 'ballots']) assert.equal(shown.includes(secret), false, secret);
  for (const now of [ms('2026-11-04T12:00:00Z'), ms('2026-11-08T19:00:00Z'), ms('2026-11-09T02:00:00Z'), null]) {
    const hero = researchHero(now === null ? null : read, now);
    for (const text of [hero.eyebrow, hero.title, hero.line, hero.action]) assert.ok(words(text) <= 12, text);
    for (const tile of researchTiles({ community: read, now })) assert.ok(words(tile.sub) <= 12, tile.sub);
  }
});
