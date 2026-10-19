// The new app's Lines tab and game sheet, as plain data (redesign build plan stage 13; prototype spec 3.4 and 3.5;
// DASH-7 "Trends, simplified"). Pure: no React, storage, network or clock of its own. It reads what the data layer
// already holds: the viewer's own week (`/personal`: games, deadline, the server's `now` and `rules`, the viewer's own
// ballots) and the Community week (`/community/read`: the viewer's sit-outs and any forfeit), plus the public trends
// week file and the public team records. Everything it returns is the viewer's own or public.
//
// The gate (D-39 per-game lock-in, D-31 kickoff, D-23 sit-out): a game's Spread or Total line is open to the viewer
// only under shared/trends-view.mjs gameAccess, fed with the server's own `now` and live `rules` (gtl_live_rules,
// `rules.revealAt`) from the read, never the device clock. The server is the authority (build plan 3.4): this file
// only draws its rule, and the lines readers (M-06) are what will carry a current line. Until then the board shows
// no current line at all ("Line now arrives in a later update."), a lock icon on every market still closed to the
// viewer, the viewer's own pick as a tag, and the viewer's own line at the guess once that market is open.
import { TEAM_NAMES } from './nfl-schedule.mjs';
import { venueFor } from './wind-venues.mjs';
import {
  TRENDS_CREDIT, TRENDS_LICENSE_URL, TRENDS_SOURCE_URL, WIND_CHANGES, WIND_COPY, WIND_CREDIT, WIND_LICENSE, WIND_LICENSE_URL, WIND_SOURCE_URL,
  boardTrends, communityAccess, compass, fmtAge, gameTrends, guessLockedIn, recordText, referenceValue, refereeFor, windView,
} from './trends-view.mjs';
import { WEATHER_INDOORS, WEATHER_NONE, weatherChip, weatherRow } from './weather-view.mjs';
import { DASH, MINUS, PICKEM, SEP, fmtDate, fmtNum, fmtSpreadPick, fmtTime, fmtWhen, pacificParts, toMs } from '../web/src/next/format.js';
import * as copy from '../web/src/next/copy.js';
import { guessState, liveRules } from '../web/src/next/rules.js';

