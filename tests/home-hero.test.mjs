import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HOME_COPY, HOME_STATES, homeHero, homeTiles } from '../shared/home-view.mjs';

// Redesign build plan stage 12: the pure Home view model (shared/home-view.mjs) at the four moments the plan names:
// M1 a fresh week, M2 a draft in progress, M5 both markets sent, M6 after the deadline; plus the not-open and no-week
// states. Every account, time and number below is a fixture (fictional players, no real picks).
const DEADLINE = '2026-10-16T00:15:00.000Z';
const OPENS_AT = '2026-10-12T07:00:00.000Z';
const HOUR = 3_600_000;
const SERVER_NOW = '2026-10-14T18:00:00.000Z';
const MEMBERS = [
  { id: 'u-luke', displayName: 'Luke', removed: false },
  { id: 'u-troy', displayName: 'Troy', removed: false },
  { id: 'u-sean', displayName: 'Sean', removed: false },
  { id: 'u-dana', displayName: 'Dana', removed: false },
  { id: 'u-finn', displayName: 'Finn', removed: false },
];
const dueRow = (mode, { filled = 0, games = 14, submitted = false, satOut = false } = {}) => ({ mode, submitted, satOut, filled, games });
const sent = (userId, mode) => ({ userId, mode, submittedAt: '2026-10-13T18:00:00Z', satOut: false, late: null });
const standing = (userId, mode, seasonPoints, seasonScored = 14) => ({ userId, mode, weekPoints: seasonPoints, weekScored: seasonScored, seasonPoints, seasonScored, weeksSubmitted: 1, satOut: false });

/** A normalized /community/read reply for the viewer (Luke) with the server's picksDue judgement. */
function community({ state = 'due', due = [dueRow('guess_spread'), dueRow('guess_total')], week = { season: 2026, week: 6, deadline: DEADLINE, games: 14 }, submissions = [], standings = [], serverNow = SERVER_NOW } = {}) {
  const open = due.filter(d => !d.submitted && !d.satOut);
  const picksDue = !week ? { state: 'none', modes: [] }
    : state === 'done' ? { state: 'done', modes: [] }
      : { state, opensAt: OPENS_AT, deadline: week.deadline, week: week.week, modes: open, now: serverNow };
  return { viewer: 'u-luke', admin: false, members: MEMBERS, week, optOuts: [], due, submissions, standings, posts: [], interests: [], interestCounts: {}, picksDue, pushConfigured: false };
}
const LINES = { kind: 'lines', label: 'See Lines', primary: false };
const PICKS = { kind: 'picks', label: 'Make picks', primary: true };

test('M1, a fresh week with nothing filled: due, a countdown to the deadline, "0 of 14 picked" for both markets, the lime picks action', () => {
  const hero = homeHero({ community: community(), now: Date.parse(SERVER_NOW) });
  assert.deepEqual(hero, {
    state: 'due', week: 6, deadline: DEADLINE, opensAt: OPENS_AT, countdownTarget: DEADLINE,
    statusLines: ['Spread 0 of 14 picked', 'Total 0 of 14 picked'],
    action: PICKS, now: Date.parse(SERVER_NOW),
  });
});

test('M2, a draft in progress: "Spread 5 of 14 picked" beside an untouched Total, still due', () => {
  const hero = homeHero({ community: community({ due: [dueRow('guess_spread', { filled: 5 }), dueRow('guess_total')] }) });
  assert.deepEqual(hero.statusLines, ['Spread 5 of 14 picked', 'Total 0 of 14 picked']);
  assert.deepEqual([hero.state, hero.countdownTarget, hero.action], ['due', DEADLINE, PICKS]);
  // A full draft is still a draft until it is sent.
  assert.deepEqual(homeHero({ community: community({ due: [dueRow('guess_spread', { filled: 14 }), dueRow('guess_total', { filled: 14 })] }) }).statusLines, ['Spread 14 of 14 picked', 'Total 14 of 14 picked']);
});

test('M5, both markets sent: done, no countdown, "sent" twice, the quiet Lines action', () => {
  const hero = homeHero({ community: community({ state: 'done', due: [dueRow('guess_spread', { filled: 14, submitted: true }), dueRow('guess_total', { filled: 14, submitted: true })] }), now: Date.parse(SERVER_NOW) });
  assert.deepEqual(hero, { state: 'done', week: 6, deadline: DEADLINE, opensAt: null, countdownTarget: null, statusLines: ['Spread sent', 'Total sent'], action: LINES, now: Date.parse(SERVER_NOW) });
  // One market sent and the other sat out is done too (D-23: a sat-out mode is never due).
  const mixed = homeHero({ community: community({ state: 'done', due: [dueRow('guess_spread', { filled: 14, submitted: true }), dueRow('guess_total', { satOut: true })] }) });
  assert.deepEqual([mixed.state, mixed.statusLines, mixed.action], ['done', ['Spread sent', 'Total sat out'], LINES]);
  // One sent, one still a draft: still due, with one line each way.
  const half = homeHero({ community: community({ due: [dueRow('guess_spread', { filled: 14, submitted: true }), dueRow('guess_total', { filled: 3 })] }) });
  assert.deepEqual([half.state, half.statusLines, half.action], ['due', ['Spread sent', 'Total 3 of 14 picked'], PICKS]);
});

