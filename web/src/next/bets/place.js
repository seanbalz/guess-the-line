// Bets › Virtual › Your picks (redesign stages 43 and 44; M-10 read, M-11 place). Pure: it turns POST /bets/read into
// what the placing screen draws, and a slip into the POST /bets/place body. It decides nothing the server has not:
// - a market shows prices only where the reply opens it for this viewer (`markets[game][market].visible`); a closed
//   market draws a lock and a sentence, so a line reaches the screen only through that gate;
// - the price offered is the reply's best named-book offer for that side; the slip sends that offer's exact terms and
//   the server compares them with the book's newest saved quote;
// - your own bet always shows in full; editing it sends the terms you read (`expected`), so a bet changed on another
//   device is refused with "This bet changed" instead of being overwritten;
// - a game that has kicked off takes no new bet or edit.
import { DASH, MINUS, fmtOdds, fmtU } from '../format.js';
import { pickText, sideText } from './everyone.js';
import { QUALIFY_PICKS, QUALIFY_UNITS, weekFromPicks } from '../../../../shared/bets-qual.mjs';

const MARKETS = ['spread', 'total'];
const SIDES = Object.freeze({ spread: ['away', 'home'], total: ['over', 'under'] });
const MARKET_NAME = Object.freeze({ spread: 'Spread', total: 'Total' });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);

/** Stage 44: quick stakes from 0.5 to 3 units; the stepper goes past 3 in half units. */
export const UNIT_CHIPS = Object.freeze([0.5, 1, 1.5, 2, 2.5, 3]);
export const MAX_UNITS = 100;

export const PLACE_COPY = Object.freeze({
  locked: market => `Lock in your ${MARKET_NAME[market]} guess for this game to see its prices and place a bet.`,
  banner: 'Prices show for each game after you lock in that game’s guess.',
  started: 'Started · bets closed',
  noOffer: 'No saved price',
  unpublished: 'This week’s games are not published yet.',
  empty: 'Tap a price to add it to your slip.',
  priceMoved: 'Price moved',
  notOpen: 'Placing Virtual Units bets opens soon. Your saved picks are safe.',
  changed: 'A bet changed since you opened it. Prices and your saved bets are refreshed; review your slip and place it again.',
});

const terms = selection => ({ side: selection.side, line: selection.line, odds: selection.odds, units: selection.units,
  source: selection.source, quotedAt: selection.quotedAt });
const offerOk = (market, side, offer) => record(offer) && offer.side === side && finite(offer.line) && Number.isInteger(offer.odds)
  && typeof offer.source === 'string' && typeof offer.observedAt === 'string' && Number.isFinite(Date.parse(offer.observedAt));

/** "DEN −3 · −110" for an offer or a saved bet. */
export function priceText(game, market, value) {
  return `${pickText(game, market, value)} · ${finite(value?.odds) ? fmtOdds(value.odds) : DASH}`;
}

/**
 * `{ published, season, week, now, closed, games }`. A game is `{ id, awayCode, homeCode, kickoff, started, faces, markets }`;
 * a market is `{ market, name, visible, locked, sides, mine }`, a side `{ side, label, offer, text }`, and `mine` your saved
 * bet `{ selection, text, units, status, moved }` (moved: the offer for your side no longer has your line and price).
 */
export function placeBoard(data, viewer) {
  const reply = record(data) ? data : {};
  if (reply.published !== true) return { published: false, season: reply.season ?? null, week: reply.week ?? null, now: reply.now ?? null, closed: false, games: [] };
  const nowMs = Date.parse(reply.now);
  const roster = (Array.isArray(reply.roster) ? reply.roster : []).filter(row => typeof row?.userId === 'string');
  const display = id => roster.find(row => row.userId === id)?.displayName || (id === viewer ? 'You' : 'Player');
  const bets = (Array.isArray(reply.bets) ? reply.bets : []).filter(bet => typeof bet?.userId === 'string' && MARKETS.includes(bet?.market));
  let closed = false;
  const games = (Array.isArray(reply.games) ? reply.games : []).filter(game => typeof game?.id === 'string')
    .slice().sort((a, b) => (Date.parse(a.kickoff) || 0) - (Date.parse(b.kickoff) || 0) || a.id.localeCompare(b.id))
    .map(game => {
      const started = !Number.isFinite(Date.parse(game.kickoff)) || !(nowMs < Date.parse(game.kickoff));
      const faces = [...new Set((Array.isArray(reply.faces?.[game.id]) ? reply.faces[game.id] : []))]
        .map(id => ({ id, name: id === viewer ? 'You' : display(id), display: display(id), you: id === viewer }))
        .sort((a, b) => Number(b.you) - Number(a.you));
      const markets = MARKETS.map(market => {
        const cell = reply.markets?.[game.id]?.[market];
        const visible = cell?.visible === true;
        if (!visible && !started) closed = true;
        const own = bets.find(bet => bet.userId === viewer && bet.gameId === game.id && bet.market === market);
        const sides = SIDES[market].map(side => {
          const offer = visible && offerOk(market, side, cell.offers?.[side]) ? cell.offers[side] : null;
          return { side, label: sideText(game, market, side), offer, text: offer ? priceText(game, market, offer) : null };
        });
        let mine = null;
        if (own && record(own.selection) && finite(own.selection.units)) {
          const current = sides.find(entry => entry.side === own.selection.side)?.offer;
          mine = { selection: own.selection, text: priceText(game, market, own.selection), units: fmtU(own.selection.units), status: own.status ?? null,
            moved: Boolean(current && (current.line !== own.selection.line || current.odds !== own.selection.odds)) };
        }
        return { market, name: MARKET_NAME[market], visible, locked: !visible && !started ? PLACE_COPY.locked(market) : null, sides, mine };
      });
      return { id: game.id, awayCode: game.awayCode, homeCode: game.homeCode, kickoff: game.kickoff, started, faces, markets };
    });
  return { published: true, season: reply.season, week: reply.week, now: reply.now, closed, games };
}

