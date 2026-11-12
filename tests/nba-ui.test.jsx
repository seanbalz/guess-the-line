import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// The screens import the cloud client only to read; nothing here may reach it.
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(async () => { throw new Error('No request expected in a render test.'); }) }));
const { NbaBetsBody, NbaGamesBoard, NbaHomeBody, NbaPlay, NbaTicket, roundUnits, toReturn } = await import('../web/src/next/nba/NbaScreens.jsx');
const { ticketTerms } = await import('../web/src/next/nba/NbaSheets.jsx');
import { gradeNbaTicket } from '../shared/nba-grade.mjs';
import { decode, markupProblems } from './helpers/ui-markup.mjs';

const text = html => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
const render = element => renderToStaticMarkup(<div className="gx gx-nba">{element}</div>);
const noop = () => {};
const team = (abbreviation, name) => ({ id: abbreviation.length, abbreviation, name });
const PHI = team('PHI', 'Philadelphia 76ers'), MIA = team('MIA', 'Miami Heat'), BOS = team('BOS', 'Boston Celtics'), NYK = team('NYK', 'New York Knicks');
const game = (id, away, home, status, statusText, extra = {}) => ({ id: `NBA:balldontlie:${id}`, sourceDate: '2026-11-10', startTime: '2026-11-11T00:00:00Z', away, home, status, statusText, awayScore: null, homeScore: null, observedAt: '2026-11-11T02:42:00Z', ...extra });
const final = game(1, PHI, MIA, 'final', 'Final', { startTime: '2026-11-10T23:00:00Z', awayScore: 112, homeScore: 108 });
const live = game(2, BOS, NYK, 'in_progress', '2nd Qtr', { awayScore: 54, homeScore: 51 });
const boardState = (games, extra = {}) => ({ data: { games, source: 'BALLDONTLIE', observedAt: '2026-11-11T02:42:00Z', stale: false, unavailable: false, ...extra }, loading: false, error: null, refresh: noop });
const audit = [{ operationId: 'op-1', revision: 1, reason: null, updatedAt: '2026-11-10T23:58:00Z', before: null, after: { outcome: 'pending', odds: 102.0202, stakeUnits: 1, netUnits: null } }];
const ticket = (changes = {}) => ({ id: '00000000-0000-4000-8000-000000000001', season: '2026-27', eventDate: '2026-11-10', kind: 'single', label: '76ers moneyline',
  legs: [{ gameId: 'NBA:balldontlie:1', matchup: 'PHI at MIA', market: 'moneyline', team: 'PHI' }], odds: 102.0202, stakeUnits: 1, outcome: 'pending', netUnits: null,
  priceInput: { format: 'probability', value: 49.5 }, revision: 1, updatedAt: '2026-11-10T23:58:00Z', audit, ...changes });

describe('NBA Research › Games', () => {
  const board = (games, extra, view = {}) => render(<NbaGamesBoard board={boardState(games, extra)} view={view} todayDate="2026-11-10" onView={noop} onTrack={noop}/>);
  it('board labels exceptional/date-only states and preserves a stale observation', () => {
    const html = board([game(9, PHI, MIA, 'postponed', 'Postponed', { startTime: null })], { stale: true });
    expect(text(html)).toContain('Postponed'); expect(html).toContain('Time unavailable'); expect(html).toContain('Cached'); expect(text(html)).not.toContain('LIVE');
    expect(markupProblems(html)).toEqual([]);
  });
  it('a scheduled pill shows a Pacific label, never the provider ISO time; LIVE only in progress; OT finals say so', () => {
    const scheduled = board([game(3, PHI, MIA, 'scheduled', '2026-11-11T03:00:00Z', { startTime: '2026-11-11T03:00:00Z' })]);
    expect(scheduled).not.toContain('2026-11-11T03:00:00Z'); expect(text(scheduled)).toContain('7:00 PM PT');
    expect(text(board([live]))).toContain('LIVE');
    expect(text(board([final]))).toContain('Final');
    expect(text(board([game(4, PHI, MIA, 'final', 'Final/OT', { awayScore: 121, homeScore: 117 })]))).toContain('Final · OT');
  });
  it('contract: every game shows both teams’ official NBA logos (D-85), the source line and the NBA trademark notice', () => {
    const html = board([final, live]);
    for (const code of ['PHI', 'MIA', 'BOS', 'NYK']) expect(html).toContain(`src="/team-logos/nba/${code}.png"`);
    expect(html).not.toMatch(/src="\/team-logos\/[a-z]+\.png"/);
    expect(text(html)).toContain('BALLDONTLIE (unofficial)');
    expect(text(html)).toContain('NBA and team names, logos and marks are trademarks of the NBA and its teams');
    expect(markupProblems(html)).toEqual([]);
  });
  it('the status region stays mounted while games load, after, and on error, without a Loading sentence', () => {
    for (const state of [{ data: null, loading: true, error: null }, boardState([]), { ...boardState([final]), error: { status: 500, message: 'down' } }]) {
      const html = render(<NbaGamesBoard board={{ refresh: noop, ...state }} view={{}} todayDate="2026-11-10" onView={noop} onTrack={noop}/>);
      expect([...html.matchAll(/<div role="status"(?![^>]*data-skeleton)/g)], JSON.stringify(state)).toHaveLength(1);
      expect(html).not.toMatch(/role="status"[^>]*>Loading/);
    }
  });
});

