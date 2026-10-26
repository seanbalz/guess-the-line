// Streaks, badges and weekly awards on gtl-api (redesign build plan stage 69, M-25; D-35, D-36). Two routes:
//   POST /league/features      any Community member: the visible badges, awards, season winners and streaks of the
//                              Community, or of a group the viewer is an active member of (group standings stay private).
//   POST /league/features/run  the community commissioner: run the features job now (the M-26 schedule runs the same code).
// The rules are the shared pure modules in shared/game-features/ (stage 68); this module only reads their inputs
// (gtl_read_feature_inputs), applies them and hands the results to the idempotent writer (gtl_record_feature_results).
// Nothing here changes a score, a rank or a result.
//
// Until M-25 is applied PostgREST answers every call 404 PGRST202, the adapter reads that as GTL_FEATURE_OFF, and both routes
// answer 404 "Badges and awards are coming soon." No existing route calls these functions, so every other route is unchanged.
// The GTL_FEATURE_OFF secret's `features` switch (cloud/feature-off.mjs) stops the commissioner's run; the reader keeps working.
//
// Every reply is rebuilt field by field, and a badge whose visibleAt has not passed on the server clock is dropped here
// again, so a line can only reach a browser after that game's kickoff.
import { UUID_PATTERN } from './lobby.mjs';
import { AWARD_BY_ID, BADGE_BY_ID, LIVE_BADGES, SEASON_AWARDS } from '../shared/game-features/catalog.mjs';
import { normalizeWeek } from '../shared/game-features/week.mjs';
import { seasonAllBadges } from '../shared/game-features/badges.mjs';
import { seasonWinners, weekAwards } from '../shared/game-features/awards.mjs';
import { betsStreak, pickStreak, pickWeekFor } from '../shared/game-features/streaks.mjs';

export const FEATURES_METHODS = Object.freeze({ '/league/features': ['POST'], '/league/features/run': ['POST'] });
/** The service-only functions these routes may call; the adapter refuses any other name. */
export const FEATURES_RPCS = Object.freeze(['gtl_read_features', 'gtl_read_feature_inputs', 'gtl_record_feature_results', 'gtl_community_admin']);

export class FeaturesError extends Error {
  constructor(status, message) { super(message); this.name = 'FeaturesError'; this.status = status; }
}
const ERRORS = Object.freeze({
  GTL_FEATURES_INVALID: [400, 'Choose a valid league and season.'],
  GTL_COMMUNITY_MEMBER: [403, 'Save your profile to see badges and awards.'],
  GTL_FEATURES_MEMBER: [403, 'You are not in that league.'],
  GTL_FEATURES_FORBIDDEN: [403, 'Only the commissioner can run badges and awards.'],
  // M-25 not on the database (not applied, or rolled back): the coming-soon answer.
  GTL_FEATURE_OFF: [404, 'Badges and awards are coming soon.'],
  // The GTL_FEATURE_OFF secret names `features`: the run pauses, nothing stored changes.
  GTL_FEATURES_PAUSED: [503, 'Badges and awards are paused right now. Nothing is lost.'],
});
export const providerFeaturesError = message => (Object.hasOwn(ERRORS, message) ? new FeaturesError(...ERRORS[message]) : new Error('Badges and awards are unavailable.'));

const LEAGUE_ID = /^(?:sean-troy-luke|g_[0-9a-f]{32})$/;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const uuid = value => typeof value === 'string' && UUID_PATTERN.test(value);
const time = value => (typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null);
const iso = ms => new Date(ms).toISOString();
const invalid = () => providerFeaturesError('GTL_FEATURES_INVALID');
const reply = () => new Error('Invalid features reply.');
const SEASON_IDS = new Set(SEASON_AWARDS.map(a => a.id));

/**
 * Applies the shared rules to one season's inputs (gtl_read_feature_inputs) at `now` (ms) and returns the writer's
 * p_results. Only live badges whose visibleAt has passed are sent; the writer refuses anything else anyway.
 */
