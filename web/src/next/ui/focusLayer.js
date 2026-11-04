// Where a fresh layer puts focus (D-69, step 2's lesson): a Nest moves focus only when its layer changes, so a layer
// that mounts fresh after a navigation (the tile or row that opened it is gone) focuses its own heading; a direct load
// (a reload, a shared link) is not a navigation and never moves focus. Home's Who's in and Research's layers use it.
import { useLayoutEffect } from 'react';
import { hasNavigated } from '../moments/launch.js';

/** Focuses `root`'s `[data-route-focus]` heading after a navigation; false when it did not. */
export function focusLayerHeading(root, navigated) {
  if (!navigated) return false;
  const heading = root?.querySelector?.('[data-route-focus]');
  if (!heading) return false;
  heading.focus({ preventScroll: true });
  return true;
}

/** Once, on mount: the layer at `ref` focuses its heading when the member navigated here. */
export function useLayerFocus(ref) {
  useLayoutEffect(() => { focusLayerHeading(ref.current, hasNavigated()); }, []); // once per mount, by design
}
