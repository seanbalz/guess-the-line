import { validateJournalMoney, summarizeJournal } from '../shared/journal-performance.mjs';
import { validatePersonalForecast } from '../server/personal-forecast.mjs';
import { UUID_PATTERN } from './lobby.mjs';
import { BALLOT_LOCKED_MESSAGE } from './weekly.mjs';

export const PERSONAL_METHODS = {
  '/personal': ['GET'], '/personal/read': ['POST'], '/personal/ballot': ['POST'],
  '/personal/forecast': ['POST'], '/favorite/set': ['POST'], '/journal/create': ['POST'],
  '/journal/correct': ['POST'], '/journal/archive': ['POST'], '/journal/history': ['POST'],
  // M-09 private game notes (redesign stage 27): the owner's notes for a week, and one note's save.
  '/personal/notes': ['POST'], '/personal/note': ['POST'],
};
const ERRORS = {
  GTL_PERSONAL_INVALID: [400, 'Check the entry fields and try again.'],
  GTL_PERSONAL_CONFLICT: [409, 'Your personal workspace changed on another device. Refresh and review before saving again.'],
  GTL_PERSONAL_RETRY_CONFLICT: [409, 'This request was already used for different content. Refresh before saving again.'],
  GTL_PERSONAL_NOT_FOUND: [404, 'This private record is unavailable.'],
  GTL_PERSONAL_LIMIT: [409, 'This week has reached the personal record limit.'],
  GTL_PERSONAL_PROFILE: [400, 'Open My games and save your display name first.'],
  GTL_PERSONAL_SLATE: [404, 'This week’s schedule is not available.'],
  GTL_MATCHING_BALLOT_REQUIRED: [403, 'Submit the matching Spread or Total ballot before recording a market selection.'],
  // M-02 (stage 18, D-37 as amended by D-39): a locked-in Spread or Total guess is final; mapped before the SQL raises it.
  GTL_BALLOT_LOCKED: [409, BALLOT_LOCKED_MESSAGE],
  GTL_GAME_CLOSED: [409, 'This game has kicked off. Its guess can no longer be locked in or changed.'],
  GTL_PREDICTION_CLOSED: [409, 'The prediction deadline has passed.'],
  GTL_PREDICTION_NOT_OPEN: [409, 'This week’s picks open Monday 12:00 AM PT.'],
  GTL_COMMUNITY_SAT_OUT: [409, 'You sat out this week for that market. Its picks are closed.'],
  GTL_BALLOT_INCOMPLETE: [400, 'Complete every prediction before submitting.'],
  GTL_WEEKLY_CONFLICT: [409, 'Your weekly ballot changed in another group or on another device. Refresh and review before saving.'],
  // M-09 private notes (stage 27), mapped before the SQL can raise them. GTL_FEATURE_OFF is also the answer while
  // the hosted project does not have a personal RPC yet (PostgREST PGRST202, see createSupabaseAdapter).
  GTL_NOTE_TOO_LONG: [400, 'A note can be up to 2,000 characters.'],
  GTL_NOTE_CONFLICT: [409, 'This note changed on another device. Refresh before saving again.'],
  GTL_FEATURE_OFF: [503, 'This feature is not available right now. Nothing you saved is lost.'],
};
export class PersonalError extends Error { constructor(status, message, code) { super(message); this.status = status; if (code) this.code = code; } }
export const providerPersonalError = message => ERRORS[message] ? new PersonalError(...ERRORS[message], message) : new Error('Personal workspace unavailable.');
const invalid = () => { throw providerPersonalError('GTL_PERSONAL_INVALID'); };
const fields = (body, allowed) => { if (!body || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) invalid(); };
const text = (value, max, min = 0) => typeof value === 'string' && value.trim().length >= min && value.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
const revision = value => Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;
/**
 * A private note's limit, counted as the browser's textarea maxLength counts (UTF-16 code units) and as the old
 * /favorite/set route does, so a note saved by either app can be saved again by the other. That is never more than
 * the 2,000 characters the database allows, so a stored note always fits.
 */
