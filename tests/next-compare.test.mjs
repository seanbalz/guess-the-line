// D-69 step 1 Compare (Sean's P3B): the pure rules in web/src/next/play/compare.js. Each test names the contract it guards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EVERYONE, chooseOpponent, compareRows, compareTile, defaultOpponent, fieldRows, firstName, headToHead, leadLine, opponents, rowLine, rowTag, statLine } from '../web/src/next/play/compare.js';

const SEA = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-25T20:05:00Z' };
const BUF = { id: 'BUF-KC', awayCode: 'BUF', homeCode: 'KC', kickoff: '2026-10-26T00:20:00Z' };
const ME = 'me', TROY = 'troy', LUKE = 'luke', BEN = 'ben';
const ref = value => ({ value, source: 'Fixture median', observedAt: '2026-10-20T17:00:00Z' });
const locked = (gameId, guess, line, points) => ({ gameId, guess, points, reference: ref(line), lockedIn: true, lockedAt: '2026-10-20T18:00:00Z', hidden: false });
const entry = (userId, picks, extra = {}) => ({ userId, mode: 'guess_spread', status: 'draft', eligible: true, picks, hiddenGames: [], ...extra });
const OPEN = { [SEA.id]: { spread: true, total: false }, [BUF.id]: { spread: true, total: false } };
const CLOSED = { [SEA.id]: { spread: false, total: false }, [BUF.id]: { spread: false, total: false } };
const week = (n, entries, gate = OPEN) => ({ season: 2026, week: n, games: [SEA, BUF], gate, revealed: { guess_spread: false, guess_total: false }, entries });
const members = [{ id: BEN, displayName: 'Ben Former', removed: true }, { id: LUKE, displayName: 'Luke Jun' }, { id: ME, displayName: 'Sean B' }, { id: TROY, displayName: 'Troy Jun' }];
const history = (weeks, now = '2026-10-24T12:00:00Z') => ({ viewer: ME, season: 2026, seasons: [2026], now, members, weeks });
// Week 8, both games scored for both. You: SEA exact (10), BUF off 0.5 (9). Troy: SEA off 0.5 (9), BUF off 1 (8).
const week8 = week(8, [entry(ME, [locked(SEA.id, -3, -3, 10), locked(BUF.id, 2, 2.5, 9)]), entry(TROY, [locked(SEA.id, -2.5, -3, 9), locked(BUF.id, 3.5, 2.5, 8)])]);
const rows = (data, options = {}) => compareRows(data, { mode: 'guess_spread', opponent: TROY, ...options });

test('D-31: a game the reply does not open to you is HIDDEN and its row carries no value of either player, whatever the reply holds', () => {
  // A provider fault: Troy's SEA guess arrives with values although your gate is shut; BUF is open but marked hidden.
  const w = week(9, [entry(ME, [{ gameId: SEA.id, guess: -3, lockedIn: false }]), entry(TROY, [locked(SEA.id, -17.5, -16.5, 7), { ...locked(BUF.id, 17.5, 16.5, 7), hidden: true }])],
    { [SEA.id]: { spread: false, total: false }, [BUF.id]: { spread: true, total: false } });
  const out = rows(history([w]));
  assert.deepEqual(out.map(r => [r.game.id, r.state, r.me, r.them]), [[SEA.id, 'hidden', null, null], [BUF.id, 'hidden', null, null]]);
  assert.doesNotMatch(JSON.stringify(out), /17\.5|16\.5/);
  assert.equal(rowLine(out[0], 'guess_spread', 'Troy'), 'Lock yours to see Troy’s guess');
  assert.deepEqual(rowTag(out[0], 'Troy'), { text: 'HIDDEN', tone: 'neutral' });
  assert.equal(headToHead(out).shared, 0);
  assert.ok(rows(history([week8]), { mode: 'guess_total' }).every(r => r.state === 'hidden'), 'each market is its own gate');
});

