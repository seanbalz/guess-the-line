import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { T, registry, historyCsv, seasonCsv, venues, corrections } from './trends-fixture.mjs';
import { shortCard } from '../shared/trends-view.mjs';
import { trendWords } from '../web/src/next/leagueWords.js';
import { TrendList } from '../web/src/next/lines/parts.jsx';
import { lineSelectionKey } from '../web/src/next/charts/TrendDetail.jsx';
vi.mock('../web/src/api.js', () => ({ linesApi: vi.fn() }));
// Expose the unchanged InfoButton body for SSR; the native modal is covered in the browser.
vi.mock('../web/src/next/ui/InfoButton.jsx', () => ({ InfoButton: ({ body }) => <aside>{body?.map(text => <p key={text}>{text}</p>)}</aside> }));
import { ResearchCards, researchLine } from '../web/src/next/research/ResearchCards.jsx';
const presets = registry.presets.filter(p => p.id === 'team_ats|t:t_rookie_hc' || p.id === 'total|any:t_rookie_hc');

describe('real registered display boundaries', () => {
  it('generates registered composite IDs, projects short cards and renders their expanded titles', () => {
    const week = T.generateWeek({ historyCsv, seasonCsv, season: 2026, week: 6, registry, venues, corrections, allowPending: true });
    for (const preset of presets) {
      expect(trendWords(preset)).toBe(preset.title.replace('NFL', 'National Football League'));
      expect(week.rows[preset.id].title).toBe(preset.title);
      for (const team of [null, 'SEA']) {
        const card = shortCard(week, { id: preset.id, ...(team ? { team } : {}) });
        const before = structuredClone(card);
        const html = renderToStaticMarkup(<TrendList cards={[card]}/>);
        expect(html).toContain(card.title.replace('NFL', 'National Football League'));
        expect(html).toContain(`data-trend-key="${card.key}"`);
        expect(card).toEqual(before);
      }
    }
  }, 60000);
  it('requires both the exact registered ID and its authored title; source and custom titles stay literal', () => {
    for (const preset of presets) {
      for (const title of ['My NFL and EPL source title', `${preset.title} custom NFL`, 'First-year NFL head coach']) {
        expect(trendWords({ ...preset, title })).toBe(title);
      }
      expect(trendWords({ ...preset, sourceState: 'source-reported' })).toBe(preset.title);
      expect(trendWords({ ...preset, id: 'custom-id' })).toBe(preset.title);
      expect(trendWords({ ...preset, id: 'toString' })).toBe(preset.title);
    }
    expect(trendWords({ id: 't_rookie_hc', title: 'First-year NFL head coach' })).toBe('First-year NFL head coach');
  });
  it('expands the actual computed atom description in historical captions and Why text without changing evidence keys', () => {
    const candidate = { id: 'research|team_ats|t:t_rookie_hc|A', title: presets[0].title, sourceState: 'computed',
      market: 'spread', family: 'coach', conditions: ['t:t_rookie_hc'], conditionDescriptions: [T.ATOMS.t_rookie_hc.desc],
      record: { wins: 1, losses: 0, pushes: 0, sample: 1, illustrativeUnits: 0.9091 },
      qualification: { label: 'Not proven' }, series: { points: [{ from: '2025-01-01', to: '2025-01-01', wins: 1, losses: 0, pushes: 0, illustrativeUnits: 0.9091 }] } };
    const before = structuredClone(candidate), key = lineSelectionKey(candidate.title, researchLine(candidate));
    const html = renderToStaticMarkup(<ResearchCards data={{ candidates: [candidate] }} ids={[candidate.id]} historical/>);
    expect(html).toContain('Why it applies: First-year National Football League head coach.');
    expect(html).toContain('<span>First-year National Football League head coach');
    expect(lineSelectionKey(candidate.title, researchLine(candidate))).toBe(key);
    expect(candidate).toEqual(before);
    const reported = { ...candidate, sourceState: 'source-reported' };
    const literal = renderToStaticMarkup(<ResearchCards data={{ candidates: [reported] }} ids={[reported.id]} historical/>);
    expect(literal).toContain('Why it applies: First-year NFL head coach.');
    expect(literal).toContain('<span>First-year NFL head coach');
    expect(literal).not.toContain('National Football League');
  });
});
