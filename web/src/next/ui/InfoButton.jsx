// D-55 rule 10: fine print lives behind ⓘ. A 44px icon button named for its topic ("About trends") opens a native
// <dialog> as a bottom sheet with the explanation, disclaimers and credits that used to sit on the screen. The
// dialog is modal (the page behind is inert and focus moves in), so it stacks above an open game sheet; Escape, the
// close button and a tap on the backdrop close it, and focus returns to the ⓘ that opened it. The panel is drawn only
// while open, so a closed ⓘ leaves no hidden buttons or text in the page.
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { IconButton } from './IconButton.jsx';
import { cx } from './cx.js';

/**
 * `<InfoButton title="About trends" body={['Past results…']} links={[{ text, url }]}/>`; `children` follow the
 * paragraphs. `size` is the icon size (the hit area stays 44px).
 */
export function InfoButton({ title, body = [], links = [], children, size = 20, className }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef(null), opener = useRef(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) {
      if (typeof node.showModal === 'function') node.showModal();
      else node.setAttribute('open', '');
    } else if (!open && node.open) {
      if (typeof node.close === 'function') node.close();
      else node.removeAttribute('open');
    }
  }, [open]);
  const close = () => setOpen(false);
  return (
    <>
      <IconButton ref={opener} icon="info" size={size} label={title} className={cx('gx-info-btn', className)} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}/>
      <dialog
        ref={dialog}
        className="gx-info"
        aria-label={title}
        // The native modal owns these keys; an enclosing Sheet must not also close or trap focus.
        onKeyDown={event => { if (event.key === 'Escape' || event.key === 'Tab') event.stopPropagation(); }}
        onClose={() => { setOpen(false); opener.current?.focus({ preventScroll: true }); }}
        onClick={event => { if (event.target === dialog.current) close(); }}
      >
        {open ? <div className="gx-info-panel">
          <div className="gx-info-head">
            <h2 className="gx-t-section">{title}</h2>
            <IconButton icon={X} label="Close" onClick={close}/>
          </div>
          {body.filter(Boolean).map(text => <p key={text} className="gx-t-body gx-c-2">{text}</p>)}
          {children}
          {links.length ? (
            <ul className="gx-info-links">
              {links.map(link => (
                <li key={link.url + link.text}>
                  <a className="gx-t-meta gx-info-link" href={link.url} target="_blank" rel="noreferrer">{link.text}</a>
                </li>
              ))}
            </ul>
          ) : null}
        </div> : null}
      </dialog>
    </>
  );
}
