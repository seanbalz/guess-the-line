import { it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarketMovement, MarketPanel } from '../web/src/next/lines/MarketDetails.jsx';
import { markupProblems } from './helpers/ui-markup.mjs';
vi.mock('../web/src/api.js', () => ({ linesApi: vi.fn() }));
const game = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', started: false };
const now = Date.parse('2026-10-26T12:00:00Z');
const render = node => renderToStaticMarkup(<div className="gx">{node}</div>);
it('a closed market cannot render forged line, book, history or kickoff data', () => {
  const html = render(<MarketPanel game={game} market="spread" now={now} cell={{ visible: false, line: { value: 98.5 }, books: [{ book: 'secret', source: 'SecretBook' }], movement: [{ value: 99.5 }], kickoffLine: { value: 97.5 } }}/>);
  expect(html).toContain('Spread lines are locked');
  for (const secret of ['98.5', 'SecretBook', '99.5', '97.5', 'Line movement', 'Book lines']) expect(html).not.toContain(secret);
  expect(markupProblems(html)).toEqual([]);
});
it('missing evidence remains unavailable and real zero is preserved', () => {
  const missing = render(<MarketPanel game={game} market="total" now={now} cell={{ visible: true }}/>);
  expect(missing).toContain('Unavailable'); expect(missing).toContain('—');
  expect(missing).not.toContain('Best recorded'); expect(markupProblems(missing)).toEqual([]);
  const zero = render(<MarketPanel game={game} market="spread" now={now} cell={{ visible: true, line: { value: 0, observedAt: new Date(now).toISOString() } }}/>);
  expect(zero).toContain('DEN Pick&#x27;em');
});
it('a single snapshot is identified as such and does not create an interactive fake history', () => {
  const html = render(<MarketMovement game={game} market="spread" rows={[{ value: -3.5, capturedAt: new Date(now).toISOString() }]}/>);
  expect(html).toContain('One recorded observation'); expect(html).not.toContain('type="range"');
  expect(html).toContain('DEN −3.5'); expect(html).toContain('PT'); expect(markupProblems(html)).toEqual([]);
});
