import test from 'node:test';
import assert from 'node:assert/strict';
import { T, build, corrections, row, studyCorrections, venues } from './trends-fixture.mjs';

const MILES_PER_DEGREE = (2 * Math.PI * 3958.8) / 360;
const stadium = (lat, extra = {}) => ({ name: 'Test', city: 'Test', country: 'USA', lat, lon: -80, tz: 'America/New_York', stdOffset: -5, altitudeFt: 10, type: 'outdoor', ...extra });
const synthVenues = {
  stadiums: {
    S00: stadium(30), S499: stadium(30 + 499.9 / MILES_PER_DEGREE), S500: stadium(30 + 500.1 / MILES_PER_DEGREE),
    S1499: stadium(30 + 1499.9 / MILES_PER_DEGREE), S1500: stadium(30 + 1500.1 / MILES_PER_DEGREE), S2000: stadium(30 + 2000.1 / MILES_PER_DEGREE),
    DOME: stadium(31, { type: 'dome' }), RETR: stadium(32, { type: 'retractable' }),
  },
  teams: venues.teams,
};
const synth = (rows, corr = corrections) => {
  const games = T.buildFeatures(T.normalizeRows(rows.map(row), { corrections: corr, venues: synthVenues }), { venues: synthVenues, corrections: corr });
  return new Map(games.map(g => [g.id, g]));
};
const real = build();

test('kickoff windows, days, Thanksgiving and Christmas', () => {
  const k = (id, gametime, gameday, weekday, extra = {}) => ({ game_id: id, season: 2020, week: 3, gameday, weekday, gametime, away_team: 'BUF', home_team: 'MIA', stadium_id: 'S00', ...extra });
  const g = synth([
    k('a', '11:59', '2020-09-27', 'Sunday'), k('b', '12:00', '2020-09-27', 'Sunday'), k('c', '14:59', '2020-09-27', 'Sunday'),
    k('d', '15:00', '2020-09-27', 'Sunday'), k('e', '18:59', '2020-09-27', 'Sunday'), k('f', '19:00', '2020-09-27', 'Sunday'),
    k('g', '20:15', '2020-10-01', 'Thursday'), k('h', '20:15', '2020-10-05', 'Monday'), k('i', '16:30', '2020-12-19', 'Saturday'),
    k('j', '12:30', '2020-11-26', 'Thursday'), k('k', '12:30', '2020-11-19', 'Thursday'), k('l', '16:30', '2020-12-25', 'Friday'),
    k('m', '20:15', '2021-01-10', 'Sunday', { game_type: 'WC', week: 18 }),
  ]);
  const at = (id, atom) => g.get(id).gf[atom];
  assert.equal(at('a', 'g_morning'), true); assert.equal(at('a', 'g_early'), false);
  assert.equal(at('b', 'g_early'), true); assert.equal(at('c', 'g_early'), true);
  assert.equal(at('d', 'g_late'), true); assert.equal(at('e', 'g_late'), true); assert.equal(at('e', 'g_prime'), false);
  assert.equal(at('f', 'g_prime'), true); assert.equal(at('f', 'g_snf'), true);
  assert.equal(at('g', 'g_thu'), true); assert.equal(at('g', 'g_thu_night'), true);
  assert.equal(at('h', 'g_mnf'), true); assert.equal(at('i', 'g_sat'), true);
  assert.equal(at('j', 'g_thanksgiving'), true); assert.equal(at('k', 'g_thanksgiving'), false);
  assert.equal(at('l', 'g_christmas'), true);
  assert.equal(at('m', 'g_thu'), false); assert.equal(at('m', 'g_post'), true); assert.equal(at('m', 'g_wildcard'), true);
  assert.equal(at('m', 'g_dec'), true, 'January counts as December or later');
});

