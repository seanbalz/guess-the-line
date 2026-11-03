// D-69 section 4.3: a nesting card rises in when a deeper layer opens, settles when a parent comes back, and never
// moves on a launch or when its layer stays the same.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Nest, nestEnter } from '../web/src/next/ui/Nest.jsx';

describe('nestEnter', () => {
  it('a launch never animates, settled or not, on the first card', () => {
    expect(nestEnter({ settled: false, mounted: false, prevDepth: 0, depth: 0, layer: 'a' })).toBeUndefined();
    expect(nestEnter({ settled: false, mounted: true, prevDepth: 0, depth: 1, prevLayer: 'a', layer: 'b' })).toBeUndefined();
  });
  it('after the launch: a deeper layer rises in, a parent settles back, the same layer stays still', () => {
    expect(nestEnter({ settled: true, mounted: false, prevDepth: 0, depth: 0, layer: 'a' })).toBe('in');
    expect(nestEnter({ settled: true, mounted: true, prevDepth: 0, depth: 1, prevLayer: 'a', layer: 'b' })).toBe('in');
    expect(nestEnter({ settled: true, mounted: true, prevDepth: 2, depth: 1, prevLayer: 'c', layer: 'b' })).toBe('back');
    expect(nestEnter({ settled: true, mounted: true, prevDepth: 1, depth: 1, prevLayer: 'b', layer: 'b' })).toBeUndefined();
  });
});

describe('Nest markup', () => {
  it('the first render has no entrance (a page load)', () => {
    const html = renderToStaticMarkup(<div className="gx"><Nest label="Trends" layer="root" title="Trends"><div className="gx-nest-grid"><span>1</span></div></Nest></div>);
    expect(html).toContain('class="gx-nest-card"');
    expect(html).not.toContain('data-enter');
  });
});
