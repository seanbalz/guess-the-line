import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as B from '../shared/guess-board.mjs';

// Redesign build plan stage 12: the pure board model (shared/guess-board.mjs): who's in, ranks with T-2 ties, the
// chase line and the League board. Every account and every number below is a fixture (fictional players, no real picks).
const MEMBERS = [
  { id: 'u-luke', displayName: 'Luke', removed: false },
  { id: 'u-troy', displayName: 'Troy', removed: false },
  { id: 'u-sean', displayName: 'Sean', removed: false },
  { id: 'u-dana', displayName: 'Dana', removed: false },
  { id: 'u-finn', displayName: 'Finn', removed: false },
];
const NAMES = Object.fromEntries(MEMBERS.map(m => [m.id, m.displayName]));
const row = (userId, mode, seasonPoints, seasonScored = 14, extra = {}) => ({ userId, mode, weekPoints: seasonPoints, weekScored: seasonScored, seasonPoints, seasonScored, weeksSubmitted: 1, satOut: false, ...extra });
const SPREAD = 'guess_spread', TOTAL = 'guess_total';

// Sean 12, Luke and Troy 10 each, Dana 8; Finn has no ballot (null points, nothing scored: DP-1).
const STANDINGS = [
  row('u-sean', SPREAD, 12), row('u-luke', SPREAD, 10), row('u-troy', SPREAD, 10), row('u-dana', SPREAD, 8), row('u-finn', SPREAD, null, 0),
  // Total points are a separate game: Troy leads it by a mile, Sean has sent nothing in it.
  row('u-troy', TOTAL, 100), row('u-luke', TOTAL, 9.5), row('u-dana', TOTAL, 9.5), row('u-sean', TOTAL, null, 0),
];

test('MODES and MODE_LABEL name the two Guess modes', () => {
  assert.deepEqual([...B.MODES], ['guess_spread', 'guess_total']);
  assert.deepEqual({ ...B.MODE_LABEL }, { guess_spread: 'Spread', guess_total: 'Total' });
});

test('ranks share a tie as T-2 and skip to 4 (competition ranking); the board and the tile agree', () => {
  const board = B.boardFor({ standings: STANDINGS, members: MEMBERS, viewer: 'u-luke', mode: SPREAD });
  assert.deepEqual(board.map(r => [r.name, r.rank, r.tied, r.points, r.you]), [['Sean', 1, false, 12, false], ['Luke', 2, true, 10, true], ['Troy', 2, true, 10, false], ['Dana', 4, false, 8, false]]);
  assert.ok(board.every(r => r.scored === 14 && typeof r.id === 'string'));
  for (const [viewer, expected] of [['u-sean', { rank: 1, tied: false, label: '1' }], ['u-luke', { rank: 2, tied: true, label: 'T-2' }], ['u-troy', { rank: 2, tied: true, label: 'T-2' }], ['u-dana', { rank: 4, tied: false, label: '4' }]]) {
    const tile = B.rankTile({ standings: STANDINGS, viewer, mode: SPREAD });
    assert.deepEqual({ rank: tile.rank, tied: tile.tied, label: tile.label }, expected, viewer);
    assert.equal(tile.of, 4, 'four players are ranked');
    assert.equal(tile.rank, board.find(r => r.id === viewer).rank, 'the tile and the board never disagree');
  }
  assert.deepEqual(B.rankTile({ standings: STANDINGS, viewer: 'u-luke', mode: SPREAD }), { rank: 2, tied: true, label: 'T-2', points: 10, scored: 14, of: 4 });
});

