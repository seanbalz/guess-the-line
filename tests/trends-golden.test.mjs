import test from 'node:test';
import assert from 'node:assert/strict';
import { T, build, corrections, historyCsv, read, registry, studyCorrections, venues } from './trends-fixture.mjs';

const real = build();
const ctx = { pop: real.pop, rules: corrections.rules, throughSeason: 2025, currentSeason: 2026, lastFinalDate: registry.lastFinalDate };
const study = build(studyCorrections, { withSeason: false });
const studyCtx = { pop: study.pop, rules: studyCorrections.rules, throughSeason: 2025, currentSeason: 2025, lastFinalDate: '2099-01-01' };
const rec = r => `${r.W}-${r.L}-${r.P}`;
const preset = id => registry.presets.find(p => p.id === id);
const NOVAK_IDS = ['2019_05_LA_SEA', '2021_08_DAL_MIN', '2022_02_MIN_PHI', '2022_14_MIA_LAC', '2024_14_CIN_DAL', '2025_09_BAL_MIA'];

test('golden: Scott Novak, kickoff 19:00 ET or later, total 49+, since 2014-12-07 is 6 games, Under 5-1-0', () => {
  const novak = { market: 'total', atoms: ['ref:Scott Novak', 'g:g_prime', 'g:g_t_49p'], side: 'B' };
  const r = T.evaluatePreset(novak, ctx);
  assert.deepEqual(r.units.map(u => u.g.id), NOVAK_IDS);
  assert.ok(r.units.every(u => u.g.date >= '2014-12-07'), 'the date cut removes nothing: Novak first refereed in 2019');
  assert.equal(rec(r.reg), '5-1-0');
  assert.equal(r.reg.units110, 3.5455);
  assert.equal(r.reg.roi110, 0.5909);
  assert.deepEqual(r.reg.fileOdds, { priced: 6, units: 3.5611, roi: 0.5935 }, 'file odds, rounded per pick (3.5610 unrounded)');
  assert.deepEqual(r.reg.streak, { result: 'W', length: 5 });
  assert.deepEqual(r.reg.last10, { W: 5, L: 1, P: 0 });
  assert.deepEqual([...new Set(r.units.map(u => u.g.season))], [2019, 2021, 2022, 2024, 2025]);
  const first = real.fg.filter(g => g.referee === 'Scott Novak').map(g => g.date).sort()[0];
  assert.equal(first, '2019-09-08');
  assert.equal(r.units[0].res, 1, '2019_05_LA_SEA went Over (59 against 49)');
});

test('golden: the Novak slice from the raw fixture rows matches the engine', () => {
  const { rows } = T.parseCsvRows(read('tests/fixtures/trends/novak.csv'));
  const raw = rows.filter(r => r.referee === 'Scott Novak' && r.gametime >= '19:00' && Number(r.total_line) >= 49 && r.gameday >= '2014-12-07');
  assert.deepEqual(raw.map(r => r.game_id), NOVAK_IDS);
  const under = raw.filter(r => Number(r.home_score) + Number(r.away_score) < Number(r.total_line)).length;
  assert.equal(under, 5);
  const g = T.normalizeRows(rows, { corrections, venues }).filter(x => x.referee === 'Scott Novak' && x.kick >= 19 && x.total >= 49);
  assert.deepEqual(g.map(x => x.id), NOVAK_IDS);
});

test('golden: wind 10+ Under, 2002-2025 (the study record differs by one wrongly labelled London game)', () => {
  const r = T.evaluatePreset(preset('total|g:g_wind10'), ctx);
  const through = r.units.filter(u => u.g.season <= 2025);
  const count = s => through.filter(u => Math.sign(-u.res) === s).length;
  assert.deepEqual([count(1), count(-1), count(0)], [892, 724, 22]);
  assert.equal(rec(r.oos), '282-196-5');
  const s = T.evaluatePreset(preset('total|g:g_wind10'), studyCtx);
  assert.deepEqual([s.split.B, s.split.A, s.split.P], [892, 725, 22]);
  assert.equal(rec(s.oos), '282-197-5');
});

test('golden: out-of-sample (2018-2025, walk-forward) records of the tiered and watch-list presets', () => {
  const expect = {
    'team_ats|t:t_ats_margin_cold': '113-90-8', 'team_ats|t:t_ats_season_cold': '135-110-7', 'team_ats|t:t_ats_season_hot': '144-120-5',
    'team_ats|t:t_off_big_upset_loss': '64-48-1', 'total|any:t_good_def+g:g_indoor': '87-57-1', 'fav_ats|g:g_fav_tt_ge28+g:g_indoor': '87-60-2',
    'fav_ats|g:g_w1_4': '271-227-11', 'total|g:g_wind15': '91-68-2',
  };
  for (const [id, want] of Object.entries(expect)) assert.equal(rec(T.evaluatePreset(preset(id), ctx).oos), want, id);
});

