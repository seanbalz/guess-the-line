import test from 'node:test';
import assert from 'node:assert/strict';
import { modalReturnTarget } from '../web/src/next/ui/useModal.js';

const element = (key, isConnected = true) => ({ isConnected, getAttribute: () => key });
const doc = (...elements) => ({ querySelectorAll: () => elements });

test('modal close keeps a connected opener and reconnects a recreated card only within the captured scope', () => {
  const original = element('board-1:SEA-DEN'), replacement = element('board-1:SEA-DEN'), other = element('board-2:SEA-DEN');
  assert.equal(modalReturnTarget(original, 'board-1:SEA-DEN', doc(replacement)), original);
  original.isConnected = false;
  assert.equal(modalReturnTarget(original, 'board-1:SEA-DEN', doc(other, replacement)), replacement);
  assert.equal(modalReturnTarget(original, 'board-1:SEA-DEN', doc(other)), null);
  // React may reuse the same DOM node for a different week's/account's card.
  original.isConnected = true; original.getAttribute = () => 'board-2:SEA-DEN';
  assert.equal(modalReturnTarget(original, 'board-1:SEA-DEN', doc(original, other)), null);
});

test('unkeyed openers retain the existing behavior and never gain a guessed fallback', () => {
  const original = element(null), replacement = element(null);
  assert.equal(modalReturnTarget(original, null, doc(replacement)), original);
  original.isConnected = false;
  assert.equal(modalReturnTarget(original, null, doc(replacement)), null);
  assert.equal(modalReturnTarget(null, null, doc(replacement)), null);
});
