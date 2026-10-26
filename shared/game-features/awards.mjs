// Weekly awards and season winners (redesign build plan stages 68 and 69; D-35, D-36; the approved prototype's awards
// sheet and weekly recap). Pure and import-free beyond this folder. Awards read the scored, settled record of one league's
// roster and never change a score, a rank or a result.
//
// - The week's awards are ready once every game of the week is final or void and every bet has settled ("Weekly awards
//   post in the feed when every game is final"). Before that, `ready` is false and there are no awards: no early winner
//   and no partial recap.
// - An award nobody qualifies for is left out (hidden), never shown empty or as zero.
// - Ties: the Spread, Total and Bets winners are rank 1 on their boards, and a board shares a tie (D-36, T-2). Every
//   award lists every tied entry; whether a tie-break should replace that is asked of Sean (catalog QUESTIONS.awardTies).
// - Spread and Total are separate awards; nothing here adds the two (D-35, D-36).
// - Bets awards read Virtual Units bets only; real slips never count (D-36).
import { SEASON_FINAL_WEEK, THRESHOLDS } from './catalog.mjs';
import { allFinal, beatKickoffBy, coverMargin, finite, movedToward } from './week.mjs';

const round = (value, places = 2) => Math.round(value * 10 ** places) / 10 ** places;
const unique = list => [...new Set(list)].sort();

/** D-26: a win credits units × (decimal payout − 1), rounded once to four places; the settlement's own figure wins when present. */
export function winUnits(bet) {
  if (finite(bet.netUnits)) return bet.netUnits;
  const decimal = 1 + (bet.odds > 0 ? bet.odds / 100 : 100 / Math.abs(bet.odds));
  return Math.round(bet.units * (decimal - 1) * 1e4) / 1e4;
}

/**
 * One player's Bets line for a set of bets (D-18, D-26): `{ bets, units, qualified, wins, losses, pushes, voids, risk,
 * net, roi }`. Qualification counts every bet and unit placed, a void included (D-26). Record, units and ROI count
 * settled wins, losses and pushes only; ROI is null until something settles.
 */
export function betsLine(bets) {
  const count = status => bets.filter(b => b.status === status).length;
  const settled = bets.filter(b => ['win', 'loss', 'push'].includes(b.status));
  const risk = settled.reduce((s, b) => s + b.units, 0);
  const net = round(bets.reduce((s, b) => s + (b.status === 'win' ? winUnits(b) : b.status === 'loss' ? -b.units : 0), 0), 4);
  const units = bets.reduce((s, b) => s + b.units, 0);
  return { bets: bets.length, units, qualified: bets.length >= THRESHOLDS.qualifyBets || units >= THRESHOLDS.qualifyUnits,
    wins: count('win'), losses: count('loss'), pushes: count('push'), voids: count('void'), risk, net, roi: risk > 0 ? net / risk : null };
}

/** D-18's Bets order: ROI, then net units, then wins. Equal on all three is a shared rank. */
const betsKey = line => [round(line.roi, 9), line.net, line.wins];
const sameKey = (a, b) => a.every((v, i) => v === b[i]);
function betsRanked(lines) {
  const rows = lines.filter(row => row.line.qualified && row.line.roi !== null);
  rows.sort((a, b) => (b.line.roi - a.line.roi) || (b.line.net - a.line.net) || (b.line.wins - a.line.wins) || a.userId.localeCompare(b.userId));
  return rows;
}

/** The entries tied at the top of `rows` by `score` (higher is better unless `low`), or [] when nothing qualifies. */
function topEntries(rows, score, { low = false } = {}) {
  const scored = rows.map(row => ({ row, value: score(row) })).filter(x => finite(x.value));
  if (!scored.length) return [];
  const best = scored.reduce((m, x) => (low ? Math.min(m, x.value) : Math.max(m, x.value)), low ? Infinity : -Infinity);
  return scored.filter(x => x.value === best).map(x => x.row);
}

function award(id, entries, value) {
  return entries.length ? { id, winners: unique(entries.map(e => e.userId)), entries, value } : null;
}

/** Points per player for one market, over scored guesses only; players with nothing scored are left out (no ballot is never 0). */
function marketTotals(guesses, market) {
  const totals = new Map();
  for (const g of guesses) {
    if (g.market !== market || !finite(g.points)) continue;
    totals.set(g.userId, (totals.get(g.userId) ?? 0) + g.points);
  }
  return [...totals].map(([userId, points]) => ({ userId, points: round(points) }));
}

/**
 * A league's awards for one normalized week: `{ ready, awards }`. `roster` is the league's member ids (the Community
 * or one group); only their guesses and bets count. Each award is `{ id, winners: [userId], entries, value }`.
 */
