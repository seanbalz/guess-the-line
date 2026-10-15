import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReplay, snapshotAt, ReplayValidationError, REPLAY_POLICY } from '../shared/simulation-replay.mjs';

// Artificial test metadata only. No supplied name or statistical outcome claims to describe an NFL player.
const BASE = {
  id: 'research-fixture', modelVersion: 'fixture-only-v1', inputAsOf: '2026-10-15T00:00:00Z', seed: 'repeatable-fixture',
  teams: { home: { id: 'BUF', name: 'Buffalo Bills', abbreviation: 'BUF' }, away: { id: 'SEA', name: 'Seattle Seahawks', abbreviation: 'SEA' } },
  roster: { asOf: '2026-10-14T00:00:00Z', sourceUrl: 'https://example.test/roster', licenseUrl: 'https://example.test/test-fixture-license', players: [
    { id: 'h-qb', name: 'Fixture home passer', teamId: 'BUF' }, { id: 'h-wr', name: 'Fixture home receiver', teamId: 'BUF' },
    { id: 'h-rb', name: 'Fixture home runner', teamId: 'BUF' }, { id: 'h-k', name: 'Fixture home kicker', teamId: 'BUF' },
    { id: 'h-def', name: 'Fixture home defender', teamId: 'BUF' },
    { id: 'a-qb', name: 'Fixture away passer', teamId: 'SEA' }, { id: 'a-wr', name: 'Fixture away receiver', teamId: 'SEA' },
    { id: 'a-rb', name: 'Fixture away runner', teamId: 'SEA' }, { id: 'a-k', name: 'Fixture away kicker', teamId: 'SEA' },
    { id: 'a-def', name: 'Fixture away defender', teamId: 'SEA' },
  ] }, initialReceivingTeamId: 'BUF', plays: [],
};
const p = (type, clockSeconds, fields = {}, quarter = 1, name = `${type}-${quarter}-${clockSeconds}`) => ({ id: name, type, quarter, clockSeconds, ...fields });
const kickoff = (fieldPosition = 25) => p('kickoff', 900, { receivingTeamId: 'BUF', fieldPosition });
const pass = (yards, clock = 850, fields = {}) => p('pass', clock, { passerId: 'h-qb', receiverId: 'h-wr', complete: true, yards, ...fields });
const run = (yards, clock = 850, rusherId = 'h-rb') => p('run', clock, { rusherId, yards });
const end = quarter => p('period_end', 0, {}, quarter);
const input = plays => ({ ...structuredClone(BASE), plays });
const build = plays => buildReplay(input(plays));
const last = replay => replay.events.at(-1);
const player = (snapshot, playerId) => snapshot.playerStats.find(row => row.id === playerId);
function rejects(value, code, part) {
  assert.throws(() => buildReplay(value), error => error instanceof ReplayValidationError && (!code || error.code === code) && (!part || error.message.includes(part)));
}
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

test('empty research ledger is paused, explicitly unvalidated, and contains no fabricated player totals', () => {
  const replay = build([]);
  assert.equal(replay.status, 'incomplete');
  assert.equal(replay.readiness, 'research_only');
  assert.equal(replay.publicationReady, false);
  assert.equal(replay.rosterProvenance.verification, 'declared_not_verified');
  assert.deepEqual(last(replay), { id: 'initial', type: 'initial', quarter: 1, clockSeconds: 900, possessionTeamId: null,
    fieldPosition: null, down: null, distance: null, score: { home: 0, away: 0 },
    caption: 'Simulation ready. Awaiting the opening kickoff.', playerStats: [] });
});

test('completion, yards, first downs and touchdown are derived once from the same ordered plays', () => {
  const replay = build([kickoff(25), pass(15), pass(-2, 830), pass(62, 800), p('extra_point', 800, { kickerId: 'h-k', made: true })]);
  assert.deepEqual(replay.events.slice(1, 4).map(s => [s.fieldPosition, s.down, s.distance]), [[25, 1, 10], [40, 1, 10], [38, 2, 12]]);
  const td = replay.events[4];
  assert.deepEqual([td.fieldPosition, td.down, td.distance, td.score], [100, null, null, { home: 6, away: 0 }]);
  assert.match(td.caption, /62 yards\. Touchdown\.$/);
  assert.equal(player(td, 'h-qb').passingYards, 75);
  assert.equal(player(td, 'h-qb').passingTD, 1);
  assert.equal(player(td, 'h-wr').receivingYards, 75);
  assert.equal(player(td, 'h-wr').receivingTD, 1);
  assert.equal(player(td, 'h-wr').receptions, 3);
  assert.deepEqual(last(replay).score, { home: 7, away: 0 });
  assert.deepEqual([last(replay).possessionTeamId, last(replay).fieldPosition, last(replay).down], [null, null, null]);
});

