// D-69 step 3: the kit pieces Research needs, each shared with the steps after it. PictureRow is spec 5's picture row
// (marks or a face first, the name, one number on the right with its word); ChartReveal is section 4.3's left-to-right
// chart reveal (transform only, never on a page load); LayerPager is the game sheet's paging moved into a nesting card
// (spec 4.1); KeptParent keeps a list mounted under its layer; the landing skeleton gains the meter card's shape;
// focusLayerHeading moves to the kit. Static markup and the stylesheets only; the browser checks are
// tests/cloud-browser/next-research-layers.spec.js.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';
import * as ui from '../web/src/next/ui/index.js';
import * as focusRules from '../web/src/next/home/focusRules.js';

const render = node => renderToStaticMarkup(<div className="gx">{node}</div>);
const nodes = html => [...walk(parseMarkup(html))];
const byClass = (html, cls) => nodes(html).filter(n => (n.attrs?.class ?? '').split(/\s+/).includes(cls));
const textOf = n => (n.text ?? (n.children ?? []).map(textOf).join(''));
const css = file => readFileSync(new URL(`../web/src/next/${file}`, import.meta.url), 'utf8');

describe('PictureRow (spec 5: lists that must stay lists)', () => {
  const marks = <><ui.TeamMark code="SEA" size={24} decorative/><ui.TeamMark code="DEN" size={24} decorative/></>;
  it('one button: the picture hidden (the name says it), the name and one meta line, one number over its word', () => {
    const html = render(<ui.PictureRow id="gx-l-row-SEA-DEN" data-game="SEA-DEN" picture={marks} title="SEA @ DEN" meta="3–2 · 2–2–1"
      value="DEN −1.5" word="Current" ariaLabel="Seahawks at Broncos. Spread DEN −1.5. Current line. Open game details" onClick={() => {}}/>);
    expect(markupProblems(html)).toEqual([]);
    const [row] = nodes(html).filter(n => n.tag === 'button');
    expect([row.attrs.id, row.attrs['data-game'], row.attrs.type]).toEqual(['gx-l-row-SEA-DEN', 'SEA-DEN', 'button']);
    expect(nameFrom(row)).toBe('Seahawks at Broncos. Spread DEN −1.5. Current line. Open game details');
    expect(byClass(html, 'gx-prow-pic')[0].attrs['aria-hidden']).toBe('true');
    expect(byClass(html, 'gx-n-s').map(textOf)).toEqual(['DEN −1.5']);
    expect(byClass(html, 'gx-prow-word').map(textOf)).toEqual(['Current']);
    expect(byClass(html, 'gx-prow-word--plain')).toHaveLength(1);
  });
  it('a toned word keeps its word; an unknown tone is plain; with nothing to open it is a plain row, never a button', () => {
    expect(render(<ui.PictureRow title="Seattle Seahawks" value="6–2" word="Won last" tone="good" ariaLabel="x" onClick={() => {}}/>)).toContain('gx-prow-word--good');
    expect(render(<ui.PictureRow title="QB" value="4.2" word="Beat average" tone="loud" ariaLabel="x" onClick={() => {}}/>)).toContain('gx-prow-word--plain');
    const html = render(<ui.PictureRow title="QB" meta="31 graded" value="4.2" word="Beat average"/>);
    expect(markupProblems(html)).toEqual([]);
    expect(nodes(html).filter(n => n.tag === 'button')).toHaveLength(0);
    expect(byClass(html, 'gx-prow--static')).toHaveLength(1);
    expect(byClass(html, 'gx-prow--nopic')).toHaveLength(1);
    expect(ui.PICTURE_ROW_TONES).toEqual(['plain', 'good', 'warn']);
  });
  it('a pressed row dips and dims like every kit control; the list is a plain list on tokens', () => {
    expect(css('ui/press.css').match(/\.gx(\[data-motion="reduce"\])? button\.gx-prow\b/g)).toHaveLength(5);
    expect(css('ui/pictureRow.css')).toMatch(/\.gx \.gx-prows \{[^}]*list-style: none/);
  });
});

