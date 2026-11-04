// D-69 step 3 (spec 5 and 6, "The board becomes picture rows"): one board card as one row, as plain data. Contract: the
// row's face is the marks, the matchup, one meta line and the consensus Spread over its word; a closed market is a lock,
// never "—"; every word for a state is a word, not a color; and the row's spoken name keeps everything the card said
// (the Total, your saved guesses, a trend, the weather), so nothing leaves the screen reader.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROW_WORDS, boardRow, withRecords } from '../web/src/next/lines/boardRows.js';
import { rememberBoard, rememberedBoard } from '../web/src/next/lines/boardContext.js';

const card = (patch = {}) => ({ id: 'SEA-DEN', matchup: 'SEA @ DEN', away: { code: 'SEA', nick: 'Seahawks' }, home: { code: 'DEN', nick: 'Broncos' },
  time: '1:05 PM PT', showTime: false, started: false, final: null, spread: { open: true, line: 'DEN −1.5', label: 'Current line' },
  aria: 'Seahawks at Broncos, Sun 1:05 PM PT. Spread DEN −1.5. Current line. Total 43.5. Your total pick 44. Trend: Broncos at home. Open game details', ...patch });

test('an open line: the quote over "Current"; the records as the meta line, said after the matchup in the name', () => {
  const row = boardRow(card(), { away: '3–2', home: '2–2–1' });
  assert.deepEqual([row.id, row.title, row.value, row.word, row.tone], ['SEA-DEN', 'SEA @ DEN', { text: 'DEN −1.5', line: true }, 'Current', 'plain']);
  assert.deepEqual(row.meta, ['3–2 · 2–2–1']);
  assert.match(row.ariaLabel, /^Seahawks at Broncos, Sun 1:05 PM PT\. Records: Seahawks 3–2, Broncos 2–2–1\. Spread DEN −1\.5/);
  for (const kept of ['Total 43.5', 'Your total pick 44', 'Trend: Broncos at home']) assert.ok(row.ariaLabel.includes(kept), kept);
});

test('a closed market is a lock with "Locked", never "—"; loading has no word; a missing quote says "No line"', () => {
  assert.deepEqual([boardRow(card({ spread: { open: false } })).value, boardRow(card({ spread: { open: false } })).word], [{ lock: true }, 'Locked']);
  const loading = boardRow(card({ spread: { open: true, line: null, label: 'Loading', loading: true } }));
  assert.deepEqual([loading.value, loading.word], [{ loading: true }, null]);
  const missing = boardRow(card({ spread: { open: true, line: null, label: 'Unavailable' } }));
  assert.deepEqual([missing.value, missing.word], [{ text: '—', line: false }, 'No line']);
});

test('an old or unverified quote says so in its word, with the pending tone; a kickoff or a final says that instead', () => {
  for (const [label, word] of [['Latest recorded line', 'Latest'], ['Time unverified', 'Unverified']]) {
    const row = boardRow(card({ spread: { open: true, line: 'DEN −1.5', label } }));
    assert.deepEqual([row.word, row.tone], [word, 'warn'], label);
  }
  assert.equal(boardRow(card({ started: true })).word, 'Kicked off');
  const final = boardRow(card({ started: true, final: { score: 'Final · SEA 24–DEN 17' } }), { away: '3–2', home: '2–2–1' });
  assert.deepEqual([final.word, final.tone, final.meta], ['Final', 'plain', ['SEA 24–DEN 17']]);
  assert.deepEqual(Object.values(ROW_WORDS), ['Current', 'Latest', 'Unverified', 'No line']);
});

test('several kickoff times in one group put the time first in the meta line; no records and no time is no meta line', () => {
  assert.deepEqual(boardRow(card({ showTime: true }), { away: '3–2', home: null }).meta, ['1:05 PM PT', '3–2 · —']);
  assert.deepEqual(boardRow(card(), null).meta, []);
  assert.equal(withRecords('A at B, Sun. Spread hidden', card(), null), 'A at B, Sun. Spread hidden');
});

test('the board’s order is kept in memory only, for the layer’s pager; anything else forgets it', () => {
  rememberBoard({ accountId: 'u-1', season: 2026, week: 6, ids: ['SEA-DEN'], now: 1, results: {} });
  assert.deepEqual(rememberedBoard().ids, ['SEA-DEN']);
  rememberBoard('not a context');
  assert.equal(rememberedBoard(), null);
});
