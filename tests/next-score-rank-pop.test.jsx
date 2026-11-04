// D-69 step 2: a Community rank move plays on Your score when the rank tile on Home opens it, so the season rank chip pops
// in place (data-moment="pop") with that moment's id, and only while it is on screen. Fixture data only.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseMarkup, walk } from './helpers/ui-markup.mjs';

const state = vi.hoisted(() => ({ popped: [] }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: vi.fn() }));
vi.mock('../web/src/next/shell/context.js', () => ({ useShell: () => ({ state: { views: { play: {} } }, go: vi.fn(), setView: vi.fn() }) }));
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({ useMoments: () => null, useMomentScope: () => {}, useNewCount: () => 0, useNewMoments: () => [], usePopped: id => state.popped.includes(id) }));
const { WeeklyScoreContent } = await import('../web/src/next/play/WeeklyScore.jsx');

const game = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-18T20:00:00Z' };
const entry = { userId: 'owner', mode: 'guess_spread', status: 'draft', eligible: true, scoreTiming: 'immediate', weekPoints: 8, weekScored: 1, standingsPoints: 0, awaitingKickoffPoints: 8,
  picks: [{ gameId: game.id, guess: -3, lockedIn: true, lockedAt: '2026-10-15T18:00:00Z', points: 8, reference: { value: -5, source: 'Synthetic three-book median', observedAt: '2026-10-15T17:59:00Z' } }] };
const data = { viewer: 'owner', season: 2026, seasons: [2026], now: '2026-10-19T00:00:00Z', weeks: [{ season: 2026, week: 6, games: [game], entries: [entry] }] };
const rank = { rank: 2, label: '2nd', move: 1, said: 'season rank 2nd, up 1', momentId: 'rank:community:guess_spread:1' };
const chip = html => [...walk(parseMarkup(html))].find(n => (n.attrs?.class ?? '').split(/\s+/).includes('gx-ys-rank'));
const render = () => renderToStaticMarkup(<div className="gx"><WeeklyScoreContent data={data} view={{}} rank={rank} onChange={() => {}} onRefresh={() => {}} onPicks={() => {}}/></div>);

describe('Your score’s season rank chip', () => {
  it('pops when its rank move plays, and is still otherwise', () => {
    state.popped = [];
    expect(chip(render()).attrs['data-moment']).toBeUndefined();
    state.popped = ['rank:community:guess_spread:1'];
    expect(chip(render()).attrs['data-moment']).toBe('pop');
  });
});
