import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../shared/game-features/catalog.mjs';
import * as A from '../shared/game-features/awards.mjs';
import { normalizeWeek } from '../shared/game-features/week.mjs';
import { ANA, BO, CY, DEE, ELI, ROSTER, ALL_FINAL, bet, guess, makeWeek } from './fixtures/game-features/week.mjs';

// Redesign build plan stage 68: the weekly awards and season winners (shared/game-features/awards.mjs). Each test names
// the rule it guards; every account and number is a fixture.
const byId = result => Object.fromEntries(result.awards.map(a => [a.id, a]));

test('catalog: Spread and Total are separate awards; Biggest upset and Duel of the week wait for Sean or challenges', () => {
  assert.deepEqual([...C.LIVE_AWARDS], ['spread_winner', 'total_winner', 'bets_winner', 'best_guess', 'sharpest_bet', 'saw_it_coming', 'worst_beat']);
  assert.equal(C.AWARD_BY_ID.biggest_upset.status, 'question');
  assert.equal(C.AWARD_BY_ID.duel_of_the_week.status, 'waits');
  assert.ok(!C.AWARDS.some(a => /guess the line winner/i.test(a.name)), 'no combined Spread + Total winner (D-36)');
});

test('no awards until every game is final and every bet has settled', () => {
  const guesses = [guess(ANA, 'spread', 'G1', -3, -3)];
  assert.deepEqual(A.weekAwards(makeWeek({ results: { G1: [24, 20], G2: [24, 20], G3: [24, 20] }, guesses }), ROSTER), { ready: false, awards: [] }, 'G4 has no final yet');
  assert.deepEqual(A.weekAwards(makeWeek({ results: ALL_FINAL, guesses, bets: [bet(ANA, 'G1', 'spread', 'home', -3, 'pending')] }), ROSTER), { ready: false, awards: [] });
  const done = A.weekAwards(makeWeek({ results: { ...ALL_FINAL, G4: 'void' }, guesses }), ROSTER);
  assert.equal(done.ready, true, 'a voided game counts as decided');
});

test('Spread and Total winners: the most points on their own board; a tie shares the award; the two are never added', () => {
  const week = makeWeek({ results: ALL_FINAL, guesses: [
    guess(ANA, 'spread', 'G1', -3, -3), guess(ANA, 'spread', 'G2', 2, 1), // 10 + 8 = 18
    guess(BO, 'spread', 'G1', -3, -3), guess(BO, 'spread', 'G2', 0, 1), // 10 + 8 = 18
    guess(CY, 'spread', 'G1', -1, -3), guess(CY, 'total', 'G1', 44, 44), guess(CY, 'total', 'G2', 44, 44), // Spread 6; Total 20
    guess(ANA, 'total', 'G1', 40, 44), // Total 2: Ana's 18 Spread points never help her Total
  ] });
  const awards = byId(A.weekAwards(week, ROSTER));
  assert.deepEqual([awards.spread_winner.winners, awards.spread_winner.value], [[ANA, BO], { points: 18 }], 'T-1, as the board shares it (D-36)');
  assert.deepEqual([awards.total_winner.winners, awards.total_winner.value], [[CY], { points: 20 }]);
});

test('the roster decides: a group\'s awards count only its own members', () => {
  const week = makeWeek({ results: ALL_FINAL, guesses: [guess(ANA, 'spread', 'G1', -3, -3), guess(BO, 'spread', 'G1', -2, -3)] });
  assert.deepEqual(byId(A.weekAwards(week, [BO, CY])).spread_winner.winners, [BO]);
});

test('Bets winner: qualified players (3 bets or 3U) by ROI, then net units, then wins; nothing settled has no ROI', () => {
  const week = makeWeek({ results: ALL_FINAL, bets: [
    // Ana: 3 bets, 2 wins 1 loss: net 0.8182 on 3U, ROI 27.3%.
    bet(ANA, 'G1', 'spread', 'home', -3, 'win'), bet(ANA, 'G2', 'spread', 'home', -3, 'win'), bet(ANA, 'G3', 'spread', 'away', 3, 'loss'),
    // Bo: one 3U bet that won: qualifies on units, net 2.7273 on 3U, ROI 90.9%.
    bet(BO, 'G1', 'spread', 'home', -3, 'win', { units: 3, netUnits: 2.7273 }),
    // Cy: two wins at ROI 90.9% but only 2 bets and 2U: not qualified.
    bet(CY, 'G1', 'spread', 'home', -3, 'win'), bet(CY, 'G2', 'spread', 'home', -3, 'win'),
    // Dee: three voids qualify (D-26 keeps their credit) but nothing settled: no ROI, not ranked.
    bet(DEE, 'G1', 'total', 'over', 40, 'void'), bet(DEE, 'G2', 'total', 'over', 40, 'void'), bet(DEE, 'G3', 'total', 'over', 40, 'void'),
  ] });
  const award = byId(A.weekAwards(week, ROSTER)).bets_winner;
  assert.deepEqual(award.winners, [BO]);
  assert.deepEqual(award.value, { roi: 0.9091, net: 2.7273, wins: 1, losses: 0, pushes: 0 });
  assert.deepEqual(A.betsLine([bet(ANA, 'G1', 'spread', 'home', -3, 'win', { netUnits: null, odds: 120, units: 2 })]).net, 2.4, 'D-26: 2U at +120 wins 2.4U');
});

test('Bets winner ties share the award only when ROI, net units and wins are all equal', () => {
  const three = user => [bet(user, 'G1', 'spread', 'home', -3, 'win'), bet(user, 'G2', 'spread', 'home', -3, 'win'), bet(user, 'G3', 'spread', 'home', -3, 'loss')];
  const week = makeWeek({ results: ALL_FINAL, bets: [...three(ANA), ...three(BO)] });
  assert.deepEqual(byId(A.weekAwards(week, ROSTER)).bets_winner.winners, [ANA, BO]);
});

