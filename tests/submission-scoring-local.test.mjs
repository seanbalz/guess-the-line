import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../server/engine.mjs';

// Synthetic evidence only; never used as live odds or written to saved app data.
const initialTime = Date.parse('2026-10-08T16:00:00Z');
const iso = value => new Date(value).toISOString();
const games = [
  { id: 'A-B', away: 'A', home: 'B', kickoff: '2026-10-09T00:15:00Z' },
  { id: 'C-D', away: 'C', home: 'D', kickoff: '2026-10-11T17:00:00Z' },
];
function evidence(mode, value, time = initialTime, id = `fixture-${mode}-${time}`) {
  const quotedAt = iso(time - 30_000);
  return { id, mode, source: 'Synthetic consensus fixture', sourceUrl: 'https://example.invalid/fixture',
    capturedAt: iso(time - 10_000), quotedAt, games: Object.fromEntries(games.map(game => [game.id, {
      value, quotes: ['Fixture A', 'Fixture B', 'Fixture C'].map(book => ({ book, value, quotedAt })),
      crossCheck: { source: 'Action Network', value, quotedAt },
    }])) };
}
function fixture(mode = 'guess_spread', value = -3) {
  return { version: 1, league: { id: 'fixture', season: 2026, week: 5, deadline: games[0].kickoff,
    roster: [{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }] }, games, ballots: {}, bets: {}, results: {},
    audit: [], history: [], consensusHistory: [evidence(mode, value)], archivedCount: 0 };
}
const fill = value => Object.fromEntries(games.map(game => [game.id, value]));
const engineFor = (state, time = initialTime) => createEngine(state, { clock: () => time, uuid: () => `fixture-audit-${time}` });

for (const [mode, value] of [['guess_spread', -3], ['guess_total', 45]]) {
  test(`${mode}: submission captures per-game evidence and later market movement cannot rescore it`, () => {
    const engine = engineFor(fixture(mode, value));
    const submitted = engine.saveBallot('one', mode, fill(value), true);
    assert.equal(submitted.score, 20);
    assert.equal(submitted.scoringPolicy, 'submission-time');
    assert(submitted.games.every(game => game.scoringReference.status === 'available' && game.points === 10));
    const saved = engine.snapshot(), beforeReferences = structuredClone(saved.ballots.one[mode].scoringReferences);
    saved.consensusHistory.push(evidence(mode, value + 2, initialTime + 600_000));
    const moved = engineFor(saved, initialTime + 600_000).view('one', mode);
    assert.equal(moved.score, 20);
    assert(moved.games.every(game => game.market === value && game.currentConsensus.value === value + 2));
    assert.deepEqual(engineFor(saved, initialTime + 600_000).export('one').ballots[mode].scoringReferences, beforeReferences);
    assert(moved.games.every(game => game.scoringReference.status === 'available'), 'aging a fixed reference does not invalidate scores');
  });

  test(`${mode}: complete revision refreshes only changed guesses and audits original references`, () => {
    const engine = engineFor(fixture(mode, value));
    engine.saveBallot('one', mode, fill(value), true);
    const saved = engine.snapshot(), before = structuredClone(saved.ballots.one[mode]);
    saved.consensusHistory.push(evidence(mode, value + 2, initialTime + 600_000));
    const later = engineFor(saved, initialTime + 600_000);
    const revised = later.saveBallot('one', mode, { ...fill(value), 'A-B': value + 1 }, false);
    const ballot = later.export('one').ballots[mode];
    assert.equal(revised.revealed, true);
    assert.equal(revised.score, 18);
    assert.equal(ballot.submittedAt, before.submittedAt);
    assert.equal(ballot.updatedAt, iso(initialTime + 600_000));
    assert.equal(ballot.scoringReferences['A-B'].value, value + 2);
    assert.deepEqual(ballot.scoringReferences['C-D'], before.scoringReferences['C-D']);
    const audit = later.export('one').audit.at(-1);
    assert.equal(audit.type, 'ballot_edited');
    assert.deepEqual(audit.changedGameIds, ['A-B']);
    assert.deepEqual(audit.beforeScoringReferences, before.scoringReferences);
    assert.deepEqual(audit.afterScoringReferences, ballot.scoringReferences);
    const references = structuredClone(ballot.scoringReferences);
    later.saveBallot('one', mode, ballot.picks, true);
    assert.deepEqual(later.export('one').ballots[mode].scoringReferences, references, 'no-op submission cannot refresh the scoring reference');
  });

  test(`${mode}: different players compare errors to their own references`, () => {
    const engine = engineFor(fixture(mode, value));
    engine.saveBallot('one', mode, fill(value + 1), true);
    const next = engine.snapshot();
    next.consensusHistory.push(evidence(mode, value + 3, initialTime + 60_000));
    const later = engineFor(next, initialTime + 60_000);
    later.saveBallot('two', mode, fill(value + 3.5), true);
    const view = later.view('one', mode), one = view.standings.find(p => p.id === 'one'), two = view.standings.find(p => p.id === 'two');
    assert.equal(one.points, 16); assert.deepEqual(one.record, { W: 0, L: 2, T: 0 });
    assert.equal(two.points, 18); assert.deepEqual(two.record, { W: 2, L: 0, T: 0 });
    assert(view.games.every(game => game.scoringReference.value === value && game.opponents[0].scoringReference.value === value + 3));
    assert(view.games.every(game => game.opponents[0].points === 9));
    assert.equal(later.view('one', mode === 'guess_total' ? 'guess_spread' : 'guess_total').games[0].scoringReference, null);
  });
}

