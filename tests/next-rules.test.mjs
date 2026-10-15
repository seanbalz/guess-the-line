import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pacificToUtc } from '../shared/nfl-schedule.mjs';
import { LATE_WINDOWS as CLOUD_LATE_WINDOWS, REVEAL_TIMES as CLOUD_REVEAL_TIMES, TODAYS_RULES as CLOUD_TODAYS_RULES, parseLiveRules } from '../cloud/live-rules.mjs';
import * as R from '../web/src/next/rules.js';
import * as C from '../web/src/next/copy.js';

// Redesign build plan, stage 7: the rule view model (D-39 per-game lock-in, amending D-36 and D-37). Each game and
// market is a draft, locked in, closed at kickoff, or forfeited by a skip or "See picks now"; locking in opens that
// game's line and everyone's picks for that market only. Fixture games and times only: no player, pick or line.
const pt = (date, time) => pacificToUtc(date, time);
const DEADLINE = pt('2026-10-15', '17:15'); // Thu 5:15 PM PT: the week's deadline and G1's kickoff
const GAMES = Object.freeze([
  { id: 'G1', kickoff: DEADLINE },
  { id: 'G2', kickoff: pt('2026-10-18', '10:00') },
  { id: 'G3', kickoff: pt('2026-10-18', '13:25') },
  { id: 'G4', kickoff: pt('2026-10-19', '17:15') }, // the last kickoff, Monday night
]);
const KO = Object.fromEntries(GAMES.map(g => [g.id, g.kickoff]));
const TUE = pt('2026-10-13', '13:03');
const FRI = pt('2026-10-16', '09:00'); // after the deadline: G1 has kicked off, G2 to G4 have not
const SUN = pt('2026-10-18', '12:00'); // G1 and G2 have kicked off
const LATER = pt('2026-10-20', '09:00'); // every game has kicked off
const LIVE = Object.freeze({ sentFinal: true, lateWindow: 'kickoff', revealAt: 'kickoff' }); // after M-01, M-02 and M-07
const TODAY = Object.freeze({ sentFinal: false, lateWindow: 'deadline', revealAt: 'deadline' }); // what the server sends today
const M01 = Object.freeze({ sentFinal: false, lateWindow: 'deadline', revealAt: 'kickoff' }); // M-01's per-game gate, nothing else yet
const MINUS = '−';

const deepFreeze = value => {
  if (value && typeof value === 'object') { for (const v of Object.values(value)) deepFreeze(v); Object.freeze(value); }
  return value;
};
const state = (input) => R.guessState({ deadline: DEADLINE, rules: LIVE, ...input });

test('the live rules: same fallback as the server, and malformed rules read as today\'s', () => {
  assert.deepEqual(R.TODAYS_RULES, CLOUD_TODAYS_RULES);
  assert.deepEqual(R.LATE_WINDOWS, CLOUD_LATE_WINDOWS);
  assert.deepEqual(R.REVEAL_TIMES, CLOUD_REVEAL_TIMES);
  assert.deepEqual(R.liveRules(LIVE), LIVE);
  assert.deepEqual(R.liveRules(M01), M01);
  assert.deepEqual(R.liveRules({ sentFinal: true, lateWindow: 'kickoff', extra: 1 }), LIVE, 'only the known keys pass; a kickoff late window reveals at kickoff');
  assert.deepEqual(R.liveRules({ sentFinal: true, lateWindow: 'kickoff', revealAt: 'deadline' }), LIVE, 'M-07 comes after M-01');
  assert.deepEqual(R.liveRules({ sentFinal: false, lateWindow: 'deadline' }), TODAY, 'no revealAt: the deadline opens the week');
  for (const raw of [undefined, null, [], 'kickoff', {}, { sentFinal: 'true', lateWindow: 'kickoff' }, { sentFinal: true, lateWindow: 'game' }, { sentFinal: true },
    { sentFinal: true, lateWindow: 'deadline', revealAt: 'game' }]) {
    assert.deepEqual(R.liveRules(raw), TODAY, JSON.stringify(raw));
  }
  assert.notEqual(R.liveRules(null), R.TODAYS_RULES, 'a copy, so a caller cannot change the frozen fallback');
  // The screens read the reply exactly as the server parsed the function's answer.
  for (const raw of [LIVE, M01, TODAY, { sentFinal: true, lateWindow: 'deadline' }, { sentFinal: true, lateWindow: 'kickoff', revealAt: 'deadline' }, { sentFinal: false, lateWindow: 'deadline', revealAt: null }, { sentFinal: 1, lateWindow: 'deadline' }, { sentFinal: false, lateWindow: 'deadline', revealAt: 'game' }]) {
    let served;
    try { served = parseLiveRules(raw); } catch { served = CLOUD_TODAYS_RULES; }
    assert.deepEqual(R.liveRules(raw), served, JSON.stringify(raw));
    assert.deepEqual(R.liveRules(served), served, `${JSON.stringify(raw)}: reading the reply again changes nothing`);
  }
});