describe('ChartReveal (spec 4.3: charts reveal left to right)', () => {
  const chart = <svg viewBox="0 0 320 140" role="img" aria-label="Spread movement"><path d="M0 0L320 140"/></svg>;
  it('plays only when asked (a tap opened it), and the chart is drawn whole either way', () => {
    const played = render(<ui.ChartReveal play>{chart}</ui.ChartReveal>);
    expect(markupProblems(played)).toEqual([]);
    expect(byClass(played, 'gx-reveal')[0].attrs['data-reveal']).toBe('in');
    expect(byClass(played, 'gx-reveal-in')).toHaveLength(1);
    const still = render(<ui.ChartReveal>{chart}</ui.ChartReveal>);
    expect(byClass(still, 'gx-reveal')[0].attrs['data-reveal']).toBeUndefined();
    expect(still).toContain('aria-label="Spread movement"');
  });
  it('transform only, on the big duration with the enter easing, only without reduced motion, clipped only while it plays', () => {
    const sheet = css('ui/chartReveal.css');
    expect(sheet).toMatch(/@keyframes gx-reveal-clip \{ from \{ transform: translateX\(-100%\); \} to \{ transform: none; \} \}/);
    expect(sheet).toMatch(/@keyframes gx-reveal-hold \{ from \{ transform: translateX\(100%\); \} to \{ transform: none; \} \}/);
    expect(sheet).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\n {2}\.gx \.gx-reveal\[data-reveal="in"\] \{ overflow: hidden; animation: gx-reveal-clip var\(--gx-dur-big\) var\(--gx-ease-enter\) both; \}/);
    expect(sheet).not.toMatch(/\.gx \.gx-reveal \{[^}]*overflow/);
  });
});

describe('LayerPager (spec 4.1: the game sheet’s paging, inside the game layer)', () => {
  const pager = { index: 1, count: 3, unit: 'game', prevLabel: 'Previous game, SEA @ DEN', nextLabel: 'Next game, NO @ NYG', onMove: () => {} };
  it('says its place with the title, names both neighbours on 44 px buttons, and its body takes the sideways swipe', () => {
    const html = render(<ui.LayerPager title="HOU @ JAX" pager={pager} page="HOU-JAX"><p className="gx-t-body">Body</p></ui.LayerPager>);
    expect(markupProblems(html)).toEqual([]);
    const [place] = nodes(html).filter(n => n.attrs?.['aria-live'] === 'polite');
    expect(textOf(place)).toBe('HOU @ JAX, game 2 of 3');
    expect(byClass(html, 'gx-sheet-page').map(n => [n.attrs['aria-label'], n.attrs['aria-disabled']]))
      .toEqual([['Previous game, SEA @ DEN', undefined], ['Next game, NO @ NYG', undefined]]);
    expect(byClass(html, 'gx-pager-body')[0].attrs.class.split(' ')).toContain('gx-sheet-body--pager');
    expect(nodes(html).filter(n => n.attrs?.['data-pager'] !== undefined)).toHaveLength(1);
  });
  it('at an end the button stays, named and focusable, drawn unavailable; with no neighbours there is no pager', () => {
    const first = render(<ui.LayerPager title="SEA @ DEN" pager={{ ...pager, index: 0, prevLabel: 'Previous game' }} page="SEA-DEN">x</ui.LayerPager>);
    expect(byClass(first, 'gx-sheet-page').map(n => n.attrs['aria-disabled'])).toEqual(['true', undefined]);
    const none = render(<ui.LayerPager title="SEA @ DEN" pager={null} page="SEA-DEN"><span>x</span></ui.LayerPager>);
    expect(byClass(none, 'gx-sheet-page')).toHaveLength(0);
    expect(byClass(none, 'gx-pager-body')[0].attrs.class).toBe('gx-pager-body');
  });
});

