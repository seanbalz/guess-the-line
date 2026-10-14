// Small helpers shared by the new app's UI kit (redesign build plan, stage 8). Pure: no DOM, no state.

/** Joins class names, skipping anything falsy: cx('gx-btn', on && 'gx-btn--on'). */
export function cx(...parts) {
  return parts.flat(Infinity).filter(part => typeof part === 'string' && part !== '').join(' ');
}

/**
 * An accessible name a component cannot render without (an icon-only button, a labelled group, a dialog). A missing
 * or blank name is a programming error, so it throws instead of rendering a control a screen reader cannot name.
 */
export function needLabel(value, component) {
  if (typeof value === 'string' && value.trim() !== '') return value;
  throw new TypeError(`${component} needs an accessible name.`);
}

/** `{ role: 'img', 'aria-label': label }` when there is a label, else hidden from assistive technology (decoration beside its own words). */
export function imgA11y(label) {
  return typeof label === 'string' && label.trim() !== '' ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' };
}

/** `value` when it is one of `allowed`, else `fallback`. */
export function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}