export function computeFeatures(inputs, now) {
  if (!record(inputs) || !Number.isInteger(inputs.season) || !Array.isArray(inputs.weeks) || !record(inputs.rosters)) throw new Error('Invalid features inputs.');
  const weeks = inputs.weeks.map(normalizeWeek).sort((a, b) => a.week - b.week);
  const rosters = Object.entries(inputs.rosters).filter(([id, roster]) => (id === 'community' || LEAGUE_ID.test(id)) && Array.isArray(roster) && roster.every(uuid));
  // A game's team codes ride along with its id, so a screen can say "SEA @ DEN" (never a raw id, DP-15).
  const codes = new Map(weeks.flatMap(w => w.games.map(g => [`${w.week}:${g.id}`, { away: g.away, home: g.home }])));
  const withCodes = (week, facts) => (typeof facts?.gameId === 'string' ? { ...facts, ...codes.get(`${week}:${facts.gameId}`) } : facts);
  const badges = seasonAllBadges(weeks, now)
    .filter(b => LIVE_BADGES.includes(b.badge) && Date.parse(b.visibleAt) <= now)
    .map(b => ({ badge: b.badge, userId: b.userId, key: b.key, week: b.week, visibleAt: new Date(Date.parse(b.visibleAt)).toISOString(), facts: withCodes(b.week, b.facts) }));
  const awards = [], winners = [];
  for (const [leagueId, roster] of rosters) {
    for (const week of weeks) {
      const result = weekAwards(week, roster);
      if (result.ready) awards.push({ leagueId, week: week.week, awards: result.awards.map(a => ({ ...a, entries: a.entries.map(e => withCodes(week.week, e)) })) });
    }
    const season = seasonWinners(weeks, roster);
    if (season.decided) winners.push({ leagueId, winners: season.winners });
  }
  const community = rosters.find(([id]) => id === 'community')?.[1] ?? [];
  const streaks = community.map(userId => {
    const pick = pickStreak(weeks.map(w => ({ week: w.week, status: pickWeekFor(w, userId, now) })));
    const bets = betsStreak(weeks.flatMap(w => w.bets.filter(b => b.userId === userId).map(b => ({ ...b, kickoff: w.games.find(g => g.id === b.gameId).kickoff }))));
    return { userId, streaks: { pick: { current: pick.current, best: pick.best }, bets: { current: bets.current, best: bets.best } } };
  });
  return { season: inputs.season, computed: [...LIVE_BADGES], badges, awards, seasonWinners: winners, streaks };
}

/**
 * One features run: read the season's inputs, apply the rules, record. `rpc` is a service-role caller (gtl-api's group
 * adapter or the M-26 worker's). Returns the writer's summary, or `{ season: null, skipped: 'no_season' }` before any week
 * is published.
 */
export async function runFeatures({ rpc, season = null, now, trigger, actor = null, runId }) {
  const inputs = await rpc('gtl_read_feature_inputs', { p_season: season, p_now: iso(now) });
  if (!record(inputs) || inputs.season === null) return { season: null, skipped: 'no_season' };
  const results = computeFeatures(inputs, now);
  return rpc('gtl_record_feature_results', { p_run: runId, p_trigger: trigger, p_actor: actor, p_results: results });
}

// Reply readers: each value is checked and copied; anything else is dropped.
function facts(raw) {
  if (!record(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([key, value]) => /^[a-zA-Z]{1,24}$/.test(key)
    && (finite(value) || (typeof value === 'string' && value.length <= 80) || typeof value === 'boolean')));
}
function awardView(raw, ids) {
  if (!record(raw) || !ids.has(raw.id) || !Array.isArray(raw.winners) || !raw.winners.every(uuid)) throw reply();
  const entries = (Array.isArray(raw.entries) ? raw.entries : []).filter(e => record(e) && uuid(e.userId)).map(e => ({ userId: e.userId, ...facts({ ...e, userId: undefined }) }));
  return { id: raw.id, winners: [...raw.winners], entries, value: record(raw.value) ? facts(raw.value) : null };
}
const WEEK_IDS = new Set(Object.keys(AWARD_BY_ID));

