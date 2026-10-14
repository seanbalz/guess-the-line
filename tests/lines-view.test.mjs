import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as L from '../shared/lines-view.mjs';
import { TODAYS_RULES } from '../web/src/next/rules.js';
import { assertNoLeak, leakScan, lineSecrets, pickSecrets } from './helpers/leak-scan.mjs';

// Redesign build plan stage 13: the pure view model of the read-only Lines tab and game sheet (shared/lines-view.mjs).
// The Week 6 slate and trends come from the committed trends file; every pick, line and account below is a fixture.
const week = JSON.parse(fs.readFileSync(new URL('../shared/trends/2026-week-06.json', import.meta.url), 'utf8'));
const records = JSON.parse(fs.readFileSync(new URL('../shared/team-records-2026.json', import.meta.url), 'utf8'));
const GAMES = week.games.map(g => ({ id: g.id, away: g.away, home: g.home, awayCode: g.away, homeCode: g.home, kickoff: g.kickoff }));
const KICKOFF = Object.fromEntries(GAMES.map(g => [g.id, Date.parse(g.kickoff)]));
const DEADLINE = week.games[0].kickoff;
const HOUR = 3_600_000;
const KICKOFF_RULES = Object.freeze({ sentFinal: true, lateWindow: 'deadline', revealAt: 'kickoff' });
const iso = ms => new Date(ms).toISOString();

/** A /personal reply for the viewer: the Week 6 slate, the server's now and rules, and the viewer's own ballots. */
function personal({ now = KICKOFF['SEA-DEN'] - 24 * HOUR, rules = TODAYS_RULES, spread = null, total = null } = {}) {
  return { season: 2026, week: 6, now: iso(now), deadline: DEADLINE, games: GAMES, rules, ballots: { ...(spread ? { guess_spread: spread } : {}), ...(total ? { guess_total: total } : {}) } };
}
const community = (extra = {}) => ({ week: { season: 2026, week: 6, deadline: DEADLINE, games: 14 }, optOuts: [], ...extra });
const ref = value => ({ basis: 'line_at_guess', status: 'available', value, source: 'The Odds API · 3-book median' });
const card = (board, id) => [...board.groups.flatMap(g => g.cards), ...(board.started?.cards ?? [])].find(c => c.id === id);

test('kickoff groups for the Week 6 slate: Thursday night, London, the 10 AM window, the afternoon, Sunday and Monday night', () => {
  const groups = L.kickoffGroups(L.gamesOf(personal()), { season: 2026, week: 6 });
  assert.deepEqual(groups.map(g => g.label), ['Thursday night', 'Sunday · London', 'Sunday 10:00 AM PT · 7 games', 'Sunday afternoon · 3 games', 'Sunday night', 'Monday night']);
  assert.deepEqual(groups.map(g => g.time), ['Thu 5:15 PM PT', 'Sun 6:30 AM PT', '', '', 'Sun 5:20 PM PT', 'Mon 5:15 PM PT']);
  assert.deepEqual(groups.map(g => g.games.map(x => x.id).join(' ')), ['SEA-DEN', 'HOU-JAX', 'BAL-CLE CAR-PHI CHI-ATL NO-NYG NYJ-NE PIT-TB TEN-IND', 'ARI-LAR BUF-LV LAC-KC', 'DAL-GB', 'WAS-SF']);
  // Daylight time ends Sun Nov 1, 2026: a 10:00 AM PT kickoff is 18:00 UTC that day, still the 10:00 AM PT window.
  const nov = L.kickoffGroups([{ id: 'NE-NYJ', away: 'NE', home: 'NYJ', kickoff: '2026-11-01T18:00:00.000Z' }, { id: 'KC-DEN', away: 'KC', home: 'DEN', kickoff: '2026-11-01T21:25:00.000Z' }]);
  assert.deepEqual(nov.map(g => g.label), ['Sunday 10:00 AM PT', 'Sunday afternoon']);
  assert.deepEqual(nov.map(g => g.time), ['', 'Sun 1:25 PM PT']);
});