test('spread bands, key numbers, hooks and total bands at their boundaries', () => {
  const s = (id, spread, total) => ({ game_id: id, season: 2019, week: 2, gameday: '2019-09-15', away_team: 'BUF', home_team: 'MIA', stadium_id: 'S00', spread_line: spread, total_line: total });
  const sp = [1, 1.5, 2.5, 3, 3.5, 6.5, 7, 7.5, 9.5, 10, 13.5, 14, -1, -3, -3.5, -7];
  const tt = [37, 37.5, 40.5, 41, 43.5, 44, 46.5, 47, 49, 50.5, 51, 54];
  const g = synth([...sp.map((x, i) => s(`s${i}`, x, 44)), ...tt.map((x, i) => s(`t${i}`, 3, x))]);
  const on = x => Object.entries(g.get(`s${sp.indexOf(x)}`).gf).filter(([k, v]) => v === true && /^g_(s_|home_fav|road_fav|pickem)/.test(k)).map(([k]) => k).sort();
  assert.deepEqual(on(1), ['g_home_fav', 'g_home_fav_1_3', 'g_pickem']);
  assert.deepEqual(on(1.5), ['g_home_fav', 'g_home_fav_1_3', 'g_s_15_25']);
  assert.deepEqual(on(2.5), ['g_home_fav', 'g_home_fav_1_3', 'g_s_15_25', 'g_s_hook_below']);
  assert.deepEqual(on(3), ['g_home_fav', 'g_home_fav_1_3', 'g_s_3', 'g_s_key']);
  assert.deepEqual(on(3.5), ['g_home_fav', 'g_home_fav_35_65', 'g_s_35_65', 'g_s_hook_above']);
  assert.deepEqual(on(6.5), ['g_home_fav', 'g_home_fav_35_65', 'g_s_35_65', 'g_s_hook_below']);
  assert.deepEqual(on(7), ['g_home_fav', 'g_home_fav_7p', 'g_s_7', 'g_s_key']);
  assert.deepEqual(on(7.5), ['g_home_fav', 'g_home_fav_7p', 'g_s_75_95', 'g_s_hook_above']);
  assert.deepEqual(on(9.5), ['g_home_fav', 'g_home_fav_7p', 'g_s_75_95', 'g_s_hook_below']);
  assert.deepEqual(on(10), ['g_home_fav', 'g_home_fav_7p', 'g_s_10_135', 'g_s_10p', 'g_s_key']);
  assert.deepEqual(on(13.5), ['g_home_fav', 'g_home_fav_7p', 'g_s_10_135', 'g_s_10p', 'g_s_hook_below']);
  assert.deepEqual(on(14), ['g_home_fav', 'g_home_fav_7p', 'g_s_10p', 'g_s_14p', 'g_s_key']);
  assert.deepEqual(on(-1), ['g_pickem', 'g_road_fav', 'g_road_fav_1_3']);
  assert.deepEqual(on(-3.5), ['g_road_fav', 'g_road_fav_35_65', 'g_s_35_65', 'g_s_hook_above']);
  assert.deepEqual(on(-7), ['g_road_fav', 'g_road_fav_7p', 'g_s_7', 'g_s_key']);
  const ton = x => Object.entries(g.get(`t${tt.indexOf(x)}`).gf).filter(([k, v]) => v === true && /^g_t_/.test(k)).map(([k]) => k).sort();
  assert.deepEqual(ton(37), ['g_t_key37', 'g_t_le37']);
  assert.deepEqual(ton(37.5), ['g_t_375_405', 'g_t_hook']);
  assert.deepEqual(ton(40.5), ['g_t_375_405', 'g_t_hook']);
  assert.deepEqual(ton(41), ['g_t_41_435', 'g_t_key41']);
  assert.deepEqual(ton(43.5), ['g_t_41_435', 'g_t_hook']);
  assert.deepEqual(ton(44), ['g_t_44_465', 'g_t_key44']);
  assert.deepEqual(ton(46.5), ['g_t_44_465', 'g_t_hook']);
  assert.deepEqual(ton(47), ['g_t_47_505', 'g_t_key47']);
  assert.deepEqual(ton(49), ['g_t_47_505', 'g_t_49p']);
  assert.deepEqual(ton(50.5), ['g_t_47_505', 'g_t_49p', 'g_t_hook']);
  assert.deepEqual(ton(51), ['g_t_49p', 'g_t_51p', 'g_t_key51']);
  assert.deepEqual(ton(54), ['g_t_49p', 'g_t_51p', 'g_t_54p']);
});