test('when a pick closes: at its own kickoff once M-07 is live; today at the deadline, or the kickoff if earlier', () => {
  assert.equal(R.closesAt(KO.G3, DEADLINE, LIVE), Date.parse(KO.G3));
  assert.equal(R.closesAt(KO.G3, DEADLINE, TODAY), Date.parse(DEADLINE));
  const early = pt('2026-10-15', '06:30'); // a game before the Thursday deadline
  assert.equal(R.closesAt(early, DEADLINE, TODAY), Date.parse(early));
  assert.equal(R.closesAt(KO.G3, null, TODAY), Date.parse(KO.G3));
  assert.equal(R.closesAt(null, DEADLINE, LIVE), null);
});

test('open and draft: changes freely until kickoff; nothing is revealed', () => {
  const open = state({ kickoff: KO.G2, now: TUE });
  assert.equal(open.state, 'open');
  assert.equal(open.label, 'No pick yet');
  assert.equal(open.canEdit, true);
  assert.equal(open.canLockIn, false);
  assert.equal(open.value, null);

  const draft = state({ kickoff: KO.G2, entry: { value: -3 }, now: TUE });
  assert.equal(draft.state, 'draft');
  assert.equal(draft.label, 'Draft');
  assert.equal(draft.value, -3);
  assert.equal(draft.canEdit, true);
  assert.equal(draft.canLockIn, true);
  assert.equal(draft.counts, false);
  for (const s of [open, draft]) {
    assert.equal(s.lineVisible, false);
    assert.equal(s.picksVisible, false);
    assert.equal(s.pointsShown, false);
    assert.equal(s.wouldBeLate, false, 'before the deadline nothing is late');
    assert.equal(s.late, false);
  }
  // Still a draft one minute before kickoff; closed at kickoff.
  assert.equal(state({ kickoff: KO.G2, entry: { value: -3 }, now: Date.parse(KO.G2) - 60_000 }).state, 'draft');
  assert.equal(state({ kickoff: KO.G2, entry: { value: -3 }, now: KO.G2 }).state, 'closed');
});

test('locked in (sent): final, and it opens only that game\'s line and picks for that market', () => {
  const locked = { value: -3, lockedAt: TUE };
  const s = state({ kickoff: KO.G2, entry: locked, now: TUE });
  assert.equal(s.state, 'lockedIn');
  assert.equal(s.label, 'Locked in');
  assert.equal(s.final, true);
  assert.equal(s.canEdit, false);
  assert.equal(s.canLockIn, false);
  assert.equal(s.counts, true);
  assert.equal(s.value, -3);
  assert.equal(s.lineVisible, true);
  assert.equal(s.picksVisible, true);
  assert.equal(s.pointsShown, false, 'points show from kickoff');
  assert.equal(state({ kickoff: KO.G2, entry: locked, now: SUN }).pointsShown, true);

  // Spread on G2 locked in: G2's Total stays hidden, and so do the other games.
  const week = R.weekSummary({ games: GAMES, entries: { spread: { G2: locked }, total: { G2: { value: 44 } } }, deadline: DEADLINE, now: TUE, rules: LIVE });
  assert.equal(week.markets.spread.games.G2.lineVisible, true);
  assert.equal(week.markets.spread.games.G2.picksVisible, true);
  assert.equal(week.markets.total.games.G2.lineVisible, false);
  assert.equal(week.markets.total.games.G2.picksVisible, false);
  for (const id of ['G1', 'G3', 'G4']) {
    assert.equal(week.markets.spread.games[id].lineVisible, false, id);
    assert.equal(week.markets.total.games[id].picksVisible, false, id);
  }
  assert.equal(week.markets.spread.hidden, 3);
  assert.equal(week.markets.total.hidden, 4);
});

test('today\'s rules (sentFinal false): a sent pick reads "Submitted" and can change until the deadline', () => {
  const sent = { value: 41, lockedAt: TUE };
  const before = R.guessState({ kickoff: KO.G3, deadline: DEADLINE, entry: sent, now: TUE, rules: TODAY });
  assert.equal(before.state, 'lockedIn');
  assert.equal(before.label, 'Submitted');
  assert.equal(before.final, false);
  assert.equal(before.canEdit, true);
  assert.equal(before.lineVisible, true);
  const after = R.guessState({ kickoff: KO.G3, deadline: DEADLINE, entry: sent, now: FRI, rules: TODAY });
  assert.equal(after.canEdit, false, 'closed at the deadline');
  assert.equal(after.closesAt, Date.parse(DEADLINE));
  // A missing rules field is today's rules.
  assert.equal(R.guessState({ kickoff: KO.G3, deadline: DEADLINE, entry: sent, now: TUE }).label, 'Submitted');
});