test('legacy ballots never acquire present-day references from a read or no-op save', () => {
  const state = fixture();
  state.ballots.one = { guess_spread: { picks: fill(-3), submittedAt: iso(initialTime - 3600_000), origin: 'Historical import; exact time unknown' } };
  const engine = engineFor(state), before = engine.snapshot();
  const shown = engine.view('one');
  assert.equal(shown.score, null);
  assert(shown.games.every(game => game.points === null && game.scoringReference.status === 'unavailable'));
  assert.deepEqual(engine.snapshot(), before, 'reading never backfills evidence');
  engine.saveBallot('one', 'guess_spread', fill(-3), true);
  assert.deepEqual(engine.export('one').ballots.guess_spread.scoringReferences, {});
  engine.saveBallot('one', 'guess_spread', { ...fill(-3), 'A-B': -2.5 });
  const saved = engine.export('one').ballots.guess_spread;
  assert.equal(saved.scoringReferences['A-B'].value, -3);
  assert.equal(saved.scoringReferences['C-D'], undefined);
  assert.equal(saved.origin, before.ballots.one.guess_spread.origin);
  assert.equal(saved.submittedAt, before.ballots.one.guess_spread.submittedAt);
  assert.equal(engine.view('one').score, null, 'partial references do not fabricate a complete score');
});

test('a revision ten minutes later takes the same stored line with its age and preserves prior evidence in audit', () => {
  const engine = engineFor(fixture());
  engine.saveBallot('one', 'guess_spread', fill(-3), true);
  const saved = engine.snapshot(), first = structuredClone(saved.ballots.one.guess_spread.scoringReferences);
  const later = engineFor(saved, initialTime + 600_000);
  later.saveBallot('one', 'guess_spread', { ...fill(-3), 'A-B': -2.5 });
  const view = later.view('one');
  assert.equal(view.games[0].scoringReference.status, 'available');
  assert.equal(view.games[0].scoringReference.ageSeconds, 630);
  assert.equal(view.games[0].points, 9);
  assert.equal(view.games[1].points, 10);
  assert.equal(view.score, 19);
  assert.deepEqual(view.audit[0].beforeScoringReferences, first);
});

test('missing, future, duplicate and malformed source evidence cannot become submission references; the guess saves pending', () => {
  const invalid = [
    state => { state.consensusHistory = []; },
    state => { state.consensusHistory = [evidence('guess_spread', -3, initialTime + 60_000)]; },
    // Quotes observed more than five minutes before their own collection never qualify.
    state => { for (const g of Object.values(state.consensusHistory[0].games)) for (const q of [...g.quotes, g.crossCheck]) q.quotedAt = iso(initialTime - 10_000 - 300_001); },
    state => { for (const g of Object.values(state.consensusHistory[0].games)) g.quotes[1].book = g.quotes[0].book; },
    state => { for (const g of Object.values(state.consensusHistory[0].games)) g.quotes[0].value = -3.25; },
    state => { for (const g of Object.values(state.consensusHistory[0].games)) delete g.crossCheck; },
    state => { state.consensusHistory[0].sourceUrl = 'javascript:alert(1)'; },
    state => { for (const g of Object.values(state.consensusHistory[0].games)) g.quotes[0].quotedAt = iso(initialTime); },
  ];
  for (const invalidate of invalid) {
    const state = fixture(); invalidate(state);
    const engine = engineFor(state);
    const submitted = engine.saveBallot('one', 'guess_spread', fill(-3), true);
    assert.equal(submitted.score, null);
    assert(submitted.games.every(game => game.scoringReference.status === 'pending' && game.points === null));
  }
});

test('age no longer unscores: a line qualifying at its own collection scores at any later save, with its age', () => {
  const state = fixture();
  for (const later of [0, 300_001, 6 * 3600_000]) {
    const view = engineFor(structuredClone(state), initialTime + later).saveBallot('one', 'guess_spread', fill(-3), true);
    assert.equal(view.score, 20);
    assert.equal(view.games[0].scoringReference.ageSeconds, Math.floor((later + 30_000) / 1000));
  }
});

