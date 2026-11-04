// D-69 step 2, Home as plain data (web/src/next/home/homeModel.js): the next-move card's words (H1A, C9), the six tile
// models and This week's game tiles. Fixture weeks and fictional people only. Each test names the contract it protects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HOME_COPY, homeHero } from '../shared/home-view.mjs';
import { GAME_TILES, HERO_COPY, awardsTile, betsTile, heroHeadline, heroMeters, lastKickoff, rankTileView, trendsTile, weekGames, whoTile } from '../web/src/next/home/homeModel.js';

const THU = '2026-11-06T01:15:00.000Z'; // Thu Nov 5, 5:15 PM PT: the deadline and first kickoff
const SUN10 = '2026-11-08T18:00:00.000Z', SUN1 = '2026-11-08T21:05:00.000Z', SUN5 = '2026-11-09T01:20:00.000Z', MON = '2026-11-10T01:15:00.000Z';
const TUESDAY = '2026-11-03T20:00:00.000Z';
const row = (mode, extra) => ({ mode, submitted: false, satOut: false, filled: 0, games: 4, ...extra });
const due = (spread = {}, total = {}) => [row('guess_spread', { filled: 2, ...spread }), row('guess_total', total)];
const community = ({ state = 'due', rows = due(), perGame = false } = {}) => ({ viewer: 'u-you', ...(perGame ? { rules: { perGameScoring: true } } : {}),
  week: { season: 2026, week: 9, deadline: THU, games: 4 }, picksDue: { state, week: 9, deadline: THU, opensAt: '2026-11-02T08:00:00.000Z', now: TUESDAY, modes: [] }, due: rows });
const headline = c => heroHeadline({ hero: homeHero({ community: c }), community: c });
const wordCount = text => String(text).split(/\s+/).filter(w => w && w !== '·').length;

test('the card while picks are due: "Week N · Your next move", the action in words and the deadline; per-game names the next kickoff', () => {
  assert.deepEqual(headline(community()), { eyebrow: 'Week 9 · Your next move', title: 'Lock in 4 games', sub: 'before Thu 5:15 PM PT' });
  const perGame = community({ perGame: true, rows: due({ locked: 1, openGames: 3, nextKickoff: SUN10 }, { locked: 2, openGames: 2, nextKickoff: SUN10 }) });
  assert.deepEqual(headline(perGame), { eyebrow: 'Week 9 · Your next move', title: 'Lock in 3 games', sub: 'Next kickoff Sun 10:00 AM PT' });
});

test('nothing due: "Your week" over one plain headline; both ballots done reads "Week N locked in", every market sat out "Week N sat out"', () => {
  assert.deepEqual(headline(community({ state: 'done', rows: due({ submitted: true, filled: 4 }, { satOut: true }) })), { eyebrow: 'Your week', title: HERO_COPY.allIn(9), sub: null });
  assert.equal(HERO_COPY.allIn(9), 'Week 9 locked in');
  assert.equal(headline(community({ state: 'done', rows: due({ satOut: true, filled: 0 }, { satOut: true }) })).title, 'Week 9 sat out');
  assert.deepEqual(headline(community({ state: 'not_open' })), { eyebrow: 'Week 9 · Your next move', title: HERO_COPY.opensSoon, sub: null });
  assert.deepEqual(headline(community({ state: 'closed' })), { eyebrow: 'Week 9', title: HOME_COPY.closed, sub: null });
  assert.deepEqual(headline({ picksDue: { state: 'none', modes: [] }, due: [] }), { eyebrow: null, title: HOME_COPY.noWeek, sub: null });
});

test('C9: each market’s meter carries its own words: picked, locked, sent or sat out; no week, no meters', () => {
  assert.deepEqual(heroMeters(community()), [
    { mode: 'guess_spread', done: 2, of: 4, words: 'Spread · 2 of 4 picked' }, { mode: 'guess_total', done: 0, of: 4, words: 'Total · 0 of 4 picked' }]);
  const perGame = community({ perGame: true, rows: [row('guess_spread', { games: 14, locked: 3, openGames: 11 }), row('guess_total', { games: 14, locked: 0, openGames: 14 })] });
  assert.deepEqual(heroMeters(perGame).map(m => [m.words, m.done, m.of]), [['Spread · 3 of 14 locked', 3, 14], ['Total · 0 of 14 locked', 0, 14]]);
  assert.deepEqual(heroMeters(community({ state: 'done', rows: due({ submitted: true, filled: 4 }, { satOut: true }) })).map(m => [m.words, m.done, m.of]),
    [['Spread · sent', 4, 4], ['Total · sat out', 0, 4]]);
  assert.deepEqual(heroMeters({ picksDue: { state: 'none' }, due: [] }), []);
});