test('after kickoff: an unlocked game is closed, its draft kept for its owner only, and everything shows', () => {
  const s = state({ kickoff: KO.G2, entry: { value: 2.5 }, now: SUN });
  assert.equal(s.state, 'closed');
  assert.equal(s.label, `Closed at kickoff · No pick`);
  assert.equal(s.closedAtKickoff, true);
  assert.equal(s.value, null, 'a closed draft is not a pick');
  assert.equal(s.unsentDraft, 2.5, 'D-23: the draft stays stored, for History');
  assert.equal(s.counts, false);
  assert.equal(s.canEdit, false);
  assert.equal(s.canLockIn, false);
  assert.equal(s.pointsShown, false, 'no pick: "—", never 0');
  assert.equal(s.lineVisible, true, 'kickoff opens the game for everyone');
  assert.equal(s.picksVisible, true);
  const none = state({ kickoff: KO.G2, now: SUN });
  assert.equal(none.state, 'closed');
  assert.equal(none.unsentDraft, null);

  // Today a game closes at the deadline, and the deadline opens the whole week for everyone (D-23, gtl_week_revealed).
  const today = R.guessState({ kickoff: KO.G3, deadline: DEADLINE, entry: { value: 2.5 }, now: FRI, rules: TODAY });
  assert.equal(today.state, 'closed');
  assert.equal(today.label, `Closed · No pick`);
  assert.equal(today.closedAtKickoff, false);
  assert.equal(today.unsentDraft, 2.5);
  assert.equal(today.lineVisible, true);
  assert.equal(today.picksVisible, true);
  // One minute before the deadline nothing has opened yet.
  const before = R.guessState({ kickoff: KO.G3, deadline: DEADLINE, entry: { value: 2.5 }, now: Date.parse(DEADLINE) - 60_000, rules: TODAY });
  assert.equal(before.state, 'draft');
  assert.equal(before.lineVisible, false);
  assert.equal(before.picksVisible, false);
  // With M-01's per-game gate (and picks still closing at the deadline) the game opens only at its kickoff.
  const gated = R.guessState({ kickoff: KO.G3, deadline: DEADLINE, entry: { value: 2.5 }, now: FRI, rules: M01 });
  assert.equal(gated.state, 'closed');
  assert.equal(gated.lineVisible, false);
  assert.equal(gated.picksVisible, false);
  assert.equal(R.guessState({ kickoff: KO.G3, deadline: DEADLINE, now: KO.G3, rules: M01 }).picksVisible, true);

  // The week on Friday under today's rules: every game of both markets is open to see, nothing is hidden.
  const week = R.weekSummary({ games: GAMES, entries: {}, deadline: DEADLINE, now: FRI, rules: TODAY });
  for (const market of R.MARKETS) {
    assert.equal(week.markets[market].hidden, 0, market);
    for (const id of ['G1', 'G2', 'G3', 'G4']) {
      assert.equal(week.markets[market].games[id].state, 'closed', `${market} ${id}`);
      assert.equal(week.markets[market].games[id].lineVisible, true, `${market} ${id}`);
      assert.equal(week.markets[market].games[id].picksVisible, true, `${market} ${id}`);
    }
  }
  assert.equal(R.weekSummary({ games: GAMES, entries: {}, deadline: DEADLINE, now: FRI, rules: M01 }).markets.spread.hidden, 3, 'M-01: G2 to G4 wait for kickoff');
});

