// Weather on every game (D-45): weatherRow and weatherChip in shared/weather-view.mjs, over the committed
// Week 6 trends file and hand-built snapshots in the /wind/read shape. Every roof type, the 120 h horizon,
// stale and final snapshots, missing values, the chip thresholds (14.9/15.0 mph, 49/50%, 32 °F), one chip
// with precipitation over Windy, words only, and purity. No network and no clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as W from '../shared/weather-view.mjs';
import { WIND_ATTRIBUTION } from '../cloud/wind.mjs';
import { WIND_STADIUMS } from '../shared/wind-venues.mjs';
import { bannedCopy } from '../shared/trends.mjs';

const { WEATHER_CHIPS, weatherChip, weatherRow } = W;
const week = JSON.parse(fs.readFileSync(new URL('../shared/trends/2026-week-06.json', import.meta.url), 'utf8'));
const game = id => week.games.find(g => g.id === id);
const H = 3_600_000, MIN = 60_000;
const venue = id => { const { name, city, country, type } = WIND_STADIUMS[id]; return { id, name, city, country, type }; };
const VENUE = { 'SEA-DEN': 'DEN00', 'ARI-LAR': 'LAX01', 'CHI-ATL': 'ATL97', 'BUF-LV': 'VEG00', 'HOU-JAX': 'LON00' };
const kickoff = id => Date.parse(game(id).kickoff);
/** A stored snapshot as /wind/read returns it, fetched `madeH` hours before kickoff. */
const snapshot = (id, madeH, values = {}) => {
  const k = kickoff(id);
  return { windMph: 8, gustMph: 15, directionDeg: 225, temperatureF: 55, precipitationProbability: 10, precipitationIn: 0,
    forecastHour: new Date(Math.floor((k + 30 * MIN) / H) * H).toISOString(), gustHour: new Date(Math.floor(k / H) * H + H).toISOString(),
    fetchedAt: new Date(k - madeH * H).toISOString(), gridLatitude: 39.75, gridLongitude: -105.03, elevationM: 1609, model: 'best_match',
    source: 'Open-Meteo forecast API', sourceUrl: 'https://api.open-meteo.com/v1/forecast?latitude=39.744', ...values };
};
/** The row a day before kickoff with a snapshot made 25 h out (current: under D-47 it falls due at the 12 h checkpoint). */
const row = (id, values = {}, { madeH = 25, leadH = 24, place = venue(VENUE[id]) } = {}) => weatherRow(game(id), place, snapshot(id, madeH, values), kickoff(id) - leadH * H);
const chip = values => weatherChip(row('SEA-DEN', values));

