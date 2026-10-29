import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { isValidElement } from 'react';
import { markupProblems } from './helpers/ui-markup.mjs';
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn() }));
const { cloudApi } = await import('../web/src/api.js');
const { eplApi } = await import('../web/src/next/epl/api.js');
const { createGuessController, stepPrice, parsePrice, priceText, visibleGuesses, isClosed } = await import('../web/src/next/epl/guess/guessModel.js');
const { GuessList } = await import('../web/src/next/epl/guess/EplGuess.jsx');
const { GuessLeaderboard } = await import('../web/src/next/epl/guess/EplGuessLeaderboard.jsx');
const { default: PriceStepper } = await import('../web/src/next/epl/guess/PriceStepper.jsx');
const { default: GuessCard } = await import('../web/src/next/epl/guess/GuessCard.jsx');
const { default: DistanceLine } = await import('../web/src/next/epl/guess/DistanceLine.jsx');
const { MAX_GUESS_PRICE } = await import('../shared/epl-moneyline.mjs');
const { Button } = await import('../web/src/next/ui/index.js');
const NOW = Date.parse('2099-01-01T00:00:00Z');
const fixture = { eventId: 'e1', home: 'ARS', away: 'CHE', commenceTime: '2099-01-02T12:30:00Z', status: 'scheduled', kickedOff: false };
const guess = patch => ({ eventId: 'e1', ownerId: 'owner-1', club: 'ARS', price: -120, status: 'draft', referencePrice: null, referenceObservedAt: null, referenceSource: null, distance: null, state: 'draft', ...patch });
const board = patch => ({ available: true, season: 2099, week: 9, ownerId: 'owner-1', fixtures: [{ ...fixture }], guesses: [], ...patch });
const locked = guess({ status: 'locked', state: 'pending', lockedAt: '2099-01-01T00:00:00Z' });
const defer = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const edit = c => c.edit('e1', { club: 'ARS', price: '-120' });
const markup = element => renderToStaticMarkup(<div className="gx">{element}</div>);
const plain = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const props = patch => ({ state: { status: 'ready', data: board(), drafts: {}, busy: false }, now: NOW, onSelect: vi.fn(), onEdit: vi.fn(), onSave: vi.fn(), onReload: vi.fn(), onWeek: vi.fn(), ...patch });

describe('moneyline input and honest results', () => {
  it('steps across even odds in both directions and accepts typed whole American prices', () => {
    expect(stepPrice('-105', 1)).toBe(100); expect(stepPrice('+100', 1)).toBe(105);
    expect(stepPrice('+105', -1)).toBe(100); expect(stepPrice('-100', -1)).toBe(-105);
    expect(parsePrice('−112')).toBe(-112); expect(parsePrice('120.5')).toBeNaN(); expect(parsePrice('1e3')).toBeNaN();
    expect(priceText(-100)).toBe('+100 / −100 (even)');
  });
  it('draws a labelled keyboard input with a 44px decrement/increment action and invokes stepping', () => {
    const onChange = vi.fn(), tree = PriceStepper({ value: '-105', onChange, id: 'price' });
    const controls = tree.props.children[1].props.children;
    controls[2].props.onClick(); expect(onChange).toHaveBeenCalledWith('100');
    const html = markup(tree); expect(markupProblems(html)).toEqual([]); expect(html).toContain('inputMode="text"');
  });
  it('allows the shared storage-safe boundary and disables a step beyond either edge', () => {
    for (const sign of [-1, 1]) {
      const tree = PriceStepper({ value: String(sign * MAX_GUESS_PRICE), onChange: vi.fn(), id: 'edge' });
      const controls = tree.props.children[1].props.children;
      expect(controls[sign < 0 ? 0 : 2].props.disabled).toBe(true);
      expect(controls[sign < 0 ? 2 : 0].props.disabled).toBe(false);
      const bad = markup(<PriceStepper value={String(sign * (MAX_GUESS_PRICE + 1))} onChange={() => {}} id="bad"/>);
      expect(bad).toContain('aria-invalid="true"'); expect(bad).toContain('storage limit');
    }
  });
  it('shows pending vs permanently unscored and captured reference source/time without substituting zero', () => {
    expect(plain(markup(<DistanceLine guess={locked}/>))).toContain('Reference pending');
    expect(plain(markup(<DistanceLine guess={{ ...locked, state: 'unscored' }}/>))).toContain('No line before kickoff');
    const html = markup(<DistanceLine guess={{ ...locked, state: 'scored', referencePrice: 120, distance: 40, referenceSource: 'first-after', referenceObservedAt: '2099-01-01T01:00:00Z' }}/>);
    expect(html).toContain('40 points off'); expect(html).toContain('first qualifying price after lock'); expect(html).toContain('PT');
  });
  it('ranks by server order, renders 1 decimal, and keeps an all-unscored row explicitly unranked', () => {
    const html = markup(<GuessLeaderboard data={{ season: 2099, rows: [{ ownerId: 'a', name: 'Alice', average: 12, guessed: 3, unscored: 1 }, { ownerId: 'b', name: 'Bob', average: null, guessed: 0, unscored: 2 }] }}/>);
    expect(html).toContain('12.0'); expect(html).toContain('3 guessed'); expect(html).toContain('not ranked'); expect(markupProblems(html)).toEqual([]);
  });
});

