import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectResearchPeriod, researchRecord, evaluateResearchCandidate,
  groupResearchEvidence, researchLean, researchShortlist,
} from '../shared/trends-research.mjs';

const NOW = '2026-10-21T12:00:00Z';
const day = n => new Date(Date.UTC(2025, 0, 1 + n)).toISOString();
const rows = (results, offset = 0, prefix = 'g') => results.map((result, i) => ({
  gameId: `${prefix}${offset + i}`, date: day(offset + i), season: 2025, result, odds: null,
}));
const block = () => [1, 1, 1, 1, 1, 1, -1, -1, -1, -1];
const consistentRows = () => rows([...block(), ...block(), ...block()]);
const candidate = (overrides = {}) => ({
  id: 'c', version: 1, title: 'A situation', market: 'spread', direction: 'home',
  family: 'family-c', dedupGroup: '', conditions: ['home'],
  registeredAt: day(20), sourceState: 'computed', historicalTier: 3,
  applicable: true, conditionsKnown: true, records: consistentRows(), ...overrides,
});
const evaluated = (overrides = {}) => evaluateResearchCandidate(candidate(overrides), { now: NOW, season: 2026 });
const evidence = (id, direction = 'home', overrides = {}) => evaluated({
  id, direction, family: id, records: rows([...block(), ...block(), ...block()], 0, id), ...overrides,
});
const lean = (items, overrides = {}) => researchLean({
  evidence: items, market: 'spread', visible: true, kickoff: '2026-10-22T20:00:00Z',
  now: NOW, reference: { status: 'available', value: -3, observedAt: NOW },
  historyFresh: true, ...overrides,
});

test('last30 includes pushes and crosses seasons with deterministic equal-date ordering', () => {
  const input = rows(Array(35).fill(1)).map((r, i) => ({ ...r, season: i < 20 ? 2024 : 2025 }));
  input[34].result = 0;
  const selected = selectResearchPeriod(input.toReversed(), { now: NOW });
  assert.equal(selected.length, 30);
  assert.equal(selected[0].gameId, 'g5');
  assert.equal(selected.at(-1).result, 0);
  assert.deepEqual(selectResearchPeriod([{ ...input[0], gameId: 'z' }, { ...input[0], gameId: 'a' }], { now: NOW }).map(r => r.gameId), ['a', 'z']);
  assert.equal(input[0].gameId, 'g0');
  assert.ok(Object.isFrozen(selected) && Object.isFrozen(selected[0]));
});

test('period bounds use UTC instants, calendar 12 months and explicit NFL seasons', () => {
  const input = [
    { ...rows([1])[0], gameId: 'old', date: '2025-10-20T23:59:59Z', season: 2025 },
    { ...rows([1])[0], gameId: 'bound', date: '2025-10-21T12:00:00Z', season: 2025 },
    { ...rows([1])[0], gameId: 'january', date: '2026-01-10T12:00:00Z', season: 2025 },
    { ...rows([1])[0], gameId: 'current', date: NOW, season: 2026 },
    { ...rows([1])[0], gameId: 'future', date: '2026-10-21T12:00:01Z', season: 2026 },
  ];
  assert.deepEqual(selectResearchPeriod(input, { period: 'rolling12', now: NOW }).map(r => r.gameId), ['bound', 'january', 'current']);
  assert.deepEqual(selectResearchPeriod(input, { period: 'season', season: 2026, now: NOW }).map(r => r.gameId), ['current']);
  assert.deepEqual(selectResearchPeriod(input, { period: 'previousSeason', season: 2026, now: NOW }).map(r => r.gameId), ['old', 'bound', 'january']);
  assert.equal(selectResearchPeriod(rows(Array(35).fill(1)), { period: 'recent25', now: NOW }).length, 25);
  assert.throws(() => selectResearchPeriod(input, { period: 'best', now: NOW }), /period/i);
  assert.throws(() => selectResearchPeriod(input, { now: 'bad' }), /now/i);
  assert.throws(() => selectResearchPeriod(input, { period: 'season', now: NOW }), /season/i);
});

