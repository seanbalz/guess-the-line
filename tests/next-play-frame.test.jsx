// D-69 step 1, the Play frame (docs/superpowers/specs/2026-11-02-design-overhaul-design.md sections 4.1, 5 and 6):
// every Play section is a nesting card under a "Play" lip; landing tiles, week chips and the filter toggle are shared.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';

const { CLOSED_LAYER, PLAY_ROOT, PlayLayer, openPlay, playLips } = await import('../web/src/next/play/PlayLayer.jsx');
const { PlayTile } = await import('../web/src/next/play/PlayTile.jsx');
const { WeekChips, weekList } = await import('../web/src/next/play/WeekChips.jsx');
const { FilterToggle } = await import('../web/src/next/play/FilterToggle.jsx');
const { ShellContext } = await import('../web/src/next/shell/context.js');

const nodes = html => [...walk(parseMarkup(html))];
const buttons = html => nodes(html).filter(n => n.tag === 'button');
const shellWith = () => ({ go: vi.fn(), setView: vi.fn(), state: { trail: [] } });
const render = (ui, shell = shellWith()) => renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx">{ui}</div></ShellContext.Provider>);

describe('PlayLayer', () => {
  it('lips: the Play root lip comes first and opens the landing with every layer key cleared, so reopening a section never lands on an old layer', () => {
    const shell = shellWith(), toScore = vi.fn();
    const lips = playLips(shell, [{ key: 'score', label: 'Your score', open: toScore }]);
    expect(lips.map(l => [l.key, l.label])).toEqual([[PLAY_ROOT.key, 'Play'], ['score', 'Your score']]);
    lips[0].onOpen();
    expect(shell.go).toHaveBeenCalledWith('play', { section: undefined, ...CLOSED_LAYER });
    lips[1].onOpen();
    expect(toScore).toHaveBeenCalledTimes(1);
  });

  it('openPlay: a landing tile opens its section on its first layer, never a layer left open earlier', () => {
    const shell = shellWith();
    openPlay(shell, 'score');
    expect(shell.go).toHaveBeenCalledWith('play', { section: 'score', ...CLOSED_LAYER });
    openPlay(shell, 'league', { view: 'board' });
    expect(shell.go).toHaveBeenLastCalledWith('play', { section: 'league', ...CLOSED_LAYER, view: 'board' });
  });

  it('renders a nesting card: real "Back to" lip buttons, the heading, and clean markup', () => {
    const html = render(<PlayLayer label="Your score" layer="score:game:SEA-DEN" title="SEA @ DEN" parents={[{ key: 'score', label: 'Your score', open() {} }]}><p>Body</p></PlayLayer>);
    expect(buttons(html).map(nameFrom)).toEqual(['Back to Play', 'Back to Your score']);
    expect(html).toContain('SEA @ DEN');
    expect(markupProblems(html)).toEqual([]);
  });
});

describe('PlayTile', () => {
  it('one tile: label, one big number, one line, and NEW only when its card holds a waiting moment', () => {
    const quiet = render(<PlayTile label="Your score" icon="chart" big="32" sub="Week 8 · ▲ 2" tone="good" ariaLabel="Your score, 32 points, Week 8, up 2" onClick={() => {}}/>);
    const [tile] = buttons(quiet);
    expect(nameFrom(tile)).toBe('Your score, 32 points, Week 8, up 2');
    expect(quiet).toContain('gx-play-tile-sub--good');
    expect(quiet).not.toContain('NEW');
    const fresh = render(<PlayTile label="Badges" icon="trophy" big="4" sub="New: Called the Move" isNew ariaLabel="Badges, 4 earned, new badge" onClick={() => {}}/>);
    expect(fresh).toContain('NEW');
    expect(markupProblems(fresh)).toEqual([]);
  });

  it('an unknown tone falls back to plain, so a state color never appears without its word', () => {
    const html = render(<PlayTile label="League" icon="trophy" big="3rd" sub="4 new posts" tone="loud" ariaLabel="League, 3rd" onClick={() => {}}/>);
    expect(html).toContain('gx-play-tile-sub--plain');
  });
});

describe('WeekChips', () => {
  it('weekList: weeks ascending with no repeats and no bad values', () => {
    expect(weekList([8, 7, 8, 9, null, 'x', 0])).toEqual([7, 8, 9]);
  });

  it('week chips replace the dropdowns and Previous/Next: the chosen week is pressed, 44px chips, Season only with an older season', () => {
    const html = render(<WeekChips label="Week" weeks={[9, 7, 8]} week={8} onWeek={() => {}} seasons={[2026]} season={2026} onSeason={() => {}}/>);
    const chips = buttons(html);
    expect(chips.map(nameFrom)).toEqual(['Week 7', 'Week 8', 'Week 9']);
    expect(chips.find(c => nameFrom(c) === 'Week 8').attrs['aria-pressed']).toBe('true');
    expect(html).not.toContain('Season');
    const older = render(<WeekChips label="Week" weeks={[8]} week={8} onWeek={() => {}} seasons={[2026, 2025]} season={2026} onSeason={() => {}}/>);
    const season = buttons(older)[0];
    expect(nameFrom(season)).toBe('Season 2026');
    expect(season.attrs['aria-expanded']).toBe('false');
    expect(markupProblems(older)).toEqual([]);
  });
});

describe('FilterToggle', () => {
  it('filters sit behind one icon button that names its state; the panel is in place and hidden until opened', () => {
    const html = render(<FilterToggle active><label>Team<select><option>All teams</option></select></label></FilterToggle>);
    const [button] = buttons(html);
    expect(nameFrom(button)).toBe('Filter games, on');
    expect(button.attrs['aria-expanded']).toBe('false');
    const panel = nodes(html).find(n => n.attrs?.id === button.attrs['aria-controls']);
    expect(panel.attrs.hidden).toBeDefined();
    expect(nameFrom(buttons(render(<FilterToggle><span>x</span></FilterToggle>))[0])).toBe('Filter games');
  });
});
