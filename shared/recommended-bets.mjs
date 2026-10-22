import { usableOffer } from './best-offer.mjs';
import { appCode, TEAM_NAMES } from './nfl-schedule.mjs';

// A comparison of this player's saved valuation with the accessible retained-book
// median. It is not a probability, a model forecast or the saved scoring reference.
const MODES = { spread: 'guess_spread', total: 'guess_total' };
const SIDES = { spread: ['home', 'away'], total: ['over', 'under'] };
const CLOSED = new Set(['started', 'live', 'in_progress', 'inprogress', 'final', 'complete', 'completed', 'cancelled', 'canceled', 'postponed', 'suspended']);
const codeByName = new Map(Object.entries(TEAM_NAMES).map(([code, name]) => [name, code]));
const text = value => typeof value === 'string' && value.trim().length > 0;
const time = value => typeof value === 'string' && text(value) ? Date.parse(value) : NaN;
const point = (value, market) => Number.isFinite(value) && value >= (market === 'total' ? 0 : -100) && value <= (market === 'total' ? 200 : 100);
const validWeek = value => Number.isInteger(value?.season) && Number.isInteger(value?.week);
const sameWeek = (a, b) => a.season === b.season && a.week === b.week;
const inWeek = (entry, week) => (entry.season == null || entry.season === week.season) && (entry.week == null || entry.week === week.week);

function teamCode(game, side) {
  const values = [game?.[`${side}Code`], game?.[side]].filter(text);
  const codes = values.map(value => codeByName.get(value) ?? appCode(value));
  return codes.length && codes.every(code => TEAM_NAMES[code] && code === codes[0]) ? codes[0] : null;
}

function sameGame(a, b, week) {
  if (!a || !b || !text(a.id) || a.id !== b.id || !inWeek(a, week) || !inWeek(b, week)) return false;
  const away = teamCode(a, 'away'), home = teamCode(a, 'home'), kickoff = time(a.kickoff);
  return Boolean(away && home && away !== home && away === teamCode(b, 'away') && home === teamCode(b, 'home')
    && Number.isFinite(kickoff) && kickoff === time(b.kickoff));
}

function savedGuess(ballot, gameId, market, now, kickoff) {
  const guess = ballot?.picks?.[gameId];
  if (!point(guess, market) || !Number.isInteger(guess * 2)) return null;
  // Whole-market submissions and M-02 per-game lock-ins both count. Draft values,
  // sit-outs and scoring references alone never make a recommendation.
  const lockedAt = [ballot?.lockedAt?.[gameId], ballot?.submittedAt].find(value => {
    const at = time(value);
    return Number.isFinite(at) && at <= now && at < kickoff;
  });
  return lockedAt ? { guess, lockedAt } : null;
}

const advantage = (market, side, guess, line) => market === 'spread'
  ? (side === 'home' ? line - guess : line + guess)
  : (side === 'over' ? guess - line : line - guess);

function evaluation(side, value, offer, denominator) {
  const color = value / denominator >= 0.1 ? 'green' : value / denominator <= -0.1 ? 'red' : 'yellow';
  const label = color === 'green' ? 'Favorable' : color === 'red' ? 'Against your guess' : value === 0 ? 'Even' : 'Small gap';
  return { side, advantage: value, color, label, offer };
}

function bookOffer(game, market, side, now) {
  const offer = game.offers?.[market]?.[side], observed = time(offer?.observedAt);
  return usableOffer(offer) && text(offer.book) && text(offer.source) && point(offer.line, market)
    && Number.isInteger(offer.line * 2) && Math.abs(offer.odds) <= 10000
    && Number.isFinite(observed) && observed <= now && observed < time(game.kickoff)
    && (offer.side == null || offer.side === side) ? offer : null;
}

/**
 * Build the Recommendations tab from two authenticated reads for the same week.
 * Never substitute an old saved scoring reference or a consensus for book terms.
 * `rows` includes every nonzero discrepancy, descending by relative gap. Each
 * row keeps the original game/reference/offer/savedPick objects, and evaluations
 * for BOTH sides use the same consensus (away spread is the negated home line).
 * The 10% traffic-light bands are display guidance, never a win probability.
 * A row's suggested `offer` is null when no genuine favorable book quote exists;
 * its side evaluations still retain usable offers for an explicit other-side bet.
 * D-18 has no quote TTL: observedAt is preserved so the UI can show its actual age.
 */
