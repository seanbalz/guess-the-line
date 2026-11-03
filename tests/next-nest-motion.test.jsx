// D-69 section 4.3: a nesting card rises in when a deeper layer opens, settles when a parent comes back, and never
// moves on the launch screen (until the member's first navigation) or when its layer stays the same.
import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Nest, nestEnter } from '../web/src/next/ui/Nest.jsx';
import { markNavigated, markSettled, resetLaunch } from '../web/src/next/moments/launch.js';

afterEach(() => resetLaunch());

describe('nestEnter', () => {
  it('a card that first shows inside a tab fade does not rise too (one motion per navigation); its later layer changes do', () => {
    expect(nestEnter({ navigated: true, tabFade: true, mounted: false, prevDepth: 0, depth: 0, layer: 'a' })).toBeUndefined();
    expect(nestEnter({ navigated: true, tabFade: false, mounted: true, prevDepth: 0, depth: 1, prevLayer: 'a', layer: 'b' })).toBe('in');
  });
  it('the launch screen never animates, on the first card or a layer change', () => {
    expect(nestEnter({ navigated: false, mounted: false, prevDepth: 0, depth: 0, layer: 'a' })).toBeUndefined();
    expect(nestEnter({ navigated: false, mounted: true, prevDepth: 0, depth: 1, prevLayer: 'a', layer: 'b' })).toBeUndefined();
  });
  it('after a navigation: a deeper layer rises in, a parent settles back, the same layer stays still', () => {
    expect(nestEnter({ navigated: true, mounted: false, prevDepth: 0, depth: 0, layer: 'a' })).toBe('in');
    expect(nestEnter({ navigated: true, mounted: true, prevDepth: 0, depth: 1, prevLayer: 'a', layer: 'b' })).toBe('in');
    expect(nestEnter({ navigated: true, mounted: true, prevDepth: 2, depth: 1, prevLayer: 'c', layer: 'b' })).toBe('back');
    expect(nestEnter({ navigated: true, mounted: true, prevDepth: 1, depth: 1, prevLayer: 'b', layer: 'b' })).toBeUndefined();
  });
});

describe('Nest markup', () => {
  const card = () => renderToStaticMarkup(<div className="gx"><Nest label="Trends" layer="root" title="Trends"><div className="gx-nest-grid"><span>1</span></div></Nest></div>);
  it('the first render has no entrance (a page load)', () => {
    const html = card();
    expect(html).toContain('class="gx-nest-card"');
    expect(html).not.toContain('data-enter');
  });
  it('a card that first shows on the launch screen after a scroll press still has no entrance; after a navigation it rises in', () => {
    markSettled();
    expect(card()).not.toContain('data-enter');
    markNavigated();
    expect(card()).toContain('data-enter="in"');
  });
});
