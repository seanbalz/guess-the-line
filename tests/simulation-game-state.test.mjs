import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_STATE_POLICY, GameStateValidationError, createGameState,
  createResearchGameCheckpoint, gameStateKey, reduceGameEvent,
} from '../shared/simulation-game-state.mjs';

// Artificial administrative checkpoints only; none describe an observed game,
// player, forecast, or verified historical score. No production fixture imports.
const HASH = 'a'.repeat(64);
const MANIFEST = {
  id: 'admin-test-only', season: 2026, gameType: 'REG',
  homeTeamId: 'BUF', awayTeamId: 'SEA', inputSnapshotSha256: HASH,
};
const CHECKPOINT = {
  sourceRef: 'test-only-declared-context', period: 1, remainingMs: 800_000,
  clockRunning: false, nextClockStart: 'snap',
  playClock: { remainingMs: 25_000, running: false },
  score: { home: 0, away: 0 }, possessionTeamId: 'BUF',
  fieldPosition: 35, down: 2, lineToGain: 42,
  timeouts: { home: 3, away: 3 }, warningTaken: false,
  defendingNorthTeamId: 'SEA', secondHalfFirstChoiceTeamId: 'BUF',
};
const initial = () => createGameState({ ...MANIFEST });
const checkpoint = changes => createResearchGameCheckpoint(MANIFEST, { ...structuredClone(CHECKPOINT), ...changes });
const event = (state, type, fields = {}) => ({
  id: `event-${state.sequence + 1}`, sequence: state.sequence + 1,
  expectedBefore: gameStateKey(state), type, ...fields,
});
const step = (state, type, fields) => reduceGameEvent(state, event(state, type, fields));
const expired = (period, changes = {}) => checkpoint({
  period, remainingMs: 0, nextClockStart: 'none',
  warningTaken: [2, 4, 5].includes(period),
  timeouts: { home: 1, away: 0 }, ...changes,
});
function rejects(action, path) {
  assert.throws(action, error => error instanceof GameStateValidationError && (!path || error.path.includes(path)));
}
function deeplyFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) deeplyFrozen(child);
}
function unchangedFootball(before, after) {
  for (const key of ['period', 'phase', 'score', 'possessionTeamId', 'fieldPosition', 'down', 'lineToGain', 'clock', 'playClock', 'timeouts']) {
    assert.deepEqual(after[key], before[key], key);
  }
}

test('manifest restricts the edition and matchup without claiming its hash reference was verified', () => {
  const state = initial();
  assert.deepEqual([state.researchOnly, state.rulesComplete, state.publicationReady], [true, false, false]);
  assert.deepEqual(state.origin, { kind: 'initial_conditions', sourceRef: null, verified: false });
  assert.equal(state.phase, 'pregame');
  assert.equal(state.clock.remainingMs, 900_000);
  assert.deepEqual(state.score, { home: 0, away: 0 });
  assert.equal(state.possessionTeamId, null);
  assert.equal('playerStats' in state, false);
  for (const change of [{ season: 2025 }, { gameType: 'POST' }, { awayTeamId: 'BUF' },
    { homeTeamId: 'LA' }, { awayTeamId: '__proto__' }, { inputSnapshotSha256: 'unverified' }, { ready: true }]) {
    rejects(() => createGameState({ ...MANIFEST, ...change }));
  }
  deeplyFrozen(state);
  deeplyFrozen(GAME_STATE_POLICY);
});

test('exact schemas reject accessors and unknown fields without running their code', () => {
  let executed = false;
  const manifest = { ...MANIFEST };
  Object.defineProperty(manifest, 'homeTeamId', { enumerable: true, get() { executed = true; return 'BUF'; } });
  rejects(() => createGameState(manifest));
  const state = initial();
  for (const key of ['type', 'expectedBefore', 'winnerTeamId']) {
    const input = event(state, 'coin_toss', { winnerTeamId: 'BUF', defer: false });
    Object.defineProperty(input, key, { enumerable: true, get() { executed = true; return 'BUF'; } });
    rejects(() => reduceGameEvent(state, input));
  }
  assert.equal(executed, false);
  rejects(() => step(state, 'coin_toss', { winnerTeamId: 'BUF', defer: false, score: { home: 7, away: 0 } }));
});