test('no ballot reads "—" with a null rank, never 0: a null-points row, a row with nothing scored, and no row at all', () => {
  const none = { rank: null, tied: false, label: '—', points: null, scored: 0, of: 4 };
  assert.deepEqual(B.rankTile({ standings: STANDINGS, viewer: 'u-finn', mode: SPREAD }), none, 'null season points');
  assert.deepEqual(B.rankTile({ standings: STANDINGS, viewer: 'u-nobody', mode: SPREAD }), none, 'no standings row');
  const unscored = [...STANDINGS, row('u-nobody', SPREAD, 0, 0)];
  assert.deepEqual(B.rankTile({ standings: unscored, viewer: 'u-nobody', mode: SPREAD }), { ...none, points: 0 }, 'a row with nothing scored is unranked');
  for (const standings of [STANDINGS, unscored, []]) for (const viewer of ['u-finn', 'u-nobody', null]) {
    const tile = B.rankTile({ standings, viewer, mode: SPREAD });
    assert.notEqual(tile.rank, 0);
    assert.notEqual(tile.label, '0');
    assert.ok(tile.rank === null || tile.rank > 0);
  }
  assert.deepEqual(B.rankTile({ standings: [], viewer: 'u-sean', mode: SPREAD }), { ...none, of: 0 });
  assert.ok(B.boardFor({ standings: STANDINGS, members: MEMBERS, mode: SPREAD }).every(r => r.rank > 0 && r.id !== 'u-finn'), 'unranked rows stay off the board');
});

test('Spread and Total are never combined: a row\'s Total points never move its Spread rank', () => {
  // Troy's 100 Total points leave him T-2 in Spread; Sean leads Spread with no Total ballot at all.
  assert.equal(B.rankTile({ standings: STANDINGS, viewer: 'u-troy', mode: SPREAD }).label, 'T-2');
  assert.equal(B.rankTile({ standings: STANDINGS, viewer: 'u-troy', mode: TOTAL }).label, '1');
  assert.deepEqual(B.rankTile({ standings: STANDINGS, viewer: 'u-sean', mode: SPREAD }), { rank: 1, tied: false, label: '1', points: 12, scored: 14, of: 4 });
  assert.deepEqual(B.rankTile({ standings: STANDINGS, viewer: 'u-sean', mode: TOTAL }), { rank: null, tied: false, label: '—', points: null, scored: 0, of: 3 });
  // Adding Total points to a player changes nothing on the Spread board.
  const more = [...STANDINGS, row('u-dana', TOTAL, 500, 20)];
  assert.deepEqual(B.boardFor({ standings: more, members: MEMBERS, mode: SPREAD }), B.boardFor({ standings: STANDINGS, members: MEMBERS, mode: SPREAD }));
  assert.deepEqual(B.boardFor({ standings: STANDINGS, members: MEMBERS, mode: TOTAL }).map(r => [r.name, r.rank, r.tied, r.points]), [['Troy', 1, false, 100], ['Dana', 2, true, 9.5], ['Luke', 2, true, 9.5]]);
  // No board row ever carries a sum of the two.
  for (const mode of B.MODES) for (const r of B.boardFor({ standings: STANDINGS, members: MEMBERS, mode })) assert.ok([12, 10, 8, 100, 9.5].includes(r.points), `${r.name} ${mode} ${r.points}`);
});