test('record and chart reconcile W-L-P without treating unknown outcomes as losses', () => {
  const r = researchRecord(rows([1, -1, 0, null, '1', NaN]));
  assert.deepEqual([r.wins, r.losses, r.pushes, r.sample, r.decisive, r.hitRate], [1, 1, 1, 3, 2, 0.5]);
  assert.equal(r.illustrativeUnits, -0.0909);
  assert.equal(r.chart.length, 3);
  assert.equal(r.chart.at(-1).illustrativeUnits, r.illustrativeUnits);
  assert.deepEqual(r.matchedGameIds, ['g0', 'g1', 'g2']);
  assert.equal(r.exclusions.invalidResult, 3);
  assert.deepEqual(r.coverage, { from: day(0), to: day(2) });
  assert.equal(r.illustrativeLabel, 'Illustrative units at -110');
});

test('actual price returns require every selected price including pushes; malformed prices never default', () => {
  const input = rows([1, 1, -1, 0]).map((r, i) => ({ ...r, odds: [-200, 150, -110, 100][i] }));
  const complete = researchRecord(input);
  assert.equal(complete.actualUnits, 1);
  assert.equal(complete.chart.at(-1).actualUnits, 1);
  assert.deepEqual(complete.priceCoverage, { priced: 4, total: 4, complete: true });
  for (const odds of [null, '', true, '110', 0, 99, -99, Infinity]) {
    const partial = researchRecord(input.map((r, i) => i === 3 ? { ...r, odds } : r));
    assert.equal(partial.actualUnits, null);
    assert.ok(partial.chart.every(point => point.actualUnits === null));
    assert.equal(partial.priceCoverage.priced, 3);
  }
  assert.equal(researchRecord([]).actualUnits, null);
  assert.equal(researchRecord(rows([0])).hitRate, null);
});

test('records deduplicate physical games and reject conflicting duplicates and unsafe dates', () => {
  const r = researchRecord([
    ...rows([1, -1]), { ...rows([1])[0] },
    { ...rows([1])[0], gameId: 'g1', result: 1 },
    { ...rows([1])[0], gameId: 'bad', date: '2025-02-30T00:00:00Z' },
    { ...rows([1])[0], gameId: 'local', date: '2025-01-01T12:00:00' },
    null, { ...rows([1])[0], gameId: '' },
  ]);
  assert.deepEqual(r.matchedGameIds, ['g0']);
  assert.equal(r.exclusions.duplicate, 1);
  assert.equal(r.exclusions.conflicting, 2);
  assert.equal(r.exclusions.invalidDate, 2);
  assert.equal(r.exclusions.invalidRecord, 2);
});

test('recent consistency needs three positive blocks with eight decisive games each', () => {
  const r = evaluated();
  assert.equal(r.qualification.qualifies, true);
  assert.equal(r.qualification.route, 'recent');
  assert.equal(r.qualification.label, 'Consistent, not proven');
  assert.equal(r.qualification.blocks.length, 3);
  assert.equal(r.historicalTier, 3);
  assert.equal(r.qualification.sparseEarlierHistory, true);
  assert.equal(evaluated({ records: consistentRows().slice(1) }).qualification.qualifies, false);
  const weakBlock = rows([...Array(10).fill(1), ...Array(10).fill(-1), ...Array(10).fill(1)]);
  assert.equal(evaluated({ records: weakBlock }).qualification.qualifies, false);
  const sparseBlock = rows([1, 1, 1, 1, 1, 1, 1, 0, 0, 0, ...block(), ...block()]);
  assert.ok(evaluated({ records: sparseBlock }).qualification.reasons.includes('recent_block_decisive'));
});

test('earlier history gate applies at 30 decisive results and at most two conditions', () => {
  const losing = rows(Array(30).fill(-1));
  const recent = rows([...block(), ...block(), ...block()], 30);
  const mixed = evaluated({ records: [...losing, ...recent] });
  assert.equal(mixed.qualification.qualifies, false);
  assert.ok(mixed.qualification.reasons.includes('earlier_not_positive'));
  assert.equal(evaluated({ records: [...losing.slice(1), ...recent] }).qualification.qualifies, true);
  assert.equal(evaluated({ conditions: ['a', 'b', 'c'] }).qualification.qualifies, false);
  assert.equal(evaluated({ sourceState: 'source-reported' }).qualification.qualifies, false);
  assert.equal(evaluated({ direction: null }).qualification.qualifies, false);
});

