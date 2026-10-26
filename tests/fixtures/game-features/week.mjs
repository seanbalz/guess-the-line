// Fixture weeks for the game-feature suites (redesign build plan stage 68). Every account, game, line, guess and bet here
// is made up: fictional players (u-ana ... u-eli), fictional scores, never live odds or a real player's picks.
import { normalizeWeek, pickPoints } from '../../../shared/game-features/week.mjs';

export const ANA = 'u-ana', BO = 'u-bo', CY = 'u-cy', DEE = 'u-dee', ELI = 'u-eli';
export const ROSTER = [ANA, BO, CY, DEE, ELI];
export const HOUR = 3_600_000;
/** Kickoffs: G1 first (Thursday 5:15 PM PST in Week 9), G2 and G3 three days later two hours apart, G4 last; a week later each week. */
export const BASE = Date.parse('2026-11-06T01:15:00Z');
export const kickoffAt = (week, n) => new Date(BASE + (week - 9) * 7 * 24 * HOUR + [0, 64, 66, 96][n - 1] * HOUR).toISOString();
const GAMES = [['G1', 'AAA', 'BBB'], ['G2', 'CCC', 'DDD'], ['G3', 'EEE', 'FFF'], ['G4', 'GGG', 'HHH']];

/** A scored guess (points from its own reference, as gtl_ballot_pick_scores gives them), or a pending one (reference null). */
export const guess = (userId, market, gameId, value, reference, extra = {}) => ({ userId, market, gameId, guess: value, reference,
  points: reference === null ? null : pickPoints(value, reference), ...extra });
/** A Virtual Units bet; `status` 'win' | 'loss' | 'push' | 'void' | 'pending'. */
export const bet = (userId, gameId, market, side, line, status = 'pending', extra = {}) => ({ userId, gameId, market, side, line, odds: -110, units: 1, status,
  netUnits: status === 'win' ? 0.9091 : null, ...extra });
/** Both markets sent for every game (the Pick streak). */
export const sent = (userId, market) => ({ userId, market, submitted: true, locked: GAMES.map(g => g[0]), closed: [], satOut: false, eligible: true });

/**
 * One normalized week. `results`: { G1: [home, away] | 'void' } (omitted games have no result yet); `kickoff`: kickoff lines
 * { G1: { spread, total } } (omitted: none); the rest are rows for the week.
 */
export function makeWeek({ season = 2026, week = 9, results = {}, kickoff = {}, guesses = [], ballots = [], bets = [], games = GAMES } = {}) {
  return normalizeWeek({
    season, week,
    games: games.map(([id, home, away], i) => ({ id, home, away, kickoff: kickoffAt(week, i + 1),
      result: results[id] === undefined ? null : results[id] === 'void' ? { status: 'void' } : { status: 'final', home: results[id][0], away: results[id][1] } })),
    kickoff, guesses, ballots, bets,
  });
}

/** Every game final (a 24–20 home win each), for awards that wait for the whole week. */
export const ALL_FINAL = Object.freeze({ G1: [24, 20], G2: [24, 20], G3: [24, 20], G4: [24, 20] });
