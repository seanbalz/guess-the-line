// D-70 Play › Your guesses as nesting cards (docs/superpowers/specs/2026-11-02-play-picks-nesting-cards-design.md):
// the week as one tile per game, then one game's card. Fixture games and players only; the server decides every state
// and the editor's saving is unchanged (tests/cloud-browser/next-play-nest.spec.js drives the real handler).
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';

vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn() }));
const { PerGameEditor } = await import('../web/src/next/play/PerGamePlay.jsx');
const { WeekTiles, gameTag, tileGuess } = await import('../web/src/next/play/PicksNest.jsx');
const { weekProgress } = await import('../web/src/next/play/moments.js');
const { ShellContext } = await import('../web/src/next/shell/context.js');

const NOW = Date.parse('2026-11-08T16:00:00Z'); // Sunday 8:00 AM PT
const at = minutes => new Date(NOW + minutes * 60_000).toISOString();
const games = [
  { id: 'JAX-BAL', awayCode: 'JAX', homeCode: 'BAL', kickoff: at(-3 * 24 * 60) },
  { id: 'DEN-CAR', awayCode: 'DEN', homeCode: 'CAR', kickoff: at(120) },
  { id: 'DET-MIA', awayCode: 'DET', homeCode: 'MIA', kickoff: at(120) },
  { id: 'BUF-MIN', awayCode: 'BUF', homeCode: 'MIN', kickoff: at(24 * 60 + 255) },
];
const data = {
  season: 2026, week: 9, now: new Date(NOW).toISOString(), deadline: games[0].kickoff, revision: 1, weeklyRevision: 1,
  rules: { sentFinal: true, lateWindow: 'kickoff', revealAt: 'kickoff', perGameScoring: true }, games,
  ballots: { guess_total: { picks: { 'JAX-BAL': 44.5, 'DET-MIA': 50.5 }, lockedAt: { 'JAX-BAL': at(-4 * 24 * 60) } } },
  scoring: { guess_total: { games: [{ gameId: 'JAX-BAL', guess: 44.5, lockedIn: true, eligible: true, points: 7, reference: { value: 46, source: 'Synthetic median' } }] } },
};
const shell = { openSheet() {}, setView() {}, state: { trail: [] } };
const nodes = html => [...walk(parseMarkup(html))];
const textOf = node => (node.text ?? (node.children ?? []).map(textOf).join(''));
const render = (nest, extra = {}) => renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx">
  <PerGameEditor accountId="00000000-0000-4000-8000-000000000001" initialData={data} mode="guess_total" nest={nest} {...extra}/>
</div></ShellContext.Provider>);
const nest = game => ({ game, onOpen() {}, onWeek() {} });
const lips = html => nodes(html).filter(n => n.tag === 'button' && n.attrs?.class?.includes('gx-nest-lip')).map(nameFrom);
const tiles = html => nodes(html).filter(n => n.tag === 'button' && n.attrs?.['data-tile']);
const buttons = html => nodes(html).filter(n => n.tag === 'button');
/** Lime buttons in view: the closed lock-in and sit-out dialogs keep their own Confirm buttons. */
const primaries = html => {
  const found = [], visit = n => { if (n.tag === 'dialog') return; if (n.tag === 'button' && n.attrs?.class?.includes('gx-btn--primary')) found.push(nameFrom(n)); (n.children ?? []).forEach(visit); };
  visit(parseMarkup(html));
  return found;
};
/** Visible sentences outside dialogs, disclosures and hidden help (the D-66 twelve-word rule). */
const surface = html => {
  const runs = [], visit = n => { if (n.text != null) runs.push(n.text); else if (!['details', 'dialog'].includes(n.tag) && n.attrs?.['aria-hidden'] !== 'true' && !/\bgx-sr-only\b/.test(n.attrs?.class ?? '')) (n.children ?? []).forEach(visit); };
  visit(parseMarkup(html));
  return runs.flatMap(t => t.split(/(?<=[.!?])\s+/)).map(t => t.trim()).filter(Boolean);
};

