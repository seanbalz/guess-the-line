import test from 'node:test';
import assert from 'node:assert/strict';
import { ballotLockedIn, createEngine } from '../server/engine.mjs';

// Synthetic quotes and player IDs; no production data is read or changed.
const monday = Date.parse('2026-10-12T16:00:00Z');
const iso = value => new Date(value).toISOString();
const games = [
  { id: 'A-B', away: 'A', home: 'B', kickoff: '2026-10-16T00:15:00Z' },
  { id: 'C-D', away: 'C', home: 'D', kickoff: '2026-10-18T17:00:00Z' },
];
function evidence(mode, value, now = monday) {
  const quotedAt = iso(now - 30_000);
  return { id: `synthetic-${mode}-${now}`, mode, source: 'Synthetic test quotes', sourceUrl: 'https://example.invalid/quotes',
    capturedAt: iso(now - 10_000), quotedAt, games: Object.fromEntries(games.map(g => [g.id, {
      value, quotes: ['Test One', 'Test Two', 'Test Three'].map(book => ({ book, value, quotedAt })),
      crossCheck: { source: 'Action Network', value, quotedAt },
    }])) };
}
function fixture() {
  return { version: 1, league: { id: 'synthetic', season: 2026, week: 6, deadline: games[0].kickoff,
    roster: [{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }, { id: 'three', name: 'Three' }] },
    games, ballots: {}, bets: {}, results: {}, audit: [], history: [], consensusHistory: [evidence('guess_spread', -3), evidence('guess_total', 45)], archivedCount: 0 };
}
const engineFor = (state = fixture(), time = monday, extra = {}) => createEngine(state, { clock: () => time, uuid: () => `test-${time}`, sentFinal: true, perGameScoring: true, lateWindow: 'kickoff', ...extra });

for (const [mode, guess] of [['guess_spread', -2], ['guess_total', 46]]) {
  test(`${mode}: one Monday lock scores personally now; all shared rows wait for kickoff`, () => {
    const engine = engineFor();
    const saved = engine.lockGuess('one', mode, 'A-B', guess);
    assert.equal(saved.submittedAt, null, 'no whole-market submission');
    assert.equal(saved.score, 8);
    assert.deepEqual(saved.scoreSummary, { points: 8, scoredGames: 1, lockedGames: 1, pendingGames: 0, remainingGames: 1, standingsPoints: null, awaitingKickoffPoints: 8, basis: 'personal-locked-in', standingsBasis: 'started-games' });
    assert(saved.standings.every(p => p.points === null && p.record === null));
    assert.equal(saved.games[0].points, 8);
    assert.equal(saved.games[1].currentConsensus, null, 'other matchup stays hidden');
    assert(saved.lineHistory.every(row => Object.keys(row.games).every(id => id === 'A-B')));
    const otherMode = mode === 'guess_spread' ? 'guess_total' : 'guess_spread';
    assert.equal(engine.view('one', otherMode).games[0].currentConsensus, null, 'other market stays hidden');
    engine.saveBallot('two', mode, { 'A-B': guess + 0.5 });
    assert.equal(engine.view('one', mode).games[0].opponents.find(p => p.id === 'two').value, null, 'an unlocked opponent draft never appears');
    engine.lockGuess('two', mode, 'A-B', guess + 0.5);
    assert.equal(engine.view('one', mode).games[0].opponents.find(p => p.id === 'two').points, 7, 'permitted per-game points are immediate');
    assert.equal(engine.view('three', mode).games[0].opponents.length, 0, 'an unrevealed viewer gets no pick or score');
    const started = engineFor(engine.snapshot(), Date.parse(games[0].kickoff));
    const boards = ['one', 'two', 'three'].map(id => started.view(id, mode).standings);
    assert.deepEqual(boards[0], boards[1]); assert.deepEqual(boards[1], boards[2]);
    assert.equal(boards[0].find(p => p.id === 'one').points, 8);
    assert.equal(boards[0].find(p => p.id === 'three').points, null, 'no locked guess is not zero');
    assert.equal(started.view('one', mode).score, 8, 'kickoff does not re-score the guess');
    assert.equal(started.view('one', mode).scoreSummary.awaitingKickoffPoints, 0);
  });
}

test('locked receipts survive retries, stale-device edits, full submission, and later market movement', () => {
  const first = engineFor(); first.lockGuess('one', 'guess_spread', 'A-B', -2);
  const before = first.snapshot();
  first.lockGuess('one', 'guess_spread', 'A-B', -2);
  assert.deepEqual(first.snapshot(), before, 'exact retry adds neither audit nor reference');
  for (const save of [() => first.lockGuess('one', 'guess_spread', 'A-B', -1),
    () => first.saveBallot('one', 'guess_spread', { 'A-B': -1 }),
    () => first.saveBallot('one', 'guess_spread', {})]) assert.throws(save, /Sent picks are final/);
  const state = first.snapshot(); state.consensusHistory.push(evidence('guess_spread', -8, monday + 60_000));
  const later = engineFor(state, monday + 120_000);
  const complete = later.saveBallot('one', 'guess_spread', { 'A-B': -2, 'C-D': -8 }, true);
  assert.equal(complete.score, 18, 'earlier per-game reference still valid after later whole-submit timestamp');
  assert.deepEqual(later.snapshot().ballots.one.guess_spread.scoringReferences['A-B'], before.ballots.one.guess_spread.scoringReferences['A-B']);
  assert.equal(complete.games[0].currentConsensus.value, -8);
  assert.equal(complete.games[0].market, -3);
});