test('implied team totals and hidden lines read as unknown, never as false', () => {
  const g = synth([
    { game_id: 'a', season: 2019, week: 2, gameday: '2019-09-15', away_team: 'BUF', home_team: 'MIA', stadium_id: 'DOME', spread_line: 7, total_line: 49 },
    { game_id: 'b', season: 2019, week: 2, gameday: '2019-09-15', away_team: 'NE', home_team: 'NYJ', stadium_id: 'DOME', spread_line: -7, total_line: 48.5 },
    { game_id: 'c', season: 2019, week: 2, gameday: '2019-09-15', away_team: 'DAL', home_team: 'PHI', stadium_id: 'RETR', roof: '' },
  ]);
  assert.equal(g.get('a').gf.g_fav_tt_ge28, true); // (49 + 7) / 2 = 28
  assert.equal(g.get('b').gf.g_fav_tt_ge28, false); // 27.75
  assert.equal(g.get('b').gf.g_dog_tt_le17, false); // (48.5 - 7) / 2 = 20.75
  const c = g.get('c');
  for (const a of ['g_home_fav', 'g_s_3', 'g_t_le37', 'g_fav_tt_ge28']) assert.equal(c.gf[a], null, a);
  assert.equal(c.gf.g_indoor, null, 'blank retractable roof is unknown');
  assert.equal(c.gf.g_wind10, null);
  assert.equal(T.atomValue('role:dog', c, 0), null);
});

test('travel distance bands at 500, 1,500 and 2,000 miles and same-stadium rivals', () => {
  const t = (week, home, sid) => ({ season: 2018, week, gameday: `2018-09-${String(8 + week).padStart(2, '0')}`, away_team: 'MIA', home_team: home, stadium_id: sid });
  const g = synth([{ season: 2018, week: 1, gameday: '2018-09-09', away_team: 'CLE', home_team: 'MIA', stadium_id: 'S00' },
    t(2, 'BUF', 'S499'), t(3, 'NE', 'S500'), t(4, 'NYJ', 'S1499'), t(5, 'BAL', 'S1500'), t(6, 'CIN', 'S2000')]);
  const away = id => g.get(id).tf[1];
  const miles = id => g.get(id).meta.dist[1];
  assert.equal(miles('2018_02_MIA_BUF'), 500);
  assert.equal(away('2018_02_MIA_BUF').t_trip_short, true);
  assert.equal(away('2018_03_MIA_NE').t_trip_short, false); assert.equal(away('2018_03_MIA_NE').t_trip_mid, true);
  assert.equal(away('2018_04_MIA_NYJ').t_trip_mid, true); assert.equal(away('2018_04_MIA_NYJ').t_trip_long, false);
  assert.equal(away('2018_05_MIA_BAL').t_trip_long, true); assert.equal(away('2018_05_MIA_BAL').t_trip_xc, false);
  assert.equal(away('2018_06_MIA_CIN').t_trip_xc, true);
  assert.equal(away('2018_06_MIA_CIN').t_tz2, false, 'same zone');
  const sea = venues.stadiums.SEA00, mia = venues.stadiums.MIA00;
  assert.ok(Math.abs(T.haversineMiles(sea, mia) - 2730) / 2730 < 0.01);
  const rivals = real.fg.find(x => x.homeFr === 'NYJ' && x.awayFr === 'NYG' && x.stadiumId === 'NYC01' && x.played);
  assert.equal(rivals.meta.dist[1], 0);
  assert.equal(rivals.tf[1].t_road, false, 'the Giants at MetLife are not traveling');
});

