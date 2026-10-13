// Freeze shared/trends-registry.json and model/trends/registry-frozen-2026-10-12.json.
// Usage: node scripts/trends-registry.mjs --study .local/trends-study/results_all.json [--check]
// q-values come from the 2026-10-12 study (R1 results_all.json: BH over the 1,722 hypotheses with an
// out-of-sample decision). Fixtures are computed by the engine on the frozen history with the
// corrections applied. Study outputs stay in .local/ and are never committed. Run only at season end
// (promotions) or when a hypothesis is added; the weekly script never rewrites the registry.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import * as T from '../shared/trends.mjs';

const { values } = parseArgs({ options: { study: { type: 'string' }, check: { type: 'boolean', default: false } } });
if (!values.study) throw new Error('Pass --study with the study results_all.json.');
const venues = JSON.parse(readFileSync('shared/nfl-venues.json', 'utf8'));
const corr = JSON.parse(readFileSync('shared/trends-corrections.json', 'utf8'));
const study = JSON.parse(readFileSync(values.study, 'utf8'));
const byId = Object.fromEntries(study.map(h => [h.id, h]));
const hist = readFileSync('shared/trends/history-1999-2025.csv', 'utf8');
const games = T.parseGamesCsv(hist, { corrections: corr, venues });
const fg = T.buildFeatures(games, { venues, corrections: corr });
const pop = T.evaluationGames(fg);

const SEAN_OF_ATOM = name => {
  const a = T.ATOMS[name];
  if (['g_div', 'g_nondiv', 'g_conf_nondiv'].includes(name)) return 'divisional';
  if (name.startsWith('g_interconf')) return 'afc_nfc';
  if (['t_off_bye', 'g_both_off_bye'].includes(name)) return 'bye';
  if (['t_short_week', 't_thu_after_sun', 'g_both_short'].includes(name)) return 'short_week';
  return {
    fav_venue: 'home_away', total_band: 'totals', total_key: 'totals', kickoff: 'primetime', site: 'travel', travel: 'travel',
    rest: 'rest', previous_game: 'previous_game', road_streak: 'road_streak', season_timing: 'season_timing', venue: 'venue',
    spread_band: 'lines', spread_key: 'lines', total_vs_scoring: 'lines', coach: 'coach', quarterback: 'quarterback',
    head_to_head: 'head_to_head', weather_observed: 'weather', form: 'form', strength: 'strength', market: 'market',
  }[a.family];
};
const FAMILIES = [
  ['referee', 'Referee'], ['home_away', 'Home vs road and favorites by venue'], ['divisional', 'Divisional games'],
  ['totals', 'Totals'], ['primetime', 'Kickoff window and night games'], ['afc_nfc', 'AFC vs NFC'],
  ['travel', 'Travel and site'], ['bye', 'Off a bye'], ['short_week', 'Short week'], ['rest', 'Other rest'],
  ['previous_game', 'Previous game'], ['road_streak', 'Road and home streaks'], ['season_timing', 'Season timing'],
  ['venue', 'Roof and surface'], ['lines', 'Spread bands and key numbers'], ['coach', 'Head coach'],
  ['quarterback', 'Starting quarterback'], ['head_to_head', 'Head to head'], ['weather', 'Observed weather (played games only)'],
  ['teams', 'Teams, coaches and quarterbacks'],
];
const MARKET_TITLE = { home_ats: 'home vs road ATS', fav_ats: 'favorite vs underdog ATS', total: 'over/under', team_ats: 'ATS', total_rev: 'over/under' };
const ROLE_TEXT = { home: 'Team is at home', away: 'Team is on the road', fav: 'Team is the favorite', dog: 'Team is the underdog' };
const BASE_FILTER = 'Regular season and playoffs since 2002';
const lcFirst = s => s[0].toLowerCase() + s.slice(1);
const atomText = a => {
  const kind = a.slice(0, a.indexOf(':')), val = a.slice(a.indexOf(':') + 1);
  if (kind === 'g') return T.ATOMS[val].desc;
  if (kind === 't') return `Team: ${lcFirst(T.ATOMS[val].desc)}`;
  if (kind === 'any') return `Either team: ${lcFirst(T.ATOMS[val].desc)}`;
  if (kind === 'role') return ROLE_TEXT[val];
  throw new Error(a);
};
const needsOf = atoms => {
  const n = new Set();
  for (const a of atoms) {
    const kind = a.slice(0, a.indexOf(':')), val = a.slice(a.indexOf(':') + 1);
    if (kind === 'role' && ['fav', 'dog'].includes(val)) n.add('spread');
    if (['g', 't', 'any'].includes(kind) && T.ATOMS[val].needs) n.add(T.ATOMS[val].needs);
  }
  return n;
};
const gateOf = needs => {
  const s = needs.has('spread') || needs.has('both'), t = needs.has('total') || needs.has('both');
  return s && t ? 'both' : s ? 'spread' : t ? 'total' : 'none';
};
const titleOf = (market, atoms) => {
  const parts = atoms.map(a => {
    const kind = a.slice(0, a.indexOf(':')), val = a.slice(a.indexOf(':') + 1);
    if (kind === 'role') return ROLE_TEXT[val].replace('Team is ', '');
    const d = T.ATOMS[val].desc;
    return kind === 'any' ? `either team: ${lcFirst(d)}` : d;
  });
  return `${parts.join(' + ')}: ${MARKET_TITLE[market]}`;
};
const presets = [];
const add = (p) => {
  const id = `${p.market}|${p.atoms.join('+')}`;
  if (presets.some(x => x.id === id)) throw new Error(`duplicate ${id}`);
  const needs = needsOf(p.atoms);
  const r1 = byId[id];
  const entry = {
    id, market: p.market, atoms: p.atoms, title: p.title ?? titleOf(p.market, p.atoms), family: p.family,
    seanFamily: p.seanFamily, tierCeiling: p.tierCeiling ?? 3, watch: Boolean(p.watch), side: p.side ?? null,
    sideLabel: p.side ? (p.sideLabel ?? T.MARKETS[p.market].sides[p.side === 'A' ? 0 : 1]) : null,
    K: T.kPrior(p.atoms), q: r1?.q ?? null, timing: needs.has('weather') ? 'played_only' : 'pregame', gate: gateOf(needs),
    roofDependent: needs.has('roof'), filters: [BASE_FILTER, ...p.atoms.map(atomText)],
  };
  if (p.permMaxP !== undefined) { entry.permMaxP = p.permMaxP; entry.nNull = 100; }
  if (p.robustness) entry.robustness = p.robustness;
  if (p.dedupGroup) entry.dedupGroup = p.dedupGroup;
  if (p.splits) entry.splits = p.splits;
  if (p.note) entry.note = p.note;
  if (p.variant) entry.variant = true;
  if (r1) entry.study = { disc: `${r1.is_.W}-${r1.is_.L}-${r1.is_.P}`, conf: `${r1.oos.W}-${r1.oos.L}-${r1.oos.P}`, full: `${r1.full.W}-${r1.full.L}-${r1.full.P}`, fullSide: r1.full.side };
  presets.push(entry);
};

