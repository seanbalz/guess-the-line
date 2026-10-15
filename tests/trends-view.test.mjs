import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as V from '../shared/trends-view.mjs';
import { T, build } from './trends-fixture.mjs';
import { WIND_ATTRIBUTION, WIND_LICENSE_NOTE, WIND_SCHEDULE, windNextDue } from '../cloud/wind.mjs';
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
  assert.deepEqual([...src('web/src/WindForecast.jsx').matchAll(/from '([^']+)'/g)].map(m => m[1]), ['react', '../../shared/trends-view.mjs', '../../shared/weather-view.mjs']);
  assert.deepEqual([...src('web/src/windTimer.js').matchAll(/from '([^']+)'/g)].map(m => m[1]), ['../../shared/trends-view.mjs']);
  for (const file of fs.readdirSync(new URL('../web/src/', import.meta.url))) {
    if (!/\.(jsx?|mjs)$/.test(file)) continue;
    assert.doesNotMatch(src(`web/src/${file}`), /shared\/trends\.mjs|history-\d{4}-\d{4}\.csv|season-\d{4}\.csv/, `${file} must not pull the engine or history into the bundle`);
  }
  for (const file of ['web/src/GameTrends.jsx', 'web/src/TrendsPanel.jsx', 'web/src/RefereeAssignments.jsx', 'web/src/TrendsView.jsx', 'web/src/TrendCard.jsx', 'web/src/WindForecast.jsx']) {
    assert.deepEqual(T.bannedCopy(src(file)), [], `${file} copy`);
  }
});

test('D-34 wind: one credit and one D-47 refresh schedule shared with the server; the view copy passes the copy guard', () => {
  assert.deepEqual([V.WIND_CREDIT, V.WIND_SOURCE_URL, V.WIND_LICENSE, V.WIND_LICENSE_URL, V.WIND_CHANGES],
    [WIND_ATTRIBUTION.text, WIND_ATTRIBUTION.url, WIND_ATTRIBUTION.license, WIND_ATTRIBUTION.licenseUrl, WIND_ATTRIBUTION.changes]);
  assert.equal(WIND_LICENSE_NOTE, `${V.WIND_CREDIT}, ${V.WIND_LICENSE} (${V.WIND_LICENSE_URL}); ${V.WIND_CHANGES}`);
  assert.deepEqual(V.WIND_SCHEDULE, WIND_SCHEDULE);
  assert.deepEqual(V.WIND_SCHEDULE, { everyH: 24, beforeKickoffH: [12, 2] });
  // The browser's due time is the server planner's, minute by minute over a game's last 121 hours.
  const k = Date.parse('2026-10-18T17:00:00.000Z');
  for (let made = 121 * 60; made >= -5; made -= 1) {
    const fetched = k - made * 60_000;
    assert.equal(V.windNextDue(k, fetched), windNextDue(k, fetched), `made ${made} min before kickoff`);
  }
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
  assert.equal(V.windClock('2026-10-15T00:00:00.000Z', 1000, 61_000), Date.parse('2026-10-15T00:01:00.000Z'));
  assert.equal(V.windClock('2026-10-15T00:00:00.000Z', 5000, 1000), Date.parse('2026-10-15T00:00:00.000Z'), 'a device clock that goes backwards adds nothing');
  assert.equal(V.windClock('nope', 1, 2), null);
});

