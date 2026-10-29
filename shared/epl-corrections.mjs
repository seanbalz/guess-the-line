import { pacificDate, pacificToUtc } from './nfl-schedule.mjs';

/** Tuesday noon Pacific after the round's last match, at least an hour after the original final capture. */
export function eplRecheckDueAt({ lastKickoff, originalCapturedAt } = {}) {
  const last = Date.parse(lastKickoff), original = Date.parse(originalCapturedAt);
  if (!Number.isFinite(last) || !Number.isFinite(original)) return null;
  const finished = last + 150 * 60_000;
  const { date, weekday } = pacificDate(finished);
  let days = (2 - weekday + 7) % 7;
  const noon = Date.parse(pacificToUtc(date, '12:00'));
  if (days === 0 && finished >= noon) days = 7;
  const tuesday = new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  return Math.max(Date.parse(pacificToUtc(tuesday, '12:00')), original + 60 * 60_000);
}