test('a game the other player has not locked is WAITING before its kickoff and NO GUESS from it; a sit-out is NO GUESS', () => {
  // A shown game Troy has not locked arrives with no number (cloud/community.mjs historyPicks).
  const w = week(9, [entry(ME, [locked(SEA.id, -3, -3.5, 9), locked(BUF.id, 2, 2.5, 9)]), entry(TROY, [{ gameId: SEA.id, guess: null, reference: null, points: null, hidden: false }])]);
  const before = rows(history([w], '2026-10-25T12:00:00Z'));
  assert.deepEqual(before.map(r => r.state), ['waiting', 'waiting']);
  assert.equal(rowLine(before[0], 'guess_spread', 'Troy'), 'You Broncos −3 · Troy hasn’t locked in');
  assert.deepEqual(rowTag(before[0], 'Troy'), { text: 'WAITING', tone: 'data' });
  const after = rows(history([w], '2026-10-25T21:00:00Z'));
  assert.deepEqual(after.map(r => r.state), ['noGuess', 'waiting'], 'SEA has kicked off, BUF has not');
  assert.equal(rowLine(after[0], 'guess_spread', 'Troy'), 'You Broncos −3 · Troy didn’t lock in');
  const sat = rows(history([week(9, [w.entries[0], { userId: TROY, mode: 'guess_spread', status: 'sat_out', picks: null, hiddenGames: [] }])]));
  assert.deepEqual(sat.map(r => r.state), ['noGuess', 'noGuess']);
  assert.equal(rowLine(sat[0], 'guess_spread', 'Troy'), 'You Broncos −3 · Troy sat out');
  assert.equal(headToHead([...before, ...after, ...sat]).shared, 0, 'nothing waiting or missed counts');
});

test('the head-to-head counts only games scored for both: points, Bullseyes, average miss, shared games and the lead', () => {
  const w9 = week(9, [entry(ME, [locked(SEA.id, -3, -3, 10), locked(BUF.id, 2, 2.5, 9)]),
    entry(TROY, [{ ...locked(SEA.id, -3, null, null), reference: { value: null, status: 'pending' } }, { gameId: BUF.id, guess: null, reference: null, points: null, hidden: false }])]);
  const w10 = week(10, [entry(ME, [locked(SEA.id, -3, -3, 10)]), entry(TROY, [locked(SEA.id, -3, -3, null)], { eligible: false })]);
  const out = rows(history([w10, week8, w9]));
  assert.deepEqual(out.map(r => `${r.week}:${r.state}`), ['8:scored', '8:scored', '9:unscored', '9:waiting', '10:unscored', '10:waiting']);
  const h = headToHead(out);
  assert.deepEqual(h, { shared: 2, lead: 2, me: { points: 19, bullseyes: 1, avgMiss: 0.25 }, them: { points: 17, bullseyes: 0, avgMiss: 0.75 } });
  assert.equal(leadLine(h, 'Troy'), 'You lead by 2');
  assert.equal(statLine(h), 'Bullseyes 1–0 · Avg miss 0.3–0.8 · 2 shared games');
  assert.equal(leadLine(headToHead([]), 'Troy'), 'No shared games yet');
  assert.equal(statLine(headToHead([])), '', 'nothing shared: no stat line, and no crash on the null sides');
  assert.equal(statLine(headToHead([]), true), '');
  assert.equal(leadLine({ shared: 1, lead: -1 }, 'Troy'), 'Troy leads by 1');
  assert.equal(leadLine({ shared: 1, lead: 0 }, 'Troy'), 'All square');
});

test('each player is scored against their own saved line, and the tag names who took the game', () => {
  // The same SEA guess against two saved lines: you are off 0.5, Troy is exact.
  const w = week(8, [entry(ME, [locked(SEA.id, -3.5, -3, 9), locked(BUF.id, 2, 2, 10)]), entry(TROY, [locked(SEA.id, -3.5, -3.5, 10), locked(BUF.id, 2.5, 2, 9)])]);
  const out = rows(history([w]));
  assert.deepEqual(out.map(r => [r.me.miss, r.them.miss]), [[0.5, 0], [0, 0.5]]);
  assert.equal(rowLine(out[0], 'guess_spread', 'Troy'), 'You Broncos −3.5 · Troy Broncos −3.5');
  assert.deepEqual(out.map(r => rowTag(r, 'Troy')), [{ text: 'TROY +1', tone: 'neutral' }, { text: 'YOU +1', tone: 'win' }]);
  const even = rows(history([week(8, [entry(ME, [locked(SEA.id, -3, -3, 10)]), entry(TROY, [locked(SEA.id, -3, -3, 10)])])]));
  assert.deepEqual(rowTag(even[0], 'Troy'), { text: 'EVEN', tone: 'neutral' });
});

