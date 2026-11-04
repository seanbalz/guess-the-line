// Quick win A20 (November 4, 2026): ui/MetaLine.jsx, a meta line of parts joined by " · ". Contract: the line reads exactly
// as its parts joined by " · "; each part is one unit with its separator at its end, so a wrap can only fall between parts
// and no line starts with an orphan "·"; empty parts are left out. The wrapping itself is measured in the browser
// (tests/cloud-browser/next-lines.spec.js, the Lines board at 320 and 390 px).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, parseMarkup, walk } from './helpers/ui-markup.mjs';
import { MetaLine } from '../web/src/next/ui/index.js';

const textOf = node => (node.text ?? (node.children ?? []).map(textOf).join(''));
const render = node => renderToStaticMarkup(<div className="gx">{node}</div>);
const partsOf = html => [...walk(parseMarkup(html))].filter(n => n.attrs?.class === 'gx-meta-part').map(textOf);
const lineOf = html => [...walk(parseMarkup(html))].find(n => n.attrs?.class?.split(' ').includes('gx-meta-line'));

describe('MetaLine', () => {
  it('reads as its parts joined by " · ", each part one unit ending in its separator, in the meta type', () => {
    const html = render(<MetaLine parts={['Week 6', 'Due Wed 11:59 PM PT', 'Quotes 6:26 PM PT']}/>);
    expect(markupProblems(html)).toEqual([]);
    expect(partsOf(html)).toEqual(['Week 6 ·', 'Due Wed 11:59 PM PT ·', 'Quotes 6:26 PM PT']);
    const line = lineOf(html);
    expect(line.tag).toBe('p');
    expect(line.attrs.class.split(' ').sort()).toEqual(['gx-meta-line', 'gx-t-meta']);
    expect(textOf(line)).toBe('Week 6 · Due Wed 11:59 PM PT · Quotes 6:26 PM PT');
    // No part starts with the separator, so no wrapped line can start with an orphan "·".
    expect(partsOf(html).filter(part => part.trimStart().startsWith('·'))).toEqual([]);
  });

  it('leaves out empty parts and draws nothing when none are left', () => {
    expect(partsOf(render(<MetaLine parts={['Week 6', null, '', false, undefined, 'Community']}/>))).toEqual(['Week 6 ·', 'Community']);
    expect(render(<MetaLine parts={[null, '']}/>)).toBe('<div class="gx"></div>');
    expect(render(<MetaLine parts={undefined}/>)).toBe('<div class="gx"></div>');
  });

  it('can sit inside phrasing content with the type of the label around it', () => {
    const line = lineOf(render(<span className="gx-nest-tile-label"><MetaLine as="span" className="" parts={['CAR @ PHI', 'Rarely covering this season', 'PHI']}/></span>));
    expect(line.tag).toBe('span');
    expect(line.attrs.class).toBe('gx-meta-line');
  });

  it('draws each part as an inline unit that moves to the next line whole', () => {
    const css = fs.readFileSync(path.resolve(import.meta.dirname, '../web/src/next/ui/metaLine.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(/\.gx \.gx-meta-part\s*\{[^}]*display:\s*inline-block;/);
  });
});
