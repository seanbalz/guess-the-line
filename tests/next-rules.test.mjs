import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pacificToUtc } from '../shared/nfl-schedule.mjs';
import { LATE_WINDOWS as CLOUD_LATE_WINDOWS, TODAYS_RULES as CLOUD_TODAYS_RULES } from '../cloud/live-rules.mjs';
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
const LIVE = Object.freeze({ sentFinal: true, lateWindow: 'kickoff' }); // after M-02 and M-07
const TODAY = Object.freeze({ sentFinal: false, lateWindow: 'deadline' }); // what the server sends today
const MINUS = '−';

const deepFreeze = value => {
  if (value && typeof value === 'object') { for (const v of Object.values(value)) deepFreeze(v); Object.freeze(value); }
  return value;
};
const state = (input) => R.guessState({ deadline: DEADLINE, rules: LIVE, ...input });

test('the live rules: same fallback as the server, and malformed rules read as today\'s', () => {
  assert.deepEqual(R.TODAYS_RULES, CLOUD_TODAYS_RULES);
  assert.deepEqual(R.LATE_WINDOWS, CLOUD_LATE_WINDOWS);
  assert.deepEqual(R.liveRules(LIVE), LIVE);
  assert.deepEqual(R.liveRules({ sentFinal: true, lateWindow: 'kickoff', extra: 1 }), LIVE, 'only the known keys pass');
  for (const raw of [undefined, null, [], 'kickoff', {}, { sentFinal: 'true', lateWindow: 'kickoff' }, { sentFinal: true, lateWindow: 'game' }, { sentFinal: true }]) {
    assert.deepEqual(R.liveRules(raw), TODAY, JSON.stringify(raw));
  }
  assert.notEqual(R.liveRules(null), R.TODAYS_RULES, 'a copy, so a caller cannot change the frozen fallback');
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

  // Today a game closes at the deadline but opens only at its kickoff (M-01's per-game gate).
  const today = R.guessState({ kickoff: KO.G3, deadline: DEADLINE, entry: { value: 2.5 }, now: FRI, rules: TODAY });
  assert.equal(today.state, 'closed');
  assert.equal(today.label, `Closed · No pick`);
  assert.equal(today.closedAtKickoff, false);
  assert.equal(today.lineVisible, false);
  assert.equal(today.picksVisible, false);
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
  // Today there is no late window: after the deadline every game is closed.
  const today = R.guessState({ kickoff: KO.G3, deadline: DEADLINE, now: FRI, rules: TODAY });
  assert.equal(today.state, 'closed');
  assert.equal(today.wouldBeLate, false);
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
  // Today, after the deadline with no ballot: nothing can be picked, and the lines open at each kickoff.
  const closed = banner({}, FRI, TODAY);
  assert.equal(closed.locked, true);
  assert.equal(closed.sentence, "Spreads show at each game's kickoff.");
  assert.equal(closed.ctaLabel, '');
  assert.equal(closed.canSkip, false);
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
  assert.equal(C.picksHidden('total'), "Friends' Total picks show after you lock in yours, or at kickoff.");
  assert.equal(C.closedDraft(`SEA ${MINUS}2.5`), `Closed at kickoff · draft SEA ${MINUS}2.5 not locked in`);
  assert.equal(C.lateRule(LIVE, 'Thu 5:15 PM PT'), "Each game's pick closes at its kickoff. Picks locked in after Thu 5:15 PM PT are marked Late.");
  assert.equal(C.lateRule(TODAY, 'Thu 5:15 PM PT'), 'Picks close Thu 5:15 PM PT.');
  assert.equal(C.finalRule(LIVE), "Locked-in picks are final. Locking in a game's pick shows its line and friends' picks for that game.");
  assert.equal(C.finalRule(TODAY), 'You can change a sent pick until it closes.');

  const skip = C.skipDialog({ week: 6, keepsCounting: true });
  assert.equal(skip.title, 'Skip Week 6 Guess the Line?');
  assert.equal(skip.body, "Lines show right away. You can't lock in more Week 6 picks after this. It counts as sitting out and breaks your Pick streak.");
  assert.equal(skip.keep, 'Picks you already locked in still count.');
  assert.equal(skip.cancel, 'Keep playing');
  assert.equal(skip.confirm, 'Skip this week');
  assert.equal(skip.toast, "You're sitting out Week 6. Lines are open.");
  assert.equal(C.skipDialog({ week: 6, keepsCounting: false }).keep, '');
  const reveal = C.revealDialog({ week: 6, market: 'total', keepsCounting: false });
  assert.equal(reveal.title, 'See picks now?');
  assert.equal(reveal.body, "Seeing friends' Total picks now ends your Week 6 Guess the Line. It counts as sitting out and breaks your Pick streak.");
  assert.equal(reveal.first, 'Make my picks first');
  assert.equal(reveal.confirm, 'See picks now');
  assert.equal(reveal.toast, "You're sitting out Week 6. Picks are open.");

  const strings = [
    ...Object.values(C.GUESS_STATE_LABEL), ...Object.values(C.FORFEIT_LABEL), ...Object.values(C.WHOS_IN_LABEL),
    C.SCORES_AT_KICKOFF, C.PICKS_STILL_OPEN, C.SKIP_LABEL, C.SEE_PICKS_NOW, C.LATE_NOW,
    C.dueIn(6), C.dueAt('Thu 5:15 PM PT'), C.lineLocked('spread'), C.lineLockedBanner('total'), C.linesAtKickoff('total'), C.picksHidden('spread'),
    C.lateRule(LIVE, 'Thu 5:15 PM PT'), C.lateRule(TODAY, 'Thu 5:15 PM PT'), C.finalRule(LIVE), C.finalRule(TODAY),
    ...Object.values(C.skipDialog({ week: 6, keepsCounting: true })), ...Object.values(C.revealDialog({ week: 6, market: 'spread', keepsCounting: true })),
  ];
  for (const s of strings) {
    assert.equal(typeof s, 'string');
    assert.doesNotMatch(s, /-\d/, `no hyphen-minus before a number: ${s}`);
    assert.doesNotMatch(s, /\p{Extended_Pictographic}/u, `no emoji: ${s}`);
    assert.doesNotMatch(s, /\b(locks?|locked) (in )?(at|on|Thu|Mon)\b|picks lock\b/i, `deadlines are "due", not "lock" (D-39): ${s}`);
    assert.doesNotMatch(s, /15 min(utes)? after|extensions?|commissioner review/i, `no withdrawn late-window wording (DP-22): ${s}`);
  }
});
