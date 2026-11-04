// League as plain data (D-69 step 1, Sean's P6A "board first"): the layer an address opens, the board's first rows, the
// feed's new and arriving posts, and the Play landing's League tile. Pure: no React, storage, clock or network.
import { rankTile } from '../../../../shared/guess-board.mjs';
import { DASH } from '../format.js';
import { hasNewPosts } from '../feed/feedModel.js';
import { ordinal, peekMove } from './rankMoment.js';

/** The board shows this many rows before "N more on the board"; your own row always shows. */
export const BOARD_FIRST = 6;
/** The landing shows the two newest feed items. */
export const PREVIEW_POSTS = 2;
const whole = value => (Number.isInteger(value) && value > 0 ? value : null);
const at = iso => Date.parse(iso ?? '');

/** `{ layer, season, week }`: 'feed', 'history', 'week' (History plus a week), else 'board' (board first). */
export function leagueLayer(view) {
  if (view?.view === 'feed') return { layer: 'feed', season: null, week: null };
  if (view?.view !== 'history') return { layer: 'board', season: null, week: null };
  const season = whole(view.season), week = whole(view.week);
  return { layer: week ? 'week' : 'history', season, week };
}

/** The board's market: Spread unless the address names Total or Points (D-56: Points is its own board). */
export const leagueMode = market => (market === 'total' || market === 'guess_total' ? 'guess_total'
  : market === 'points' || market === 'guess_points' ? 'guess_points' : 'guess_spread');

/** True when the place under this one (the trail's last) is League's `layer`, so its lip is Back (D-66). */
export function lipIsBack(trail, layer) {
  const prior = Array.isArray(trail) ? trail.at(-1) : null;
  return prior?.tab === 'play' && prior.view?.section === 'league' && leagueLayer(prior.adapters?.league).layer === layer;
}

/** `{ shown, more }`: the first rows plus your own row when it sits lower; `all` shows every row (nothing hidden, D-23). */
export function boardSlice(rows, all = false, first = BOARD_FIRST) {
  if (all || rows.length <= first) return { shown: rows, more: 0 };
  const mine = rows.slice(first).find(row => row.you);
  const shown = mine ? [...rows.slice(0, first), mine] : rows.slice(0, first);
  return { shown, more: rows.length - shown.length };
}

/** Ids of posts by someone else newer than `since` (the newest post this device had shown); none without it. */
export function newPostIds(posts, viewer, since) {
  const from = at(since);
  if (!Number.isFinite(from)) return new Set();
  return new Set((posts ?? []).filter(post => post.actorId !== viewer && at(post.createdAt) > from).map(post => post.id));
}

/** Posts a later read brought, newer than every post known (older pages never arrive); `known` null is the first look. */
export function postArrivals(known, posts) {
  const list = posts ?? [], newest = Math.max(-Infinity, ...list.map(post => at(post.createdAt)).filter(Number.isFinite));
  if (!known) return { known: { ids: new Set(list.map(post => post.id)), newest }, arrived: new Set() };
  const arrived = new Set(list.filter(post => !known.ids.has(post.id) && at(post.createdAt) > known.newest).map(post => post.id));
  return { known: { ids: new Set([...known.ids, ...list.map(post => post.id)]), newest: Math.max(known.newest, newest) }, arrived };
}

const NO_ARRIVALS = new Set();
/**
 * The posts rising in at `where` (account, league and layer): `held` is what the last call returned, `arrived` the ids a
 * read just brought (postArrivals). A post rises once per arrival: once the place changes (another layer or league) what
 * arrived is spent, so the cards that remount on a return never replay it. Returns `held` itself when nothing changes.
 */
export function arrivalsAt(held, where, arrived = null) {
  if (arrived?.size) return { where, ids: arrived };
  return held?.where === where ? held : { where, ids: NO_ARRIVALS };
}

/**
 * The Play landing's League tile from reads the landing already makes: the Community's Spread rank (the board League opens
 * on), the move this device last saw (read only, as Home's rank tile) and "New posts". A private group shows its player
 * count from the lobby. `stored` is this device's rank record, `seen` the newest post it showed. `waiting` is true while the
 * tile shows NEW: the label then says "new" (once), as PlayTile asks of its caller.
 */
export function leagueTile({ community = true, data = null, viewer = '', stored = null, seen = null, players = null, waiting = false } = {}) {
  const said = aria => (waiting && !/\bnew\b/i.test(aria) ? `${aria}, new` : aria);
  if (!community) {
    const big = Number.isInteger(players) ? String(players) : DASH;
    return { rank: null, tied: false, big, sub: 'Players', tone: 'plain', aria: said(big === DASH ? 'League' : `League, ${big} players`) };
  }
  const tile = rankTile({ standings: data?.standings ?? [], viewer, mode: 'guess_spread' });
  const move = peekMove(stored, { rank: tile.rank }), posts = hasNewPosts(data?.posts, viewer, seen);
  const place = tile.rank ? `${ordinal(tile.rank)}${tile.tied ? ', tied,' : ''} on the Spread board` : 'not ranked on the Spread board';
  const sub = [tile.tied ? 'Tied' : null, move > 0 ? `▲ ${move}` : move < 0 ? `▼ ${-move}` : null, posts ? 'New posts' : null].filter(Boolean).join(' · ');
  return { rank: tile.rank, tied: tile.tied, big: tile.rank ? ordinal(tile.rank) : DASH, sub: sub || 'Spread board', tone: move > 0 ? 'good' : 'plain',
    aria: said(`League, ${place}${move > 0 ? `, up ${move}` : move < 0 ? `, down ${-move}` : ''}${posts ? ', new posts' : ''}`) };
}
