// D-69 step 1, the Play landing (Sean's P1B) and the Whole week locked moment, as plain data (web/src/next/play/
// landing.js). Fixture weeks only: the server's picksDue and due rows decide every state. Each test names its contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WEEK_LOCKED_SOURCE, ballotTile, playHero, weekLockedMoments } from '../web/src/next/play/landing.js';
import { weekLockedId } from '../web/src/next/play/moments.js';
import { createMomentsEngine } from '../web/src/next/moments/engine.js';
import { SCOPES, sizeOf } from '../web/src/next/moments/catalog.js';

const DEADLINE = '2026-11-06T01:15:00.000Z'; // Thu Nov 5, 5:15 PM PT (the first kickoff, D-24)
const SUNDAY = '2026-11-08T18:00:00.000Z'; // Sun 10:00 AM PT
const TUESDAY = '2026-11-03T20:00:00.000Z';
const row = (mode, extra) => ({ mode, submitted: false, satOut: false, filled: 0, games: 14, ...extra });
/** A per-game week (M-07): Spread 3 of 14 locked, Total none, both open. */
const perGame = ({ spread = {}, total = {}, state = 'due', now = TUESDAY } = {}) => ({
  viewer: 'acct', rules: { sentFinal: true, lateWindow: 'kickoff', revealAt: 'kickoff', perGameScoring: true },
  week: { season: 2026, week: 9, deadline: DEADLINE, games: 14 },
  picksDue: { state, week: 9, deadline: DEADLINE, now, modes: [] },
  due: [row('guess_spread', { openGames: 11, locked: 3, nextKickoff: DEADLINE, ...spread }), row('guess_total', { openGames: 14, locked: 0, nextKickoff: DEADLINE, ...total })],
});
/** The rules before per-game scoring: whole ballots, submitted or sat out. */
const wholeMarket = ({ spread = {}, total = {}, state = 'due', modes = ['guess_spread', 'guess_total'] } = {}) => ({
  viewer: 'acct', rules: { sentFinal: false, lateWindow: 'deadline', revealAt: 'deadline' }, week: { season: 2026, week: 9, deadline: DEADLINE, games: 14 },
  picksDue: { state, week: 9, deadline: DEADLINE, now: TUESDAY, modes: modes.map(mode => ({ mode })) },
  due: [row('guess_spread', spread), row('guess_total', total)],
});
const words = line => line.split(/\s+/).filter(w => w !== '·').length;

test('next move: the open ballot nextGuess names, its week counted, the first kickoff, and the one "Make picks"', () => {
  const hero = playHero(perGame());
  assert.deepEqual({ ...hero, progress: hero.progress && { done: hero.progress.done, of: hero.progress.of } }, {
    kind: 'next', week: 9, eyebrow: 'Your next move', title: 'Guess the Spread', market: 'spread', progress: { done: 3, of: 14 },
    line: '3 of 14 locked · first kickoff Thu 5:15 PM PT', action: 'Make picks', target: { section: 'picks', market: 'spread' },
  });
  const total = playHero(perGame({ spread: { openGames: 0, locked: 14, nextKickoff: null } }));
  assert.equal(total.title, 'Guess the Total', 'a market with nothing left to lock is never the next move');
  assert.ok(words(hero.line) <= 12, 'no surface sentence over twelve words (D-66)');
});

test('after the first kickoff the line names that market\'s next open kickoff, from the server\'s due row', () => {
  const hero = playHero(perGame({ state: 'late', now: '2026-11-07T20:00:00.000Z', spread: { openGames: 0, locked: 14, nextKickoff: null }, total: { openGames: 9, locked: 4, nextKickoff: SUNDAY } }));
  assert.equal(hero.title, 'Guess the Total');
  assert.equal(hero.line, '4 of 14 locked · next kickoff Sun 10:00 AM PT');
});

test('whole-market rules (before per-game): the count says "picked", a sent ballot "Submitted", a sit-out "Sat out"; nothing says locked', () => {
  const hero = playHero(wholeMarket({ spread: { filled: 6 } }));
  assert.equal(hero.line, '6 of 14 picked · first kickoff Thu 5:15 PM PT');
  assert.deepEqual(ballotTile(wholeMarket({ total: { submitted: true, filled: 14 } }), 'total'), { label: 'Guess the Total', big: '14 / 14', sub: 'Submitted', tone: 'good', ariaLabel: 'Guess the Total, submitted' });
  assert.equal(ballotTile(wholeMarket({ total: { satOut: true } }), 'total').sub, 'Sat out');
  assert.equal(ballotTile(wholeMarket({ total: { filled: 2 } }), 'total').ariaLabel, 'Guess the Total, 2 of 14 picked');
});

test('both ballots done: "Week N locked in", "Review your guesses", and the one line says what is true of each market', () => {
  const done = playHero(perGame({ state: 'done', spread: { openGames: 0, locked: 14, nextKickoff: null }, total: { openGames: 0, locked: 14, nextKickoff: null } }));
  assert.deepEqual([done.kind, done.eyebrow, done.title, done.line, done.action, done.target], ['done', 'This week', 'Week 9 locked in', 'Spread and Total, all 28 locked', 'Review your guesses', { section: 'picks', market: 'spread' }]);
  const missed = playHero(perGame({ state: 'done', spread: { openGames: 0, locked: 13 }, total: { openGames: 0, locked: 2, satOut: true } }));
  assert.equal(missed.line, 'Spread 13 of 14 locked · Total sat out', 'a game that closed unlocked and a sit-out are said, never hidden');
  const satOut = playHero(perGame({ state: 'done', spread: { openGames: 0, locked: 0, satOut: true }, total: { openGames: 0, locked: 5 } }));
  assert.deepEqual([satOut.market, satOut.target.market], ['total', 'total'], 'the review opens the market that was not sat out');
});

