import test from 'node:test';
import assert from 'node:assert/strict';
import { betResultWords, betWords, betsRecord, changeLines, entryFor, gameRow, guessWords, referenceWords, weekPointsWords, weekStatus } from '../web/src/next/me/historyFormat.js';

// Me › History in plain words (redesign build plan stages 73 and 74; DP-15). Contracts: every value reads as a team and number
// or a total, never an id or JSON; a value the server withheld stays "—" or hidden; another member's forfeit reason is never
// worded (it reads "Sat out", as Home's who's in shows it); a draft closed at kickoff and the Late marker are worded for the
// owner (D-30, D-39).
const GAME = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-16T00:15:00Z' };
const MARKET = { mode: 'guess_spread', games: [GAME] };

test('guesses and lines in words: the favorite and margin, a total as a number, "—" when missing', () => {
  assert.equal(guessWords('guess_spread', GAME, 2.5), 'SEA −2.5');
  assert.equal(guessWords('guess_spread', GAME, -3), 'DEN −3');
  assert.equal(guessWords('guess_spread', GAME, 0), "Pick'em");
  assert.equal(guessWords('guess_total', GAME, 44.5), '44.5');
  assert.equal(guessWords('guess_spread', GAME, null), '—');
  assert.equal(referenceWords('guess_spread', GAME, { basis: 'commissioner-ruled', status: 'available', value: -8.5 }), 'Commissioner-ruled line DEN −8.5');
  assert.equal(referenceWords('guess_total', GAME, { basis: 'saved', status: 'available', value: 46 }), 'Line at your guess 46');
  assert.equal(referenceWords('guess_spread', GAME, { basis: 'first_line_after_submission', status: 'pending' }), 'Line pending');
  assert.equal(referenceWords('guess_spread', GAME, { basis: 'none', status: 'unavailable', value: null }), 'No line stored');
  assert.equal(referenceWords('guess_spread', GAME, null), null);
});

test('a week\'s status: your own forfeit reason, another member\'s "Sat out", Late, the stored-time and eligibility notes', () => {
  const satOut = { status: 'sat_out', picks: null };
  assert.equal(weekStatus(satOut, { own: true, forfeit: { reason: 'reveal' } }).word, 'Saw picks early');
  assert.equal(weekStatus(satOut, { own: true, forfeit: { reason: 'skip' } }).word, 'Skipped');
  assert.equal(weekStatus(satOut, { own: true }).word, 'Sat out', 'the old sit-out, with no forfeit record');
  assert.equal(weekStatus(satOut, { own: false, forfeit: { reason: 'reveal' } }).word, 'Sat out', 'another member\'s reason is not worded');
  const sean = { status: 'submitted', submittedAtKnown: false, eligibility: 'ruled-eligible', late: null, weekPoints: 95.8, weekScored: 15, games: 15, eligible: true };
  assert.deepEqual(weekStatus(sean), { word: 'Submitted', tone: 'win', late: null, notes: ['Original time not recorded', 'Ruled eligible'] });
  assert.equal(weekPointsWords(sean), '95.8 pts · 15 of 15 scored');
  assert.deepEqual(weekStatus({ status: 'submitted', eligibility: 'practice', ruling: { decision: 'D-25' } }).notes, ['Practice · unofficial', 'Commissioner-ruled lines']);
  assert.equal(weekStatus({ status: 'submitted', late: { minutes: 125 } }).late, 'Late · 2 h 5 min');
  const partial = { status: 'draft', picks: [{ gameId: 'A', lockedIn: true, guess: 1.5 }, { gameId: 'B', lockedIn: false, guess: 2.5 }] };
  assert.equal(weekStatus(partial).word, '1 locked in');
  assert.equal(weekStatus({ status: 'draft', picks: [{ lockedIn: false, guess: 2 }] }).word, 'Draft');
  assert.equal(weekStatus(null).word, 'No ballot');
  assert.equal(weekPointsWords({ status: 'submitted', eligible: false }), 'Not eligible for scoring');
  assert.equal(weekPointsWords({ status: 'submitted', eligible: true, weekPoints: null, weekScored: 0, games: 15 }), null, 'nothing scored is not a zero');
  const week = { entries: [{ userId: 'u', mode: 'guess_spread', status: 'submitted' }, { userId: 'u', mode: 'guess_spread', status: 'sat_out' }] };
  assert.equal(entryFor(week, 'u', 'guess_spread').status, 'sat_out', 'a sat-out entry wins');
});

