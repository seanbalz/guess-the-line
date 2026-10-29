// Research -> Fantasy (EPL) view from stored Sleeper snapshots (plan 2026-10-28-epl-fantasy.md, Task 2; spec section 5).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildFantasyView, detailLabels, FANTASY_DETAIL_WEEKS } from '../cloud/epl-fantasy-view.mjs';
import { clubFromSleeperAbbr } from '../shared/epl-clubs.mjs';
import { playersFromSnapshot, trimSleeperSnapshot } from '../shared/epl-sleeper.mjs';
import { beatProjection, winChance } from '../shared/epl-fantasy.mjs';
import { EPL_METHODS, handleEpl, createEplService } from '../cloud/epl.mjs';

const SEAN = '473955676301815808', EVAN = '719658248843632640', NEMO = '865667912365666304', ADAM = '719745569895018496';
const OWNERS = [SEAN, EVAN, NEMO, ADAM];
const USER = { id: '00000000-0000-4000-8000-00000000000a', is_anonymous: false };
const LINEUP = { [SEAN]: [['11', '12'], ['13']], [EVAN]: [['21', '22'], ['23']], [NEMO]: [['31', '32'], ['33']], [ADAM]: [['41', '42'], ['43']] };
const PLAYERS = {
  11: { name: 'Erling Haaland', position: 'F', fantasy_positions: ['F'], team: '1', team_abbr: 'MCI', injury_status: null },
  12: { name: 'Martin Odegaard', position: 'M', fantasy_positions: ['M'], team: '2', team_abbr: 'ARS', injury_status: 'Out' },
  13: { name: 'Bench One', position: 'D', fantasy_positions: ['D'], team: '3', team_abbr: 'WOL', injury_status: null },
  21: { name: 'Mo Salah', position: 'M', fantasy_positions: ['F', 'M'], team: '4', team_abbr: 'LIV', injury_status: null },
  22: { name: 'Van Dijk', position: 'D', fantasy_positions: ['D'], team: '4', team_abbr: 'LIV', injury_status: null },
};
const SCORING = { pos_f_g: 9, pos_m_g: 9, pos_d_g: 10, pos_f_sot: 2, pos_m_sot: 2, pos_d_sot: 2, pos_gk_sv: 2 };
const split = x => ({ whole: Math.floor(x), dec: Math.round((x - Math.floor(x)) * 100) });

/** A stored snapshot: `totals` is {owner: [for, against, wins, losses]}. */
function snap(label, capturedAt, stateWeek, totals, extra = {}, names = {}) {
  const rosters = OWNERS.map((ownerId, i) => {
    const [f, a, wins = 0, losses = 0] = totals[ownerId];
    const F = split(f), A = split(a);
    const [starters, bench] = LINEUP[ownerId];
    return { roster_id: i + 1, owner_id: ownerId, starters, players: [...starters, ...bench],
      settings: { fpts: F.whole, fpts_decimal: F.dec, fpts_against: A.whole, fpts_against_decimal: A.dec, wins, losses } };
  });
  const users = OWNERS.map(id => ({ user_id: id, display_name: names[id] ?? `sleeper-${id.slice(-4)}` }));
  return { label, capturedAt, week: Number(/mw0?(\d+)/.exec(label)?.[1] ?? stateWeek),
    payload: { trimmed: true, state: { week: stateWeek, season: '2026' }, league: { scoring_settings: SCORING }, users, rosters, ...extra } };
}

