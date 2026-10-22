// Contract: the prepared-history path that keeps hosted /trends/week under the Edge CPU limit
// returns exactly what the full-history generateWeek returns for the same inputs, and the
// shipped server seed carries that prepared history instead of the history CSV.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { T, corrections, historyCsv, read, registry, registryText, seasonCsv, venues } from './trends-fixture.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const sources = { history: { file: 'shared/trends/history-1999-2025.csv', sha256: sha(historyCsv) },
  season: { file: 'shared/trends/season-2026-week-07.csv', sha256: sha(read('shared/trends/season-2026-week-07.csv')) }, registrySha256: sha(registryText) };
const prepared = T.prepareHistory({ historyCsv, registry, venues, corrections, season: 2026, registrySha256: sources.registrySha256 });
const preparedJson = JSON.stringify(prepared);
const shipped = () => JSON.parse(preparedJson); // the form a request decodes from the seed
const week7Csv = read('shared/trends/season-2026-week-07.csv');

/** Week 8 from the Week 7 file: fictional finals and lines before Monday; the Monday game stays pending. */
function week8Csv() {
  let k = 0;
  const rows = T.parseCsvRows(week7Csv).rows.map(r => {
    if (Number(r.week) !== 7 || r.weekday === 'Monday') return r;
    k++;
    return { ...r, home_score: String(17 + (k * 7) % 15), away_score: String(13 + (k * 5) % 17),
      spread_line: String((k % 7) - 3 + (k % 2 ? 0.5 : 0)), total_line: String(37 + (k * 3) % 13) };
  });
  return T.writeCompactCsv(rows, { redactUnplayed: true });
}
/** Week 1 before any 2026 final: no current-season units at all. */
const week1Csv = () => T.writeCompactCsv(T.parseCsvRows(seasonCsv).rows.map(r => ({ ...r, home_score: '', away_score: '' })), { redactUnplayed: true });

const cases = [
  ['Week 6 frozen season', seasonCsv, 6],
  ['Week 8 with pending Monday final', week8Csv(), 8],
  ['Week 1 without current finals', week1Csv(), 1],
];
for (const [name, csv, week] of cases) {
  test(`prepared history reproduces full generation byte for byte: ${name}`, () => {
    const input = { seasonCsv: csv, season: 2026, week, registry, venues, corrections, sources, allowPending: true, includeWindows: true };
    const full = JSON.stringify(T.generateWeek({ ...input, historyCsv }));
    assert.equal(JSON.stringify(T.generateWeek({ ...input, history: shipped() })), full);
  });
}

test('prepared history reproduces the committed Week 7 file without reading the history CSV', () => {
  const rebuilt = T.generateWeek({ history: shipped(), seasonCsv: week7Csv, season: 2026, week: 7, registry, venues, corrections, sources });
  assert.equal(JSON.stringify(rebuilt) + '\n', read('shared/trends/2026-week-07.json'));
});

test('every prepared preset resumes to the full evaluation, including streaks and windows across the season boundary', () => {
  const rows = [...T.parseCsvRows(historyCsv).rows, ...T.parseCsvRows(week8Csv()).rows];
  const fg = T.buildFeatures(T.redactUnplayed(T.normalizeRows(rows, { corrections, venues })), { venues, corrections });
  const pop = T.evaluationGames(fg), current = pop.filter(g => g.season === 2026);
  const ctx = { pop, rules: corrections.rules, throughSeason: 2025, currentSeason: 2026, lastFinalDate: registry.lastFinalDate };
  const byId = new Map(registry.presets.map(p => [p.id, p]));
  const history = shipped();
  const view = r => JSON.stringify({ ...r, units: undefined, betSet: undefined, history: undefined, agg: undefined,
    oos: { ...r.oos, sideOf: [...r.oos.sideOf] }, wfAll: { ...r.wfAll, sideOf: [...r.wfAll.sideOf] },
    windows: [T.resultWindows(r, 2026), T.resultWindows(r, 2026, 'A'), T.resultWindows(r, 2026, 'B')] });
  let continued = 0, interrupted = 0, historyOnly = 0;
  for (const [id, h] of Object.entries(history.presets)) {
    const cut = id.indexOf('|');
    const p = byId.get(id) ?? { id, market: id.slice(0, cut), atoms: id.slice(cut + 1).split('+') };
    const full = T.evaluatePreset(p, ctx);
    const resumed = T.resumePreset(p, ctx, h, T.betUnits(p, current, { rules: corrections.rules }));
    assert.equal(view(resumed), view(full), id);
    // Coverage of the streak merge: the history streak continued, interrupted, or carried with no current decided bets.
    const hResult = h.w[4], side = full.wfAll.sideOf.get(2026);
    const decided = side ? resumed.units.map(u => (side === 'A' ? u.res : -u.res)).filter(r => r !== 0).map(r => (r > 0 ? 'W' : 'L')) : [];
    if (!hResult) continue;
    if (!decided.length) historyOnly++;
    else if (decided.every(r => r === hResult)) continued++;
    else interrupted++;
  }
  assert.ok(continued > 0 && interrupted > 0 && historyOnly > 0, JSON.stringify({ continued, interrupted, historyOnly }));
});

