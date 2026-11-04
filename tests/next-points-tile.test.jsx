// The Play landing's Guess the Points tile (D-69 P1B; web/src/next/play/points/PointsTile.jsx), rendered statically from
// fixture reads. Contracts: "2 / 5" counts locked slots of five; the line under it is the next lock, "All locked" (a word
// with its good tone) or "slots guessed"; a 404 keeps "Points is coming soon"; NEW comes from the Points moments' scope
// only. Fixture players only.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, parseMarkup, walk } from './helpers/ui-markup.mjs';

const waiting = vi.hoisted(() => ({ scopes: new Map() }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), meApi: vi.fn(), socialApi: vi.fn(), pointsApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => null, useSharedRead: () => ({ data: null }) }));
vi.mock('../web/src/fantasyData.js', () => ({ fantasyWeekKey: () => '2026-07', useFantasySnapshot: () => ({ status: 'loading' }) }));
// The engine's NEW counts by scope; the tile must ask for the Points scope only.
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({
  useNewCount: scope => waiting.scopes.get(scope) ?? 0, useMoments: () => null, useMomentScope: () => {},
}));
const { PointsTileView } = await import('../web/src/next/play/points/PointsTile.jsx');
const { SCOPES } = await import('../web/src/next/moments/catalog.js');

const slot = (name, patch = {}) => ({ slot: name, name: `Fixture ${name} Player`, team: 'PIT', gameKey: '2026_07_PIT_CLE', kickoff: '2026-10-25T17:00:00Z',
  closed: false, state: 'open', actual: null, revealed: false, own: null, house: null, lockedIn: [], guesses: [], ...patch });
const locked = { guess: 18, locked: true, lockedAt: '2026-10-21T18:00:00Z', points: null };
const READ = { season: 2026, week: 7, status: 'open', result: null, standings: { week: [], season: [] },
  slots: [slot('QB', { own: locked }), slot('RB', { own: locked }), slot('WR', { own: { ...locked, locked: false } }), slot('TE'), slot('FLEX')] };
const ready = data => ({ loading: false, data, error: null, retry: vi.fn() });
const button = read => {
  const html = renderToStaticMarkup(<div className="gx"><PointsTileView read={read} onOpen={() => {}}/></div>);
  expect(markupProblems(html)).toEqual([]);
  const node = [...walk(parseMarkup(html))].find(n => n.tag === 'button');
  return { label: node.attrs['aria-label'], text: [...walk(node)].filter(n => n.text !== undefined).map(n => n.text).join(' ').replace(/\s+/g, ' ').trim() };
};

describe('Play landing › Guess the Points tile (P1B)', () => {
  it('"2 / 5" locked of five, and the next lock time while a slot can still be locked', () => {
    const tile = button(ready(READ));
    expect(tile.label).toBe('Guess the Points, 2 of 5 locked, Next locks Sun 10:00 AM PT');
    expect(tile.text).toContain('Guess the Points');
    expect(tile.text).toContain('2 / 5');
    expect(tile.text).toContain('Next locks Sun 10:00 AM PT');
  });

  it('"All locked" once every slot is locked; "slots guessed" once nothing is left to lock', () => {
    expect(button(ready({ ...READ, slots: READ.slots.map(s => ({ ...s, own: locked })) })).label).toBe('Guess the Points, 5 of 5 locked, All locked');
    expect(button(ready({ ...READ, slots: READ.slots.map(s => ({ ...s, closed: true })) })).label).toBe('Guess the Points, 2 of 5 locked, slots guessed');
  });

  it('keeps "Points is coming soon" on a 404, and says so for a failure, a loading read and an unopened week', () => {
    for (const error of [{ status: 404, code: 'GTL_POINTS_OFF' }, { status: 404 }]) {
      const tile = button({ loading: false, data: null, error, retry: vi.fn() });
      expect(tile.label).toBe('Guess the Points, Points is coming soon');
      expect(tile.text).toContain('Coming soon');
      expect(tile.text).not.toMatch(/\d \/ \d/);
    }
    expect(button({ loading: false, data: null, error: { status: 503 }, retry: vi.fn() }).label).toBe('Guess the Points, Points could not be loaded');
    expect(button({ loading: true, data: null, error: null, retry: vi.fn() }).label).toBe('Guess the Points, loading');
    expect(button(ready({ status: 'unopened', slots: [] })).label).toBe('Guess the Points, opens Tuesdays at 12:00 AM PT');
  });

  it('NEW comes from the Points scope only: a waiting exact guess marks the tile and its name; another scope does not', () => {
    waiting.scopes = new Map([[SCOPES.features, 2]]);
    expect(button(ready(READ)).label).not.toMatch(/new/);
    waiting.scopes = new Map([[SCOPES.points, 1]]);
    const tile = button(ready(READ));
    expect(tile.label).toBe('Guess the Points, 2 of 5 locked, Next locks Sun 10:00 AM PT, new result');
    expect(tile.text).toMatch(/new/i);
    waiting.scopes = new Map();
  });
});
