// The new app's read-only Home as plain data (redesign build plan stage 12; prototype spec 1.2; inventory rows 23,
// 24, 26, 86 and 119): the hero (this week's countdown, one status line per market and exactly one next action)
// and the tiles (who's in, the Spread and Total rank tiles and the chase line). Pure: no React, storage, network or
// clock of its own. It reads the normalized /community/read reply, which carries the server's own `picksDue`
// judgement (cloud/community.mjs `picksDue`: not_open, due, urgent, closed, done or none, with the clock it was
// judged against), so the hero follows the server's state and never decides from the device clock (build plan 3.4).
// The lime action opens the old app's Picks until stage 29; "See Lines" is the quiet action everywhere else.
import { MODES, MODE_LABEL, chaseLine, rankTile, whosIn } from './guess-board.mjs';

export const HOME_STATES = Object.freeze(['none', 'not_open', 'due', 'urgent', 'closed', 'done']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const labelOf = mode => MODE_LABEL[mode] ?? String(mode);

/** The words Home shows. Typographic apostrophes, sentence case, "PT" on the one time (prototype contract section 15). */
export const HOME_COPY = Object.freeze({
  title: 'Home',
  weekTitle: week => `Week ${week}`,
  picksDueIn: 'Picks lock in',
  notOpen: 'Picks open Monday 12:00 AM PT',
  closed: 'Picks are locked for this week',
  done: 'You’re in for this week',
  noWeek: 'No week is open yet',
  makePicks: 'Make picks',
  seeLines: 'See Lines',
  whosIn: 'Who’s in',
  spreadRank: 'Spread rank',
  totalRank: 'Total rank',
  noBallot: 'No ballot yet',
  notScored: 'Not scored yet',
  // Each status line takes the market's label ("Spread"); a mode id ("guess_spread") reads as its label too.
  statusDraft: (filled, games, mode) => `${labelOf(mode)} ${filled} of ${games} picked`,
  statusSent: mode => `${labelOf(mode)} sent`,
  statusSatOut: mode => `${labelOf(mode)} sat out`,
});

/** The server's clock for this reply as a number (ms), else the caller's `now`; null when neither is readable. */
function clockOf(picksDue, now) {
  const server = typeof picksDue?.now === 'string' ? Date.parse(picksDue.now) : NaN;
  if (Number.isFinite(server)) return server;
  return typeof now === 'number' && Number.isFinite(now) ? now : null;
}

/**
 * The hero: `{ state, week, deadline, opensAt, countdownTarget, statusLines, action, now }`. The state is the
 * server's `picksDue.state` ('none' when missing); a value this file does not know reads as 'closed' while a week
 * exists, so an unknown state can never offer picks (the old PicksDue card does the same). The countdown runs to
 * the deadline while picks are due or urgent and to the open time before the week opens; otherwise there is none.
 * One status line per market from `due` (sent, sat out, or "0 of 14 picked" with nothing filled); none without a
 * week. Exactly one action, always: the lime "Make picks" only while picks are due or urgent, else "See Lines".
 */
export function homeHero({ community = null, now = null } = {}) {
  const picksDue = record(community?.picksDue) ? community.picksDue : null;
  const week = record(community?.week) ? community.week : null;
  const weekNumber = Number.isInteger(picksDue?.week) ? picksDue.week : Number.isInteger(week?.week) ? week.week : null;
  const raw = typeof picksDue?.state === 'string' ? picksDue.state : 'none';
  const state = HOME_STATES.includes(raw) ? raw : weekNumber === null ? 'none' : 'closed';
  const deadline = typeof picksDue?.deadline === 'string' ? picksDue.deadline : typeof week?.deadline === 'string' ? week.deadline : null;
  const opensAt = typeof picksDue?.opensAt === 'string' ? picksDue.opensAt : null;
  const countdownTarget = state === 'due' || state === 'urgent' ? deadline : state === 'not_open' ? opensAt : null;
  // The feed's week carries its games as a list; a due row carries the count the status line needs, this is the fallback.
  const games = Array.isArray(week?.games) ? week.games.length : Number(week?.games) || 0;
  const due = Array.isArray(community?.due) ? community.due : [];
  const statusLines = weekNumber === null ? [] : MODES.map(mode => {
    const row = due.find(d => d?.mode === mode) ?? null;
    const label = MODE_LABEL[mode];
    if (row?.submitted === true) return HOME_COPY.statusSent(label);
    if (row?.satOut === true) return HOME_COPY.statusSatOut(label);
    return HOME_COPY.statusDraft(Number(row?.filled) || 0, Number(row?.games) || games, label);
  });
  const action = state === 'due' || state === 'urgent'
    ? { kind: 'picks', label: HOME_COPY.makePicks, primary: true }
    : { kind: 'lines', label: HOME_COPY.seeLines, primary: false };
  return { state, week: weekNumber, deadline, opensAt, countdownTarget, statusLines, action, now: clockOf(picksDue, now) };
}

/**
 * The tiles under the hero: who's in (the Spread ballot, the one every member is asked for first), the Spread and
 * Total rank tiles (ranked apart, never summed) and the Spread chase line. `viewer` defaults to the reply's viewer.
 */
export function homeTiles({ community = null, viewer = null } = {}) {
  const members = Array.isArray(community?.members) ? community.members : [];
  const submissions = Array.isArray(community?.submissions) ? community.submissions : [];
  const standings = Array.isArray(community?.standings) ? community.standings : [];
  const me = viewer ?? community?.viewer ?? null;
  const names = Object.fromEntries(members.map(m => [String(m.id), String(m.displayName ?? m.name ?? m.id)]));
  return {
    whosIn: whosIn({ members, submissions, viewer: me, mode: 'guess_spread' }),
    spread: rankTile({ standings, viewer: me, mode: 'guess_spread' }),
    total: rankTile({ standings, viewer: me, mode: 'guess_total' }),
    chase: chaseLine({ standings, viewer: me, mode: 'guess_spread', names }),
  };
}
