import { describe, expect, it, vi } from 'vitest';
vi.mock('../web/src/auth', () => ({ cloudEnabled: false, supabase: null }));
vi.mock('../web/src/next/lines/linesData.js', () => ({ useLinesData: () => ({}) }));
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems } from './helpers/ui-markup.mjs';
import { decodeHistory, evaluateSpec } from '../shared/trend-builder.mjs';
import { bannedCopy } from '../shared/trends.mjs';
import { BuilderResult, SavedTrends, WeekMatches } from '../web/src/next/trends/TrendBuilder.jsx';
import { matchesLine } from '../web/src/next/trends/SavedTrendsSummary.jsx';
import { INFO, GUIDANCE_ORDER } from '../web/src/next/info.js';

const history = decodeHistory(JSON.parse(readFileSync(new URL('../shared/trends/builder-history.json', import.meta.url), 'utf8')));
const wrap = node => renderToStaticMarkup(<div className="gx">{node}</div>);
const entry = (id, patch = {}) => { const [away, home] = id.split('-'); return { id, nflverseId: `2026_07_${away}_${home}`, away, home, flags: { window: 'primetime', day: 'SNF', divisional: true, interconference: false, roof: 'outdoors', surface: 'grass', neutral: false, rest: { [away]: 7, [home]: 7 }, travel: [], ...patch } }; };
const games = [
  { id: 'KC-SEA', title: 'KC @ SEA', entry: entry('KC-SEA'), season: 2026, access: { spread: true, total: false }, lines: { spread: 3.5, total: null }, started: false, rules: null },
  { id: 'DAL-PHI', title: 'DAL @ PHI', entry: entry('DAL-PHI'), season: 2026, access: { spread: false, total: false }, lines: { spread: null, total: null }, started: false, rules: null },
  { id: 'NE-CHI', title: 'NE @ CHI', entry: entry('NE-CHI', { divisional: false }), season: 2026, access: { spread: true, total: true }, lines: { spread: -3, total: 44 }, started: false, rules: null },
];

describe('Trend builder UI', () => {
  it('labels a built trend as found by search, shows the period split and illustrative units, and never ROI', () => {
    const result = evaluateSpec(history, { market: 'spread', side: 'dog', filters: [{ id: 'div' }, { id: 'prime' }] });
    const html = wrap(<BuilderResult result={result} credit={history.meta.source}/>);
    expect(markupProblems(html)).toEqual([]);
    for (const text of ['Found by search — not tested', 'Built on 2002–2017', 'Held out 2018 on', 'Illustrative units at -110', 'Wilson 95% interval', 'Contributing games · ' + result.games.length, 'Record (W-L-P)', 'Cover rate', 'Sample', 'Dates · ']) expect(html).toContain(text);
    // D-66: the history file's credit is one tap away behind the card's ⓘ (checked open in the cloud-browser builder case).
    expect(html).toContain('aria-label="About the trend builder"');
    expect(html).not.toMatch(/\bROI\b/);
    expect(html).toContain(result.split.text);
    expect(bannedCopy(html.replace(/<[^>]+>/g, ' '))).toEqual([]);
  });
  it('lists only the newest page of contributing games, newest first', () => {
    const result = evaluateSpec(history, { market: 'total', side: 'over', filters: [{ id: 'snf' }] });
    const html = wrap(<BuilderResult result={result} credit={null}/>);
    const dates = [...html.matchAll(/<th scope="row">(\d{4}-\d\d-\d\d)<\/th>/g)].map(m => m[1]);
    expect(dates).toHaveLength(25);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(dates[0]).toBe(result.games.at(-1).date);
  });
  it('this week: a closed market shows how it opens and no line, an open one shows the fit', () => {
    const spec = { market: 'spread', side: 'dog', filters: [{ id: 'div' }] };
    const html = wrap(<WeekMatches spec={spec} games={games} week={7}/>);
    expect(markupProblems(html)).toEqual([]);
    expect(html).toContain('1 upcoming game fits this trend.');
    expect(html).toContain('KC @ SEA · Fits · backs KC');
    expect(html).toContain('Could fit once your line opens · 1');
    expect(html).toContain('DAL @ PHI');
    expect(html).toContain('1 other upcoming game doesn’t fit.');
    expect(html).not.toContain('3.5');
  });
  it('saved trends keep save order and show matches this week', () => {
    const items = [
      { id: 'b', spec: { market: 'total', side: 'under', filters: [{ id: 'wind10' }] } },
      { id: 'a', spec: { market: 'spread', side: 'home', filters: [{ id: 'div' }] } },
    ];
    const html = wrap(<SavedTrends items={items} games={games} week={7} onOpen={() => {}} onRemove={() => {}}/>);
    expect(markupProblems(html)).toEqual([]);
    expect(html.indexOf('data-saved="b"')).toBeLessThan(html.indexOf('data-saved="a"'));
    expect(html).toContain('Matches this week · 2');
    expect(html).toContain('No matches this week');
    expect(matchesLine({ of: 2, matching: 1, loading: false })).toBe('1 of 2 saved trends match this week');
    expect(matchesLine({ of: 1, matching: 0, loading: false })).toBe('No saved trend matches this week');
  });
  it('explains the builder in Guidance with no banned words', () => {
    expect(GUIDANCE_ORDER).toContain('trendBuilder');
    for (const line of INFO.trendBuilder.body) expect(bannedCopy(line)).toEqual([]);
  });
});
