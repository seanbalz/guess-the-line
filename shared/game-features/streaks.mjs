// The Pick streak and the Bets streak (redesign build plan stages 36 and 68; D-35, D-36). Pure and import-free, so Home's
// "Keep your 4-week streak" (stage 36) and the features job (stage 69) count the same weeks from the same inputs.
//
// Pick streak: weeks in a row you sent both ballots (How to play). D-36: a sit-out breaks it, and Skip and "See picks
// now" are sit-outs. A late send counts (D-30: late picks score normally). A week closes at its last kickoff: until then
// a week that is neither sent nor broken is open, and the streak through last week is still alive.
// Bets streak: Virtual Units bets won in a row; pushes don't count (How to play), and neither do voids or bets not
// settled yet. Bets streaks are separate from the Pick streak (D-36). Challenge results join once they settle (stage 55).
// The Closest streak waits for Sean's answer (catalog QUESTIONS.closest).
import { MARKETS } from './week.mjs';

/**
 * One market of one week for one player, from the ballot facts the server keeps (D-39 per-game lock-in):
 *   'sat_out'  a sit-out, Skip or "See picks now" for that market (D-23, D-36).
 *   'sent'     the market is sent: submitted (a whole-market send stamps submittedAt), or every game on the slate is
 *              locked in or was already closed at kickoff when the player last saved (a late send counts).
 *   'partial'  some guesses locked in, but a game that was still open was left unpicked.
 *   'none'     nothing locked in, or a ballot that is not eligible to score (a practice ballot without a ruling).
 * `gameIds` is the week's slate.
 */
export function marketStatus(ballot, gameIds) {
  if (!ballot) return 'none';
  if (ballot.satOut === true) return 'sat_out';
  if (ballot.eligible === false) return 'none';
  const locked = new Set(ballot.locked ?? []), closed = new Set(ballot.closed ?? []);
  if (ballot.submitted === true) return 'sent';
  if (!locked.size) return 'none';
  return gameIds.every(id => locked.has(id) || closed.has(id)) ? 'sent' : 'partial';
}

/**
 * One week for the Pick streak: 'kept' (both markets sent), 'missed' (a market sat out, or the week closed without
 * both sent) or 'open' (not closed yet, still keepable). `closed` is true from the week's last kickoff.
 */
export function pickWeek({ spread, total, closed }) {
  if (spread === 'sat_out' || total === 'sat_out') return 'missed';
  if (spread === 'sent' && total === 'sent') return 'kept';
  return closed ? 'missed' : 'open';
}

/** A player's week from the normalized week (shared/game-features/week.mjs) at `now` (ms). */
export function pickWeekFor(week, userId, now) {
  const ids = week.games.map(g => g.id);
  const status = Object.fromEntries(MARKETS.map(market => [market, marketStatus(week.ballots.find(b => b.userId === userId && b.market === market), ids)]));
  const last = week.games.length ? Date.parse(week.games[week.games.length - 1].kickoff) : NaN;
  return pickWeek({ ...status, closed: Number.isFinite(last) && now >= last });
}

/**
 * Runs of 'kept' weeks over a season, oldest first: `weeks` is [{ week, status }] for every published week in order.
 * Returns `{ current, best, thisWeek, runs }`:
 * - current: the run that is still alive: it ends at the newest week when that week is kept, or at the week before it
 *   while the newest is open; 0 once a week is missed.
 * - thisWeek: the newest week's status ('kept', 'open', 'missed'), or null with no weeks.
 * - runs: [{ from, to, length }] every run of kept weeks, for milestones such as Never Missed.
 */
export function pickStreak(weeks) {
  const list = Array.isArray(weeks) ? weeks : [];
  const runs = [];
  let run = null;
  for (const w of list) {
    if (w.status === 'kept') {
      if (run) { run.to = w.week; run.length += 1; } else { run = { from: w.week, to: w.week, length: 1 }; runs.push(run); }
    } else if (w.status === 'missed') run = null;
    // An open week (only ever the newest) neither extends nor breaks a run.
  }
  const newest = list.length ? list[list.length - 1] : null;
  return { current: run ? run.length : 0, best: runs.reduce((m, r) => Math.max(m, r.length), 0), thisWeek: newest ? newest.status : null,
    runs: runs.map(r => Object.freeze({ ...r })) };
}

/** The week each run of kept weeks reached `length` (one milestone per run): [{ week, from }]. */
export function pickMilestones(weeks, length) {
  const out = [];
  let run = 0, from = null;
  for (const w of Array.isArray(weeks) ? weeks : []) {
    if (w.status === 'kept') { if (run === 0) from = w.week; run += 1; if (run === length) out.push({ week: w.week, from }); }
    else if (w.status === 'missed') run = 0;
  }
  return out;
}

const DECIDED = new Set(['win', 'loss']);
/** Bets in settlement order: kickoff, then game, then Spread before Total. Each bet carries its game's `kickoff`. */
export function betOrder(bets) {
  return [...bets].sort((a, b) => (Date.parse(a.kickoff) - Date.parse(b.kickoff)) || a.gameId.localeCompare(b.gameId)
    || MARKETS.indexOf(a.market) - MARKETS.indexOf(b.market));
}

/**
 * The Bets streak from one player's bets (any weeks, each with `kickoff`): `{ current, best, milestones(length) }`.
 * Only wins and losses decide it: a win extends the run, a loss ends it; pushes, voids and bets not settled yet are
 * skipped. `milestones(n)` gives the bet that made each run reach n wins (one per run), for Hot Hand.
 */
export function betsStreak(bets) {
  const decided = betOrder((Array.isArray(bets) ? bets : []).filter(b => DECIDED.has(b.status)));
  let run = 0, best = 0;
  const reached = new Map();
  for (const b of decided) {
    if (b.status === 'win') {
      run += 1; best = Math.max(best, run);
      if (!reached.has(run)) reached.set(run, []);
      reached.get(run).push(b);
    } else run = 0;
  }
  return { current: run, best, milestones: length => reached.get(length) ?? [] };
}
