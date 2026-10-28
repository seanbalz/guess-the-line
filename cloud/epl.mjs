// EPL "Pick a Team" routes on gtl-api (docs/superpowers/specs/2026-10-28-epl-fantasy-and-moneyline-design.md section 6;
// plan docs/superpowers/plans/2026-10-28-epl-pick-a-team.md, Task 4). Six POST routes over the M-30 service-only functions
// (supabase/migrations/20261028180000_gtl_epl_pick_a_team.sql):
//   /epl/draft/read      a linked FEPL manager or the commissioner: the week's board, the clubs playing, the caller's own queue
//   /epl/draft/pick      the manager on the clock, or the latest picker changing their pick (gtl_epl_save_pick re-checks it all)
//   /epl/queue/save      a linked manager's private backup ranking (at most 20 different clubs playing that week)
//   /epl/admin/link      the commissioner links an account to a manager
//   /epl/admin/week      the commissioner opens or corrects a seeded week (MW9), with its order and the picks made elsewhere
//   /epl/admin/snapshot  the commissioner stores a Sleeper season-total snapshot, unique by label
// The rules in shared/epl-draft.mjs refuse an out-of-turn, taken, closed or not-playing pick before any write, so the
// common refusals cost no write; the SQL is still the authority (it locks the week row and checks again).
//
// The commissioner is gtl_community_admin (the sean-troy-luke commissioner), never gtl_epl_member: Sean is also a manager,
// and once linked gtl_epl_member answers his owner_id. Queues are private: a reply carries only the caller's own.
//
// Until M-30 is applied PostgREST answers 404 PGRST202, the adapter reads that as GTL_FEATURE_OFF, and every route answers
// 404 "Pick a Team is coming soon." with code GTL_EPL_OFF. Every reply is rebuilt field by field.
import { UUID_PATTERN } from './lobby.mjs';
import { canPick, onTheClock } from '../shared/epl-draft.mjs';
import { MANAGER_NAMES } from '../shared/epl-sleeper.mjs';

export const EPL_METHODS = Object.freeze({
  '/epl/draft/read': ['POST'], '/epl/draft/pick': ['POST'], '/epl/queue/save': ['POST'],
  '/epl/admin/link': ['POST'], '/epl/admin/week': ['POST'], '/epl/admin/snapshot': ['POST'],
});
/** The service-only functions these routes may call; the adapter refuses any other name. */
export const EPL_RPCS = Object.freeze(['gtl_epl_member', 'gtl_epl_week_state', 'gtl_epl_save_pick', 'gtl_epl_save_queue',
  'gtl_epl_link_manager', 'gtl_epl_seed_week', 'gtl_epl_save_snapshot', 'gtl_community_admin']);

export class EplError extends Error {
  constructor(status, message, code) { super(message); this.name = 'EplError'; this.status = status; if (code) this.code = code; }
}
const ERRORS = Object.freeze({
  GTL_EPL_INVALID: [400, 'Choose a valid matchweek, club and manager.'],
  GTL_EPL_QUEUE_INVALID: [400, 'A queue is up to 20 different clubs that play this matchweek.'],
  GTL_EPL_UNKNOWN_MANAGER: [400, 'That manager is not in the FEPL league.'],
  // Not a linked FEPL manager and not the commissioner (the API's own check, before any state is read).
  GTL_EPL_MEMBER_ONLY: [403, 'Pick a Team is for the FEPL managers.', 'GTL_EPL_FORBIDDEN'],
  GTL_EPL_FORBIDDEN: [403, 'Only the commissioner can manage Pick a Team.'],
  GTL_EPL_NOT_MEMBER: [403, 'Only a linked FEPL manager can save a queue.'],
  GTL_EPL_NO_WEEK: [404, 'No Pick a Team matchweek is open.'],
  GTL_EPL_DRAFT_CLOSED: [409, 'The draft for this matchweek has closed.'],
  GTL_EPL_NOT_YOUR_TURN: [409, 'It is not your turn to pick.'],
  GTL_EPL_CLUB_NOT_PLAYING: [409, 'That club has no match this matchweek.'],
  GTL_EPL_CLUB_TAKEN: [409, 'Another manager already picked that club.'],
  GTL_EPL_ALREADY_LINKED: [409, 'That account is already linked to another manager.'],
  GTL_EPL_SEED_REFUSED: [409, 'This matchweek already has in-app picks, so its order and picks are fixed.'],
  GTL_EPL_NOT_RESOLVED: [409, 'This matchweek has not been resolved yet.'],
  // M-30 not on the database (not applied, or rolled back): the coming-soon answer.
  GTL_FEATURE_OFF: [404, 'Pick a Team is coming soon.', 'GTL_EPL_OFF'],
});
/** Refusal codes a reply carries beside its sentence (cloud/handler.mjs PUBLIC_CODES). */
export const EPL_PUBLIC_CODES = Object.freeze([...new Set(Object.entries(ERRORS).map(([code, [, , publicCode = code]]) => publicCode))]);
export function providerEplError(code) {
  if (!Object.hasOwn(ERRORS, code)) return new Error('Pick a Team is unavailable.');
  const [status, message, publicCode = code] = ERRORS[code];
  return new EplError(status, message, publicCode);
}