test('late: after the deadline open games stay open until kickoff, and the stored marker shows (D-30, D-36)', () => {
  const open = state({ kickoff: KO.G3, now: FRI });
  assert.equal(open.state, 'open');
  assert.equal(open.canEdit, true);
  assert.equal(open.wouldBeLate, true);
  const late = state({ kickoff: KO.G3, entry: { value: 44, lockedAt: FRI, late: { minutes: 12 } }, now: FRI });
  assert.equal(late.late, true);
  assert.equal(late.lateMinutes, 12);
  assert.equal(late.lateText, 'Late · 12 min');
  assert.equal(late.wouldBeLate, false, 'already locked in');
  const unknownMinutes = state({ kickoff: KO.G3, entry: { value: 44, lockedAt: FRI, late: {} }, now: FRI });
  assert.equal(unknownMinutes.lateText, 'Late');
  // The marker comes from the server only: a ruled on-time pick saved later (D-25) is not marked here.
  const ruled = state({ kickoff: KO.G3, entry: { value: 44, lockedAt: FRI, late: null }, now: FRI });
  assert.equal(ruled.late, false);
  assert.equal(ruled.lateText, '');
  // A draft is never Late; only a locked-in pick carries the marker.
  assert.equal(state({ kickoff: KO.G3, entry: { value: 44, late: { minutes: 3 } }, now: FRI }).late, false);
  // Today there is no late window: after the deadline every game is closed, and open to see.
  const today = R.guessState({ kickoff: KO.G3, deadline: DEADLINE, now: FRI, rules: TODAY });
  assert.equal(today.state, 'closed');
  assert.equal(today.wouldBeLate, false);
  assert.equal(today.lineVisible, true);
});

test('sat out: skip and "See picks now" forfeit the rest of the week; locked-in picks keep counting', () => {
  const skip = { reason: 'skip', at: FRI };
  const entries = { G1: { value: 1 }, G2: { value: -3, lockedAt: TUE }, G3: { value: 7 } };
  const m = R.marketSummary({ market: 'spread', games: GAMES, entries, forfeit: skip, deadline: DEADLINE, now: SUN, rules: LIVE });
  assert.equal(m.games.G1.state, 'closed', 'G1 had closed before the skip');
  assert.equal(m.games.G2.state, 'lockedIn');
  assert.equal(m.games.G2.counts, true);
  assert.equal(m.games.G3.state, 'forfeited');
  assert.equal(m.games.G3.label, 'Skipped');
  assert.equal(m.games.G3.forfeitReason, 'skip');
  assert.equal(m.games.G3.unsentDraft, 7, 'D-23: the draft is kept');
  assert.equal(m.games.G3.canEdit, false);
  assert.equal(m.games.G4.state, 'forfeited');
  for (const id of ['G1', 'G2', 'G3', 'G4']) {
    assert.equal(m.games[id].lineVisible, true, id);
    assert.equal(m.games[id].picksVisible, true, id);
  }
  assert.equal(m.hidden, 0);
  assert.equal(m.phase, 'forfeited');
  assert.equal(m.due, false);
  assert.equal(m.status, 'Spread · Skipped · 1 locked in');

  const reveal = R.guessState({ kickoff: KO.G4, deadline: DEADLINE, forfeit: { reason: 'reveal', at: SUN }, now: SUN, rules: LIVE });
  assert.equal(reveal.label, 'Saw picks early');
  const sitOut = R.guessState({ kickoff: KO.G4, deadline: DEADLINE, forfeit: { reason: 'sitOut', at: TUE }, now: TUE, rules: TODAY });
  assert.equal(sitOut.label, 'Sat out');
  assert.equal(sitOut.lineVisible, true, 'a D-23 sit-out opens that market');
  assert.equal(R.guessState({ kickoff: KO.G4, deadline: DEADLINE, forfeit: { reason: 'other' }, now: TUE, rules: LIVE }).label, 'Sat out');

  // The forfeit's time decides whether a game had already closed (stage 7 review): G1 closed at Thursday's kickoff,
  // before a Sunday skip, so it stays "closed". Without the time nothing can tell, which is why the data layer must
  // pass the server's `at` (guessState's JSDoc).
  assert.equal(R.guessState({ kickoff: KO.G1, deadline: DEADLINE, forfeit: { reason: 'skip', at: SUN }, now: SUN, rules: LIVE }).state, 'closed');
  assert.equal(R.guessState({ kickoff: KO.G1, deadline: DEADLINE, forfeit: { reason: 'skip' }, now: SUN, rules: LIVE }).state, 'forfeited');
});

