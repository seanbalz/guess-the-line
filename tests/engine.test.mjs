import test from 'node:test';
import assert from 'node:assert/strict';
import { SENT_FINAL_MESSAGE, createEngine } from '../server/engine.mjs';
import { seed } from '../server/store.mjs';

const now = Date.parse('2026-10-08T16:00:00Z');
const options = { clock: () => now, uuid: () => 'deterministic-test-id' };
const fill = (engine, value) => Object.fromEntries(engine.snapshot().games.map(g => [g.id, value]));

test('portable engine preserves independent reveal gates and player-scoped exports', () => {
  const engine = createEngine(seed(), options);
  engine.saveBallot('troy', 'guess_total', fill(engine, 44.5), true);
  assert.equal(engine.view('troy', 'guess_total').revealed, true);
  assert.equal(engine.view('troy', 'guess_total').score, null);
  for (const mode of ['guess_spread', 'betting_challenge']) {
    const hidden = engine.view('troy', mode);
    assert.equal(hidden.snapshot, null);
    assert.deepEqual(hidden.history, []);
    assert(hidden.games.every(g => g.market === null && g.previousMarket === null && g.opponents.length === 0));
    assert(hidden.standings.every(p => p.points === null));
  }
  const own = engine.export('troy');
  assert.deepEqual(Object.keys(own.ballots), ['guess_total']);
  assert(own.audit.every(a => a.player === 'troy'));
  assert.deepEqual(engine.export('luke').audit, []);
});

test('input, returned views, exports and snapshots cannot mutate engine state', () => {
  const initial = seed();
  const engine = createEngine(initial, options);
  initial.ballots.sean.guess_spread.picks['TB-DAL'] = 99;
  initial.league.roster[0].id = 'intruder';
  const visible = engine.view('sean');
  visible.league.roster[0].id = 'intruder';
  visible.games[0].prediction = 99;
  const exported = engine.export('sean');
  exported.ballots.guess_spread.picks['TB-DAL'] = 99;
  const snapshot = engine.snapshot();
  snapshot.ballots.sean.guess_spread.picks['TB-DAL'] = 99;
  snapshot.history[0].games['TB-DAL'].value = 99;
  assert.equal(engine.view('sean').games[0].prediction, -9.5);
  assert.equal(engine.view('sean').score, null, 'legacy guesses have no saved submission reference');
  assert.throws(() => engine.view('intruder'), /Unknown player/);
});

test('successful engine changes retain audit evidence and rehydrate from a snapshot', () => {
  const engine = createEngine(seed(), options);
  const picks = { 'TB-DAL': 44.5 };
  const returned = engine.saveBallot('troy', 'guess_total', picks);
  picks['TB-DAL'] = 99;
  returned.audit[0].after['TB-DAL'] = 99;
  const saved = engine.snapshot();
  assert.equal(saved.ballots.troy.guess_total.picks['TB-DAL'], 44.5);
  assert.equal(saved.audit[0].id, 'deterministic-test-id');
  assert.equal(saved.audit[0].timestamp, '2026-10-08T16:00:00.000Z');
  assert.deepEqual(saved.audit[0].before, {});
  assert.deepEqual(saved.audit[0].after, { 'TB-DAL': 44.5 });
  const restored = createEngine(saved, options);
  assert.deepEqual(restored.view('troy', 'guess_total'), engine.view('troy', 'guess_total'));
});

test('invalid modes and failed validation leave the entire engine snapshot unchanged', () => {
  const engine = createEngine(seed(), options);
  const before = engine.snapshot();
  for (const mode of ['other', '__proto__', null]) {
    assert.throws(() => engine.view('sean', mode), /Unknown game mode/);
    assert.throws(() => engine.saveBallot('sean', mode, {}), /Unknown prediction game/);
  }
  assert.throws(() => engine.saveBallot('troy', 'guess_total', { 'TB-DAL': 44.5 }, true), /Complete all/);
  assert.throws(() => engine.saveBallot('troy', 'guess_total', { 'TB-DAL': 44.5, 'PHI-JAX': -1 }));
  assert.throws(() => engine.saveBet('sean', { gameId: 'TB-DAL', market: 'other' }), /market/);
  assert.throws(() => engine.saveBet('sean', null), /Invalid selection/);
  assert.deepEqual(engine.snapshot(), before);
});

test('submitted ballots without market history remain unscored and unavailable', () => {
  const initial = seed();
  initial.history = [];
  const engine = createEngine(initial, options);
  const shown = engine.view('sean');
  assert.equal(shown.revealed, true);
  assert.equal(shown.score, null);
  assert.equal(shown.snapshot, null);
  assert.deepEqual(shown.history, []);
  assert(shown.games.every(g => g.market === null && g.points === null));
});