describe('approved Guess the Line layout and visibility', () => {
  it('shows the next match, progress, self-hosted crests and one primary lock action', () => {
    const html = markup(<GuessList {...props()}/>);
    expect(html).toContain('0 of 1 locked'); expect(html).toContain('Who’s the favorite?');
    expect(html).toContain('/team-logos/epl/ARS.png'); expect(html.match(/gx-btn--primary/g)).toHaveLength(1);
    expect(html).toContain('Final once locked'); expect(markupProblems(html)).toEqual([]);
  });
  it('passes true for lock and false for save draft', () => {
    const onSave = vi.fn();
    const tree = GuessCard({ fixture, data: board(), draft: { club: 'ARS', price: '-120' }, hero: true, now: NOW, onSave, id: 'hero' });
    const visit = node => { if (Array.isArray(node)) return node.forEach(visit); if (!isValidElement(node)) return; if (node.type === Button && ['Lock in', 'Save draft'].includes(node.props.children)) node.props.onClick(); visit(node.props.children); };
    visit(tree); expect(onSave.mock.calls).toEqual([[true], [false]]);
  });
  it('retains permitted history when unavailable and keeps nonmembers read-only', () => {
    for (const data of [board({ available: false, guesses: [locked] }), board({ ownerId: null, guesses: [locked] })]) {
      const html = markup(<GuessList {...props({ state: { status: 'ready', data, drafts: {} } })}/>);
      expect(html).not.toContain('gx-btn--primary'); expect(html).not.toContain('Your moneyline price');
    }
    const html = markup(<GuessList {...props({ state: { status: 'ready', data: board({ available: false, guesses: [locked] }), drafts: {} } })}/>);
    expect(html).toContain('Your club:'); expect(html).toContain('Reference pending');
  });
  it('uses per-match reveal gates and never renders another draft, even with an incompatible response', () => {
    const other = guess({ ownerId: 'other', price: 333, status: 'locked' });
    const privateDraft = guess({ ownerId: 'draft-owner', price: 444 });
    const data = board({ guesses: [other, privateDraft] });
    expect(visibleGuesses(data, fixture, NOW)).toEqual([]);
    expect(visibleGuesses(data, { ...fixture, status: 'postponed' }, NOW)).toEqual([]);
    expect(visibleGuesses({ ...data, guesses: [locked, other, privateDraft] }, fixture, NOW)).toEqual([locked, other]);
    expect(visibleGuesses(data, fixture, Date.parse(fixture.commenceTime))).toEqual([other]);
    expect(markup(<GuessList {...props({ state: { status: 'ready', data, drafts: {} } })}/>)).not.toContain('333');
  });
  it('closes at exact kickoff and for postponed/final/unknown status', () => {
    expect(isClosed(fixture, Date.parse(fixture.commenceTime))).toBe(true);
    for (const status of ['postponed', 'final', 'new-status']) expect(isClosed({ ...fixture, status }, NOW)).toBe(true);
    const html = markup(<GuessList {...props({ now: Date.parse(fixture.commenceTime), state: { status: 'ready', data: board(), drafts: { e1: { club: 'CHE', price: '+160' } } } })}/>);
    expect(html).toContain('Your unsaved draft:'); expect(html).toContain('It was not locked.'); expect(html).not.toContain('gx-btn--primary');
  });
});

