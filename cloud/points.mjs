// Guess the Points routes on gtl-api (D-56; docs/superpowers/specs/2026-10-22-guess-the-points-design.md sections 4.2,
// 5 and 7). POST /points/read, /points/draft and /points/lock for members, and the commissioner's POST /points/slate.
// Each calls one P-01 service-only SQL function (supabase/migrations/20261023180000_gtl_points_core.sql); the database
// decides who may see what, refuses late and locked writes and replays a retried request from its receipt. Only server
// time counts, so no route sends a client clock.
//
// Feature flag: P-01 is written and not applied. Until it is, PostgREST answers each call 404 PGRST202, the adapter reads
// that as GTL_FEATURE_OFF and these routes answer 404 "Guess the Points is coming soon." with code GTL_POINTS_OFF; a
// gtl-api build without these routes answers its own 404 "Not found.". The app shows "Points is coming soon" for both.
// The GTL_FEATURE_OFF secret's `points` switch (cloud/feature-off.mjs) stops the three writers; reads keep working.
//
// Every reply is rebuilt field by field, so nothing the SQL adds later reaches a browser by accident, and the reveal gate
// is applied once more here: a slot that is not revealed carries no House estimate and no other member's guess.
import { UUID_PATTERN } from './lobby.mjs';
import { POINTS_SLOTS, isValidGuess } from '../shared/points-scoring.mjs';
import { slateProblem } from '../shared/points-slate.mjs';

export const POINTS_METHODS = Object.freeze({
  '/points/read': ['POST'], '/points/draft': ['POST'], '/points/lock': ['POST'], '/points/slate': ['POST'],
});
/** The service-only functions these routes may call; the adapter refuses any other name. */
export const POINTS_RPCS = Object.freeze(['gtl_points_read', 'gtl_points_save_draft', 'gtl_points_lock_in', 'gtl_points_publish_slate']);
/** Refusal codes a reply carries beside its sentence (cloud/handler.mjs PUBLIC_CODES; web/src/apiResponse.js). */
export const POINTS_OFF = 'GTL_POINTS_OFF';
export const POINTS_PUBLIC_CODES = Object.freeze([POINTS_OFF, 'GTL_POINTS_LOCKED', 'GTL_POINTS_CLOSED', 'GTL_POINTS_NOT_OPEN']);

export class PointsError extends Error {
  constructor(status, message, code) { super(message); this.name = 'PointsError'; this.status = status; if (code) this.code = code; }
}
const ERRORS = Object.freeze({
  GTL_POINTS_INVALID: [400, 'Choose a valid week, player and whole number from 0 to 60.'],
  GTL_POINTS_NOT_OPEN: [409, 'This week of Points has not opened yet.'],
  GTL_POINTS_CLOSED: [409, 'This player’s game has kicked off. Guesses for him are closed.'],
  GTL_POINTS_LOCKED: [409, 'This guess is locked in and final.'],
  GTL_POINTS_RETRY_CONFLICT: [409, 'This save request was already used for a different guess.'],
  GTL_COMMUNITY_MEMBER: [403, 'Save your profile to play Guess the Points.'],
  GTL_POINTS_FORBIDDEN: [403, 'Only the commissioner can manage the Points slate.'],
  GTL_POINTS_NO_SLATE: [404, 'No Points slate is stored for that week.'],
  GTL_POINTS_SLATE_FIXED: [409, 'This slate is fixed. A published slate, or one past its open time, cannot change.'],
  GTL_POINTS_SLATE_INVALID: [400, 'That slate breaks a slate rule: five slots, one per game, at least two kickoff windows.'],
  GTL_POINTS_TOO_LATE: [409, 'The slate’s first game has kicked off. It can no longer be published.'],
  // P-01 not on the database (not applied, or rolled back): the coming-soon answer, as a 404.
  GTL_FEATURE_OFF: [404, 'Guess the Points is coming soon.', POINTS_OFF],
  // The GTL_FEATURE_OFF secret names `points`: writers pause, nothing stored changes.
  GTL_POINTS_PAUSED: [503, 'Guess the Points saves are paused right now. Nothing you saved is lost.'],
});
// Each refusal keeps its database code; cloud/handler.mjs sends only POINTS_PUBLIC_CODES on to the browser.
export function providerPointsError(code) {
  if (!Object.hasOwn(ERRORS, code)) return new Error('Guess the Points is unavailable.');
  const [status, message, publicCode = code] = ERRORS[code];
  return new PointsError(status, message, publicCode);
}

