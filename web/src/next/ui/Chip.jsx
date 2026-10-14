// A chip (design system 7.6): a 44px toggle button. Selected is lime with a check before the value, so it never relies
// on color alone, and it pops once when it becomes selected (never on first render, never under reduced motion).
// `text` uses body type instead of numerals; `tall` makes it 48. `label` names it in words ("Seattle by 2.5") when the
// visible value is a bare number.
import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { cx } from './cx.js';

export function Chip({ ref, selected = false, text = false, tall = false, label, className, children, onAnimationEnd, ...rest }) {
  const was = useRef(selected);
  const [pop, setPop] = useState(false);
  useEffect(() => {
    if (selected && !was.current) setPop(true);
    was.current = selected;
  }, [selected]);
  return (
    <button
      ref={ref}
      type="button"
      className={cx('gx-chip', text && 'gx-chip--text', tall && 'gx-chip--48', selected && 'gx-chip--on', pop && 'gx-anim-pop', className)}
      aria-pressed={selected ? 'true' : 'false'}
      aria-label={label}
      onAnimationEnd={event => { setPop(false); onAnimationEnd?.(event); }}
      {...rest}
    >
      {selected ? <Icon icon={Check} size={16}/> : null}
      {children}
    </button>
  );
}