const AFTER8 = { [SEAN]: [800, 780, 5, 3], [EVAN]: [700, 690, 4, 4], [NEMO]: [600, 610, 4, 4], [ADAM]: [500, 505, 3, 5] };
// MW9: Sean 100 v Evan 90, Nemo 80 v Adam 70.
const AFTER9 = { [SEAN]: [900, 870, 6, 3], [EVAN]: [790, 790, 4, 5], [NEMO]: [680, 680, 5, 4], [ADAM]: [570, 585, 3, 6] };
// MW10 is missing; MW11 is scored from the before-mw11-kickoff totals: Sean 60.5 v Nemo 70, Evan 75 v Adam 50.
const BEFORE11 = { [SEAN]: [1000, 960, 7, 3], [EVAN]: [880, 880, 5, 5], [NEMO]: [760, 770, 5, 5], [ADAM]: [650, 660, 3, 7] };
const AFTER11 = { [SEAN]: [1060.5, 1030, 7, 4], [EVAN]: [955, 930, 6, 5], [NEMO]: [830, 830.5, 6, 5], [ADAM]: [700, 735, 3, 8] };

function season() {
  return [
    snap('after-mw08', '2026-10-28T17:32:37.000Z', 9, AFTER8),
    snap('before-mw9-kickoff', '2026-10-31T12:00:00.000Z', 9, AFTER8, {
      projections_mw9: [{ player_id: '11', stats: { g: 1 } }, { player_id: '12', stats: { g: 1 } }, { player_id: '21', stats: { g: 1 } }],
      players: PLAYERS,
    }),
    snap('after-mw9', '2026-11-04T00:05:00.000Z', 10, AFTER9, {
      stats_mw9: [{ player_id: '11', stats: { g: 2 } }, { player_id: '12', stats: { sot: 1 } }, { player_id: '21', stats: { g: 1, sot: 1 } }],
    }, { [SEAN]: 'sean-renamed' }),
    snap('before-mw11-kickoff', '2026-11-21T12:00:00.000Z', 11, BEFORE11, { players: PLAYERS }),
    snap('after-mw11', '2026-11-25T00:05:00.000Z', 12, AFTER11, {
      stats_mw11: [{ player_id: '11', stats: { g: 3 } }],
      projections_mw12: [{ player_id: '11', stats: { g: 1, sot: 2 } }, { player_id: '21', stats: { g: 1 } }, { player_id: '22', stats: { sot: 3 } }],
      players: PLAYERS,
    }),
  ];
}
const BONUS = [{ ownerId: SEAN, week: 9, points: 15 }, { ownerId: EVAN, week: 9, points: 0 }, { ownerId: SEAN, week: 11, points: 5 }];

test('clubFromSleeperAbbr maps Sleeper abbreviations to crest codes (MCI -> MNC) and refuses unknown ones', () => {
  assert.equal(clubFromSleeperAbbr('MCI'), 'MNC');
  assert.equal(clubFromSleeperAbbr('TOT'), 'TOT');
  assert.equal(clubFromSleeperAbbr('nfo'), 'NFO');
  for (const abbr of ['WOL', 'constructor', '__proto__', '', null, 3]) assert.equal(clubFromSleeperAbbr(abbr), null, String(abbr));
});