test('M6, after the deadline: closed, no countdown, the Lines action and never the picks action', () => {
  const hero = homeHero({ community: community({ state: 'closed', due: [dueRow('guess_spread', { filled: 9 }), dueRow('guess_total')], serverNow: new Date(Date.parse(DEADLINE) + HOUR).toISOString() }) });
  assert.deepEqual([hero.state, hero.week, hero.deadline, hero.countdownTarget, hero.action], ['closed', 6, DEADLINE, null, LINES]);
  assert.deepEqual(hero.statusLines, ['Spread 9 of 14 picked', 'Total 0 of 14 picked'], 'a draft that missed the deadline is still shown to its owner (D-23)');
  assert.equal(hero.now, Date.parse(DEADLINE) + HOUR, 'the server clock the state was judged against');
});

test('not open yet: a countdown to Monday 12:00 AM PT, the Lines action', () => {
  const hero = homeHero({ community: community({ state: 'not_open', serverNow: '2026-10-11T20:00:00.000Z' }) });
  assert.deepEqual([hero.state, hero.countdownTarget, hero.opensAt, hero.deadline, hero.action], ['not_open', OPENS_AT, OPENS_AT, DEADLINE, LINES]);
  assert.deepEqual(hero.statusLines, ['Spread 0 of 14 picked', 'Total 0 of 14 picked']);
});

test('urgent inside two hours of the deadline keeps the countdown and the lime picks action', () => {
  const hero = homeHero({ community: community({ state: 'urgent', serverNow: new Date(Date.parse(DEADLINE) - HOUR).toISOString() }) });
  assert.deepEqual([hero.state, hero.countdownTarget, hero.action], ['urgent', DEADLINE, PICKS]);
});

test('no week: none, no week number, no lines, no countdown, the Lines action', () => {
  const hero = homeHero({ community: community({ week: null, due: [] }), now: Date.parse(SERVER_NOW) });
  assert.deepEqual(hero, { state: 'none', week: null, deadline: null, opensAt: null, countdownTarget: null, statusLines: [], action: LINES, now: Date.parse(SERVER_NOW) });
  // Nothing loaded at all reads the same, and a reply without picksDue is 'none' too.
  assert.deepEqual(homeHero({}), { state: 'none', week: null, deadline: null, opensAt: null, countdownTarget: null, statusLines: [], action: LINES, now: null });
  assert.deepEqual(homeHero({ community: null }).action, LINES);
  const without = { ...community() };
  delete without.picksDue;
  assert.deepEqual([homeHero({ community: without }).state, homeHero({ community: without }).action], ['none', LINES]);
});

test('exactly one action, always, and the lime one only while picks are due or urgent; an unknown state never offers picks', () => {
  for (const state of HOME_STATES) {
    const hero = homeHero({ community: community({ state }) });
    assert.ok(hero.action && ['picks', 'lines'].includes(hero.action.kind), state);
    assert.equal(hero.action.primary, hero.action.kind === 'picks', state);
    assert.equal(hero.action.kind === 'picks', state === 'due' || state === 'urgent', state);
    assert.equal(hero.countdownTarget !== null, ['due', 'urgent', 'not_open'].includes(state), state);
  }
  const odd = homeHero({ community: community({ state: 'late' }) });
  assert.deepEqual([odd.state, odd.action, odd.countdownTarget], ['closed', LINES, null], 'a state this file does not know reads as closed while a week exists');
  assert.equal(homeHero({ community: { ...community({ week: null, due: [] }), picksDue: { state: 'late', modes: [] } } }).state, 'none');
});

test('the clock is the server\'s picksDue.now when present, else the argument; a draft without a games count uses the week\'s', () => {
  assert.equal(homeHero({ community: community(), now: 1 }).now, Date.parse(SERVER_NOW));
  assert.equal(homeHero({ community: community({ state: 'done' }), now: 1 }).now, 1, 'done carries no server clock');
  assert.equal(homeHero({ community: community({ state: 'done' }) }).now, null);
  assert.deepEqual(homeHero({ community: community({ due: [{ mode: 'guess_spread', submitted: false, satOut: false, filled: 2, games: 0 }] }) }).statusLines, ['Spread 2 of 14 picked', 'Total 0 of 14 picked']);
});