test('time zones use the game-date offset (Arizona, London) and west-coast early includes the Central zone', () => {
  const g = real.byId;
  const phl = g.get('2026_05_PHI_JAX'); // London, October: EDT -4 to BST +1
  assert.equal(phl.meta.tz[1], 5);
  assert.equal(g.get('2026_06_HOU_JAX').meta.tz[1], 6, 'Houston CDT -5 to London BST +1');
  const atAri = (pred, monthOk) => real.fg.find(x => x.homeFr === 'ARI' && x.stadiumId === 'PHO00' && x.played && pred(x.awayFr) && monthOk(x.month));
  const pacific = atAri(fr => ['SF', 'SEA', 'LA', 'LAC', 'LV'].includes(fr), m => m === 10);
  const pacificWinter = atAri(fr => ['SF', 'SEA', 'LA', 'LAC', 'LV'].includes(fr), m => m === 12);
  const eastern = atAri(fr => ['NYG', 'PHI', 'WAS', 'NYJ', 'NE', 'MIA'].includes(fr), m => m === 10);
  assert.equal(pacific.meta.tz[1], 0, `${pacific.id}: PDT and Arizona are both UTC-7`);
  assert.equal(pacificWinter.meta.tz[1], 1, `${pacificWinter.id}: PST -8 to MST -7`);
  assert.equal(eastern.meta.tz[1], -3, `${eastern.id}: EDT -4 to MST -7`);
  const studyGames = build(studyCorrections, { withSeason: false }).byId;
  assert.equal(studyGames.get(pacific.id).meta.tz[1], 1, 'the study used standard offsets');
  const westAtChicago = real.fg.find(x => x.homeFr === 'CHI' && ['SEA', 'SF'].includes(x.awayFr) && x.kick === 13 && x.played);
  assert.equal(westAtChicago.tf[1].t_west_early, true, westAtChicago.id);
  assert.equal(studyGames.get(westAtChicago.id).tf[1].t_west_early, false);
});

test('a second straight game abroad is measured from the previous venue', () => {
  const g = real.byId.get('2026_06_HOU_JAX');
  assert.ok(g.meta.dist[0] < 50, `JAX stayed in London: ${g.meta.dist[0]} miles`);
  assert.equal(g.tf[0].t_2nd_intl, true);
  assert.equal(g.tf[0].t_road, false);
  assert.ok(g.meta.dist[1] > 4500);
  assert.equal(g.tf[1].t_road, true);
});

test('rest: Week 1 has none, short week, Thursday after Sunday, bye (regular season only), mini-bye, rest edge, after a weeknight game', () => {
  const r = (week, gameday, weekday, away, home, sid, extra = {}) => ({ season: 2021, week, gameday, weekday, away_team: away, home_team: home, stadium_id: sid, away_score: 20, home_score: 17, ...extra });
  const g = synth([
    r(1, '2021-09-12', 'Sunday', 'DAL', 'PHI', 'S499'), r(1, '2021-09-12', 'Sunday', 'NYG', 'WAS', 'S500'),
    r(2, '2021-09-16', 'Thursday', 'NYG', 'DAL', 'S00'), r(2, '2021-09-19', 'Sunday', 'WAS', 'PHI', 'S499'),
    r(3, '2021-09-27', 'Monday', 'PHI', 'WAS', 'S500'),
    r(4, '2021-10-03', 'Sunday', 'DAL', 'WAS', 'S500'),
    r(5, '2021-10-12', 'Tuesday', 'PHI', 'DAL', 'S00'),
    r(6, '2021-10-17', 'Sunday', 'DAL', 'NYG', 'S1499'),
    r(18, '2022-01-02', 'Sunday', 'DAL', 'PHI', 'S499'),
    r(19, '2022-01-16', 'Sunday', 'NYG', 'DAL', 'S00', { game_type: 'WC' }),
  ]);
  const home = id => g.get(id), side = (id, s) => g.get(id).tf[s];
  assert.deepEqual(home('2021_01_DAL_PHI').meta.rest, [null, null]);
  assert.equal(side('2021_01_DAL_PHI', 1).t_rest_adv3, false);
  assert.equal(home('2021_02_NYG_DAL').meta.rest[0], 4);
  assert.equal(side('2021_02_NYG_DAL', 0).t_short_week, true);
  assert.equal(side('2021_02_NYG_DAL', 0).t_thu_after_sun, true);
  assert.equal(home('2021_04_DAL_WAS').meta.rest[1], 17);
  assert.equal(side('2021_04_DAL_WAS', 1).t_off_bye, true);
  assert.equal(side('2021_04_DAL_WAS', 1).t_rest_adv3, true, 'DAL 17 days vs WAS 6');
  assert.equal(side('2021_04_DAL_WAS', 0).t_after_mnf, true, 'WAS played Monday');
  assert.equal(home('2021_05_PHI_DAL').meta.rest[0], 9);
  assert.equal(side('2021_05_PHI_DAL', 0).t_mini_bye, true);
  assert.equal(side('2021_06_DAL_NYG', 1).t_after_mnf, true, 'a Tuesday game counts as after a weeknight game');
  assert.equal(side('2021_06_DAL_NYG', 1).t_short_week, true);
  assert.equal(home('2021_19_NYG_DAL').meta.rest[0], 14);
  assert.equal(side('2021_19_NYG_DAL', 0).t_off_bye, false, 'a playoff seeding bye is not an off-a-bye trend');
  assert.equal(home('2021_06_DAL_NYG').meta.leagueMu, 21, 'league average defaults to 21 until 100 scores');
});

