import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as V from '../shared/trends-view.mjs';
import { T, build } from './trends-fixture.mjs';

const week = JSON.parse(fs.readFileSync(new URL('../shared/trends/2026-week-06.json', import.meta.url), 'utf8'));
const game = id => week.games.find(g => g.id === id);
const DAY = 86_400_000;

test('the browser helpers carry the engine’s source credit, license and line-source strings', () => {
  assert.equal(V.TRENDS_CREDIT, T.TRENDS_SOURCE.credit);
  assert.equal(V.TRENDS_LICENSE_URL, T.TRENDS_SOURCE.licenseUrl);
  assert.equal(V.TRENDS_SOURCE_URL, T.TRENDS_SOURCE.url);
  assert.equal(V.TRENDS_LINE_SOURCE, T.LINE_SOURCE);
  assert.equal(`Line source: ${V.TRENDS_LINE_SOURCE}`, week.copy.lineSource);
  assert.equal(V.weekKey(2026, 6), '2026-06');
});

test('band rules match the engine’s features on every played game since 2002, including the last-meeting rule', () => {
  const { fg } = build();
  let checked = 0;
  for (const g of fg) {
    if (!g.played || g.season < 2002 || g.spread === null || g.total === null) continue;
    // The week file's last meetings, built exactly as generateWeek builds them.
    const h2h = g.meta.lastMeetings.filter(m => (Date.parse(g.date) - Date.parse(m.date)) / DAY <= 1461)
      .map(m => ({ date: m.date, score: `${m.awayApp} ${m.awayScore}, ${m.homeApp} ${m.homeScore}` })).reverse();
    const atoms = V.lineAtoms({ spread: g.spread, total: g.total }, { date: g.date, entities: { h2h } });
    for (const name of V.LINE_ATOMS) {
      assert.ok(atoms.has(name), name);
      assert.equal(atoms.get(name), g.gf[name] === true, `${g.id} ${name}`);
    }
    checked++;
  }
  assert.ok(checked > 6500, `${checked} games checked`);
  assert.equal(V.lineAtoms({ spread: null, total: 44 }).has('g_s_3'), false, 'an unknown line computes nothing');
});

test('app spreads convert to the nflverse sign; a pick’em stays zero', () => {
  assert.equal(V.appSpreadToNflverse(-3.5), 3.5);
  assert.equal(V.appSpreadToNflverse(7), -7);
  assert.ok(Object.is(V.appSpreadToNflverse(0), 0));
  assert.equal(V.appSpreadToNflverse(null), null);
  assert.equal(V.appSpreadToNflverse(Number.NaN), null);
  assert.deepEqual(V.savedLines({ spread: -3, total: 47.5 }), { spread: 3, total: 47.5 });
  assert.equal(V.referenceValue({ status: 'available', value: -2.5 }), -2.5);
  assert.equal(V.referenceValue({ status: 'stale', value: -2.5 }), null);
  assert.equal(V.referenceValue(null), null);
});

test('reveal gating: each market unlocks only with its own ballot, sit-out or deadline; both needs both', () => {
  const ca = V.communityAccess;
  assert.deepEqual(ca({ ballots: {} }), { spread: false, total: false });
  assert.deepEqual(ca({ ballots: { guess_spread: { submittedAt: 'x' } } }), { spread: true, total: false });
  assert.deepEqual(ca({ ballots: { guess_total: { submittedAt: 'x' } } }), { spread: false, total: true }, 'a Total submission never unlocks spread-gated trends');
  assert.deepEqual(ca({ ballots: { guess_spread: { picks: { 'SEA-DEN': -3 } } } }), { spread: false, total: false }, 'a draft is not a submission');
  assert.deepEqual(ca({ ballots: {}, optOuts: ['guess_total'] }), { spread: false, total: true });
  assert.deepEqual(ca({ ballots: {}, closed: true }), { spread: true, total: true });
  const ga = V.groupAccess;
  assert.deepEqual(ga({ mode: 'guess_spread', revealed: true, marketAccess: { spread: true, total: false } }), { spread: true, total: false });
  assert.deepEqual(ga({ mode: 'guess_total', revealed: false, marketAccess: { spread: false, total: false } }), { spread: false, total: false });
  assert.deepEqual(ga({ mode: 'guess_total', revealed: true }), { spread: false, total: true });
  assert.deepEqual(ga({ mode: 'betting_challenge', marketAccess: { spread: false, total: true } }), { spread: false, total: true });
  assert.deepEqual(ga({ statuses: { guess_spread: { satOut: true }, guess_total: { lockReason: 'deadline' } } }), { spread: true, total: true });
  for (const [access, gate, open] of [[{ spread: true }, 'spread', true], [{ spread: true }, 'total', false], [{ spread: true }, 'both', false], [{ spread: true, total: true }, 'both', true], [{}, 'spread', false]]) {
    assert.equal(V.gateOpen(access, gate), open, `${JSON.stringify(access)} ${gate}`);
  }
});