test('your tags sit beside their market: a Spread pick on the favored team\'s row, a Total pick on the Total row; real minus, Pick\'em', () => {
  const board = L.linesBoard({ personal: personal({ spread: { picks: { 'SEA-DEN': 2.5, 'HOU-JAX': -3, 'NO-NYG': 0 } }, total: { picks: { 'SEA-DEN': 41 } } }), community: community() });
  assert.deepEqual(card(board, 'SEA-DEN').tags, { away: { k: 'You', text: '−2.5', aria: 'Your spread pick SEA −2.5' }, home: null, total: { k: 'You', text: '41', aria: 'Your total pick 41' } });
  assert.deepEqual(card(board, 'HOU-JAX').tags.home, { k: 'You', text: '−3', aria: 'Your spread pick JAX −3' });
  assert.equal(card(board, 'HOU-JAX').tags.away, null);
  assert.equal(card(board, 'NO-NYG').tags.away.text, "Pick'em");
  assert.deepEqual(card(board, 'BAL-CLE').tags, { away: null, home: null, total: null });
  for (const c of board.groups.flatMap(g => g.cards)) assert.doesNotMatch(JSON.stringify(c.tags), /-\d/, 'a real minus, never a hyphen');
  // A draft never locked in has closed at the deadline: it is no longer a pick, so no tag shows (D-23 keeps it for History).
  const later = L.linesBoard({ personal: personal({ now: KICKOFF['SEA-DEN'] + HOUR, spread: { picks: { 'SEA-DEN': 2.5 } } }), community: community() });
  assert.equal(card(later, 'SEA-DEN').tags.away, null);
});

test('a lock on every market closed to the viewer; his own line at the guess once open; never another market\'s line', () => {
  // Today's rules: a submitted Total opens every Total; the Spread draft keeps every Spread closed.
  const totals = { ...Object.fromEntries(GAMES.map(g => [g.id, 45])), 'SEA-DEN': 41, 'HOU-JAX': 44 };
  const p = personal({ spread: { picks: { 'SEA-DEN': 2.5 }, scoringReferences: { 'SEA-DEN': ref(-1.5) } },
    total: { picks: totals, submittedAt: '2026-10-14T18:00:00Z', scoringReferences: { 'SEA-DEN': ref(43.5), 'HOU-JAX': { basis: 'first_line_after_submission', status: 'pending' } } } });
  const board = L.linesBoard({ personal: p, community: community() });
  for (const c of board.groups.flatMap(g => g.cards)) {
    assert.equal(c.spread.open, false, `${c.id} Spread closed`);
    assert.equal(c.spread.lockLabel, 'Spread line hidden. Submit your Spread picks to see this line.');
    assert.equal(c.spread.line, undefined, 'a closed market carries no line at all');
    assert.equal(c.total.open, true, `${c.id} Total open`);
  }
  assert.equal(card(board, 'SEA-DEN').total.line, '43.5');
  assert.equal(card(board, 'HOU-JAX').total.line, null, 'a pending line at the guess is not a number');
  assert.equal(card(board, 'BAL-CLE').total.line, null, 'no saved line for this guess');
  assert.match(card(board, 'SEA-DEN').aria, /^Seahawks at Broncos, Thu 5:15 PM PT\. Spread line hidden\. Total 43\.5 at your guess\. Your spread pick SEA −2\.5\. Your total pick 41\./);
  // The forged reference under the closed Spread (−1.5) never reaches the view, anywhere.
  assertNoLeak(board, { viewer: 'viewer', secrets: lineSecrets({ 'SEA-DEN': -1.5 }, { market: 'spread' }) }, 'the board');
  // Under the D-39 rules a game's own lock-in opens only that game and market.
  const lockedIn = personal({ rules: KICKOFF_RULES, spread: { picks: { 'SEA-DEN': 2.5, 'HOU-JAX': 3 }, lockedAt: { 'SEA-DEN': '2026-10-14T18:00:00Z' }, scoringReferences: { 'SEA-DEN': ref(-1.5), 'HOU-JAX': ref(9.5) } } });
  const one = L.linesBoard({ personal: lockedIn, community: community() });
  assert.deepEqual([card(one, 'SEA-DEN').spread, card(one, 'HOU-JAX').spread.open, card(one, 'SEA-DEN').total.open], [{ open: true, line: 'DEN −1.5' }, false, false]);
  assertNoLeak(one, { viewer: 'viewer', secrets: lineSecrets({ 'HOU-JAX': 9.5 }, { market: 'spread' }) }, 'one game locked in');
  // A draft never locked in has no line at the guess, even once its market opens (here at the deadline).
  const opened = personal({ now: KICKOFF['SEA-DEN'] + HOUR, total: { picks: { 'SEA-DEN': 41 }, scoringReferences: { 'SEA-DEN': ref(43.5) } } });
  const late = L.linesBoard({ personal: opened, community: community() });
  assert.deepEqual(card(late, 'SEA-DEN').total, { open: true, line: null });
  assert.equal(L.youRows(opened, community(), L.gamesOf(opened)[0]).find(r => r.market === 'total').sub, '');
});

