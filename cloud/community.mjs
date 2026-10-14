// D-21 community feed. One community of every profile; Guess picks inside posts are
// already withheld by the database until that game and market is open to the viewer
// (D-39 per game: the viewer's own lock-in, a sit-out (D-23) or that game's kickoff;
// before M-01, the viewer's submission, a sit-out or the deadline). Nothing else is
// hidden, including removed members' data.
import { UUID_PATTERN } from './lobby.mjs';
import { buildSlate, weekOpenAt } from '../shared/nfl-schedule.mjs';
import { readOptional } from './optional-rpc.mjs';

export class CommunityError extends Error {
  constructor(status, message) { super(message); this.name = 'CommunityError'; this.status = status; }
}
// /community/picks: everyone's Guess picks for a week and market, game by game (M-08, redesign build plan stage 26).
// /community/forfeit: "Skip this week's Guess the Line" and "See picks now" (M-03, redesign build plan stage 19).
export const COMMUNITY_METHODS = Object.fromEntries(['read', 'history', 'like', 'comment', 'member', 'publish-preview', 'publish', 'interest', 'sit-out', 'week-open', 'picks', 'forfeit'].map(action => [`/community/${action}`, ['POST']]));
const ERRORS = {
  GTL_COMMUNITY_INVALID: [400, 'Check the post and try again.'],
  GTL_COMMUNITY_MEMBER: [403, 'Open My games and save your display name to join the community.'],
  GTL_COMMUNITY_FORBIDDEN: [403, 'Only the commissioner can change community membership.'],
  GTL_COMMUNITY_CLOSED: [409, 'Picks for that week are closed. Sitting out is no longer possible.'],
  GTL_SLATE_CONFLICT: [409, 'A different schedule is already published for that week. Nothing was changed.'],
  GTL_COMMUNITY_RETRY_CONFLICT: [409, 'This request was already used for a different comment. Refresh before posting again.'],
  // M-08 (stage 26): /community/picks while its reader is not on the hosted project yet (PostgREST PGRST202, see
  // createSupabaseAdapter) or while gtl-api's GTL_FEATURE_OFF secret names `picks` (cloud/feature-off.mjs).
  GTL_FEATURE_OFF: [503, 'This feature is not available right now.'],
  // M-03 (stage 19): /community/forfeit at or after the week's last kickoff (D-39), and with nothing left to sit out.
  GTL_FORFEIT_CLOSED: [409, 'Every game that week has kicked off, so its picks and lines are already open. Nothing was changed.'],
  GTL_FORFEIT_NOTHING: [409, 'Your Spread and Total for that week are already submitted or sat out. Nothing was changed.'],
};
export const providerCommunityError = message => ERRORS[message] ? new CommunityError(...ERRORS[message]) : new Error('The community feed is unavailable.');
const invalid = () => { throw providerCommunityError('GTL_COMMUNITY_INVALID'); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fields = (value, allowed) => { if (!record(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid(); };
const MODES = ['guess_spread', 'guess_total'];
// D-22: coming-soon leagues. NFL is the only live league.
export const COMING_SOON_LEAGUES = ['nba', 'mlb', 'nhl', 'cfb', 'cbb'];
const KINDS = ['joined', 'ballot_submitted', 'bet_posted', 'bet_settled', 'week_published'];

// Redesign stage 17 (D-39, D-31, D-23; M-01). The database lets another member's pick through one game at a time and
// names the games it withheld in `hiddenGames`; this filter is the second gate: a number under a withheld game never
// passes, whatever the provider returned. The provider before M-01 sends `picksHidden` without `hiddenGames` (the whole
// post hidden): then no pick passes, as before, and `hiddenGames` is null (which games is not known). A post that says it
// is hidden but names no hidden game is read the same way. `picks` holds the shown games only, or null when none shows.
const gameIds = value => (Array.isArray(value) ? [...new Set(value.filter(g => typeof g === 'string' && GAME_ID.test(g)))].sort() : null);
function postPicks(p) {
  const hidden = p.picksHidden === true, listed = gameIds(p.hiddenGames);
  if (hidden && !listed?.length) return { picksHidden: true, picks: null, hiddenGames: null };
  const withheld = new Set(listed || []);
  const shown = record(p.picks) ? Object.entries(p.picks).filter(([gameId, value]) => GAME_ID.test(gameId) && !withheld.has(gameId) && finite(value) !== null) : null;
  return { picksHidden: hidden || withheld.size > 0, picks: shown && (shown.length || !withheld.size) ? Object.fromEntries(shown) : null, hiddenGames: listed || [] };
}
// Points on the board: a number, or null when the provider says there is none (M-01: no submitted ballot that week or
// season, a sit-out included, DP-1). Never 0 for "no ballot".
const boardPoints = value => (typeof value === 'number' ? (Number.isFinite(value) ? value : null)
  : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : null);

function normalize(raw) {
  if (!record(raw) || !Array.isArray(raw.members) || !Array.isArray(raw.posts) || !Array.isArray(raw.due) || !Array.isArray(raw.submissions)) throw new Error('Invalid community feed.');
  const members = raw.members.map(m => ({ id: String(m.id), displayName: String(m.displayName), removed: m.removed === true }));
  const posts = raw.posts.filter(p => KINDS.includes(p.kind)).map(p => ({
    id: String(p.id), actorId: String(p.actorId), kind: p.kind, season: p.season ?? null, week: p.week ?? null,
    mode: MODES.includes(p.mode) ? p.mode : null, createdAt: p.createdAt,
    likes: Number(p.likes) || 0, likedByMe: p.likedByMe === true,
    comments: (Array.isArray(p.comments) ? p.comments : []).map(c => ({ id: String(c.id), userId: String(c.userId), body: String(c.body), createdAt: c.createdAt })),
    ...(p.kind === 'ballot_submitted' ? { ...postPicks(p), late: normalizeLate(p.late) } : {}),
    ...(p.kind.startsWith('bet_') ? { entryId: typeof p.payload?.entryId === 'string' ? p.payload.entryId : null } : {}),
    ...(p.kind === 'week_published' ? { games: Number(p.payload?.games) || 0, deadline: p.payload?.deadline ?? null } : {}),
  }));
  const week = record(raw.week) ? { season: raw.week.season, week: raw.week.week, deadline: raw.week.deadline, games: raw.week.games } : null;
  const due = raw.due.filter(d => MODES.includes(d.mode)).map(d => ({ mode: d.mode, submitted: d.submitted === true, satOut: d.satOut === true, filled: Number(d.filled) || 0, games: Number(d.games) || 0 }));
  const standings = (Array.isArray(raw.standings) ? raw.standings : []).filter(x => MODES.includes(x.mode)).map(x => ({ userId: String(x.userId), mode: x.mode,
    weekPoints: boardPoints(x.weekPoints), weekScored: Number(x.weekScored) || 0, seasonPoints: boardPoints(x.seasonPoints), seasonScored: Number(x.seasonScored) || 0, weeksSubmitted: Number(x.weeksSubmitted) || 0, satOut: x.satOut === true }));
  const submissions = raw.submissions.filter(s => MODES.includes(s.mode)).map(s => ({ userId: String(s.userId), mode: s.mode, submittedAt: s.submittedAt ?? null, satOut: s.satOut === true,
    late: s.satOut === true ? null : normalizeLate(s.late) }));
  const optOuts = (Array.isArray(raw.optOuts) ? raw.optOuts : []).filter(m => MODES.includes(m));
  const interests = COMING_SOON_LEAGUES.filter(league => Array.isArray(raw.interests) && raw.interests.includes(league));
  const counts = record(raw.interestCounts) ? raw.interestCounts : {};
  const interestCounts = Object.fromEntries(COMING_SOON_LEAGUES.map(league => [league, Math.max(0, Number(counts[league]) || 0)]));
  return { viewer: String(raw.viewer), admin: raw.admin === true, members, week, optOuts, due, submissions, standings, posts, interests, interestCounts };
}

// History (Sean's October 12, 2026 rulings): every member's guesses for every week and market with the
// line at each guess and its points: the line saved with the guess (D-16/D-27) or ruled for it (D-25), else
// the line at the guess resolved when read (basis 'line-at-guess'). The database already withholds another
// member's guesses, reference values and per-pick points until that game and market is open to the viewer
// (M-01, per game; before it, the D-23 reveal of the whole market), and returns the last change,
// the post-submission revision count and the provenance (derived from the private audit and provenance
// columns) for the viewer's own ballots only; this filter is the second gate for both. A ballot that is not
// eligible (a practice ballot without an eligible commissioner ruling, D-08) is listed with its guesses and
// lines but never carries points, whatever the provider returned.
const HISTORY_STATUSES = ['submitted', 'sat_out', 'draft'];
const HISTORY_PROVENANCE = ['community-import', 'solo', 'migrated-league', 'group', 'unknown'];
const HISTORY_ELIGIBILITY = ['standard', 'ruled-eligible', 'ruled-ineligible', 'practice'];
const REFERENCE_BASES = ['saved', 'commissioner-ruled', 'line-at-guess', 'nearest-snapshot', 'none'];
// The read-time rule ('newest-at-or-before', 'first-after-submission') or the saved basis (D-27 'line_at_guess',
// 'first_line_after_submission', D-25 'commissioner-ruled').
const REFERENCE_RULES = ['newest-at-or-before', 'first-after-submission', 'line_at_guess', 'first_line_after_submission', 'commissioner-ruled'];
const REFERENCE_ORIGINS = ['hosted-snapshot', 'imported-reference'];
const RESULT_STATUSES = ['final', 'postponed', 'cancelled'];
const finite = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const text = value => (value === null || value === undefined ? null : String(value));
function normalizeReference(raw) {
  if (!record(raw) || !REFERENCE_BASES.includes(raw.basis)) return null;
  return { basis: raw.basis, label: text(raw.label) ?? '', status: text(raw.status) ?? '', value: finite(raw.value), source: text(raw.source),
    sourceUrl: typeof raw.sourceUrl === 'string' && /^https:\/\//.test(raw.sourceUrl) ? raw.sourceUrl : null, snapshotId: text(raw.snapshotId),
    capturedAt: text(raw.capturedAt), observedAt: text(raw.observedAt), savedAt: text(raw.savedAt), decision: text(raw.decision), reason: text(raw.reason),
    // Seconds from the line's observation to the guess: positive when observed before it, negative when after (first line after submission).
    gapSeconds: finite(raw.gapSeconds), detail: text(raw.detail), priorSnapshotAt: text(raw.priorSnapshotAt), nextSnapshotAt: text(raw.nextSnapshotAt),
    rule: REFERENCE_RULES.includes(raw.rule) ? raw.rule : null, origin: REFERENCE_ORIGINS.includes(raw.origin) ? raw.origin : null,
    sourceFile: typeof raw.sourceFile === 'string' && /^data\/snapshots\/[A-Za-z0-9._-]+\.json$/.test(raw.sourceFile) ? raw.sourceFile : null,
    fileSha256: typeof raw.fileSha256 === 'string' && /^[0-9a-f]{64}$/.test(raw.fileSha256) ? raw.fileSha256 : null,
    bookCount: finite(raw.bookCount), guessedAt: text(raw.guessedAt),
    // False when the guess instant is the stored submittedAt of a ballot whose original submission time was not recorded.
    guessedAtKnown: typeof raw.guessedAtKnown === 'boolean' ? raw.guessedAtKnown : null };
}
function historyGate(raw) {
  if (!record(raw)) return null;
  return Object.fromEntries(Object.entries(raw).filter(([gameId, m]) => GAME_ID.test(gameId) && record(m)).map(([gameId, m]) => [gameId, { spread: m.spread === true, total: m.total === true }]));
}
// Redesign stage 17 (D-39, M-01): History per game and market. Another member's row for a withheld game (`hidden: true`, or
// named in the entry's `hiddenGames`) carries no guess, line or points, whatever the provider returned; the rows the
// database let through pass. The viewer's own rows are never redacted (D-23). The provider before M-01 hides a whole entry
// (`picksHidden` without `hiddenGames`): then no row passes, as before, and `hiddenGames` is null. `picks` is null when no
// row of another member shows.
function historyPicks(e, own, eligible) {
  const hidden = e.picksHidden === true, listed = gameIds(e.hiddenGames);
  if (!Array.isArray(e.picks) || (hidden && !listed?.length)) return { picksHidden: hidden || !!listed?.length, picks: null, hiddenGames: hidden && !listed?.length ? null : listed || [] };
  const withheld = new Set(listed || []);
  let shown = 0;
  const rows = e.picks.filter(record).map(p => {
    const gameId = String(p.gameId);
    if (!own && (p.hidden === true || withheld.has(gameId))) { withheld.add(gameId); return { gameId, guess: null, reference: null, points: null, scorable: false, hidden: true }; }
    shown += 1;
    // An ineligible ballot never scores (D-08), whatever the provider returned.
    const points = eligible ? finite(p.points) : null;
    return { gameId, guess: finite(p.guess), reference: normalizeReference(p.reference), points, scorable: points !== null, hidden: false };
  });
  return { picksHidden: hidden || withheld.size > 0, picks: !shown && withheld.size ? null : rows, hiddenGames: [...withheld].filter(g => GAME_ID.test(g)).sort() };
}
function normalizeHistory(raw, viewer) {
  if (!record(raw) || !Array.isArray(raw.members) || !Array.isArray(raw.weeks)) throw new Error('Invalid community history.');
  const members = raw.members.map(m => ({ id: String(m.id), displayName: String(m.displayName), removed: m.removed === true }));
  const weeks = raw.weeks.filter(record).map(w => ({
    season: Number(w.season), week: Number(w.week), deadline: text(w.deadline), closed: w.closed === true,
    games: (Array.isArray(w.games) ? w.games : []).filter(record).map(g => ({ id: String(g.id), awayCode: String(g.awayCode), homeCode: String(g.homeCode), away: String(g.away), home: String(g.home), kickoff: text(g.kickoff) })),
    results: Object.fromEntries(Object.entries(record(w.results) ? w.results : {}).filter(([, r]) => record(r) && RESULT_STATUSES.includes(r.status)).map(([gameId, r]) => [gameId, {
      status: r.status, home: finite(r.home), away: finite(r.away), source: text(r.source), observedAt: text(r.observedAt), settledAt: text(r.settledAt),
      origin: r.origin === 'commissioner_reported' ? 'commissioner_reported' : 'settlement' }])),
    revealed: { guess_spread: w.revealed?.guess_spread === true, guess_total: w.revealed?.guess_total === true },
    // M-01: the viewer's own gate for every game of the week ({ gameId: { spread, total } }), null from a provider before it.
    gate: historyGate(w.gate),
    entries: (Array.isArray(w.entries) ? w.entries : []).filter(e => record(e) && MODES.includes(e.mode) && HISTORY_STATUSES.includes(e.status)).map(e => {
      const own = String(e.userId) === viewer, eligible = e.eligible !== false;
      const { picksHidden, picks, hiddenGames } = historyPicks(e, own, eligible);
      return { userId: String(e.userId), mode: e.mode, status: e.status, submittedAt: text(e.submittedAt), satOutAt: text(e.satOutAt),
        // False when the ballot's origin records that its original submission time is unavailable (its picks are compared at the stored time, labelled).
        submittedAtKnown: e.submittedAtKnown !== false,
        eligible, eligibility: HISTORY_ELIGIBILITY.includes(e.eligibility) ? e.eligibility : 'standard',
        // Own-only, hidden or revealed, whatever the provider returned (the gtl_read_weekly_state rule: private provenance and audits stay own-only).
        updatedAt: own ? text(e.updatedAt) : null, revisions: own ? Math.max(0, Number(e.revisions) || 0) : null,
        provenance: own && HISTORY_PROVENANCE.includes(e.provenance) ? e.provenance : null,
        scoringPolicy: e.scoringPolicy === 'submission-time' ? 'submission-time' : null,
        ruling: record(e.ruling) ? { decision: text(e.ruling.decision) ?? '', basis: text(e.ruling.basis) ?? '' } : null,
        picksHidden, picks, hiddenGames, late: e.status === 'sat_out' ? null : normalizeLate(e.late),
        // M-01: null for a draft or a sit-out (no submitted ballot scores), never 0 (DP-1); an ineligible ballot never scores.
        weekPoints: eligible ? boardPoints(e.weekPoints) : 0, weekScored: eligible ? Number(e.weekScored) || 0 : 0, games: Number(e.games) || 0 };
    }),
  }));
  const seasons = (Array.isArray(raw.seasons) ? raw.seasons : []).map(Number).filter(Number.isInteger);
  return { viewer: String(raw.viewer), season: Number.isInteger(raw.season) ? raw.season : null, now: text(raw.now), seasons, members, weeks };
}

// Everyone's picks (M-08, redesign build plan stage 26; D-39, D-31, D-30, D-23). The database already withholds another
// member's guess until it is locked in and that game and market is open to the viewer (M-01's gate), and returns the error,
// points, shared rank and closest flag only from that game's kickoff; this filter is the second gate for both, whatever the
// provider returned. The viewer's own guess always passes, a draft included (lockedIn tells it apart). A draft of anyone else
// is never told apart from no ballot ('not_yet', no number), and no line value is ever part of this reply.
const PICK_STATUSES = ['in', 'late', 'not_yet', 'sat_out'];
const GAME_ID = /^[A-Z]{2,4}-[A-Z]{2,4}$/;
function normalizeLate(raw) {
  return record(raw) && finite(raw.minutes) !== null ? { deadline: text(raw.deadline), minutes: raw.minutes } : null;
}
function normalizePicks(raw, viewer) {
  if (!record(raw) || !Array.isArray(raw.games)) throw new Error('Invalid picks.');
  const games = raw.games.filter(g => record(g) && GAME_ID.test(g.gameId ?? '')).map(g => {
    const started = g.started === true, open = g.open === true;
    const rows = (Array.isArray(g.rows) ? g.rows : []).filter(r => record(r) && UUID_PATTERN.test(r.userId ?? '') && PICK_STATUSES.includes(r.status)).map(r => {
      const own = r.userId.toLowerCase() === viewer.toLowerCase(), locked = r.status === 'in' || r.status === 'late';
      // Another member's guess only while it is locked in and open to the viewer; the viewer's own always.
      const shown = own || (locked && open && r.hidden !== true);
      // From kickoff only, and only for a locked-in guess the viewer may see.
      const error = started && locked && shown ? finite(r.error) : null;
      const scored = error !== null;
      return {
        userId: r.userId, removed: r.removed === true, status: r.status, lockedIn: locked,
        late: locked ? normalizeLate(r.late) : null, eligible: locked ? r.eligible !== false : null,
        hidden: locked && !shown, pick: shown ? finite(r.pick) : null,
        error, points: scored ? finite(r.points) : null, rank: scored && Number.isInteger(r.rank) && r.rank > 0 ? r.rank : null,
        tied: scored && r.tied === true, closest: scored && r.closest === true,
      };
    });
    return { gameId: g.gameId, kickoff: text(g.kickoff), started, open, rows };
  });
  return { viewer, season: Number.isInteger(raw.season) ? raw.season : null, week: Number.isInteger(raw.week) ? raw.week : null,
    mode: MODES.includes(raw.mode) ? raw.mode : null, now: text(raw.now), deadline: text(raw.deadline), games };
}

// "Skip this week's Guess the Line" and "See picks now" (M-03, redesign build plan stage 19; D-36, D-39, D-41, D-23). One forfeit
// per player and week, until the week's last kickoff: it sits out (a D-23 opt-out) every market not yet submitted or sat out, and
// a submitted market, or a guess already locked in, keeps counting. The database decides all of it; these filters pass only the
// known keys of its answers.
const FORFEIT_REASONS = ['skip', 'reveal'];
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const FORFEIT_MARKET_STATUSES = ['submitted', 'sat_out', 'open'];
/** A stored forfeit, { reason, modes, createdAt }, or a throw. */
function normalizeForfeitRecord(raw) {
  if (!record(raw) || !FORFEIT_REASONS.includes(raw.reason) || !Array.isArray(raw.modes) || !raw.modes.length
    || raw.modes.some(mode => !MODES.includes(mode)) || new Set(raw.modes).size !== raw.modes.length || !instant(raw.createdAt)) throw new Error('Invalid forfeit.');
  return { reason: raw.reason, modes: MODES.filter(mode => raw.modes.includes(mode)), createdAt: raw.createdAt };
}
/**
 * gtl_read_forfeit's answer for one week: { season, week, closesAt, open, forfeit, markets }. `open` says a forfeit is still
 * possible now; `markets` says what one would do to each market ('submitted' keeps counting, 'sat_out' already, 'open' would be
 * sat out), with `lockedIn` of its `games` locked in (those guesses keep counting, D-39, D-41). Anything else throws, and
 * /community/read then leaves the field out.
 */
export function parseForfeit(raw) {
  if (!record(raw) || !Number.isInteger(raw.season) || !Number.isInteger(raw.week) || !Array.isArray(raw.markets) || typeof raw.open !== 'boolean') throw new Error('Invalid forfeit.');
  const count = value => Number.isInteger(value) && value >= 0 && value <= 64;
  const markets = MODES.map(mode => {
    const entries = raw.markets.filter(m => record(m) && m.mode === mode);
    if (entries.length !== 1) throw new Error('Invalid forfeit.');
    const { status, lockedIn, games } = entries[0];
    if (!FORFEIT_MARKET_STATUSES.includes(status) || !count(lockedIn) || !count(games) || lockedIn > games) throw new Error('Invalid forfeit.');
    return { mode, status, lockedIn, games };
  });
  if (raw.closesAt !== null && !instant(raw.closesAt)) throw new Error('Invalid forfeit.');
  const forfeit = raw.forfeit === null ? null : normalizeForfeitRecord(raw.forfeit);
  return { season: raw.season, week: raw.week, closesAt: raw.closesAt, open: raw.open && forfeit === null && markets.some(m => m.status === 'open'), forfeit, markets };
}
/**
 * /community/read's `forfeit` (build plan section 3.3): read through the optional-RPC wrapper, so while gtl_read_forfeit is
 * missing (before "apply M-03", or after its grant is revoked) or fails, it resolves to null and the reply is unchanged. Never rejects.
 */
export function readForfeit(optionalRpc, userId, now) {
  return readOptional(optionalRpc, 'gtl_read_forfeit', { p_user: userId, p_season: null, p_week: null, p_now: new Date(now).toISOString() }, { parse: parseForfeit, fallback: null });
}
/**
 * Adds `forfeit` to a /community/read view when it answered for the same week the view shows; otherwise the view as it is.
 * `writerOff` (GTL_FEATURE_OFF names `forfeit`): the writer refuses before the database, so `open` reads false (no forfeit is
 * possible now) and the rest of the field, the stored forfeit and each market, is kept as read.
 */
export async function withForfeit(view, forfeit, { writerOff = false } = {}) {
  const [feed, read] = await Promise.all([view, forfeit]);
  if (!read || !feed.week || read.season !== feed.week.season || read.week !== feed.week.week) return feed;
  return { ...feed, forfeit: writerOff ? { ...read, open: false } : read };
}

/**
 * Picks due for the viewer: "not_open" before the week's Monday 00:00 PT open (D-24),
 * "urgent" inside two hours of the deadline, "closed" after it. A sat-out mode is never due (D-23).
 */
export function picksDue(feed, now) {
  if (!feed.week) return { state: 'none', modes: [] };
  const deadline = Date.parse(feed.week.deadline), opensAt = weekOpenAt(deadline);
  const open = feed.due.filter(d => !d.submitted && !d.satOut);
  if (!open.length) return { state: 'done', modes: [] };
  const state = now < Date.parse(opensAt) ? 'not_open' : now >= deadline ? 'closed' : deadline - now <= 2 * 3_600_000 ? 'urgent' : 'due';
  // `now` is the handler clock the states were judged against, so the home screen can say "opens in 3 days" without trusting the device clock.
  return { state, opensAt, deadline: feed.week.deadline, week: feed.week.week, modes: open, now: new Date(now).toISOString() };
}

/**
 * `pushConfigured` (redesign stage 2, push guard): true only when gtl-api holds a valid VAPID public key.
 * /community/read carries the boolean so the old app hides its reminder controls until push really works;
 * the key itself is never part of this reply (only /push/status hands it over, on the player's tap).
 */
export async function handleCommunity({ route, body = {}, user, service, clock = Date.now, pushConfigured = false, featureOff = new Set() }) {
  if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new CommunityError(401, 'Sign in to continue.');
  if (!service?.rpc) throw new Error('The community feed is not configured.');
  if (!Object.hasOwn(COMMUNITY_METHODS, route)) invalid();
  if (route === '/community/picks') {
    // Everyone's picks for one week and market (M-08): every game, or one (gameId); every member, or one (userId, the
    // League "See Kenny's picks" row). The viewer always comes from sign-in. Without season and week, the newest published week.
    fields(body, ['season', 'week', 'mode', 'gameId', 'userId']);
    if ((body.season === undefined) !== (body.week === undefined)) invalid();
    if (body.season !== undefined && (!Number.isInteger(body.season) || body.season < 2000 || body.season > 2200 || !Number.isInteger(body.week) || body.week < 1 || body.week > 25)) invalid();
    if (!MODES.includes(body.mode)) invalid();
    if (body.gameId !== undefined && !GAME_ID.test(typeof body.gameId === 'string' ? body.gameId : '')) invalid();
    if (body.userId !== undefined && !UUID_PATTERN.test(typeof body.userId === 'string' ? body.userId : '')) invalid();
    // Gate M off switch: GTL_FEATURE_OFF=picks stops this reader before it reaches the database (cloud/feature-off.mjs).
    if (featureOff.has('picks')) throw providerCommunityError('GTL_FEATURE_OFF');
    const now = clock();
    return normalizePicks(await service.rpc('gtl_read_guess_picks', { p_user: user.id, p_season: body.season ?? null, p_week: body.week ?? null,
      p_mode: body.mode, p_game: body.gameId ?? null, p_target: body.userId ?? null, p_now: new Date(now).toISOString() }), user.id);
  }
  if (route === '/community/read') {
    fields(body, ['before', 'limit']);
    if (body.before !== undefined && !Number.isFinite(Date.parse(body.before))) invalid();
    if (body.limit !== undefined && (!Number.isInteger(body.limit) || body.limit < 1 || body.limit > 100)) invalid();
    const now = clock();
    const feed = normalize(await service.rpc('gtl_read_community', { p_user: user.id, p_before: body.before ?? null, p_limit: body.limit ?? 30, p_now: new Date(now).toISOString() }));
    return { ...feed, picksDue: picksDue(feed, now), pushConfigured: pushConfigured === true };
  }
  if (route === '/community/history') {
    fields(body, ['season']);
    if (body.season !== undefined && (!Number.isInteger(body.season) || body.season < 2000 || body.season > 2200)) invalid();
    const now = clock();
    return normalizeHistory(await service.rpc('gtl_read_community_history', { p_user: user.id, p_season: body.season ?? null, p_now: new Date(now).toISOString() }), user.id);
  }
  if (route === '/community/week-open') {
    // D-24 scheduler status for the commissioner's Publish panel; reference only, never a credential.
    fields(body, []);
    const raw = await service.rpc('gtl_read_week_open_schedule', { p_user: user.id });
    if (!record(raw)) throw new Error('Invalid week open status.');
    const week = record(raw.currentWeek) ? { season: raw.currentWeek.season, week: raw.currentWeek.week, openAt: raw.currentWeek.openAt, deadline: raw.currentWeek.deadline } : null;
    return { configured: raw.configured === true, enabled: raw.enabled === true, season: raw.season ?? null, timeZone: 'America/Los_Angeles', localTime: '00:00', weekday: 'Monday',
      utcCrons: Array.isArray(raw.utcCrons) ? raw.utcCrons.map(String) : [], lastRunAt: raw.lastRunAt ?? null, lastFinishedAt: raw.lastFinishedAt ?? null,
      lastStatus: raw.lastStatus ?? null, lastReason: raw.lastReason ?? null, currentWeek: week };
  }
  if (route === '/community/like') {
    fields(body, ['postId', 'like']);
    if (!UUID_PATTERN.test(body.postId || '') || typeof body.like !== 'boolean') invalid();
    const result = await service.rpc('gtl_like_feed', { p_user: user.id, p_post: body.postId, p_like: body.like });
    return { likes: Number(result?.likes) || 0, likedByMe: result?.likedByMe === true };
  }
  if (route === '/community/comment') {
    fields(body, ['requestId', 'postId', 'body']);
    if (!UUID_PATTERN.test(body.requestId || '') || !UUID_PATTERN.test(body.postId || '') || typeof body.body !== 'string') invalid();
    const text = body.body.trim();
    if (!text || text.length > 500 || /[\x00-\x08\x0b-\x1f\x7f]/.test(text)) invalid();
    const result = await service.rpc('gtl_comment_feed', { p_user: user.id, p_request_id: body.requestId, p_post: body.postId, p_body: text });
    if (!UUID_PATTERN.test(result?.id || '')) throw new Error('Invalid comment result.');
    return { id: result.id, replayed: result.replayed === true };
  }
  if (route === '/community/publish-preview' || route === '/community/publish') {
    fields(body, ['season', 'week']);
    if (!Number.isInteger(body.season) || body.season < 2000 || body.season > 2200 || !Number.isInteger(body.week) || body.week < 1 || body.week > 25) invalid();
    if (!(await service.rpc('gtl_community_admin', { p_user: user.id }))) throw providerCommunityError('GTL_COMMUNITY_FORBIDDEN');
    if (typeof service.schedule !== 'function') throw new Error('The schedule source is not configured.');
    let slate;
    try { slate = buildSlate(await service.schedule(), body.season, body.week); }
    catch (error) { throw new CommunityError(422, `The public schedule could not be used: ${error.message}`); }
    if (route === '/community/publish-preview') return slate;
    const result = await service.rpc('gtl_publish_week', { p_user: user.id, p_season: slate.season, p_week: slate.week,
      p_games: slate.games.map(({ neutral, ...game }) => game), p_deadline: slate.deadline, p_source: slate.source });
    return { ...slate, published: result?.published === true };
  }
  if (route === '/community/sit-out') {
    fields(body, ['season', 'week', 'mode']);
    if (!Number.isInteger(body.season) || body.season < 2000 || body.season > 2200 || !Number.isInteger(body.week) || body.week < 1 || body.week > 25 || !MODES.includes(body.mode)) invalid();
    const result = await service.rpc('gtl_sit_out_week', { p_user: user.id, p_season: body.season, p_week: body.week, p_mode: body.mode, p_now: new Date(clock()).toISOString() });
    if (result?.satOut !== true) throw new Error('Invalid sit-out result.');
    return { season: body.season, week: body.week, mode: body.mode, satOut: true, replayed: result.replayed === true };
  }
  if (route === '/community/forfeit') {
    // M-03 (stage 19): "Skip this week's Guess the Line" (reason 'skip') or "See picks now" ('reveal') for one week. The player
    // comes from sign-in and the time from the handler clock; the database picks the markets, so the body names none.
    fields(body, ['season', 'week', 'reason']);
    if (!Number.isInteger(body.season) || body.season < 2000 || body.season > 2200 || !Number.isInteger(body.week) || body.week < 1 || body.week > 25 || !FORFEIT_REASONS.includes(body.reason)) invalid();
    // Gate M off switch: GTL_FEATURE_OFF=forfeit stops the writer before it reaches the database (cloud/feature-off.mjs).
    if (featureOff.has('forfeit')) throw providerCommunityError('GTL_FEATURE_OFF');
    const result = await service.rpc('gtl_forfeit_guess_week', { p_user: user.id, p_season: body.season, p_week: body.week, p_reason: body.reason, p_now: new Date(clock()).toISOString() });
    if (!record(result) || result.season !== body.season || result.week !== body.week || typeof result.replayed !== 'boolean') throw new Error('Invalid forfeit result.');
    return { season: body.season, week: body.week, ...normalizeForfeitRecord(result), replayed: result.replayed };
  }
  if (route === '/community/interest') {
    fields(body, ['league', 'notify']);
    if (!COMING_SOON_LEAGUES.includes(body.league) || typeof body.notify !== 'boolean') invalid();
    const result = await service.rpc('gtl_set_league_interest', { p_user: user.id, p_league: body.league, p_notify: body.notify });
    if (result?.league !== body.league) throw new Error('Invalid interest result.');
    return { league: body.league, notify: result.notify === true, count: Math.max(0, Number(result.count) || 0) };
  }
  fields(body, ['userId', 'member']);
  if (!UUID_PATTERN.test(body.userId || '') || body.userId === user.id || typeof body.member !== 'boolean') invalid();
  const result = await service.rpc('gtl_set_community_member', { p_user: user.id, p_target: body.userId, p_member: body.member });
  return { userId: String(result?.userId), member: result?.member === true };
}