describe('KeptParent (a list stays mounted under its layer, as it stayed under the sheet)', () => {
  const list = <ol className="gx-prows" aria-label="Games"><li>row</li></ol>;
  it('with no layer the list shows; with one, the layer comes first and the list stays, hidden', () => {
    expect(byClass(render(<ui.KeptParent>{list}</ui.KeptParent>), 'gx-kept')[0].attrs.hidden).toBeUndefined();
    const layered = render(<ui.KeptParent layer={<section className="gx-nest" aria-label="SEA @ DEN">layer</section>}>{list}</ui.KeptParent>);
    expect(nodes(layered).filter(n => ['gx-nest', 'gx-kept'].includes(n.attrs?.class)).map(n => n.attrs.class)).toEqual(['gx-nest', 'gx-kept']);
    expect(byClass(layered, 'gx-kept')[0].attrs.hidden).toBe('');
  });
});

describe('the landing skeleton in the meter card’s shape (Research’s first card, as Play’s)', () => {
  it('a meter bar where Home’s countdown goes, the meter card’s own height, then the tiles', () => {
    const html = render(<ui.Skeleton label="Loading this week’s games…" shape="landing" hero="meter" count={4}/>);
    expect(markupProblems(html)).toEqual([]);
    expect(byClass(html, 'gx-skel-hero--meter')).toHaveLength(1);
    expect(byClass(html, 'gx-skel-meter')).toHaveLength(1);
    expect(byClass(html, 'gx-skel-countdown')).toHaveLength(0);
    expect(byClass(html, 'gx-skel-tile')).toHaveLength(4);
    expect(byClass(render(<ui.Skeleton label="Loading Home…" shape="landing" count={6}/>), 'gx-skel-countdown')).toHaveLength(1);
    expect(ui.SKELETON_HEROES).toEqual(['countdown', 'meter']);
    expect(css('ui/skeleton.css')).toMatch(/\.gx-skel-hero--meter \{ min-height: \d+px; \}/);
  });
});

describe('kit moves and names', () => {
  it('focusLayerHeading is the kit’s; Home keeps importing it from its rules; only a navigation moves focus', () => {
    expect(focusRules.focusLayerHeading).toBe(ui.focusLayerHeading);
    const focused = [], heading = { focus: () => focused.push('heading') };
    const root = { querySelector: selector => (selector === '[data-route-focus]' ? heading : null) };
    expect(ui.focusLayerHeading(root, false)).toBe(false);
    expect(ui.focusLayerHeading(root, true)).toBe(true);
    expect(focused).toEqual(['heading']);
    expect(ui.useLayerFocus).toBeTypeOf('function');
  });
  it('Games and Teams have their own glyphs from the kit’s Lucide set', () => {
    expect([ui.DESTINATION_ICONS.games, ui.DESTINATION_ICONS.teams]).toEqual(['chart', 'shieldCheck']);
    for (const name of ['games', 'teams']) expect(ui.icons[ui.DESTINATION_ICONS[name]]).toBeTruthy();
  });
  it('units rise in for a nesting card’s lists and a page’s .gx-stagger list after a navigation; a kept list settles back', () => {
    const sheet = css('ui/nest.css');
    expect(sheet).toMatch(/\.gx \.gx-nest-card\[data-enter="in"\] \.gx-nest-list > :nth-child\(-n\+6\)/);
    expect(sheet).toMatch(/\.gx \.gx-stagger\[data-enter="in"\] > :nth-child\(-n\+6\)/);
    expect(sheet).toMatch(/\.gx \.gx-stagger \{ --gx-nest-stagger: 30ms; \}/);
    expect(sheet).toMatch(/\.gx \.gx-kept\[data-enter="back"\] \{ animation: gx-nest-back var\(--gx-dur-exit\) var\(--gx-ease-standard\); \}/);
    expect(ui.useEntrance).toBeTypeOf('function');
  });
});
