// NBA addresses in the Prism shell (milestone N1): #nba/home, #nba/play, #nba/bets/open, #nba/bets/history and
// #nba/research/games, each with only its own allowlisted values. The v1 addresses (#nba/games, #nba/bets, #nba/history)
// and any other #nba/... fragment are legacy: the shell's router replaces them (replaceState) with their new place, so
// Back never returns to the old address. Pure apart from `window` defaults, so node tests read it directly.
import { isNbaDate } from '../../../../shared/nba-bets.mjs';

export const NBA_TABS = Object.freeze(['home', 'play', 'bets', 'research']);
export const NBA_BET_PANES = Object.freeze(['open', 'history']);
/** History's Result filter; `settled` is its default, `all` shows every ticket including pending ones. */
export const NBA_HISTORY_STATUSES = Object.freeze(['settled', 'win', 'loss', 'push', 'void', 'all']);
export const NBA_MARKET_FILTERS = Object.freeze(['moneyline', 'spread', 'total']);
const BET_KEYS = Object.freeze(['pane', 'status', 'market', 'from', 'to']);

/**
 * The one canonical view for an NBA tab. Every key the tab owns is present (undefined when unset), so restoring an
 * entry never keeps a filter or date from the place it left. Nothing outside the allowlist crosses into NBA.
 */
export function nbaView(tab, view = {}) {
  const value = view && typeof view === 'object' ? view : {};
  if (tab === 'bets') {
    const pane = NBA_BET_PANES.includes(value.pane) ? value.pane : 'open';
    const status = pane === 'history' && NBA_HISTORY_STATUSES.includes(value.status) && value.status !== 'settled' ? value.status : undefined;
    const market = NBA_MARKET_FILTERS.includes(value.market) ? value.market : undefined;
    const from = isNbaDate(value.from) ? value.from : undefined;
    const to = isNbaDate(value.to) && !(from && value.to < from) ? value.to : undefined;
    return { pane, status, market, from, to };
  }
  if (tab === 'research') return { date: isNbaDate(value.date) ? value.date : undefined };
  return {};
}

function betsFromQuery(params, pane) {
  const status = params.get('status');
  return nbaView('bets', { pane, status, market: params.get('market'), from: params.get('from'), to: params.get('to') });
}

/**
 * Parses any #nba/... address: `{ tab, view, legacy }`, or null for anything else (including the in-page anchor
 * #nba-main). `legacy` is true when the address is not its own canonical form, so the router replaces it.
 */
export function nbaRoute(hash) {
  if (typeof hash !== 'string' || !hash.startsWith('#nba/')) return null;
  const [path, query = ''] = hash.slice('#nba/'.length).split('?');
  const parts = path.split('/'), params = new URLSearchParams(query);
  let place;
  if (parts[0] === 'games' && parts.length === 1) place = { tab: 'research', view: nbaView('research', { date: params.get('date') }) };
  else if (parts[0] === 'history' && parts.length === 1) place = { tab: 'bets', view: betsFromQuery(params, 'history') };
  else if (parts[0] === 'bets' && parts.length === 1) {
    // v1 wrote #nba/bets?status=all|pending for My Bets; a settled status there belongs to History now.
    const status = params.get('status');
    place = { tab: 'bets', view: betsFromQuery(params, NBA_HISTORY_STATUSES.includes(status) && status !== 'all' ? 'history' : 'open') };
  } else if (parts[0] === 'bets' && NBA_BET_PANES.includes(parts[1]) && parts.length === 2) place = { tab: 'bets', view: betsFromQuery(params, parts[1]) };
  else if (parts[0] === 'research' && (parts.length === 1 || (parts[1] === 'games' && parts.length === 2))) place = { tab: 'research', view: nbaView('research', { date: params.get('date') }) };
  else if (['home', 'play'].includes(parts[0]) && parts.length === 1) place = { tab: parts[0], view: {} };
  else place = { tab: 'home', view: {} };
  return { ...place, legacy: nbaHash(place) !== hash };
}

/** The canonical address of an NBA place. */
export function nbaHash({ tab, view } = {}) {
  if (!NBA_TABS.includes(tab)) return '#nba/home';
  const clean = nbaView(tab, view);
  if (tab === 'bets') {
    const params = new URLSearchParams();
    for (const key of BET_KEYS.slice(1)) if (clean[key] !== undefined) params.set(key, clean[key]);
    return `#nba/bets/${clean.pane}${params.size ? `?${params}` : ''}`;
  }
  if (tab === 'research') return `#nba/research/games${clean.date ? `?date=${clean.date}` : ''}`;
  return `#nba/${tab}`;
}

/** The read filters a Bets view asks `/nba/read` for (Open is always pending tickets). */
export function nbaReadFilters(view) {
  const clean = nbaView('bets', view);
  const status = clean.pane === 'open' ? 'pending' : clean.status === 'all' ? undefined : clean.status ?? 'settled';
  return Object.fromEntries(Object.entries({ status, market: clean.market, from: clean.from, to: clean.to }).filter(([, value]) => value !== undefined));
}

/** Any #nba… fragment belongs to the NBA section, including in-page anchors that are not routes (#nba-main). */
export const nbaFragment = hash => typeof hash === 'string' && hash.startsWith('#nba');
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
