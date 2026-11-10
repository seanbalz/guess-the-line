import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { isValidElement } from 'react';
import { markupProblems } from './helpers/ui-markup.mjs';
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn() }));
const { createGuessController, draftPick, validDraft, validBoard } = await import('../web/src/next/epl/guess/guessModel.js');
const { GuessList } = await import('../web/src/next/epl/guess/EplGuess.jsx');
const { default: GuessCard } = await import('../web/src/next/epl/guess/GuessCard.jsx');
const { Segmented } = await import('../web/src/next/ui/index.js');

const NOW = Date.parse('2099-01-01T00:00:00Z');
const fixture = { eventId: 'e1', home: 'ARS', away: 'CHE', commenceTime: '2099-01-02T12:30:00Z', status: 'scheduled', kickedOff: false };
const board = patch => ({ available: true, season: 2099, week: 9, ownerId: 'owner-1', fixtures: [{ ...fixture }], guesses: [], markets: ['draw_no_bet', 'three_way'], ...patch });
const row = patch => ({ eventId: 'e1', ownerId: 'owner-1', club: null, price: 250, status: 'draft', market: 'three_way', outcome: 'draw', referencePrice: null, referenceObservedAt: null, referenceSource: null, distance: null, state: 'draft', ...patch });
const markup = element => renderToStaticMarkup(<div className="gx">{element}</div>);
const plain = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const props = data => ({ state: { status: 'ready', data, drafts: {}, busy: false }, now: NOW, onSelect: vi.fn(), onEdit: vi.fn(), onSave: vi.fn(), onReload: vi.fn(), onWeek: vi.fn() });
const find = (node, test, out = []) => { if (Array.isArray(node)) node.forEach(n => find(n, test, out)); else if (isValidElement(node)) { if (test(node)) out.push(node); find(node.props.children, test, out); } return out; };