test('submission references remain hidden from unsubmitted players and cross-market views', () => {
  const engine = engineFor(fixture());
  engine.saveBallot('one', 'guess_spread', fill(-3), true);
  for (const [player, mode] of [['two', 'guess_spread'], ['one', 'guess_total'], ['two', 'betting_challenge']]) {
    const hidden = engine.view(player, mode);
    assert(hidden.games.every(game => game.scoringReference === null && game.currentConsensus === null && game.opponents.length === 0));
    assert(hidden.standings.every(player => player.points === null));
  }
  assert.equal(engine.export('two').ballots.guess_spread, undefined);
});

test('submitted edits cannot remove a game or cross the configured deadline', () => {
  const engine = engineFor(fixture());
  engine.saveBallot('one', 'guess_spread', fill(-3), true);
  const saved = engine.snapshot();
  assert.throws(() => engine.saveBallot('one', 'guess_spread', { 'A-B': -2 }), /Complete all/);
  assert.deepEqual(engine.snapshot(), saved);
  const closed = engineFor(saved, Date.parse(saved.league.deadline));
  assert.equal(closed.view('one').lockReason, 'deadline');
  assert.throws(() => closed.saveBallot('one', 'guess_spread', { ...fill(-3), 'A-B': -2 }), /deadline/);
  assert.deepEqual(closed.snapshot(), saved);
});

test('persisted references with future or inconsistent ballot timestamps fail closed without changing stored evidence', () => {
  const engine = engineFor(fixture());
  engine.saveBallot('one', 'guess_spread', fill(-3), true);
  const valid = engine.snapshot();
  const corruptions = [
    ref => { ref.savedAt = iso(initialTime + 60_000); ref.capturedAt = iso(initialTime + 30_000); ref.observedAt = iso(initialTime + 10_000); },
    ref => { ref.savedAt = iso(initialTime - 1); },
    ref => { ref.capturedAt = iso(initialTime + 1); },
    ref => { ref.observedAt = iso(initialTime + 1); },
  ];
  for (const corrupt of corruptions) {
    const state = structuredClone(valid);
    corrupt(state.ballots.one.guess_spread.scoringReferences['A-B']);
    const restored = engineFor(state);
    assert.equal(restored.view('one').score, null);
    assert.equal(restored.view('one').games[0].scoringReference.status, 'unavailable');
    assert.equal(restored.view('one').games[1].points, 10);
    assert.deepEqual(restored.snapshot(), state);
  }
  const afterUpdate = structuredClone(valid);
  afterUpdate.ballots.one.guess_spread.scoringReferences['A-B'].savedAt = iso(initialTime + 60_000);
  assert.equal(engineFor(afterUpdate, initialTime + 120_000).view('one').games[0].points, null,
    'a reference cannot have been saved after the ballot last changed even if now has caught up');
  const missingUpdate = structuredClone(valid);
  delete missingUpdate.ballots.one.guess_spread.updatedAt;
  assert.equal(engineFor(missingUpdate).view('one').score, 20, 'a first-submission receipt is consistent with the known submission timestamp');
});

test('a pending guess is unscored; its first line after submission scores only when collected and observed after the save', () => {
  const state = fixture(); state.consensusHistory = [];
  const engine = engineFor(state);
  const pending = engine.saveBallot('one', 'guess_spread', fill(-3), true);
  assert(pending.games.every(game => game.scoringReference.status === 'pending' && game.scoringReference.basis === 'first_line_after_submission' && game.points === null));
  const saved = engine.snapshot(), savedAt = initialTime;
  const firstAfter = (observed, captured = savedAt + 60_000) => ({ status: 'available', basis: 'first_line_after_submission', value: -3.5,
    source: 'The Odds API · 3-book median', sourceUrl: 'https://the-odds-api.com/', snapshotId: 'first-after', savedAt: iso(savedAt),
    capturedAt: iso(captured), observedAt: iso(observed), ageSeconds: Math.floor((savedAt - observed) / 1000) });
  const viewWith = (ref, now = savedAt + 120_000) => {
    const state = structuredClone(saved);
    state.ballots.one.guess_spread.scoringReferences['A-B'] = ref;
    return engineFor(state, now).view('one').games[0];
  };
  const scored = viewWith(firstAfter(savedAt + 30_000));
  assert.equal(scored.points, 9); assert.equal(scored.scoringReference.basis, 'first_line_after_submission'); assert.equal(scored.scoringReference.ageSeconds, -30);
  assert.equal(viewWith(firstAfter(savedAt)).points, 9, 'observed at the save instant is after it');
  for (const ref of [firstAfter(savedAt - 1), firstAfter(savedAt - 20_000, savedAt + 10_000), firstAfter(savedAt - 30_000, savedAt), { ...firstAfter(savedAt + 30_000), capturedAt: iso(savedAt + 600_000) }]) {
    const game = viewWith(ref);
    assert.equal(game.points, null, JSON.stringify(ref)); assert.equal(game.scoringReference.status, 'unavailable');
  }
});
