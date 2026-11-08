// Account subviews retain native Sheet focus/gesture/close behavior with the selected title-first header.
import { useEffect, useRef } from 'react';
import { Sheet, Icon } from '../ui/index.js';
export function AccountSheet({ title, back, children, ...props }) {
  const anchor = useRef(null);
  // The native Sheet's back header is rendered in the body here. Preserve its in-place
  // subview focus handoff when title/back changes without replacing the Sheet instance.
  useEffect(() => { anchor.current?.closest('[role="dialog"]')?.focus({ preventScroll: true }); }, [title, back?.label]);
  return <Sheet title={title} {...props}><span ref={anchor} hidden/>{back && <button type="button" className="gx-account-back" onClick={back.onBack}><Icon icon="chevronLeft" size={20}/>{back.label}</button>}{children}</Sheet>;
}
