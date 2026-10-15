// Icons for the new app: Lucide (already a dependency, ISC licence), 2px stroke, sized by class (gx-ic, gx-ic-16 ...),
// never by attribute (CONTRACT section 12): Lucide's own width, height, stroke, stroke-width, fill and line-cap attributes
// are left off, and .gx-ic sets them all. An icon is decoration beside its own words (aria-hidden) unless it is given a
// label, which makes it an image with that name. Screens import their glyphs from here, so the set stays small and
// tree-shaken.
import {
  ArrowDownUp, ArrowLeftRight, Bell, ChartLine, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock, Copy,
  Diamond, Eye, House, Info, LogOut, Lock, MessageCircle, Minus, Palette, Pencil, Plus, Receipt, Settings, Target, Ticket,
  TriangleAlert, Trophy, UserPlus, Users, X,
} from 'lucide-react';
import { cx } from './cx.js';

export const ICON_SIZES = Object.freeze([12, 16, 20, 24, 32]);
// Null (not undefined, which Lucide would replace with its defaults) leaves each attribute out of the markup.
const NO_PAINT_ATTRIBUTES = Object.freeze({ size: null, color: null, strokeWidth: null, fill: null, strokeLinecap: null, strokeLinejoin: null });

/** The glyphs the prototype uses (CONTRACT section 12), by the names its markup uses. */
export const icons = Object.freeze({
  lock: Lock,
  chevronRight: ChevronRight,
  chevronLeft: ChevronLeft,
  chevronDown: ChevronDown,
  close: X,
  help: CircleHelp,
  info: Info,
  check: Check,
  plus: Plus,
  minus: Minus,
  people: Users,
  message: MessageCircle,
  bell: Bell,
  alert: TriangleAlert,
  clock: Clock,
  eye: Eye,
  pencil: Pencil,
  receipt: Receipt,
  copy: Copy,
  userPlus: UserPlus,
  sort: ArrowDownUp,
  diamond: Diamond,
  settings: Settings,
  logOut: LogOut,
  house: House,
  target: Target,
  ticket: Ticket,
  chart: ChartLine,
  trophy: Trophy,
  palette: Palette,
  swap: ArrowLeftRight,
});

/**
 * One icon. `icon` is a Lucide component (or a key of `icons`); `size` is 12, 16, 20, 24 (default) or 32; `fill` draws
 * it solid (the trend diamond). With `label` it is an image with that name; without, it is hidden.
 */
export function Icon({ icon, size = 24, label, fill = false, className, ...rest }) {
  const Glyph = typeof icon === 'string' ? icons[icon] : icon;
  if (!Glyph) throw new TypeError(`Unknown icon: ${String(icon)}`);
  const px = ICON_SIZES.includes(size) ? size : 24;
  const a11y = typeof label === 'string' && label.trim() !== ''
    ? { role: 'img', 'aria-label': label }
    : { 'aria-hidden': 'true', focusable: 'false' };
  return <Glyph {...NO_PAINT_ATTRIBUTES} className={cx('gx-ic', px !== 24 && `gx-ic-${px}`, fill && 'gx-ic-fill', className)} {...a11y} {...rest}/>;
}