test('HOME_COPY is frozen, uses the typographic apostrophe and builds each status line', () => {
  assert.ok(Object.isFrozen(HOME_COPY));
  assert.equal(HOME_COPY.title, 'Home');
  assert.equal(HOME_COPY.weekTitle(6), 'Week 6');
  assert.deepEqual([HOME_COPY.picksDueIn, HOME_COPY.notOpen, HOME_COPY.closed, HOME_COPY.done, HOME_COPY.noWeek],
    ['Picks lock in', 'Picks open Monday 12:00 AM PT', 'Picks are locked for this week', 'You’re in for this week', 'No week is open yet']);
  assert.deepEqual([HOME_COPY.makePicks, HOME_COPY.seeLines, HOME_COPY.whosIn, HOME_COPY.spreadRank, HOME_COPY.totalRank, HOME_COPY.noBallot],
    ['Make picks', 'See Lines', 'Who’s in', 'Spread rank', 'Total rank', 'No ballot yet']);
  assert.equal(HOME_COPY.statusDraft(5, 14, 'Spread'), 'Spread 5 of 14 picked');
  assert.equal(HOME_COPY.statusDraft(0, 14, 'guess_total'), 'Total 0 of 14 picked', 'a mode id reads as its label');
  assert.equal(HOME_COPY.statusSent('Spread'), 'Spread sent');
  assert.equal(HOME_COPY.statusSatOut('Total'), 'Total sat out');
  for (const value of Object.values(HOME_COPY)) if (typeof value === 'string') assert.doesNotMatch(value, /'/, 'straight apostrophes never show');
});

test('the tiles: who\'s in for the Spread ballot, the Spread and Total rank tiles apart, and the Spread chase line', () => {
  const standings = [
    standing('u-sean', 'guess_spread', 12), standing('u-luke', 'guess_spread', 10), standing('u-troy', 'guess_spread', 10), standing('u-dana', 'guess_spread', 8), standing('u-finn', 'guess_spread', null, 0),
    standing('u-troy', 'guess_total', 100), standing('u-luke', 'guess_total', 9.5),
  ];
  const submissions = [sent('u-sean', 'guess_spread'), sent('u-troy', 'guess_spread'), { userId: 'u-finn', mode: 'guess_spread', submittedAt: null, satOut: true, late: null }, sent('u-dana', 'guess_total')];
  const tiles = homeTiles({ community: community({ submissions, standings }) });
  assert.deepEqual([tiles.whosIn.in, tiles.whosIn.of, tiles.whosIn.label], [3, 5, '3 of 5 in']);
  assert.deepEqual(tiles.whosIn.people.map(p => `${p.name}${p.you ? '*' : ''}:${p.status}`), ['Luke*:out', 'Sean:in', 'Troy:in', 'Finn:satOut', 'Dana:out']);
  assert.deepEqual(tiles.spread, { rank: 2, tied: true, label: 'T-2', points: 10, scored: 14, of: 4 });
  assert.deepEqual(tiles.total, { rank: 2, tied: false, label: '2', points: 9.5, scored: 14, of: 2 });
  assert.equal(tiles.chase, '2 behind Sean');
  // Another viewer, by argument: Sean leads the Spread and has no Total ballot ("—", never 0).
  const sean = homeTiles({ community: community({ submissions, standings }), viewer: 'u-sean' });
  assert.deepEqual([sean.spread.label, sean.total.label, sean.total.rank, sean.chase, sean.whosIn.people[0].name], ['1', '—', null, 'You lead by 2', 'Sean']);
  // Nothing loaded: empty tiles, "—" and no chase.
  assert.deepEqual(homeTiles({}), { whosIn: { in: 0, of: 0, label: '0 of 0 in', people: [] }, spread: { rank: null, tied: false, label: '—', points: null, scored: 0, of: 0 }, total: { rank: null, tied: false, label: '—', points: null, scored: 0, of: 0 }, chase: null });
});

test('home-view imports only guess-board and both stay free of a clock, storage and network', () => {
  const home = fs.readFileSync(new URL('../shared/home-view.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...home.matchAll(/^import [^;]*? from '([^']+)';$/gms)].map(m => m[1]), ['./guess-board.mjs']);
  const board = fs.readFileSync(new URL('../shared/guess-board.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(board, /^\s*import\b/m);
  for (const src of [home, board]) assert.doesNotMatch(src, /\b(Date\.now|new Date\(|fetch\(|localStorage|sessionStorage|document\.|window\.|require\()/);
});

// The prototype's sample people and leagues (the list tests/next-sample-data.test.mjs keeps for web/src/next).
const SAMPLE_NAMES = ['Sunday Crew', 'Office Pool', 'sundayCrew', 'officePool', 'Marcus', 'Priya', 'Jules', 'Kenny', 'Dre', 'Tom'];
const NAME_PATTERN = new RegExp(`\\b(${SAMPLE_NAMES.map(n => n.replace(' ', '\\s+')).join('|')})\\b`, 'gi');

test('no prototype sample name leaks into the Home model or its tests', () => {
  for (const file of ['../shared/home-view.mjs', '../shared/guess-board.mjs', './home-hero.test.mjs', './guess-board.test.mjs']) {
    // A test file holds the list itself; that one line is the check, not a leak.
    const src = fs.readFileSync(new URL(file, import.meta.url), 'utf8').split('\n').filter(line => !line.includes('SAMPLE_NAMES = [')).join('\n');
    assert.deepEqual(src.match(NAME_PATTERN) ?? [], [], file);
  }
});
