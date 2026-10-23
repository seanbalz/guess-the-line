// Guess the Points scoring (D-56; docs/superpowers/specs/2026-10-22-guess-the-points-design.md sections 3.5–3.7).
// Pure functions shared by the server, tests and later the app. The P-01 SQL functions
// (gtl_points_slot_points, gtl_points_slot_outcomes, gtl_points_week_scores) follow the same rules.
// Every score is exact to the tenth: values are handled as whole tenths, never as binary fractions.
import { pacificDate, pacificToUtc } from './nfl-schedule.mjs';

export const POINTS_SLOTS = Object.freeze(['QB', 'RB', 'WR', 'TE', 'FLEX']);
export const GUESS_MIN = 0;
export const GUESS_MAX = 60;
export const SLOT_MAX = 10;
export const PROVISIONAL = 'PROVISIONAL';
export const FINAL = 'FINAL';

/** A guess is a whole number of fantasy points from 0 to 60 (spec 3.3). */
export const isValidGuess = guess => Number.isInteger(guess) && guess >= GUESS_MIN && guess <= GUESS_MAX;

/** Whole tenths of a value, rounded half away from zero (as Postgres round(numeric, 1) does). */
export function toTenths(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('A finite number is required.');
  const tenths = Math.round(Math.abs(value) * 10 + 1e-9);
  return value < 0 ? -tenths : tenths;
}

/** A value rounded to one decimal (actual fantasy points are rounded before scoring, spec default 2). */
export const roundTenth = value => toTenths(value) / 10;

/** Slot points: max(0, 10 − |guess − actual|), to the tenth. A guess of 18 against 14.6 earns 6.6; exact earns 10. */
export function slotPoints(guess, actual) {
  const off = Math.abs(toTenths(guess) - toTenths(actual));
  return Math.max(0, SLOT_MAX * 10 - off) / 10;
}

/** Fantasy points off for a guess, to the tenth (context on tap; never a tiebreaker). */
export const pointsOff = (guess, actual) => Math.abs(toTenths(guess) - toTenths(actual)) / 10;

/**
 * One slot's outcome at `now` (spec 3.5, 3.6, 7):
 *   open     the game has not kicked off
 *   pending  kicked off, but no actual yet, the played flag is unknown, or the pinned rules version has no points
 *   void     the player recorded no snap, played for another team, or the game left the week (played false)
 *   scored   the actual under the slate's pinned rules version, rounded to the tenth
 * `actual` is the gtl_points_actuals row for the slot's player: { team, played: true | false | null, playedBasis, points: { [rulesVersion]: n } }.
 */
export function slotOutcome(slot, actual, { now, rulesVersion }) {
  const kickoff = Date.parse(slot.kickoff), at = typeof now === 'number' ? now : Date.parse(now);
  if (!Number.isFinite(kickoff) || !Number.isFinite(at)) throw new TypeError('Kickoff and now must be times.');
  if (at < kickoff) return { slot: slot.slot, state: 'open', actual: null, voidReason: null };
  if (!actual) return { slot: slot.slot, state: 'pending', actual: null, voidReason: null };
  if (actual.played === false) return { slot: slot.slot, state: 'void', actual: null, voidReason: actual.playedBasis || 'inactive' };
  if (actual.team !== slot.team) return { slot: slot.slot, state: 'void', actual: null, voidReason: 'team_change' };
  const points = actual.points?.[rulesVersion];
  if (actual.played !== true || typeof points !== 'number' || !Number.isFinite(points)) return { slot: slot.slot, state: 'pending', actual: null, voidReason: null };
  return { slot: slot.slot, state: 'scored', actual: roundTenth(points), voidReason: null };
}

/** The week's maximum: 10 per slot, minus 10 per void slot (spec 3.5). */
export const weekMaximum = outcomes => SLOT_MAX * outcomes.filter(o => o.state !== 'void').length;

/**
 * Scores one week. `slate` is { slots: [{ slot, playerId, team, kickoff }], rulesVersion, house: { [slot]: estimate } };
 * `actuals` maps a player ID to its actuals row; `guesses` is [{ userId, slot, guess, lockedAt }] (drafts have no lockedAt).
 * `final`, when the week is FINAL, is the frozen result and is returned unchanged: a later correction changes nothing.
 *
 * Only locked-in guesses score; an unlocked slot reads null ("—"), never 0. A member is on the week only after a lock-in.
 * A member's week points are null until at least one slot is scored. The House scores its estimates the same way and
 * its week counts only when it has an estimate for every non-void slot.
 */
