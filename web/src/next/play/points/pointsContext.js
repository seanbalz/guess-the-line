// Player context on the Points ballot (Board i63): what a slot's sheet shows about the player from the week's public
// Fantasy Track 1 snapshot (D-57, read signed in through /fantasy/week, the committed copy as fallback). Pure: no React,
// storage or network. Every average comes from completed games only, with its game count; a missing value is null and
// is drawn as "—", never 0.
//
// Two values stay off this strip on purpose:
// - GTL's weekly estimate. It IS the slot's House (shared/points-jobs.mjs scores the snapshot's weekly stats in Full PPR
//   with 4-point passing TDs and rounds to the tenth), so it opens only once the read carries the House for this viewer:
//   after he locks in the slot, or at its kickoff (D-56; cloud/points.mjs decides). `estimateOpen` says when.
// - Implied team totals (D-57): never shown here.
import { SCORING_OPTIONS, formatFantasyNumber } from '../../../../../shared/fantasy-rankings.mjs';
import { opponentAllowed, playerWeeks, summarize } from '../../../../../shared/fantasy-tools.mjs';
import { matchupCodes } from './pointsModel.js';

export const CONTEXT_COPY = Object.freeze({
  title: 'Player context',
  scoring: 'Full PPR per game, completed games only',
  loading: 'Loading player context…',
  unavailable: week => `Player context isn’t available for Week ${week} yet.`,
  failed: 'Player context could not be loaded.',
  retry: 'Try again',
  notInSnapshot: 'Not in this week’s player data',
  profile: 'Open profile',
  // The profile's estimate card before the gate opens (D-56).
  estimateLocked: 'GTL’s estimate for this week is the House. It opens once you lock in this player, or at his kickoff.',
});

const PLURAL = Object.freeze({ QB: 'QBs', RB: 'RBs', WR: 'WRs', TE: 'TEs' });
const AS_OF = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** The read's own scoring (Full PPR, 4-point passing TDs) as the Fantasy tools' settings. */
export function contextSettings(read) {
  const format = read?.scoringRules?.format;
  const passingTds = read?.scoringRules?.passingTds;
  return { scoring: SCORING_OPTIONS.some(option => option.value === format) ? format : 'ppr', passingTds: passingTds === 6 ? 6 : 4 };
}

/** D-56: the House (this same snapshot's estimate) shows only once the read already carries it for this viewer. */
export const estimateOpen = slot => slot?.revealed === true && typeof slot?.house?.estimate === 'number' && Number.isFinite(slot.house.estimate);

/** One decimal, or "—" for missing. */
export const contextNumber = value => formatFantasyNumber(value);
/** "3 games", "1 game", "no games". */
export const gamesText = n => !Number.isInteger(n) || n <= 0 ? 'no games' : `${n} ${n === 1 ? 'game' : 'games'}`;
/** "Oct 29, 7:12 AM PT", or null. */
export function asOfText(iso) {
  const time = Date.parse(iso ?? '');
  return Number.isFinite(time) ? `${AS_OF.format(new Date(time))} PT` : null;
}

/** "@ DEN" or "vs KC" from the slot's own game key and team; null when the key has another form. */
function slotOpponent(slot) {
  const codes = matchupCodes(slot);
  if (!codes || !slot?.team) return null;
  if (slot.team === codes.away) return `@ ${codes.home}`;
  if (slot.team === codes.home) return `vs ${codes.away}`;
  return null;
}

/** The report's first part ("Limited Participation in Practice"), without the roster note after " · ". */
function statusText(status) {
  const head = typeof status === 'string' ? status.split(' · ')[0].trim() : '';
  return head || null;
}

/**
 * What the strip shows for one slot: `{ found, recent, season, opponent, allowed, status, asOf }`.
 * - recent / season: `{ value, games }` (Full PPR points per recorded game; recent is the last three calendar weeks);
 * - opponent: "@ DEN" (snapshot first, else the slot's game) or null; allowed: what that defense allowed per game to the
 *   slot's position in its completed games, `{ value, games, position, positions }`, or null when the snapshot has none;
 * - status: the game or practice report, or null; asOf: the snapshot's time as words, or null.
 * The weekly estimate is never part of it.
 */
export function slotContext(snapshot, slot, settings = { scoring: 'ppr', passingTds: 4 }) {
  const player = (snapshot?.players ?? []).find(row => row.id === slot?.playerId) ?? null;
  const asOf = asOfText(snapshot?.asOf);
  if (!player) {
    return { found: false, recent: { value: null, games: 0 }, season: { value: null, games: 0 }, opponent: slotOpponent(slot), allowed: null, status: null, asOf };
  }
  const summary = summarize(playerWeeks(snapshot, player, settings), snapshot.statsThroughWeek);
  const matchup = opponentAllowed(snapshot, player, settings);
  return {
    found: true,
    recent: { value: summary.recent.points.value, games: summary.recent.points.games },
    season: { value: summary.season.points.value, games: summary.season.points.games },
    opponent: matchup ? `${matchup.home ? 'vs' : '@'} ${matchup.defense}` : player.weekly?.opponent ?? slotOpponent(slot),
    allowed: matchup ? { value: matchup.season.value, games: matchup.season.games, position: matchup.position, positions: PLURAL[matchup.position] } : null,
    status: statusText(player.status),
    asOf,
  };
}
