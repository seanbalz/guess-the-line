// D-69 step 3: the kit's next-move card and stale line, shared by Play's and Research's landings (Bets next). Contracts:
// the card is one section labelled by its eyebrow with a title, an optional picture, one meta line and the one lime
// button; the screen's classes, data attributes and button id/ref arrive through props; the stale line is one status
// sentence with a ghost Refresh week button. Static markup only.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, parseMarkup, walk } from './helpers/ui-markup.mjs';
import { NextMoveCard, StaleLine, STALE_COPY } from '../web/src/next/ui/index.js';

const nodes = html => [...walk(parseMarkup(html))];
const textOf = n => (n.text ?? (n.children ?? []).map(textOf).join(''));
const render = node => renderToStaticMarkup(<div className="gx">{node}</div>);

describe('NextMoveCard', () => {
  const html = render(<NextMoveCard className="gx-x-hero" data-x="hero" eyebrow="Week 9" title="3 games" picture={<i data-picture="yes"/>} line="2 of 3 kicked off"
    lineProps={{ 'data-x': 'line', 'data-moment': 'pop' }} action={{ id: 'go', label: 'Open games', onClick: () => {} }}/>);
  it('one labelled glow section: eyebrow, title, picture, line, one lime button with its id', () => {
    expect(markupProblems(html)).toEqual([]);
    const card = nodes(html).find(n => n.tag === 'section');
    expect(card.attrs.class).toContain('gx-card--hero');
    expect(card.attrs.class).toContain('gx-x-hero');
    expect(card.attrs['data-x']).toBe('hero');
    expect(textOf(nodes(html).find(n => n.attrs?.id === card.attrs['aria-labelledby']))).toBe('Week 9');
    expect(nodes(html).filter(n => n.tag === 'h2').map(textOf)).toEqual(['3 games']);
    expect(nodes(html).filter(n => n.attrs?.['data-picture'])).toHaveLength(1);
    const line = nodes(html).find(n => n.attrs?.['data-x'] === 'line');
    expect([textOf(line), line.attrs['data-moment']]).toEqual(['2 of 3 kicked off', 'pop']);
    const buttons = nodes(html).filter(n => n.tag === 'button');
    expect(buttons.map(b => [b.attrs.id, textOf(b), b.attrs.class.includes('gx-btn--primary')])).toEqual([['go', 'Open games', true]]);
  });
  it('without a picture there is none', () => {
    expect(render(<NextMoveCard eyebrow="e" title="t" line="l" action={{ label: 'Go', onClick: () => {} }}/>)).not.toContain('data-picture');
  });
});

describe('StaleLine', () => {
  it('one status sentence with a ghost Refresh week button; the screen may add its class', () => {
    const html = render(<StaleLine className="gx-play-state-line" onRefresh={() => {}}/>);
    expect(markupProblems(html)).toEqual([]);
    const [p] = nodes(html).filter(n => n.tag === 'p');
    expect(p.attrs.role).toBe('status');
    expect(p.attrs.class).toContain('gx-play-state-line');
    expect(textOf(p)).toContain(STALE_COPY.refreshFailed);
    const [b] = nodes(html).filter(n => n.tag === 'button');
    expect([textOf(b), b.attrs.class.includes('gx-btn--ghost')]).toEqual(['Refresh week', true]);
  });
});
