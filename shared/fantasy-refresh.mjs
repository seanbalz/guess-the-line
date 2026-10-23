// The scheduled Fantasy refresh's pure planner (D-57). A week's snapshot is rebuilt each morning until its weekend slate
// starts, then frozen, so the review grades exactly what players saw. Week 1 has no pace estimate and is never built.
import { completedWeeks } from './fantasy-build.mjs';
import { easternToUtc, pacificDate } from './nfl-schedule.mjs';

const DAY = 86_400_000;
export const fantasySeason = now => { const date = new Date(now); return date.getUTCMonth() >= 2 ? date.getUTCFullYear() : date.getUTCFullYear() - 1; };
const kickoffs = (schedule, season, week) => schedule
  .filter(row => Number(row.season) === season && row.game_type === 'REG' && Number(row.week) === week)
  .map(row => Date.parse(easternToUtc(row.gameday, row.gametime))).filter(Number.isFinite).sort((a, b) => a - b);

/** The first kickoff whose Pacific date is that week's Saturday or Sunday; the last kickoff if there is none. */
export function freezeTime(schedule, season, week) {
  const times = kickoffs(schedule, season, week);
  return times.find(time => [6, 7].includes(pacificDate(time).weekday)) ?? times.at(-1) ?? null;
}

export function planFantasyRefresh({ season, schedule, stats, index, committedWeeks = [], now }) {
  const done = completedWeeks({ season, schedule, stats });
  let completed = 0;
  while (done.has(completed + 1)) completed++;
  const target = completed + 1 <= 18 ? completed + 1 : null;
  const snapshots = new Set((index?.snapshots ?? []).map(entry => entry.week));
  const reviews = new Map((index?.reviews ?? []).map(entry => [entry.week, entry]));
  let snapshot = null;
  if (target && target >= 2) {
    const freezeAt = freezeTime(schedule, season, target), last = kickoffs(schedule, season, target).at(-1);
    const build = now < freezeAt || (!snapshots.has(target) && now < last);
    snapshot = { week: target, build, late: build && now >= freezeAt, freezeAt };
  }
  let review = null;
  if (completed >= 2) {
    const freezeAt = target ? freezeTime(schedule, season, target) : kickoffs(schedule, season, completed).at(-1) + 4 * DAY;
    const source = snapshots.has(completed) ? 'release' : committedWeeks.includes(completed) ? 'committed' : null;
    review = { week: completed, source, final: freezeAt !== null && now >= freezeAt, build: source !== null && reviews.get(completed)?.status !== 'FINAL', freezeAt };
  }
  // Reviews of earlier weeks that a missed run left PROVISIONAL: finalize each once its own freeze has passed.
  const finalize = [];
  for (let week = 2; week < completed; week++) {
    if (reviews.get(week)?.status !== 'PROVISIONAL' || !snapshots.has(week)) continue;
    const freezeAt = week + 1 <= 18 ? freezeTime(schedule, season, week + 1) : kickoffs(schedule, season, week).at(-1) + 4 * DAY;
    if (freezeAt !== null && Number.isFinite(freezeAt) && freezeAt <= now) finalize.push({ week, source: 'release', freezeAt });
  }
  return { season, completed, snapshot, review, finalize };
}