const LEAGUE_ID = /^(?:sean-troy-luke|g_[0-9a-f]{32})$/;
const ACTIONS = Object.freeze(['preview', 'draft', 'publish', 'swap']);
const invalid = () => providerPointsError('GTL_POINTS_INVALID');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function keys(value, allowed) { if (!record(value) || Object.keys(value).some(key => !allowed.includes(key))) throw invalid(); }
const season = value => Number.isInteger(value) && value >= 2000 && value <= 2200;
const week = value => Number.isInteger(value) && value >= 1 && value <= 18;
const uuid = value => typeof value === 'string' && UUID_PATTERN.test(value);
const reply = () => new Error('Invalid Points reply.');

// Reply readers: each value is checked and copied; anything else is dropped.
const text = (value, max = 80) => typeof value === 'string' && value.length <= max ? value : null;
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
const num = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const int = value => Number.isSafeInteger(value) ? value : null;
const bool = value => value === true;
const STATES = new Set(['open', 'pending', 'void', 'scored']);
const RESULT = new Set(['PROVISIONAL', 'FINAL']);
const face = row => record(row) && uuid(row.userId) ? { userId: row.userId, displayName: text(row.displayName) ?? 'Member' } : null;

function slotView(raw) {
  if (!record(raw) || !POINTS_SLOTS.includes(raw.slot) || !time(raw.kickoff)) throw reply();
  const revealed = raw.revealed === true;
  const own = record(raw.own) && Number.isInteger(raw.own.guess) ? {
    guess: raw.own.guess, locked: bool(raw.own.locked), lockedAt: time(raw.own.lockedAt), points: raw.own.locked === true ? num(raw.own.points) : null,
  } : null;
  return {
    slot: raw.slot, playerId: text(raw.playerId, 40), name: text(raw.name) ?? '—', team: text(raw.team, 3), position: text(raw.position, 4),
    gameKey: text(raw.gameKey, 40), kickoff: raw.kickoff, closed: bool(raw.closed),
    state: STATES.has(raw.state) ? raw.state : 'pending', actual: raw.state === 'scored' ? num(raw.actual) : null,
    voidReason: raw.state === 'void' ? text(raw.voidReason, 60) ?? 'inactive' : null,
    revealed, own,
    // The gate, again: a hidden slot never carries the House or another member's guess, whatever the reply held.
    house: revealed && record(raw.house) ? { estimate: num(raw.house.estimate), points: num(raw.house.points) } : null,
    lockedIn: (Array.isArray(raw.lockedIn) ? raw.lockedIn : []).map(face).filter(Boolean),
    guesses: revealed && Array.isArray(raw.guesses) ? raw.guesses.map(row => {
      const who = face(row);
      return who && Number.isInteger(row.guess) ? { ...who, guess: row.guess, points: num(row.points) } : null;
    }).filter(Boolean) : [],
  };
}
const standing = row => {
  const who = face(row);
  return who ? { ...who, points: num(row.points), rank: int(row.rank), tied: bool(row.tied) } : null;
};
export function pointsReadView(raw) {
  if (!record(raw) || !['open', 'unopened'].includes(raw.status)) throw reply();
  const base = { season: int(raw.season), week: int(raw.week), status: raw.status, groupId: text(raw.groupId, 40) };
  if (raw.status === 'unopened') return { ...base, slots: [], result: null, standings: { week: [], season: [] } };
  if (!season(raw.season) || !week(raw.week) || !Array.isArray(raw.slots)) throw reply();
  const result = record(raw.result) ? raw.result : {};
  const rules = record(raw.scoringRules) ? raw.scoringRules : {};
  const standings = record(raw.standings) ? raw.standings : {};
  return {
    ...base, opensAt: time(raw.opensAt), finalizeAt: time(raw.finalizeAt),
    scoringRules: { format: text(rules.format, 10), passingTds: num(rules.passingTds), version: text(rules.version, 40) },
    result: {
      status: RESULT.has(result.status) ? result.status : null, maximum: int(result.maximum), points: num(result.points), finalizedAt: time(result.finalizedAt),
      house: { points: record(result.house) ? num(result.house.points) : null, complete: record(result.house) && result.house.complete === true },
    },
    slots: raw.slots.map(slotView),
    standings: {
      week: (Array.isArray(standings.week) ? standings.week : []).map(row => {
        const base = standing(row);
        return base && { ...base, exact: int(row.exact), off: num(row.off) };
      }).filter(Boolean),
      season: (Array.isArray(standings.season) ? standings.season : []).map(row => {
        const base = standing(row);
        return base && { ...base, weeksPlayed: int(row.weeksPlayed), perWeek: num(row.perWeek), provisional: bool(row.provisional), beatHouse: int(row.beatHouse) };
      }).filter(Boolean),
    },
  };
}
function writeView(raw) {
  if (!record(raw) || !POINTS_SLOTS.includes(raw.slot) || !Number.isInteger(raw.guess) || !season(raw.season) || !week(raw.week)) throw reply();
  return { season: raw.season, week: raw.week, slot: raw.slot, guess: raw.guess, locked: bool(raw.locked), lockedAt: time(raw.lockedAt), savedAt: time(raw.savedAt), replayed: bool(raw.replayed) };
}
// The commissioner's slate view carries provenance and the audit; it is never sent to other members.
function slateView(raw) {
  if (!record(raw) || !season(raw.season) || !week(raw.week) || !['draft', 'published'].includes(raw.status)) throw reply();
  return {
    season: raw.season, week: raw.week, status: raw.status, opensAt: time(raw.opensAt), finalizeAt: time(raw.finalizeAt),
    scoringRules: record(raw.scoringRules) ? raw.scoringRules : null, slots: Array.isArray(raw.slots) ? raw.slots : [],
    house: record(raw.house) ? raw.house : {}, provenance: record(raw.provenance) ? raw.provenance : {},
    publishedAt: time(raw.publishedAt), audit: Array.isArray(raw.audit) ? raw.audit : [], replayed: bool(raw.replayed),
  };
}

