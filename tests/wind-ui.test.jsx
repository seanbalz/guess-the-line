// Render test for the kickoff wind forecast (D-34): vitest + react-dom/server over the committed
// Week 6 trends file and hand-built /wind/read answers. Every state, the CC BY credit next to every
// forecast value, the honesty note with the record read from the file, heading levels and the copy
// guard; then fake timers show an open panel moving from forecast to out of date, and from forecast
// to final, without a reload.
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import week from '../shared/trends/2026-week-06.json';
import { bannedCopy } from '../shared/trends.mjs';
import TrendsView from '../web/src/TrendsView.jsx';
import { WIND_CARD_NOTES, WIND_COPY, fmtRecord } from '../shared/trends-view.mjs';
import { WEATHER_CHIPS, weatherChip, weatherRow } from '../shared/weather-view.mjs';
import { WIND_TICK_MS, watchWind, windNowFor } from '../web/src/windTimer.js';
import { WIND_STADIUMS } from '../shared/wind-venues.mjs';

const HOUR = 3_600_000, MIN = 60_000;
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const game = id => week.games.find(g => g.id === id);
const kickoff = id => Date.parse(game(id).kickoff);
const VENUES = {
  'SEA-DEN': { id: 'DEN00', name: 'Empower Field at Mile High', city: 'Denver', country: 'USA', type: 'outdoor' },
  'HOU-JAX': { id: 'LON00', name: 'Wembley Stadium', city: 'London', country: 'GBR', type: 'outdoor' },
  'CHI-ATL': { id: 'ATL97', name: 'Mercedes-Benz Stadium', city: 'Atlanta', country: 'USA', type: 'retractable' },
  'BUF-LV': { id: 'VEG00', name: 'Allegiant Stadium', city: 'Las Vegas', country: 'USA', type: 'dome' },
  'ARI-LAR': { id: 'LAX01', name: 'SoFi Stadium', city: 'Inglewood', country: 'USA', type: 'canopy' },
  'NO-NYG': { id: 'NYC01', name: 'MetLife Stadium', city: 'East Rutherford', country: 'USA', type: 'outdoor' },
};
const hourOf = ms => new Date(Math.floor((ms + 30 * MIN) / HOUR) * HOUR).toISOString();
const snapshot = (id, fetchedAt, values = {}) => {
  const k = kickoff(id);
  return { windMph: 14.2, gustMph: 27.5, directionDeg: 247, temperatureF: 49.3, precipitationProbability: 25, precipitationIn: 0.004,
    forecastHour: hourOf(k), gustHour: new Date(Math.floor(k / HOUR) * HOUR + HOUR).toISOString(), fetchedAt: new Date(fetchedAt).toISOString(),
    gridLatitude: 39.75, gridLongitude: -105.03, elevationM: 1609, model: 'best_match', source: 'Open-Meteo forecast API',
    sourceUrl: 'https://api.open-meteo.com/v1/forecast?latitude=39.744', ...values };
};
/** A /wind/read answer for one game. */
const answer = (id, asOf, wind, status = wind ? 'forecast' : 'none', venue = VENUES[id]) => ({
  season: 2026, week: 6, asOf: new Date(asOf).toISOString(), published: true, refresh: { outcome: 'not_due' },
  attribution: { text: 'Weather data by Open-Meteo.com', url: 'https://open-meteo.com/', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', changes: 'Kickoff-hour values selected by GTL; wind direction shown as compass points' },
  games: { [id]: { kickoff: game(id).kickoff, venue, status, wind } },
});
const render = (id, data, now, props = {}) => renderToStaticMarkup(<TrendsView week={week} gameId={id} level={4} wind={data} windNow={now} {...props}/>);
const names = new Set([...week.refereeOptions, ...week.games.flatMap(g => [...Object.values(g.entities.qbs), ...Object.values(g.entities.coaches)].map(e => e.name))]);
const strip = value => [...names].reduce((out, name) => out.split(name).join(' '), value);
const summaries = html => [...html.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map(m => m[1]);
const CREDIT = 'href="https://open-meteo.com/"', LICENSE = 'href="https://creativecommons.org/licenses/by/4.0/"';
const card = week.cards['total|g:g_wind10'];

/** The checks every forecast or final render must pass. */
function forecastChecks(html) {
  const t = text(html), section = /<section class="trend-wind"[\s\S]*?<\/section>/.exec(html)?.[0];
  expect(section, 'a wind section').toBeTruthy();
  expect(section).toContain(CREDIT);
  expect(section).toContain(LICENSE);
  expect(section).toMatch(/<h5 id="[^"]+">(Kickoff wind forecast|Final pre-kickoff forecast[^<]*)<\/h5>/);
  expect(section).toMatch(/aria-labelledby="[^"]+"/);
  expect(section).not.toContain('role="status"');
  // The honesty note: observed wind, not backtested, the file's own record label and numbers, reference only.
  expect(t).toContain(`${card.selection.label}: ${fmtRecord(card.selection.rec)}`);
  expect(t).toContain('282-196-5');
  expect(t).toContain(`every game since 2002: ${fmtRecord(card.record)}`);
  expect(t).toContain(`this season: ${fmtRecord(card.thisSeason)}`);
  expect(t).toContain('was measured with observed kickoff wind. Using it with a forecast has not been backtested');
  expect(t).toContain('Reference only; never changes GTL scoring.');
  // The footer credits Open-Meteo too; no summary carries a link or a forecast value.
  const footer = /<footer class="trends-source">[\s\S]*?<\/footer>/.exec(html)[0];
  expect(footer).toContain(CREDIT);
  expect(footer).toContain(LICENSE);
  for (const summary of summaries(html)) { expect(summary).not.toContain('<a '); expect(summary).not.toMatch(/\d+\.\d mph/); }
  expect(t).toContain(WIND_COPY.windShown);
  expect(t).toContain(WIND_CARD_NOTES['total|g:g_wind10']);
  expect(t).not.toContain('no forecast source');
  expect(t).not.toContain(card.note);
  expect(bannedCopy(strip(t))).toEqual([]);
  return t;
}

describe('kickoff wind forecast states', () => {
  it('outdoor, 14.2 mph, a day out: values, the 10–14 band, the time line and the credit', () => {
    const k = kickoff('SEA-DEN'), now = k - 24 * HOUR;
    const t = forecastChecks(render('SEA-DEN', answer('SEA-DEN', now, snapshot('SEA-DEN', now - 2 * HOUR)), now));
    expect(t).toContain('Empower Field at Mile High, Denver');
    expect(t).toContain('Sustained wind at kickoff 14.2 mph from the WSW');
    expect(t).toContain('Gusts up to 27.5 mph in the kickoff hour');
    expect(t).toContain('Temperature 49.3 °F');
    expect(t).toContain('Precipitation chance 25%');
    expect(t).toContain('Forecast for the 8 PM ET hour (kickoff 8:15 PM ET) · updated 2 h ago · made 26 h before kickoff · Next-day guidance');
    expect(t).toContain('10–14 mph band: if this holds, the Strong wind (10+ mph) Under card would fit this game; the Very strong wind (15+ mph) card would not.');
    expect(t).toContain('Model: Open-Meteo best match (U.S. stadiums: mainly NOAA HRRR and GFS)');
    expect(t).toContain('Weather data by Open-Meteo.com · CC BY 4.0 · Kickoff-hour values selected by GTL; wind direction shown as compass points');
    expect(t, '14.2 is 0.8 mph from 15').toContain('Within 3 mph of a threshold.');
  });
  it('16.4 mph at Wembley: the international stadium and the 15+ band', () => {
    const k = kickoff('HOU-JAX'), now = k - 10 * HOUR;
    const t = forecastChecks(render('HOU-JAX', answer('HOU-JAX', now, snapshot('HOU-JAX', now - 30 * MIN, { windMph: 16.4 })), now));
    expect(t).toContain('Wembley Stadium, London (international)');
    expect(t).toContain('15+ mph band: if this holds, both wind cards would fit (Strong wind 10+ and Very strong wind 15+, both Under).');
    expect(t).toContain('Forecast for the 10 AM ET hour (kickoff 9:30 AM ET)');
    expect(t).toContain('made 10 h before kickoff · Short range (within 18 h of kickoff)');
    expect(t).not.toContain('high-resolution');
    expect(t).not.toContain('updated hourly');
    expect(t).toContain('European and global models');
  });
  it('within 18 h, only a U.S. stadium is labelled with the hourly high-resolution model; Saint-Denis, Madrid, Munich and Mexico City are not', () => {
    const k = kickoff('SEA-DEN');
    const us = forecastChecks(render('SEA-DEN', answer('SEA-DEN', k - 12 * HOUR, snapshot('SEA-DEN', k - 13 * HOUR)), k - 12 * HOUR));
    expect(us).toContain('made 13 h before kickoff · Short range: high-resolution model updated hourly');
    expect(us).toContain('U.S. stadiums: mainly NOAA HRRR and GFS');
    // The four 2026 sites the review named, at the 18 h boundary and an hour out, on the Week 6 London game's slot.
    const hj = kickoff('HOU-JAX');
    for (const id of ['PAR00', 'MAD01', 'MUN01', 'MEX00']) {
      const { name, city, country, type } = WIND_STADIUMS[id], venue = { id, name, city, country, type };
      for (const made of [18 * HOUR, HOUR]) {
        const now = hj - made + 30 * MIN;
        const t = forecastChecks(render('HOU-JAX', answer('HOU-JAX', now, snapshot('HOU-JAX', hj - made), 'forecast', venue), now));
        expect(t).toContain(`${name}, ${city} (international)`);
        expect(t).toContain(`made ${made / HOUR} h before kickoff · Short range (within 18 h of kickoff)`);
        expect(t, `${id} at ${made / HOUR} h`).not.toContain('high-resolution');
        expect(t).not.toContain('updated hourly');
        expect(t).not.toContain('HRRR');
        expect(t).toContain('European and global models');
      }
    }
  });
  it('below 10 mph: neither card; 9.6 and 11.0 are close calls', () => {
    const k = kickoff('SEA-DEN'), now = k - 30 * HOUR;
    const at = mph => text(render('SEA-DEN', answer('SEA-DEN', now, snapshot('SEA-DEN', now - HOUR, { windMph: mph })), now));
    expect(at(7)).toContain('7.0 mph');
    expect(at(7)).toContain('Below 10 mph: neither wind card would fit if this holds.');
    expect(at(7)).not.toContain('Within 3 mph');
    for (const mph of [9.6, 11]) expect(at(mph)).toContain('Within 3 mph of a threshold. Forecasts this far out often miss by more than that.');
    expect(at(9.6)).toContain('Below 10 mph');
    expect(at(11)).toContain('11.0 mph');
    expect(at(11)).toContain('10–14 mph band');
    expect(at(19)).not.toContain('Within 3 mph');
    expect(at(17.5), '2.5 mph from 15').toContain('Within 3 mph');
  });
  it('a retractable roof says "Roof may close" and that the roof decides; a missing gust reads "not available"', () => {
    const k = kickoff('CHI-ATL'), now = k - 50 * HOUR;
    const html = render('CHI-ATL', answer('CHI-ATL', now, snapshot('CHI-ATL', now - HOUR, { gustMph: null, temperatureF: null })), now);
    const t = forecastChecks(html);
    expect(html).toContain('<p class="trend-wind-roof">Roof may close</p>');
    expect(t).toContain('Mercedes-Benz Stadium, Atlanta Roof may close');
    expect(t).toContain('Retractable roof: the wind matters only if the roof is open, which is decided on game day.');
    expect(t).toContain('Gusts not available');
    expect(t).toContain('Temperature not available');
    expect(t).toContain('Trend indicator only (2 to 3 days out)');
  });
  it('a dome says Indoors (D-45), with no card, no numbers and no credit', () => {
    const k = kickoff('BUF-LV'), now = k - 10 * HOUR;
    const html = render('BUF-LV', answer('BUF-LV', now, null, 'indoor'), now), t = text(html);
    expect(t).toContain('Kickoff weather: Indoors · Allegiant Stadium, Las Vegas');
    expect(html).toMatch(/<p class="trend-weather" data-kind="indoors">Kickoff weather: <strong>Indoors<\/strong> · Allegiant Stadium, Las Vegas<\/p>/);
    expect(t).toContain('Strong wind trends do not apply indoors (dome or closed roof).');
    expect(html).not.toContain('trend-wind');
    expect(html).not.toContain(CREDIT);
    expect(t).not.toContain('mph from the');
    expect(t).not.toContain('no current forecast');
    // Signed out the week file's stadium still says Indoors.
    expect(text(render('BUF-LV', null, null))).toContain('Kickoff weather: Indoors · Allegiant Stadium, Las Vegas');
  });
  it('SoFi (a canopy, D-45): the forecast, "Covered, open-sided stadium" and the credit, without the wind card band', () => {
    const k = kickoff('ARI-LAR'), now = k - 24 * HOUR;
    const html = render('ARI-LAR', answer('ARI-LAR', now, snapshot('ARI-LAR', now - HOUR, { windMph: 9.4, precipitationProbability: 60, temperatureF: 64.4 })), now), t = text(html);
    const section = /<section class="trend-wind"[\s\S]*?<\/section>/.exec(html)?.[0];
    expect(section).toBeTruthy();
    expect(section).toContain(CREDIT);
    expect(section).toContain(LICENSE);
    expect(section).toContain('<p class="trend-wind-roof">Covered, open-sided stadium</p>');
    expect(t).toContain('SoFi Stadium, Inglewood');
    expect(t).toContain('Sustained wind at kickoff 9.4 mph from the WSW');
    expect(t).toContain('Precipitation chance 60%');
    expect(t).toContain('a roof covers this field, so conditions on it can differ. Reference only; never changes GTL scoring.');
    // The wind trend cards do not fit a stadium their records count as a dome: no band, no close call, no record.
    expect(t).not.toMatch(/mph band|Below 10 mph|Within 3 mph|282-196-5/);
    expect(t).toContain(WIND_COPY.canopy);
    expect(t).not.toContain(WIND_COPY.indoor);
    expect(/<footer class="trends-source">[\s\S]*?<\/footer>/.exec(html)[0]).toContain(CREDIT);
    expect(bannedCopy(strip(t))).toEqual([]);
    // Without a forecast SoFi says so; it is never called indoors.
    const none = text(render('ARI-LAR', null, null));
    expect(none).toContain('Kickoff weather: no current forecast for this game.');
    expect(none).toContain(WIND_COPY.canopy);
    expect(none).not.toContain('Indoors');
  });
  it('without forecasts (signed out, local, not a member, not deployed) the note falls back; the old "no forecast source" text is gone', () => {
    const html = render('SEA-DEN', null, null), t = text(html);
    expect(t).toContain('Kickoff weather: no current forecast for this game.');
    expect(t).toContain(WIND_COPY.windConditional);
    expect(t).toContain(WIND_COPY.evidence);
    expect(t).not.toContain('no forecast source');
    expect(html).not.toContain('class="trend-wind"');
    expect(html).not.toContain(CREDIT);
    expect(t).not.toContain(WIND_COPY.stale);
    expect(t).toContain(WIND_COPY.wind15Conditional);
  });
  it('while the read is in flight: a loading line, not the fallback numbers', () => {
    const t = text(render('SEA-DEN', null, null, { windLoading: true }));
    expect(t).toContain('Loading kickoff forecast…');
    expect(t).toContain(WIND_COPY.windConditional);
  });
  it('a stale snapshot falls back and says the last forecast is out of date', () => {
    const k = kickoff('SEA-DEN'), now = k - 24 * HOUR;
    const html = render('SEA-DEN', answer('SEA-DEN', now, snapshot('SEA-DEN', now - 6 * HOUR - MIN)), now), t = text(html);
    expect(html).not.toContain('class="trend-wind"');
    expect(t).toContain(WIND_COPY.windConditional);
    expect(t).toContain('Kickoff weather: no current forecast for this game. The last forecast is out of date.');
    expect(html).not.toContain(CREDIT);
  });
  it('more than 5 days out: "appears 5 days before kickoff", no numbers, no credit', () => {
    const k = kickoff('SEA-DEN'), now = k - 121 * HOUR;
    const html = render('SEA-DEN', answer('SEA-DEN', now, null, 'not_yet'), now), t = text(html);
    expect(t).toContain('Kickoff weather: no current forecast for this game. The kickoff forecast appears 5 days before kickoff.');
    expect(html).not.toContain(CREDIT);
    expect(t).not.toContain('mph from the');
  });
  it('an early outlook is labelled low confidence', () => {
    const k = kickoff('SEA-DEN'), now = k - 100 * HOUR;
    const t = forecastChecks(render('SEA-DEN', answer('SEA-DEN', now, snapshot('SEA-DEN', now - HOUR)), now));
    expect(t).toContain('made 4 days before kickoff · Early outlook, low confidence (3 to 5 days out)');
  });
  it('after kickoff: the final pre-kickoff forecast, never called observed; an older one falls back', () => {
    const k = kickoff('SEA-DEN'), now = k + HOUR;
    const t = forecastChecks(render('SEA-DEN', answer('SEA-DEN', now, snapshot('SEA-DEN', k - 45 * MIN)), now));
    expect(t).toContain('Final pre-kickoff forecast (fetched 45 min before kickoff)');
    expect(t).toContain('Observed wind appears in next week’s trends file.');
    expect(t).not.toMatch(/observed wind of|observed: \d/i);
    const old = text(render('SEA-DEN', answer('SEA-DEN', now, snapshot('SEA-DEN', k - 2 * HOUR - MIN)), now));
    expect(old).toContain(WIND_COPY.windConditional);
    expect(old).toContain('The last forecast is out of date.');
  });
  it('the Tier 2 wind card summary points to the forecast but carries no link or value', () => {
    const k = kickoff('SEA-DEN'), now = k - 24 * HOUR;
    const html = render('SEA-DEN', answer('SEA-DEN', now, snapshot('SEA-DEN', now - HOUR)), now);
    const tier2 = /<section class="trends-section trends-tier2"[\s\S]*?<\/section>/.exec(html)?.[0];
    expect(tier2).toBeTruthy();
    expect(text(tier2)).toContain(WIND_COPY.wind15Shown);
    expect(tier2).not.toContain('<a ');
  });
  it('an invalid snapshot is never shown', () => {
    const k = kickoff('SEA-DEN'), now = k - 24 * HOUR;
    for (const bad of [{ windMph: null }, { windMph: Number.NaN }, { fetchedAt: 'yesterday' }, { fetchedAt: new Date(k + MIN).toISOString() }]) {
      const html = render('SEA-DEN', answer('SEA-DEN', now, { ...snapshot('SEA-DEN', now - HOUR), ...bad }), now);
      expect(html).not.toContain('class="trend-wind"');
    }
  });
});

describe('weather on every game (D-45)', () => {
  /** A /wind/read answer for the whole week as the server sends it: a snapshot for every game but the dome. */
  const all = (now, values = () => ({})) => ({
    ...answer('SEA-DEN', now, null), games: Object.fromEntries(week.games.map(g => {
      const { id, name, city, country, type } = { id: g.flags.stadium.id, ...WIND_STADIUMS[g.flags.stadium.id] };
      const dome = type === 'dome';
      return [g.id, { kickoff: g.kickoff, venue: { id, name, city, country, type }, status: dome ? 'indoor' : 'forecast', wind: dome ? null : snapshot(g.id, Date.parse(g.kickoff) - 25 * HOUR, values(g)) }];
    })),
  });
  it('every Week 6 panel has exactly one weather row: thirteen forecast cards with the credit and one Indoors', () => {
    const rows = {};
    for (const g of week.games) {
      const now = kickoff(g.id) - 24 * HOUR, html = render(g.id, all(now), now);
      const cards = html.match(/<section class="trend-wind"/g)?.length ?? 0, others = html.match(/class="(?:trend-note )?trend-weather"/g)?.length ?? 0;
      expect(cards + others, g.id).toBe(1);
      rows[g.id] = cards ? 'forecast' : /data-kind="indoors"/.test(html) ? 'indoors' : 'none';
      if (cards) expect(/<section class="trend-wind"[\s\S]*?<\/section>/.exec(html)[0], g.id).toContain(CREDIT);
      else expect(html, g.id).not.toContain(CREDIT);
    }
    expect(Object.entries(rows).filter(([, kind]) => kind !== 'forecast')).toEqual([['BUF-LV', 'indoors']]);
    // Signed out: one row per game too, the dome Indoors and every other game the note.
    for (const g of week.games) {
      const html = render(g.id, null, null);
      expect(html.match(/class="(?:trend-note )?trend-weather"/g)?.length, g.id).toBe(1);
      expect(text(html), g.id).toContain(g.id === 'BUF-LV' ? 'Kickoff weather: Indoors' : 'Kickoff weather: no current forecast for this game.');
    }
  });
  it('a board chip from the same rows is one word chip, never digits; Indoors and missing forecasts get none', () => {
    const now = kickoff('SEA-DEN') - 24 * HOUR;
    const windy = all(now, g => (g.id === 'SEA-DEN' ? { windMph: 15 } : g.id === 'DAL-GB' ? { windMph: 20, precipitationProbability: 70, temperatureF: 31 } : g.id === 'NYJ-NE' ? { precipitationProbability: 50, temperatureF: 48 } : { windMph: 14.9 }));
    const chips = Object.fromEntries(week.games.map(g => {
      const entry = windy.games[g.id], at = kickoff(g.id) - 24 * HOUR;
      return [g.id, weatherChip(weatherRow({ ...g, kickoff: entry.kickoff }, entry.venue, entry.wind, at))];
    }));
    expect(Object.entries(chips).filter(([, chip]) => chip)).toEqual([['SEA-DEN', 'Windy'], ['NYJ-NE', 'Rain likely'], ['DAL-GB', 'Snow likely']]);
    for (const chip of Object.values(chips)) if (chip) { expect(Object.values(WEATHER_CHIPS)).toContain(chip); expect(chip).not.toMatch(/\d/); }
    expect(chips['BUF-LV']).toBeNull();
    expect(weatherChip(weatherRow(game('SEA-DEN'), null, null, null))).toBeNull();
  });
});

describe('an open panel follows the clock without a reload', () => {
  afterEach(() => { vi.useRealTimers(); });
  const fakeDoc = () => { const listeners = new Set(); return { visibilityState: 'visible', addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn), fire: () => listeners.forEach(fn => fn()), listeners }; };

  it('moves from forecast to "out of date" as the snapshot ages, re-rendering every minute and asking for a fresh read at the TTL', () => {
    // The device clock is years off the server's: only elapsed device time is added to asOf.
    vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2031, 0, 1));
    const k = kickoff('SEA-DEN'), asOf = k - 24 * HOUR;
    const result = { data: answer('SEA-DEN', asOf, snapshot('SEA-DEN', asOf - 2 * HOUR)), receivedAt: Date.now() };
    const ticks = [], refetches = [], doc = fakeDoc();
    const stop = watchWind({ result, doc, onTick: now => ticks.push(now), onRefetch: () => refetches.push(windNowFor(result)) });
    const view = () => render('SEA-DEN', result.data, windNowFor(result));
    expect(text(view())).toContain('updated 2 h ago');
    vi.advanceTimersByTime(WIND_TICK_MS);
    expect(ticks).toHaveLength(1);
    // The 3 h TTL for a 24 h lead runs out an hour after asOf: the panel asks the server again.
    vi.advanceTimersByTime(HOUR - WIND_TICK_MS);
    expect(refetches).toEqual([asOf + HOUR]);
    expect(text(view())).toContain('updated 3 h ago');
    // Twice the TTL after it was made, with no newer snapshot, the card gives way to the fallback.
    vi.advanceTimersByTime(3 * HOUR + MIN);
    const stale = view();
    expect(stale).not.toContain('class="trend-wind"');
    expect(text(stale)).toContain('The last forecast is out of date.');
    expect(ticks.length).toBe(4 * 60 + 1);
    doc.fire();
    expect(refetches).toHaveLength(2);
    stop();
    expect(doc.listeners.size).toBe(0);
    vi.advanceTimersByTime(HOUR);
    expect(ticks.length).toBe(4 * 60 + 1);
  });

  it('moves from forecast to final at kickoff, and asks for a fresh read at kickoff', () => {
    vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2026, 9, 1));
    const k = kickoff('SEA-DEN'), asOf = k - 20 * MIN;
    const result = { data: answer('SEA-DEN', asOf, snapshot('SEA-DEN', k - 30 * MIN)), receivedAt: Date.now() };
    const refetches = [];
    const stop = watchWind({ result, doc: fakeDoc(), onTick: () => {}, onRefetch: () => refetches.push(windNowFor(result)) });
    expect(text(render('SEA-DEN', result.data, windNowFor(result)))).toContain('Kickoff wind forecast');
    vi.advanceTimersByTime(20 * MIN);
    expect(refetches).toEqual([k]);
    vi.advanceTimersByTime(5 * MIN);
    const t = text(render('SEA-DEN', result.data, windNowFor(result)));
    expect(t).toContain('Final pre-kickoff forecast (fetched 30 min before kickoff)');
    expect(t).not.toContain('Kickoff wind forecast Empower');
    stop();
  });
});
