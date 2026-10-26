import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems } from './helpers/ui-markup.mjs';
import { gameGuesses } from '../web/src/next/lines/gameGuesses.js';
vi.mock('../web/src/api.js', () => ({ communityApi: vi.fn() }));
const { GuessRows } = await import('../web/src/next/lines/EveryoneGuesses.jsx');
const game = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN' };
const row = { userId: 'other', status: 'late', lockedIn: true, eligible: true, hidden: false, pick: -11.5, error: 1, points: 8, rank: 1, tied: true, closest: true };
const render = (rows, open = true, started = false) => renderToStaticMarkup(<GuessRows market="spread" view={gameGuesses({ games: [{ gameId: game.id, rows, open, started }] }, 'you', [{ id: 'other', displayName: 'A very long member name <kept safely>' }], game, 'spread')}/>);

describe('community guess rows', () => {
  it('closed rows show a named lock with no values or score; foreign drafts show no hint', () => {
    const closed = render([row], false);
    expect(markupProblems(closed)).toEqual([]); expect(closed).toContain('Guess hidden'); expect(closed).not.toContain('11.5'); expect(closed).not.toContain('8 points');
    const draft = render([{ ...row, status: 'not_yet', lockedIn: false }]);
    expect(draft).toContain('Not locked in'); expect(draft).not.toContain('11.5'); expect(draft).not.toContain('Your draft');
  });
  it('preserves a saved zero, escaped names, Late/former-member labels and kickoff tie badges', () => {
    const html = render([{ ...row, removed: true }, { ...row, userId: 'you', pick: 0, points: 0, error: 7 }], true, true);
    expect(markupProblems(html)).toEqual([]); expect(html).toContain('&lt;kept safely&gt;'); expect(html).toContain('Late · Former member');
    expect(html).toContain('Tied closest'); expect(html).toContain('0 points · 7 off'); expect(html).toContain('Pick&#x27;em');
    expect(render([row])).not.toContain('Tied closest');
  });
});
