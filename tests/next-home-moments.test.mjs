// Approved Home plays Whole week locked in place. Streaks wait for the visible Features card; other results
// wait for their own destination and never play on launch. The
// detectors are the real ones; the engine is the real one with a test clock. Fixture accounts only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMomentsEngine } from '../web/src/next/moments/engine.js';
import { SCOPES, scoreScope } from '../web/src/next/moments/catalog.js';
import { WEEK_LOCKED_SOURCE, weekLockedMoments } from '../web/src/next/play/landing.js';
import { streakMoments } from '../web/src/next/features/streakMoment.js';
import { FEATURE_SCOPES, featureMoments } from '../web/src/next/features/model.js';
import { rankCandidate, rankSource } from '../web/src/next/league/rankMoment.js';

const YOU = 'u-you';
const memory = () => { const map = new Map(); return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } }; };
function rig(storage = memory()) {
  const small = [], big = [], here = { settled: false, navigated: false };
  const engine = createMomentsEngine({ account: YOU, storage, isSettled: () => here.settled, hasNavigated: () => here.navigated,
    onBig: ms => big.push(ms.map(m => m.id)), onSmall: m => small.push(m.id), setTimer: fn => { fn(); }, now: () => 0 });
  return { engine, small, big, here, storage };
}
const DEADLINE = '2026-11-06T01:15:00.000Z';
const community = locked => ({ viewer: YOU, rules: { sentFinal: true, lateWindow: 'kickoff', revealAt: 'kickoff', perGameScoring: true },
  week: { season: 2026, week: 9, deadline: DEADLINE, games: 14 }, picksDue: { state: 'due', week: 9, deadline: DEADLINE, now: '2026-11-03T20:00:00.000Z', modes: [] },
  due: [{ mode: 'guess_spread', submitted: false, satOut: false, filled: locked, games: 14, openGames: 14 - locked, locked, nextKickoff: locked < 14 ? DEADLINE : null },
    { mode: 'guess_total', submitted: false, satOut: false, filled: 0, games: 14, openGames: 14, locked: 0, nextKickoff: DEADLINE }] });
const AWARD = { week: 8, version: 1, createdAt: '2026-11-03T16:00:00Z', awards: [{ id: 'total_winner', winners: [YOU], entries: [], value: { points: 18 } }] };
const features = (streak, award) => ({ leagueId: null, season: 2026, ran: true, seasonWinners: null, badges: [], awards: award ? [AWARD] : [],
  streaks: [{ userId: YOU, pick: { current: streak, best: streak }, bets: { current: 0, best: 0 } }] });
const rankUp = n => rankCandidate({ league: 'community', mode: 'guess_spread', saved: { rank: 2, from: 3, n }, market: 'Spread' });
/** One read of each source Home's hooks report: Whole week locked, the features read (awards and streak), the Spread rank. */
function readAll(engine, { locked = 13, streak = 4, award = false, rank = null } = {}) {
  engine.report(weekLockedMoments(community(locked)), { source: WEEK_LOCKED_SOURCE });
  const reply = features(streak, award);
  engine.report([...featureMoments(reply, YOU), ...streakMoments(reply, YOU)], { source: 'features:community' });
  engine.report(rank === null ? [] : [rankUp(rank)], { source: rankSource('community', 'guess_spread') });
}
const WEEK = 'weekLocked:2026:9:guess_spread', STREAK = 'streak:pick:2026:5:5', AWARD_ID = 'award:community:2026:8:total_winner', RANK = 'rank:community:guess_spread:1';

test('in place: Home pops Whole week locked; streaks, awards and rank moves wait for their visible cards', () => {
  const r = rig();
  readAll(r.engine); // this device's first read of each source seeds it silently
  r.here.settled = true; r.here.navigated = true;
  r.engine.open(SCOPES.home);
  readAll(r.engine, { locked: 14, streak: 5, award: true, rank: 1 });
  assert.deepEqual(r.small, [WEEK], 'only the visible lock moment plays in place');
  assert.deepEqual(r.engine.newMoments(SCOPES.features).filter(m => m.kind === 'streak').map(m => m.id), [STREAK], 'the streak is not silently consumed');
  assert.deepEqual(r.big, [], 'nothing big plays on Home');
  assert.deepEqual(r.engine.newMoments(SCOPES.features).filter(m => m.kind === 'award').map(m => m.id), [AWARD_ID], 'the award waits for the Awards tile');
  assert.equal(r.engine.newCount(scoreScope('guess_spread')), 1, 'the rank move waits for the Spread rank tile');
  assert.equal(r.engine.newCount(scoreScope('guess_total')), 0, 'and never for the Total tile');
});

test('never on launch: results from while you were away wait as NEW even with Home open; each plays once when its own card opens', () => {
  const storage = memory();
  readAll(rig(storage).engine); // yesterday: this device read every source
  const r = rig(storage);
  const launch = r.engine.open(SCOPES.home); // the launch screen
  readAll(r.engine, { locked: 14, streak: 5, award: true, rank: 1 }); // the session's first reads
  r.here.settled = true;
  assert.deepEqual([r.small, r.big], [[], []], 'nothing plays on the launch screen, even after a press');
  assert.equal(r.engine.newCount(SCOPES.home), 1, 'Whole week locked waits for Home’s card');
  r.here.navigated = true;
  const score = r.engine.open(scoreScope('guess_spread')); // the Spread rank tile opens Your score
  assert.deepEqual(r.small, [RANK], 'the rank move plays on Your score, small');
  launch(); const home = r.engine.open(SCOPES.home); // back to Home after a navigation
  assert.deepEqual(r.small.slice(1), [WEEK], 'the visible lock moment plays when Home opens again');
  assert.equal(r.engine.newCount(SCOPES.features), 2, 'the award and streak remain pending for their visible card');
  r.engine.open(SCOPES.features); // the Awards tile opens Badges and awards
  assert.deepEqual(r.small, [RANK, WEEK, STREAK], 'the streak plays on its Features card');
  assert.deepEqual(r.big, [[AWARD_ID]], 'the award plays big there, once');
  score(); home(); r.engine.open(SCOPES.home); r.engine.open(scoreScope('guess_spread'));
  assert.equal(r.small.length, 3, 'nothing replays');
  // The real board re-reports the same candidate on every read: after Your score played it, League opens and sees it again.
  r.engine.open(SCOPES.league);
  r.engine.report([rankUp(1)], { source: rankSource('community', 'guess_spread') });
  assert.equal(r.small.length, 3, 'League does not replay the played rank move');
  assert.deepEqual(r.big, [[AWARD_ID]], 'and nothing big plays');
  assert.deepEqual([r.engine.newCount(SCOPES.league), r.engine.newCount(scoreScope('guess_spread'))], [0, 0], 'nothing waits');
});

test('Home holds no badge or award, and a private group’s rank move never waits on Your score', () => {
  assert.deepEqual(FEATURE_SCOPES, ['features', 'league', 'play']);
  const r = rig();
  readAll(r.engine);
  r.here.settled = true; r.here.navigated = true;
  r.engine.open(SCOPES.home);
  readAll(r.engine, { award: true });
  assert.deepEqual(r.big, [], 'a new award never plays on Home');
  assert.deepEqual(rankCandidate({ league: 'L1', mode: 'guess_spread', saved: { rank: 2, from: 3, n: 1 }, market: 'Spread' }).scopes, [SCOPES.league]);
  assert.deepEqual(rankUp(1).scopes, [SCOPES.league, scoreScope('guess_spread')]);
});
