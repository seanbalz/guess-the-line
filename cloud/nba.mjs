import { normalizeNbaTicket, NBA_UUID, NBA_OUTCOMES, NBA_MARKETS, isNbaDate } from '../shared/nba-bets.mjs';
export const NBA_METHODS = Object.freeze({ '/nba/read': ['POST'], '/nba/save': ['POST'] });
export class NbaError extends Error {
  constructor(status, message) { super(message); this.name = 'NbaError'; this.status = status; }
}
const ERRORS = Object.freeze({
  GTL_NBA_INVALID: [400, 'Enter complete NBA ticket terms and a valid price.'],
  GTL_NBA_CONFLICT: [409, 'This ticket changed on another device. Refresh before saving.'],
  GTL_NBA_OPERATION_CONFLICT: [409, 'This save request was already used for different terms.'],
  GTL_NBA_NOT_FOUND: [404, 'NBA ticket not found.'],
  GTL_FEATURE_OFF: [503, 'NBA tickets are not available right now.'],
});
export const providerNbaError = code => Object.hasOwn(ERRORS, code) ? new NbaError(...ERRORS[code]) : new Error('NBA tickets are unavailable.');
const fail = () => { throw providerNbaError('GTL_NBA_INVALID'); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) => { if (!record(value) || Object.keys(value).some(key => !allowed.includes(key))) fail(); };
const uuid = value => typeof value === 'string' && NBA_UUID.test(value);
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
const decimal = value => typeof value === 'string' && /^-?(?:0|[1-9]\d*)\.\d{8}$/.test(value);
// Rebuild every level: neither source records nor internal receipt payloads reach the browser.
function ticketTerms(raw) {
  if (!record(raw) || !uuid(raw.id) || !Array.isArray(raw.legs)) throw new Error('Invalid NBA reply.');
  if (raw.outcome === 'pending' ? raw.netUnits !== null : !decimal(raw.netUnits)) throw new Error('Invalid NBA reply.');
  return { id: raw.id, season: raw.season, eventDate: raw.eventDate, kind: raw.kind, label: raw.label,
    legs: raw.legs.map(leg => Object.fromEntries(['gameId', 'matchup', 'market', 'team', 'side', 'line'].filter(key => Object.hasOwn(leg, key)).map(key => [key, leg[key]]))),
    odds: raw.odds, stakeUnits: raw.stakeUnits, outcome: raw.outcome, netUnits: raw.netUnits,
    priceInput: record(raw.priceInput) ? { format: raw.priceInput.format, value: raw.priceInput.value } : null };
}
function ticketView(raw) {
  return { ...ticketTerms(raw), revision: raw.revision, updatedAt: timestamp(raw.updatedAt),
    audit: (Array.isArray(raw.audit) ? raw.audit : []).map(row => ({ operationId: row.operationId, revision: row.revision,
      reason: typeof row.reason === 'string' ? row.reason : null, updatedAt: timestamp(row.updatedAt),
      before: row.before ? ticketTerms(row.before) : null, after: ticketTerms(row.after) })) };
}
function readView(raw) {
  if (!record(raw) || !Array.isArray(raw.tickets) || !record(raw.summary)) throw new Error('Invalid NBA reply.');
  const counts = ['count', 'wins', 'losses', 'pushes', 'voids', 'pending'];
  const units = ['riskUnits', 'netUnits', 'pendingStakeUnits'];
  if (counts.some(key => !Number.isSafeInteger(raw.summary[key]) || raw.summary[key] < 0)
    || units.some(key => !decimal(raw.summary[key])) || raw.summary.roi !== null && !decimal(raw.summary.roi)) throw new Error('Invalid NBA reply.');
  const summary = Object.fromEntries([...counts, ...units, 'roi'].map(key => [key, raw.summary[key]]));
  return { tickets: raw.tickets.map(ticketView), summary, nextCursor: raw.nextCursor ? { eventDate: raw.nextCursor.eventDate, id: raw.nextCursor.id } : null };
}
export async function handleNba({ route, body, user, service }) {
  if (!uuid(user?.id) || user.is_anonymous === true) throw new NbaError(401, 'Sign in to continue.');
  if (!Object.hasOwn(NBA_METHODS, route)) throw new NbaError(404, 'Not found.');
  if (route === '/nba/read') {
    keys(body, ['filters', 'cursor', 'ticketId']);
    const filters = body.filters ?? {}; keys(filters, ['status', 'market', 'from', 'to']);
    if (filters.status !== undefined && ![...NBA_OUTCOMES, 'settled'].includes(filters.status) || filters.market !== undefined && !NBA_MARKETS.includes(filters.market)
      || filters.from !== undefined && !isNbaDate(filters.from) || filters.to !== undefined && !isNbaDate(filters.to)
      || filters.from && filters.to && filters.from > filters.to || body.ticketId !== undefined && !uuid(body.ticketId)) fail();
    const cursor = body.cursor ?? null;
    if (cursor !== null) { keys(cursor, ['eventDate', 'id']); if (!isNbaDate(cursor.eventDate) || !uuid(cursor.id)) fail(); }
    if (!service?.rpc) throw providerNbaError('GTL_FEATURE_OFF');
    return readView(await service.rpc('gtl_nba_read_bets', { p_user_id: user.id, p_filters: filters, p_cursor: cursor, p_ticket_id: body.ticketId ?? null }));
  }
  keys(body, ['operationId', 'ticket', 'expectedRevision', 'reason']);
  if (!uuid(body.operationId) || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || body.expectedRevision > 2147483646
    || body.reason !== undefined && (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 500)
    || body.expectedRevision > 0 && !body.reason?.trim()) fail();
  let ticket;
  try { ticket = normalizeNbaTicket(body.ticket); } catch { fail(); }
  if (!service?.rpc) throw providerNbaError('GTL_FEATURE_OFF');
  const result = await service.rpc('gtl_nba_save_bet', { p_user_id: user.id, p_operation_id: body.operationId.toLowerCase(),
    p_ticket: ticket, p_expected_revision: body.expectedRevision, p_reason: body.reason?.trim() ?? null });
  return { ticket: ticketView(result.ticket) };
}
