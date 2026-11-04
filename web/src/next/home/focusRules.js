// Where focus goes on Home when what held it goes away (pure, so the rules test without a DOM).
// Who's in mounts a fresh Nest; the kit's rule puts focus on its heading after a navigation (ui/focusLayer.js).
export { focusLayerHeading } from '../ui/focusLayer.js';

export const gameTileId = gameId => `gx-h-game-${gameId}`;

/**
 * A game tile that had focus and left the window (its game kicked off): focus moves to the first tile that remains, or
 * to the section heading when none does. `lost`: focus fell to the page (the tile was removed under it).
 */
export function tileFocusAfterWindow({ focusedId, ids, lost }) {
  if (!focusedId || !lost) return null;
  if (ids.some(id => gameTileId(id) === focusedId)) return null;
  return ids.length ? { kind: 'tile', id: gameTileId(ids[0]) } : { kind: 'heading' };
}
