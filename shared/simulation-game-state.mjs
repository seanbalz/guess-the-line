// Offline research administration only. No generator, scoring, player selection, network,
// storage, or production approval. The existing simulation-replay contract is unchanged.
// Rule references: https://operations.nfl.com/rules-officiating/2026-nfl-rulebook
// Official 2026 PDF: https://static.www.nfl.com/image/upload/fl_attachment/league/tqivdkzt9mu6wdgsh1ku.pdf
// Supported: 4-1/4-2 period administration and choices; ordinary 4-5-1 timeouts;
// bounded 4-3/4-4/4-6 clock administration; 3-41 two-minute warning.
// 4-8 extensions and 16-1 regular-season OT are explicitly UNADJUDICATED scaffolds.
// Never infer a live-ball outcome, penalty, final score, or overtime opportunity.
//
// API: createGameState(manifest), createResearchGameCheckpoint(manifest, checkpoint),
//      gameStateKey(state), reduceGameEvent(state, event).
// Event binding is an exact canonical JSON string, NOT a cryptographic hash or a
// verification of the referenced input snapshot. Only states created here are accepted.
// A declared research checkpoint is never an observed-history verification; its origin
// remains attached to every descendant. Unsupported facts halt, with no resume override.
import { TEAM_NAMES } from './nfl-schedule.mjs';

export const GAME_STATE_POLICY = Object.freeze({
  version: 'gtl-game-state-1', rulesVersion: 'nfl-2026-admin-research-1',
  season: 2026, gameType: 'REG', regulationPeriodMs: 900_000,
  overtimePeriodMs: 600_000, maxEvents: 4096,
  rulesComplete: false, publicationReady: false,
});

export class GameStateValidationError extends Error {
  constructor(code, path, message) {
    super(`${path}: ${message}`);
    this.name = 'GameStateValidationError'; this.code = code; this.path = path;
  }
}

