// A toast (design system 7.16): one line at the bottom, 8 above the dock or tab bar, with one icon (a check for done,
// an alert for a warning, a circled x for an error), an optional text action and a dismiss button. It leaves after 4 seconds
// (6 with an action) and waits while a pointer or focus is on it; an error stays until dismissed and is announced at
// once (role alert), the others politely (role status). The stage 10 host shows one at a time, keyed by toast, and
// keeps the live region in place between toasts.
import { Check, CircleX, TriangleAlert, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from './Button.jsx';
import { Icon } from './Icon.jsx';
import { IconButton } from './IconButton.jsx';
import { cx, oneOf } from './cx.js';

export const TOAST_TONES = Object.freeze(['done', 'warning', 'error', 'plain']);
export const TOAST_MS = Object.freeze({ plain: 4000, action: 6000 });

const ICON = { done: [Check, 'gx-toast-check'], warning: [TriangleAlert, 'gx-c-pending'], error: [CircleX, 'gx-c-loss'] };

/** How long a toast stays, in ms; null when it stays until dismissed. */
export function toastDuration({ tone = 'done', actionLabel, duration } = {}) {
  if (duration === null) return null;
  if (typeof duration === 'number' && duration > 0) return duration;
  if (tone === 'error') return null;
  return actionLabel ? TOAST_MS.action : TOAST_MS.plain;
}

/**
 * `<Toast text="Spread picks in · 15 of 15" onDismiss={next}/>`. `start` leads with a face (the rank-up toast); `extra`
 * follows the words (the Drive meter); `bottom` lifts it above a dock bar (a px value from the host).
 */
export function Toast({ text, tone = 'done', actionLabel, onAction, onDismiss, duration, start, extra, bottom, dismissLabel = 'Dismiss', className }) {
  const kind = oneOf(tone, TOAST_TONES, 'done');
  const ms = toastDuration({ tone: kind, actionLabel, duration });
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const left = useRef(ms);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  useEffect(() => {
    if (ms === null || paused) return undefined;
    const started = Date.now();
    const timer = setTimeout(() => dismiss.current?.(), Math.max(0, left.current));
    return () => {
      clearTimeout(timer);
      left.current -= Date.now() - started;
    };
  }, [ms, paused]);
  const glyph = ICON[kind];
  return (
    <div
      className={cx('gx-toast', className)}
      role={kind === 'error' ? 'alert' : 'status'}
      style={typeof bottom === 'number' ? { bottom: `${bottom}px` } : undefined}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    >
      {start}
      {glyph ? <Icon icon={glyph[0]} size={20} className={glyph[1]}/> : null}
      <p className="gx-toast-text">{text}</p>
      {extra}
      {actionLabel && typeof onAction === 'function' ? <Button variant="ghost" onClick={onAction}>{actionLabel}</Button> : null}
      <IconButton icon={X} size={16} label={dismissLabel} onClick={() => dismiss.current?.()}/>
    </div>
  );
}
