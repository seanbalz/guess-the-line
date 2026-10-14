// A hidden market (D-36 line lock, D-39 per-game lock-in): a lock icon and a sentence, never "—" (rule of restraint 8).
// LockLine is the sentence form; LockCell is the dashed cell where a line or price would be, named by the same sentence.
// The server decides what is hidden; these only draw it.
import { Lock } from 'lucide-react';
import { Icon } from './Icon.jsx';
import { cx, needLabel } from './cx.js';

export function LockLine({ as: Tag = 'p', className, children, ...rest }) {
  return (
    <Tag className={cx('gx-lock-line', className)} {...rest}>
      <Icon icon={Lock} size={16}/>
      <span>{children}</span>
    </Tag>
  );
}

/** `<LockCell label={copy.lineLocked('spread')} className="gx-bets-cell"/>`: size it with the caller's class. */
export function LockCell({ label, className, ...rest }) {
  return (
    <span className={cx('gx-lock-cell', className)} role="img" aria-label={needLabel(label, 'LockCell')} {...rest}>
      <Icon icon={Lock} size={16}/>
    </span>
  );
}