test('four incomplete passes change possession with correct field orientation and no reception credit', () => {
  const replay = build([kickoff(30), ...[890, 880, 870, 860].map(clock => pass(0, clock, { complete: false, receiverId: null }))]);
  const final = last(replay);
  assert.deepEqual([final.possessionTeamId, final.fieldPosition, final.down, final.distance], ['SEA', 70, 1, 10]);
  assert.equal(player(final, 'h-qb').passingYards, 0);
  assert.equal(player(final, 'h-wr'), undefined);
  assert.match(final.caption, /Turnover on downs/);
});

test('sacks advance down and field but do not subtract individual passing or rushing yards', () => {
  const replay = build([kickoff(40), pass(4), p('sack', 820, { passerId: 'h-qb', yards: -8 })]);
  assert.deepEqual([last(replay).fieldPosition, last(replay).down, last(replay).distance], [36, 3, 14]);
  assert.equal(player(last(replay), 'h-qb').passingYards, 4);
  assert.equal(player(last(replay), 'h-qb').rushingYards, 0);
});

test('rushing touchdown and missed try retain exactly six points and independent player statistics', () => {
  const replay = build([kickoff(95), run(5), p('extra_point', 850, { kickerId: 'h-k', made: false })]);
  assert.deepEqual(last(replay).score, { home: 6, away: 0 });
  assert.equal(player(last(replay), 'h-rb').rushingYards, 5);
  assert.equal(player(last(replay), 'h-rb').rushingTD, 1);
  assert.equal(player(last(replay), 'h-rb').receivingTD, 0);
});

test('field goals score three; untouched misses use the kick spot or receiving 20, never a guessed snap spot', () => {
  const made = build([kickoff(70), p('field_goal', 850, { kickerId: 'h-k', made: true, kickSpot: 63 })]);
  assert.deepEqual(last(made).score, { home: 3, away: 0 });
  assert.equal(last(made).possessionTeamId, null);
  assert.match(last(made).caption, /47-yard field goal/);
  for (const [field, kickSpot, receivingSpot] of [[70, 63, 37], [95, 88, 20], [87, 80, 20]]) {
    const missed = last(build([kickoff(field), p('field_goal', 850, { kickerId: 'h-k', made: false, kickSpot })]));
    assert.deepEqual([missed.possessionTeamId, missed.fieldPosition, missed.down, missed.distance], ['SEA', receivingSpot, 1, 10]);
    assert.deepEqual(missed.score, { home: 0, away: 0 });
  }
});

test('resolved punts switch field orientation without awarding receiving or rushing yards', () => {
  const final = last(build([kickoff(40), p('punt', 850, { kickerId: 'h-k', receivingFieldPosition: 13 })]));
  assert.deepEqual([final.possessionTeamId, final.fieldPosition, final.down, final.distance], ['SEA', 13, 1, 10]);
  assert.deepEqual(final.playerStats, []);
  assert.match(final.caption, /their own 13-yard line/);
});

test('field captions use the correct half and midfield for both receiving teams', () => {
  for (const [spot, expected] of [[25, 'their own 25-yard line'], [50, 'midfield'], [75, "SEA's 25-yard line"]]) {
    assert.ok(last(build([kickoff(spot)])).caption.endsWith(`at ${expected}.`));
  }
  for (const [spot, expected] of [[25, 'their own 25-yard line'], [50, 'midfield'], [75, "BUF's 25-yard line"]]) {
    assert.ok(last(build([kickoff(), p('punt', 850, { kickerId: 'h-k', receivingFieldPosition: spot })])).caption.endsWith(`at ${expected}.`));
  }
});

test('interceptions and line-of-scrimmage fumbles resolve the other team and net return spot', () => {
  for (const reason of ['interception', 'fumble']) {
    const final = last(build([kickoff(40), p('turnover', 850, { reason, playerId: reason === 'interception' ? 'h-qb' : 'h-rb', defenderId: 'a-def', spot: reason === 'interception' ? 60 : 40, returnYards: 8 })]));
    assert.deepEqual([final.possessionTeamId, final.fieldPosition, final.down, final.distance], ['SEA', reason === 'interception' ? 48 : 68, 1, 10]);
    assert.deepEqual(final.score, { home: 0, away: 0 });
    assert.ok(final.playerStats.every(row => row.passingYards === 0 && row.rushingYards === 0 && row.receivingYards === 0));
    assert.match(final.caption, /return 8 yards/);
  }
});

