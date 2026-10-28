// Pick a Team weekly club draft rules. Pure functions only: no imports, no clock, no I/O.
// Lowest weekly score (plus bonus) picks first; deadline auto-picks resolve in draft order so a club taken earlier in
// the same pass is unavailable to later managers.

/** Implied probability of an American price; a shorter price gives a larger number. */
export function priceStrength(americanOdds) {
  return americanOdds < 0 ? -americanOdds / (-americanOdds + 100) : 100 / (americanOdds + 100);
}

/** Manager ids, first pick first: ascending weekScore + weekBonus, ties by lower seasonTotal. */
export function pickOrder(managers) {
  return [...managers]
    .sort((a, b) => (a.weekScore + a.weekBonus) - (b.weekScore + b.weekBonus) || a.seasonTotal - b.seasonTotal)
    .map(m => m.id);
}

/** First manager in order without a pick, or null when everyone has picked. */
export function onTheClock(order, picks) {
  const picked = new Set(picks.map(p => p.managerId));
  return order.find(id => !picked.has(id)) ?? null;
}

/** The manager on the clock, or the latest picker who may still change their pick until the next manager picks. */
export function canPick({ order, picks, managerId, club, clubs, now, deadline }) {
  if (now.getTime() >= deadline.getTime()) return { ok: false, code: 'GTL_EPL_DRAFT_CLOSED' };
  const picked = new Set(picks.map(p => p.managerId));
  const clock = onTheClock(order, picks);
  const latest = [...order].reverse().find(id => picked.has(id)) ?? null;
  // The latest picker only counts while nobody after them has picked, which holds by construction of order.
  if (managerId !== clock && managerId !== latest) return { ok: false, code: 'GTL_EPL_NOT_YOUR_TURN' };
  if (!clubs.includes(club)) return { ok: false, code: 'GTL_EPL_CLUB_NOT_PLAYING' };
  if (picks.some(p => p.club === club && p.managerId !== managerId)) return { ok: false, code: 'GTL_EPL_CLUB_TAKEN' };
  return { ok: true };
}

const finite = v => typeof v === 'number' && Number.isFinite(v);

/** Shortest 2-way price, else shortest 3-way price, else best (lowest) table position; 1 = top of the table. */
function autoClub(available, favorability) {
  const fav = club => favorability?.[club] ?? {};
  const byPosition = (a, b) => (finite(fav(a).position) ? fav(a).position : Infinity) - (finite(fav(b).position) ? fav(b).position : Infinity) || (a < b ? -1 : a > b ? 1 : 0);
  for (const key of ['twoWay', 'threeWay']) {
    const priced = available.filter(c => finite(fav(c)[key]));
    if (priced.length) return [...priced].sort((a, b) => priceStrength(fav(b)[key]) - priceStrength(fav(a)[key]) || byPosition(a, b))[0];
  }
  return [...available].sort(byPosition)[0] ?? null;
}

/** Final draft at the deadline, one row per manager in order. */
export function resolveDeadline({ order, picks, queues = {}, clubs, favorability = {} }) {
  const made = new Map(picks.map(p => [p.managerId, p.club]));
  const taken = new Set(made.values());
  const clock = onTheClock(order, picks);
  const out = [];
  for (const managerId of order) {
    if (made.has(managerId)) { out.push({ managerId, club: made.get(managerId), source: 'pick' }); continue; }
    const queued = (queues[managerId] ?? []).find(c => clubs.includes(c) && !taken.has(c));
    if (queued) { taken.add(queued); out.push({ managerId, club: queued, source: 'queue' }); continue; }
    if (managerId === clock) { out.push({ managerId, club: null, source: 'none' }); continue; }
    const club = autoClub(clubs.filter(c => !taken.has(c)), favorability);
    if (club) { taken.add(club); out.push({ managerId, club, source: 'auto' }); } else out.push({ managerId, club: null, source: 'none' });
  }
  return out;
}

/** Winning-margin rank of a finished result, or null for a draw, loss, postponed or pending match. */
export function marginRank(result) {
  if (!result || result.status !== 'final' || !(result.goalsFor > result.goalsAgainst)) return null;
  return { margin: result.goalsFor - result.goalsAgainst, goalsFor: result.goalsFor, goalsAgainst: result.goalsAgainst };
}

/**
 * Bonus goes to the widest winning margin among drafted clubs (margin x 5); ties break on more goals for, then fewer
 * goals against; managers still tied all receive it. A pending drafted match means not ready; postponed scores 0.
 */
export function settleBonus(picks, results) {
  if (picks.some(p => results[p.club]?.status === 'pending' || !results[p.club])) return { ready: false, awards: {}, winners: [] };
  const ranked = picks.map(p => ({ managerId: p.managerId, rank: marginRank(results[p.club]) })).filter(r => r.rank);
  if (!ranked.length) return { ready: true, awards: {}, winners: [] };
  const cmp = (a, b) => b.margin - a.margin || b.goalsFor - a.goalsFor || a.goalsAgainst - b.goalsAgainst;
  const best = [...ranked].sort((a, b) => cmp(a.rank, b.rank))[0].rank;
  const top = ranked.filter(r => cmp(r.rank, best) === 0);
  return { ready: true, awards: Object.fromEntries(top.map(r => [r.managerId, best.margin * 5])), winners: top.map(r => r.managerId) };
}
