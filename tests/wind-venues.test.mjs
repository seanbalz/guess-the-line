// The kickoff wind forecast's stadium mirror (D-34) against the venue table, the 2026 season file and
// every committed week file. Coordinates sent to Open-Meteo only ever come from shared/wind-venues.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SEASONS, WIND_STADIUMS, venueFor, windVenue } from '../shared/wind-venues.mjs';
import { parseCsvRows } from '../shared/trends.mjs';
import { appCode } from '../shared/nfl-schedule.mjs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const venues = JSON.parse(read('shared/nfl-venues.json'));
const corrections = JSON.parse(read('shared/trends-corrections.json'));
const FIELDS = ['name', 'city', 'country', 'lat', 'lon', 'tz', 'type'];

test('every mirrored stadium equals the venue table in name, city, country, lat, lon, tz and type', () => {
  for (const [id, stadium] of Object.entries(WIND_STADIUMS)) {
    assert.ok(venues.stadiums[id], id);
    assert.deepEqual(Object.fromEntries(FIELDS.map(k => [k, stadium[k]])), Object.fromEntries(FIELDS.map(k => [k, venues.stadiums[id][k]])), id);
  }
});

test('the 2026 homes equal the venue table\'s teams through app codes (nflverse LA is LAR)', () => {
  const expected = Object.fromEntries(Object.entries(venues.teams).map(([team, info]) => [appCode(team), info.homes.find(h => h.from <= 2026 && h.to >= 2026).stadium]));
  assert.deepEqual({ ...SEASONS[2026].homes }, expected);
  assert.equal(Object.keys(expected).length, 32);
  assert.equal(SEASONS[2026].homes.LAR, 'LAX01');
  assert.equal(SEASONS[2026].homes.LAC, 'LAX01');
  for (const stadium of Object.values(expected)) assert.ok(WIND_STADIUMS[stadium], stadium);
});

test('the neutral sites equal the 2026 season file (location Neutral) with venueOverrides applied, and every other game is at the home team\'s stadium', () => {
  const { rows } = parseCsvRows(read('shared/trends/season-2026.csv'));
  const neutral = {};
  for (const row of rows) {
    const id = `${appCode(row.away_team)}-${appCode(row.home_team)}`, stadium = corrections.venueOverrides[row.game_id]?.stadium ?? row.stadium_id;
    if (row.location === 'Neutral') neutral[`${Number(row.week)}:${id}`] = stadium;
    else assert.equal(stadium, SEASONS[2026].homes[appCode(row.home_team)], row.game_id);
    assert.equal(venueFor(2026, Number(row.week), id)?.id, stadium, row.game_id);
  }
  assert.deepEqual({ ...SEASONS[2026].neutral }, neutral);
  assert.equal(neutral['5:PHI-JAX'], 'LON02', 'the PHI-JAX override (the file carries the Jacksonville stadium id)');
  assert.equal(rows.length, 272);
});

test('every committed week file agrees: venueFor(season, week, game) is the game\'s stadium, with the same type', () => {
  const files = fs.readdirSync(new URL('../shared/trends/', import.meta.url)).filter(f => /^\d{4}-week-\d{2}\.json$/.test(f));
  assert.ok(files.length >= 1);
  for (const file of files) {
    const week = JSON.parse(read(`shared/trends/${file}`));
    for (const game of week.games) {
      const venue = venueFor(week.season, week.week, game.id);
      assert.equal(venue?.id, game.flags.stadium.id, `${file} ${game.id}`);
      assert.equal(venue.type, game.flags.stadium.type, `${file} ${game.id}`);
      assert.equal(venue.international, game.flags.international, `${file} ${game.id}`);
    }
  }
});

test('domes and canopies are never fetched; retractable roofs are kept; international sites use their own coordinates', () => {
  for (const [week, id] of [[6, 'ARI-LAR'], [6, 'BUF-LV'], [10, 'NE-DET']]) {
    const venue = venueFor(2026, week, id);
    if (id === 'NE-DET') { assert.equal(venue.id, 'MUN01'); assert.equal(windVenue(venue), true, 'Munich is open-air, not the Detroit dome'); continue; }
    assert.equal(windVenue(venue), false, id);
  }
  assert.equal(venueFor(2026, 6, 'ARI-LAR').id, 'LAX01');
  assert.equal(venueFor(2026, 6, 'BUF-LV').id, 'VEG00');
  for (const [week, id, stadium] of [[6, 'CHI-ATL', 'ATL97'], [6, 'TEN-IND', 'IND00'], [9, 'CIN-ATL', 'MAD01']]) {
    const venue = venueFor(2026, week, id);
    assert.deepEqual([venue.id, venue.type, windVenue(venue)], [stadium, 'retractable', true], id);
  }
  for (const [week, id, stadium] of [[6, 'HOU-JAX', 'LON00'], [5, 'PHI-JAX', 'LON02'], [1, 'SF-LAR', 'MEL00'], [11, 'MIN-SF', 'MEX00'], [10, 'NE-DET', 'MUN01'], [7, 'PIT-NO', 'PAR00'], [3, 'BAL-DAL', 'RIO00']]) {
    const venue = venueFor(2026, week, id);
    assert.equal(venue.id, stadium, id);
    assert.deepEqual([venue.lat, venue.lon], [venues.stadiums[stadium].lat, venues.stadiums[stadium].lon], id);
    assert.equal(venue.international && venue.neutral, true, id);
  }
  assert.equal(venueFor(2026, 7, 'HOU-JAX').id, 'JAX00', 'only Week 6 HOU-JAX is in London');
});

test('unknown seasons, weeks, teams and malformed ids return null', () => {
  for (const args of [[2025, 6, 'SEA-DEN'], [2027, 1, 'SEA-DEN'], [2026, 0, 'SEA-DEN'], [2026, 26, 'SEA-DEN'], [2026, 6, 'XXX-DEN'], [2026, 6, 'SEA-XXX'],
    [2026, 6, 'sea-den'], [2026, 6, null], ['2026', 6, 'SEA-DEN'], [2026, 6.5, 'SEA-DEN']]) {
    assert.equal(venueFor(...args), null, JSON.stringify(args));
  }
  assert.equal(windVenue(null), false);
});