test('limited no-play penalties adjust line-to-gain without crediting stats or consuming a down', () => {
  const replay = build([kickoff(30), p('penalty', 900, { foul: 'false_start', againstTeamId: 'BUF' }), run(10, 880),
    p('penalty', 880, { foul: 'offside', againstTeamId: 'SEA' })]);
  assert.deepEqual(replay.events.slice(1).map(s => [s.fieldPosition, s.down, s.distance]), [[30, 1, 10], [25, 1, 15], [35, 2, 5], [40, 1, 10]]);
  assert.equal(player(last(replay), 'h-rb').rushingYards, 10);
  assert.equal(player(replay.events[2], 'h-rb'), undefined);
});

test('quarter transitions carry the drive; halftime explicitly resets possession; tied regulation is not a completed game', () => {
  const replay = build([kickoff(30), run(4), end(1), p('run', 880, { rusherId: 'h-rb', yards: 2 }, 2), end(2),
    p('kickoff', 900, { receivingTeamId: 'SEA', fieldPosition: 35 }, 3), end(3), end(4)]);
  assert.deepEqual([replay.events[4].quarter, replay.events[4].fieldPosition, replay.events[4].down, replay.events[4].distance], [2, 36, 3, 4]);
  assert.equal(replay.events[5].possessionTeamId, null);
  assert.equal(replay.events[6].possessionTeamId, 'SEA');
  assert.equal(replay.status, 'overtime_required');
  assert.match(last(replay).caption, /Tied; overtime is not supported/);
  assert.deepEqual([last(replay).quarter, last(replay).clockSeconds, last(replay).possessionTeamId, last(replay).fieldPosition], [4, 0, null, null]);
  assert.equal(replay.publicationReady, false);
});

test('a supplied unequal regulation ending is complete only under the research policy, never publication-ready', () => {
  const plays = [kickoff(75), p('field_goal', 850, { kickerId: 'h-k', made: true, kickSpot: 68 }),
    p('kickoff', 840, { receivingTeamId: 'SEA', fieldPosition: 35 }), end(1), end(2),
    p('kickoff', 900, { receivingTeamId: 'SEA', fieldPosition: 30 }, 3), end(3), end(4)];
  const replay = build(plays);
  assert.equal(replay.status, 'complete');
  assert.equal(replay.readiness, 'research_only');
  assert.equal(replay.publicationReady, false);
  assert.deepEqual(last(replay).score, { home: 3, away: 0 });
  rejects(input([...plays, p('run', 0, { rusherId: 'a-rb', yards: 1 }, 4)]), 'REPLAY_INVALID_SEQUENCE');
});

test('a zero-clock touchdown requires its try before ending the quarter; a fourth-quarter untimed play is refused', () => {
  const plays = [kickoff(99), run(1, 0), p('extra_point', 0, { kickerId: 'h-k', made: true }), end(1)];
  assert.deepEqual(last(build(plays)).score, { home: 7, away: 0 });
  rejects(input([kickoff(99), run(1, 0), end(1)]), 'REPLAY_INVALID_SEQUENCE');
  rejects(input([...plays.slice(0, 3), p('kickoff', 0, { receivingTeamId: 'SEA', fieldPosition: 35 })]), 'REPLAY_UNSUPPORTED_OUTCOME');
});

test('snapshots and metadata are deeply immutable; seeking backward neither replays nor subtracts totals', () => {
  const source = freeze(input([kickoff(), pass(7), run(3, 800)]));
  const before = JSON.stringify(source);
  const replay = buildReplay(source);
  assert.equal(JSON.stringify(source), before);
  const firstPass = snapshotAt(replay, 2);
  const final = snapshotAt(replay, 3);
  assert.equal(snapshotAt(replay, 2), firstPass);
  assert.equal(player(firstPass, 'h-rb'), undefined);
  assert.equal(player(final, 'h-rb').rushingYards, 3);
  for (const mutate of [() => { firstPass.score.home = 99; }, () => { firstPass.playerStats[0].passingYards = 99; },
    () => { replay.events.push({}); }, () => { replay.teams.home.name = 'changed'; }]) assert.throws(mutate, TypeError);
  assert.deepEqual(buildReplay(structuredClone(source)), replay);
  for (const index of [-1, 99, 0.5, '1', NaN, Infinity]) assert.throws(() => snapshotAt(replay, index), ReplayValidationError);
  assert.throws(() => snapshotAt(JSON.parse(JSON.stringify(replay)), 0), ReplayValidationError);
  const forged = Object.freeze({ policy: REPLAY_POLICY.id, events: Object.freeze([{ score: {}, playerStats: [] }]) });
  assert.throws(() => snapshotAt(forged, 0), ReplayValidationError);
});