test('a game row: hidden stays hidden; your draft closed at kickoff is worded; the final reads in teams', () => {
  const week = { results: { 'SEA-DEN': { status: 'final', home: 24, away: 20 } } };
  const now = Date.parse('2026-10-20T00:00:00Z');
  const hidden = gameRow(week, { mode: 'guess_spread', picksHidden: true, picks: [{ gameId: 'SEA-DEN', hidden: true }] }, GAME, { now });
  assert.deepEqual([hidden.hidden, hidden.guess, hidden.line, hidden.points], [true, null, null, null]);
  const draft = gameRow(week, { mode: 'guess_spread', status: 'draft', picks: [{ gameId: 'SEA-DEN', guess: 2.5, lockedIn: false }] }, GAME, { own: true, now, rules: { sentFinal: true, lateWindow: 'kickoff' } });
  assert.equal(draft.closedDraft, 'Closed at kickoff · draft SEA −2.5 not locked in');
  assert.equal(draft.final, 'Final · SEA 20, DEN 24');
  const notOwn = gameRow(week, { mode: 'guess_spread', status: 'draft', picks: [{ gameId: 'SEA-DEN', guess: 2.5, lockedIn: false }] }, GAME, { own: false, now });
  assert.equal(notOwn.closedDraft, null, 'only the owner\'s drafts are worded');
  const scored = gameRow(week, { mode: 'guess_spread', status: 'submitted', eligible: true, picks: [{ gameId: 'SEA-DEN', guess: -3, lockedIn: true, points: 9, late: { minutes: 12 },
    reference: { basis: 'saved', status: 'available', value: -3.5, source: 'The Odds API', observedAt: '2026-10-15T20:00:00Z' } }] }, GAME, { now });
  assert.deepEqual([scored.guess, scored.line, scored.points, scored.late], ['DEN −3', 'Line at your guess DEN −3.5', '9 pts', 'Late · 12 min']);
  assert.deepEqual(scored.detail, ['Source · The Odds API', 'Observed Thu Oct 15, 1:00 PM PT']);
});

