// D-82 Player Props routes on gtl-api: POST /props/read, /props/draft, /props/lock, /props/history and /props/shared.
// Spec: docs/superpowers/specs/2026-11-09-player-props-design.md. Storage: supabase/migrations/20261110130000_gtl_player_props.sql.
//
// Ships dark behind three independent switches, all off by default:
//   1. gtl-api: the function secret GTL_PLAYER_PROPS must equal "on" (createCloudHandler's `playerProps`). Otherwise the
//      four routes answer exactly like a route that does not exist (404 "Not found.") before sign-in is even checked.
//   2. Database: gtl_prop_capability.live_lock_in (false when the migration is applied; no function enables it). Until it
//      is true /props/read answers available:false and every writer refuses with GTL_PROPS_OFF.
//   3. App: the build flag VITE_GTL_PLAYER_PROPS=on (web/src/next/props/flag.js). Otherwise no prop control renders and
//      no /props request is made.
// An unapplied schema (PostgREST 404 PGRST202) reads as off, so an old client and the Spread/Total routes are unaffected.
// The GTL_FEATURE_OFF secret's `player-props` switch pauses the writers; reads keep working.
//
// Every reply is rebuilt field by field. Only the signed-in owner's drafts and locks are ever returned, and an unlocked
// selection never carries a market number (the entry screen hides it). /props/shared is the one reader of other members'
// guesses: locked ones only, values and names only, and only for a selection the viewer locked in or whose event kicked
// off (D-31/D-39 reveal rules; supabase/migrations/20261110180000_gtl_player_props_shared.sql). Until that migration is
// applied it answers available:false, so an old schema and old clients are unaffected. No provider is called here: the lock-in reference
// comes from already retained research quotes (cloud/player-prop-receipts.mjs).
import { UUID_PATTERN } from './lobby.mjs';
import { PLAYER_PROPS_FEATURE, PROP_POSITIONS, propSelection, propStat, validPropGuess, validPropLine, validSeason, validWeek,
  validEventId, validPlayerId, PROP_RESULT_STATES } from '../shared/player-props.mjs';

export const PROPS_METHODS = Object.freeze({ '/props/read': ['POST'], '/props/draft': ['POST'], '/props/lock': ['POST'], '/props/history': ['POST'], '/props/shared': ['POST'] });
export const PROPS_RPCS = Object.freeze(['gtl_props_capability', 'gtl_props_board', 'gtl_props_save_draft', 'gtl_props_lock_in', 'gtl_props_history', 'gtl_props_record_reference', 'gtl_props_shared']);
export const PROPS_OFF = 'GTL_PROPS_OFF';
export const PROPS_PUBLIC_CODES = Object.freeze([PROPS_OFF, 'GTL_PROPS_LOCKED', 'GTL_PROPS_CLOSED', 'GTL_PROPS_REFERENCE_UNAVAILABLE']);
/** gtl-api's flag value: only the exact string "on" enables the routes. */
export const playerPropsOn = value => typeof value === 'string' && value.trim().toLowerCase() === 'on';

export class PropsError extends Error {
  constructor(status, message, code) { super(message); this.name = 'PropsError'; this.status = status; if (code) this.code = code; }
}
const ERRORS = Object.freeze({
  GTL_PROPS_INVALID: [400, 'Choose an available athlete and stat, and a number in half-point steps.'],
  GTL_PROPS_OFF: [404, 'Player Props is not available yet.', PROPS_OFF],
  GTL_FEATURE_OFF: [404, 'Player Props is not available yet.', PROPS_OFF],
  GTL_PROPS_CLOSED: [409, 'This game has kicked off. Your saved draft is kept.'],
  GTL_PROPS_LOCKED: [409, 'This prop is locked in and final.'],
  GTL_PROPS_RETRY_CONFLICT: [409, 'This save request was already used for a different guess.'],
  GTL_PROPS_REFERENCE_UNAVAILABLE: [409, 'We couldn’t verify the market reference. Your guess was not locked in. We kept your draft so you can try again before kickoff.'],
  GTL_PROPS_RANGE_TOO_LARGE: [400, 'Choose a shorter period.'],
  GTL_COMMUNITY_MEMBER: [403, 'Save your profile to play Player Props.'],
  GTL_PROPS_PAUSED: [503, 'Player Props saves are paused right now. Nothing you saved is lost.'],
});
export function providerPropsError(code) {
  if (!Object.hasOwn(ERRORS, code)) return new Error('Player Props is unavailable.');
  const [status, message, publicCode = code] = ERRORS[code];
  return new PropsError(status, message, publicCode);
}
const invalid = () => providerPropsError('GTL_PROPS_INVALID');
const reply = () => new Error('Invalid Player Props reply.');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function keys(value, allowed) { if (!record(value) || Object.keys(value).some(key => !allowed.includes(key))) throw invalid(); }
const iso = value => (typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null);
const text = (value, max = 80) => (typeof value === 'string' && value.length >= 1 && value.length <= max ? value : null);
const code = value => (typeof value === 'string' && /^[A-Z]{2,3}$/.test(value) ? value : null);
const num = value => (typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : null);

