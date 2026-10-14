import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pacificToUtc } from '../shared/nfl-schedule.mjs';
import * as F from '../web/src/next/format.js';

// Redesign build plan, stage 7: the new app's formatters. Pacific time through Intl (never a fixed offset), a real
// minus sign, "—" for anything missing, "U" for Virtual Units, and the D-30 Late marker. Expected strings are the
// prototype contract's examples (section 6). Fixture times only: no player, pick or line.
const pt = (date, time) => pacificToUtc(date, time); // an ISO instant from a Pacific wall clock, converted independently
const NOW = pt('2026-10-13', '13:03'); // the prototype's default moment, Tue Oct 13 1:03 PM PT
const DEADLINE = pt('2026-10-15', '17:15'); // Thu Oct 15 5:15 PM PT, Fri 00:15 UTC
const MINUS = '−';
const HYPHEN_MINUS = '-';

test('contract examples: Pacific time with "PT" on every clock time', () => {
  assert.equal(NOW, '2026-10-13T20:03:00.000Z', 'PDT is UTC−7 in October');
  assert.equal(F.fmtTime(NOW), '1:03 PM');
  assert.equal(F.fmtDay(NOW), 'Tue');
  assert.equal(F.fmtDate(NOW), 'Tue Oct 13');
  assert.equal(F.fmtMonthDay(NOW), 'Oct 13');
  assert.equal(F.fmtWhen(NOW), 'Tue 1:03 PM PT');
  assert.equal(F.fmtFull(NOW), 'Tue Oct 13, 1:03 PM PT');
  // The deadline is Friday in UTC and Thursday in Pacific time.
  assert.equal(new Date(DEADLINE).getUTCDay(), 5);
  assert.equal(F.fmtWhen(DEADLINE), 'Thu 5:15 PM PT');
  assert.equal(F.fmtFull(DEADLINE), 'Thu Oct 15, 5:15 PM PT');
  // Noon and midnight.
  assert.equal(F.fmtTime(pt('2026-10-14', '12:00')), '12:00 PM');
  assert.equal(F.fmtTime(pt('2026-10-19', '00:00')), '12:00 AM');
  assert.equal(F.fmtWhen(pt('2026-10-19', '00:00')), 'Mon 12:00 AM PT');
  // Numbers, Dates and ISO strings all work.
  for (const value of [NOW, Date.parse(NOW), new Date(NOW)]) assert.equal(F.fmtFull(value), 'Tue Oct 13, 1:03 PM PT');
  assert.deepEqual(F.pacificParts(NOW), { year: 2026, month: 10, day: 13, weekday: 2, hour: 13, minute: 3, second: 0 });
});

test('Nov 1: daylight time ends at 2:00 AM PDT and the formatters follow Intl, not a fixed offset', () => {
  // Sun Nov 1, 2026 10:00 AM PST is 18:00 UTC. A fixed UTC−7 would print 11:00 AM.
  const sunday = pt('2026-11-01', '10:00');
  assert.equal(sunday, '2026-11-01T18:00:00.000Z');
  assert.equal(F.fmtFull(sunday), 'Sun Nov 1, 10:00 AM PT');
  assert.equal(F.fmtFull('2026-11-01T18:00:00Z'), 'Sun Nov 1, 10:00 AM PT');
  // Sat Oct 31 5:15 PM PDT is already Nov 1 in UTC.
  assert.equal(F.fmtFull('2026-11-01T00:15:00Z'), 'Sat Oct 31, 5:15 PM PT');
  // 1:30 AM happens twice: once in PDT, once in PST.
  assert.equal(F.fmtTime('2026-11-01T08:30:00Z'), '1:30 AM');
  assert.equal(F.fmtTime('2026-11-01T09:30:00Z'), '1:30 AM');
  // The next Monday's week open, 12:00 AM PST.
  assert.equal(F.fmtFull('2026-11-02T08:00:00Z'), 'Mon Nov 2, 12:00 AM PT');
  // A countdown is elapsed time: Sat noon PDT to Sun 10:00 AM PST is 23 hours, not 22.
  assert.equal(F.fmtLeft(sunday, pt('2026-10-31', '12:00')), '23h 0m');
  // The same Pacific day across the change still reads as a time in the feed.
  assert.equal(F.fmtPostTime('2026-11-01T07:30:00Z', pt('2026-11-01', '23:00')), '12:30 AM');
  // And it springs forward on Sun Mar 14, 2027.
  assert.equal(F.fmtFull('2027-03-14T10:30:00Z'), 'Sun Mar 14, 3:30 AM PT');
});