test('D-45 every roof type: open air and retractable show the forecast with the credit; a dome and SoFi\'s canopy say Indoors', () => {
  const credit = { text: WIND_ATTRIBUTION.text, url: WIND_ATTRIBUTION.url, license: WIND_ATTRIBUTION.license, licenseUrl: WIND_ATTRIBUTION.licenseUrl, changes: WIND_ATTRIBUTION.changes };
  const outdoor = row('SEA-DEN', { windMph: 14.2, directionDeg: 247, temperatureF: 49.3, precipitationProbability: 25 });
  assert.deepEqual([outdoor.kind, outdoor.roof, outdoor.note, outdoor.roofNote, outdoor.reason], ['forecast', 'outdoor', null, null, null]);
  assert.deepEqual(outdoor.credit, credit);
  assert.deepEqual(outdoor.venue, { name: 'Empower Field at Mile High', city: 'Denver', country: 'USA' });
  const v = outdoor.values;
  assert.deepEqual([v.windMph, v.gustMph, v.directionDeg, v.direction, v.temperatureF, v.precipitationProbability, v.precipitationIn], [14.2, 15, 247, 'WSW', 49.3, 25, 0]);
  assert.deepEqual([v.kickoff, v.ageMs, v.madeMs, v.final, v.confidence], [game('SEA-DEN').kickoff, H, 25 * H, false, 'Next-day guidance']);
  const roof = row('CHI-ATL');
  assert.deepEqual([roof.kind, roof.roof, roof.note, roof.roofNote], ['forecast', 'retractable', 'Roof may close', 'Roof may close']);
  assert.deepEqual(roof.credit, credit);
  // A dome is Indoors even when a snapshot is passed: no values, no credit, no chip.
  const dome = row('BUF-LV', { windMph: 30, precipitationProbability: 90 });
  assert.deepEqual(dome, { kind: 'indoors', roof: 'dome', note: 'Indoors', roofNote: null, reason: null, venue: { name: 'Allegiant Stadium', city: 'Las Vegas', country: 'USA' }, values: null, credit: null });
  assert.equal(weatherChip(dome), null);
  // SoFi Stadium: a fixed roof over the field, which the week file's nflverse roof and the trend records count as a dome.
  // Indoors (the builder's reading of "domes and closed roofs say Indoors"), never fetched, so never a value or a chip.
  assert.equal(game('ARI-LAR').flags.roof, 'dome');
  const canopy = row('ARI-LAR', { windMph: 30, precipitationProbability: 90 });
  assert.deepEqual(canopy, { kind: 'indoors', roof: 'canopy', note: 'Indoors', roofNote: null, reason: null, venue: { name: 'SoFi Stadium', city: 'Inglewood', country: 'USA' }, values: null, credit: null });
  assert.equal(weatherChip(canopy), null);
  // Without the server's venue the week file's stadium decides the roof.
  assert.deepEqual(['BUF-LV', 'ARI-LAR'].map(id => weatherRow(game(id), null, null, null).kind), ['indoors', 'indoors']);
  assert.deepEqual(['SEA-DEN', 'ARI-LAR', 'CHI-ATL'].map(id => weatherRow(game(id), null, null, null).roof), ['outdoor', 'canopy', 'retractable']);
  assert.deepEqual(W.WEATHER_ROOF_NOTES, { outdoor: null, canopy: 'Indoors', retractable: 'Roof may close', dome: 'Indoors' });
});

test('D-45 closed roofs and unknown venues: a closed retractable roof is Indoors; an unknown venue never claims a roof', () => {
  const closed = { ...game('CHI-ATL'), flags: { ...game('CHI-ATL').flags, roof: 'closed' } };
  const k = kickoff('CHI-ATL');
  assert.deepEqual([weatherRow(closed, venue('ATL97'), snapshot('CHI-ATL', 25), k - 24 * H).kind, weatherRow(closed, venue('ATL97'), null, k).note], ['indoors', 'Indoors']);
  // An outdoor venue is never made indoors by the week file's roof (nflverse once listed open-air sites abroad as domes).
  const listed = { ...game('SEA-DEN'), flags: { ...game('SEA-DEN').flags, roof: 'dome' } };
  assert.equal(weatherRow(listed, venue('DEN00'), snapshot('SEA-DEN', 25), kickoff('SEA-DEN') - 24 * H).kind, 'forecast');
  // No venue at all: the week file's roof can still say a dome; otherwise no claim and no forecast without data.
  const bare = { id: 'XXX-YYY', kickoff: game('SEA-DEN').kickoff };
  assert.deepEqual([weatherRow(bare, null, null, kickoff('SEA-DEN')).kind, weatherRow(bare, null, null, kickoff('SEA-DEN')).roof], ['none', null]);
  assert.equal(weatherRow({ ...bare, flags: { roof: 'dome' } }, null, null, null).kind, 'indoors');
  assert.equal(weatherRow(bare, { type: 'stadium' }, null, null).roof, null, 'an unknown venue type is not a roof');
});

