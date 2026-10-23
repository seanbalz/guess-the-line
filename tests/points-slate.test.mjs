import test from 'node:test';
import assert from 'node:assert/strict';
import { FLEX_POOLS, POOLS, SELECTION_VERSION, SLOT_ORDER, buildPointsSlate, isEligible, kickoffWindow, slatePools, slateProblem, slateSeed } from '../shared/points-slate.mjs';

// D-56 Guess the Points slate builder (spec section 3.2 and the section 9 "Slate builder" contract): the same inputs
// give the same slate; positions, pools, eligibility, one slot per game and at least two kickoff windows always hold;
// no valid slate fails closed. Fixture teams and players only (no real names, estimates or picks).

// Week 8, 2026 in Pacific time (DST ends Sunday November 1).
const KICKOFFS = {
  thursday: '2026-10-30T00:15:00Z', // Thu 5:15 PM PDT
  london: '2026-11-01T14:30:00Z', // Sun 6:30 AM PST, its own window
  early1: '2026-11-01T18:00:00Z', early2: '2026-11-01T18:00:00Z', early3: '2026-11-01T18:00:00Z', // Sun 10:00 AM PST
  late1: '2026-11-01T21:05:00Z', late2: '2026-11-01T21:25:00Z', // Sun 1:05 / 1:25 PM PST
  sunday: '2026-11-02T01:20:00Z', // Sun 5:20 PM PST
  monday: '2026-11-03T01:15:00Z', // Mon 5:15 PM PST
};
const GAMES = Object.entries(KICKOFFS).map(([key, kickoff], i) => ({ key: `G${i + 1}`, label: key, kickoff, teams: [`H${i + 1}`, `A${i + 1}`] }));
const DEPTH = { QB: 1, RB: 2, WR: 3, TE: 1 };

/** Every team gets a QB, two RBs, three WRs and a TE; estimates fall with team and depth so ranks are well spread. */
function fixturePlayers(games = GAMES) {
  const players = [];
  let n = 0;
  for (const game of games) for (const team of game.teams) for (const [position, depth] of Object.entries(DEPTH)) for (let d = 1; d <= depth; d++) {
    n += 1;
    players.push({ id: `00-${String(n).padStart(7, '0')}`, name: `${team} ${position}${d}`, team, position, estimate: Math.round((30 - d * 4 - (n % 17) * 0.7) * 10) / 10,
      rosterStatus: 'ACT', reportStatus: null, reserve: false, gameKey: game.key, kickoff: game.kickoff });
  }
  return players;
}

test('kickoff windows follow spec default 4 in Pacific time', () => {
  assert.equal(kickoffWindow(KICKOFFS.thursday), 'thursday-night');
  assert.equal(kickoffWindow(KICKOFFS.early1), 'sunday-early');
  assert.equal(kickoffWindow(KICKOFFS.late1), 'sunday-late');
  assert.equal(kickoffWindow(KICKOFFS.sunday), 'sunday-night');
  assert.equal(kickoffWindow(KICKOFFS.monday), 'monday-night');
  assert.equal(kickoffWindow(KICKOFFS.london), 'other:2026-11-01T06:30', 'an international morning is its own window');
  assert.equal(kickoffWindow('2026-11-26T17:30:00Z'), 'other:2026-11-26T09:30', 'a Thanksgiving daytime game is its own window');
  assert.equal(kickoffWindow('2026-12-26T21:30:00Z'), 'other:2026-12-26T13:30', 'each Saturday kickoff is its own window');
  assert.equal(kickoffWindow('2026-10-25T17:00:00Z'), 'sunday-early', '10:00 AM PDT before the change');
  assert.throws(() => kickoffWindow('soon'), /Invalid kickoff/);
});

test('eligibility: active roster, not Out or Doubtful, not reserve, with an estimate, a game and a kickoff', () => {
  const base = fixturePlayers()[0];
  assert.ok(isEligible(base));
  assert.ok(isEligible({ ...base, reportStatus: 'Questionable' }));
  for (const change of [{ reportStatus: 'Out' }, { reportStatus: 'Doubtful' }, { rosterStatus: 'RES' }, { rosterStatus: 'INA' }, { reserve: true },
    { estimate: null }, { estimate: Number.NaN }, { gameKey: '' }, { kickoff: null }, { position: 'K' }]) {
    assert.equal(isEligible({ ...base, ...change }), false, JSON.stringify(change));
  }
});

test('the same inputs give the same slate, whatever the input order; the seed names season, week and rule version', () => {
  const players = fixturePlayers();
  const a = buildPointsSlate({ season: 2026, week: 8, players });
  const b = buildPointsSlate({ season: 2026, week: 8, players: [...players].reverse() });
  assert.ok(a.ok, a.reason);
  assert.deepEqual(a, b);
  assert.equal(a.slate.seed, slateSeed(2026, 8));
  assert.equal(a.slate.seed, `2026-08-${SELECTION_VERSION}`);
  // Another week, or another rule version, draws again from the same pools.
  const others = [buildPointsSlate({ season: 2026, week: 9, players }), buildPointsSlate({ season: 2026, week: 8, players, selectionVersion: 'points-slate-v2' })];
  assert.ok(others.every(o => o.ok));
  assert.ok(others.some(o => JSON.stringify(o.slate.slots) !== JSON.stringify(a.slate.slots)), 'the seed changes the draw');
});