test('no week open: the latest result, as "Your week, at a glance" did, with no meter and no false zero', () => {
  const none = playHero({ picksDue: { state: 'none', modes: [] }, due: [] });
  assert.deepEqual([none.kind, none.title, none.progress, none.line, none.action, none.target], ['results', 'Your week, at a glance', null, 'No week is open yet. Your past results are still here.', 'View your results', { section: 'score' }]);
  assert.equal(playHero(perGame({ state: 'not_open' })).line, 'Picks open Monday 12:00 AM PT');
  assert.equal(playHero(wholeMarket({ state: 'closed' })).line, 'Review your guesses and their saved scoring lines.');
});

test('the other ballot tile: "N / 14" and one word, "All locked" in the good tone with its word, and "—" without a read', () => {
  assert.deepEqual(ballotTile(perGame(), 'total'), { label: 'Guess the Total', big: '0 / 14', sub: 'locked', tone: 'plain', ariaLabel: 'Guess the Total, 0 of 14 locked' });
  assert.deepEqual(ballotTile(perGame({ spread: { openGames: 0, locked: 14 } }), 'spread'), { label: 'Guess the Spread', big: '14 / 14', sub: 'All locked', tone: 'good', ariaLabel: 'Guess the Spread, all 14 locked' });
  assert.deepEqual(ballotTile(perGame({ total: { openGames: 0, locked: 3, satOut: true } }), 'total'), { label: 'Guess the Total', big: '3 / 14', sub: 'Sat out', tone: 'plain', ariaLabel: 'Guess the Total, sat out this week' });
  assert.deepEqual(ballotTile(null, 'total'), { label: 'Guess the Total', big: '—', sub: 'Open your guesses', tone: 'plain', ariaLabel: 'Guess the Total, open your guesses' });
});

test('Whole week locked: one small moment per market at N of N on a per-game read; a missed game, a sit-out and whole-market rules stay quiet', () => {
  const all = perGame({ spread: { openGames: 0, locked: 14 } });
  assert.deepEqual(weekLockedMoments(all), [{ id: 'weekLocked:2026:9:guess_spread', kind: 'weekLocked', scopes: [SCOPES.picks, SCOPES.play], title: 'Week 9 Spread locked', meta: '14 of 14 locked', icon: 'lock' }]);
  assert.equal(weekLockedId(2026, 9, 'guess_spread'), 'weekLocked:2026:9:guess_spread');
  assert.equal(sizeOf('weekLocked'), 'small');
  assert.deepEqual(weekLockedMoments(perGame({ spread: { openGames: 0, locked: 13 } })), [], 'a game that closed unlocked: quiet');
  assert.deepEqual(weekLockedMoments(perGame({ spread: { openGames: 0, locked: 14, satOut: true } })), [], 'a sit-out: quiet');
  assert.deepEqual(weekLockedMoments(wholeMarket({ spread: { submitted: true, filled: 14 } })), [], 'whole-market rules lock no game');
  assert.deepEqual(weekLockedMoments(null), []);
});

const memory = () => { const map = new Map(); return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } }; };
function rig(storage = memory()) {
  const small = [], big = [], here = { settled: false, navigated: false };
  const engine = createMomentsEngine({ account: 'acct', storage, isSettled: () => here.settled, hasNavigated: () => here.navigated,
    onBig: ms => big.push(ms.map(m => m.id)), onSmall: m => small.push(m.id), setTimer: fn => { fn(); }, now: () => 0 });
  return { engine, small, big, here, storage };
}
const report = (engine, community) => engine.report(weekLockedMoments(community), { source: WEEK_LOCKED_SOURCE });

test('Whole week locked plays on the fresh read that reaches N of N while the picks card is open, once, and never for 13 of 14', () => {
  const r = rig();
  report(r.engine, perGame()); // this device's first read of the source seeds it silently
  r.here.settled = true; r.here.navigated = true;
  const close = r.engine.open(SCOPES.picks);
  report(r.engine, perGame({ spread: { openGames: 1, locked: 13 } }));
  assert.deepEqual(r.small, [], '13 of 14 is not the moment');
  const all = perGame({ spread: { openGames: 0, locked: 14 } });
  report(r.engine, all);
  assert.deepEqual(r.small, ['weekLocked:2026:9:guess_spread'], 'the confirming read plays it in place, small');
  report(r.engine, all);
  assert.deepEqual(r.small, ['weekLocked:2026:9:guess_spread'], 'the same read again never replays it');
  assert.deepEqual(r.big, [], 'a small moment never takes the big card');
  close();
  const again = rig(r.storage);
  report(again.engine, all);
  again.here.settled = true; again.here.navigated = true;
  again.engine.open(SCOPES.picks);
  assert.deepEqual(again.small, [], 'a later session on this device remembers it');
});

test('Whole week locked never plays on launch: it waits as NEW for the landing tile, then plays once when the card is opened', () => {
  const r = rig();
  report(r.engine, perGame()); // seeded on an earlier visit
  const later = rig(r.storage); // a new session: the week was locked on another device meanwhile
  const closeLanding = later.engine.open(SCOPES.play); // the app opens on the Play landing: a launch card
  report(later.engine, perGame({ spread: { openGames: 0, locked: 14 } }));
  assert.deepEqual(later.small, [], 'nothing plays on page load');
  assert.equal(later.engine.newCount(SCOPES.picks), 1, 'the landing\'s ballot tile shows NEW');
  closeLanding();
  later.here.settled = true; later.here.navigated = true;
  later.engine.open(SCOPES.picks); // the member opens the picks card
  assert.deepEqual(later.small, ['weekLocked:2026:9:guess_spread']);
  assert.equal(later.engine.newCount(SCOPES.picks), 0);
});
