// Scoped in-memory context for Research's game layer: displayed order and recorded finals captured on opening.
// Direct opens fall back to upcoming games then passed kickoffs, from the personal reader's server clock.
// Pure values only; no requests, storage, market quotes or picks.
import { gamesOf, teamOf } from '../../../../shared/lines-view.mjs';
import { toMs } from '../format.js';
import { recordedFinal } from './boardMarkets.js';

const codes = game => `${teamOf(game.away).code} @ ${teamOf(game.home).code}`;

/**
 * `[{ id, title }]` for the week in `personal`, in board order; empty without a week. `title(game)` names each game
 * (`game` is lines-view gamesOf's): "SEA @ DEN" unless told otherwise (the League feed's game sheet); Research's game
 * layer passes its rows' own names (researchNav.js gameName).
 */
export function boardOrder(personal, { title = codes } = {}) {
  const games = gamesOf(personal), now = toMs(personal?.now);
  const upcoming = games.filter(game => now === null || now < toMs(game.kickoff));
  const started = games.filter(game => now !== null && now >= toMs(game.kickoff));
  return [...upcoming, ...started].map(game => ({ id: game.id, title: title(game) }));
}

function matchingSnapshot(personal, accountId, context, games) {
  if (!accountId || context?.accountId !== accountId || context.season !== personal?.season || context.week !== personal?.week ||
    !Array.isArray(context.ids) || context.ids.length !== games.length || new Set(context.ids).size !== games.length) return false;
  const ids = new Set(games.map(game => game.id));
  return context.ids.every(id => ids.has(id));
}

/** The displayed board order: a scoped, in-memory snapshot; labels from the current week (`options`: boardOrder's). */
export function openedBoardOrder(personal, accountId, context, options) {
  const fallback = boardOrder(personal, options);
  if (!matchingSnapshot(personal, accountId, context, fallback)) return fallback;
  const byId = new Map(fallback.map(game => [game.id, game]));
  return context.ids.map(id => byId.get(id));
}

/** A recorded final captured on opening, never a claim about the current/live state. No quotes or picks travel here. */
export function openedBoardResult(personal, accountId, context, gameId) {
  const games = gamesOf(personal);
  if (!matchingSnapshot(personal, accountId, context, games) || !Number.isFinite(context.now)) return null;
  const game = games.find(game => game.id === gameId), result = context.results?.[gameId];
  if (!game || !result) return null;
  return recordedFinal({ ...game, away: teamOf(game.away), home: teamOf(game.home), started: context.now >= toMs(game.kickoff) },
    { id: result.gameId, awayCode: result.awayCode, homeCode: result.homeCode, started: true, final: result },
    { status: 'ready', now: context.now });
}

/**
 * The game layer's (and the feed's game sheet's) pager for `gameId` in `order`: `{ index, count, unit, prevLabel,
 * nextLabel, prev, next }`, or null when the game is not on the board or is its only game. `prev` and `next` are the
 * neighbouring game ids (null at an end).
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
