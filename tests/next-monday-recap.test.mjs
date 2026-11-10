// Monday recap (design/monday-recap-2026-11-05): the pure rules in web/src/next/home/recapModel.js over a
// `/league/comparison` reply. Fictional fixtures only. Each test names the contract it guards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecap, friendText, gameState, isGameId, leftText, missScale, ownText, pointsWord, recapFriend, recapGames, resultWords, weekStanding } from '../web/src/next/home/recapModel.js';
import { shortName } from '../web/src/communityFormat.js';

const SUN = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', away: 'Seattle Seahawks', home: 'Denver Broncos', kickoff: '2026-11-08T21:05:00Z' };
const MNF = { id: 'MIA-GB', awayCode: 'MIA', homeCode: 'GB', away: 'Miami Dolphins', home: 'Green Bay Packers', kickoff: '2026-11-10T01:15:00Z' };
const ME = 'me', TROY = 'troy', LUKE = 'luke';
const members = [{ id: LUKE, displayName: 'Luke Jun' }, { id: ME, displayName: 'Sean B' }, { id: TROY, displayName: 'Troy Jun' }];
const ref = value => ({ value, source: 'Fixture median', observedAt: '2026-11-05T17:00:00Z', basis: 'saved' });
const pick = (gameId, guess, line, points) => ({ gameId, guess, points, reference: ref(line), lockedIn: true, lockedAt: '2026-11-05T18:00:00Z', hidden: false });
const entry = (userId, picks, weekPoints, extra = {}) => ({ userId, mode: 'guess_spread', status: 'submitted', eligible: true, picks, hiddenGames: [], weekPoints, weekScored: weekPoints === null ? 0 : 1, ...extra });
// Sunday: DEN 27, SEA 20 (DEN by 7). You DEN −3 against a saved DEN −3.5: 0.5 off. Troy DEN −2 against DEN −3.5: 1.5 off.
// Monday night: you locked GB −4.5; Troy's MNF guess is not open to you yet (the database sends no number, hidden).
const OPEN = { [SUN.id]: { spread: true, total: false }, [MNF.id]: { spread: false, total: false } };
const week9 = (entries, gate = OPEN, results = { [SUN.id]: { status: 'final', away: 20, home: 27, source: 'Fixture' } }) => ({ season: 2026, week: 9, games: [MNF, SUN], gate, results, revealed: { guess_spread: false, guess_total: false }, entries });
const MINE = entry(ME, [pick(SUN.id, -3, -3.5, 9.5), { gameId: MNF.id, guess: -4.5, points: null, reference: ref(-4), lockedIn: true, lockedAt: '2026-11-07T18:00:00Z', hidden: false }], 9.5);
const TROYS = entry(TROY, [pick(SUN.id, -2, -3.5, 8.5), { gameId: MNF.id, hidden: true }], 8.5);
const LUKES = entry(LUKE, [pick(SUN.id, -7, -3.5, 11)], 11);
const reply = (weeks, now = '2026-11-09T23:00:00Z') => ({ viewer: ME, season: 2026, seasons: [2026], now, members, weeks });
const MONDAY = reply([week9([MINE, TROYS, LUKES])]);

test('Monday: the week is provisional with the Monday night game pending; games run in kickoff order', () => {
  const recap = buildRecap(MONDAY, { season: 2026, week: 9, market: 'spread', friendId: TROY });
  assert.equal(recap.provisional, true);
  assert.equal(recap.left, 1);
  assert.equal(leftText(recap.left), '1 game left');
  assert.deepEqual(recap.games.map(g => [g.game.id, g.state]), [[SUN.id, 'final'], [MNF.id, 'upcoming']]);
  const mnf = recap.games[1];
  assert.equal(ownText(mnf, 'guess_spread'), 'You Packers −4.5 · scores at kickoff');
  assert.equal(mnf.me.miss, null, 'no miss before the game is scored, never zero');
  assert.equal(mnf.final, null);
  // After kickoff it is LIVE until the final is recorded; then the week is final.
  assert.equal(buildRecap(reply(MONDAY.weeks, '2026-11-10T02:00:00Z'), { week: 9 }).games[1].state, 'live');
  const done = reply([week9([MINE, TROYS, LUKES], OPEN, { [SUN.id]: { status: 'final', away: 20, home: 27 }, [MNF.id]: { status: 'final', away: 17, home: 24 } })], '2026-11-10T05:00:00Z');
  const final = buildRecap(done, { week: 9 });
  assert.equal(final.provisional, false);
  assert.equal(leftText(final.left), 'All games final');
});

