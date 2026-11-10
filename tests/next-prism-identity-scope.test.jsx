import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const state = vi.hoisted(() => ({ accountId: 'new-account', personal: { season: 2026, week: 5 } }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => ({ accountId: state.accountId }), useSharedRead: () => ({ data: state.personal }) }));
vi.mock('../web/src/next/lines/linesData.js', () => ({ useLinesData: () => ({ app: { accountId: state.accountId }, personal: { data: state.personal }, shown: { season: 2026, week: 5 } }) }));
vi.mock('../web/src/next/shell/context.js', () => ({ useShell: () => ({ confirmLeave: () => true, closeSheet: vi.fn(), closeDialog: vi.fn(), setDirty: vi.fn() }) }));
import { ForfeitDialog } from '../web/src/next/play/ForfeitDialog.jsx';
import { YourPickSheet } from '../web/src/next/lines/YourPickSheet.jsx';
import { GameActions } from '../web/src/next/lines/GameActions.jsx';

describe('controlled component scope guards (not native captures)', () => {
  it('an account mismatch renders the forfeit warning without confirm or check actions', () => {
    const html = renderToStaticMarkup(<ForfeitDialog open args={{ accountId: 'old-account', season: 2026, week: 5 }}/>);
    expect(html).toContain('The account or week changed.');
    expect(html).not.toContain('Confirm sit-out and reveal');
    expect(html).not.toContain('Check sit-out status');
  });
  it('an account mismatch renders only the saved-pick refusal and safe return', () => {
    const html = renderToStaticMarkup(<YourPickSheet args={{ accountId: 'old-account', season: 2026, week: 5, market: 'spread', game: 'SEA-DEN' }}/>);
    expect(html).toContain('This saved pick is not in the current account and week.');
    expect(html).toContain('Back to game');
    expect(html).not.toContain('Refresh saved pick');
    expect(html).not.toContain('Community Spread guesses');
  });
  it('game actions describe full teams while keeping the original game argument', () => {
    const game = { away: { code: 'HOU' }, home: { code: 'JAX' } };
    const html = renderToStaticMarkup(<GameActions game={game} actions={[{id:'spread',label:'Spread',run:vi.fn()}]} shell={{}}/>);
    expect(html).toContain('Open Spread for Houston Texans at Jacksonville Jaguars');
    expect(html).toContain('>Spread</button>');
    expect(game.away.code).toBe('HOU');
  });
});
import { TrendRow } from '../web/src/next/charts/TrendRow.jsx';
import { TrendDetail, lineSelectionKey } from '../web/src/next/charts/TrendDetail.jsx';
import { leagueWords } from '../web/src/next/leagueWords.js';
describe('app-authored league labels keep source identity intact', () => {
  it('expands descriptive trend titles and chart names without changing the selection key or object', () => {
    const candidate = { id: 't_rookie_hc', title: 'First-year NFL head coach' };
    const line = { values: [0, 1], tip: i => ({ value: `${i} U`, label: `Game ${i}` }), start: 2025, end: 2026, label: 'Exact observed sample', headline: {value:'1 U'}, tiles:[] };
    const key = lineSelectionKey(candidate.title, line);
    const row = renderToStaticMarkup(<TrendRow title={candidate.title} displayTitle={leagueWords(candidate.title)} value="1 U"/>);
    expect(row).toContain('First-year National Football League head coach');
    const detail = renderToStaticMarkup(<TrendDetail title={candidate.title} displayTitle={leagueWords(candidate.title)} line={line} seasons={{rows:[]}}/>);
    expect(detail).toContain('Chart view · First-year National Football League head coach');
    expect(detail).toContain('Move along the line · First-year National Football League head coach');
    expect(lineSelectionKey(candidate.title, line)).toBe(key);
    expect(candidate).toEqual({id:'t_rookie_hc',title:'First-year NFL head coach'});
  });
  it('retains FEPL and non-string content; callers leave source credits and code literals outside this helper', () => {
    expect(leagueWords('FEPL · EPL history · NFL season')).toBe('FEPL · Premier League history · National Football League season');
    expect(leagueWords(null)).toBe(null);
    expect(renderToStaticMarkup(<TrendRow title="My NFL and EPL source title"/>)).toContain('My NFL and EPL source title');
  });
});
