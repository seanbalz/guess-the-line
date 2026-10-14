// The open fixture week's deadline, shared by the cloud browser specs. D-24: a week opens Monday 00:00 PT, so an open fixture
// week must be the current Pacific week. The deadline is 11:59 PM PT today, or 11:59 PM PT tomorrow when fewer than three hours
// are left today, so a run late in the evening never sees the picks-due card turn urgent (inside two hours) or the deadline pass
// mid-test. Sunday has no later day in its week, so a run after 8:59 PM PT on a Sunday still gets that night's deadline.
// test-clock.mjs (GTL_TEST_NOW) runs a spec at a chosen time of day to check both cases.
import { pacificDate, pacificToUtc } from '../../shared/nfl-schedule.mjs';

const DAY = 86_400_000;
const MARGIN = 3 * 3_600_000;

export function openDeadline(now = Date.now()) {
  const today = pacificDate(now);
  const tonight = pacificToUtc(today.date, '23:59');
  if (Date.parse(tonight) - now > MARGIN || today.weekday === 7) return tonight;
  return pacificToUtc(pacificDate(now + DAY).date, '23:59');
}

/** The old app's relative due day for a deadline ("today", "tomorrow", "in 3 days"), as CommunityHome's dueIn words it. */
export function dueDay(deadline, now = Date.now()) {
  const days = Math.round((Date.parse(pacificDate(deadline).date) - Date.parse(pacificDate(now).date)) / DAY);
  return days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
}