test('the stored snapshot keeps only rostered players, with a directory under Sleeper key names', () => {
  const raw = {
    capturedAt: '2026-11-04T00:05:00Z', label: 'after-mw9', source: 'x', leagueId: 'l', sources: {}, state: { week: 10 },
    league: { name: 'FEPL', scoring_settings: SCORING, metadata: { big: 'x'.repeat(5000) } },
    users: [{ user_id: SEAN, display_name: 'seanbalz', avatar: 'a'.repeat(64), metadata: { team_name: 'T' } }],
    rosters: [{ roster_id: 1, owner_id: SEAN, starters: ['11'], players: ['11', '12'], metadata: { record: 'WWL' }, settings: { fpts: 1 } }],
    stats_mw9: [
      { player_id: '11', stats: { g: 1 }, company: 'opta', player: { first_name: 'Erling', last_name: 'Haaland', metadata: { full_name: 'Erling Haaland', channel_id: 'z'.repeat(40) }, position: 'F', fantasy_positions: ['F'], team: '1', team_abbr: 'MCI', injury_status: null, news_updated: 1 } },
      ...Array.from({ length: 300 }, (_, i) => ({ player_id: String(9000 + i), stats: { g: 0 }, player: { first_name: 'X', last_name: 'Y', position: 'M' } })),
    ],
    projections_mw10: [{ player_id: '12', stats: { g: 1 }, player: { first_name: 'Martin', last_name: 'Odegaard', position: 'M', fantasy_positions: ['M'], team_abbr: 'ARS', injury_status: 'Questionable' } }],
  };
  const t = trimSleeperSnapshot(raw);
  assert.deepEqual(Object.keys(t).sort(), ['capturedAt', 'label', 'league', 'leagueId', 'players', 'projections_mw10', 'rosters', 'source', 'sources', 'state', 'stats_mw9', 'trimmed', 'users']);
  assert.deepEqual(t.league, { scoring_settings: SCORING });
  assert.deepEqual(t.users, [{ user_id: SEAN, display_name: 'seanbalz' }]);
  assert.deepEqual(t.stats_mw9, [{ player_id: '11', stats: { g: 1 } }]);
  assert.deepEqual(t.players, {
    11: { name: 'Erling Haaland', position: 'F', fantasy_positions: ['F'], team: '1', team_abbr: 'MCI', injury_status: null },
    12: { name: 'Martin Odegaard', position: 'M', fantasy_positions: ['M'], team: null, team_abbr: 'ARS', injury_status: 'Questionable' },
  });
  assert.ok(JSON.stringify(t).length < 32 * 1024, 'the stored rostered-only snapshot is small');
  assert.ok(JSON.stringify(t).length < JSON.stringify(raw).length / 4);
  assert.deepEqual({ ...playersFromSnapshot(t) }, t.players, 'a trimmed snapshot reads back its own directory');
});

test('Review Focus 4: before any after-MW snapshot, totals and records come from the newest snapshot and weekly detail starts at the current week', () => {
  const only = snap('daily-2026-10-29', '2026-10-29T08:04:00.000Z', 9, AFTER8);
  const view = buildFantasyView({ snapshots: [only], bonus: [], viewerOwnerId: SEAN });
  assert.equal(view.week, 9);
  assert.equal(view.capturedAt, '2026-10-29T08:04:00.000Z');
  const sean = view.standings.find(s => s.ownerId === SEAN);
  assert.deepEqual(sean, { ownerId: SEAN, name: 'Sean', wins: 5, losses: 3, sleeperTotal: 800, bonus: 0, total: 800 });
  assert.deepEqual(view.standings.map(s => s.ownerId), [SEAN, EVAN, NEMO, ADAM]);
  assert.deepEqual(view.insights.weekly, []);
  assert.equal(view.insights.detailStartsWeek, 9);
  assert.equal(view.insights.seasonHigh, null);
  assert.equal(view.matchup.unavailable, true);
});

test('Review Focus 5: a renamed Sleeper manager is still matched by owner_id', () => {
  const view = buildFantasyView({ snapshots: season(), bonus: [], viewerOwnerId: SEAN });
  const w9 = view.insights.weekly.filter(w => w.week === 9);
  assert.deepEqual(w9.find(w => w.ownerId === SEAN), { week: 9, ownerId: SEAN, points: 100 });
  assert.equal(view.standings.find(s => s.ownerId === SEAN).name, 'Sean');
  assert.equal(view.rosters.find(r => r.ownerId === SEAN).name, 'Sean');
});

test('standings total is Sleeper season points plus the Pick a Team bonus, raw Sleeper total kept', () => {
  const view = buildFantasyView({ snapshots: season(), bonus: BONUS, viewerOwnerId: SEAN });
  assert.deepEqual(view.standings[0], { ownerId: SEAN, name: 'Sean', wins: 7, losses: 4, sleeperTotal: 1060.5, bonus: 20, total: 1080.5 });
  assert.deepEqual(view.standings.find(s => s.ownerId === EVAN), { ownerId: EVAN, name: 'Evan', wins: 6, losses: 5, sleeperTotal: 955, bonus: 0, total: 955 });
  assert.deepEqual(view.standings.map(s => s.ownerId), [SEAN, EVAN, NEMO, ADAM]);
});