// --- Tier 1 / Tier 2 (frozen 2026-10-12; ceilings, sides and robustness checks registered) ---
add({ market: 'total', atoms: ['g:g_wind10'], title: 'Strong wind', family: 'weather_observed', seanFamily: 'weather', tierCeiling: 1, side: 'B',
  permMaxP: 0.0099, robustness: [['g:g_wind5']], dedupGroup: 'wind',
  note: 'Observed kickoff wind; there is no approved forecast source, so it never applies to an upcoming game.' });
add({ market: 'total', atoms: ['g:g_wind15'], title: 'Very strong wind', family: 'weather_observed', seanFamily: 'weather', tierCeiling: 2, side: 'B',
  robustness: [['g:g_wind10']], dedupGroup: 'wind' });
add({ market: 'team_ats', atoms: ['t:t_ats_margin_cold'], title: 'Missing the spread badly this season', family: 'form', seanFamily: 'form', tierCeiling: 2, side: 'A',
  robustness: [['t:t_ats_margin_cold5']], dedupGroup: 'A-cold', splits: ['team_ats|t:t_ats_margin_cold+role:dog', 'team_ats|t:t_ats_margin_cold+role:away'] });
add({ market: 'team_ats', atoms: ['t:t_ats_season_cold'], title: 'Rarely covering this season', family: 'form', seanFamily: 'form', tierCeiling: 2, side: 'A',
  robustness: [['t:t_ats_season_cold35']], dedupGroup: 'A-cold', splits: ['team_ats|t:t_ats_season_cold+role:dog'] });
add({ market: 'team_ats', atoms: ['t:t_ats_season_hot'], title: 'Covering almost every week this season', family: 'form', seanFamily: 'form', tierCeiling: 2, side: 'B',
  robustness: [['t:t_ats_season_hot65']], dedupGroup: 'A-hot' });
add({ market: 'team_ats', atoms: ['t:t_off_big_upset_loss'], title: 'Bounce after a big upset loss', family: 'previous_game', seanFamily: 'form', tierCeiling: 2, side: 'A',
  robustness: [['t:t_off_upset_loss']], dedupGroup: 'B' });
