// D-69 step 4: Bets › Recommended (research assessments) drawn. Contracts: its title is "Recommended", focusable for the
// navigation that opens it; each assessment is a picture row: the game's marks first, the assessment, the price on the
// right over its assessment word, with a stable id; the spoken name keeps the title and the label; no "Your guess vs.
// market" cross-link. The research read is a stand-in.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';

const state = vi.hoisted(() => ({ assessments: null }));
vi.mock('../web/src/api.js', () => ({ linesApi: vi.fn(() => new Promise(() => {})) }));
vi.mock('../web/src/next/shell/context.js', () => ({ useShell: () => ({ go: vi.fn(), state: { views: { bets: { view: 'research' } } } }) }));
vi.mock('../web/src/next/lines/linesData.js', () => ({ useLinesData: () => ({ app: { accountId: 'luke' } }) }));
vi.mock('../web/src/next/research/useAssessments.js', () => ({ useAssessments: () => state.assessments }));
const { default: ResearchAssessments } = await import('../web/src/next/research/Assessments.jsx');

const assessment = { id: 'a1', routeId: 'r-0123456789abcdef01234567', gameId: 'SEA-DEN', title: 'Synthetic Receiver over 65.5 yards', label: 'Research lean', color: 'yellow',
  hasConflicts: true, quote: { odds: -115, source: 'FanDuel', observedAt: '2099-10-08T15:00:00Z' }, selection: { market: 'prop' }, reasons: [], evidence: [], evidenceGroups: 1 };
const nodes = html => [...walk(parseMarkup(html))];
const textOf = n => (n.text ?? (n.children ?? []).map(textOf).join(''));

describe('Bets › Recommended', () => {
  state.assessments = { status: 'ready', reload: vi.fn(), data: { season: 2026, week: 9, assessments: [assessment], statistics: [], sources: [], coverage: null } };
  const html = renderToStaticMarkup(<div className="gx"><ResearchAssessments/></div>);
  it('is titled Recommended, focusable, with no cross-link to Your gap', () => {
    expect(markupProblems(html)).toEqual([]);
    const h1 = nodes(html).find(n => n.tag === 'h1');
    expect([textOf(h1), h1.attrs.tabindex, 'data-route-focus' in h1.attrs]).toEqual(['Recommended', '-1', true]);
    expect(html).not.toContain('Your guess vs. market');
    expect(nodes(html).find(n => n.attrs?.['data-bets-section'])?.attrs['data-bets-section']).toBe('recommended');
  });
  it('draws each assessment as a picture row: marks first, the price over its word, a stable id', () => {
    const row = nodes(html).find(n => n.tag === 'button' && n.attrs?.['data-assessment']);
    expect(row.attrs.id).toBe('gx-b-ra-r-0123456789abcdef01234567');
    expect(nameFrom(row)).toBe('Synthetic Receiver over 65.5 yards Research lean, −115, opposing evidence present');
    expect(/\bgx-prow-pic\b/.test(row.children[0].attrs?.class ?? '')).toBe(true);
    expect([...walk(row.children[0])].filter(n => /\bgx-team(?![\w-])/.test(n.attrs?.class ?? '')).length).toBe(2);
    expect(textOf(nodes(html).find(n => /\bgx-prow-value\b/.test(n.attrs?.class ?? '')))).toBe('−115');
    expect(textOf(nodes(html).find(n => /\bgx-prow-word\b/.test(n.attrs?.class ?? '')))).toBe('Research lean');
  });
});

// A specificity of [ids, classes + attributes + pseudo-classes, types], :where() weightless.
const specificity = selector => {
  const bare = selector.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, '');
  return [(bare.match(/#[\w-]+/g) ?? []).length, (bare.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length, 0];
};
const beats = (a, b) => { for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] > b[i]; return false; };

describe('Recommended rows keep their tint (the kit paints a depth-0 row with surface-2)', () => {
  const css = readFileSync(new URL('../web/src/next/research/assessments.css', import.meta.url), 'utf8');
  const kit = readFileSync(new URL('../web/src/next/ui/pictureRow.css', import.meta.url), 'utf8');
  const kitRule = kit.split(/\r?\n/).find(l => l.startsWith('.gx .gx-nest[data-depth="0"] .gx-prow {'));
  const tints = [...css.matchAll(/^([^{\r\n]*\.gx-prow\[data-assessment="(yellow|red|green)"\])\s*\{([^}]*)\}/gm)];
  it('a tint rule exists for every colour and sets both background and border', () => {
    expect(tints.map(m => m[2]).sort()).toEqual(['green', 'red', 'yellow']);
    for (const m of tints) expect(m[3]).toMatch(/background:[^;]*tint[^;]*;[^}]*border-color:/);
  });
  it('each out-specifies the kit rule that sets a depth-0 row background', () => {
    expect(kitRule).toBeTruthy();
    const kitSpec = specificity(kitRule.slice(0, kitRule.indexOf('{')).trim());
    for (const m of tints) expect(beats(specificity(m[1].trim()), kitSpec), m[1]).toBe(true);
  });
});

describe('Recommended rows rise in once per visit', () => {
  it('the list that shows again after an assessment, or after a refresh, carries no entrance', async () => {
    const { listEnter } = await import('../web/src/next/research/Assessments.jsx');
    expect(listEnter(false, 'in')).toBe('in');
    expect(listEnter(true, 'in')).toBeUndefined();
    expect(listEnter(false, undefined)).toBeUndefined();
  });
  it('the entrance decided when the list first draws holds through every re-render while it stays up', async () => {
    const { holdRise } = await import('../web/src/next/research/Assessments.jsx');
    let held = holdRise(null, true, false, 'in');
    expect(held.value).toBe('in');
    // the first commit marks the list shown, then trends land and the screen renders again: the rise must not drop
    for (let render = 0; render < 3; render += 1) held = holdRise(held, true, true, 'in');
    expect(held.value, 'a re-render during the rise keeps data-enter').toBe('in');
    expect(holdRise(held, false, true, 'in'), 'leaving the list ends the hold').toBeNull();
    expect(holdRise(null, true, true, 'in').value, 'back from an assessment: no entrance').toBeUndefined();
  });
});