test('market summaries: one status line that Home, Play and History share', () => {
  const allLocked = Object.fromEntries(GAMES.map(g => [g.id, { value: 3, lockedAt: TUE }]));
  const week = R.weekSummary({ games: GAMES, entries: { spread: allLocked, total: { G1: { value: 44 }, G3: { value: 41 } } }, deadline: DEADLINE, now: TUE, rules: LIVE });
  assert.equal(week.markets.spread.status, 'Spread in');
  assert.equal(week.markets.total.status, 'Total 2 of 4');
  assert.equal(week.status, 'Spread in · Total 2 of 4');
  assert.deepEqual(week.due, ['total']);
  assert.equal(week.markets.total.phase, 'open');
  assert.equal(week.markets.total.nextClose, Date.parse(DEADLINE));
  assert.equal(week.markets.total.firstMissing, 'G2');
  assert.equal(week.markets.total.firstLeft, 'G1');
  assert.deepEqual(week.markets.total.order, ['G1', 'G2', 'G3', 'G4']);

  // After the deadline: G1's draft closed at kickoff, so "1 of 3 open", and the market is late.
  const fri = R.marketSummary({ market: 'total', games: GAMES, entries: { G1: { value: 44 }, G2: { value: 41 } }, deadline: DEADLINE, now: FRI, rules: LIVE });
  assert.equal(fri.closedNoPick, 1);
  assert.equal(fri.left, 3);
  assert.equal(fri.status, 'Total 1 of 3 open');
  assert.equal(fri.phase, 'late');
  assert.equal(fri.late, true);
  assert.equal(fri.nextClose, Date.parse(KO.G2));

  const missedOne = { ...allLocked };
  delete missedOne.G1;
  assert.equal(R.marketSummary({ market: 'spread', games: GAMES, entries: missedOne, deadline: DEADLINE, now: LATER, rules: LIVE }).status, 'Spread 3 of 4 in');
  const none = R.marketSummary({ market: 'spread', games: GAMES, entries: {}, deadline: DEADLINE, now: LATER, rules: LIVE });
  assert.equal(none.status, 'Spread · No picks');
  assert.equal(none.phase, 'done');
  assert.equal(none.scored, 0);
  const scored = R.marketSummary({ market: 'spread', games: GAMES, entries: allLocked, deadline: DEADLINE, now: SUN, rules: LIVE });
  assert.equal(scored.scored, 2, 'points show from each kickoff');
  const lateOne = R.marketSummary({ market: 'spread', games: GAMES, entries: { G3: { value: 1, lockedAt: FRI, late: { minutes: 945 } } }, deadline: DEADLINE, now: FRI, rules: LIVE });
  assert.equal(lateOne.anyLate, true);
  assert.equal(lateOne.games.G3.lateText, 'Late · 15 h 45 min');
  assert.throws(() => R.marketSummary({ market: 'moneyline', games: GAMES, now: TUE }), /Unknown market/);
});

test('skip and "See picks now" are allowed until the last kickoff while any pick is open (D-39)', () => {
  const at = now => R.weekSummary({ games: GAMES, deadline: DEADLINE, now, rules: LIVE });
  assert.equal(at(TUE).canForfeit, true);
  assert.equal(at(SUN).canForfeit, true, 'after Thursday\'s deadline too');
  assert.equal(at(Date.parse(KO.G4) - 60_000).canForfeit, true);
  assert.equal(at(KO.G4).canForfeit, false, 'not from the last kickoff');
  assert.equal(at(LATER).canForfeit, false);
  assert.equal(at(TUE).lastKickoff, Date.parse(KO.G4));

  const allLocked = Object.fromEntries(GAMES.map(g => [g.id, { value: 3, lockedAt: TUE }]));
  const nothingLeft = R.weekSummary({ games: GAMES, entries: { spread: allLocked, total: allLocked }, deadline: DEADLINE, now: TUE, rules: LIVE });
  assert.equal(nothingLeft.canForfeit, false, 'nothing left to forfeit');
  assert.equal(nothingLeft.keepsCounting, true);
  const oneLeft = R.weekSummary({ games: GAMES, entries: { spread: allLocked, total: {} }, forfeits: { total: null }, deadline: DEADLINE, now: TUE, rules: LIVE });
  assert.equal(oneLeft.canForfeit, true);
  assert.equal(oneLeft.keepsCounting, true);
  const forfeited = R.weekSummary({ games: GAMES, forfeits: { spread: { reason: 'skip', at: TUE }, total: { reason: 'skip', at: TUE } }, deadline: DEADLINE, now: TUE, rules: LIVE });
  assert.equal(forfeited.canForfeit, false, 'already forfeited');
  // Today every game closes at the deadline, so after it there is nothing to forfeit (the old sit-out refuses too).
  assert.equal(R.weekSummary({ games: GAMES, deadline: DEADLINE, now: FRI, rules: TODAY }).canForfeit, false);
  assert.equal(R.weekSummary({ games: [], now: TUE }).canForfeit, false);

  const week = at(TUE);
  assert.equal(R.canSeePicksNow(week, 'total', 'G3'), true);
  assert.equal(R.canSeePicksNow(week, 'total', 'nope'), false);
  const lockedG3 = R.weekSummary({ games: GAMES, entries: { total: { G3: { value: 41, lockedAt: TUE } } }, deadline: DEADLINE, now: TUE, rules: LIVE });
  assert.equal(R.canSeePicksNow(lockedG3, 'total', 'G3'), false, 'already visible');
  assert.equal(R.canSeePicksNow(at(LATER), 'total', 'G3'), false);
});