test('the output does not depend on the machine time zone', () => {
  const before = process.env.TZ;
  const sample = () => [NOW, DEADLINE, '2026-11-01T09:30:00Z'].map(t => [F.fmtFull(t), F.fmtPostTime(t, NOW), F.fmtLeft(DEADLINE, t)].join('|')).join('\n');
  const expected = sample();
  try {
    for (const zone of ['UTC', 'Asia/Tokyo', 'America/New_York', 'Pacific/Kiritimati', 'America/Los_Angeles']) {
      process.env.TZ = zone;
      assert.equal(sample(), expected, zone);
    }
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});

test('times use a plain space before AM and PM (ICU\'s narrow no-break space never reaches the screen)', () => {
  for (const t of [NOW, DEADLINE, '2026-11-01T09:30:00Z']) {
    assert.match(F.fmtTime(t), /^\d{1,2}:\d{2} (AM|PM)$/);
    assert.doesNotMatch(F.fmtFull(t), /[  ]/);
  }
});

test('feed times: today a time, this week a day, older a date', () => {
  assert.equal(F.fmtPostTime(pt('2026-10-13', '12:30'), NOW), '12:30 PM');
  assert.equal(F.fmtPostTime(pt('2026-10-13', '00:05'), NOW), '12:05 AM');
  assert.equal(F.fmtPostTime(pt('2026-10-12', '23:55'), NOW), 'Mon');
  assert.equal(F.fmtPostTime(pt('2026-10-08', '09:00'), NOW), 'Thu');
  assert.equal(F.fmtPostTime(pt('2026-10-07', '09:00'), NOW), 'Oct 7');
  assert.equal(F.fmtPostTime(pt('2025-10-12', '09:00'), NOW), 'Oct 12, 2025');
});

test('countdowns: "2d 4h", "21h 34m", "9m", then seconds; tiles and the amber two hours', () => {
  assert.equal(F.fmtLeft(DEADLINE, NOW), '2d 4h');
  assert.equal(F.fmtLeft(DEADLINE, pt('2026-10-14', '19:41')), '21h 34m');
  assert.equal(F.fmtLeft(DEADLINE, Date.parse(DEADLINE) - 9 * 60_000), '9m');
  assert.equal(F.fmtLeft(DEADLINE, Date.parse(DEADLINE) - 45_000), '45s');
  assert.equal(F.fmtLeft(DEADLINE, Date.parse(DEADLINE) + 60_000), '0s');
  // Above an hour it counts from whole minutes, so it matches the clock (2:12 left at 1:03:20).
  assert.equal(F.fmtLeft(DEADLINE, Date.parse(NOW) + 20_000), '2d 4h');

  const m2 = F.countdown(DEADLINE, NOW);
  assert.deepEqual(m2.tiles, [{ n: '2', u: 'DAYS' }, { n: '04', u: 'HRS' }, { n: '12', u: 'MIN' }]);
  assert.equal(m2.short, '2d 4h');
  assert.equal(m2.aria, '2 days 4 hours 12 minutes');
  assert.equal(m2.pending, false);
  assert.equal(m2.done, false);
  const hours = F.countdown(DEADLINE, pt('2026-10-15', '16:03'));
  assert.deepEqual(hours.tiles, [{ n: '01', u: 'HR' }, { n: '12', u: 'MIN' }]);
  assert.equal(hours.pending, true, 'under two hours the digits turn amber');
  const minutes = F.countdown(DEADLINE, Date.parse(DEADLINE) - (9 * 60 + 5) * 1000);
  assert.deepEqual(minutes.tiles, [{ n: '09', u: 'MIN' }, { n: '05', u: 'SEC' }]);
  assert.equal(minutes.aria, '9 minutes 5 seconds');
  const done = F.countdown(DEADLINE, Date.parse(DEADLINE) + 1000);
  assert.equal(done.done, true);
  assert.equal(done.pending, false);
  assert.deepEqual(F.countdown(null, NOW), { known: false, tiles: [], short: '—', pending: false, done: false, aria: 'Time not available' });
});

test('numbers: real minus, "—" for missing, never "−0"', () => {
  assert.equal(F.fmtNum(2.5), '2.5');
  assert.equal(F.fmtNum(-3), `${MINUS}3`);
  assert.equal(F.fmtNum(41), '41');
  assert.equal(F.fmtNum(0), '0');
  assert.equal(F.fmtNum(-0), '0');
  assert.equal(F.fmtNum(-0.001), '0');
  assert.equal(F.fmtNum(0.1 + 0.2), '0.3');
  assert.equal(F.fmtNum('2.5'), '2.5');
  assert.equal(F.fmtSigned(3), '+3');
  assert.equal(F.fmtSigned(-3), `${MINUS}3`);
  assert.equal(F.fmtSigned(2.5), '+2.5');
  assert.equal(F.fmtSigned(0), '0');
  assert.equal(F.fmtOdds(-110), `${MINUS}110`);
  assert.equal(F.fmtOdds(120), '+120');
  assert.equal(F.fmtOdds(100), '+100');
  assert.equal(F.fmtPct(-4.5), `${MINUS}4.5%`);
  assert.equal(F.fmtPct(52.7), '52.7%');
  assert.equal(F.fmtPct(-0.01), '0.0%');
  assert.equal(F.fmtRecord(2, 0, 0), '2–0–0', 'records use en dashes');
  assert.equal(F.plural(1, 'bet'), '1 bet');
  assert.equal(F.plural(3, 'bet'), '3 bets');
  assert.equal(F.plural(2, 'challenge'), '2 challenges');
  assert.equal(F.plural(0, 'pick'), '0 picks');
});

test('spreads name their team, totals never get a plus, Pick\'em is spelled one way (DP-5, DP-6)', () => {
  assert.equal(F.fmtSpreadPick('SEA', 'DEN', 2.5), `SEA ${MINUS}2.5`, 'a positive home spread: the away team is favored');
  assert.equal(F.fmtSpreadPick('HOU', 'JAX', -3), `JAX ${MINUS}3`);
  assert.equal(F.fmtSpreadPick('SEA', 'DEN', 0), "Pick'em");
  assert.equal(F.fmtSide('SEA', 'DEN', 'home', 3), 'DEN +3');
  assert.equal(F.fmtSide('SEA', 'DEN', 'away', 3), `SEA ${MINUS}3`);
  assert.equal(F.fmtSide('SEA', 'DEN', 'home', -3), `DEN ${MINUS}3`);
  assert.equal(F.fmtSide('SEA', 'DEN', 'away', -3), 'SEA +3');
  assert.equal(F.fmtSide('SEA', 'DEN', 'home', 0), "DEN Pick'em");
  assert.equal(F.fmtSide('SEA', 'DEN', 'over', 41.5), 'Over 41.5');
  assert.equal(F.fmtSide('SEA', 'DEN', 'under', 41.5), 'Under 41.5');
  assert.equal(F.fmtSide('SEA', 'DEN', 'home', null), 'DEN —');
  assert.equal(F.fmtSide('SEA', 'DEN', 'over', null), 'Over —');
  assert.equal(F.fmtMatchup('SEA', 'DEN'), 'SEA @ DEN', 'never a raw id such as SEA-DEN (DP-15)');
});

test('Virtual Units read "U"; dollars only for real slips (DP-14)', () => {
  assert.equal(F.fmtU(1.5), '1.5U');
  assert.equal(F.fmtU(2), '2U');
  assert.equal(F.fmtU(0.5), '0.5U');
  assert.equal(F.fmtAmt(0.85), '+0.85U');
  assert.equal(F.fmtAmt(-1), `${MINUS}1U`);
  assert.equal(F.fmtAmt(2), '+2U');
  assert.equal(F.fmtAmt(1.5), '+1.50U');
  assert.equal(F.fmtAmt(2, false), '2U');
  assert.equal(F.fmtAmt(-1, false), `${MINUS}1U`);
  assert.equal(F.fmtAmt(0), '0U');
  assert.equal(F.fmtAmt(1.27 + 0.48), '+1.75U');
  assert.equal(F.fmtUsd(72.8), '$72.80');
  assert.equal(F.fmtUsd(50), '$50');
  assert.equal(F.fmtUsd(1250), '$1,250');
  assert.equal(F.fmtUsd(-5), `${MINUS}$5`);
});

test('the Late marker: "Late · 12 min", minutes past the deadline, never colour alone (D-30)', () => {
  assert.equal(F.fmtLate(12), 'Late · 12 min');
  assert.equal(F.fmtLate(1), 'Late · 1 min');
  assert.equal(F.fmtLate(59.9), 'Late · 59 min');
  assert.equal(F.fmtLate(60), 'Late · 1 h');
  assert.equal(F.fmtLate(125), 'Late · 2 h 5 min');
  assert.equal(F.fmtLate(2 * 1440 + 180), 'Late · 2 d 3 h');
  assert.equal(F.fmtLate(1440), 'Late · 1 d');
  assert.equal(F.fmtLate(0), 'Late · under 1 min');
  // A stored marker without minutes still says Late.
  for (const unknown of [null, undefined, '', -5, Number.NaN]) assert.equal(F.fmtLate(unknown), 'Late');
  assert.equal(F.fmtLateAria(12), 'Late by 12 minutes');
  assert.equal(F.fmtLateAria(61), 'Late by 1 hour 1 minute');
  assert.equal(F.fmtLateAria(2 * 1440 + 180), 'Late by 2 days 3 hours');
  assert.equal(F.fmtLateAria(null), 'Late');
});

test('null and missing values read "—", never 0 and never "Not available PT" (DP-8)', () => {
  const missing = [null, undefined, '', '   ', Number.NaN, Infinity, 'not a number', {}, [], true];
  const oneArg = [F.fmtNum, F.fmtSigned, F.fmtU, F.fmtAmt, F.fmtUsd, F.fmtPct, F.fmtOdds];
  for (const fn of oneArg) for (const value of missing) assert.equal(fn(value), '—', `${fn.name}(${String(value)})`);
  const missingTimes = [null, undefined, '', 'not a time', Number.NaN, {}];
  for (const fn of [F.fmtTime, F.fmtDay, F.fmtDate, F.fmtMonthDay, F.fmtWhen, F.fmtFull]) {
    for (const value of missingTimes) assert.equal(fn(value), '—', `${fn.name}(${String(value)})`);
  }
  assert.equal(F.fmtPostTime(null, NOW), '—');
  assert.equal(F.fmtLeft(null, NOW), '—');
  assert.equal(F.fmtLeft(DEADLINE, null), '—');
  assert.equal(F.fmtSpreadPick('SEA', 'DEN', null), '—');
  assert.equal(F.fmtSpreadPick(null, 'DEN', -3), '—', 'a spread never shows without its team');
  assert.equal(F.fmtSide('SEA', 'DEN', 'sideways', 3), '—');
  assert.equal(F.fmtMatchup('SEA', null), '—');
  assert.equal(F.fmtRecord(2, null, 0), '—');
  assert.equal(F.plural(null, 'bet'), '—');
  assert.equal(F.pacificParts(null), null);
  assert.equal(F.toNumber(''), null, 'an empty field is missing, not 0');
  assert.equal(F.toNumber(null), null);
  assert.equal(F.toMs('2026-13-45'), null);
});

test('no hyphen-minus in any formatted number', () => {
  const values = [-0.5, -1, -2.5, -3, -7.25, -10, -110, -152.4, -1250.5, -0.004];
  const outputs = [];
  for (const v of values) {
    outputs.push(F.fmtNum(v), F.fmtSigned(v), F.fmtU(v), F.fmtAmt(v), F.fmtAmt(v, false), F.fmtUsd(v), F.fmtPct(v), F.fmtOdds(v));
    outputs.push(F.fmtSpreadPick('SEA', 'DEN', v), F.fmtSpreadPick('SEA', 'DEN', -v));
    for (const side of ['home', 'away', 'over', 'under']) outputs.push(F.fmtSide('SEA', 'DEN', side, v));
  }
  for (const out of outputs) assert.equal(out.includes(HYPHEN_MINUS), false, out);
  assert.ok(outputs.some(out => out.includes(MINUS)));
});

test('format.js is pure and reads Pacific time through Intl, never a fixed offset or the machine zone', () => {
  const source = readFileSync(new URL('../web/src/next/format.js', import.meta.url), 'utf8');
  assert.match(source, /America\/Los_Angeles/);
  assert.match(source, /Intl\.DateTimeFormat/);
  for (const banned of [/getTimezoneOffset/, /\.get(Hours|Minutes|Seconds|Day|Date|Month|FullYear)\(/, /PT_OFFSET/, /[-+]0[78]:00/, /\b(25200|28800)(000)?\b/, /\b[78]\s*\*\s*(3600|60\s*\*\s*60)/,
    /Date\.now/, /new Date\(\)/, /\bwindow\./, /\bdocument\./, /localStorage/, /\bfetch\(/, /Math\.random/, /toLocale(Date|Time)?String\(/]) {
    assert.doesNotMatch(source, banned, String(banned));
  }
});
