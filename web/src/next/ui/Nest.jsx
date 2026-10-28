// D-66 nesting cards: a Research layer is one card; every open parent stays above it as a lip, a stacked tab one step
// further in than the last, so the card reads as the smallest doll. A lip is a real button back to its layer. When
// the layer changes the card's heading takes focus (`data-route-focus` keeps it through the shell's navigation
// focus), so a screen reader hears the new layer; going back lets the shell return focus to what opened it.
import { ChevronLeft } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { cx } from './cx.js';
import './nest.css';

/** At 320px three steps still leave the card 254px of content. */
export const NEST_MAX_STEPS = 3;
const depth = i => ({ '--gx-nest-depth': Math.min(i, NEST_MAX_STEPS) });

/**
 * `lips`: the open parents, outermost first, `{ key, label, onOpen }`. `layer` names the current layer (it moves focus
 * when it changes). `info` is the layer's ⓘ (fine print lives there, D-55 rule 10).
 */
export function Nest({ label, lips = [], layer, title, info, children, className }) {
  const heading = useRef(null), shown = useRef(layer);
  useLayoutEffect(() => {
    if (shown.current === layer) return;
    shown.current = layer;
    heading.current?.focus({ preventScroll: true });
  }, [layer]);
  return (
    <section className={cx('gx-nest', className)} aria-label={label} data-depth={lips.length}>
      {lips.length ? (
        <nav className="gx-nest-lips" aria-label={`${label} layers`}>
          {lips.map((lip, i) => (
            <button key={lip.key} type="button" className="gx-nest-lip" style={depth(i)} onClick={lip.onOpen}>
              <span className="gx-sr-only">Back to </span><span className="gx-nest-lip-label">{lip.label}</span>
              {i === lips.length - 1 ? <ChevronLeft size={16} aria-hidden="true"/> : null}
            </button>
          ))}
        </nav>
      ) : null}
      <div className="gx-nest-card" style={depth(lips.length)}>
        <div className="gx-nest-head">
          <h2 ref={heading} className="gx-t-section gx-nest-title" tabIndex={-1} data-route-focus>{title}</h2>
          {info}
        </div>
        {children}
      </div>
    </section>
  );
}

/**
 * A layer's share meter: the filled part is the side's share of decided games, the tick is the 52.4% break-even at
 * -110 (`tick={false}` for a share with no break-even, such as points out of 10). `label` says it in words; a missing
 * share draws nothing (never a zero bar).
 */
export function NestMeter({ share, label, tick = true }) {
  if (typeof share !== 'number' || !Number.isFinite(share)) return null;
  const width = `${Math.round(Math.min(1, Math.max(0, share)) * 1000) / 10}%`;
  return <span className={cx('gx-nest-meter', !tick && 'gx-nest-meter--plain')} role="img" aria-label={label}><span style={{ width }}></span></span>;
}

/**
 * A tile's small picture of a run of values (one bar each, oldest first) beside the number that says it. It is
 * decorative: the next layer holds the labelled chart and its table. A missing value leaves a gap, never a zero bar.
 */
export function NestSpark({ values = [], signed = false }) {
  const known = values.filter(v => typeof v === 'number' && Number.isFinite(v));
  if (!known.length) return null;
  const max = Math.max(...known.map(Math.abs)) || 1, w = 8, gap = 4, h = 28, mid = signed ? h / 2 : h;
  return (
    <svg className="gx-nest-spark" viewBox={`0 0 ${values.length * (w + gap) - gap} ${h}`} width={values.length * (w + gap) - gap} height={h} aria-hidden="true">
      {signed ? <line x1="0" x2={values.length * (w + gap)} y1={mid} y2={mid} className="gx-nest-spark-zero"/> : null}
      {values.map((v, i) => {
        if (typeof v !== 'number' || !Number.isFinite(v)) return null;
        const len = Math.max(2, (Math.abs(v) / max) * (signed ? h / 2 : h));
        return <rect key={i} x={i * (w + gap)} y={v < 0 ? mid : mid - len} width={w} height={len} rx="2" className={signed && v < 0 ? 'gx-nest-spark-neg' : 'gx-nest-spark-pos'}/>;
      })}
    </svg>
  );
}
