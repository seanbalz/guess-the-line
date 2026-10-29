import test from 'node:test';
import assert from 'node:assert/strict';
import { discoveryWindows, discoverTrends, variedDiscoveries, DISCOVERY_LABEL, DISCOVERY_SITUATIONS } from '../shared/trends-discovery.mjs';
import { row, T, venues, corrections, historyCsv, seasonCsv, build } from './trends-fixture.mjs';
const now = '2026-10-29T16:00:00Z';
const records = (n, prefix = 'g', from = '2026-09-01') => Array.from({ length: n }, (_, i) => ({ gameId: `${prefix}${i}`, season: 2026,
  date: new Date(Date.parse(from + 'T18:00:00Z') + i * 86400000).toISOString(), availableAt: new Date(Date.parse(from + 'T18:00:00Z') + (i + 1) * 86400000).toISOString(), result: i % 3 === 0 ? 0 : i % 2 ? 1 : -1, odds: null }));

test('recent windows include pushes and partition earlier games without treating overlapping windows as holdouts', () => {
  const input = records(40);
  const result = discoveryWindows(input, { now, season: 2026, registeredAt: '2026-10-05T00:00:00Z' });
  for (const n of [10, 12, 20, 30]) {
    const r = result.windows['recent' + n];
    assert.equal(r.sample, n); assert.equal(r.earlier.sample, 40 - n);
    assert.equal(new Set([...r.matchedGameIds, ...r.earlier.matchedGameIds]).size, 40);
    assert.ok(r.matchedGameIds.every(id => !r.earlier.matchedGameIds.includes(id)));
    assert.equal(r.wins + r.losses + r.pushes, n);
    assert.equal(r.hitRate, r.wins / (r.wins + r.losses));
    assert.equal(r.actualUnits, null);
  }
  assert.equal(result.windows.season.completeWindow, null);
  assert.equal(result.windows.recent10.matchedGameIds.filter(id => result.windows.recent12.matchedGameIds.includes(id)).length, 10);
  assert.equal(result.retrospective.sample + result.prospective.sample, 40);
  assert.ok(result.prospective.matchedGameIds.every(id => Date.parse(input.find(r => r.gameId === id).date) >= Date.parse('2026-10-05T00:00:00Z')));
});

test('future/unobserved results, duplicate and conflicting game identities never inflate a sample', () => {
  const input = records(4);
  const extra = [input[0], { ...input[1], result: -input[1].result }, { ...input[2], gameId: 'future', date: '2026-10-30T00:00:00Z' }, { ...input[3], gameId: 'unobserved', availableAt: '2026-10-30T00:00:00Z' }];
  const r = discoveryWindows([...input, ...extra], { now, season: 2026 }).windows.all;
  assert.equal(r.sample, 3); assert.deepEqual(r.matchedGameIds, ['g0', 'g2', 'g3']);
  assert.equal(discoveryWindows(input, { now, season: 2026 }).windows.recent12.completeWindow, false);
  assert.throws(() => discoveryWindows(input, { now: '2026-02-30T00:00:00Z', season: 2026 }));
  assert.throws(() => discoveryWindows(input, { now, season: 2026, registeredAt: '2026-10-30T00:00:00Z' }));
});

test('previous-season comparison contains strictly earlier games, never the later current season', () => {
  const input = [...records(3, 'old', '2024-09-01').map(r => ({ ...r, season: 2024 })), ...records(2, 'last', '2025-09-01').map(r => ({ ...r, season: 2025 })), ...records(4)];
  const r = discoveryWindows(input, { now, season: 2026 }).windows.previousSeason;
  assert.equal(r.sample, 2); assert.deepEqual(r.earlier.matchedGameIds, ['old0', 'old1', 'old2']);
});

