// D-69 step 2 (design audit B0-1): the kit's Tile, the one tile Home and Play's landing draw. It keeps step 1's tile
// contract exactly (a label, an icon, one big number, one line, NEW said aloud) and adds a small picture for faces or
// marks. One source for both tabs, so Home and Play cannot drift.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';
import * as ui from '../web/src/next/ui/index.js';
import * as play from '../web/src/next/play/PlayTile.jsx';

const render = node => renderToStaticMarkup(<div className="gx">{node}</div>);
const nodes = html => [...walk(parseMarkup(html))];
const buttons = html => nodes(html).filter(n => n.tag === 'button');
const byClass = (html, cls) => nodes(html).filter(n => (n.attrs?.class ?? '').split(/\s+/).includes(cls));
const css = file => readFileSync(new URL(`../web/src/next/${file}`, import.meta.url), 'utf8');

describe('Tile (kit)', () => {
  it('is the tile Play’s landing draws: PlayTile and spokenName are the kit’s own', () => {
    expect(play.PlayTile).toBe(ui.Tile);
    expect(play.spokenName).toBe(ui.spokenName);
  });

  it('one button: label, icon, one big number in the number style, one line in its tone, and NEW said in its name', () => {
    const html = render(<ui.Tile label="Spread rank" icon="chart" big="3rd" sub="▲ 2 · 41 pts" tone="good" isNew ariaLabel="Spread rank, 3rd, up 2, 41 points" onClick={() => {}}/>);
    expect(markupProblems(html)).toEqual([]);
    const [tile] = buttons(html);
    expect(tile.attrs.type).toBe('button');
    expect(nameFrom(tile)).toBe('Spread rank, 3rd, up 2, 41 points, new');
    expect(byClass(html, 'gx-n-l').map(nameFrom)).toEqual(['3rd']);
    expect(byClass(html, 'gx-tile-sub--good')).toHaveLength(1);
    expect(byClass(html, 'gx-new')).toHaveLength(1);
  });

  it('a picture (faces, marks) sits under the label, hidden from screen readers because the name already says it', () => {
    const faces = <ui.AvatarStack people={[{ id: 'u-1', name: 'Avery Stone' }, { id: 'u-2', name: 'Blake Rivers' }]} max={4} size={24}/>;
    const html = render(<ui.Tile label="Who’s in" icon="people" picture={faces} big="4 / 6" sub="Spread ballots in" ariaLabel="Who’s in, 4 of 6 Spread ballots in" onClick={() => {}}/>);
    expect(markupProblems(html)).toEqual([]);
    const [pic] = byClass(html, 'gx-tile-pic');
    expect(pic.attrs['aria-hidden']).toBe('true');
    expect(nameFrom(buttons(html)[0])).toBe('Who’s in, 4 of 6 Spread ballots in');
    expect(render(<ui.Tile label="My bets" big="2" sub="active tickets" ariaLabel="My bets, 2 active tickets" onClick={() => {}}/>)).not.toContain('gx-tile-pic');
  });

  it('an unknown tone falls back to plain, so a state color never shows without its word; "new" is never said twice', () => {
    expect(render(<ui.Tile label="League" big="3rd" sub="4 new posts" tone="loud" ariaLabel="League, 3rd" onClick={() => {}}/>)).toContain('gx-tile-sub--plain');
    expect(ui.spokenName('Awards, 3 in Week 8, new: Sharpshooter', true)).toBe('Awards, 3 in Week 8, new: Sharpshooter');
    expect(ui.TILE_TONES).toEqual(['plain', 'good', 'warn']);
  });

  it('one stylesheet owns the tile: the kit draws .gx-tile and .gx-tiles, and Play keeps no copy of them', () => {
    const kit = css('ui/tile.css');
    expect(kit).toMatch(/\.gx \.gx-tile \{[^}]*min-height: 112px/);
    expect(kit).toMatch(/\.gx \.gx-tiles \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    expect(css('play/playFrame.css')).not.toMatch(/gx-play-tile/);
    expect(css('play/landing.css')).not.toMatch(/gx-play-tiles/);
  });
});