export const NOTE_MAX = 2000;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
function slate(body) { if (!Number.isInteger(body.season) || body.season < 2000 || body.season > 2200 || !Number.isInteger(body.week) || body.week < 1 || body.week > 25) invalid(); }
function target(body) { slate(body); if (!/^[A-Z]{2,4}-[A-Z]{2,4}$/.test(body.gameId || '')) invalid(); }
/**
 * M-02 lockIn (redesign stage 18): the games this /personal/ballot save locks in (D-39 per-game lock-in), distinct and each
 * with a guess in the same save. The SQL checks the same and decides; a locked-in guess is final.
 */
function lockIn(body) {
  if (!Array.isArray(body.lockIn) || body.lockIn.length > 32 || new Set(body.lockIn).size !== body.lockIn.length
    || body.lockIn.some(id => typeof id !== 'string' || !/^[A-Z]{2,4}-[A-Z]{2,4}$/.test(id) || !Object.hasOwn(body.picks, id))) invalid();
}
function marketValue(market, value) { if (!['spread', 'total'].includes(market) || !Number.isFinite(value) || value * 2 !== Math.trunc(value * 2) || (market === 'spread' ? value < -100 || value > 100 : value < 0 || value > 200)) invalid(); }
const entryFields = ['season', 'week', 'gameId', 'kind', 'market', 'side', 'line', 'odds', 'source', 'quotedAt', 'placedAt', 'notes', 'outcome', 'currency', 'stakeMinor', 'returnedMinor'];
function journal(body, now) {
  target(body); marketValue(body.market, body.line);
  if (!['research_note', 'user_reported_placed_bet'].includes(body.kind) || !(body.market === 'spread' ? ['home', 'away'] : ['over', 'under']).includes(body.side) || !Number.isInteger(body.odds) || Math.abs(body.odds) < 100 || Math.abs(body.odds) > 10000 || !text(body.source, 120, 2) || !text(body.notes, 2000)) invalid();
  for (const key of ['quotedAt', 'placedAt']) {
    if (key === 'placedAt' && body[key] === null) continue;
    if (typeof body[key] !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(body[key]) || !Number.isFinite(Date.parse(body[key])) || Date.parse(body[key]) > now) invalid();
    body[key] = new Date(body[key]).toISOString();
  }
  if ((body.kind === 'user_reported_placed_bet') !== (body.placedAt !== null)) invalid();
  try { Object.assign(body, validateJournalMoney(body)); } catch { invalid(); }
  body.source = body.source.trim(); body.notes = body.notes.trim();
}

