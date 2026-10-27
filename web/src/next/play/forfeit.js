const MODES = ['guess_spread', 'guess_total'];
const names = { guess_spread: 'Spread', guess_total: 'Total' };
const count = n => Number.isInteger(n) && n >= 0 && n <= 64;
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

/** The existing M-03 reader decides which remaining markets a whole-week reveal forfeits. */
export function forfeitView(feed, scope) {
  const data = feed?.forfeit, now = feed?.picksDue?.now;
  if (typeof scope?.accountId !== 'string' || !scope.accountId || !Number.isInteger(scope.season) || !Number.isInteger(scope.week)
    || typeof feed?.viewer !== 'string' || feed.viewer.toLowerCase() !== scope.accountId.toLowerCase()
    || feed.week?.season !== scope.season || feed.week?.week !== scope.week
    || data?.season !== scope.season || data?.week !== scope.week
    || typeof data.open !== 'boolean' || !Array.isArray(data.markets)
    || data.closesAt !== null && !instant(data.closesAt)) return null;
  const markets = MODES.map(mode => data.markets.filter(row => row?.mode === mode));
  if (markets.some(rows => rows.length !== 1 || !['open', 'submitted', 'sat_out'].includes(rows[0].status)
    || !count(rows[0].games) || !count(rows[0].lockedIn) || rows[0].lockedIn > rows[0].games)) return null;
  const stored = data.forfeit;
  if (stored !== null && (!stored || !['reveal', 'skip'].includes(stored.reason) || !instant(stored.createdAt)
    || !Array.isArray(stored.modes) || !stored.modes.length || new Set(stored.modes).size !== stored.modes.length || stored.modes.some(mode => !MODES.includes(mode)))) return null;
  // The reader omits picksDue.now once no guesses are due. A stored receipt needs no clock.
  if (data.open && !stored && !instant(now)) return null;
  const rows = markets.map(([row]) => ({ ...row, name: names[row.mode] }));
  return { rows, stored, now, closesAt: data.closesAt,
    canConfirm: data.open && !stored && instant(now) && rows.some(row => row.status === 'open') && Date.parse(data.closesAt) > Date.parse(now),
    affected: rows.filter(row => row.status === 'open').map(row => row.name).join(' and ') };
}
export const forfeitKey = scope => `gtl.next.forfeit.${encodeURIComponent(scope.accountId)}.${scope.season}.${scope.week}`;
