// Bets › Your gap (D-69 step 4; the old app's VirtualUnits.jsx Recommended view, rebuilt as tiles and rows on the same
// data): your locked guesses against the latest consensus in D-54's percentage ranking with D-77's actionable rows first
// (shared/recommended-bets.mjs decides every row) and D-77's paper record against the closing lines. Pure: the words, rows,
// tiles and checks the screen and its gap layer draw and run. Every time is the server's (the read's `now`).
import { gameTrends } from '../../../../../shared/trends-view.mjs';
import { DASH, MINUS, PICKEM, SEP, fmtNum, fmtOdds, fmtSigned, fmtU, toMs } from '../../format.js';

export const MARKET_NAME = Object.freeze({ spread: 'Spread', total: 'Total' });
export const GAP_COPY = Object.freeze({
  loading: 'Loading your gaps…', region: 'Gaps this week', week: 'Recommendation week', current: 'Current',
  top: 'Top 3 to act on', topDiff: 'Top 3 differences', all: 'All differences', showTop: 'Show top 3',
  none: 'No differences to show yet. Lock in guesses, then check back.', viewAll: 'View all markets',
  mismatch: 'Your guesses and these lines are not available for the same week.', refreshRecs: 'Refresh recommendations',
  historical: 'View only · older week', leftOut: 'Drafts, locked markets and started games are left out.',
  added: 'Added to your card. Check the terms, then place it.', saved: 'Virtual pick saved with its book, line, odds and unit stake.',
  confirmed: 'Your saved Virtual Units pick is confirmed.', recheck: 'Saved picks refreshed. Review your selection before saving again.',
  closedNotice: 'This game is closed. Your selected terms stay on your card.', refresh: 'Refresh lines', refreshing: 'Refreshing…',
  tryAgain: 'Try again', checkSaved: 'Check saved picks', yourCard: 'Your card', savedCard: 'Your virtual card',
  savedNote: 'Saved picks stay here when a line changes or a game starts.', baseline: 'Percentage uses a 3-point minimum spread for pick’em and small lines.',
  noQuote: 'No usable named-book quote on this side. It cannot be added yet.', unsavedStays: 'Your unsaved selection remains here while the ranked list changes.',
  gone: 'This gap is not on your list now.', reviewLabel: 'Review your card · play money only',
});
/** Fine print, behind the screen's ⓘ (D-55 rule 10), so it may run longer than a surface line. */
export const GAP_FINE_PRINT = Object.freeze({
  ranking: 'Ranked by percentage gap. Spread lines below 3 use 3 as a baseline. These gaps are not win probabilities.',
});
export const showAllLabel = n => `Show all ${n} differences`;
export const noneForMarket = market => `No ${market} differences to show yet.`;
export const closedLine = reason => `Closed · ${reason}. New placement is closed; your selected terms remain here.`;
const CLOSED = new Set(['started', 'live', 'in_progress', 'final', 'complete', 'completed', 'cancelled', 'canceled', 'postponed', 'suspended']);
const codes = game => [game?.awayCode || game?.away || DASH, game?.homeCode || game?.home || DASH];

export const sideName = (game, market, side) => (market === 'total' ? (side === 'over' ? 'Over' : 'Under') : codes(game)[side === 'home' ? 1 : 0]);
/** "Over 44.5", "DEN −3", "SEA Pick'em". */
export function lineText(game, market, side, line) {
  if (!Number.isFinite(line)) return sideName(game, market, side);
  return market === 'total' ? `${sideName(game, market, side)} ${fmtNum(line)}` : `${sideName(game, market, side)} ${line === 0 ? PICKEM : fmtSigned(line)}`;
}
/** "Over 44.5 · −110 · 2U · BetMGM": a quote's or a saved pick's terms. */
export function termsText(game, market, side, quote, units) {
  return [lineText(game, market, side, quote?.line), Number.isFinite(quote?.odds) ? fmtOdds(quote.odds) : null, Number.isFinite(units) ? fmtU(units) : null, quote?.source || null].filter(Boolean).join(SEP);
}
/** Your guess or the consensus: a spread as home's line ("−3.5", "Pick'em"), a total as points. */
export const marketNumber = (market, value) => (market === 'spread' ? (value === 0 ? PICKEM : fmtSigned(value)) : fmtNum(value));
export function quoteAge(observedAt, now) {
  const at = toMs(observedAt);
  if (at === null || !Number.isFinite(now)) return DASH;
  const minutes = Math.max(0, Math.floor((now - at) / 60000));
  return minutes < 60 ? `${minutes}m old` : `${Math.floor(minutes / 60)}h old`;
}
/** D-77's units, as its approved card writes them: "+2.55U", "+2.5U", "−1U", "0U". */
export function gapUnits(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n === 0) return '0U';
  return `${n > 0 ? '+' : MINUS}${Math.abs(n).toFixed(2).replace(/\.?0+$/, '')}U`;
}
/** Why a review is closed now (the server's `now`), or null: the old card's reasons, word for word. */
export function closedReason(game, now, result) {
  const kickoff = toMs(game?.kickoff);
  if (!game || kickoff === null) return 'Matchup unavailable';
  if (Number.isFinite(now) && kickoff <= now) return 'Kickoff reached';
  if (game.started || game.final || result || CLOSED.has(String(game.status || '').toLowerCase())) return 'Game closed';
  return null;
}
/** A reviewed quote is its exact terms: line, price, book and observation time. */
export const sameQuote = (a, b) => Boolean(a && b) && a.line === b.line && a.odds === b.odds && a.book === b.book && a.source === b.source && toMs(a.observedAt) === toMs(b.observedAt);

