import { usableOffer } from './best-offer.mjs';
import { appCode, TEAM_NAMES } from './nfl-schedule.mjs';
import { historicalGapScore, LARGE_GAP_SCORE, gapSizeLabel } from './nfl-gap-scale.mjs';

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

function evaluation(side, value, offer, gapScore) {
  const color = gapScore >= LARGE_GAP_SCORE ? (value > 0 ? 'green' : 'red') : 'yellow';
  const label = color === 'green' ? 'Large gap in your direction' : color === 'red' ? 'Large gap against your guess' : value === 0 ? 'Even' : gapSizeLabel(gapScore);
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
 * `rows` includes every nonzero discrepancy: the ones you can still act on first (D-77: a usable favorable named-book
 * quote and no saved Virtual Units pick, `actionable`), each group descending by historical gap size (D-81). Each
 * row keeps the original game/reference/offer/savedPick objects, and evaluations
 * for BOTH sides use the same consensus (away spread is the negated home line).
 * The historical top-quarter traffic lights describe gap size, never a win probability.
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
      if (market === 'total' && reference.value <= 0) { counts.missingReference += 1; continue; }
      const gapScore = historicalGapScore(market, gap);
      const side = market === 'spread' ? (guess < reference.value ? 'home' : 'away') : (guess > reference.value ? 'over' : 'under');
      const evaluations = Object.fromEntries(SIDES[market].map(candidate => {
        const line = market === 'spread' && candidate === 'away' ? -reference.value : reference.value;
        return [candidate, evaluation(candidate, advantage(market, candidate, guess, line), bookOffer(game, market, candidate, nowMs), gapScore)];
      }));
      const offered = evaluations[side].offer;
      const offer = offered && advantage(market, side, guess, offered.line) > 0 ? offered : null;
      const key = `${game.id}:${market}`, savedPick = saved.get(key) ?? null;
      if (!offer) counts.unavailableOffer += 1;
      if (savedPick) counts.saved += 1;
      rows.push({ key, game, market, guess, reference, gap, gapScore, side, offer, savedPick, lockedAt, evaluations,
        actionable: Boolean(offer && !savedPick) });
    }
  }
  rows.sort((a, b) => Number(b.actionable) - Number(a.actionable) || b.gapScore - a.gapScore
    || time(a.game.kickoff) - time(b.game.kickoff) || a.key.localeCompare(b.key));
  return { status: 'ready', rows, counts };
}

// BETS-NEXT-01: the All / Spreads / Totals choice on Bets → Recommended. It is a display preference only: it narrows
// the complete ranked rows (keeping their D-81 order), never rebuilds, re-ranks or changes a row, and never relaxes the
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

// D-77 (Sean, November 3, 2026: "Your gaps' paper record"). A weekly record of your gaps against the market, whether or
// not you bet them: every locked guess that differed from the closing consensus (the newest three-book line before
// kickoff, as /lines/read reports it for a started game) is graded on the side your guess favored, the same side
// Recommended suggests, against the final score. Each graded gap is 1 unit at a standard -110 (win +10/11, loss -1, push
// 0), because a consensus line has no price of its own. ROI is net over every graded unit (pushes included), as for
// Virtual Units (shared/bets-qual.mjs). Large gaps use D-81's fixed historical top-quarter scale, retrospectively. Nothing is
// estimated: a game without a final, or without a closing line, is counted as not graded; an even guess has no side.
export const GAP_WIN_UNITS = 10 / 11;
const round2 = value => Math.round(value * 100) / 100;
const tally = () => ({ wins: 0, losses: 0, pushes: 0 });
const settle = (into, outcome) => { into[outcome === 'win' ? 'wins' : outcome === 'loss' ? 'losses' : 'pushes'] += 1; };
// Net and ROI come from the counts once, so the rounding never drifts with the number of games.
const totals = ({ wins, losses, pushes }) => {
  const riskUnits = wins + losses + pushes, net = wins * GAP_WIN_UNITS - losses;
  return { wins, losses, pushes, riskUnits, netUnits: round2(net), roi: riskUnits ? Math.round(net / riskUnits * 10000) / 100 : null };
};

/** `market` narrows to 'spread' or 'total' like Recommended's All / Spreads / Totals choice; anything else means both. */
export function gapRecord(board, { market = 'all' } = {}) {
  if (!board || !Array.isArray(board.games)) return null;
  const markets = Object.keys(MODES).filter(key => recommendationMarket(market) === 'all' || key === market);
  const all = tally(), large = tally(), graded = [], notGraded = { noFinal: 0, noLine: 0 };
  let even = 0;
  for (const game of board.games) for (const market of markets) {
    const mine = game?.mine?.[market], guess = mine?.guess;
    if (!mine || mine.lockedIn !== true || mine.satOut === true || !point(guess, market) || !Number.isInteger(guess * 2)) continue;
    const final = game.final, home = final?.home, away = final?.away;
    if (game.started !== true || String(final?.status ?? '').toLowerCase() !== 'final' || !Number.isFinite(home) || !Number.isFinite(away)) {
      notGraded.noFinal += 1;
      continue;
    }
    const line = game[market]?.visible === true ? game[market].value : null;
    if (!point(line, market) || !Number.isInteger(line * 2) || (market === 'total' && line <= 0)) { notGraded.noLine += 1; continue; }
    if (guess === line) { even += 1; continue; }
    const side = market === 'spread' ? (guess < line ? 'home' : 'away') : (guess > line ? 'over' : 'under');
    // Spread values are signed home spreads (home covers when its margin plus the line is above zero); totals are points.
    const result = market === 'spread' ? home - away + line : home + away - line;
    const signedResult = side === 'home' || side === 'over' ? result : -result;
    const outcome = signedResult > 0 ? 'win' : signedResult < 0 ? 'loss' : 'push';
    const gapScore = historicalGapScore(market, Math.abs(guess - line));
    const isLarge = gapScore >= LARGE_GAP_SCORE;
    settle(all, outcome);
    if (isLarge) settle(large, outcome);
    graded.push({ gameId: game.id, market, guess, line, side, outcome, gapScore, large: isLarge });
  }
  return { ...totals(all), large: totals(large), graded, notGraded, even };
}