export const MARKETS = Object.freeze(['spread', 'total']);
const MODES = Object.freeze({ spread: 'guess_spread', total: 'guess_total' });
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const finite = value => typeof value === 'number' && Number.isFinite(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export const LINES_COPY = Object.freeze({
  title: 'Lines',
  lineLater: 'Line now arrives in a later update.',
  loading: 'Loading this week’s games…',
  unpublished: 'This week’s games aren’t published yet. They show here once the commissioner publishes the week.',
  failed: 'This week’s games didn’t load.',
  failedHelp: 'Check your connection, then try again. The old app works too.',
  tryAgain: 'Try again',
  kickedOff: 'Kicked off',
  youOnGame: 'You on this game',
  trends: 'Trends',
  allTrends: 'All trends',
  noTrend: 'No trend fits this game.',
  trendsMissing: week => `Trends for ${Number.isInteger(week) ? `Week ${week}` : 'this week'} publish after Monday night’s final.`,
  trendsLoading: 'Loading trends…',
  trendsFailed: 'Trends didn’t load. Check your connection and try again.',
  trendsNone: 'No trends for this game in this week’s file.',
  notOnBoard: 'This game isn’t on this week’s board.',
  atYourGuess: 'at your guess',
  lineAtGuess: 'Line at your guess',
  linePending: 'Line at your guess: pending (the first line after you sent it)',
  weather: 'Weather at kickoff',
  referee: 'Referee',
  openDetails: 'Open game details',
  lineHidden: market => `${copy.marketName(market)} line hidden`,
  noLineYet: market => `No ${copy.marketName(market).toLowerCase()} line yet`,
});

/** Team names: "Seattle Seahawks", the nickname "Seahawks", the code. */
export function teamOf(code) {
  const name = TEAM_NAMES[code] ?? code;
  return { code, name, nick: name === code ? code : name.split(' ').at(-1) };
}

/** The week the viewer's own read is for: `{ season, week }`, or null. */
export function weekOf(personal) {
  return Number.isInteger(personal?.season) && Number.isInteger(personal?.week) ? { season: personal.season, week: personal.week } : null;
}

/**
 * The viewer's sit-outs for the week the board shows. `/community/read` names them for its own week; when that is not
 * the same week as `/personal`, none are used (a sit-out never opens another week's lines).
 */
export function optOutsFor(personal, community) {
  const shown = weekOf(personal), week = community?.week;
  if (!shown || !record(week) || week.season !== shown.season || week.week !== shown.week) return [];
  return Array.isArray(community.optOuts) ? community.optOuts.filter(mode => Object.values(MODES).includes(mode)) : [];
}

/** The week's forfeit for one market (M-03 skip or "See picks now", or a sit-out), as rules.js reads it. */
function forfeitFor(personal, community, market) {
  const shown = weekOf(personal), mode = MODES[market];
  const stored = community?.forfeit;
  if (shown && record(stored) && stored.season === shown.season && stored.week === shown.week && record(stored.forfeit)
    && Array.isArray(stored.forfeit.modes) && stored.forfeit.modes.includes(mode)) {
    return { reason: stored.forfeit.reason === 'reveal' ? 'reveal' : 'skip', at: stored.forfeit.createdAt ?? null };
  }
  return optOutsFor(personal, community).includes(mode) ? { reason: 'sitOut', at: null } : null;
}

/**
 * This viewer's own entry for one game and market, as rules.js `guessState` takes it: the pick (a draft too), when it
 * was locked in (a pick in a submitted ballot, or one the ballot's `lockedAt` names: gtl_guess_locked_in's reading), and
 * the stored Late marker. Never another player's.
 */
export function ownEntry(personal, gameId, market) {
  const ballot = personal?.ballots?.[MODES[market]];
  const value = ballot?.picks?.[gameId];
  if (!finite(value)) return null;
  const locked = guessLockedIn(ballot, gameId);
  const lockedAt = locked ? (typeof ballot.lockedAt?.[gameId] === 'string' ? ballot.lockedAt[gameId] : ballot.submittedAt) : null;
  // M-07's Late marker belongs to each lock. A later lock must not mark an earlier on-time guess Late.
  const marker = ballot?.guessRule === 'per-game-v1' ? ballot.lockedLate?.[gameId] : ballot?.late;
  const late = locked && record(marker) ? { minutes: finite(marker.minutes) ? marker.minutes : null } : null;
  return { value, lockedAt, late };
}

/** The viewer's own pick for a market, in words: "SEA −2.5", "Pick'em", "41". */
export function pickText(game, market, value) {
  if (!finite(value)) return DASH;
  return market === 'spread' ? fmtSpreadPick(game.away, game.home, value) : fmtNum(value);
}

/**
 * The viewer's own saved line at the guess for one game and market, only when that market is open to the viewer
 * (`access`) and the guess is locked in: `{ value, text }`, `{ pending: true }` while the first line after the send is
 * still to come (D-27), or null. A reference for a closed market is never read, whatever the reply carried.
 */
export function lineAtGuess(personal, game, market, access) {
  if (access?.[market] !== true) return null;
  const ballot = personal?.ballots?.[MODES[market]];
  if (!guessLockedIn(ballot, game.id)) return null;
  const reference = ballot?.scoringReferences?.[game.id];
  const value = referenceValue(reference);
  if (value !== null) return { value, text: pickText(game, market, value) };
  return record(reference) && reference.status === 'pending' ? { pending: true } : null;
}

/** One game's gate for the viewer, from the server's `now` and live `rules` (gameAccess, D-39). */
export function accessFor(personal, community, gameId) {
  return communityAccess(personal, gameId, optOutsFor(personal, community));
}

/** The game list of the viewer's week, in kickoff order, with team names. */
export function gamesOf(personal) {
  const games = Array.isArray(personal?.games) ? personal.games.filter(g => typeof g?.id === 'string' && toMs(g.kickoff) !== null) : [];
  return games.map(g => {
    const [away, home] = g.id.split('-');
    return { id: g.id, away: g.awayCode || g.away || away, home: g.homeCode || g.home || home, kickoff: g.kickoff };
  }).sort((a, b) => toMs(a.kickoff) - toMs(b.kickoff) || (a.id < b.id ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Kickoff groups (prototype spec 3.4): Thursday night, Sunday · London, Sunday 10:00 AM PT · 7 games, Sunday
// afternoon, Sunday night, Monday night. Pacific time through Intl, so daylight time is right on both sides of Nov 1.
// ---------------------------------------------------------------------------
function slotOf(ms) {
  const p = pacificParts(ms);
  return { p, slot: p.hour < 12 ? 'early' : p.hour < 16 ? 'afternoon' : 'night' };
}
const dayKey = p => `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;

/** Groups games by Pacific day and kickoff window: `[{ key, label, time, count, games }]` in kickoff order. */
export function kickoffGroups(games, { season = null, week = null } = {}) {
  const groups = [];
  for (const game of games) {
    const ms = toMs(game.kickoff), { p, slot } = slotOf(ms);
    const venue = Number.isInteger(season) && Number.isInteger(week) ? venueFor(season, week, game.id) : null;
    const abroad = venue?.international ? venue.city : '';
    const key = `${dayKey(p)}|${slot}|${abroad}`;
    let group = groups.find(g => g.key === key);
    if (!group) { group = { key, day: DAY_NAMES[p.weekday], slot, abroad, games: [] }; groups.push(group); }
    group.games.push(game);
  }
  return groups.map(group => {
    const times = [...new Set(group.games.map(g => toMs(g.kickoff)))];
    const oneTime = times.length === 1;
    let label;
    if (group.abroad) label = `${group.day}${SEP}${group.abroad}`;
    else if (group.slot === 'night') label = `${group.day} night`;
    else if (group.slot === 'afternoon') label = `${group.day} afternoon`;
    else label = oneTime ? `${group.day} ${fmtTime(times[0])} PT` : `${group.day} morning`;
    const count = group.games.length;
    return {
      key: group.key,
      label: count > 1 ? `${label}${SEP}${count} games` : label,
      time: oneTime && !/\bPT\b/.test(label) ? fmtWhen(times[0]) : '',
      oneTime,
      count,
      games: group.games,
    };
  });
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------
/**
 * The game shared/weather-view.mjs reads (D-45): the published slate's kickoff with the week file's stadium and roof,
 * else the venue table's stadium. A static trends file must not replace a newer slate kickoff.
 */
function weatherGame(game, { trendsGame = null, season = null, week = null } = {}) {
  if (trendsGame) return { ...trendsGame, kickoff: game.kickoff ?? trendsGame.kickoff };
  const venue = Number.isInteger(season) && Number.isInteger(week) ? venueFor(season, week, game.id) : null;
  return { kickoff: game.kickoff, flags: { stadium: venue ? { id: venue.id, name: venue.name, city: venue.city, country: venue.country, type: venue.type } : null } };
}

/**
 * The D-45 board weather chip: `{ text }` with "Windy", "Rain likely" or "Snow likely" (one word, never digits or a
 * link) when the kickoff-hour wind is 15+ mph or precipitation is 50%+, else null (Indoors, no current forecast, no
 * read). weather-view's weatherRow and weatherChip decide, so the board, the sheet and the old app agree. `entry` is
 * /wind/read's game and `now` the server time for its age (windNowFor), never the device clock alone.
 */
export function boardWeatherChip(game, { trendsGame = null, entry = null, now = null, season = null, week = null } = {}) {
  const text = weatherChip(weatherRow(weatherGame(game, { trendsGame, season, week }), entry?.venue ?? null, entry?.wind ?? null, now));
  return text ? { text } : null;
}

/** A card's one chip (D-35: at most one standout chip per card): its board trend line, else the D-45 weather chip. */
export function cardChip({ trend = null, weather = null } = {}) {
  if (trend) return { kind: 'trend', text: trend.text, tier: trend.tier };
  if (weather) return { kind: 'weather', text: weather.text };
  return null;
}

/** Your tags (prototype review D3): a Spread pick on the favored team's row ("YOU −2.5"), a Total pick on the Total row. */
export function ownTags(game, states) {
  const tags = { away: null, home: null, total: null };
  const spread = states.spread?.value, total = states.total?.value;
  if (finite(spread)) {
    const magnitude = Math.round(Math.abs(spread) * 100) / 100;
    const tag = { k: 'You', text: magnitude === 0 ? PICKEM : `${MINUS}${fmtNum(magnitude)}`, aria: `Your spread pick ${pickText(game, 'spread', spread)}` };
    if (spread < 0) tags.home = tag; else tags.away = tag;
  }
  if (finite(total)) tags.total = { k: 'You', text: fmtNum(total), aria: `Your total pick ${fmtNum(total)}` };
  return tags;
}

function marketCell(personal, game, market, access) {
  if (access?.[market] !== true) return { open: false };
  const own = lineAtGuess(personal, game, market, access);
  return { open: true, line: own && !own.pending ? own.text : null };
}

/** One game's card on the board. */
export function boardCard(personal, community, game, { chip = null, sameTime = true } = {}) {
  const rules = liveRules(personal?.rules);
  const access = accessFor(personal, community, game.id);
  const now = toMs(personal?.now);
  const states = Object.fromEntries(MARKETS.map(market => [market, now === null ? null : guessState({
    kickoff: game.kickoff, deadline: personal?.deadline ?? null, entry: ownEntry(personal, game.id, market),
    forfeit: forfeitFor(personal, community, market), now, rules,
  })]));
  const away = teamOf(game.away), home = teamOf(game.home);
  const tags = ownTags(game, states);
  const late = MARKETS.map(m => states[m]).find(s => s?.late) ?? null;
  const spread = marketCell(personal, game, 'spread', access), total = marketCell(personal, game, 'total', access);
  const time = `${fmtTime(game.kickoff)} PT`;
  const bits = [`${away.nick} at ${home.nick}, ${fmtWhen(game.kickoff)}`,
    spread.open ? (spread.line ? `Spread ${spread.line} ${LINES_COPY.atYourGuess}` : LINES_COPY.noLineYet('spread')) : LINES_COPY.lineHidden('spread'),
    total.open ? (total.line ? `Total ${total.line} ${LINES_COPY.atYourGuess}` : LINES_COPY.noLineYet('total')) : LINES_COPY.lineHidden('total'),
    tags.away?.aria, tags.home?.aria, tags.total?.aria, late ? late.lateText : null,
    chip?.kind === 'trend' ? `Trend: ${chip.text}${SEP}${chip.tier}` : chip?.kind === 'weather' ? `Kickoff weather: ${chip.text}` : null, LINES_COPY.openDetails].filter(Boolean);
  return {
    id: game.id, matchup: `${away.code} @ ${home.code}`, away, home, kickoff: game.kickoff, time, showTime: !sameTime,
    started: now !== null && now >= toMs(game.kickoff),
    spread, total, tags, late: late ? { text: late.lateText } : null, chip, aria: bits.join('. '),
  };
}

/**
 * The board: `{ season, week, meta, groups: [{ key, label, time, cards }], started: { label, cards } | null, footer }`.
 * Games still to kick off sit in their kickoff group; the ones that kicked off follow in one group (LIVE NOW and FINAL
 * rows come with stage 33). At most three trend lines on the board, at most one chip per card. `wind` is the week's
 * /wind/read answer and `windNow` the server time for its ages (D-45 chips; another week's answer is never read).
 */
export function linesBoard({ personal, community = null, trends = null, wind = null, windNow = null } = {}) {
  const shown = weekOf(personal);
  const games = gamesOf(personal), now = toMs(personal?.now), deadline = toMs(personal?.deadline);
  const upcoming = games.filter(g => now === null || now < toMs(g.kickoff)), started = games.filter(g => now !== null && now >= toMs(g.kickoff));
  const names = TEAM_NAMES;
  const weekTrends = trends && shown && trends.season === shown.season && trends.week === shown.week ? trends : null;
  const weekWind = shown && record(wind?.games) && wind.season === shown.season && wind.week === shown.week ? wind.games : null;
  const trendLines = weekTrends ? boardTrends(weekTrends, { eligible: upcoming.map(g => g.id), names }) : [];
  const weatherFor = game => boardWeatherChip(game, { trendsGame: weekTrends?.games?.find(g => g.id === game.id) ?? null,
    entry: weekWind?.[game.id] ?? null, now: windNow, season: shown?.season ?? null, week: shown?.week ?? null });
  const chipFor = game => cardChip({ trend: trendLines.find(t => t.gameId === game.id) ?? null, weather: weatherFor(game) });
  const groups = kickoffGroups(upcoming, shown ?? {}).map(group => ({
    key: group.key, label: group.label, time: group.time, count: group.count,
    cards: group.games.map(game => boardCard(personal, community, game, { chip: chipFor(game), sameTime: group.oneTime })),
  }));
  return {
    season: shown?.season ?? null,
    week: shown?.week ?? null,
    // "Due …" only while the deadline is still ahead by the server's clock; once it has passed the week name stands alone.
    meta: shown ? `${copy.weekName(shown.week)}${deadline !== null && (now === null || now < deadline) ? `${SEP}${copy.dueAt(fmtWhen(deadline))}` : ''}` : '',
    groups,
    // A game that kicked off keeps its weather chip from the final pre-kickoff forecast (D-45); trend lines are for games to come.
    started: started.length ? { label: LINES_COPY.kickedOff, count: started.length, cards: started.map(game => boardCard(personal, community, game, { chip: cardChip({ weather: weatherFor(game) }), sameTime: false })) } : null,
    trendLines: trendLines.length,
    footer: footer(),
  };
}

/** The credits under the board and the sheet; the line source arrives with the lines readers. */
export function footer({ forecastShown = false } = {}) {
  return {
    lineLater: LINES_COPY.lineLater,
    trends: { text: TRENDS_CREDIT, url: TRENDS_SOURCE_URL, license: 'CC BY 4.0', licenseUrl: TRENDS_LICENSE_URL },
    wind: forecastShown ? { text: WIND_CREDIT, url: WIND_SOURCE_URL, license: WIND_LICENSE, licenseUrl: WIND_LICENSE_URL, changes: WIND_CHANGES } : null,
  };
}

// ---------------------------------------------------------------------------
// The game sheet
// ---------------------------------------------------------------------------
/**
 * Team records in words (DP-16): "Seahawks 3–1 · Broncos 2–2", from the public team-records file, with when it was
 * read ("as of Thu Oct 8"), so a file from before the latest finals never reads as current. Null when the file is for
 * another season or lacks a team.
 */
export function recordsInWords(records, season, game) {
  if (!record(records) || records.season !== season || !record(records.teams)) return null;
  const text = code => {
    const r = records.teams[code]?.overall;
    if (!record(r) || ![r.w, r.l, r.t].every(Number.isInteger)) return null;
    return `${teamOf(code).nick} ${r.w}–${r.l}${r.t ? `–${r.t}` : ''}`;
  };
  const away = text(game.away), home = text(game.home);
  if (!away || !home) return null;
  const asOf = toMs(records.retrieved_at);
  return { text: `${away}${SEP}${home}`, asOf: asOf === null ? '' : `Records as of ${fmtDate(asOf)}` };
}

/** "Thu Oct 15 · 5:15 PM PT · TNF · Denver · Division game" from the slate, the venue table and the trends file. */
export function whenLine(game, { season = null, week = null, trendsGame = null } = {}) {
  const venue = Number.isInteger(season) && Number.isInteger(week) ? venueFor(season, week, game.id) : null;
  const flags = trendsGame?.flags ?? {};
  return [fmtDate(game.kickoff), `${fmtTime(game.kickoff)} PT`, ['TNF', 'SNF', 'MNF'].includes(flags.day) ? flags.day : null,
    venue?.city ?? null, flags.divisional ? 'Division game' : null].filter(Boolean).join(SEP);
}

/** "You on this game": one row per market, the viewer's own pick and what it opens. */
export function youRows(personal, community, game) {
  const rules = liveRules(personal?.rules);
  const access = accessFor(personal, community, game.id);
  const now = toMs(personal?.now);
  if (now === null) return [];
  return MARKETS.map(market => {
    const s = guessState({ kickoff: game.kickoff, deadline: personal?.deadline ?? null, entry: ownEntry(personal, game.id, market),
      forfeit: forfeitFor(personal, community, market), now, rules });
    const label = copy.marketName(market);
    const own = lineAtGuess(personal, game, market, access);
    const row = { market, label, main: '', sub: '', locked: false, late: s.late ? s.lateText : '' };
    if (s.state === 'open') { row.main = s.label; row.sub = s.closesAt !== null ? copy.dueAt(fmtWhen(s.closesAt)) : ''; }
    else if (s.state === 'draft') { row.main = `${s.label} ${pickText(game, market, s.value)}`; row.sub = access[market] ? '' : copy.lineLocked(market, rules); row.locked = !access[market]; }
    else if (s.state === 'lockedIn') {
      row.main = `${s.label} ${pickText(game, market, s.value)}`;
      row.sub = own?.pending ? LINES_COPY.linePending : own ? `${LINES_COPY.lineAtGuess} ${own.text}` : '';
    } else if (s.state === 'forfeited') row.main = s.label;
    else row.main = s.unsentDraft !== null ? copy.closedDraft(pickText(game, market, s.unsentDraft), { rules, atKickoff: s.closedAtKickoff }) : s.label;
    return row;
  });
}

/**
 * The game sheet's weather row, on every game (D-45; shared/weather-view.mjs weatherRow decides the kind):
 * - forecast: closed by default with no digits, links or values (D-34): "Kickoff forecast" or "Final pre-kickoff
 *   forecast", plus "Roof may close" for a retractable roof. Open, it gives the stadium, the values, every time in
 *   Pacific time, the band and honesty notes and the Open-Meteo credit beside them.
 * - indoors: a dome, SoFi Stadium's canopy or a closed roof: "Indoors" and the stadium; no numbers, no credit, nothing
 *   to open.
 * - none: "No current forecast" (and "Roof may close"); open, when it appears for a game more than 5 days out, or that
 *   the last one is out of date. A 404, a failed read and a signed-out viewer read the same. Nothing is invented.
 * - loading: while the read is in flight (never for an indoor game, which needs no read).
 * `entry` is /wind/read's game and `now` the server time for its ages.
 */
export function sheetWeatherRow({ game, trendsGame = null, entry = null, now = null, loading = false, season = null, week = null, windCard = null } = {}) {
  const shape = weatherGame(game, { trendsGame, season, week });
  const venue = entry?.venue ?? null, forecast = entry?.wind ?? null;
  const row = weatherRow(shape, venue, forecast, now);
  const base = { title: LINES_COPY.weather, kind: row.kind, roofNote: row.roofNote };
  if (row.kind === 'indoors') {
    const at = row.venue?.name ? `${row.venue.name}${row.venue.city ? `, ${row.venue.city}` : ''}` : null;
    return { ...base, state: 'indoors', summary: [WEATHER_INDOORS, at].filter(Boolean).join(SEP), detail: null };
  }
  if (row.kind === 'none') {
    if (loading) return { ...base, state: 'loading', summary: WIND_COPY.loading, detail: null };
    const why = row.reason === 'not_yet' ? WIND_COPY.later : row.reason === 'stale' ? WIND_COPY.stale : null;
    return { ...base, state: 'none', summary: [WEATHER_NONE, row.roofNote].filter(Boolean).join(SEP), detail: why ? { lines: [why] } : null };
  }
  // A current forecast: windView (the same call weatherRow made) gives the band, the close call and the ages.
  const kickoff = toMs(shape.kickoff);
  const view = windView({ game: shape, now, entry: { kickoff: kickoff === null ? null : new Date(kickoff).toISOString(), venue, wind: forecast } });
  const { wind, band } = view, final = view.state === 'final';
  const one = value => (value < 0 ? `${MINUS}${Math.abs(value).toFixed(1)}` : value.toFixed(1));
  const from = compass(wind.directionDeg);
  const place = view.venue ? `${view.venue.name}, ${view.venue.city}` : null;
  const values = [
    { label: 'Wind at kickoff', value: `${one(wind.windMph)} mph${from ? ` from the ${from}` : ''}` },
    { label: 'Gusts', value: finite(wind.gustMph) ? `up to ${one(wind.gustMph)} mph in the kickoff hour` : 'not available' },
    { label: 'Temperature', value: finite(wind.temperatureF) ? `${one(wind.temperatureF)} °F` : 'not available' },
    { label: 'Chance of rain or snow', value: finite(wind.precipitationProbability) ? `${wind.precipitationProbability}%` : 'not available' },
  ];
  const bandText = band.band === '15+' ? 'If this holds, both strong-wind records (10+ and 15+ mph, both Under) would fit this game.'
    : band.band === '10-14' ? 'If this holds, the 10+ mph Under record would fit this game; the 15+ mph one would not.'
      : 'If this holds, neither strong-wind record would fit this game.';
  const selected = windCard?.selection?.rec;
  const recordNote = Array.isArray(selected) && selected.length === 3 ? ` (${windCard.selection.label}: ${recordText(...selected)})` : '';
  return {
    ...base,
    state: view.state,
    summary: [final ? 'Final pre-kickoff forecast' : 'Kickoff forecast', row.roofNote].filter(Boolean).join(SEP),
    detail: {
      place,
      values,
      time: `Forecast for the ${fmtTime(wind.forecastHour).replace(':00', '')} PT hour (kickoff ${fmtTime(view.kickoff)} PT)${SEP}updated ${fmtAge(view.age)} ago${SEP}made ${fmtAge(view.made)} before kickoff${SEP}${view.confidence}`,
      lines: [
        bandText,
        view.close ? 'Within 3 mph of a threshold. Forecasts this far out often miss by more than that.' : null,
        view.retractable ? 'Retractable roof: the wind matters only if the roof is open, which is decided on game day.' : null,
        `How far to trust this: the strong-wind record${recordNote} was measured with observed kickoff wind. Using it with a forecast has not been backtested. Reference only; never changes your score.`,
      ].filter(Boolean),
      credit: footer({ forecastShown: true }).wind,
    },
  };
}

/** The referee row: hidden until a referee is known (the commissioner's assignment, else the trends file's). */
export function refereeRow(trends, gameId, officials) {
  if (!trends) return null;
  const assigned = refereeFor(trends, gameId, officials);
  if (!assigned.name) return null;
  return { name: assigned.name, source: assigned.source === 'commissioner' ? 'Set by the commissioner' : 'From this week’s trends file' };
}

/**
 * What a sheet says in place of its trends until they can show, true for each state: still loading, failed, no file
 * for the week yet ("publish after Monday night’s final"), or a file that does not hold this game. Empty once ready.
 */
function trendsNotice(status, week) {
  if (status === 'ready') return '';
  if (status === 'error') return LINES_COPY.trendsFailed;
  if (status === 'missing') return LINES_COPY.trendsMissing(week);
  if (status === 'none') return LINES_COPY.trendsNone;
  return LINES_COPY.trendsLoading;
}

/**
 * The game sheet's view: header, "You on this game", the top three trends for this game (strongest first, each with
 * its record and sample size; a line trend locked with its market) and the trends' status. `trends` is the week file
 * (or null) and `trendsStatus` its load state (useTrendWeek's: 'idle', 'loading', 'ready', 'missing' or 'error'). With
 * no file in hand the sheet never claims one is missing unless the load said so: 'idle', or 'ready' without a file,
 * reads as still loading.
 */
export function gameSheet({ personal, community = null, trends = null, trendsStatus = 'loading', records = null, gameId } = {}) {
  const shown = weekOf(personal);
  const game = gamesOf(personal).find(g => g.id === gameId) ?? null;
  if (!game) return null;
  const away = teamOf(game.away), home = teamOf(game.home);
  const access = accessFor(personal, community, game.id);
  const sameWeek = trends && shown && trends.season === shown.season && trends.week === shown.week;
  const trendsGame = sameWeek ? trends.games?.find(g => g.id === game.id) ?? null : null;
  const saved = Object.fromEntries(MARKETS.map(market => [market, lineAtGuess(personal, game, market, access)?.value ?? null]));
  const found = trendsGame ? gameTrends(trends, game.id, { access, saved, names: TEAM_NAMES }) : null;
  const now = toMs(personal?.now);
  const status = !trends ? (trendsStatus === 'missing' || trendsStatus === 'error' ? trendsStatus : 'loading') : sameWeek ? (trendsGame ? 'ready' : 'none') : 'missing';
  return {
    id: game.id,
    title: `${away.code} @ ${home.code}`,
    away, home, kickoff: game.kickoff,
    started: now !== null && now >= toMs(game.kickoff),
    when: whenLine(game, { ...(shown ?? {}), trendsGame }),
    records: shown ? recordsInWords(records, shown.season, game) : null,
    you: youRows(personal, community, game),
    access,
    saved,
    rules: liveRules(personal?.rules),
    trends: {
      status,
      top: found?.top ?? [],
      count: found?.all.length ?? 0,
      empty: trendsGame && !found?.top.length ? LINES_COPY.noTrend : '',
      missing: shown ? LINES_COPY.trendsMissing(shown.week) : '',
      notice: trendsNotice(status, shown?.week),
    },
    trendsGame,
    footer: footer(),
  };
}

/** The lock on a line trend, worded for the live rules: "Submit your Spread picks to see this trend." */
export function lockedTrendText(gate, rules) {
  if (gate === 'both') return liveRules(rules).sentFinal ? 'Lock in your Spread and Total picks for this game to see this trend.' : 'Submit your Spread and Total picks to see this trend.';
  return copy.lineLocked(gate, rules).replace('this line.', 'this trend.');
}
/** The lock on a market's line-based records in the All trends sheet. */
export function lockedRecordsText(market, rules) {
  return copy.lineLocked(market, rules).replace('this line.', `its ${copy.marketName(market)} line-based records.`);
}
