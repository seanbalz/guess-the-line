import test from 'node:test';
import assert from 'node:assert/strict';
import { boardMarket, boardGate, marketBoard, recordedFinal } from '../web/src/next/lines/boardMarkets.js';
import { SIX_HOURS } from '../web/src/next/lines/marketDetails.js';

const now = Date.parse('2026-10-26T20:00:00Z');
const card = { id: 'SEA-DEN', away: { code: 'SEA', nick: 'Seahawks' }, home: { code: 'DEN', nick: 'Broncos' },
  time: '5:15 PM PT', started: true, kickoff: '2026-10-26T18:00:00Z', spread: { open: false }, total: { open: true, line: '43.5' }, tags: {} };
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
  const status = r => { const view = marketBoard(board, { ...read, data: { games: [r] } }); return [...view.groups.flatMap(g => g.cards), ...(view.finals?.cards ?? [])][0].status; };
  assert.equal(status({ ...row, started: true }), 'Kickoff passed');
  assert.equal(status({ ...row, started: true, final: { status: 'final', away: 0, home: 7 } }), 'Final · SEA 0–DEN 7');
  assert.equal(status({ ...row, started: true, final: { status: 'final', away: null, home: 7 } }), 'Kickoff passed');
});

const finalRow = { ...row, started: true, final: { status: 'final', away: 0, home: 7, source: 'Fixture source', observedAt: new Date(now - 60000).toISOString(), origin: 'settlement' } };

test('final presentation keeps zero and ties, credits reported results and distinguishes unverified source times', () => {
  const result = recordedFinal(card, finalRow, read);
  assert.equal(result.score, 'Final · SEA 0–DEN 7');
  assert.match(result.provenance, /Result source: Fixture source.*Observed.*PT/);
  assert.match(recordedFinal(card, { ...finalRow, final: { ...finalRow.final, away: 7 } }, read).score, /SEA 7–DEN 7/);
  assert.match(recordedFinal(card, { ...finalRow, final: { ...finalRow.final, origin: 'commissioner_reported' } }, read).provenance, /Commissioner-reported result/);
  for (const observedAt of [null, 'not a time', new Date(now + 1).toISOString()]) {
    assert.match(recordedFinal(card, { ...finalRow, final: { ...finalRow.final, source: '', observedAt } }, read).provenance, /Source unavailable.*Result time unverified/);
  }
});

test('incomplete, non-final and mismatched results never become a final or open a closed market', () => {
  for (const value of [null, '7', -1, 7.5, Infinity, NaN]) {
    assert.equal(recordedFinal(card, { ...finalRow, final: { ...finalRow.final, away: value } }, read), null);
  }
  for (const patch of [{ id: 'SEA-SF' }, { awayCode: 'SF' }, { homeCode: 'SF' }, { started: false }, { final: { ...finalRow.final, status: 'postponed' } }]) {
    assert.equal(recordedFinal(card, { ...finalRow, ...patch }, read), null);
  }
  assert.equal(recordedFinal({ ...card, started: false }, finalRow, read), null);
  for (const status of ['loading', 'error']) assert.equal(recordedFinal(card, finalRow, { ...read, status }), null);
});

test('final sections retain each card once and vanish while refreshing without retaining source or score', () => {
  const later = { ...card, id: 'SEA-SF', home: { code: 'SF', nick: '49ers' } };
  const board = { groups: [], started: { label: 'Kicked off', count: 2, cards: [card, later] } };
  const view = marketBoard(board, { ...read, data: { games: [finalRow, { ...row, id: later.id, started: true }] } });
  assert.equal(view.started.label, 'Kickoff passed');
  assert.equal(view.started.count, 1); assert.equal(view.started.cards[0].id, later.id);
  assert.equal(view.finals.count, 1); assert.equal(view.finals.cards[0].id, card.id);
  assert.deepEqual(view.finals.cards[0].spread, { open: false });
  assert.match(view.finals.cards[0].aria, /Final.*Result source: Fixture source/);
  for (const status of ['loading', 'error']) {
    const next = marketBoard(board, { ...read, status, data: { games: [finalRow] } });
    assert.equal(next.finals, null); assert.equal(next.started.count, 2);
    assert.doesNotMatch(JSON.stringify(next), /Fixture source|Final · SEA/);
  }
});
