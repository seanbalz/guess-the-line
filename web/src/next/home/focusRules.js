// Where focus goes on Home when what held it goes away (pure, so the rules test without a DOM).

export const gameTileId = gameId => `gx-h-game-${gameId}`;

/**
 * Who's in mounts a fresh Nest, which only moves focus when its layer changes, so on mount the clicked tile is gone and
 * the shell would fall back to the screen-reader-only Home h1. After a navigation the layer's own heading takes focus
 * (the shell keeps a focused `[data-route-focus]`); a reload at the address is not a navigation and never steals it.
 */
export function focusLayerHeading(root, navigated) {
  if (!navigated) return false;
  const heading = root?.querySelector?.('[data-route-focus]');
  if (!heading) return false;
  heading.focus({ preventScroll: true });
  return true;
}

/**
 * A game tile that had focus and left the window (its game kicked off): focus moves to the first tile that remains, or
 * to the section heading when none does. `lost`: focus fell to the page (the tile was removed under it).
 */
export function tileFocusAfterWindow({ focusedId, ids, lost }) {
  if (!focusedId || !lost) return null;
  if (ids.some(id => gameTileId(id) === focusedId)) return null;
  return ids.length ? { kind: 'tile', id: gameTileId(ids[0]) } : { kind: 'heading' };
}
