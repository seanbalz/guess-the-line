// D-69 step 3: a section's list stays mounted, hidden, under the layer that opened from it, as it stayed under the sheet
// that layer replaces: its reads and timers, its scroll and the row that opened the layer are all still there when Back
// closes the layer, and the list then settles back in (spec 4.3: 200 ms, no rise). The layer is drawn first, so the
// page's first heading is the layer's. A layer opened directly (a shared link, a reload, Trends' Game details) has no
// list under it to keep: the list mounts only once it has shown, so no hidden board reads or ticks under such a layer.
import { useRef } from 'react';
import { hasNavigated } from '../moments/launch.js';

/**
 * One render's kept-list state, pure: `{ open, enter, seen }`. `seen` turns true the first time the list shows and
 * stays (the list then stays mounted under any later layer); `enter` is 'back' when a layer closes after the member's
 * first navigation. Decided once per change of `open`, so a re-render (a read landing) never cuts the settle short.
 */
export function keptNext(prev, open, navigated) {
  if (prev && prev.open === open) return prev;
  return { open, enter: prev && !open && navigated ? 'back' : undefined, seen: Boolean(prev?.seen) || !open };
}

export function KeptParent({ layer = null, children }) {
  const open = layer !== null && layer !== undefined && layer !== false;
  const latch = useRef(null);
  latch.current = keptNext(latch.current, open, hasNavigated());
  const { enter, seen } = latch.current;
  return <>{open ? layer : null}{seen ? <div className="gx-kept" hidden={open} data-enter={enter}>{children}</div> : null}</>;
}