export const slipKey = (gameId, market) => `${gameId}:${market}`;

/** The slip entries that can still be placed, each with the offer it would send. Stale entries drop out. */
export function slipEntries(board, slip) {
  return Object.entries(slip).flatMap(([key, entry]) => {
    const game = board.games.find(item => slipKey(item.id, entry.market) === key && item.id === entry.gameId);
    const market = game?.markets.find(item => item.market === entry.market);
    const side = market?.sides.find(item => item.side === entry.side);
    if (!game || game.started || !market?.visible || !side?.offer) return [];
    return [{ key, game, market, side, units: entry.units, edit: Boolean(market.mine) }];
  });
}

/** The POST /bets/place body. A new bet sends `expected: null`; an edit sends your saved terms as you read them. */
export function placeRequest(board, entries, requestId) {
  return { season: board.season, week: board.week, requestId, bets: entries.map(({ game, market, side, units }) => ({
    gameId: game.id, market: market.market, side: side.side, line: side.offer.line, odds: side.offer.odds, units,
    source: side.offer.source, quotedAt: side.offer.observedAt, expected: market.mine ? terms(market.mine.selection) : null,
  })) };
}

/** Half units only, from 0.5 up to MAX_UNITS. */
export function stepUnits(units, direction) {
  const next = Math.round(((finite(units) ? units : 1) + direction * 0.5) * 2) / 2;
  return Math.min(MAX_UNITS, Math.max(0.5, next));
}

/** Units a pending bet wins at its saved American odds (stake not included). */
export function toWinUnits(selection) {
  const units = selection?.units, odds = selection?.odds;
  if (!finite(units) || !finite(odds) || odds === 0) return 0;
  return odds > 0 ? units * odds / 100 : units * 100 / Math.abs(odds);
}

/**
 * Stage 45: your week on top of Your picks. `{ open, inPlay, toWin, record, units, ret, picks, qualified, meter }`:
 * open and in play count pending bets before and after their game's kickoff; to win is what the pending bets would net;
 * record, net units and return come from settled bets only (shared/bets-qual.mjs, the same arithmetic as the boards).
 * The meter counts toward the week's qualification: 3 bets or 3 units, whichever comes first.
 */
export function weekCard(data, viewer) {
  const reply = record(data) ? data : {};
  const nowMs = Date.parse(reply.now);
  const kickoff = Object.fromEntries((Array.isArray(reply.games) ? reply.games : []).map(game => [game.id, Date.parse(game.kickoff)]));
  const mine = (Array.isArray(reply.bets) ? reply.bets : []).filter(bet => bet?.userId === viewer && MARKETS.includes(bet?.market));
  const pending = mine.filter(bet => bet.status === 'pending' || bet.status == null);
  const started = bet => !(nowMs < kickoff[bet.gameId]);
  const week = weekFromPicks(mine);
  const units = Math.round(week.units * 100) / 100;
  return {
    open: pending.filter(bet => !started(bet)).length, inPlay: pending.filter(started).length,
    toWin: fmtU(Math.round(pending.reduce((sum, bet) => sum + toWinUnits(bet.selection), 0) * 100) / 100),
    record: `${week.wins}-${week.losses}${week.pushes ? `-${week.pushes}` : ''}`,
    units: week.riskUnits ? `${week.netUnits > 0 ? '+' : ''}${fmtU(week.netUnits)}` : DASH,
    ret: week.roi === null ? DASH : `${week.roi > 0 ? '+' : week.roi < 0 ? MINUS : ''}${Math.abs(week.roi)}%`,
    picks: week.picks, qualified: week.qualified,
    meter: { value: Math.min(QUALIFY_PICKS, Math.max(week.picks, Math.floor(units / QUALIFY_UNITS * QUALIFY_PICKS))),
      text: week.qualified ? 'Qualified for this week’s board' : `${week.picks} of ${QUALIFY_PICKS} bets · ${fmtU(units) === DASH ? '0U' : fmtU(units)} of ${QUALIFY_UNITS}U` },
  };
}