test('a missing week is null in the weekly series (never 0), and its beat-projection diff is null', () => {
  const view = buildFantasyView({ snapshots: season(), bonus: [], viewerOwnerId: SEAN });
  const weeks = [...new Set(view.insights.weekly.map(w => w.week))];
  assert.deepEqual(weeks, [9, 10, 11]);
  for (const id of OWNERS) assert.equal(view.insights.weekly.find(w => w.week === 10 && w.ownerId === id).points, null, id);
  assert.deepEqual(view.insights.weekly.filter(w => w.week === 11).map(w => [w.ownerId, w.points]), [[SEAN, 60.5], [EVAN, 75], [NEMO, 70], [ADAM, 50]]);
  assert.deepEqual(view.insights.seasonHigh, { week: 9, ownerId: SEAN, name: 'Sean', points: 100 });
  // MW9 projection (saved lineup): Haaland 9 + Odegaard 9 = 18; MW11 has no saved projections: null, never 0 or a miss.
  const mine = view.insights.beatProjection.filter(b => b.ownerId === SEAN);
  assert.deepEqual(mine, [{ ownerId: SEAN, week: 9, diff: beatProjection(100, 18) }, { ownerId: SEAN, week: 10, diff: null }, { ownerId: SEAN, week: 11, diff: null }]);
  assert.deepEqual(view.matchup.recent.map(r => [r.week, r.projected, r.actual]), [[9, 18, 100], [10, null, null], [11, null, 60.5]]);
});

test('top scorer per team sums the saved-lineup starters across weeks with detail', () => {
  const view = buildFantasyView({ snapshots: season(), bonus: [], viewerOwnerId: SEAN });
  const sean = view.insights.topScorerPerTeam.find(t => t.ownerId === SEAN);
  // Haaland: MW9 2 goals (18) + MW11 3 goals (27, the MW11 kickoff lineup) = 45.
  assert.deepEqual(sean, { ownerId: SEAN, name: 'Sean', playerId: '11', playerName: 'Erling Haaland', points: 45 });
  assert.deepEqual(view.insights.myTopScorer, sean);
  assert.deepEqual(view.insights.topScorerPerTeam.find(t => t.ownerId === EVAN), { ownerId: EVAN, name: 'Evan', playerId: '21', playerName: 'Mo Salah', points: 11 });
  assert.deepEqual(view.insights.detailWeeks, [9, 11]);
});

test('matchup: the opponent comes from the last round-robin cycle, projections use FEPL scoring, a starter with no projection is null', () => {
  const view = buildFantasyView({ snapshots: season(), bonus: [], viewerOwnerId: SEAN });
  const m = view.matchup;
  assert.equal(m.unavailable, undefined);
  assert.equal(m.week, 12);
  assert.equal(m.basisWeek, 9, '4 managers: a 3-week cycle, so MW12 repeats MW9');
  assert.deepEqual(m.me, { ownerId: SEAN, name: 'Sean' });
  assert.deepEqual(m.opp, { ownerId: EVAN, name: 'Evan' });
  assert.equal(m.myProj, 13);
  assert.equal(m.oppProj, 15);
  assert.equal(m.winChance, winChance(13, 15));
  assert.deepEqual(m.starters, [
    { playerId: '11', name: 'Erling Haaland', pos: 'F', club: 'MNC', clubText: 'MCI', proj: 13 },
    { playerId: '12', name: 'Martin Odegaard', pos: 'M', club: 'ARS', clubText: 'ARS', proj: null },
  ]);
});

