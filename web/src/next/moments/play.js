// D-69 big moments: one celebration card (`ov.flash`) for every big moment playing together, plus a win buzz unless motion is reduced. Pure.
import { winHaptic } from '../ui/haptics.js';

/** The overlay's item from a moment (FlashOverlay reads key, title, meta, parts, icon and rarity). */
/** The overlay's item from a moment (FlashOverlay reads key, title, meta, parts, icon, rarity and kind). */
export const flashItem = m => ({ key: m.id, title: m.title, meta: m.meta, parts: m.parts, icon: m.icon, rarity: m.rarity, ...(m.kind ? { kind: m.kind } : {}) });

// Where the card's second button goes, by the place that holds each kind of moment. A kind not listed (or none, as in
// items made before D-69 step 1) is a badge or award.
const PLACES = Object.freeze({
  features: { label: 'See badges', section: 'features' },
  score: { label: 'See your score', section: 'score' },
  points: { label: 'See Points', section: 'points' },
  board: { label: 'See the board', section: 'league', view: { view: 'board' } },
});
const PLACE_OF = Object.freeze({ bullseye: 'score', weekFinal: 'score', pointsExact: 'points', rankFirst: 'board' });

/** `{ label, section, view? }` for the card's second button, or null when its moments live in different places. */
export function flashDestination(items = []) {
  const places = new Set(items.map(item => PLACE_OF[item?.kind] ?? 'features'));
  return places.size === 1 ? PLACES[[...places][0]] : null;
}

/** Plays `moments` as one card; nothing for an empty list. `nav` is the navigator (tests pass a fake). Returns true when a card was shown. */
export function playBig(moments, { showOverlay, reduced = false, nav } = {}) {
  if (!Array.isArray(moments) || !moments.length || typeof showOverlay !== 'function') return false;
  winHaptic(nav, reduced);
  showOverlay('ov.flash', { items: moments.map(flashItem) });
  return true;
}

/**
 * Small-moment pops, per element: `latch` remembers whether the moment had already played when this element first saw
 * the id. It shows the pop only when the moment plays after that, so an element mounted later stays still.
 */
export function popLatch(latch, id, popped) {
  const next = latch?.id === id ? latch : { id, popped };
  return { latch: next, show: popped && !next.popped };
}
