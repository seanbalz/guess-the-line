import { validateJournalMoney, summarizeJournal } from '../shared/journal-performance.mjs';
import { validatePersonalForecast } from '../server/personal-forecast.mjs';
import { UUID_PATTERN } from './lobby.mjs';

export const PERSONAL_METHODS = {
  '/personal': ['GET'], '/personal/read': ['POST'], '/personal/ballot': ['POST'],
  '/personal/forecast': ['POST'], '/favorite/set': ['POST'], '/journal/create': ['POST'],
  '/journal/correct': ['POST'], '/journal/archive': ['POST'], '/journal/history': ['POST'],
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
  GTL_BALLOT_LOCKED: [409, 'This ballot is submitted and permanently locked.'],
  GTL_PREDICTION_CLOSED: [409, 'The prediction deadline has passed.'],
  GTL_PREDICTION_NOT_OPEN: [409, 'This week’s picks open Monday 12:00 AM PT.'],
  GTL_BALLOT_INCOMPLETE: [400, 'Complete every prediction before submitting.'],
  GTL_WEEKLY_CONFLICT: [409, 'Your weekly ballot changed in another group or on another device. Refresh and review before saving.'],
};
export class PersonalError extends Error { constructor(status, message, code) { super(message); this.status = status; if (code) this.code = code; } }
export const providerPersonalError = message => ERRORS[message] ? new PersonalError(...ERRORS[message], message) : new Error('Personal workspace unavailable.');
const invalid = () => { throw providerPersonalError('GTL_PERSONAL_INVALID'); };
const fields = (body, allowed) => { if (!body || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) invalid(); };
const text = (value, max, min = 0) => typeof value === 'string' && value.trim().length >= min && value.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
const revision = value => Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;
function slate(body) { if (!Number.isInteger(body.season) || body.season < 2000 || body.season > 2200 || !Number.isInteger(body.week) || body.week < 1 || body.week > 25) invalid(); }
function target(body) { slate(body); if (!/^[A-Z]{2,4}-[A-Z]{2,4}$/.test(body.gameId || '')) invalid(); }
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
export async function handlePersonal({ route, body = {}, user, service, clock = Date.now, submitBallot }) {
  if (!service) throw new Error('Personal workspace not configured.');
  const actor = { p_user: user.id };
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
  fields(body, [...common, ...allowed]);
  if (!UUID_PATTERN.test(body.requestId || '') || !revision(body.revision)) invalid();
  const payload = { ...body };
  if (route === '/personal/ballot') {
    slate(payload);
    if (!['guess_spread', 'guess_total'].includes(body.mode) || !revision(body.weeklyRevision) || typeof body.submit !== 'boolean' || !body.picks || Array.isArray(body.picks) || typeof body.picks !== 'object' || Object.keys(body.picks).length > 32) invalid();
    for (const [key, value] of Object.entries(body.picks)) { if (!/^[A-Z]{2,4}-[A-Z]{2,4}$/.test(key)) invalid(); marketValue(body.mode === 'guess_spread' ? 'spread' : 'total', value); }
  } else if (route === '/personal/forecast') { target(payload); try { Object.assign(payload, validatePersonalForecast(body)); } catch { invalid(); } }
  else if (route === '/favorite/set') { target(payload); if (typeof body.saved !== 'boolean' || !text(body.notes, 2000)) invalid(); payload.notes = body.notes.trim(); }
  else if (route === '/journal/create' || route === '/journal/correct') journal(payload, clock());
  if (['/journal/correct', '/journal/archive'].includes(route) && (!UUID_PATTERN.test(body.entryId || '') || !text(body.reason, 300, 3))) invalid();
  if (route === '/journal/archive' && typeof body.archived !== 'boolean') invalid();
  const commit = () => service.rpc('gtl_mutate_personal', { ...actor, p_action: route.slice(1), p_body: payload });
  if (route !== '/personal/ballot') return commit();
  try { return await (submitBallot ? submitBallot(payload, commit) : commit()); }
  catch (error) {
    // D-24: name the week so the message matches the picks-due notice.
    if (error?.code === 'GTL_PREDICTION_NOT_OPEN') throw new PersonalError(error.status, `Week ${payload.week} picks open Monday 12:00 AM PT.`, error.code);
    throw error;
  }
}
