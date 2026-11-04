// D-69 step 1, Whole week locked: useWeekLocked (web/src/next/play/useWeekLocked.js) reports this account's moments from
// each fresh Community read, under one source, and never for a read that is not this viewer's or not there yet.
// vitest, no browser (jsdom is not installed): effects do not run in a static render, so useEffect runs in place.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const state = vi.hoisted(() => ({ report: null, moments: null }));
vi.mock('react', async importOriginal => ({ ...(await importOriginal()), useEffect: fn => { fn(); } }));
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({ useMoments: () => state.moments }));
const { useWeekLocked } = await import('../web/src/next/play/useWeekLocked.js');
const { WEEK_LOCKED_SOURCE } = await import('../web/src/next/play/landing.js');

const row = (mode, filled) => ({ mode, submitted: false, satOut: false, filled, games: 14, openGames: 14 - filled, locked: filled, nextKickoff: null });
const community = (weekNumber, spread = 14, viewer = 'fixture') => ({ viewer, rules: { perGameScoring: true },
  week: { season: 2026, week: weekNumber, games: 14 }, due: [row('guess_spread', spread), row('guess_total', 3)] });
function Probe({ app }) { useWeekLocked(app); return null; }
const mount = app => renderToStaticMarkup(<Probe app={app}/>);
const app = (data, accountId = 'fixture') => ({ accountId, community: { status: 'ready', data } });
const setup = () => { state.report = vi.fn(); state.moments = { report: state.report }; };

describe('useWeekLocked', () => {
  it('reports the whole-week-locked moments of a fresh read under the Whole week locked source', () => {
    setup();
    mount(app(community(9)));
    expect(state.report).toHaveBeenCalledTimes(1);
    const [moments, options] = state.report.mock.calls[0];
    expect(options).toEqual({ source: WEEK_LOCKED_SOURCE });
    expect(moments.map(m => m.id)).toEqual(['weekLocked:2026:9:guess_spread']);
  });
  it('reports again on each fresh confirmed read: a later week brings its own moment', () => {
    setup();
    mount(app(community(9)));
    mount(app(community(10)));
    expect(state.report.mock.calls.map(c => c[0].map(m => m.id))).toEqual([['weekLocked:2026:9:guess_spread'], ['weekLocked:2026:10:guess_spread']]);
  });
  it('reports nothing without a viewer (signed out or the account not known yet)', () => {
    setup();
    const { viewer, ...unattributed } = community(9); // a read that names no viewer: only the account guard stands
    mount(app(unattributed, ''));
    mount({ accountId: undefined, community: { data: unattributed } });
    mount(null);
    expect(state.report).not.toHaveBeenCalled();
  });
  it('reports nothing for a read that is not there yet or belongs to another account', () => {
    setup();
    mount(app(null));
    mount(app(community(9, 14, 'someone-else')));
    expect(state.report).not.toHaveBeenCalled();
  });
  it('is quiet without a moments engine', () => {
    state.moments = null;
    expect(() => mount(app(community(9)))).not.toThrow();
  });
});
