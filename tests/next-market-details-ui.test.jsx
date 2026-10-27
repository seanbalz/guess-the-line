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
it('kickoff is an accessible timeline marker and never an extra observation', () => {
  const rows = [0, 10].map((minute, i) => ({ value: 41.5 + i, capturedAt: new Date(now + minute * 60000).toISOString() }));
  const html = render(<MarketMovement game={{ ...game, kickoff: new Date(now + 5 * 60000).toISOString() }} market="total" rows={rows}/>);
  expect(html).toContain('data-kickoff-marker="true"');
  expect(html).toContain('x1="160" x2="160"');
  expect(html).toContain('Dashed marker: Kickoff');
  expect(html).toContain('Kickoff ·');
  expect(html).toContain('max="1"');
  expect(markupProblems(html)).toEqual([]);
  const endpoint = render(<MarketMovement game={{ ...game, kickoff: rows[1].capturedAt }} market="total" rows={rows}/>);
  expect(endpoint).toContain('data-kickoff-marker="true"');
  expect(endpoint).toContain('r="6" class="gx-md-point"');
  expect(endpoint).not.toContain('class="gx-md-cross"');
  for (const kickoff of [null, 'invalid', new Date(now - 60000).toISOString(), new Date(now + 11 * 60000).toISOString()]) {
    expect(render(<MarketMovement game={{ ...game, kickoff }} market="total" rows={rows}/>)).not.toContain('data-kickoff-marker');
  }
  expect(render(<MarketMovement game={{ ...game, kickoff: rows[0].capturedAt }} market="total" rows={[rows[0]]}/>)).not.toContain('data-kickoff-marker');
  expect(render(<MarketPanel game={{ ...game, kickoff: rows[0].capturedAt }} market="total" now={now} cell={{ visible: false, movement: rows }}/>)).not.toContain('data-kickoff-marker');
});