const ownedStates = new WeakSet();
const fail = (path, message, code = 'GAME_STATE_INVALID_INPUT') => { throw new GameStateValidationError(code, path, message); };
const need = (condition, path, message) => { if (!condition) fail(path, message, 'GAME_STATE_INVALID_SEQUENCE'); };
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
function object(value, keys, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, 'expected a plain object');
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key))) fail(path, `expected exactly ${keys.join(', ')}`);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !own(descriptor, 'value')) fail(`${path}.${key}`, 'accessors are not accepted');
  }
  return value;
}
function integer(value, min, max, path) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < min || value > max) fail(path, `expected an integer ${min}..${max}`);
  return value;
}
function finite(value, min, max, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0) || value < min || value > max) fail(path, 'expected a bounded finite number');
  return value;
}
function oneOf(value, choices, path) {
  if (!choices.includes(value)) fail(path, `expected one of ${choices.join(', ')}`);
  return value;
}
function boolean(value, path) { if (typeof value !== 'boolean') fail(path, 'expected boolean'); return value; }
function identifier(value, path) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(value)) fail(path, 'invalid stable ID');
  return value;
}
function sha(value, path) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(path, 'expected SHA-256 reference');
  return value;
}
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function seal(value) { freeze(value); ownedStates.add(value); return value; }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function stateRequired(state) { if (!ownedStates.has(state)) fail('state', 'use a state created by this module; JSON checkpoints require the explicit research importer'); }
export function gameStateKey(state) {
  stateRequired(state);
  return `${GAME_STATE_POLICY.version}:${canonical(state)}`;
}
function side(state, teamId, path = 'teamId') {
  if (teamId === state.manifest.homeTeamId) return 'home';
  if (teamId === state.manifest.awayTeamId) return 'away';
  fail(path, 'team is outside the matchup');
}
function other(state, teamId) { return side(state, teamId) === 'home' ? state.manifest.awayTeamId : state.manifest.homeTeamId; }
const limit = period => period === 5 ? GAME_STATE_POLICY.overtimePeriodMs : GAME_STATE_POLICY.regulationPeriodMs;
const warningKey = period => period === 2 ? 'firstHalf' : period === 4 ? 'secondHalf' : period === 5 ? 'overtime' : null;
const choiceKey = period => period === 1 ? 'firstHalf' : period === 3 ? 'secondHalf' : 'overtime';
function resetPlayClock(state, remainingMs, reason) {
  state.playClock = { remainingMs, running: false, reason };
}
function stopClocks(state, reason, nextStart = 'none') {
  state.clock.running = false; state.clock.reason = reason; state.clock.nextStart = nextStart;
  state.playClock.running = false;
}
function requireRuling(state, event, code, detail) {
  state.status = 'requires_ruling';
  state.rulingRequired = { eventId: event.id, code, detail, factsSha256: event.factsSha256 ?? null, resumable: false };
  // Preserve the last known football facts and clock readings. Halting the
  // reducer does not reinterpret whether a game clock was running on the field.
}
function overtimeScaffold(state) {
  return { rulesVersion: 'nfl-2026-reg-16-1', maximumPeriodMs: 600_000,
    firstReceivingTeamId: null, opportunityByTeam: {
      [state.manifest.homeTeamId]: 'unadjudicated', [state.manifest.awayTeamId]: 'unadjudicated',
    }, adjudication: 'unsupported' };
}
function validateManifest(manifest) {
  object(manifest, ['id', 'season', 'gameType', 'homeTeamId', 'awayTeamId', 'inputSnapshotSha256'], 'manifest');
  identifier(manifest.id, 'manifest.id');
  if (manifest.season !== 2026 || manifest.gameType !== 'REG') fail('manifest', 'only 2026 regular season is in this research contract');
  for (const key of ['homeTeamId', 'awayTeamId']) if (typeof manifest[key] !== 'string' || !own(TEAM_NAMES, manifest[key])) fail(`manifest.${key}`, 'canonical NFL team required');
  if (manifest.homeTeamId === manifest.awayTeamId) fail('manifest', 'teams must differ');
  sha(manifest.inputSnapshotSha256, 'manifest.inputSnapshotSha256');
  return { ...manifest };
}
function initial(manifest) {
  return {
    version: GAME_STATE_POLICY.version, rulesVersion: GAME_STATE_POLICY.rulesVersion,
    researchOnly: true, rulesComplete: false, publicationReady: false,
    manifest: validateManifest(manifest), sequence: 0, eventIds: [], status: 'active', phase: 'pregame',
    origin: { kind: 'initial_conditions', sourceRef: null, verified: false },
    period: 1, score: { home: 0, away: 0 }, possessionTeamId: null, fieldPosition: null, down: null, lineToGain: null,
    clock: { remainingMs: 900_000, running: false, nextStart: 'legal_touch', reason: 'opening_kickoff' },
    playClock: { remainingMs: null, running: false, reason: 'not_ready' },
    timeouts: { home: 3, away: 3 }, timeoutUsedThisDeadBall: [],
    warnings: { firstHalf: 'not_due', secondHalf: 'not_due', overtime: 'not_due' },
    coinToss: null, overtimeToss: null, secondHalfFirstChoiceTeamId: null,
    choices: { firstHalf: [], secondHalf: [], overtime: [] }, choiceTurnTeamId: null,
    defendingNorthTeamId: null, pendingKickoff: null, untimedDown: null,
    officialTimeout: null, overtime: null, rulingRequired: null,
  };
}
export function createGameState(manifest) { return seal(initial(manifest)); }