test('unknown/wrong-team players and mismatched real-team metadata fail closed', () => {
  for (const passerId of ['not-in-roster', 'a-qb']) rejects(input([kickoff(), pass(4, 850, { passerId })]), 'REPLAY_UNKNOWN_PLAYER');
  rejects(input([kickoff(), pass(4, 850, { receiverId: 'a-wr' })]), 'REPLAY_UNKNOWN_PLAYER');
  const wrongTeam = input([]); wrongTeam.teams.home.name = 'Invented Club'; rejects(wrongTeam);
  const duplicate = input([]); duplicate.roster.players.push({ ...duplicate.roster.players[0] }); rejects(duplicate);
  const outsider = input([]); outsider.roster.players[0].teamId = 'KC'; rejects(outsider);
  const sameTeam = input([]); sameTeam.teams.away = { ...sameTeam.teams.home }; rejects(sameTeam);
  const noAway = input([]); noAway.roster.players = noAway.roster.players.filter(row => row.teamId === 'BUF'); rejects(noAway);
});

test('provenance must be explicit, bounded and temporally consistent; declarations do not certify rights', () => {
  for (const asOf of ['2026-10-16T00:00:00Z', '2026-10-07T23:59:59Z', '2026-02-30T00:00:00Z', 'yesterday', '2026-10-14']) {
    const value = input([]); value.roster.asOf = asOf; rejects(value);
  }
  const exactWindow = input([]); exactWindow.roster.asOf = '2026-10-08T00:00:00Z'; assert.equal(buildReplay(exactWindow).publicationReady, false);
  for (const url of ['', 'http://example.test', 'javascript:alert(1)', 'https://secret:password@example.test/']) {
    const value = input([]); value.roster.licenseUrl = url; rejects(value);
  }
  const missing = input([]); delete missing.roster.sourceUrl; rejects(missing);
});

test('adversarial input cannot inject totals, captions, unbounded values, getters or ambiguous event identities', () => {
  const mutations = [
    value => { value.plays[1].score = { home: 99, away: 0 }; }, value => { value.plays[1].caption = 'A fake final'; },
    value => { value.plays[1].yards = Infinity; }, value => { value.plays[1].yards = NaN; }, value => { value.plays[1].yards = '7'; },
    value => { value.plays[1].yards = 0.5; }, value => { value.plays[1].id = 'initial'; }, value => { value.plays[1].id = value.plays[0].id; },
    value => { value.seed = -1; }, value => { value.seed = 2 ** 32; }, value => { value.seed = {}; },
    value => { value.roster.players[0].name = '<script>unsafe</script>'; }, value => { value.roster.players[0].name = 'bad\u202Ename'; },
    value => { value.plays[1].receiverId = 'h-qb'; }, value => { value.plays[1].complete = false; },
    value => { value.plays[1].type = 'touchdown'; }, value => { value.plays[1].type = '__proto__'; },
    value => { delete value.plays[0]; }, value => { value.plays.extra = 1; }, value => { value.roster.players.length = 201; },
    value => { value.plays = Array.from({ length: 1001 }, () => kickoff()); },
  ];
  for (const mutate of mutations) { const value = input([kickoff(), pass(7)]); mutate(value); rejects(value); }
  const accessor = input([kickoff()]);
  let calls = 0;
  Object.defineProperty(accessor.plays[0], 'type', { enumerable: true, get() { calls += 1; return 'kickoff'; } });
  rejects(accessor); assert.equal(calls, 0);
});

test('field, clock and collection limits reject boundary overflows without truncating inputs', () => {
  for (const spot of [0, 100, -1, 25.5, NaN, '25']) rejects(input([kickoff(spot)]));
  for (const spot of [0, 100, -1, 25.5]) rejects(input([kickoff(), p('punt', 850, { kickerId: 'h-k', receivingFieldPosition: spot })]));
  for (const clock of [-1, 901, 0.5, NaN, '850']) rejects(input([kickoff(), run(4, clock)]));
  for (const spot of [1, 99]) assert.equal(last(build([kickoff(spot)])).fieldPosition, spot);
  const maxRoster = input([]);
  while (maxRoster.roster.players.length < REPLAY_POLICY.maxPlayers) maxRoster.roster.players.push({ id: `fixture-${maxRoster.roster.players.length}`, name: 'Additional fixture player', teamId: 'BUF' });
  assert.equal(buildReplay(maxRoster).status, 'incomplete');
  maxRoster.roster.players.push({ id: 'one-too-many', name: 'Additional fixture player', teamId: 'BUF' });
  rejects(maxRoster);
  const maxPlays = input(Array.from({ length: REPLAY_POLICY.maxPlays + 1 }, (_, i) => p('period_end', 0, {}, 1, `fixture-${i}`)));
  rejects(maxPlays, 'REPLAY_INVALID_INPUT', 'at most 1000');
});

