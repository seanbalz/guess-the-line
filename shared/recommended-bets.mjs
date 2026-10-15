import { usableOffer } from './best-offer.mjs';
import { appCode, TEAM_NAMES } from './nfl-schedule.mjs';

// Compare an explicit saved guess or outcome forecast with retained book terms.
// A benchmark guess is not an outcome forecast; neither basis establishes a
// probability or expected value. Saved scoring references never price a pick.
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

function evaluation(side, value, offer, basis) {
  if (!Number.isFinite(value)) return { side, advantage: null, color: null, label: 'Unavailable', offer: null };
  const color = value >= 1 ? 'green' : value <= -1 ? 'red' : 'yellow';
  const label = color === 'green' ? 'Favorable' : color === 'red' ? `Against your ${basis}` : value === 0 ? 'Even' : 'Small gap';
  return { side, advantage: value, color, label, offer };
}

function savedForecast(forecast, market, now, kickoff) {
  const savedAt = time(forecast?.savedAt);
  return point(forecast?.value, market) && Number.isInteger(forecast.value * 2)
    && Number.isFinite(savedAt) && savedAt <= now && savedAt < kickoff ? forecast : null;
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
 * Actionable unsaved rows rank first, by actual offered-line advantage. Other
 * comparisons remain accessible; their rankGap falls back to the consensus gap
 * only when no favorable offer exists. gap/offerGap never imply an unavailable
 * book price. Each row keeps the original game/reference/offer/savedPick objects.
 * Both-side evaluations use each side's book line; consensusEvaluations remain
 * separate. An exact consensus match can still have a favorable book offer.
 * Forecast mode requires an explicit saved forecast and the same submitted-guess
 * and visibility gates as guess mode. A missing forecast never falls back.
 * The one-point traffic-light bands are display guidance, never a win probability.
 * A row's suggested `offer` is null when no genuine favorable book quote exists;
 * its side evaluations still retain usable offers for an explicit other-side bet.
 * D-18 has no quote TTL: observedAt is preserved so the UI can show its actual age.
 */
export function buildRecommendations({ personal, virtual, now = Date.now(), basis = 'guess' } = {}) {
  const counts = { submitted: 0, locked: 0, missingReference: 0, missingForecast: 0, unavailableOffer: 0, saved: 0, actionable: 0 };
  const empty = status => ({ status, rows: [], counts });
  const nowMs = typeof now === 'number' ? now : time(now);
  if (!['guess', 'forecast'].includes(basis) || !validWeek(personal) || !validWeek(virtual) || !Number.isFinite(nowMs)
    || !Array.isArray(personal.games) || !Array.isArray(virtual.games)) return empty('unavailable');
  if (!sameWeek(personal, virtual)) return empty('week-mismatch');

  // Ambiguous duplicate slate rows do not join. A duplicate saved-pick row still
  // marks the market as already saved and can never produce an extra suggestion.
  const uniqueGames = games => {
    const map = new Map();
    for (const game of games) if (text(game?.id)) map.set(game.id, map.has(game.id) ? null : game);
    return map;
  };
  const ownGames = uniqueGames(personal.games), games = uniqueGames(virtual.games), saved = new Map(), forecasts = new Map();
  for (const pick of Array.isArray(virtual.picks) ? virtual.picks : []) {
    if (!pick || !text(pick.gameId) || !MODES[pick.market] || !inWeek(pick, virtual)) continue;
    const key = `${pick.gameId}:${pick.market}`;
    if (!saved.has(key)) saved.set(key, pick);
  }
  for (const forecast of Array.isArray(personal.forecasts) ? personal.forecasts : []) {
    if (!forecast || !text(forecast.gameId) || !MODES[forecast.market] || !inWeek(forecast, personal)) continue;
    const key = `${forecast.gameId}:${forecast.market}`;
    forecasts.set(key, forecasts.has(key) ? null : forecast);
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
      if (game.locked?.[market] !== false) { counts.locked += 1; continue; }
      const key = `${game.id}:${market}`;
      const forecast = basis === 'forecast' ? savedForecast(forecasts.get(key), market, nowMs, kickoff) : null;
      if (basis === 'forecast' && !forecast) { counts.missingForecast += 1; continue; }
      const reference = game.consensus?.[market], observed = time(reference?.observedAt);
      if (!point(reference?.value, market) || !Number.isFinite(observed) || observed > nowMs || observed >= kickoff) {
        counts.missingReference += 1;
        continue;
      }
      const { guess, lockedAt } = own, comparisonValue = forecast ? forecast.value : guess;
      const consensusGap = Math.abs(comparisonValue - reference.value);
      const consensusSide = consensusGap === 0 ? null : market === 'spread'
        ? (comparisonValue < reference.value ? 'home' : 'away') : (comparisonValue > reference.value ? 'over' : 'under');
      const consensusEvaluations = Object.fromEntries(SIDES[market].map(candidate => {
        const line = market === 'spread' && candidate === 'away' ? -reference.value : reference.value;
        return [candidate, evaluation(candidate, advantage(market, candidate, comparisonValue, line), null, basis)];
      }));
      const evaluations = Object.fromEntries(SIDES[market].map(candidate => {
        const offered = bookOffer(game, market, candidate, nowMs);
        return [candidate, evaluation(candidate, offered ? advantage(market, candidate, comparisonValue, offered.line) : null, offered, basis)];
      }));
      // Different books can quote both sides favorably. Choose the larger point
      // gap without implying arbitrage or evaluating probability/price tradeoffs.
      const favored = Object.values(evaluations).filter(item => item.offer && item.advantage > 0)
        .sort((a, b) => b.advantage - a.advantage || Number(b.side === consensusSide) - Number(a.side === consensusSide))[0];
      const offer = favored?.offer ?? null, offerGap = favored?.advantage ?? null;
      if (consensusGap === 0 && !offer) continue;
      const side = favored?.side ?? consensusSide, savedPick = saved.get(key) ?? null;
      const actionable = Boolean(offer && !savedPick);
      if (!offer) counts.unavailableOffer += 1;
      if (savedPick) counts.saved += 1;
      if (actionable) counts.actionable += 1;
      rows.push({ key, game, market, guess, basis, comparisonValue, forecast, reference, consensusGap, consensusEvaluations,
        gap: offerGap, offerGap, rankGap: offerGap ?? consensusGap, side, offer, savedPick, actionable, lockedAt, evaluations });
    }
  }
  rows.sort((a, b) => Number(b.actionable) - Number(a.actionable) || b.rankGap - a.rankGap
    || time(a.game.kickoff) - time(b.game.kickoff) || a.key.localeCompare(b.key));
  return { status: 'ready', rows, counts };
}