const rowWord = (row, selection) => (row.savedPick ? { word: 'Saved', tone: 'plain' } : selection ? { word: 'On your card', tone: 'warn' }
  : row.actionable ? { word: 'To act on', tone: 'good' } : { word: 'No quote', tone: 'plain' });
/** One ranked gap as a picture row. */
export function gapRow(row, { selection = null, now = null } = {}) {
  const { game, market, side, reference } = row, [away, home] = codes(game), pct = `${row.gapPercent.toFixed(1)}%`, review = sideName(game, market, side);
  const { word, tone } = rowWord(row, selection);
  return { item: `${game.id}:${market}`, gameId: game.id, market, away, home, title: `${away} @ ${home}${SEP}${MARKET_NAME[market]}`,
    meta: `${fmtNum(row.gap)} pt gap${SEP}Review ${review}${SEP}${quoteAge(reference.observedAt, now)}`, value: pct, word, tone,
    ariaLabel: `${away} at ${home} ${market}, ${pct} gap, ${fmtNum(row.gap)} points, review ${review}, ${word}` };
}
/** The four tiles over the chosen market's ranked rows and your saved picks. */
export function gapTiles({ rows = [], picks = [] } = {}) {
  const act = rows.filter(r => r.actionable).length, top = rows.reduce((best, r) => (!best || r.gapPercent > best.gapPercent ? r : best), null);
  return [
    { key: 'act', label: 'To act on', big: String(act), sub: act === 1 ? 'favorable quote' : 'favorable quotes' },
    { key: 'gaps', label: 'Gaps', big: String(rows.length), sub: 'this week' },
    { key: 'top', label: 'Biggest gap', big: top ? `${top.gapPercent.toFixed(1)}%` : DASH, sub: top ? `${codes(top.game).join(' @ ')}${SEP}${MARKET_NAME[top.market]}` : 'None yet' },
    { key: 'card', label: 'Your card', big: String(picks.length), sub: picks.length === 1 ? 'saved pick' : 'saved picks' },
  ];
}
const OUTCOME = Object.freeze({ pending: ['Pending', 'plain'], win: ['Won', 'good'], loss: ['Lost', 'plain'], push: ['Push', 'plain'], void: ['Void', 'plain'] });
/** Your virtual card for the week shown: each saved pick's terms, its units or its result, and a word (a loss is plain). */
export function savedRows(data) {
  const games = Array.isArray(data?.games) ? data.games : [];
  return (Array.isArray(data?.picks) ? data.picks : []).map(pick => {
    const [awayId, homeId] = String(pick.gameId).split('-');
    const game = games.find(g => g.id === pick.gameId) ?? { id: pick.gameId, awayCode: awayId, homeCode: homeId };
    const [away, home] = codes(game), s = pick.selection ?? {}, [word, tone] = OUTCOME[pick.status] ?? ['Pending', 'plain'];
    const net = pick.status && pick.status !== 'pending' && Number.isFinite(pick.result?.netUnits) ? gapUnits(pick.result.netUnits) : null;
    const terms = termsText(game, pick.market, s.side, s, s.units);
    return { key: `${pick.gameId}:${pick.market}`, away, home, title: `${away} @ ${home}${SEP}${MARKET_NAME[pick.market]}`, meta: terms,
      value: net ?? fmtU(s.units), word, tone, ariaLabel: `${away} at ${home} ${pick.market}, ${terms}, ${word}` };
  });
}
/** Your card: each unsaved selection whose row is not shown (a filter, the top three, a kickoff), as a row to its layer. */
export function pendingRows(selections, shownKeys, data, now) {
  return Object.entries(selections ?? {}).filter(([key]) => !shownKeys.has(key)).flatMap(([key, s]) => {
    const current = data?.games?.find(g => g.id === s.gameId), game = current ?? s.game;
    if (!game || current?.locked?.[s.market]) return [];
    const [away, home] = codes(game), closed = closedReason(current, now, data?.results?.[s.gameId]), terms = termsText(game, s.market, s.side, s.offer, s.units);
    return [{ key, item: key, away, home, title: `${away} @ ${home}${SEP}${MARKET_NAME[s.market]}`, meta: terms, value: fmtU(s.units),
      word: closed ? 'Closed' : 'Ready', tone: closed ? 'plain' : 'warn', ariaLabel: `${away} at ${home} ${s.market}, your card, ${terms}, ${closed ? 'closed' : 'ready to place'}` }];
  });
}
/** The POST /bets/recommendations/place body: the reviewed quote's exact terms, for the week and revision read. */
export function placeBody(choice, data) {
  return { gameId: choice.gameId, market: choice.market, side: choice.side, line: choice.offer.line, odds: choice.offer.odds, units: choice.units,
    source: choice.offer.book, quotedAt: choice.offer.observedAt, season: data.season, week: data.week, revision: data.revision };
}
/** After a lost reply: the saved pick confirms the selection only with its exact side, line, price, units, book and quote time. */
export function confirmsChoice(latest, choice) {
  const saved = (Array.isArray(latest?.picks) ? latest.picks : []).find(p => p.gameId === choice.gameId && p.market === choice.market)?.selection;
  return Boolean(saved) && saved.side === choice.side && saved.line === choice.offer.line && saved.odds === choice.offer.odds && saved.units === choice.units
    && saved.source === choice.offer.source && toMs(saved.quotedAt) === toMs(choice.offer.observedAt);
}
/** Selections that can no longer be saved: their market locked in a newer read (D-36), or a pick saved elsewhere. */
export function staleKeys(data, selections) {
  const saved = new Set((Array.isArray(data?.picks) ? data.picks : []).map(p => `${p.gameId}:${p.market}`));
  return Object.keys(selections ?? {}).filter(key => { const s = selections[key]; return data?.games?.find(g => g.id === s.gameId)?.locked?.[s.market] === true || saved.has(key); });
}
/** A tracked-ticket draft from a current row's quote: a quote, never evidence of a stake or a placement. */
export function trackTicket(current, data) {
  return { season: data.season, week: data.week, kind: 'single', legs: [{ gameId: current.game.id, market: current.market, side: current.side, line: current.offer.line }],
    odds: current.offer.odds, source: current.offer.source || current.offer.book, quotedAt: current.offer.observedAt, stakeUnits: null, placedAt: null };
}
/** The week select's options: the current published week, then every older week with a slate. */
export function weekOptions(info) {
  if (!info) return [];
  const pub = info.publishedWeek;
  return [{ value: 'current', label: `${GAP_COPY.current}${pub ? `${SEP}${pub.season} Week ${pub.week}` : ''}` },
    ...(info.slates || []).filter(w => w.season !== pub?.season || w.week !== pub?.week).map(w => ({ value: `${w.season}:${w.week}`, label: `${w.season} Week ${w.week}` }))];
}
/** The first two trends of this game in this market with a sample (the old RecommendationTrends.jsx rule). */
export function gapTrendCards(weekData, gameId, market, consensus) {
  if (!weekData) return [];
  const { all } = gameTrends(weekData, gameId, { access: { [market]: true }, saved: { [market]: consensus } });
  return all.filter(card => {
    const cardMarket = weekData.cards?.[card.id]?.market;
    const same = market === 'spread' ? cardMarket?.endsWith('_ats') : cardMarket?.startsWith('total');
    return !card.locked && same && (!card.gate || card.gate === market) && card.games > 0;
  }).slice(0, 2);
}
