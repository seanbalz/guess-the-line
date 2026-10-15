// Research-only replay ledger. This module consumes outcomes; it never predicts, samples, fetches,
// writes, or certifies a model or a data licence. No replay produced here is approved for publication.
//
// Canonical input: { id, modelVersion, inputAsOf, seed, teams: { home, away },
//   roster: { asOf, sourceUrl, licenseUrl, players: [{ id, name, teamId }] },
//   initialReceivingTeamId, plays: [...] }. Teams use canonical NFL id/name/abbreviation.
// Every play has { id, type, quarter, clockSeconds }; its clock is the AFTER-play clock.
//   kickoff:     receivingTeamId, fieldPosition (resolved, non-scoring receiving spot)
//   pass:        passerId, receiverId (null for incomplete), complete, yards
//   run:         rusherId, yards
//   sack:        passerId, yards (nonpositive; no individual passing/rushing yard credit)
//   punt:        kickerId, receivingFieldPosition (resolved net spot, including any return)
//   field_goal:  kickerId, made, kickSpot (offense-relative; untouched, unreturned miss only)
//   extra_point: kickerId, made (one-point kick only, at the touchdown's clock)
//   turnover:    reason ('interception'|'fumble'), playerId, defenderId, spot, returnYards
//                A fumble must be at the line of scrimmage: gained-yard/stat attribution is unsupported.
//   penalty:     foul ('false_start'|'offside'), againstTeamId (no play; full five-yard enforcement)
//   period_end:  no extra fields; clock must be zero. Q1/Q3 carry the drive, halftime resets it.
//
// Field position is yards from the CURRENT possessing team's goal line (1..99 during a drive).
// Down/distance, first downs, turnovers on downs, score, cumulative player stats and captions are derived.
// Kick/return endpoints are supplied resolved outcomes, not invented placements or kickoff-rule inference.
// Scoring is 6/3/1; this is a deliberately narrow regulation policy, not a complete NFL rules engine.
// It rejects safeties, return touchdowns, two-point tries, onside kicks, blocked/returned field goals,
// laterals, multistage fumbles, live-ball/multiple/half-distance penalties and untimed downs.
// A tied Q4 ends as overtime_required, never a fabricated final. Unsupported inputs fail atomically.
// Rules reference: https://operations.nfl.com/rules-officiating/2026-nfl-rulebook (Rule 11).
import { TEAM_NAMES } from './nfl-schedule.mjs';

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export const REPLAY_POLICY = freeze({
  id: 'regulation-research-v1', quarters: 4, secondsPerQuarter: 900,
  maxRosterAgeHours: 168, maxPlayers: 200, maxPlays: 1000,
  overtime: 'unsupported', halftime: 'opposite-initial-receiver', publicationReady: false,
});

export class ReplayValidationError extends Error {
  constructor(code, path, detail) {
    super(`${path}: ${detail}`);
    this.name = 'ReplayValidationError';
    this.code = code;
    this.path = path;
  }
}