// Every user identity comes from the verified Auth boundary, never request JSON.
// featureOff: the names gtl-api's GTL_FEATURE_OFF secret turns off (cloud/feature-off.mjs).
export async function handlePersonal({ route, body = {}, user, service, clock = Date.now, submitBallot, featureOff = new Set() }) {
  if (!service) throw new Error('Personal workspace not configured.');
  const actor = { p_user: user.id };
  // M-09 private notes (D-36): only the signed-in owner's notes, never another account's. A read without a week is
  // the newest published week. A save carries the note's revision it started from and a request id; the note is
  // stored exactly as typed (never trimmed or cut) and must fit NOTE_MAX.
  if (route === '/personal/notes') {
    fields(body, ['season', 'week']);
    if (body.season !== undefined || body.week !== undefined) slate(body);
    return service.rpc('gtl_read_game_notes', { ...actor, p_season: body.season ?? null, p_week: body.week ?? null });
  }
  if (route === '/personal/note') {
    fields(body, ['requestId', 'season', 'week', 'gameId', 'note', 'revision']);
    target(body);
    if (!UUID_PATTERN.test(body.requestId || '') || !revision(body.revision) || typeof body.note !== 'string') invalid();
    if (body.note.length > NOTE_MAX) throw providerPersonalError('GTL_NOTE_TOO_LONG');
    if (!text(body.note, NOTE_MAX) || LONE_SURROGATE.test(body.note)) invalid();
    if (featureOff.has('notes')) throw providerPersonalError('GTL_FEATURE_OFF');
    return service.rpc('gtl_set_game_note', { ...actor, p_request: body.requestId, p_season: body.season, p_week: body.week, p_game: body.gameId, p_note: body.note, p_revision: body.revision });
  }
  if (route === '/personal' || route === '/personal/read') {
    fields(body, ['season', 'week', 'cursor', 'includeArchived']);
    if (body.season !== undefined || body.week !== undefined) slate(body);
    if (body.cursor !== undefined && body.cursor !== null && !UUID_PATTERN.test(body.cursor)) invalid();
    if (body.includeArchived !== undefined && typeof body.includeArchived !== 'boolean') invalid();
    const result = await service.rpc('gtl_read_personal', { ...actor, p_season: body.season ?? null, p_week: body.week ?? null, p_cursor: body.cursor ?? null, p_archived: body.includeArchived ?? false });
    // SQL supplies all active selected-week accounting rows separately from the journal page.
    const { accountingRecords, ...view } = result;
    return { ...view, performance: summarizeJournal(accountingRecords || []) };
  }
  if (route === '/journal/history') {
    fields(body, ['entryId']); if (!UUID_PATTERN.test(body.entryId || '')) invalid();
    return service.rpc('gtl_personal_history', { ...actor, p_entry: body.entryId });
  }
  const common = ['requestId', 'revision'];
  const allowed = {
    '/personal/ballot': ['season', 'week', 'mode', 'weeklyRevision', 'picks', 'submit'],
    '/personal/forecast': ['season', 'week', 'gameId', 'market', 'value'],
    '/favorite/set': ['season', 'week', 'gameId', 'saved', 'notes'],
    '/journal/create': entryFields,
    '/journal/correct': ['entryId', 'reason', ...entryFields],
    '/journal/archive': ['entryId', 'archived', 'reason'],
  }[route];
  if (!allowed) invalid();
  // M-02 (redesign stage 18, D-39): /personal/ballot also takes an optional lockIn, the games this save locks in.
  fields(body, [...common, ...allowed, ...(route === '/personal/ballot' ? ['lockIn'] : [])]);
  if (!UUID_PATTERN.test(body.requestId || '') || !revision(body.revision)) invalid();
  const payload = { ...body };
  if (route === '/personal/ballot') {
    slate(payload);
    if (!['guess_spread', 'guess_total'].includes(body.mode) || !revision(body.weeklyRevision) || typeof body.submit !== 'boolean' || !body.picks || Array.isArray(body.picks) || typeof body.picks !== 'object' || Object.keys(body.picks).length > 32) invalid();
    for (const [key, value] of Object.entries(body.picks)) { if (!/^[A-Z]{2,4}-[A-Z]{2,4}$/.test(key)) invalid(); marketValue(body.mode === 'guess_spread' ? 'spread' : 'total', value); }
    if (body.lockIn !== undefined) lockIn(body);
    if (body.lockIn !== undefined && featureOff.has('lock-in')) throw providerPersonalError('GTL_FEATURE_OFF');
  } else if (route === '/personal/forecast') { target(payload); try { Object.assign(payload, validatePersonalForecast(body)); } catch { invalid(); } }
  else if (route === '/favorite/set') { target(payload); if (typeof body.saved !== 'boolean' || !text(body.notes, 2000)) invalid(); payload.notes = body.notes.trim(); }
  else if (route === '/journal/create' || route === '/journal/correct') journal(payload, clock());
  if (['/journal/correct', '/journal/archive'].includes(route) && (!UUID_PATTERN.test(body.entryId || '') || !text(body.reason, 300, 3))) invalid();
  if (route === '/journal/archive' && typeof body.archived !== 'boolean') invalid();
  const commit = () => service.rpc('gtl_mutate_personal', { ...actor, p_action: route.slice(1), p_body: payload });
  if (route !== '/personal/ballot') return commit();
  // A per-game lock-in saves the newest stored line (or the D-27 pending one) without a refresh first: the refresh path's
  // intent has no lockIn, and the lock-in never depends on a refresh (October 12, 2026).
  try { return await (submitBallot && payload.lockIn === undefined ? submitBallot(payload, commit) : commit()); }
  catch (error) {
    // D-24: name the week so the message matches the picks-due notice.
    if (error?.code === 'GTL_PREDICTION_NOT_OPEN') throw new PersonalError(error.status, `Week ${payload.week} picks open Monday 12:00 AM PT.`, error.code);
    throw error;
  }
}
