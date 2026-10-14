// A list row (CONTRACT section 11): 56 tall by default (44, 64 or 72), a leading face or mark, a title with at most
// one meta line, an end slot and an optional chevron. `you` tints your own row with the lime bar; `wait` gives it the
// data-colored edge. With `onClick` the whole row is one button; with `href` it is one link. Everything inside is
// phrasing content, so the row stays valid inside a button.
import { ChevronRight } from 'lucide-react';
import { Icon } from './Icon.jsx';
import { cx, oneOf } from './cx.js';

const ROW_SIZES = [44, 56, 64, 72];

export function Row({ ref, title, sub, start, end, chevron = false, size = 56, you = false, wait = false, onClick, href, className, children, ...rest }) {
  const classes = cx('gx-row', oneOf(size, ROW_SIZES, 56) !== 56 && `gx-row--${size}`, you && 'gx-row--you', wait && 'gx-row--wait', (onClick || href) && 'gx-row-btn', className);
  const body = (
    <>
      {start}
      <span className="gx-row-main">
        {title !== undefined && title !== null ? <span className="gx-row-title">{title}</span> : null}
        {sub !== undefined && sub !== null && sub !== '' ? <span className="gx-row-sub">{sub}</span> : null}
        {children}
      </span>
      {end !== undefined && end !== null ? <span className="gx-row-end">{end}</span> : null}
      {chevron ? <Icon icon={ChevronRight} size={20} className="gx-chev"/> : null}
    </>
  );
  if (href) return <a ref={ref} href={href} className={classes} onClick={onClick} {...rest}>{body}</a>;
  if (onClick) return <button ref={ref} type="button" className={classes} onClick={onClick} {...rest}>{body}</button>;
  return <div ref={ref} className={classes} {...rest}>{body}</div>;
}

/** A 56px menu row: an optional icon, the words and a chevron (the avatar menu, Settings, How to play). */
export function LinkRow({ ref, icon, href, onClick, className, children, ...rest }) {
  const body = (
    <>
      {icon ? <Icon icon={icon} size={20}/> : null}
      <span className="gx-grow">{children}</span>
      <Icon icon={ChevronRight} size={20} className="gx-chev"/>
    </>
  );
  if (href) return <a ref={ref} href={href} className={cx('gx-link-row', className)} onClick={onClick} {...rest}>{body}</a>;
  return <button ref={ref} type="button" className={cx('gx-link-row', className)} onClick={onClick} {...rest}>{body}</button>;
}
