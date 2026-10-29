import { pacificDate, pacificToUtc } from './nfl-schedule.mjs';

/** Eligibility only: ordinary rounds target Monday; midweek need not wait. Results/source interval are separate gates. */
export function eplFinalCaptureDueAt(week, fixtures = []) {
  const windowEnd = Date.parse(week?.windowEnd);
  if (!Number.isFinite(windowEnd)) return null;
  const scheduled = fixtures.filter(f => f.status !== 'postponed');
  if (!fixtures.length) return null;
  if (!scheduled.length) return Number.isFinite(Date.parse(week?.firstKickoff)) ? Date.parse(week.firstKickoff) + 150 * 60_000 : null;
  const times = scheduled.map(f => Date.parse(f.commenceTime));
  if (times.some(time => !Number.isFinite(time))) return null;
  times.sort((a, b) => a - b);
  const first = pacificDate(times[0]), last = pacificDate(times.at(-1));
  const ordinary = times.at(-1) - times[0] <= 4 * 86_400_000
    && ([5, 6, 7].includes(first.weekday) || (first.weekday === 1 && first.date === last.date))
    && times.every(time => [1, 5, 6, 7].includes(pacificDate(time).weekday));
  const earliestFinish = times.at(-1) + 150 * 60_000;
  if (!ordinary) return earliestFinish; // D-68 item24: a midweek round finalizes once results + Sleeper rollover are verified.
  const days = (1 - last.weekday + 7) % 7;
  const monday = new Date(Date.parse(`${last.date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  return Math.max(Date.parse(pacificToUtc(monday, '00:00')), earliestFinish);
}

/** A final capture needs every expected owner's actual season totals; missing points are not zero. */
export function completeEplTotals(payload, owners) {
  const rows = payload?.rosters;
  if (!Array.isArray(rows) || !Array.isArray(owners) || !owners.length || new Set(owners).size !== owners.length || rows.length !== owners.length) return false;
  const ids = rows.map(row => row?.owner_id);
  if (new Set(ids).size !== owners.length || ids.some(id => !owners.includes(id))) return false;
  return rows.every(row => ['fpts', 'fpts_against'].every(key => typeof row.settings?.[key] === 'number' && Number.isFinite(row.settings[key]))
    && ['fpts_decimal', 'fpts_against_decimal'].every(key => row.settings?.[key] == null || (typeof row.settings[key] === 'number' && Number.isFinite(row.settings[key])))
    && [['fpts', 'fpts_decimal'], ['fpts_against', 'fpts_against_decimal']].every(([whole, decimal]) => Number.isSafeInteger(Math.round((row.settings[whole] + (row.settings[decimal] ?? 0) / 100) * 100))));
}

export const verifiedEplResults = fixtures => Array.isArray(fixtures) && fixtures.length > 0 && fixtures.every(f => f.status === 'postponed'
  || (f.status === 'final' && Number.isInteger(f.homeGoals) && f.homeGoals >= 0 && Number.isInteger(f.awayGoals) && f.awayGoals >= 0));

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
