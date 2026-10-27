// Virtual Units weekly and season boards (D-18, D-35, D-36; redesign build plan stage 42, M-12). Pure: the one
// definition of a player's week (record, net units, ROI, qualification) and of the board order, shared by the
// API (`cloud/bets.mjs`) and the screens, so the two can never rank differently. The SQL readers return each
// player's week totals; `weekFromPicks` is the same arithmetic from raw picks (the parity tests compare them).
//
// - Qualification counts every current row for the week (one per game and market), whatever its status: a voided
//   row keeps its original credit (D-18). A week qualifies at 3 picks or 3 units.
// - Record, net units and ROI come from settled rows only (win, loss, push). A settled row's net is its saved
//   `result.netUnits`, or −units for a loss and 0 for a push when none is saved. Void and pending rows are left out.
// - ROI is net units over units risked on settled rows, as a percentage to two places; null ("—") until a row settles.
// - Board order: qualified players only, by ROI, then net units, then wins. A null ROI ranks after every number.
//   Players equal on all three share a rank, shown "T-2".

const SETTLED = new Set(['win', 'loss', 'push']);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const num = value => (typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN);
const round2 = value => Math.round(value * 100) / 100;

export const QUALIFY_PICKS = 3;
export const QUALIFY_UNITS = 3;

/** One settled row's net units, or null for a row that is not settled. */
export function pickNet(pick) {
  if (!SETTLED.has(pick?.status)) return null;
  const saved = num(pick?.result?.netUnits);
  if (Number.isFinite(saved)) return saved;
  const units = num(pick?.selection?.units);
  return pick.status === 'loss' && Number.isFinite(units) ? -units : 0;
}

/** The ROI percentage for `netUnits` over `riskUnits`, to two places; null while nothing is at risk. */
export function roiOf(netUnits, riskUnits) {
  return finite(riskUnits) && riskUnits > 0 && finite(netUnits) ? round2(netUnits / riskUnits * 100) : null;
}

/** A normalized week: `{ wins, losses, pushes, pending, voids, picks, units, riskUnits, netUnits, roi, qualified }`. */
export function normalizeWeek(row = {}) {
  const int = key => (Number.isSafeInteger(num(row[key])) && num(row[key]) >= 0 ? num(row[key]) : 0);
  const amount = key => (Number.isFinite(num(row[key])) ? round2(num(row[key])) : 0);
  const week = { wins: int('wins'), losses: int('losses'), pushes: int('pushes'), pending: int('pending'), voids: int('voids'),
    picks: int('picks'), units: amount('units'), riskUnits: amount('riskUnits'), netUnits: amount('netUnits') };
  return { ...week, roi: roiOf(week.netUnits, week.riskUnits), qualified: week.picks >= QUALIFY_PICKS || week.units >= QUALIFY_UNITS };
}

/** The same week from one player's raw picks for that week (rows of `gtl_virtual_units_picks`). */
export function weekFromPicks(picks = []) {
  const rows = Array.isArray(picks) ? picks : [];
  const count = status => rows.filter(pick => pick?.status === status).length;
  const units = pick => (Number.isFinite(num(pick?.selection?.units)) ? num(pick.selection.units) : 0);
  const settled = rows.filter(pick => SETTLED.has(pick?.status));
  return normalizeWeek({
    wins: count('win'), losses: count('loss'), pushes: count('push'), pending: count('pending'), voids: count('void'),
    picks: rows.length, units: rows.reduce((sum, pick) => sum + units(pick), 0),
    riskUnits: settled.reduce((sum, pick) => sum + units(pick), 0), netUnits: settled.reduce((sum, pick) => sum + pickNet(pick), 0),
  });
}

/** Adds weeks together (a season): sums, then ROI and `qualifiedWeeks`. */
export function addWeeks(weeks = []) {
  const list = (Array.isArray(weeks) ? weeks : []).map(normalizeWeek);
  const sum = key => list.reduce((total, week) => total + week[key], 0);
  const total = normalizeWeek({ wins: sum('wins'), losses: sum('losses'), pushes: sum('pushes'), pending: sum('pending'), voids: sum('voids'),
    picks: sum('picks'), units: sum('units'), riskUnits: sum('riskUnits'), netUnits: sum('netUnits') });
  return { ...total, qualifiedWeeks: list.filter(week => week.qualified).length };
}

const compare = (a, b) => {
  if (a.roi !== b.roi) {
    if (a.roi === null) return 1;
    if (b.roi === null) return -1;
    return b.roi - a.roi;
  }
  return b.netUnits - a.netUnits || b.wins - a.wins;
};

/**
 * Ranks `rows` (`[{ userId, ...week totals }]`): qualified rows only (or, with `eligible`, the rows it accepts), in
 * board order, each with `rank` and `tied` ("T-2" when `tied`). Rows the board leaves off are returned in `unranked`.
 */
export function rankBoard(rows = [], { eligible = row => row.qualified } = {}) {
  const all = (Array.isArray(rows) ? rows : []).filter(row => typeof row?.userId === 'string').map(row => ({ ...row, ...normalizeWeek(row), userId: row.userId }));
  const ranked = all.filter(eligible).sort((a, b) => compare(a, b) || a.userId.localeCompare(b.userId));
  let rank = 0;
  const board = ranked.map((row, i) => {
    if (i === 0 || compare(ranked[i - 1], row) !== 0) rank = i + 1;
    return { ...row, rank };
  });
  for (const row of board) row.tied = board.some(other => other !== row && other.rank === row.rank);
  const kept = new Set(board.map(row => row.userId));
  return { board, unranked: all.filter(row => !kept.has(row.userId)) };
}

/** "1", "T-2": a board row's rank as the screens show it. */
export const rankLabel = row => (row?.tied ? `T-${row.rank}` : String(row?.rank ?? ''));

/**
 * The season board (D-36): anyone who qualified in at least one week, ranked by season ROI, then net units, then
 * wins over every week of the season, qualified or not (D-18: an unqualified week still counts in the record).
 * `weeks` is `[{ week, rows: [{ userId, ...week totals }] }]`.
 */
export function seasonBoard(weeks = []) {
  const byUser = new Map();
  for (const { rows = [] } of Array.isArray(weeks) ? weeks : []) {
    for (const row of Array.isArray(rows) ? rows : []) {
      if (typeof row?.userId !== 'string') continue;
      byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
    }
  }
  const totals = [...byUser].map(([userId, list]) => ({ userId, ...addWeeks(list) }));
  return rankBoard(totals, { eligible: row => row.qualifiedWeeks > 0 });
}