function identityView(raw) {
  if (!record(raw) || !validEventId(raw.eventId) || !validPlayerId(raw.playerId) || !propStat(raw.stat)) throw reply();
  return { eventId: raw.eventId, playerId: raw.playerId, stat: raw.stat };
}
const athleteView = raw => ({ playerName: text(raw.playerName) ?? 'Athlete', team: code(raw.team), position: PROP_POSITIONS.includes(raw.position) ? raw.position : null,
  away: code(raw.away), home: code(raw.home), kickoff: iso(raw.kickoff) });
function referenceView(stat, raw) {
  if (!record(raw)) return null;
  const line = num(raw.line);
  if (!validPropLine(stat, line)) throw reply();
  const books = Array.isArray(raw.books) ? raw.books.map(b => (record(b) && ['draftkings', 'fanduel', 'betmgm'].includes(b.book) && validPropLine(stat, num(b.line)) && iso(b.observedAt)
    ? { book: b.book, line: num(b.line), observedAt: iso(b.observedAt) } : null)) : [];
  if (books.length !== 3 || books.some(b => !b)) throw reply();
  return { line, books, observedFrom: iso(raw.observedFrom), observedTo: iso(raw.observedTo), recordedAt: iso(raw.recordedAt), provider: 'the-odds-api' };
}
/** One of the owner's guesses. A draft never carries a reference or a latest line, whatever the reply held. */
export function propGuessView(raw) {
  const id = identityView(raw);
  const guess = num(raw.guess);
  if (!validPropGuess(id.stat, guess) || !['draft', 'locked'].includes(raw.status) || !iso(raw.savedAt)) throw reply();
  const locked = raw.status === 'locked';
  if (locked !== Boolean(iso(raw.lockedAt))) throw reply();
  const reference = locked ? referenceView(id.stat, raw.reference) : null;
  if (locked && !reference) throw reply();
  const latestLine = locked && record(raw.latest) ? num(raw.latest.line) : null;
  return { ...id, season: Number.isInteger(raw.season) ? raw.season : null, week: Number.isInteger(raw.week) ? raw.week : null, ...athleteView(raw),
    guess, status: raw.status, savedAt: iso(raw.savedAt), lockedAt: locked ? iso(raw.lockedAt) : null, reference,
    latest: locked && validPropLine(id.stat, latestLine) ? { line: latestLine, observedAt: iso(raw.latest.observedTo) } : null };
}
function boardView(raw, target) {
  if (!record(raw) || raw.season !== target.season || raw.week !== target.week || !Array.isArray(raw.offers) || raw.offers.length > 5000
    || !Array.isArray(raw.own) || raw.own.length > 5000) throw reply();
  const offers = raw.offers.map(o => ({ ...identityView(o), ...athleteView(o), closed: o.closed === true }));
  const own = raw.own.map(propGuessView);
  if (new Set(own.map(g => `${g.eventId}/${g.playerId}/${g.stat}`)).size !== own.length) throw reply();
  return { offers, own };
}
function resultView(raw) {
  if (!record(raw) || !PROP_RESULT_STATES.includes(raw.status)) return null;
  return { status: raw.status, actual: raw.status === 'final' && Number.isSafeInteger(raw.actual) ? raw.actual : null,
    participated: typeof raw.participated === 'boolean' ? raw.participated : null, version: Number.isSafeInteger(raw.version) ? raw.version : null, observedAt: iso(raw.observedAt) };
}
function historyView(raw) {
  if (!record(raw) || raw.complete !== true || !Array.isArray(raw.rows) || raw.rows.length > 5000) throw reply();
  return { complete: true, rows: raw.rows.map(row => {
    const view = propGuessView(row);
    if (view.status !== 'locked') throw reply();
    const closing = num(row.closingLine);
    return { ...view, closingLine: validPropLine(view.stat, closing) ? closing : null, result: resultView(row.result) };
  }) };
}
/**
 * Other members' locked guesses (/props/shared). The second gate after the database: a selection passes only while it is
 * open to the viewer (their own lock of that exact selection, or kickoff), a row only when it is someone else's locked,
 * valid guess. No line, reference, draft or quote is ever part of this reply.
 */
