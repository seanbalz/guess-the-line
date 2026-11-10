// D-82 Player Props quote and actual-result receipts. Server only.
//
// Quotes: a lock-in reference is built ONLY from quotes already retained by the existing, separately authorized research
// intake (cloud/research-provider.mjs collectResearchQuotes, reserved against the shared free budget and lease in
// gtl_begin_research_quotes). This module never calls a provider, never reserves credits and never starts a collector,
// so no page view or lock can become a collection loop. When the retained quotes do not qualify, the answer is an
// explicit `unavailable` with a reason: the draft is kept and nothing is fabricated or repaired with another quote.
//
// Results: a raw weekly player-stat row (the audited nflverse columns in shared/player-props.mjs) becomes a receipt only
// for the exact event and stable player ID. A missing row is not a zero, and a zero is final only with participation
// evidence. Everything else is an explicit ungraded status.
import { researchMarketUnit } from '../shared/research-markets.mjs';
import { propStat, validPropActual, validPropLine, validEventId, validPlayerId } from '../shared/player-props.mjs';

/** The three permitted books of the existing Guess reference policy. */
export const PROP_REFERENCE_BOOKS = Object.freeze(['draftkings', 'fanduel', 'betmgm']);
/** The existing policy's agreement band, in the stat's own unit (not recalibrated per stat). */
export const PROP_REFERENCE_TOLERANCE = 5;
export const PROP_REFERENCE_MAX_AGE_MS = 6 * 3_600_000;
export const PROP_REFERENCE_ALIGN_MS = 30 * 60_000;
const time = value => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : NaN);
const unavailable = reason => Object.freeze({ status: 'unavailable', reason });

/** The app's game ID for an offer (`DAL-PHI`), as the research intake stores it. */
export const propGameId = offer => `${offer.away}-${offer.home}`;

/**
 * Builds a qualifying three-book median reference for one offer from retained normalized research quotes, or returns
 * `{ status: 'unavailable', reason }`. Requires, per permitted book, exactly one Over and one Under at the same
 * half-point line for this exact player ID and canonical stat, observed before kickoff, not after `now`, within six hours,
 * and all three books within 30 minutes of each other and within the +/-5 band of the median.
 */
export function propReferenceFromQuotes(quotes, { offer, now }) {
  const s = propStat(offer?.stat);
  const kickoff = time(offer?.kickoff);
  if (!s || !validPlayerId(offer?.playerId) || !validEventId(offer?.eventId) || !Number.isFinite(kickoff) || !Number.isFinite(now)) return unavailable('invalid_offer');
  if (now >= kickoff) return unavailable('kicked_off');
  if (researchMarketUnit(s.key) !== s.unit) return unavailable('unit_mismatch');
  const gameId = propGameId(offer);
  const matching = (Array.isArray(quotes) ? quotes : []).filter(q => q?.selection?.market === 'prop' && q.selection.key === s.key
    && q.selection.playerId === offer.playerId && q.gameId === gameId && time(q.kickoff) === kickoff && q.provider === 'the-odds-api');
  if (!matching.length) return unavailable('no_retained_quotes');
  if (new Set(matching.map(q => q.providerEventId)).size !== 1) return unavailable('event_mismatch');
  const books = [];
  for (const book of PROP_REFERENCE_BOOKS) {
    const rows = matching.filter(q => q.book === book);
    const over = rows.filter(q => q.selection.side === 'over'), under = rows.filter(q => q.selection.side === 'under');
    if (over.length !== 1 || under.length !== 1) return unavailable('missing_book');
    const line = over[0].selection.line;
    if (under[0].selection.line !== line || !validPropLine(s.key, line)) return unavailable('book_line_mismatch');
    const observed = Math.max(time(over[0].observedAt), time(under[0].observedAt));
    if (!Number.isFinite(observed) || observed > now || observed >= kickoff || now - observed > PROP_REFERENCE_MAX_AGE_MS) return unavailable('stale_or_future_quote');
    books.push({ book, line, observedAt: new Date(observed).toISOString() });
  }
  const times = books.map(b => Date.parse(b.observedAt));
  if (Math.max(...times) - Math.min(...times) > PROP_REFERENCE_ALIGN_MS) return unavailable('not_time_aligned');
  const lines = books.map(b => b.line).sort((a, b) => a - b);
  const median = lines[1];
  if (lines.some(line => Math.abs(line - median) > PROP_REFERENCE_TOLERANCE)) return unavailable('books_disagree');
  return Object.freeze({ status: 'qualified', line: median, books: Object.freeze(books),
    observedFrom: new Date(Math.min(...times)).toISOString(), observedTo: new Date(Math.max(...times)).toISOString(),
    sourceAgeMs: now - Math.max(...times) });
}

