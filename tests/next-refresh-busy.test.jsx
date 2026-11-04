// Design audit A18: the LIVE dot is the brand's only loop (D-38 motion). Contracts:
// - My bets' refresh button (the tracker toolbar) and Your gap's "Refresh lines" never carry the old app's endless `spin`
//   class while a read is in flight; they are aria-busy and say "Refreshing…" (Your gap on the button, the tracker's
//   44 px icon button in its name, beside the toolbar's visible "Loading saved bets and records…" status);
// - inside the new app (`.gx`), any leftover `.spin` markup draws no animation (base.css matches that class as
//   [class~="spin"], which keeps the sheet to gx- classes).
// Both screens start in their loading state, so the first render is the busy one.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';

vi.mock('../web/src/api.js', () => ({ socialApi: vi.fn(() => new Promise(() => {})), cloudApi: vi.fn(() => new Promise(() => {})), linesApi: vi.fn(() => new Promise(() => {})), date: value => value, signed: value => String(value) }));
vi.mock('../web/src/fantasyData.js', () => ({ useFantasySnapshot: () => ({ status: 'missing' }), fantasyWeekKey: (season, week) => `${season}-${week}` }));
vi.mock('../web/src/trendsLoaders.js', () => ({ loadTrendWeek: vi.fn() }));

const { default: SocialBetTracker } = await import('../web/src/SocialBetTracker.jsx');
const { default: VirtualUnits } = await import('../web/src/VirtualUnits.jsx');

const LUKE = '00000000-0000-4000-8000-000000000003';
const buttons = html => [...walk(parseMarkup(html))].filter(n => n.tag === 'button');
const spins = button => [...walk(button)].filter(n => /(^|\s)spin(\s|$)/.test(n.attrs?.class ?? ''));

describe('refresh while a read is in flight', () => {
  it('My bets: the tracker refresh is busy, named Refreshing…, and does not spin', () => {
    const refresh = buttons(renderToStaticMarkup(<SocialBetTracker player={LUKE} initialView="mybets"/>)).filter(b => b.attrs.class === 'icon-button');
    expect(refresh.map(b => [b.attrs['aria-label'], b.attrs['aria-busy']])).toEqual([['Refreshing…', 'true']]);
    expect(spins(refresh[0])).toEqual([]);
  });
  it('Your gap: Refresh lines says Refreshing…, is busy, and does not spin', () => {
    const refresh = buttons(renderToStaticMarkup(<VirtualUnits accountId={LUKE} initialView="recommended" embedded/>)).filter(b => nameFrom(b) === 'Refreshing…');
    expect(refresh.map(b => b.attrs['aria-busy'])).toEqual(['true']);
    expect(spins(refresh[0])).toEqual([]);
  });
});

describe('the new app stops the old spinner', () => {
  it('sets no animation on .spin inside .gx, beside the other motion rules', () => {
    const css = fs.readFileSync(new URL('../web/src/next/styles/base.css', import.meta.url), 'utf8');
    const guard = css.indexOf('\n.gx [class~="spin"] {');
    expect(css.slice(guard + 1)).toMatch(/^\.gx \[class~="spin"\] \{\s*animation: none;\s*\}/);
    expect(guard).toBeGreaterThan(css.indexOf('/* ===== motion'));
    expect(guard).toBeLessThan(css.indexOf('/* Reduced motion'));
  });
});