const fail = (path, detail, code = 'REPLAY_INVALID_INPUT') => { throw new ReplayValidationError(code, path, detail); };
const requireState = (condition, path, detail) => { if (!condition) fail(path, detail, 'REPLAY_INVALID_SEQUENCE'); };
const unsupported = (condition, path, detail) => { if (condition) fail(path, detail, 'REPLAY_UNSUPPORTED_OUTCOME'); };
function record(value, path, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, 'expected a plain object');
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) fail(path, `expected exactly: ${keys.join(', ')}`);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) fail(`${path}.${key}`, 'expected an enumerable value, not an accessor');
  }
  return value;
}
function array(value, path, max) {
  if (!Array.isArray(value) || value.length > max) fail(path, `expected an array of at most ${max} items`);
  if (Reflect.ownKeys(value).length !== value.length + 1) fail(path, 'sparse arrays or extra array properties are not supported');
  for (let i = 0; i < value.length; i += 1) if (!Object.hasOwn(value, i) || !('value' in Object.getOwnPropertyDescriptor(value, i))) fail(`${path}[${i}]`, 'expected a plain item');
  return value;
}
function text(value, path, max = 120) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value || /[\p{C}<>]/u.test(value)) fail(path, 'expected bounded, nonempty plain text');
  return value;
}
function id(value, path) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(value)) fail(path, 'invalid stable identifier');
  return value;
}
function integer(value, path, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max || Object.is(value, -0)) fail(path, `expected an integer from ${min} to ${max}`);
  return value;
}
function bool(value, path) { if (typeof value !== 'boolean') fail(path, 'expected a boolean'); return value; }
function timestamp(value, path) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) fail(path, 'expected a UTC ISO timestamp');
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== (value.includes('.') ? value : value.replace('Z', '.000Z'))) fail(path, 'invalid calendar timestamp');
  return time;
}
function sourceUrl(value, path) {
  text(value, path, 2048);
  let parsed;
  try { parsed = new URL(value); } catch { fail(path, 'expected an HTTPS source URL'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) fail(path, 'expected an HTTPS source URL without credentials');
  return value;
}
const BASE = ['id', 'type', 'quarter', 'clockSeconds'];
const FIELDS = Object.freeze({
  kickoff: ['receivingTeamId', 'fieldPosition'], pass: ['passerId', 'receiverId', 'complete', 'yards'],
  run: ['rusherId', 'yards'], sack: ['passerId', 'yards'], punt: ['kickerId', 'receivingFieldPosition'],
  field_goal: ['kickerId', 'made', 'kickSpot'], extra_point: ['kickerId', 'made'],
  turnover: ['reason', 'playerId', 'defenderId', 'spot', 'returnYards'],
  penalty: ['foul', 'againstTeamId'], period_end: [],
});
const STAT_KEYS = ['passingYards', 'rushingYards', 'receivingYards', 'passingTD', 'rushingTD', 'receivingTD', 'receptions'];

/** Build a deep-frozen, deterministic ledger from validated metadata and supplied outcomes. No inputs are mutated. */
export function buildReplay(input) {
  record(input, 'replay', ['id', 'modelVersion', 'inputAsOf', 'seed', 'teams', 'roster', 'initialReceivingTeamId', 'plays']);
  const replayId = id(input.id, 'replay.id');
  text(input.modelVersion, 'replay.modelVersion');
  const asOf = timestamp(input.inputAsOf, 'replay.inputAsOf');
  if (typeof input.seed === 'number') integer(input.seed, 'replay.seed', 0, 0xffff_ffff);
  else text(input.seed, 'replay.seed');
  record(input.teams, 'replay.teams', ['home', 'away']);
  const teams = {};
  for (const side of ['home', 'away']) {
    const team = record(input.teams[side], `replay.teams.${side}`, ['id', 'name', 'abbreviation']);
    id(team.id, `replay.teams.${side}.id`);
    if (!Object.hasOwn(TEAM_NAMES, team.id) || team.name !== TEAM_NAMES[team.id] || team.abbreviation !== team.id) fail(`replay.teams.${side}`, 'expected a canonical NFL team id, name and abbreviation');
    teams[side] = { ...team };
  }
  if (teams.home.id === teams.away.id) fail('replay.teams', 'teams must differ');
  const sideFor = teamId => teamId === teams.home.id ? 'home' : teamId === teams.away.id ? 'away' : null;
  const other = teamId => teamId === teams.home.id ? teams.away.id : teams.home.id;
  const fieldText = (teamId, spot) => spot === 50 ? 'midfield' : spot < 50 ? `their own ${spot}-yard line` : `${other(teamId)}'s ${100 - spot}-yard line`;
  if (!sideFor(input.initialReceivingTeamId)) fail('replay.initialReceivingTeamId', 'team is outside this matchup');
  const roster = record(input.roster, 'replay.roster', ['asOf', 'sourceUrl', 'licenseUrl', 'players']);
  const rosterAsOf = timestamp(roster.asOf, 'replay.roster.asOf');
  if (rosterAsOf > asOf || asOf - rosterAsOf > REPLAY_POLICY.maxRosterAgeHours * 3_600_000) fail('replay.roster.asOf', 'roster must be at or before inputAsOf and within the declared seven-day research window');
  sourceUrl(roster.sourceUrl, 'replay.roster.sourceUrl');
  sourceUrl(roster.licenseUrl, 'replay.roster.licenseUrl');
  const players = new Map();
  array(roster.players, 'replay.roster.players', REPLAY_POLICY.maxPlayers).forEach((row, i) => {
    const path = `replay.roster.players[${i}]`;
    record(row, path, ['id', 'name', 'teamId']);
    id(row.id, `${path}.id`); text(row.name, `${path}.name`);
    if (!sideFor(row.teamId)) fail(`${path}.teamId`, 'player team is outside this matchup');
    if (players.has(row.id)) fail(`${path}.id`, 'duplicate roster identifier');
    players.set(row.id, { ...row });
  });
  for (const team of Object.values(teams)) if (![...players.values()].some(player => player.teamId === team.id)) fail('replay.roster.players', 'both teams need roster metadata');
  const plays = array(input.plays, 'replay.plays', REPLAY_POLICY.maxPlays);
  const seenIds = new Set(['initial']);
  const stats = new Map();
  const state = { quarter: 1, clockSeconds: 900, possessionTeamId: null, fieldPosition: null, down: null, lineToGain: null,
    score: { home: 0, away: 0 }, phase: 'kickoff', receivingTeamId: input.initialReceivingTeamId };
  let status = 'incomplete';
  let nextQuarter = false;
  const player = (playerId, teamId, path) => {
    id(playerId, path);
    const row = players.get(playerId);
    if (!row || row.teamId !== teamId) fail(path, 'player is not in the supplied roster for this team', 'REPLAY_UNKNOWN_PLAYER');
    return row;
  };
  function stat(row, key, amount) {
    if (!stats.has(row.id)) stats.set(row.id, { ...row, ...Object.fromEntries(STAT_KEYS.map(name => [name, 0])) });
    stats.get(row.id)[key] += amount;
  }
  function drive(teamId, spot) {
    state.phase = 'drive'; state.possessionTeamId = teamId; state.fieldPosition = spot;
    state.down = 1; state.lineToGain = Math.min(100, spot + 10); state.receivingTeamId = null;
  }
  function awaitingKickoff(scoringTeam) {
    state.phase = 'kickoff'; state.possessionTeamId = null; state.fieldPosition = null;
    state.down = null; state.lineToGain = null; state.receivingTeamId = other(scoringTeam);
  }
  function gain(yards, path) {
    const spot = state.fieldPosition + yards;
    unsupported(spot <= 0, path, 'safety/end-zone recovery requires an unsupported rule');
    unsupported(spot > 100, path, 'yardage extends beyond the goal line');
    state.fieldPosition = spot;
    if (spot === 100) {
      state.score[sideFor(state.possessionTeamId)] += 6;
      state.phase = 'try'; state.down = null; state.lineToGain = null;
      return ' Touchdown.';
    }
    if (spot >= state.lineToGain) { state.down = 1; state.lineToGain = Math.min(100, spot + 10); return ' First down.'; }
    if (state.down === 4) { drive(other(state.possessionTeamId), 100 - spot); return ' Turnover on downs.'; }
    state.down += 1;
    return '';
  }
  function snapshot(eventId, type, caption) {
    return freeze({ id: eventId, type, quarter: state.quarter, clockSeconds: state.clockSeconds,
      possessionTeamId: state.possessionTeamId, fieldPosition: state.fieldPosition, down: state.down,
      distance: state.lineToGain === null ? null : state.lineToGain - state.fieldPosition,
      score: { ...state.score }, caption,
      playerStats: [...stats.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(row => ({ ...row })) });
  }
  const events = [snapshot('initial', 'initial', 'Simulation ready. Awaiting the opening kickoff.')];
  plays.forEach((play, i) => {
    const path = `replay.plays[${i}]`;
    // Validate the descriptor before reading type, so untrusted accessors never execute.
    if (!play || typeof play !== 'object' || !Object.hasOwn(play, 'type') || !('value' in Object.getOwnPropertyDescriptor(play, 'type'))) fail(path, 'expected a play with a plain type');
    if (typeof play.type !== 'string' || !Object.hasOwn(FIELDS, play.type)) fail(`${path}.type`, 'unsupported play type', 'REPLAY_UNSUPPORTED_PLAY');
    record(play, path, [...BASE, ...FIELDS[play.type]]);
    id(play.id, `${path}.id`);
    if (seenIds.has(play.id)) fail(`${path}.id`, 'duplicate or reserved event identifier');
    seenIds.add(play.id);
    requireState(i !== 0 || play.type === 'kickoff', path, 'the opening event must be a kickoff');
    integer(play.quarter, `${path}.quarter`, 1, 4);
    integer(play.clockSeconds, `${path}.clockSeconds`, 0, 900);
    requireState(status === 'incomplete', path, 'no event may follow the end of regulation');
    if (nextQuarter) { state.quarter += 1; state.clockSeconds = 900; nextQuarter = false; }
    requireState(play.quarter === state.quarter && play.clockSeconds <= state.clockSeconds, path, 'quarter or clock is out of order; explicit period_end markers are required');
    const beforeClock = state.clockSeconds;
    if (beforeClock === 0 && !['extra_point', 'period_end'].includes(play.type)) fail(path, 'untimed downs/kickoffs are unsupported', 'REPLAY_UNSUPPORTED_OUTCOME');
    state.clockSeconds = play.clockSeconds;
    const offense = state.possessionTeamId;
    let caption;
    if (play.type === 'period_end') {
      requireState(play.clockSeconds === 0 && state.phase !== 'try' && (state.phase !== 'kickoff' || beforeClock === 0), path, 'period end needs zero clock and no unresolved try or kickoff');
      caption = `End of quarter ${state.quarter}.`;
      if (state.quarter === 4) {
        status = state.score.home === state.score.away ? 'overtime_required' : 'complete';
        caption = status === 'overtime_required' ? 'End of regulation. Tied; overtime is not supported.' : 'End of the supplied regulation simulation.';
        state.phase = 'ended'; state.possessionTeamId = null; state.fieldPosition = null; state.down = null; state.lineToGain = null;
      } else {
        nextQuarter = true;
        if (state.quarter === 2) {
          state.phase = 'kickoff'; state.receivingTeamId = other(input.initialReceivingTeamId);
          state.possessionTeamId = null; state.fieldPosition = null; state.down = null; state.lineToGain = null;
          caption = 'Halftime. Awaiting the second-half kickoff.';
        }
      }
    } else if (play.type === 'kickoff') {
      requireState(state.phase === 'kickoff' && play.receivingTeamId === state.receivingTeamId, path, 'kickoff is not due for this receiving team');
      const spot = integer(play.fieldPosition, `${path}.fieldPosition`, 1, 99);
      drive(play.receivingTeamId, spot);
      caption = `${teams[sideFor(play.receivingTeamId)].name} receive the kickoff at ${fieldText(play.receivingTeamId, spot)}.`;
    } else if (play.type === 'extra_point') {
      requireState(state.phase === 'try' && play.clockSeconds === beforeClock, path, 'one-point try must follow a touchdown without running game time');
      const kicker = player(play.kickerId, offense, `${path}.kickerId`);
      bool(play.made, `${path}.made`);
      if (play.made) state.score[sideFor(offense)] += 1;
      caption = `${kicker.name} ${play.made ? 'makes' : 'misses'} the extra point.`;
      awaitingKickoff(offense);
    } else {
      requireState(state.phase === 'drive', path, 'a scrimmage play requires an active drive');
      if (play.type === 'pass') {
        const passer = player(play.passerId, offense, `${path}.passerId`);
        bool(play.complete, `${path}.complete`); integer(play.yards, `${path}.yards`, -99, 99);
        if (!play.complete && (play.receiverId !== null || play.yards !== 0)) fail(path, 'an incomplete pass must have null receiver and zero yards');
        const receiver = play.complete ? player(play.receiverId, offense, `${path}.receiverId`) : null;
        if (receiver?.id === passer.id) fail(path, 'a self-caught/lateral pass is unsupported', 'REPLAY_UNSUPPORTED_OUTCOME');
        const touchdown = state.fieldPosition + play.yards === 100;
        stat(passer, 'passingYards', play.yards);
        if (receiver) { stat(receiver, 'receivingYards', play.yards); stat(receiver, 'receptions', 1); }
        if (touchdown) { stat(passer, 'passingTD', 1); stat(receiver, 'receivingTD', 1); }
        caption = receiver ? `${passer.name} completes to ${receiver.name} for ${play.yards} yards.` : `${passer.name} throws an incomplete pass.`;
        caption += gain(play.yards, path);
      } else if (play.type === 'run') {
        const runner = player(play.rusherId, offense, `${path}.rusherId`);
        integer(play.yards, `${path}.yards`, -99, 99);
        stat(runner, 'rushingYards', play.yards);
        if (state.fieldPosition + play.yards === 100) stat(runner, 'rushingTD', 1);
        caption = `${runner.name} rushes for ${play.yards} yards.${gain(play.yards, path)}`;
      } else if (play.type === 'sack') {
        const passer = player(play.passerId, offense, `${path}.passerId`);
        integer(play.yards, `${path}.yards`, -99, 0);
        stat(passer, 'passingYards', 0);
        caption = `${passer.name} is sacked for ${Math.abs(play.yards)} yards lost.${gain(play.yards, path)}`;
      } else if (play.type === 'punt') {
        const kicker = player(play.kickerId, offense, `${path}.kickerId`);
        const spot = integer(play.receivingFieldPosition, `${path}.receivingFieldPosition`, 1, 99);
        drive(other(offense), spot);
        caption = `${kicker.name} punts. ${teams[sideFor(state.possessionTeamId)].name} take possession at ${fieldText(state.possessionTeamId, spot)}.`;
      } else if (play.type === 'field_goal') {
        const kicker = player(play.kickerId, offense, `${path}.kickerId`);
        bool(play.made, `${path}.made`);
        integer(play.kickSpot, `${path}.kickSpot`, 1, state.fieldPosition);
        caption = `${kicker.name} ${play.made ? 'makes' : 'misses'} a ${110 - play.kickSpot}-yard field goal.`;
        if (play.made) { state.score[sideFor(offense)] += 3; awaitingKickoff(offense); }
        else drive(other(offense), Math.max(20, 100 - play.kickSpot));
      } else if (play.type === 'turnover') {
        if (!['interception', 'fumble'].includes(play.reason)) fail(`${path}.reason`, 'unsupported turnover');
        const lost = player(play.playerId, offense, `${path}.playerId`);
        const defender = player(play.defenderId, other(offense), `${path}.defenderId`);
        integer(play.spot, `${path}.spot`, 1, 99); integer(play.returnYards, `${path}.returnYards`, -99, 99);
        unsupported(play.reason === 'fumble' && play.spot !== state.fieldPosition, path, 'gained-yard or multistage fumble attribution is unsupported');
        const spot = 100 - play.spot + play.returnYards;
        unsupported(spot <= 0 || spot >= 100, path, 'turnover touchbacks, safeties and return touchdowns are unsupported');
        if (play.reason === 'interception') stat(lost, 'passingYards', 0);
        drive(other(offense), spot);
        caption = play.reason === 'interception' ? `${defender.name} intercepts ${lost.name}; return ${play.returnYards} yards.` : `${lost.name} loses a fumble to ${defender.name}; return ${play.returnYards} yards.`;
      } else if (play.type === 'penalty') {
        if (!['false_start', 'offside'].includes(play.foul)) fail(`${path}.foul`, 'only no-play false start and offside are supported', 'REPLAY_UNSUPPORTED_PLAY');
        const expected = play.foul === 'false_start' ? offense : other(offense);
        requireState(play.againstTeamId === expected, path, 'penalty team conflicts with the foul');
        requireState(play.clockSeconds === beforeClock, path, 'this no-play penalty cannot consume game time');
        const delta = play.foul === 'false_start' ? -5 : 5;
        // Full five-yard enforcement only. The half-distance boundary is deliberately rejected.
        unsupported(delta < 0 ? state.fieldPosition < 10 : 100 - state.fieldPosition < 10, path, 'half-distance/end-zone penalty enforcement is unsupported');
        state.fieldPosition += delta;
        if (state.fieldPosition >= state.lineToGain) { state.down = 1; state.lineToGain = Math.min(100, state.fieldPosition + 10); }
        caption = `${teams[sideFor(expected)].name}: ${play.foul === 'false_start' ? 'false start' : 'offside'}, five yards. No play.`;
      }
    }
    events.push(snapshot(play.id, play.type, caption));
  });
  return freeze({ id: replayId, simulationLabel: 'Simulation', readiness: 'research_only', publicationReady: false,
    policy: REPLAY_POLICY.id, status, modelVersion: input.modelVersion, inputAsOf: input.inputAsOf, seed: input.seed,
    teams, rosterProvenance: { asOf: roster.asOf, sourceUrl: roster.sourceUrl, licenseUrl: roster.licenseUrl, verification: 'declared_not_verified' }, events });
}

/** Rewind/seek is selection of an immutable snapshot, never subtraction from mutable totals. */
export function snapshotAt(replay, index) {
  if (!replay || !Array.isArray(replay.events) || replay.policy !== REPLAY_POLICY.id || !Object.isFrozen(replay) || !Object.isFrozen(replay.events)) fail('replay', 'expected a ledger returned by buildReplay');
  integer(index, 'index', 0, replay.events.length - 1);
  const event = replay.events[index];
  if (!event || !Object.isFrozen(event) || !event.score || !Object.isFrozen(event.score) || !Array.isArray(event.playerStats) || !Object.isFrozen(event.playerStats) || event.playerStats.some(row => !row || !Object.isFrozen(row))) fail('replay', 'expected deeply immutable snapshots');
  return event;
}