test('explicit toss deferral and complementary choices determine opening kick and goal', () => {
  let state = step(initial(), 'coin_toss', { winnerTeamId: 'BUF', defer: true });
  assert.equal(state.choiceTurnTeamId, 'SEA');
  assert.equal(state.secondHalfFirstChoiceTeamId, 'BUF');
  rejects(() => step(state, 'half_choice', { teamId: 'BUF', choice: 'receive', goal: null }));
  state = step(state, 'half_choice', { teamId: 'SEA', choice: 'receive', goal: null });
  rejects(() => step(state, 'half_choice', { teamId: 'BUF', choice: 'kick', goal: null }));
  state = step(state, 'half_choice', { teamId: 'BUF', choice: 'defend_goal', goal: 'south' });
  assert.equal(state.phase, 'kickoff_pending');
  assert.equal(state.defendingNorthTeamId, 'SEA');
  assert.deepEqual(state.pendingKickoff, { reason: 'firstHalf', receivingTeamId: 'SEA', kickingTeamId: 'BUF' });
  assert.deepEqual([state.clock.running, state.clock.nextStart, state.playClock.remainingMs], [false, 'legal_touch', 25_000]);
  rejects(() => step(state, 'coin_toss', { winnerTeamId: 'BUF', defer: false }));
  rejects(() => step(state, 'snap'));
});

test('choosing a goal first leaves kick/receive to the other team; choosing kick is not defer', () => {
  let state = step(initial(), 'coin_toss', { winnerTeamId: 'BUF', defer: false });
  state = step(state, 'half_choice', { teamId: 'BUF', choice: 'defend_goal', goal: 'north' });
  state = step(state, 'half_choice', { teamId: 'SEA', choice: 'kick', goal: null });
  assert.deepEqual(state.pendingKickoff, { reason: 'firstHalf', receivingTeamId: 'BUF', kickingTeamId: 'SEA' });
  assert.equal(state.secondHalfFirstChoiceTeamId, 'SEA');
  assert.equal(state.defendingNorthTeamId, 'BUF');
  let kick = step(initial(), 'coin_toss', { winnerTeamId: 'BUF', defer: false });
  kick = step(kick, 'half_choice', { teamId: 'BUF', choice: 'kick', goal: null });
  assert.equal(kick.secondHalfFirstChoiceTeamId, 'SEA');
});

test('sequence, event identity and exact previous-state binding prevent replay onto another state', () => {
  const state = initial();
  const input = event(state, 'coin_toss', { winnerTeamId: 'BUF', defer: false });
  const next = reduceGameEvent(state, input);
  rejects(() => reduceGameEvent(next, input), 'sequence');
  rejects(() => reduceGameEvent(state, { ...input, sequence: 2 }), 'sequence');
  rejects(() => reduceGameEvent(state, { ...input, expectedBefore: gameStateKey(next) }), 'expectedBefore');
  rejects(() => step(next, 'half_choice', { id: input.id, teamId: 'BUF', choice: 'receive', goal: null }), 'id');
  rejects(() => reduceGameEvent(structuredClone(state), input), 'state');
  assert.equal(state.sequence, 0);
  assert.deepEqual(state.eventIds, []);
  const reordered = Object.fromEntries(Object.entries(MANIFEST).reverse());
  assert.equal(gameStateKey(state), gameStateKey(createGameState(reordered)));
  assert.equal(gameStateKey(next), gameStateKey(reduceGameEvent(state, input)));
});