test('Best guess: the smallest miss of the week across Spread and Total; every tied guess is listed', () => {
  const week = makeWeek({ results: ALL_FINAL, guesses: [
    guess(ANA, 'spread', 'G1', -2.5, -3), guess(BO, 'total', 'G2', 44, 44.5), guess(CY, 'spread', 'G3', 6, 3), guess(DEE, 'total', 'G4', 50, null),
  ] });
  const award = byId(A.weekAwards(week, ROSTER)).best_guess;
  assert.deepEqual(award.winners, [ANA, BO]);
  assert.deepEqual(award.value, { error: 0.5, points: 9 });
  assert.deepEqual(award.entries.map(e => [e.userId, e.gameId, e.market]), [[ANA, 'G1', 'spread'], [BO, 'G2', 'total']]);
});

test('Sharpest bet: the bet that beat the kickoff line by the most; none that beat it, no award', () => {
  const week = makeWeek({ results: ALL_FINAL, kickoff: { G1: { spread: -4.5, total: 44 } }, bets: [
    bet(ANA, 'G1', 'spread', 'home', -3, 'win'), bet(BO, 'G1', 'total', 'over', 43, 'win'), bet(CY, 'G1', 'spread', 'away', 4, 'loss'), bet(DEE, 'G2', 'spread', 'home', 3, 'win'),
  ] });
  const award = byId(A.weekAwards(week, ROSTER)).sharpest_bet;
  assert.deepEqual([award.winners, award.value], [[ANA], { by: 1.5 }]);
  const flat = makeWeek({ results: ALL_FINAL, kickoff: { G1: { spread: -3, total: 44 } }, bets: [bet(ANA, 'G1', 'spread', 'home', -3, 'win')] });
  assert.equal(byId(A.weekAwards(flat, ROSTER)).sharpest_bet, undefined, 'an award with no entry is hidden, never shown empty');
});

test('Saw it coming: the guess the line moved toward the most by kickoff', () => {
  const week = makeWeek({ results: ALL_FINAL, kickoff: { G1: { spread: -5, total: 41 } }, guesses: [
    guess(ANA, 'spread', 'G1', -6, -3), guess(BO, 'total', 'G1', 40, 44.5), guess(CY, 'spread', 'G1', 0, -3),
  ] });
  const award = byId(A.weekAwards(week, ROSTER)).saw_it_coming;
  assert.deepEqual([award.winners, award.value], [[BO], { moved: 3.5 }], 'Total 44.5 to 41, toward Bo\'s 40; Cy\'s line moved away');
});

test('Worst beat: the closest losing bet, from the final score and the saved line', () => {
  const week = makeWeek({ results: { ...ALL_FINAL, G1: [24, 21], G2: [17, 27] }, bets: [
    bet(ANA, 'G1', 'spread', 'home', -3.5, 'loss'), // won by 3: lost by 0.5
    bet(BO, 'G2', 'total', 'over', 45, 'loss'), // 44: lost by 1
    bet(CY, 'G1', 'spread', 'away', 3.5, 'win'),
  ] });
  const award = byId(A.weekAwards(week, ROSTER)).worst_beat;
  assert.deepEqual([award.winners, award.value], [[ANA], { lostBy: 0.5 }]);
});

test('real slips never reach an award: a week carrying one is refused before any award is made (D-36)', () => {
  const raw = { season: 2026, week: 9, games: [{ id: 'G1', home: 'AAA', away: 'BBB', kickoff: '2026-11-06T01:15:00.000Z', result: { status: 'final', home: 24, away: 20 } }],
    bets: [{ ...bet(ANA, 'G1', 'spread', 'home', -3, 'win'), kind: 'real_slip' }] };
  assert.throws(() => A.weekAwards(normalizeWeek(raw), ROSTER), /bet kind/);
});

test('an empty week shows no awards at all, not zero winners', () => {
  assert.deepEqual(A.weekAwards(makeWeek({ results: ALL_FINAL }), ROSTER), { ready: true, awards: [] });
});

test('season winners wait for Week 18 to be final ("Decided after Week 18"); then each board names its own champion', () => {
  const weeks = [
    makeWeek({ week: 17, results: ALL_FINAL, guesses: [guess(ANA, 'spread', 'G1', -3, -3), guess(BO, 'total', 'G1', 44, 44)],
      bets: [bet(CY, 'G1', 'spread', 'home', -3, 'win'), bet(CY, 'G2', 'spread', 'home', -3, 'win'), bet(CY, 'G3', 'spread', 'home', -3, 'win')] }),
    makeWeek({ week: 18, results: { G1: [24, 20] }, guesses: [guess(BO, 'spread', 'G1', -3, -3), guess(BO, 'spread', 'G2', -3, -3)],
      bets: [bet(ELI, 'G1', 'spread', 'home', -3, 'win')] }),
  ];
  assert.deepEqual(A.seasonWinners(weeks, ROSTER), { decided: false, winners: [] }, 'Week 18 is not final yet');
  weeks[1] = makeWeek({ week: 18, results: ALL_FINAL, guesses: [guess(BO, 'spread', 'G1', -3, -3), guess(BO, 'spread', 'G2', -3, -3)],
    bets: [bet(ELI, 'G1', 'spread', 'home', -3, 'win')] });
  const season = A.seasonWinners(weeks, ROSTER);
  assert.equal(season.decided, true);
  const win = Object.fromEntries(season.winners.map(w => [w.id, w.winners]));
  assert.deepEqual(win, { spread_champion: [BO], total_champion: [BO], bets_champion: [CY] }, 'Eli never qualified in a week');
});