export function sharedView(raw, target, viewer) {
  if (!record(raw) || raw.season !== target.season || raw.week !== target.week || !Array.isArray(raw.selections) || raw.selections.length > 5000) throw reply();
  const me = String(viewer).toLowerCase();
  const selections = raw.selections.filter(record).flatMap(s => {
    let id;
    try { id = identityView(s); } catch { return []; }
    const ownLocked = s.ownLocked === true, started = s.started === true;
    if (!ownLocked && !started) return [];
    const rows = (Array.isArray(s.rows) ? s.rows : []).filter(r => record(r) && UUID_PATTERN.test(r.userId ?? '') && r.userId.toLowerCase() !== me)
      .flatMap(r => {
        const guess = num(r.guess), lockedAt = iso(r.lockedAt);
        return validPropGuess(id.stat, guess) && lockedAt ? [{ userId: r.userId.toLowerCase(), name: text(r.displayName) ?? 'Player', removed: r.removed === true, guess, lockedAt }] : [];
      });
    return [{ ...id, ...athleteView(s), started, ownLocked, rows }];
  });
  return { available: true, ...target, selections };
}

const weekTarget = body => {
  if (!validSeason(body.season) || !validWeek(body.week)) throw invalid();
  return { season: body.season, week: body.week };
};
const unavailableBoard = (target, reason) => ({ available: false, reason, ...target, offers: [], own: [] });
const featureMissing = error => error?.code === PROPS_OFF && error?.status === 404;