test('every drawn slate keeps positions, pools, eligibility, one slot per game and at least two kickoff windows', () => {
  const players = fixturePlayers();
  players[3].reportStatus = 'Out';
  players[10].rosterStatus = 'RES';
  const pools = slatePools(players);
  for (const [position, n] of Object.entries(POOLS)) assert.equal(pools[position].length, n, `${position} pool is the top ${n}`);
  assert.equal(pools.FLEX.length, FLEX_POOLS.RB + FLEX_POOLS.WR + FLEX_POOLS.TE);
  const inPool = (slot, id) => pools[slot].some(p => p.id === id);
  for (let week = 1; week <= 18; week++) {
    const { ok, slate, reason } = buildPointsSlate({ season: 2026, week, players });
    assert.ok(ok, `week ${week}: ${reason}`);
    assert.deepEqual(slate.slots.map(s => s.slot), SLOT_ORDER);
    assert.equal(slateProblem(slate.slots), null, `week ${week}`);
    for (const s of slate.slots) {
      const player = players.find(p => p.id === s.playerId);
      assert.ok(isEligible(player), `week ${week} ${s.slot} is eligible`);
      assert.ok(inPool(s.slot, s.playerId), `week ${week} ${s.slot} is from its pool`);
      assert.equal(s.position, s.slot === 'FLEX' ? player.position : s.slot);
      assert.ok(['RB', 'WR', 'TE'].includes(slate.slots[4].position));
      assert.equal(slate.house[s.slot], Math.round(player.estimate * 10) / 10, 'the House is GTL\'s estimate for the slot');
    }
    assert.equal(new Set(slate.slots.map(s => s.gameKey)).size, 5);
    assert.ok(new Set(slate.slots.map(s => kickoffWindow(s.kickoff))).size >= 2);
    assert.ok(!slate.slots.some(s => [players[3].id, players[10].id].includes(s.playerId)));
  }
});

test('no valid slate fails closed', () => {
  const players = fixturePlayers();
  // Every game in one kickoff window.
  const oneWindow = players.map(p => ({ ...p, kickoff: KICKOFFS.early1 }));
  assert.deepEqual(buildPointsSlate({ season: 2026, week: 8, players: oneWindow }), { ok: false, reason: 'one_kickoff_window', seed: slateSeed(2026, 8) });
  // Four games cannot fill five slots, one per game.
  const fourGames = fixturePlayers(GAMES.slice(0, 4));
  assert.equal(buildPointsSlate({ season: 2026, week: 8, players: fourGames }).reason, 'too_few_games');
  // No eligible tight end.
  const noTe = players.map(p => p.position === 'TE' ? { ...p, reportStatus: 'Out' } : p);
  assert.equal(buildPointsSlate({ season: 2026, week: 8, players: noTe }).reason, 'empty_pool');
  // Five games, but the only QBs and TEs share one game: no slate meets one slot per game.
  const tight = fixturePlayers(GAMES.slice(0, 5)).map(p => (p.position === 'QB' || p.position === 'TE') && p.gameKey !== 'G1' ? { ...p, reserve: true } : p);
  assert.equal(buildPointsSlate({ season: 2026, week: 8, players: tight }).reason, 'no_valid_slate');
  assert.equal(buildPointsSlate({ season: 2026, week: 19, players }).reason, 'invalid_week');
  assert.equal(buildPointsSlate({ season: 2026, week: 8, players: [...players, players[0]] }).reason, 'duplicate_player');
});

test('slateProblem checks a swapped or manual slate against the same constraints', () => {
  const { slate } = buildPointsSlate({ season: 2026, week: 8, players: fixturePlayers() });
  const slots = slate.slots;
  assert.equal(slateProblem(slots), null);
  assert.equal(slateProblem(slots.slice(0, 4)), 'slots');
  assert.equal(slateProblem([...slots].reverse()), 'slots');
  assert.equal(slateProblem(slots.map((s, i) => i === 0 ? { ...s, position: 'RB' } : s)), 'position');
  assert.equal(slateProblem(slots.map((s, i) => i === 4 ? { ...s, position: 'QB' } : s)), 'position', 'FLEX is RB, WR or TE');
  assert.equal(slateProblem(slots.map((s, i) => i === 2 ? { ...s, gameKey: '' } : s)), 'player');
  assert.equal(slateProblem(slots.map((s, i) => i === 2 ? { ...s, kickoff: 'TBD' } : s)), 'kickoff');
  assert.equal(slateProblem(slots.map((s, i) => i === 1 ? { ...s, playerId: slots[0].playerId } : s)), 'duplicate_player');
  assert.equal(slateProblem(slots.map((s, i) => i === 1 ? { ...s, gameKey: slots[0].gameKey } : s)), 'same_game');
  assert.equal(slateProblem(slots.map(s => ({ ...s, kickoff: KICKOFFS.late1 }))), 'one_kickoff_window');
});