test('parity: every registry preset reproduces its frozen fixture through 2025', () => {
  const fixtureCtx = { ...ctx, currentSeason: 2025, pop: real.pop.filter(g => g.season <= 2025) };
  for (const p of registry.presets) {
    const r = T.evaluatePreset(p, fixtureCtx);
    assert.deepEqual({ split: `${r.split.A}-${r.split.B}-${r.split.P}`, disc: rec(r.disc), discSide: r.disc.side, conf: rec(r.oos) },
      { split: p.fixture.split, disc: p.fixture.disc, discSide: p.fixture.discSide, conf: p.fixture.conf }, p.id);
  }
});

test('parity: with the new rules off, the engine reproduces the 2026-10-12 study for every registry preset it covers', () => {
  let compared = 0;
  for (const p of registry.presets) {
    if (!p.study) continue;
    const r = T.evaluatePreset(p, studyCtx);
    assert.equal(rec(r.disc), p.study.disc, `${p.id} discovery`);
    assert.equal(rec(r.oos), p.study.conf, `${p.id} confirmation`);
    compared++;
  }
  assert.ok(compared > 300, `${compared} presets compared`);
});

test('worked quality-score checks: wind 97.6 and ATS margin 63.8 on the study data, Novak 0.0; wind 98.2 after the corrections', () => {
  const score = (p, c, q = p.q, eligible = true) => T.qualityScore(T.evaluatePreset(p, c), p, { q, throughSeason: 2025, eligible }).score;
  assert.equal(score(preset('total|g:g_wind10'), studyCtx), 97.6);
  assert.equal(score(preset('team_ats|t:t_ats_margin_cold'), studyCtx), 63.8);
  const novak = { market: 'total', atoms: ['ref:Scott Novak'], K: 0 };
  assert.equal(score(novak, studyCtx, registry.entityQ['total|ref:Scott Novak'], false), 0);
  assert.equal(score(preset('total|g:g_wind10'), ctx), 98.2);
});

test('the frozen registry: tiers, sides, the stored permutation statistic and the frozen multiplicity family', () => {
  const tiered = registry.presets.filter(p => p.tierCeiling < 3).map(p => p.id);
  assert.deepEqual(tiered, ['total|g:g_wind10', 'total|g:g_wind15', 'team_ats|t:t_ats_margin_cold', 'team_ats|t:t_ats_season_cold', 'team_ats|t:t_ats_season_hot',
    'team_ats|t:t_off_big_upset_loss', 'total|any:t_good_def+g:g_indoor', 'fav_ats|g:g_fav_tt_ge28+g:g_indoor']);
  const wind = preset('total|g:g_wind10');
  assert.equal(wind.permMaxP, 0.0099);
  assert.ok(wind.q > 0.1, 'q alone fails the Tier 1 bar');
  assert.ok(registry.presets.every(p => p.atoms.length <= 2), 'presets have at most 2 filters');
  assert.equal(new Set(registry.presets.map(p => p.id)).size, registry.presets.length);
  const frozen = JSON.parse(read('model/trends/registry-frozen-2026-10-12.json'));
  assert.equal(frozen.count, 1722);
  assert.equal(frozen.hypotheses.length, 1722);
  const q = T.bh(frozen.hypotheses.map(h => h[1]));
  const at = frozen.hypotheses.findIndex(h => h[0] === 'total|g:g_wind10');
  assert.ok(Math.abs(q[at] - wind.q) < 1e-12, 'q recomputes from the frozen p-values');
});

test('leakage: scrambling every score from a cutoff on leaves every earlier feature unchanged', () => {
  const rows = T.parseCsvRows(historyCsv).rows;
  const base = new Map(T.buildFeatures(T.normalizeRows(rows, { corrections, venues }), { venues, corrections }).map(g => [g.id, g]));
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (const cut of ['2006-10-15', '2013-12-01', '2019-11-03', '2024-09-15']) {
    const scrambled = rows.map(r => (r.gameday >= cut ? { ...r, home_score: String(Math.floor(rand() * 46)), away_score: String(Math.floor(rand() * 46)) } : r));
    const games = T.buildFeatures(T.normalizeRows(scrambled, { corrections, venues }), { venues, corrections });
    let checked = 0, changedAfter = 0;
    for (const g of games) {
      const b = base.get(g.id);
      if (g.date <= cut) {
        assert.deepEqual(g.gf, b.gf, `${cut} ${g.id} game features`);
        assert.deepEqual(g.tf, b.tf, `${cut} ${g.id} team features`);
        checked++;
      } else if (JSON.stringify([g.gf, g.tf]) !== JSON.stringify([b.gf, b.tf])) changedAfter++;
    }
    assert.ok(checked > 1000 && changedAfter > 0, `${cut}: ${checked} checked, ${changedAfter} later games changed`);
  }
});