test('your changes in plain words: drafts, lock-ins with their line, D-16 edits, a resolved line, a ruled import and Late', () => {
  const at = '2026-10-15T20:00:00Z';
  const line = (games, extra = {}) => changeLines(MARKET, { type: 'x', at, late: null, ruled: null, games, ...extra });
  assert.deepEqual(line([{ gameId: 'SEA-DEN', kind: 'draft', before: null, after: 2.5 }]).map(l => l.text), ['SEA @ DEN: draft SEA −2.5']);
  assert.deepEqual(line([{ gameId: 'SEA-DEN', kind: 'draft', before: 2.5, after: 3 }]).map(l => l.text), ['SEA @ DEN: draft SEA −2.5 to SEA −3']);
  assert.deepEqual(line([{ gameId: 'SEA-DEN', kind: 'locked', before: 3, after: 3, reference: { status: 'available', value: 3.5 } }]).map(l => l.text), ['SEA @ DEN: locked in SEA −3 · line SEA −3.5']);
  assert.deepEqual(line([{ gameId: 'SEA-DEN', kind: 'locked', before: 3, after: 3, reference: { status: 'pending', value: null } }]).map(l => l.text), ['SEA @ DEN: locked in SEA −3 · line pending']);
  assert.deepEqual(line([{ gameId: 'SEA-DEN', kind: 'edited', before: 3, after: -1, reference: { status: 'available', value: 1.5 } }]).map(l => l.text), ['SEA @ DEN: changed SEA −3 to DEN −1 after submitting · line SEA −1.5']);
  assert.deepEqual(line([{ gameId: 'SEA-DEN', kind: 'resolved', reference: { status: 'available', value: -2.5 } }]).map(l => l.text), ['SEA @ DEN: line found · first line after submission DEN −2.5']);
  assert.deepEqual(line([{ gameId: 'SEA-DEN', kind: 'locked', before: null, after: 1, reference: null }], { ruled: { decision: 'D-25' } }).map(l => l.text), ['SEA @ DEN: locked in SEA −1 · commissioner-ruled (D-25)']);
  const late = line([{ gameId: 'SEA-DEN', kind: 'locked', before: 1, after: 1 }], { late: { minutes: 12 } })[0];
  assert.deepEqual([late.at, late.late], ['Thu Oct 15, 1:00 PM PT', 'Late · 12 min']);
  assert.equal(line([{ gameId: 'SEA-DEN', kind: 'draft', before: null, after: 1 }], { at: null })[0].at, 'Time not recorded');
  assert.ok(!JSON.stringify(line([{ gameId: 'SEA-DEN', kind: 'draft', before: null, after: 1 }])).includes('SEA-DEN'), 'never the raw game id (DP-15)');
});

test('Virtual Units bets in words: side, line and units; a closed market keeps side and units; results with words', () => {
  assert.equal(betWords(GAME, { market: 'spread', selection: { side: 'home', line: -3, units: 1.5 } }), 'DEN −3 · 1.5U');
  assert.equal(betWords(GAME, { market: 'total', selection: { side: 'over', line: 45.5, units: 2 } }), 'Over 45.5 · 2U');
  assert.equal(betWords(GAME, { market: 'spread', selection: { side: 'away', units: 1 } }), 'SEA · 1U', 'a friend\'s closed market: no line');
  assert.deepEqual(betResultWords({ status: 'win', result: { status: 'win', netUnits: 0.9091 } }), { word: 'WIN', tone: 'win', units: '+0.91U' });
  assert.deepEqual(betResultWords({ status: 'loss', result: { status: 'loss', netUnits: -2 } }), { word: 'LOST', tone: 'loss', units: '−2U' });
  assert.equal(betResultWords({ status: 'push', result: { status: 'push', netUnits: 0 } }).word, 'PUSH');
  assert.equal(betResultWords({ status: 'pending', result: null }).word, 'PENDING');
  assert.deepEqual(betsRecord([{ status: 'win', result: { status: 'win', netUnits: 0.91 } }, { status: 'loss', result: { status: 'loss', netUnits: -2 } }, { status: 'pending' }]),
    { record: '1–1–0', net: '−1.09U', bets: '3 bets' });
  assert.equal(betsRecord([{ status: 'pending' }]).net, '—', 'nothing settled is not a zero');
});