test('rank tiles: the ordinal big, "▲ 2 · 41 pts" with its word in the name; a drop is plain; unranked says so, never a zero', () => {
  assert.deepEqual(rankTileView({ label: 'Spread rank', tile: { rank: 2, tied: true, label: 'T-2', points: 10, scored: 4, of: 4 } }),
    { ranked: true, big: 'T-2', arrow: null, points: 10, tone: 'plain', ariaLabel: 'Spread rank, T-2, 10 points' });
  assert.deepEqual(rankTileView({ label: 'Spread rank', tile: { rank: 3, tied: false, label: '3', points: 41, scored: 6, of: 6 }, move: 2 }),
    { ranked: true, big: '3rd', arrow: '▲ 2', points: 41, tone: 'good', ariaLabel: 'Spread rank, 3rd, up 2, 41 points' });
  assert.deepEqual(rankTileView({ label: 'Total rank', tile: { rank: 5, tied: false, label: '5', points: 36.5, scored: 6, of: 6 }, move: -1 }),
    { ranked: true, big: '5th', arrow: '▼ 1', points: 36.5, tone: 'plain', ariaLabel: 'Total rank, 5th, down 1, 36.5 points' });
  assert.deepEqual(rankTileView({ label: 'Total rank', tile: { rank: null, tied: false, label: '—', points: null, scored: 0, of: 3 } }),
    { ranked: false, big: '—', arrow: null, points: null, tone: 'plain', ariaLabel: 'Total rank, not scored yet' });
});

test('Who’s in: "4 / 6" with up to four faces (you first) and "Spread ballots in"; no week or no members says so', () => {
  const people = ['you', 'a', 'b', 'c', 'd'].map((id, i) => ({ id: `u-${id}`, name: id, you: i === 0, status: 'in' }));
  assert.deepEqual(whoTile({ whosIn: { in: 4, of: 5, people }, week: 9 }), { big: '4 / 5', sub: 'Spread ballots in', people: people.slice(0, 4), ariaLabel: 'Who’s in, 4 of 5 Spread ballots in' });
  assert.deepEqual(whoTile({ whosIn: { in: 0, of: 5, people }, week: null }), { big: '—', sub: 'No week open', people: [], ariaLabel: 'Who’s in, no week open' });
  assert.deepEqual(whoTile({ whosIn: { in: 0, of: 0, people: [] }, week: 9 }), { big: '—', sub: 'No members yet', people: [], ariaLabel: 'Who’s in, no members yet' });
});

