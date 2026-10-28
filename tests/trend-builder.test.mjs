import test from 'node:test';
import assert from 'node:assert/strict';
import { T, corrections, historyCsv, read, registry, venues } from './trends-fixture.mjs';
import * as B from '../shared/trend-builder.mjs';
import { builderHistoryText, DEFAULT_SEASON_FILE, OUTPUT } from '../scripts/prepare-trend-builder.mjs';

const text = read(OUTPUT);
const file = JSON.parse(text);
const history = B.decodeHistory(file);
const week7Csv = read(DEFAULT_SEASON_FILE);
const week7 = JSON.parse(read('shared/trends/2026-week-07.json'));

test('the builder history reproduces byte for byte from the committed nflverse inputs', () => {
  assert.equal(builderHistoryText({ historyCsv, seasonCsv: week7Csv, seasonFile: DEFAULT_SEASON_FILE, venues, corrections }), text);
  assert.equal(file.source.license, 'CC BY 4.0');
  assert.equal(file.source.lineSource, T.LINE_SOURCE);
  assert.deepEqual(file.conditions, { game: B.GAME_CONDITIONS.map(c => c.id), team: B.TEAM_CONDITIONS.map(c => c.id) });
  assert.equal(file.coverage.firstSeason, 2002);
  assert.match(read('web/src/next/trends/builderData.js'), /import\('\.\.\/\.\.\/\.\.\/\.\.\/shared\/trends\/builder-history\.json'\)/);
});

test('the builder history holds played games only: no current line, no unplayed week, no player data', () => {
  const unplayed = new Set(T.parseCsvRows(week7Csv).rows.filter(r => !T.rowPlayed(r)).map(r => r.game_id));
  assert.ok(unplayed.size > 0);
  assert.ok(history.rows.every(r => Number.isInteger(r.hs) && Number.isInteger(r.as)));
  const latest = history.rows.at(-1);
  assert.ok(latest.date <= '2026-10-19', latest.date);
  assert.ok(!history.rows.some(r => r.season === 2026 && r.week >= 7));
  assert.doesNotMatch(text, /[\w.+-]+@[\w-]+\.[\w.]+/);
  assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  assert.ok(Buffer.byteLength(text) < 450_000, 'lazy chunk budget');
});

test('records match the engine for every single-condition preset in the registry', () => {
  // The registry's one-filter game presets in the builder's conditions, evaluated by the engine over the same population.
  const rows = T.parseCsvRows(historyCsv).rows;
  rows.push(...T.parseCsvRows(week7Csv).rows);
  const games = T.normalizeRows(rows, { venues, corrections });
  T.redactUnplayed(games);
  const pop = T.evaluationGames(T.buildFeatures(games, { venues, corrections }));
  const byAtom = new Map(B.GAME_CONDITIONS.filter(c => !c.hidden).map(c => [c.atom, c.id]));
  const presets = registry.presets.filter(p => !p.variant && p.atoms.length === 1 && ['home_ats', 'fav_ats', 'total'].includes(p.market) && byAtom.has(p.atoms[0].slice(2)));
  assert.ok(presets.length >= 30, `${presets.length} presets`);
  for (const p of presets) {
    const units = T.betUnits(p, pop, { rules: corrections.rules });
    const a = { W: units.filter(u => u.res > 0).length, L: units.filter(u => u.res < 0).length, P: units.filter(u => u.res === 0).length };
    const side = p.market === 'total' ? 'over' : p.market === 'home_ats' ? 'home' : 'fav';
    const r = B.evaluateSpec(history, { market: p.market === 'total' ? 'total' : 'spread', side, filters: [{ id: byAtom.get(p.atoms[0].slice(2)) }] }).record;
    assert.deepEqual({ W: r.W, L: r.L, P: r.P }, a, p.id);
    const flip = B.evaluateSpec(history, { market: p.market === 'total' ? 'total' : 'spread', side: { over: 'under', home: 'away', fav: 'dog' }[side], filters: [{ id: byAtom.get(p.atoms[0].slice(2)) }] }).record;
    assert.deepEqual({ W: flip.W, L: flip.L, P: flip.P }, { W: a.L, L: a.W, P: a.P }, `${p.id} other side`);
  }
});

test('the wind card matches the published week file, and the Wilson interval matches the engine', () => {
  const wind = B.evaluateSpec(history, { market: 'total', side: 'under', filters: [{ id: 'wind10' }] });
  const card = week7.cards['total|g:g_wind10'].record;
  assert.deepEqual([wind.record.W, wind.record.L, wind.record.P], [card.W, card.L, card.P]);
  assert.ok(wind.excluded.unknown > 0, 'games without observed wind are left out, never a miss');
  assert.deepEqual(B.wilson(898, 1628), T.wilson(898, 1628));
});

