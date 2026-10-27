// Faces first (design system 7.3; BRAND_GUIDE D-38): a circle in the player's own fill with one or two initials.
// The fill comes from a stable hash of the account id, never from rank or result. An avatar is decoration: a name
// always sits beside it, so it is hidden from assistive technology. `you` adds the lime ring (boards only); `anyone`
// is the dashed "Anyone" circle of the challenge picker.
import { Users } from 'lucide-react';
import { Icon } from './Icon.jsx';
import { cx, oneOf } from './cx.js';

export const AVATAR_FILLS = Object.freeze(['iris', 'peach', 'sky', 'mint', 'butter', 'rose', 'lilac', 'sand']);
export const AVATAR_SIZES = Object.freeze([24, 32, 36, 40, 56, 80, 96]);

/** The fill for an account id: FNV-1a over its characters, so the same id always gets the same fill on every device. */
export function avatarFill(id) {
  const text = String(id ?? '');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return AVATAR_FILLS[hash % AVATAR_FILLS.length];
}

/** "Avery Stone" → "AS"; "avery" → "A"; nothing → "?". */
export function initials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words.at(-1))[0] : '';
  return `${first}${last}`.toUpperCase();
}

export function Avatar({ id, name, fill, size = 32, you = false, anyone = false, className, ...rest }) {
  const px = oneOf(size, AVATAR_SIZES, 32);
  if (anyone) {
    return (
      <span className={cx('gx-av', `gx-av--${px}`, 'gx-av--anyone', className)} aria-hidden="true" {...rest}>
        <Icon icon={Users} size={px >= 40 ? 20 : 16}/>
      </span>
    );
  }
  const tone = oneOf(fill, AVATAR_FILLS, avatarFill(id ?? name));
  return <span className={cx('gx-av', 'gx-av-initials', `gx-av--${px}`, `gx-av-${tone}`, you && 'gx-av--you', className)} aria-hidden="true" {...rest}>{initials(name)}</span>;
}

/**
 * Overlapping faces, at most `max` of them, then "+N" in meta. `people` is `[{ id, name, fill?, you? }]`. The stack is
 * decoration; `label` (for example "Avery, Blake and 3 more are in") gives it words when nothing beside it does.
 */
export function AvatarStack({ people = [], max = 3, size = 24, label, className, ...rest }) {
  const shown = people.slice(0, Math.max(0, max));
  const more = people.length - shown.length;
  return (
    <span className={cx('gx-hstack', className)} {...rest}>
      <span className="gx-av-stack" aria-hidden="true">
        {shown.map((person, i) => <Avatar key={person.id ?? `${person.name}-${i}`} id={person.id} name={person.name} fill={person.fill} size={size} you={person.you}/>)}
      </span>
      {more > 0 ? <span className="gx-av-more" aria-hidden="true">{`+${more}`}</span> : null}
      {label ? <span className="gx-sr-only">{label}</span> : null}
    </span>
  );
}