add({ market: 'total', atoms: ['any:t_good_def', 'g:g_indoor'], title: 'Indoor game with a strong defense', family: 'strength', seanFamily: 'form', tierCeiling: 2, side: 'A',
  robustness: [['any:t_good_def'], ['g:g_indoor']], dedupGroup: 'C1' });
add({ market: 'fav_ats', atoms: ['g:g_fav_tt_ge28', 'g:g_indoor'], title: 'Indoor game with a big favorite team total', family: 'total_vs_scoring', seanFamily: 'form', tierCeiling: 2, side: 'B',
  robustness: [['g:g_fav_tt_ge28'], ['g:g_indoor'], ['g:g_fav_tt_ge27', 'g:g_indoor']], dedupGroup: 'C2' });
// Splits shown inside card A (Tier 3 rows; registered side)
add({ market: 'team_ats', atoms: ['t:t_ats_margin_cold', 'role:dog'], family: 'form', seanFamily: 'form', side: 'A' });
add({ market: 'team_ats', atoms: ['t:t_ats_margin_cold', 'role:away'], family: 'form', seanFamily: 'form', side: 'A' });
add({ market: 'team_ats', atoms: ['t:t_ats_season_cold', 'role:dog'], family: 'form', seanFamily: 'form', side: 'A' });
// --- Watch list (Tier 3; re-tested every season) ---
add({ market: 'fav_ats', atoms: ['g:g_w1_4'], title: 'Early-season underdogs', family: 'season_timing', seanFamily: 'season_timing', watch: true, side: 'B' });
add({ market: 'home_ats', atoms: ['g:g_div', 'g:g_w9_12'], title: 'Divisional road teams at midseason', family: 'division', seanFamily: 'divisional', watch: true, side: 'B' });
add({ market: 'total_rev', atoms: ['g:g_totrev'], title: 'Totals reversion', family: 'form', seanFamily: 'totals', watch: true, side: 'A',
  sideLabel: 'Under after high-scoring starts, Over after low-scoring starts' });
add({ market: 'team_ats', atoms: ['t:t_after_ot', 'role:home'], title: 'Home team after an overtime game', family: 'rest', seanFamily: 'rest', watch: true, side: 'B' });
add({ market: 'fav_ats', atoms: ['g:g_altitude'], title: 'Underdogs at altitude', family: 'site', seanFamily: 'travel', watch: true, side: 'B' });
add({ market: 'home_ats', atoms: ['g:g_home_fav', 'g:g_s_3'], title: 'Home favorite by exactly 3', family: 'fav_venue', seanFamily: 'home_away', watch: true, side: 'B' });
add({ market: 'team_ats', atoms: ['t:t_mkt_down3', 'role:dog'], title: 'Underdog the market re-rated down', family: 'market', seanFamily: 'form', watch: true, side: 'A' });
// --- Robustness variants (evaluated, never displayed) ---
for (const atoms of [['g:g_wind5'], ['t:t_ats_margin_cold5'], ['t:t_ats_season_cold35'], ['t:t_ats_season_hot65'], ['t:t_off_upset_loss'],
  ['any:t_good_def'], ['g:g_indoor'], ['g:g_fav_tt_ge28'], ['g:g_fav_tt_ge27', 'g:g_indoor']]) {
  const market = atoms[0].startsWith('g:g_wind') ? 'total' : atoms[0].startsWith('t:') ? 'team_ats' : atoms.includes('g:g_fav_tt_ge28') || atoms.includes('g:g_fav_tt_ge27') ? 'fav_ats' : null;
  if (market) add({ market, atoms, family: 'variant', seanFamily: 'variant', variant: true });
}
// --- Sean's baselines: every single-atom preset in its registered markets ---
const SKIP = new Set(['form', 'strength', 'market']);
for (const name of Object.keys(T.ATOMS)) {
  const a = T.ATOMS[name];
  if (a.variant || SKIP.has(a.family)) continue;
  const sean = name === 'g_all' ? null : SEAN_OF_ATOM(name);
  const markets = a.kind === 'game' ? a.markets : ['team_ats', 'total'];
  for (const market of markets) {
    const atoms = [a.kind === 'game' ? `g:${name}` : market === 'total' ? `any:${name}` : `t:${name}`];
    const id = `${market}|${atoms[0]}`;
    if (presets.some(p => p.id === id)) continue;
    const seanFamily = sean ?? (market === 'total' ? 'totals' : 'home_away');
    add({ market, atoms, family: a.family, seanFamily, title: name === 'g_all' ? `All games: ${MARKET_TITLE[market]}` : undefined });
  }
}