test('this week’s conditions read from the week file equal the engine’s own values for every Week 7 game', () => {
  const rows = T.parseCsvRows(historyCsv).rows;
  rows.push(...T.parseCsvRows(week7Csv).rows);
  const games = T.normalizeRows(rows, { venues, corrections });
  T.redactUnplayed(games);
  const fg = new Map(T.buildFeatures(games, { venues, corrections }).map(g => [g.id, g]));
  assert.equal(week7.games.length, 14);
  for (const entry of week7.games) {
    const g = fg.get(entry.nflverseId);
    const values = B.weekGameConditions(entry, week7.week);
    for (const c of B.GAME_CONDITIONS) {
      const engine = g.gf[c.atom] === true ? true : g.gf[c.atom] === false ? false : null;
      assert.equal(values.game.get(c.id), engine, `${entry.id} ${c.id}`);
    }
    for (const side of [0, 1]) for (const c of B.TEAM_CONDITIONS) {
      const engine = g.tf[side][c.atom] === true ? true : g.tf[side][c.atom] === false ? false : null;
      assert.equal(values.team[side].get(c.id), engine, `${entry.id} side ${side} ${c.id}`);
    }
  }
});

test('specs: at most three filters, known ids only, ranges clamped, team subjects per market', () => {
  const spec = B.cleanSpec({ market: 'spread', side: 'dog', filters: [{ id: 'div' }, { id: 'div' }, { id: 'nope' }, { id: 'neutral' }, { id: 'bye', who: 'home' }, { id: 'spread', min: 9, max: 2.2 }, { id: 'prime' }] });
  assert.deepEqual(spec, { market: 'spread', side: 'dog', filters: [{ id: 'div' }, { id: 'bye', who: 'either' }, { id: 'spread', min: 2, max: 9 }] });
  assert.equal(B.cleanSpec({ market: 'moneyline' }), null);
  assert.equal(B.cleanSpec({ market: 'total', side: 'fav' }).side, 'over');
  assert.equal(B.specTitle(spec), 'Spread · Underdog · Divisional game · Either team off a bye (13+ days of rest) · Favorite by 2 to 9');
  assert.equal(B.filterText(spec, { id: 'seasons', min: 2018, max: 2026 }), 'Seasons 2018 on');
  assert.deepEqual([...B.specNeeds(spec)], ['spread']);
  assert.deepEqual([...B.specNeeds({ market: 'total', side: 'over', filters: [{ id: 'div' }] })], []);
});

test('period split: same, opposite, even, few and empty, never a test claim', () => {
  const r = (W, L) => ({ W, L, P: 0, n: W + L, decided: W + L, coverRate: W / (W + L) });
  assert.equal(B.splitLabel(r(40, 30), r(35, 30)).state, 'same');
  assert.equal(B.splitLabel(r(40, 30), r(25, 30)).state, 'opposite');
  assert.equal(B.splitLabel(r(40, 30), r(30, 30)).state, 'even');
  assert.equal(B.splitLabel(r(40, 30), r(10, 5)).state, 'few');
  assert.equal(B.splitLabel(r(40, 30), { n: 0, decided: 0 }).state, 'empty');
  const recent = B.evaluateSpec(history, { market: 'total', side: 'over', filters: [{ id: 'seasons', min: 2018, max: 2026 }] });
  assert.equal(recent.split.state, 'empty');
  assert.equal(recent.label, 'Found by search — not tested');
});

test('copy never ranks, recommends or calls modelled units a return', () => {
  const words = [...Object.values(B.BUILDER_COPY), ...B.conditionOptions().flatMap(g => [g.group, ...g.items.map(i => i.label)]),
    ...B.TEAM_CONDITIONS.map(c => c.phrase), ...Object.values(B.SIDES).flat().map(s => s.label)];
  for (const w of words) {
    assert.deepEqual(T.bannedCopy(w), [], w);
    assert.doesNotMatch(w, /\bROI\b/, w);
    if (/return on investment/i.test(w)) assert.match(w, /not a return on investment/i, w);
  }
  assert.match(B.BUILDER_COPY.units, /^Illustrative units at -110$/);
  // Contributing games stay in date order, whatever their result.
  const r = B.evaluateSpec(history, { market: 'spread', side: 'fav', filters: [{ id: 'snf' }] });
  assert.ok(r.games.every((g, i) => i === 0 || r.games[i - 1].date <= g.date));
  assert.ok(r.series.every((s, i) => i === 0 || r.series[i - 1].season < s.season));
});

const entry = (patch = {}) => ({ id: 'NE-CHI', nflverseId: '2026_07_NE_CHI', away: 'NE', home: 'CHI', flags: { window: 'primetime', day: 'TNF', divisional: false, interconference: true, roof: 'outdoors', surface: 'grass', neutral: false, rest: { NE: 4, CHI: 14 }, travel: [{ team: 'NE', traveling: true }, { team: 'CHI', traveling: false }], ...patch } });

