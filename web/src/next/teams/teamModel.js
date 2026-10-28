// What the team screens show (D-62), as plain values: a team's record, home and road records, points per game, the
// last five results, the margin of each final, the season's games and the next one. Pure: no React, clock, storage or
// network. Input is the season shape teamsData.js builds (from POST /lines/teams, or the bundled records file with
// `games: []` and `fallback: true`). There is never a market here: a game carries final scores or nothing.
import { teamRecordText, teamName } from '../ui/Matchup.jsx';
import { teamCode } from '../ui/TeamMark.jsx';
import { fmtFull, toMs } from '../format.js';

const RESULTS = Object.freeze({
  W: Object.freeze({ word: 'WIN', verb: 'won', tone: 'win' }),
  L: Object.freeze({ word: 'LOSS', verb: 'lost', tone: 'loss' }),
  T: Object.freeze({ word: 'TIE', verb: 'tied', tone: 'pending' }),
});
const count = n => Number.isSafeInteger(n) && n >= 0;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const byWeek = (a, b) => a.week - b.week || (toMs(a.kickoff) ?? 0) - (toMs(b.kickoff) ?? 0);

/** One team's entry in a season (`{ overall, home, road, pointsFor, pointsAgainst, games }`), or null. */
export function teamOf(season, code) {
  const label = teamCode(code);
  return label === '—' ? null : season?.teams?.[label] ?? null;
}

/** "4–2" (or "4–2–1") for a team's overall record; null when the season has no record for it. */
export const recordOf = (season, code) => teamRecordText(teamOf(season, code)?.overall);

/**
 * Both sides' records for a Matchup (`{ away: '4–2', home: '3–3' }`), or null when neither is known or the season is
 * not the game's season (a 2026 file never labels a 2027 game).
 */
export function matchupRecords(season, away, home, gameSeason = null) {
  if (!season || (Number.isInteger(gameSeason) && season.season !== gameSeason)) return null;
  const records = { away: recordOf(season, away), home: recordOf(season, home) };
  return records.away || records.home ? records : null;
}

/** "Through Week 7" from the season's last counted week; null when it is not known. */
export const throughText = season => (Number.isInteger(season?.throughWeek) && season.throughWeek > 0 ? `Through Week ${season.throughWeek}` : null);
/** "Records through Week 7", the one meta line beside records on a pick screen. */
export const recordsThroughText = season => (throughText(season) ? `Records through Week ${season.throughWeek}` : null);

/** Points per game over the counted finals: `{ scored: '24.1', allowed: '19.3', games }`, or null without totals. */
export function pointsPerGame(team) {
  const o = team?.overall;
  if (!o || ![o.w, o.l, o.t ?? 0].every(count) || !finite(team.pointsFor) || !finite(team.pointsAgainst)) return null;
  const games = o.w + o.l + (o.t ?? 0);
  if (!games) return null;
  return { scored: (team.pointsFor / games).toFixed(1), allowed: (team.pointsAgainst / games).toFixed(1), games };
}

/** The finals with a score, oldest first (a final without both scores is listed but never charted). */
export function finals(team) {
  return (team?.games ?? []).filter(g => g.final && finite(g.pf) && finite(g.pa) && RESULTS[g.result]).sort(byWeek);
}

/** "vs DEN" at home or on a neutral field, "@ DEN" on the road. */
export const whereText = game => `${game.home || game.neutral ? 'vs' : '@'} ${teamCode(game.opponent)}`;
/** "24–17", the team's points first. */
export const scoreText = game => `${game.pf}–${game.pa}`;

/** Up to the last five finals, oldest first: `{ week, result: 'W', word: 'WIN', tone: 'win', words }`. */
export function lastFive(team) {
  return finals(team).slice(-5).map(g => ({ week: g.week, result: g.result, word: RESULTS[g.result].word, tone: RESULTS[g.result].tone,
    words: `Week ${g.week}: ${RESULTS[g.result].word.toLowerCase()} ${scoreText(g)} ${whereText(g)}` }));
}

