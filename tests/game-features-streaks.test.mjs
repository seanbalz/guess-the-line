import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../shared/game-features/streaks.mjs';
import { ANA, BO, HOUR, bet, kickoffAt, makeWeek, sent } from './fixtures/game-features/week.mjs';

// Redesign build plan stages 36 and 68: the Pick streak and the Bets streak (shared/game-features/streaks.mjs), the one
// streak model Home (stage 36) and the features job (stage 69) share. Fixture accounts and numbers only.
const SLATE = ['G1', 'G2', 'G3', 'G4'];

test('a market is sent when submitted, or when every game is locked in or was closed at kickoff (a late send counts)', () => {
  assert.equal(S.marketStatus({ submitted: true, locked: SLATE }, SLATE), 'sent');
  // D-39: four lock-ins one game at a time with no whole-market send.
  assert.equal(S.marketStatus({ submitted: false, locked: SLATE }, SLATE), 'sent');
  // D-30/M-07: G1 kicked off before the player's first save; locking in the other three late still sends the market.
  assert.equal(S.marketStatus({ submitted: false, locked: ['G2', 'G3', 'G4'], closed: ['G1'] }, SLATE), 'sent');
  assert.equal(S.marketStatus({ submitted: false, locked: ['G2', 'G3'], closed: ['G1'] }, SLATE), 'partial', 'G4 was still open and never locked in');
  assert.equal(S.marketStatus({ submitted: false, locked: [], closed: SLATE }, SLATE), 'none', 'everything closed, nothing locked');
  assert.equal(S.marketStatus(undefined, SLATE), 'none');
  assert.equal(S.marketStatus({ submitted: true, locked: SLATE, satOut: true }, SLATE), 'sat_out', 'a sit-out wins over locked-in guesses (D-41 keeps their points, not the streak)');
  assert.equal(S.marketStatus({ submitted: true, locked: SLATE, eligible: false }, SLATE), 'none', 'a ballot that cannot score does not keep a streak');
});

test('a week is kept with both ballots sent, missed by any sit-out or at its last kickoff, and open until then', () => {
  assert.equal(S.pickWeek({ spread: 'sent', total: 'sent', closed: false }), 'kept', 'kept as soon as both are sent');
  assert.equal(S.pickWeek({ spread: 'sent', total: 'sat_out', closed: false }), 'missed', 'D-36: a sit-out, Skip or See picks now breaks it at once');
  assert.equal(S.pickWeek({ spread: 'sent', total: 'partial', closed: false }), 'open');
  assert.equal(S.pickWeek({ spread: 'sent', total: 'partial', closed: true }), 'missed', 'a week closes at its last kickoff');
  assert.equal(S.pickWeek({ spread: 'none', total: 'none', closed: true }), 'missed');
});

test('Pick streak: the open week keeps last week\'s streak alive ("Keep your 4-week streak"); a missed week resets it', () => {
  const w = (week, status) => ({ week, status });
  assert.deepEqual(S.pickStreak([w(1, 'kept'), w(2, 'kept'), w(3, 'kept'), w(4, 'kept'), w(5, 'open')]).current, 4);
  assert.deepEqual(S.pickStreak([w(1, 'kept'), w(2, 'kept'), w(3, 'kept'), w(4, 'kept'), w(5, 'kept')]).current, 5);
  const broken = S.pickStreak([w(1, 'kept'), w(2, 'kept'), w(3, 'missed'), w(4, 'kept'), w(5, 'missed')]);
  assert.deepEqual({ current: broken.current, best: broken.best, thisWeek: broken.thisWeek }, { current: 0, best: 2, thisWeek: 'missed' });
  assert.deepEqual(broken.runs, [{ from: 1, to: 2, length: 2 }, { from: 4, to: 4, length: 1 }]);
  assert.deepEqual(S.pickStreak([]), { current: 0, best: 0, thisWeek: null, runs: [] });
  assert.deepEqual(S.pickMilestones([w(1, 'kept'), w(2, 'kept'), w(3, 'missed'), w(4, 'kept'), w(5, 'kept'), w(6, 'kept')], 2), [{ week: 2, from: 1 }, { week: 5, from: 4 }], 'one milestone per run');
});

test('streak-input parity: Home and the job read a week the same way (pickWeekFor = pickWeek over marketStatus)', () => {
  const week = makeWeek({ ballots: [sent(ANA, 'spread'), sent(ANA, 'total'), sent(BO, 'spread')] });
  const before = Date.parse(kickoffAt(9, 4)) - HOUR, after = Date.parse(kickoffAt(9, 4));
  assert.equal(S.pickWeekFor(week, ANA, before), 'kept');
  assert.equal(S.pickWeekFor(week, BO, before), 'open', 'Bo can still send Total until the last kickoff');
  assert.equal(S.pickWeekFor(week, BO, after), 'missed', 'the week closes at its last kickoff');
  for (const [user, now] of [[ANA, before], [BO, before], [BO, after]]) {
    const status = market => S.marketStatus(week.ballots.find(b => b.userId === user && b.market === market), SLATE);
    assert.equal(S.pickWeekFor(week, user, now), S.pickWeek({ spread: status('spread'), total: status('total'), closed: now >= after }));
  }
});

test('Bets streak: wins in a row; pushes, voids and unsettled bets don\'t count; a loss ends it; ordered by kickoff', () => {
  const at = n => ({ kickoff: kickoffAt(9, n) });
  const bets = [
    { ...bet(ANA, 'G4', 'spread', 'home', -3, 'win'), ...at(4) }, // listed first, settles last
    { ...bet(ANA, 'G1', 'spread', 'home', -3, 'win'), ...at(1) },
    { ...bet(ANA, 'G2', 'spread', 'home', -3, 'push'), ...at(2) },
    { ...bet(ANA, 'G2', 'total', 'over', 40, 'void'), ...at(2) },
    { ...bet(ANA, 'G3', 'spread', 'home', -3, 'pending'), ...at(3) },
    { ...bet(ANA, 'G3', 'total', 'over', 40, 'win'), ...at(3) },
  ];
  const streak = S.betsStreak(bets);
  assert.deepEqual({ current: streak.current, best: streak.best }, { current: 3, best: 3 });
  assert.deepEqual(streak.milestones(3).map(b => b.gameId), ['G4']);
  const lost = S.betsStreak([...bets, { ...bet(ANA, 'G4', 'total', 'under', 40, 'loss'), ...at(4) }]);
  assert.deepEqual({ current: lost.current, best: lost.best }, { current: 0, best: 3 }, 'the G4 Total loss settles after the G4 Spread win');
});