// This importer accepts declared administrative facts, NOT verified game history.
// It imports no player statistics or live-ball conclusions and cannot approve a final.
export function createResearchGameCheckpoint(manifest, checkpoint) {
  object(checkpoint, ['sourceRef', 'period', 'remainingMs', 'clockRunning', 'nextClockStart', 'playClock',
    'score', 'possessionTeamId', 'fieldPosition', 'down', 'lineToGain', 'timeouts',
    'warningTaken', 'defendingNorthTeamId', 'secondHalfFirstChoiceTeamId'], 'checkpoint');
  const state = initial(manifest);
  identifier(checkpoint.sourceRef, 'checkpoint.sourceRef');
  const period = integer(checkpoint.period, 1, 5, 'checkpoint.period');
  const remaining = integer(checkpoint.remainingMs, 0, limit(period), 'checkpoint.remainingMs');
  boolean(checkpoint.clockRunning, 'checkpoint.clockRunning');
  oneOf(checkpoint.nextClockStart, ['snap', 'ready', 'none'], 'checkpoint.nextClockStart');
  if ((remaining === 0 && (checkpoint.clockRunning || checkpoint.nextClockStart !== 'none')) ||
      (remaining > 0 && checkpoint.nextClockStart === 'none')) fail('checkpoint', 'clock start condition contradicts remaining time');
  object(checkpoint.playClock, ['remainingMs', 'running'], 'checkpoint.playClock');
  integer(checkpoint.playClock.remainingMs, 1, 40_000, 'checkpoint.playClock.remainingMs');
  boolean(checkpoint.playClock.running, 'checkpoint.playClock.running');
  if (remaining === 0 && checkpoint.playClock.running) fail('checkpoint.playClock', 'expired period cannot run a dead-ball play clock');
  object(checkpoint.score, ['home', 'away'], 'checkpoint.score');
  for (const teamSide of ['home', 'away']) integer(checkpoint.score[teamSide], 0, 200, `checkpoint.score.${teamSide}`);
  side(state, checkpoint.possessionTeamId, 'checkpoint.possessionTeamId');
  finite(checkpoint.fieldPosition, 0.001, 99.999, 'checkpoint.fieldPosition');
  integer(checkpoint.down, 1, 4, 'checkpoint.down');
  finite(checkpoint.lineToGain, checkpoint.fieldPosition, 100, 'checkpoint.lineToGain');
  if (checkpoint.lineToGain <= checkpoint.fieldPosition) fail('checkpoint.lineToGain', 'a settled next down requires an unachieved line to gain');
  object(checkpoint.timeouts, ['home', 'away'], 'checkpoint.timeouts');
  for (const teamSide of ['home', 'away']) integer(checkpoint.timeouts[teamSide], 0, period === 5 ? 2 : 3, `checkpoint.timeouts.${teamSide}`);
  boolean(checkpoint.warningTaken, 'checkpoint.warningTaken');
  const wk = warningKey(period);
  if ((!wk || remaining > 120_000) && checkpoint.warningTaken) fail('checkpoint.warningTaken', 'warning cannot have occurred in this period/time');
  side(state, checkpoint.defendingNorthTeamId, 'checkpoint.defendingNorthTeamId');
  if (checkpoint.secondHalfFirstChoiceTeamId !== null) side(state, checkpoint.secondHalfFirstChoiceTeamId, 'checkpoint.secondHalfFirstChoiceTeamId');
  Object.assign(state, { origin: { kind: 'declared_research_checkpoint', sourceRef: checkpoint.sourceRef, verified: false },
    period, phase: remaining === 0 ? 'period_expired' : 'dead_ball', score: { ...checkpoint.score },
    possessionTeamId: checkpoint.possessionTeamId, fieldPosition: checkpoint.fieldPosition,
    down: checkpoint.down, lineToGain: checkpoint.lineToGain, timeouts: { ...checkpoint.timeouts },
    defendingNorthTeamId: checkpoint.defendingNorthTeamId, secondHalfFirstChoiceTeamId: checkpoint.secondHalfFirstChoiceTeamId,
    clock: { remainingMs: remaining, running: checkpoint.clockRunning, nextStart: checkpoint.nextClockStart, reason: 'declared_checkpoint' },
    playClock: { ...checkpoint.playClock, reason: 'declared_checkpoint' } });
  // The checkpoint declares the current period only. Never manufacture earlier
  // warning events merely because a later period was supplied.
  if (period > 2) state.warnings.firstHalf = 'unknown';
  if (period === 5) { state.warnings.secondHalf = 'unknown'; state.overtime = overtimeScaffold(state); }
  if (wk) state.warnings[wk] = checkpoint.warningTaken ? 'taken' : remaining <= 120_000 ? 'pending' : 'not_due';
  if (wk && state.warnings[wk] === 'pending') stopClocks(state, 'two_minute_warning_pending', 'snap');
  return seal(state);
}