export function buildRecommendations({ personal, virtual, now = Date.now() } = {}) {
  const counts = { submitted: 0, locked: 0, missingReference: 0, unavailableOffer: 0, saved: 0 };
  const empty = status => ({ status, rows: [], counts });
  const nowMs = typeof now === 'number' ? now : time(now);
  if (!validWeek(personal) || !validWeek(virtual) || !Number.isFinite(nowMs)
    || !Array.isArray(personal.games) || !Array.isArray(virtual.games)) return empty('unavailable');
  if (!sameWeek(personal, virtual)) return empty('week-mismatch');

  // Ambiguous duplicate slate rows do not join. A duplicate saved-pick row still
  // marks the market as already saved and can never produce an extra suggestion.
  const uniqueGames = games => {
    const map = new Map();
    for (const game of games) if (text(game?.id)) map.set(game.id, map.has(game.id) ? null : game);
    return map;
  };
  const ownGames = uniqueGames(personal.games), games = uniqueGames(virtual.games), saved = new Map();
  for (const pick of Array.isArray(virtual.picks) ? virtual.picks : []) {
    if (!pick || !text(pick.gameId) || !MODES[pick.market] || !inWeek(pick, virtual)) continue;
    const key = `${pick.gameId}:${pick.market}`;
    if (!saved.has(key)) saved.set(key, pick);
  }
  const rows = [];
  for (const game of games.values()) {
    if (!sameGame(ownGames.get(game?.id), game, virtual)) continue;
    const kickoff = time(game.kickoff), result = virtual.results?.[game.id];
    if (nowMs >= kickoff || game.started === true || game.final === true
      || CLOSED.has(String(game.status ?? '').toLowerCase()) || CLOSED.has(String(result?.status ?? '').toLowerCase())) continue;
    for (const [market, mode] of Object.entries(MODES)) {
      const own = savedGuess(personal.ballots?.[mode], game.id, market, nowMs, kickoff);
      if (!own) continue;
      counts.submitted += 1;
      if (game.locked?.[market] === true) { counts.locked += 1; continue; }
      const reference = game.consensus?.[market], observed = time(reference?.observedAt);
      if (!point(reference?.value, market) || !Number.isFinite(observed) || observed > nowMs || observed >= kickoff) {
        counts.missingReference += 1;
        continue;
      }
      const { guess, lockedAt } = own, gap = Math.abs(guess - reference.value);
      if (gap === 0) continue;
      const denominator = market === 'spread' ? Math.max(Math.abs(reference.value), 3) : reference.value;
      if (denominator <= 0) { counts.missingReference += 1; continue; }
      const gapPercent = 100 * gap / denominator;
      const side = market === 'spread' ? (guess < reference.value ? 'home' : 'away') : (guess > reference.value ? 'over' : 'under');
      const evaluations = Object.fromEntries(SIDES[market].map(candidate => {
        const line = market === 'spread' && candidate === 'away' ? -reference.value : reference.value;
        return [candidate, evaluation(candidate, advantage(market, candidate, guess, line), bookOffer(game, market, candidate, nowMs), denominator)];
      }));
      const offered = evaluations[side].offer;
      const offer = offered && advantage(market, side, guess, offered.line) > 0 ? offered : null;
      const key = `${game.id}:${market}`, savedPick = saved.get(key) ?? null;
      if (!offer) counts.unavailableOffer += 1;
      if (savedPick) counts.saved += 1;
      rows.push({ key, game, market, guess, reference, gap, gapPercent, denominator, side, offer, savedPick, lockedAt, evaluations });
    }
  }
  rows.sort((a, b) => b.gapPercent - a.gapPercent || time(a.game.kickoff) - time(b.game.kickoff) || a.key.localeCompare(b.key));
  return { status: 'ready', rows, counts };
}

// BETS-NEXT-01: the All / Spreads / Totals choice on Bets → Recommended. It is a display preference only: it narrows
// the complete ranked rows (keeping their D-54 order), never rebuilds, re-ranks or changes a row, and never relaxes the
// eligibility above. Anything other than 'spread' or 'total' means All.
export const RECOMMENDATION_MARKETS = Object.freeze(['all', 'spread', 'total']);
export const RECOMMENDATION_PREVIEW = 3;
export const recommendationMarket = value => (value === 'spread' || value === 'total' ? value : 'all');

export function filterRecommendations(rows, market) {
  const chosen = recommendationMarket(market), list = Array.isArray(rows) ? rows : [];
  return chosen === 'all' ? list : list.filter(row => row?.market === chosen);
}

/** The chosen market's ranked rows, then the top-three preview unless expanded: the filter runs before the limit. */
export function recommendationList(rows, { market = 'all', expanded = false } = {}) {
  const chosen = filterRecommendations(rows, market);
  return { rows: chosen, visible: expanded ? chosen : chosen.slice(0, RECOMMENDATION_PREVIEW) };
}