test('previous game: upset loss as a 7-point favorite, blowout, cover and big miss', () => {
  const g = synth([
    { season: 2022, week: 1, gameday: '2022-09-11', away_team: 'DEN', home_team: 'KC', stadium_id: 'S00', spread_line: 7, total_line: 44, away_score: 30, home_score: 10 },
    { season: 2022, week: 2, gameday: '2022-09-18', away_team: 'KC', home_team: 'DEN', stadium_id: 'S2000' },
  ]);
  const [kc, den] = [g.get('2022_02_KC_DEN').tf[1], g.get('2022_02_KC_DEN').tf[0]];
  for (const a of ['t_off_loss', 't_off_blowout_loss', 't_off_upset_loss', 't_off_big_upset_loss', 't_off_no_cover', 't_off_big_miss', 't_off_scored10']) assert.equal(kc[a], true, a);
  for (const a of ['t_off_win', 't_off_blowout_win', 't_off_upset_win', 't_off_big_upset_win', 't_off_cover', 't_off_big_cover']) assert.equal(den[a], true, a);
  assert.equal(kc.t_off_over, false); assert.equal(kc.t_off_under, true, '40 under 44');
});

test('season-to-date ATS form needs 4 games (margin) or 5 decided (rate); both teams fitting drops the game', () => {
  const games = [];
  const lose = (week, team, opp, home) => games.push({ season: 2023, week, gameday: `2023-09-${String(9 + week).padStart(2, '0')}`, away_team: home ? opp : team, home_team: home ? team : opp,
    stadium_id: home ? 'S00' : 'S499', spread_line: home ? 3 : -3, total_line: 44, home_score: home ? 10 : 20, away_score: home ? 20 : 10 });
  for (let w = 1; w <= 5; w++) { lose(w, 'LV', ['KC', 'DEN', 'LAC', 'KC', 'DEN'][w - 1], true); lose(w, 'NYJ', ['MIA', 'NE', 'BUF', 'MIA', 'NE'][w - 1], false); }
  games.push({ season: 2023, week: 6, gameday: '2023-09-15', away_team: 'NYJ', home_team: 'LV', stadium_id: 'S00', spread_line: 1, total_line: 44, home_score: 21, away_score: 20 });
  const g = synth(games);
  assert.equal(g.get('2023_04_KC_LV').tf[0].t_ats_margin_cold, false, '3 games');
  assert.equal(g.get('2023_05_DEN_LV').tf[0].t_ats_margin_cold, true, 'missed by 13 per game over 4 games');
  assert.equal(g.get('2023_05_DEN_LV').tf[0].t_ats_season_cold, false, 'only 4 decided');
  const last = g.get('2023_06_NYJ_LV');
  assert.equal(last.tf[0].t_ats_season_cold, true);
  assert.equal(last.tf[1].t_ats_season_cold, true);
  const units = T.betUnits({ market: 'team_ats', atoms: ['t:t_ats_season_cold'] }, [...g.values()].filter(x => x.played && x.spread !== null));
  assert.equal(units.some(u => u.g.id === '2023_06_NYJ_LV'), false, 'both teams fit: dropped');
  assert.ok(last.meta.totrevX !== undefined, 'totals reversion needs 4+ games each');
});