test('D-45 no current forecast: missing, signed out, beyond 120 h, stale, invalid or made after kickoff; never an invented value', () => {
  const k = kickoff('SEA-DEN'), den = venue('DEN00');
  const none = (forecast, now) => { const r = weatherRow(game('SEA-DEN'), den, forecast, now); assert.equal(r.kind, 'none'); assert.equal(r.values, null); assert.equal(r.credit, null); assert.equal(weatherChip(r), null); return [r.note, r.reason]; };
  assert.deepEqual(none(null, k - 24 * H), ['No current forecast', 'unavailable']);
  assert.deepEqual(none(undefined, k - 24 * H), ['No current forecast', 'unavailable']);
  assert.deepEqual(none(snapshot('SEA-DEN', 25), null), ['No current forecast', 'unavailable'], 'no server clock (signed out, local, not deployed)');
  assert.deepEqual(none(null, k - 121 * H), ['No current forecast', 'not_yet']);
  // D-47: current until an hour past its due time. A day out, a snapshot made 49 h before kickoff fell due 25 h out (24 h
  // after it was made), so it is current through 24 h out and stale a millisecond later; one made 30 h out is current
  // until an hour past the 12 h checkpoint.
  assert.equal(weatherRow(game('SEA-DEN'), den, snapshot('SEA-DEN', 49), k - 24 * H).kind, 'forecast');
  assert.deepEqual(none({ ...snapshot('SEA-DEN', 49), fetchedAt: new Date(k - 49 * H - 1).toISOString() }, k - 24 * H), ['No current forecast', 'stale']);
  assert.equal(weatherRow(game('SEA-DEN'), den, snapshot('SEA-DEN', 30), k - 11 * H).kind, 'forecast');
  assert.deepEqual(none(snapshot('SEA-DEN', 30), k - 11 * H + 1), ['No current forecast', 'stale']);
  // A missed 2 h checkpoint: the 12 h forecast stops being current an hour later and is never the final one.
  assert.equal(weatherRow(game('SEA-DEN'), den, snapshot('SEA-DEN', 12), k - H).kind, 'forecast');
  assert.deepEqual(none(snapshot('SEA-DEN', 12), k - H + 1), ['No current forecast', 'stale']);
  assert.deepEqual(none(snapshot('SEA-DEN', 12), k + H), ['No current forecast', 'stale']);
  for (const bad of [{ windMph: null }, { windMph: Number.NaN }, { windMph: '12' }, { fetchedAt: 'yesterday' }, { forecastHour: null }]) {
    assert.deepEqual(none({ ...snapshot('SEA-DEN', 25), ...bad }, k - 24 * H), ['No current forecast', 'unavailable'], JSON.stringify(bad));
  }
  assert.deepEqual(none(snapshot('SEA-DEN', -1), k + 2 * H), ['No current forecast', 'unavailable'], 'a snapshot made after kickoff is never shown');
  assert.deepEqual(none(snapshot('SEA-DEN', 25), Number.NaN), ['No current forecast', 'unavailable']);
  assert.equal(weatherRow({ ...game('SEA-DEN'), kickoff: 'soon' }, den, snapshot('SEA-DEN', 25), k - 24 * H).kind, 'none', 'an unreadable kickoff');
  // A missing gust, temperature, chance or direction stays null; it is never filled in.
  const sparse = row('SEA-DEN', { gustMph: null, temperatureF: null, precipitationProbability: null, precipitationIn: null, directionDeg: null });
  assert.deepEqual([sparse.kind, sparse.values.gustMph, sparse.values.temperatureF, sparse.values.precipitationProbability, sparse.values.direction], ['forecast', null, null, null, null]);
});

test('D-45 "Roof may close" on every retractable row, with or without a forecast; never on open air, Indoors or an unknown venue', () => {
  const k = kickoff('CHI-ATL'), atl = venue('ATL97'), g = game('CHI-ATL');
  const words = (forecast, now, place = atl) => { const r = weatherRow(g, place, forecast, now); return [r.kind, r.reason, r.roofNote]; };
  assert.deepEqual(words(snapshot('CHI-ATL', 25), k - 24 * H), ['forecast', null, 'Roof may close']);
  assert.deepEqual(words(null, k - 121 * H), ['none', 'not_yet', 'Roof may close'], 'more than 120 h out');
  assert.deepEqual(words(snapshot('CHI-ATL', 25), null, null), ['none', 'unavailable', 'Roof may close'], 'signed out: the week file\'s stadium');
  assert.deepEqual(words(snapshot('CHI-ATL', 50), k - 24 * H), ['none', 'stale', 'Roof may close']);
  assert.deepEqual(words(snapshot('CHI-ATL', 1), k + H), ['forecast', null, 'Roof may close'], 'the final pre-kickoff forecast');
  // The note on a no-forecast row stays "No current forecast"; the roof's words ride beside it.
  assert.equal(weatherRow(g, atl, null, k - 24 * H).note, 'No current forecast');
  const closed = { ...g, flags: { ...g.flags, roof: 'closed' } };
  assert.deepEqual([weatherRow(closed, atl, null, k).kind, weatherRow(closed, atl, null, k).roofNote], ['indoors', null]);
  assert.equal(weatherRow(game('SEA-DEN'), venue('DEN00'), null, kickoff('SEA-DEN')).roofNote, null);
  assert.equal(weatherRow({ id: 'XXX-YYY', kickoff: g.kickoff }, null, null, k).roofNote, null);
});