test('checkpoint schema rejects nonfinite clocks, invalid identities and contradictory settled fields', () => {
  for (const change of [
    { remainingMs: NaN }, { remainingMs: Infinity }, { remainingMs: -0 }, { remainingMs: 900_001 },
    { remainingMs: 2.5 }, { period: 6 }, { period: 5, remainingMs: 600_001 },
    { remainingMs: 0 }, { nextClockStart: 'none' }, { possessionTeamId: 'KC' },
    { down: 0 }, { fieldPosition: 100 }, { fieldPosition: NaN }, { lineToGain: 35 },
    { lineToGain: 101 }, { score: { home: -1, away: 0 } }, { timeouts: { home: 4, away: 3 } },
    { warningTaken: true }, { defendingNorthTeamId: 'LA' }, { secondHalfFirstChoiceTeamId: 'DAL' },
    { playClock: { remainingMs: 0, running: false } }, { publicationReady: true },
  ]) rejects(() => checkpoint(change));
  rejects(() => expired(1, { clockRunning: true }));
  rejects(() => expired(1, { playClock: { remainingMs: 10_000, running: true } }));
  rejects(() => checkpoint({ period: 5, remainingMs: 300_000 })); // Three imported timeouts are illegal in regular-season OT.
});

test('declared checkpoint origin and unknown earlier history persist through every descendant', () => {
  let state = checkpoint({ period: 3 });
  const origin = { kind: 'declared_research_checkpoint', sourceRef: CHECKPOINT.sourceRef, verified: false };
  assert.deepEqual(state.origin, origin);
  assert.equal(state.warnings.firstHalf, 'unknown');
  for (const [type, fields] of [['ready_for_play'], ['elapse', { elapsedMs: 1_000 }], ['team_timeout', { teamId: 'SEA' }],
    ['ready_for_play'], ['snap'], ['elapse', { elapsedMs: 3_000 }], ['play_facts', { kind: 'scrimmage', factsSha256: HASH }]]) {
    state = step(state, type, fields);
    assert.deepEqual(state.origin, origin);
    assert.deepEqual([state.researchOnly, state.rulesComplete, state.publicationReady], [true, false, false]);
    deeplyFrozen(state);
  }
  assert.equal(state.status, 'requires_ruling');
  assert.equal(state.warnings.firstHalf, 'unknown');
  assert.throws(() => { state.origin.verified = true; }, TypeError);
});

test('ready and snap start only their defined clocks; a down clears same-dead-ball timeout tracking', () => {
  let state = checkpoint();
  rejects(() => step(state, 'elapse', { elapsedMs: 1 }));
  rejects(() => step(state, 'snap'));
  state = step(state, 'team_timeout', { teamId: 'BUF' });
  state = step(state, 'ready_for_play');
  assert.equal(state.clock.running, false);
  state = step(state, 'elapse', { elapsedMs: 5_000 });
  assert.deepEqual([state.clock.remainingMs, state.playClock.remainingMs], [800_000, 20_000]);
  rejects(() => step(state, 'ready_for_play'));
  state = step(state, 'snap');
  assert.deepEqual([state.phase, state.clock.running, state.playClock.running], ['live_ball', true, false]);
  assert.deepEqual(state.timeoutUsedThisDeadBall, []);
  state = step(state, 'elapse', { elapsedMs: 6_000 });
  assert.deepEqual([state.clock.remainingMs, state.playClock.remainingMs], [794_000, 20_000]);
  rejects(() => step(state, 'snap'));
  rejects(() => step(state, 'team_timeout', { teamId: 'BUF' }));
  let ready = step(checkpoint({ nextClockStart: 'ready' }), 'ready_for_play');
  ready = step(ready, 'elapse', { elapsedMs: 1_000 });
  assert.deepEqual([ready.clock.remainingMs, ready.playClock.remainingMs], [799_000, 24_000]);
});