test('who\'s in counts sent ballots and sit-outs as in, leaves removed members out, and reads "n of m in"', () => {
  const submissions = [
    { userId: 'u-sean', mode: SPREAD, submittedAt: '2026-10-13T18:00:00Z', satOut: false, late: null },
    { userId: 'u-troy', mode: SPREAD, submittedAt: null, satOut: true, late: null },
    { userId: 'u-dana', mode: TOTAL, submittedAt: '2026-10-13T19:00:00Z', satOut: false, late: null },
    { userId: 'u-gone', mode: SPREAD, submittedAt: '2026-10-13T20:00:00Z', satOut: false, late: null },
  ];
  const members = [...MEMBERS, { id: 'u-gone', displayName: 'Gone', removed: true }];
  const spread = B.whosIn({ members, submissions, viewer: 'u-luke', mode: SPREAD });
  assert.deepEqual([spread.in, spread.of, spread.label], [2, 5, '2 of 5 in']);
  assert.deepEqual(Object.fromEntries(spread.people.map(p => [p.name, p.status])), { Luke: 'out', Sean: 'in', Troy: 'satOut', Dana: 'out', Finn: 'out' });
  assert.ok(!spread.people.some(p => p.id === 'u-gone'), 'a removed member is neither counted nor listed');
  // A Total submission is not a Spread one.
  const total = B.whosIn({ members, submissions, viewer: 'u-luke', mode: TOTAL });
  assert.deepEqual([total.in, total.of, total.label, total.people.find(p => p.name === 'Dana').status, total.people.find(p => p.name === 'Sean').status], [1, 5, '1 of 5 in', 'in', 'out']);
  assert.deepEqual(B.whosIn({ members: [], submissions: [], viewer: 'u-luke', mode: SPREAD }), { in: 0, of: 0, label: '0 of 0 in', people: [] });
  assert.deepEqual(B.whosIn({ mode: SPREAD }), { in: 0, of: 0, label: '0 of 0 in', people: [] });
});

test('who\'s in lists the viewer first, then the players in, the sit-outs and the players out, each by name', () => {
  const submissions = [
    { userId: 'u-troy', mode: SPREAD, submittedAt: '2026-10-13T18:00:00Z', satOut: false, late: null },
    { userId: 'u-dana', mode: SPREAD, submittedAt: '2026-10-13T18:30:00Z', satOut: false, late: null },
    { userId: 'u-finn', mode: SPREAD, submittedAt: null, satOut: true, late: null },
  ];
  const asLuke = B.whosIn({ members: MEMBERS, submissions, viewer: 'u-luke', mode: SPREAD });
  assert.deepEqual(asLuke.people.map(p => `${p.name}${p.you ? '*' : ''}:${p.status}`), ['Luke*:out', 'Dana:in', 'Troy:in', 'Finn:satOut', 'Sean:out']);
  // The viewer comes first whatever their status.
  const asTroy = B.whosIn({ members: MEMBERS, submissions, viewer: 'u-troy', mode: SPREAD });
  assert.deepEqual(asTroy.people.map(p => p.name), ['Troy', 'Dana', 'Finn', 'Luke', 'Sean']);
  assert.deepEqual(asTroy.people.map(p => p.you), [true, false, false, false, false]);
  assert.deepEqual([asTroy.in, asTroy.label], [3, '3 of 5 in']);
  // A viewer who is not a member marks nobody as "you".
  assert.ok(B.whosIn({ members: MEMBERS, submissions, viewer: 'u-nobody', mode: SPREAD }).people.every(p => !p.you));
});

