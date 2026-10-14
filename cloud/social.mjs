import { applySocialMutation, emptySocialState, socialView, SocialError } from '../shared/social-bets.mjs';
import { UUID_PATTERN } from './lobby.mjs';
import { LINE_MARKETS, lineLockedSentence, parseMarketsVisible } from './line-lock.mjs';
import { TODAYS_RULES } from './live-rules.mjs';
export { SocialError } from '../shared/social-bets.mjs';

export const SOCIAL_METHODS = Object.fromEntries(['read', 'create', 'tail', 'settle', 'include', 'correct', 'follow'].map(action => [`/social/${action}`, ['POST']]));
const ERRORS = {
  GTL_SOCIAL_INVALID: [400, 'Check the shared bet fields and try again.'],
  GTL_SOCIAL_PROFILE: [400, 'Open My games and save your display name first.'],
  GTL_SOCIAL_SLATE: [404, 'This week’s verified schedule is not available.'],
  GTL_SOCIAL_FORBIDDEN: [403, 'Only the owner can change this shared bet.'],
  GTL_SOCIAL_CONFLICT: [409, 'Shared bets changed on another device. Refresh and review before saving again.'],
  GTL_SOCIAL_RETRY_CONFLICT: [409, 'This request was already used for different content. Refresh before saving again.'],
  GTL_SOCIAL_LIMIT: [409, 'This week has reached the pilot’s shared bet capacity. Existing history has been preserved.'],
  // Redesign stage 21 (M-04): the handler refuses a Tail of a slip with a locked leg with the lock sentence; mapped for any other raiser.
  GTL_LINE_LOCKED: [409, 'Make your Guess the Line pick for this game first. Its line opens once your pick is in, after a sit-out, or at kickoff.'],
};
export const providerSocialError = message => ERRORS[message] ? new SocialError(...ERRORS[message]) : new Error('Shared bets are unavailable.');
const invalid = () => { throw providerSocialError('GTL_SOCIAL_INVALID'); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fields = (value, allowed) => { if (!record(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid(); };
const revision = value => Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;
function scope(body) {
  if (!Number.isInteger(body.season) || body.season < 2000 || body.season > 2200 || !Number.isInteger(body.week) || body.week < 1 || body.week > 25) invalid();
}
function validateFilters(filters) {
  fields(filters, ['playerId', 'kind', 'market', 'outcome', 'origin', 'following', 'team', 'counts', 'includeParlays', 'includeTailed', 'includeTracked']);
  for (const key of ['following', 'includeParlays', 'includeTailed', 'includeTracked']) if (filters[key] !== undefined && typeof filters[key] !== 'boolean') invalid();
  const enums = { kind: ['all', 'single', 'parlay'], market: ['all', 'spread', 'total', 'prop'], outcome: ['all', 'pending', 'win', 'loss', 'push', 'void'], origin: ['all', 'tracked', 'virtual', 'tailed'], counts: ['all', 'included', 'excluded'] };
  for (const [key, values] of Object.entries(enums)) if (filters[key] !== undefined && !values.includes(filters[key])) invalid();
  if (filters.playerId !== undefined && filters.playerId !== 'all' && !UUID_PATTERN.test(filters.playerId)) invalid();
  if (filters.team !== undefined && (typeof filters.team !== 'string' || filters.team.length > 100 || /[\x00-\x1f\x7f]/.test(filters.team))) invalid();
}
function canonicalGames(games, season, week) {
  if (!Array.isArray(games)) throw new Error('Invalid social schedule.');
  return games.map(g => {
    const kickoff = typeof g.kickoff === 'number' ? new Date(g.kickoff * 1000).toISOString() : g.kickoff;
    if (typeof g.id !== 'string' || typeof g.home !== 'string' || typeof g.away !== 'string' || !Number.isFinite(Date.parse(kickoff))) throw new Error('Invalid social schedule.');
    return { id: g.id, away: g.away, home: g.home, kickoff, season, week };
  });
}
// Redesign stage 21 (M-04; D-36 as amended by D-39): the line lock on real slips. gtl_read_social gives each week the viewer's
// gate, `{ gameId: { spread, total } }` from M-01's gtl_markets_visible (kickoff, the viewer's own lock-in, the viewer's sit-out).
// A week without `gate` (M-04 not applied, or rolled back) keeps today's behavior: nothing is redacted. A gate that does not parse
// opens nothing before kickoff. Another player's leg on a game's spread or total stays redacted while that game and market is
// closed to the viewer and the game has not kicked off: no line, and a selection text without one. The viewer's own slips are never
// redacted (D-23). A slip with a locked leg also holds back its free-text note and its change reasons, which can carry the line,
// and cannot be tailed (a tail copies the legs, lines included, into the viewer's own slip).
const CLOSED = Object.freeze(Object.create(null));
/** A week's gate: null when the week carries none (today's behavior), CLOSED when it does not parse. */
export function socialGate(week) {
  if (!record(week) || !Object.hasOwn(week, 'gate')) return null;
  try { return parseMarketsVisible(week.gate); } catch { return CLOSED; }
}
/** Whether this leg's line is closed to the viewer: a spread or total leg, a gate, a closed market and no kickoff yet. */
export function legLocked(leg, { games, gate, now }) {
  if (!gate || !record(leg) || !LINE_MARKETS.includes(leg.market)) return false;
  const kickoff = Date.parse(games.find(game => game.id === leg.gameId)?.kickoff);
  if (Number.isFinite(kickoff) && now >= kickoff) return false;
  return !(typeof leg.gameId === 'string' && Object.hasOwn(gate, leg.gameId) && gate[leg.gameId][leg.market] === true);
}
const SIDES = { spread: ['home', 'away'], total: ['over', 'under'] };
/** A locked leg as the viewer receives it: the game, market and side stay; the line and any text that carries it do not. */
function redactedLeg(leg, games) {
  const game = games.find(item => item.id === leg.gameId), side = SIDES[leg.market].includes(leg.side) ? leg.side : null;
  const selection = leg.market === 'spread' ? (side ? game?.[side] : null) ?? 'Team' : side === 'over' ? 'Over' : side === 'under' ? 'Under' : 'Total';
  return { gameId: leg.gameId, market: leg.market, side, line: null, selection, locked: true };
}
const legsOf = snapshot => (record(snapshot) && Array.isArray(snapshot.legs) ? snapshot.legs : []);
function redactedSnapshot(snapshot, context) {
  if (!record(snapshot)) return snapshot;
  return { ...snapshot, notes: null, legs: legsOf(snapshot).map(leg => (legLocked(leg, context) ? redactedLeg(leg, context.games) : leg)) };
}
/** The markets of this slip's legs that are closed to the viewer, in LINE_MARKETS order. */
const lockedMarketsOf = (entry, context) => LINE_MARKETS.filter(market => legsOf(entry).some(leg => leg.market === market && legLocked(leg, context)));
/**
 * One week's state as `actorId` may see it, and the ids of other players' slips with a locked leg (in the slip now, or in any
 * earlier version its change history keeps). Pure: the input state is never modified.
 */
export function redactSocialWeek(state, { actorId, games, gate, now }) {
  const context = { games, gate, now }, locked = new Map();
  if (!gate || !Array.isArray(state?.entries) || !Array.isArray(state.audit)) return { state, locked };
  for (const entry of state.entries) {
    if (!record(entry) || entry.ownerId === actorId) continue;
    const snapshots = [entry, ...state.audit.filter(event => event?.entryId === entry.id).flatMap(event => [event.before, event.after])];
    if (snapshots.some(snapshot => legsOf(snapshot).some(leg => legLocked(leg, context)))) {
      locked.set(entry.id, { markets: lockedMarketsOf(entry, context), noteHidden: typeof entry.notes === 'string' && entry.notes.trim() !== '' });
    }
  }
  if (!locked.size) return { state, locked };
  return { locked, state: {
    ...state,
    entries: state.entries.map(entry => (locked.has(entry?.id) ? redactedSnapshot(entry, context) : entry)),
    audit: state.audit.map(event => (locked.has(event?.entryId) ? { ...event, reason: null, before: redactedSnapshot(event.before, context), after: redactedSnapshot(event.after, context) } : event)),
  } };
}

function normalizeRead(raw) {
  if (!record(raw) || !Array.isArray(raw.weeks) || !raw.weeks.length || !Array.isArray(raw.profiles) || !Array.isArray(raw.availableWeeks) || !Array.isArray(raw.following)) throw new Error('Invalid social workspace.');
  return {
    season: raw.season, week: raw.week,
    profiles: raw.profiles.map(p => {
      if (!UUID_PATTERN.test(p.id || '') || typeof p.displayName !== 'string') throw new Error('Invalid public profile.');
      return { id: p.id, displayName: p.displayName };
    }),
    availableWeeks: raw.availableWeeks.map(w => { scope(w); return { season: w.season, week: w.week }; }),
    following: raw.following.filter(id => UUID_PATTERN.test(id)),
    weeks: raw.weeks.map(w => {
      scope(w); if (!revision(w.revision) || !record(w.state)) throw new Error('Invalid social revision.');
      return { season: w.season, week: w.week, revision: w.revision, state: w.state, games: canonicalGames(w.games, w.season, w.week), gate: socialGate(w) };
    }),
  };
}
async function call(service, name, args) {
  try { return await service.rpc(name, args); }
  catch (error) {
    if (error instanceof SocialError) throw error;
    throw providerSocialError(error?.message);
  }
}
function project(raw, actorId, filters = {}, allHistory = false, now = Date.now(), rules = TODAYS_RULES) {
  const data = normalizeRead(raw);
  const state = emptySocialState(), locked = new Map();
  const weeks = data.weeks.map(w => redactSocialWeek(w.state, { actorId, games: w.games, gate: w.gate, now }));
  state.entries = weeks.flatMap(w => w.state.entries);
  state.audit = weeks.flatMap(w => w.state.audit);
  for (const w of weeks) for (const [id, lock] of w.locked) locked.set(id, lock);
  const games = data.weeks.flatMap(w => w.games);
  const view = socialView(state, { actorId, profiles: data.profiles, games,
    ...(allHistory ? {} : { season: data.season, week: data.week }), filters, following: data.following, now });
  // A slip with a locked leg says so (`locked`, with the markets whose lock-in opens it) and cannot be tailed; `noteHidden` says
  // a note waits for the line. A slip whose only locked leg is in its change history keeps Tail: a tail copies today's legs.
  const entries = view.entries.map(entry => {
    const lock = locked.get(entry.id);
    if (!lock) return entry;
    return { ...entry, ...(lock.markets.length ? { canTail: false, locked: true, lockedMarkets: lock.markets } : {}), noteHidden: lock.noteHidden };
  });
  return {
    ...view, entries, rules,
    profiles: data.profiles, actorId, season: allHistory ? null : data.season, week: allHistory ? null : data.week,
    weekRevision: allHistory ? null : data.weeks[0].revision,
    availableWeeks: data.availableWeeks, games, following: data.following,
    historyScope: allHistory ? 'all' : 'week', capacity: { entriesPerWeek: 2000 },
  };
}
const CREATE = ['notes', 'kind', 'origin', 'legs', 'odds', 'stakeUnits', 'source', 'quotedAt', 'placedAt', 'countsForRecord'];
const ACTION_FIELDS = {
  create: CREATE,
  tail: ['notes', 'sourceEntryId', 'origin', 'odds', 'stakeUnits', 'source', 'quotedAt', 'placedAt', 'countsForRecord'],
  settle: ['entryId', 'revision', 'outcome', 'actualReturnUnits', 'reason'],
  include: ['entryId', 'revision', 'countsForRecord', 'reason'],
  correct: ['entryId', 'revision', 'reason', ...CREATE],
};

// Called only after verified authentication by createCloudHandler. The duplicate
// identity check also makes this module fail closed when used independently.
export async function handleSocial({ route, body = {}, user, service, clock = Date.now, rules = () => TODAYS_RULES }) {
  if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new SocialError(401, 'Sign in to continue.');
  if (!service?.rpc) throw new Error('Shared bets are not configured.');
  if (!Object.hasOwn(SOCIAL_METHODS, route)) invalid();
  const actor = { p_user: user.id };
  const read = (season, week, all = false) => call(service, 'gtl_read_social', { ...actor, p_season: season ?? null, p_week: week ?? null, p_all: all });
  // The live Guess rules word the lock sentence (cloud/live-rules.mjs; the read never rejects). Read beside the slips, once.
  let live;
  const liveRules = () => (live ??= Promise.resolve().then(rules).catch(() => TODAYS_RULES));
  if (route === '/social/read') {
    fields(body, ['season', 'week', 'filters', 'allHistory']);
    if (body.season !== undefined || body.week !== undefined) scope(body);
    if (body.allHistory !== undefined && typeof body.allHistory !== 'boolean') invalid();
    if (body.allHistory && (body.season !== undefined || body.week !== undefined)) invalid();
    if (body.filters !== undefined) validateFilters(body.filters);
    liveRules();
    const raw = await read(body.season, body.week, body.allHistory ?? false);
    return project(raw, user.id, body.filters ?? {}, body.allHistory ?? false, clock(), await liveRules());
  }
  if (route === '/social/follow') {
    fields(body, ['requestId', 'targetUserId', 'following']);
    if (!UUID_PATTERN.test(body.requestId || '') || !UUID_PATTERN.test(body.targetUserId || '') || body.targetUserId === user.id || typeof body.following !== 'boolean') invalid();
    const result = await call(service, 'gtl_follow_social', { ...actor, p_request_id: body.requestId, p_target: body.targetUserId, p_following: body.following });
    if (!Array.isArray(result?.following) || result.following.some(id => !UUID_PATTERN.test(id))) throw new Error('Invalid follow result.');
    return { following: result.following, replayed: result.replayed === true };
  }
  const action = route.slice('/social/'.length);
  fields(body, ['season', 'week', 'weekRevision', 'requestId', ...ACTION_FIELDS[action]]);
  scope(body);
  if (body.origin === 'virtual') throw new SocialError(409, 'Virtual units require a verified named-book quote receipt. Track an external bet here.');
  if (!UUID_PATTERN.test(body.requestId || '') || !revision(body.weekRevision)) invalid();
  liveRules();
  const raw = await read(body.season, body.week);
  const data = normalizeRead(raw);
  const selected = data.weeks.find(w => w.season === body.season && w.week === body.week);
  if (!selected || data.weeks.length !== 1) throw new Error('Invalid social scope.');
  const { weekRevision, ...payload } = body;
  // Stage 21 line lock: a tail copies the source's legs, lines included, so it waits until every leg's line is open to this
  // player. Checked before anything is written; an exact retry of a tail already saved replays as before.
  const { entries = [], receipts = [] } = selected.state;
  if (action === 'tail' && Array.isArray(entries) && Array.isArray(receipts) && !receipts.some(receipt => receipt?.actorId === user.id && receipt.requestId === body.requestId)) {
    const source = entries.find(entry => entry?.id === body.sourceEntryId);
    const markets = source && source.ownerId !== user.id ? lockedMarketsOf(source, { games: selected.games, gate: selected.gate, now: clock() }) : [];
    if (markets.length) throw new SocialError(ERRORS.GTL_LINE_LOCKED[0], lineLockedSentence(markets[0], await liveRules()));
  }
  const next = applySocialMutation(selected.state, { actorId: user.id, action, body: payload, games: selected.games, now: clock() });
  const committed = await call(service, 'gtl_commit_social', { ...actor, p_season: body.season, p_week: body.week,
    p_expected_revision: weekRevision, p_request_id: body.requestId, p_action: action, p_body: body, p_state: next });
  if (!revision(committed?.revision) || typeof committed.replayed !== 'boolean') throw new Error('Invalid shared bet commit.');
  return { ...project(await read(body.season, body.week), user.id, {}, false, clock(), await liveRules()), replayed: committed.replayed };
}