describe('NBA tickets', () => {
  it('contract: 49.5% Novig shows +102 everywhere; the details keep the original input and the stored value', () => {
    const html = render(<NbaTicket ticket={ticket()} todayDate="2026-11-10" onConfirm={noop} onEdit={noop}/>);
    expect(text(html)).toContain('PHI · +102');
    expect(text(html)).toContain('Original price: 49.5% Novig (shown as +102) · stored value unchanged');
    expect(text(html)).not.toContain('102.0202');
    expect(ticketTerms(ticket(), 'win').priceInput).toEqual({ format: 'probability', value: 49.5 });
    expect(ticketTerms(ticket({ priceInput: null, odds: -132.5581 }), 'loss').priceInput).toEqual({ format: 'american', value: -132.5581 });
    expect(markupProblems(html)).toEqual([]);
  });
  it('contract: an open ticket shows its result chip only from a final score; nothing settles it', () => {
    const games = new Map([[final.id, final]]);
    const suggested = render(<NbaTicket ticket={ticket()} suggestion={gradeNbaTicket(ticket(), games)} games={games} todayDate="2026-11-10" onConfirm={noop} onEdit={noop}/>);
    expect(text(suggested)).toContain('Final PHI 112–108 · Suggested: Win');
    expect(text(suggested)).toContain('Confirm result');
    expect(text(suggested)).toContain('Open');
    const manual = render(<NbaTicket ticket={ticket({ legs: [{ gameId: 'NBA:manual:1', matchup: 'Spurs at Rockets', market: 'spread', team: 'Spurs', line: 3.5 }], eventDate: '2026-11-09' })} todayDate="2026-11-10" onConfirm={noop} onEdit={noop}/>);
    expect(text(manual)).toContain('Confirm by hand · game not linked'); expect(text(manual)).toContain('Spurs at Rockets');
    const waiting = new Map([[live.id, live]]);
    const pending = ticket({ legs: [{ gameId: live.id, matchup: 'BOS at NYK', market: 'spread', team: 'BOS', line: -4.5 }] });
    expect(text(render(<NbaTicket ticket={pending} games={waiting} todayDate="2026-11-10" onConfirm={noop} onEdit={noop}/>))).toContain('Waiting for final');
  });
  it('History shows the full-set server summary with exact decimals and separate outcomes', () => {
    const data = { data: { tickets: [], summary: { count: 153, wins: 40, losses: 41, pushes: 32, voids: 40, pending: 0, netUnits: '9999991110.56790869', pendingStakeUnits: '0.00000000', riskUnits: '1.23000000', roi: '1.00000000' }, nextCursor: null }, loading: false, error: null, refresh: noop };
    const html = render(<NbaBetsBody data={data} grades={{ suggestions: new Map(), games: new Map() }} view={{ pane: 'history' }} todayDate="2026-11-10" onView={noop} onTrack={noop} onConfirm={noop} onEdit={noop}/>);
    expect(text(html)).toContain('Filtered totals · 153 tickets'); expect(html).toContain('9999991110.56790869'); expect(text(html)).toContain('32 pushes'); expect(text(html)).toContain('40 voids');
    expect(markupProblems(html)).toEqual([]);
  });
  it('to-return is exact from the ticket terms and tiles round half away from zero', () => {
    expect(toReturn(ticket())).toBe('2.02020200');
    expect(roundUnits('2.02500000')).toBe('2.03');
    expect(roundUnits('-1.10500000')).toBe('-1.11');
    expect(roundUnits('0.00000000')).toBe('0');
  });
});

describe('NBA Home and Play', () => {
  it('contract: Home queues only tickets a final settles or that need a hand result, and says a suggestion never settles', () => {
    const games = new Map([[final.id, final], [live.id, live]]);
    const tickets = [ticket(), ticket({ id: '00000000-0000-4000-8000-000000000002', label: 'Celtics spread', legs: [{ gameId: live.id, matchup: 'BOS at NYK', market: 'spread', team: 'BOS', line: -4.5 }] })];
    const pending = { data: { tickets, summary: { count: 2, pendingStakeUnits: '2.10000000' } }, loading: false, error: null, refresh: noop };
    const month = { data: { tickets: [], summary: { count: 8, netUnits: '1.38000000' } }, loading: false, error: null, refresh: noop };
    const grades = { games, suggestions: new Map(tickets.map(row => [row.id, gradeNbaTicket(row, games)])) };
    const html = render(<NbaHomeBody board={boardState([final, live])} pending={pending} month={month} grades={grades} todayDate="2026-11-10" onTab={noop} onConfirm={noop} onEdit={noop} onTrack={noop}/>);
    expect(text(html)).toContain('Needs your result');
    expect(text(html)).toContain('76ers moneyline · +102 · 1 U');
    expect(text(html)).not.toContain('Celtics spread');
    expect(text(html)).toContain('A suggestion never settles a ticket. You confirm every result.');
    expect(text(html)).toContain('+1.38 U'); expect(text(html)).toContain('8 settled'); expect(text(html)).toContain('2.1 U pending');
    expect(text(html)).toContain('1 final · 1 in progress · 0 to come');
    expect(markupProblems(html)).toEqual([]);
  });
  it('Play holds a card until Guess the Spread ships, pointing to Bets', () => {
    const html = render(<NbaPlay onTab={noop}/>);
    expect(text(html)).toContain('NBA Guess the Spread is coming'); expect(text(html)).toContain('Go to Bets');
    expect(markupProblems(html)).toEqual([]);
  });
});
