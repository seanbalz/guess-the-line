import { isNbaDate } from '../../../../shared/nba-bets.mjs';
export function nbaRoute(hash) {
  const match = /^#nba\/(games|bets|history)(?:\?(.*))?$/.exec(hash);
  if (!match) return null;
  const screen = match[1], query = new URLSearchParams(match[2]);
  if (screen === 'games') return { screen, ...(isNbaDate(query.get('date')) ? { date: query.get('date') } : {}) };
  const status = query.get('status') ?? (screen === 'history' ? 'settled' : 'pending');
  const filters = {};
  if (['pending', 'settled', 'win', 'loss', 'push', 'void'].includes(status)) filters.status = status;
  if (['moneyline', 'spread', 'total'].includes(query.get('market'))) filters.market = query.get('market');
  for (const key of ['from', 'to']) if (isNbaDate(query.get(key))) filters[key] = query.get(key);
  return { screen, filters };
}
/** Any #nba… fragment belongs to the NBA section, including in-page anchors that are not routes (#nba-main). */
export const nbaFragment = hash => typeof hash === 'string' && hash.startsWith('#nba');
export function nbaHash(route) {
  const query = new URLSearchParams(route.screen === 'games' ? (route.date ? { date: route.date } : {}) : { status: 'all', ...route.filters });
  return `#nba/${route.screen}${query.size ? `?${query}` : ''}`;
}
export const today = (timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
// Do not round accounting strings through binary Number or recompute page totals.
export const displayUnits = value => value == null ? '—' : String(value).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
export async function recoverOperation(operation, api, options) {
  const data = await api('read', { ticketId: operation.ticket.id }, options);
  return data.tickets.find(ticket => ticket.audit.some(row => row.operationId === operation.operationId)) ?? null;
}
export function confirmSportLeave(win = window) {
  return win.dispatchEvent(new Event('gtl:sport-leave', { cancelable: true }));
}
export function navigateSport(hash, win = window) {
  if (!confirmSportLeave(win)) return false;
  const from = win.location.hash;
  win.history.pushState(null, '', hash);
  const event = new PopStateEvent('popstate'); event.gtlSportApproved = true; event.gtlSportFrom = from; win.dispatchEvent(event);
  return true;
}