test('Compare opens on the member with the most shared games this season over both markets, ties in roster order; a chosen member stays', () => {
  const data = history([week8]);
  assert.deepEqual(opponents(data).map(m => m.id), [LUKE, TROY, BEN], 'never the viewer; a former member comes last');
  assert.equal(defaultOpponent(data), TROY);
  assert.equal(chooseOpponent(data, LUKE), LUKE);
  assert.equal(chooseOpponent(data, BEN), BEN, 'a former member can still be compared (D-23)');
  for (const item of [ME, 'stranger', undefined, 'SEA-DEN']) assert.equal(chooseOpponent(data, item), TROY, String(item));
  assert.equal(defaultOpponent(history([])), LUKE, 'no shared games: the first current member');
  assert.equal(defaultOpponent({ viewer: ME, members: [{ id: ME, displayName: 'Sean B' }], weeks: [] }), null);
  assert.equal(firstName('Troy Jun'), 'Troy');
  assert.equal(firstName(''), 'Member');
});

test('Everyone (D-53 "All players", kept as the last chip): you against each game’s benchmark of every scored player, you included', () => {
  const data = history([week(8, [...week8.entries, entry(LUKE, [locked(SEA.id, -4, -3, 8)])])]);
  assert.equal(chooseOpponent(data, EVERYONE), EVERYONE);
  assert.notEqual(defaultOpponent(data), EVERYONE, 'never the default');
  const out = fieldRows(data, { mode: 'guess_spread' });
  assert.deepEqual(out.map(r => [r.game.id, r.field, r.me.points, r.them.points]), [[SEA.id, 3, 10, 9], [BUF.id, 2, 9, 8.5]]);
  const h = headToHead(out);
  assert.deepEqual([h.shared, h.me.points, h.them.points, h.lead], [2, 19, 17.5, 1.5]);
  assert.equal(rowLine(out[0], 'guess_spread', 'Everyone'), 'You Broncos −3 · 3 players avg 9');
  assert.deepEqual(rowTag(out[1], 'Everyone'), { text: 'YOU +0.5', tone: 'win' });
  assert.equal(statLine(h, true), 'Avg miss 0.3–0.6 · 2 shared games');
  assert.deepEqual(fieldRows(history([week(9, week8.entries, CLOSED)])), [], 'the field obeys the same gate (comparisonRows)');
});

test('team and matchup narrow the rows and from/to choose the weeks, oldest first', () => {
  const data = history([week(9, week8.entries), week8]);
  assert.deepEqual(rows(data).map(r => r.key), ['2026:8:SEA-DEN', '2026:8:BUF-KC', '2026:9:SEA-DEN', '2026:9:BUF-KC']);
  assert.deepEqual(rows(data, { team: 'KC' }).map(r => r.key), ['2026:8:BUF-KC', '2026:9:BUF-KC']);
  assert.deepEqual(rows(data, { matchup: SEA.id, from: 9, to: 9 }).map(r => r.key), ['2026:9:SEA-DEN']);
});

test('landing tile: the latest week with a shared game, a signed lead, the view that opens it, and no gated value (spec test 12)', () => {
  const leak = week(9, [entry(ME, []), entry(TROY, [locked(SEA.id, -17.5, -16.5, 7)])], CLOSED);
  const tile = compareTile(history([leak, week8]), { season: 2026, week: 9 });
  assert.deepEqual(tile, { big: '+2', sub: 'vs Troy', tone: 'good', ariaLabel: 'Compare: Week 8 Spread, you lead Troy by 2',
    view: { period: 'week', team: '', matchup: '', item: TROY, season: 2026, week: 8, market: 'spread' } });
  assert.doesNotMatch(JSON.stringify(tile), /17\.5|16\.5/);
  const behind = compareTile(history([week(8, [entry(ME, week8.entries[1].picks), entry(TROY, week8.entries[0].picks)])]), { season: 2026, week: 8 });
  assert.deepEqual([behind.big, behind.tone, behind.ariaLabel], ['−2', 'plain', 'Compare: Week 8 Spread, Troy leads you by 2']);
  assert.deepEqual([compareTile(history([week8]), { season: 2026, week: 7 }).big, compareTile(history([week8]), { season: 2026, week: 7 }).sub], ['—', 'vs Troy'], 'a later week never shows early');
  assert.deepEqual(compareTile(null, { season: 2026, week: 8 }), { big: '—', sub: 'Head-to-head', tone: 'plain', ariaLabel: 'Compare: head-to-head with another player',
    view: { period: 'week', team: '', matchup: '' } });
});