const WRITERS = Object.freeze({ '/points/draft': 'gtl_points_save_draft', '/points/lock': 'gtl_points_lock_in' });

export async function handlePoints({ route, body, user, service, featureOff = new Set() }) {
  if (!uuid(user?.id) || user?.is_anonymous === true) throw new PointsError(401, 'Sign in to continue.');
  if (!Object.hasOwn(POINTS_METHODS, route)) throw new PointsError(404, 'Not found.');
  if (route === '/points/read') {
    keys(body, ['season', 'week', 'groupId']);
    if ((body.season === undefined) !== (body.week === undefined) || body.season !== undefined && (!season(body.season) || !week(body.week))
      || body.groupId !== undefined && body.groupId !== null && (typeof body.groupId !== 'string' || !LEAGUE_ID.test(body.groupId))) throw invalid();
    if (!service?.rpc) throw providerPointsError('GTL_FEATURE_OFF');
    return pointsReadView(await service.rpc('gtl_points_read', {
      p_viewer: user.id, p_season: body.season ?? null, p_week: body.week ?? null, p_group: body.groupId ?? null, p_now: null,
    }));
  }
  if (route === '/points/slate') {
    keys(body, ['action', 'season', 'week', 'slate']);
    if (!ACTIONS.includes(body.action) || !season(body.season) || !week(body.week) || body.slate !== undefined && !record(body.slate)
      || ['draft', 'swap'].includes(body.action) !== (body.slate !== undefined)) throw invalid();
    if (body.action === 'draft' && slateProblem(Array.isArray(body.slate.slots) ? body.slate.slots : [])) throw providerPointsError('GTL_POINTS_SLATE_INVALID');
    if (body.action !== 'preview' && featureOff.has('points')) throw providerPointsError('GTL_POINTS_PAUSED');
    if (!service?.rpc) throw providerPointsError('GTL_FEATURE_OFF');
    return slateView(await service.rpc('gtl_points_publish_slate', {
      p_actor: user.id, p_action: body.action, p_season: body.season, p_week: body.week, p_slate: body.slate ?? null,
    }));
  }
  keys(body, ['season', 'week', 'slot', 'guess', 'requestId']);
  if (!season(body.season) || !week(body.week) || !POINTS_SLOTS.includes(body.slot) || !isValidGuess(body.guess) || !uuid(body.requestId)) throw invalid();
  if (featureOff.has('points')) throw providerPointsError('GTL_POINTS_PAUSED');
  if (!service?.rpc) throw providerPointsError('GTL_FEATURE_OFF');
  return writeView(await service.rpc(WRITERS[route], {
    p_user: user.id, p_request: body.requestId.toLowerCase(), p_season: body.season, p_week: body.week, p_slot: body.slot, p_guess: body.guess,
  }));
}
