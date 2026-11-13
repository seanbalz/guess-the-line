import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { decode, markupProblems } from './helpers/ui-markup.mjs';
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn() }));
const { GuessList } = await import('../web/src/next/epl/guess/EplGuess.jsx');
const { homeMoneylineProgress } = await import('../web/src/next/epl/guess/homeProgress.js');
const { HomeMoneylineProgress } = await import('../web/src/next/epl/guess/HomeMoneylineProgress.jsx');
const { BetsList } = await import('../web/src/next/epl/bets/EplBets.jsx');
const { EplFantasyView } = await import('../web/src/next/epl/fantasy/EplFantasy.jsx');
const render = node => renderToStaticMarkup(<div className="gx">{node}</div>);
const text = node => decode(render(node).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
const board = { available: false, reason: 'prices_not_verified', season: 2099, week: 11, ownerId: 'owner-1', fixtures: [], guesses: [] };
const state = { status: 'ready', data: board, drafts: {}, busy: false };
const context = { accountId: 'account-1', season: 2099, week: 11, ownerId: 'owner-1' };

describe('Premier League availability and useful empty states', () => {
  it('distinguishes an empty fixture window from a failed price check without showing zero-match progress', () => {
    const html = render(<GuessList state={state} now={0}/>), words = decode(html);
    expect(words).toContain('Waiting for this matchweek’s fixtures');
    expect(words).not.toContain('Prices have not been verified');
    expect(words).not.toContain('0 of 0');
    expect(markupProblems(html)).toEqual([]);
    const schema = text(<GuessList state={{ ...state, data: { ...board, reason: 'schema_unavailable' } }} now={0}/>);
    expect(schema).toContain('This app version cannot load');
    expect(schema).not.toContain('Waiting for this matchweek’s fixtures');
  });
  it('gives Home the same fixture explanation without weakening the entry gate', () => {
    const progress = homeMoneylineProgress(board, context);
    expect(progress).toEqual({ status: 'unavailable', reason: 'no_fixtures' });
    expect(text(<HomeMoneylineProgress state={progress}/>)).toContain('Waiting for this matchweek’s fixtures');
    expect(homeMoneylineProgress({ ...board, reason: 'schema_unavailable' }, context).reason).toBe('schema_unavailable');
  });
  it('distinguishes unpriced bets from checked bets with no edge and offers a path to guessing', () => {
    const data = { available: true, week: 11, ownerId: 'owner-1', locked: 2, unpriced: 2, withoutGap: 0, items: [] };
    const waiting = text(<BetsList data={data}/>);
    expect(waiting).toContain('Waiting for verified prices for your locked guesses.');
    expect(waiting).not.toContain('No favorable gaps right now.');
    expect(text(<BetsList data={{ ...data, unpriced: 0, withoutGap: 2 }}/>)).toContain('No favorable gaps right now.');
    const empty = render(<BetsList data={{ ...data, locked: 0, unpriced: 0 }} onOpenGuess={() => {}}/>);
    expect(empty).toContain('Go to Guess the Line');
    expect(markupProblems(empty)).toEqual([]);
  });
  it('opens populated standings when no opponent is verified, while preserving an explicit Matchup selection', () => {
    const data = { week: 11, viewer: 'owner-1', capturedAt: '2099-01-01T00:00:00Z',
      matchup: { unavailable: true, reason: 'no-repeat', week: 11, starters: [], recent: [] },
      standings: [{ ownerId: 'owner-1', name: 'Example manager', wins: 3, losses: 2, total: 123, sleeperTotal: 123, bonus: 0 }] };
    const loaded = { status: 'loaded', data };
    const automatic = render(<EplFantasyView state={loaded}/>);
    expect(automatic).toContain('data-epl-fantasy="standings"');
    expect(automatic).toContain('Example manager');
    expect(markupProblems(automatic)).toEqual([]);
    const chosen = render(<EplFantasyView state={loaded} section="matchup"/>);
    expect(chosen).toContain('data-epl-fantasy="matchup"');
    expect(decode(chosen)).toContain('Matchup unavailable this week');
  });
});
