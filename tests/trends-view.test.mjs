import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as V from '../shared/trends-view.mjs';
import { T, build } from './trends-fixture.mjs';
import { WIND_ATTRIBUTION, WIND_LICENSE_NOTE, WIND_TIERS } from '../cloud/wind.mjs';
import { SEASONS, WIND_STADIUMS, venueFor, windVenue } from '../shared/wind-venues.mjs';
import { lockedIn } from '../web/src/sentFinal.js';
import { ballotLockedIn } from '../server/engine.mjs';

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

// Redesign stage 17 (D-39 per-game lock-in, D-31 kickoff, D-23 sit-out): one gate per game and market, the one M-01's
// gtl_guess_revealed applies in SQL. Today's rules (no revealAt, or 'deadline') also open every game at the deadline; from
// M-01 (`revealAt: 'kickoff'`) only each game's own kickoff does.
test('reveal gating per game: a lock-in, a sit-out or that game\'s kickoff opens one game and market; both needs both', () => {
  const M01 = { sentFinal: false, lateWindow: 'deadline', revealAt: 'kickoff' }, TODAY = { sentFinal: false, lateWindow: 'deadline', revealAt: 'deadline' };
  const DEADLINE = '2026-10-16T00:15:00Z', FRIDAY = '2026-10-16T16:00:00Z', SUNDAY = '2026-10-18T17:00:00Z', BEFORE = '2026-10-15T20:00:00Z';
  const ga = V.gameAccess;
  const at = (now, rules, extra = {}) => ga({ kickoff: SUNDAY, deadline: DEADLINE, now, rules, ...extra });
  assert.deepEqual(at(BEFORE, M01), { spread: false, total: false, revealAt: 'kickoff' });
  assert.deepEqual(at(FRIDAY, TODAY), { spread: true, total: true, revealAt: 'deadline' }, 'today: the deadline opens every game');
  assert.deepEqual(at(FRIDAY, undefined), { spread: true, total: true, revealAt: 'deadline' }, 'no rules read as today\'s');
  assert.deepEqual(at(FRIDAY, M01), { spread: false, total: false, revealAt: 'kickoff' }, 'M-01: the deadline alone opens nothing');
  assert.deepEqual(at(SUNDAY, M01), { spread: true, total: true, revealAt: 'kickoff' }, 'M-01: the game\'s own kickoff opens it, both markets');
  assert.deepEqual(at(BEFORE, M01, { lockedIn: { spread: true } }), { spread: true, total: false, revealAt: 'kickoff' }, 'a Spread lock-in never opens Total');
  assert.deepEqual(at(BEFORE, M01, { satOut: { total: true } }), { spread: false, total: true, revealAt: 'kickoff' });
  assert.deepEqual(at(FRIDAY, { sentFinal: true, lateWindow: 'kickoff' }), { spread: false, total: false, revealAt: 'kickoff' }, 'a kickoff late window reveals at kickoff');
  for (const [now, kickoff] of [[null, SUNDAY], ['not a time', SUNDAY], [SUNDAY, null], [SUNDAY, 'nope']]) {
    assert.deepEqual(ga({ kickoff, deadline: DEADLINE, now, rules: M01 }), { spread: false, total: false, revealAt: 'kickoff' }, `an unreadable time never opens: ${now} ${kickoff}`);
  }

  // Community Picks: the /personal view. A pick in a submitted ballot is locked in (gtl_guess_locked_in); a draft is not.
  const games = [{ id: 'SEA-DEN', kickoff: DEADLINE }, { id: 'HOU-JAX', kickoff: SUNDAY }];
  const personal = (now, rules, ballots = {}) => ({ games, deadline: DEADLINE, now, rules, ballots });
  const ca = V.communityAccess;
  assert.deepEqual(ca(personal(BEFORE, M01), 'SEA-DEN'), { spread: false, total: false, revealAt: 'kickoff' });
  const sent = { guess_spread: { submittedAt: BEFORE, picks: { 'SEA-DEN': -3, 'HOU-JAX': 2.5 } } };
  assert.deepEqual(ca(personal(BEFORE, M01, sent), 'HOU-JAX'), { spread: true, total: false, revealAt: 'kickoff' }, 'a Total submission never unlocks spread-gated trends, and the reverse');
  assert.deepEqual(ca(personal(BEFORE, M01, { guess_spread: { picks: { 'HOU-JAX': 2.5 } } }), 'HOU-JAX').spread, false, 'a draft is not a lock-in');
  assert.deepEqual(ca(personal(BEFORE, M01, { guess_spread: { submittedAt: BEFORE, picks: { 'SEA-DEN': -3 } } }), 'HOU-JAX').spread, false, 'no pick for that game: not locked in');
  assert.deepEqual(ca(personal(BEFORE, M01), 'HOU-JAX', ['guess_total']), { spread: false, total: true, revealAt: 'kickoff' }, 'a sit-out opens its market');
  assert.deepEqual([ca(personal(FRIDAY, M01), 'SEA-DEN'), ca(personal(FRIDAY, M01), 'HOU-JAX')], [{ spread: true, total: true, revealAt: 'kickoff' }, { spread: false, total: false, revealAt: 'kickoff' }],
    'after Thursday\'s kickoff only Thursday\'s game is open');
  assert.deepEqual(ca(personal(FRIDAY, TODAY), 'HOU-JAX'), { spread: true, total: true, revealAt: 'deadline' }, 'today the deadline opened the week');
  assert.deepEqual(ca(personal(FRIDAY, M01), 'XX-YY'), { spread: false, total: false, revealAt: 'kickoff' }, 'a game not on the slate has no kickoff to open it');

  // The group ballot and dashboard: the /state view (statuses, marketAccess, this mode's reveal).
  const state = (now, rules, extra = {}) => ({ games, league: { deadline: DEADLINE }, now, rules, mode: 'guess_spread', revealed: false, marketAccess: { spread: false, total: false },
    statuses: { guess_spread: { submittedAt: null, satOut: false, lockReason: null }, guess_total: { submittedAt: null, satOut: false, lockReason: null } }, ...extra });
  const gr = V.groupAccess;
  assert.deepEqual(gr(state(BEFORE, M01), 'HOU-JAX'), { spread: false, total: false, revealAt: 'kickoff' });
  assert.deepEqual(gr(state(BEFORE, M01, { revealed: true, marketAccess: { spread: true, total: false } }), 'HOU-JAX'), { spread: true, total: false, revealAt: 'kickoff' });
  assert.deepEqual(gr(state(BEFORE, M01, { mode: 'guess_total', revealed: true }), 'HOU-JAX'), { spread: false, total: true, revealAt: 'kickoff' });
  assert.deepEqual(gr(state(BEFORE, M01, { mode: 'betting_challenge', marketAccess: { spread: false, total: true } }), 'HOU-JAX'), { spread: false, total: true, revealAt: 'kickoff' });
  const lockedAtDeadline = { statuses: { guess_spread: { satOut: true }, guess_total: { submittedAt: null, lockReason: 'deadline' } } };
  assert.deepEqual(gr(state(FRIDAY, M01, lockedAtDeadline), 'HOU-JAX'), { spread: true, total: false, revealAt: 'kickoff' }, 'M-01: the deadline lock no longer opens a game');
  assert.deepEqual(gr(state(FRIDAY, TODAY, lockedAtDeadline), 'HOU-JAX'), { spread: true, total: true, revealAt: 'deadline' }, 'today it does');
  assert.deepEqual(gr(state(FRIDAY, M01), 'SEA-DEN'), { spread: true, total: true, revealAt: 'kickoff' }, 'the kicked-off game opens for everyone');
  for (const [access, gate, open] of [[{ spread: true }, 'spread', true], [{ spread: true }, 'total', false], [{ spread: true }, 'both', false], [{ spread: true, total: true }, 'both', true], [{}, 'spread', false]]) {
    assert.equal(V.gateOpen(access, gate), open, `${JSON.stringify(access)} ${gate}`);
  }
});