test('a newly created game cannot award closest-pick wins before an opponent joins', () => {
  const initial = seed();
  initial.league.roster = [initial.league.roster[0]];
  const engine = createEngine(initial, options);
  const shown = engine.view('sean');
  assert.equal(shown.score, null, 'historical snapshots cannot establish a submission reference');
  assert.equal(shown.standings[0].record, null, 'one participant is not a head-to-head competition');
});

test('practice reference scores remain unofficial even with later verified or frozen state', () => {
  const initial = seed();
  initial.league.practice = true;
  initial.history.at(-1).verified = true;
  initial.frozen = { guess_spread: { snapshot: initial.history.at(-1), frozenAt: new Date(now).toISOString() } };
  const engine = createEngine(initial, options);
  const shown = engine.view('sean');
  assert.equal(shown.officialEligible, false);
  assert.equal(shown.officialStatus, 'Practice game — no official scores');
  assert.equal(shown.score, null, 'verified or frozen later evidence cannot backfill a submission reference');
  assert.equal(shown.snapshot.verified, false);
  const afterDeadline = createEngine(initial, { ...options, clock: () => Date.parse(initial.league.deadline) });
  assert.equal(afterDeadline.view('sean').locked, true);
  assert.equal(afterDeadline.view('sean').officialEligible, false);
  assert.throws(() => afterDeadline.saveBallot('sean', 'guess_total', fill(afterDeadline, 44.5), true), /deadline/);
  assert.equal(createEngine(seed(), options).view('sean').officialEligible, true);
});

test('submitted modes remain editable before deadline while the other mode remains independently hidden', () => {
  for (const practice of [false, true]) for (const mode of ['guess_spread', 'guess_total']) {
    const initial = seed(); initial.league.practice = practice;
    const engine = createEngine(initial, options), value = mode === 'guess_total' ? 44.5 : -3;
    const otherMode = mode === 'guess_spread' ? 'guess_total' : 'guess_spread';
    engine.saveBallot('troy', mode, { 'TB-DAL': value });
    engine.saveBallot('troy', mode, { 'TB-DAL': value + .5 });
    const draft = engine.view('troy', mode);
    assert.equal(draft.locked, false); assert.equal(draft.revealed, false);
    const picks = fill(engine, value);
    const submitted = engine.saveBallot('troy', mode, picks, true);
    assert.equal(submitted.locked, false); assert.equal(submitted.lockReason, null);
    assert.equal(submitted.revealed, true); assert.equal(submitted.submittedAt, new Date(now).toISOString());
    const revised = engine.saveBallot('troy', mode, { ...picks, 'TB-DAL': value + 1 });
    assert.equal(revised.games[0].prediction, value + 1);
    assert.equal(revised.submittedAt, submitted.submittedAt);
    assert.equal(revised.audit[0].type, 'ballot_edited');
    const before = engine.snapshot();
    for (const next of [{}, { 'TB-DAL': value }, null]) {
      assert.throws(() => engine.saveBallot('troy', mode, next), /Complete all|Invalid ballot/);
      assert.deepEqual(engine.snapshot(), before);
    }
    const restored = createEngine(before, options);
    assert.equal(restored.view('troy', mode).locked, false);
    assert.equal(restored.view('troy', mode).games[0].prediction, value + 1);
    const independent = engine.saveBallot('troy', otherMode, { 'TB-DAL': 0 });
    assert.equal(independent.revealed, false); assert.equal(independent.locked, false);
    assert(independent.games.every(game => game.market === null && game.currentConsensus === null && game.scoringReference === null && game.opponents.length === 0));
  }
});

test('deadline locks submitted and draft modes and preserves historical exports without invented evidence', () => {
  const initial = seed();
  initial.audit.push({ id: 'historical-revision-fixture', player: 'sean', mode: 'guess_spread', type: 'ballot_saved', timestamp: '2026-10-08T15:00:00Z', before: { 'TB-DAL': -8 }, after: { 'TB-DAL': -9.5 } });
  const engine = createEngine(initial, { ...options, clock: () => Date.parse(initial.league.deadline) });
  assert.equal(engine.view('sean', 'guess_spread').lockReason, 'deadline');
  assert.equal(engine.view('sean', 'guess_total').lockReason, 'deadline');
  assert.equal(engine.view('sean', 'guess_total').revealed, false);
  assert.throws(() => engine.saveBallot('sean', 'guess_spread', initial.ballots.sean.guess_spread.picks), /deadline/);
  const exported = engine.export('sean');
  assert.deepEqual(exported.ballots, initial.ballots.sean);
  assert.deepEqual(exported.audit, initial.audit);
  assert.equal(exported.ballots.guess_spread.origin, initial.ballots.sean.guess_spread.origin);
  assert.equal(Object.hasOwn(exported.ballots.guess_spread, 'revealedAt'), false);
  assert.deepEqual(engine.snapshot(), initial);
});