test('the gate follows the server\'s now and rules, never the device clock: deadline today, kickoff from M-01; a sit-out opens its market', () => {
  const after = KICKOFF['SEA-DEN'] + 30 * 60_000;
  // Today's rules (revealAt 'deadline'): the deadline, the first kickoff, opens every game for everyone.
  const today = L.linesBoard({ personal: personal({ now: after }), community: community() });
  assert.ok(today.started.cards.every(c => c.spread.open && c.total.open) && today.groups.flatMap(g => g.cards).every(c => c.spread.open && c.total.open));
  // M-01 (revealAt 'kickoff'): only the game that kicked off opens.
  const perGame = L.linesBoard({ personal: personal({ now: after, rules: KICKOFF_RULES }), community: community() });
  assert.deepEqual(perGame.started.cards.map(c => [c.id, c.spread.open, c.total.open]), [['SEA-DEN', true, true]]);
  assert.ok(perGame.groups.flatMap(g => g.cards).every(c => !c.spread.open && !c.total.open));
  assert.equal(perGame.started.label, 'Kicked off');
  // A missing or unreadable server time opens nothing by the clock.
  const noClock = L.linesBoard({ personal: { ...personal({ rules: KICKOFF_RULES }), now: null }, community: community() });
  assert.ok(noClock.groups.flatMap(g => g.cards).every(c => !c.spread.open && !c.total.open));
  // A sit-out (D-23; M-03's skip writes the same) opens that market for the week; one for another week opens nothing.
  const satOut = L.linesBoard({ personal: personal({ rules: KICKOFF_RULES }), community: community({ optOuts: ['guess_total'] }) });
  assert.ok(satOut.groups.flatMap(g => g.cards).every(c => !c.spread.open && c.total.open));
  const otherWeek = L.linesBoard({ personal: personal({ rules: KICKOFF_RULES }), community: { week: { season: 2026, week: 5 }, optOuts: ['guess_total'] } });
  assert.ok(otherWeek.groups.flatMap(g => g.cards).every(c => !c.total.open));
});

test('at most three trend lines on the board and one chip per card; the D-45 weather chip has one place to plug in', () => {
  const board = L.linesBoard({ personal: personal(), community: community(), trends: week });
  const chips = board.groups.flatMap(g => g.cards).filter(c => c.chip);
  assert.equal(board.trendLines, 3);
  assert.deepEqual(chips.map(c => [c.id, c.chip.text, c.chip.tier]), [
    ['HOU-JAX', 'Teams in the Texans’ spot covered 55% since 2002', 'Not proven'],
    ['NO-NYG', 'Teams in the Saints’ spot covered 54% since 2002', 'Not proven'],
    ['WAS-SF', 'Teams in the Commanders’ spot covered 54% since 2002', 'Not proven'],
  ]);
  assert.equal(L.boardWeatherChip(GAMES[0]), null, 'D-34: until D-45 merges the board carries no weather');
  assert.deepEqual(L.cardChip({ trend: { text: 'A', tier: 'Not proven' }, weather: { text: 'Windy' } }), { kind: 'trend', text: 'A', tier: 'Not proven' });
  assert.deepEqual(L.cardChip({ weather: { text: 'Windy' } }), { kind: 'weather', text: 'Windy' });
  assert.equal(L.cardChip({}), null);
  // A game that kicked off gives its board trend to the next game in line.
  const later = L.linesBoard({ personal: personal({ now: KICKOFF['HOU-JAX'] + HOUR }), community: community(), trends: week });
  assert.deepEqual(later.groups.flatMap(g => g.cards).filter(c => c.chip).map(c => c.id), ['CAR-PHI', 'NO-NYG', 'WAS-SF']);
  assert.ok(later.started.cards.every(c => c.chip === null));
  // Another week's trends file is never used.
  assert.equal(L.linesBoard({ personal: personal(), community: community(), trends: { ...week, week: 7 } }).trendLines, 0);
});

