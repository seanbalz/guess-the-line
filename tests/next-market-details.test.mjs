import test from 'node:test';
import assert from 'node:assert/strict';
import { bestRecordedBook, lineState, marketTime, marketValue, movementGeometry, SIX_HOURS } from '../web/src/next/lines/marketDetails.js';
const now = Date.parse('2026-10-26T12:00:00Z');
const game = { awayCode: 'SEA', homeCode: 'DEN' };
test('line freshness uses observed time and never calls unknown, future or missing evidence current', () => {
  const line = { value: 0, observedAt: new Date(now - SIX_HOURS).toISOString(), capturedAt: new Date(now).toISOString() };
  assert.equal(lineState(line, now), 'Current line');
  assert.equal(lineState(line, now + 1), 'Latest recorded line');
  assert.equal(lineState({ ...line, observedAt: null }, now), 'Time unverified');
  assert.equal(lineState({ ...line, observedAt: new Date(now + 1).toISOString() }, now), 'Time unverified');
  assert.equal(lineState({ ...line, value: null }, now), 'Unavailable');
  assert.equal(marketValue(game, 'spread', -3.5), 'DEN −3.5');
  assert.equal(marketValue(game, 'spread', 3.5), 'DEN +3.5');
  assert.equal(marketValue(game, 'total', null), '—');
  assert.equal(marketTime(null), '—');
  assert.match(marketTime(new Date(now).toISOString()), /2026.*PT$/);
});
test('best recorded compares the selected side, rejects missing lines/prices and keeps timestamps meaningful', () => {
  const book = (key, line, price = -110) => ({ book: key, line, observedAt: new Date(now).toISOString(), prices: { home: price, away: price, over: price, under: price } });
  const books = [book('a', -3), book('b', -4, 100), book('missing', null, 200)];
  assert.equal(bestRecordedBook(books, 'spread', 'home', now), 'a');
  assert.equal(bestRecordedBook(books, 'spread', 'away', now), 'b');
  assert.equal(bestRecordedBook([book('a', 43), book('b', 44)], 'total', 'over', now), 'a');
  assert.equal(bestRecordedBook([book('a', 43), book('b', 44)], 'total', 'under', now), 'b');
  assert.equal(bestRecordedBook([book('a', 43, null)], 'total', 'over', now), null);
  assert.equal(bestRecordedBook([{ ...book('a', 43), observedAt: null }], 'total', 'over', now), null);
  assert.equal(bestRecordedBook(books, 'spread', 'home', now - 1), null);
});
test('movement uses elapsed time, retains zero and breaks at missing observations instead of inventing points', () => {
  const row = (minutes, value) => ({ capturedAt: new Date(now + minutes * 60000).toISOString(), value });
  const geometry = movementGeometry([row(0, -2), row(1, 0), row(10, 2)]);
  assert.equal(geometry.points[0].x, 12);
  assert.equal(geometry.points[1].x, 41.6);
  assert.equal(geometry.points[2].x, 308);
  assert.equal(geometry.low, -2); assert.equal(geometry.high, 2);
  const missing = movementGeometry([row(0, 0), row(1, null), row(2, 1)]);
  assert.equal(missing.points.length, 2); assert.equal(missing.path.includes('L'), false);
  assert.equal(movementGeometry([row(0, 0)]).points[0].y, 70);
  assert.equal(movementGeometry([{ capturedAt: null, value: 3 }]).points.length, 0);
});

test('kickoff uses the recorded time scale without extending or inventing history', () => {
  const time = minutes => new Date(now + minutes * 60000).toISOString();
  const rows = [{ capturedAt: time(0), value: -2 }, { capturedAt: time(10), value: 2 }];
  for (const [minutes, x] of [[0, 12], [2, 71.2], [5, 160], [10, 308]]) {
    const marked = movementGeometry(rows, time(minutes));
    assert.equal(marked.kickoffX, x);
    assert.equal(marked.path, movementGeometry(rows).path);
    assert.deepEqual(marked.points, movementGeometry(rows).points);
  }
  for (const kickoff of [null, undefined, 'invalid', time(-1), time(11)]) assert.equal(movementGeometry(rows, kickoff).kickoffX, null);
  for (const observations of [[], [rows[0]], [rows[0], rows[0]], [{ capturedAt: null, value: -2 }]]) {
    assert.equal(movementGeometry(observations, time(0)).kickoffX, null);
  }
  const missing = movementGeometry([rows[0], { capturedAt: time(5), value: null }, rows[1]], time(5));
  assert.equal(missing.kickoffX, 160);
  assert.equal(missing.path.includes('L'), false);
});
