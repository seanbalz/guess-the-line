// D-55 chart components and the ⓘ button, rendered with react-dom/server. Contracts: every control is named (the two
// range inputs, the view switch, the row), the charts are labelled images, the moving tooltip is hidden from screen
// readers (the range input speaks instead), at most three tiles show, a closed ⓘ leaves only its named button, and
// the kit's markup rules hold. Values are the committed Week 7 trend file's numbers.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, parseMarkup, walk } from './helpers/ui-markup.mjs';

const { TrendDetail, lineSelectionKey } = await import('../web/src/next/charts/TrendDetail.jsx');
const { TrendLine } = await import('../web/src/next/charts/TrendLine.jsx');
const { TrendRow } = await import('../web/src/next/charts/TrendRow.jsx');
const { StatTiles } = await import('../web/src/next/charts/StatTiles.jsx');
const { SeasonStems } = await import('../web/src/next/charts/SeasonStems.jsx');
const { SeasonTable } = await import('../web/src/next/charts/SeasonTable.jsx');
const { trendDetailProps } = await import('../web/src/next/lines/parts.jsx');
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
    expect(ranges.map(n => n.attrs['aria-label'])).toEqual(['Move along the line · Indoor game with a strong defense']);
    expect(ranges[0].attrs['aria-valuetext']).toBe('45.18 U, point 7');
    const view = all(html).find(n => n.attrs.role === 'group');
    expect(view.attrs['aria-label']).toBe('Chart view · Indoor game with a strong defense');
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

it('equal-valued line charts retain their distinct trend names in slider and view controls', () => {
  const line = { values: [0, 1], tip: () => ({ value: '1 U', label: 'Same evidence date' }), label: 'Cumulative units', headline: { value: '1 U', sub: 'Same record' }, tiles: [] };
  const seasonsView = { rows: seasons, headline: { value: '1 U', sub: 'Same record' }, tiles: [] };
  const html = render(<>{['Home favorites', 'Away underdogs'].map(title => <TrendDetail key={title} title={title} line={line} seasons={seasonsView}/>)}</>);
  expect(all(html).filter(n => n.tag === 'input').map(n => n.attrs['aria-label'])).toEqual([
    'Move along the line · Home favorites', 'Move along the line · Away underdogs',
  ]);
  expect(all(html).filter(n => n.attrs.role === 'group').map(n => n.attrs['aria-label'])).toEqual([
    'Chart view · Home favorites', 'Chart view · Away underdogs',
  ]);
  expect(all(html).filter(n => n.tag === 'input').map(n => n.attrs['aria-valuetext'])).toEqual(['1 U, Same evidence date', '1 U, Same evidence date']);
});