test('historical tiers need positive up-to-30 recent games with 20 decisive results', () => {
  const positive20 = rows([...Array(11).fill(1), ...Array(9).fill(-1), ...Array(10).fill(0)]);
  for (const historicalTier of [1, 2]) {
    const r = evaluated({ historicalTier, records: positive20 });
    assert.equal(r.qualification.qualifies, true);
    assert.equal(r.qualification.route, 'historical');
    assert.equal(r.historicalTier, historicalTier);
  }
  assert.equal(evaluated({ historicalTier: 1, records: positive20.slice(1) }).qualification.qualifies, false);
  assert.equal(evaluated({ historicalTier: 1, records: rows([...Array(10).fill(1), ...Array(10).fill(-1), ...Array(10).fill(0)]) }).qualification.qualifies, false);
  assert.equal(evaluated({ historicalTier: 2, records: rows([...Array(19).fill(1), ...Array(11).fill(0)]) }).qualification.qualifies, false);
});

test('historical route admits 20-29 available games while recent route still needs 30', () => {
  const twenty = rows([...Array(11).fill(1), ...Array(9).fill(-1)]);
  assert.equal(evaluated({ historicalTier: 1, records: twenty }).qualification.qualifies, true);
  assert.equal(evaluated({ historicalTier: 2, records: [...twenty, ...rows(Array(5).fill(0), 20)] }).qualification.qualifies, true);
  assert.equal(evaluated({ historicalTier: 2, records: twenty.slice(0, 19) }).qualification.qualifies, false);
  assert.equal(evaluated({ historicalTier: 3, records: twenty }).qualification.qualifies, false);
});

test('as-of filtering, prospective registration and selected period do not change canonical qualification', () => {
  const input = candidate({ records: [...consistentRows(), { ...rows([1])[0], gameId: 'future', date: '2027-01-01T00:00:00Z' }] });
  const recent = evaluateResearchCandidate(input, { now: NOW, season: 2026 });
  const season = evaluateResearchCandidate(input, { now: NOW, season: 2026, period: 'season' });
  assert.equal(recent.historical.sample, 30);
  assert.equal(recent.retrospective.sample, 20);
  assert.equal(recent.prospective.sample, 10);
  assert.equal(recent.exclusions.future, 1);
  assert.deepEqual(recent.qualification, season.qualification);
  assert.deepEqual(recent.matchedGameIds, season.matchedGameIds);
  assert.equal(season.record.sample, 0);
  assert.ok(Object.isFrozen(recent.qualification.blocks));
  assert.equal(input.records.length, 31);
  assert.equal(evaluated({ registeredAt: 'unknown' }).qualification.qualifies, false);
  assert.equal(evaluated({ direction: 'A' }).qualification.qualifies, true);
});

test('evidence grouping uses same-market connected components at the 50% smaller-sample boundary', () => {
  const a = evidence('a');
  const b = evidence('b');
  const c = evidence('c');
  const withIds = (v, ids) => ({ ...v, matchedGameIds: ids });
  const grouped = groupResearchEvidence([
    withIds(a, ['1', '2', '3', '4']), withIds(b, ['3', '4', '5', '6']), withIds(c, ['5', '6', '7', '8']),
    withIds(evidence('d'), ['8', '9', '10', '11']),
    withIds(evidence('total', 'over', { market: 'total' }), ['1', '2', '3', '4']),
  ]);
  assert.deepEqual(grouped.map(g => g.memberIds), [['a', 'b', 'c'], ['d'], ['total']]);
  assert.equal(grouped[0].overlaps.length, 2);
  assert.ok(Object.isFrozen(grouped[0].members));
});