test('matchup unavailable when the pairing is ambiguous (identical weekly scores)', () => {
  const flat = Object.fromEntries(OWNERS.map(id => [id, [AFTER8[id][0] + 80, AFTER8[id][1] + 80, 5, 4]]));
  const snaps = [snap('after-mw08', '2026-10-28T17:32:37.000Z', 9, AFTER8), snap('after-mw9', '2026-11-04T00:05:00.000Z', 12, flat, {
    projections_mw12: [{ player_id: '11', stats: { g: 1 } }], players: PLAYERS })];
  const view = buildFantasyView({ snapshots: snaps, bonus: [], viewerOwnerId: SEAN });
  assert.equal(view.matchup.unavailable, true);
  assert.equal(view.matchup.week, 12);
  assert.equal(view.matchup.myProj, 9, 'your own projection still shows');
});

test('matchup unavailable when an earlier cycle contradicts the repeat (no guess)', () => {
  const snaps = season();
  // MW12 scored as Sean v Nemo, so MW9 (Sean v Evan) and MW12 disagree: the cycle is not trusted for MW15.
  const after12 = { [SEAN]: [1100.5, 1080, 8, 4], [EVAN]: [1015, 990, 7, 5], [NEMO]: [880, 870.5, 6, 6], [ADAM]: [760, 795, 3, 9] };
  snaps.push(snap('after-mw12', '2026-12-02T00:05:00.000Z', 15, after12, { projections_mw15: [{ player_id: '11', stats: { g: 1 } }], players: PLAYERS }));
  const view = buildFantasyView({ snapshots: snaps, bonus: [], viewerOwnerId: SEAN });
  assert.equal(view.matchup.week, 15);
  assert.equal(view.matchup.unavailable, true);
});

test('rosters list starters then bench per manager with crest codes', () => {
  const view = buildFantasyView({ snapshots: season(), bonus: [], viewerOwnerId: SEAN });
  const sean = view.rosters.find(r => r.ownerId === SEAN);
  assert.deepEqual(sean.starters.map(p => [p.playerId, p.pos, p.club]), [['11', 'F', 'MNC'], ['12', 'M', 'ARS']]);
  assert.deepEqual(sean.bench, [{ playerId: '13', name: 'Bench One', pos: 'D', club: null, clubText: 'WOL' }]);
  assert.deepEqual(view.rosters.find(r => r.ownerId === NEMO).starters[0], { playerId: '31', name: null, pos: null, club: null, clubText: null });
});

test('detailLabels asks only for the last weeks\' before and after snapshots', () => {
  const light = season().map(s => ({ label: s.label, week: s.week, capturedAt: s.capturedAt }));
  assert.deepEqual(detailLabels(light).sort(), ['after-mw11', 'after-mw9', 'before-mw11-kickoff', 'before-mw9-kickoff'], 'after-mw08 has no saved lineup');
  const many = Array.from({ length: 20 }, (_, i) => [{ label: `after-mw${i + 1}` }, { label: `before-mw${i + 1}-kickoff` }, { label: `daily-2026-11-${String(i + 1).padStart(2, '0')}` }]).flat();
  assert.equal(detailLabels(many).length, 2 * FANTASY_DETAIL_WEEKS);
  assert.ok(detailLabels(many).includes('after-mw20') && !detailLabels(many).includes('after-mw1') && !detailLabels(many).some(l => l.startsWith('daily-')));
});

// --- the route ----------------------------------------------------------------------------------------------------------

function fantasyService({ member = SEAN, snapshots = season(), bonus = BONUS } = {}) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) { calls.push([name, args]); if (name === 'gtl_epl_member') return member; throw new Error(`unexpected rpc ${name}`); },
    async readSnapshots() { calls.push(['readSnapshots']); return snapshots; },
    async readBonus(seasonYear) { calls.push(['readBonus', seasonYear]); return bonus; },
  };
}

test('/epl/fantasy/read is a POST route and answers the caller\'s view from stored snapshots', async () => {
  assert.deepEqual(EPL_METHODS['/epl/fantasy/read'], ['POST']);
  const service = fantasyService();
  const view = await handleEpl({ route: '/epl/fantasy/read', body: {}, user: USER, service, clock: () => Date.parse('2026-11-26T00:00:00Z') });
  assert.equal(view.viewer, SEAN);
  assert.equal(view.matchup.me.ownerId, SEAN);
  assert.equal(view.standings[0].total, 1080.5);
  assert.deepEqual(service.calls.map(c => c[0]), ['gtl_epl_member', 'readSnapshots', 'readBonus']);
  assert.deepEqual(service.calls[2], ['readBonus', 2026]);
});