// Stage 74: the older records in words (read-only; Q8). Contracts: a selection reads with its grade and final; an archived
// journal record keeps its label and its reasons; the journal summary counts active placed bets only; a real slip's locked
// leg says its line is hidden; a note's change reads as what changed.
test('older records in words: Betting Challenge selections, notes, forecasts, the journal and real slips', async () => {
  const { challengeWeeks, forecastWords, journalChanges, journalSummary, journalWords, noteChanges, olderSections, selectionWords, slipWords } = await import('../web/src/next/me/historyFormat.js');
  assert.deepEqual(olderSections.map(s => s.id), ['challenge', 'saved', 'forecasts', 'journal', 'slips', 'archives', 'benchmark']);
  const won = selectionWords(GAME, { market: 'spread', side: 'home', line: -3, grade: 'W', final: { status: 'final', home: 24, away: 20 } });
  assert.deepEqual(won, { pick: 'DEN −3', grade: 'Won', final: 'Final · SEA 20, DEN 24' });
  assert.equal(selectionWords(GAME, { market: 'total', side: 'over', line: 44.5, grade: null, final: null }).grade, 'Not graded yet');
  assert.equal(selectionWords(GAME, { market: 'total', side: 'over', line: 44.5, grade: null, final: { status: 'postponed' } }).grade, 'Postponed');
  const weeks = challengeWeeks({ challenge: { selections: [{ season: 2026, week: 5 }, { season: 2026, week: 6 }], hidden: [{ season: 2026, week: 6, userId: 'x', count: 2 }] } });
  assert.deepEqual(weeks.map(w => [w.week, w.selections.length, w.hidden.length]), [[6, 1, 1], [5, 1, 0]]);
  assert.deepEqual(noteChanges([{ at: null, before: null, after: { saved: false, notes: 'Wind' } }, { at: null, before: { saved: false, notes: 'Wind' }, after: { saved: true, notes: 'Wind' } },
    { at: null, before: { saved: true, notes: 'Wind' }, after: { saved: true, notes: '' } }]).map(l => l.text), ['Note: Wind', 'Saved', 'Note cleared']);
  const forecast = forecastWords(GAME, { market: 'total', value: 49.5, savedAt: '2026-10-15T20:00:00Z', changes: [{ after: 47 }, { after: 49.5 }] });
  assert.deepEqual([forecast.market, forecast.value, forecast.history], ['Total', '49.5', '47 → 49.5 · saved Thu Oct 15, 1:00 PM PT']);
  const bet = { kind: 'user_reported_placed_bet', market: 'spread', side: 'home', line: -3, odds: -110, source: 'FanDuel', outcome: 'win', currency: 'USD', stakeMinor: 1100, returnedMinor: 2100,
    archived: false, createdAt: '2026-10-15T20:00:00Z', quotedAt: null, retrospective: false };
  assert.deepEqual(journalWords(GAME, bet), { kind: 'Placed bet', pick: 'DEN −3 −110 · FanDuel', outcome: 'WIN', tone: 'win', money: 'Stake USD 11.00 · returned USD 21.00',
    meta: 'Recorded Thu Oct 15, 1:00 PM PT · user-reported' });
  assert.deepEqual(journalChanges([{ action: 'journal/create', at: null, reason: null }, { action: 'journal/archive', at: null, reason: 'Twice', after: { archived: true } },
    { action: 'journal/archive', at: null, reason: 'Kept', after: { archived: false } }]).map(l => l.text), ['Recorded', 'Archived: Twice', 'Restored: Kept']);
  const summary = journalSummary([bet, { ...bet, archived: true, outcome: 'loss' }, { ...bet, kind: 'research_note', currency: null, stakeMinor: null, returnedMinor: null }]);
  assert.equal(summary.headline, '3 records · 1 placed bet · 1–0–0', 'the archived bet and the note are listed, never counted');
  assert.deepEqual(summary.lines, ['USD · net USD 10.00 · ROI 90.9% · 1 settled bet']);
  const slip = slipWords({ ownerName: 'Troy', outcome: 'win', kind: 'single', legs: [{ selection: 'DAL -8.5' }, { selection: 'Seahawks', locked: true }], odds: -110, stakeUnits: 1, netUnits: 0.91, source: 'FanDuel', notes: 'Early' }, false);
  assert.deepEqual(slip, { owner: 'Troy', outcome: 'WIN', tone: 'win', legs: ['DAL -8.5', 'Seahawks · line hidden until your pick is in, or kickoff'], terms: '−110 · 1U · +0.91U · FanDuel', note: 'Early' });
  assert.equal(slipWords({ outcome: 'pending', legs: [] }, true).owner, 'You');
});
