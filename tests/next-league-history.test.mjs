// D-69 step 1 (P6A): League › History as plain data (web/src/next/league/historyModel.js). Contracts: every line note the
// old screen (CommunityHistory.jsx HistoryLine) showed stays (D-23); a withheld game is "Hidden" with no number (D-31);
// a week tile's rank is the shared competition rank of that week's points; no ballot and a sit-out are words, never 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lineWords, seasonTiles, weekGame, weekRank, weekSummary, weekTiles } from '../web/src/next/league/historyModel.js';

const game = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-09T00:15:00Z' };
const entry = (userId, weekPoints, patch = {}) => ({ userId, mode: 'guess_spread', status: 'submitted', eligible: true, weekPoints, weekScored: 2, ...patch });
const week = { season: 2026, week: 5, games: [game], results: { 'SEA-DEN': { status: 'final', away: 20, home: 17, source: 'Fixture final', origin: 'settlement' } },
  entries: [entry('a', 15), entry('b', 15), entry('c', 9), entry('d', null, { status: 'sat_out' })] };

test('the line keeps every note the old screen showed (D-23)', () => {
  assert.deepEqual(lineWords(null, 'guess_spread', game), { value: '—', notes: ['No line saved · draft'] });
  assert.deepEqual(lineWords({ basis: 'saved', status: 'pending', value: null, savedAt: '2026-10-08T18:00:00Z' }, 'guess_spread', game),
    { value: '—', notes: ['Pending · the first line after submission becomes this guess\'s reference', 'Saved Thu Oct 8, 11:00 AM PT'] });
  const imported = lineWords({ basis: 'line-at-guess', origin: 'imported-reference', value: 2.5, source: 'Fixture archive', sourceFile: 'data/snapshots/w5.json',
    observedAt: '2026-10-08T17:00:00Z', capturedAt: '2026-10-08T19:00:00Z', gapSeconds: 3600 }, 'guess_spread', game);
  assert.deepEqual(imported, { value: 'Seahawks −2.5', notes: ['Line at guess', 'Fixture archive · w5.json',
    'Provisional · page time as published by the source; captured Thu Oct 8, 12:00 PM PT', 'Observed Thu Oct 8, 10:00 AM PT · 1h 0m before the guess'] });
  assert.deepEqual(lineWords({ basis: 'commissioner-ruled', value: -8.5, decision: 'D-25' }, 'guess_spread', game), { value: 'Broncos −8.5', notes: ['Commissioner-ruled line (D-25)'] });
  assert.equal(lineWords({ basis: 'nearest-snapshot', value: 44 }, 'guess_total', game).notes[0], 'Nearest snapshot at submission · not used for points');
  assert.deepEqual(lineWords({ basis: 'none', reason: 'guess-at-or-after-kickoff' }, 'guess_spread', game), { value: '—', notes: ['No line stored', 'Guessed at or after kickoff'] });
  assert.deepEqual(lineWords({ basis: 'none', reason: null }, 'guess_spread', game).notes, ['No line stored', 'No snapshot was collected for this week']);
});
test('a withheld game is "Hidden" with no guess, line or points; a shown one keeps kickoff, the line\'s notes and the final', () => {
  const hidden = weekGame(week, { ...entry('b', 15), picksHidden: true, picks: [{ gameId: 'SEA-DEN', hidden: true, guess: null, reference: null, points: null }] }, game, 'guess_spread');
  assert.deepEqual([hidden.guess, hidden.line, hidden.points, hidden.hidden], ['Hidden', 'Hidden', 'Hidden', true]);
  assert.doesNotMatch(JSON.stringify(hidden), /\d+ \/ 10|−/);
  const shown = weekGame(week, { ...entry('a', 15), picks: [{ gameId: 'SEA-DEN', guess: -3, points: 10, reference: { basis: 'saved', status: 'available', value: -3, source: 'Fixture median' } }] }, game, 'guess_spread');
  assert.deepEqual([shown.guess, shown.line, shown.points], ['Broncos −3', 'Broncos −3', '10 / 10']);
  assert.deepEqual(shown.notes, ['Kickoff Thu Oct 8, 5:15 PM PT', 'Line saved with guess', 'Fixture median', 'Final · SEA 20, DEN 17 · Seahawks by 3 · Fixture final']);
});
// D-23: each note the old screen's Result and Points cells showed comes back with its wording and condition (table of cases).
test('each game result note keeps the old wording: no final, the margin, Tie, the total (D-23)', () => {
  const pick = { ...entry('a', 0), picks: [{ gameId: 'SEA-DEN', guess: -3, points: null, reference: null }] };
  const final = (results, mode = 'guess_spread') => weekGame({ ...week, results }, pick, game, mode).notes.at(-1);
  for (const [name, results, mode, expected] of [
    ['no final recorded', {}, 'guess_spread', 'No final recorded'],
    ['away margin', { 'SEA-DEN': { status: 'final', away: 20, home: 17, source: 'S' } }, 'guess_spread', 'Final · SEA 20, DEN 17 · Seahawks by 3 · S'],
    ['home margin', { 'SEA-DEN': { status: 'final', away: 10, home: 17, source: 'S' } }, 'guess_spread', 'Final · SEA 10, DEN 17 · Broncos by 7 · S'],
    ['tie', { 'SEA-DEN': { status: 'final', away: 17, home: 17, source: 'S' } }, 'guess_spread', 'Final · SEA 17, DEN 17 · Tie · S'],
    ['total market', { 'SEA-DEN': { status: 'final', away: 20, home: 17, origin: 'commissioner_reported' } }, 'guess_total', 'Final · SEA 20, DEN 17 · 37 total points · Commissioner-reported final'],
  ]) assert.equal(final(results, mode), expected, name);
});
test('each game points cell keeps the old reasons: Not scored practice or not eligible, Scores at kickoff, Unscored (D-23)', () => {
  const ref = { basis: 'saved', status: 'available', value: -3, source: 'M' };
  const cell = (entryPatch, pick, now, gate = { open: true }) => weekGame({ ...week, gate }, { ...entry('a', 0), ...entryPatch, picks: [{ gameId: 'SEA-DEN', guess: -3, reference: ref, points: null, ...pick }] }, game, 'guess_spread', now).points;
  const before = '2026-10-08T20:00:00Z', after = '2026-10-09T03:00:00Z';
  for (const [name, patch, pick, now, gate, expected] of [
    ['practice ballot', { eligible: false, eligibility: 'practice' }, {}, after, undefined, 'Not scored · practice'],
    ['ruled ineligible', { eligible: false, eligibility: 'ruled-ineligible' }, {}, after, undefined, 'Not scored · not eligible'],
    ['ineligible with no stated reason reads practice', { eligible: false }, {}, after, undefined, 'Not scored · practice'],
    ['sent, per-game gate live, before kickoff', {}, {}, before, undefined, 'Scores at kickoff'],
    ['sent, past kickoff, no points', {}, {}, after, undefined, 'Unscored'],
    ['no per-game gate', {}, {}, before, null, 'Unscored'],
    ['no saved line', {}, { reference: null }, before, undefined, 'Unscored'],
    ['a draft', { status: 'draft' }, {}, before, undefined, 'Unscored'],
    ['scored', {}, { points: 7 }, after, undefined, '7 / 10'],
  ]) assert.equal(cell(patch, pick, now, gate), expected, name);
  assert.equal(weekGame({ ...week, gate: { open: true } }, { ...entry('b', 15), picksHidden: true, picks: [{ gameId: 'SEA-DEN', hidden: true, guess: null, reference: { value: -3 }, points: null }] }, game, 'guess_spread', '2026-10-08T20:00:00Z').points, 'Hidden');
});
test('a game that did not finish keeps the old screen\'s words: "Postponed" or "Cancelled", then its source (D-23)', () => {
  const pick = { ...entry('a', 0), picks: [{ gameId: 'SEA-DEN', guess: -3, points: null, reference: null }] };
  const status = result => weekGame({ ...week, results: { 'SEA-DEN': result } }, pick, game, 'guess_spread').notes.at(-1);
  assert.equal(status({ status: 'postponed', source: 'NFL notice' }), 'Postponed · NFL notice');
  assert.equal(status({ status: 'cancelled', source: 'NFL notice' }), 'Cancelled · NFL notice');
  assert.equal(status({ status: 'postponed' }), 'Postponed');
  assert.doesNotMatch(JSON.stringify(weekGame({ ...week, results: { 'SEA-DEN': { status: 'cancelled' } } }, pick, game, 'guess_spread').notes), /postponed|cancelled/);
});
test('week tiles: the week\'s points and its shared rank; a sit-out and no ballot are words, never 0', () => {
  assert.deepEqual([weekRank(week, 'b', 'guess_spread'), weekRank(week, 'c', 'guess_spread'), weekRank(week, 'd', 'guess_spread')], [{ rank: 1, of: 3 }, { rank: 3, of: 3 }, null]);
  const data = { weeks: [week, { ...week, week: 4, entries: [] }] };
  assert.deepEqual(weekTiles(data, 'a', 'guess_spread').map(t => [t.label, t.big, t.sub, t.aria]), [
    ['Week 4', '—', 'No ballot', 'Week 4, no points, No ballot'], ['Week 5', '15', '1st', 'Week 5, 15 points, 1st of 3']]);
  assert.equal(weekTiles(data, 'd', 'guess_spread').at(-1).sub, 'Sat out');
});
test('the week\'s words: status, Late and points on the surface; the time note, ruling and revisions behind ⓘ', () => {
  assert.deepEqual(weekSummary({ ...entry('a', 15), submittedAt: '2026-10-08T18:00:00Z', late: { minutes: 12 }, submittedAtKnown: false, ruling: { decision: 'D-25' }, updatedAt: '2026-10-08T18:00:00Z', revisions: 2 }),
    { status: 'Submitted · Thu Oct 8, 11:00 AM PT · Late · 12 min', points: '15 pts · 2 games scored',
      notes: ['Original submission time was not recorded; the stored time is shown.', 'Commissioner ruling · D-25', 'Last saved Thu Oct 8, 11:00 AM PT · 2 revisions'] });
  assert.equal(weekSummary(null).status, 'No ballot.');
  assert.equal(weekSummary(entry('d', null, { status: 'sat_out' })).status, 'Sat out. Recorded as sat out, not zero.');
  assert.equal(weekSummary(entry('a', 0, { eligible: false })).points, 'Not eligible for scoring');
});
test('season tiles appear only with a second season, newest first, the one showing marked in words', () => {
  assert.equal(seasonTiles({ season: 2026, seasons: [2026] }), null);
  assert.deepEqual(seasonTiles({ season: 2026, seasons: [2025, 2026] }).map(t => [t.big, t.sub, t.on]), [['2026', 'Showing', true], ['2025', 'See weeks', false]]);
});