const BASE = ['id', 'sequence', 'expectedBefore', 'type'];
const FIELDS = Object.freeze({
  coin_toss: ['winnerTeamId', 'defer'], half_choice: ['teamId', 'choice', 'goal'],
  ready_for_play: [], snap: [], elapse: ['elapsedMs'], team_timeout: ['teamId'],
  official_timeout: [], resume_official_timeout: [], two_minute_warning: [],
  period_end: [], start_period: [],
  untimed_down_pending: ['basis', 'factsSha256'],
  play_facts: ['kind', 'factsSha256'], adjudication: ['kind', 'factsSha256'],
});
function validateEvent(state, event) {
  if (!event || typeof event !== 'object') fail('event', 'expected a plain event');
  const descriptor = Object.getOwnPropertyDescriptor(event, 'type');
  if (!descriptor || !own(descriptor, 'value')) fail('event.type', 'plain event type required');
  const type = descriptor.value;
  if (typeof type !== 'string' || !own(FIELDS, type)) fail('event.type', 'unsupported event schema');
  object(event, [...BASE, ...FIELDS[type]], 'event');
  identifier(event.id, 'event.id');
  integer(event.sequence, 1, GAME_STATE_POLICY.maxEvents, 'event.sequence');
  need(event.sequence === state.sequence + 1, 'event.sequence', 'sequence does not follow this state');
  need(!state.eventIds.includes(event.id), 'event.id', 'event ID has already been used');
  need(typeof event.expectedBefore === 'string' && event.expectedBefore === gameStateKey(state), 'event.expectedBefore', 'event is not bound to this exact previous state');
  if (type === 'coin_toss') { side(state, event.winnerTeamId); boolean(event.defer, 'event.defer'); }
  if (type === 'half_choice') {
    side(state, event.teamId); oneOf(event.choice, ['receive', 'kick', 'defend_goal'], 'event.choice');
    oneOf(event.goal, event.choice === 'defend_goal' ? ['north', 'south'] : [null], 'event.goal');
  }
  if (type === 'team_timeout') side(state, event.teamId);
  if (type === 'elapse') integer(event.elapsedMs, 1, 900_000, 'event.elapsedMs');
  if (['play_facts', 'adjudication', 'untimed_down_pending'].includes(type)) sha(event.factsSha256, 'event.factsSha256');
  if (type === 'play_facts') oneOf(event.kind, ['kickoff', 'scrimmage', 'punt', 'field_goal', 'try', 'turnover', 'safety_kick'], 'event.kind');
  if (type === 'adjudication') oneOf(event.kind, ['penalty', 'runoff', 'review', 'injury_timeout', 'clock_correction', 'overtime_possession'], 'event.kind');
  if (type === 'untimed_down_pending') oneOf(event.basis, ['defensive_foul', 'try', 'fair_catch', 'double_foul', 'other_rule_4_8'], 'event.basis');
}
function noPendingWarning(state) {
  const wk = warningKey(state.period);
  need(!wk || state.warnings[wk] !== 'pending', 'state.warnings', 'the pending two-minute warning must be administered');
}
function chooseHalf(state, event) {
  need(state.phase === 'half_choices' && state.choiceTurnTeamId === event.teamId, 'half_choice', 'not this team’s choice');
  const key = choiceKey(state.period); const choices = state.choices[key];
  if (choices.length) {
    const firstWasGoal = choices[0].choice === 'defend_goal';
    need(firstWasGoal !== (event.choice === 'defend_goal'), 'half_choice', 'the other team must select the remaining privilege');
  }
  choices.push({ teamId: event.teamId, choice: event.choice, goal: event.goal });
  if (choices.length === 1) { state.choiceTurnTeamId = other(state, event.teamId); return; }
  const kickChoice = choices.find(choice => choice.choice !== 'defend_goal');
  const goalChoice = choices.find(choice => choice.choice === 'defend_goal');
  const receiver = kickChoice.choice === 'receive' ? kickChoice.teamId : other(state, kickChoice.teamId);
  state.defendingNorthTeamId = goalChoice.goal === 'north' ? goalChoice.teamId : other(state, goalChoice.teamId);
  state.choiceTurnTeamId = null; state.phase = 'kickoff_pending';
  state.pendingKickoff = { reason: key, receivingTeamId: receiver, kickingTeamId: other(state, receiver) };
  if (state.period === 5) state.overtime.firstReceivingTeamId = receiver;
  stopClocks(state, 'kickoff_pending', 'legal_touch'); resetPlayClock(state, 25_000, 'free_kick');
}
function elapsed(state, event) {
  need(['dead_ball', 'live_ball', 'kickoff_pending'].includes(state.phase) && !state.officialTimeout, 'elapse', 'no clock interval is active');
  need(state.clock.running || state.playClock.running, 'elapse', 'both clocks are stopped');
  // Rule 3-41: a down already in progress continues through the threshold.
  // The warning remains pending until a future live-ball reducer settles it.
  if (state.phase !== 'live_ball') noPendingWarning(state);
  const wk = warningKey(state.period);
  const warningDistance = wk && state.warnings[wk] === 'not_due' && state.clock.remainingMs > 120_000 ? state.clock.remainingMs - 120_000 : null;
  const boundaries = [];
  if (state.clock.running) boundaries.push(state.clock.remainingMs);
  if (state.playClock.running) boundaries.push(state.playClock.remainingMs);
  if (state.phase !== 'live_ball' && state.clock.running && warningDistance !== null) boundaries.push(warningDistance);
  need(event.elapsedMs <= Math.min(...boundaries), 'elapse', 'split the clock interval at the next administrative boundary');
  if (state.clock.running) state.clock.remainingMs -= event.elapsedMs;
  if (state.playClock.running) state.playClock.remainingMs -= event.elapsedMs;
  const warningNow = wk && state.warnings[wk] === 'not_due' && state.clock.remainingMs <= 120_000;
  if (warningNow) state.warnings[wk] = 'pending';
  const playExpired = state.playClock.running && state.playClock.remainingMs === 0;
  if (playExpired) state.playClock.running = false;
  if (state.clock.remainingMs === 0) {
    stopClocks(state, 'period_expired');
    if (state.phase !== 'live_ball') state.phase = 'period_expired';
  } else if (warningNow && state.phase !== 'live_ball') stopClocks(state, 'two_minute_warning_pending', 'snap');
  if (playExpired) requireRuling(state, event, 'PLAY_CLOCK_EXPIRY_REQUIRES_RULING', 'No snap was supplied; delay-of-game and simultaneous clock boundaries require adjudication.');
}

