// Shared words for the new app (redesign build plan, stage 7): the strings more than one screen uses for the Guess
// the Line rules, so a status, a lock sentence or a warning reads the same on Home, Play, Lines, Bets, League and
// History. Pure: strings and small functions that build strings, nothing else.
//
// Wording follows D-39 (each game's Spread or Total pick is locked in on its own and is final once locked in;
// locking it in opens that game's line and friends' picks for that market), D-36 (picks close at each game's
// kickoff; skip and "See picks now" forfeit the rest of the week), D-30 (the Late marker) and D-39's "due, not
// lock" for deadlines. Today's rules (`sentFinal: false`) say "Submit" and "Submitted" instead of "Lock in".
// Plain words, sentence case, real minus, "PT" on every time (prototype contract section 15).
import { DASH, SEP, plural } from './format.js';

export const GAME_NAME = 'Guess the Line';
export const MARKET_NAME = Object.freeze({ spread: 'Spread', total: 'Total' });
const LINE_NOUN = Object.freeze({ spread: 'spread', total: 'total' });
const LINE_NOUNS = Object.freeze({ spread: 'Spreads', total: 'Totals' });

/** "Spread" or "Total" (never "Over / Under" or "Guess the Total" for the market, DP-23). */
export const marketName = market => MARKET_NAME[market] ?? DASH;

/** "Week 6", or "This week" when the week number is unknown. */
export const weekName = week => (Number.isInteger(week) && week > 0 ? `Week ${week}` : 'This week');

/** One game and market for this player (rules.js `guessState().state`). */
export const GUESS_STATE_LABEL = Object.freeze({
  open: 'No pick yet',
  draft: 'Draft',
  lockedIn: 'Locked in',
  submitted: 'Submitted',
  closedAtKickoff: `Closed at kickoff${SEP}No pick`,
  closed: `Closed${SEP}No pick`,
});

/** Why a market sat out the rest of a week: the D-36 skip, the "See picks now" forfeit, or a D-23 weekly sit-out. */
export const FORFEIT_LABEL = Object.freeze({ skip: 'Skipped', reveal: 'Saw picks early', sitOut: 'Sat out' });

/** Who's in, per member and market. */
export const WHOS_IN_LABEL = Object.freeze({ in: 'In', notYet: 'Not yet', satOut: 'Sat out', late: 'Late' });

export const SCORES_AT_KICKOFF = 'Scores at kickoff';
export const PICKS_STILL_OPEN = 'Picks still open';
export const SKIP_LABEL = "Skip this week's Guess the Line";
export const SEE_PICKS_NOW = 'See picks now';

/** The lock on one hidden line (a cell, a card, the game sheet). */
export const lineLocked = market => `Lock in your ${marketName(market)} pick to see this line.`;

/** The one gate banner per screen while some of a market's lines are hidden and picks can still be locked in. */
export const lineLockedBanner = market => `Lock in your ${marketName(market)} pick for a game to see its ${LINE_NOUN[market] ?? 'line'}.`;

/** The gate banner when nothing can be locked in any more but some games have not kicked off. */
export const linesAtKickoff = market => `${LINE_NOUNS[market] ?? 'Lines'} show at each game's kickoff.`;

/** Where friends' picks for a game and market are still hidden. */
export const picksHidden = market => `Friends' ${marketName(market)} picks show after you lock in yours, or at kickoff.`;

/** History, owner only: a draft that was never locked in stays stored (D-23), and says so. */
export const closedDraft = pickText => `Closed at kickoff${SEP}draft ${pickText} not locked in`;

/** Home's countdown heading: "Week 6 picks due in" (D-39: due, not lock). */
export const dueIn = week => `${weekName(week)} picks due in`;

/** "Due Thu 5:15 PM PT" */
export const dueAt = when => `Due ${when}`;

/** The late window rule in words, for the live rules (`lateWindow`), with the deadline as "Thu 5:15 PM PT". */
export function lateRule(rules, dueWhen) {
  if (rules?.lateWindow === 'kickoff') return `Each game's pick closes at its kickoff. Picks locked in after ${dueWhen} are marked Late.`;
  return `Picks close ${dueWhen}.`;
}

/** Said beside an open pick after the deadline, when the late window is live. */
export const LATE_NOW = 'Picks locked in now are marked Late.';

/** The final rule in words, for the live rules (`sentFinal`). */
export function finalRule(rules) {
  if (rules?.sentFinal === true) return "Locked-in picks are final. Locking in a game's pick shows its line and friends' picks for that game.";
  return 'You can change a sent pick until it closes.';
}

/** The way into Play from a gate banner: "Make Total picks", "Finish Total picks · 6 left", "Lock in 6 Total picks". */
export function gateCta({ market, picked, missing, drafts, sentFinal }) {
  const name = marketName(market);
  if (!picked) return `Make ${name} picks`;
  if (missing > 0) return `Finish ${name} picks${SEP}${missing} left`;
  if (drafts > 0) return sentFinal ? `Lock in ${plural(drafts, `${name} pick`)}` : `Submit ${name} picks`;
  return '';
}

/**
 * One market's status in a line ("Spread in", "Total 8 of 14", "Total 7 of 13 open", "Total · Skipped"), from
 * rules.js `marketSummary()` counts: `possible` is the games still open plus the ones locked in; `picked` is the
 * ones locked in plus the drafts.
 */
export function marketStatus({ market, total, lockedIn, left, picked, possible, forfeitReason }) {
  const name = marketName(market);
  if (forfeitReason) return `${name}${SEP}${FORFEIT_LABEL[forfeitReason] ?? FORFEIT_LABEL.sitOut}${lockedIn > 0 ? `${SEP}${lockedIn} locked in` : ''}`;
  if (left === 0) {
    if (lockedIn === total && total > 0) return `${name} in`;
    if (lockedIn === 0) return `${name}${SEP}No picks`;
    return `${name} ${lockedIn} of ${total} in`;
  }
  return possible < total ? `${name} ${picked} of ${possible} open` : `${name} ${picked} of ${total}`;
}

/**
 * "Skip this week's Guess the Line" (D-36, D-39): allowed until the last kickoff; it forfeits the rest of the week
 * and opens every line. Picks already locked in keep counting.
 */
export function skipDialog({ week, keepsCounting }) {
  const wk = weekName(week);
  return {
    title: `Skip ${wk} ${GAME_NAME}?`,
    body: `Lines show right away. You can't lock in more ${wk} picks after this. It counts as sitting out and breaks your Pick streak.`,
    keep: keepsCounting ? 'Picks you already locked in still count.' : '',
    cancel: 'Keep playing',
    confirm: 'Skip this week',
    toast: `You're sitting out ${wk}. Lines are open.`,
  };
}

/** "See picks now" (D-36, D-39): the same forfeit, reached from a hidden pick. */
export function revealDialog({ week, market, keepsCounting }) {
  const wk = weekName(week);
  return {
    title: 'See picks now?',
    body: `Seeing friends' ${marketName(market)} picks now ends your ${wk} ${GAME_NAME}. It counts as sitting out and breaks your Pick streak.`,
    keep: keepsCounting ? 'Picks you already locked in still count.' : '',
    first: 'Make my picks first',
    confirm: SEE_PICKS_NOW,
    toast: `You're sitting out ${wk}. Picks are open.`,
  };
}