test('an unplayed earlier game makes prior-result atoms pending, never stale', () => {
  const g = synth([
    { season: 2026, week: 1, gameday: '2026-09-13', away_team: 'BUF', home_team: 'MIA', stadium_id: 'S00', spread_line: -7, total_line: 44, away_score: 10, home_score: 30 },
    { season: 2026, week: 2, gameday: '2026-09-20', away_team: 'BUF', home_team: 'NE', stadium_id: 'S500' },
    { season: 2026, week: 3, gameday: '2026-09-27', away_team: 'NYJ', home_team: 'BUF', stadium_id: 'S499' },
  ]);
  const w3 = g.get('2026_03_NYJ_BUF');
  assert.deepEqual(w3.meta.pending[0], ['2026_02_BUF_NE']);
  assert.equal(w3.tf[0].t_off_big_upset_loss, 'pending', 'BUF lost as a 7-point favorite in Week 1, but Week 2 is not final');
  assert.equal(w3.tf[0].t_road, false, 'schedule facts are not pending');
  assert.equal(w3.tf[1].t_off_win, false);
  assert.equal(w3.gf.g_rematch, 'pending');
  assert.equal(T.atomValue('any:t_good_def', w3), 'pending');
});

test('head to head: revenge inside 400 days, three straight wins inside four years', () => {
  const m = (season, gameday, away, home, as, hs) => ({ season, week: 5, gameday, away_team: away, home_team: home, stadium_id: home === 'GB' ? 'S00' : 'S499', away_score: as, home_score: hs, spread_line: 3, total_line: 44 });
  const g = synth([m(2019, '2019-10-06', 'GB', 'CHI', 24, 10), m(2020, '2020-10-04', 'CHI', 'GB', 10, 31), m(2021, '2021-10-03', 'GB', 'CHI', 27, 13),
    { season: 2022, week: 5, gameday: '2022-11-20', away_team: 'CHI', home_team: 'GB', stadium_id: 'S00' }]);
  const last = g.get('2022_05_CHI_GB');
  assert.equal(last.tf[1].t_revenge, false, 'the last meeting is 413 days earlier');
  assert.equal(last.tf[0].t_h2h_won3, true);
  assert.equal(last.tf[1].t_h2h_won3, false);
  assert.equal(g.get('2021_05_GB_CHI').tf[0].t_revenge, true, 'CHI (home) lost 364 days earlier');
  assert.equal(g.get('2021_05_GB_CHI').tf[1].t_revenge, false);
});

test('conferences and divisions agree with the schedule on every game since 2002', () => {
  for (const g of real.fg) {
    if (g.season < 2002 || g.gameType !== 'REG') continue;
    const same = venues.teams[g.homeFr].division === venues.teams[g.awayFr].division;
    assert.equal(g.div, same, g.id);
  }
  const g = real.byId.get('2026_06_PIT_TB');
  assert.equal(g.gf.g_interconf, true); assert.equal(g.gf.g_interconf_nfc_home, true);
});

test('dome and grass team traits come from the venue table, not from blank game-day values', () => {
  const dal = real.byId.get('2026_06_DAL_GB'), hou = real.byId.get('2026_06_HOU_JAX');
  assert.equal(dal.tf[1].t_dome_team_outdoors, true, 'Dallas (retractable) at Green Bay');
  assert.equal(hou.tf[1].t_dome_team_outdoors, true, 'Houston (retractable) at Wembley');
  const study = build(studyCorrections).byId;
  assert.equal(study.get('2026_06_DAL_GB').tf[1].t_dome_team_outdoors, false, 'the study read blank 2026 roofs as outdoor home stadiums');
});

test('the hand-authored home stadium table matches the schedule for every franchise-season 2002-2026', () => {
  const counts = new Map();
  for (const g of real.fg) {
    if (g.fileNeutral || g.season < 2002) continue;
    const key = `${g.homeFr}|${g.season}`;
    if (!counts.has(key)) counts.set(key, new Map());
    counts.get(key).set(g.stadiumId, (counts.get(key).get(g.stadiumId) ?? 0) + 1);
  }
  for (const [key, c] of counts) {
    const [fr, season] = key.split('|');
    const derived = [...c.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const table = venues.teams[fr].homes.find(h => h.from <= Number(season) && Number(season) <= h.to)?.stadium;
    assert.equal(table, derived, key);
  }
  assert.equal(venues.teams.NO.homes.find(h => h.from === 2005).stadium, 'BRG00');
});