test('Awards: the newest week’s count; your award named, "New:" only while its moment waits; NEW for a waiting award or badge, never a streak', () => {
  const model = { recap: { week: 8, rows: [{ id: 'spread_winner' }, { id: 'total_winner' }, { id: 'best_guess' }], mine: { name: 'Sharpshooter' } } };
  assert.deepEqual(awardsTile({ model }), { big: '3', sub: 'Week 8 · You won Sharpshooter', tone: 'good', isNew: false, ariaLabel: 'Awards, 3 in Week 8, you won Sharpshooter' });
  const waiting = [{ id: 'award:community:2026:8:sharpshooter', kind: 'award', title: 'Sharpshooter' }];
  assert.deepEqual(awardsTile({ model, waiting, season: 2026 }), { big: '3', sub: 'Week 8 · New: Sharpshooter', tone: 'good', isNew: true, ariaLabel: 'Awards, 3 in Week 8, new: Sharpshooter' });
  // An award moment's whole id prefix (award:<league>:<season>:<week>:) names it, never the week alone (final review M1).
  const elsewhere = id => awardsTile({ model, waiting: [{ id, kind: 'award', title: 'Best guess' }], league: 'community', season: 2026 });
  for (const [id, why] of [['award:lg-7:2026:8:best_guess', 'another league’s Week 8'], ['award:community:2025:8:best_guess', 'last season’s Week 8']]) {
    assert.deepEqual([elsewhere(id).sub, elsewhere(id).isNew], ['Week 8 · You won Sharpshooter', true], `${why} award is NEW but never named as this one`);
  }
  assert.equal(awardsTile({ model, waiting: [{ id: 'award:lg-7:2026:8:best_guess', kind: 'award', title: 'Best guess' }], league: 'lg-7', season: 2026 }).sub, 'Week 8 · New: Best guess', 'a league’s own award is named on its Home');
  assert.deepEqual(awardsTile({ model: { recap: { ...model.recap, mine: null } }, waiting: [{ id: 'badge:x', kind: 'badge', title: 'Bullseye' }] }),
    { big: '3', sub: 'Week 8 awards', tone: 'plain', isNew: true, ariaLabel: 'Awards, 3 in Week 8' });
  assert.equal(awardsTile({ model, waiting: [{ id: 'streak:pick:2026:5:5', kind: 'streak', title: 'Pick streak' }] }).isNew, false, 'a waiting streak belongs to the card, not the Awards tile');
  assert.equal(awardsTile({ model, waiting: [{ id: 'award:community:2026:7:best_guess', kind: 'award', title: 'Best guess' }], season: 2026 }).sub, 'Week 8 · You won Sharpshooter', 'an older week’s award is NEW but never named as this week’s');
  assert.deepEqual(awardsTile({ model: null, off: true }), { big: '—', sub: 'Coming soon', tone: 'plain', isNew: false, ariaLabel: 'Awards, coming soon' });
  assert.deepEqual(awardsTile({ model: null }), { big: '—', sub: 'Badges and awards', tone: 'plain', isNew: false, ariaLabel: 'Awards' });
  assert.deepEqual(awardsTile({ model: { recap: null } }), { big: '—', sub: 'None posted yet', tone: 'plain', isNew: false, ariaLabel: 'Awards, none posted yet' });
});

test('My bets and Trends: one ticket in the singular, a dash while loading, retry on failure; saved trends counted, else charts for every game', () => {
  assert.deepEqual(betsTile({ loading: true, error: null, active: null }), { big: '—', sub: 'active tickets', ariaLabel: 'My bets, loading' });
  assert.deepEqual(betsTile({ loading: false, error: null, active: 1 }), { big: '1', sub: 'active ticket', ariaLabel: 'My bets, 1 active ticket' });
  assert.deepEqual(betsTile({ loading: false, error: null, active: 0 }), { big: '0', sub: 'active tickets', ariaLabel: 'My bets, 0 active tickets' });
  assert.deepEqual(betsTile({ loading: false, error: { status: 503 }, active: null }), { big: '—', sub: 'Open to retry', ariaLabel: 'My bets, could not load, open to retry' });
  assert.deepEqual(trendsTile([{ id: 'a' }, { id: 'b' }, { id: 'c' }]), { big: '3', sub: 'saved', ariaLabel: 'Trends, 3 saved', open: { section: 'trends', trendSection: 'build', season: null, week: null } });
  assert.deepEqual(trendsTile([]), { big: '0', sub: 'Charts for every game', ariaLabel: 'Trends, none saved, charts for every game', open: { section: 'trends', season: null, week: null } });
});

const G = (id, kickoff) => { const [away, home] = id.split('-'); return { id, awayCode: away, homeCode: home, away, home, kickoff }; };
const GAMES = [G('SEA-DEN', THU), G('BUF-KC', SUN10), G('LAC-LV', SUN10), G('NYG-PHI', SUN1), G('HOU-JAX', SUN5), G('CHI-GB', MON)];
// The viewer's own Spread ballot: a draft on BUF-KC, a lock on LAC-LV with its saved line (never shown on a tile).
const BALLOT = { picks: { 'BUF-KC': -4.5, 'LAC-LV': 7.5 }, lockedAt: { 'LAC-LV': '2026-11-04T18:00:00.000Z' }, scoringReferences: { 'LAC-LV': { status: 'available', value: 3.5 } } };
const personal = (now, extra = {}) => ({ season: 2026, week: 9, now, deadline: THU, rules: { sentFinal: true, lateWindow: 'kickoff', revealAt: 'kickoff', perGameScoring: true },
  games: GAMES, ballots: { guess_spread: BALLOT }, ...extra });
