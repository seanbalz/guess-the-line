// D-55 chart components and the ⓘ button, rendered with react-dom/server. Contracts: every control is named (the two
// range inputs, the view switch, the row), the charts are labelled images, the moving tooltip is hidden from screen
// readers (the range input speaks instead), at most three tiles show, a closed ⓘ leaves only its named button, and
// the kit's markup rules hold. Values are the committed Week 7 trend file's numbers.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, parseMarkup, walk } from './helpers/ui-markup.mjs';

const { TrendDetail } = await import('../web/src/next/charts/TrendDetail.jsx');
const { TrendRow } = await import('../web/src/next/charts/TrendRow.jsx');
const { StatTiles } = await import('../web/src/next/charts/StatTiles.jsx');
const { InfoButton } = await import('../web/src/next/ui/InfoButton.jsx');

const render = node => renderToStaticMarkup(<div className="gx">{node}</div>);
const all = html => [...walk(parseMarkup(html))].filter(n => n.tag);
const spark = [0, 3.45, 7.82, 3.64, 4.18, 1.91, 4.45, 45.18];
const seasons = [[2018, 5, 2, 0, 2.74], [2019, 10, 6, 0, 3.22], [2020, 4, 6, 0, -2.22], [2021, 9, 6, 0, 2.67]].map(([season, w, l, p, units]) => ({ season, w, l, p, units }));
const tiles = [{ label: 'Win rate', value: '58.4%', meter: 58.4 }, { label: 'Last 10', value: '7–3', blocks: { on: 7, of: 10 } }, { label: 'Games', value: '395', sub: 'since 2002' }];
const detail = (
  <TrendDetail
    title="Indoor game with a strong defense" pill="Not proven" info={<InfoButton title="About this trend" body={['Past results.']}/>}
    line={{ values: spark, tip: i => ({ value: `${spark[i]} U`, label: `point ${i}` }), start: '2002', end: '2026', label: 'Cumulative units', headline: { value: '+45.2 U', sub: '229–163–3 since 2002' }, tiles }}
    seasons={{ rows: seasons, caption: 'Seasons 2018–21', headline: { value: '3 of 4', sub: 'seasons above break-even' }, tiles }}
  />
);

describe('the opened trend', () => {
  const html = render(detail);
  it('passes the kit markup rules and names every control', () => {
    expect(markupProblems(html)).toEqual([]);
    const ranges = all(html).filter(n => n.tag === 'input' && n.attrs.type === 'range');
    expect(ranges.map(n => n.attrs['aria-label'])).toEqual(['Move along the line']);
    expect(ranges[0].attrs['aria-valuetext']).toBe('45.18 U, point 7');
    const view = all(html).find(n => n.attrs.role === 'group');
    expect(view.attrs['aria-label']).toBe('Chart view');
    expect(all(html).filter(n => n.tag === 'button' && 'aria-pressed' in n.attrs).map(n => n.attrs['aria-pressed'])).toEqual(['true', 'false']);
  });
  it('starts on the line at its last point, labelled, with the moving tooltip hidden from screen readers', () => {
    expect(html).toContain('+45.2 U');
    expect(html).toContain('229–163–3 since 2002');
    expect(all(html).find(n => n.tag === 'svg' && n.attrs.role === 'img').attrs['aria-label']).toBe('Cumulative units');
    expect(all(html).find(n => n.attrs.class === 'gx-tc-tip').attrs['aria-hidden']).toBe('true');
    expect(html).toContain('data-zero-baseline');
  });
  it('shows at most three tiles, each number as text', () => {
    const many = render(<StatTiles tiles={[...tiles, { label: 'Fourth', value: '1' }]}/>);
    expect(all(many).filter(n => n.attrs.class === 'gx-tc-tile')).toHaveLength(3);
    expect(many).not.toContain('Fourth');
    for (const value of ['58.4%', '7–3', '395']) expect(many).toContain(value);
  });
});

describe('the compact row and the ⓘ', () => {
  it('a row is one button that says whether its detail is open', () => {
    const html = render(<TrendRow title="Strong wind" sub="Under · 55% · 1,650 games" values={spark} value="+86.4 U" open={false} controls="d1" onToggle={() => {}}/>);
    expect(markupProblems(html)).toEqual([]);
    const button = all(html).find(n => n.tag === 'button');
    expect([button.attrs['aria-expanded'], button.attrs['aria-controls']]).toEqual(['false', 'd1']);
    expect(all(html).find(n => n.tag === 'svg').attrs['aria-hidden']).toBe('true');
  });
  it('a closed ⓘ is only its named button and an empty, named dialog', () => {
    const html = render(<InfoButton title="About trends" body={['Past results since 2002.']}/>);
    expect(markupProblems(html)).toEqual([]);
    expect(all(html).filter(n => n.tag === 'button').map(n => n.attrs['aria-label'])).toEqual(['About trends']);
    expect(all(html).find(n => n.tag === 'dialog').attrs['aria-label']).toBe('About trends');
    expect(html).not.toContain('Past results since 2002.');
  });
});
