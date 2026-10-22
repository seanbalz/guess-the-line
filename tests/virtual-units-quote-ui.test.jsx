import { describe, expect, it, vi } from 'vitest';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Market } from '../web/src/VirtualUnits.jsx';

vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), date: value => value, signed: value => String(value) }));
vi.mock('../web/src/trendsLoaders.js', () => ({ loadTrendWeek: vi.fn() }));

// Contract (#140 salvage): the quote a player reviewed stays on their selection until they explicitly
// take a newer one. Changing units never re-reads the board, and a refreshed board offers the newer
// quote beside the reviewed one with its own "Use updated quote" control.
const reviewed = { book: 'draftkings', source: 'DraftKings', line: -11.5, odds: -110, observedAt: '2099-10-08T15:00:00.000Z' };
const newer = { book: 'fanduel', source: 'FanDuel', line: -10.5, odds: -105, observedAt: '2099-10-08T16:00:00.000Z' };
const game = { id: 'TB-DAL', away: 'Tampa Bay Buccaneers', home: 'Dallas Cowboys', awayCode: 'TB', homeCode: 'DAL', kickoff: '2099-10-08T20:00:00.000Z', locked: { spread: false, total: false } };
const board = offer => ({ ...game, offers: { spread: { home: offer, away: { ...offer, line: -offer.line } } } });
const selection = { gameId: game.id, market: 'spread', side: 'home', units: 1.5, offer: reviewed, game };
const props = (current, overrides = {}) => ({ game: board(current), market: 'spread', selection, choose: vi.fn(), changeUnits: vi.fn(), save: vi.fn(), busy: false, ...overrides });
const markup = (current, overrides) => renderToStaticMarkup(<Market {...props(current, overrides)}/>);

// Market draws only what it is given and uses no hooks, so its element tree can be walked to press buttons.
// Host elements and fragments are walked; components (the icons) are leaves.
function buttons(node, found = []) {
  if (Array.isArray(node)) { node.forEach(child => buttons(child, found)); return found; }
  if (!isValidElement(node) || ['function', 'object'].includes(typeof node.type)) return found;
  if (node.type === 'button') found.push(node);
  buttons(node.props.children, found);
  return found;
}
const text = node => Array.isArray(node) ? node.map(text).join('') : isValidElement(node) ? text(node.props.children) : node == null || node === false ? '' : String(node);
const press = (tree, name) => {
  const button = buttons(tree).find(item => item.props['aria-label'] === name || text(item.props.children) === name);
  if (!button) throw new Error(`No ${name} button`);
  button.props.onClick();
};

describe('Virtual Units reviewed quote', () => {
  it('keeps the reviewed quote on the card and shows a newer board quote separately', () => {
    const html = markup(newer);
    expect(html).toMatch(/class="virtual-selected-quote"><strong>Your selected quote:<\/strong> Dallas Cowboys -11.5 \(−110\) · 1.5U · DraftKings · quoted 2099-10-08T15:00:00.000Z PT/);
    expect(html).toContain('Updated quote: Dallas Cowboys -10.5 (−105) · FanDuel · quoted 2099-10-08T16:00:00.000Z PT');
    expect(html).toContain('>Use updated quote</button>');
  });

  it('offers no update while the reviewed quote is still the board quote', () => {
    expect(markup({ ...reviewed })).not.toContain('Use updated quote');
    expect(markup(newer, { selection: undefined })).not.toContain('Use updated quote');
  });

  it('treats a new line, price, book or observation time as an updated quote', () => {
    for (const change of [{ line: -12 }, { odds: -115 }, { book: 'fanduel', source: 'FanDuel' }, { observedAt: '2099-10-08T15:30:00.000Z' }]) {
      expect(markup({ ...reviewed, ...change })).toContain('Use updated quote');
    }
  });

  it('changes only the units from every unit control and never re-reads the board quote', () => {
    const controls = props(newer), tree = Market(controls);
    press(tree, '2U');
    press(tree, 'Increase units');
    press(tree, 'Decrease units');
    expect(controls.changeUnits.mock.calls).toEqual([['TB-DAL:spread', 2], ['TB-DAL:spread', 2], ['TB-DAL:spread', 1]]);
    expect(controls.choose).not.toHaveBeenCalled();
  });

  it('takes the newer quote only through Use updated quote, keeping the side and units', () => {
    const controls = props(newer);
    press(Market(controls), 'Use updated quote');
    expect(controls.choose).toHaveBeenCalledTimes(1);
    expect(controls.choose).toHaveBeenCalledWith(controls.game, 'spread', 'home', 1.5);
    expect(controls.changeUnits).not.toHaveBeenCalled();
  });
});
