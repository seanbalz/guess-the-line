// The countdown (design system 7.14, prototype C5), from format.js `countdown()`: days, hours and minutes above a
// day; hours and minutes above an hour; minutes and seconds under an hour. Under two hours the digits turn pending.
// Tiles for the Home hero, or a pill ("DUE 2D 4H") for small places. The words around it come from the caller
// (copy.js: D-39 says "due", not "lock").
//
// A screen reader reads it as a timer with its full time ("2 days 4 hours 12 minutes"), never every tick
// (aria-live off). A separate polite line speaks only when the time crosses a day, two hours, 15 minutes and zero
// while the countdown is on screen. A changing minute or hour digit rises in (never on first render; seconds swap
// without motion; reduced motion stops it).
//
// Pass `now` to draw a fixed moment (tests, server time); without it the countdown keeps its own clock, ticking each
// second while it is mounted.
import { Clock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { countdown, toMs } from '../format.js';
import { Icon } from './Icon.jsx';
import { cx } from './cx.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// "DAYS" and "DAY" are one tile; so are "HRS" and "HR".
const unitKey = unit => unit.replace(/S$/, '');

/**
 * Which announcement a remaining time falls under: 'done', 'quarter' (15 min), 'twoHours', 'day', or null. Above an hour
 * it rounds up to whole minutes like format.js `countdown()`, so the words change with the digits: "Two hours left"
 * arrives as the digits turn pending.
 */
export function countdownMilestone(target, now) {
  const t = toMs(target);
  const n = toMs(now);
  if (t === null || n === null) return null;
  const raw = t - n;
  if (raw <= 0) return 'done';
  const shown = raw >= HOUR ? Math.ceil(raw / MINUTE) * MINUTE : raw;
  if (shown <= 15 * MINUTE) return 'quarter';
  if (shown < 2 * HOUR) return 'twoHours';
  if (shown < DAY) return 'day';
  return null;
}

export const COUNTDOWN_ANNOUNCEMENTS = Object.freeze({
  day: 'One day left.',
  twoHours: 'Two hours left.',
  quarter: '15 minutes left.',
  done: 'Time is up.',
});

function useClock(fixed) {
  const [now, setNow] = useState(() => fixed ?? Date.now());
  useEffect(() => {
    if (fixed !== undefined && fixed !== null) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [fixed]);
  return fixed ?? now;
}

/**
 * `<Countdown target={deadline} label="Week 6 picks due in" doneLabel="Picks are due" />`.
 * `variant` is 'tiles' (default) or 'pill'; `pillPrefix` leads the pill ("DUE"). `announcements` overrides the polite
 * lines (keys day, twoHours, quarter, done).
 */
export function Countdown({ target, now, variant = 'tiles', label, pillPrefix = '', doneLabel = 'Time is up', announcements, className, ...rest }) {
  const at = useClock(now);
  const cd = countdown(target, at);
  const milestone = countdownMilestone(target, at);
  const said = { ...COUNTDOWN_ANNOUNCEMENTS, done: /[.!?]$/.test(doneLabel) ? doneLabel : `${doneLabel}.`, ...announcements };
  const previous = useRef(undefined);
  const [spoken, setSpoken] = useState('');
  useEffect(() => {
    // Speak only on a change seen while mounted; what was already true when the countdown appeared is on screen.
    if (previous.current !== undefined && milestone !== previous.current && milestone) setSpoken(said[milestone] ?? '');
    previous.current = milestone;
  }, [milestone]);
  // The digits shown last render, per unit, so only a digit that just changed rises in (a new element, keyed by value).
  const lastTiles = useRef(null);
  const risen = new Set();
  if (lastTiles.current && cd.known) {
    for (const tile of cd.tiles) {
      const unit = unitKey(tile.u);
      if (unit !== 'SEC' && unit in lastTiles.current && lastTiles.current[unit] !== tile.n) risen.add(unit);
    }
  }
  useEffect(() => { lastTiles.current = cd.known ? Object.fromEntries(cd.tiles.map(tile => [unitKey(tile.u), tile.n])) : null; });

  const name = cd.known ? (cd.done ? doneLabel : cd.aria) : cd.aria;
  const timerName = label ? `${label} ${name}` : name;
  const timer = { role: 'timer', 'aria-live': 'off', 'aria-label': timerName, ...rest };
  let body;
  if (variant === 'pill') {
    const words = !cd.known ? '—' : cd.done ? doneLabel : `${pillPrefix ? `${pillPrefix} ` : ''}${cd.short}`;
    body = <span className={cx('gx-pill', cd.pending && 'gx-pill--pending', className)} {...timer}>{words}</span>;
  } else if (cd.known && cd.done) {
    body = (
      <div className={cx('gx-cd-done', className)} {...timer}>
        <Icon icon={Clock} size={20}/>
        <span className="gx-t-strong" aria-hidden="true">{doneLabel}</span>
      </div>
    );
  } else {
    body = (
      <div className={cx('gx-cd', className)} {...timer}>
        {cd.known
          ? cd.tiles.map(tile => (
            <span className="gx-cd-tile" aria-hidden="true" key={unitKey(tile.u)}>
              <span key={tile.n} className={cx('gx-n-xl', cd.pending && 'gx-c-pending', risen.has(unitKey(tile.u)) && 'gx-cd-tick')}>{tile.n}</span>
              <span className="gx-t-micro gx-c-2">{tile.u}</span>
            </span>
          ))
          : <span className="gx-cd-tile" aria-hidden="true"><span className="gx-n-xl gx-c-3">—</span></span>}
      </div>
    );
  }
  // The polite line stays one element across the tiles-to-done switch, so its words are spoken when they change.
  return <>{body}<span className="gx-sr-only" aria-live="polite">{spoken}</span></>;
}