test('dead-ball clocks stop exactly at the two-minute boundary and require the warning before another snap', () => {
  let state = checkpoint({ period: 2, remainingMs: 122_000, nextClockStart: 'ready' });
  state = step(state, 'ready_for_play');
  rejects(() => step(state, 'elapse', { elapsedMs: 2_001 }));
  state = step(state, 'elapse', { elapsedMs: 2_000 });
  assert.equal(state.clock.remainingMs, 120_000);
  assert.equal(state.warnings.firstHalf, 'pending');
  assert.equal(state.clock.running, false);
  assert.equal(state.playClock.running, false);
  rejects(() => step(state, 'snap'));
  rejects(() => step(state, 'team_timeout', { teamId: 'BUF' }));
  state = step(state, 'two_minute_warning');
  assert.equal(state.warnings.firstHalf, 'taken');
  assert.deepEqual([state.clock.nextStart, state.playClock.remainingMs], ['snap', 25_000]);
  rejects(() => step(state, 'two_minute_warning'));
  state = step(state, 'ready_for_play');
  assert.equal(state.clock.running, false);
  assert.equal(step(state, 'snap').clock.running, true);
});

test('a ready signal can start only the game clock while preserving an already-running play clock', () => {
  let state = checkpoint({ nextClockStart: 'ready', playClock: { remainingMs: 30_000, running: true } });
  state = step(state, 'elapse', { elapsedMs: 2_000 });
  assert.deepEqual([state.clock.remainingMs, state.playClock.remainingMs], [800_000, 28_000]);
  state = step(state, 'ready_for_play');
  assert.deepEqual([state.clock.running, state.playClock.running, state.playClock.remainingMs], [true, true, 28_000]);
  rejects(() => step(state, 'ready_for_play'));
  state = step(state, 'elapse', { elapsedMs: 3_000 });
  assert.deepEqual([state.clock.remainingMs, state.playClock.remainingMs], [797_000, 25_000]);
});

test('a live down crosses two minutes without stopping, including a later interval to zero', () => {
  let state = step(checkpoint({ period: 2, remainingMs: 122_000 }), 'ready_for_play');
  state = step(state, 'snap');
  state = step(state, 'elapse', { elapsedMs: 3_000 });
  assert.deepEqual([state.phase, state.clock.remainingMs, state.clock.running, state.warnings.firstHalf], ['live_ball', 119_000, true, 'pending']);
  rejects(() => step(state, 'two_minute_warning'));
  state = step(state, 'elapse', { elapsedMs: 119_000 });
  assert.deepEqual([state.phase, state.clock.remainingMs, state.clock.running], ['live_ball', 0, false]);
  rejects(() => step(state, 'period_end'));
  const halted = step(state, 'play_facts', { kind: 'scrimmage', factsSha256: HASH });
  unchangedFootball(state, halted);
  assert.equal(halted.status, 'requires_ruling');
});

test('each team can use one charged timeout per dead ball, while repeated or exhausted requests require a ruling', () => {
  let state = checkpoint({ clockRunning: true, nextClockStart: 'ready', playClock: { remainingMs: 30_000, running: true } });
  state = step(state, 'team_timeout', { teamId: 'BUF' });
  assert.deepEqual(state.timeouts, { home: 2, away: 3 });
  assert.deepEqual([state.clock.running, state.clock.nextStart, state.playClock.remainingMs, state.playClock.running], [false, 'snap', 25_000, false]);
  state = step(state, 'team_timeout', { teamId: 'SEA' });
  assert.deepEqual(state.timeouts, { home: 2, away: 2 });
  const repeated = step(state, 'team_timeout', { teamId: 'BUF' });
  unchangedFootball(state, repeated);
  assert.equal(repeated.rulingRequired.code, 'TIMEOUT_REQUEST_REQUIRES_RULING');
  const exhausted = checkpoint({ timeouts: { home: 0, away: 1 } });
  const halted = step(exhausted, 'team_timeout', { teamId: 'BUF' });
  unchangedFootball(exhausted, halted);
  assert.equal(halted.timeouts.home, 0);
});

