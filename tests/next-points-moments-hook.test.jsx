// D-69 Guess the Points exact: usePointsMoments (web/src/next/play/points/PointsBallot.jsx) reports the viewer's exact slots
// through the moments API on a fresh /points/read reply, and reports nothing while the read has no data (loading or failed).
// Effects run during a static render here (no browser): React's useEffect is replaced by a direct call. Fixture players only.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const spy = vi.hoisted(() => ({ report: vi.fn() }));
vi.mock('react', async importOriginal => ({ ...(await importOriginal()), useEffect: effect => { effect(); } }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), meApi: vi.fn(), socialApi: vi.fn(), pointsApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => null, useSharedRead: () => ({ data: null }) }));
vi.mock('../web/src/fantasyData.js', () => ({ fantasyWeekKey: () => '2026-07', useFantasySnapshot: () => ({ status: 'loading' }) }));
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({
  useMoments: () => ({ report: spy.report }), useMomentScope: () => {}, useNewCount: () => 0, usePopped: () => false,
}));
const { usePointsMoments } = await import('../web/src/next/play/points/PointsBallot.jsx');
const { pointsSource } = await import('../web/src/next/play/points/pointsMoments.js');

const slot = (name, patch = {}) => ({ slot: name, name: `Fixture ${name} Player`, team: 'PIT', gameKey: '2026_07_PIT_CLE', kickoff: '2026-10-25T17:00:00Z',
  closed: true, state: 'scored', actual: 21, revealed: true, own: { guess: 21, locked: true, lockedAt: '2026-10-21T18:00:00Z', points: 10 }, house: null, lockedIn: [], guesses: [], ...patch });
const READ = { season: 2026, week: 7, status: 'open', result: { status: 'PROVISIONAL' }, standings: { week: [], season: [] }, slots: [slot('QB')] };
const Probe = ({ read, groupId }) => { usePointsMoments(read, groupId); return null; };
const draw = (read, groupId) => renderToStaticMarkup(<Probe read={read} groupId={groupId}/>);

describe('usePointsMoments reports through the moments API', () => {
  it('a fresh read reply reports its exact slots, from the community source (a group’s on its board)', () => {
    spy.report.mockClear();
    draw({ loading: false, data: READ, error: null });
    expect(spy.report).toHaveBeenCalledTimes(1);
    const [moments, options] = spy.report.mock.calls[0];
    expect(moments.map(m => [m.id, m.kind])).toEqual([['points-exact:2026:7:QB', 'pointsExact']]);
    expect(options).toEqual({ source: pointsSource(null) });
    spy.report.mockClear();
    draw({ loading: false, data: READ, error: null }, 'g1');
    expect(spy.report.mock.calls[0][1]).toEqual({ source: 'points:g1' });
  });

  it('while the read is loading or failed (no data), nothing is reported, so nothing plays on an unconfirmed read', () => {
    spy.report.mockClear();
    draw({ loading: true, data: null, error: null });
    draw({ loading: false, data: null, error: Object.assign(new Error('x'), { status: 500 }) });
    expect(spy.report).not.toHaveBeenCalled();
  });
});