test('line-dependent items: favorite and underdog roles, unknown facts and roofs', () => {
  const g = game('SEA-DEN'); // DEN home
  const at = lines => V.lineAtoms(lines, g);
  const fav = { spread: 3 }; // nflverse +3: DEN favored
  assert.equal(V.itemApplies('team_ats|team:DEN+role:fav', 'DEN', g, at(fav), fav), true);
  assert.equal(V.itemApplies('team_ats|team:DEN+role:dog', 'DEN', g, at(fav), fav), false);
  assert.equal(V.itemApplies('team_ats|team:SEA+role:dog', 'SEA', g, at(fav), fav), true);
  const pick = { spread: 0 };
  assert.equal(V.itemApplies('team_ats|team:DEN+role:fav', 'DEN', g, at(pick), pick), false);
  assert.equal(V.itemApplies('team_ats|team:DEN+role:dog', 'DEN', g, at(pick), pick), false);
  assert.equal(V.itemApplies('team_ats|team:DEN+role:fav', 'DEN', g, at({}), {}), null, 'no saved line: unknown');
  assert.equal(V.itemApplies('team_ats|t:t_mkt_down3+role:dog', 'SEA', g, at(fav), fav), null, 'the market re-rating needs earlier lines this screen does not hold');
  assert.equal(V.itemApplies('home_ats|g:g_s_3', null, g, at(fav), fav), true);
  assert.equal(V.itemApplies('home_ats|g:g_s_35_65', null, g, at(fav), fav), false);
  assert.equal(V.itemApplies('home_ats|g:g_all', null, g, at(fav), fav), null, 'a row with no line condition is never marked');
  const both = { spread: 7, total: 50 }; // favorite implied total (50 + 7) / 2 = 28.5
  assert.equal(V.itemApplies('fav_ats|g:g_fav_tt_ge28+g:g_indoor', null, g, at(both), both), false, 'outdoors');
  assert.equal(V.itemApplies('fav_ats|g:g_fav_tt_ge28+g:g_indoor', null, game('BUF-LV'), V.lineAtoms(both, game('BUF-LV')), both), true, 'dome');
  assert.equal(V.itemApplies('fav_ats|g:g_fav_tt_ge28+g:g_indoor', null, game('CHI-ATL'), V.lineAtoms(both, game('CHI-ATL')), both), null, 'retractable roof unknown until game day');
});