test('You on this game: open, draft (with its lock), sent with the line at the guess, sat out, and closed with the draft kept for its owner', () => {
  const game = L.gamesOf(personal()).find(g => g.id === 'SEA-DEN');
  const rows = p => Object.fromEntries(L.youRows(p, community(), game).map(r => [r.market, r]));
  let r = rows(personal({ spread: { picks: { 'SEA-DEN': 2.5 } } }));
  assert.deepEqual([r.spread.main, r.spread.sub, r.spread.locked], ['Draft SEA −2.5', 'Submit your Spread picks to see this line.', true]);
  assert.deepEqual([r.total.main, r.total.sub], ['No pick yet', 'Due Thu 5:15 PM PT']);
  r = rows(personal({ total: { picks: { 'SEA-DEN': 41 }, submittedAt: '2026-10-14T18:00:00Z', scoringReferences: { 'SEA-DEN': ref(43.5) } } }));
  assert.deepEqual([r.total.main, r.total.sub], ['Submitted 41', 'Line at your guess 43.5']);
  r = rows(personal({ rules: KICKOFF_RULES, spread: { picks: { 'SEA-DEN': -1 }, lockedAt: { 'SEA-DEN': '2026-10-14T18:00:00Z' }, late: { deadline: DEADLINE, minutes: 12 }, scoringReferences: { 'SEA-DEN': { status: 'pending' } } } }));
  assert.deepEqual([r.spread.main, r.spread.sub, r.spread.late], ['Locked in DEN −1', 'Line at your guess: pending (the first line after you sent it)', 'Late · 12 min']);
  const sat = Object.fromEntries(L.youRows(personal(), community({ optOuts: ['guess_spread'] }), game).map(x => [x.market, x]));
  assert.equal(sat.spread.main, 'Sat out');
  const skipped = Object.fromEntries(L.youRows(personal(), community({ forfeit: { season: 2026, week: 6, forfeit: { reason: 'skip', modes: ['guess_total'], createdAt: '2026-10-14T18:00:00Z' } } }), game).map(x => [x.market, x]));
  assert.equal(skipped.total.main, 'Skipped');
  r = rows(personal({ now: KICKOFF['SEA-DEN'] + HOUR, spread: { picks: { 'SEA-DEN': 2.5 } } }));
  // SEA @ DEN kicks off at the deadline, so it closed at kickoff.
  assert.equal(r.spread.main, 'Closed at kickoff · draft SEA −2.5 not submitted');
  assert.equal(r.total.main, 'Closed at kickoff · No pick');
});

test('team records in words with the file\'s date (DP-16); another season shows none', () => {
  const game = L.gamesOf(personal()).find(g => g.id === 'SEA-DEN');
  const words = L.recordsInWords(records, 2026, game);
  const r = code => records.teams[code].overall;
  assert.equal(words.text, `Seahawks ${r('SEA').w}–${r('SEA').l} · Broncos ${r('DEN').w}–${r('DEN').l}`);
  assert.equal(words.asOf, 'Records as of Thu Oct 8');
  assert.equal(L.recordsInWords(records, 2025, game), null);
  assert.equal(L.recordsInWords({ ...records, teams: { ...records.teams, SEA: { overall: { w: 3, l: 1, t: 1 } } } }, 2026, game).text.split(' · ')[0], 'Seahawks 3–1–1');
  assert.equal(L.recordsInWords(null, 2026, game), null);
  assert.equal(L.whenLine(game, { season: 2026, week: 6, trendsGame: week.games[0] }), 'Thu Oct 15 · 5:15 PM PT · TNF · Denver');
  assert.equal(L.whenLine(L.gamesOf(personal()).find(g => g.id === 'HOU-JAX'), { season: 2026, week: 6, trendsGame: week.games[1] }), 'Sun Oct 18 · 6:30 AM PT · London · Division game');
});

const venue = { name: 'Empower Field at Mile High', city: 'Denver', country: 'USA', type: 'outdoor' };
const wind = (fetchedAt, values = {}) => ({ windMph: 14.2, gustMph: 27.5, directionDeg: 247, temperatureF: 49.3, precipitationProbability: 25, forecastHour: '2026-10-16T00:00:00.000Z', fetchedAt: iso(fetchedAt), ...values });