test('D-31: a friend’s guess for a game not open to you is hidden with no value, whatever the reply holds', () => {
  // A provider fault: Troy's MNF guess arrives with numbers although your gate for it is shut.
  const leaky = { ...TROYS, picks: [TROYS.picks[0], pick(MNF.id, -13.5, -12.5, 7)] };
  const recap = buildRecap(reply([week9([MINE, leaky, LUKES])]), { week: 9, friendId: TROY });
  const mnf = recap.games.find(g => g.game.id === MNF.id);
  assert.deepEqual(mnf.friend, { state: 'hidden' });
  assert.equal(mnf.verdict, null);
  assert.doesNotMatch(JSON.stringify(mnf), /13\.5|12\.5/);
  assert.equal(friendText(mnf, 'guess_spread'), 'Troy’s guess opens at kickoff');
  // Without your own lock, the hint says both ways it opens.
  const unlocked = { ...MINE, picks: [MINE.picks[0], { gameId: MNF.id, guess: -4.5, lockedIn: false, reference: null, points: null }] };
  const draft = buildRecap(reply([week9([unlocked, leaky, LUKES])]), { week: 9, friendId: TROY }).games[1];
  assert.equal(ownText(draft, 'guess_spread'), 'Your draft was not locked in');
  assert.equal(friendText(draft, 'guess_spread'), 'Lock yours or wait for kickoff to see Troy’s guess');
  // Each market is its own gate: the Sunday game is open for Spread, not for Total.
  const total = buildRecap(reply([week9([MINE, leaky, LUKES])]), { week: 9, market: 'total', friendId: TROY });
  assert.ok(total.games.every(g => g.friend.state === 'hidden'));
});

test('each miss is measured against that player’s own saved line, and the verdict names who was closer', () => {
  const sun = buildRecap(MONDAY, { week: 9, friendId: TROY }).games[0];
  assert.equal(sun.me.miss, 0.5);
  assert.equal(sun.friend.miss, 1.5);
  assert.equal(sun.me.line, -3.5);
  assert.equal(sun.friend.line, -3.5);
  assert.deepEqual(sun.verdict, { lead: 'you', text: 'You were 1 point closer than Troy.' });
  assert.equal(ownText(sun, 'guess_spread'), 'You Broncos −3 · 0.5 off');
  assert.equal(friendText(sun, 'guess_spread'), 'Troy Broncos −2 · 1.5 off');
  // A friend whose saved line differs: Luke DEN −7 against DEN −3.5 is 3.5 off.
  const luke = buildRecap(MONDAY, { week: 9, friendId: LUKE }).games[0];
  assert.deepEqual(luke.verdict, { lead: 'you', text: 'You were 3 points closer than Luke.' });
  // Equal misses are a tie, said in words.
  const even = { ...TROYS, picks: [pick(SUN.id, -4, -3.5, 9.5)] };
  assert.deepEqual(buildRecap(reply([week9([MINE, even])]), { week: 9, friendId: TROY }).games[0].verdict, { lead: 'even', text: 'You and Troy were equally close.' });
  const behind = { ...TROYS, picks: [pick(SUN.id, -3.5, -3.5, 10)] };
  assert.deepEqual(buildRecap(reply([week9([MINE, behind])]), { week: 9, friendId: TROY }).games[0].verdict, { lead: 'friend', text: 'Troy was 0.5 points closer than you.' });
});

test('the final score is a separate comparison: the winning margin, what your guess implied and the gap', () => {
  const sun = buildRecap(MONDAY, { week: 9, friendId: TROY }).games[0];
  assert.deepEqual(resultWords(sun, 'guess_spread', shortName), { headline: 'Broncos won by 7.', detail: 'Your guess implied Broncos by 3, 4 points from the final margin.' });
  const tie = { ...sun, final: { away: 20, home: 20 } };
  assert.equal(resultWords(tie, 'guess_spread', shortName).headline, 'Tie game.');
  assert.deepEqual(resultWords({ ...sun, me: { ...sun.me, guess: 45 } }, 'guess_total', shortName), { headline: '47 total points.', detail: 'Your guess was 45, 2 points away.' });
  assert.equal(resultWords({ ...sun, me: { ...sun.me, guess: null } }, 'guess_spread', shortName).detail, 'You had no locked guess.');
  assert.equal(resultWords(buildRecap(MONDAY, { week: 9 }).games[1], 'guess_spread', shortName), null, 'a pending game has no result');
});