const csvOf = rows => T.writeCompactCsv(rows, { columns: T.HISTORY_COLUMNS });
const fixture = () => [
  row({ season: 2026, week: 1, gameday: '2026-09-13', away_team: 'CAR', home_team: 'ATL', away_score: 7, home_score: 20, away_qb_id: 'other', away_qb_name: 'Other starter', away_coach: 'Coach A', spread_line: 3, total_line: 40, stadium_id: 'ATL06' }),
  row({ season: 2026, week: 2, gameday: '2026-09-20', away_team: 'ATL', home_team: 'CAR', away_score: 20, home_score: 21, home_qb_id: 'qb-new', home_qb_name: 'New starter', home_coach: 'Coach A', spread_line: -3, total_line: 40, stadium_id: 'CAR00' }),
  // A future row already containing a final, line and new QB must be redacted before features/catalogue selection.
  row({ season: 2026, week: 9, gameday: '2026-11-08', away_team: 'ATL', home_team: 'CAR', away_score: 999, home_score: 999, home_qb_id: 'future-qb', home_qb_name: 'Future starter', spread_line: 88, total_line: 88, stadium_id: 'CAR00' }),
];
test('entity-plus-situation scan means previous team game, handles both team sides and independent spread/total line coverage', () => {
  const input = fixture(); const copy = JSON.stringify(input);
  const report = discoverTrends({ csv: csvOf(input), now, season: 2026, venues, corrections, teams: ['CAR'] });
  const find = (kind, situation, side) => report.candidates.find(c => c.entity.kind === kind && c.situation.id === situation && c.side === side && (kind !== 'qb' || c.entity.value === 'qb-new'));
  const qb = find('qb', 'off-loss', 'back-entity');
  assert.deepEqual(qb.windows.all.matchedGameIds, ['2026_02_ATL_CAR']);
  assert.equal(qb.windows.all.wins, 1); // CAR +3 won 21–20
  assert.equal(qb.prospective.sample, 0); assert.equal(qb.contributesToLean, false);
  assert.ok(report.candidates.every(c => c.label === DISCOVERY_LABEL));
  assert.ok(!JSON.stringify(report).includes('future-qb')); assert.ok(!JSON.stringify(report).includes('Future starter'));
  assert.equal(report.source.latestCompleted, '2026-09-20');
  assert.equal(JSON.stringify(input), copy);
  const changedFuture = structuredClone(input);
  Object.assign(changedFuture[2], { home_score: '0', away_score: '1', spread_line: '-77', total_line: '77', home_qb_id: 'another-future', home_coach: 'Another future coach' });
  assert.deepEqual(discoverTrends({ csv: csvOf(changedFuture), now, season: 2026, venues, corrections, teams: ['CAR'] }), report);
  input[1].spread_line = '';
  const withoutSpread = discoverTrends({ csv: csvOf(input), now, season: 2026, venues, corrections, teams: ['CAR'] });
  const q = withoutSpread.candidates.filter(c => c.entity.value === 'qb-new' && c.situation.id === 'off-loss');
  assert.equal(q.find(c => c.market === 'spread').windows.all.sample, 0);
  assert.equal(q.find(c => c.side === 'over').windows.all.wins, 1);
  assert.equal(q.find(c => c.side === 'under').windows.all.losses, 1);
  assert.equal(q.find(c => c.market === 'spread').coverage.missingRequiredLine, 1);
  assert.ok(report.searched.empty > 0); // Empty searches stay auditable.
});

const candidate = (id, ids, { kind = 'team', family = 'form', market = 'spread', entity = id } = {}) => ({ id, market, entity: { kind, value: entity }, situation: { family }, windows: { recent12: { sample: ids.length, matchedGameIds: ids, coverage: { to: '2026-10-26T00:00:00Z' }, wins: 0, illustrativeUnits: -ids.length } } });
test('connected sample overlap suppresses chains and opposing totals; market groups do not claim independence', () => {
  const a = ['1', '2', '3', '4'], b = ['3', '4', '5', '6'], c = ['5', '6', '7', '8'];
  const input = [candidate('a', a), candidate('b', b), candidate('c', c), candidate('over', a, { market: 'total' }), candidate('under', a, { market: 'total' })];
  const result = variedDiscoveries(input, { minimumGames: 4, maxPerFamily: 8 });
  assert.equal(result.groups.length, 2); assert.equal(result.selected.length, 1);
  assert.deepEqual(result.groups.find(g => g.market === 'spread').memberIds, ['a', 'b', 'c']);
  assert.match(result.note, /not claims of independence/);
});
test('selection varies entity kinds and families, ignores outcomes and is input-order invariant', () => {
  const input = ['team', 'qb', 'coach'].flatMap((kind, k) => ['form', 'rest', 'venue', 'schedule'].map((family, f) => candidate(`${kind}-${family}`, Array.from({ length: 12 }, (_, i) => `${k}-${f}-${i}`), { kind, family })));
  const result = variedDiscoveries(input);
  assert.equal(result.selected.length, 8);
  assert.deepEqual(new Set(result.selected.map(s => input.find(c => c.id === s.id).entity.kind)), new Set(['team', 'qb', 'coach']));
  assert.deepEqual(new Set(result.selected.map(s => input.find(c => c.id === s.id).situation.family)), new Set(['form', 'rest', 'venue', 'schedule']));
  const changed = input.slice().reverse().map(c => ({ ...c, windows: { recent12: { ...c.windows.recent12, wins: 12, illustrativeUnits: 99 } } }));
  assert.deepEqual(variedDiscoveries(changed), result);
  assert.throws(() => variedDiscoveries([...input, input[0]]), /Duplicate/);
});