export function scoreWeek({ slate, actuals = {}, guesses = [], now, final = null }) {
  if (final) return { ...final, status: FINAL };
  const lookup = id => (actuals instanceof Map ? actuals.get(id) : actuals[id]) ?? null;
  const outcomes = slate.slots.map(slot => slotOutcome(slot, lookup(slot.playerId), { now, rulesVersion: slate.rulesVersion }));
  const byslot = new Map(outcomes.map(o => [o.slot, o]));
  const scored = outcomes.filter(o => o.state === 'scored');
  const players = new Map();
  for (const g of guesses) {
    if (!g.lockedAt) continue;
    if (!players.has(g.userId)) players.set(g.userId, new Map());
    players.get(g.userId).set(g.slot, g.guess);
  }
  const members = [...players].map(([userId, picks]) => {
    const slots = Object.fromEntries(POINTS_SLOTS.map(slot => {
      const outcome = byslot.get(slot), guess = picks.get(slot);
      return [slot, outcome?.state === 'scored' && guess !== undefined ? slotPoints(guess, outcome.actual) : null];
    }));
    const earned = Object.values(slots).filter(v => v !== null);
    const tenths = earned.reduce((sum, v) => sum + toTenths(v), 0);
    return {
      userId, played: true, slots,
      points: scored.length ? tenths / 10 : null,
      exact: POINTS_SLOTS.filter(slot => slots[slot] === SLOT_MAX).length,
      off: scored.length ? scored.filter(o => picks.has(o.slot)).reduce((sum, o) => sum + toTenths(pointsOff(picks.get(o.slot), o.actual)), 0) / 10 : null,
    };
  }).sort((a, b) => a.userId.localeCompare(b.userId));
  const estimate = slot => slate.house?.[slot];
  const complete = outcomes.every(o => o.state === 'void' || (typeof estimate(o.slot) === 'number' && Number.isFinite(estimate(o.slot))));
  const houseSlots = Object.fromEntries(outcomes.map(o => [o.slot, o.state === 'scored' && typeof estimate(o.slot) === 'number' ? slotPoints(estimate(o.slot), o.actual) : null]));
  const houseTenths = Object.values(houseSlots).filter(v => v !== null).reduce((sum, v) => sum + toTenths(v), 0);
  return {
    status: scored.length ? PROVISIONAL : null,
    maximum: weekMaximum(outcomes),
    slots: outcomes,
    members,
    house: { complete, slots: houseSlots, points: complete && scored.length ? houseTenths / 10 : null },
  };
}

/** The frozen form of a scored week (gtl_points_week_final). Freezing needs every slot settled (see canFinalize). */
export function freezeWeek(scored) {
  return structuredClone({ ...scored, status: FINAL });
}

/**
 * FINAL time: the following Thursday at 12:00 PM America/Los_Angeles, i.e. the Thursday after the week's own
 * Thursday (spec 3.5). From a Tuesday 12:00 PM PT open that is nine days later, across a DST change in local time.
 */
export function finalizeAt(opensAt) {
  const { date, weekday } = pacificDate(Date.parse(opensAt));
  const ahead = ((4 - weekday + 7) % 7 || 7) + 7;
  const day = new Date(Date.parse(`${date}T12:00:00Z`) + ahead * 86_400_000).toISOString().slice(0, 10);
  return pacificToUtc(day, '12:00');
}

/** A week goes FINAL at its FINAL time only once no slot is open or pending (spec default 5). */
export function canFinalize({ finalizeAt: at, outcomes, now }) {
  const time = typeof now === 'number' ? now : Date.parse(now);
  if (time < Date.parse(at)) return { ready: false, reason: 'not_yet' };
  if (outcomes.some(o => o.state === 'open' || o.state === 'pending')) return { ready: false, reason: 'pending_stats' };
  return { ready: true, reason: null };
}

/**
 * Standard competition ranks with shared ties (D-36): 1, T-2, T-2, 4. Rows whose value is null ("—") take no rank and
 * sort last. Returns new rows with `rank`, `tied` and `rankLabel`.
 */
export function rankRows(rows, key = 'points') {
  const ranked = rows.filter(r => r[key] !== null && r[key] !== undefined).sort((a, b) => b[key] - a[key] || String(a.userId).localeCompare(String(b.userId)));
  const out = ranked.map(r => {
    const rank = 1 + ranked.filter(x => x[key] > r[key]).length;
    const tied = ranked.filter(x => x[key] === r[key]).length > 1;
    return { ...r, rank, tied, rankLabel: `${tied ? 'T-' : ''}${rank}` };
  });
  const unranked = rows.filter(r => r[key] === null || r[key] === undefined).map(r => ({ ...r, rank: null, tied: false, rankLabel: '—' }));
  return [...out, ...unranked];
}

/** A week's standings: members who played, ranked by week points. The House is never in it. */
export const weekStandings = scored => rankRows(scored.members.map(({ userId, points, exact, off }) => ({ userId, points, exact, off })));

/** Weekly winners are declared from FINAL weeks only (spec default 7). Every member sharing rank 1 wins. */
export function weekWinners(scored) {
  if (scored.status !== FINAL) return [];
  return weekStandings(scored).filter(r => r.rank === 1).map(r => r.userId);
}

/** Beat the House: the member's week total exceeded a complete House week. */
export function beatHouse(scored, userId) {
  const member = scored.members.find(m => m.userId === userId);
  return !!member && member.points !== null && scored.house.complete && scored.house.points !== null && member.points > scored.house.points;
}

/**
 * Season standings over scored weeks: the sum of every played week (weeks not played read "—" and add nothing),
 * PROVISIONAL weeks labelled, weeks played, points per played week, and the beat-the-House count. A member appears
 * from their first lock-in of the season. Ties share the rank.
 */
export function seasonStandings(weeks) {
  const table = new Map();
  for (const week of weeks) {
    for (const member of week.members) {
      if (!member.played) continue;
      const row = table.get(member.userId) ?? { userId: member.userId, tenths: 0, scoredWeeks: 0, weeksPlayed: 0, provisionalWeeks: 0, beatHouse: 0 };
      row.weeksPlayed += 1;
      if (member.points !== null) {
        row.tenths += toTenths(member.points); row.scoredWeeks += 1;
        if (week.status === PROVISIONAL) row.provisionalWeeks += 1;
      }
      if (beatHouse(week, member.userId)) row.beatHouse += 1;
      table.set(member.userId, row);
    }
  }
  return rankRows([...table.values()].map(({ tenths, scoredWeeks, ...row }) => ({
    ...row,
    points: scoredWeeks ? tenths / 10 : null,
    perWeek: scoredWeeks ? Math.round(tenths / scoredWeeks) / 10 : null,
    provisional: row.provisionalWeeks > 0,
  })));
}