test('weekly standings: Spread and Total separately, competition ranks with ties shared, the gap in words', () => {
  const w = MONDAY.weeks[0];
  assert.deepEqual(weekStanding(MONDAY, w, 'guess_spread'), { rank: 2, of: 3, tied: false, points: 9.5, label: '2nd', line: '1.5 points behind Luke' });
  assert.deepEqual(weekStanding(MONDAY, w, 'guess_total'), { rank: null, of: 0, tied: false, points: null, label: '—', line: 'No scored games yet' });
  const lead = reply([week9([{ ...MINE, weekPoints: 12 }, TROYS, LUKES])]);
  assert.equal(weekStanding(lead, lead.weeks[0], 'guess_spread').line, 'Leading Luke by 1');
  const tied = reply([week9([{ ...MINE, weekPoints: 11 }, TROYS, LUKES])]);
  assert.deepEqual(weekStanding(tied, tied.weeks[0], 'guess_spread'), { rank: 1, of: 3, tied: true, points: 11, label: 'T-1st', line: 'Tied for 1st with Luke' });
  const tiedBehind = reply([week9([MINE, { ...TROYS, weekPoints: 11 }, LUKES])]);
  assert.equal(weekStanding(tiedBehind, tiedBehind.weeks[0], 'guess_spread').line, '1.5 points behind 2 leaders');
  // A sit-out, a draft and an ineligible ballot never rank; nothing counts as zero.
  const others = reply([week9([MINE, { ...TROYS, status: 'sat_out' }, { ...LUKES, eligible: false }])]);
  assert.deepEqual(weekStanding(others, others.weeks[0], 'guess_spread'), { rank: 1, of: 1, tied: false, points: 9.5, label: '1st', line: 'Only scored player so far' });
});

test('the friend is a member of this roster: a chosen one stays, otherwise Compare’s default; alone, no friend', () => {
  assert.equal(recapFriend(MONDAY, TROY).id, TROY);
  assert.equal(recapFriend(MONDAY, 'stranger').id, recapFriend(MONDAY).id);
  assert.equal(recapFriend(MONDAY, ME).id === ME, false, 'never yourself');
  const alone = { ...MONDAY, members: [members[1]] };
  assert.equal(recapFriend(alone), null);
  const recap = buildRecap(alone, { week: 9 });
  assert.equal(recap.friend, null);
  assert.equal(friendText(recap.games[0], 'guess_spread'), null);
});

test('a week that is not in the reply, or another season, has no recap; game ids follow the shell allowlist', () => {
  assert.equal(buildRecap(MONDAY, { week: 8 }), null);
  assert.equal(buildRecap(MONDAY, { season: 2025, week: 9 }), null);
  assert.equal(isGameId('MIA-GB'), true);
  assert.equal(isGameId('mia-gb'), false);
  assert.equal(isGameId('<script>'), false);
});

test('postponed and cancelled games are not left to play; a game with no clock is never assumed kicked off', () => {
  const w = week9([MINE], OPEN, { [SUN.id]: { status: 'final', away: 20, home: 27 }, [MNF.id]: { status: 'postponed' } });
  assert.equal(recapGames(w, Date.parse('2026-11-12T00:00:00Z')).left, 0);
  assert.equal(gameState(w, { id: 'X-Y', kickoff: null }, Date.parse('2026-11-12T00:00:00Z')), 'upcoming');
  assert.equal(gameState(w, MNF, NaN), 'postponed');
});

test('the miss chart’s scale comes from the labeled values; words for points', () => {
  const scale = missScale([0.5, 1.5]);
  assert.equal(scale.max, 2);
  assert.deepEqual(scale.ticks, [0, 1, 2]);
  assert.equal(scale.width(0.5), 0.25);
  assert.equal(scale.width(null), 0);
  assert.deepEqual(missScale([0, 0]).ticks, [0, 1], 'two exact guesses still draw a scale');
  assert.deepEqual(missScale([9]).ticks, [0, 4.5, 9]);
  assert.equal(pointsWord(1), '1 point');
  assert.equal(pointsWord(0.5), '0.5 points');
});