test('ordinary official timeout preserves running clocks; sub-ten-second reset discretion is not guessed', () => {
  const before = checkpoint({ clockRunning: true, nextClockStart: 'ready', playClock: { remainingMs: 12_000, running: true } });
  let state = step(before, 'official_timeout');
  assert.deepEqual([state.clock.running, state.playClock.running], [false, false]);
  rejects(() => step(state, 'elapse', { elapsedMs: 1 }));
  rejects(() => step(state, 'snap'));
  state = step(state, 'resume_official_timeout');
  assert.deepEqual(state.clock, before.clock);
  assert.deepEqual(state.playClock, before.playClock);
  assert.equal(state.officialTimeout, null);
  rejects(() => step(state, 'resume_official_timeout'));
  const short = step(checkpoint({ playClock: { remainingMs: 9_000, running: true } }), 'official_timeout');
  const halted = step(short, 'resume_official_timeout');
  unchangedFootball(short, halted);
  assert.equal(halted.rulingRequired.code, 'PLAY_CLOCK_RESET_REQUIRES_RULING');
});

test('charged timeout before a pending kickoff preserves the receiver and legal-touch clock trigger', () => {
  let state = step(initial(), 'coin_toss', { winnerTeamId: 'BUF', defer: false });
  state = step(state, 'half_choice', { teamId: 'BUF', choice: 'receive', goal: null });
  state = step(state, 'half_choice', { teamId: 'SEA', choice: 'defend_goal', goal: 'south' });
  state = step(state, 'ready_for_play');
  state = step(state, 'elapse', { elapsedMs: 10_000 });
  const kick = state.pendingKickoff;
  state = step(state, 'team_timeout', { teamId: 'SEA' });
  assert.deepEqual(state.timeouts, { home: 3, away: 2 });
  assert.deepEqual(state.pendingKickoff, kick);
  assert.equal(state.phase, 'kickoff_pending');
  assert.deepEqual([state.clock.remainingMs, state.clock.nextStart, state.playClock.remainingMs], [900_000, 'legal_touch', 25_000]);
  state = step(state, 'ready_for_play');
  assert.equal(state.clock.running, false);
  assert.equal(step(state, 'team_timeout', { teamId: 'SEA' }).status, 'requires_ruling');
});

test('play-clock expiry halts without inventing a delay penalty or accepting negative time', () => {
  const ready = step(checkpoint(), 'ready_for_play');
  rejects(() => step(ready, 'elapse', { elapsedMs: 25_001 }));
  for (const elapsedMs of [0, -1, -0, 1.5, Infinity, NaN]) rejects(() => step(ready, 'elapse', { elapsedMs }));
  const state = step(ready, 'elapse', { elapsedMs: 25_000 });
  assert.equal(state.status, 'requires_ruling');
  assert.equal(state.rulingRequired.code, 'PLAY_CLOCK_EXPIRY_REQUIRES_RULING');
  assert.equal(state.playClock.remainingMs, 0);
  assert.equal(state.playClock.running, false);
  assert.equal(state.fieldPosition, ready.fieldPosition);
  assert.equal(state.down, ready.down);
  assert.deepEqual(state.score, ready.score);
  rejects(() => step(state, 'snap'));
});

test('simultaneous game and play-clock expiry stops both clocks without guessing penalty or period adjudication', () => {
  const before = checkpoint({ remainingMs: 5_000, clockRunning: true, nextClockStart: 'ready', playClock: { remainingMs: 5_000, running: true } });
  const state = step(before, 'elapse', { elapsedMs: 5_000 });
  assert.equal(state.status, 'requires_ruling');
  assert.equal(state.rulingRequired.code, 'PLAY_CLOCK_EXPIRY_REQUIRES_RULING');
  assert.deepEqual([state.clock.remainingMs, state.clock.running, state.playClock.remainingMs, state.playClock.running], [0, false, 0, false]);
  assert.equal(state.phase, 'period_expired');
  assert.deepEqual(state.score, before.score);
  assert.equal(state.fieldPosition, before.fieldPosition);
  rejects(() => step(state, 'period_end'));
});

