// Suggested results for private NBA tickets (milestone N1, "Needs your result"). Pure: no request, clock, storage or
// write. A suggestion never settles a ticket; only the owner's tap saves an ordinary audited correction through the
// existing /nba/save. Modeled on gradeSocialEntry: grade only what the final score proves.
//
// A leg is gradable only when its gameId is a BALLDONTLIE game (`NBA:balldontlie:<id>`), that game is in `games`, it is
// final with both scores, and (for moneyline and spread) the leg's team text names exactly one of its two teams.
// Singles: that leg's result. Parlays: Win when every leg won, Loss when every leg is gradable and at least one lost;
// any push, void, unlinked or non-final leg gives no suggestion (the payout depends on the book's rules).
const LINKED = /^NBA:balldontlie:[1-9]\d*$/;
const squash = value => typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9]/g, '') : '';

/** The spellings a team's leg text may use: its code, full name and nickname ("76ers", "Trail Blazers"); never a city alone. */
function spellings(team) {
  const words = typeof team?.name === 'string' ? team.name.trim().split(/\s+/) : [];
  const values = [team?.abbreviation, team?.name, words.at(-1), words.slice(-2).join(' ')];
  return new Set(values.map(squash).filter(Boolean));
}

/** 'home', 'away' or null when the text names neither team or (ambiguously) both. */
export function nbaLegSide(text, game) {
  const value = squash(text);
  if (!value) return null;
  const home = spellings(game?.home).has(value), away = spellings(game?.away).has(value);
  return home === away ? null : home ? 'home' : 'away';
}

const isFinal = game => game?.status === 'final' && Number.isSafeInteger(game.homeScore) && Number.isSafeInteger(game.awayScore);
/** True when the provider's final label says overtime ("Final/OT", "Final/2OT"). */
export const nbaOvertime = game => /\/\d*ot\b/i.test(game?.statusText ?? '');

const compare = value => value > 0 ? 'win' : value < 0 ? 'loss' : 'push';

/**
 * One leg's result: `{ result: 'win'|'loss'|'push', game }`, or `{ result: null, reason }` with reason 'unlinked'
 * (no BALLDONTLIE game, or the game is not in `games`), 'not-final', or 'team' (the text names neither team).
 */
export function gradeNbaLeg(leg, games) {
  if (!LINKED.test(leg?.gameId ?? '')) return { result: null, reason: 'unlinked' };
  const game = games instanceof Map ? games.get(leg.gameId) : null;
  if (!game) return { result: null, reason: 'unlinked' };
  if (!isFinal(game)) return { result: null, reason: 'not-final', game };
  if (leg.market === 'total') {
    if (!['over', 'under'].includes(leg.side) || !Number.isFinite(leg.line)) return { result: null, reason: 'unlinked', game };
    const over = game.homeScore + game.awayScore - leg.line;
    return { result: compare(leg.side === 'over' ? over : -over), game };
  }
  const side = nbaLegSide(leg.team, game);
  if (!side) return { result: null, reason: 'team', game };
  const margin = side === 'home' ? game.homeScore - game.awayScore : game.awayScore - game.homeScore;
  if (leg.market === 'moneyline') return margin === 0 ? { result: null, reason: 'not-final', game } : { result: compare(margin), game };
  if (leg.market === 'spread' && Number.isFinite(leg.line)) return { result: compare(margin + leg.line), game };
  return { result: null, reason: 'unlinked', game };
}

/**
 * The suggestion for a pending ticket: `{ outcome: 'win'|'loss'|'push', legs, overtime }`, or null when the final
 * scores do not settle it (also for any ticket that is not pending). `games` is a Map of board games by id.
 */
export function gradeNbaTicket(ticket, games) {
  if (ticket?.outcome !== 'pending' || !Array.isArray(ticket.legs) || !ticket.legs.length) return null;
  const legs = ticket.legs.map(leg => gradeNbaLeg(leg, games));
  if (legs.some(leg => leg.result === null)) return null;
  const overtime = legs.some(leg => nbaOvertime(leg.game));
  if (ticket.kind !== 'parlay') return legs.length === 1 ? { outcome: legs[0].result, legs, overtime } : null;
  if (legs.some(leg => leg.result === 'push')) return null;
  return { outcome: legs.some(leg => leg.result === 'loss') ? 'loss' : 'win', legs, overtime };
}

/** Why a pending ticket has no suggestion, for its chip: 'unlinked', 'waiting' (a game not final yet) or 'manual'. */
export function nbaNoSuggestionReason(ticket, games) {
  const legs = (ticket?.legs ?? []).map(leg => gradeNbaLeg(leg, games));
  if (legs.some(leg => leg.reason === 'not-final')) return 'waiting';
  if (legs.some(leg => leg.reason === 'unlinked' || leg.reason === 'team')) return 'unlinked';
  return 'manual';
}

export const NBA_CONFIRM_REASON = 'Confirmed from final score';
/** The audited correction's reason for a confirmed suggestion, with an overtime note when the final went to overtime. */
export const nbaConfirmReason = suggestion => suggestion?.overtime ? `${NBA_CONFIRM_REASON} (final includes overtime)` : NBA_CONFIRM_REASON;

/** Whole American price for display: 102.0408 → "+102", -110.1234 → "−110". The stored value is never rewritten. */
export function formatNbaPrice(odds) {
  if (typeof odds !== 'number' || !Number.isFinite(odds)) return '—';
  const whole = Math.round(odds);
  return whole > 0 ? `+${whole}` : `−${Math.abs(whole)}`;
}
