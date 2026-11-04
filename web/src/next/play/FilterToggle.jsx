// D-69 step 1 (spec section 6, Your score: "Filters move behind a filter icon button"): one 44px icon button that
// says whether a filter is on, and its panel in place under it. Its own open state; nothing navigates.
import { useId, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { IconButton } from '../ui/index.js';
import './playFrame.css';

export function FilterToggle({ label = 'Filter games', active = false, children }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <div className="gx-filter-toggle">
      <IconButton icon={SlidersHorizontal} label={active ? `${label}, on` : label} aria-expanded={open ? 'true' : 'false'} aria-controls={panel}
        className={active ? 'gx-filter-toggle-on' : undefined} onClick={() => setOpen(v => !v)}/>
      <div id={panel} className="gx-filter-panel gx-vstack gx-gap-12" hidden={!open}>{children}</div>
    </div>
  );
}
