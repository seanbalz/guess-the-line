// Exact copy of the native Points Stepper for an isolated no-save preview.
// Source: web/src/next/play/points/PointsBallot.jsx; no production readers/writers imported.
import {useEffect,useRef} from 'react';
import {Icon} from '../../web/src/next/ui/Icon.jsx';
import {GUESS_MIN,GUESS_MAX,step} from '../../web/src/next/play/points/pointsModel.js';
function Stepper({ value, onChange, disabled }) {
  const timers = useRef({ delay: null, repeat: null }), held = useRef(false);
  const latest = useRef(onChange);
  latest.current = onChange;
  const stop = () => { clearTimeout(timers.current.delay); clearInterval(timers.current.repeat); };
  useEffect(() => stop, []);
  const start = by => {
    if (disabled) return;
    stop(); held.current = false;
    timers.current.delay = setTimeout(() => {
      held.current = true; latest.current(v => step(v, 5 * by));
      timers.current.repeat = setInterval(() => latest.current(v => step(v, 5 * by)), 300);
    }, 450);
  };
  const button = (by, icon, label) => <button type="button" className="gx-pt-step" aria-label={label} disabled={disabled || value === (by < 0 ? GUESS_MIN : GUESS_MAX)}
    onPointerDown={() => start(by)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
    onClick={() => { if (held.current) { held.current = false; return; } onChange(v => step(v, by)); }}>
    <Icon icon={icon} size={24}/>
  </button>;
  const keys = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 5, PageDown: -5 };
  return <div className="gx-vstack gx-gap-8">
    <div className="gx-pt-stepper">
      {button(-1, 'minus', 'One point less, hold for 5')}
      <span className="gx-pt-big gx-n-xl" role="spinbutton" tabIndex={disabled ? -1 : 0} aria-label="Your guess" aria-valuemin={GUESS_MIN} aria-valuemax={GUESS_MAX}
        aria-valuenow={value ?? undefined} aria-valuetext={value === null ? 'No guess yet' : `${value} points`} aria-disabled={disabled || undefined}
        onKeyDown={event => {
          if (disabled) return;
          if (Object.hasOwn(keys, event.key)) { event.preventDefault(); onChange(v => step(v, keys[event.key])); }
          else if (event.key === 'Home') { event.preventDefault(); onChange(() => GUESS_MIN); }
          else if (event.key === 'End') { event.preventDefault(); onChange(() => GUESS_MAX); }
        }}>{value === null ? '—' : value}</span>
      {button(1, 'plus', 'One point more, hold for 5')}
    </div>
    <p className="gx-t-meta gx-pt-sub gx-pt-center">Hold to move by 5</p>
  </div>;
}

export {Stepper};