test('a missing line stays pending; a real zero scores; ineligible and practice guesses do not', () => {
  const state = fixture(); state.consensusHistory = [];
  const pending = engineFor(state).lockGuess('one', 'guess_spread', 'A-B', -2);
  assert.equal(pending.score, null); assert.equal(pending.scoreSummary.pendingGames, 1);
  assert.equal(pending.games[0].scoringStatus, 'pending');
  const zero = engineFor().lockGuess('one', 'guess_spread', 'A-B', 2);
  assert.equal(zero.score, 0); assert.equal(zero.scoreSummary.scoredGames, 1);
  assert.equal(zero.games[0].scoringStatus, 'scored');
  const ineligible = engineFor(fixture(), monday, { eligibility: { one: { guess_spread: false } } }).lockGuess('one', 'guess_spread', 'A-B', -3);
  assert.equal(ineligible.score, null); assert.equal(ineligible.games[0].scoringStatus, 'ineligible');
  const practice = fixture(); practice.league.practice = true;
  assert.equal(engineFor(practice).lockGuess('one', 'guess_spread', 'A-B', -3).score, null);
});

test('sit-out preserves independently locked points and does not expose remaining drafts', () => {
  const engine = engineFor(); engine.lockGuess('one', 'guess_spread', 'A-B', -2);
  engine.saveBallot('one', 'guess_spread', { 'A-B': -2, 'C-D': -1 });
  const before = engine.snapshot().ballots.one.guess_spread;
  const view = engine.sitOut('one', 'guess_spread');
  assert.equal(view.score, 8); assert.equal(view.games[0].scoringStatus, 'scored');
  assert.equal(view.games[1].scoringStatus, 'skipped');
  assert.deepEqual(engine.snapshot().ballots.one.guess_spread, before, 'sit-out never deletes locked guesses or drafts');
  engine.sitOut('two', 'guess_spread');
  assert.equal(engine.view('two', 'guess_spread').games[1].opponents.find(p => p.id === 'one').value, null);
  assert.throws(() => engine.lockGuess('one', 'guess_spread', 'C-D', -1), /sat out/);
});

test('after Thursday, legacy submit preserves a started draft but locks only games that are still open', () => {
  const engine = engineFor(); engine.saveBallot('one', 'guess_total', { 'A-B': 44 });
  const later = engineFor(engine.snapshot(), Date.parse(games[0].kickoff) + 1000);
  assert.throws(() => later.saveBallot('one', 'guess_total', { 'A-B': 45, 'C-D': 46 }), /deadline/);
  const view = later.saveBallot('one', 'guess_total', { 'C-D': 46 }, true);
  const ballot = later.snapshot().ballots.one.guess_total;
  assert.equal(ballot.picks['A-B'], 44, 'omitted started draft survives');
  assert.deepEqual(ballot.closedAtKickoff, ['A-B']);
  assert.equal(ballotLockedIn(ballot, 'A-B'), false); assert.equal(ballotLockedIn(ballot, 'C-D'), true);
  assert.equal(view.score, 8); assert.equal(view.games[0].points, null);
  assert.equal(view.games[1].scoringStatus, 'scored');
  assert.throws(() => later.lockGuess('one', 'guess_total', 'A-B', 44), /deadline/);
  const atLastKickoff = engineFor(later.snapshot(), Date.parse(games[1].kickoff));
  assert.throws(() => atLastKickoff.lockGuess('two', 'guess_total', 'C-D', 45), /deadline/);
});

test('pending resolution scores once without changing a locked guess or its lock timestamp', () => {
  const state = fixture(); state.consensusHistory = [];
  const engine = engineFor(state); engine.lockGuess('one', 'guess_spread', 'A-B', -2);
  const saved = engine.snapshot(), lockTime = saved.ballots.one.guess_spread.lockedAt['A-B'];
  const ref = { status: 'available', basis: 'first_line_after_submission', value: -3, savedAt: lockTime,
    capturedAt: iso(monday + 60_000), observedAt: iso(monday + 30_000), snapshotId: 'resolved-fixture', source: 'Synthetic test quotes', sourceUrl: 'https://example.invalid/quotes' };
  saved.ballots.one.guess_spread.scoringReferences['A-B'] = ref;
  const resolved = engineFor(saved, monday + 120_000);
  assert.equal(resolved.view('one').score, 8); assert.equal(resolved.view('one').score, 8);
  resolved.lockGuess('one', 'guess_spread', 'A-B', -2);
  assert.equal(resolved.snapshot().ballots.one.guess_spread.lockedAt['A-B'], lockTime);
  assert.deepEqual(resolved.snapshot().ballots.one.guess_spread.scoringReferences['A-B'], ref);
  assert.equal(resolved.snapshot().audit.length, 1);
});

test('partial shared points do not award a final closest-pick record before the roster completes its ballots', () => {
  const engine = engineFor();
  for (const [id, guess] of [['one', -3], ['two', -4], ['three', -5]]) engine.lockGuess(id, 'guess_spread', 'A-B', guess);
  const later = engineFor(engine.snapshot(), Date.parse(games[0].kickoff));
  const rows = later.view('one').standings;
  assert.deepEqual(rows.map(row => row.points), [10, 8, 6]);
  assert(rows.every(row => row.record === null));
  assert.throws(() => later.saveBallot('one', 'guess_spread', { 'C-D': -3 }), /Sent picks are final/, 'started locked picks cannot be omitted as though they were drafts');
});