describe('the week layer', () => {
  const html = render(nest(undefined));
  it('is one card titled by the week, with no lips, one meta line and one tile per game in kickoff order', () => {
    expect(markupProblems(html)).toEqual([]);
    expect(lips(html)).toEqual([]);
    expect(nodes(html).filter(n => /^h[1-6]$/.test(n.tag)).map(textOf)).toContain('Week 9');
    expect(html).toContain('1 of 4 locked');
    expect(tiles(html).map(n => n.attrs['data-tile'])).toEqual(['JAX-BAL', 'DEN-CAR', 'DET-MIA', 'BUF-MIN']);
    expect(tiles(html).map(n => n.attrs['data-state'])).toEqual(['locked', 'open', 'draft', 'open']);
  });
  it('each tile says its state and your guess, and the next game to lock is marked Next', () => {
    expect(tiles(html).map(nameFrom)).toEqual([
      'Jacksonville Jaguars at Baltimore Ravens, Locked, 44.5',
      'Denver Broncos at Carolina Panthers, Next, no guess',
      'Detroit Lions at Miami Dolphins, Draft, 50.5',
      'Buffalo Bills at Minnesota Vikings, Mon, no guess',
    ]);
    expect(tiles(html).map(n => n.attrs.class.includes('gx-picks-tile--next'))).toEqual([false, true, false, false]);
  });
  it('shows no line, points, receipt, reveal or game card before a game is opened', () => {
    expect(html).not.toContain('data-game=');
    expect(html).not.toContain('gx-lock-receipt');
    expect(html).not.toContain('data-play="reveal"');
    expect(html).not.toContain('/ 10');
    expect(html).not.toContain('Synthetic median');
  });
  it('moves the rules and help behind ⓘ and keeps every surface sentence to twelve words', () => {
    expect(buttons(html).some(n => nameFrom(n) === 'About Your guesses')).toBe(true);
    expect(html).not.toContain('<summary');
    for (const sentence of surface(html)) expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(12);
  });
  it('keeps the week tools: the market control, the next button, check and save, and sit out', () => {
    expect(nodes(html).some(n => n.attrs?.role === 'radiogroup' || n.attrs?.['aria-label'] === 'Market')).toBe(true);
    const names = buttons(html).map(nameFrom);
    expect(names).toContain('Next to lock · Denver Broncos at Carolina Panthers');
    expect(names).toContain('Check saved picks');
    expect(names).toContain('Save draft');
    expect(names).toContain('Sit out remaining Total games');
  });
});

describe('one game', () => {
  it('an open game: a lip back to the week, its picker and Lock in as the one primary button, then Next', () => {
    const html = render(nest('DEN-CAR'));
    expect(markupProblems(html)).toEqual([]);
    expect(lips(html)).toEqual(['Back to Week 9 · Total']);
    expect(tiles(html)).toEqual([]);
    expect(nodes(html).filter(n => n.attrs?.['data-game']).map(n => n.attrs['data-game'])).toEqual(['DEN-CAR']);
    expect(html).toContain('gx-guess');
    const primary = primaries(html);
    expect(primary).toEqual(['Lock in Total']);
    expect(buttons(html).map(nameFrom)).toContain('Next to lock · Detroit Lions at Miami Dolphins');
    expect(buttons(html).some(n => nameFrom(n) === 'How to make a Total guess')).toBe(true);
    for (const sentence of surface(html)) expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(12);
  });
  it('a locked game: its receipt, no Lock in, and Next to lock as the primary button', () => {
    const html = render(nest('JAX-BAL'));
    expect(markupProblems(html)).toEqual([]);
    expect(html).toContain('gx-lock-receipt');
    expect(textOf(parseMarkup(html))).toContain('7 / 10');
    expect(buttons(html).map(nameFrom)).not.toContain('Lock in Total');
    const primary = primaries(html);
    expect(primary).toEqual(['Next to lock · Denver Broncos at Carolina Panthers']);
  });
  it('an address for a game not in this week shows the week instead', () => {
    const html = render(nest('NYJ-KC'));
    expect(lips(html)).toEqual([]);
    expect(tiles(html)).toHaveLength(4);
  });
});

describe('the pieces', () => {
  it('a tile opens its game', () => {
    const opened = [];
    const progress = weekProgress({ games, ballot: data.ballots.guess_total, picks: data.ballots.guess_total.picks, now: NOW });
    const tree = WeekTiles({ progress, mode: 'guess_total', guessOf: id => data.ballots.guess_total.picks[id], onOpen: id => opened.push(id), label: 'Week 9 games' });
    for (const item of [tree.props.children].flat()) item.props.children.props.onClick();
    expect(opened).toEqual(['JAX-BAL', 'DEN-CAR', 'DET-MIA', 'BUF-MIN']);
  });
  it('the guess reads as one number: a total, a favorite and its points, Even, or nothing', () => {
    const game = games[1];
    expect(tileGuess('guess_total', game, 45)).toEqual({ lead: null, num: '45' });
    expect(tileGuess('guess_spread', game, -3)).toEqual({ lead: 'CAR', num: '−3' });
    expect(tileGuess('guess_spread', game, 10.5)).toEqual({ lead: 'DEN', num: '−10.5' });
    expect(tileGuess('guess_spread', game, 0)).toEqual({ lead: null, num: 'Even' });
    expect(tileGuess('guess_total', game, '')).toEqual({ lead: null, num: '—' });
  });
  it('the tag is Next, the kickoff day in Pacific time for another open game, or the state word', () => {
    const row = (state, game = games[3]) => ({ id: game.id, game, state });
    expect(gameTag(row('open'), 'BUF-MIN')).toBe('Next');
    expect(gameTag(row('draft'), 'BUF-MIN')).toBe('Draft'); // its ring and name say it is next
    expect(gameTag(row('open'), 'DEN-CAR')).toBe('Mon');
    expect(['locked', 'draft', 'kicked', 'skipped', 'notopen'].map(state => gameTag(row(state), null))).toEqual(['Locked', 'Draft', 'Closed', 'Skipped', 'Not open']);
  });
});

