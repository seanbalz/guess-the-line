import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems } from './helpers/ui-markup.mjs';
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn() }));
const { createHomeProgressReader, homeMoneylineProgress } = await import('../web/src/next/epl/guess/homeProgress.js');
const { HomeMoneylineProgress } = await import('../web/src/next/epl/guess/HomeMoneylineProgress.jsx');
const { EplHomeView } = await import('../web/src/next/epl/EplHome.jsx');
const { EplView } = await import('../web/src/next/epl/EplApp.jsx');
const { boardModel } = await import('../web/src/next/epl/draftModel.js');
const context = { accountId: 'gtl-account', season: 2026, week: 9, ownerId: 'owner-1' };
const fixture = eventId => ({ eventId, home: 'ARS', away: 'CHE', commenceTime: '2099-10-31T12:30:00Z', status: 'scheduled', kickedOff: false });
const guess = (eventId, ownerId = context.ownerId, status = 'locked') => ({ eventId, ownerId, club: 'ARS', price: -120, status, state: status === 'locked' ? 'pending' : 'draft' });
const board = patch => ({ available: true, season: 2026, week: 9, ownerId: context.ownerId, fixtures: [fixture('a'), fixture('b'), fixture('c')], guesses: [], ...patch });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const markup = node => renderToStaticMarkup(<div className="gx">{node}</div>);

describe('Home moneyline progress', () => {
  it('counts only unique own locks for current fixtures; own drafts and opponents do not count', () => {
    const progress = homeMoneylineProgress(board({ guesses: [guess('a'), guess('a'), guess('b', context.ownerId, 'draft'), guess('c', 'opponent'), guess('b', 'opponent', 'draft'), guess('old')] }), context);
    expect(progress).toEqual({ status: 'ready', locked: 1, total: 3 });
    expect(progress).not.toHaveProperty('guesses');
    expect(homeMoneylineProgress(board(), context)).toEqual({ status: 'ready', locked: 0, total: 3 });
  });
  it('reads only the draft server EPL season/week without saves or a default NFL context', async () => {
    const api = vi.fn().mockResolvedValue(board()), reader = createHomeProgressReader(api, context);
    await reader.load();
    expect(api.mock.calls).toHaveLength(1); expect(api.mock.calls[0].slice(0, 2)).toEqual(['guess/read', { season: 2026, week: 9 }]);
    expect(api.mock.calls[0][2].signal).toBeInstanceOf(AbortSignal);
    expect(reader.getSnapshot()).toEqual({ status: 'ready', locked: 0, total: 3 });
  });
  it('renders the approved count/button and navigates to the caller’s Guess action', () => {
    const onOpenGuess = vi.fn(), button = HomeMoneylineProgress({ state: { status: 'ready', locked: 2, total: 10 }, onOpenGuess });
    button.props.onClick(); expect(onOpenGuess).toHaveBeenCalledOnce();
    const html = markup(button);
    expect(html).toContain('Guess this weekend’s moneylines · 2 of 10'); expect(html).toContain('gx-btn--secondary'); expect(markupProblems(html)).toEqual([]);
    const onRoute = vi.fn(), home = EplView({ route: { tab: 'home' }, onRoute, accountId: context.accountId });
    expect(home.key).toBe(context.accountId); expect(home.props.accountId).toBe(context.accountId);
    home.props.onOpenGuess(); expect(onRoute).toHaveBeenCalledWith({ tab: 'play', section: 'guess' });
  });
  it('keeps the existing Pick a Team primary hero usable when progress is unavailable', () => {
    const now = Date.parse('2099-10-30T12:30:00Z');
    const model = boardModel({ season: 2026, week: 9, deadline: '2099-10-31T12:30:00Z', status: 'open', me: context.ownerId, onTheClock: context.ownerId,
      order: [{ ownerId: context.ownerId, name: 'You' }], picks: [], clubs: [] }, now);
    for (const state of [{ status: 'unavailable', reason: 'read_failed' }, { status: 'unavailable', reason: 'prices_not_verified' }, { status: 'loading' }, { status: 'readonly' }]) {
      const html = markup(<EplHomeView model={model} now={now} moneyline={state} onOpenPick={() => {}} onOpenGuess={() => {}}/>);
      expect(html).toContain('Make your pick'); expect(html.match(/gx-btn--primary/g)).toHaveLength(1); expect(html).not.toContain('undefined'); expect(markupProblems(html)).toEqual([]);
    }
  });
  it('read-only and unavailable contexts never manufacture personal draft/lock counts', () => {
    expect(homeMoneylineProgress(board({ ownerId: null, guesses: [guess('a', 'opponent')] }), { ...context, ownerId: null })).toEqual({ status: 'readonly' });
    for (const data of [board({ available: false }), board({ available: false, ownerId: null, reason: 'schema_unavailable' })]) {
      const progress = homeMoneylineProgress(data, context);
      expect(progress.status).toBe('unavailable'); expect(progress).not.toHaveProperty('locked');
      expect(markup(<HomeMoneylineProgress state={progress} onOpenGuess={() => {}}/>)).not.toContain(' of ');
    }
  });
  it('older API failure stays local to progress and provides a route to existing graceful game states', async () => {
    const api = vi.fn().mockRejectedValue({ status: 404, code: 'GTL_EPL_GUESS_OFF' }), reader = createHomeProgressReader(api, context);
    await reader.load(); expect(reader.getSnapshot()).toEqual({ status: 'unavailable', reason: 'read_failed' });
    const onOpenGuess = vi.fn(), tree = HomeMoneylineProgress({ state: reader.getSnapshot(), onOpenGuess });
    tree.props.children[0].props.onClick(); expect(onOpenGuess).toHaveBeenCalledOnce();
    expect(markup(tree)).toContain('Pick a Team is still available above.');
  });
  it('fails closed on a different season, week or linked manager in a completed response', async () => {
    for (const patch of [{ week: 10 }, { season: 2027 }, { ownerId: 'other-owner' }]) {
      const reader = createHomeProgressReader(vi.fn().mockResolvedValue(board(patch)), context); await reader.load();
      expect(reader.getSnapshot()).toEqual({ status: 'unavailable', reason: 'read_failed' });
    }
  });
  it('drops late responses after account/week disposal even if the transport ignores abort', async () => {
    const old = deferred(), newContext = { ...context, accountId: 'new-account', week: 10, ownerId: 'owner-2' };
    const previous = createHomeProgressReader(() => old.promise, context), pending = previous.load(); previous.dispose();
    const next = createHomeProgressReader(vi.fn().mockResolvedValue(board({ week: 10, ownerId: 'owner-2', guesses: [guess('a', 'owner-2')] })), newContext);
    expect(next.getSnapshot()).toEqual({ status: 'loading' }); await next.load();
    old.resolve(board({ guesses: [guess('a'), guess('b')] })); await pending;
    expect(previous.getSnapshot()).toEqual({ status: 'loading' }); expect(next.getSnapshot()).toEqual({ status: 'ready', locked: 1, total: 3 });
  });
  it('a superseded request cannot overwrite a newer count, and unknown context makes no read', async () => {
    const old = deferred(), api = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(board({ guesses: [guess('a')] }));
    const reader = createHomeProgressReader(api, context), first = reader.load(); await reader.load(); old.resolve(board()); await first;
    expect(reader.getSnapshot().locked).toBe(1);
    const missing = createHomeProgressReader(api, { accountId: context.accountId }); await missing.load(); expect(missing.getSnapshot()).toEqual({ status: 'idle' }); expect(api).toHaveBeenCalledTimes(2);
  });
});