test('the weather row: hidden for a dome, while loading and with no forecast; closed with no digits; open with values, PT times and the credit', () => {
  const sea = L.gamesOf(personal()).find(g => g.id === 'SEA-DEN'), now = KICKOFF['SEA-DEN'] - 20 * HOUR;
  const row = entry => L.weatherRow({ game: sea, trendsGame: week.games[0], entry, now, season: 2026, week: 6, windCard: week.cards['total|g:g_wind10'] });
  const forecast = row({ kickoff: sea.kickoff, venue, status: 'forecast', wind: wind(now - HOUR) });
  assert.equal(forecast.summary, 'Kickoff forecast');
  assert.doesNotMatch(`${forecast.title} ${forecast.summary}`, /\d/, 'a closed row carries no digits');
  assert.deepEqual(forecast.detail.values.map(v => v.value), ['14.2 mph from the WSW', 'up to 27.5 mph in the kickoff hour', '49.3 °F', '25%']);
  assert.match(forecast.detail.time, /^Forecast for the 5 PM PT hour \(kickoff 5:15 PM PT\) · updated 1 h ago · made 21 h before kickoff · /);
  assert.doesNotMatch(JSON.stringify(forecast.detail), /\bET\b/);
  assert.ok(forecast.detail.lines.some(line => line.includes('has not been backtested') && line.includes('282–196–5')));
  assert.deepEqual(forecast.detail.credit, { text: 'Weather data by Open-Meteo.com', url: 'https://open-meteo.com/', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', changes: 'Kickoff-hour values selected by GTL; wind direction shown as compass points' });
  const final = L.weatherRow({ game: sea, trendsGame: week.games[0], entry: { kickoff: sea.kickoff, venue, status: 'forecast', wind: wind(KICKOFF['SEA-DEN'] - 30 * 60_000) }, now: KICKOFF['SEA-DEN'] + HOUR, season: 2026, week: 6 });
  assert.equal(final.summary, 'Final pre-kickoff forecast');
  const notYet = L.weatherRow({ game: sea, trendsGame: week.games[0], entry: { kickoff: sea.kickoff, venue, status: 'none', wind: null }, now: KICKOFF['SEA-DEN'] - 6 * 24 * HOUR, season: 2026, week: 6 });
  assert.equal(notYet.summary, 'Forecast appears closer to kickoff');
  for (const r of [forecast, final, notYet]) assert.doesNotMatch(`${r.title} ${r.summary}`, /\d/);
  // Hidden: no entry (a 404 or not deployed), loading, a stale snapshot, and a dome (no request, numbers or credit).
  assert.equal(row(null), null);
  assert.equal(L.weatherRow({ game: sea, trendsGame: week.games[0], entry: null, now, loading: true, season: 2026, week: 6 }), null);
  assert.equal(row({ kickoff: sea.kickoff, venue, status: 'forecast', wind: wind(now - 10 * HOUR) }), null);
  const lv = L.gamesOf(personal()).find(g => g.id === 'BUF-LV');
  assert.equal(L.weatherRow({ game: lv, trendsGame: week.games.find(g => g.id === 'BUF-LV'), entry: null, now, season: 2026, week: 6 }), null);
  assert.equal(L.weatherRow({ game: lv, entry: { kickoff: lv.kickoff, venue: { ...venue, type: 'dome' }, status: 'indoor', wind: null }, now, season: 2026, week: 6 }), null);
});

test('the game sheet: header, the top three trends strongest first with records and sample sizes, a locked line trend with no number', () => {
  const sheet = L.gameSheet({ personal: personal(), community: community(), trends: week, records, gameId: 'NO-NYG' });
  assert.equal(sheet.title, 'NO @ NYG');
  assert.deepEqual(sheet.trends.top.map(c => [c.title, c.record, c.sample, c.tierLabel]), [
    ['Covering almost every week this season · NYG', '442–377–19', '838 games', 'Consistent, not proven'],
    ['Totals reversion', '830–724–17', '1,571 games', 'Watch list, no proven edge'],
    ['Home team after an overtime game · NYG', '186–142–13', '341 games', 'Watch list, no proven edge'],
  ]);
  const sea = L.gameSheet({ personal: personal(), community: community(), trends: week, records, gameId: 'SEA-DEN' });
  assert.deepEqual(sea.trends.top.map(c => [c.locked, c.gate, c.title]), [[true, 'spread', 'Line-based trend']]);
  for (const key of ['record', 'sample', 'pct', 'sentence', 'games', 'id']) assert.ok(!sea.trends.top[0][key], `a locked trend carries no ${key}`);
  assert.equal(L.lockedTrendText('spread', TODAYS_RULES), 'Submit your Spread picks to see this trend.');
  assert.equal(L.lockedTrendText('spread', KICKOFF_RULES), 'Lock in your Spread pick to see this trend.');
  assert.equal(L.lockedTrendText('both', TODAYS_RULES), 'Submit your Spread and Total picks to see this trend.');
  assert.equal(L.lockedRecordsText('total', TODAYS_RULES), 'Submit your Total picks to see its Total line-based records.');
  // With the Spread open, the same trend shows in plain words with its record and sample size.
  const open = L.gameSheet({ personal: personal({ now: KICKOFF['SEA-DEN'] + 60_000 }), community: community(), trends: week, records, gameId: 'SEA-DEN' });
  assert.deepEqual(open.trends.top.map(c => [c.title, c.sentence, c.record, c.sample, c.pct]),
    [['Underdogs at altitude', 'Underdogs in this spot covered 117 times and missed 89 since 2002.', '117–89–7', '213 games', 57]]);
  // No trends file for the week: the sheet says when it publishes; no game in the file: nothing to show.
  assert.equal(L.gameSheet({ personal: personal(), community: community(), trends: null, trendsStatus: 'missing', gameId: 'SEA-DEN' }).trends.missing, 'Trends for Week 6 publish after Monday night’s final.');
  assert.equal(L.gameSheet({ personal: personal(), community: community(), trends: week, gameId: 'XX-YY' }), null);
});

test('the leak rule: nothing on the board or in the sheets carries another player\'s pick or a closed market\'s line', () => {
  // The viewer's own sent Total and Spread draft; a reply that also carries other players' picks and a forged line.
  const others = { 'SEA-DEN': 13.5, 'HOU-JAX': -17.5 };
  const p = personal({ spread: { picks: { 'SEA-DEN': 4 }, scoringReferences: { 'SEA-DEN': ref(-6.5), 'HOU-JAX': ref(7.5) } },
    total: { picks: { 'SEA-DEN': 41 }, submittedAt: '2026-10-14T18:00:00Z', scoringReferences: { 'SEA-DEN': ref(43.5) } } });
  const c = community({ posts: [{ actorId: 'other', kind: 'ballot_submitted', mode: 'guess_spread', picks: others }, { actorId: 'other', kind: 'ballot_submitted', mode: 'guess_total', picks: { 'SEA-DEN': 61.5 } }] });
  const secrets = [...pickSecrets(others, { market: 'spread', owner: 'other' }), ...pickSecrets({ 'SEA-DEN': 61.5 }, { market: 'total', owner: 'other' }),
    ...lineSecrets({ 'SEA-DEN': -6.5, 'HOU-JAX': 7.5 }, { market: 'spread' })];
  const views = { board: L.linesBoard({ personal: p, community: c, trends: week }) };
  for (const g of GAMES) views[g.id] = L.gameSheet({ personal: p, community: c, trends: week, records, gameId: g.id });
  for (const [where, view] of Object.entries(views)) assertNoLeak(view, { viewer: 'viewer', secrets }, where);
  // The scan finds them when they are there (the check is live).
  assert.ok(leakScan({ text: 'DEN −6.5' }, { viewer: 'viewer', secrets }).length > 0);
});

test('lines-view stays pure: no React, DOM, storage, network or clock of its own', () => {
  const src = fs.readFileSync(new URL('../shared/lines-view.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...src.matchAll(/^import [^;]*? from '([^']+)';$/gms)].map(m => m[1]),
    ['./nfl-schedule.mjs', './wind-venues.mjs', './trends-view.mjs', '../web/src/next/format.js', '../web/src/next/copy.js', '../web/src/next/rules.js']);
  assert.doesNotMatch(src, /\b(Date\.now|new Date\(\)|fetch\(|localStorage|sessionStorage|document\.|window\.)/);
});
