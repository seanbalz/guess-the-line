// The Guess the Line rule view model for the new app (redesign build plan, stage 7; D-39 per-game lock-in).
//
// Pure: it reads the facts it is given (kickoffs, the week's deadline, this player's own entries, any forfeit,
// the live rules from the server and `now`) and returns what the screens draw: each game and market's state,
// what it reveals to this player, and one summary per market and per week. The server is the authority
// (section 3.4): SQL decides when a pick closes, whether it can change and who sees what. This file only
// describes that rule, so banners, locks and buttons agree with it; a lock that exists only here protects
// nothing. It never fetches, stores or reads a clock.
//
// The model, per game and market (D-39, amending D-36 and D-37):
// - `open`: the game has not closed and there is no pick yet.
// - `draft`: an unlocked pick. It changes freely until the game closes and nobody else sees it.
// - `lockedIn`: final once locked in (when the live rules say `sentFinal`). Locking it in opens, for this player,
//   that game's line for that market and everyone's picks for that game and market. The other market and other
//   games stay hidden until their own lock-in. Points show from kickoff. Under today's rules a market is
//   submitted whole (every game picked) and that opens the whole market.
// - `closed`: the game closed (at its kickoff; at the deadline under today's rules) without a locked-in pick. Any
//   draft stays stored and is shown to its owner only (D-23); it never counts.
// - `forfeited`: the player skipped the week or used "See picks now" (or sat out the market, D-23) before the
//   game closed. Everything opens; picks already locked in keep counting.
// Kickoff opens a game's line and picks for everyone; under today's rules the deadline opens the whole week.
//
// Live rules (`rules` on /community/read, /personal and /state; cloud/live-rules.mjs):
// - `sentFinal: true` (M-02): a locked-in pick is final. `false` (today, D-16): a sent pick can still change until
//   it closes, so screens say "Submitted" and keep Edit.
// - `lateWindow: 'kickoff'` (M-07): each game closes at its own kickoff and a pick locked in after the deadline
//   carries the Late marker (D-36, D-30). `'deadline'` (today, D-24): every game closes at the deadline, or at its
//   kickoff if that is earlier.
// - `revealAt: 'kickoff'` (M-01): the clock opens each game at its own kickoff. `'deadline'` (today, D-23): the
//   week's deadline, the first kickoff (D-24), opens every game of both markets for everyone
//   (`gtl_week_revealed`). A kickoff late window always reveals at kickoff (M-07 is applied only after M-01).
// Today's server sends a market as one submission; the data layer gives each of that ballot's picks its
// `submittedAt` as `lockedAt`, which is how this model reads it.
import { SEP, fmtLate, toMs, toNumber } from './format.js';
import * as copy from './copy.js';

/** What the server's rules mean while `gtl_live_rules` is missing (equal to cloud/live-rules.mjs `TODAYS_RULES`). */
export const TODAYS_RULES = Object.freeze({ sentFinal: false, lateWindow: 'deadline', revealAt: 'deadline' });
export const LATE_WINDOWS = Object.freeze(['deadline', 'kickoff']);
export const REVEAL_TIMES = Object.freeze(['deadline', 'kickoff']);
export const MARKETS = Object.freeze(['spread', 'total']);
export const GUESS_STATES = Object.freeze(['open', 'draft', 'lockedIn', 'closed', 'forfeited']);
export const FORFEIT_REASONS = Object.freeze(['skip', 'reveal', 'sitOut']);

/**
 * The server's `rules` field, checked the way cloud/live-rules.mjs `parseLiveRules` checks the function's answer:
 * anything malformed or missing reads as today's rules; a missing `revealAt` reads as 'deadline', and a kickoff
 * late window always reveals at kickoff.
 */
export function liveRules(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && typeof raw.sentFinal === 'boolean' && LATE_WINDOWS.includes(raw.lateWindow)
    && (raw.revealAt == null || REVEAL_TIMES.includes(raw.revealAt))) {
    return { sentFinal: raw.sentFinal, lateWindow: raw.lateWindow, revealAt: raw.lateWindow === 'kickoff' ? 'kickoff' : raw.revealAt ?? 'deadline' };
  }
  return { ...TODAYS_RULES };
}