// Fixtures: engine records through 2025 on the frozen history (corrections applied).
const ctx = { pop, rules: corr.rules, throughSeason: 2025, currentSeason: 2025, lastFinalDate: '2099-01-01' };
const fmt = r => `${r.W}-${r.L}-${r.P}`;
for (const p of presets) {
  const r = T.evaluatePreset(p, ctx);
  p.fixture = { through: 2025, split: `${r.split.A}-${r.split.B}-${r.split.P}`, disc: fmt(r.disc), discSide: r.disc.side, conf: fmt(r.oos) };
}
const registry = {
  version: '2026-10-12',
  registeredAt: '2026-10-12',
  lastFinalDate: '2026-10-11',
  pendingAtRegistration: ['2026_05_BUF_LA'],
  throughSeason: 2025,
  about: 'Frozen situational-trend presets. A preset has at most 2 filters, a registered market and (for tiered and watch-list presets) a registered side. Tiers come from the quality score and gates over completed seasons; the displayed tier never exceeds tierCeiling. Promotions happen only at season end after a full new season.',
  provenance: {
    study: '2026-10-12 trend impact study (R1: 1,819 hypotheses, 1,722 with out-of-sample decisions; S1: quality score with a 100-permutation null). q is the Benjamini-Hochberg q-value over those 1,722 one-sided out-of-sample p-values, frozen here; model/trends/registry-frozen-2026-10-12.json keeps every id and p-value so q can be recomputed when hypotheses are added. Presets new since the study (totals reversion, second straight game abroad) have q = null and earn no multiplicity points.',
    fixtures: 'fixture = this engine on shared/trends/history-1999-2025.csv with shared/trends-corrections.json, through 2025. study = the original study values on the raw schedule file before the corrections (international roofs and weather, neutral sites, rest from the schedule, daylight-time zones).',
  },
  calibration: {
    nNull: 100,
    scoreMax: { real: 97.6, nullMean: 68.9, nullP95: 79.7, permMaxP: 0.0099, statistic: 'best score in each shuffled run (thresholds.max.emp_p)' },
    score80: { real: 1, nullMean: 0.06, permP: 0.0594, statistic: 'rows scoring 80+ (fails 0.05 on its own)' },
    tier2Gate: { real: 12, nullMean: 13.34, nullP95: 26, empP: 0.574, note: 'The Tier 2 gate passes about as many rows on shuffled outcomes as on real ones; Tier 2 as a group is not distinguishable from chance.' },
    bestOosRoi: { real: 0.276, nullMean: 0.286, note: 'Never rank by ROI: the best out-of-sample ROI on shuffled outcomes is as high as on real data.' },
  },
  families: FAMILIES.map(([id, title]) => ({ id, title })),
  entityQ: Object.fromEntries(study.filter(h => /^(total|home_ats)\|ref:[^+]+$/.test(h.id) && h.q !== null).map(h => [h.id, h.q]).sort((a, b) => (a[0] < b[0] ? -1 : 1))),
  presets,
};
const head = { ...registry };
delete head.presets;
const headText = JSON.stringify(head, null, 1);
const registryText = headText.slice(0, -2) + ',\n "presets": [\n' + presets.map(p => '  ' + JSON.stringify(p)).join(',\n') + '\n ]\n}\n';
JSON.parse(registryText);
const tested = study.filter(h => h.oos.W + h.oos.L > 0).map(h => [h.id, h.oos.p1, h.q]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
const frozenText = '{\n "about": "Frozen multiplicity family of the 2026-10-12 trend study: every hypothesis with an out-of-sample decision as [id, one-sided p versus 50%, BH q]. Recompute q over this list plus any new hypotheses before adding presets.",\n "count": ' + tested.length + ',\n "hypotheses": [\n' + tested.map(x => '  ' + JSON.stringify(x)).join(',\n') + '\n ]\n}\n';
const outputs = [['shared/trends-registry.json', registryText], ['model/trends/registry-frozen-2026-10-12.json', frozenText]];
if (values.check) {
  const stale = outputs.filter(([f, t]) => !existsSync(f) || readFileSync(f, 'utf8') !== t).map(([f]) => f);
  if (stale.length) { console.error(`Out of date: ${stale.join(', ')}`); process.exit(1); }
  console.log('registry is current');
} else {
  mkdirSync('model/trends', { recursive: true });
  for (const [f, t] of outputs) writeFileSync(f, t);
}
console.log('presets', presets.length, 'tiered', presets.filter(p => p.tierCeiling < 3).length, 'watch', presets.filter(p => p.watch).length, 'tested', tested.length);