// Sun Nov 8 9:00 AM PT; Mon Nov 9 10:00 AM PT (before Monday night); Wed Nov 11 10:00 AM PT (every game played).
const SUNDAY_MORNING = '2026-11-08T17:00:00.000Z', MONDAY_MORNING = '2026-11-09T18:00:00.000Z', WEDNESDAY_AFTER = '2026-11-11T18:00:00.000Z';

test('This week: the next four games in kickoff order with your own Spread word; when fewer remain, the week’s last four', () => {
  assert.equal(GAME_TILES, 4);
  const sunday = weekGames(personal(SUNDAY_MORNING));
  assert.deepEqual([sunday.season, sunday.week, sunday.count], [2026, 9, 6]);
  assert.deepEqual(sunday.games.map(g => [g.id, g.word]), [['BUF-KC', 'Draft'], ['LAC-LV', 'Locked in'], ['NYG-PHI', 'To pick'], ['HOU-JAX', 'To pick']], 'Thursday’s game has gone');
  assert.deepEqual(sunday.games[0], { id: 'BUF-KC', away: 'BUF', home: 'KC', matchup: 'BUF @ KC', when: 'Sun 10:00 AM PT', state: 'draft', word: 'Draft',
    ariaLabel: 'Bills at Chiefs, Sun 10:00 AM PT, Spread draft', open: { market: 'spread', season: 2026, week: 9, pickGame: 'BUF-KC' } });
  assert.deepEqual(weekGames(personal(MONDAY_MORNING)).games.map(g => [g.id, g.word]), [['LAC-LV', 'Locked in'], ['NYG-PHI', 'Closed at kickoff'], ['HOU-JAX', 'Closed at kickoff'], ['CHI-GB', 'To pick']]);
  assert.deepEqual(weekGames(personal(WEDNESDAY_AFTER)).games.map(g => g.id), ['LAC-LV', 'NYG-PHI', 'HOU-JAX', 'CHI-GB'], 'all kicked off: the last four');
  assert.deepEqual(weekGames({ ...personal(SUNDAY_MORNING), games: GAMES.slice(4) }).games.map(g => g.id), ['HOU-JAX', 'CHI-GB'], 'a short week shows what it has');
  assert.equal(weekGames(personal('2026-11-01T12:00:00.000Z')).games[0].word, 'Not open', 'before Monday 12:00 AM PT the week is not open');
});

test('a sit-out: open games say "Sat out" and a locked guess stays "Locked"; another week’s sit-out is not this week’s', () => {
  assert.deepEqual(weekGames(personal(SUNDAY_MORNING, { scoring: { guess_spread: { satOut: true } } })).games.map(g => g.word), ['Skipped', 'Locked in', 'Skipped', 'Skipped']);
  assert.deepEqual(weekGames(personal(SUNDAY_MORNING), { week: { season: 2026, week: 9 }, optOuts: ['guess_spread'] }).games.map(g => g.word), ['Skipped', 'Locked in', 'Skipped', 'Skipped']);
  assert.deepEqual(weekGames(personal(SUNDAY_MORNING), { week: { season: 2026, week: 8 }, optOuts: ['guess_spread'] }).games.map(g => g.word), ['Draft', 'Locked in', 'To pick', 'To pick']);
});

test('D-31: a game tile carries your own state word only: no pick, no saved line and nothing of another player, whatever the replies hold', () => {
  const leaky = personal(SUNDAY_MORNING, { others: [{ userId: 'u-troy', picks: { 'BUF-KC': 6.5 } }] });
  const view = weekGames(leaky, { week: { season: 2026, week: 9 }, optOuts: [], submissions: [{ userId: 'u-troy', mode: 'guess_spread', picks: { 'BUF-KC': 6.5 } }] });
  const text = JSON.stringify(view);
  for (const secret of ['6.5', '4.5', '7.5', '3.5', 'u-troy']) assert.ok(!text.includes(secret), `no ${secret} on Home`);
  for (const tile of view.games) assert.deepEqual(Object.keys(tile).sort(), ['ariaLabel', 'away', 'home', 'id', 'matchup', 'open', 'state', 'when', 'word']);
});

