import React, { useId } from 'react';
import {
  WIND_CARD, WIND_CHANGES, WIND_COPY, WIND_CREDIT, WIND_LICENSE, WIND_LICENSE_URL, WIND_SOURCE_URL, compass, etHour, etTime, fmtAge, fmtRecord,
} from '../../shared/trends-view.mjs';
import { WEATHER_INDOORS } from '../../shared/weather-view.mjs';

const MINUS = '−';
const one = value => (value < 0 ? `${MINUS}${Math.abs(value).toFixed(1)}` : value.toFixed(1));
const shown = (value, format) => (typeof value === 'number' && Number.isFinite(value) ? format(value) : 'not available');

/** The Open-Meteo credit (CC BY 4.0), placed next to every forecast value; never inside a summary. */
export function WindCredit({ compact = false }) {
  return <p className="trend-wind-credit">{compact ? 'Kickoff wind forecast: ' : ''}<a href={WIND_SOURCE_URL} target="_blank" rel="noreferrer">{WIND_CREDIT}</a> · <a href={WIND_LICENSE_URL} target="_blank" rel="noreferrer">{WIND_LICENSE}</a> · {WIND_CHANGES}</p>;
}

function bandSentence(band) {
  if (band.band === '15+') return '15+ mph band: if this holds, both wind cards would fit (Strong wind 10+ and Very strong wind 15+, both Under).';
  if (band.band === '10-14') return '10–14 mph band: if this holds, the Strong wind (10+ mph) Under card would fit this game; the Very strong wind (15+ mph) card would not.';
  return 'Below 10 mph: neither wind card would fit if this holds.';
}

/** The record the honesty note cites, read from the week file (never hard-coded), with the full history and this season beside it. */
function recordText(week) {
  const card = week?.cards?.[WIND_CARD];
  if (!card) return 'the 10+ mph Under record';
  const parts = [`${card.selection.label}: ${fmtRecord(card.selection.rec)}`, `every game since ${card.years?.[0] ?? 2002}: ${fmtRecord(card.record)}`];
  if (card.thisSeason) parts.push(`this season: ${fmtRecord(card.thisSeason)}`);
  return `the 10+ mph Under record (${parts.join('; ')})`;
}

const placeText = (venue, international = false) => (venue?.name ? `${venue.name}${venue.city ? `, ${venue.city}` : ''}${international ? ' (international)' : ''}` : null);

/**
 * One game's weather row at the top of "Strongest historical evidence" (D-45: every game has one). A
 * forecast shows the full card; a dome, SoFi's canopy or a closed roof says "Indoors" with no numbers
 * and no credit; no current forecast says so. A retractable roof says "Roof may close" with or without
 * a forecast. Presentational, fed by windView (shared/trends-view.mjs), which decides the state, and
 * weatherRow (shared/weather-view.mjs), which gives the stadium and the roof's words; a static region,
 * not a live one. `trends` is true when the wind trend cards can fit this game: only then does the card
 * say what would fit if the forecast holds (never what to pick) and cite the record, measured with
 * observed wind and not backtested on forecasts. Reference only.
 */
export default function WindForecast({ view, row, week, level = 5, trends = true }) {
  const headingId = useId();
  if (view.state === 'loading') return <p className="trend-note trend-weather" data-kind="none">Kickoff weather: {WIND_COPY.loading}</p>;
  if (view.state === 'indoor') {
    const at = placeText(row?.venue);
    return <p className="trend-weather" data-kind="indoors">Kickoff weather: <strong>{WEATHER_INDOORS}</strong>{at ? ` · ${at}` : ''}</p>;
  }
  if (view.state !== 'forecast' && view.state !== 'final') {
    return <p className="trend-note trend-weather" data-kind="none">Kickoff weather: no current forecast for this game.
      {row?.roofNote ? ` ${row.roofNote}.` : ''}{view.state === 'not_yet' ? ` ${WIND_COPY.later}` : view.reason === 'stale' ? ` ${WIND_COPY.stale}` : ''}</p>;
  }
  const { wind, venue, band } = view;
  const final = view.state === 'final';
  const place = placeText(venue, view.international);
  const from = compass(wind.directionDeg);
  const title = final ? `Final pre-kickoff forecast (fetched ${fmtAge(view.made)} before kickoff)` : 'Kickoff wind forecast';
  return <section className="trend-wind" data-state={view.state} aria-labelledby={headingId}>
    {React.createElement(`h${Math.min(6, Math.max(2, level))}`, { id: headingId }, title)}
    {place && <p className="trend-wind-place">{place}</p>}
    {row?.roofNote && <p className="trend-wind-roof">{row.roofNote}</p>}
    <dl className="trend-wind-values">
      <div><dt>Sustained wind at kickoff</dt><dd><span className="mono">{one(wind.windMph)} mph</span>{from ? ` from the ${from}` : ''}</dd></div>
      <div><dt>Gusts</dt><dd>{typeof wind.gustMph === 'number' ? <>up to <span className="mono">{one(wind.gustMph)} mph</span> in the kickoff hour</> : 'not available'}</dd></div>
      <div><dt>Temperature</dt><dd className="mono">{shown(wind.temperatureF, value => `${one(value)} °F`)}</dd></div>
      <div><dt>Precipitation chance</dt><dd className="mono">{shown(wind.precipitationProbability, value => `${value}%`)}</dd></div>
    </dl>
    <p className="trend-wind-time">Forecast for the {etHour(wind.forecastHour)} ET hour (kickoff {etTime(view.kickoff)} ET) · updated {fmtAge(view.age)} ago · made {fmtAge(view.made)} before kickoff · {view.confidence}</p>
    {trends && <p className="trend-wind-band">{bandSentence(band)}</p>}
    {trends && view.close && <p className="trend-note">Within 3 mph of a threshold. Forecasts this far out often miss by more than that.</p>}
    {view.retractable && <p className="trend-note">Retractable roof: the wind matters only if the roof is open, which is decided on game day.</p>}
    {final && trends && <p className="trend-note">Observed wind appears in next week’s trends file.</p>}
    {trends
      ? <p className="trend-wind-honesty">How far to trust this: {recordText(week)} was measured with observed kickoff wind. Using it with a forecast has not been backtested; the archive of past Open-Meteo forecasts that would allow that check could not be reached from GTL’s build environment. The forecast is for open ground at the stadium’s grid cell, and stadium walls can shelter the field. Reference only; never changes GTL scoring.</p>
      : <p className="trend-wind-honesty">The forecast is for open ground at the stadium’s grid cell, and stadium walls can shelter the field. Reference only; never changes GTL scoring.</p>}
    <p className="trend-note">Model: Open-Meteo best match ({view.international ? 'European and global models' : 'U.S. stadiums: mainly NOAA HRRR and GFS'})</p>
    <WindCredit/>
  </section>;
}
