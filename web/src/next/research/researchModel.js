// Research's landing (D-69 step 3, spec 5A) as plain data: the first card (this week's games and lines, or the latest
// week's results once every game has kicked off) and four tiles (Games, Trends, Fantasy, Teams). Pure: it reads only
// the shared /personal reply (its week, its games and the server's clock: the same read Home's This week and the Games
// board use; /community/read carries only a count of games) and this device's saved trends, so the landing makes no
// read of its own (no line, pick or Fantasy read: D-31, and Fantasy's chunk stays lazy). It counts the games the board
// lists (lines-view gamesOf: a game with no kickoff time is on neither). No moment kind lives on Research, so no tile
// shows NEW.
import { gamesOf, weekOf } from '../../../../shared/lines-view.mjs';
import { TEAM_NAMES } from '../../../../shared/nfl-schedule.mjs';
import { DESTINATION_ICONS } from '../ui/destinations.js';
import { DASH, SEP, fmtDay, fmtTime, fmtWhen, toMs } from '../format.js';
import { trendsTile } from '../home/homeModel.js';
import { RESEARCH_NAMES } from './researchNav.js';

export const RESEARCH_TILES = Object.freeze(['games', 'trends', 'fantasy', 'teams']);
export const RESEARCH_TILE_ICONS = Object.freeze({ games: DESTINATION_ICONS.games, trends: DESTINATION_ICONS.trends, fantasy: DESTINATION_ICONS.fantasy, teams: DESTINATION_ICONS.teams });
export const LANDING_COPY = Object.freeze({ loading: 'Loading this week’s games…', failed: 'This week didn’t load.', tryAgain: 'Try again' });
// gamesOf's own reading of a kickoff, so a game it lists always has a time here.
const at = value => toMs(value) ?? NaN;
const kickedOff = (game, now) => Number.isFinite(now) && Number.isFinite(at(game.kickoff)) && now >= at(game.kickoff);

/**
 * The games the Games board lists, from the /personal read, in its kickoff order (lines-view gamesOf: a game without a
 * kickoff time is left off both): ids, codes and kickoffs only (D-31).
 */
export function weekGamesOf(personal) {
  return gamesOf(personal).map(g => ({ id: g.id, awayCode: g.away, homeCode: g.home, kickoff: g.kickoff }));
}
/** The server's clock in the /personal read (ms), or null; never the device's. */
export function researchClock(personal) {
  const now = typeof personal?.now === 'string' ? Date.parse(personal.now) : NaN;
  return Number.isFinite(now) ? now : null;
}
/** The week's last kickoff (ms): after it nothing on the landing changes. Null without one. */
export function lastKickoffOf(personal) {
  const times = weekGamesOf(personal).map(g => at(g.kickoff)).filter(Number.isFinite);
  return times.length ? Math.max(...times) : null;
}
/** Where the landing's clock stops ticking: the last kickoff, or 0 (stop at once) when no game has a time to wait for. */
export const clockUntil = personal => lastKickoffOf(personal) ?? 0;

/** The first card. `target` is the section its one lime button opens. */
export function researchHero(personal, now) {
  const week = weekOf(personal)?.week ?? null;
  const games = weekGamesOf(personal), n = games.length, noun = n === 1 ? 'game' : 'games';
  if (week === null || !n) return { kind: 'none', week, eyebrow: RESEARCH_NAMES.title, title: 'No week is open yet', meter: null, line: 'Trends, teams and Fantasy are still here.', action: 'Open trends', target: 'trends' };
  const started = games.filter(g => kickedOff(g, now)).length;
  if (started < n) return { kind: 'week', week, eyebrow: `Week ${week}${SEP}This week’s lines`, title: `${n} ${noun}`, meter: { done: started, of: n }, line: `${started} of ${n} kicked off`, action: 'Open games', target: 'games' };
  return { kind: 'played', week, eyebrow: `Week ${week}${SEP}Results`, title: `Week ${week} results`, meter: { done: n, of: n }, line: n === 1 ? 'The game kicked off' : `All ${n} games kicked off`, action: 'See results', target: 'games' };
}

/**
 * The four tiles. `next` is the Games tile's next game (its marks are the tile's picture); `open` the section view it
 * opens. Every game counted has a kickoff time (weekGamesOf), so with no next game every game has kicked off.
 */
export function researchTiles({ personal = null, now = null, saved = [], failed = false } = {}) {
  const games = weekGamesOf(personal), week = weekOf(personal)?.week ?? null;
  const next = games.find(g => !kickedOff(g, now)) ?? null;
  const gamesTile = failed ? { big: DASH, sub: 'Not loaded', ariaLabel: 'Games, not loaded', next: null }
    : week === null || !games.length ? { big: DASH, sub: 'No week open', ariaLabel: 'Games, no week open', next: null }
    : next ? { big: fmtTime(next.kickoff), sub: `${fmtDay(next.kickoff)}${SEP}next game`, ariaLabel: `Games, next game ${next.awayCode} at ${next.homeCode}, ${fmtWhen(next.kickoff)}`, next }
    : { big: String(games.length), sub: games.length === 1 ? 'kicked off' : 'all kicked off', ariaLabel: games.length === 1 ? 'Games, the game kicked off' : `Games, all ${games.length} kicked off`, next: null };
  const trends = trendsTile(saved), teams = Object.keys(TEAM_NAMES).length;
  return [
    { key: 'games', label: RESEARCH_NAMES.games, icon: RESEARCH_TILE_ICONS.games, ...gamesTile, open: { section: 'games' } },
    { key: 'trends', label: RESEARCH_NAMES.trends, icon: RESEARCH_TILE_ICONS.trends, next: null, big: trends.big, sub: trends.sub, ariaLabel: trends.ariaLabel, open: trends.open },
    { key: 'fantasy', label: RESEARCH_NAMES.fantasy, icon: RESEARCH_TILE_ICONS.fantasy, next: null, big: DASH, sub: 'Player rankings', ariaLabel: 'Fantasy, player rankings', open: { section: 'fantasy' } },
    { key: 'teams', label: RESEARCH_NAMES.teams, icon: RESEARCH_TILE_ICONS.teams, next: null, big: String(teams), sub: 'Records and margins', ariaLabel: `Teams, all ${teams}, records and margins`, open: { section: 'teams' } },
  ];
}