export function reduceGameEvent(previous, event) {
  stateRequired(previous);
  need(previous.status === 'active', 'state.status', 'requires_ruling is a terminal research halt; no resume override is supported');
  validateEvent(previous, event);
  // Work on a detached copy; validation/unsupported inputs cannot partially
  // alter the prior object, its statistics, score, or input provenance.
  const state = JSON.parse(canonical(previous));
  const type = event.type;
  if (type === 'play_facts' || type === 'adjudication') {
    requireRuling(state, event, 'UNSUPPORTED_ADJUDICATION', `${event.kind} facts require a future rules reducer; no football result was applied.`);
  } else if (type === 'untimed_down_pending') {
    need(state.clock.remainingMs === 0 && ['period_expired', 'live_ball'].includes(state.phase), type, 'an extension requires an expired period');
    state.untimedDown = { basis: event.basis, factsSha256: event.factsSha256, eligibility: 'unadjudicated' };
    requireRuling(state, event, 'UNTIMED_DOWN_REQUIRES_RULING', 'Rule 4-8 facts and election must be adjudicated before extending or ending this period.');
  } else if (type === 'coin_toss') {
    need(['pregame', 'overtime_pending'].includes(state.phase), type, 'a toss is not pending');
    if (state.phase === 'overtime_pending') {
      if (event.defer) requireRuling(state, event, 'OVERTIME_CHOICE_REQUIRES_RULING', 'Overtime deferral is outside this administrative scaffold.');
      else {
        state.period = 5; state.overtimeToss = { winnerTeamId: event.winnerTeamId, defer: false };
        state.clock = { remainingMs: 600_000, running: false, nextStart: 'legal_touch', reason: 'overtime_kickoff' };
        state.timeouts = { home: 2, away: 2 }; state.timeoutUsedThisDeadBall = [];
        state.phase = 'half_choices'; state.choiceTurnTeamId = event.winnerTeamId;
      }
    } else {
      state.coinToss = { winnerTeamId: event.winnerTeamId, defer: event.defer };
      state.choiceTurnTeamId = event.defer ? other(state, event.winnerTeamId) : event.winnerTeamId;
      state.secondHalfFirstChoiceTeamId = other(state, state.choiceTurnTeamId);
      state.phase = 'half_choices';
    }
  } else if (type === 'half_choice') chooseHalf(state, event);
  else if (type === 'ready_for_play') {
    need(['dead_ball', 'kickoff_pending'].includes(state.phase) && !state.officialTimeout, type, 'no administrative ready signal is pending');
    noPendingWarning(state);
    // 4-3-2(a), 4-6-1: a 40-second play clock can already be running while
    // the ball is returned after an ordinary out-of-bounds play. A ready
    // signal starts the stopped game clock without resetting that play clock.
    const gameReadyOnly = !state.clock.running && state.clock.nextStart === 'ready';
    need(state.playClock.remainingMs > 0 && (!state.playClock.running || gameReadyOnly), type, 'no pending clock start or play clock is not set');
    state.playClock.running = true;
    if (state.clock.nextStart === 'ready') { state.clock.running = true; state.clock.reason = 'ready_for_play'; }
  } else if (type === 'snap') {
    need(state.phase === 'dead_ball' && !state.officialTimeout && state.clock.remainingMs > 0, type, 'a timed scrimmage snap requires a ready dead ball');
    noPendingWarning(state);
    need(state.playClock.running && state.playClock.remainingMs > 0, type, 'snap requires a running unexpired play clock');
    state.phase = 'live_ball'; state.clock.running = true; state.clock.reason = 'snap';
    state.playClock.running = false; state.timeoutUsedThisDeadBall = [];
  } else if (type === 'elapse') elapsed(state, event);
  else if (type === 'team_timeout') {
    need(['dead_ball', 'kickoff_pending'].includes(state.phase) && state.clock.remainingMs > 0, type, 'ordinary charged timeout requires a dead ball in a running period');
    noPendingWarning(state);
    const teamSide = side(state, event.teamId);
    if (state.timeouts[teamSide] === 0 || state.timeoutUsedThisDeadBall.includes(event.teamId)) {
      requireRuling(state, event, 'TIMEOUT_REQUEST_REQUIRES_RULING', 'Excess/repeated requests may be ignored or require enforcement; no timeout or penalty was invented.');
    } else {
      state.timeouts[teamSide] -= 1; state.timeoutUsedThisDeadBall.push(event.teamId);
      state.officialTimeout = null;
      stopClocks(state, 'team_timeout', state.phase === 'kickoff_pending' ? 'legal_touch' : 'snap');
      resetPlayClock(state, 25_000, 'team_timeout');
    }
  } else if (type === 'official_timeout') {
    need(['dead_ball', 'kickoff_pending'].includes(state.phase) && !state.officialTimeout, type, 'ordinary official timeout requires an available dead-ball state');
    noPendingWarning(state);
    state.officialTimeout = { clock: { ...state.clock }, playClock: { ...state.playClock } };
    stopClocks(state, 'official_timeout', previous.clock.nextStart);
  } else if (type === 'resume_official_timeout') {
    need(state.officialTimeout !== null, type, 'no official timeout to resume');
    if (state.officialTimeout.playClock.remainingMs !== null && state.officialTimeout.playClock.remainingMs < 10_000) {
      requireRuling(state, event, 'PLAY_CLOCK_RESET_REQUIRES_RULING', 'Rule 4-6-3 permits an official reset choice below ten seconds; this scaffold does not choose it.');
    } else {
      state.clock = state.officialTimeout.clock; state.playClock = state.officialTimeout.playClock;
      state.officialTimeout = null;
    }
  } else if (type === 'two_minute_warning') {
    const wk = warningKey(state.period);
    need(state.phase === 'dead_ball' && wk && state.warnings[wk] === 'pending', type, 'warning requires a dead ball after the threshold is reached');
    need(state.clock.remainingMs > 0, type, 'an expired half cannot be reopened by a warning');
    state.warnings[wk] = 'taken'; state.officialTimeout = null;
    stopClocks(state, 'two_minute_warning', 'snap'); resetPlayClock(state, 25_000, 'two_minute_warning');
  } else if (type === 'period_end') {
    need(state.phase === 'period_expired' && state.clock.remainingMs === 0 && !state.untimedDown && !state.officialTimeout, type, 'a settled expired period is required');
    const wk = warningKey(state.period);
    need(!wk || state.warnings[wk] === 'taken', type, 'checkpoint omitted required warning administration');
    state.pendingKickoff = null; state.timeoutUsedThisDeadBall = [];
    if (state.period === 1 || state.period === 3) state.phase = 'intermission';
    else if (state.period === 2) {
      state.phase = 'halftime'; state.possessionTeamId = null; state.fieldPosition = null; state.down = null; state.lineToGain = null;
    } else if (state.period === 4 && state.score.home === state.score.away) {
      state.phase = 'overtime_pending'; state.overtime = overtimeScaffold(state);
      state.possessionTeamId = null; state.fieldPosition = null; state.down = null; state.lineToGain = null;
    } else requireRuling(state, event, 'GAME_RESULT_REQUIRES_RULING', 'A final result needs verified game/OT adjudication; declared checkpoint scores are not certified outcomes.');
  } else if (type === 'start_period') {
    need(['intermission', 'halftime'].includes(state.phase), type, 'no next regulation period is pending');
    const halftime = state.phase === 'halftime';
    if (halftime && state.secondHalfFirstChoiceTeamId === null) {
      requireRuling(state, event, 'HALF_CHOICE_REQUIRES_RULING', 'The declared checkpoint does not establish who has the first second-half choice.');
    } else {
      state.period += 1; state.clock = { remainingMs: 900_000, running: false, nextStart: halftime ? 'legal_touch' : 'snap', reason: 'period_start' };
      if (halftime) {
        state.phase = 'half_choices'; state.timeouts = { home: 3, away: 3 };
        state.choiceTurnTeamId = state.secondHalfFirstChoiceTeamId; state.defendingNorthTeamId = null;
        state.playClock = { remainingMs: null, running: false, reason: 'not_ready' };
      } else {
        state.phase = 'dead_ball'; state.defendingNorthTeamId = other(state, state.defendingNorthTeamId);
        resetPlayClock(state, 25_000, 'period_start');
      }
    }
  }
  state.sequence = event.sequence; state.eventIds.push(event.id);
  return seal(state);
}