test('the gate banner: one per screen while a market\'s lines are hidden, with the way in and the skip', () => {
  const banner = (entries, now = TUE, rules = LIVE) => R.gateBanner(R.weekSummary({ games: GAMES, entries: { spread: entries }, deadline: DEADLINE, now, rules }), 'spread');
  const empty = banner({});
  assert.equal(empty.locked, true);
  assert.equal(empty.sentence, 'Lock in your Spread pick for a game to see its spread.');
  assert.equal(empty.cellSentence, 'Lock in your Spread pick to see this line.');
  assert.equal(empty.ctaLabel, 'Make Spread picks');
  assert.equal(empty.firstGame, 'G1');
  assert.equal(empty.canSkip, true);
  assert.equal(empty.skipLabel, "Skip this week's Guess the Line");
  assert.equal(banner({ G1: { value: 1 }, G2: { value: 2 } }).ctaLabel, 'Finish Spread picks · 2 left');
  const allDrafts = Object.fromEntries(GAMES.map(g => [g.id, { value: 3 }]));
  assert.equal(banner(allDrafts).ctaLabel, 'Lock in 4 Spread picks');
  assert.equal(banner(allDrafts, TUE, TODAY).ctaLabel, 'Submit Spread picks');
  const allLocked = Object.fromEntries(GAMES.map(g => [g.id, { value: 3, lockedAt: TUE }]));
  const open = banner(allLocked);
  assert.equal(open.locked, false);
  assert.equal(open.sentence, '');
  assert.equal(open.ctaLabel, '');
  assert.equal(open.canSkip, false);
  // Today, after the deadline with no ballot: the deadline opened every line, so there is no banner.
  const closed = banner({}, FRI, TODAY);
  assert.equal(closed.locked, false);
  assert.equal(closed.sentence, '');
  assert.equal(closed.ctaLabel, '');
  assert.equal(closed.canSkip, false);
  // With M-01's per-game gate: nothing can be picked, and the lines open at each kickoff.
  const gated = banner({}, FRI, M01);
  assert.equal(gated.locked, true);
  assert.equal(gated.sentence, "Spreads show at each game's kickoff.");
  assert.equal(gated.ctaLabel, '');
  assert.equal(gated.canSkip, false);
});

test('today\'s rules (sentFinal false): a market is submitted whole, so the gate says "Submit" and no single game locks in', () => {
  const week = (entries, rules = TODAY) => R.weekSummary({ games: GAMES, entries: { spread: entries }, deadline: DEADLINE, now: TUE, rules });
  // One draft, three games missing: the server would refuse the submission (GTL_BALLOT_INCOMPLETE).
  const oneDraft = week({ G1: { value: -3 } });
  const g1 = oneDraft.markets.spread.games.G1;
  assert.equal(g1.state, 'draft');
  assert.equal(g1.canLockIn, false);
  assert.equal(g1.canEdit, true);
  assert.equal(oneDraft.markets.spread.complete, false);
  assert.equal(oneDraft.markets.spread.canLockIn, false);
  const gate = R.gateBanner(oneDraft, 'spread');
  assert.equal(gate.locked, true);
  assert.equal(gate.sentence, 'Submit your Spread picks to see spreads.');
  assert.equal(gate.cellSentence, 'Submit your Spread picks to see this line.');
  assert.equal(gate.ctaLabel, 'Finish Spread picks · 3 left');
  assert.equal(R.gateBanner(week({}), 'total').sentence, 'Submit your Total picks to see totals.');
  assert.equal(R.guessState({ kickoff: KO.G2, deadline: DEADLINE, entry: { value: -3 }, now: TUE, rules: TODAY }).canLockIn, false, 'a lone game never locks in today');
  assert.equal(R.guessState({ kickoff: KO.G2, deadline: DEADLINE, entry: { value: -3 }, now: TUE }).canLockIn, false, 'missing rules read as today\'s');

  // Every game picked: the whole market can be submitted, and every draft goes with it.
  const allDrafts = week(Object.fromEntries(GAMES.map(g => [g.id, { value: 3 }])));
  assert.equal(allDrafts.markets.spread.complete, true);
  assert.equal(allDrafts.markets.spread.canLockIn, true);
  for (const id of ['G1', 'G2', 'G3', 'G4']) assert.equal(allDrafts.markets.spread.games[id].canLockIn, true, id);
  assert.equal(R.gateBanner(allDrafts, 'spread').ctaLabel, 'Submit Spread picks');
  assert.equal(allDrafts.markets.total.canLockIn, false, 'the other market has no picks');

  // Submitted: the whole market opens at once, and the picks can still change until the deadline.
  const submitted = week(Object.fromEntries(GAMES.map(g => [g.id, { value: 3, lockedAt: TUE }])));
  assert.equal(submitted.markets.spread.hidden, 0);
  assert.equal(submitted.markets.spread.games.G4.label, 'Submitted');
  assert.equal(submitted.markets.spread.games.G4.canEdit, true);
  assert.equal(submitted.markets.spread.canLockIn, false);
  assert.equal(R.gateBanner(submitted, 'spread').locked, false);

  // D-39 (sentFinal true): one game locks in on its own, with others still missing.
  const live = week({ G1: { value: -3 } }, LIVE);
  assert.equal(live.markets.spread.games.G1.canLockIn, true);
  assert.equal(live.markets.spread.canLockIn, true);
  assert.equal(live.markets.spread.complete, false);
  assert.equal(R.gateBanner(live, 'spread').sentence, 'Lock in your Spread pick for a game to see its spread.');
});