test('dedup group, family, canonical reposts and mixed directions cannot manufacture votes', () => {
  const a = evidence('a', 'home', { dedupGroup: 'repost' });
  const b = evidence('b', 'away', { dedupGroup: 'repost' });
  const c = evidence('c', 'home', { family: 'shared' });
  const d = evidence('d', 'home', { family: 'shared' });
  const groups = groupResearchEvidence([a, b, c, d, { ...a }]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].memberIds, ['a', 'b']);
  assert.equal(groups[0].mixed, true);
  assert.equal(groups[0].direction, null);
  assert.equal(lean([a, b, c, d]).direction, null);
});

test('two agreeing groups beat one opposition with yellow Alternative even outside three cards', () => {
  const input = [evidence('a'), evidence('b'), evidence('c'), evidence('z', 'away')];
  assert.equal(researchShortlist(input).length, 3);
  assert.ok(!researchShortlist(input).some(e => e.id === 'z'));
  const r = lean(input);
  assert.equal(r.state, 'lean');
  assert.equal(r.direction, 'home');
  assert.equal(r.tone, 'win');
  assert.equal(r.supporting.length, 3);
  assert.equal(r.alternatives.length, 1);
  assert.equal(r.alternatives[0].tone, 'pending');
  assert.equal(r.alternatives[0].role, 'alternative');
  assert.equal(r.alternatives[0].members[0].qualification.label, 'Consistent, not proven');
  assert.equal(lean(input.slice(1)).direction, 'home');
});

test('balanced, one-group, mixed, and higher historical opposition have explicit no-clear-lean reasons', () => {
  assert.ok(lean([evidence('a')]).reasons.includes('insufficient_groups'));
  assert.ok(lean([evidence('a'), evidence('b'), evidence('c', 'away'), evidence('d', 'away')]).reasons.includes('balanced_groups'));
  const conflict = lean([evidence('a'), evidence('b'), evidence('c', 'away', { historicalTier: 1 })]);
  assert.equal(conflict.state, 'no-clear-lean');
  assert.ok(conflict.reasons.includes('stronger_historical_conflict'));
  assert.equal(lean([evidence('a', 'home', { historicalTier: 1 }), evidence('b'), evidence('c', 'away', { historicalTier: 1 })]).direction, 'home');
  const context = lean([evidence('a'), evidence('b'), evidence('c', 'away', { sourceState: 'source-reported' })]);
  assert.equal(context.direction, 'home');
  assert.equal(context.context.length, 1);
});

test('closed markets return no evidence metadata and unavailable conditions disable leans', () => {
  const items = [evidence('secret-a'), evidence('secret-b')];
  assert.deepEqual(lean(items, { visible: false }), { state: 'hidden' });
  assert.equal(lean(items, { kickoff: NOW }).state, 'unavailable');
  assert.equal(lean(items, { kickoff: 'unknown' }).state, 'unavailable');
  assert.equal(lean(items, { historyFresh: false }).state, 'unavailable');
  assert.equal(lean(items.map(e => ({ ...e, conditionsKnown: false }))).state, 'unavailable');
  assert.equal(lean(items.map(e => ({ ...e, applicable: undefined }))).direction, null);
  assert.equal(lean(items.map(e => ({ ...e, direction: 'A' }))).direction, null);
});

test('reference must have finite market value and nonfuture observation within twelve hours', () => {
  const items = [evidence('a'), evidence('b')];
  assert.equal(lean(items, { reference: { status: 'available', value: 0, observedAt: '2026-10-21T00:00:00Z' } }).direction, 'home');
  for (const reference of [null, {},
    { status: 'available', value: -3, observedAt: '2026-10-20T23:59:59Z' },
    { status: 'available', value: -3, observedAt: '2026-10-21T12:00:01Z' },
    { status: 'missing', value: -3, observedAt: NOW },
    { status: 'available', value: null, observedAt: NOW },
    { status: 'available', value: '-3', observedAt: NOW },
    { status: 'available', value: -3, observedAt: 'invalid' },
  ]) assert.equal(lean(items, { reference }).state, 'unavailable');
  assert.equal(lean(items, { market: 'total', reference: { status: 'available', value: 0, observedAt: NOW } }).state, 'unavailable');
});

