// Bets › My bets › Overview, design audit A13 and A16. Contracts:
// - the record reads in the app's one style ("1–1–0", en dashes, all three parts) and units as "+0.75U" (no space);
// - the chart's time axis uses short Pacific dates ("Nov 4"), with one label when the first and last tickets settled on
//   the same day, and the readout names the day the same way (never a raw ISO date);
// - a breakdown with one row is a stat line with no bar (a lone full-width bar compares nothing); two or more keep bars;
// - a push is drawn in pending (with its word), never data, and breakdown bars use the bar-1 to bar-2 gradient (D-55).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseMarkup, walk, nameFrom } from './helpers/ui-markup.mjs';
import { NetUnits } from '../web/src/next/bets/NetUnits.jsx';
import { TrackedOverview } from '../web/src/next/bets/TrackedOverview.jsx';

const ME = 'luke';
const summary = { wins: 1, losses: 1, pushes: 0, pending: 1, record: '1-1-0', netUnits: 0.75, roiSampleCount: 2, roiPercent: 60, winRatePercent: 50 };
const point = (at, cumulativeNetUnits) => ({ ownerId: ME, at, cumulativeNetUnits });
const nodes = html => [...walk(parseMarkup(html))];
const axis = html => nodes(html).find(n => n.attrs?.class === 'gx-tc-axis').children.map(nameFrom);
const tile = (html, label) => nameFrom(nodes(html).find(n => n.tag && nameFrom(n) === label).parent.children.find(n => n.tag && nameFrom(n) !== label));

describe('Net units (A13, A16)', () => {
  const sameDay = renderToStaticMarkup(<NetUnits summary={summary} points={[point('2026-11-04T18:00:00.000Z', 1), point('2026-11-04T19:00:00.000Z', 0.75)]} player={ME}/>);
  it('reads the record with en dashes and the units with no space', () => {
    expect(tile(sameDay, 'Record')).toBe('1–1–0');
    expect(nameFrom(nodes(sameDay).find(n => n.attrs?.class === 'gx-tc-big'))).toBe('+0.75U');
    expect(sameDay).not.toContain('1-1-0');
    expect(nameFrom(nodes(sameDay).find(n => n.attrs?.class === 'gx-tc-tip-value'))).toBe('+0.75U');
  });
  it('labels the time axis once with a short date when both ends are the same day, and names that day in the readout', () => {
    expect(axis(sameDay)).toEqual(['Nov 4', '']);
    expect(sameDay).toContain('Ticket 2 · Nov 4');
    expect(sameDay).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
  it('labels both ends when the tickets settled on different days, in Pacific time', () => {
    // 05:00 UTC on Nov 4 is still Nov 3 in Pacific time.
    const html = renderToStaticMarkup(<NetUnits summary={summary} points={[point('2026-11-04T05:00:00.000Z', 1), point('2026-11-05T19:00:00.000Z', 0.75)]} player={ME}/>);
    expect(axis(html)).toEqual(['Nov 3', 'Nov 5']);
  });
  it('shows a dash, not 0–0–0, while there is no summary', () => {
    expect(tile(renderToStaticMarkup(<NetUnits/>), 'Record')).toBe('—');
  });
});

describe('Overview breakdowns (A16)', () => {
  const model = { summary: { ...summary, bets: 3, excludedCount: 0, incompleteCount: 1 }, chart: [], entries: [{}, {}, {}], pendingStakeUnits: 0.5, unknownPendingStakes: 0,
    types: [{ label: 'Singles', count: 2 }, { label: 'Parlays', count: 1 }], markets: [{ label: 'Props / custom', count: 3 }],
    sources: [{ label: 'Book B', value: 'book:Book B', count: 2 }, { label: 'Book A', value: 'book:Book A', count: 1 }],
    outcomes: [{ outcome: 'win', label: 'Won', count: 1 }, { outcome: 'loss', label: 'Lost', count: 1 }, { outcome: 'push', label: 'Push', count: 0 }, { outcome: 'pending', label: 'Open', count: 1 }, { outcome: 'void', label: 'Void', count: 0 }] };
  const html = renderToStaticMarkup(<div className="gx"><TrackedOverview model={model} actorId={ME} amounts="units" onAmounts={() => {}} onFilter={() => {}} onSource={() => {}} onTickets={() => {}}/></div>);
  const section = title => nodes(html).find(n => n.attrs?.['aria-label'] === title);
  const bars = title => [...walk(section(title))].filter(n => n.attrs?.class === 'gx-overview-bar-track').length;
  it('draws a one-row breakdown as one stat line with no bar, and keeps bars when rows compare', () => {
    expect(bars('Markets per ticket')).toBe(0);
    expect([...walk(section('Markets per ticket'))].filter(n => n.tag === 'li').map(li => li.children.map(nameFrom))).toEqual([['Props / custom3']]);
    expect(bars('Bet types')).toBe(2);
    expect(bars('Sportsbooks')).toBe(2);
  });
  it('draws a push in pending and the breakdown bars in the bar gradient', () => {
    const css = fs.readFileSync(new URL('../web/src/next/bets/tracked-overview.css', import.meta.url), 'utf8');
    const rule = selector => css.match(new RegExp(`${selector.replace(/[.>-]/g, m => `\\${m}`)} \\{([^}]*)\\}`))[1];
    expect(rule('.gx .gx-overview-result--push')).toContain('background: var(--gx-pending)');
    expect(rule('.gx .gx-overview-bar-track > span')).toContain('linear-gradient(90deg, var(--gx-bar-1), var(--gx-bar-2))');
    expect(rule('.gx .gx-overview-bar-track > span')).not.toContain('--gx-data');
  });
});
