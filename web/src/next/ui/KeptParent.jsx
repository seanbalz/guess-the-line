// D-69 step 3: a section's list stays mounted, hidden, under the layer that opened from it, as it stayed under the sheet
// that layer replaces: its reads and timers, its scroll and the row that opened the layer are all still there when Back
// closes the layer, and the list then settles back in (spec 4.3: 200 ms, no rise). The layer is drawn first, so the
// page's first heading is the layer's.
import { useRef } from 'react';
import { hasNavigated } from '../moments/launch.js';

export function KeptParent({ layer = null, children }) {
  const open = layer !== null && layer !== undefined && layer !== false;
  const latch = useRef({ open, enter: undefined });
  // Decided once per change, so a re-render (a read landing) never cuts the settle short.
  if (latch.current.open !== open) latch.current = { open, enter: !open && hasNavigated() ? 'back' : undefined };
  return <>{open ? layer : null}<div className="gx-kept" hidden={open} data-enter={latch.current.enter}>{children}</div></>;
}