/** The reader's reply for the viewer, rebuilt: `{ leagueId, season, ran, badges, awards, seasonWinners, streaks }`. */
export function featuresView(raw, viewer, now) {
  if (!record(raw) || raw.viewer !== viewer) throw reply();
  const badges = (Array.isArray(raw.badges) ? raw.badges : []).map(b => {
    if (!record(b) || !uuid(b.userId) || !Object.hasOwn(BADGE_BY_ID, b.badge) || typeof b.key !== 'string' || !Number.isInteger(b.week) || !time(b.visibleAt)) throw reply();
    return { userId: b.userId, badge: b.badge, key: b.key, week: b.week, visibleAt: b.visibleAt, facts: facts(b.facts) };
  }).filter(b => Date.parse(b.visibleAt) <= now);
  const awards = (Array.isArray(raw.awards) ? raw.awards : []).map(w => {
    if (!record(w) || !Number.isInteger(w.week) || w.week < 1 || !Number.isInteger(w.version) || !Array.isArray(w.awards)) throw reply();
    return { week: w.week, version: w.version, createdAt: time(w.createdAt), awards: w.awards.map(a => awardView(a, WEEK_IDS)) };
  });
  const season = record(raw.seasonWinners) && Array.isArray(raw.seasonWinners.winners)
    ? { version: raw.seasonWinners.version, createdAt: time(raw.seasonWinners.createdAt), winners: raw.seasonWinners.winners.map(a => awardView(a, SEASON_IDS)) } : null;
  const count = value => (Number.isInteger(value) && value >= 0 ? value : 0);
  const streaks = (Array.isArray(raw.streaks) ? raw.streaks : []).filter(s => record(s) && uuid(s.userId) && record(s.streaks)).map(s => ({ userId: s.userId,
    pick: { current: count(s.streaks.pick?.current), best: count(s.streaks.pick?.best) }, bets: { current: count(s.streaks.bets?.current), best: count(s.streaks.bets?.best) } }));
  return { leagueId: raw.leagueId ?? null, season: Number.isInteger(raw.season) ? raw.season : null, ran: raw.ran === true, badges, awards, seasonWinners: season, streaks };
}

export async function handleFeatures({ route, body, user, service, clock = Date.now, uuid: newId = () => crypto.randomUUID(), featureOff = new Set() }) {
  if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new FeaturesError(401, 'Sign in to continue.');
  if (!Object.hasOwn(FEATURES_METHODS, route)) throw new FeaturesError(404, 'Not found.');
  const run = route === '/league/features/run';
  if (!record(body) || Object.keys(body).some(key => !(run ? ['season'] : ['leagueId', 'season']).includes(key))
    || (body.season !== undefined && (!Number.isInteger(body.season) || body.season < 2000 || body.season > 2200))
    || (body.leagueId !== undefined && body.leagueId !== null && (typeof body.leagueId !== 'string' || !LEAGUE_ID.test(body.leagueId)))) throw invalid();
  if (!service?.rpc) throw new Error('Badges and awards are not configured.');
  if (!run) {
    const now = clock();
    const raw = await service.rpc('gtl_read_features', { p_user: user.id, p_league: body.leagueId ?? null, p_season: body.season ?? null, p_now: iso(now) });
    return featuresView(raw, user.id, now);
  }
  if (featureOff.has('features')) throw providerFeaturesError('GTL_FEATURES_PAUSED');
  if (await service.rpc('gtl_community_admin', { p_user: user.id }) !== true) throw providerFeaturesError('GTL_FEATURES_FORBIDDEN');
  const summary = await runFeatures({ rpc: (name, args) => service.rpc(name, args), season: body.season ?? null, now: clock(), trigger: 'manual', actor: user.id, runId: newId() });
  if (!record(summary)) throw reply();
  return Object.fromEntries(['runId', 'season', 'earned', 'removed', 'awards', 'streaks', 'posts', 'postsSkipped', 'replay', 'skipped']
    .filter(key => Object.hasOwn(summary, key)).map(key => [key, summary[key]]));
}