test('empty and failed shapes: no reply, no games or no kickoff draw no tiles; without the server’s clock nothing is offered as open', () => {
  assert.equal(weekGames(null), null);
  assert.equal(weekGames({ ...personal(SUNDAY_MORNING), games: [] }), null);
  assert.equal(weekGames({ ...personal(SUNDAY_MORNING), games: [{ id: 'SEA-DEN' }] }), null);
  assert.deepEqual(weekGames({ ...personal(SUNDAY_MORNING), now: null }).games.map(g => g.word), ['Closed at kickoff', 'Closed at kickoff', 'Locked in', 'Closed at kickoff']);
  assert.deepEqual(weekGames({ ...personal(SUNDAY_MORNING), ballots: {} }).games.map(g => g.word), ['To pick', 'To pick', 'To pick', 'To pick']);
});

test('the week’s last kickoff bounds This week’s clock: the latest game whatever the reply’s order; none without games', () => {
  assert.equal(lastKickoff({ ...personal(SUNDAY_MORNING), games: [...GAMES].reverse() }), Date.parse(MON));
  assert.equal(lastKickoff({ ...personal(SUNDAY_MORNING), games: [] }), null);
  assert.equal(lastKickoff(null), null);
});

test('no surface sentence over twelve words in anything Home says (D-66)', () => {
  const said = [
    ...[community(), community({ state: 'done', rows: due({ submitted: true, filled: 4 }, { satOut: true }) }), community({ state: 'not_open' })].flatMap(c => [...Object.values(headline(c)), ...heroMeters(c).map(m => m.words)]),
    rankTileView({ label: 'Spread rank', tile: { rank: 3, tied: false, label: '3', points: 41, scored: 6, of: 6 }, move: 2 }).ariaLabel,
    awardsTile({ model: { recap: { week: 8, rows: [{}], mine: { name: 'Best guess' } } }, waiting: [{ id: 'award:community:2026:8:best_guess', kind: 'award', title: 'Best guess' }], season: 2026 }).ariaLabel,
    ...weekGames(personal(SUNDAY_MORNING)).games.flatMap(g => [g.ariaLabel, g.when, g.word]),
  ].filter(Boolean);
  for (const line of said) assert.ok(wordCount(line) <= 12, line);
});

test('a malformed deadline draws the same safe tiles as a missing one and never throws (Home calls this during render)', () => {
  const missing = weekGames({ ...personal(SUNDAY_MORNING), deadline: null });
  assert.doesNotThrow(() => weekGames({ ...personal(SUNDAY_MORNING), deadline: 'not-a-date' }));
  assert.deepEqual(weekGames({ ...personal(SUNDAY_MORNING), deadline: 'not-a-date' }), missing);
});

test('the rank tile says "1 point" for one and "2 points" for two', () => {
  const tile = points => ({ rank: 1, tied: false, label: '1', points, scored: 1, of: 1 });
  assert.equal(rankTileView({ label: 'Spread rank', tile: tile(1) }).ariaLabel, 'Spread rank, 1st, 1 point');
  assert.equal(rankTileView({ label: 'Spread rank', tile: tile(2) }).ariaLabel, 'Spread rank, 1st, 2 points');
});

test('a game tile says the word its card says, in the picks card’s spoken form, in twelve words or fewer', () => {
  const stateWords = { locked: 'Locked in', draft: 'Draft', open: 'To pick', kicked: 'Closed at kickoff', skipped: 'Skipped', notopen: 'Not open' };
  const seen = new Set();
  for (const view of [weekGames(personal(SUNDAY_MORNING)), weekGames(personal(MONDAY_MORNING)), weekGames(personal('2026-11-01T12:00:00.000Z')),
    weekGames(personal(SUNDAY_MORNING, { scoring: { guess_spread: { satOut: true } } }))]) {
    for (const g of view.games) {
      seen.add(g.state);
      assert.equal(g.word, stateWords[g.state]);
      assert.ok(g.ariaLabel.endsWith(`Spread ${g.word.toLowerCase()}`), g.ariaLabel);
      assert.ok(wordCount(g.ariaLabel) <= 12, `${g.ariaLabel} is ${wordCount(g.ariaLabel)} words`);
    }
  }
  assert.ok(seen.has('kicked') && seen.has('skipped') && seen.has('notopen'));
});