test('illegal sequences and unsupported NFL outcomes are rejected instead of silently repaired', () => {
  const cases = [
    [run(5)], [kickoff(), run(5, 850), run(1, 860)], [kickoff(), p('run', 850, { rusherId: 'h-rb', yards: 4 }, 2)],
    [kickoff(), p('extra_point', 850, { kickerId: 'h-k', made: true })],
    [kickoff(95), run(5), run(1, 800)], [kickoff(95), run(5), p('extra_point', 840, { kickerId: 'h-k', made: true })],
    [kickoff(95), run(5), p('extra_point', 850, { kickerId: 'h-k', made: true }), p('kickoff', 840, { receivingTeamId: 'BUF', fieldPosition: 30 })],
    [kickoff(2), run(-2)], [kickoff(99), run(2)], [kickoff(), p('two_point', 850, { made: true })],
    [kickoff(), p('run', 850, { rusherId: 'h-rb', yards: 2 }, 5)],
    [kickoff(5), p('penalty', 900, { foul: 'false_start', againstTeamId: 'BUF' })],
    [kickoff(95), p('penalty', 900, { foul: 'offside', againstTeamId: 'SEA' })],
    [kickoff(), p('penalty', 900, { foul: 'holding', againstTeamId: 'BUF' })],
    [kickoff(), p('penalty', 899, { foul: 'false_start', againstTeamId: 'BUF' })],
    [kickoff(), p('penalty', 900, { foul: 'offside', againstTeamId: 'BUF' })],
    [kickoff(), p('field_goal', 850, { kickerId: 'h-k', made: false, kickSpot: 26 })],
    [kickoff(), p('turnover', 850, { reason: 'interception', playerId: 'h-qb', defenderId: 'a-def', spot: 30, returnYards: 30 })],
    [kickoff(), p('turnover', 850, { reason: 'fumble', playerId: 'h-rb', defenderId: 'a-def', spot: 40, returnYards: 0 })],
    [kickoff(), end(1), end(2), p('kickoff', 900, { receivingTeamId: 'BUF', fieldPosition: 30 }, 3)],
  ];
  for (const plays of cases) rejects(input(plays));
});

test('deterministic generated sequences preserve score/stat/field invariants and every prior snapshot', () => {
  // Property-style coverage over varied field positions and gains; generation lives only in tests.
  for (let seed = 1; seed <= 80; seed += 1) {
    let random = seed;
    const next = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random; };
    const plays = [kickoff(10 + next() % 60)];
    let replay = build(plays);
    const saved = [JSON.stringify(last(replay))];
    let expectedRushing = 0, expectedPassing = 0, receptions = 0;
    for (let n = 0; n < 12; n += 1) {
      const prior = last(replay);
      if (prior.possessionTeamId !== 'BUF' || prior.fieldPosition === 100) break;
      const yards = Math.min(next() % 14, 100 - prior.fieldPosition);
      const isPass = next() % 2 === 0;
      plays.push(isPass ? pass(yards, 890 - n * 20) : run(yards, 890 - n * 20));
      if (isPass) { expectedPassing += yards; receptions += 1; } else expectedRushing += yards;
      replay = build(plays);
      const current = last(replay);
      assert.equal(player(current, 'h-rb')?.rushingYards ?? 0, expectedRushing);
      assert.equal(player(current, 'h-qb')?.passingYards ?? 0, expectedPassing);
      assert.equal(player(current, 'h-wr')?.receivingYards ?? 0, expectedPassing);
      assert.equal(player(current, 'h-wr')?.receptions ?? 0, receptions);
      assert.equal(current.score.home, current.fieldPosition === 100 ? 6 : 0);
      assert.equal(current.score.away, 0);
      assert.ok(current.fieldPosition >= 1 && current.fieldPosition <= 100);
      if (current.down !== null) { assert.ok(current.down >= 1 && current.down <= 4); assert.ok(current.distance >= 1 && current.distance <= 99); }
      for (let i = 0; i < saved.length; i += 1) assert.equal(JSON.stringify(replay.events[i + 1]), saved[i]);
      saved.push(JSON.stringify(current));
      assert.deepEqual(build(plays), replay);
    }
  }
});
