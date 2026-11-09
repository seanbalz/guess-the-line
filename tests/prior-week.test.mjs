import test from 'node:test';
import assert from 'node:assert/strict';
import { FINAL_GRACE_MS, STALE_MS, priorGameState, priorWeekOf, priorWeekStillPlaying } from '../shared/prior-week.mjs';

// Still playing from last week (November 9, 2026): Week 10 opens Monday 12:00 AM PT while Week 9's Monday night game is
// still to be played. Every game, guess and result below is a fixture shaped like the `/lines/read` reply.
const at = iso => Date.parse(iso);
const current = { season: 2026, week: 10 };
const mine = (spread, total, { lockedIn = true, points = null } = {}) => ({
  spread: { guess: spread, lockedIn, points, lineAtGuess: spread === null ? null : { value: spread + 0.5 } },
  total: { guess: total, lockedIn, points, lineAtGuess: null },
});
const final = (away, home, observedAt) => ({ status: 'final', away, home, source: 'Fixture', observedAt, origin: 'settlement' });
// Sunday 10:00 AM PT, Sunday night (5:20 PM PT) and Monday night (5:15 PM PT, PST: UTC−8).
const SUNDAY = { id: 'CHI-DET', awayCode: 'CHI', homeCode: 'DET', kickoff: '2026-11-08T18:00:00.000Z', started: true,
  final: final(17, 24, '2026-11-08T21:20:00.000Z'), mine: mine(-3, 47.5, { points: 6 }) };
const SNF = { id: 'KC-BUF', awayCode: 'KC', homeCode: 'BUF', kickoff: '2026-11-09T01:20:00.000Z', started: true,
  final: final(27, 30, '2026-11-09T04:40:00.000Z'), mine: mine(-1.5, 51, { points: 4 }) };
const MNF = { id: 'MIA-GB', awayCode: 'MIA', homeCode: 'GB', kickoff: '2026-11-10T01:15:00.000Z', started: false, final: null, mine: mine(-4.5, 44) };
const week9 = games => ({ season: 2026, week: 9, now: null, games });

test('the prior week is the published slate just before the viewer’s week, across a season edge too', () => {
  const slates = [{ season: 2026, week: 10 }, { season: 2026, week: 9 }, { season: 2026, week: 8 }];
  assert.deepEqual(priorWeekOf({ season: 2026, week: 10, slates }), { season: 2026, week: 9 });
  assert.deepEqual(priorWeekOf({ season: 2026, week: 10, slates: [...slates].reverse() }), { season: 2026, week: 9 });
  assert.equal(priorWeekOf({ season: 2026, week: 8, slates }), null);
  assert.equal(priorWeekOf({ season: 2026, week: 10, slates: [] }), null);
  assert.equal(priorWeekOf(null), null);
  assert.deepEqual(priorWeekOf({ season: 2027, week: 1, slates: [{ season: 2027, week: 1 }, { season: 2026, week: 18 }] }), { season: 2026, week: 18 });
});

test('Monday afternoon: only the unfinished Monday night game shows, with the locked guesses and line at guess', () => {
  const view = priorWeekStillPlaying({ current, lines: week9([SUNDAY, SNF, MNF]), now: at('2026-11-09T23:00:00.000Z') });
  assert.equal(view.week, 9);
  assert.equal(view.playing, 1);
  assert.deepEqual(view.games.map(game => [game.id, game.state]), [['MIA-GB', 'upcoming']]);
  assert.deepEqual(view.games[0].spread, { guess: -4.5, lockedIn: true, points: null });
  assert.equal(view.games[0].lineAtGuess.spread, -4);
  assert.equal(view.games[0].total.guess, 44);
});

test('Monday night: the game goes live at kickoff, then final and grading, then final with points', () => {
  const live = priorWeekStillPlaying({ current, lines: week9([SUNDAY, SNF, { ...MNF, started: true }]), now: at('2026-11-10T02:30:00.000Z') });
  assert.deepEqual(live.games.map(game => game.state), ['live']);
  // The server clock alone moves a game to live, before a refreshed `started` flag arrives.
  assert.equal(priorGameState(MNF, at('2026-11-10T01:16:00.000Z')), 'live');
  const done = { ...MNF, started: true, final: final(20, 23, '2026-11-10T04:30:00.000Z') };
  const grading = priorWeekStillPlaying({ current, lines: week9([SUNDAY, SNF, done]), now: at('2026-11-10T04:45:00.000Z') });
  assert.deepEqual(grading.games.map(game => [game.state, game.final]), [['grading', { away: 20, home: 23 }]]);
  const graded = { ...done, mine: mine(-4.5, 44, { points: 8 }) };
  const shown = priorWeekStillPlaying({ current, lines: week9([SUNDAY, SNF, graded]), now: at('2026-11-10T05:00:00.000Z') });
  assert.deepEqual(shown.games.map(game => [game.state, game.spread.points]), [['final', 8]]);
  assert.equal(shown.playing, 0);
});

test('Tuesday after the final is graded: normal behavior resumes', () => {
  const graded = { ...MNF, started: true, final: final(20, 23, '2026-11-10T04:30:00.000Z'), mine: mine(-4.5, 44, { points: 8 }) };
  const tuesday = at('2026-11-10T20:00:00.000Z');
  assert.ok(tuesday - at(graded.final.observedAt) > FINAL_GRACE_MS);
  assert.equal(priorWeekStillPlaying({ current, lines: week9([SUNDAY, SNF, graded]), now: tuesday }), null);
});

test('a postponed game keeps the prior week shown until it is played', () => {
  const postponed = { ...MNF, id: 'NYJ-NE', awayCode: 'NYJ', homeCode: 'NE', kickoff: '2026-11-11T20:00:00.000Z' };
  const view = priorWeekStillPlaying({ current, lines: week9([SUNDAY, SNF, postponed]), now: at('2026-11-10T20:00:00.000Z') });
  assert.deepEqual(view.games.map(game => [game.id, game.state]), [['NYJ-NE', 'upcoming']]);
  // A game never recorded final is not held on screen forever.
  const stale = { ...postponed, kickoff: '2026-11-01T20:00:00.000Z', started: true };
  assert.equal(priorWeekStillPlaying({ current, lines: week9([stale]), now: at('2026-11-01T20:00:00.000Z') + STALE_MS + 1 }), null);
});

test('no unfinished prior-week game, or no prior week at all: nothing shows', () => {
  const monday = at('2026-11-09T23:00:00.000Z');
  assert.equal(priorWeekStillPlaying({ current, lines: week9([SUNDAY, SNF]), now: monday }), null);
  assert.equal(priorWeekStillPlaying({ current, lines: null, now: monday }), null);
  assert.equal(priorWeekStillPlaying({ current: null, lines: week9([MNF]), now: monday }), null);
  // The reply must be for a week before the current one.
  assert.equal(priorWeekStillPlaying({ current: { season: 2026, week: 9 }, lines: week9([MNF]), now: monday }), null);
  assert.equal(priorWeekStillPlaying({ current, lines: week9([MNF]), now: NaN }), null);
});

test('a guess the viewer never locked in does not hold a final open for grading', () => {
  const unlocked = { ...MNF, started: true, final: final(20, 23, '2026-11-10T04:30:00.000Z'), mine: mine(-4.5, null, { lockedIn: false }) };
  assert.equal(priorGameState(unlocked, at('2026-11-10T05:00:00.000Z')), 'final');
  const none = { ...unlocked, mine: undefined };
  assert.equal(priorGameState(none, at('2026-11-10T05:00:00.000Z')), 'final');
});
