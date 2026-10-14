// Kickoff weather for every game (D-45, Sean's October 14, 2026 ruling: "Full weather on every game").
// Pure ESM with no network and no clock: the caller passes `now` (the server's asOf plus the time
// since the answer arrived, as trends-view.mjs windClock computes it). The old app's trends panel and
// the new app's game sheet show weatherRow; the new app's Lines board shows at most one weatherChip per
// row. Freshness, the 120 h horizon and the final pre-kickoff rule are windView's (D-34), so every
// screen agrees on when a forecast shows. Reference only: nothing here reads or changes picks, lines,
// scores, deadlines, kickoff locks or the D-23 reveal.
import {
  WIND_CHANGES, WIND_CREDIT, WIND_LICENSE, WIND_LICENSE_URL, WIND_SOURCE_URL, compass, indoorsFor, venueRoof, windView,
} from './trends-view.mjs';

/** Board chip thresholds (D-45): kickoff-hour sustained wind, precipitation chance, and the snow line. */
export const WEATHER_WINDY_MPH = 15;
export const WEATHER_PRECIP_PCT = 50;
export const WEATHER_FREEZING_F = 32;
/** The only board chips. Words only: a closed board row shows no digits. */
export const WEATHER_CHIPS = Object.freeze({ windy: 'Windy', rain: 'Rain likely', snow: 'Snow likely' });
/**
 * The words each roof adds to its row. A retractable roof says "Roof may close" with or without a forecast; a dome and
 * SoFi Stadium's canopy (a fixed roof over the field) say "Indoors" and show no forecast.
 */
export const WEATHER_ROOF_NOTES = Object.freeze({
  outdoor: null, canopy: 'Indoors', retractable: 'Roof may close', dome: 'Indoors',
});
export const WEATHER_NONE = 'No current forecast';
export const WEATHER_INDOORS = 'Indoors';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const instant = value => (finite(value) ? value : typeof value === 'string' ? Date.parse(value) : NaN);
const place = venue => (venue && typeof venue.name === 'string'
  ? { name: venue.name, city: typeof venue.city === 'string' ? venue.city : null, country: typeof venue.country === 'string' ? venue.country : null } : null);

/**
 * One game's weather row:
 * { kind: 'forecast' | 'indoors' | 'none', roof, note, roofNote, reason, venue, values, credit }.
 * - forecast: a current kickoff forecast (windView's 'forecast', or 'final' after kickoff, with no end time). `note` is
 *   the roof's words ("Roof may close", or null outdoors) and `credit` the Open-Meteo CC BY 4.0 credit.
 * - indoors: a dome, SoFi Stadium's canopy or a closed roof: `note` "Indoors", no values, no credit, and never a chip.
 * - none: no current forecast (`note` "No current forecast"; `reason`: 'not_yet' beyond 120 h, 'stale', or
 *   'unavailable' for missing, invalid, provider down, signed out or not deployed). Never an invented value.
 * `roofNote` is the roof's words on a forecast or no-forecast row ("Roof may close" for a retractable roof, else null),
 * so every screen can say it without a forecast. `roof` is 'outdoor', 'canopy', 'retractable' or 'dome', or null for an
 * unknown venue. `venue` is the server's stadium ({ type, name, city, country }) or null for the week file's;
 * `forecast` the stored snapshot.
 */
export function weatherRow(game, venue, forecast, now) {
  const roof = venueRoof(venue, game), at = place(venue ?? game?.flags?.stadium);
  if (indoorsFor(roof, game)) return { kind: 'indoors', roof: roof ?? 'dome', note: WEATHER_INDOORS, roofNote: null, reason: null, venue: at, values: null, credit: null };
  const roofNote = roof ? WEATHER_ROOF_NOTES[roof] : null;
  const kickoff = instant(game?.kickoff);
  const view = windView({ game, now, entry: { kickoff: Number.isFinite(kickoff) ? new Date(kickoff).toISOString() : null, venue: venue ?? null, wind: forecast ?? null } });
  if (view.state !== 'forecast' && view.state !== 'final') {
    return { kind: 'none', roof, note: WEATHER_NONE, roofNote, reason: view.state === 'not_yet' ? 'not_yet' : view.reason ?? 'unavailable', venue: at, values: null, credit: null };
  }
  const w = view.wind;
  const value = x => (finite(x) ? x : null);
  return {
    kind: 'forecast', roof, note: roofNote, roofNote, reason: null, venue: at,
    values: {
      windMph: w.windMph, gustMph: value(w.gustMph), directionDeg: value(w.directionDeg), direction: compass(w.directionDeg),
      temperatureF: value(w.temperatureF), precipitationProbability: value(w.precipitationProbability), precipitationIn: value(w.precipitationIn),
      forecastHour: w.forecastHour, gustHour: typeof w.gustHour === 'string' ? w.gustHour : null, fetchedAt: w.fetchedAt, kickoff: view.kickoff,
      ageMs: view.age, madeMs: view.made, confidence: view.confidence, final: view.state === 'final',
    },
    credit: { text: WIND_CREDIT, url: WIND_SOURCE_URL, license: WIND_LICENSE, licenseUrl: WIND_LICENSE_URL, changes: WIND_CHANGES },
  };
}

/**
 * The board chip for a row (D-45), or null: "Rain likely" or "Snow likely" when the kickoff-hour precipitation chance
 * is 50% or more, "Windy" when the kickoff-hour sustained wind is 15 mph or more; one chip only, precipitation over
 * Windy. Snow means precipitation at or below 32 °F at the kickoff hour: the stored Open-Meteo fields carry no weather
 * code or snowfall, so without a temperature there is no precipitation chip. Indoors, a dome, a canopy or no current
 * forecast: never a chip. Thresholds use the unrounded stored values (14.9 mph is not Windy; 49% is not likely). After
 * kickoff the chip follows the final pre-kickoff forecast for as long as the row shows it, like the sheet's card.
 */
export function weatherChip(row) {
  if (!row || row.kind !== 'forecast' || row.roof === 'dome' || row.roof === 'canopy' || !row.values) return null;
  const { windMph, precipitationProbability: chance, temperatureF } = row.values;
  if (finite(chance) && chance >= WEATHER_PRECIP_PCT && finite(temperatureF)) return temperatureF <= WEATHER_FREEZING_F ? WEATHER_CHIPS.snow : WEATHER_CHIPS.rain;
  if (finite(windMph) && windMph >= WEATHER_WINDY_MPH) return WEATHER_CHIPS.windy;
  return null;
}
