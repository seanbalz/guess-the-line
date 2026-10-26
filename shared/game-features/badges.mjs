// Badge rules (redesign build plan stage 68; D-35; the approved prototype's catalog, shared/game-features/catalog.mjs).
// Pure and import-free beyond this folder: it reads normalized weeks (shared/game-features/week.mjs) and returns badge
// events; the features job (stage 69) records them. A badge never changes a score, a rank or a result.
//
// Every event is `{ badge, userId, key, season, week, visibleAt, facts }`:
// - key: one per earn, stable across reruns (the badge, the player, the week and the game or market it is about), so
//   the job's writer is idempotent and a correction that undoes an earn can name it.
// - visibleAt: when the earn may be shown to anyone. A Guess the Line badge names a line, so it waits for that game's
//   kickoff, when every line and guess for it is open (D-31, D-39); week badges wait for the week's last kickoff. The
//   job records an event only once visibleAt has passed, so nothing is written early.
// - facts: what the badge detail prints (the game, the market, the numbers). Never another game's hidden line.
//
// Sharp and Called the Move compare with the kickoff line (gtl_kickoff_line: the newest qualifying line in the 12 hours
// before kickoff). A game without one is skipped, never guessed. Only Virtual Units bets count; real slips never reach
// this module (D-36), and challenge badges wait for stage 55 (catalog status 'waits').
import { THRESHOLDS } from './catalog.mjs';
import { MARKETS, beatKickoffBy, coverMargin, finite, lastKickoff, movedToward } from './week.mjs';
import { betsStreak, pickMilestones, pickWeekFor } from './streaks.mjs';

const keyOf = (badge, userId, season, week, ...parts) => [badge, userId, season, week, ...parts].join(':');
function event(badge, userId, week, parts, visibleAt, facts) {
  return { badge, userId, key: keyOf(badge, userId, week.season, week.week, ...parts), season: week.season, week: week.week, visibleAt, facts };
}
const kickoffOf = week => new Map(week.games.map(g => [g.id, g.kickoff]));
const exact = g => g.points === THRESHOLDS.exactPoints;

/** Bullseye: an exact guess, 10 points against its own scoring line. One per game and market. */
export function bullseyes(week) {
  const kickoff = kickoffOf(week);
  return week.guesses.filter(exact).map(g => event('bullseye', g.userId, week, [g.gameId, g.market], kickoff.get(g.gameId),
    { gameId: g.gameId, market: g.market, guess: g.guess, points: g.points }));
}

/** Double Bullseye: a Bullseye on both the Spread and the Total of one game. */
export function doubleBullseyes(week) {
  const kickoff = kickoffOf(week), out = [];
  const exacts = week.guesses.filter(exact);
  for (const s of exacts.filter(g => g.market === 'spread')) {
    const t = exacts.find(g => g.market === 'total' && g.userId === s.userId && g.gameId === s.gameId);
    if (t) out.push(event('double_bullseye', s.userId, week, [s.gameId], kickoff.get(s.gameId), { gameId: s.gameId, spread: s.guess, total: t.guess }));
  }
  return out;
}

/**
 * Called the Move: between the guess's own scoring line (the line at the guess, D-27) and the kickoff line, the line
 * moved 1+ point the way of the guess. No kickoff line, or a guess still without a scoring line: skipped.
 */
export function calledTheMove(week) {
  const kickoff = kickoffOf(week), out = [];
  for (const g of week.guesses) {
    const close = week.kickoff[g.gameId]?.[g.market] ?? null, moved = movedToward(g, close);
    if (moved !== null && moved >= THRESHOLDS.calledTheMove) {
      out.push(event('called_the_move', g.userId, week, [g.gameId, g.market], kickoff.get(g.gameId),
        { gameId: g.gameId, market: g.market, guess: g.guess, from: g.reference, to: close, moved }));
    }
  }
  return out;
}

/**
 * Dialed In: 80%+ of a full week's points in one market, where a full week is 10 points for every game on the slate
 * (a game left unpicked counts its 10 in the full week). Decided at the week's last kickoff, when every guess has
 * locked and every pending line has resolved or lapsed.
 */
export function dialedIn(week) {
  const out = [], full = THRESHOLDS.exactPoints * week.games.length, at = lastKickoff(week);
  if (!full) return out;
  const users = [...new Set(week.guesses.map(g => g.userId))].sort();
  for (const userId of users) for (const market of MARKETS) {
    const points = week.guesses.filter(g => g.userId === userId && g.market === market && finite(g.points)).reduce((sum, g) => sum + g.points, 0);
    if (points >= THRESHOLDS.dialedIn * full) out.push(event('dialed_in', userId, week, [market], at, { market, points: Math.round(points * 100) / 100, full }));
  }
  return out;
}