describe('without a nest (the old Community Picks page)', () => {
  it('still stacks every game card', () => {
    const html = render(undefined);
    expect(nodes(html).filter(n => n.attrs?.['data-game']).map(n => n.attrs['data-game'])).toEqual(['JAX-BAL', 'DEN-CAR', 'DET-MIA', 'BUF-MIN']);
    expect(tiles(html)).toEqual([]);
  });
});

// D-69 step 1: Play no longer mounts the old whole-market editor (CommunityHome.jsx WeekPicks). Under rules that are not
// per-game (a server without M-07) the same cards show the saved ballot read-only: every guess shows, nothing is offered
// that would write, and the owner's saved line on a submitted ballot stays on its receipt (D-23, D-31 as before).
describe('rules that are not per-game: the same cards, read-only', () => {
  const SUBMITTED = at(-5 * 24 * 60);
  const wholeMarket = { ...data, rules: { sentFinal: false, lateWindow: 'deadline', revealAt: 'deadline' }, scoring: undefined, ballots: {
    guess_total: { picks: { 'JAX-BAL': 44.5, 'DEN-CAR': 41, 'DET-MIA': 50.5 }, submittedAt: SUBMITTED,
      scoringReferences: { 'DEN-CAR': { value: 42.5, source: 'Synthetic three-book median', observedAt: SUBMITTED, savedAt: SUBMITTED, status: 'available' } } },
    guess_spread: { picks: { 'DEN-CAR': -3 } },
  } };
  const readOnly = (game, mode = 'guess_total') => render(nest(game), { initialData: wholeMarket, mode });
  const writers = name => /^(Save draft|Lock in|Sit out|Next to lock|Use unlocked)/.test(name);
  /** Buttons a player can reach now: the closed lock-in and sit-out dialogs keep their own Confirm buttons. */
  const reachable = html => { const found = [], visit = n => { if (n.tag === 'dialog') return; if (n.tag === 'button') found.push(nameFrom(n)); (n.children ?? []).forEach(visit); }; visit(parseMarkup(html)); return found; };
  it('the week: every saved guess on its tile, one line saying why, no lime button and nothing that writes', () => {
    const html = readOnly(undefined);
    expect(markupProblems(html)).toEqual([]);
    expect(textOf(nodes(html).find(n => n.attrs?.['data-play'] === 'read-only'))).toBe('View only for now. Your saved guesses are shown and kept.');
    expect(tiles(html).map(n => n.attrs['data-state'])).toEqual(['locked', 'locked', 'locked', 'open']);
    expect(tiles(html).map(nameFrom)).toEqual([
      'Jacksonville Jaguars at Baltimore Ravens, Locked, 44.5', 'Denver Broncos at Carolina Panthers, Locked, 41',
      'Detroit Lions at Miami Dolphins, Locked, 50.5', 'Buffalo Bills at Minnesota Vikings, Next, no guess',
    ]);
    expect(reachable(html).filter(writers)).toEqual([]);
    expect(reachable(html)).toContain('Check saved picks');
    expect(html).not.toContain('waiting for a sportsbook line');
    expect(primaries(html)).toEqual([]);
    for (const sentence of surface(html)) expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(12);
  });
  it('a submitted game: its receipt with your guess and your saved line, no picker and no Lock in', () => {
    const html = readOnly('DEN-CAR');
    expect(markupProblems(html)).toEqual([]);
    const receipt = nodes(html).find(n => n.attrs?.['aria-label'] === 'DEN at CAR Total receipt');
    expect(textOf(receipt)).toContain('41');
    expect(textOf(receipt)).toContain('42.5');
    expect(html).not.toContain('gx-guess');
    expect(reachable(html).filter(writers)).toEqual([]);
  });
  it('an open game says "No guess yet" and a draft says its guess in words, with no picker, Lock in or Next', () => {
    const open = readOnly('BUF-MIN');
    expect(textOf(nodes(open).find(n => n.attrs?.['data-play'] === 'saved-guess'))).toBe('No guess yet');
    const draft = readOnly('DEN-CAR', 'guess_spread');
    expect(textOf(nodes(draft).find(n => n.attrs?.['data-play'] === 'saved-guess'))).toBe('Your guess · Panthers −3');
    for (const html of [open, draft]) {
      expect(markupProblems(html)).toEqual([]);
      expect(html).not.toContain('gx-guess');
      expect(reachable(html).filter(writers)).toEqual([]);
      expect(html).not.toContain('Every game is locked in.');
      expect(primaries(html)).toEqual([]);
    }
  });
});