describe('account-scoped writes and readback', () => {
  it('posts exact final-lock payload once under double tap, then rereads permitted data', async () => {
    const pending = defer(), api = vi.fn().mockResolvedValueOnce(board()).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(board({ guesses: [locked] }));
    const c = createGuessController(api); await c.load(); edit(c);
    const first = c.save('e1', true); await c.save('e1', true);
    expect(api).toHaveBeenCalledTimes(2); expect(api.mock.calls[1]).toEqual(['guess/save', { eventId: 'e1', club: 'ARS', price: -120, lock: true }]);
    pending.resolve(locked); await first;
    expect(api.mock.calls[2][1]).toEqual({ season: 2099, week: 9 }); expect(c.getSnapshot().drafts).toEqual({});
  });
  it('saves a draft without locking or performing a second write', async () => {
    const api = vi.fn().mockResolvedValueOnce(board()).mockResolvedValueOnce(guess());
    const c = createGuessController(api); await c.load(); edit(c); await c.save('e1', false);
    expect(api.mock.calls[1][1].lock).toBe(false); expect(api).toHaveBeenCalledTimes(2); expect(c.getSnapshot().notice).toBe('Draft saved.');
  });
  it('keeps a closed-match draft and refreshes server state without replay', async () => {
    const api = vi.fn().mockResolvedValueOnce(board()).mockRejectedValueOnce({ status: 409, code: 'GTL_EPL_GUESS_CLOSED' }).mockResolvedValueOnce(board({ fixtures: [{ ...fixture, kickedOff: true }] }));
    const c = createGuessController(api); await c.load(); edit(c); await c.save('e1', true);
    expect(c.getSnapshot().notice).toBe("This match has kicked off. Your draft wasn't locked."); expect(c.getSnapshot().drafts.e1.price).toBe('-120');
    await c.save('e1', true); expect(api).toHaveBeenCalledTimes(3);
  });
  it('blocks writes after uncertain save and failed readback; successful locked readback resolves it', async () => {
    const api = vi.fn().mockResolvedValueOnce(board()).mockRejectedValueOnce({ uncertain: true }).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(board({ guesses: [locked] }));
    const c = createGuessController(api); await c.load(); edit(c); await c.save('e1', true);
    expect(c.getSnapshot().uncertain).toBe(true); expect(c.getSnapshot().drafts.e1).toBeTruthy();
    await c.save('e1', true); c.edit('e1', { price: '-200' }); expect(api).toHaveBeenCalledTimes(3);
    await c.load(); expect(api.mock.calls[3][1]).toEqual({ season: 2099, week: 9 });
    expect(c.getSnapshot().uncertain).toBe(false); expect(c.getSnapshot().drafts).toEqual({});
    expect(c.getSnapshot().notice).toBe('Saved guesses checked.');
  });
  it('does not trust malformed save success and requires readback without a blind replay', async () => {
    const api = vi.fn().mockResolvedValueOnce(board()).mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce(board());
    const c = createGuessController(api); await c.load(); edit(c); await c.save('e1', true);
    expect(api.mock.calls.map(c => c[0])).toEqual(['guess/read', 'guess/save', 'guess/read']); expect(c.getSnapshot().drafts.e1).toBeTruthy();
  });
  it('an unreadable 4xx write remains uncertain even though a coded refusal would be definite', async () => {
    const api = vi.fn().mockResolvedValueOnce(board()).mockRejectedValueOnce({ status: 400, uncertain: true }).mockRejectedValueOnce(new Error('offline'));
    const c = createGuessController(api); await c.load(); edit(c); await c.save('e1', true);
    expect(c.getSnapshot().uncertain).toBe(true); expect(api.mock.calls.map(call => call[0])).toEqual(['guess/read', 'guess/save', 'guess/read']);
  });
  it('does not let a disposed account or a superseded read publish its reply', async () => {
    const first = defer(), second = defer(), api = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const c = createGuessController(api); const a = c.load(), b = c.load();
    second.resolve(board({ week: 10 })); await b; first.resolve(board({ week: 9 })); await a;
    expect(c.getSnapshot().data.week).toBe(10);
    const wait = defer(), old = createGuessController(() => wait.promise); const read = old.load(); old.dispose(); wait.resolve(board()); await read; expect(old.getSnapshot().data).toBeNull();
  });
  it('ignores an in-flight write after account disposal', async () => {
    const wait = defer(), api = vi.fn().mockResolvedValueOnce(board()).mockReturnValueOnce(wait.promise);
    const c = createGuessController(api); await c.load(); edit(c); const writing = c.save('e1', true); c.dispose(); wait.resolve(locked); await writing;
    expect(c.getSnapshot().data.guesses).toEqual([]); expect(api).toHaveBeenCalledTimes(2);
  });
  it('rejects a response for the wrong requested week and preserves the current data', async () => {
    const api = vi.fn().mockResolvedValueOnce(board()).mockResolvedValueOnce(board({ week: 11 }));
    const c = createGuessController(api); await c.load(); await c.load({ season: 2099, week: 10 });
    expect(c.getSnapshot().data.week).toBe(9); expect(c.getSnapshot().status).toBe('stale');
  });
  it('drops old-manager local drafts if the same account is linked to a different owner on refresh', async () => {
    const api = vi.fn().mockResolvedValueOnce(board()).mockResolvedValueOnce(board({ ownerId: 'new-owner' }));
    const c = createGuessController(api); await c.load(); edit(c); await c.load({ pinned: true });
    expect(c.getSnapshot().drafts).toEqual({}); expect(c.getSnapshot().data.ownerId).toBe('new-owner');
  });
  it('unavailable/nonmember/closed/invalid drafts never trigger a save', async () => {
    for (const data of [board({ available: false }), board({ ownerId: null }), board({ fixtures: [{ ...fixture, status: 'postponed' }] }), board()]) {
      const api = vi.fn().mockResolvedValue(data), c = createGuessController(api); await c.load(); c.edit('e1', { club: 'ARS', price: '99' }); await c.save('e1', true); expect(api).toHaveBeenCalledTimes(1);
    }
  });
  it('refuses wider new guesses but preserves readable legacy stored values', async () => {
    const legacy = guess({ price: MAX_GUESS_PRICE + 1 }), api = vi.fn().mockResolvedValue(board({ guesses: [legacy] }));
    const c = createGuessController(api); await c.load();
    expect(c.getSnapshot().status).toBe('ready'); expect(c.getSnapshot().data.guesses[0].price).toBe(legacy.price);
    for (const price of [MAX_GUESS_PRICE + 1, -MAX_GUESS_PRICE - 1]) { c.edit('e1', { club: 'ARS', price: String(price) }); await c.save('e1', true); }
    expect(api).toHaveBeenCalledTimes(1);
  });
  it('old-API reads show a clear unavailable sentence without entry', async () => {
    const c = createGuessController(vi.fn().mockRejectedValue({ status: 404, code: 'GTL_EPL_GUESS_OFF' })); await c.load();
    const html = markup(<GuessList {...props({ state: c.getSnapshot() })}/>); expect(html).toContain('not available in this app version'); expect(html).not.toContain('Lock in');
  });
  it('classifies both reads as read-only and only guess/save as a nonreplayed write', async () => {
    cloudApi.mockClear(); for (const action of ['guess/read', 'guess/leaderboard', 'guess/save']) await eplApi(action);
    expect(cloudApi.mock.calls.map(call => [call[0], call[2].save])).toEqual([['epl/guess/read', false], ['epl/guess/leaderboard', false], ['epl/guess/save', true]]);
  });
});