test('D-45 after kickoff: the final pre-kickoff forecast still shows (and can carry a chip); an older one does not', () => {
  const k = kickoff('SEA-DEN'), den = venue('DEN00');
  const final = weatherRow(game('SEA-DEN'), den, snapshot('SEA-DEN', 1, { windMph: 18 }), k + H);
  assert.deepEqual([final.kind, final.values.final, weatherChip(final)], ['forecast', true, 'Windy']);
  assert.equal(weatherRow(game('SEA-DEN'), den, snapshot('SEA-DEN', 2.01), k + H).reason, 'stale');
  // The kickoff may come as epoch milliseconds or ISO text.
  assert.equal(weatherRow({ ...game('SEA-DEN'), kickoff: k }, den, snapshot('SEA-DEN', 25), k - 24 * H).kind, 'forecast');
});

test('D-45 board chip thresholds: Windy at 15.0 mph sustained, Rain or Snow likely at a 50% chance; 32 °F or colder is snow', () => {
  const dry = { precipitationProbability: 10, temperatureF: 55 };
  assert.equal(chip({ ...dry, windMph: 14.9 }), null);
  assert.equal(chip({ ...dry, windMph: 15 }), 'Windy');
  assert.equal(chip({ ...dry, windMph: 14.99 }), null, 'the unrounded value decides, as with the 10 and 15 mph bands');
  assert.equal(chip({ windMph: 5, temperatureF: 55, precipitationProbability: 49 }), null);
  assert.equal(chip({ windMph: 5, temperatureF: 55, precipitationProbability: 50 }), 'Rain likely');
  assert.equal(chip({ windMph: 5, temperatureF: 32, precipitationProbability: 50 }), 'Snow likely');
  assert.equal(chip({ windMph: 5, temperatureF: 32.1, precipitationProbability: 50 }), 'Rain likely');
  assert.equal(chip({ windMph: 5, temperatureF: -4, precipitationProbability: 100 }), 'Snow likely');
  assert.equal(chip({ windMph: 30, temperatureF: 20, precipitationProbability: 49 }), 'Windy', 'cold and windy with a 49% chance is only Windy');
  assert.deepEqual([W.WEATHER_WINDY_MPH, W.WEATHER_PRECIP_PCT, W.WEATHER_FREEZING_F], [15, 50, 32]);
});