test('D-31: the other player’s own hiddenGames list shuts a game even when the gate is open and the pick looks plain; the legacy week.revealed shuts or opens it when a reply has no gate', () => {
  const plain = { ...locked(BUF.id, 17.5, 16.5, 7), hidden: false };
  const listed = rows(history([week(9, [entry(ME, [locked(BUF.id, 2, 2.5, 9)]), entry(TROY, [locked(SEA.id, -3, -3, 10), plain], { hiddenGames: [BUF.id] })])]));
  assert.deepEqual(listed.map(r => [r.game.id, r.state, r.me, r.them === null]), [[SEA.id, 'noGuess', listed[0].me, false], [BUF.id, 'hidden', null, true]]);
  assert.doesNotMatch(JSON.stringify(listed[1]), /17\.5|16\.5/);
  const noGate = (revealed) => ({ season: 2026, week: 9, games: [SEA, BUF], revealed: { guess_spread: revealed, guess_total: false },
    entries: [entry(ME, [locked(SEA.id, -3, -3, 10)]), entry(TROY, [locked(SEA.id, -17.5, -16.5, 7)])] });
  const shut = rows(history([noGate(false)]));
  assert.deepEqual(shut.map(r => [r.state, r.me, r.them]), [['hidden', null, null], ['hidden', null, null]]);
  assert.doesNotMatch(JSON.stringify(shut), /17\.5|16\.5|-3/);
  assert.equal(rows(history([noGate(true)]))[0].state, 'scored', 'the legacy flag opens the market when the reply has no gate');
  assert.ok(rows(history([noGate(true)]), { mode: 'guess_total' }).every(r => r.state === 'hidden'), 'the legacy flag is per market');
});

test('without a usable server clock nothing is known to have kicked off: an unlocked player stays WAITING, whatever the kickoff; a sit-out is still NO GUESS', () => {
  const past = { ...SEA, kickoff: '2020-01-01T00:00:00Z' }, future = { ...BUF, kickoff: '2099-01-01T00:00:00Z' }, unknown = { id: 'NYJ-MIA', awayCode: 'NYJ', homeCode: 'MIA' };
  const gate = Object.fromEntries([past, future, unknown].map(g => [g.id, { spread: true, total: false }]));
  const idle = [past, future, unknown].map(g => ({ gameId: g.id, guess: null, reference: null, points: null, hidden: false }));
  const mine = [past, future, unknown].map(g => locked(g.id, -3, -3, 10));
  const w = { season: 2026, week: 9, games: [past, future, unknown], gate, entries: [entry(ME, mine), entry(TROY, idle)] };
  for (const now of [undefined, null, 'soon']) {
    const out = rows({ viewer: ME, season: 2026, members, weeks: [w], now }, now === undefined ? {} : { now: Date.parse(now ?? '') });
    assert.deepEqual(out.map(r => r.state), ['waiting', 'waiting', 'waiting'], `now=${String(now)}`);
  }
  assert.deepEqual(rows(history([w], '2026-10-25T00:00:00Z')).map(r => r.state), ['noGuess', 'waiting', 'waiting'], 'with a clock a past kickoff reads NO GUESS; an unknown one still waits');
  const sat = { ...w, entries: [entry(ME, mine), { userId: TROY, mode: 'guess_spread', status: 'sat_out', picks: null, hiddenGames: [] }] };
  assert.deepEqual(rows({ viewer: ME, season: 2026, members, weeks: [sat] }).map(r => r.state), ['noGuess', 'noGuess', 'noGuess']);
});
