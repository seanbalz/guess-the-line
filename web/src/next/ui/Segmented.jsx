// The segmented control (design system 7.4): 44 tall, pill shaped, one selected segment ("Spread | Total",
// "Week | Season", "Kickoff | Biggest gap"). A named group of toggle buttons; the selected one is aria-pressed and
// drawn with weight and an inset ring as well as its fill. `fit` sizes segments to their words.
import { cx, needLabel } from './cx.js';

/** `options` is `[{ value, label }]`; `onChange(value)` runs when another segment is chosen. */
export function Segmented({ label, options = [], value, onChange, fit = false, className, ...rest }) {
  return (
    <div className={cx('gx-seg', className)} role="group" aria-label={needLabel(label, 'Segmented')} {...rest}>
      {options.map(option => {
        const on = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            className={cx('gx-seg-btn', on && 'gx-seg-btn--on', fit && 'gx-seg-btn--fit')}
            aria-pressed={on ? 'true' : 'false'}
            onClick={() => { if (!on) onChange?.(option.value); }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