test('this week: line conditions stay locked until the viewer’s own market opens, and never read a closed line', () => {
  const spec = { market: 'spread', side: 'dog', filters: [{ id: 'prime' }, { id: 'spread', min: 3, max: 7 }] };
  // A closed market: the line passed in is ignored.
  assert.deepEqual(B.matchGame(spec, { entry: entry(), week: 7, access: { spread: false }, lines: { spread: 4 } }), { state: 'locked', side: null });
  assert.deepEqual(B.matchGame(spec, { entry: entry(), week: 7, access: { spread: true }, lines: {} }), { state: 'unknown', side: null });
  // nflverse convention: +4 means the home team (CHI) is favored, so the underdog is NE.
  assert.deepEqual(B.matchGame(spec, { entry: entry(), week: 7, access: { spread: true }, lines: { spread: 4 } }), { state: 'match', side: 'NE' });
  assert.equal(B.matchGame(spec, { entry: entry(), week: 7, access: { spread: true }, lines: { spread: 9 } }).state, 'no');
  // A failing non-line condition says no without waiting on a line.
  assert.equal(B.matchGame({ ...spec, filters: [{ id: 'div' }, { id: 'spread', min: 3, max: 7 }] }, { entry: entry(), week: 7, access: {} }).state, 'no');
  // Home/road sides and non-line conditions need no line at all.
  assert.deepEqual(B.matchGame({ market: 'spread', side: 'home', filters: [{ id: 'bye', who: 'pick' }, { id: 'short', who: 'opp' }] }, { entry: entry(), week: 7 }), { state: 'match', side: 'CHI' });
  assert.deepEqual(B.matchGame({ market: 'total', side: 'under', filters: [{ id: 'wind10' }] }, { entry: entry(), week: 7 }), { state: 'unknown', side: null });
  assert.equal(B.matchGame({ market: 'total', side: 'under', filters: [{ id: 'seasons', min: 2002, max: 2017 }] }, { entry: entry(), week: 7 }).state, 'no');
  assert.equal(B.matchGame({ market: 'total', side: 'under', filters: [{ id: 'seasons', min: 2018, max: 2026 }] }, { entry: entry(), week: 7 }).state, 'match');
  const week = B.weekMatches(spec, { week: 7, games: [
    { id: 'a', entry: entry(), access: { spread: true }, lines: { spread: 4 } },
    { id: 'b', entry: entry(), access: { spread: true }, lines: { spread: 4 }, started: true },
    { id: 'c', entry: entry(), access: { spread: false } },
  ] });
  assert.deepEqual([week.matches, week.waiting], [1, 1]);
});

test('saved trends: per device, deduplicated, capped, in save order, and storage failures never throw', () => {
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const a = B.saveTrend({ market: 'total', side: 'under', filters: [{ id: 'wind10' }] }, { storage, now: '2026-10-28T00:00:00.000Z', id: 'a' });
  const b = B.saveTrend({ market: 'spread', side: 'home', filters: [{ id: 'div' }] }, { storage, now: '2026-10-28T00:01:00.000Z', id: 'b' });
  const again = B.saveTrend({ market: 'total', side: 'under', filters: [{ id: 'wind10' }] }, { storage, id: 'c' });
  assert.ok(a.ok && b.ok && again.ok);
  assert.deepEqual(B.readSaved(storage).map(i => i.id), ['a', 'b']);
  assert.deepEqual(B.removeTrend('a', { storage }).items.map(i => i.id), ['b']);
  store.set(B.SAVED_KEY, '{not json');
  assert.deepEqual(B.readSaved(storage), []);
  store.set(B.SAVED_KEY, JSON.stringify({ v: 1, items: [{ id: 'x', spec: { market: 'nope' } }, { id: '<script>', spec: { market: 'total' } }, { id: 'ok', spec: { market: 'total', side: 'over' } }] }));
  assert.deepEqual(B.readSaved(storage).map(i => i.id), ['ok']);
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.deepEqual(B.readSaved(broken), []);
  assert.equal(B.saveTrend({ market: 'total', side: 'over' }, { storage: broken }).ok, false);
  assert.equal(B.removeTrend('x', { storage: broken }).ok, false);
  const many = new Map(), full = { getItem: k => many.get(k) ?? null, setItem: (k, v) => many.set(k, v) };
  for (let i = 0; i < B.MAX_SAVED; i++) assert.ok(B.saveTrend({ market: 'spread', side: 'home', filters: [{ id: 'spread', min: i * 0.5, max: 20 }] }, { storage: full, id: `n${i}` }).ok);
  assert.equal(B.saveTrend({ market: 'total', side: 'over' }, { storage: full }).full, true);
});
