import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as C from '../shared/game-features/catalog.mjs';
import * as B from '../shared/game-features/badges.mjs';
import { normalizeWeek } from '../shared/game-features/week.mjs';
import { ANA, BO, CY, DEE, ELI, ALL_FINAL, HOUR, bet, guess, kickoffAt, makeWeek, sent } from './fixtures/game-features/week.mjs';

// Redesign build plan stage 68: the badge rules (shared/game-features/badges.mjs), one fixture per live badge. Each test
// names the rule it guards; every account and number is a fixture.
const ids = events => events.map(e => [e.badge, e.userId, e.facts.gameId ?? e.facts.market ?? null]);

test('catalog: the prototype\'s 14 badges with rarities the Badge tile draws; no levels or XP (D-35)', () => {
  assert.equal(C.BADGES.length, 14);
  const tile = fs.readFileSync(new URL('../web/src/next/ui/Badge.jsx', import.meta.url), 'utf8');
  const rarities = JSON.parse(/BADGE_RARITIES = Object\.freeze\((\[[^\]]*\])\)/.exec(tile)[1].replace(/'/g, '"'));
  assert.deepEqual([...C.RARITIES], rarities, 'catalog rarities are the tile\'s rings');
  for (const b of C.BADGES) {
    assert.ok(C.RARITIES.includes(b.rarity), b.id);
    assert.ok(['guess', 'bets', 'challenge'].includes(b.family), b.id);
    assert.ok(['live', 'waits', 'question'].includes(b.status), b.id);
    assert.ok(b.rule.length > 10, b.id);
    if (b.status === 'question') assert.ok(Object.hasOwn(C.QUESTIONS, b.question), `${b.id} names its open question`);
    if (b.family === 'challenge') assert.equal(b.status, 'waits', `${b.id}: challenge badges wait for stage 55`);
  }
  assert.deepEqual([...C.LIVE_BADGES], ['bullseye', 'double_bullseye', 'called_the_move', 'dialed_in', 'never_missed', 'sharp', 'dog_day', 'perfect_week', 'hot_hand']);
  const text = JSON.stringify([C.BADGES, C.AWARDS, C.STREAKS]);
  assert.doesNotMatch(text, /\bXP\b|\blevel\b|experience points/i, 'D-35: no levels or XP');
});

test('Bullseye: an exact guess scores 10 and earns one badge per game and market, shown from that game\'s kickoff', () => {
  const week = makeWeek({ guesses: [guess(ANA, 'spread', 'G1', -3, -3), guess(ANA, 'total', 'G2', 44.5, 44.5), guess(BO, 'spread', 'G1', -3.5, -3), guess(CY, 'total', 'G3', 41, null)] });
  const events = B.bullseyes(week);
  assert.deepEqual(ids(events), [['bullseye', ANA, 'G1'], ['bullseye', ANA, 'G2']], 'half a point off (9 points) and a pending line earn nothing');
  assert.deepEqual(events.map(e => e.visibleAt), [kickoffAt(9, 1), kickoffAt(9, 2)], 'a Bullseye names the line, so it waits for kickoff (D-31)');
  assert.deepEqual(events[0].facts, { gameId: 'G1', market: 'spread', guess: -3, points: 10 });
  assert.deepEqual(events.map(e => e.key), ['bullseye:u-ana:2026:9:G1:spread', 'bullseye:u-ana:2026:9:G2:total'], 'a stable key per earn');
});

test('Double Bullseye: exact on both the Spread and the Total of the same game, and only then', () => {
  const week = makeWeek({ guesses: [guess(ANA, 'spread', 'G1', -3, -3), guess(ANA, 'total', 'G1', 44.5, 44.5), guess(BO, 'spread', 'G1', 2, 2), guess(BO, 'total', 'G2', 40, 40)] });
  assert.deepEqual(ids(B.doubleBullseyes(week)), [['double_bullseye', ANA, 'G1']], 'Bo\'s two exact guesses are on different games');
});

test('Called the Move: the line moves 1+ point from the line at the guess toward the guess by kickoff; no kickoff line skips', () => {
  const week = makeWeek({
    kickoff: { G1: { spread: -4.5, total: 44 }, G2: { spread: 2, total: null } },
    guesses: [
      guess(ANA, 'spread', 'G1', -5, -3), // −3 → −4.5: 1.5 toward −5
      guess(BO, 'spread', 'G1', -3.5, -3), // the same move passes Bo's −3.5: still 1.5 his way
      guess(CY, 'total', 'G1', 41, 44.5), // 44.5 → 44: only 0.5 toward 41
      guess(ANA, 'spread', 'G2', 6, 3), // 3 → 2 moved away from 6
      guess(BO, 'total', 'G2', 50, 45), // no kickoff total: skipped, never guessed
      guess(CY, 'spread', 'G1', -3, -3), // exact: no direction to move toward
      guess(ANA, 'total', 'G3', 47, null), // pending line: skipped
    ],
  });
  const events = B.calledTheMove(week);
  assert.deepEqual(ids(events), [['called_the_move', ANA, 'G1'], ['called_the_move', BO, 'G1']]);
  assert.deepEqual(events[0].facts, { gameId: 'G1', market: 'spread', guess: -5, from: -3, to: -4.5, moved: 1.5 });
  assert.equal(events[0].visibleAt, kickoffAt(9, 1));
});

test('Dialed In: 80% of a full week (10 per game on the slate) in one market, shown from the week\'s last kickoff', () => {
  // Four games: a full week is 40 points, so 32 is the line. Ana 10 + 10 + 9 + 4 = 33 in Spread; Bo 10 + 10 + 10 = 30 with a game unpicked.
  const week = makeWeek({ guesses: [
    guess(ANA, 'spread', 'G1', -3, -3), guess(ANA, 'spread', 'G2', 1, 1), guess(ANA, 'spread', 'G3', 2.5, 2), guess(ANA, 'spread', 'G4', 6, 3),
    guess(BO, 'spread', 'G1', -3, -3), guess(BO, 'spread', 'G2', 1, 1), guess(BO, 'spread', 'G3', 2, 2),
    guess(ANA, 'total', 'G1', 40, 44), // Ana's Total does not borrow her Spread points (D-36)
  ] });
  const events = B.dialedIn(week);
  assert.deepEqual(ids(events), [['dialed_in', ANA, 'spread']]);
  assert.deepEqual(events[0].facts, { market: 'spread', points: 33, full: 40 });
  assert.equal(events[0].visibleAt, kickoffAt(9, 4));
});

test('Sharp: a bet line 1+ point better than the kickoff line for its own side; a void or a game with no kickoff line is skipped', () => {
  const week = makeWeek({
    kickoff: { G1: { spread: -4.5, total: 44 }, G2: { spread: 3, total: 47 } },
    bets: [
      bet(ANA, 'G1', 'spread', 'home', -3), // home −3 vs −4.5 at kickoff: 1.5 better
      bet(BO, 'G1', 'spread', 'away', 4), // away +4 vs +4.5: worse
      bet(CY, 'G1', 'total', 'over', 43), // over 43 vs 44: 1 better
      bet(ANA, 'G2', 'total', 'under', 48.5, 'void'), // void: skipped
      bet(BO, 'G2', 'spread', 'away', -2), // away −2 vs −3: 1 better
      bet(CY, 'G3', 'spread', 'home', 7), // no kickoff line for G3: skipped
    ],
  });
  const events = B.sharps(week);
  assert.deepEqual(ids(events), [['sharp', ANA, 'G1'], ['sharp', CY, 'G1'], ['sharp', BO, 'G2']]);
  assert.deepEqual(events.map(e => e.facts.by), [1.5, 1, 1]);
  assert.deepEqual(events[0].facts, { gameId: 'G1', market: 'spread', side: 'home', line: -3, kickoff: -4.5, by: 1.5 });
});

test('Dog Day: a winning spread bet taking 7+ points whose team won outright', () => {
  const week = makeWeek({ results: { G1: [20, 24], G2: [20, 24], G3: [24, 20] }, bets: [
    bet(ANA, 'G1', 'spread', 'away', 7.5, 'win'), // away +7.5, won 24–20 outright
    bet(BO, 'G2', 'spread', 'away', 6.5, 'win'), // only 6.5 points
    bet(CY, 'G3', 'spread', 'away', 8, 'win'), // covered but lost outright
    bet(ANA, 'G2', 'total', 'under', 50, 'win'), // not a spread bet
  ] });
  assert.deepEqual(ids(B.dogDays(week)), [['dog_day', ANA, 'G1']]);
});

test('Perfect Week: 4+ wins, no losses, and every bet of the week settled; pushes and voids do not spoil it', () => {
  const wins = (user, extra = []) => [bet(user, 'G1', 'spread', 'home', -3, 'win'), bet(user, 'G2', 'spread', 'home', -3, 'win'), bet(user, 'G3', 'spread', 'home', -3, 'win'), bet(user, 'G4', 'spread', 'home', -3, 'win'), ...extra];
  const week = makeWeek({ results: ALL_FINAL, bets: [
    ...wins(ANA, [bet(ANA, 'G1', 'total', 'over', 40, 'push'), bet(ANA, 'G2', 'total', 'over', 40, 'void')]),
    ...wins(BO, [bet(BO, 'G1', 'total', 'over', 50, 'loss')]),
    ...wins(CY, [bet(CY, 'G4', 'total', 'over', 40, 'pending')]),
    bet(DEE, 'G1', 'spread', 'home', -3, 'win'),
  ] });
  const events = B.perfectWeeks(week);
  assert.deepEqual(ids(events), [['perfect_week', ANA, null]], 'Bo lost one; Cy still has a bet to settle; Dee has one win');
  assert.deepEqual(events[0].facts, { wins: 4, pushes: 1 });
  assert.equal(events[0].visibleAt, kickoffAt(9, 4));
});

test('Never Missed: a Pick streak reaching 10 weeks earns once per run, from that week\'s last kickoff; a sit-out breaks it', () => {
  const week = (n, ballots) => makeWeek({ week: n, ballots });
  const both = user => [sent(user, 'spread'), sent(user, 'total')];
  const weeks = [];
  for (let n = 1; n <= 12; n += 1) weeks.push(week(n, [...both(ANA), ...(n === 4 ? [sent(BO, 'spread'), { ...sent(BO, 'total'), submitted: false, locked: [], satOut: true }] : both(BO))]));
  const now = Date.parse(kickoffAt(12, 4)) + HOUR;
  const events = B.seasonBadges(weeks, now).filter(e => e.badge === 'never_missed');
  assert.deepEqual(events.map(e => [e.userId, e.week, e.facts.from]), [[ANA, 10, 1]], 'Bo sat out Week 4, so his run restarts at Week 5 and is at 8');
  assert.equal(events[0].visibleAt, kickoffAt(10, 4));
  assert.equal(events[0].key, 'never_missed:u-ana:2026:10');
});

test('Hot Hand: 5 wins in a row across weeks; pushes and voids are skipped, a loss restarts the run', () => {
  const weeks = [
    makeWeek({ week: 9, results: ALL_FINAL, bets: [bet(ANA, 'G1', 'spread', 'home', -3, 'win'), bet(ANA, 'G2', 'spread', 'home', -3, 'win'), bet(ANA, 'G3', 'spread', 'home', -3, 'push'), bet(ANA, 'G4', 'spread', 'home', -3, 'win'),
      bet(BO, 'G1', 'spread', 'home', -3, 'win'), bet(BO, 'G2', 'spread', 'home', -3, 'win'), bet(BO, 'G3', 'spread', 'home', -3, 'win'), bet(BO, 'G4', 'spread', 'home', -3, 'loss')] }),
    makeWeek({ week: 10, results: ALL_FINAL, bets: [bet(ANA, 'G1', 'total', 'over', 40, 'void'), bet(ANA, 'G1', 'spread', 'home', -3, 'win'), bet(ANA, 'G2', 'spread', 'home', -3, 'win'), bet(ANA, 'G3', 'spread', 'home', -3, 'win'),
      bet(BO, 'G1', 'spread', 'home', -3, 'win'), bet(BO, 'G2', 'spread', 'home', -3, 'win')] }),
  ];
  const events = B.seasonBadges(weeks, Date.parse(kickoffAt(10, 4)) + HOUR).filter(e => e.badge === 'hot_hand');
  assert.deepEqual(events.map(e => [e.userId, e.week, e.facts.gameId, e.facts.market]), [[ANA, 10, 'G2', 'spread']], 'Ana: 3 wins, a push, a void, then 2 more; Bo lost his 4th');
  assert.equal(events[0].visibleAt, kickoffAt(10, 2));
});

test('only live badges are ever emitted: question and waiting badges have no rule here yet', () => {
  const week = makeWeek({ results: ALL_FINAL, kickoff: { G1: { spread: -6, total: 50 } },
    guesses: [guess(ANA, 'spread', 'G1', -3, -3), guess(ANA, 'total', 'G1', 44.5, 44.5)],
    ballots: [sent(ANA, 'spread'), sent(ANA, 'total')],
    bets: [bet(ANA, 'G1', 'spread', 'away', 8, 'win'), bet(BO, 'G1', 'spread', 'home', -8, 'loss'), bet(CY, 'G1', 'spread', 'home', -8, 'loss'), bet(DEE, 'G1', 'spread', 'home', -8, 'loss'), bet(ELI, 'G1', 'spread', 'home', -8, 'loss')] });
  const all = B.seasonAllBadges([week], Date.parse(kickoffAt(9, 4)) + HOUR);
  assert.ok(all.length > 0);
  for (const e of all) assert.ok(C.LIVE_BADGES.includes(e.badge), `${e.badge} is live`);
  assert.ok(!all.some(e => ['closer', 'lone_wolf', 'showdown', 'giant_slayer', 'taker'].includes(e.badge)), 'Ana is a lone winner on her side, but Lone Wolf waits for Sean');
  assert.equal(new Set(all.map(e => e.key)).size, all.length, 'every key is unique');
});

test('inputs fail closed: a malformed week throws, and a real slip or challenge bet cannot enter (D-36)', () => {
  const base = { season: 2026, week: 9, games: [{ id: 'G1', home: 'AAA', away: 'BBB', kickoff: kickoffAt(9, 1), result: null }] };
  assert.doesNotThrow(() => normalizeWeek(base));
  assert.throws(() => normalizeWeek({ ...base, bets: [{ ...bet(ANA, 'G1', 'spread', 'home', -3), kind: 'real_slip' }] }), /bet kind/);
  assert.throws(() => normalizeWeek({ ...base, bets: [{ ...bet(ANA, 'G1', 'spread', 'home', -3), kind: 'challenge' }] }), /bet kind/);
  assert.throws(() => normalizeWeek({ ...base, guesses: [{ ...guess(ANA, 'spread', 'G1', -3, -3), points: 9 }] }), /points/, 'points must be the scorer\'s own');
  assert.throws(() => normalizeWeek({ ...base, guesses: [guess(ANA, 'spread', 'G9', -3, -3)] }), /guess/, 'a game off the slate');
  assert.throws(() => normalizeWeek({ ...base, guesses: [guess(ANA, 'spread', 'G1', -3, -3), guess(ANA, 'spread', 'G1', -3, -3)] }), /duplicate/);
  assert.throws(() => normalizeWeek({ ...base, games: [{ ...base.games[0], result: { status: 'final', home: 1.5, away: 0 } }] }), /final score/);
  assert.throws(() => normalizeWeek({ ...base, guesses: [guess(ANA, 'spread', 'G1', -3.25, null)] }), /guess value/, 'a guess is a half point');
});
