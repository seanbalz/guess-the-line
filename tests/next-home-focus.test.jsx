// D-69 step 2 (H1A): where focus goes on Home when the thing that had it goes away. No DOM in this suite, so the rules
// are pure functions over plain values; the real focus is asserted by the browser spec. Each test names its contract.
import { describe, expect, it, vi } from 'vitest';
import { focusLayerHeading, gameTileId, tileFocusAfterWindow } from '../web/src/next/home/focusRules.js';

describe('Who’s in opens with its heading focused (spec test 8)', () => {
  const root = (heading) => ({ querySelector: vi.fn(sel => (sel === '[data-route-focus]' ? heading : null)) });

  it('after a navigation the layer heading takes focus, so the shell keeps it instead of falling back to the Home h1', () => {
    const heading = { focus: vi.fn() };
    expect(focusLayerHeading(root(heading), true)).toBe(true);
    expect(heading.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('a reload at the address (no navigation) never steals focus', () => {
    const heading = { focus: vi.fn() };
    expect(focusLayerHeading(root(heading), false)).toBe(false);
    expect(heading.focus).not.toHaveBeenCalled();
  });

  it('no heading or no root is a no-op', () => {
    expect(focusLayerHeading(root(null), true)).toBe(false);
    expect(focusLayerHeading(null, true)).toBe(false);
  });
});

describe('a focused game tile that leaves the window at kickoff', () => {
  const ids = ['LAC-LV', 'NYG-PHI', 'HOU-JAX'];
  it('moves focus to the first remaining tile', () => {
    expect(tileFocusAfterWindow({ focusedId: gameTileId('BUF-KC'), ids, lost: true })).toEqual({ kind: 'tile', id: gameTileId('LAC-LV') });
  });
  it('with no tile left, to the section heading', () => {
    expect(tileFocusAfterWindow({ focusedId: gameTileId('BUF-KC'), ids: [], lost: true })).toEqual({ kind: 'heading' });
  });
  it('does nothing when the focused tile stays, when focus was not on a tile, or when focus is still somewhere real', () => {
    expect(tileFocusAfterWindow({ focusedId: gameTileId('NYG-PHI'), ids, lost: true })).toBeNull();
    expect(tileFocusAfterWindow({ focusedId: null, ids, lost: true })).toBeNull();
    expect(tileFocusAfterWindow({ focusedId: gameTileId('BUF-KC'), ids, lost: false })).toBeNull();
  });
});
