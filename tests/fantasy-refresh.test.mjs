// Contract: build the next week until its weekend slate starts; never rebuild after; one late build only if none exists;
// grade the last completed week until the same freeze, then once more as FINAL; Week 18 freezes four days after it ends.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasySeason, freezeTime, planFantasyRefresh } from '../shared/fantasy-refresh.mjs';

const day = (week, offset) => new Date(Date.UTC(2026, 8, 10 + (week - 1) * 7 + offset)).toISOString().slice(0, 10);
const wk = week => String(week).padStart(2, '0');
const schedule = Array.from({ length: 18 }, (_, i) => i + 1).flatMap(week => [
  { game_id: `2026_${wk(week)}_CCC_DDD`, season: '2026', game_type: 'REG', week: String(week), away_team: 'CCC', home_team: 'DDD', gameday: day(week, 0), gametime: '20:15' },
  { game_id: `2026_${wk(week)}_AAA_BBB`, season: '2026', game_type: 'REG', week: String(week), away_team: 'AAA', home_team: 'BBB', gameday: day(week, 3), gametime: '13:00' },
  { game_id: `2026_${wk(week)}_EEE_FFF`, season: '2026', game_type: 'REG', week: String(week), away_team: 'EEE', home_team: 'FFF', gameday: day(week, 4), gametime: '20:15' },
]);
const statsFor = (weeks, thursdayOnly = []) => weeks.flatMap(week => schedule
  .filter(game => Number(game.week) === week && (!thursdayOnly.includes(week) || game.away_team === 'CCC'))
  .flatMap(game => [game.away_team, game.home_team].map(team => ({ game_id: game.game_id, season: '2026', season_type: 'REG', week: String(week), team }))));
const weeks = n => Array.from({ length: n }, (_, i) => i + 1);
const at = iso => Date.parse(iso);
const index = (snapshots = [], reviews = []) => ({ snapshots: snapshots.map(week => ({ week })), reviews });

test('freeze is the first weekend kickoff, not Thursday night', () => {
  assert.equal(new Date(freezeTime(schedule, 2026, 6)).toISOString(), '2026-10-18T17:00:00.000Z');
});

test('Tuesday after Week 5: build Week 6, grade Week 5 from the committed file, PROVISIONAL', () => {
  const plan = planFantasyRefresh({ season: 2026, schedule, stats: statsFor(weeks(5)), index: null, committedWeeks: [5], now: at('2026-10-13T11:00:00Z') });
  assert.equal(plan.completed, 5);
  assert.deepEqual({ week: plan.snapshot.week, build: plan.snapshot.build, late: plan.snapshot.late }, { week: 6, build: true, late: false });
  assert.deepEqual({ week: plan.review.week, source: plan.review.source, build: plan.review.build, final: plan.review.final }, { week: 5, source: 'committed', build: true, final: false });
});

test('after Thursday night the week still rebuilds until the weekend slate', () => {
  const plan = planFantasyRefresh({ season: 2026, schedule, stats: statsFor(weeks(5)).concat(statsFor([6], [6])), index: index([6]), now: at('2026-10-16T11:00:00Z') });
  assert.equal(plan.completed, 5);
  assert.equal(plan.snapshot.build, true);
});

test('after the weekend kickoff: no rebuild; a missing week builds once, late; nothing after the last kickoff', () => {
  const stats = statsFor(weeks(5)), now = at('2026-10-18T18:00:00Z');
  assert.equal(planFantasyRefresh({ season: 2026, schedule, stats, index: index([6]), now }).snapshot.build, false);
  const late = planFantasyRefresh({ season: 2026, schedule, stats, index: index([]), now }).snapshot;
  assert.deepEqual([late.build, late.late], [true, true]);
  assert.equal(planFantasyRefresh({ season: 2026, schedule, stats, index: index([]), now: at('2026-10-20T01:00:00Z') }).snapshot.build, false, 'after Monday night');
});

test('a PROVISIONAL review is rebuilt once as FINAL after the freeze; a FINAL one never again', () => {
  const stats = statsFor(weeks(5)), now = at('2026-10-18T18:00:00Z');
  const provisional = planFantasyRefresh({ season: 2026, schedule, stats, index: index([5, 6], [{ week: 5, status: 'PROVISIONAL' }]), now }).review;
  assert.deepEqual([provisional.source, provisional.build, provisional.final], ['release', true, true]);
  const done = planFantasyRefresh({ season: 2026, schedule, stats, index: index([5, 6], [{ week: 5, status: 'FINAL' }]), now }).review;
  assert.equal(done.build, false);
  assert.equal(planFantasyRefresh({ season: 2026, schedule, stats, index: index([6]), now }).review.source, null, 'no published estimate, nothing to grade');
});

test('Week 18: no next snapshot; review freezes four days after its last kickoff; season boundary', () => {
  const plan = planFantasyRefresh({ season: 2026, schedule, stats: statsFor(weeks(18)), index: index([18]), now: at('2027-01-12T11:00:00Z') });
  assert.equal(plan.snapshot, null);
  assert.equal(new Date(plan.review.freezeAt).toISOString(), '2027-01-16T01:15:00.000Z', 'Monday 8:15 PM ET plus four days');
  assert.equal(plan.review.final, false);
  assert.equal(fantasySeason(at('2027-01-15T00:00:00Z')), 2026);
  assert.equal(fantasySeason(at('2026-09-01T00:00:00Z')), 2026);
});
