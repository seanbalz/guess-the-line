import test from 'node:test';
import assert from 'node:assert/strict';
import { T, corrections, historyCsv, read, row, seasonCsv, venues } from './trends-fixture.mjs';

const games = T.normalizeRows([...T.parseCsvRows(historyCsv).rows, ...T.parseCsvRows(seasonCsv).rows], { corrections, venues });
const byId = new Map(games.map(g => [g.id, g]));

test('CSV parsing skips # lines, reads "" and NA as blank and asserts the header', () => {
  const header = T.HISTORY_COLUMNS.join(',');
  const line = T.HISTORY_COLUMNS.map(c => ({ game_id: '2020_01_A_B', surface: '""', temp: 'NA', wind: ' 7 ' }[c] ?? '')).join(',');
  const { rows } = T.parseCsvRows(`# credit line\n# another\n${header}\n${line}\n`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].surface, '');
  assert.equal(rows[0].temp, '');
  assert.equal(rows[0].wind, '7');
  assert.throws(() => T.parseCsvRows('game_id,season\n1,2026'), /missing the game_type column/);
  assert.throws(() => T.parseCsvRows(`${header}\n1,2`), /has 2 cells/);
});

test('the committed history and season files carry attribution and every stadium is in the venue table', () => {
  for (const text of [historyCsv, seasonCsv]) {
    assert.match(text, /^# Data: nflverse; schedules maintained by Lee Sharpe \(CC BY 4\.0\), modified\. License: https:\/\/creativecommons\.org\/licenses\/by\/4\.0\//);
    assert.match(text, /# Source: https:\/\/github\.com\/nflverse\/nflverse-data\/releases\/download\/schedules\/games\.csv/);
    assert.match(text, /# Modified: /);
  }
  assert.equal(T.parseCsvRows(historyCsv).rows.length, 7276);
  for (const g of games) assert.ok(venues.stadiums[g.stadiumId], `${g.id} stadium ${g.stadiumId}`);
});

test('kickoff fixes: 12-hour night games, London 21:30 rows, real late games untouched', () => {
  const mnf = byId.get('2003_01_TB_PHI'); // stored as 09:00 on a Monday at a US venue
  assert.equal(mnf.weekday, 'Monday');
  assert.equal(mnf.kick, 21);
  assert.equal(mnf.kickFixed, true);
  for (const id of ['2017_03_BAL_JAX', '2017_04_NO_MIA', '2017_08_MIN_CLE', '2018_07_TEN_LAC', '2018_08_PHI_JAX']) {
    assert.equal(byId.get(id).kick, 9.5, id);
    assert.equal(byId.get(id).kickFixed, false, id);
  }
  assert.equal(byId.get('2013_05_SD_OAK').kick, 23.5);
  assert.equal(byId.get('2025_04_MIN_PIT').kick, 9.5, 'international morning game is not shifted');
});

test('venue overrides set the real site, derive its roof and blank unverified weather', () => {
  const expect = { '2025_01_KC_LAC': 'SAO00', '2025_04_MIN_PIT': 'DUB00', '2025_05_MIN_CLE': 'LON02', '2025_06_DEN_NYJ': 'LON02',
    '2025_07_LA_JAX': 'LON00', '2025_10_ATL_IND': 'BER00', '2025_11_WAS_MIA': 'MAD01', '2026_05_PHI_JAX': 'LON02' };
  for (const [id, sid] of Object.entries(expect)) {
    const g = byId.get(id);
    assert.equal(g.stadiumId, sid, id);
    assert.equal(g.overridden, true);
    assert.equal(g.venue.country === 'USA', false);
  }
  assert.equal(byId.get('2025_01_KC_LAC').roof, 'outdoors', 'file says dome (SoFi)');
  assert.equal(byId.get('2025_10_ATL_IND').roof, 'outdoors', 'file says closed (Lucas Oil)');
  assert.equal(byId.get('2025_11_WAS_MIA').roof, '', 'Bernabeu has a retractable roof: unknown');
  assert.equal(byId.get('2025_05_MIN_CLE').wind, null, 'Cleveland-labelled wind 14 is not counted');
  assert.equal(byId.get('2025_10_ATL_IND').temp, null);
});

test('2026 international roofs are corrected and a blank retractable roof stays unknown', () => {
  for (const id of ['2026_01_SF_LA', '2026_03_BAL_DAL', '2026_07_PIT_NO', '2026_10_NE_DET']) assert.equal(byId.get(id).roof, 'outdoors', id);
  assert.equal(byId.get('2026_06_CHI_ATL').roof, '');
  assert.equal(byId.get('2026_06_TEN_IND').roof, '');
  assert.equal(byId.get('2026_01_SF_LA').wind, 4, 'a correct international stadium id keeps its weather');
});

test('referee aliases, surface trimming and grouping, franchise and app codes, QB id merges', () => {
  const ref = name => T.normalizeRows([row({ season: 2026, week: 1, gameday: '2026-09-13', away_team: 'OAK', home_team: 'STL', stadium_id: 'STL00', referee: name, surface: 'grass ' })], { corrections, venues })[0];
  for (const [alias, canonical] of Object.entries(corrections.refereeAliases)) assert.equal(ref(alias).referee, canonical);
  assert.equal(Object.keys(corrections.refereeAliases).length, 13);
  assert.equal(ref('Ronald Torbert').referee, 'Ron Torbert');
  const g = ref('Bill Vinovich');
  assert.equal(g.surface, 'grass');
  assert.equal(g.grass, true);
  assert.equal(g.awayFr, 'LV'); assert.equal(g.awayApp, 'LV'); assert.equal(g.away, 'OAK');
  assert.equal(g.homeFr, 'LA'); assert.equal(g.homeApp, 'LAR'); assert.equal(g.home, 'STL');
  assert.equal(byId.get('2003_01_BAL_PIT').grass, true, 'dessograss counts as grass');
  assert.equal(byId.get('2017_17_BUF_MIA').qb[0], '00-0024226', 'Jay Cutler second id merged');
});

test('redaction blanks every line, odds, weather and referee field on unplayed games only', () => {
  const rows = [row({ season: 2026, week: 6, gameday: '2026-10-18', away_team: 'BUF', home_team: 'MIA', stadium_id: 'MIA00', spread_line: '3', total_line: '47.5',
      home_spread_odds: '-110', away_spread_odds: '-110', over_odds: '-110', under_odds: '-110', home_moneyline: '-150', away_moneyline: '130', temp: '80', wind: '9', referee: 'Shawn Smith' }),
    row({ season: 2026, week: 5, gameday: '2026-10-11', away_team: 'BUF', home_team: 'NE', stadium_id: 'BOS00', home_score: '20', away_score: '17', spread_line: '3', total_line: '44', temp: '60', wind: '5', referee: 'Alan Eck' })];
  const [played, unplayed] = T.redactUnplayed(T.normalizeRows(rows, { corrections, venues }));
  assert.equal(unplayed.played, false);
  for (const k of ['spread', 'total', 'oddsHome', 'oddsAway', 'oddsOver', 'oddsUnder', 'mlHome', 'mlAway', 'temp', 'wind', 'referee']) assert.equal(unplayed[k], null, k);
  assert.equal(played.spread, 3); assert.equal(played.referee, 'Alan Eck'); assert.equal(played.wind, 5);
  const csv = T.writeCompactCsv(rows, { redactUnplayed: true });
  const parsed = T.parseCsvRows(csv).rows;
  for (const c of T.REDACTED_COLUMNS) assert.equal(parsed[0][c], '', c);
  assert.equal(parsed[1].spread_line, '3');
  assert.throws(() => T.writeCompactCsv([row({ season: 2026, week: 1, away_team: 'A,B', home_team: 'C' })]), /without quoting/);
});

test('the committed season file never carries an unplayed game\'s line, odds, weather or referee', () => {
  const { rows } = T.parseCsvRows(seasonCsv);
  const unplayed = rows.filter(r => !T.rowPlayed(r));
  assert.ok(unplayed.length >= 14);
  for (const r of unplayed) for (const c of T.REDACTED_COLUMNS) assert.equal(r[c], '', `${r.game_id} ${c}`);
  assert.match(read('shared/trends/season-2026.csv'), /# Unplayed games: lines, odds, moneylines, weather and referee are blank/);
});
