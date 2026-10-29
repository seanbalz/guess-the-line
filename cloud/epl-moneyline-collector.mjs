// Server-only M-36 collection. API locks persist first; refreshForLock never throws or returns market/private evidence.
// A durable shared lease reserves one credit before each single-event source request. No retry or browser-triggered read.
import { fetchEplDrawNoBet } from './epl-sources.mjs';
import { median, validPrice, MAX_DNB_PRICE } from '../shared/epl-moneyline.mjs';
export const EPL_MONEYLINE_RPCS = Object.freeze(['gtl_epl_begin_moneyline_read', 'gtl_epl_finish_moneyline_read', 'gtl_epl_moneyline_due']);
const BOOKS = Object.freeze(['draftkings', 'fanduel', 'betmgm']);
const EVENT_ID = /^[A-Za-z0-9_-]{1,100}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const iso = value => new Date(value).toISOString();
const ms = value => typeof value === 'string' ? Date.parse(value) : NaN;

/** Exact stored fixture, bounded allowed-book evidence, normalized median on the American line, and five-minute book age.
 * The returned whitelist is private service evidence; neither the API hook nor the worker response exposes it. */
export function normalizeEplMoneylineEvent(event, fixture, now) {
  const observed = ms(event?.observedAt), kick = ms(fixture?.commenceTime);
  if (event?.available !== true || event.eventId !== fixture?.eventId || event.home !== fixture.home || event.away !== fixture.away
    || ms(event.commenceTime) !== kick || !Number.isFinite(observed) || !Number.isFinite(now) || observed > now || now - observed > 120_000
    || observed >= kick || now >= kick || !/^[a-f0-9]{64}$/.test(event.responseSha256 ?? '')) return null;
  const books = {}, bookObservedAt = {};
  for (const name of BOOKS) {
    const b = event.books?.[name], at = ms(event.bookObservedAt?.[name]);
    if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).length !== 2 || !Number.isFinite(at) || at > observed || observed - at > 300_000
      || ![fixture.home, fixture.away].every(club => validPrice(b[club]) && Math.abs(b[club]) <= MAX_DNB_PRICE)) continue;
    books[name] = { [fixture.home]: b[fixture.home], [fixture.away]: b[fixture.away] };
    bookObservedAt[name] = iso(at);
  }
  if (Object.keys(books).length < 2) return null;
  return { eventId: event.eventId, home: fixture.home, away: fixture.away, commenceTime: iso(kick), observedAt: iso(observed),
    responseSha256: event.responseSha256, books, bookObservedAt,
    medians: Object.fromEntries([fixture.home, fixture.away].map(club => [club, median(Object.values(books).map(b => b[club]))])) };
}

export class EplMoneylineError extends Error {
  constructor(code) { super('EPL moneyline collection is unavailable.'); this.code = code; }
}
/** Narrow adapter shared by an authenticated API post-save hook and the scheduled worker. */
export function createEplMoneylineAdapter({ url, serviceRoleKey, fetchImpl = fetch }) {
  const base = new URL(url);
  if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash || base.username || base.password || !serviceRoleKey) throw new EplMoneylineError('CONFIG');
  return { async rpc(name, args) {
    if (!EPL_MONEYLINE_RPCS.includes(name)) throw new EplMoneylineError('CONFIG');
    const response = await fetchImpl(new URL(`/rest/v1/rpc/${name}`, base), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    let data; try { data = await response.json(); } catch { throw new EplMoneylineError('UNAVAILABLE'); }
    if (!response.ok) {
      const absent = data?.code === 'PGRST202' || (data?.code === '42883' && new RegExp(`^function (?:public\\.)?${name}\\s*\\(`, 'i').test(data?.message ?? ''));
      throw new EplMoneylineError(response.status === 404 && absent ? 'GTL_EPL_MONEYLINE_OFF' : 'UNAVAILABLE');
    }
    return data;
  } };
}

export function createEplMoneylineCollector({ rpc, drawNoBet, clock = Date.now }) {
  async function collect(args) {
    let lease;
    try {
      lease = await rpc('gtl_epl_begin_moneyline_read', { ...args, p_now: iso(clock()) });
      if (lease?.status !== 'ready') return { status: lease?.status === 'cached' ? 'cached' : 'unavailable' };
      if (!UUID.test(lease.leaseId ?? '') || !UUID.test(lease.token ?? '') || lease.fixture?.eventId !== args.p_event_id) return { status: 'unavailable' };
      let event = null, quota = null, error = null;
      try {
        const reply = await drawNoBet({ eventIds: [args.p_event_id], observations: true });
        quota = reply?.quota ?? null;
        const rows = Array.isArray(reply?.events) ? reply.events.filter(e => e?.eventId === args.p_event_id) : [];
        event = rows.length === 1 ? normalizeEplMoneylineEvent(rows[0], lease.fixture, clock()) : null;
      } catch (e) {
        quota = e?.quota ?? null;
        error = e?.code === 'EPL_SOURCE_AUTH' ? 'auth' : e?.code === 'EPL_SOURCE_RATE_LIMIT' ? 'rate_limit' : 'unavailable';
      }
      const result = await rpc('gtl_epl_finish_moneyline_read', { p_lease: lease.leaseId, p_token: lease.token,
        p_event: event, p_quota: quota, p_error: error, p_now: iso(clock()) });
      return { status: result?.status === 'refreshed' ? 'refreshed' : 'unavailable' };
    } catch { return { status: 'unavailable' }; }
  }
  return {
    /** Call only after gtl_epl_save_guess accepted lock:true, with the authenticated user id. Never before that writer. */
    async refreshForLock({ userId, eventId }) {
      if (!UUID.test(userId ?? '') || !EVENT_ID.test(eventId ?? '')) return { status: 'unavailable' };
      return collect({ p_event_id: eventId, p_user: userId });
    },
    async collectForJob({ eventId, run }) {
      if (!EVENT_ID.test(eventId ?? '')) return { status: 'unavailable' };
      return collect({ p_event_id: eventId, ...run });
    },
  };
}

/** Edge entrypoint factory. Missing configuration buys nothing; each accepted lock uses the same durable contract. */
export function createEplMoneylineRefreshForLock({ url, serviceRoleKey, apiKey, fetchImpl = fetch, clock = Date.now }) {
  if (typeof apiKey !== 'string' || apiKey.length < 8 || apiKey.length > 256 || /\s/.test(apiKey)) return async () => ({ status: 'unavailable' });
  const service = createEplMoneylineAdapter({ url, serviceRoleKey, fetchImpl });
  const collector = createEplMoneylineCollector({ rpc: service.rpc.bind(service), clock,
    drawNoBet: ({ eventIds, observations }) => fetchEplDrawNoBet({ apiKey, fetchImpl, eventIds, observations, clock }),
  });
  return args => collector.refreshForLock(args);
}