test('prediction submission locks do not close independent Challenge selections before each game kickoff', () => {
  const initial = seed(), afterThursday = Date.parse(initial.league.deadline) + 3600_000;
  const engine = createEngine(initial, { ...options, clock: () => afterThursday });
  const challenge = engine.saveBet('sean', { gameId: 'PHI-JAX', market: 'spread', side: 'home', line: -3, odds: -110, source: 'Test fixture, not current odds', quotedAt: new Date(afterThursday - 60000).toISOString() });
  assert.equal(challenge.locked, false); assert.equal(challenge.lockReason, null);
  assert(challenge.games.find(game => game.id === 'PHI-JAX').bet);
  assert.deepEqual(engine.snapshot().ballots, initial.ballots);
});

test('D-23: a final weekly opt-out satisfies the reveal gate without picks, scores or a zero', () => {
  const engine = createEngine(seed(), options);
  assert.equal(engine.view('troy', 'guess_total').revealed, false);
  const shown = engine.sitOut('troy', 'guess_total');
  assert.equal(shown.revealed, true); assert.equal(shown.satOut, true); assert.equal(shown.submittedAt, null);
  assert.equal(shown.statuses.guess_total.satOut, true); assert.equal(shown.statuses.guess_spread.satOut, false);
  assert.equal(shown.score, null, 'sat out is never a zero');
  assert(shown.games.every(g => g.prediction === null && g.points === null && g.market === null && g.opponents.length === 2), 'opponents are listed once the gate opens');
  const troy = shown.standings.find(p => p.id === 'troy');
  assert.deepEqual([troy.satOut, troy.submitted, troy.points], [true, false, null]);
  assert.equal(shown.audit[0].type, 'week_sat_out');
  assert.equal(engine.view('troy', 'guess_spread').revealed, false, 'the other mode stays independently hidden');
  assert.equal(engine.view('luke', 'guess_total').revealed, false, 'another player\'s opt-out reveals nothing to Luke');
  assert.throws(() => engine.saveBallot('troy', 'guess_total', fill(engine, 44.5), true), /sat out/);
  assert.throws(() => engine.saveBallot('troy', 'guess_total', { 'TB-DAL': 44.5 }), /sat out/);
  const before = engine.snapshot();
  assert.deepEqual(engine.sitOut('troy', 'guess_total'), shown, 'idempotent');
  assert.deepEqual(engine.snapshot(), before);
  assert.throws(() => engine.sitOut('sean', 'guess_spread'), /already submitted/);
  assert.throws(() => engine.sitOut('troy', 'betting_challenge'), /Unknown prediction game/);
  assert.deepEqual(engine.snapshot().optOuts, { troy: ['guess_total'] });
  assert.equal(createEngine(before, options).view('troy', 'guess_total').revealed, true, 'rehydrates from a snapshot');
  const closed = createEngine(seed(), { ...options, clock: () => Date.parse(seed().league.deadline) });
  assert.throws(() => closed.sitOut('troy', 'guess_total'), /deadline/);
  // Cloud reads supply optOuts from gtl_weekly_optouts in the same state shape.
  const cloud = seed(); cloud.optOuts = { luke: ['guess_spread'] };
  const luke = createEngine(cloud, options).view('luke', 'guess_spread');
  assert.equal(luke.revealed, true); assert.equal(luke.lineHistory.length, cloud.history.length);
  assert.equal(luke.games[0].opponents.find(p => p.id === 'sean').value, -9.5, 'Sean\'s submitted spread is visible to the sat-out player');
  assert.equal(createEngine(cloud, options).view('luke', 'guess_total').revealed, false);
});

test('line charts expose only timestamped market values after the independent spread submission gate', () => {
  const initial = seed();
  initial.history[0].privateNote = 'not part of market data';
  initial.history[0].games.unknown = { value: 123, originalPick: 456 };
  const engine = createEngine(initial, options);
  const before = engine.snapshot();
  assert.deepEqual(engine.view('troy').lineHistory, []);
  for (const mode of ['guess_total', 'betting_challenge']) assert.deepEqual(engine.view('sean', mode).lineHistory, []);
  engine.saveBallot('troy', 'guess_total', fill(engine, 44.5), true);
  assert.deepEqual(engine.view('troy', 'guess_total').lineHistory, []);
  assert.deepEqual(engine.view('troy').lineHistory, []);
  engine.saveBallot('troy', 'guess_spread', fill(engine, 0), true);
  const series = engine.view('troy').lineHistory;
  assert.equal(series.length, initial.history.length);
  series.forEach((s, i) => {
    assert.deepEqual(Object.keys(s).sort(), ['id', 'capturedAt', 'quotedAt', 'timeBasis', 'source', 'sourceUrl', 'verified', 'status', 'games'].sort());
    assert.equal(s.verified, false); assert.equal(s.status, 'historical');
    assert.equal(s.quotedAt, initial.history[i].quotedAt);
    assert.equal(s.timeBasis, initial.history[i].timeBasis);
    assert.deepEqual(Object.keys(s.games).sort(), initial.games.map(g => g.id).sort());
    initial.games.forEach(g => assert.deepEqual(s.games[g.id], { value: initial.history[i].games[g.id].value }));
  });
  series[0].games['TB-DAL'].value = 100;
  assert.deepEqual(engine.snapshot().history, before.history);
  assert.equal(Object.hasOwn(engine.export('troy'), 'lineHistory'), false);
  initial.history = [];
  assert.deepEqual(createEngine(initial, options).view('sean').lineHistory, []);
});