/**
 * gtl-api's EPL service: the group RPC caller plus two service-role table reads that no M-30 function covers (the latest
 * week, and the caller's own queue). `rest(table, query)` answers one row or null (cloud/handler.mjs createSupabaseAdapter).
 */
export function createEplService({ rpc, rest }) {
  return {
    rpc: (name, args) => rpc(name, args),
    async latestWeek() {
      const row = await rest('gtl_epl_weeks', { select: 'season,week', order: 'season.desc,week.desc', limit: '1' });
      return row && Number.isInteger(row.season) && Number.isInteger(row.week) ? { season: row.season, week: row.week } : null;
    },
    async readQueue(season, week, ownerId) {
      const row = await rest('gtl_epl_queues', { select: 'clubs', season: `eq.${season}`, week: `eq.${week}`, owner_id: `eq.${ownerId}`, limit: '1' });
      return Array.isArray(row?.clubs) ? row.clubs.filter(club => typeof club === 'string') : [];
    },
  };
}

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const refuse = code => { throw providerEplError(code); };
const keys = (value, allowed, code = 'GTL_EPL_INVALID') => { if (!record(value) || Object.keys(value).some(key => !allowed.includes(key))) refuse(code); };
const isSeason = value => Number.isInteger(value) && value >= 2000 && value <= 2200;
const isWeek = value => Number.isInteger(value) && value >= 1 && value <= 38;
const CLUB = /^[A-Z]{3}$/;
const isClub = value => typeof value === 'string' && CLUB.test(value);
const isManager = value => typeof value === 'string' && Object.hasOwn(MANAGER_NAMES, value);
const nameOf = ownerId => (isManager(ownerId) ? MANAGER_NAMES[ownerId] : ownerId);
const given = value => value !== undefined && value !== null;
/** A timestamp as ISO text, or null when it is not one. */
const iso = value => (typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value)).toISOString() : null);
const text = value => (typeof value === 'string' ? value : null);
const reply = () => new Error('Invalid Pick a Team reply.');

/** The week asked for, or the latest stored one. Both season and week, or neither. */
async function targetWeek(body, service) {
  if (given(body.season) || given(body.week)) {
    if (!isSeason(body.season) || !isWeek(body.week)) refuse('GTL_EPL_INVALID');
    return { season: body.season, week: body.week };
  }
  return (await service.latestWeek()) ?? refuse('GTL_EPL_NO_WEEK');
}
function checkWeekFields(body) {
  if ((given(body.season) || given(body.week)) && (!isSeason(body.season) || !isWeek(body.week))) refuse('GTL_EPL_INVALID');
}

/** gtl_epl_week_state rebuilt: order, picks, the clubs playing (each once, its first match), last week's bonus. */
function weekView(raw) {
  if (!record(raw) || !isSeason(raw.season) || !isWeek(raw.week) || !record(raw.weekRow) || !Array.isArray(raw.weekRow.pickOrder)
    || !raw.weekRow.pickOrder.every(id => typeof id === 'string') || !Array.isArray(raw.picks) || !Array.isArray(raw.fixtures)) throw reply();
  const row = raw.weekRow;
  const order = [...row.pickOrder];
  const picks = raw.picks.filter(record).map(p => ({ ownerId: text(p.ownerId), name: nameOf(text(p.ownerId)), club: isClub(p.club) ? p.club : null,
    source: text(p.source), pickedAt: text(p.pickedAt), final: p.final === true })).filter(p => p.ownerId);
  const clubs = [], seen = new Set();
  const fixtures = raw.fixtures.filter(f => record(f) && f.status !== 'postponed' && isClub(f.home) && isClub(f.away))
    .sort((a, b) => (Date.parse(a.commenceTime) || 0) - (Date.parse(b.commenceTime) || 0));
  for (const f of fixtures) {
    for (const [code, opponent, home] of [[f.home, f.away, true], [f.away, f.home, false]]) {
      if (seen.has(code)) continue;
      seen.add(code);
      clubs.push({ code, name: code, opponent, kickoff: text(f.commenceTime), home });
    }
  }
  const bonus = (Array.isArray(raw.bonus) ? raw.bonus : []).filter(b => record(b) && typeof b.ownerId === 'string')
    .map(b => ({ ownerId: b.ownerId, name: nameOf(b.ownerId), points: Number.isInteger(b.points) ? b.points : 0,
      margin: Number.isInteger(b.margin) ? b.margin : null, club: isClub(b.club) ? b.club : null }));
  return { season: raw.season, week: raw.week, status: text(row.status), seeded: row.seeded === true, deadline: text(row.firstKickoff),
    windowStart: text(row.windowStart), windowEnd: text(row.windowEnd), order, picks, clubs, bonus };
}
const draftPicks = picks => picks.map(p => ({ managerId: p.ownerId, club: p.club }));
const isOpen = (view, now) => view.status === 'open' && Number.isFinite(Date.parse(view.deadline)) && now < Date.parse(view.deadline);