async function propsRead({ body, user, service }) {
  keys(body, ['season', 'week']);
  const target = weekTarget(body);
  if (!service?.rpc) return unavailableBoard(target, 'schema_unavailable');
  let raw;
  try { raw = await service.rpc('gtl_props_board', { p_user: user.id, p_season: target.season, p_week: target.week }); }
  catch (error) { if (featureMissing(error)) return unavailableBoard(target, 'schema_unavailable'); throw error; }
  const view = boardView(raw, target);
  const ready = raw.ready === true;
  return { available: ready, reason: ready ? null : 'not_enabled', ...target, offers: ready ? view.offers : [], own: view.own };
}
function selectionBody(body) {
  keys(body, ['eventId', 'playerId', 'stat', 'guess', 'requestId']);
  const [season, week] = typeof body.eventId === 'string' ? body.eventId.split('_').map(Number) : [];
  const selection = propSelection({ season, week, eventId: body.eventId, playerId: body.playerId, stat: body.stat });
  if (!selection || !validPropGuess(selection.stat, body.guess) || typeof body.requestId !== 'string' || !UUID_PATTERN.test(body.requestId)) throw invalid();
  return { selection, guess: body.guess, requestId: body.requestId.toLowerCase() };
}
const writeArgs = (user, requestId, { selection, guess }) => ({ p_user: user.id, p_request: requestId, p_event_id: selection.eventId, p_player_id: selection.playerId, p_stat: selection.stat, p_guess: guess });
function savedView(raw, input) {
  const view = propGuessView(raw);
  if (view.eventId !== input.selection.eventId || view.playerId !== input.selection.playerId || view.stat !== input.selection.stat) throw reply();
  return { ...view, replayed: raw.replayed === true };
}
async function propsDraft({ body, user, service, featureOff }) {
  const input = selectionBody(body);
  if (featureOff.has(PLAYER_PROPS_FEATURE)) throw providerPropsError('GTL_PROPS_PAUSED');
  if (!service?.rpc) throw providerPropsError('GTL_PROPS_OFF');
  const saved = savedView(await service.rpc('gtl_props_save_draft', writeArgs(user, input.requestId, input)), input);
  if (saved.guess !== input.guess || saved.status !== 'draft') throw reply();
  return saved;
}
async function propsLock({ body, user, service, featureOff, uuid }) {
  const input = selectionBody(body);
  if (featureOff.has(PLAYER_PROPS_FEATURE)) throw providerPropsError('GTL_PROPS_PAUSED');
  if (!service?.rpc) throw providerPropsError('GTL_PROPS_OFF');
  const capability = await service.rpc('gtl_props_capability', {});
  if (!record(capability) || capability.ready !== true) throw providerPropsError('GTL_PROPS_OFF');
  // The draft is saved in its own call first, so a refused lock (no qualifying reference, a lost race) never loses it.
  try { await service.rpc('gtl_props_save_draft', writeArgs(user, uuid(), input)); }
  catch (error) { if (error?.code !== 'GTL_PROPS_LOCKED') throw error; }
  const { selection } = input;
  const board = boardView(await service.rpc('gtl_props_board', { p_user: user.id, p_season: selection.season, p_week: selection.week }), selection);
  const offer = board.offers.find(o => o.eventId === selection.eventId && o.playerId === selection.playerId && o.stat === selection.stat);
  // Refresh the reference from retained quotes only (no provider call). Its outcome does not decide: the SQL writer
  // accepts only a qualifying recorded reference and otherwise refuses with GTL_PROPS_REFERENCE_UNAVAILABLE.
  if (offer && !offer.closed && typeof service.references?.referenceForLock === 'function') {
    try { await service.references.referenceForLock({ ...offer, season: selection.season, week: selection.week }); } catch { /* Unavailable stays explicit below. */ }
  }
  const saved = savedView(await service.rpc('gtl_props_lock_in', writeArgs(user, input.requestId, input)), input);
  if (saved.status !== 'locked' || saved.guess !== input.guess) throw providerPropsError('GTL_PROPS_LOCKED');
  return saved;
}
async function propsHistory({ body, user, service }) {
  keys(body, ['from', 'to']);
  for (const end of [body.from, body.to]) { keys(end, ['season', 'week']); weekTarget(end); }
  if (body.from.season * 100 + body.from.week > body.to.season * 100 + body.to.week) throw invalid();
  if (!service?.rpc) throw providerPropsError('GTL_PROPS_OFF');
  const raw = await service.rpc('gtl_props_history', { p_user: user.id, p_from_season: body.from.season, p_from_week: body.from.week, p_to_season: body.to.season, p_to_week: body.to.week });
  return { from: { ...body.from }, to: { ...body.to }, ...historyView(raw) };
}

async function propsShared({ body, user, service }) {
  keys(body, ['season', 'week']);
  const target = weekTarget(body);
  const off = { available: false, ...target, selections: [] };
  if (!service?.rpc) return off;
  let raw;
  try { raw = await service.rpc('gtl_props_shared', { p_user: user.id, p_season: target.season, p_week: target.week }); }
  catch (error) { if (featureMissing(error)) return off; throw error; }
  return sharedView(raw, target, user.id);
}

export async function handleProps({ route, body, user, service, featureOff = new Set(), uuid = () => crypto.randomUUID() }) {
  if (!UUID_PATTERN.test(user?.id ?? '') || user?.is_anonymous === true) throw new PropsError(401, 'Sign in to continue.');
  if (route === '/props/read') return propsRead({ body, user, service });
  if (route === '/props/draft') return propsDraft({ body, user, service, featureOff });
  if (route === '/props/lock') return propsLock({ body, user, service, featureOff, uuid });
  if (route === '/props/history') return propsHistory({ body, user, service });
  if (route === '/props/shared') return propsShared({ body, user, service });
  throw new PropsError(404, 'Not found.');
}
