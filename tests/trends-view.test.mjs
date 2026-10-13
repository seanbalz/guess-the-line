import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as V from '../shared/trends-view.mjs';
import { T, build } from './trends-fixture.mjs';
import { WIND_ATTRIBUTION, WIND_LICENSE_NOTE, WIND_TIERS } from '../cloud/wind.mjs';

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
  for (const file of ['web/src/TrendsView.jsx', 'web/src/TrendCard.jsx', 'web/src/WindForecast.jsx', 'web/src/windTimer.js']) assert.doesNotMatch(src(file), /from '\.\/(auth|api|trendsData)/, file);
  // The wind card imports only React and the pure view helpers; the timer only the pure helpers.
  assert.deepEqual([...src('web/src/WindForecast.jsx').matchAll(/from '([^']+)'/g)].map(m => m[1]), ['react', '../../shared/trends-view.mjs']);
  assert.deepEqual([...src('web/src/windTimer.js').matchAll(/from '([^']+)'/g)].map(m => m[1]), ['../../shared/trends-view.mjs']);
  for (const file of fs.readdirSync(new URL('../web/src/', import.meta.url))) {
    if (!/\.(jsx?|mjs)$/.test(file)) continue;
    assert.doesNotMatch(src(`web/src/${file}`), /shared\/trends\.mjs|history-\d{4}-\d{4}\.csv|season-\d{4}\.csv/, `${file} must not pull the engine or history into the bundle`);
  }
  for (const file of ['web/src/GameTrends.jsx', 'web/src/TrendsPanel.jsx', 'web/src/RefereeAssignments.jsx', 'web/src/TrendsView.jsx', 'web/src/TrendCard.jsx', 'web/src/WindForecast.jsx']) {
    assert.deepEqual(T.bannedCopy(src(file)), [], `${file} copy`);
  }
});

test('D-34 wind: one credit and one set of tiers shared with the server; the view copy passes the copy guard', () => {
  assert.deepEqual([V.WIND_CREDIT, V.WIND_SOURCE_URL, V.WIND_LICENSE, V.WIND_LICENSE_URL, V.WIND_CHANGES],
    [WIND_ATTRIBUTION.text, WIND_ATTRIBUTION.url, WIND_ATTRIBUTION.license, WIND_ATTRIBUTION.licenseUrl, WIND_ATTRIBUTION.changes]);
  assert.equal(WIND_LICENSE_NOTE, `${V.WIND_CREDIT}, ${V.WIND_LICENSE} (${V.WIND_LICENSE_URL}); ${V.WIND_CHANGES}`);
  assert.deepEqual(V.WIND_TIERS, WIND_TIERS);
  for (const text of [...Object.values(V.WIND_COPY), ...Object.values(V.WIND_CARD_NOTES), V.WIND_CHANGES]) assert.deepEqual(T.bannedCopy(text), [], text);
  // The frozen week file and registry are untouched; the view supersedes their wind strings on screen only.
  assert.match(week.copy.windConditional, /no forecast source/);
  assert.match(week.cards[V.WIND_CARD].note, /no approved forecast source/);
  assert.equal(V.cardNote(week.cards[V.WIND_CARD]), V.WIND_CARD_NOTES[V.WIND_CARD]);
  assert.equal(V.cardNote({ id: 'x', note: 'kept' }), 'kept');
  assert.equal(V.windNote(week, 'windConditional'), V.WIND_COPY.windConditional);
  assert.equal(V.windNote(week, 'wind15Conditional', true), V.WIND_COPY.wind15Shown);
  assert.equal(V.windNote(week, 'roofConditional', true), week.copy.roofConditional);
  for (const note of Object.values(V.WIND_COPY)) assert.doesNotMatch(note, /no forecast source/);
});

test('D-34 wind formatting: compass points, ages, Eastern hours, bands from the unrounded value, confidence and TTL', () => {
  assert.deepEqual([0, 11, 12, 247, 270, 348, 349, 360].map(V.compass), ['N', 'N', 'NNE', 'WSW', 'W', 'NNW', 'N', 'N']);
  assert.equal(V.compass(null), null);
  assert.equal(V.compass(400), null);
  assert.deepEqual([30_000, 12 * 60_000, 5 * 3_600_000, 47.9 * 3_600_000, 3 * 86_400_000].map(V.fmtAge), ['less than a minute', '12 min', '5 h', '47 h', '3 days']);
  assert.equal(V.etHour('2026-10-16T00:00:00.000Z'), '8 PM');
  assert.equal(V.etTime('2026-10-16T00:15:00.000Z'), '8:15 PM');
  assert.equal(V.etTime('2026-11-01T18:00:00.000Z'), '1:00 PM', 'Eastern standard time after November 1');
  assert.deepEqual(V.windBand(9.99), { band: 'below', wind10: false, wind15: false, close: true });
  assert.deepEqual(V.windBand(10), { band: '10-14', wind10: true, wind15: false, close: true });
  assert.deepEqual(V.windBand(14.95), { band: '10-14', wind10: true, wind15: false, close: true });
  assert.deepEqual(V.windBand(15), { band: '15+', wind10: true, wind15: true, close: true });
  assert.equal(V.windBand(6.9).close, false);
  assert.equal(V.windBand(18).close, false);
  assert.equal(V.windBand(null), null);
  const H = 3_600_000;
  assert.deepEqual([18 * H, 18 * H + 1, 48 * H, 72 * H, 100 * H].map(V.windConfidence), ['Short range: high-resolution model updated hourly', 'Next-day guidance', 'Next-day guidance',
    'Trend indicator only (2 to 3 days out)', 'Early outlook, low confidence (3 to 5 days out)']);
  assert.deepEqual([0, 1, 18 * H, 18 * H + 1, 72 * H, 72 * H + 1, 120 * H, 120 * H + 1].map(V.windTtl), [null, 60, 60, 180, 180, 360, 360, null]);
  assert.equal(V.windClock('2026-10-15T00:00:00.000Z', 1000, 61_000), Date.parse('2026-10-15T00:01:00.000Z'));
  assert.equal(V.windClock('2026-10-15T00:00:00.000Z', 5000, 1000), Date.parse('2026-10-15T00:00:00.000Z'), 'a device clock that goes backwards adds nothing');
  assert.equal(V.windClock('nope', 1, 2), null);
});

test('D-34 windView: indoor, loading, not yet, forecast, stale, final and invalid snapshots', () => {
  const H = 3_600_000, g = game('SEA-DEN'), k = Date.parse(g.kickoff);
  const entry = (fetchedAt, extra = {}) => ({ kickoff: g.kickoff, venue: { id: 'DEN00', name: 'Empower Field at Mile High', city: 'Denver', country: 'USA', type: 'outdoor' }, status: 'forecast',
    wind: { windMph: 12.3, fetchedAt: new Date(fetchedAt).toISOString(), forecastHour: '2026-10-16T00:00:00.000Z', ...extra } });
  assert.equal(V.windView({ game: game('BUF-LV'), entry: null, now: k }).state, 'indoor');
  assert.equal(V.windView({ game: game('ARI-LAR'), entry: null, now: k }).state, 'indoor', 'a canopy counts as indoors');
  assert.deepEqual(V.windView({ game: g, entry: null, now: null }), { state: 'none', reason: 'unavailable' });
  assert.deepEqual(V.windView({ game: g, entry: null, now: null, loading: true }), { state: 'loading' });
  assert.equal(V.windView({ game: g, entry: { ...entry(k - 125 * H), wind: null, status: 'not_yet' }, now: k - 121 * H }).state, 'not_yet');
  const fresh = V.windView({ game: g, entry: entry(k - 26 * H), now: k - 24 * H });
  assert.deepEqual([fresh.state, fresh.age, fresh.made, fresh.band.band, fresh.close, fresh.retractable, fresh.international, fresh.early], ['forecast', 2 * H, 26 * H, '10-14', true, false, false, false]);
  // Stale at more than twice the TTL for the current lead (3 h at 24 h out).
  assert.equal(V.windView({ game: g, entry: entry(k - 30 * H), now: k - 24 * H }).state, 'forecast');
  assert.deepEqual(V.windView({ game: g, entry: entry(k - 30 * H - 1), now: k - 24 * H }), { state: 'none', reason: 'stale' });
  // After kickoff: the last pre-kickoff snapshot if made within 2 h of kickoff, the same window as the last hour before it.
  assert.equal(V.windView({ game: g, entry: entry(k - 2 * H), now: k + H }).state, 'final');
  assert.deepEqual(V.windView({ game: g, entry: entry(k - 2 * H - 1), now: k + H }), { state: 'none', reason: 'stale' });
  assert.equal(V.windView({ game: g, entry: entry(k - 101 * H), now: k - 100 * H }).early, true);
  const atl = Date.parse(game('CHI-ATL').kickoff);
  assert.equal(V.windView({ game: game('CHI-ATL'), entry: { ...entry(atl - 26 * H), kickoff: game('CHI-ATL').kickoff, venue: { type: 'retractable', country: 'USA' } }, now: atl - 24 * H }).retractable, true);
  for (const wind of [null, { windMph: 'x', fetchedAt: g.kickoff, forecastHour: g.kickoff }, { windMph: 3, fetchedAt: 'never', forecastHour: g.kickoff }]) {
    assert.deepEqual(V.windView({ game: g, entry: { ...entry(k - H), wind }, now: k - 2 * H }), { state: 'none', reason: 'unavailable' });
  }
  assert.deepEqual(V.windView({ game: g, entry: entry(k + H), now: k + 2 * H }), { state: 'none', reason: 'unavailable' }, 'a snapshot made after kickoff is never shown');
});

test('D-34 nextWindRefresh: the TTL crossing, kickoff, entering the window, and never sooner than a minute', () => {
  const H = 3_600_000, k = Date.parse('2026-10-16T00:15:00.000Z'), now = k - 24 * H;
  const data = games => ({ games });
  const at = (fetched, extra = {}) => ({ kickoff: new Date(k).toISOString(), status: 'forecast', wind: { windMph: 5, fetchedAt: new Date(fetched).toISOString(), forecastHour: '2026-10-16T00:00:00.000Z' }, ...extra });
  assert.equal(V.nextWindRefresh(data({ a: at(now - 2 * H) }), now), now + H, 'fetched 2 h ago with a 3 h TTL');
  assert.equal(V.nextWindRefresh(data({ a: at(now - 5 * H) }), now), now + 60_000, 'already past the TTL: a minute from now');
  assert.equal(V.nextWindRefresh(data({ a: at(k - 30 * 60_000) }), k - 20 * 60_000), k, 'kickoff comes first');
  assert.equal(V.nextWindRefresh(data({ a: { kickoff: new Date(k).toISOString(), status: 'not_yet', wind: null } }), k - 130 * H), k - 120 * H, 'entering the 120 h window');
  assert.equal(V.nextWindRefresh(data({ a: { kickoff: new Date(k).toISOString(), status: 'none', wind: null } }), now), now + 3 * H, 'no snapshot: retry after the TTL');
  assert.equal(V.nextWindRefresh(data({ a: { ...at(now), status: 'indoor' } }), now), null);
  assert.equal(V.nextWindRefresh(data({ a: at(k - 3 * H) }), k + 1), null, 'nothing after kickoff');
  assert.equal(V.nextWindRefresh(null, now), null);
});