/** When a game's pick closes: its kickoff (`lateWindow: 'kickoff'`), else the deadline or the kickoff, whichever is first. `null` without a kickoff. */
export function closesAt(kickoff, deadline, rules) {
  const ko = toMs(kickoff);
  const dl = toMs(deadline);
  if (ko === null) return null;
  if (liveRules(rules).lateWindow === 'kickoff' || dl === null) return ko;
  return Math.min(ko, dl);
}

// This player's own entry for one game and market: `{ value, lockedAt, late: { minutes } | null }`.
function ownEntry(entry) {
  if (!entry || typeof entry !== 'object') return { value: null, lockedAt: null, late: null };
  return {
    value: toNumber(entry.value),
    lockedAt: toMs(entry.lockedAt),
    late: entry.late ? { minutes: typeof entry.late === 'object' ? toNumber(entry.late.minutes) : null } : null,
  };
}

// A week's forfeit for one market: `{ reason: 'skip' | 'reveal' | 'sitOut', at }`, or null.
function weekForfeit(forfeit) {
  if (!forfeit || typeof forfeit !== 'object') return null;
  return { reason: FORFEIT_REASONS.includes(forfeit.reason) ? forfeit.reason : 'sitOut', at: toMs(forfeit.at) };
}

function needNow(now) {
  const at = toMs(now);
  if (at === null) throw new TypeError('The rules view model needs the current time.');
  return at;
}

/**
 * One game and market for this player.
 *
 * @param {object} input
 * @param {string|number|Date} input.kickoff the game's kickoff
 * @param {string|number|Date} [input.deadline] the week's deadline (the Thursday kickoff, D-24)
 * @param {{value?: number|null, lockedAt?: string|number|null, late?: {minutes?: number}|null}|null} [input.entry]
 *   this player's own pick; `late` is the Late marker the server stored (never derived here: a commissioner
 *   ruling can make a later save on time, D-25)
 * @param {{reason?: string, at?: string|number}|null} [input.forfeit] this market's forfeit for the week
 * @param {string|number|Date} input.now
 * @param {{sentFinal: boolean, lateWindow: string}} [input.rules] the server's live rules
 */