test('settled quarter expiry preserves down, relative spot, possession and timeouts, but switches goals', () => {
  let state = checkpoint({ remainingMs: 5_000, clockRunning: true, nextClockStart: 'ready', playClock: { remainingMs: 40_000, running: true }, timeouts: { home: 1, away: 2 } });
  state = step(state, 'elapse', { elapsedMs: 5_000 });
  assert.equal(state.phase, 'period_expired');
  const before = state;
  state = step(state, 'period_end');
  assert.equal(state.phase, 'intermission');
  rejects(() => step(state, 'snap'));
  state = step(state, 'start_period');
  for (const key of ['score', 'possessionTeamId', 'fieldPosition', 'down', 'lineToGain', 'timeouts']) assert.deepEqual(state[key], before[key]);
  assert.equal(state.period, 2);
  assert.equal(state.defendingNorthTeamId, 'BUF');
  assert.deepEqual([state.clock.remainingMs, state.clock.nextStart, state.playClock.remainingMs], [900_000, 'snap', 25_000]);
  assert.deepEqual(state.origin, before.origin);
});

test('halftime resets timeouts and requires fresh complementary choices, not an inferred opposite receiver', () => {
  let state = step(expired(2), 'period_end');
  assert.deepEqual([state.phase, state.possessionTeamId, state.down], ['halftime', null, null]);
  state = step(state, 'start_period');
  assert.equal(state.period, 3);
  assert.deepEqual(state.timeouts, { home: 3, away: 3 });
  assert.equal(state.choiceTurnTeamId, 'BUF');
  state = step(state, 'half_choice', { teamId: 'BUF', choice: 'kick', goal: null });
  state = step(state, 'half_choice', { teamId: 'SEA', choice: 'defend_goal', goal: 'north' });
  assert.deepEqual(state.pendingKickoff, { reason: 'secondHalf', receivingTeamId: 'SEA', kickingTeamId: 'BUF' });
  assert.equal(state.clock.nextStart, 'legal_touch');
  assert.equal(state.origin.verified, false);
  const unknown = step(expired(2, { secondHalfFirstChoiceTeamId: null }), 'period_end');
  const halted = step(unknown, 'start_period');
  unchangedFootball(unknown, halted);
  assert.equal(halted.rulingRequired.code, 'HALF_CHOICE_REQUIRES_RULING');
});

test('an omitted current warning cannot silently become an observed event at the end of a half', () => {
  const state = expired(2, { warningTaken: false });
  assert.equal(state.warnings.firstHalf, 'pending');
  rejects(() => step(state, 'period_end'));
  rejects(() => step(state, 'two_minute_warning'));
});

test('possible untimed down records only unadjudicated basis and prevents ending or extending a period', () => {
  rejects(() => step(checkpoint(), 'untimed_down_pending', { basis: 'try', factsSha256: HASH }));
  for (const basis of ['defensive_foul', 'try', 'fair_catch', 'double_foul', 'other_rule_4_8']) {
    const before = expired(1);
    const state = step(before, 'untimed_down_pending', { basis, factsSha256: HASH });
    unchangedFootball(before, state);
    assert.deepEqual(state.untimedDown, { basis, factsSha256: HASH, eligibility: 'unadjudicated' });
    assert.equal(state.status, 'requires_ruling');
    assert.equal(state.rulingRequired.resumable, false);
    rejects(() => step(state, 'period_end'));
    rejects(() => step(state, 'snap'));
  }
});

