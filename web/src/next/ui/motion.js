// Reduced motion (BRAND_GUIDE Motion): the device setting, or the app's own (data-motion="reduce" on the .gx root).
// Everything that moves or buzzes asks this first.

/** True when motion should stop for `element` (or for the page when no element is given). */
export function motionReduced(element) {
  const device = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scope = element ?? (typeof document !== 'undefined' ? document.querySelector('.gx') : null);
  return device || Boolean(scope?.closest?.('[data-motion="reduce"]'));
}