test('referees: the commissioner’s hosted assignment wins (even cleared), then the week file, then not assigned', () => {
  const file = { ...week, assignedReferees: { ...week.assignedReferees, 'SEA-DEN': 'Shawn Hochuli' } };
  assert.deepEqual(V.refereeFor(week, 'SEA-DEN', null), { name: null, source: null, setAt: null });
  assert.deepEqual(V.refereeFor(file, 'SEA-DEN', null), { name: 'Shawn Hochuli', source: 'file', setAt: null });
  assert.deepEqual(V.refereeFor(file, 'SEA-DEN', { assignments: { 'SEA-DEN': { referee: 'Scott Novak', setAt: 't' } } }), { name: 'Scott Novak', source: 'commissioner', setAt: 't' });
  assert.deepEqual(V.refereeFor(file, 'SEA-DEN', { assignments: { 'SEA-DEN': { referee: null, setAt: 't' } } }), { name: null, source: null, setAt: 't' });
  assert.deepEqual(V.refereeFor(file, 'SEA-DEN', { assignments: { 'HOU-JAX': { referee: 'Scott Novak' } } }).source, 'file');
  // Thursday night, not divisional: career plus primetime; the band row only with a saved total.
  const rows = V.refereeRows(week, 'Scott Novak', game('SEA-DEN'));
  assert.deepEqual(rows.map(r => r.id), ['total|ref:Scott Novak', 'home_ats|ref:Scott Novak', 'total|ref:Scott Novak+g:g_prime', 'home_ats|ref:Scott Novak+g:g_prime']);
  const banded = V.refereeRows(week, 'Scott Novak', game('HOU-JAX'), { total: 49.5 });
  assert.deepEqual(banded.map(r => r.id), ['total|ref:Scott Novak', 'home_ats|ref:Scott Novak', 'total|ref:Scott Novak+g:g_div', 'home_ats|ref:Scott Novak+g:g_div', 'total|ref:Scott Novak+g:g_t_47_505']);
  assert.deepEqual(V.refereeRows(week, 'Jerome Boger', game('SEA-DEN')), []);
  assert.deepEqual(V.refereeRows(week, null, game('SEA-DEN')), []);
  assert.equal(V.refereeTitle('total|ref:Scott Novak+g:g_t_47_505'), 'Referee Scott Novak, total 47 to 50.5: over/under');
  assert.equal(V.refereeTitle('home_ats|ref:Scott Novak'), 'Referee Scott Novak, career: home vs road ATS');
});

test('every item the week file references resolves to a titled card or row, so the panel never shows a raw id', () => {
  const ids = new Set();
  const add = item => ids.add(V.parseItem(item).id);
  for (const g of week.games) {
    for (const c of g.context) { if (c.lead) [c.lead.ats, c.lead.ou].filter(Boolean).forEach(add); (c.more || []).forEach(add); }
    for (const gate of ['spread', 'total', 'both']) { g.gated[gate].forEach(add); g.gatedCards[gate].forEach(r => add(r.card)); }
    for (const list of [g.tier2, g.watch, g.conditional, g.pendingCards]) list.forEach(r => add(r.card));
    for (const e of [...Object.values(g.entities.teams), ...Object.values(g.entities.coaches), ...Object.values(g.entities.qbs)]) [e.ats, e.ou, e.su].filter(Boolean).forEach(add);
  }
  for (const list of Object.values(week.bandTables)) for (const family of Object.values(list)) family.forEach(add);
  for (const r of Object.values(week.referees)) [r.total, r.homeAts, r.primetime.total, r.primetime.homeAts, r.divisional.total, r.divisional.homeAts, ...Object.values(r.totalBands)].forEach(add);
  assert.ok(ids.size > 700);
  for (const id of ids) {
    assert.ok(V.lookup(week, id), `unresolved ${id}`);
    assert.notEqual(V.itemTitle(week, id), id, `untitled ${id}`);
  }
  assert.deepEqual(V.parseItem('team_ats|t:t_off_win@DEN'), { id: 'team_ats|t:t_off_win', team: 'DEN' });
  assert.deepEqual(V.parseItem('total|any:t_off_win'), { id: 'total|any:t_off_win', team: null });
  assert.equal(V.itemTitle(week, 'team_ats|t:t_off_win', 'DEN'), 'Team won its last game: ATS · DEN');
});

