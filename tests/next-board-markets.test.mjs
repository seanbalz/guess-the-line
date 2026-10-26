import test from 'node:test';
import assert from 'node:assert/strict';
import { boardMarket, boardGate, marketBoard } from '../web/src/next/lines/boardMarkets.js';
import { SIX_HOURS } from '../web/src/next/lines/marketDetails.js';

const now = Date.parse('2026-10-26T20:00:00Z');
const card = { id: 'SEA-DEN', away: { code: 'SEA', nick: 'Seahawks' }, home: { code: 'DEN', nick: 'Broncos' },
  time: '5:15 PM PT', spread: { open: false }, total: { open: true, line: '43.5' }, tags: {} };
const row = { id: card.id, homeCode: 'DEN', awayCode: 'SEA', spread: { visible: false, value: 11.5, source: 'hidden' },
  total: { visible: true, value: 45.5, source: 'fixture', observedAt: new Date(now).toISOString() } };
const read = { status: 'ready', now, data: { games: [row] } };

test('board uses only the current reader, suppresses closed fields and keeps missing distinct from zero', () => {
  assert.deepEqual(boardMarket(card, row, 'spread', read), { open: false });
  assert.equal(boardMarket(card, row, 'total', read).line, '45.5');
  for (const status of ['loading', 'error']) {
    assert.equal(boardMarket(card, row, 'total', { status }).line, null);
    assert.deepEqual(boardMarket(card, row, 'spread', { status }), { open: false });
  }
  assert.equal(boardMarket(card, null, 'total', read).line, null);
  assert.equal(boardMarket(card, { ...row, total: { visible: true, value: 0 } }, 'total', read).line, '0');
  assert.equal(boardMarket(card, { ...row, total: { visible: true } }, 'total', read).label, 'Unavailable');
  assert.equal(boardMarket(card, row, 'total', { ...read, now: now + SIX_HOURS + 1 }).label, 'Latest recorded line');
  assert.equal(boardMarket(card, { ...row, total: { ...row.total, observedAt: null } }, 'total', read).label, 'Time unverified');
});

test('one gate names closed markets and sends the first closed market to the existing Play flow', () => {
  assert.equal(boardGate(read).market, 'spread');
  assert.match(boardGate(read).sentence, /^Some Spread lines/);
  assert.match(boardGate({ ...read, data: { games: [{ ...row, total: { visible: false } }] } }).sentence, /^Some Spread and Total/);
  assert.equal(boardGate({ status: 'error' }), null);
  assert.equal(boardGate({ ...read, data: { games: [] } }), null);
});

test('announcements use current quotes; a kickoff alone does not invent a live score or final', () => {
  const board = { groups: [{ cards: [card] }], started: null };
  const result = marketBoard(board, read).groups[0].cards[0];
  assert.match(result.aria, /Total 45.5. Current line/);
  assert.doesNotMatch(JSON.stringify(result), /11.5|hidden"|43.5/);
  const status = r => marketBoard(board, { ...read, data: { games: [r] } }).groups[0].cards[0].status;
  assert.equal(status({ ...row, started: true }), 'Kicked off');
  assert.equal(status({ ...row, final: { status: 'final', away: 0, home: 7 } }), 'Final · SEA 0–DEN 7');
  assert.equal(status({ ...row, final: { status: 'final', away: null, home: 7 } }), null);
});