async function member(service, user) {
  const owner = await service.rpc('gtl_epl_member', { p_user: user.id });
  if (owner === null || owner === undefined) refuse('GTL_EPL_MEMBER_ONLY');
  if (owner !== 'commissioner' && !isManager(owner)) throw reply();
  return owner;
}
async function readWeek(service, target) {
  const raw = await service.rpc('gtl_epl_week_state', { p_season: target.season, p_week: target.week });
  if (raw === null || raw === undefined) refuse('GTL_EPL_NO_WEEK');
  return weekView(raw);
}
async function requireCommissioner(service, user) {
  if (await service.rpc('gtl_community_admin', { p_user: user.id }) !== true) refuse('GTL_EPL_FORBIDDEN');
}

async function draftRead({ body, user, service, now }) {
  keys(body, ['season', 'week']);
  checkWeekFields(body);
  const owner = await member(service, user);
  const view = await readWeek(service, await targetWeek(body, service));
  const myQueue = owner === 'commissioner' ? null : await service.readQueue(view.season, view.week, owner);
  return {
    season: view.season, week: view.week, status: view.status, deadline: view.deadline,
    order: view.order.map(ownerId => ({ ownerId, name: nameOf(ownerId) })),
    picks: view.picks,
    onTheClock: isOpen(view, now) ? onTheClock(view.order, draftPicks(view.picks)) : null,
    clubs: view.clubs,
    myQueue: myQueue === null ? null : [...myQueue],
    bonusLastWeek: view.bonus,
  };
}

async function draftPick({ body, user, service, now }) {
  keys(body, ['club', 'season', 'week']);
  if (!isClub(body.club)) refuse('GTL_EPL_INVALID');
  checkWeekFields(body);
  const owner = await member(service, user);
  const view = await readWeek(service, await targetWeek(body, service));
  if (view.status !== 'open') refuse('GTL_EPL_DRAFT_CLOSED');
  const check = canPick({ order: view.order, picks: draftPicks(view.picks), managerId: owner, club: body.club,
    clubs: view.clubs.map(c => c.code), now: new Date(now), deadline: new Date(Date.parse(view.deadline)) });
  if (!check.ok) refuse(check.code);
  const saved = await service.rpc('gtl_epl_save_pick', { p_user: user.id, p_season: view.season, p_week: view.week, p_club: body.club, p_now: new Date(now).toISOString() });
  if (!record(saved) || !Array.isArray(saved.picks)) throw reply();
  const picks = weekView({ ...saved, season: view.season, week: view.week, weekRow: { pickOrder: view.order }, fixtures: [] }).picks;
  return { season: view.season, week: view.week, action: text(saved.action), club: isClub(saved.club) ? saved.club : null, picks };
}

async function queueSave({ body, user, service, now }) {
  keys(body, ['clubs', 'season', 'week']);
  const clubs = body.clubs;
  if (!Array.isArray(clubs) || clubs.length > 20 || !clubs.every(isClub) || new Set(clubs).size !== clubs.length) refuse('GTL_EPL_QUEUE_INVALID');
  checkWeekFields(body);
  const owner = await member(service, user);
  if (owner === 'commissioner') refuse('GTL_EPL_NOT_MEMBER');
  const view = await readWeek(service, await targetWeek(body, service));
  if (!isOpen(view, now)) refuse('GTL_EPL_DRAFT_CLOSED');
  const playing = new Set(view.clubs.map(c => c.code));
  if (!clubs.every(club => playing.has(club))) refuse('GTL_EPL_QUEUE_INVALID');
  const saved = await service.rpc('gtl_epl_save_queue', { p_user: user.id, p_season: view.season, p_week: view.week, p_clubs: [...clubs] });
  if (!record(saved) || !Array.isArray(saved.clubs)) throw reply();
  return { season: view.season, week: view.week, clubs: saved.clubs.filter(isClub) };
}