test('shortlist ranks Tier1 then Tier2/recent equally, latest date then prospective sample then ID', () => {
  const newer = rows([...block(), ...block(), ...block()], 30, 'new');
  const recent = evidence('recent', 'home', { records: newer, registeredAt: day(30) });
  const tier2 = evidence('tier2', 'home', { historicalTier: 2 });
  const tier1 = evidence('tier1', 'home', { historicalTier: 1 });
  assert.deepEqual(researchShortlist([tier2, recent, tier1], 99).map(e => e.id), ['tier1', 'recent', 'tier2']);
  const lessProspective = evidence('aaa', 'home', { registeredAt: day(29) });
  assert.deepEqual(researchShortlist([lessProspective, evidence('b'), evidence('a')]).map(e => e.id), ['a', 'b', 'aaa']);
  assert.equal(researchShortlist([recent, { ...recent }, tier2]).length, 2);
  assert.equal(researchShortlist([tier1], 0).length, 0);
  assert.deepEqual(researchShortlist([evidence('bad', 'home', { records: [] })]), []);
});

test('future registration never qualifies before known time, including the exact boundary', () => {
  const registeredAt = '2026-10-21T12:00:00Z';
  assert.equal(evaluateResearchCandidate(candidate({ registeredAt }), { now: '2026-10-21T11:59:59Z' }).qualification.qualifies, false);
  assert.equal(evaluateResearchCandidate(candidate({ registeredAt }), { now: registeredAt }).qualification.qualifies, true);
  assert.equal(evaluateResearchCandidate(candidate({ registeredAt }), { now: registeredAt }).historical.sample, 30);
});

test('invalid candidate identities/conditions/markets fail safely without freezing inputs', () => {
  for (const conditions of [[null], [''], ['   '], [{}]]) {
    const input = candidate({ conditions });
    assert.equal(evaluateResearchCandidate(input, { now: NOW }).qualification.qualifies, false);
    assert.equal(Object.isFrozen(input.conditions), false);
  }
  for (const version of [null, {}, [], 0, -1, NaN, true]) {
    assert.equal(evaluated({ version }).qualification.qualifies, false);
  }
  assert.equal(evaluated({ market: 'constructor' }).qualification.qualifies, false);
  assert.equal(lean([], { market: 'constructor' }).state, 'unavailable');
  assert.equal(researchRecord(null).sample, 0);
  assert.equal(evaluateResearchCandidate(null, { now: NOW }).qualification.qualifies, false);
});

test('timezone offsets normalize exactly, invalid midnight rollover is excluded and leap-year window clamps', () => {
  const input = rows([1, 1, 1]).map((r, i) => ({ ...r, date: [
    '2025-01-01T01:00:00+01:00', '2025-01-01T24:00:00Z', '2025-02-28T12:00:00Z',
  ][i] }));
  assert.equal(researchRecord(input).exclusions.invalidDate, 1);
  assert.equal(researchRecord(input).records[0].date, '2025-01-01T00:00:00.000Z');
  const window = [
    { ...input[0], date: '2023-02-28T11:59:59Z' },
    { ...input[1], date: '2023-02-28T12:00:00Z' },
  ];
  assert.equal(selectResearchPeriod(window, { period: 'rolling12', now: '2024-02-29T12:00:00Z' }).length, 1);
});

test('total leans normalize concrete directions and emerging context cannot add a vote', () => {
  const items = [evidence('a', 'under', { market: 'total' }), evidence('b', 'under', { market: 'total' }),
    evidence('c', 'over', { market: 'total', records: rows([1, 1]) })];
  const result = lean(items, { market: 'total', reference: { status: 'available', value: 45, observedAt: NOW } });
  assert.equal(result.direction, 'under');
  assert.deepEqual(result.counts, { over: 0, under: 2 });
  assert.equal(result.context.length, 1);
  assert.ok(Object.isFrozen(result.context[0]));
  assert.equal(evaluated({ sourceState: 'unavailable' }).qualification.label, 'Research unavailable');
});
