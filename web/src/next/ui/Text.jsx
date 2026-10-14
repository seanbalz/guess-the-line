// Text in the D-38 type scale (BRAND_GUIDE D-38 "Type"): one element with one type class and, optionally, one color.
// Words use display/title/section/body/strong/label/meta/micro; numbers use n-xl to n-xs (Barlow Condensed, always
// tabular). Big Shoulders (display, title, section) never sets a number.
import { cx } from './cx.js';

export const TEXT_VARIANTS = Object.freeze({
  display: 'gx-t-display',
  title: 'gx-t-title',
  section: 'gx-t-section',
  team: 'gx-t-team',
  body: 'gx-t-body',
  strong: 'gx-t-strong',
  label: 'gx-t-label',
  meta: 'gx-t-meta',
  micro: 'gx-t-micro',
  'n-xl': 'gx-n-xl',
  'n-l': 'gx-n-l',
  'n-m': 'gx-n-m',
  'n-s': 'gx-n-s',
  'n-xs': 'gx-n-xs',
});

export const TEXT_TONES = Object.freeze({
  1: 'gx-c-1',
  2: 'gx-c-2',
  3: 'gx-c-3',
  accent: 'gx-c-accent',
  data: 'gx-c-data',
  win: 'gx-c-win',
  loss: 'gx-c-loss',
  pending: 'gx-c-pending',
  live: 'gx-c-live',
});

/**
 * `<Text as="h1" variant="title">Lines</Text>`. `as` is the element (span by default), `variant` a key of
 * TEXT_VARIANTS, `tone` a key of TEXT_TONES (text-3 is for meta and icons only), `tnum` forces tabular figures and
 * `truncate` ends one line with an ellipsis.
 */
export function Text({ as: Tag = 'span', variant = 'body', tone, tnum = false, truncate = false, className, children, ...rest }) {
  return <Tag className={cx(TEXT_VARIANTS[variant] ?? TEXT_VARIANTS.body, TEXT_TONES[tone], tnum && 'gx-tnum', truncate && 'gx-truncate', className)} {...rest}>{children}</Tag>;
}