test('D-45 one chip only: precipitation wins over Windy; no temperature means no precipitation chip; gusts never count', () => {
  assert.equal(chip({ windMph: 22, temperatureF: 45, precipitationProbability: 80 }), 'Rain likely');
  assert.equal(chip({ windMph: 22, temperatureF: 28, precipitationProbability: 80 }), 'Snow likely');
  assert.equal(chip({ windMph: 22, temperatureF: null, precipitationProbability: 80 }), 'Windy', 'rain or snow cannot be told apart without a temperature');
  assert.equal(chip({ windMph: 5, temperatureF: null, precipitationProbability: 80 }), null);
  assert.equal(chip({ windMph: 22, temperatureF: 45, precipitationProbability: null }), 'Windy');
  assert.equal(chip({ windMph: 5, gustMph: 45, temperatureF: 45, precipitationProbability: 10 }), null, 'a gust is not sustained wind');
  // A retractable stadium shows the outside weather, so it can carry a chip; a dome and SoFi's canopy never do.
  assert.equal(weatherChip(row('CHI-ATL', { precipitationProbability: 70, temperatureF: 60 })), 'Rain likely');
  assert.equal(weatherChip(row('ARI-LAR', { windMph: 16 })), null);
  for (const r of [null, undefined, {}, { kind: 'indoors', roof: 'dome', values: null }, { kind: 'none', roof: 'outdoor', values: null },
    { kind: 'forecast', roof: 'dome', values: { windMph: 30, precipitationProbability: 90, temperatureF: 50 } }, { kind: 'forecast', roof: 'outdoor', values: null },
    { kind: 'forecast', roof: 'canopy', values: { windMph: 30, precipitationProbability: 90, temperatureF: 50 } },
    { kind: 'indoors', roof: 'retractable', values: { windMph: 30, precipitationProbability: 90, temperatureF: 50 } }, { kind: 'none', roof: 'outdoor', values: { windMph: 30 } }]) {
    assert.equal(weatherChip(r), null, JSON.stringify(r));
  }
});

test('D-45 chips are words only, never digits, for every value on a grid; the words pass the copy guard', () => {
  const seen = new Set();
  for (let mph = 0; mph <= 40; mph += 0.5) for (const chance of [null, 0, 25, 49, 50, 51, 100]) for (const temp of [null, -10, 31.9, 32, 32.1, 70]) {
    const value = chip({ windMph: mph, precipitationProbability: chance, temperatureF: temp });
    assert.ok(value === null || Object.values(WEATHER_CHIPS).includes(value), String(value));
    if (value) { assert.doesNotMatch(value, /\d/); seen.add(value); }
  }
  assert.deepEqual([...seen].sort(), ['Rain likely', 'Snow likely', 'Windy']);
  for (const text of [...Object.values(WEATHER_CHIPS), ...Object.values(W.WEATHER_ROOF_NOTES).filter(Boolean), W.WEATHER_NONE, W.WEATHER_INDOORS]) {
    assert.deepEqual(bannedCopy(text), [], text);
    assert.doesNotMatch(text, /\d/, text);
  }
});

test('D-45 every Week 6 game gets exactly one kind of row, and only the dome and SoFi are Indoors', () => {
  const kinds = {};
  for (const g of week.games) {
    const k = Date.parse(g.kickoff), id = g.flags.stadium.id, place = venue(id);
    const fresh = weatherRow(g, place, { ...snapshot(g.id, 25) }, k - 24 * H);
    kinds[g.id] = [fresh.kind, fresh.roof];
    assert.equal(weatherRow(g, place, null, null).kind, ['dome', 'canopy'].includes(place.type) ? 'indoors' : 'none', g.id);
  }
  assert.deepEqual(Object.entries(kinds).filter(([, [kind]]) => kind !== 'forecast'), [['ARI-LAR', ['indoors', 'canopy']], ['BUF-LV', ['indoors', 'dome']]]);
});

test('D-45 the weather view is pure: no network, no clock, no input changes; it imports only the trends view helpers', () => {
  const src = fs.readFileSync(new URL('../shared/weather-view.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...src.matchAll(/from '([^']+)'/g)].map(m => m[1]), ['./trends-view.mjs']);
  assert.doesNotMatch(src, /Date\.now|new Date\(\)|performance\.now|Math\.random|\bfetch\(|localStorage|document\.|window\./);
  // Frozen inputs: any write would throw in this strict-mode module.
  const g = structuredClone(game('CHI-ATL')), place = venue('ATL97'), s = snapshot('CHI-ATL', 25, { windMph: 16 });
  for (const value of [g, g.flags, g.flags.stadium, place, s]) Object.freeze(value);
  const first = weatherRow(g, place, s, kickoff('CHI-ATL') - 24 * H);
  assert.deepEqual(weatherRow(g, place, s, kickoff('CHI-ATL') - 24 * H), first, 'the same inputs give the same row');
  assert.equal(weatherChip(first), 'Windy');
});
