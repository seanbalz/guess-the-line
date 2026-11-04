// D-69 step 3 (spec 5A, "Next move + tiles"): Research's landing as plain data. Contracts: the first card is this week's
// games and lines while a game is still to kick off, the latest week's results once all have, and a plain card with no
// week; "kicked off" follows the server's clock only; four tiles in order, none of them NEW; no line, pick or market
// ever reaches the landing (D-31); and no surface line runs over twelve words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDING_COPY, RESEARCH_TILES, clockUntil, lastKickoffOf, researchClock, researchHero, researchTiles, weekGamesOf } from '../web/src/next/research/researchModel.js';
import { trendsTile } from '../web/src/next/home/homeModel.js';
import { gamesOf } from '../shared/lines-view.mjs';

const GAMES = [
  { id: 'KC-BUF', awayCode: 'KC', homeCode: 'BUF', away: 'Kansas City Chiefs', home: 'Buffalo Bills', kickoff: '2026-11-08T21:25:00Z', line: -2.5 },
  { id: 'DAL-NYG', awayCode: 'DAL', homeCode: 'NYG', away: 'Dallas Cowboys', home: 'New York Giants', kickoff: '2026-11-06T01:15:00Z' },
  { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', away: 'Seattle Seahawks', home: 'Denver Broncos', kickoff: '2026-11-08T18:00:00Z' },
];
// The /personal reply's shape (the landing's only read): season, week, the server's now and the week's games. The Community
// read carries only a numeric week.games, which the landing never uses. Own picks sit in the reply to prove none reaches it.
const community = (now = '2026-11-08T19:00:00Z', week = 9) => ({ season: 2026, week, now, games: GAMES, picks: { 'SEA-DEN': -3 }, ballots: { guess_spread: { picks: { 'SEA-DEN': -3 } } } });
const realCommunity = { week: { season: 2026, week: 9, deadline: GAMES[1].kickoff, games: 3 }, picksDue: { state: 'due', week: 9, now: '2026-11-08T19:00:00Z' } };
const ms = value => Date.parse(value);
const words = text => String(text).trim().split(/\s+/).length;

test('the week’s games in kickoff order, the server’s clock and the last kickoff, from the /personal read only', () => {
  assert.deepEqual(weekGamesOf(community()).map(g => g.id), ['DAL-NYG', 'SEA-DEN', 'KC-BUF']);
  assert.equal(researchClock(community()), ms('2026-11-08T19:00:00Z'));
  assert.equal(researchClock({ ...community(), now: undefined }), null, 'never the device clock');
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
  for (const none of [null, { season: 2026, week: null, games: [] }, { season: 2026, week: 9, games: [] }, realCommunity]) {
    assert.deepEqual(researchHero(none, null), { kind: 'none', week: Number.isInteger(none?.week) ? none.week : null, eyebrow: 'Research', title: 'No week is open yet', meter: null,
      line: 'Trends, teams and Fantasy are still here.', action: 'Open trends', target: 'trends' });
  }
});

test('four tiles in order: the next game, Home’s saved-trends tile, Fantasy and Teams; none is NEW', () => {
  const tiles = researchTiles({ personal: community(), now: ms('2026-11-08T19:00:00Z'), saved: [] });
  assert.deepEqual(tiles.map(t => t.key), RESEARCH_TILES);
  assert.deepEqual(tiles.map(t => t.label), ['Games', 'Trends', 'Fantasy', 'Teams']);
  const [games, trends, fantasy, teams] = tiles;
  assert.deepEqual([games.big, games.sub, games.ariaLabel, games.next.id], ['1:25 PM', 'Sun · next game', 'Games, next game KC at BUF, Sun 1:25 PM PT', 'KC-BUF']);
  assert.deepEqual([trends.big, trends.sub, trends.ariaLabel, trends.open], [trendsTile([]).big, trendsTile([]).sub, trendsTile([]).ariaLabel, trendsTile([]).open]);
  assert.equal(researchTiles({ personal: community(), now: null, saved: [{ id: 'a' }, { id: 'b' }] })[1].ariaLabel, 'Trends, 2 saved');
  assert.deepEqual([fantasy.big, fantasy.sub, fantasy.ariaLabel, fantasy.open], ['—', 'Player rankings', 'Fantasy, player rankings', { section: 'fantasy' }]);
  assert.deepEqual([teams.big, teams.sub, teams.ariaLabel, teams.open], ['32', 'Records and margins', 'Teams, all 32, records and margins', { section: 'teams' }]);
  assert.equal(tiles.some(t => 'isNew' in t), false);
  const played = researchTiles({ personal: community(), now: ms('2026-11-09T02:00:00Z') })[0];
  assert.deepEqual([played.big, played.sub, played.next], ['3', 'all kicked off', null]);
  const none = researchTiles({ personal: null })[0];
  assert.deepEqual([none.big, none.sub, none.ariaLabel], ['—', 'No week open', 'Games, no week open']);
  assert.equal(new Set(tiles.map(t => t.icon)).size, 4, 'no two tiles share a glyph');
});

test('a failed read: every tile reads a dash with neutral words, never "No week open" (the alert says the week did not load)', () => {
  const [games, trends, fantasy, teams] = researchTiles({ personal: null, failed: true });
  assert.deepEqual([games.big, games.sub, games.ariaLabel, games.next], ['—', 'Not loaded', 'Games, not loaded', null]);
  assert.equal(trends.ariaLabel, trendsTile([]).ariaLabel, 'the device’s own saved trends still show');
  assert.deepEqual([fantasy.big, teams.big], ['—', '32']);
  assert.equal(researchTiles({ personal: null })[0].sub, 'No week open', 'a loaded read with no week still says so');
});

test('the landing counts the games the Games board lists: a game with no kickoff time is on neither; a one-game week reads as one', () => {
  const now = ms('2026-11-09T02:00:00Z');
  for (const bad of [null, undefined, '', 'TBD', 'never']) {
    const untimed = { season: 2026, week: 9, games: [GAMES[1], { ...GAMES[0], kickoff: bad }, GAMES[2]], now: '2026-11-09T02:00:00Z' };
    assert.deepEqual(weekGamesOf(untimed).map(g => g.id), gamesOf(untimed).map(g => g.id), `the board's games (kickoff ${bad})`);
    assert.deepEqual(weekGamesOf(untimed).map(g => g.id), ['DAL-NYG', 'SEA-DEN']);
    assert.equal(researchHero(untimed, now).title, 'Week 9 results', 'the two listed games both kicked off');
    assert.equal(researchHero(untimed, now).line, 'All 2 games kicked off');
    assert.equal(researchHero(untimed, ms('2026-11-04T12:00:00Z')).title, '2 games');
    const tile = researchTiles({ personal: untimed, now })[0];
    assert.deepEqual([tile.big, tile.sub, tile.ariaLabel], ['2', 'all kicked off', 'Games, all 2 kicked off'], 'the tile agrees with the card');
  }
  // Same kickoff: the board's tie-break (by id), so the landing's next game is the board's first row.
  const tied = { season: 2026, week: 9, games: [{ ...GAMES[2], id: 'SEA-DEN' }, { ...GAMES[2], id: 'ARI-DEN', awayCode: 'ARI' }], now: '2026-11-04T12:00:00Z' };
  assert.deepEqual(weekGamesOf(tied).map(g => g.id), ['ARI-DEN', 'SEA-DEN']);
  assert.equal(researchTiles({ personal: tied, now: ms('2026-11-04T12:00:00Z') })[0].next.id, 'ARI-DEN');
  // A week whose games have no times lists none: the card and the tile say no week is open, as the board lists none.
  const noTimes = { season: 2026, week: 9, games: [{ ...GAMES[0], kickoff: null }], now: '2026-11-09T02:00:00Z' };
  assert.equal(researchHero(noTimes, now).kind, 'none');
  assert.equal(researchTiles({ personal: noTimes, now })[0].ariaLabel, 'Games, no week open');
  const one = { season: 2026, week: 9, games: [GAMES[1]], now: '2026-11-09T02:00:00Z' };
  assert.equal(researchHero(one, now).line, 'The game kicked off');
  assert.equal(researchHero(one, ms('2026-11-04T12:00:00Z')).title, '1 game');
  assert.equal(researchTiles({ personal: one, now })[0].ariaLabel, 'Games, the game kicked off');
  assert.equal(researchHero(community(), ms('2026-11-04T12:00:00Z')).eyebrow, 'Week 9 · This week’s lines');
});

test('the clock stops: with a server clock but no timed game the landing’s timer is told to stop at once', () => {
  assert.equal(clockUntil(community()), ms('2026-11-08T21:25:00Z'));
  for (const none of [null, { now: '2026-11-08T19:00:00Z' }, { season: 2026, week: 9, games: [], now: '2026-11-08T19:00:00Z' }, realCommunity,
    { season: 2026, week: 9, games: [{ id: 'A-B', awayCode: 'A', homeCode: 'B', kickoff: null }] }]) assert.equal(clockUntil(none), 0);
});

test('every landing line is twelve words or fewer, the copy and spoken labels included', () => {
  for (const text of Object.values(LANDING_COPY)) assert.ok(words(text) <= 12, text);
  for (const now of [ms('2026-11-04T12:00:00Z'), ms('2026-11-09T02:00:00Z'), null]) {
    for (const tile of researchTiles({ personal: community(), now })) assert.ok(words(tile.ariaLabel) <= 12, tile.ariaLabel);
  }
  for (const tile of researchTiles({ personal: null, failed: true })) assert.ok(words(tile.ariaLabel) <= 12 && words(tile.sub) <= 12);
});

test('D-31: no line, pick or market reaches the landing, whatever the read carries; no surface line over twelve words', () => {
  const read = community();
  const shown = JSON.stringify([researchHero(read, ms('2026-11-08T19:00:00Z')), researchTiles({ personal: read, now: ms('2026-11-08T19:00:00Z') })]);
  for (const secret of ['-2.5', '−2.5', '-3', '−3', 'picks', 'ballots']) assert.equal(shown.includes(secret), false, secret);
  for (const now of [ms('2026-11-04T12:00:00Z'), ms('2026-11-08T19:00:00Z'), ms('2026-11-09T02:00:00Z'), null]) {
    const hero = researchHero(now === null ? null : read, now);
    for (const text of [hero.eyebrow, hero.title, hero.line, hero.action]) assert.ok(words(text) <= 12, text);
    for (const tile of researchTiles({ personal: read, now })) assert.ok(words(tile.sub) <= 12, tile.sub);
  }
});

test('the Community read as it really arrives (week.games is a count): it names no games, so the landing never takes them from it', () => {
  assert.deepEqual(weekGamesOf(realCommunity), []);
  assert.equal(researchClock(realCommunity), null);
  assert.equal(researchHero(realCommunity, null).kind, 'none');
});
