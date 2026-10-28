// The order the game sheet pages through (design upgrade, swipe between games): the Lines board's own order, so the
// next game is the card below this one. Games still to kick off come first in kickoff order, then the games that have
// kicked off ("Kicked off", at the end of the board), by the server's clock in /personal. Pure, so node tests pin it.
import { gamesOf, teamOf } from '../../../../shared/lines-view.mjs';
import { toMs } from '../format.js';

/** `[{ id, title }]` ("SEA @ DEN") for the week in `personal`, in board order; empty without a week. */
export function boardOrder(personal) {
  const games = gamesOf(personal), now = toMs(personal?.now);
  const upcoming = games.filter(game => now === null || now < toMs(game.kickoff));
  const started = games.filter(game => now !== null && now >= toMs(game.kickoff));
  return [...upcoming, ...started].map(game => ({ id: game.id, title: `${teamOf(game.away).code} @ ${teamOf(game.home).code}` }));
}

/** The displayed board order is a scoped, in-memory snapshot; labels always come from the current week. */
export function openedBoardOrder(personal, accountId, context) {
  const fallback = boardOrder(personal);
  if (!accountId || context?.accountId !== accountId || context.season !== personal?.season || context.week !== personal?.week ||
    !Array.isArray(context.ids) || context.ids.length !== fallback.length || new Set(context.ids).size !== fallback.length) return fallback;
  const byId = new Map(fallback.map(game => [game.id, game]));
  return context.ids.every(id => byId.has(id)) ? context.ids.map(id => byId.get(id)) : fallback;
}

/**
 * The game sheet's pager for `gameId` in `order`: `{ index, count, unit, prevLabel, nextLabel, prev, next }`, or null
 * when the game is not on the board or is its only game. `prev` and `next` are the neighbouring game ids (null at an end).
 */
export function gamePager(order, gameId) {
  const index = Array.isArray(order) ? order.findIndex(game => game.id === gameId) : -1;
  if (index < 0 || order.length < 2) return null;
  const prev = order[index - 1] ?? null, next = order[index + 1] ?? null;
  return {
    index,
    count: order.length,
    unit: 'game',
    prev: prev?.id ?? null,
    next: next?.id ?? null,
    prevLabel: prev ? `Previous game, ${prev.title}` : 'Previous game',
    nextLabel: next ? `Next game, ${next.title}` : 'Next game',
  };
}