test('real checked-in Bryce Young record reproduces engine membership; every searched condition/window remains visible', () => {
  const rows = [...T.parseCsvRows(historyCsv).rows, ...T.parseCsvRows(seasonCsv).rows];
  const report = discoverTrends({ csv: csvOf(rows), now, season: 2026, venues, corrections, teams: ['CAR'] });
  const found = report.candidates.find(c => c.entity.value === '00-0039150' && c.situation.id === 'off-loss' && c.market === 'spread');
  const { fg } = build(); const expected = T.betUnits({ market: 'team_ats', atoms: ['qb:00-0039150', 't:t_off_loss'] }, fg.filter(g => g.played && g.spread !== null), { rules: corrections.rules });
  assert.deepEqual(found.windows.all.matchedGameIds, expected.map(u => u.g.id));
  assert.deepEqual([found.windows.recent12.wins, found.windows.recent12.losses, found.windows.recent12.pushes], [12, 0, 0]);
  assert.deepEqual([found.windows.all.wins, found.windows.all.losses, found.windows.all.pushes], [17, 11, 2]);
  assert.deepEqual([found.windows.recent12.earlier.wins, found.windows.recent12.earlier.losses, found.windows.recent12.earlier.pushes], [5, 11, 2]);
  assert.equal(report.searched.candidates, report.searched.entities * DISCOVERY_SITUATIONS.length * 3);
  assert.equal(report.searched.windows, report.candidates.length * 7);
  assert.ok(report.candidates.some(c => c.windows.all.illustrativeUnits < 0));
});

test('upcoming-week scope uses schedule teams only and never asserts a future starter or hidden condition', () => {
  const csv = csvOf(fixture());
  const report = discoverTrends({ csv, now, season: 2026, week: 9, venues, corrections });
  assert.deepEqual(report.scope.teams, ['ATL', 'CAR']);
  assert.deepEqual(report.scope.upcomingGameIds, ['2026_09_ATL_CAR']);
  assert.match(report.scope.currentApplicability, /Not verified/);
  assert.ok(!report.candidates.some(c => c.entity.value === 'future-qb'));
  const none = discoverTrends({ csv, now, season: 2026, week: 8, venues, corrections });
  assert.equal(none.candidates.length, 0); // Empty scope cannot silently expand to the whole league.
  assert.throws(() => discoverTrends({ csv, now, season: 2026, week: 26, venues, corrections }));
});

test('CLI reproduces pinned input/time, preserves all queries and refuses public output before reading source', async () => {
  const { main } = await import('../scripts/discover-trends.mjs');
  const fs = await import('node:fs/promises');
  const { randomUUID } = await import('node:crypto');
  const folder = '.local/discovery-test-' + randomUUID();
  const originalLog = console.log;
  try {
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(folder + '/source.csv', csvOf(fixture()));
    console.log = () => {};
    const args = ['--season', '2026', '--file', folder + '/source.csv', '--now', now, '--out', folder + '/report.json'];
    const a = await main(args), before = await fs.readFile(folder + '/report.json', 'utf8');
    const b = await main(args), after = await fs.readFile(folder + '/report.json', 'utf8');
    assert.equal(before, after); assert.deepEqual(a, b);
    assert.match(a.source.sha256, /^[a-f0-9]{64}$/);
    assert.equal(a.candidates.length, a.searched.candidates);
    await assert.rejects(main(['--season', '2026', '--file', 'missing.csv', '--out', 'web/public/report.json']), /inside .local/);
    await assert.rejects(main(['--season', '2026', '--file', 'missing.csv', '--week', '26']), /valid/);
  } finally { console.log = originalLog; await fs.rm(folder, { recursive: true, force: true }); }
});

test('duplicate source games are refused before publication and ambiguous same-game identities do not create matches', () => {
  const rows = fixture();
  assert.throws(() => discoverTrends({ csv: csvOf([...rows, rows[0]]), now, season: 2026, venues, corrections }), /Duplicate source game/);
  rows[1].away_coach = rows[1].home_coach;
  const report = discoverTrends({ csv: csvOf(rows), now, season: 2026, venues, corrections });
  const c = report.candidates.find(c => c.entity.kind === 'coach' && c.entity.value === 'Coach A' && c.situation.id === 'off-loss' && c.side === 'over');
  assert.equal(c.windows.all.sample, 0);
});

test('different market labels cannot duplicate the same physical sample in the varied selection', () => {
  const a = candidate('a-spread', ['1', '2', '3', '4']);
  const b = candidate('b-total', ['3', '4', '5', '6'], { market: 'total', family: 'rest', kind: 'qb' });
  const c = candidate('c-total', ['9', '10', '11', '12'], { market: 'total', family: 'venue', kind: 'coach' });
  const r = variedDiscoveries([a, b, c], { minimumGames: 4 });
  assert.equal(r.groups.length, 3); assert.equal(r.selected.length, 2);
  assert.ok(!(r.selected.some(s => s.id === a.id) && r.selected.some(s => s.id === b.id)));
});

test('variety balances fixed market sides without choosing a winner from their results', () => {
  const input = ['coach', 'qb', 'team'].flatMap((kind, k) => ['form', 'rest', 'venue'].flatMap((family, f) => ['spread', 'over', 'under'].map(side => ({
    ...candidate(`${kind}-${family}-${side}`, Array.from({ length: 12 }, (_, i) => `${k}-${f}-${i}`), { kind, family, market: side === 'spread' ? 'spread' : 'total', entity: `${kind}-${f}` }), side,
  }))));
  const selected = variedDiscoveries(input).selected.map(s => input.find(c => c.id === s.id));
  assert.deepEqual(new Set(selected.map(c => c.side)), new Set(['spread', 'over', 'under']));
});