export function weekAwards(week, roster) {
  const members = new Set(roster);
  const guesses = week.guesses.filter(g => members.has(g.userId)), bets = week.bets.filter(b => members.has(b.userId));
  const ready = allFinal(week) && bets.every(b => b.status !== 'pending');
  if (!ready) return { ready: false, awards: [] };
  const games = new Map(week.games.map(g => [g.id, g]));
  const out = [];

  for (const [id, market] of [['spread_winner', 'spread'], ['total_winner', 'total']]) {
    const top = topEntries(marketTotals(guesses, market), row => row.points);
    out.push(award(id, top, top.length ? { points: top[0].points } : null));
  }

  const lines = unique(bets.map(b => b.userId)).map(userId => ({ userId, line: betsLine(bets.filter(b => b.userId === userId)) }));
  const ranked = betsRanked(lines);
  const leaders = ranked.length ? ranked.filter(row => sameKey(betsKey(row.line), betsKey(ranked[0].line))) : [];
  out.push(award('bets_winner', leaders.map(row => ({ userId: row.userId })), leaders.length ? {
    roi: round(leaders[0].line.roi, 4), net: leaders[0].line.net, wins: leaders[0].line.wins, losses: leaders[0].line.losses, pushes: leaders[0].line.pushes,
  } : null));

  const scored = guesses.filter(g => finite(g.points)).map(g => ({ ...g, error: Math.abs(g.guess - g.reference) }));
  const best = topEntries(scored, g => g.error, { low: true });
  out.push(award('best_guess', best.map(g => ({ userId: g.userId, gameId: g.gameId, market: g.market, guess: g.guess })),
    best.length ? { error: best[0].error, points: best[0].points } : null));

  const sharp = topEntries(bets.filter(b => b.status !== 'void').map(b => ({ ...b, by: beatKickoffBy(b, week.kickoff[b.gameId]?.[b.market] ?? null) })),
    b => (finite(b.by) && b.by > 0 ? b.by : null));
  out.push(award('sharpest_bet', sharp.map(b => ({ userId: b.userId, gameId: b.gameId, market: b.market, side: b.side, line: b.line })),
    sharp.length ? { by: sharp[0].by } : null));

  const moved = topEntries(scored.map(g => ({ ...g, moved: movedToward(g, week.kickoff[g.gameId]?.[g.market] ?? null) })),
    g => (finite(g.moved) && g.moved > 0 ? g.moved : null));
  out.push(award('saw_it_coming', moved.map(g => ({ userId: g.userId, gameId: g.gameId, market: g.market, guess: g.guess })),
    moved.length ? { moved: moved[0].moved } : null));

  const beats = topEntries(bets.filter(b => b.status === 'loss').map(b => ({ ...b, lostBy: -coverMargin(b, games.get(b.gameId).result) })),
    b => (finite(b.lostBy) && b.lostBy > 0 ? b.lostBy : null), { low: true });
  out.push(award('worst_beat', beats.map(b => ({ userId: b.userId, gameId: b.gameId, market: b.market, side: b.side, line: b.line })),
    beats.length ? { lostBy: beats[0].lostBy } : null));

  return { ready: true, awards: out.filter(Boolean) };
}

/**
 * Season winners for one league from the season's normalized weeks: `{ decided, winners }`. Decided once Week 18 is in
 * the list and every one of its games is final or void; before that `decided` is false and there are no winners
 * ("Decided after Week 18"). Spread and Total champions have the most points on their own board; the Bets champion leads
 * the season Bets board: players who qualified in at least one week, by season ROI, then net units, then wins (D-36).
 */
export function seasonWinners(weeks, roster) {
  const list = Array.isArray(weeks) ? weeks : [], members = new Set(roster);
  const last = list.find(w => w.week === SEASON_FINAL_WEEK);
  if (!last || !allFinal(last)) return { decided: false, winners: [] };
  const regular = list.filter(w => w.week <= SEASON_FINAL_WEEK);
  const guesses = regular.flatMap(w => w.guesses.filter(g => members.has(g.userId)));
  const out = [];
  for (const [id, market] of [['spread_champion', 'spread'], ['total_champion', 'total']]) {
    const top = topEntries(marketTotals(guesses, market), row => row.points);
    out.push(award(id, top, top.length ? { points: top[0].points } : null));
  }
  const bets = regular.flatMap(w => w.bets.filter(b => members.has(b.userId)));
  const qualifiedOnce = new Set(regular.flatMap(w => unique(w.bets.filter(b => members.has(b.userId)).map(b => b.userId))
    .filter(userId => betsLine(w.bets.filter(b => b.userId === userId)).qualified)));
  const lines = [...qualifiedOnce].sort().map(userId => ({ userId, line: { ...betsLine(bets.filter(b => b.userId === userId)), qualified: true } }));
  const ranked = betsRanked(lines);
  const leaders = ranked.length ? ranked.filter(row => sameKey(betsKey(row.line), betsKey(ranked[0].line))) : [];
  out.push(award('bets_champion', leaders.map(row => ({ userId: row.userId })), leaders.length ? {
    roi: round(leaders[0].line.roi, 4), net: leaders[0].line.net, wins: leaders[0].line.wins, losses: leaders[0].line.losses, pushes: leaders[0].line.pushes,
  } : null));
  return { decided: true, winners: out.filter(Boolean) };
}