test('the resumed path refuses history rows and mismatched preparation instead of rebuilding history', () => {
  const input = { history: shipped(), season: 2026, week: 6, registry, venues, corrections, sources, allowPending: true };
  const lastHistoryRow = T.parseCsvRows(historyCsv).rows.at(-1);
  const withHistory = T.writeCompactCsv([lastHistoryRow, ...T.parseCsvRows(seasonCsv).rows]);
  assert.throws(() => T.generateWeek({ ...input, seasonCsv: withHistory }), /only seasons after the prepared history/);
  assert.throws(() => T.generateWeek({ ...input, seasonCsv, sources: { ...sources, registrySha256: 'other' } }), /does not match/);
  assert.throws(() => T.generateWeek({ ...input, seasonCsv, season: 2027 }), /does not match/);
  assert.throws(() => T.generateWeek({ ...input, seasonCsv, corrections: { ...corrections, rules: { ...corrections.rules, restFromSchedule: false } } }), /does not match/);
});

test('the shipped server seed carries the current prepared history and no history CSV', async () => {
  const { default: seed } = await import('../cloud/trends-seed.mjs');
  const { decodePreparedHistory } = await import('../cloud/trends.mjs');
  assert.equal('historyCsv' in seed, false);
  assert.deepEqual(seed.sources.history, sources.history);
  assert.equal(seed.sources.registrySha256, sources.registrySha256);
  assert.equal(JSON.stringify(await decodePreparedHistory(seed.preparedHistory)), preparedJson, 'run node scripts/trends-seed.mjs');
  // Bundle budget: the seed must stay smaller than the history CSV it replaced (1,917,050 bytes before).
  assert.ok(read('cloud/trends-seed.mjs').length < 1_400_000);
});

test('the hosted service answers from the shipped seed with the full-generation evidence', async () => {
  const { default: seed } = await import('../cloud/trends-seed.mjs');
  const { createTrendsService, handleTrends, prepareSeason } = await import('../cloud/trends.mjs');
  const now = Date.parse('2026-10-22T05:00:00Z');
  const games = T.generateWeek({ history: shipped(), seasonCsv: week7Csv, season: 2026, week: 7, registry, venues, corrections, sources }).games;
  const slate = { published: true, season: 2026, week: 7, games: games.map(g => ({ id: g.id, kickoff: g.kickoff, spread: { visible: false, value: 987654 } })) };
  const service = createTrendsService({ clock: () => now, rpc: async () => slate, readSeason: async () => week7Csv, seed });
  const result = await handleTrends({ route: '/trends/week', body: { season: 2026, week: 7 }, user: { id: '10000000-0000-4000-8000-000000000001' }, service, clock: () => now });
  const expected = T.generateWeek({ historyCsv, seasonCsv: prepareSeason({ sourceCsv: week7Csv, seedCsv: seed.seasonCsv, season: 2026, week: 7, now, slate: slate.games }),
    season: 2026, week: 7, registry, venues, corrections, sources: seed.sources, allowPending: true, includeWindows: true });
  assert.equal(result.availability.stale, false);
  for (const key of ['cards', 'rows', 'referees', 'bandTables', 'watchBands', 'tierCounts', 'pending']) assert.deepEqual(result[key], expected[key], key);
  assert.deepEqual(result.games, expected.games);
  assert.ok(!JSON.stringify(result).includes('987654'));
});