test('records and formatting: units at −110, ROI with pushes, signed values and the units line', () => {
  // The Novak golden slice: 5-1-0 at −110 is +3.5455 units, ROI 59.09%.
  assert.equal(V.units110([5, 1, 0]), 3.5455);
  assert.equal(V.fmtSignedPct(V.roi110([5, 1, 0])), '+59.1%');
  assert.equal(V.fmtUnits(3.5455), '+3.55');
  assert.equal(V.fmtUnits(-1), '−1.00');
  assert.equal(V.fmtUnits(0.001), '0.00');
  assert.equal(V.roi110([0, 0, 0]), null);
  assert.equal(V.winRate({ W: 3, L: 1, P: 4 }), 0.75);
  assert.equal(V.fmtRecord({ W: 3, L: 1, P: 4 }), '3-1-4');
  assert.equal(V.fmtStreak({ result: 'W', length: 5 }), 'W5');
  assert.equal(V.fmtYears([2019, 2026]), '2019–2026');
  // Split labels name whose record a row counts, from the row id: only team:X rows are that team's own record.
  assert.deepEqual(V.splitLabels('team_ats', 'team_ats|team:HOU+venue:neutral'), ['HOU covered', 'Opponent covered', 'Pushes']);
  assert.deepEqual(V.splitLabels('team_ats', 'team_ats|team:DEN+role:fav'), ['DEN covered', 'Opponent covered', 'Pushes']);
  assert.deepEqual(V.splitLabels('su', 'su|team:SEA+venue:road'), ['SEA won', 'SEA lost', 'Ties']);
  assert.deepEqual(V.splitLabels('team_ats', 'team_ats|t:t_off_win'), ['Team with the trait covered', 'Opponent covered', 'Pushes']);
  assert.deepEqual(V.splitLabels('team_ats', 'team_ats|t:t_ats_margin_cold+role:dog'), ['Team with the trait covered', 'Opponent covered', 'Pushes']);
  assert.deepEqual(V.splitLabels('team_ats', 'team_ats|coach:Sean Payton'), ['Coach’s team covered', 'Opponent covered', 'Pushes']);
  assert.deepEqual(V.splitLabels('team_ats', 'team_ats|qb:00-0035704'), ['QB’s team covered', 'Opponent covered', 'Pushes']);
  assert.deepEqual(V.splitLabels('team_ats'), ['Team covered', 'Opponent covered', 'Pushes']);
  assert.deepEqual(V.splitLabels('total', 'total|any:t_off_win'), ['Over', 'Under', 'Pushes']);
  assert.equal(V.sideText(week, 'total', 'B'), 'Under');
  assert.equal(V.sideText(week, 'team_ats', 'B', 'NYG'), 'Fade NYG ATS');
  assert.equal(V.sideText(week, 'total', null), null);
  const path = V.sparkPath([0, 2, -1, 3], { width: 120, height: 32, pad: 2 });
  assert.equal(path.d, 'M2 23 L40.67 9 L79.33 30 L118 2'); // y = 2 + (3 − v) × 28 / 4
  assert.equal(path.zeroY, 23);
  assert.equal(V.sparkPath([1]), null);
  assert.equal(V.sparkPath([0, Number.NaN]), null);
  assert.equal(V.summarizeSpark([0, 2, -1, 3], { bets: 1639, low: { units: -3.1, season: 2004 } }), 'Cumulative units at −110: +3.00 after 1,639 bets; lowest −3.10 in 2004');
});

test('the browser trend modules stay pure: no engine, history, auth or network import in the panel view', () => {
  const src = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.doesNotMatch(src('shared/trends-view.mjs'), /^\s*import\s/m, 'shared/trends-view.mjs imports nothing');
  for (const file of ['web/src/TrendsView.jsx', 'web/src/TrendCard.jsx']) assert.doesNotMatch(src(file), /from '\.\/(auth|api|trendsData)/, file);
  for (const file of fs.readdirSync(new URL('../web/src/', import.meta.url))) {
    if (!/\.(jsx?|mjs)$/.test(file)) continue;
    assert.doesNotMatch(src(`web/src/${file}`), /shared\/trends\.mjs|history-\d{4}-\d{4}\.csv|season-\d{4}\.csv/, `${file} must not pull the engine or history into the bundle`);
  }
  for (const file of ['web/src/GameTrends.jsx', 'web/src/TrendsPanel.jsx', 'web/src/RefereeAssignments.jsx', 'web/src/TrendsView.jsx', 'web/src/TrendCard.jsx']) {
    assert.deepEqual(T.bannedCopy(src(file)), [], `${file} copy`);
  }
});
