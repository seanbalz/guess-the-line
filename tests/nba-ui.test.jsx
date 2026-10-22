import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Games } from '../web/src/next/nba/Games.jsx';
import { Bets } from '../web/src/next/nba/Bets.jsx';
import { markupProblems } from './helpers/ui-markup.mjs';
const board = { games: [{ id: 'NBA:synthetic:1', sourceDate: '2026-10-21', startTime: null, away: { abbreviation: 'AAA', name: 'Away' }, home: { abbreviation: 'BBB', name: 'Home' }, status: 'postponed', statusText: 'Postponed', awayScore: null, homeScore: null }], source: 'BALLDONTLIE', observedAt: '2026-10-21T12:00:00Z', stale: true };
it('board labels exceptional/date-only states and preserves stale observation', () => {
  const html = renderToStaticMarkup(<div className="gx"><Games board={board} date="2026-10-21" timeZone="America/Los_Angeles" onDate={() => {}} onTrack={() => {}} refresh={() => {}}/></div>);
  expect(html).toContain('Postponed'); expect(html).toContain('Time unavailable'); expect(html).toContain('Cached'); expect(html).not.toContain('LIVE');
  expect(markupProblems(html)).toEqual([]);
});
it('History shows full-set server summary with exact decimals and separate outcomes', () => {
  const data = { tickets: [], summary: { count: 153, wins: 40, losses: 41, pushes: 32, voids: 40, pending: 0, netUnits: '9999991110.56790869', pendingStakeUnits: '0.00000000', riskUnits: '1.23000000', roi: '1.00000000' } };
  const html = renderToStaticMarkup(<div className="gx"><Bets data={data} route={{ screen: 'history', filters: { status: 'settled' } }} onFilters={() => {}} onEdit={() => {}} refresh={() => {}}/></div>);
  expect(html).toContain('153 tickets'); expect(html).toContain('9999991110.56790869'); expect(html).toContain('32 pushes'); expect(html).toContain('40 voids'); expect(html).toContain('Filtered totals');
  expect(markupProblems(html)).toEqual([]);
});