/**
 * The retained quotes from finished research fetch rows (`gtl_research_quote_fetches`): rows that errored or are still
 * running contribute nothing. Pure; the caller reads the rows.
 */
export function retainedPropQuotes(fetchRows) {
  return (Array.isArray(fetchRows) ? fetchRows : []).filter(row => row?.status === 'finished' && row.error == null && Array.isArray(row.quote_payload))
    .flatMap(row => row.quote_payload);
}

/**
 * The lock-in reference source for gtl-api. `rows(table, query, max)` is the adapter's service-role table reader and
 * `rpc(name, body)` the Player Props RPC caller. It reads at most the latest twenty finished fetches of the offer's game
 * from the last six hours and records a qualifying reference through gtl_props_record_reference, which checks it again.
 */
export function createPropReferenceSource({ rows, rpc, clock = Date.now }) {
  return {
    async referenceForLock(offer) {
      const now = clock();
      if (typeof rows !== 'function' || typeof rpc !== 'function') return unavailable('source_unavailable');
      let fetched;
      try {
        fetched = await rows('gtl_research_quote_fetches', {
          select: 'status,error,quote_payload', season: `eq.${offer.season}`, week: `eq.${offer.week}`, game_id: `eq.${propGameId(offer)}`,
          status: 'eq.finished', started_at: `gte.${new Date(now - PROP_REFERENCE_MAX_AGE_MS).toISOString()}`,
          order: 'started_at.desc,request_id.desc', limit: '20' }, 20);
      } catch { return unavailable('source_unavailable'); }
      const built = propReferenceFromQuotes(retainedPropQuotes(fetched), { offer, now });
      if (built.status !== 'qualified') return built;
      try {
        await rpc('gtl_props_record_reference', { p_event_id: offer.eventId, p_player_id: offer.playerId, p_stat: offer.stat, p_line: built.line, p_books: built.books });
      } catch { return unavailable('reference_not_recorded'); }
      return built;
    },
  };
}

// ---------- actual-result receipts ----------
const sha256 = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
/**
 * One result receipt for one offer from the audited weekly player-stat file. `row` is the raw stat row for this exact
 * player ID and game (or undefined), `source` is `{ name, sha256, observedAt }` for the verified asset, and `evidence`
 * carries what the raw numbers cannot prove: `{ final, participated, cancelled, correctionPending }`.
 * Returns the gtl_props_record_result payload, or null when the source itself is not verified.
 */
export function propResultReceipt({ offer, row, source, evidence = {} }) {
  const s = propStat(offer?.stat);
  if (!s || !validEventId(offer?.eventId) || !validPlayerId(offer?.playerId) || !source || !sha256(source.sha256)
    || typeof source.name !== 'string' || !source.name || !Number.isFinite(time(source.observedAt))) return null;
  const base = { eventId: offer.eventId, playerId: offer.playerId, stat: s.key, source: source.name.slice(0, 200), sourceSha256: source.sha256, observedAt: source.observedAt };
  const ungraded = status => ({ ...base, status, actual: null, participated: typeof evidence.participated === 'boolean' ? evidence.participated : null });
  if (evidence.cancelled === true) return ungraded('cancelled');
  if (evidence.correctionPending === true) return ungraded('correction_pending');
  if (row !== undefined && row !== null && (row.player_id !== offer.playerId || row.game_id !== offer.eventId)) return ungraded('identity_unverified');
  if (evidence.participated === false) return ungraded('dnp');
  // A missing row, an unfinished game or unproven participation is never turned into a zero: no receipt is written,
  // so the paper record keeps the selection ungraded (waiting for a verified final).
  if (!row || evidence.final !== true || evidence.participated !== true) return null;
  const raw = row[s.resultColumn];
  const actual = typeof raw === 'string' && /^-?\d+$/.test(raw.trim()) ? Number(raw.trim()) : raw;
  if (!validPropActual(s.key, actual)) return ungraded('identity_unverified');
  return { ...base, status: 'final', actual, participated: true };
}