/**
 * One point per final, oldest first: `{ week, margin, result, tone, label, words }`. `label` is the chart's readout
 * ("Week 3 · W 24–17 vs DEN"); `words` is the same game for a screen reader ("Week 3, won 24–17 vs Denver Broncos").
 */
export function marginSeries(team) {
  return finals(team).map(g => ({
    key: `${g.week}:${g.gameId}`,
    week: g.week, margin: g.pf - g.pa, result: g.result, tone: RESULTS[g.result].tone,
    label: `Week ${g.week} · ${g.result} ${scoreText(g)} ${whereText(g)}`,
    words: `Week ${g.week}, ${RESULTS[g.result].verb} ${scoreText(g)} ${g.home || g.neutral ? 'vs' : 'at'} ${teamName(g.opponent)}`,
  }));
}

/** The plotted margin range, always including zero: `{ low, high }`, or null with no finals. */
export function marginExtent(series) {
  if (!series.length) return null;
  const values = series.map(p => p.margin);
  return { low: Math.min(0, ...values), high: Math.max(0, ...values) };
}

/** "+21 to −14 points", the chart's range in words; "0 points" when every final was a tie. */
export function marginRangeText(extent) {
  if (!extent) return null;
  const n = v => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0');
  return extent.low === extent.high ? '0 points' : `${n(extent.high)} to ${n(extent.low)} points`;
}

/** The first game not yet final, by week (null once the season is over or without a game list). */
export const nextGame = team => (team?.games ?? []).filter(g => !g.final).sort(byWeek)[0] ?? null;

/** "SEA-DEN" as `{ away, home }`; else from the home flag and the opponent. */
function sides(team, code, game) {
  const [away, home] = typeof game.gameId === 'string' ? game.gameId.split('-').map(teamCode) : [];
  if (away && home && away !== '—' && home !== '—') return { away, home };
  return game.home ? { away: teamCode(game.opponent), home: code } : { away: code, home: teamCode(game.opponent) };
}

/**
 * The season's games, by week: each with its sides (away @ home), and either the result (`word` WIN / LOSS / TIE,
 * `tone`, `score` "24–17") or, before it is final, the kickoff in Pacific time. `next` marks the next game.
 */
export function seasonRows(team, code) {
  const label = teamCode(code), upcoming = nextGame(team);
  return [...(team?.games ?? [])].sort(byWeek).map(g => {
    const scored = g.final && finite(g.pf) && finite(g.pa) && RESULTS[g.result];
    return {
      key: `${g.week}:${g.gameId}`, week: g.week, ...sides(team, label, g), final: Boolean(g.final), next: g === upcoming,
      word: scored ? RESULTS[g.result].word : g.final ? 'FINAL' : null, tone: scored ? RESULTS[g.result].tone : 'neutral',
      score: scored ? scoreText(g) : g.final ? '—' : null,
      when: g.final ? null : toMs(g.kickoff) === null ? 'Kickoff time not set' : fmtFull(g.kickoff),
    };
  });
}

/**
 * Everything the team sheet shows for `code`, or null when the season has no such team: the name and record, "Through
 * Week N", at most three tiles (home, road, points per game), the last five, the margins and the games.
 */
export function teamView(season, code) {
  const label = teamCode(code), team = teamOf(season, label);
  if (!team) return null;
  const ppg = pointsPerGame(team);
  const series = marginSeries(team);
  return {
    code: label,
    name: teamName(label),
    record: teamRecordText(team.overall),
    through: throughText(season),
    tiles: [
      { key: 'home', label: 'Home', value: teamRecordText(team.home) ?? '—' },
      { key: 'road', label: 'Road', value: teamRecordText(team.road) ?? '—' },
      ...(ppg ? [{ key: 'ppg', label: 'Points per game', scored: ppg.scored, allowed: ppg.allowed }] : []),
    ],
    lastFive: lastFive(team),
    margins: series,
    extent: marginExtent(series),
    rows: seasonRows(team, label),
    next: nextGame(team),
    fallback: season.fallback === true || !(team.games?.length),
  };
}