test('D-34 windView: indoor, loading, not yet, forecast, stale, final and invalid snapshots', () => {
  const H = 3_600_000, g = game('SEA-DEN'), k = Date.parse(g.kickoff);
  const entry = (fetchedAt, extra = {}) => ({ kickoff: g.kickoff, venue: { id: 'DEN00', name: 'Empower Field at Mile High', city: 'Denver', country: 'USA', type: 'outdoor' }, status: 'forecast',
    wind: { windMph: 12.3, fetchedAt: new Date(fetchedAt).toISOString(), forecastHour: '2026-10-16T00:00:00.000Z', ...extra } });
  assert.equal(V.windView({ game: game('BUF-LV'), entry: null, now: k }).state, 'indoor');
  // D-45: SoFi's canopy (a fixed roof over the field) is Indoors with or without the server's venue, even if a snapshot is passed.
  assert.equal(game('ARI-LAR').flags.roof, 'dome');
  assert.equal(V.windView({ game: game('ARI-LAR'), entry: null, now: k }).state, 'indoor', 'a canopy counts as indoors');
  const lar = Date.parse(game('ARI-LAR').kickoff), sofi = { id: 'LAX01', name: 'SoFi Stadium', city: 'Inglewood', country: 'USA', type: 'canopy' };
  assert.deepEqual(V.windView({ game: game('ARI-LAR'), entry: { ...entry(lar - 26 * H), kickoff: game('ARI-LAR').kickoff, venue: sofi }, now: lar - 24 * H }), { state: 'indoor' });
  // The server's venue decides the roof, not the week file's stadium: an open-air venue shows its forecast even if the
  // week file says canopy, and a canopy is Indoors even if the week file says open-air.
  const listedCanopy = { ...g, flags: { ...g.flags, stadium: { ...g.flags.stadium, type: 'canopy' } } };
  assert.equal(V.venueRoof(entry(k).venue, listedCanopy), 'outdoor');
  assert.equal(V.windView({ game: listedCanopy, entry: entry(k - 26 * H), now: k - 24 * H }).state, 'forecast');
  assert.equal(V.windView({ game: g, entry: { ...entry(k - 26 * H), venue: sofi }, now: k - 24 * H }).state, 'indoor');
  assert.equal(V.venueRoof(null, listedCanopy), 'canopy', 'without the server\'s venue the week file\'s stadium decides');
  // The server's "indoor" counts only when no venue type is known; next to a known open-air type it is no current forecast, never "Indoors".
  assert.deepEqual(V.windView({ game: { id: 'AAA-BBB', kickoff: g.kickoff, flags: {} }, entry: { kickoff: g.kickoff, venue: null, status: 'indoor', wind: null }, now: k - 24 * H }), { state: 'indoor' });
  assert.deepEqual(V.windView({ game: g, entry: { ...entry(k - 26 * H), status: 'indoor', wind: null }, now: k - 24 * H }), { state: 'none', reason: 'unavailable' });
  assert.deepEqual(V.windView({ game: g, entry: null, now: null }), { state: 'none', reason: 'unavailable' });
  assert.deepEqual(V.windView({ game: g, entry: null, now: null, loading: true }), { state: 'loading' });
  assert.equal(V.windView({ game: g, entry: { ...entry(k - 125 * H), wind: null, status: 'not_yet' }, now: k - 121 * H }).state, 'not_yet');
  const fresh = V.windView({ game: g, entry: entry(k - 26 * H), now: k - 24 * H });
  assert.deepEqual([fresh.state, fresh.age, fresh.made, fresh.band.band, fresh.close, fresh.retractable, fresh.international, fresh.early], ['forecast', 2 * H, 26 * H, '10-14', true, false, false, false]);
  // D-47: current until an hour past the time the snapshot falls due (24 h after it was taken, or the 12 h and 2 h
  // checkpoints), however old it is until then. A day out, a snapshot from 30 h before kickoff is due at the 12 h checkpoint.
  const state = (madeMs, nowMs) => V.windView({ game: g, entry: entry(k - madeMs), now: nowMs }).state;
  assert.equal(state(30 * H, k - 24 * H), 'forecast');
  assert.equal(state(30 * H, k - 11 * H), 'forecast', 'an hour past the 12 h checkpoint, still waiting for the next read');
  assert.equal(state(30 * H, k - 11 * H + 1), 'none', 'the 12 h checkpoint missed for more than an hour');
  assert.deepEqual(V.windView({ game: g, entry: entry(k - 30 * H), now: k - 11 * H + 1 }), { state: 'none', reason: 'stale' });
  // Every 24 h: a snapshot from 49 h out is due 25 h out and current until 24 h out, inclusive.
  assert.equal(state(49 * H, k - 24 * H), 'forecast');
  assert.equal(state(49 * H + 1, k - 24 * H), 'none');
  assert.equal(state(100 * H, k - 77 * H), 'forecast', 'a 23 h-old early outlook is current');
  // The 2 h checkpoint: a snapshot from the 12 h checkpoint is current until an hour past it, and never at kickoff.
  assert.equal(state(12 * H, k - H), 'forecast');
  assert.equal(state(12 * H, k - H + 1), 'none');
  assert.equal(state(12 * H, k - 1), 'none', 'a 12 h-old forecast is never called current in the last hour');
  assert.equal(state(2 * H, k - 1), 'forecast', 'taken at the 2 h checkpoint: current until kickoff');
  // After kickoff: the last pre-kickoff snapshot if it was current at kickoff, which is one taken 2 h or less before it.
  assert.equal(V.windView({ game: g, entry: entry(k - 2 * H), now: k + H }).state, 'final');
  assert.equal(V.windView({ game: g, entry: entry(k - 2 * H), now: k + 30 * 24 * H }).state, 'final', 'with no end time');
  assert.deepEqual(V.windView({ game: g, entry: entry(k - 2 * H - 1), now: k + H }), { state: 'none', reason: 'stale' });
  assert.deepEqual(V.windView({ game: g, entry: entry(k - 12 * H), now: k }), { state: 'none', reason: 'stale' }, 'the 2 h checkpoint was missed');
  // windCurrent is the one rule: until the due time plus WIND_GRACE_MS (one hour), and for good once never due.
  assert.equal(V.WIND_GRACE_MS, H);
  assert.deepEqual([V.windCurrent(k, k - 13 * H, k - 11 * H), V.windCurrent(k, k - 13 * H, k - 11 * H + 1), V.windCurrent(k, k - H, k + 365 * 24 * H)], [true, false, true]);
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

test('D-47 nextWindRefresh: the due points (24 h, 12 h and 2 h before kickoff), kickoff, entering the window, retries; never sooner than a minute', () => {
  const H = 3_600_000, MIN = 60_000, k = Date.parse('2026-10-16T00:15:00.000Z');
  const data = (games, outcome = 'not_due') => ({ refresh: { outcome }, games });
  const at = (fetched, extra = {}) => ({ kickoff: new Date(k).toISOString(), status: 'forecast', wind: { windMph: 5, fetchedAt: new Date(fetched).toISOString(), forecastHour: '2026-10-16T00:00:00.000Z' }, ...extra });
  const next = (fetched, now, outcome) => V.nextWindRefresh(data({ a: at(fetched) }, outcome), now);
  // The next due point of the newest snapshot: 24 h after it, or the next checkpoint, whichever is first.
  assert.equal(next(k - 100 * H, k - 99 * H), k - 76 * H, '24 h after a snapshot from 100 h out');
  assert.equal(next(k - 30 * H, k - 24 * H), k - 12 * H, 'the 12 h checkpoint comes before 24 h');
  assert.equal(next(k - 12 * H, k - 11 * H), k - 2 * H, 'then the 2 h checkpoint');
  assert.equal(next(k - 2 * H, k - 90 * MIN), k, 'then only kickoff: the final forecast is never due');
  assert.equal(next(k - 30 * MIN, k - 20 * MIN), k, 'kickoff comes first');
  // Never more often: with the snapshot current, nothing between the due points, whatever the TTL tiers used to say.
  for (const now of [k - 99 * H, k - 80 * H, k - 77 * H]) assert.equal(next(k - 100 * H, now), k - 76 * H, `${(k - now) / H} h out`);
  // A game still due when the answer came (the server held off or turned the read away) is asked again: a minute after
  // busy, cooldown or a fetch, 15 minutes after backoff, budget, failure or anything else.
  assert.equal(V.WIND_RETRY_MS, 15 * MIN);
  for (const outcome of ['busy', 'cooldown', 'fetched']) assert.equal(next(k - 30 * H, k - 11 * H, outcome), k - 11 * H + MIN, outcome);
  for (const outcome of ['backoff', 'budget', 'failed', 'not_due', 'unavailable', undefined]) assert.equal(next(k - 30 * H, k - 11 * H, outcome), k - 11 * H + 15 * MIN, String(outcome));
  const missing = outcome => V.nextWindRefresh(data({ a: { kickoff: new Date(k).toISOString(), status: 'none', wind: null } }, outcome), k - 24 * H);
  assert.deepEqual([missing('cooldown'), missing('failed')], [k - 24 * H + MIN, k - 24 * H + 15 * MIN], 'no snapshot inside the window');
  assert.equal(next(k - 30 * H, k - 10 * MIN, 'failed'), k, 'never past kickoff');
  assert.equal(V.nextWindRefresh(data({ a: { kickoff: new Date(k).toISOString(), status: 'not_yet', wind: null } }), k - 130 * H), k - 120 * H, 'entering the 120 h window');
  assert.equal(V.nextWindRefresh(data({ a: { kickoff: new Date(k).toISOString(), status: 'not_yet', wind: null } }), k - 120 * H - 30_000), k - 120 * H + 30_000, 'never sooner than a minute');
  // The earliest game decides: a Sunday game 74 h after this one, last fetched 40 h before Thursday's kickoff, is due 24 h later.
  assert.equal(V.nextWindRefresh(data({ a: at(k - 30 * H), b: { ...at(k - 40 * H), kickoff: new Date(k + 74 * H).toISOString() } }), k - 24 * H), k - 16 * H);
  assert.equal(V.nextWindRefresh(data({ a: { ...at(k - 30 * H), status: 'indoor' } }), k - 24 * H), null);
  assert.equal(V.nextWindRefresh(data({ a: at(k - 3 * H) }), k + 1), null, 'nothing after kickoff');
  assert.equal(V.nextWindRefresh(null, k), null);
});

// ---------------------------------------------------------------------------
// DASH-7 "Trends, simplified" (redesign build plan stage 13): per-game access, short cards, the board's trend lines,
// the top three per game and the All trends groups, all read from the committed Week 6 file.
// ---------------------------------------------------------------------------
const NAMES = { SEA: 'Seattle Seahawks', DEN: 'Denver Broncos', HOU: 'Houston Texans', JAX: 'Jacksonville Jaguars', NO: 'New Orleans Saints', NYG: 'New York Giants',
  WAS: 'Washington Commanders', SF: 'San Francisco 49ers', CAR: 'Carolina Panthers', PHI: 'Philadelphia Eagles', LAC: 'Los Angeles Chargers', KC: 'Kansas City Chiefs',
  DAL: 'Dallas Cowboys', GB: 'Green Bay Packers', BUF: 'Buffalo Bills', LV: 'Las Vegas Raiders', ARI: 'Arizona Cardinals', LAR: 'Los Angeles Rams', CHI: 'Chicago Bears',
  ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens', CLE: 'Cleveland Browns', NYJ: 'New York Jets', NE: 'New England Patriots', PIT: 'Pittsburgh Steelers', TB: 'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans', IND: 'Indianapolis Colts' };
const CLOSED = Object.freeze({ spread: false, total: false }), OPEN = Object.freeze({ spread: true, total: true });

test('per-game access for the new app: the server\'s rules and now, one game\'s lock-in, a sit-out; the line gate of each trend', () => {
  const games = week.games.map(g => ({ id: g.id, kickoff: g.kickoff }));
  const view = (extra = {}) => ({ games, deadline: games[0].kickoff, now: '2026-10-15T20:00:00Z', rules: { sentFinal: true, lateWindow: 'deadline', revealAt: 'kickoff' }, ballots: {}, ...extra });
  assert.deepEqual(V.communityAccess(view(), 'SEA-DEN'), { spread: false, total: false, revealAt: 'kickoff' });
  // One game locked in for one market opens that game and market only.
  const locked = view({ ballots: { guess_spread: { picks: { 'SEA-DEN': 2.5, 'HOU-JAX': 3 }, lockedAt: { 'SEA-DEN': '2026-10-15T19:00:00Z' } } } });
  assert.deepEqual([V.communityAccess(locked, 'SEA-DEN').spread, V.communityAccess(locked, 'SEA-DEN').total, V.communityAccess(locked, 'HOU-JAX').spread], [true, false, false]);
  // The clock: SEA @ DEN's kickoff opens SEA @ DEN; under today's rules the deadline opens every game.
  assert.deepEqual(V.communityAccess(view({ now: '2026-10-16T00:15:00Z' }), 'SEA-DEN'), { spread: true, total: true, revealAt: 'kickoff' });
  assert.deepEqual(V.communityAccess(view({ now: '2026-10-16T00:15:00Z' }), 'HOU-JAX'), { spread: false, total: false, revealAt: 'kickoff' });
  assert.equal(V.communityAccess(view({ now: '2026-10-16T00:15:00Z', rules: null }), 'HOU-JAX').spread, true);
  assert.deepEqual(V.communityAccess(view(), 'SEA-DEN', ['guess_total']), { spread: false, total: true, revealAt: 'kickoff' });
  // The engine's own gate for a card or row; a favorite-or-underdog card also waits for the Spread (prototype review R9).
  assert.equal(V.lineGate(week, 'team_ats|t:t_mkt_down3+role:dog'), 'spread');
  assert.equal(V.lineGate(week, 'fav_ats|g:g_fav_tt_ge28+g:g_indoor'), 'both');
  assert.equal(V.lineGate(week, 'fav_ats|g:g_altitude'), 'spread');
  assert.equal(V.lineGate(week, 'team_ats|team:SEA+role:fav'), 'spread');
  assert.equal(V.lineGate(week, 'total|ref:Adrian Hill+g:g_t_le37'), 'total');
  assert.equal(V.lineGate(week, 'team_ats|t:t_ats_season_hot'), null);
  assert.equal(V.lineGate(week, 'fav_ats|g:g_all'), null, 'a two-sided row names no side, so it needs no line');
  assert.equal(V.lineGate(week, 'total|g:g_wind10'), null);
});

test('short cards: plain words, the file\'s own record and sample size, the tier in words; rows both ways', () => {
  const nyg = game('NO-NYG');
  const hot = V.shortCard(week, nyg.tier2[0], { game: nyg, access: CLOSED, names: NAMES });
  const record = week.cards['team_ats|t:t_ats_season_hot'].record;
  assert.deepEqual([hot.title, hot.sentence, hot.record, hot.sample, hot.games, hot.pct, hot.tierLabel], ['Covering almost every week this season · NYG',
    `Teams in the Saints’ spot covered ${record.W} times and missed ${record.L} since 2002.`, `${record.W}–${record.L}–${record.P}`, `${record.W + record.L + record.P} games`,
    record.W + record.L + record.P, Math.round((100 * record.W) / (record.W + record.L)), 'Consistent, not proven']);
  // Backing the team with the trait names that team's spot (HOU, side A); fading it names its opponent (NO for NYG, side B).
  assert.match(V.shortCard(week, game('HOU-JAX').tier2[0], { game: game('HOU-JAX'), names: NAMES }).sentence, /^Teams in the Texans’ spot covered 444 times and missed 364 since 2002\.$/);
  assert.equal(V.shortCard(week, { card: 'total|g:g_wind10' }, { names: NAMES }).sentence, 'The Under hit 898 times and missed 730 in games like this since 2002.');
  assert.equal(V.shortCard(week, { card: 'fav_ats|g:g_altitude' }, { access: OPEN }).sentence, 'Underdogs in this spot covered 117 times and missed 89 since 2002.');
  assert.equal(V.shortCard(week, { card: 'home_ats|g:g_home_fav+g:g_s_3' }, { access: OPEN }).sentence, 'Road teams in this spot covered 298 times and missed 237 since 2002.');
  assert.equal(V.shortCard(week, { card: 'total_rev|g:g_totrev' }).sentence, 'Under after high-scoring starts and Over after low-scoring starts: right 830 times and wrong 724 since 2002.');
  // Rows are shown both ways (never as a side with a record), with their own years and sample size.
  const all = V.shortCard(week, { id: 'home_ats|g:g_all' });
  const [a, b, p] = week.rows['home_ats|g:g_all'].split;
  assert.deepEqual([all.kind, all.pct, all.record, all.sample, all.tierLabel], ['row', null, V.recordText(a, b, p), V.sampleText(a + b + p), 'No proven edge']);
  assert.equal(all.sentence, `Home teams covered ${a.toLocaleString('en-US')} times and road teams ${b.toLocaleString('en-US')} since 2002 (${p} pushes).`);
  assert.match(V.shortCard(week, { id: 'team_ats|coach:Sean Payton', team: 'DEN' }, { names: NAMES }).sentence, /^The coach’s teams covered 170 times and their opponents 143 since 2006 \(4 pushes\)\.$/);
  assert.match(V.shortCard(week, { id: 'su|team:SEA+venue:road', team: 'SEA' }, { names: NAMES }).sentence, /^The Seahawks won 101 and lost 104 since 2002 \(1 tie\)\.$/);
  assert.equal(V.recordText(8, 3), '8–3');
  assert.equal(V.sampleText(11), '11 games');
  assert.equal(V.sampleText(1), '1 game');
  assert.equal(V.recordText(3087, 3217, 170), '3,087–3,217–170');
  assert.equal(V.shortCard(week, { card: 'nope' }), null);
});

test('a locked line trend carries no title, record, sample size or number at all', () => {
  for (const ref of [{ card: 'fav_ats|g:g_altitude' }, { card: 'team_ats|t:t_mkt_down3+role:dog', team: 'DEN' }, { id: 'team_ats|team:SEA+role:fav', team: 'SEA' }, { card: 'fav_ats|g:g_fav_tt_ge28+g:g_indoor' }]) {
    const locked = V.shortCard(week, ref, { access: CLOSED, names: NAMES });
    assert.deepEqual(Object.keys(locked).sort(), ['gate', 'key', 'kind', 'locked', 'strength', 'title']);
    assert.equal(locked.locked, true);
    assert.equal(locked.title, V.LINE_TREND_TITLE);
    assert.doesNotMatch(locked.title, /\d/);
  }
  // "both" needs both markets open.
  assert.equal(V.shortCard(week, { card: 'fav_ats|g:g_fav_tt_ge28+g:g_indoor' }, { access: { spread: true, total: false } }).locked, true);
  assert.equal(V.shortCard(week, { card: 'fav_ats|g:g_fav_tt_ge28+g:g_indoor' }, { access: OPEN }).locked, false);
});

test('the top three per game, strongest first as the engine defines it: the tier, then the quality score', () => {
  const top = id => V.gameTrends(week, id, { access: CLOSED, names: NAMES }).top;
  assert.deepEqual(top('NO-NYG').map(c => c.key), ['team_ats|t:t_ats_season_hot@NYG', 'total_rev|g:g_totrev@', 'team_ats|t:t_after_ot+role:home@NYG']);
  const scores = top('NO-NYG').map(c => c.strength);
  assert.deepEqual(scores, [[1, -44.3], [2, -37.1], [2, -36.9]]);
  assert.deepEqual(top('CAR-PHI').map(c => c.key), ['team_ats|t:t_ats_season_cold@PHI', 'total_rev|g:g_totrev@']);
  // Every game: at most three, sorted, never a Tier 1 or weather card (they need observed weather), never a pending card.
  for (const g of week.games) {
    const { top: t, all } = V.gameTrends(week, g.id, { access: OPEN, saved: { spread: -3, total: 44 }, names: NAMES });
    assert.ok(t.length <= 3 && t.every((c, i) => i === 0 || c.strength[0] > t[i - 1].strength[0] || (c.strength[0] === t[i - 1].strength[0] && c.strength[1] >= t[i - 1].strength[1])), g.id);
    assert.deepEqual(t, all.slice(0, 3));
    assert.ok(all.every(c => !['total|g:g_wind10', 'total|g:g_wind15'].includes(c.id)), `${g.id}: no weather card`);
    assert.ok(all.every(c => !(g.pendingCards || []).some(p => p.card === c.id && (p.team || null) === c.team)), `${g.id}: no pending card`);
    // A line card whose fit this screen cannot tell (the market re-rating needs earlier lines) never claims a place.
    assert.ok(all.every(c => c.id !== 'team_ats|t:t_mkt_down3+role:dog'), `${g.id}: no line card of unknown fit`);
  }
  // A line card joins only once its market is open and the viewer's own saved line shows it fits: an indoor game with a big
  // favorite team total fits at −7 and 52 ((52 + 7) / 2 = 29.5), not at −3 and 44.
  const fits = V.gameTrends(week, 'BUF-LV', { access: OPEN, saved: { spread: 7, total: 52 }, names: NAMES }).all.map(c => c.id);
  assert.ok(fits.includes('fav_ats|g:g_fav_tt_ge28+g:g_indoor'));
  assert.ok(!V.gameTrends(week, 'BUF-LV', { access: OPEN, saved: { spread: 3, total: 44 }, names: NAMES }).all.some(c => c.id === 'fav_ats|g:g_fav_tt_ge28+g:g_indoor'));
  assert.ok(!V.gameTrends(week, 'BUF-LV', { access: CLOSED, saved: { spread: 7, total: 52 }, names: NAMES }).all.some(c => c.id === 'fav_ats|g:g_fav_tt_ge28+g:g_indoor'), 'never while closed');
  // The favorite-or-underdog card stays in its place, locked, while the Spread is closed.
  assert.deepEqual(V.gameTrends(week, 'SEA-DEN', { access: CLOSED }).top.map(c => [c.locked, c.gate]), [[true, 'spread']]);
  assert.deepEqual(V.gameTrends(week, 'nope'), { game: null, all: [], top: [] });
});

test('Week 6 board trends: at most three, Consistent-not-proven or stronger, most games, then kickoff; none that needs a line', () => {
  assert.deepEqual(V.boardTrends(week, { names: NAMES }), [
    { gameId: 'NO-NYG', text: 'Teams in the Saints’ spot covered 54% since 2002', tier: 'Not proven', key: 'team_ats|t:t_ats_season_hot@NYG' },
    { gameId: 'WAS-SF', text: 'Teams in the Commanders’ spot covered 54% since 2002', tier: 'Not proven', key: 'team_ats|t:t_ats_season_hot@SF' },
    { gameId: 'HOU-JAX', text: 'Teams in the Texans’ spot covered 55% since 2002', tier: 'Not proven', key: 'team_ats|t:t_ats_season_cold@HOU' },
  ]);
  assert.deepEqual(V.boardTrends(week, { names: NAMES, eligible: ['SEA-DEN', 'CAR-PHI', 'LAC-KC', 'DAL-GB'] }).map(t => t.gameId), ['CAR-PHI', 'LAC-KC', 'DAL-GB']);
  assert.deepEqual(V.boardTrends(week, { eligible: ['SEA-DEN', 'BUF-LV', 'ARI-LAR', 'BAL-CLE', 'NYJ-NE'] }), [], 'watch-list, line and pending trends never reach the board');
  assert.deepEqual(V.boardTrends(null), []);
});

test('All trends: team, situational, line, weather and referee groups; every item with its record and sample size; locks show no numbers', () => {
  const closed = V.allTrends(week, 'SEA-DEN', { access: CLOSED, names: NAMES });
  assert.deepEqual(closed.groups.map(g => g.key), ['team', 'situational', 'line', 'weather', 'referee']);
  const by = Object.fromEntries(closed.groups.map(g => [g.key, g]));
  assert.ok(by.team.items.length >= 10 && by.team.meetings.length === 1);
  for (const item of [...by.team.items, ...by.situational.items, ...by.weather.items].filter(i => !i.locked)) {
    assert.match(item.record, /^[\d,]+–[\d,]+(–[\d,]+)?$/, item.key);
    assert.match(item.sample, /^[\d,]+ games?$/, item.key);
    assert.ok(item.sentence && item.title, item.key);
  }
  assert.deepEqual(by.line.items, [], 'nothing line-based while both markets are closed');
  assert.deepEqual(by.line.locks, ['spread', 'total']);
  assert.ok(by.situational.items[0].locked, 'the underdog card keeps its place, locked');
  assert.deepEqual(by.weather.items.map(i => i.id), ['total|g:g_wind10', 'total|g:g_wind15']);
  assert.deepEqual(by.weather.items[0].notes, ['Applies only if kickoff wind is 10+ mph; no current forecast for this game']);
  assert.deepEqual(by.referee.notes, ['Referee not assigned yet. Crews are announced during game week, and the commissioner enters them.']);
  // Open, with the viewer's own saved lines: the line rows that fit are marked, and the band of his own total joins.
  const open = Object.fromEntries(V.allTrends(week, 'SEA-DEN', { access: OPEN, saved: { spread: -3, total: 44 }, names: NAMES, referee: { name: 'Shawn Hochuli' } }).groups.map(g => [g.key, g]));
  assert.deepEqual(open.line.locks, []);
  assert.ok(open.line.items.some(i => i.id === 'team_ats|team:DEN+role:fav' && i.fits === true));
  assert.ok(open.line.items.some(i => i.id === 'team_ats|team:SEA+role:fav' && i.fits === false));
  assert.ok(open.line.items.some(i => i.id === 'total|g:g_t_44_465' && i.fits === true));
  assert.ok(!open.line.items.some(i => ['total|g:g_t_le37', 'total|g:g_t_51p', 'home_ats|g:g_home_fav_7p'].includes(i.id)), 'only the bands that hold his own saved lines');
  assert.equal(open.referee.name, 'Shawn Hochuli');
  assert.ok(open.referee.items.length >= 3 && open.referee.items.every(i => /^Shawn Hochuli: /.test(i.title) && /games?$/.test(i.sample)));
  // A dome says the wind records do not apply indoors.
  assert.ok(V.allTrends(week, 'BUF-LV', { access: CLOSED }).groups.find(g => g.key === 'weather').notes.includes(V.WIND_COPY.indoor));
  // A game with an earlier game still to be scored says so.
  assert.match(V.allTrends(week, 'ARI-LAR', { access: CLOSED }).groups.find(g => g.key === 'situational').notes[0], /^LAR has an earlier game without a final score/);
  assert.deepEqual(V.allTrends(week, 'nope'), { game: null, groups: [] });
});

test('the short cards pass the copy guard on every Week 6 game and both markets open or closed', () => {
  const words = [];
  for (const g of week.games) for (const access of [CLOSED, OPEN]) {
    const all = V.allTrends(week, g.id, { access, saved: { spread: -3, total: 44 }, names: NAMES, referee: { name: 'Shawn Hochuli' } });
    for (const group of all.groups) for (const item of group.items) if (!item.locked) words.push(item.title, item.sentence, item.tierLabel, ...(item.notes || []));
    for (const card of V.gameTrends(week, g.id, { access, names: NAMES }).all) if (!card.locked) words.push(card.title, card.sentence, card.tierLabel);
  }
  words.push(...V.boardTrends(week, { names: NAMES }).map(t => `${t.text} · ${t.tier}`), ...Object.values(V.TIER_WORDS), V.TRENDS_FOOTNOTE, V.LINE_TREND_TITLE);
  const names = new Set([...week.refereeOptions, ...week.games.flatMap(g => [...Object.values(g.entities.qbs), ...Object.values(g.entities.coaches)].map(e => e.name))]);
  const strip = value => [...names].reduce((out, name) => out.split(name).join(' '), value);
  assert.deepEqual(T.bannedCopy(strip(words.join('\n'))), []);
  assert.ok(words.every(w => typeof w === 'string' && w.length > 0 && !/undefined|NaN|null/.test(w)));
});

test('strength puts the tier before the score: a Tier 2 card outranks a higher-scoring watch-list card', () => {
  const fake = {
    season: 2026,
    cards: {
      'total|g:a': { id: 'total|g:a', title: 'Tier two', market: 'total', sideRule: 'A', tier: 2, watch: false, score: { score: 41 }, record: { W: 8, L: 3, P: 0 }, years: [2002, 2025] },
      'total|g:b': { id: 'total|g:b', title: 'Watch list', market: 'total', sideRule: 'B', tier: 3, watch: true, score: { score: 60 }, record: { W: 30, L: 20, P: 1 }, years: [2002, 2025] },
      'total|g:c': { id: 'total|g:c', title: 'Tier two, lower', market: 'total', sideRule: 'A', tier: 2, watch: false, score: { score: 40.5 }, record: { W: 5, L: 4, P: 0 }, years: [2002, 2025] },
      'total|g:d': { id: 'total|g:d', title: 'Watch list, lower', market: 'total', sideRule: 'B', tier: 3, watch: true, score: { score: 20 }, record: { W: 9, L: 8, P: 0 }, years: [2002, 2025] },
    },
    rows: {},
    games: [{ id: 'AAA-BBB', away: 'AAA', home: 'BBB', kickoff: '2026-10-18T17:00:00Z', tier2: [{ card: 'total|g:c' }, { card: 'total|g:a' }], watch: [{ card: 'total|g:d' }, { card: 'total|g:b' }], gatedCards: {} }],
  };
  const { top, all } = V.gameTrends(fake, 'AAA-BBB', { access: CLOSED });
  assert.equal(all.length, 4);
  assert.equal(top.length, 3, 'three at most');
  assert.deepEqual(top.map(c => [c.title, c.record, c.sample]), [['Tier two', '8–3', '11 games'], ['Tier two, lower', '5–4', '9 games'], ['Watch list', '30–20–1', '51 games']]);
  assert.deepEqual(top.map(c => c.strength), [[1, -41], [1, -40.5], [2, -60]]);
  assert.equal(top[0].sentence, 'The Over hit 8 times and missed 3 in games like this since 2002.');
});
