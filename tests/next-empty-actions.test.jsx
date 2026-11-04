// Design audit A17, rule of restraint 5 ("Empty state: one sentence and one action"). Contracts:
// - Bets › Virtual › Your picks and Everyone, for a week whose games are not published yet, show the sentence and one
//   action, "Open Play", which goes to the Play tab (the router's own Play destination, no section);
// - Research recommendations' Game research, when it has no statistics, puts "Try again" with its message, and that button
//   reloads the research read (the same reload as Refresh research), instead of pointing at a button far above it.
// Each screen's reads and the shell are stand-ins; the kit Button is wrapped only to record what each one does.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const state = vi.hoisted(() => ({ read: null, assessments: null, buttons: [], go: null }));
vi.mock('../web/src/api.js', () => ({ betsApi: vi.fn(), linesApi: vi.fn(() => new Promise(() => {})) }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => ({ accountId: 'luke', league: null, requestSignIn: vi.fn() }) }));
vi.mock('../web/src/next/shell/context.js', () => ({ useShell: () => ({ go: state.go, toast: vi.fn(), state: { views: { bets: {} } } }) }));
vi.mock('../web/src/next/league/useLeagueRead.jsx', () => ({ useLeagueRead: () => state.read, LeagueFailure: () => null }));
vi.mock('../web/src/next/lines/linesData.js', () => ({ useLinesData: () => ({ app: { accountId: 'luke' } }) }));
vi.mock('../web/src/next/research/useAssessments.js', () => ({ useAssessments: () => state.assessments }));
vi.mock('../web/src/next/ui/index.js', async original => {
  const kit = await original();
  return { ...kit, Button: props => { state.buttons.push(props); return kit.Button(props); } };
});

const { PlaceBets } = await import('../web/src/next/bets/PlaceBets.jsx');
const { EveryoneBets } = await import('../web/src/next/bets/EveryoneBets.jsx');
const { default: ResearchAssessments } = await import('../web/src/next/research/Assessments.jsx');
const { PLACE_COPY } = await import('../web/src/next/bets/place.js');
const { EVERYONE_COPY } = await import('../web/src/next/bets/everyone.js');

function render(element) {
  state.buttons = []; state.go = vi.fn();
  const html = renderToStaticMarkup(<div className="gx">{element}</div>);
  return { html, buttons: state.buttons.map(props => props.children) };
}
const press = name => state.buttons.find(props => props.children === name).onClick();

describe('a week that is not published yet', () => {
  const unpublished = { loading: false, error: null, data: { season: 2026, week: 9, published: false }, retry: vi.fn() };
  it('Your picks says so and offers Open Play, which goes to the Play tab', () => {
    state.read = unpublished;
    const { html, buttons } = render(<PlaceBets/>);
    expect(html).toContain(PLACE_COPY.unpublished);
    expect(buttons).toEqual(['Open Play']);
    press('Open Play');
    expect(state.go.mock.calls).toEqual([['play']]);
  });
  it('Everyone says so and offers Open Play, which goes to the Play tab', () => {
    state.read = unpublished;
    const { html, buttons } = render(<EveryoneBets/>);
    expect(html).toContain(EVERYONE_COPY.unpublished);
    expect(buttons).toEqual(['Open Play']);
    press('Open Play');
    expect(state.go.mock.calls).toEqual([['play']]);
  });
});

describe('Game research without statistics', () => {
  it('puts Try again with its message, and Try again reloads the research read', () => {
    const reload = vi.fn();
    state.assessments = { status: 'ready', reload, data: { season: 2026, week: 9, assessments: [], statistics: [], sources: [], coverage: null } };
    const { html, buttons } = render(<ResearchAssessments/>);
    const research = html.slice(html.indexOf('aria-label="Game research"'));
    expect(research).toContain('Game statistics are unavailable right now.');
    expect(research).not.toContain('Refresh research to retry');
    expect(research.indexOf('Try again')).toBeGreaterThan(research.indexOf('Game statistics are unavailable right now.'));
    expect(buttons.filter(name => name === 'Try again')).toHaveLength(1);
    press('Try again');
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
