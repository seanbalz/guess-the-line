// EPL Bets recommendations (docs/EPL_FEATURES_2026_11_09.md, confirmed behavior 3; delivery stage 2) on gtl-api.
//   /epl/bets/read  any signed-in account: the caller's OWN locked moneyline guesses on matches that have not kicked off,
//                   compared with the latest stored same-market odds (gtl_epl_bet_recommendations, 20261110100000).
// A read uses stored evidence only: it calls no provider and reserves no credit, so opening EPL Bets buys nothing.
// Favorable gap alone orders the list (the server's order, re-checked here); trend context and concerns are added to
// explain or flag, never to reorder or exclude. Another manager's guesses never appear. Every reply is rebuilt field by
// field. Until the migration is applied PostgREST answers PGRST202 and the route reads as unavailable.
import { MANAGER_NAMES } from '../shared/epl-sleeper.mjs';
import { EPL_CLUBS } from '../shared/epl-clubs.mjs';
import { validPrice, validOutcome, outcomeClub, EPL_MARKETS } from '../shared/epl-moneyline.mjs';
import { RECOMMENDATION_MAX_ITEMS, candidateGap, orderedByGap, priceTrend, recommendationConcerns } from '../shared/epl-recommendations.mjs';

export const EPL_BETS_METHODS = Object.freeze({ '/epl/bets/read': ['POST'] });
export const EPL_BETS_RPCS = Object.freeze(['gtl_epl_bet_recommendations']);
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clubs = new Set(EPL_CLUBS.map(c => c.code));
const seasonOk = v => Number.isInteger(v) && v >= 2000 && v <= 2200;
const weekOk = v => Number.isInteger(v) && v >= 1 && v <= 38;
const eventOk = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const iso = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
const count = v => Number.isSafeInteger(v) && v >= 0;
const invalidReply = () => new Error('Invalid EPL bets reply.');

export class EplBetsError extends Error {
  constructor() { super('Choose a valid matchweek.'); this.name = 'EplBetsError'; this.status = 400; this.code = 'GTL_EPL_BETS_INVALID'; }
}
export const EPL_BETS_PUBLIC_CODES = Object.freeze(['GTL_EPL_BETS_INVALID']);
const unavailable = error => error?.status === 404 && error?.code === 'GTL_EPL_OFF';

function itemView(raw, now) {
  if (!record(raw) || !eventOk(raw.eventId) || !clubs.has(raw.home) || !clubs.has(raw.away) || raw.home === raw.away || !iso(raw.commenceTime)
    || !EPL_MARKETS.includes(raw.market) || !validOutcome(raw.market, raw.outcome) || raw.club !== outcomeClub(raw, raw.outcome)
    || !validPrice(raw.price) || !validPrice(raw.latestPrice) || !iso(raw.latestObservedAt) || !iso(raw.lockedAt)
    || !Number.isInteger(raw.books) || raw.books < 2 || raw.books > 3 || !Number.isSafeInteger(raw.gap) || raw.gap <= 0 || raw.gap !== candidateGap(raw)
    || (raw.referencePrice !== null && !validPrice(raw.referencePrice)) || (raw.referencePrice === null) !== (raw.referenceObservedAt === null)
    || (raw.referenceObservedAt !== null && !iso(raw.referenceObservedAt))
    || !validPrice(raw.firstPrice) || !iso(raw.firstObservedAt) || !Number.isInteger(raw.observations) || raw.observations < 1
    // The database chose the latest observation at or before its own clock; allow a small service clock skew.
    || Date.parse(raw.latestObservedAt) > now + 300_000) throw invalidReply();
  const item = { eventId: raw.eventId, home: raw.home, away: raw.away, commenceTime: iso(raw.commenceTime), market: raw.market, outcome: raw.outcome,
    club: raw.club, price: raw.price, lockedAt: iso(raw.lockedAt), referencePrice: raw.referencePrice, referenceObservedAt: iso(raw.referenceObservedAt),
    latestPrice: raw.latestPrice, latestObservedAt: iso(raw.latestObservedAt), books: raw.books, gap: raw.gap,
    firstPrice: raw.firstPrice, firstObservedAt: iso(raw.firstObservedAt), observations: raw.observations,
    source: 'Median of DraftKings, FanDuel and BetMGM' };
  return { ...item, trend: priceTrend(item), concerns: recommendationConcerns(item, now) };
}

export function eplBetsView(raw, target, now) {
  if (!record(raw) || raw.season !== target.season || raw.week !== target.week || (raw.ownerId !== null && !Object.hasOwn(MANAGER_NAMES, raw.ownerId))
    || !iso(raw.asOf) || !count(raw.locked) || !count(raw.unpriced) || !count(raw.withoutGap) || !Array.isArray(raw.items) || raw.items.length > RECOMMENDATION_MAX_ITEMS
    || raw.items.length + raw.unpriced + raw.withoutGap !== raw.locked || (raw.ownerId === null && raw.locked !== 0)) throw invalidReply();
  const items = raw.items.map(item => itemView(item, now));
  if (new Set(items.map(i => i.eventId)).size !== items.length || !orderedByGap(items)) throw invalidReply();
  return { available: true, reason: null, season: target.season, week: target.week, ownerId: raw.ownerId, asOf: iso(raw.asOf),
    locked: raw.locked, unpriced: raw.unpriced, withoutGap: raw.withoutGap, items };
}

const empty = (target, reason) => ({ available: false, reason, season: target?.season ?? null, week: target?.week ?? null, ownerId: null, asOf: null,
  locked: 0, unpriced: 0, withoutGap: 0, items: [] });

/** POST /epl/bets/read { season?, week? }: the selected (default latest stored) matchweek's recommendations. */
export async function handleEplBets({ body, user, service, clock }) {
  if (!record(body) || Object.keys(body).some(k => !['season', 'week'].includes(k))) throw new EplBetsError();
  if ((body.season !== undefined || body.week !== undefined) && (!seasonOk(body.season) || !weekOk(body.week))) throw new EplBetsError();
  const target = body.season !== undefined ? { season: body.season, week: body.week } : (await service.guessWeeks())[0] ?? null;
  if (!target) return empty(null, 'no_week');
  let raw;
  try { raw = await service.rpc('gtl_epl_bet_recommendations', { p_user: user.id, p_season: target.season, p_week: target.week }); }
  catch (error) { if (unavailable(error)) return empty(target, 'schema_unavailable'); throw error; }
  const now = clock();
  if (!Number.isFinite(now)) throw invalidReply();
  return eplBetsView(raw, { season: target.season, week: target.week }, now);
}