async function adminLink({ body, user, service }) {
  keys(body, ['ownerId', 'userId']);
  await requireCommissioner(service, user);
  // Unlinking (userId null) needs an M-30 change: gtl_epl_link_manager refuses a null account.
  if (!isManager(body.ownerId) || typeof body.userId !== 'string' || !UUID_PATTERN.test(body.userId)) refuse('GTL_EPL_INVALID');
  const linked = await service.rpc('gtl_epl_link_manager', { p_owner_id: body.ownerId, p_user: body.userId.toLowerCase(), p_by: user.id });
  if (!record(linked)) throw reply();
  return { ownerId: text(linked.ownerId), userId: text(linked.userId) };
}

async function adminWeek({ body, user, service }) {
  keys(body, ['season', 'week', 'windowStart', 'windowEnd', 'firstKickoff', 'order', 'picks']);
  await requireCommissioner(service, user);
  const windowStart = iso(body.windowStart), windowEnd = iso(body.windowEnd);
  if (!isSeason(body.season) || !isWeek(body.week) || !windowStart || !windowEnd || Date.parse(windowEnd) <= Date.parse(windowStart)
    || (given(body.firstKickoff) && !iso(body.firstKickoff))) refuse('GTL_EPL_INVALID');
  if (given(body.order) && (!Array.isArray(body.order) || !body.order.length || body.order.length > 8 || !body.order.every(isManager)
    || new Set(body.order).size !== body.order.length)) refuse('GTL_EPL_INVALID');
  // What is not sent is kept from the stored week; a new week needs both.
  const stored = given(body.order) && given(body.firstKickoff) ? null
    : await service.rpc('gtl_epl_week_state', { p_season: body.season, p_week: body.week }).then(raw => (raw ? weekView(raw) : null));
  const order = given(body.order) ? [...body.order] : stored?.order;
  const firstKickoff = given(body.firstKickoff) ? iso(body.firstKickoff) : iso(stored?.deadline);
  if (!order?.length || !firstKickoff) refuse('GTL_EPL_INVALID');
  const picks = given(body.picks) ? body.picks : [];
  if (!Array.isArray(picks) || picks.length > order.length) refuse('GTL_EPL_INVALID');
  for (const pick of picks) {
    keys(pick, ['ownerId', 'club', 'pickedAt']);
    if (!order.includes(pick.ownerId) || !isClub(pick.club) || (given(pick.pickedAt) && !iso(pick.pickedAt))) refuse('GTL_EPL_INVALID');
  }
  if (new Set(picks.map(p => p.ownerId)).size !== picks.length || new Set(picks.map(p => p.club)).size !== picks.length) refuse('GTL_EPL_INVALID');
  const seeded = await service.rpc('gtl_epl_seed_week', { p_season: body.season, p_week: body.week, p_window_start: windowStart, p_window_end: windowEnd,
    p_first_kickoff: firstKickoff, p_order: order,
    p_picks: picks.map(p => ({ owner_id: p.ownerId, club: p.club, picked_at: given(p.pickedAt) ? iso(p.pickedAt) : null })) });
  if (!record(seeded) || !Number.isInteger(seeded.seeded)) throw reply();
  return { season: body.season, week: body.week, seeded: seeded.seeded };
}

const LABEL = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SHA256 = /^[0-9a-f]{64}$/;
async function adminSnapshot({ body, user, service }) {
  keys(body, ['label', 'capturedAt', 'week', 'sha256', 'payload']);
  await requireCommissioner(service, user);
  const capturedAt = iso(body.capturedAt);
  if (typeof body.label !== 'string' || !LABEL.test(body.label) || !capturedAt || !record(body.payload)
    || (given(body.week) && !isWeek(body.week))
    || (given(body.sha256) && (!record(body.sha256) || !Object.values(body.sha256).every(hash => typeof hash === 'string' && SHA256.test(hash))))) refuse('GTL_EPL_INVALID');
  const saved = await service.rpc('gtl_epl_save_snapshot', { p_label: body.label, p_captured_at: capturedAt, p_week: body.week ?? null,
    p_sha256: body.sha256 ?? null, p_payload: body.payload });
  return { label: body.label, saved: saved === true };
}

const HANDLERS = Object.freeze({
  '/epl/draft/read': draftRead, '/epl/draft/pick': draftPick, '/epl/queue/save': queueSave,
  '/epl/admin/link': adminLink, '/epl/admin/week': adminWeek, '/epl/admin/snapshot': adminSnapshot,
});

export async function handleEpl({ route, body, user, service, clock = Date.now }) {
  if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new EplError(401, 'Sign in to continue.');
  if (!Object.hasOwn(EPL_METHODS, route)) throw new EplError(404, 'Not found.');
  if (!service?.rpc) throw providerEplError('GTL_FEATURE_OFF');
  return HANDLERS[route]({ body: body ?? {}, user, service, now: clock() });
}