test('tied regulation opens a versioned ten-minute OT scaffold with two timeouts and no awarded opportunity', () => {
  let state = step(expired(4, { score: { home: 17, away: 17 } }), 'period_end');
  assert.equal(state.phase, 'overtime_pending');
  assert.equal(state.overtime.rulesVersion, 'nfl-2026-reg-16-1');
  state = step(state, 'coin_toss', { winnerTeamId: 'SEA', defer: false });
  assert.equal(state.period, 5);
  assert.equal(state.clock.remainingMs, 600_000);
  assert.deepEqual(state.timeouts, { home: 2, away: 2 });
  state = step(state, 'half_choice', { teamId: 'SEA', choice: 'receive', goal: null });
  state = step(state, 'half_choice', { teamId: 'BUF', choice: 'defend_goal', goal: 'north' });
  assert.equal(state.pendingKickoff.reason, 'overtime');
  assert.equal(state.overtime.firstReceivingTeamId, 'SEA');
  assert.deepEqual(state.overtime.opportunityByTeam, { BUF: 'unadjudicated', SEA: 'unadjudicated' });
  assert.equal(state.overtime.adjudication, 'unsupported');
  const halted = step(state, 'adjudication', { kind: 'overtime_possession', factsSha256: HASH });
  unchangedFootball(state, halted);
  assert.deepEqual(halted.overtime.opportunityByTeam, state.overtime.opportunityByTeam);
  assert.equal(halted.origin.kind, 'declared_research_checkpoint');
});

test('neither a declared lead nor an expired regular-season OT produces a certified result', () => {
  for (const [period, score] of [[4, { home: 21, away: 17 }], [5, { home: 17, away: 17 }], [5, { home: 20, away: 17 }]]) {
    const before = expired(period, { score });
    const state = step(before, 'period_end');
    assert.equal(state.status, 'requires_ruling');
    assert.equal(state.rulingRequired.code, 'GAME_RESULT_REQUIRES_RULING');
    assert.deepEqual(state.score, score);
    assert.equal(state.publicationReady, false);
    assert.equal('winnerTeamId' in state, false);
    rejects(() => step(state, 'start_period'));
  }
  const pending = step(expired(4), 'period_end');
  const deferred = step(pending, 'coin_toss', { winnerTeamId: 'BUF', defer: true });
  unchangedFootball(pending, deferred);
  assert.equal(deferred.rulingRequired.code, 'OVERTIME_CHOICE_REQUIRES_RULING');
});

test('all unsupported play and ruling categories halt atomically with a factual receipt, never a guessed outcome', () => {
  for (const [type, kinds] of [
    ['play_facts', ['kickoff', 'scrimmage', 'punt', 'field_goal', 'try', 'turnover', 'safety_kick']],
    ['adjudication', ['penalty', 'runoff', 'review', 'injury_timeout', 'clock_correction', 'overtime_possession']],
  ]) for (const kind of kinds) {
    const before = step(step(checkpoint(), 'ready_for_play'), 'snap');
    const key = gameStateKey(before);
    const state = step(before, type, { kind, factsSha256: HASH });
    unchangedFootball(before, state);
    assert.equal(gameStateKey(before), key);
    assert.deepEqual(state.rulingRequired, { eventId: 'event-3', code: 'UNSUPPORTED_ADJUDICATION',
      detail: `${kind} facts require a future rules reducer; no football result was applied.`, factsSha256: HASH, resumable: false });
    assert.equal(state.sequence, 3);
    assert.deepEqual(state.origin, before.origin);
    rejects(() => step(state, 'adjudication', { kind: 'review', factsSha256: HASH }));
  }
  const state = checkpoint();
  rejects(() => step(state, 'touchdown', { teamId: 'BUF', points: 6 }));
  rejects(() => step(state, 'play_facts', { kind: 'scrimmage', factsSha256: HASH, score: { home: 6, away: 0 } }));
  assert.deepEqual(state.score, { home: 0, away: 0 });
});