/** Sharp: a bet line 1+ point better than the kickoff line for its side. Voided bets and games without a kickoff line are skipped. */
export function sharps(week) {
  const kickoff = kickoffOf(week), out = [];
  for (const b of week.bets) {
    if (b.status === 'void') continue;
    const close = week.kickoff[b.gameId]?.[b.market] ?? null, by = beatKickoffBy(b, close);
    if (by !== null && by >= THRESHOLDS.sharp) {
      out.push(event('sharp', b.userId, week, [b.gameId, b.market], kickoff.get(b.gameId),
        { gameId: b.gameId, market: b.market, side: b.side, line: b.line, kickoff: close, by }));
    }
  }
  return out;
}

/** Dog Day: a winning spread bet taking 7+ points whose team also won outright. */
export function dogDays(week) {
  const games = new Map(week.games.map(g => [g.id, g])), out = [];
  for (const b of week.bets) {
    if (b.market !== 'spread' || b.status !== 'win' || b.line < THRESHOLDS.dogDay) continue;
    const g = games.get(b.gameId), margin = coverMargin({ ...b, line: 0 }, g.result);
    if (margin !== null && margin > 0) out.push(event('dog_day', b.userId, week, [b.gameId], g.kickoff, { gameId: b.gameId, side: b.side, line: b.line }));
  }
  return out;
}

/** Perfect Week: 4+ wins and no losses in a week, once every one of the player's bets that week has settled. */
export function perfectWeeks(week) {
  const kickoff = kickoffOf(week), out = [];
  for (const userId of [...new Set(week.bets.map(b => b.userId))].sort()) {
    const mine = week.bets.filter(b => b.userId === userId);
    if (mine.some(b => b.status === 'pending')) continue;
    const wins = mine.filter(b => b.status === 'win').length, losses = mine.filter(b => b.status === 'loss').length;
    if (wins >= THRESHOLDS.perfectWeek && losses === 0) {
      const at = mine.map(b => kickoff.get(b.gameId)).sort().at(-1);
      out.push(event('perfect_week', userId, week, [], at, { wins, pushes: mine.filter(b => b.status === 'push').length }));
    }
  }
  return out;
}

/** Every one-week badge for a normalized week. */
export function weekBadges(week) {
  return [...bullseyes(week), ...doubleBullseyes(week), ...calledTheMove(week), ...dialedIn(week), ...sharps(week), ...dogDays(week), ...perfectWeeks(week)];
}

/**
 * Badges that span weeks, from a season's normalized weeks in order (oldest first) at `now` (ms):
 * - Never Missed: a Pick streak reaching 10 weeks, keyed to the week it got there, shown from that week's last kickoff.
 * - Hot Hand: a Bets streak reaching 5 wins, keyed to the bet that made it 5, shown from that game's kickoff.
 * Each run earns a milestone once; a later run that gets there again earns it again.
 */
export function seasonBadges(weeks, now) {
  const out = [], list = Array.isArray(weeks) ? weeks : [];
  const users = new Set(list.flatMap(w => [...w.ballots.map(b => b.userId), ...w.bets.map(b => b.userId)]));
  for (const userId of [...users].sort()) {
    const statuses = list.map(w => ({ week: w.week, status: pickWeekFor(w, userId, now) }));
    for (const m of pickMilestones(statuses, THRESHOLDS.neverMissed)) {
      const w = list.find(x => x.week === m.week);
      out.push(event('never_missed', userId, w, [], lastKickoff(w), { from: m.from, to: m.week, weeks: THRESHOLDS.neverMissed }));
    }
    const bets = list.flatMap(w => w.bets.filter(b => b.userId === userId).map(b => ({ ...b, week: w.week, kickoff: w.games.find(g => g.id === b.gameId).kickoff })));
    for (const b of betsStreak(bets).milestones(THRESHOLDS.hotHand)) {
      const w = list.find(x => x.week === b.week);
      out.push(event('hot_hand', userId, w, [b.gameId, b.market], b.kickoff, { wins: THRESHOLDS.hotHand, gameId: b.gameId, market: b.market }));
    }
  }
  return out;
}

/** Every badge a season's weeks earn so far, one-week badges first, in a stable order. */
export function seasonAllBadges(weeks, now) {
  return [...(Array.isArray(weeks) ? weeks : []).flatMap(weekBadges), ...seasonBadges(weeks, now)];
}