test('the chase line: lead by an integer or one decimal, lead alone, tied for the lead, behind the leader, unranked', () => {
  const chase = (standings, viewer, names = NAMES) => B.chaseLine({ standings, viewer, mode: SPREAD, names });
  assert.equal(chase(STANDINGS, 'u-sean'), 'You lead by 2', 'an integer gap, never "2.0"');
  assert.equal(chase(STANDINGS, 'u-luke'), '2 behind Sean', 'a tied second place chases the leader');
  assert.equal(chase(STANDINGS, 'u-dana'), '4 behind Sean');
  assert.equal(chase(STANDINGS, 'u-finn'), null, 'no ballot: nothing to chase from "—"');
  assert.equal(chase(STANDINGS, 'u-nobody'), null);
  assert.equal(chase([row('u-sean', SPREAD, 11.5), row('u-luke', SPREAD, 10)], 'u-sean'), 'You lead by 1.5');
  assert.equal(chase([row('u-sean', SPREAD, 11.5), row('u-luke', SPREAD, 10)], 'u-luke'), '1.5 behind Sean');
  assert.equal(chase([row('u-sean', SPREAD, 10.3), row('u-luke', SPREAD, 8.8)], 'u-luke'), '1.5 behind Sean', 'one decimal, no floating-point tail');
  assert.equal(chase([row('u-sean', SPREAD, 7)], 'u-sean'), 'You lead', 'nobody in second place');
  assert.equal(chase([row('u-sean', SPREAD, 10), row('u-troy', SPREAD, 10), row('u-luke', SPREAD, 4)], 'u-sean'), 'Tied for the lead');
  assert.equal(chase([row('u-sean', SPREAD, 10), row('u-troy', SPREAD, 10), row('u-luke', SPREAD, 4)], 'u-luke'), '6 behind Sean', 'the first of the tied leaders by name');
  assert.equal(chase(STANDINGS, 'u-dana', {}), '4 behind the leader', 'an unknown id reads "the leader"');
  assert.equal(B.chaseLine({ standings: STANDINGS, viewer: 'u-dana', mode: SPREAD }), '4 behind the leader', 'no names map at all');
  // The Total chase is its own race.
  assert.equal(B.chaseLine({ standings: STANDINGS, viewer: 'u-troy', mode: TOTAL, names: NAMES }), 'You lead by 90.5');
  assert.equal(B.chaseLine({ standings: STANDINGS, viewer: 'u-luke', mode: TOTAL, names: NAMES }), '90.5 behind Troy');
  for (const viewer of MEMBERS.map(m => m.id)) for (const mode of B.MODES) assert.doesNotMatch(B.chaseLine({ standings: STANDINGS, viewer, mode, names: NAMES }) ?? '', /-\d|\.0\b/, 'no hyphen-minus, no ".0"');
});

test('the board names a row from members and keeps an unknown member by id; ties hold a stable order by name', () => {
  const standings = [row('u-zed', SPREAD, 10), row('u-troy', SPREAD, 10), row('u-luke', SPREAD, 10)];
  const board = B.boardFor({ standings, members: MEMBERS, viewer: 'u-troy', mode: SPREAD });
  assert.deepEqual(board.map(r => [r.id, r.name, r.rank, r.tied, r.you]), [['u-luke', 'Luke', 1, true, false], ['u-troy', 'Troy', 1, true, true], ['u-zed', 'u-zed', 1, true, false]]);
  assert.deepEqual(B.boardFor({ mode: SPREAD }), []);
});

test('guess-board stays pure: no imports, no clock, no storage, no network', () => {
  const src = fs.readFileSync(new URL('../shared/guess-board.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^\s*import\b/m, 'import-free');
  assert.doesNotMatch(src, /\b(Date\.now|new Date\(|fetch\(|localStorage|sessionStorage|document\.|window\.|require\()/);
  // The code never adds points to points: ranks come from one mode's rows at a time (the behavioral check is above).
  assert.doesNotMatch(src, /(?:seasonPoints|\.points)\s*\+|\+\s*[\w.]*(?:seasonPoints|\.points)/, 'never a Spread + Total sum');
});

// The prototype's sample people and leagues (the list tests/next-sample-data.test.mjs keeps for web/src/next).
const SAMPLE_NAMES = ['Sunday Crew', 'Office Pool', 'sundayCrew', 'officePool', 'Marcus', 'Priya', 'Jules', 'Kenny', 'Dre', 'Tom'];
const NAME_PATTERN = new RegExp(`\\b(${SAMPLE_NAMES.map(n => n.replace(' ', '\\s+')).join('|')})\\b`, 'gi');

test('no prototype sample name leaks into the board model or its test', () => {
  for (const file of ['../shared/guess-board.mjs', './guess-board.test.mjs']) {
    // A test file holds the list itself; that one line is the check, not a leak.
    const src = fs.readFileSync(new URL(file, import.meta.url), 'utf8').split('\n').filter(line => !line.includes('SAMPLE_NAMES = [')).join('\n');
    assert.deepEqual(src.match(NAME_PATTERN) ?? [], [], file);
  }
});