describe('three-way entry is capability-gated', () => {
  it('a legacy server reply offers only the two-way favorite selector', () => {
    const html = markup(<GuessList {...props(board({ markets: undefined }))}/>);
    expect(html).not.toContain('Moneyline market'); expect(html).not.toContain('>Draw<'); expect(html).toContain('Who’s the favorite?');
    expect(plain(html)).toContain('2-way moneyline · draw = push');
    const off = markup(<GuessList {...props(board({ markets: ['draw_no_bet'] }))}/>);
    expect(off).not.toContain('Moneyline market');
  });
  it('a capable server offers Draw no bet | 3-way, and three outcomes including Draw in 3-way', () => {
    const html = markup(<GuessList {...props(board())}/>);
    expect(html).toContain('aria-label="Moneyline market"'); expect(plain(html)).toContain('one guess per match');
    const three = markup(<GuessCard fixture={fixture} data={board()} hero now={NOW} id="h" draft={{ market: 'three_way', outcome: 'draw', price: '+250' }} onEdit={() => {}} onSave={() => {}}/>);
    expect(plain(three)).toContain('Pick one result'); expect(three).toContain('aria-pressed="true">Draw</button>');
    expect(three.match(/gx-epl-guess-club"|gx-epl-guess-club gx-epl-guess-club--selected"/g)).toHaveLength(3);
    expect(plain(three)).toContain('a draw is its own result'); expect(markupProblems(three)).toEqual([]);
  });
  it('switching market keeps the side and sends one patch; picking Draw sets the outcome', () => {
    const onEdit = vi.fn();
    const tree = GuessCard({ fixture, data: board(), hero: true, now: NOW, id: 'h', draft: { market: 'draw_no_bet', club: 'CHE', price: '+140' }, onEdit, onSave: () => {} });
    find(tree, n => n.type === Segmented)[0].props.onChange('three_way');
    expect(onEdit).toHaveBeenLastCalledWith({ market: 'three_way', outcome: 'away' });
    const three = GuessCard({ fixture, data: board(), hero: true, now: NOW, id: 'h', draft: { market: 'three_way', outcome: 'away', price: '+300' }, onEdit, onSave: () => {} });
    find(three, n => n.type === 'button' && n.props.children === 'Draw')[0].props.onClick();
    expect(onEdit).toHaveBeenLastCalledWith({ outcome: 'draw' });
  });
  it('validates a draft against offered markets and the fixture', () => {
    expect(draftPick({ market: 'three_way', outcome: 'draw' }, fixture)).toEqual({ market: 'three_way', outcome: 'draw', club: null });
    expect(draftPick({ club: 'ARS' }, fixture)).toEqual({ market: 'draw_no_bet', club: 'ARS', outcome: 'home' });
    expect(validDraft({ market: 'three_way', outcome: 'draw', price: '+250' }, fixture, board())).toBe(true);
    expect(validDraft({ market: 'three_way', outcome: 'draw', price: '+250' }, fixture, board({ markets: ['draw_no_bet'] }))).toBe(false);
    expect(validDraft({ market: 'draw_no_bet', club: 'LIV', price: '-120' }, fixture, board())).toBe(false);
    expect(validBoard(board({ guesses: [row()] }))).toBe(true);
    expect(validBoard(board({ guesses: [row({ club: 'ARS' })] }))).toBe(false);
    expect(validBoard(board({ guesses: [row({ market: undefined, outcome: undefined, club: null })] }))).toBe(false);
  });
  it('locks market, outcome and price in one market-aware save and checks the reply', async () => {
    const saved = row({ status: 'locked', state: 'pending', lockedAt: '2099-01-01T00:00:00Z', price: 240 });
    const api = vi.fn().mockResolvedValueOnce(board()).mockResolvedValueOnce(saved).mockResolvedValueOnce(board({ guesses: [saved] }));
    const c = createGuessController(api); await c.load();
    c.edit('e1', { market: 'three_way', outcome: 'draw', price: '+240' }); await c.save('e1', true);
    expect(api.mock.calls[1]).toEqual(['guess/save', { eventId: 'e1', market: 'three_way', outcome: 'draw', price: 240, lock: true }]);
    expect(c.getSnapshot().notice).toBe('Guess locked. Final for this match.'); expect(c.getSnapshot().drafts).toEqual({});
    const mismatch = vi.fn().mockResolvedValueOnce(board()).mockResolvedValueOnce(row({ outcome: 'home', club: 'ARS', price: 240, status: 'locked', state: 'pending' })).mockResolvedValueOnce(board());
    const m = createGuessController(mismatch); await m.load(); m.edit('e1', { market: 'three_way', outcome: 'draw', price: '+240' }); await m.save('e1', true);
    expect(m.getSnapshot().drafts.e1).toBeTruthy(); expect(mismatch.mock.calls.map(x => x[0])).toEqual(['guess/read', 'guess/save', 'guess/read']);
  });
  it('a market-aware two-way save names the outcome; a legacy server gets the exact old body; 3-way never reaches a legacy server', async () => {
    const aware = vi.fn().mockResolvedValueOnce(board()).mockResolvedValueOnce(row({ market: 'draw_no_bet', outcome: 'home', club: 'ARS', price: -130 }));
    const a = createGuessController(aware); await a.load(); a.edit('e1', { club: 'ARS', price: '-130' }); await a.save('e1', false);
    expect(aware.mock.calls[1][1]).toEqual({ eventId: 'e1', market: 'draw_no_bet', outcome: 'home', price: -130, lock: false });
    const legacy = vi.fn().mockResolvedValue(board({ markets: undefined }));
    const l = createGuessController(legacy); await l.load(); l.edit('e1', { market: 'three_way', outcome: 'draw', price: '+250' }); await l.save('e1', true);
    expect(legacy).toHaveBeenCalledTimes(1); expect(l.getSnapshot().drafts).toEqual({});
  });
  it('shows a locked three-way pick and revealed picks with their market', () => {
    const own = row({ status: 'locked', state: 'pending', lockedAt: '2099-01-01T00:00:00Z' });
    const other = row({ ownerId: 'other', name: 'Troy', market: 'draw_no_bet', outcome: 'away', club: 'CHE', price: 140, status: 'locked', state: 'pending', lockedAt: '2099-01-01T00:00:00Z' });
    const html = markup(<GuessCard fixture={fixture} data={board({ guesses: [own, other] })} saved={own} draft={{}} now={NOW} id="r"/>);
    expect(plain(html)).toContain('Your pick: Draw · 3-way'); expect(plain(html)).toContain('Troy · Chelsea · Draw no bet +140');
    expect(markupProblems(html)).toEqual([]);
  });
});