test('line chart projection rejects invalid source metadata and missing market observations', () => {
  const initial = seed();
  const invalidTime = structuredClone(initial.history[0]); invalidTime.quotedAt = 'invalid';
  const invalidSource = structuredClone(initial.history[0]); invalidSource.sourceUrl = 'javascript:alert(1)';
  initial.history.unshift(invalidTime, invalidSource);
  delete initial.history.at(-1).games['TB-DAL'].value;
  const series = createEngine(initial, options).view('sean').lineHistory;
  assert.equal(series.length, initial.history.length - 2);
  assert.equal(Object.hasOwn(series.at(-1).games, 'TB-DAL'), false);
});

// Redesign stage 18 (M-02): the engine mirror of the SQL writers. With sentFinal (gtl_live_rules once M-02 is applied) a
// locked-in pick can neither change nor be left out; a send records each guess it locks in; without it D-16's edits stay.
test('sentFinal mirror: a locked-in pick is final; a send records lockedAt; without sentFinal the D-16 edit stays', () => {
  const final = createEngine(seed(), { ...options, sentFinal: true });
  const picks = fill(final, 44.5), [first, second] = Object.keys(picks);
  final.saveBallot('troy', 'guess_total', picks, true);
  const sent = final.snapshot().ballots.troy.guess_total;
  assert.deepEqual(Object.keys(sent.lockedAt).sort(), Object.keys(picks).sort());
  assert.ok(Object.values(sent.lockedAt).every(at => at === sent.submittedAt));
  assert.deepEqual(final.view('troy', 'guess_total').lockedAt, sent.lockedAt, 'the /state view carries it for the group screen');
  const before = final.snapshot();
  for (const [label, next, submit] of [['changed', { ...picks, [first]: 45.5 }, true], ['changed as a draft', { ...picks, [first]: 45.5 }, false], ['left out', { [second]: 44.5 }, false]]) {
    assert.throws(() => final.saveBallot('troy', 'guess_total', next, submit), new RegExp(SENT_FINAL_MESSAGE.replace('.', '\\.')), label);
  }
  assert.deepEqual(final.snapshot(), before, 'a refusal leaves the state untouched');
  final.saveBallot('troy', 'guess_total', picks, true);
  assert.deepEqual(final.snapshot().ballots.troy.guess_total.lockedAt, sent.lockedAt, 'an unchanged re-save keeps every lock-in time');
  // A draft with one game locked in (the new app's lock-in, read back from the database): that game is final, the others are drafts.
  const state = seed();
  state.ballots.luke = { guess_total: { submittedAt: null, picks: { [first]: 41.5 }, lockedAt: { [first]: '2026-10-08T15:00:00.000Z' }, scoringReferences: { [first]: { status: 'pending', value: null } } } };
  const mixed = createEngine(state, { ...options, sentFinal: true });
  assert.throws(() => mixed.saveBallot('luke', 'guess_total', { [first]: 40.5 }, false), /Sent picks are final/);
  mixed.saveBallot('luke', 'guess_total', { [first]: 41.5, [second]: 39.5 }, false);
  const all = Object.fromEntries(Object.keys(picks).map(id => [id, id === first ? 41.5 : 39.5]));
  mixed.saveBallot('luke', 'guess_total', all, true);
  const done = mixed.snapshot().ballots.luke.guess_total;
  assert.deepEqual([done.lockedAt[first], done.scoringReferences[first]], ['2026-10-08T15:00:00.000Z', { status: 'pending', value: null }], 'the earlier lock-in keeps its time and line');
  // Today's rules: the same edit of a sent ballot saves, and no lockedAt is written.
  const today = createEngine(seed(), options);
  today.saveBallot('troy', 'guess_total', picks, true);
  today.saveBallot('troy', 'guess_total', { ...picks, [first]: 45.5 }, true);
  assert.equal(today.snapshot().ballots.troy.guess_total.picks[first], 45.5);
  assert.equal('lockedAt' in today.snapshot().ballots.troy.guess_total, false);
  assert.equal(today.view('troy', 'guess_total').lockedAt, null);
});