test('pure: inputs are never changed, the same input gives the same answer, and there is no clock', () => {
  const input = deepFreeze({ games: GAMES.map(g => ({ ...g })), entries: { spread: { G2: { value: -3, lockedAt: TUE } }, total: { G3: { value: 41 } } }, forfeits: { total: { reason: 'reveal', at: SUN } }, deadline: DEADLINE, now: SUN, rules: { ...LIVE } });
  const a = R.weekSummary(input);
  const b = R.weekSummary(input);
  assert.deepEqual(a, b);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a, 'plain JSON values only');
  assert.throws(() => R.guessState({ kickoff: KO.G2, deadline: DEADLINE }), /current time/);
  assert.throws(() => R.weekSummary({ games: GAMES, now: 'not a time' }), /current time/);
  for (const file of ['rules.js', 'copy.js']) {
    const source = readFileSync(new URL(`../web/src/next/${file}`, import.meta.url), 'utf8');
    for (const banned of [/Date\.now/, /new Date\(\)/, /\bwindow\./, /\bdocument\./, /localStorage/, /sessionStorage/, /\bfetch\(/, /Math\.random/, /getTimezoneOffset/]) {
      assert.doesNotMatch(source, banned, `${file}: ${banned}`);
    }
  }
});

test('copy: D-39 wording, "due" not "lock" for deadlines, real minus, no emoji', () => {
  assert.equal(C.dueIn(6), 'Week 6 picks due in');
  assert.equal(C.dueAt('Thu 5:15 PM PT'), 'Due Thu 5:15 PM PT');
  assert.equal(C.weekName(null), 'This week');
  assert.equal(C.marketName('total'), 'Total');
  assert.equal(C.marketName('overUnder'), '—');
  assert.equal(C.picksHidden('total', LIVE), "Friends' Total picks show after you lock in yours, or at kickoff.");
  assert.equal(C.picksHidden('total', TODAY), "Friends' Total picks show after you submit yours, or at the deadline.");
  assert.equal(C.picksHidden('total'), C.picksHidden('total', TODAY), 'missing rules read as today\'s');
  assert.equal(C.picksHidden('spread', M01), "Friends' Spread picks show after you submit yours, or at kickoff.");
  assert.equal(C.picksHidden('spread', { sentFinal: true, lateWindow: 'deadline', revealAt: 'deadline' }), "Friends' Spread picks show after you lock in yours, or at the deadline.");
  assert.equal(C.lineLocked('total', LIVE), 'Lock in your Total pick to see this line.');
  assert.equal(C.lineLocked('total', TODAY), 'Submit your Total picks to see this line.');
  assert.equal(C.lineLocked('total'), C.lineLocked('total', TODAY));
  assert.equal(C.lineLockedBanner('total', LIVE), 'Lock in your Total pick for a game to see its total.');
  assert.equal(C.lineLockedBanner('spread', TODAY), 'Submit your Spread picks to see spreads.');
  assert.equal(C.lineLockedBanner('spread'), C.lineLockedBanner('spread', TODAY));
  assert.equal(C.closedDraft(`SEA ${MINUS}2.5`, { rules: LIVE, atKickoff: true }), `Closed at kickoff · draft SEA ${MINUS}2.5 not locked in`);
  assert.equal(C.closedDraft(`SEA ${MINUS}2.5`, { rules: LIVE }), `Closed at kickoff · draft SEA ${MINUS}2.5 not locked in`, 'every game closes at its kickoff under M-07');
  assert.equal(C.closedDraft(`SEA ${MINUS}2.5`, { rules: TODAY }), `Closed · draft SEA ${MINUS}2.5 not submitted`, 'today a draft closes at the deadline');
  assert.equal(C.closedDraft(`SEA ${MINUS}2.5`), C.closedDraft(`SEA ${MINUS}2.5`, { rules: TODAY }));
  assert.equal(C.closedDraft('Over 44.5', { rules: TODAY, atKickoff: true }), 'Closed at kickoff · draft Over 44.5 not submitted');
  assert.equal(C.lateRule(LIVE, 'Thu 5:15 PM PT'), "Each game's pick closes at its kickoff. Picks locked in after Thu 5:15 PM PT are marked Late.");
  assert.equal(C.lateRule(TODAY, 'Thu 5:15 PM PT'), 'Picks close Thu 5:15 PM PT.');
  assert.equal(C.finalRule(LIVE), "Locked-in picks are final. Locking in a game's pick shows its line and friends' picks for that game.");
  assert.equal(C.finalRule(TODAY), 'You can change a sent pick until it closes.');

  const skip = C.skipDialog({ week: 6, keepsCounting: true, rules: LIVE });
  assert.equal(skip.title, 'Skip Week 6 Guess the Line?');
  assert.equal(skip.body, "Lines show right away. You can't lock in more Week 6 picks after this. It counts as sitting out and breaks your Pick streak.");
  assert.equal(skip.keep, 'Picks you already locked in still count.');
  assert.equal(skip.cancel, 'Keep playing');
  assert.equal(skip.confirm, 'Skip this week');
  assert.equal(skip.toast, "You're sitting out Week 6. Lines are open.");
  assert.equal(C.skipDialog({ week: 6, keepsCounting: false, rules: LIVE }).keep, '');
  const skipToday = C.skipDialog({ week: 6, keepsCounting: true, rules: TODAY });
  assert.equal(skipToday.body, "Lines show right away. You can't submit more Week 6 picks after this. It counts as sitting out and breaks your Pick streak.");
  assert.equal(skipToday.keep, 'Picks you already submitted still count.');
  assert.deepEqual(C.skipDialog({ week: 6, keepsCounting: true }), skipToday, 'missing rules read as today\'s');
  assert.equal(C.revealDialog({ week: 6, market: 'total', keepsCounting: true, rules: LIVE }).keep, 'Picks you already locked in still count.');
  assert.equal(C.revealDialog({ week: 6, market: 'total', keepsCounting: true, rules: TODAY }).keep, 'Picks you already submitted still count.');
  const reveal = C.revealDialog({ week: 6, market: 'total', keepsCounting: false });
  assert.equal(reveal.title, 'See picks now?');
  assert.equal(reveal.body, "Seeing friends' Total picks now ends your Week 6 Guess the Line. It counts as sitting out and breaks your Pick streak.");
  assert.equal(reveal.first, 'Make my picks first');
  assert.equal(reveal.confirm, 'See picks now');
  assert.equal(reveal.toast, "You're sitting out Week 6. Picks are open.");

  const strings = [
    ...Object.values(C.GUESS_STATE_LABEL), ...Object.values(C.FORFEIT_LABEL), ...Object.values(C.WHOS_IN_LABEL),
    C.SCORES_AT_KICKOFF, C.PICKS_STILL_OPEN, C.SKIP_LABEL, C.SEE_PICKS_NOW, C.LATE_NOW,
    C.dueIn(6), C.dueAt('Thu 5:15 PM PT'), C.linesAtKickoff('total'),
    C.lateRule(LIVE, 'Thu 5:15 PM PT'), C.lateRule(TODAY, 'Thu 5:15 PM PT'), C.finalRule(LIVE), C.finalRule(TODAY),
    ...[LIVE, TODAY, M01].flatMap(rules => [
      C.lineLocked('spread', rules), C.lineLockedBanner('total', rules), C.picksHidden('spread', rules), C.closedDraft(`SEA ${MINUS}2.5`, { rules }),
      ...Object.values(C.skipDialog({ week: 6, keepsCounting: true, rules })), ...Object.values(C.revealDialog({ week: 6, market: 'spread', keepsCounting: true, rules })),
    ]),
  ];
  for (const s of strings) {
    assert.equal(typeof s, 'string');
    assert.doesNotMatch(s, /-\d/, `no hyphen-minus before a number: ${s}`);
    assert.doesNotMatch(s, /\p{Extended_Pictographic}/u, `no emoji: ${s}`);
    assert.doesNotMatch(s, /\b(locks?|locked) (in )?(at|on|Thu|Mon)\b|picks lock\b/i, `deadlines are "due", not "lock" (D-39): ${s}`);
    assert.doesNotMatch(s, /15 min(utes)? after|extensions?|commissioner review/i, `no withdrawn late-window wording (DP-22): ${s}`);
  }
});