export function guessState({ kickoff, deadline = null, entry = null, forfeit = null, now, rules } = {}) {
  const at = needNow(now);
  const live = liveRules(rules);
  const ko = toMs(kickoff);
  const dl = toMs(deadline);
  const close = closesAt(ko, dl, live);
  const own = ownEntry(entry);
  const out = weekForfeit(forfeit);
  const kickedOff = ko !== null && at >= ko;
  // No kickoff: closed for picking (nothing can be saved for an unknown time), but nothing opens by kickoff.
  const isClosed = close === null || at >= close;
  const lockedIn = own.lockedAt !== null;
  const hasValue = own.value !== null;
  // A game that had already closed when the week was forfeited stays "closed".
  const closedFirst = isClosed && close !== null && out !== null && out.at !== null && close <= out.at;

  let state;
  if (lockedIn) state = 'lockedIn';
  else if (out && !closedFirst) state = 'forfeited';
  else if (isClosed) state = 'closed';
  else if (hasValue) state = 'draft';
  else state = 'open';

  const final = lockedIn && live.sentFinal;
  // Today (`revealAt: 'deadline'`) the deadline opens the whole week for everyone; from M-01 only kickoff does.
  const clockOpened = kickedOff || (live.revealAt === 'deadline' && dl !== null && at >= dl);
  const revealed = lockedIn || out !== null || clockOpened;
  const pickable = state === 'open' || state === 'draft';
  const closedAtKickoff = state === 'closed' && close !== null && close === ko;
  const lateMinutes = lockedIn && own.late ? own.late.minutes : null;

  let label;
  if (state === 'lockedIn') label = final ? copy.GUESS_STATE_LABEL.lockedIn : copy.GUESS_STATE_LABEL.submitted;
  else if (state === 'forfeited') label = copy.FORFEIT_LABEL[out.reason];
  else if (state === 'closed') label = closedAtKickoff ? copy.GUESS_STATE_LABEL.closedAtKickoff : copy.GUESS_STATE_LABEL.closed;
  else label = copy.GUESS_STATE_LABEL[state];

  return {
    state,
    label,
    // This player's own pick (never another player's): the draft, or the locked-in value.
    value: lockedIn || pickable ? own.value : null,
    // A draft that was never locked in, kept for its owner only (History).
    unsentDraft: !lockedIn && !pickable && hasValue ? own.value : null,
    kickoff: ko,
    closesAt: close,
    kickedOff,
    closed: isClosed,
    closedAtKickoff,
    lockedIn,
    final,
    counts: lockedIn,
    canEdit: pickable || (lockedIn && !final && !isClosed),
    // One game locks in on its own only under D-39 (`sentFinal`). Today a market is submitted whole, and only
    // once every game has a pick: marketSummary() sets this for the drafts of a complete market.
    canLockIn: state === 'draft' && live.sentFinal,
    // After the deadline, while each game stays open until its kickoff (M-07), a pick locked in now is Late.
    wouldBeLate: pickable && live.lateWindow === 'kickoff' && dl !== null && at >= dl,
    late: lockedIn && own.late !== null,
    lateMinutes,
    lateText: lockedIn && own.late ? fmtLate(lateMinutes) : '',
    forfeitReason: state === 'forfeited' ? out.reason : null,
    // What this game and market reveal to this player: its line, and everyone's picks.
    lineVisible: revealed,
    picksVisible: revealed,
    pointsShown: lockedIn && kickedOff,
  };
}

const byKickoff = (a, b) => {
  const x = toMs(a.kickoff);
  const y = toMs(b.kickoff);
  if (x === y) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x - y;
};

/**
 * One market for the week: every game's state plus the counts the screens show.
 *
 * @param {object} input
 * @param {'spread'|'total'} input.market
 * @param {Array<{id: string, kickoff: string|number}>} input.games the week's games
 * @param {Record<string, object>} [input.entries] this player's entries by game id
 * @param {object|null} [input.forfeit] this market's forfeit for the week
 */
export function marketSummary({ market, games = [], entries = {}, forfeit = null, deadline = null, now, rules } = {}) {
  if (!MARKETS.includes(market)) throw new TypeError(`Unknown market ${market}.`);
  const at = needNow(now);
  const live = liveRules(rules);
  const out = weekForfeit(forfeit);
  const ordered = (Array.isArray(games) ? [...games] : []).sort(byKickoff);
  const perGame = {};
  const count = { open: 0, draft: 0, lockedIn: 0, closed: 0, forfeited: 0 };
  let hidden = 0;
  let scored = 0;
  let anyLate = false;
  let wouldBeLate = false;
  let nextClose = null;
  let firstMissing = null;
  let firstLeft = null;
  for (const game of ordered) {
    const s = guessState({ kickoff: game.kickoff, deadline, entry: entries?.[game.id] ?? null, forfeit, now: at, rules: live });
    perGame[game.id] = s;
    count[s.state] += 1;
    if (!s.lineVisible) hidden += 1;
    if (s.pointsShown) scored += 1;
    if (s.late) anyLate = true;
    if (s.state === 'open' || s.state === 'draft') {
      if (s.wouldBeLate) wouldBeLate = true;
      if (firstLeft === null) firstLeft = game.id;
      if (s.state === 'open' && firstMissing === null) firstMissing = game.id;
      if (s.closesAt !== null && (nextClose === null || s.closesAt < nextClose)) nextClose = s.closesAt;
    }
  }
  const total = ordered.length;
  const left = count.open + count.draft;
  const picked = count.lockedIn + count.draft;
  const possible = count.lockedIn + left;
  // Every game has a pick (a draft or a sent one): today's server takes a submission only then (GTL_BALLOT_INCOMPLETE).
  const complete = total > 0 && picked === total;
  if (!live.sentFinal && complete) {
    for (const id of Object.keys(perGame)) if (perGame[id].state === 'draft') perGame[id].canLockIn = true;
  }
  const phase = out ? 'forfeited' : left > 0 ? (wouldBeLate ? 'late' : 'open') : 'done';
  const summary = {
    market,
    name: copy.marketName(market),
    games: perGame,
    order: ordered.map(g => g.id),
    total,
    lockedIn: count.lockedIn,
    drafts: count.draft,
    missing: count.open,
    left,
    picked,
    possible,
    complete,
    // Whether any draft can be locked in now (today: the whole market, submitted at once).
    canLockIn: Object.values(perGame).some(s => s.canLockIn),
    closedNoPick: count.closed,
    forfeited: count.forfeited,
    hidden,
    scored,
    anyLate,
    forfeit: out,
    forfeitReason: out ? out.reason : null,
    due: left > 0,
    late: phase === 'late',
    phase,
    nextClose,
    firstMissing,
    firstLeft,
    sentFinal: live.sentFinal,
  };
  summary.status = copy.marketStatus(summary);
  return summary;
}

