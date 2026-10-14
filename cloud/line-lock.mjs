// The line lock on the old Virtual Units routes (redesign build plan, stage 20; D-36 as amended by D-39). A game's
// Spread or Total line (every book offer and the consensus) stays hidden from a player until they lock in their
// Guess the Line pick for that game and market, sit out that market for the week (and, from M-03, skip or "See
// picks now", which write the same sit-out rows), or that game kicks off. Locking in one game's pick opens that
// game's line for that market only: the other market and the other games stay hidden. The player's own saved
// Virtual Units picks always keep their full terms; this module never touches them.
//
// The gate is the published community week's (the newest gtl_weekly_slates row, the week /community/read shows), not
// the group's league week: Guess the Line is played in the community week. A game of a group whose week differs (a
// group a week behind on a Monday) is not on that slate, so it opens only at its own kickoff.
//
// The database decides, in this order:
// 1. `gtl_markets_visible(viewer, season, week, now)` (M-01, stage 16): the per-game gate every new reader uses. M-02
//    replaces only how a lock-in is recorded, so this module follows it without a change.
// 2. While that function is missing (PostgREST PGRST202, M-01 not applied yet), today's hosted gate:
//    `gtl_week_revealed(viewer, season, week, mode, now)` per market (D-23): the viewer submitted that market's ballot
//    (today a market is submitted whole, so every game in it is locked in), sat out that market, or the week's
//    deadline passed (today picks close at the deadline, so nothing can change after it; `revealAt: 'deadline'`).
//    It knows only today's rules, so it is used only while `gtl_live_rules()` reports them.
// 3. Anything else (a read that fails, an answer of the wrong shape, rules this module does not know): every market
//    stays locked until its game's kickoff. The lock never fails open.
import { FEATURE_OFF } from './optional-rpc.mjs';

export const LINE_MARKETS = Object.freeze(['spread', 'total']);
const MODE = Object.freeze({ spread: 'guess_spread', total: 'guess_total' });
const NAME = Object.freeze({ spread: 'Spread', total: 'Total' });

/** Nothing could be read, or nothing is open: every market stays locked until its game's kickoff. */
export const CLOSED_GATE = Object.freeze({ season: null, week: null, games: null, markets: null });

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const weekNumber = value => Number.isInteger(value) && value >= 1 && value <= 25;
const seasonNumber = value => Number.isInteger(value) && value >= 2000 && value <= 2200;

/** `gtl_markets_visible`'s answer, `{ gameId: { spread, total } }`, checked: only booleans pass, anything else throws. */
export function parseMarketsVisible(raw) {
  if (!record(raw)) throw new Error('Invalid line gate.');
  const games = Object.create(null);
  for (const [gameId, markets] of Object.entries(raw)) {
    if (!record(markets) || typeof markets.spread !== 'boolean' || typeof markets.total !== 'boolean') throw new Error('Invalid line gate.');
    games[gameId] = Object.freeze({ spread: markets.spread, total: markets.total });
  }
  return Object.freeze(games);
}

/**
 * The viewer's gate for the published community week. Never rejects: whatever it cannot read comes back as
 * CLOSED_GATE. `service.publishedWeek()` resolves to `{ season, week }` or null; `service.weekRevealed(user, season,
 * week, mode, nowIso)` to a boolean; `optionalRpc` is cloud/optional-rpc.mjs's caller; `rules` the live rules (or a
 * promise of them, cloud/live-rules.mjs, which never rejects).
 */
export async function readLineGate({ userId, service, optionalRpc, rules, now }) {
  try {
    if (typeof service?.publishedWeek !== 'function') return CLOSED_GATE;
    const published = await service.publishedWeek();
    if (!published) return CLOSED_GATE;
    const { season, week } = published;
    if (!seasonNumber(season) || !weekNumber(week)) return CLOSED_GATE;
    const at = new Date(now).toISOString();
    if (typeof optionalRpc === 'function') {
      const visible = await optionalRpc('gtl_markets_visible', { p_user: userId, p_season: season, p_week: week, p_now: at });
      if (visible !== FEATURE_OFF) return Object.freeze({ season, week, games: parseMarketsVisible(visible), markets: null });
    }
    // Today's gate knows only today's rules: a market submitted whole, picks closed at the deadline.
    const live = await rules;
    if (live?.sentFinal !== false || live?.lateWindow !== 'deadline' || typeof service.weekRevealed !== 'function') return CLOSED_GATE;
    const [spread, total] = await Promise.all(LINE_MARKETS.map(market => service.weekRevealed(userId, season, week, MODE[market], at)));
    return Object.freeze({ season, week, games: null, markets: Object.freeze({ spread: spread === true, total: total === true }) });
  } catch {
    return CLOSED_GATE;
  }
}

/**
 * `{ spread, total }`, true where the viewer may not see this game's line yet. `season` and `week` are the week the
 * game belongs to (the Virtual Units reply's, which is the group's); only a game of the gate's own week can open
 * before kickoff. A kickoff the server cannot read never opens anything.
 */
export function lockedMarkets(game, { season, week, gate, now }) {
  const kickoff = Date.parse(game?.kickoff);
  if (Number.isFinite(kickoff) && now >= kickoff) return { spread: false, total: false };
  const sameWeek = gate?.season != null && gate.season === season && gate.week === week && typeof game?.id === 'string';
  const open = market => sameWeek && (gate.games
    ? Object.hasOwn(gate.games, game.id) && gate.games[game.id][market] === true
    : gate.markets?.[market] === true);
  return { spread: !open('spread'), total: !open('total') };
}

/** The lock sentence for one market, worded for the live rules (the new app's copy.js `lineLocked` says the same). */
export function lineLockedSentence(market, rules) {
  const name = NAME[market] ?? 'Guess the Line';
  return rules?.sentFinal === true ? `Lock in your ${name} pick to see this line.` : `Submit your ${name} picks to see this line.`;
}
