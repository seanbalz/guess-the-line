// D-69 big moments: one celebration card (`ov.flash`) for every big moment playing together, plus a win buzz unless motion is reduced. Pure.
import { winHaptic } from '../ui/haptics.js';

/** The overlay's item from a moment (FlashOverlay reads key, title, meta, parts, icon and rarity). */
export const flashItem = m => ({ key: m.id, title: m.title, meta: m.meta, parts: m.parts, icon: m.icon, rarity: m.rarity });

/** Plays `moments` as one card; nothing for an empty list. `nav` is the navigator (tests pass a fake). Returns true when a card was shown. */
export function playBig(moments, { showOverlay, reduced = false, nav } = {}) {
  if (!Array.isArray(moments) || !moments.length || typeof showOverlay !== 'function') return false;
  winHaptic(nav, reduced);
  showOverlay('ov.flash', { items: moments.map(flashItem) });
  return true;
}