// Redesign stage 18 (M-02, D-39): the new app locks in one game at a time, recorded in the ballot's server-written lockedAt
// with no submission. gtl_guess_locked_in (M-01's gate) counts it, so the old app opens that game's trends for its owner, on
// Community Picks and on the group ballot and dashboard, and leaves the ballot's other games, still drafts, locked.
test('per-game lock-in: a game lockedAt names opens its trends for its owner; the other games stay locked', () => {
  const M01 = { sentFinal: false, lateWindow: 'deadline', revealAt: 'kickoff' }, M02 = { sentFinal: true, lateWindow: 'deadline', revealAt: 'kickoff' };
  const DEADLINE = '2026-10-16T00:15:00Z', SUNDAY = '2026-10-18T17:00:00Z', BEFORE = '2026-10-15T20:00:00Z';
  const games = [{ id: 'SEA-DEN', kickoff: DEADLINE }, { id: 'HOU-JAX', kickoff: SUNDAY }, { id: 'CHI-ATL', kickoff: SUNDAY }];
  const draft = { submittedAt: null, picks: { 'SEA-DEN': -3, 'HOU-JAX': 2.5, 'CHI-ATL': -1 }, lockedAt: { 'HOU-JAX': '2026-10-15T19:00:00.000Z' } };
  const personal = (rules, ballots) => ({ games, deadline: DEADLINE, now: BEFORE, rules, ballots });
  for (const rules of [M01, M02]) {
    const data = personal(rules, { guess_spread: draft });
    assert.deepEqual(V.communityAccess(data, 'HOU-JAX'), { spread: true, total: false, revealAt: 'kickoff' }, 'the locked-in game opens, Spread only');
    assert.deepEqual(['SEA-DEN', 'CHI-ATL'].map(id => V.communityAccess(data, id)), [{ spread: false, total: false, revealAt: 'kickoff' }, { spread: false, total: false, revealAt: 'kickoff' }],
      'the ballot\'s other games are drafts and stay locked');
    assert.deepEqual(V.communityAccess(personal(rules, { guess_total: draft }), 'HOU-JAX'), { spread: false, total: true, revealAt: 'kickoff' }, 'a Total lock-in opens Total only');
  }
  for (const [label, ballot] of [['a lockedAt time that is not a string', { ...draft, lockedAt: { 'HOU-JAX': true } }], ['lockedAt for a game with no pick', { ...draft, picks: { 'SEA-DEN': -3 } }],
    ['lockedAt that is not an object', { ...draft, lockedAt: 'HOU-JAX' }]]) {
    assert.equal(V.communityAccess(personal(M01, { guess_spread: ballot }), 'HOU-JAX').spread, false, label);
  }
  // The group ballot and dashboard (/state): the view's own mode reads its lockedAt the same way; the other market never opens.
  const state = (mode, lockedAt, extra = {}) => ({ games: games.map(g => ({ ...g, prediction: draft.picks[g.id] })), league: { deadline: DEADLINE }, now: BEFORE, rules: M02,
    mode, revealed: false, submittedAt: null, lockedAt, marketAccess: { spread: false, total: false },
    statuses: { guess_spread: { submittedAt: null, satOut: false }, guess_total: { submittedAt: null, satOut: false } }, ...extra });
  assert.deepEqual(['HOU-JAX', 'SEA-DEN', 'CHI-ATL'].map(id => V.groupAccess(state('guess_spread', draft.lockedAt), id).spread), [true, false, false], 'the group ballot opens the locked-in game only');
  assert.deepEqual(V.groupAccess(state('guess_total', draft.lockedAt), 'HOU-JAX'), { spread: false, total: true, revealAt: 'kickoff' }, 'the view\'s own market only');
  assert.equal(V.groupAccess(state('guess_spread', null), 'HOU-JAX').spread, false, 'no lockedAt: a draft');
  assert.equal(V.groupAccess(state('guess_spread', draft.lockedAt, { games: games.map(g => ({ ...g, prediction: null })) }), 'HOU-JAX').spread, false, 'lockedAt with no pick');
  // One reading: the old app's sentFinal.js lockedIn, the engine's ballotLockedIn and gtl_ballot_locked_in in SQL.
  const submitted = { submittedAt: BEFORE, picks: { 'SEA-DEN': -3, 'HOU-JAX': 2.5 } };
  for (const ballot of [draft, submitted, { ...draft, lockedAt: { 'HOU-JAX': 1 } }, { ...draft, picks: { 'HOU-JAX': '2.5' } }, { picks: { 'HOU-JAX': 2.5 } }, null, undefined]) {
    for (const id of [...games.map(g => g.id), 'XX-YY']) {
      const label = `${id} ${JSON.stringify(ballot)}`;
      assert.equal(V.guessLockedIn(ballot, id), lockedIn(ballot, id), label);
      assert.equal(V.guessLockedIn(ballot, id), ballotLockedIn(ballot, id), label);
    }
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
  assert.deepEqual([18 * H, 18 * H + 1, 48 * H, 72 * H, 100 * H].map(lead => V.windConfidence(lead, true)), ['Short range: high-resolution model updated hourly', 'Next-day guidance', 'Next-day guidance',
    'Trend indicator only (2 to 3 days out)', 'Early outlook, low confidence (3 to 5 days out)']);
  // Outside the U.S. (or for an unknown venue) the short-range label names only the lead, never an hourly high-resolution model.
  assert.deepEqual([H, 18 * H, 18 * H + 1].map(lead => V.windConfidence(lead, false)), ['Short range (within 18 h of kickoff)', 'Short range (within 18 h of kickoff)', 'Next-day guidance']);
  assert.deepEqual([0, 18 * H].map(V.windConfidence), [V.WIND_SHORT_RANGE, V.WIND_SHORT_RANGE], 'only a literal true makes the U.S. claim (map passes an index)');
  assert.equal(V.windConfidence(Number.NaN, true), null);
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

test('D-34 windView: within 18 h of kickoff only a U.S. stadium is labelled with the hourly high-resolution model', () => {
  const H = 3_600_000;
  const at = (season, wk, id, lead) => {
    const v = venueFor(season, wk, id), kickoff = Date.parse('2026-11-22T20:20:00.000Z');
    const entry = { kickoff: new Date(kickoff).toISOString(), status: 'forecast', venue: { id: v.id, name: v.name, city: v.city, country: v.country, type: v.type },
      wind: { windMph: 12.3, fetchedAt: new Date(kickoff - lead).toISOString(), forecastHour: new Date(kickoff).toISOString() } };
    return V.windView({ game: { id, kickoff: entry.kickoff }, entry, now: kickoff - lead + 30 * 60_000 });
  };
  // Saint-Denis and Munich (ICON-D2, every 3 h), Madrid (ICON-EU, IFS, GFS), Mexico City (south of HRRR: the global mix), and the other 2026 sites abroad.
  for (const [wk, id, city] of [[7, 'PIT-NO', 'Saint-Denis'], [9, 'CIN-ATL', 'Madrid'], [10, 'NE-DET', 'Munich'], [11, 'MIN-SF', 'Mexico City'],
    [6, 'HOU-JAX', 'London'], [4, 'IND-WAS', 'London'], [1, 'SF-LAR', 'Melbourne'], [3, 'BAL-DAL', 'Rio de Janeiro']]) {
    for (const lead of [18 * H, 6 * H, H]) {
      const view = at(2026, wk, id, lead);
      assert.equal(view.venue.city, city);
      assert.deepEqual([view.state, view.international, view.confidence], ['forecast', true, 'Short range (within 18 h of kickoff)'], `${id} at ${lead / H} h`);
      assert.doesNotMatch(view.confidence, /hourly|high-resolution/);
    }
    assert.equal(at(2026, wk, id, 30 * H).confidence, 'Next-day guidance', 'longer leads are the same everywhere');
  }
  // Every 2026 home stadium where wind can matter is in the U.S. and keeps the HRRR label.
  for (const [team, stadium] of Object.entries(SEASONS[2026].homes)) {
    if (!windVenue(WIND_STADIUMS[stadium])) continue;
    const away = team === 'BUF' ? 'MIA' : 'BUF', view = at(2026, 12, `${away}-${team}`, 12 * H);
    assert.deepEqual([view.state, view.international, view.confidence], ['forecast', false, 'Short range: high-resolution model updated hourly'], stadium);
  }
  // An entry without a venue makes no model claim either.
  const k = Date.parse('2026-11-22T20:20:00.000Z');
  const bare = V.windView({ game: { id: 'X-Y', kickoff: new Date(k).toISOString() }, now: k - 5 * H,
    entry: { kickoff: new Date(k).toISOString(), status: 'forecast', venue: null, wind: { windMph: 9, fetchedAt: new Date(k - 6 * H).toISOString(), forecastHour: new Date(k).toISOString() } } });
  assert.deepEqual([bare.state, bare.international, bare.confidence], ['forecast', false, 'Short range (within 18 h of kickoff)']);
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