/**
 * The week for this player: both markets, and whether the week can still be forfeited. Skip and "See picks now"
 * are allowed until the last kickoff, while any pick is still open (D-39); picks already locked in keep counting.
 */
export function weekSummary({ games = [], entries = {}, forfeits = {}, deadline = null, now, rules } = {}) {
  const at = needNow(now);
  const live = liveRules(rules);
  const dl = toMs(deadline);
  const markets = {};
  for (const market of MARKETS) {
    markets[market] = marketSummary({ market, games, entries: entries?.[market] ?? {}, forfeit: forfeits?.[market] ?? null, deadline: dl, now: at, rules: live });
  }
  const kickoffs = (Array.isArray(games) ? games : []).map(g => toMs(g.kickoff)).filter(ms => ms !== null);
  const lastKickoff = kickoffs.length ? Math.max(...kickoffs) : null;
  const left = MARKETS.reduce((sum, m) => sum + markets[m].left, 0);
  const closes = MARKETS.map(m => markets[m].nextClose).filter(ms => ms !== null);
  return {
    rules: live,
    deadline: dl,
    afterDeadline: dl !== null && at >= dl,
    lastKickoff,
    markets,
    due: MARKETS.filter(m => markets[m].due),
    nextClose: closes.length ? Math.min(...closes) : null,
    canForfeit: lastKickoff !== null && at < lastKickoff && left > 0,
    keepsCounting: MARKETS.some(m => markets[m].lockedIn > 0),
    status: MARKETS.map(m => markets[m].status).join(SEP),
  };
}

/** The one gate banner for a market on a screen (Bets, Lines): shown while any of its lines is hidden from this player. */
export function gateBanner(week, market) {
  const m = week.markets[market];
  const locked = m.hidden > 0;
  return {
    market,
    name: m.name,
    locked,
    open: !locked,
    sentence: !locked ? '' : m.left > 0 ? copy.lineLockedBanner(market, week.rules) : copy.linesAtKickoff(market),
    cellSentence: copy.lineLocked(market, week.rules),
    ctaLabel: locked && m.left > 0 ? copy.gateCta({ market, picked: m.picked, missing: m.missing, drafts: m.drafts, sentFinal: week.rules.sentFinal }) : '',
    firstGame: locked ? m.firstMissing ?? m.firstLeft : null,
    canSkip: locked && week.canForfeit,
    skipLabel: copy.SKIP_LABEL,
  };
}

/** Whether "See picks now" is offered on a game: its picks are hidden from this player and the week can still be forfeited. */
export function canSeePicksNow(week, market, gameId) {
  const s = week.markets[market]?.games[gameId];
  return !!s && !s.picksVisible && week.canForfeit;
}