test('/epl/fantasy/read refuses a non-member with 403 before reading anything, and refuses a body', async () => {
  const service = fantasyService({ member: null });
  await assert.rejects(handleEpl({ route: '/epl/fantasy/read', body: {}, user: USER, service }), e => e.status === 403 && e.code === 'GTL_EPL_FORBIDDEN');
  assert.deepEqual(service.calls.map(c => c[0]), ['gtl_epl_member']);
  await assert.rejects(handleEpl({ route: '/epl/fantasy/read', body: { week: 9 }, user: USER, service: fantasyService() }), e => e.status === 400);
  await assert.rejects(handleEpl({ route: '/epl/fantasy/read', body: {}, user: { id: 'nope' }, service: fantasyService() }), e => e.status === 401);
});

test('/epl/fantasy/read with no stored snapshot answers 404 GTL_EPL_NO_FANTASY; the commissioner sees the league without a matchup', async () => {
  await assert.rejects(handleEpl({ route: '/epl/fantasy/read', body: {}, user: USER, service: fantasyService({ snapshots: [] }) }), e => e.status === 404 && e.code === 'GTL_EPL_NO_FANTASY');
  const view = await handleEpl({ route: '/epl/fantasy/read', body: {}, user: USER, service: fantasyService({ member: 'commissioner' }) });
  assert.equal(view.viewer, null);
  assert.equal(view.matchup.unavailable, true);
  assert.equal(view.standings.length, 4);
});

test('the fantasy route never calls Sleeper per request: the view and route modules import no source fetcher', () => {
  for (const file of ['cloud/epl-fantasy-view.mjs', 'cloud/epl.mjs']) {
    const src = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.ok(!/epl-sources|fetch\(/.test(src), file);
  }
});

test('createEplService reads snapshots in bounded queries and the season\'s bonus rows', async () => {
  const queries = [];
  const all = season();
  const rows = async (table, query, max) => {
    queries.push([table, query, max]);
    if (table === 'gtl_epl_bonus') return [{ owner_id: SEAN, week: 9, points: 15 }, { owner_id: 'x', week: 'bad', points: 1 }];
    if (query.order === 'captured_at.desc,id.desc') return [all.at(-1)].map(s => ({ label: s.label, week: s.week, captured_at: s.capturedAt, payload: s.payload }));
    if (query.label?.startsWith('in.(')) return all.filter(s => query.label.slice(4, -1).split(',').includes(s.label)).map(s => ({ label: s.label, week: s.week, captured_at: s.capturedAt, payload: s.payload }));
    return all.map(s => ({ label: s.label, week: s.week, captured_at: s.capturedAt, users: s.payload.users, rosters: s.payload.rosters, state: s.payload.state }));
  };
  const service = createEplService({ rpc: async () => null, rest: async () => null, rows });
  const snaps = await service.readSnapshots();
  assert.equal(snaps.length, all.length);
  assert.ok(snaps.find(s => s.label === 'after-mw9').payload.stats_mw9, 'detail weeks carry their full payload');
  assert.ok(!snaps.find(s => s.label === 'after-mw08').payload.stats_mw8, 'other weeks carry totals only');
  assert.equal(queries[0][1].label, 'not.like.daily-*', 'daily snapshots are not listed');
  assert.ok(queries.every(([, , max]) => Number.isInteger(max) && max <= 200));
  assert.deepEqual(await service.readBonus(2026), [{ ownerId: SEAN, week: 9, points: 15 }]);
  assert.deepEqual(queries.at(-1), ['gtl_epl_bonus', { select: 'owner_id,week,points', season: 'eq.2026', limit: '400' }, 400]);
});
