// Research's landing (D-69 step 3, spec 5A) as plain data: the first card (this week's games and lines, or the latest
// week's results once every game has kicked off) and four tiles (Games, Trends, Fantasy, Teams). Pure: it reads only
// the shared /community/read reply (its week's games and the server's clock, through home-view's homeHero) and this
// device's saved trends, so the landing makes no read of its own (no line, pick or Fantasy read: D-31, and Fantasy's
// chunk stays lazy). No moment kind lives on Research, so no tile shows NEW.
import { TEAM_NAMES } from '../../../../shared/nfl-schedule.mjs';
import { DESTINATION_ICONS } from '../ui/destinations.js';
import { DASH, SEP, fmtDay, fmtTime, fmtWhen } from '../format.js';
import { trendsTile } from '../home/homeModel.js';
import { RESEARCH_NAMES } from './researchNav.js';

export const RESEARCH_TILES = Object.freeze(['games', 'trends', 'fantasy', 'teams']);
export const RESEARCH_TILE_ICONS = Object.freeze({ games: DESTINATION_ICONS.games, trends: DESTINATION_ICONS.trends, fantasy: DESTINATION_ICONS.fantasy, teams: DESTINATION_ICONS.teams });
export const LANDING_COPY = Object.freeze({ loading: 'Loading this week’s games…', failed: 'This week didn’t load.', tryAgain: 'Try again' });
const at = value => (typeof value === 'string' ? Date.parse(value) : NaN);
const sortTime = game => (Number.isFinite(at(game.kickoff)) ? at(game.kickoff) : Infinity);
const kickedOff = (game, now) => Number.isFinite(now) && Number.isFinite(at(game.kickoff)) && now >= at(game.kickoff);

/** The week's games from the Community read, in kickoff order (a game without a time sorts last): ids, codes, kickoffs only. */
export function weekGamesOf(community) {
  const games = Array.isArray(community?.week?.games) ? community.week.games : [];
  return games.filter(g => g && typeof g.id === 'string').map(g => ({ id: g.id, awayCode: g.awayCode, homeCode: g.homeCode, kickoff: g.kickoff ?? null }))
    .sort((a, b) => sortTime(a) - sortTime(b));
}
/** The server's clock in the Community read (ms), or null; never the device's. */
export function researchClock(community) {
  const now = typeof community?.picksDue?.now === 'string' ? Date.parse(community.picksDue.now) : NaN;
  return Number.isFinite(now) ? now : null;
}
/** The week's last kickoff (ms): after it nothing on the landing changes. Null without one. */
export function lastKickoffOf(community) {
  const times = weekGamesOf(community).map(g => at(g.kickoff)).filter(Number.isFinite);
  return times.length ? Math.max(...times) : null;
}
/** Where the landing's clock stops ticking: the last kickoff, or 0 (stop at once) when no game has a time to wait for. */
export const clockUntil = community => lastKickoffOf(community) ?? 0;

/** The first card. `target` is the section its one lime button opens. */
export function researchHero(community, now) {
  const week = Number.isInteger(community?.week?.week) ? community.week.week : null;
  const games = weekGamesOf(community), n = games.length, noun = n === 1 ? 'game' : 'games';
  if (week === null || !n) return { kind: 'none', week, eyebrow: RESEARCH_NAMES.title, title: 'No week is open yet', meter: null, line: 'Trends, teams and Fantasy are still here.', action: 'Open trends', target: 'trends' };
  const started = games.filter(g => kickedOff(g, now)).length;
  if (started < n) return { kind: 'week', week, eyebrow: `Week ${week}${SEP}This week’s lines`, title: `${n} ${noun}`, meter: { done: started, of: n }, line: `${started} of ${n} kicked off`, action: 'Open games', target: 'games' };
  return { kind: 'played', week, eyebrow: `Week ${week}${SEP}Results`, title: `Week ${week} results`, meter: { done: n, of: n }, line: n === 1 ? 'The game kicked off' : `All ${n} games kicked off`, action: 'See results', target: 'games' };
}

/** The four tiles. `next` is the Games tile's next game (its marks are the tile's picture); `open` the section view it opens. */
export function researchTiles({ community = null, now = null, saved = [], failed = false } = {}) {
  const games = weekGamesOf(community), week = Number.isInteger(community?.week?.week) ? community.week.week : null;
  const next = games.find(g => Number.isFinite(at(g.kickoff)) && !kickedOff(g, now)) ?? null;
  const gamesTile = failed ? { big: DASH, sub: 'Not loaded', ariaLabel: 'Games, not loaded', next: null }
    : week === null || !games.length ? { big: DASH, sub: 'No week open', ariaLabel: 'Games, no week open', next: null }
    : next ? { big: fmtTime(next.kickoff), sub: `${fmtDay(next.kickoff)}${SEP}next game`, ariaLabel: `Games, next game ${next.awayCode} at ${next.homeCode}, ${fmtWhen(next.kickoff)}`, next }
    : games.every(g => kickedOff(g, now)) ? { big: String(games.length), sub: games.length === 1 ? 'kicked off' : 'all kicked off', ariaLabel: games.length === 1 ? 'Games, the game kicked off' : `Games, all ${games.length} kicked off`, next: null }
    : { big: DASH, sub: 'Time to be set', ariaLabel: 'Games, a kickoff time is not set', next: null };
  const trends = trendsTile(saved), teams = Object.keys(TEAM_NAMES).length;
  return [
    { key: 'games', label: RESEARCH_NAMES.games, icon: RESEARCH_TILE_ICONS.games, ...gamesTile, open: { section: 'games' } },
    { key: 'trends', label: RESEARCH_NAMES.trends, icon: RESEARCH_TILE_ICONS.trends, next: null, big: trends.big, sub: trends.sub, ariaLabel: trends.ariaLabel, open: trends.open },
    { key: 'fantasy', label: RESEARCH_NAMES.fantasy, icon: RESEARCH_TILE_ICONS.fantasy, next: null, big: DASH, sub: 'Player rankings', ariaLabel: 'Fantasy, player rankings', open: { section: 'fantasy' } },
    { key: 'teams', label: RESEARCH_NAMES.teams, icon: RESEARCH_TILE_ICONS.teams, next: null, big: String(teams), sub: 'Records and margins', ariaLabel: `Teams, all ${teams}, records and margins`, open: { section: 'teams' } },
  ];
}