it('season sliders distinguish their trend even when seasons and records are identical', () => {
  const html = render(<>{['Home favorites', 'Away underdogs'].map(title => <SeasonStems key={title} contextLabel={title} seasons={seasons} selectedIndex={0} onSelect={() => {}}/>)}</>);
  const ranges = all(html).filter(n => n.tag === 'input');
  expect(ranges.map(n => n.attrs['aria-label'])).toEqual([
    'Move across the seasons · Home favorites', 'Move across the seasons · Away underdogs',
  ]);
  expect(ranges[0].attrs['aria-valuetext']).toBe(ranges[1].attrs['aria-valuetext']);
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

describe('win-rate evidence', () => {
  it('keeps no decided games distinct from a genuine zero in both trend views', () => {
    for (const losses of [0, 3]) {
      const rows = [2024, 2025].map(season => ({ season, w: 0, l: losses, p: 2, units: 0 }));
      const props = trendDetailProps({ years: [2024, 2025], chart: { record: { W: 0, L: losses, P: 4 }, spark: [0, 0], units: 0, seasons: rows, seasonsPositive: 0, seasonsCounted: 2 } });
      for (const view of [props.line, props.seasons]) {
        const html = render(<StatTiles tiles={view.tiles}/>);
        const bars = all(html).filter(n => n.attrs.class === 'gx-tc-bar');
        expect(bars).toHaveLength(losses ? 1 : 0);
        expect(view.tiles[0].value).toBe(losses ? '0%' : '—');
        if (!losses) expect(html).toContain('No decided games');
      }
    }
  });
  it('labels season columns visibly and displays percentages without fabricating an empty sample', () => {
    const html = render(<SeasonTable caption="Sample seasons" seasons={[
      { season: 2023, w: 0, l: 0, p: 2, units: 0 },
      { season: 2024, w: 0, l: 2, p: 0, units: -2 },
      { season: 2025, w: 2, l: 1, p: 0, units: 0.82 },
    ]}/>);
    expect(markupProblems(html)).toEqual([]);
    expect(all(html).find(n => n.tag === 'thead').attrs.class).not.toBe('gx-sr-only');
    expect(all(html).filter(n => n.attrs.scope === 'col')).toHaveLength(4);
    expect(all(html).filter(n => n.attrs.class === 'gx-tc-bar')).toHaveLength(2);
    expect(html).toContain('No decided games');
    expect(html).toContain('0%');
    expect(html).toContain('66.7%');
  });
});


describe('season selection', () => {
  it('exposes named table controls with one selected season and the chart relationship', () => {
    const html = render(<SeasonTable seasons={seasons} caption="Seasons" selectedSeason={2020} onSelect={() => {}} chartId="season-plot"/>);
    expect(markupProblems(html)).toEqual([]);
    const buttons = all(html).filter(n => n.tag === 'button');
    expect(buttons.map(n => n.attrs['aria-label'])).toEqual(seasons.map(s => `Show ${s.season} season on chart`));
    expect(buttons.map(n => n.attrs['aria-pressed'])).toEqual(['false', 'false', 'true', 'false']);
    expect(buttons.every(n => n.attrs['aria-controls'] === 'season-plot')).toBe(true);
  });
  it('uses the shared selection and describes zero units as at break-even', () => {
    const rows = [{ season: 2024, w: 0, l: 0, p: 1, units: 0 }, ...seasons];
    const html = render(<SeasonStems seasons={rows} selectedIndex={0} onSelect={() => {}} id="season-plot"/>);
    expect(markupProblems(html)).toEqual([]);
    const slider = all(html).find(n => n.tag === 'input');
    expect(slider.attrs.value).toBe('0');
    expect(slider.attrs['aria-valuetext']).toBe('2024: 0–0–1, 0.0 units, at break-even');
    expect(html).toContain('id="season-plot"');
  });
});

describe('retained line selection', () => {
  const line = { values: [0, 2, 1], start: '2024', end: '2025', label: 'Sample', tip: i => ({ value: `${i} U`, label: `Game ${i}` }) };
  it('keeps identity across equivalent rerenders but changes with the evidence, even for equal values', () => {
    const key = lineSelectionKey('Trend', line);
    expect(lineSelectionKey('Trend', { ...line, values: [...line.values], tip: i => ({ ...line.tip(i) }) })).toBe(key);
    for (const changed of [
      { ...line, values: [0, 2, 1, 1] },
      { ...line, values: [0, 3, 1] },
      { ...line, start: '2023' },
      { ...line, end: '2026' },
      { ...line, label: 'Different sample' },
      { ...line, tip: i => ({ ...line.tip(i), label: `Different date ${i}` }) },
    ]) expect(lineSelectionKey('Trend', changed)).not.toBe(key);
    expect(lineSelectionKey('Different trend', line)).not.toBe(key);
  });
  it('draws the supplied selection, including zero, and bounds it to the current series', () => {
    for (const [selectedIndex, expected] of [[0, 0], [1, 1], [-2, 0], [99, 2]]) {
      const html = render(<TrendLine {...line} selectedIndex={selectedIndex} onSelect={() => {}}/>);
      const slider = all(html).find(n => n.tag === 'input');
      expect(slider.attrs.value).toBe(String(expected));
      expect(slider.attrs['aria-valuetext']).toBe(`${expected} U, Game ${expected}`);
      expect(markupProblems(html)).toEqual([]);
    }
  });
});


it('draws zero seasons as baseline markers and missing units as no mark', () => {
  const rows = [{ season: 2022, w: 1, l: 1, p: 0, units: 0 }, { season: 2023, w: 2, l: 1, p: 0, units: 0.1 }, { season: 2024, w: 1, l: 2, p: 0, units: -0.1 }, { season: 2025, w: 0, l: 0, p: 0, units: null }];
  const html = render(<SeasonStems seasons={rows} selectedIndex={0} onSelect={() => {}}/>), nodes = all(html);
  expect(nodes.filter(n => (n.attrs.class || '').split(' ').includes('gx-tc-stem--zero'))).toHaveLength(1);
  expect(nodes.filter(n => (n.attrs.class || '').split(' ').includes('gx-tc-stem--up'))).toHaveLength(1);
  expect(nodes.filter(n => (n.attrs.class || '').split(' ').includes('gx-tc-stem--down'))).toHaveLength(1);
  expect(html).toContain('0 U · break-even');
  expect(html).toContain('2025: 0–0, units unavailable');
  expect(markupProblems(html)).toEqual([]);
});

describe('recent outcome counts', () => {
  const props = last10 => trendDetailProps({ years: [2024, 2025], chart: { record: { W: 8, L: 4, P: 2 }, spark: [0, 3], units: 3, seasons, last10 } });
  it('distinguishes wins, losses and pushes without claiming chronological order', () => {
    for (const view of [props({ W: 7, L: 2, P: 1 }).line, props({ W: 7, L: 2, P: 1 }).seasons]) {
      const html = render(<StatTiles tiles={view.tiles}/>), nodes = all(html);
      expect(nodes.filter(n => n.attrs.class === 'gx-tc-block gx-tc-block--on')).toHaveLength(7);
      expect(nodes.filter(n => n.attrs.class === 'gx-tc-block')).toHaveLength(2);
      expect(nodes.filter(n => n.attrs.class === 'gx-tc-block gx-tc-block--push')).toHaveLength(1);
      expect(html).toContain('W · L · P; grouped counts');
      expect(markupProblems(html)).toEqual([]);
    }
  });
  it('names the actual recent sample and keeps an empty record distinct from losses or pushes', () => {
    for (const [last10, label, count] of [[{ W: 1, L: 1, P: 1 }, 'Last 3', 3], [{ W: 0, L: 0, P: 2 }, 'Last 2', 2], [{ W: 0, L: 0, P: 0 }, 'Recent games', 0]]) {
      const tile = props(last10).line.tiles[1], html = render(<StatTiles tiles={[tile]}/>);
      expect(tile.label).toBe(label);
      expect(all(html).filter(n => (n.attrs.class || '').split(' ').includes('gx-tc-block'))).toHaveLength(count);
      if (!count) { expect(tile.value).toBe('—'); expect(html).toContain('No recent games'); }
    }
    expect(props({ W: 7, L: 3, P: 0 }).line.tiles[1].value).toBe('7–3–0');
    expect(props(null).line.tiles.map(t => t.label)).toEqual(['Win rate', 'Games']);
  });
});

describe('visible chart scales', () => {
  it('states the plotted unit range, preserving small nonzero values and missing evidence', async () => {
    const { ChartScale } = await import('../web/src/next/charts/ChartScale.jsx');
    for (const [extent, text] of [
      [{ low: 0, high: 45.18 }, '0 to +45.18 U'],
      [{ low: -2.22, high: 0 }, '−2.22 to 0 U'],
      [{ low: -0.001, high: 0.002 }, '−0.001 to +0.002 U'],
      [{ low: 0, high: 0 }, '0 U · break-even'], [null, 'Unavailable'],
    ]) {
      const html = render(<ChartScale extent={extent} id="unit-scale"/>);
      expect(html).toContain(text); expect(markupProblems(html)).toEqual([]);
    }
  });
  it('connects each chart image to its own scale, which stays independent of point selection', () => {
    for (const node of [
      <TrendLine values={[0, -2, 5]} selectedIndex={0} tip={i => ({ value: `${i} U`, label: 'Sample' })} label="Units"/>,
      <SeasonStems seasons={[{ season: 2024, w: 1, l: 2, units: -2 }, { season: 2025, w: 3, l: 0, units: 5 }]} selectedIndex={0} onSelect={() => {}}/>,
    ]) {
      const html = render(node), nodes = all(html);
      const scale = nodes.find(n => n.attrs.class === 'gx-tc-scale');
      expect(nodes.find(n => n.attrs.role === 'img').attrs['aria-describedby']).toBe(scale.attrs.id);
      expect(html).toContain('−2 to +5 U'); expect(markupProblems(html)).toEqual([]);
    }
  });
});
