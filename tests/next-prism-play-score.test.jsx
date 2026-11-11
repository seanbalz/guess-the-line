// Approved visual structures retain real entry semantics and distinguish observed data from the gated estimate.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, parseMarkup, readText, walk } from './helpers/ui-markup.mjs';
import { pointsContextSnapshot } from './fixtures/points-context-snapshot.mjs';
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn() }));
vi.mock('../web/src/fantasyData.js', () => ({ fantasyWeekKey: () => 'fixture', useFantasySnapshot: () => ({ status: 'loading' }) }));
const { PlayOverviewPicks } = await import('../web/src/next/play/PlayOverviewPicks.jsx');
const { PointsObserved } = await import('../web/src/next/play/points/PointsObserved.jsx');
const { AccuracyRing } = await import('../web/src/next/play/AccuracyRing.jsx');
const render = node => renderToStaticMarkup(<div className="gx">{node}</div>);
const nodes = html => [...walk(parseMarkup(html))];
const data = { season: 2026, week: 7, now: '2026-10-20T00:00:00Z', rules: { sentFinal: true, lateWindow: 'kickoff', perGameScoring: true },
  games: [{ id: 'one', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-25T20:00:00Z' }, { id: 'two', awayCode: 'KC', homeCode: 'LV', kickoff: '2026-10-25T21:00:00Z' }],
  ballots: { guess_spread: { picks: { one: -3, two: 2 }, lockedAt: { one: '2026-10-19T00:00:00Z' } }, guess_total: { picks: { one: 44 } } }, optOuts: [] };
const overview = patch => render(<PlayOverviewPicks data={{ ...data, ...patch }} market="spread" onMarket={() => {}} onGame={() => {}} onPoints={() => {}}/>);

describe('approved Play overview with native personal data', () => {
  it('selects the actual next unlocked game separately per market, without exposing any reference or points', () => {
    const html = overview();
    expect(markupProblems(html)).toEqual([]);
    const cards = nodes(html).filter(n => n.attrs?.['data-overview-game']);
    expect(cards.map(n => [n.attrs['data-overview-market'], n.attrs['data-overview-game']])).toEqual([['guess_spread', 'two'], ['guess_total', 'one']]);
    expect(cards.map(readText).join(' ')).toContain('Your draft');
    expect(readText(parseMarkup(html))).toContain('1 of 2 locked');
    expect(html).not.toMatch(/Saved scoring line|pts|points|reference/);
  });
  it('keeps closed and sat-out states meaningful, and an empty schedule has no made-up game', () => {
    expect(overview({ now: '2026-11-01T00:00:00Z' })).toContain('Closed');
    expect(overview({ optOuts: ['guess_total'] })).toContain('Sat out');
    const empty = overview({ games: [] });
    expect(empty).toContain('No published games');
    expect(empty).not.toContain('data-overview-game');
  });
});

describe('Points charts show observed completed games only', () => {
  const snapshot = pointsContextSnapshot();
  const slot = { playerId: '00-fixture-0', team: 'PIT', slot: 'QB', revealed: false, house: null };
  const draw = (target = slot, state = { status: 'ready', snapshot }) => render(<PointsObserved snapshot={state} slot={target} settings={{ format: 'ppr', passingTds: 4 }}/>);
  it('names the recorded weeks and actual points, excluding the 19.4 House forecast', () => {
    const html = draw();
    expect(html).toContain('Week 1: 18');
    expect(html).toContain('Week 6: 14');
    expect(html).toContain('15.6 per game');
    expect(html).not.toContain('19.4');
    expect(markupProblems(html)).toEqual([]);
  });
  it('missing players, unrecorded games and failed data never receive a zero chart', () => {
    for (const html of [draw({ ...slot, playerId: 'absent' }), draw({ ...slot, playerId: '00-fixture-2' }), draw(slot, { status: 'error' })]) {
      expect(html).not.toContain('<svg');
      expect(html).toMatch(/unavailable|No recorded completed games/);
    }
  });
});

it('the points ring represents zero and missing differently, rather than converting missing to zero', () => {
  expect(render(<AccuracyRing share={0} label="0 of 10 points">0</AccuracyRing>)).toContain('stroke-dasharray="0 100"');
  expect(render(<AccuracyRing share={null} label="No scored points yet">—</AccuracyRing>)).not.toContain('stroke-dasharray');
});
